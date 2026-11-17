# Plaited straw as a tiling image (colour and normal map): rows of a plait of seven straws,
# the way straw hats were sewn from a long plait wound round. Each row runs along u.
# usage: python3 -I straw_tex.py out_color.webp out_normal.webp [size] [rows]
import sys
import numpy as np
from PIL import Image

out_c, out_n = sys.argv[1:3]
S = int(sys.argv[3]) if len(sys.argv) > 3 else 512
ROWS = int(sys.argv[4]) if len(sys.argv) > 4 else 8

y, x = np.mgrid[0:S, 0:S].astype(np.float64) / S
rh = 1.0 / ROWS
ry = (y % rh) / rh                       # 0..1 across a row
row = np.floor(y / rh)
# a plait: straws slanting alternately (chevrons), period along the row
per = rh * 0.9
sx = (x + 0.5 * per * (row % 2)) / per
side = np.where(ry < 0.5, 1.0, -1.0)     # upper half slants one way, lower the other
ph = (sx + side * (ry - 0.5) * 1.6) % 1.0
strand = np.sin(np.pi * ((ph * 3.5) % 1.0))           # three and a half straws per period
ridge = np.sin(np.pi * ry) ** 0.35                     # the plait is round across
H = 0.65 * strand * ridge + 0.35 * ridge
H[(ry < 0.04) | (ry > 0.96)] -= 0.4                    # seam between rows
k = 3.0
gx = (np.roll(H, -1, 1) - np.roll(H, 1, 1)) * 0.5 * k * S / 256
gy = (np.roll(H, -1, 0) - np.roll(H, 1, 0)) * 0.5 * k * S / 256
n = np.stack([-gx, gy, np.ones_like(H)], -1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).round().astype(np.uint8)).save(out_n, quality=90)
rng = np.random.default_rng(11)
tint = 0.92 + 0.08 * rng.random((ROWS * 8, 64))
tint = np.kron(tint, np.ones((S // (ROWS * 8) + 1, S // 64 + 1)))[:S, :S]
base = np.array([0.83, 0.68, 0.40])
lum = (0.55 + 0.45 * np.clip(H, 0, 1)) * tint
c = np.clip(base[None, None] * lum[..., None], 0, 1)
Image.fromarray((c * 255).round().astype(np.uint8)).save(out_c, quality=92)
print('straw', S, ROWS)
