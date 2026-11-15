# Fine skin relief as a tangent-space normal map over the whole skin atlas
# (tileable noise, same for every UV island): pores as small dimples on a
# jittered grid, a soft "orange peel" undulation and, with age, a fine
# cross-hatch of skin lines. Sizes after the pore and furrow measurements in
# Igarashi et al. (2007), not verified online; all strengths PLACEHOLDER.
# usage: python3 skin_nmap.py out.png size pore_px pore_depth peel lines seed
import sys
import numpy as np
from PIL import Image
out = sys.argv[1]
N, pore_px, depth, peel, lines, seed = int(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]), float(sys.argv[6]), int(sys.argv[7])
rng = np.random.default_rng(seed)
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)

def worley(cell):
    """distance to the nearest jittered point, tileable (N divisible by cell)"""
    g = N // cell
    pts = rng.random((g, g, 2)).astype(np.float32) * cell
    cx, cy = (xx // cell).astype(int), (yy // cell).astype(int)
    best = np.full((N, N), 1e9, np.float32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            jx, jy = (cx + dx) % g, (cy + dy) % g
            px = (cx + dx) * cell + pts[jy, jx, 0]
            py = (cy + dy) * cell + pts[jy, jx, 1]
            d = np.hypot(xx - px, yy - py)
            best = np.minimum(best, d)
    return best

def value_noise(cell):
    """smooth tileable value noise in -1..1"""
    g = N // cell
    v = rng.random((g, g)).astype(np.float32) * 2 - 1
    fx, fy = xx / cell, yy / cell
    x0, y0 = np.floor(fx).astype(int), np.floor(fy).astype(int)
    tx, ty = fx - x0, fy - y0
    tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    a = v[y0 % g, x0 % g]; b = v[y0 % g, (x0 + 1) % g]
    c = v[(y0 + 1) % g, x0 % g]; d = v[(y0 + 1) % g, (x0 + 1) % g]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty

cell = max(2, int(round(pore_px * 2.2)))
while N % cell:
    cell += 1
d = worley(cell)
size = pore_px * (0.7 + 0.6 * (value_noise(cell * 4) * 0.5 + 0.5))   # pores vary in size
h = -depth * np.exp(-(d / (0.5 * size)) ** 2)
h += peel * (0.6 * value_noise(16) + 0.4 * value_noise(8))
if lines > 0:
    # two crossing families of fine furrows (the skin's diamond pattern),
    # each a sine broken up by noise so the lines wander and fade
    for ang in (0.6, -0.9):
        u = xx * np.cos(ang) + yy * np.sin(ang) + 6 * value_noise(64)
        fade = np.clip(value_noise(128) * 0.5 + 0.6, 0, 1)
        h -= lines * fade * np.clip(np.cos(u * 2 * np.pi / 22) - 0.6, 0, None) / 0.4
gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
n = np.stack([-gx, gy, np.ones_like(h)], -1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
ang = np.degrees(np.arccos(n[..., 2]))
print(out, 'mean tilt', round(float(ang.mean()), 2), 'deg, 95%', round(float(np.percentile(ang, 95)), 2))
Image.fromarray(((n * 0.5 + 0.5) * 255).round().astype(np.uint8)).save(out)
