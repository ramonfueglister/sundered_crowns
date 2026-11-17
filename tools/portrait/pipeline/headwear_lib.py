# Shared helpers for the rigid headwear (helms, crowns): built in Blender in the
# coordinate system of MakeHuman's base.obj (y up, face towards +z, 1 unit = 10 cm).
# Run inside Blender (MCP or `blender -b -P`), or with the bpy module from pip.
import bpy, bmesh, math
from mathutils import Vector

BASE_ROT = (math.pi / 2, 0.0, 0.0)  # how Blender's OBJ import turns base.obj (y up -> z up)


def clear(names):
    for n in names:
        o = bpy.data.objects.get(n)
        if o is not None:
            bpy.data.objects.remove(o)


def obj_from_bm(name, bm, mat=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.rotation_euler = BASE_ROT
    if mat is not None:
        me.materials.append(mat)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return o


def material(name, color, metallic=0.0, rough=0.5, bump=0.0, bump_scale=9.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = rough
    if bump > 0 and not any(n.type == 'BUMP' for n in nt.nodes):
        vor = nt.nodes.new('ShaderNodeTexVoronoi')
        vor.inputs['Scale'].default_value = bump_scale
        b = nt.nodes.new('ShaderNodeBump')
        b.inputs['Strength'].default_value = bump
        b.inputs['Distance'].default_value = 0.02
        nt.links.new(vor.outputs['Distance'], b.inputs['Height'])
        nt.links.new(b.outputs['Normal'], p.inputs['Normal'])
    return m


def stud(bm, center, normal, radius=0.022):
    """A rivet head: a flattened half sphere on the surface."""
    r = bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=3, radius=radius)
    q = normal.normalized().to_track_quat('Z', 'Y')
    for v in r['verts']:
        co = v.co.copy()
        co.z *= 0.6
        v.co = q @ co + center


def disc(bm, center, normal, radius):
    r = bmesh.ops.create_circle(bm, cap_ends=True, segments=8, radius=radius)
    q = normal.normalized().to_track_quat('Z', 'Y')
    for v in r['verts']:
        v.co = q @ v.co + center


def export_obj(objs, path, plain=False, uvfile=None):
    """Write the objects' evaluated meshes (modifiers applied) in base.obj's coordinates,
    one OBJ group per object, with uv and normals (plain: v and f only, as tunic_bind.py reads)."""
    dg = bpy.context.evaluated_depsgraph_get()
    uvs = []
    vo = to = no = 1
    with open(path, 'w') as f:
        f.write('# Sundered Crowns rigid headwear, coordinates of MakeHuman base.obj (y up)\n')
        for o in objs:
            ev = o.evaluated_get(dg)
            me = ev.to_mesh()
            me.calc_loop_triangles()
            uv = None if plain else me.uv_layers.active
            f.write(f'g {o.name}\n')
            mat = o.material_slots[0].material.name if o.material_slots else 'none'
            f.write(f'usemtl {mat}\n')
            for v in me.vertices:
                f.write('v %.5f %.5f %.5f\n' % tuple(v.co))
            nv = len(me.vertices)
            lines = []
            nuv = 0
            for t in me.loop_triangles:
                idx = []
                for k, li in enumerate(t.loops):
                    vi = t.vertices[k]
                    if uv:
                        f.write('vt %.5f %.5f\n' % tuple(uv.data[li].uv))
                    n = me.corner_normals[li].vector if hasattr(me, 'corner_normals') else me.loops[li].normal
                    if not plain:
                        f.write('vn %.4f %.4f %.4f\n' % tuple(n))
                    idx.append((vo + vi, to + nuv if uv else None, no + nuv))
                    nuv += 1
                lines.append(idx)
            for idx in lines:
                if plain:
                    f.write('f ' + ' '.join(str(a) for a, b, c in idx) + '\n')
                else:
                    f.write('f ' + ' '.join(f'{a}/{b}/{c}' if b else f'{a}//{c}' for a, b, c in idx) + '\n')
            if uvfile:
                pv = [None] * nv
                lay = me.uv_layers.active
                for li, lp in enumerate(me.loops):
                    if lay is not None and pv[lp.vertex_index] is None:
                        pv[lp.vertex_index] = tuple(lay.data[li].uv)
                uvs += [q or (0.0, 0.0) for q in pv]
            vo += nv
            to += nuv if uv else 0
            no += nuv
            ev.to_mesh_clear()
    if uvfile:
        with open(uvfile, 'w') as f:
            for u, v in uvs:
                f.write('%.5f %.5f\n' % (u, v))


# The five points of the head a rigid piece is placed by (portrait/src/real_look.rs `mh_rigid`): above the left
# and the right ear, the brows' middle, the back of the head, the top. Vertex numbers of base.obj, and the same
# in the builder's head (head.bin, hairlib.Head(...).remap), as out/head_anchors.json has them.
ANCHORS_BASE = (11994, 5395, 237, 962, 881)
ANCHORS_HEAD = (5233, 2486, 237, 962, 881)


def _srgb(c):
    return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


CYL_UV = ('helm_great_bands', 'helm_great_rivets', 'helm_great_holes', 'bascinet_rivets', 'crown', 'crown_stones')


def write_rigid(objs, path):
    """A rigid piece for the builder (real_look.rs `mh_rigid`): 'nv nt', the five anchors, then a row per corner
    (place, normal, uv, sRGB colour of its face's material) and a row per triangle. Each triangle's corners are
    points of their own, so a face keeps its material's colour."""
    dg = bpy.context.evaluated_depsgraph_get()
    pts, tris = [], []
    for o in objs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        uv = me.uv_layers.active
        cols = []
        for slot in o.material_slots:
            m = slot.material
            c = (0.8, 0.8, 0.8)
            if m and m.use_nodes:
                p = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if p is not None:
                    c = tuple(_srgb(x) for x in p.inputs['Base Color'].default_value[:3])
            cols.append(c)
        cols = cols or [(0.8, 0.8, 0.8)]
        for t in me.loop_triangles:
            c = cols[min(t.material_index, len(cols) - 1)]
            idx = []
            for k, li in enumerate(t.loops):
                v = me.vertices[t.vertices[k]].co
                n = me.corner_normals[li].vector if hasattr(me, 'corner_normals') else me.loops[li].normal
                if uv and o.name not in CYL_UV:
                    u = tuple(uv.data[li].uv)
                else:
                    # no uv of its own (bands, rivets, the crown): round the head's axis, so the image's normal
                    # map has a direction everywhere (a constant uv gives the renderer no tangent: black)
                    u = (math.atan2(v.x, v.z - 0.55) / (2 * math.pi) * 8.0, v.y * 0.8)
                idx.append(len(pts))
                pts.append((*v, *n, *u, *c))
            tris.append(idx)
        ev.to_mesh_clear()
    with open(path, 'w') as f:
        f.write(f'{len(pts)} {len(tris)}\n')
        f.write(' '.join(str(i) for i in ANCHORS_HEAD) + '\n')
        for p in pts:
            f.write('%.5f %.5f %.5f %.4f %.4f %.4f %.4f %.4f %.3f %.3f %.3f\n' % p)
        for t in tris:
            f.write('%d %d %d\n' % tuple(t))
    return len(pts), len(tris)
