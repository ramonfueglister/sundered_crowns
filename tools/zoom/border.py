"""Signed colour difference across the borders of the map's steps: stills of tools/zoom/sweep.mjs in pairs (finer, coarser),
laid over each other as tools/zoom/jumps.py does. Prints the mean of coarser minus finer on the land (0 … 255), of the sRGB numbers and (`light`) of the light they stand for.
Usage: python3 border.py <dir>"""

import glob, math, re, sys
import numpy as np
from PIL import Image, ImageFilter


def squash(wide):
    t = min(1, max(0, (math.log2(wide) - math.log2(2000)) / (math.log2(22000) - math.log2(2000))))
    return math.sin(math.radians(18.7 + (89.5 - 18.7) * t * t * (3 - 2 * t)))


files = sorted(glob.glob(sys.argv[1] + '/wide_*.png'))
wide = [int(re.search(r'wide_(\d+)', f).group(1)) for f in files]
for k in range(0, len(files) - 1, 2):
    near, far = Image.open(files[k]).convert('RGB'), Image.open(files[k + 1]).convert('RGB')
    W, H = near.size
    s = wide[k] / wide[k + 1]
    w, tall = round(W * s), round(H * s * squash(wide[k + 1]) / squash(wide[k]))
    h = min(tall, H)
    box = ((W - w) // 2, (H - h) // 2, (W - w) // 2 + w, (H - h) // 2 + h)
    a = np.asarray(
        near.resize((w, tall), Image.LANCZOS)
        .crop((0, (tall - h) // 2, w, (tall - h) // 2 + h))
        .filter(ImageFilter.GaussianBlur(6)),
        float,
    )
    b = np.asarray(far.crop(box).filter(ImageFilter.GaussianBlur(6)), float)
    d = (b - a).reshape(-1, 3)
    land = a.reshape(-1, 3)[:, 2] < 120  # not sea
    # the eye mixes light, not sRGB numbers: a pattern of dark and light blocks and their even mix look alike, so
    # the means are taken of the light and told as the sRGB colour of that light
    lin = lambda v: np.where(v <= 10.31, v / 3294.6, ((v / 255 + 0.055) / 1.055) ** 2.4)
    back = lambda v: np.where(v <= 0.0031308, v * 3294.6, 255 * (1.055 * v ** (1 / 2.4) - 0.055))
    la, lb = (
        np.asarray(
            near.resize((w, tall), Image.LANCZOS).crop((0, (tall - h) // 2, w, (tall - h) // 2 + h)), float
        ).reshape(-1, 3),
        np.asarray(far.crop(box), float).reshape(-1, 3),
    )
    light = back(lin(lb)[land].mean(0)) - back(lin(la)[land].mean(0))
    print(
        f'{wide[k]:6d}->{wide[k + 1]:6d} signed land {d[land].mean(0).round(1)} abs {np.abs(d[land]).mean():.1f}  all {d.mean(0).round(1)}  light {light.round(1)}'
    )
