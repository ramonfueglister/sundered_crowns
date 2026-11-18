# How much lighter or darker than the face around it the skin's image is painted at each vertex of the head (round
# 111). MakeHuman's skins are painted from photographs of one kind of face: a shade lies beside the nose's root and
# down its sides, the nose's back is light, as light falls on a nose that stands well in front of the eyes. On a head
# whose nose root is low (MakeHuman's east Asian head, a small child) that painted shade lies on a plane that is in
# the light: a pale stripe with a dark wedge on either side. Round 111's builder took the paint back by these values
# where a head's nose root is low; since round 113 it reads only the images written with FLAT (below), for every
# head, and the file of values is a by-product.
# Per vertex of head.bin (Head.used order) and per image (young, middleage, old; female, male, in that order): the
# image's luminance in linear light, smoothed over SIGMA pixels of 512, over the middle luminance of the skin
# round that middle; 1 outside the middle of the face (further than REACH from the nose's root) and where a vertex has no place
# on the image.
# With FLAT=<folder> it also writes each image with that paint taken out, as skin_<age>_<sex>_flat.webp: lines of
# light run from the nose's root under the eyes, finer than the head's vertices lie, which a vertex's colour cannot
# take back. The builder draws every head of a dress with a table with that image (real_look.rs `real_skin`): on
# every face the painted light stood under the stage's as a pale band from the nose's root under the eyes.
# usage: python3 -I skin_paint.py base.obj <folder of skin_<age>_<sex>.webp> out.txt     (SIGMA=1.5 REACH=0.42 LIDS=0.17 FLAT= FLAT_K=0.9)
import os
import sys

import numpy as np
from PIL import Image


def blur(a, sigma):
    """A Gaussian blur of an image of one channel (edges repeated)."""
    r = int(3 * sigma + 0.5)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    for axis in (0, 1):
        pad = [(r, r) if x == axis else (0, 0) for x in (0, 1)]
        a = np.apply_along_axis(lambda v: np.convolve(v, k, mode='valid'), axis, np.pad(a, pad, mode='edge'))
    return a


SIGMA = float(os.environ.get('SIGMA', '1.5'))
REACH = float(os.environ.get('REACH', '0.42'))   # base units (0.1 = 1 cm) round the nose's root
LIDS = float(os.environ.get('LIDS', '0.17'))
SELLION = 132                                    # the nose's root in the head's list of points (measure.rs)
base, folder, outp = sys.argv[-3:]
vs, vts, faces, g = [], [], {}, None
for l in open(base):
    if l.startswith('v '):
        vs.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('vt '):
        vts.append([float(t) for t in l.split()[1:3]])
    elif l.startswith('g '):
        g = l.split()[1]
    elif l.startswith('f '):
        faces.setdefault(g, []).append([tuple(int(x) - 1 if x else -1 for x in (t.split('/') + ['', ''])[:2]) for t in l.split()[1:]])
V, VT = np.array(vs), np.array(vts)
keep = lambda f: all(vs[i][1] > 3.4 and abs(vs[i][0]) < 2.85 for i, _ in f)
parts = [[f for f in faces['body'] if keep(f)], [f for f in faces['helper-tights'] if keep(f)],
         faces['helper-hair'], faces['helper-l-eye'], faces['helper-r-eye']]
used = sorted({i for p_ in parts for f in p_ for i, _ in f})
at = {v: k for k, v in enumerate(used)}
uvs = [[] for _ in used]
for f in faces['body']:
    for i, t in f:
        if i in at and t >= 0:
            uvs[at[i]].append(t)
P = V[used]
print('the nose root on the base head:', P[SELLION])
d = np.linalg.norm(P - P[SELLION], axis=1)
near = np.clip((REACH - d) / (0.35 * REACH), 0, 1)
near = near * near * (3 - 2 * near)
# not on the lids and their lash lines: what is painted there belongs to the eye, whatever the nose (within LIDS of
# an eyeball's middle, seen from the front; in full from half as far again)
for part in ('helper-l-eye', 'helper-r-eye'):
    c = V[sorted({i for f in faces[part] for i, _ in f})].mean(axis=0)
    e = np.clip((np.hypot(P[:, 0] - c[0], P[:, 1] - c[1]) - LIDS) / (0.5 * LIDS), 0, 1)
    near *= e * e * (3 - 2 * e)
ring = (near > 0.02) & (near < 0.3)


def spread(values):
    """Values per vertex of the head, drawn into the image's plane (512 pixels square): each face of the body as
    its place on the image, the values running evenly between its corners."""
    n = 512
    out = np.zeros((n, n))
    for f in faces['body']:
        if not all(i in at and t >= 0 for i, t in f):
            continue
        for k in range(1, len(f) - 1):
            tri = [f[0], f[k], f[k + 1]]
            q = np.array([[VT[t][0] * n, (1 - VT[t][1]) * n] for _, t in tri])
            w = np.array([values[at[i]] for i, _ in tri])
            if w.max() <= 0:
                continue
            x0, y0 = np.floor(q.min(axis=0)).astype(int)
            x1, y1 = np.ceil(q.max(axis=0)).astype(int)
            xs, ys = np.meshgrid(np.arange(max(x0, 0), min(x1, n - 1) + 1) + 0.5, np.arange(max(y0, 0), min(y1, n - 1) + 1) + 0.5)
            d = (q[1][1] - q[2][1]) * (q[0][0] - q[2][0]) + (q[2][0] - q[1][0]) * (q[0][1] - q[2][1])
            if abs(d) < 1e-9:
                continue
            a = ((q[1][1] - q[2][1]) * (xs - q[2][0]) + (q[2][0] - q[1][0]) * (ys - q[2][1])) / d
            b = ((q[2][1] - q[0][1]) * (xs - q[2][0]) + (q[0][0] - q[2][0]) * (ys - q[2][1])) / d
            c = 1 - a - b
            inside = (a >= -0.02) & (b >= -0.02) & (c >= -0.02)
            v = a * w[0] + b * w[1] + c * w[2]
            iy, ix = ys[inside].astype(int), xs[inside].astype(int)
            out[iy, ix] = np.maximum(out[iy, ix], v[inside])
    return out


flat_to = os.environ.get('FLAT')
mask = spread(near) if flat_to else None
cols = []
for age in ('young', 'middleage', 'old'):
    for sex in ('female', 'male'):
        im = Image.open(os.path.join(folder, f'skin_{age}_{sex}.webp')).convert('RGB')
        a = (np.asarray(im).astype(np.float64) / 255) ** 2.2
        lum = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
        low = blur(lum, SIGMA * im.width / 512)
        h, w = low.shape
        val = np.ones(len(used))
        for k, ts in enumerate(uvs):
            if ts:
                s = [low[min(h - 1, max(0, int((1 - VT[t][1]) * h))), min(w - 1, max(0, int(VT[t][0] * w)))] for t in set(ts)]
                val[k] = float(np.mean(s))
        # (the skin round that middle is what the middle is held against: the men's images are darker over the
        # whole lower face, where the beard grows)
        ref = np.median(val[ring])
        r = 1 + (np.clip(val / ref, 0.6, 1.4) - 1) * near
        cols.append(r)
        if flat_to:
            # the image with its paint round the nose's root taken out: there it is the middle colour of the face's
            # front (FLAT_K of the way), for a head whose nose root is flat (`_flat` beside the image)
            px = np.asarray(im.resize((512, 512), Image.LANCZOS) if im.width != 512 else im).astype(np.float64)
            mid = np.median(px[(mask > 0.02) & (mask < 0.3)], axis=0)
            m = (mask * float(os.environ.get('FLAT_K', '0.9')))[..., None]
            Image.fromarray(np.clip(px * (1 - m) + mid * m + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(flat_to, f'skin_{age}_{sex}_flat.webp'), quality=92, method=6)
        m = near > 0.5
        print(f'{age} {sex}: round it {ref:.3f}; round the nose root {r[m].min():.3f} to {r[m].max():.3f}, sd {r[m].std():.3f}')
np.savetxt(outp, np.array(cols).T, fmt='%.3f')
print('vertices', len(used), 'of them round the nose root', int((near > 0).sum()))
