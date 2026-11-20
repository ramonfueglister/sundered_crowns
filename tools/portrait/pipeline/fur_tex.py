# The image of ermine (round 145): the white winter fur of the stoat, its hairs lying down the garment, with the
# black tips of the tails set on it in staggered rows, and its relief as a normal map. Its right edge goes on at
# its left one and its lower at its upper one. Light grey: the fur's white comes from the vertex colours, the tails'
# black is in the image.
# usage: python3 -I fur_tex.py out.png out_n.png
# switches: TAILS (how many across the image and down it; every second row is set off by half a step), TAIL (a
# tail's length and breadth as shares of the image, and how ragged its edge is), HAIR (how long and how broad a
# tuft of hairs is, pixels), DEPTH (how deep the relief is)
import os
import sys
import numpy as np
from PIL import Image

out, out_n = sys.argv[1:3]
_e = lambda k, d: [float(t) for t in os.environ.get(k, d).split(',')]
NX, NY = (int(t) for t in _e('TAILS', '3,3'))
TL, TB, RAG = _e('TAIL', '0.15,0.04,0.35')
HL, HB = _e('HAIR', '24,2.2')
DEPTH = _e('DEPTH', '0.5')[0]
S = 512
rng = np.random.default_rng(145)


def blur(a, n, axis):
    # a mean over n pixels that wraps round the image, three times: nearly a bell
    for _ in range(3):
        c = np.cumsum(np.concatenate([a, a, a], axis), axis)
        k = int(n)
        a = np.take(c, np.arange(S) + S + k // 2, axis) - np.take(c, np.arange(S) + S + k // 2 - k, axis)
        a = a / k
    return a


# the hairs: tufts that run down the image, a little this way and that
h = rng.normal(0, 1, (S, S))
h = blur(blur(h, max(2, HB), 1), HL, 0)
h = (h - h.mean()) / h.std()
coarse = blur(blur(rng.normal(0, 1, (S, S)), 40, 1), 90, 0)
coarse = (coarse - coarse.mean()) / coarse.std()
col = 0.9 + 0.035 * h + 0.02 * coarse
# the tails: each a tuft of black hairs, broad above and running out in a point below, its edge ragged
yy, xx = np.mgrid[0:S, 0:S] / S
edge = blur(blur(rng.normal(0, 1, (S, S)), 3, 1), 24, 0)
edge = (edge - edge.mean()) / edge.std()
black = np.zeros((S, S))
for j in range(NY):
    for i in range(NX):
        cx = (i + 0.25 + 0.5 * (j % 2) + 0.06 * rng.normal()) / NX
        cy = (j + 0.3 + 0.08 * rng.normal()) / NY
        dx = (xx - cx + 0.5) % 1.0 - 0.5
        t = ((yy - cy + 0.5) % 1.0 - 0.5) / TL + 0.5        # 0 at the tail's upper end, 1 at its point
        lean = 0.012 * rng.normal()
        half = TB / 2 * np.where(t < 0.25, np.sqrt(np.clip(t / 0.25, 0, 1)), np.clip((1 - t) / 0.75, 0, 1) ** 0.8)
        d = (half * (1 + RAG * edge) - np.abs(dx - lean * (t - 0.5))) * S
        black = np.maximum(black, np.where((t > 0) & (t < 1), np.clip(d / 1.5 + 0.5, 0, 1), 0))
col = col * (1 - black) + (0.06 + 0.02 * h) * black
col = np.clip(col, 0, 1)
Image.fromarray((np.dstack([col] * 3 + [np.ones_like(col)]) * 255).astype(np.uint8), 'RGBA').save(out)
hh = h + 0.6 * coarse + 1.2 * blur(blur(black, 5, 1), 5, 0)
gx = (np.roll(hh, -1, 1) - np.roll(hh, 1, 1)) * DEPTH * 0.35
gy = (np.roll(hh, -1, 0) - np.roll(hh, 1, 0)) * DEPTH * 0.35
n = np.dstack([-gx, gy, np.ones_like(hh)])
n /= np.linalg.norm(n, axis=2, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8), 'RGB').save(out_n)
print('ermine', NX * NY, 'tails; colour mean', col.mean().round(3), 'black share', black.mean().round(3), 'normal tilt mean', np.degrees(np.arccos(n[..., 2])).mean().round(1), 'deg')
