# How much of the skin the painted layer of a hairstyle covers along the edge of its net (`hairlib.py` `paint_cap`
# writes both: `<name>_capview.obj`, the net with its places in the image, and `<name>_cap.png`, the image).
# A layer that still covers where its net ends, ends there in the straight edges of the skin's triangles: under a
# head of hair nobody sees it, where a short cut leaves the temple bare it is a dark block with corners (round 89).
# usage: python3 -I cap_edge.py name_capview.obj name_cap.png
# prints the mean covering along the edge and the share of the edge that is covered by more than a half and by more
# than a twentieth, for the whole edge and for its part in front of the ears (the part a portrait shows)
import sys
from collections import Counter
import numpy as np
from PIL import Image

V, VT, F = [], [], []
for line in open(sys.argv[1]):
    p = line.split()
    if not p:
        continue
    if p[0] == 'v':
        V.append([float(x) for x in p[1:4]])
    elif p[0] == 'vt':
        VT.append([float(x) for x in p[1:3]])
    elif p[0] == 'f':
        F.append([int(x.split('/')[0]) - 1 for x in p[1:4]])
V, VT = np.array(V), np.array(VT)
edges = Counter()
for a, b, c in F:
    for x, y in ((a, b), (b, c), (c, a)):
        edges[(min(x, y), max(x, y))] += 1
rim = [e for e, n in edges.items() if n == 1]
cover = np.asarray(Image.open(sys.argv[2]).convert('RGBA'))[..., 3] / 255
H, W = cover.shape
mid = 0.5 * (V[:, 2].min() + V[:, 2].max())
vals, front = [], []
for a, b in rim:
    for f in np.linspace(0, 1, 9):
        u, v = VT[a] * (1 - f) + VT[b] * f
        # the file's v counts up from the image's lower edge
        vals.append(cover[min(H - 1, max(0, int((1 - v) * H))), min(W - 1, max(0, int(u * W)))])
        front.append((V[a, 2] * (1 - f) + V[b, 2] * f) > mid)
vals, front = np.array(vals), np.array(front)
print(len(rim), 'edges of the net lie on its rim')
for name, m in (('the whole edge', np.ones(len(vals), bool)), ('in front of the ears', front)):
    print(f'{name}: covering {vals[m].mean():.3f} in the mean, over a half on {(vals[m] > 0.5).mean():.3f} of it, over a twentieth on {(vals[m] > 0.05).mean():.3f}')
