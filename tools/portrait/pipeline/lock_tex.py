# The image of a lock of hair (the tubes of `hairlib.py` `locks_from_wisps`): single hairs side by side, drawn one
# over the other. Its upper part (`BODY` of the height) is the lock's length: solid, and the same read downwards
# and upwards from either end, so that it can be laid along a lock of any length back and forth without a seam.
# The rest is the lock's end: there the hairs end one after the other, each run out to a point, and between them
# the image covers nothing: the end of a lock is frayed, not cut. Its left side goes on at its right. The last rows
# are empty: an image laid end to end shows its top again at its lower edge.
# usage: python3 -I lock_tex.py out.png [seed=1]
# switches: HAIRS (how many), WIDE (a hair's breadth in pixels), SWAY (how far a hair leaves its place, pixels),
# TONE (how light the topmost hairs are), DEEP (how much darker the hairs lying lowest are), ENDS (how the hairs
# of one place across the lock end: 1 evenly over the last half of their reach, above 1 most of them at its end),
# POINTS (how far into the end part the hairs between the lock's points reach, as a share of those in the points;
# 0.75 since round 89, before 0.5: with a lock's end drawn 2.5 cm long that was two or three long narrow points to
# a lock, a fringe cut from paper; the lock itself is narrower at its end now, `hairlib.py` `locks_from_wisps(tip=)`)
import os
import sys
import numpy as np
from PIL import Image

out = sys.argv[1]
rng = np.random.default_rng(int(sys.argv[2]) if len(sys.argv) > 2 else 1)
W, H = 256, 1024
BODY = 0.75
HAIRS = int(os.environ.get('HAIRS', '420'))
WIDE = float(os.environ.get('WIDE', '2.6'))
SWAY = float(os.environ.get('SWAY', '5'))
DEEP = float(os.environ.get('DEEP', '0.25'))
TONE = float(os.environ.get('TONE', '0.98'))
ENDS = float(os.environ.get('ENDS', '2.5'))
POINTS = float(os.environ.get('POINTS', '0.75'))

rows = np.arange(H)
t = rows / (BODY * H)                       # 0..1 down the lock's length, beyond 1 its end
img = np.zeros((H, W))
cov = np.zeros((H, W))
# what shows between the hairs along the lock's length: the hair below, dark
img[:] = TONE * (1 - 1.5 * DEEP)
cov[t <= 1.0] = 1.0
depth = np.sort(rng.random(HAIRS))          # drawn from the lowest to the topmost
# hairs lying side by side in a lock share their tone: broad streaks across it
streak = sum(a * np.cos(2 * np.pi * (k * np.arange(W) / W + rng.random())) for k, a in ((2, 0.04), (5, 0.035), (11, 0.025)))
# a lock ends in a few points: how far into the end part the hairs of a place across it reach
reach = sum(a * np.cos(2 * np.pi * (k * np.arange(W) / W + rng.random())) for k, a in ((2, 1.0), (3, 0.8), (7, 0.35)))
reach = POINTS + (1 - POINTS) * (reach - reach.min()) / (reach.max() - reach.min())
for d in depth:
    x0 = rng.uniform(0, W)
    # its way down the lock: sums of cosines of whole half-waves are the same read from either end
    x = x0 + sum(rng.normal(0, SWAY / k) * np.cos(np.pi * k * t) for k in (1, 2, 3, 5))
    tone = (1 - DEEP * (1 - d)) * (TONE + streak[int(x0) % W]) * rng.lognormal(0, 0.06)
    # where it ends, and its last stretch run out to a point
    end = 1 + (1 / BODY - 1) * 0.94 * reach[int(x0) % W] * (1 - 0.5 * rng.random() ** ENDS)
    thin = np.clip((end - t) / 0.06, 0, 1)
    half = 0.5 * WIDE * (0.6 + 0.4 * thin)
    for k in range(-2, 4):
        col = np.floor(x).astype(int) + k
        ok = thin > 0
        # a round hair: full in its middle, falling off to its flanks
        a = np.clip(1 - np.abs(col - x) / half, 0, 1) ** 0.7 * np.minimum(1, thin * 3)
        r, c, a = rows[ok], col[ok] % W, a[ok]                # round the image's sides: it can be laid side by side
        lit = tone * (0.75 + 0.25 * a)
        img[r, c] = img[r, c] * (1 - a) + lit * a
        cov[r, c] = cov[r, c] + (1 - cov[r, c]) * a
rgb = np.round(np.clip(img, 0, 1) * 255).astype(np.uint8)
Image.fromarray(np.dstack([rgb, rgb, rgb, np.round(np.clip(cov, 0, 1) * 255).astype(np.uint8)]), 'RGBA').save(out)
print('lock image', out, 'mean tone of the length', round(float(img[t <= 1].mean()), 3), 'covering of the end', round(float(cov[t > 1].mean()), 3))
