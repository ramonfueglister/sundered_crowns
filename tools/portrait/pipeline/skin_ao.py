# Ambient occlusion per vertex of the head (eye sockets, nostrils, mouth
# corners, ear folds, under the jaw), for the textured skin: rays over the
# hemisphere above each body vertex, hits on the body within a few
# centimetres darken it. Written in head.bin's vertex order (Head.used), one
# value per line (1 = open, lower = shaded); helper vertices get 1.
# usage: venv/bin/python skin_ao.py base.obj out.txt
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import bpy  # brings mathutils
from mathutils.bvhtree import BVHTree
from mathutils import Vector

base, outp = sys.argv[-2], sys.argv[-1]
vs, faces, g = [], {}, None
for l in open(base):
    if l.startswith('v '):
        vs.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('g '):
        g = l.split()[1]
    elif l.startswith('f '):
        faces.setdefault(g, []).append([int(t.split('/')[0]) - 1 for t in l.split()[1:]])
V = np.array(vs)
# head.bin's vertices as hairlib.Head picks them
keep = lambda f: all(vs[i][1] > 3.4 and abs(vs[i][0]) < 2.85 for i in f)
parts = [[f for f in faces['body'] if keep(f)], [f for f in faces['helper-tights'] if keep(f)],
         faces['helper-hair'], faces['helper-l-eye'], faces['helper-r-eye']]
used = sorted({i for p_ in parts for f in p_ for i in f})
remap = {o: n for n, o in enumerate(used)}
# occluders: the body and the eyes (lids shade the eyeballs' edge and vice versa)
occ = [f for f in faces['body'] if all(V[i][1] > 3.0 for i in f)] + faces['helper-l-eye'] + faces['helper-r-eye']
tri = []
for f in occ:
    for k in range(1, len(f) - 1):
        tri.append((f[0], f[k], f[k + 1]))
bvh = BVHTree.FromPolygons([Vector(v) for v in V], tri, all_triangles=True)
# vertex normals of the body
nrm = np.zeros_like(V)
for a, b, c in tri:
    n = np.cross(V[b] - V[a], V[c] - V[a])
    nrm[[a, b, c]] += n
nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12
rng = np.random.default_rng(3)
NR = int(os.environ.get('RAYS', '96'))
DIST = float(os.environ.get('DIST', '0.35'))   # base units: 3.5 cm
# cosine-weighted directions on the unit hemisphere around +z
u1, u2 = rng.random(NR), rng.random(NR)
r = np.sqrt(u1); ph = 2 * np.pi * u2
hemi = np.stack([r * np.cos(ph), r * np.sin(ph), np.sqrt(1 - u1)], -1)
bodyv = sorted({i for f in faces['body'] for i in f})
ao = {}
for i in bodyv:
    if V[i][1] < 5.3 or i not in remap:
        continue
    n = nrm[i]
    t = np.cross(n, [0, 1, 0] if abs(n[1]) < 0.9 else [1, 0, 0]); t /= np.linalg.norm(t)
    b = np.cross(n, t)
    o = Vector(V[i] + n * 0.004)
    hit = 0.0
    for d in hemi:
        w = t * d[0] + b * d[1] + n * d[2]
        h = bvh.ray_cast(o, Vector(w), DIST)
        if h[0] is not None:
            hit += 1.0 - h[3] / DIST * 0.5   # nearer hits shade more
    ao[i] = 1.0 - hit / NR
# the eyeballs (moved 0.012 forward as in the portrait): shade from the lids,
# occluders the body only; normal = from the eye's centre
body_tri = []
for f in [f for f in faces['body'] if all(V[i][1] > 3.0 for i in f)]:
    for k in range(1, len(f) - 1):
        body_tri.append((f[0], f[k], f[k + 1]))
bvh_b = BVHTree.FromPolygons([Vector(v) for v in V], body_tri, all_triangles=True)
for g_ in ('helper-l-eye', 'helper-r-eye'):
    ev = sorted({i for f in faces[g_] for i in f})
    c = V[ev].mean(0)
    for i in ev:
        n = (V[i] - c) / np.linalg.norm(V[i] - c)
        t = np.cross(n, [0, 1, 0] if abs(n[1]) < 0.9 else [1, 0, 0]); t /= np.linalg.norm(t)
        b = np.cross(n, t)
        o = Vector(V[i] + np.array([0, 0, 0.012]) + n * 0.004)
        hit = 0.0
        for d in hemi:
            w = t * d[0] + b * d[1] + n * d[2]
            h = bvh_b.ray_cast(o, Vector(w), DIST)
            if h[0] is not None:
                hit += 1.0 - h[3] / DIST * 0.5
        ao[i] = 1.0 - hit / NR
vals = np.ones(len(used))
for i, a in ao.items():
    vals[remap[i]] = a
print('head vertices', len(ao), 'ao min', round(min(ao.values()), 3), 'mean', round(float(np.mean(list(ao.values()))), 3))
np.savetxt(outp, vals, fmt='%.3f')
