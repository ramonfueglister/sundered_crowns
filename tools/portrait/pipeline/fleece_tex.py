# The image of tightly curled hair (`hair_body.py`, the cuts `coil01` ...; round 111): no strands that run anywhere,
# but small coils lying every way, one over the other, the gaps between them dark. Its right edge goes on at its
# left one and its lower at its upper one: it is laid over a head as often as it takes (10 cm to the image).
# usage: python3 -I fleece_tex.py out.png [seed=1]
# switches: COILS (how many), RADIUS (least and greatest radius of a coil, pixels: 5 pixels are a millimetre),
# WIDE (a hair's breadth, pixels), ARC (the least and greatest share of a ring a coil shows), DEEP (how much darker
# the coils lying lowest are), GROUND (how light the gaps are), TONE (how light the topmost coils are)
import os
import sys
import numpy as np
from PIL import Image

out = sys.argv[1]
rng = np.random.default_rng(int(sys.argv[2]) if len(sys.argv) > 2 else 1)
N = 512
COILS = int(os.environ.get('COILS', '14000'))
R0, R1 = [float(t) for t in os.environ.get('RADIUS', '4.5,9').split(',')]
WIDE = float(os.environ.get('WIDE', '3.0'))
A0, A1 = [float(t) for t in os.environ.get('ARC', '0.45,0.95').split(',')]
DEEP = float(os.environ.get('DEEP', '0.45'))
GROUND = float(os.environ.get('GROUND', '0.35'))
TONE = float(os.environ.get('TONE', '0.98'))

img = np.full((N, N), GROUND)
for d in np.sort(rng.random(COILS)):
    r = rng.uniform(R0, R1)
    cx, cy = rng.uniform(0, N, 2)
    # a coil seen at a slant is an ellipse; it shows a part of its ring, the rest lies under its neighbours
    squash, turn = rng.uniform(0.55, 1.0), rng.uniform(0, np.pi)
    a0, span = rng.uniform(0, 2 * np.pi), 2 * np.pi * rng.uniform(A0, A1)
    m = int(np.ceil(r + WIDE + 2))
    ys, xs = np.mgrid[-m:m + 1, -m:m + 1]
    px, py = xs + (np.floor(cx) - cx), ys + (np.floor(cy) - cy)
    u = px * np.cos(turn) + py * np.sin(turn)
    v = (-px * np.sin(turn) + py * np.cos(turn)) / squash
    dist = np.abs(np.hypot(u, v) - r)
    along = (np.arctan2(v, u) - a0) % (2 * np.pi)
    cover = np.clip(1 - dist / (0.5 * WIDE), 0, 1) ** 0.7 * np.clip((span - along) / 0.5, 0, 1) * np.clip(along / 0.3, 0, 1)
    tone = (1 - DEEP * (1 - d)) * TONE * rng.lognormal(0, 0.06)
    lit = tone * (0.8 + 0.2 * cover)
    Y, X = (ys + int(np.floor(cy))) % N, (xs + int(np.floor(cx))) % N
    img[Y, X] = img[Y, X] * (1 - cover) + lit * cover
rgb = np.round(np.clip(img, 0, 1) * 255).astype(np.uint8)
Image.fromarray(np.dstack([rgb, rgb, rgb, np.full_like(rgb, 255)]), 'RGBA').save(out)
print('fleece image', out, 'mean tone', round(float(img.mean()), 3), 'darkest tenth', round(float(np.quantile(img, 0.1)), 3))
