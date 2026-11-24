# The image of a bundle of hair (`hair_body.py`): single hairs side by side over the bundle's whole breadth, lighter
# along its ridge and dark at its two flanks, parted here and there into strands by a dark line. It covers
# everywhere (a bundle's end is its own form, a point), and its lower edge goes on at its upper one, so that it is
# laid along a bundle of any length.
# usage: python3 -I bundle_tex.py out.png [seed=1]
# switches: HAIRS (how many), WIDE (a hair's breadth in pixels), SWAY (how far a hair leaves its place, pixels),
# TONE (how light the topmost hairs are), DEEP (how much darker the hairs lying lowest are), FLANK (how light the
# flanks are against the ridge), PARTS (how many dark lines part the bundle into strands), PART (how dark they are)
# (round 185) WAVES (a factor on how many waves a hair makes down the image: for an image laid on longer) and
# ENDS=rows,power,least,most,short,long,clear: the hairs end one after the other towards the image's lower edge, so
# that a strand whose end lies there ends in single wisps and not as a band. The image's breadth is parted into
# wisps `least` to `most` pixels broad; each ends within `rows` of the place `clear` rows over the lower edge
# (a chance to the power `power`: most of them late), narrowing to a point over its last `short` to `long` rows;
# below its end the image covers nothing (the stage draws nothing where it covers less than half). With ENDS the
# image no longer goes on at its upper edge: `hair_body.py` lays it once along a strand, its lower edge at the
# strand's end. All PLACEHOLDER by eye, in the portrait (docs/PORTRAITS.md, round 185).
import os
import sys
import numpy as np
from PIL import Image

out = sys.argv[1]
rng = np.random.default_rng(int(sys.argv[2]) if len(sys.argv) > 2 else 1)
W, H = 512, 1024
HAIRS = int(os.environ.get('HAIRS', '520'))
WIDE = float(os.environ.get('WIDE', '4.0'))
SWAY = float(os.environ.get('SWAY', '7'))
DEEP = float(os.environ.get('DEEP', '0.3'))
TONE = float(os.environ.get('TONE', '0.98'))
FLANK = float(os.environ.get('FLANK', '0.72'))
PARTS = int(os.environ.get('PARTS', '3'))
PART = float(os.environ.get('PART', '0.62'))
WAVES = int(os.environ.get('WAVES', '1'))
ENDS = [float(x) for x in os.environ['ENDS'].split(',')] if os.environ.get('ENDS') else None

rows = np.arange(H)
t = rows / H
img = np.full((H, W), TONE * (1 - 1.5 * DEEP))
depth = np.sort(rng.random(HAIRS))
streak = sum(a * np.cos(2 * np.pi * (k * np.arange(W) / W + rng.random())) for k, a in ((1, 0.05), (3, 0.04), (7, 0.03)))


def way(x0, sway):
    # whole waves down the image: its lower edge goes on at its upper one
    return x0 + sum(rng.normal(0, sway / k) * np.cos(2 * np.pi * (WAVES * k * t + rng.random())) for k in (1, 2, 3, 5))


for d in depth:
    x0 = rng.uniform(0, W)
    x = way(x0, SWAY)
    tone = (1 - DEEP * (1 - d)) * (TONE + streak[int(x0) % W]) * rng.lognormal(0, 0.07)
    half = 0.5 * WIDE * rng.uniform(0.7, 1.3)
    for k in range(-3, 5):
        col = np.floor(x).astype(int) + k
        a = np.clip(1 - np.abs(col - x) / half, 0, 1) ** 0.7
        c = np.clip(col, 0, W - 1)
        lit = tone * (0.75 + 0.25 * a)
        img[rows, c] = img[rows, c] * (1 - a) + lit * a
# the lines that part it into strands: dark, a few pixels broad, each on its own way
xs = np.arange(W)[None, :]
for x0 in (np.arange(PARTS) + rng.uniform(0.3, 0.7, PARTS)) * W / PARTS:
    x = way(x0, 2.5 * SWAY)[:, None]
    wide = 3.5 * (1 + 0.5 * np.cos(2 * np.pi * (2 * t + rng.random())))[:, None]
    img *= 1 - (1 - PART) * np.exp(-0.5 * ((xs - x) / wide) ** 2)
# ridge and flanks
u = (np.arange(W) + 0.5) / W
img *= (FLANK + (1 - FLANK) * np.sin(np.pi * u) ** 0.55)[None, :]
rgb = np.round(np.clip(img, 0, 1) * 255).astype(np.uint8)
cover = np.ones((H, W))
if ENDS:
    reach, power, least, most, short, long_, clear = ENDS
    re_ = np.random.default_rng(185)
    first = int(H - clear - reach - long_) - 1
    cover[first:] = 0
    px = np.arange(W) + 0.5
    a = 0.0
    while a < W:
        b = min(a + re_.uniform(least, most), W)
        end, taper, side = H - clear - reach * re_.random() ** power, re_.uniform(short, long_), re_.uniform(0.2, 0.8)
        for r in range(first, H):
            # how much of its breadth the wisp has left in this row: all of it above its point, none below its end
            k = np.clip((end - r) / taper, 0, 1) ** 0.7
            lo, hi = a + (b - a) * side * (1 - k), b - (b - a) * (1 - side) * (1 - k)
            cover[r] += np.clip(np.minimum(px - lo, hi - px) + 0.5, 0, 1) * (k > 0)
        a = b
    cover = np.clip(cover, 0, 1)
Image.fromarray(np.dstack([rgb, rgb, rgb, np.round(cover * 255).astype(np.uint8)]), 'RGBA').save(out)
print('bundle image', out, 'mean tone', round(float(img.mean()), 3), 'of its middle half', round(float(img[:, W // 4:3 * W // 4].mean()), 3))
