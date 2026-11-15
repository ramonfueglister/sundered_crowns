"""Shared helpers for the landmark scripts: the game's palette, flat-coloured solids built with bmesh, export to glTF
and a preview render from the look probe's camera.

Runs inside Blender (``blender -b --python``) or with the ``bpy`` module (``pip install bpy``). Units are the game's
blocks: a script converts its measured metres with the factor its measure file states. Z is up here; the glTF export
turns the model to Y up, which is what the world's Three.js stage expects.
"""
from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass

import bpy  # noqa: F401  (bpy must be imported first: it brings bmesh and mathutils with it)
import bmesh
from mathutils import Vector

# The colours of src/buildings/palette.ts, as sRGB hex. Keep the two lists the same: a model must share the palette
# of the houses it stands among.
PALETTE = {
    'STONE': 0xD8CCC0, 'STONE_PALE': 0xE6DCCC, 'BRICK': 0xD0603C, 'MARBLE': 0xFDF4EA, 'PINK': 0xF6DCCC,
    'LEAD': 0xD0CED4, 'COPPER': 0x6FB078, 'GOLD': 0xF4C440, 'SLATE': 0x7C8494,
    'WINDOW': 0x3C3E48, 'OPENING': 0x3D4650, 'DOOR': 0x5A3A26, 'GLASS': 0x46506A,
}


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(hex_or_name, mul: float = 1.0) -> tuple[float, float, float, float]:
    """Linear RGBA from a palette name or an sRGB hex, as Three.js's Color.setHex gives it (the game's batch.ts does
    the same conversion, so a GLB colour equals the colour the hand-built models use)."""
    h = PALETTE[hex_or_name] if isinstance(hex_or_name, str) else hex_or_name
    r, g, b = ((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255
    return (srgb_to_linear(r) * mul, srgb_to_linear(g) * mul, srgb_to_linear(b) * mul, 1.0)


def shade(c, m: float):
    return (c[0] * m, c[1] * m, c[2] * m, 1.0)


SIDE_NORMAL = {'+x': (1, 0, 0), '-x': (-1, 0, 0), '+y': (0, 1, 0), '-y': (0, -1, 0)}


@dataclass
class Model:
    """One model under construction: a bmesh with a colour per face, or one per corner where a face is shaded."""
    name: str
    bm: bmesh.types.BMesh
    colours: list

    @classmethod
    def new(cls, name: str) -> 'Model':
        return cls(name, bmesh.new(), [])

    def _add_faces(self, verts, faces, colour, outward=None):
        """Adds faces over new vertices. ``colour`` is one RGBA for the whole face, or one per corner in the order of
        the face's vertices. ``outward`` says which way a face must look: ('along', vector) or ('from', point the
        faces turn away from); a face wound the other way is flipped (its corner colours follow). Isolated faces
        (panes) need this, because Blender's normal recalculation only orients faces that share edges."""
        vs = [self.bm.verts.new(Vector(v)) for v in verts]
        for f in faces:
            face = self.bm.faces.new([vs[i] for i in f])
            per_corner = colour if isinstance(colour[0], (tuple, list)) else None
            face.smooth = False
            if outward is not None:
                face.normal_update()
                want = Vector(outward[1]) if outward[0] == 'along' else face.calc_center_median() - Vector(outward[1])
                if face.normal.dot(want) < 0:
                    face.normal_flip()
                    if per_corner:
                        per_corner = list(reversed(per_corner))
            self.colours.append(per_corner or colour)

    def box(self, x0, y0, z0, x1, y1, z1, colour, top=None, bottom=False, foot=1.0):
        """An axis-aligned box; the lower face is left out unless asked for (the ground hides it). ``foot`` darkens the
        lower corners of the sides, the cheap contact shading the game's batch.ts gives its boxes."""
        v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        sides = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        centre = ('from', ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
        lo = shade(colour, foot)
        self._add_faces(v, sides, [lo, lo, colour, colour] if foot != 1.0 else colour, centre)
        self._add_faces(v, [(4, 5, 6, 7)], top or colour, centre)
        if bottom:
            self._add_faces(v, [(3, 2, 1, 0)], lo, centre)

    def pyramid(self, cx, cy, z0, half, height, colour, top_half=0.0):
        """A square pyramid (or a truncated one when ``top_half`` > 0) standing on z0."""
        z1 = z0 + height
        base = [(cx - half, cy - half, z0), (cx + half, cy - half, z0), (cx + half, cy + half, z0), (cx - half, cy + half, z0)]
        if top_half <= 0:
            vs = base + [(cx, cy, z1)]
            self._add_faces(vs, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], colour, ('from', (cx, cy, z0)))
        else:
            t = top_half
            vs = base + [(cx - t, cy - t, z1), (cx + t, cy - t, z1), (cx + t, cy + t, z1), (cx - t, cy + t, z1)]
            self._add_faces(vs, [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)], colour, ('from', (cx, cy, z0)))

    @staticmethod
    def _on(side, x0, y0, x1, y1, u, z, t=0.0):
        """A point on one side ('+x', '-x', '+y', '-y') of the box x0..x1 × y0..y1: ``u`` along the side as seen from
        outside, left to right, ``z`` up it, ``t`` outwards from the wall (negative: into it)."""
        if side == '+y': return (x0 + u, y1 + t, z)
        if side == '-y': return (x1 - u, y0 - t, z)
        if side == '+x': return (x1 + t, y1 - u, z)
        return (x0 - t, y0 + u, z)

    def pane(self, side: str, x0, y0, x1, y1, z0, z1, u0, u1, colour, lift=0.04):
        """A flat rectangle lying on one side of the box x0..x1 × y0..y1, from u0 to u1 along that side and z0 to z1
        up it, a little off the wall so that it does not flicker into it."""
        on = lambda u, z: self._on(side, x0, y0, x1, y1, u, z, lift)
        self._add_faces([on(u0, z0), on(u1, z0), on(u1, z1), on(u0, z1)], [(0, 1, 2, 3)], colour, ('along', SIDE_NORMAL[side]))

    def arch(self, side, x0, y0, x1, y1, uc, z0, half, spring, colour, lift=0.04, segs=6):
        """A round-headed opening drawn flat on a wall: a pane up to ``spring``, a half disc above it."""
        self.pane(side, x0, y0, x1, y1, z0, spring, uc - half, uc + half, colour, lift)
        pts = [(uc + math.cos(math.pi * k / segs) * half, spring + math.sin(math.pi * k / segs) * half) for k in range(segs + 1)]
        on = lambda u, z: self._on(side, x0, y0, x1, y1, u, z, lift)
        for (ua, za), (ub, zb) in zip(pts, pts[1:]):
            self._add_faces([on(uc, spring), on(ua, za), on(ub, zb)], [(0, 1, 2)], colour, ('along', SIDE_NORMAL[side]))

    def arcade(self, side, x0, y0, x1, y1, z0, z1, n, pier, thickness, top_gap, colour, segs=8, sill=0.0):
        """A wall of thickness ``thickness`` on one side of the box, from z0 to z1, pierced by ``n`` round-headed
        openings between piers ``pier`` wide; the arch tops stay ``top_gap`` below z1 and the openings start ``sill``
        above z0. The openings are real: piers, the wall above the arches and the arch soffits are geometry, so that
        the inside shows through and the reveals catch light and shadow. Build something dark inside the box so the
        view through them ends."""
        length = (x1 - x0) if side in ('+y', '-y') else (y1 - y0)
        ow = (length - (n + 1) * pier) / n
        radius = ow / 2
        spring = z1 - top_gap - radius
        on = lambda u, z, t=0.0: self._on(side, x0, y0, x1, y1, u, z, t)
        normal = Vector(SIDE_NORMAL[side])
        if sill > 0:
            a, c = on(0, z0, 0), on(length, z0, -thickness)
            self.box(min(a[0], c[0]), min(a[1], c[1]), z0, max(a[0], c[0]), max(a[1], c[1]), z0 + sill, colour)
            z0 = z0 + sill
        for k in range(n + 1):
            u = k * (ow + pier)
            a, b, c, d = on(u, z0, 0), on(u + pier, z0, 0), on(u + pier, z0, -thickness), on(u, z0, -thickness)
            xs, ys = [p[0] for p in (a, b, c, d)], [p[1] for p in (a, b, c, d)]
            self.box(min(xs), min(ys), z0, max(xs), max(ys), z1, colour)
        for k in range(n):
            u0 = pier + k * (ow + pier)
            uc, u1 = u0 + radius, u0 + ow
            pts = [(uc + math.cos(math.pi * i / segs) * radius, spring + math.sin(math.pi * i / segs) * radius) for i in range(segs + 1)]
            mid = segs // 2
            tris = [[(u1, z1), pts[i], pts[i + 1]] for i in range(mid)] + [[(u0, z1), pts[i], pts[i + 1]] for i in range(mid, segs)] + [[pts[mid], (u0, z1), (u1, z1)]]
            for tri in tris:
                self._add_faces([on(u, z, 0) for u, z in tri], [(0, 1, 2)], colour, ('along', normal))
            for (ua, za), (ub, zb) in zip(pts, pts[1:]):
                quad = [on(ua, za, 0), on(ub, zb, 0), on(ub, zb, -thickness), on(ua, za, -thickness)]
                centre = Vector(on(uc, spring, -thickness / 2))
                mid_pt = sum((Vector(p) for p in quad), Vector()) / 4
                self._add_faces(quad, [(0, 1, 2, 3)], colour, ('along', centre - mid_pt))

    def to_object(self) -> bpy.types.Object:
        """Turns the bmesh into a mesh object with a colour attribute per corner and flat shading. Every face was
        oriented when it was added, so no normal recalculation here: it would turn isolated panes at random."""
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        col = mesh.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='CORNER')
        for poly, c in zip(mesh.polygons, self.colours):
            per_corner = c if isinstance(c[0], (tuple, list)) else [c] * len(poly.loop_indices)
            for li, cc in zip(poly.loop_indices, per_corner):
                col.data[li].color = cc
        mesh.color_attributes.active_color = col
        mesh.shade_flat()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj

    def triangles(self) -> int:
        return sum(len(f.verts) - 2 for f in self.bm.faces)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def export_glb(obj: bpy.types.Object, path: str):
    """Writes the object as a binary glTF with positions, flat normals and COLOR_0, Y up, no materials."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_normals=True, export_materials='NONE', export_vertex_color='ACTIVE',
                              export_active_vertex_color_when_no_material=True, export_all_vertex_colors=False)


def render_preview(path: str, height_blocks: float, width_px=900, height_px=1200, elevation_deg=18.7, azimuth_deg=46.7, samples=48):
    """A preview from the look probe's camera (orthographic, 18.7° above the ground, the ground turned 46.7°), lit
    like the probe: a sun from the right and behind with crisp shadows, a bluish sky as fill. Cycles on the CPU, so
    it also runs where there is no display (the Workbench engine needs one)."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.resolution_x, scene.render.resolution_y = width_px, height_px
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    # one material for everything: the face colour attribute, matte
    mat = bpy.data.materials.new('faces')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    attr = nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    bsdf = nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 1.0
    mat.node_tree.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    # a ground slab so that the tower casts a shadow onto something
    ground = Model.new('ground')
    g = height_blocks * 0.6
    ground.box(-g, -g, -0.3, g, g, 0.0, rgb(0xA4A532))
    ground.to_object()
    for obj in scene.collection.objects:
        if obj.type == 'MESH':
            obj.data.materials.append(mat)
    scene.world = bpy.data.worlds.new('sky')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes['Background']
    bg.inputs[0].default_value = rgb(0xCFE3F2)
    bg.inputs[1].default_value = 0.9
    sun_data = bpy.data.lights.new('sun', 'SUN')
    sun_data.energy = 3.0
    sun_data.angle = math.radians(1.5)
    sun = bpy.data.objects.new('sun', sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(42), 0, math.radians(48 + 180))
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = height_blocks * 1.25 * max(1.0, width_px / height_px)
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    el, az = math.radians(elevation_deg), math.radians(azimuth_deg)
    d = height_blocks * 4
    cam.location = (math.sin(az) * math.cos(el) * d, -math.cos(az) * math.cos(el) * d, math.sin(el) * d + height_blocks / 2)
    cam.rotation_euler = (math.pi / 2 - el, 0, az)
    scene.camera = cam
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def load_measures(path: str) -> dict:
    """The measure file of a landmark: every value carries its unit and its source or the word 'Annahme'."""
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    for key, m in data['masse'].items():
        if 'quelle' not in m:
            raise ValueError(f'{path}: measure {key} has no source and no assumption note')
    return data


def m2b(data: dict, key: str) -> float:
    """A measure in blocks."""
    return data['masse'][key]['wert'] / data['massstab']['meter_pro_block']
