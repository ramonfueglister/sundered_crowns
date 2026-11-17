# Open crown of the 14th century: a gold band set with stones, carrying fleurons (lily-shaped
# leaves) with small points between them. Rigid, sits over open hair: written unbound in
# base.obj's coordinates, scaled per person from the head's anchors (out/head_anchors.json).
# Shape by eye (PLACEHOLDER until held against surviving crowns or depictions).
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import headwear_lib as L

P = dict(
    BAND_Y=(7.92, 8.06),  # lower edge of the band, front and back
    HAIR=0.26,            # over the skin: room for open hair
    BAND_H=0.32,
    TH=0.035,
    FLEURONS=8,
    FL_H=0.55,
    CZ=0.50,
)

FLEUR = [(-0.11, 0.0), (-0.17, 0.07), (-0.23, 0.17), (-0.22, 0.27), (-0.15, 0.30), (-0.10, 0.23), (-0.08, 0.14),
         (-0.07, 0.25), (-0.05, 0.36), (0.0, 0.46), (0.05, 0.36), (0.07, 0.25),
         (0.08, 0.14), (0.10, 0.23), (0.15, 0.30), (0.22, 0.27), (0.23, 0.17), (0.17, 0.07), (0.11, 0.0)]
POINT = [(-0.06, 0.0), (0.0, 0.17), (0.06, 0.0)]


def band_ring(bvh, N=96):
    out = []
    for i in range(N + 1):
        t = 2 * math.pi * i / N
        c = math.cos(t)
        y = P['BAND_Y'][0] + (P['BAND_Y'][1] - P['BAND_Y'][0]) * (1 - c) / 2
        d = Vector((math.sin(t), 0, c)); og = Vector((0, y, P['CZ']))
        h = bvh.ray_cast(og + d * 3, -d, 3)
        r = (h[0] - og).length if h[0] is not None else 0.8
        out.append([t, y, r + P['HAIR']])
    R = np.array([o[2] for o in out])
    for _ in range(12):
        R[1:-1] = 0.5 * R[1:-1] + 0.25 * (R[:-2] + R[2:]); R[0] = R[-1] = 0.5 * (R[0] + R[-1])
    for k, o in enumerate(out):
        o[2] = R[k]
    return out


def build(body='body'):
    L.clear(['crown', 'crown_stones'])
    gold = L.material('metal_gold', (0.95, 0.72, 0.36), 1.0, 0.25)
    b = bpy.data.objects[body]
    bvh = BVHTree.FromPolygons([v.co for v in b.data.vertices], [p.vertices for p in b.data.polygons])
    ring = band_ring(bvh)
    N = len(ring) - 1
    tt = np.array([o[0] for o in ring]); yy = np.array([o[1] for o in ring]); rr = np.array([o[2] for o in ring])

    def at(t, h, off=0.0):
        t = t % (2 * math.pi)
        y = np.interp(t, tt, yy); r = np.interp(t, tt, rr) + off
        return Vector((r * math.sin(t), y + h, P['CZ'] + r * math.cos(t)))

    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('uv')
    # the band: a ring of quads, its upper and lower edge rolled outward a little
    prof = [(0.0, 0.015), (0.03, 0.0), (P['BAND_H'] - 0.03, 0.0), (P['BAND_H'], 0.015)]
    G = [[bm.verts.new(at(2 * math.pi * i / N, h, o)) for i in range(N)] for h, o in prof]
    for j in range(len(prof) - 1):
        for i in range(N):
            f = bm.faces.new((G[j][i], G[j][(i + 1) % N], G[j + 1][(i + 1) % N], G[j + 1][i]))
            for lp in f.loops:
                lp[uvl].uv = (0.5, 0.5)
    # fleurons and points: flat outlines bent round the band
    rmean = float(rr.mean())

    def leaf(outline, t0, h0):
        """Triangulated flat in its plane and subdivided, then bent onto the band, so the
        bent leaf has no long slivers that shade as facets."""
        lb = bmesh.new()
        vs = [lb.verts.new((s_, h, 0.0)) for s_, h in outline]
        lb.faces.new(vs)
        bmesh.ops.triangulate(lb, faces=lb.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
        bmesh.ops.subdivide_edges(lb, edges=lb.edges[:], cuts=2, use_grid_fill=True)
        bmesh.ops.triangulate(lb, faces=lb.faces[:])
        m = {}
        for v in lb.verts:
            m[v] = bm.verts.new(at(t0 + v.co.x / rmean, h0 + v.co.y))
        for f in lb.faces:
            nf_ = bm.faces.new([m[v] for v in f.verts])
            for lp in nf_.loops:
                lp[uvl].uv = (0.5, 0.5)
        lb.free()

    nf = P['FLEURONS']
    for k in range(nf):
        t0 = 2 * math.pi * k / nf
        leaf([(s_ * 1.35, h * P['FL_H'] / 0.46) for s_, h in FLEUR], t0, P['BAND_H'] - 0.01)
        leaf([(s_ * 1.3, h * 1.4) for s_, h in POINT], t0 + math.pi / nf, P['BAND_H'] - 0.01)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # band and leaves face outward, away from the head's axis (recalc may turn an open band inward)
    out_faces = []
    for f in bm.faces:
        c = f.calc_center_median()
        if f.normal.dot(Vector((c.x, 0.0, c.z - P['CZ']))) < 0:
            out_faces.append(f)
    bmesh.ops.reverse_faces(bm, faces=out_faces)
    o = L.obj_from_bm('crown', bm, gold)
    s = o.modifiers.new('solid', 'SOLIDIFY'); s.thickness = P['TH']; s.offset = 1.0
    # stones: alternating red and blue cabochons on the band, pearls between
    bm = bmesh.new()
    red = L.material('gem_red', (0.55, 0.02, 0.04), 0.0, 0.08)
    blue = L.material('gem_blue', (0.03, 0.07, 0.45), 0.0, 0.08)
    pearl = L.material('gem_pearl', (0.88, 0.85, 0.80), 0.0, 0.3)
    mats = []
    for k in range(nf * 2):
        t = 2 * math.pi * k / (nf * 2)
        c = at(t, P['BAND_H'] / 2, P['TH'] - 0.01)
        n = (c - Vector((0, c.y, P['CZ']))).normalized()
        rad = 0.075 if k % 2 == 0 else 0.035
        r = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=rad)
        q = n.to_track_quat('Z', 'Y')
        for v in r['verts']:
            co = v.co.copy(); co.z *= 0.55 if k % 2 == 0 else 1.0
            v.co = q @ co + c
        mats.append((r['verts'], 0 if k % 4 == 0 else (1 if k % 2 == 0 else 2)))
    me = bpy.data.meshes.new('crown_stones'); bm.to_mesh(me)
    for m in (red, blue, pearl):
        me.materials.append(m)
    # material per stone by its vertices
    vmat = {}
    for vs, mi in mats:
        for v in vs:
            vmat[v.index] = mi
    for p in me.polygons:
        p.material_index = vmat.get(p.vertices[0], 0)
        p.use_smooth = True
    bm.free()
    st = bpy.data.objects.new('crown_stones', me); bpy.context.scene.collection.objects.link(st)
    st.rotation_euler = L.BASE_ROT
    return ['crown', 'crown_stones']


if __name__ == '__main__':
    names = build()
    out = os.environ.get('OUT')
    if out:
        L.export_obj([bpy.data.objects[n] for n in names], os.path.join(out, 'crown.obj'))
