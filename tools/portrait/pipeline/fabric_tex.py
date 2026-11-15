# A woven cloth as a tileable texture with its normal map: plain weave (one
# over, one under), every thread a little uneven, wool with a fulled, fuzzy
# face, linen finer and smoother. Grey around 0.85: the garment's dye comes
# from the vertex colours.
# usage: python3 -I fabric_tex.py out.png out_n.png wool|linen [threads per tile]
import sys
import numpy as np
from PIL import Image, ImageFilter
out, out_n, kind = sys.argv[1:4]
N = int(sys.argv[4]) if len(sys.argv) > 4 else (32 if kind == 'wool' else 48)
S = 1024
rng = np.random.default_rng(7 if kind == 'wool' else 9)
v, u = np.meshgrid(np.arange(S) / S, np.arange(S) / S, indexing='ij')
iu, iv = np.floor(u * N).astype(int), np.floor(v * N).astype(int)
# each thread's own thickness and shade
tw, tf = 0.8 + 0.4 * rng.random(N), 0.8 + 0.4 * rng.random(N)
sw, sf = 1 + 0.05 * rng.normal(0, 1, N), 1 + 0.05 * rng.normal(0, 1, N)
a = np.sin(np.pi * (u * N - iu)) ** tw[iu]      # across a warp thread
b = np.sin(np.pi * (v * N - iv)) ** tf[iv]      # across a weft thread
warp_up = (iu + iv) % 2 == 0
h = np.where(warp_up, a * (0.55 + 0.45 * b), b * (0.55 + 0.45 * a))
shade = np.where(warp_up, sw[iu], sf[iv])
def noise(scale, sigma):
    k = rng.normal(0, 1, (S // scale, S // scale))
    im = Image.fromarray(np.tile(k, (3, 3)).astype(np.float32), 'F').resize((3 * S, 3 * S), Image.BICUBIC)
    return np.asarray(im)[S:2 * S, S:2 * S] * sigma
if kind == 'wool':
    # fulling raises a nap that half hides the weave
    hb = h.copy()
    for _ in range(6):   # a blur that wraps round the tile
        hb = (hb + np.roll(hb, 1, 0) + np.roll(hb, -1, 0) + np.roll(hb, 1, 1) + np.roll(hb, -1, 1)) / 5
    h = 0.55 * h + 0.45 * hb
    h = h + noise(2, 0.10) + noise(8, 0.05)
    depth, mott, CON = 1.5, 0.06, 0.035
else:
    h = h + noise(2, 0.04)
    depth, mott, CON = 1.1, 0.035, 0.03
col = 0.85 * (0.80 + CON * (h - h.mean()) / (h.std() + 1e-9) + 0.0) * shade * (1 + noise(64, mott) + noise(16, mott * 0.6))
col = np.clip(col / col.mean() * 0.85, 0, 1)
Image.fromarray((np.dstack([col] * 3 + [np.ones_like(col)]) * 255).astype(np.uint8), 'RGBA').save(out)
gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * S / (2.0 * N) * depth / 8
gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * S / (2.0 * N) * depth / 8
n = np.dstack([-gx, gy, np.ones_like(h)])
n /= np.linalg.norm(n, axis=2, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8), 'RGB').save(out_n)
print(kind, N, 'threads; colour mean', col.mean().round(3), 'sd', col.std().round(3), 'normal tilt mean', np.degrees(np.arccos(n[..., 2])).mean().round(1), 'deg')
