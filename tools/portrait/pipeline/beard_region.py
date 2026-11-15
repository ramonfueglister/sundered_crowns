# Control image of the beard region on the base head: front and side view of
# the lower face's vertices, lip mask red, nose mask blue, Rust's in_beard brown.
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(sys.argv[0])))
import numpy as np
from PIL import Image, ImageDraw
from hairlib import Head

base, masks, outp = sys.argv[1:4]
H = Head(base, ymin=5.6)
M = np.loadtxt(masks)
lip = np.zeros(len(H.V)); nose = np.zeros(len(H.V))
for o, k in H.remap.items():
    lip[o] = M[k, 3]; nose[o] = M[k, 4]
V = H.V
cov = 0.5
def in_beard(c, l, n):
    x, y, z = c
    if y < 6.08 or (y < 6.3 and z < 0.75) or z < 0.2: return False
    ax = abs(x)
    if l > 0.3 or n > 0.2: return False
    top = (6.79 if ax < 0.3 else 6.8 - (ax - 0.3) * 0.3 if ax < 0.55 else 6.76 + (ax - 0.55) * 1.3) + ((cov - 0.5) * 0.18 if ax > 0.3 else 0)
    if ax > 0.82: return False
    return y < top and (z > 0.5 or y < 6.5)
used = np.unique(H.T)
sel = [o for o in used if 5.7 < V[o, 1] < 7.6 and V[o, 2] > -0.6]
S = 700
img = Image.new('RGB', (2 * S, S), (250, 250, 250))
d = ImageDraw.Draw(img)
def px(a, b, off):  # a horizontal, b = y
    return off + S / 2 + a * S / 2.4, S - (b - 5.6) * S / 2.2
# sort by depth so the front-most draws last
for view, off in ((0, 0), (1, S)):
    order = sorted(sel, key=lambda o: V[o, 2] if view == 0 else V[o, 0])
    for o in order:
        x, y, z = V[o]
        if view == 1 and x < -0.02: continue
        a = x if view == 0 else (z - 0.5)
        col = (200, 200, 200)
        if in_beard(V[o], lip[o], nose[o]): col = (120, 70, 30)
        if lip[o] > 0.3: col = (220, 40, 40)
        if nose[o] > 0.2: col = (40, 80, 220)
        p = px(a, y, off)
        d.ellipse([p[0] - 2, p[1] - 2, p[0] + 2, p[1] + 2], fill=col)
    for yy in np.arange(5.8, 7.6, 0.1):
        p = px(-1.2 if view == 0 else -1.15, yy, off)
        d.text((p[0], p[1] - 5), f'{yy:.1f}', fill=(0, 0, 0))
img.save(outp)
# landmarks
fr = [o for o in sel if abs(V[o, 0]) < 0.03]
for o in sorted(fr, key=lambda o: V[o, 1]):
    if V[o, 2] > 0.6:
        print(f'{V[o,1]:.3f} z={V[o,2]:.3f} lip={lip[o]:.2f} nose={nose[o]:.2f} beard={in_beard(V[o], lip[o], nose[o])}')
