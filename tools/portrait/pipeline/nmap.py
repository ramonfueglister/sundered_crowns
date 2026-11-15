# Normal map for a hair texture: strands as ridges (height from the blurred
# alpha), and for card atlases a rounded profile across each tile, so that
# every card catches light like a lock.
# usage: python3 -I nmap.py tex.png out_n.png [tiles]
import sys
import numpy as np
from PIL import Image, ImageFilter
src, out = sys.argv[1], sys.argv[2]
tiles = int(sys.argv[3]) if len(sys.argv) > 3 else 0
im = Image.open(src).convert('RGBA')
a = np.asarray(im.getchannel('A').filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
g = np.asarray(im.convert('L').filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
h = a * (0.6 + 0.4 * g)
gx = np.zeros_like(h); gy = np.zeros_like(h)
gx[:, 1:-1] = (h[:, 2:] - h[:, :-2]) / 2
gy[1:-1] = (h[2:] - h[:-2]) / 2
k = 3.0
nx, ny = -gx * k, gy * k   # y up (OpenGL style, as Godot reads it)
if tiles:
    H, W = h.shape
    x = (np.arange(W) % (W // tiles)) / (W // tiles) * 2 - 1
    nx = nx + 0.55 * x[None, :]
nz = np.ones_like(h)
n = np.stack([nx, ny, nz], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8), 'RGB').save(out)
print('normal map', out)
