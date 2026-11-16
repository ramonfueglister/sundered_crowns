# The lips: per vertex of the head how much of it is lip (the red of the lips, 0..1), for the skin to be drawn in
# the lips' colour there (portrait/src/real_look.rs `real_skin`, a dress's `lips`). Read from one of MakeHuman's
# skin images: where its paint is redder than skin (CIELAB a*), inside a box round the mouth. The head's mesh has
# its edges along the lips' outline, so that a value per vertex draws that outline; the builder's own mask (the
# vertices that the targets for full lips move) is a broad band without it.
# Written in head.bin's vertex order, two values per line: how much lip, and how much of that is upper lip (1 above
# the line where the lips meet, 0 below, half way beyond the mouth's corners), for a dress to tell the two apart
# (`Lips::upper`). The line is the two edges where the lips turn inward, SEAM below (the builder's
# crate::morph::LIP_SEAM, one side of it).
# usage: python3 -I skin_lip.py base.obj skin.png out.txt
# RED=14,24 not lip up to this a*, all lip from this one (skin of that image: 8 to 11, its lips: 25 to 40),
# BOX=0.5,6.4,6.76,0.8 the mouth: half its width, from and to which height (the nostrils' red lies above), in front of which depth (base units,
# 0.1 = 1 cm), ISLAND=0.62,0.25,0.75 the face in the image (u from, v from and to; the mouth's inside is painted
# elsewhere), R=2 half the width in pixels of the patch read per vertex
import sys, os
import numpy as np
from PIL import Image
base, skin, outp = sys.argv[1:4]
A0, A1 = [float(t) for t in os.environ.get('RED', '14,24').split(',')]
BX, BY0, BY1, BZ = [float(t) for t in os.environ.get('BOX', '0.5,6.4,6.76,0.8').split(',')]
U0, V0, V1 = [float(t) for t in os.environ.get('ISLAND', '0.62,0.25,0.75').split(',')]
R = int(os.environ.get('R', '2'))
vs, vts, faces, g = [], [], {}, None
for l in open(base):
    if l.startswith('v '):
        vs.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('vt '):
        vts.append([float(t) for t in l.split()[1:3]])
    elif l.startswith('g '):
        g = l.split()[1]
    elif l.startswith('f '):
        faces.setdefault(g, []).append([tuple(int(x) - 1 if x else -1 for x in (t.split('/') + [''])[:2]) for t in l.split()[1:]])
keep = lambda f: all(vs[i][1] > 3.4 and abs(vs[i][0]) < 2.85 for i, _ in f)
parts = [[f for f in faces['body'] if keep(f)], [f for f in faces['helper-tights'] if keep(f)], faces['helper-hair'], faces['helper-l-eye'], faces['helper-r-eye']]
used = sorted({i for p_ in parts for f in p_ for i, _ in f})
rm = {o: n for n, o in enumerate(used)}
uv = {}
for f in parts[0]:
    for i, t in f:
        if t >= 0 and vts[t][0] > U0 and V0 < vts[t][1] < V1:
            uv.setdefault(i, set()).add(tuple(vts[t]))
im = np.asarray(Image.open(skin).convert('RGB')).astype(float) / 255
H, W = im.shape[:2]
def a_star(rgb):
    c = np.where(rgb > 0.04045, ((rgb + 0.055) / 1.055) ** 2.4, rgb / 12.92)
    x = (0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2]) / 0.9505
    y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    f = lambda t: np.cbrt(t) if t > 0.008856 else 7.787 * t + 16 / 116
    return 500 * (f(x) - f(y))
w = np.zeros(len(used))
for i, us in uv.items():
    x, y, z = vs[i]
    if abs(x) < BX and BY0 < y < BY1 and z > BZ:
        a = []
        for u, v in us:
            px, py = int(u * W), int((1 - v) * H)
            a.append(a_star(im[max(0, py - R):py + R + 1, max(0, px - R):px + R + 1].reshape(-1, 3).mean(0)))
        w[rm[i]] = float(np.clip((np.mean(a) - A0) / (A1 - A0), 0, 1))
# upper or lower lip: above or below the middle between the two edges where the lips turn inward
SEAM = ([474, 3335, 3334, 3333, 3332, 5203, 3331, 3285, 3284, 3296, 3293], [493, 3348, 3342, 3336, 3303, 3310, 3298, 3356])
P = np.array(vs)[used]
line = lambda x: 0.5 * (np.interp(x, P[SEAM[0], 0], P[SEAM[0], 1]) + np.interp(x, P[SEAM[1], 0], P[SEAM[1], 1]))
corner = min(P[SEAM[0], 0].max(), P[SEAM[1], 0].max())
up = np.array([0.5 if abs(p[0]) > corner else float(p[1] > line(abs(p[0]))) for p in P]) * (w > 0)
print('vertices of the lips:', int((w > 0).sum()), 'of them all lip:', int((w == 1).sum()), '; of the upper lip:', int((up == 1).sum()))
np.savetxt(outp, np.stack([w, up], 1), fmt='%.2f %.1f')
