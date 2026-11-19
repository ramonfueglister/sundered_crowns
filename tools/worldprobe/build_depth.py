"""The depth of the sea as a small picture for the world's water (src/lookprobe/stage/api.ts `Stage.sea`).

Reads public/map/height.bin.gz (metres, the sea bed below nought; [w, h] uint32 LE, then int16 LE delta-coded along
each row) and writes public/map/depth.png: one grey byte per two height pixels each way (four map pixels), the mean
depth of the sea there on a log scale, 0 on land: byte = 255 * ln(1 + d / D0) / ln(1 + DEEPEST / D0).

usage: python3 tools/worldprobe/build_depth.py
"""
import gzip
import math
import struct

import numpy as np
from PIL import Image

D0, DEEPEST, DOWN = 20.0, 6000.0, 2

raw = gzip.open('public/map/height.bin.gz').read()
w, h = struct.unpack('<II', raw[:8])
height = np.cumsum(np.frombuffer(raw[8:], dtype='<i2').reshape(h, w).astype(np.int32), axis=1)
depth = np.maximum(0, -height).astype(np.float64)
h2, w2 = h // DOWN, w // DOWN
depth = depth[: h2 * DOWN, : w2 * DOWN].reshape(h2, DOWN, w2, DOWN).mean(axis=(1, 3))
byte = np.clip(np.round(255 * np.log1p(depth / D0) / math.log1p(DEEPEST / D0)), 0, 255).astype(np.uint8)
Image.fromarray(byte, 'L').save('public/map/depth.png', optimize=True)
print(f'depth.png {w2} x {h2}, sea {np.mean(byte > 0):.2f}')
