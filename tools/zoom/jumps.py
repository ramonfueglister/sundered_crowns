"""Measures how evenly the picture changes along a zoom (stills of tools/zoom/sweep.mjs).

For every pair of neighbouring stills the nearer one is shrunk about its middle by the ratio of their widths, so
that both show the same ground at the same size, and compared with the middle of the farther one:
  colour  mean absolute difference of the two, after a blur that hides single blocks (0 … 255)
  grain   ratio of their fine contrast (standard deviation of the picture minus its blur); 1 = same grain
The camera looks down more steeply as the view widens (zoom.ts elevationOf, mirrored below), which draws the ground
deeper in the picture; the nearer still is stretched by that too, so that the tilt itself does not count as change.
A smooth zoom has small, even numbers; a step of the map stands out. Usage: python3 jumps.py <dir>
"""

import glob
import math
import re
import sys

import numpy as np
from PIL import Image, ImageFilter

files = sorted(glob.glob(sys.argv[1] + '/wide_*.png'))
wide = [int(re.search(r'wide_(\d+)', f).group(1)) for f in files]


# zoom.ts: VIEW.elevation, TILT_FROM, TILT_UNTIL, STRAIGHT_DOWN (the near view's own tilt below 160 is left out)
def squash(wide):
    t = min(1, max(0, (math.log2(wide) - math.log2(1000)) / (math.log2(11000) - math.log2(1000))))
    return math.sin(math.radians(18.7 + (89.5 - 18.7) * t * t * (3 - 2 * t)))


def parts(im):
    blur = im.filter(ImageFilter.GaussianBlur(6))
    a, b = np.asarray(im, float), np.asarray(blur, float)
    return b, (a - b).std()


rows = []
for k in range(len(files) - 1):
    near, far = Image.open(files[k]).convert('RGB'), Image.open(files[k + 1]).convert('RGB')
    W, H = near.size
    s = wide[k] / wide[k + 1]
    w, tall = round(W * s), round(H * s * squash(wide[k + 1]) / squash(wide[k]))
    h = min(tall, H)
    box = ((W - w) // 2, (H - h) // 2, (W - w) // 2 + w, (H - h) // 2 + h)
    a, ga = parts(near.resize((w, tall), Image.LANCZOS).crop((0, (tall - h) // 2, w, (tall - h) // 2 + h)))
    b, gb = parts(far.crop(box))
    rows.append((wide[k], wide[k + 1], np.abs(a - b).mean(), gb / ga))
med = np.median([r[2] for r in rows])
print('from   to     colour  grain')
for a, b, c, g in rows:
    print(f'{a:6d} {b:6d} {c:6.1f} {g:6.2f}' + ('   <-- jump' if c > 1.6 * med or abs(np.log(g)) > 0.25 else ''))
print(
    f'median colour {med:.1f}, worst {max(r[2] for r in rows):.1f}, worst grain {max(rows, key=lambda r: abs(np.log(r[3])))[3]:.2f}'
)
