# The lash line: per vertex of the head how much of it lies on the lid's edge where the lashes grow (1 on the
# upper lid, LOWER on the lower), for the skin to be drawn darker there (portrait/src/real_look.rs `real_skin`,
# a dress's `lash_line`). Read from MakeHuman's lashes: the head vertices their roots are bound to are the inner
# rim of the lids, which lies against the eyeball and is hidden; from there the line goes outwards over the skin
# as far as LINE says, by the distance off the eyeball. Written in head.bin's vertex order, one value per line.
# usage: python3 -I skin_lash.py base.obj Eyelashes01.txt out.txt
# LOWER=0.5 the lower lid's share, ROOT=0.012 how far off the eyeball a lash's root may lie (base units, 0.1 =
# 1 cm), LINE=0.025,0.05 the line in full up to this distance off the eyeball and gone at this one, RINGS=5 how
# many rings of vertices out from the roots are looked at
import sys, os
import numpy as np
base, mesh, outp = sys.argv[1:4]
LOWER, ROOT = float(os.environ.get('LOWER', '0.5')), float(os.environ.get('ROOT', '0.012'))
FULL, WIDTH = [float(t) for t in os.environ.get('LINE', '0.025,0.05').split(',')]
RINGS = int(os.environ.get('RINGS', '5'))
vs, faces, g = [], {}, None
for l in open(base):
    if l.startswith('v '):
        vs.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('g '):
        g = l.split()[1]
    elif l.startswith('f '):
        faces.setdefault(g, []).append([int(t.split('/')[0]) - 1 for t in l.split()[1:]])
V = np.array(vs)
keep = lambda f: all(vs[i][1] > 3.4 and abs(vs[i][0]) < 2.85 for i in f)
parts = [[f for f in faces['body'] if keep(f)], [f for f in faces['helper-tights'] if keep(f)], faces['helper-hair'], faces['helper-l-eye'], faces['helper-r-eye']]
used = sorted({i for p_ in parts for f in p_ for i in f}); H = V[used]
eyes = [V[sorted({i for f in faces[k] for i in f})] for k in ('helper-l-eye', 'helper-r-eye')]
eyes = [(e.mean(0), np.linalg.norm(e - e.mean(0), axis=1).mean()) for e in eyes]
rows = open(mesh).read().split('\n')
nv = int(rows[0].split()[0])
# the head vertices the lashes' roots are bound to: the inner rim of the lids, where they lie on the eyeball
rim = set()
for r in rows[1:1 + nv]:
    t = r.split(); i = int(t[0]); p = H[i] + np.array([float(x) for x in t[6:9]])
    c, rad = min(eyes, key=lambda e: np.linalg.norm(e[0] - p))
    if np.linalg.norm(p - c) - rad < ROOT:
        rim.add(i)
# from there outwards over the skin: the rim itself is hidden against the ball, what shows of a lash line is the
# lid's edge in front of it
rm = {o: n for n, o in enumerate(used)}
nb = {}
for f in parts[0]:
    for k in range(len(f)):
        a, b = rm[f[k]], rm[f[(k + 1) % len(f)]]
        nb.setdefault(a, set()).add(b); nb.setdefault(b, set()).add(a)
w = np.zeros(len(used)); near = set(rim)
for _ in range(RINGS):
    near |= {j for i in near for j in nb.get(i, ())}
for i in near:
    c, rad = min(eyes, key=lambda e: np.linalg.norm(e[0] - H[i]))
    off = np.linalg.norm(H[i] - c) - rad
    # the upper lid's edge lies above the middle of the eye's opening, which stands a little above the ball's centre
    w[i] = (1.0 if H[i][1] - c[1] > 0.004 else LOWER) * float(np.clip((WIDTH - off) / (WIDTH - FULL), 0, 1)) * (off > -0.004)
print('vertices of the lash line:', int((w > 0).sum()), 'of them in full:', int((w == 1).sum()), '; roots on', len(rim))
np.savetxt(outp, w, fmt='%.2f')
