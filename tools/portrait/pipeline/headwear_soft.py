# Soft headwear for the portraits, built in Blender on MakeHuman's body (base.obj
# coordinates) and then bound with tunic_bind.py (HEAD=1) like the hoods:
#   coif_linen   linen coif tied under the chin (men, 13th/14th c.)
#   mail_coif    mail coif with its skirt over the shoulders (knights about 1291)
#   hat_felt     felt hat with a round crown and a narrow brim
#   hat_straw    straw hat with a wide brim (field work)
# Shapes by eye (PLACEHOLDER until held against sources). Distances: hair under a coif or hat
# is hair_hooded (flat), and the hull keeps about 5 mm over it (portrait thread, 17.11.2026).
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import headwear_lib as L

HC = Vector((0.0, 7.55, 0.50))  # centre of the head for the rays


def body_bvh(name='body'):
    b = bpy.data.objects[name]
    return BVHTree.FromPolygons([v.co for v in b.data.vertices], [p.vertices for p in b.data.polygons])


def dirn(t, el):
    return Vector((math.cos(el) * math.sin(t), math.sin(el), math.cos(el) * math.cos(t)))


def hull(bvh, t, el, off):
    d = dirn(t, el)
    # the farthest hit over a small cone of rays: thin parts (the ears) get covered by a
    # smooth bump instead of poking through between the vertices
    best = None
    for dt, de in ((0, 0), (0.08, 0), (-0.08, 0), (0, 0.08), (0, -0.08)):
        dd = dirn(t + dt, el + de)
        hit = bvh.ray_cast(HC + dd * 5.0, -dd, 5.0)
        if hit[0] is not None:
            r = (hit[0] - HC).dot(d)
            best = r if best is None else max(best, r)
    p = HC + d * 1.0 if best is None else HC + d * (best + off)
    if p.y < 7.3:
        # low down a ray from outside along the direction meets the shoulders: there take
        # the neck's radius at that height instead (a level ray onto the axis)
        dh = Vector((math.sin(t), 0, math.cos(t)))
        og = Vector((0, p.y, 0.30))
        h2 = bvh.ray_cast(og + dh * 1.6, -dh, 1.6)
        if h2[0] is not None:
            q = h2[0] + dh * off
            w = min(1.0, (7.3 - p.y) / 0.3)
            p = p.lerp(q, w)
    return p


def level(bvh, t, y, off):
    """A level ray onto the neck's axis at height y (for the lower part of a hood)."""
    dh = Vector((math.sin(t), 0, math.cos(t)))
    og = Vector((0, y, 0.30))
    h = bvh.ray_cast(og + dh * 1.6, -dh, 1.6)
    return og + dh * 0.6 if h[0] is None else h[0] + dh * off


def el_at_y(bvh, t, y, off, lo=-1.3, hi=1.5):
    """Elevation whose hull point lies at height y (bisection, the hull's y grows with el)."""
    for _ in range(30):
        m = 0.5 * (lo + hi)
        if hull(bvh, t, m, off).y < y:
            lo = m
        else:
            hi = m
    return 0.5 * (lo + hi)


def interp_deg(table, t):
    td = abs(math.degrees(t))
    td = 360 - td if td > 180 else td
    a = np.array(table, float)
    return float(np.interp(td, a[:, 0], a[:, 1]))


def cap(name, bvh, off, lower, mat, N=64, NE=18, smooth=3, uv_scale=(4.0, 1.5)):
    """A hull over the head from the crown down to the edge lower(t) (a height), as one grid:
    column i at angle t, rows from the edge up to near the top, closed by a fan."""
    cols = []
    YS = 7.3  # below this the rows are level rays onto the neck, above rays from the head's centre
    for i in range(N + 1):
        t = 2 * math.pi * i / N
        y0 = lower(t)
        if y0 < YS:
            NL = 7
            col = [level(bvh, t, y0 + (YS - y0) * j / NL, off) for j in range(NL)]
            e0 = el_at_y(bvh, t, YS, off, lo=-0.6)
            col += [hull(bvh, t, e0 + (1.45 - e0) * j / (NE - NL), off) for j in range(NE - NL + 1)]
        else:
            e0 = el_at_y(bvh, t, y0, off, lo=-0.6)
            col = [hull(bvh, t, e0 + (1.45 - e0) * j / NE, off) for j in range(NE + 1)]
        cols.append(col)
    A = np.array([[tuple(q) for q in c] for c in cols])
    for _ in range(smooth):  # smooth round the head and up, keep the edge row in height
        B = A.copy()
        B[1:-1] = 0.5 * A[1:-1] + 0.25 * (A[:-2] + A[2:])
        B[0] = B[-1] = 0.5 * A[0] + 0.25 * (A[1] + A[-2])
        B[:, 1:-1] = 0.5 * B[:, 1:-1] + 0.25 * (B[:, :-2] + B[:, 2:])
        A = B
        # no closer to the skin than off
        for i in range(A.shape[0]):
            for j in range(A.shape[1]):
                q = Vector(A[i, j])
                loc, nrm, _, _ = bvh.find_nearest(q)
                if loc is not None and (q - loc).dot(nrm) < off * 0.9:
                    A[i, j] = tuple(loc + nrm * off * 0.9)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('uv')
    V = [[bm.verts.new(Vector(q)) for q in c] for c in A]
    top = bm.verts.new(Vector(tuple(A[:, -1].mean(0))) + Vector((0, 0.02, 0)))
    for i in range(N):
        for j in range(NE):
            f = bm.faces.new((V[i][j], V[i + 1][j], V[i + 1][j + 1], V[i][j + 1]))
            for lp, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                lp[uvl].uv = ((N if (a == N // 2 and i == N // 2 - 1) else (a + N // 2) % N) / N * uv_scale[0], b / NE * uv_scale[1])
        f = bm.faces.new((V[i][NE], V[i + 1][NE], top))
        for lp in f.loops:
            lp[uvl].uv = (i / N * uv_scale[0], uv_scale[1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    L.clear([name])
    return L.obj_from_bm(name, bm, mat), A


def coif_linen(bvh):
    linen = L.material('cloth_coif', (0.86, 0.83, 0.76), 0.0, 0.8, bump=0.02, bump_scale=60)
    edge = [(0, 7.98), (40, 7.92), (55, 7.55), (66, 6.42), (100, 6.38), (140, 6.62), (180, 6.70)]
    o, A = cap('coif_linen', bvh, 0.09, lambda t: interp_deg(edge, t), linen)
    s = o.modifiers.new('solid', 'SOLIDIFY'); s.thickness = 0.015; s.offset = 1.0
    # the ties under the chin: two narrow bands from the lower corners to a knot under the jaw
    bm = bmesh.new()
    knot = Vector((0.0, 5.92, 1.05))
    for sg in (-1, 1):
        t = sg * math.radians(72)
        a = level(bvh, t, interp_deg(edge, t), 0.09)
        pts = []
        for k in range(9):
            u = k / 8
            q = a.lerp(knot, u)
            loc, nrm, _, _ = bvh.find_nearest(q)
            if loc is not None and (q - loc).dot(nrm) < 0.05:
                q = loc + nrm * 0.05
            pts.append(q)
        side = Vector((0, 1, 0))
        vs = [(bm.verts.new(q - side * 0.035), bm.verts.new(q + side * 0.035)) for q in pts]
        for k in range(8):
            bm.faces.new((vs[k][0], vs[k + 1][0], vs[k + 1][1], vs[k][1]))
    L.clear(['coif_ties'])
    ties = L.obj_from_bm('coif_ties', bm, linen)
    return ['coif_linen', 'coif_ties']


def mail_coif(bvh):
    import bascinet as BA
    mail = L.material('metal_mail', (0.42, 0.41, 0.40), 1.0, 0.55)
    OFF = 0.14   # padded cap under the mail
    BROW = 7.68
    edge = [(0, BROW), (48, BROW - 0.05), (60, 6.6), (100, 6.55), (180, 6.35)]
    lower = lambda t: interp_deg(edge, t)
    o, A = cap('mail_coif', bvh, OFF, lower, mail, uv_scale=(3.0, 1.1))
    o.data.materials.clear(); o.data.materials.append(bpy.data.materials['metal_mail'])

    def start_of(t, bvh_):
        td = abs(math.degrees(t)); td = 360 - td if td > 180 else td
        if td < 58:
            # under the face: from the chin round to the cheeks, close to the skin
            f = td / 58
            y = 6.30 + (6.62 - 6.30) * f ** 2
            dd = Vector((math.sin(t), 0, math.cos(t))); og = Vector((0, y, 0.2))
            hit = bvh_.ray_cast(og + dd * 4.0, -dd, 4.0)
            r = (hit[0] - og).length + 0.07 if hit[0] is not None else 1.0
            return og + dd * r
        # a little above the hood's edge and outside it, so the two overlap without a gap
        return level(bvh_, t, lower(t) + 0.10, OFF + 0.025)

    BA.build_aventail(start_of=start_of, name='mail_coif_skirt', lengths=(1.85, 1.45, 2.0))
    return ['mail_coif', 'mail_coif_skirt']


def hat(bvh, name, mat, band_y=(7.86, 7.95), off=0.10, crown_h=0.75, crown_k=0.92, brim=0.45, droop=0.08,
        N=64, uv=(4.0, 1.0), e=2.0, turn=0.0, brim_back=None):
    """A hat: band ring round the head at band_y (front, back), a crown above it and a brim out."""
    ring = []
    for i in range(N + 1):
        t = 2 * math.pi * i / N
        c = math.cos(t)
        y = band_y[0] + (band_y[1] - band_y[0]) * (1 - c) / 2
        d = Vector((math.sin(t), 0, c))
        og = Vector((0, y, HC.z))
        hit = bvh.ray_cast(og + d * 4.0, -d, 4.0)
        r = (hit[0] - og).length + off if hit[0] is not None else 1.0
        ring.append((t, y, r))
    # smooth the band's radius (the ears and the hair line make it bumpy)
    R = np.array([r for _, _, r in ring])
    for _ in range(6):
        R[1:-1] = 0.5 * R[1:-1] + 0.25 * (R[:-2] + R[2:]); R[0] = R[-1] = 0.5 * (R[0] + R[-1])
    rows = []
    # brim, from the outer edge in to the band (drooping a little)
    bb = brim if brim_back is None else brim_back
    for k in range(4, 0, -1):
        u = k / 4
        rows.append([(t, y + (turn * max(0.0, -math.cos(t)) ** 2 - droop) * u ** 1.5,
                      R[i] + (brim + (bb - brim) * (1 - math.cos(t)) / 2) * u) for i, (t, y, _) in enumerate(ring)])
    rows.append([(t, y, R[i]) for i, (t, y, _) in enumerate(ring)])
    # crown: up from the band, rounding over
    NC = 8
    for k in range(1, NC):
        u = k / NC
        a = u * math.pi / 2
        # a superellipse: e = 2 round, larger e boxier with a flatter top
        sy, cx = math.sin(a) ** (2 / e), math.cos(a) ** (2 / e)
        rows.append([(t, y + crown_h * sy, R[i] * (crown_k + (1 - crown_k) * (1 - sy)) * cx + 0.001)
                     for i, (t, y, _) in enumerate(ring)])
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('uv')
    V = [[bm.verts.new(Vector((r * math.sin(t), y, HC.z + r * math.cos(t)))) for (t, y, r) in row] for row in rows]
    for j in range(len(rows) - 1):
        for i in range(N):
            f = bm.faces.new((V[j][i], V[j][i + 1], V[j + 1][i + 1], V[j + 1][i]))
            for lp, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                lp[uvl].uv = ((N if (a == N // 2 and i == N // 2 - 1) else (a + N // 2) % N) / N * uv[0], b / len(rows) * uv[1])
    top = bm.verts.new(Vector((0, sum(y for _, y, _ in ring) / len(ring) + crown_h, HC.z)))
    for i in range(N):
        bm.faces.new((V[-1][i], V[-1][i + 1], top))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    L.clear([name])
    o = L.obj_from_bm(name, bm, mat)
    s = o.modifiers.new('solid', 'SOLIDIFY'); s.thickness = 0.03; s.offset = 1.0
    return [name]


def hat_felt(bvh):
    felt = L.material('cloth_felt', (0.30, 0.20, 0.13), 0.0, 0.9, bump=0.03, bump_scale=200)
    return hat(bvh, 'hat_felt', felt, crown_h=1.00, crown_k=0.82, brim=0.30, droop=0.02, e=3.0, turn=0.30, brim_back=0.42)


def hat_straw(bvh):
    straw = L.material('cloth_straw', (0.80, 0.65, 0.38), 0.0, 0.75, bump=0.12, bump_scale=90)
    return hat(bvh, 'hat_straw', straw, crown_h=0.62, crown_k=0.78, brim=1.05, droop=0.22, uv=(16.0, 2.0), e=2.6)


BUILD = dict(coif_linen=coif_linen, mail_coif=mail_coif, hat_felt=hat_felt, hat_straw=hat_straw)

if __name__ == '__main__':
    which = os.environ.get('WHICH', ','.join(BUILD)).split(',')
    bvh = body_bvh()
    out = os.environ.get('OUT')
    for w in which:
        names = BUILD[w](bvh)
        if out:
            for n in names:
                o = bpy.data.objects[n]
                for m in o.modifiers:
                    m.show_viewport = False
                L.export_obj([o], os.path.join(out, n + '.obj'), plain=True, uvfile=os.path.join(out, n + '_uv.txt'))
                for m in o.modifiers:
                    m.show_viewport = True
