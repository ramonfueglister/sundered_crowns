# Keeps a gown that was draped anew under the gown it takes the place of (round 110). What was draped over the old
# gown (hoods, veil, wimple: `drape_sim.py`) lies over the old one's folds; a gown draped anew, with another
# neckline, has its folds in other places and came through the veil's ends. Here every point of the new gown that
# stands further off the body than the old gown does at that place is set back onto the old one: the new gown is
# its own drape where that lies closer (round its neckline, which is cut lower and lies on the body), and the old
# drape elsewhere.
# usage: python drape_under.py base.obj new.obj old out.obj      (Blender's Python)
# `old`: the OBJ of `tunic_sim.py`, or a gown's bound file as the repository has it, unpacked (`cloth_cote.txt`):
# its points are set back on the base body.
import sys

import bpy  # noqa: F401  (Blender's module has to be loaded before its `mathutils`)
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

base, new, old, outp = sys.argv[-4:]


def obj(path):
    P, F = [], []
    for l in open(path):
        if l.startswith('v '):
            P.append([float(t) for t in l.split()[1:4]])
        elif l.startswith('f '):
            F.append([int(t.split('/')[0]) - 1 for t in l.split()[1:]])
    return np.array(P), F


def unbound(path):
    """A bound garment's points on the base body and its triangles (`tunic_bind.py` writes them, `mh_cloth` in
    portrait/src/real_look.rs reads them: three corners of the head's list of points, their weights, and the way
    off that place in the triangle's own frame)."""
    vs, faces, g = [], {}, None
    for l in open(base):
        if l.startswith('v '):
            vs.append([float(t) for t in l.split()[1:4]])
        elif l.startswith('g '):
            g = l.split()[1]
        elif l.startswith('f '):
            faces.setdefault(g, []).append([int(t.split('/')[0]) - 1 for t in l.split()[1:]])
    V = np.array(vs)
    # the head's list of points, as `hairlib.Head` numbers them
    keep = lambda f: all(vs[i][1] > 3.4 and abs(vs[i][0]) < 2.85 for i in f)
    parts = [[f for f in faces['body'] if keep(f)], [f for f in faces['helper-tights'] if keep(f)], faces['helper-hair'], faces['helper-l-eye'], faces['helper-r-eye']]
    used = np.array(sorted({i for p in parts for f in p for i in f}))
    rows = [l.split() for l in open(path)]
    nv, nt = int(rows[0][0]), int(rows[0][1])
    R = np.array(rows[1:1 + nv], float)
    # (round 149) a gown's file has had the part below the bust sewn on since round 124 (`bust_bind.py`): those
    # points hang on the longer body's points, beyond this list, and lie far under any neckline. They are set
    # on the list's first three points, and their triangles are left out.
    whole = (R[:, :3] < len(used)).all(axis=1)
    R[~whole, :3] = [0, 1, 2]
    a, b, c = (V[used[R[:, k].astype(int)]] for k in range(3))
    n = np.cross(b - a, c - a)
    n /= np.linalg.norm(n, axis=1)[:, None]
    e1 = (b - a) / np.linalg.norm(b - a, axis=1)[:, None]
    e2 = np.cross(n, e1)
    P = R[:, 3:4] * a + R[:, 4:5] * b + R[:, 5:6] * c + R[:, 6:7] * n + R[:, 7:8] * e1 + R[:, 8:9] * e2
    T = np.array(rows[1 + nv:1 + nv + nt], float)
    tris = [t for t in T[:, :3].astype(int).tolist() if whole[t].all()]
    print('the old gown set back on the base body:', int(whole.sum()), 'of', nv, 'points,', len(tris), 'of', nt, 'triangles')
    return P, tris


P, F = obj(new)
Q, G = obj(old) if old.endswith('.obj') else unbound(old)
vs, tris, g = [], [], None
for l in open(base):
    if l.startswith('v '):
        vs.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('g '):
        g = l.split()[1]
    elif l.startswith('f ') and g == 'body':
        f = [int(t.split('/')[0]) - 1 for t in l.split()[1:]]
        if all(vs[i][1] > 1.2 for i in f):
            tris += [[f[0], f[k], f[k + 1]] for k in range(1, len(f) - 1)]
body = BVHTree.FromPolygons([Vector(v) for v in vs], tris)
was = BVHTree.FromPolygons([Vector(q) for q in Q], G)
back, most = 0, 0.0
for i, p in enumerate(P):
    on, _, _, d = body.find_nearest(Vector(p))
    if d < 1e-6:
        continue
    way = (Vector(p) - on) / d
    hit = was.ray_cast(on + way * 1e-4, way, 1.0)
    if hit[0] is not None and hit[3] < d:
        most = max(most, d - hit[3])
        P[i] = on + way * hit[3]
        back += 1
with open(outp, 'w') as fo:
    for p in P:
        fo.write('v %.5f %.5f %.5f\n' % tuple(p))
    for f in F:
        fo.write('f ' + ' '.join(str(i + 1) for i in f) + '\n')
print('set back onto the old gown:', back, 'of', len(P), 'points, by up to', round(most, 3), 'units')
