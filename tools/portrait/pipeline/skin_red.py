# Where the skin flushes (blood close under thin skin): nose tip and wings,
# cheeks, ears, chin; a value 0..1 per vertex of head.bin (Head.used order).
# Zones after Jimenez et al. (2010), Fig. on haemoglobin maps: nose, cheeks,
# ears and chin carry the most haemoglobin (citation not verified online);
# radii and weights PLACEHOLDER.
# usage: python3 skin_red.py base.obj out.txt
import sys
import numpy as np
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
keep = lambda f: all(vs[i][1] > 3.4 and abs(vs[i][0]) < 2.85 for i in f)
parts = [[f for f in faces['body'] if keep(f)], [f for f in faces['helper-tights'] if keep(f)],
         faces['helper-hair'], faces['helper-l-eye'], faces['helper-r-eye']]
used = sorted({i for p_ in parts for f in p_ for i in f})
bodyv = sorted({i for f in faces['body'] for i in f})
P = V[used]
isbody = np.isin(used, bodyv)
red = np.zeros(len(used))
def blob(c, r, w, front=None):
    d = np.linalg.norm(P - np.array(c), axis=1)
    v = w * np.exp(-(d / r) ** 2)
    if front is not None:
        v *= np.clip((P[:, 2] - front) / 0.25, 0, 1)
    return v
for sg in (1, -1):
    red = np.maximum(red, blob((sg * 0.52, 6.92, 1.25), 0.24, 0.75, front=0.85))   # cheeks
    red = np.maximum(red, blob((sg * 0.17, 6.86, 1.42), 0.11, 0.8))                # nose wings
    # ears: the whole outer ear, a bit more at the rim
    e = np.clip((np.abs(P[:, 0]) - 0.70) / 0.08, 0, 1) * np.clip((0.75 - P[:, 2]) / 0.2, 0, 1) \
        * np.clip((P[:, 1] - 6.75) / 0.15, 0, 1) * np.clip((7.75 - P[:, 1]) / 0.15, 0, 1)
    red = np.maximum(red, 0.8 * e * (P[:, 0] * sg > 0))
red = np.maximum(red, blob((0, 6.91, 1.66), 0.16, 1.0))      # nose tip
red = np.maximum(red, blob((0, 7.05, 1.55), 0.16, 0.45))     # nose bridge, weaker
red = np.maximum(red, blob((0, 6.28, 1.40), 0.17, 0.4))      # chin
red[~isbody] = 0
red[P[:, 1] < 6.0] = 0
print('vertices', len(used), 'red>0.1', int((red > 0.1).sum()), 'max', round(red.max(), 2))
np.savetxt(outp, red, fmt='%.3f')
