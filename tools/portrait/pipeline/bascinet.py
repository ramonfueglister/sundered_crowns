# Bascinet with aventail, as worn about 1350: a pointed skull of one plate, down over the
# ears and the nape, open face; the mail aventail hangs from its lower edge over throat and
# shoulders. Two surfaces (portrait thread, 17.11.2026): the bascinet is rigid (unbound,
# base.obj coordinates), the aventail is soft and goes through tunic_bind.py with HEAD=1.
# Shape by eye (PLACEHOLDER until held against surviving pieces or sources).
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import headwear_lib as L

P = dict(
    YEQ=7.55,     # widest ring of the skull
    APEX=9.05,    # point of the skull
    APZ=0.40,     # the point sits a little behind the middle
    CZ=0.55,
    A=1.00,       # half width
    BF=1.12,      # to the front
    BB=1.06,      # to the back
    YSIDE=6.55,   # lower edge over the jaw
    YBACK=6.30,   # lower edge at the nape
    FACE=62,      # half width of the face opening in degrees
    BROW=7.66,    # upper edge of the face opening
    TH=0.03,
    AV_OFF=0.07,
    AV_FLARE=0.22,  # the mail falls outward by this much per unit of drop,  # least distance of the mail from the body
    AV_LEN=(1.95, 1.45, 2.05),  # length of the aventail: front, side, back
    AV_CHIN=6.30,  # upper edge of the aventail under the face
)


def ring_r(t, p=P):
    c, s = math.cos(t), math.sin(t)
    b = p['BF'] if c > 0 else p['BB']
    e = 2.2
    return p['A'] * np.sign(s) * abs(s) ** (2 / e), b * np.sign(c) * abs(c) ** (2 / e)


def skull(t, u, p=P):
    """u in [0, 1]: from the widest ring to the point."""
    x, z = ring_r(t)
    w = u * u
    k = math.sqrt(max(0.0, 1 - u * u)) * (1 - w) + (1 - u) * w
    y = p['YEQ'] + (p['APEX'] - p['YEQ']) * u
    cz = p['CZ'] + (p['APZ'] - p['CZ']) * u
    return Vector((x * k, y, cz + z * k))


def lower_edge(t, p=P):
    c = math.cos(t)
    # from the side (c = 0) to the back (c = -1); the front is the face opening
    return p['YSIDE'] + (p['YBACK'] - p['YSIDE']) * max(0.0, -c) ** 1.5


def wall(t, v, p=P):
    """v in [0, 1]: from the lower edge up to the widest ring, slightly drawn in at the bottom."""
    x, z = ring_r(t)
    y0 = lower_edge(t)
    y = y0 + (p['YEQ'] - y0) * v
    k = 1.0 - 0.06 * (1 - v) ** 2
    return Vector((x * k, y, p['CZ'] + z * k))


def build_bascinet():
    L.clear(['bascinet', 'bascinet_rivets'])
    steel = L.material('metal_steel', (0.56, 0.55, 0.53), 1.0, 0.34, bump=0.06)
    dark = L.material('helm_inside', (0.01, 0.01, 0.01), 0.0, 0.9)
    N, NW, NU = 64, 8, 12
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('uv')
    rows = []
    for j in range(NW + 1):
        rows.append([wall(2 * math.pi * i / N, j / NW) for i in range(N + 1)])
    for j in range(1, NU):
        rows.append([skull(2 * math.pi * i / N, j / NU) for i in range(N + 1)])
    G = [[bm.verts.new(q) for q in r] for r in rows]
    top = bm.verts.new(skull(0, 1.0))
    for r in range(len(G) - 1):
        for i in range(N):
            tm = 2 * math.pi * (i + 0.5) / N
            td = math.degrees(tm); td = td - 360 if td > 180 else td
            ym = 0.5 * (rows[r][i].y + rows[r + 1][i].y)
            if abs(td) < P['FACE'] and ym < P['BROW']:
                continue
            f = bm.faces.new((G[r][i], G[r][i + 1], G[r + 1][i + 1], G[r + 1][i]))
            for lp, (a, b) in zip(f.loops, ((i, r), (i + 1, r), (i + 1, r + 1), (i, r + 1))):
                lp[uvl].uv = (a / N, b / len(G))
    for i in range(N):
        f = bm.faces.new((G[-1][i], G[-1][i + 1], top))
        for lp in f.loops:
            lp[uvl].uv = (i / N, 1.0)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = L.obj_from_bm('bascinet', bm, steel)
    s = o.modifiers.new('solid', 'SOLIDIFY'); s.thickness = P['TH']; s.offset = 1.0; s.material_offset = 1
    o.data.materials.append(dark)
    # the row of staples (vervelles) along the lower edge and the face, which holds the aventail
    bm = bmesh.new()
    for k in range(40):
        t = 2 * math.pi * (k + 0.5) / 40
        td = math.degrees(t); td = td - 360 if td > 180 else td
        if abs(td) < P['FACE']:
            continue
        q = wall(t, 0.06)
        n = (wall(t, 0.06) - Vector((0, q.y, P['CZ']))).normalized()
        L.stud(bm, q + n * (P['TH'] + 0.005), n, 0.026)
    for sg in (-1, 1):
        t = sg * math.radians(P['FACE'])
        for j in range(1, 6):
            v = j / 6 * ((P['BROW'] - lower_edge(t)) / (P['YEQ'] - lower_edge(t)))
            q = wall(t, v)
            n = (q - Vector((0, q.y, P['CZ']))).normalized()
            L.stud(bm, q + n * (P['TH'] + 0.005), n, 0.022)
    L.obj_from_bm('bascinet_rivets', bm, steel)
    return ['bascinet', 'bascinet_rivets']


def build_aventail(body_name='body', start_of=None, name='aventail', lengths=None):
    """Mail from the bascinet's lower edge (and under the chin) falling outward over the body.
    start_of(t, bvh) gives another upper edge (the mail coif uses it)."""
    L.clear([name])
    mail = L.material('metal_mail', (0.42, 0.41, 0.40), 1.0, 0.55, bump=0.25, bump_scale=120)
    body = bpy.data.objects[body_name]
    bvh = BVHTree.FromPolygons([v.co for v in body.data.vertices], [p.vertices for p in body.data.polygons])
    N, NS = 64, 22
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('uv')
    G = []
    for i in range(N + 1):
        t = 2 * math.pi * i / N
        c = math.cos(t)
        td = math.degrees(t); td = td - 360 if td > 180 else td
        if start_of is not None:
            start = start_of(t, bvh)
        elif abs(td) < P['FACE']:
            # under the face: a line from the chin round to the corners of the opening
            corner = wall(math.radians(P['FACE']), 0.0)
            f = abs(td) / P['FACE']
            y = P['AV_CHIN'] + (corner.y - P['AV_CHIN']) * f ** 2
            dd = Vector((math.sin(t), 0, c)); og = Vector((0, y, 0.2))
            hit = bvh.ray_cast(og + dd * 4.0, -dd, 4.0)
            rb = (hit[0] - og).length + P['AV_OFF'] if hit[0] is not None else 1.0
            rc = Vector((corner.x, 0, corner.z - 0.2)).length
            start = og + dd * max(rb, rc * f ** 2 + rb * (1 - f ** 2))
        else:
            start = wall(t, 0.0)
            start = start + (start - Vector((0, start.y, P['CZ']))).normalized() * (P['TH'] + 0.01)
        L_f, L_s, L_b = lengths or P['AV_LEN']
        length = L_s + (L_f - L_s) * max(0, c) ** 2 + (L_b - L_s) * max(0, -c) ** 2
        # walk down; the radius only grows, and keeps AV_OFF from the body
        d = Vector((math.sin(t), 0, c))
        pts = [start]
        r = (Vector((start.x, 0, start.z - 0.2))).length
        y = start.y
        dy = 0.04
        acc = 0.0
        while acc < length and y > 3.6:
            y -= dy
            origin = Vector((0, y, 0.2))
            hit = bvh.ray_cast(origin + d * 4.0, -d, 4.0)
            rb = (hit[0] - origin).length + P['AV_OFF'] if hit[0] is not None else 0.0
            r = max(r + P['AV_FLARE'] * dy, rb)
            q = origin + d * r
            acc += (q - pts[-1]).length
            pts.append(q)
        # resample to NS+1 points of equal arc length
        pa = np.array([tuple(q) for q in pts])
        seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pa, axis=0), axis=1))]
        ss = np.linspace(0, seg[-1], NS + 1)
        G.append([Vector([np.interp(s_, seg, pa[:, k]) for k in range(3)]) for s_ in ss])
    # smooth round the neck so the folds of single columns do not show
    A = np.array([[tuple(q) for q in col] for col in G])
    for _ in range(4):
        A[1:-1] = 0.5 * A[1:-1] + 0.25 * (A[:-2] + A[2:])
        A[0] = A[-1] = 0.5 * A[0] + 0.25 * (A[1] + A[-2])
    # keep the mail outside the body: push out along the body's normal, smooth, again
    for it in range(6):
        for i in range(A.shape[0]):
            for j in range(1, A.shape[1]):
                q = Vector(A[i, j])
                loc, nrm, _, dist = bvh.find_nearest(q)
                if loc is None:
                    continue
                side = (q - loc).dot(nrm)
                if side < P['AV_OFF']:
                    A[i, j] = tuple(loc + nrm * P['AV_OFF'])
        if it < 5:
            B = A.copy()
            B[1:-1, 1:] = 0.5 * A[1:-1, 1:] + 0.25 * (A[:-2, 1:] + A[2:, 1:])
            B[:, 1:-1] = 0.5 * B[:, 1:-1] + 0.25 * (B[:, :-2] + B[:, 2:])
            B[0] = B[-1] = 0.5 * (B[0] + B[-1])
            A = B
    G = [[Vector(q) for q in col] for col in A]
    V = [[bm.verts.new(q) for q in col] for col in G]
    for i in range(N):
        for j in range(NS):
            f = bm.faces.new((V[i][j], V[i + 1][j], V[i + 1][j + 1], V[i][j + 1]))
            for lp, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                lp[uvl].uv = (a / N * 6.0, b / NS * 1.6)  # mail rings repeat in the normal map
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = L.obj_from_bm(name, bm, mail)
    s = o.modifiers.new('solid', 'SOLIDIFY'); s.thickness = 0.02; s.offset = 1.0
    return [name]


if __name__ == '__main__':
    rigid = build_bascinet()
    soft = build_aventail()
    out = os.environ.get('OUT')  # folder
    if out:
        L.export_obj([bpy.data.objects[n] for n in rigid], os.path.join(out, 'bascinet.obj'))
        # the aventail without thickness: tunic_bind.py reads plain v/f
        o = bpy.data.objects['aventail']
        o.modifiers['solid'].show_viewport = False
        L.export_obj([o], os.path.join(out, 'aventail.obj'), plain=True)
        o.modifiers['solid'].show_viewport = True
