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
    """One model under construction: a bmesh with a colour per face."""
    name: str
    bm: bmesh.types.BMesh
    colours: list

    @classmethod
    def new(cls, name: str) -> 'Model':
        return cls(name, bmesh.new(), [])

    def _add_faces(self, verts, faces, colour, outward=None):
        """Adds faces over new vertices. ``outward`` says which way a face must look: ('along', vector) or
        ('from', point the faces turn away from); a face wound the other way is flipped. Isolated faces (panes) need this, because Blender's
        normal recalculation only orients faces that share edges."""
        vs = [self.bm.verts.new(Vector(v)) for v in verts]
        for f in faces:
            face = self.bm.faces.new([vs[i] for i in f])
            self.colours.append(colour)
            face.smooth = False
            if outward is not None:
                face.normal_update()
                want = Vector(outward[1]) if outward[0] == 'along' else face.calc_center_median() - Vector(outward[1])
                if face.normal.dot(want) < 0:
                    face.normal_flip()

    def box(self, x0, y0, z0, x1, y1, z1, colour, top=None, bottom=False):
        """An axis-aligned box; the lower face is left out unless asked for (the ground hides it)."""
        v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        sides = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        centre = ('from', ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
        self._add_faces(v, sides, colour, centre)
        self._add_faces(v, [(4, 5, 6, 7)], top or colour, centre)
        if bottom:
            self._add_faces(v, [(3, 2, 1, 0)], colour, centre)

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

    def pane(self, side: str, x0, y0, x1, y1, z0, z1, u0, u1, colour, lift=0.04):
        """A flat rectangle lying on one side ('+x', '-x', '+y', '-y') of the box x0..x1 × y0..y1, from u0 to u1 along
        that side and z0 to z1 up it, a little off the wall so that it does not flicker into it."""
        if side == '+y':
            v = [(x0 + u0, y1 + lift, z0), (x0 + u1, y1 + lift, z0), (x0 + u1, y1 + lift, z1), (x0 + u0, y1 + lift, z1)]
        elif side == '-y':
            v = [(x1 - u0, y0 - lift, z0), (x1 - u1, y0 - lift, z0), (x1 - u1, y0 - lift, z1), (x1 - u0, y0 - lift, z1)]
        elif side == '+x':
            v = [(x1 + lift, y1 - u0, z0), (x1 + lift, y1 - u1, z0), (x1 + lift, y1 - u1, z1), (x1 + lift, y1 - u0, z1)]
        else:
            v = [(x0 - lift, y0 + u0, z0), (x0 - lift, y0 + u1, z0), (x0 - lift, y0 + u1, z1), (x0 - lift, y0 + u0, z1)]
        self._add_faces(v, [(0, 1, 2, 3)], colour, ('along', SIDE_NORMAL[side]))

    def arch(self, side, x0, y0, x1, y1, uc, z0, half, spring, colour, lift=0.04, segs=6):
        """A round-headed opening drawn flat on a wall: a pane up to ``spring``, a half disc above it."""
        self.pane(side, x0, y0, x1, y1, z0, spring, uc - half, uc + half, colour, lift)
        pts = [(uc + math.cos(math.pi * k / segs) * half, spring + math.sin(math.pi * k / segs) * half) for k in range(segs + 1)]
        for (ua, za), (ub, zb) in zip(pts, pts[1:]):
            self._tri_on(side, x0, y0, x1, y1, [(uc, spring), (ua, za), (ub, zb)], colour, lift)

    def _tri_on(self, side, x0, y0, x1, y1, uz, colour, lift):
        def at(u, z):
            if side == '+y': return (x0 + u, y1 + lift, z)
            if side == '-y': return (x1 - u, y0 - lift, z)
            if side == '+x': return (x1 + lift, y1 - u, z)
            return (x0 - lift, y0 + u, z)
        self._add_faces([at(u, z) for u, z in uz], [(0, 1, 2)], colour, ('along', SIDE_NORMAL[side]))

    def to_object(self) -> bpy.types.Object:
        """Turns the bmesh into a mesh object with a face colour attribute and flat shading. Every face was oriented
        when it was added, so no normal recalculation here: it would turn isolated panes at random."""
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        col = mesh.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='CORNER')
        for poly, c in zip(mesh.polygons, self.colours):
            for li in poly.loop_indices:
                col.data[li].color = c
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
