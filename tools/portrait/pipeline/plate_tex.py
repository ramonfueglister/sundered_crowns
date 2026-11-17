# Hammered plate (helms, crowns) as a tiling image: grey around 0.85 with a faint mottling of the forge's colours,
# and a normal map of shallow round dents left by the hammer. The colour of each part comes from the piece's file.
# usage: python3 -I plate_tex.py out_color.webp out_normal.webp [size] [dents]
import sys
import numpy as np
from PIL import Image

out_c, out_n = sys.argv[1:3]
S = int(sys.argv[3]) if len(sys.argv) > 3 else 512
ND = int(sys.argv[4]) if len(sys.argv) > 4 else 260
rng = np.random.default_rng(13)
y, x = np.mgrid[0:S, 0:S].astype(np.float64)
H = np.zeros((S, S))
for _ in range(ND):
    cx, cy = rng.random(2) * S
    r = S * (0.025 + 0.035 * rng.random())
    dx = (x - cx + S / 2) % S - S / 2          # tiling
    dy = (y - cy + S / 2) % S - S / 2
    d2 = (dx * dx + dy * dy) / (r * r)
    H -= np.where(d2 < 1, (1 - d2) ** 2, 0) * (0.6 + 0.4 * rng.random())
k = 1.2
gx = (np.roll(H, -1, 1) - np.roll(H, 1, 1)) * 0.5 * k
gy = (np.roll(H, -1, 0) - np.roll(H, 1, 0)) * 0.5 * k
n = np.stack([-gx, gy, np.ones_like(H)], -1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).round().astype(np.uint8)).save(out_n, quality=90)


def blur_noise(cells, amp):
    k = rng.normal(0, 1, (cells, cells))
    im = Image.fromarray(((k - k.min()) / (np.ptp(k) + 1e-9) * 255).astype(np.uint8)).resize((S, S), Image.BICUBIC)
    return (np.asarray(im).astype(np.float64) / 255 - 0.5) * amp


lum = 0.85 * (1 + blur_noise(6, 0.10) + blur_noise(24, 0.05) + 0.04 * H)
tint = np.stack([lum * 1.01, lum, lum * 0.98], -1)
Image.fromarray((np.clip(tint, 0, 1) * 255).round().astype(np.uint8)).save(out_c, quality=92)
print('plate', S, ND)
