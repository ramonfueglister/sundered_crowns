# A woven cloth as a tileable texture with its normal map: plain weave (one
# over, one under), every thread a little uneven, wool with a fulled, fuzzy
# face, linen finer and smoother; or felt, which has no weave; or silk (round 150), a fine even weave with no nap
# and hardly a relief; or a fine linen (round 153), bleached and pressed. Grey around 0.85: the garment's dye comes
# from the vertex colours.
# usage: python3 -I fabric_tex.py out.png out_n.png wool|linen|felt|silk|fine [threads per tile]
import os
import sys
import numpy as np
from PIL import Image, ImageFilter
out, out_n, kind = sys.argv[1:4]
N = int(sys.argv[4]) if len(sys.argv) > 4 else {'wool': 32, 'silk': 320, 'fine': 240}.get(kind, 48)
S = 1024
# wool: how much of the weave the nap hides (`NAP`), how deep the weave's relief is (`DEPTH`), how strongly the
# cloth is mottled, lighter and darker over 1 to 5 cm (`MOTT`)
NAP, DEPTH, MOTT = (float(os.environ.get(k, d)) for k, d in (('NAP', '0.45'), ('DEPTH', '1.5'), ('MOTT', '0.06')))
rng = np.random.default_rng({'wool': 7, 'silk': 11, 'fine': 13}.get(kind, 9))
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
    h = (1 - NAP) * h + NAP * hb
    h = h + noise(2, 0.10) + noise(8, 0.05)
    depth, mott, CON = DEPTH, MOTT, 0.035
elif kind == 'felt':
    # (round 134) felt has no threads: matted fibres, fine and a little coarser
    h = noise(2, 0.10) + noise(4, 0.08) + noise(8, 0.05)
    shade = 1.0
    depth, mott, CON = DEPTH, MOTT, 0.035
elif kind == 'silk':
    # threads too fine to show at a picture's size, all alike: the cloth is told by how it shines (the stage)
    # (a fifth of the threads' own shades: with all of it the cloth was a plaid)
    h = h + noise(2, 0.02)
    shade = 1 + 0.2 * (shade - 1)
    depth, mott, CON = DEPTH, MOTT, 0.012
elif kind == 'fine':
    # the linen's weave with five threads for one, too fine to show at a picture's size, and a third of the
    # threads' own shades (with all of it the cloth is a sack's, round 153); its relief and mottling by `DEPTH`
    # and `MOTT`
    h = h + noise(2, 0.04)
    shade = 1 + 0.33 * (shade - 1)
    depth, mott, CON = DEPTH, MOTT, 0.02
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
