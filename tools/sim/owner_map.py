#!/usr/bin/env python3
"""Political map preview from an observer snapshot (owner_<year>.json) using the location-ID raster.

usage: python3 tools/sim/owner_map.py <owner_YEAR.json> <out.png> [scale=0.25] [lon0 lon1 latN latS]
The optional box crops to a region (degrees), e.g. Europe: -12 45 62 33.
"""
import gzip, json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
snap = json.load(open(sys.argv[1]))
out = sys.argv[2]
scale = float(sys.argv[3]) if len(sys.argv) > 3 else 0.25
geo = json.load(open(ROOT / 'public/data/geo.json'))
W, H = geo['W'], geo['H']
raw = gzip.decompress((ROOT / 'public/map/ids.bin.gz').read_bytes())
bpp = len(raw) // (W * H)
ids = np.frombuffer(raw, dtype='<u2' if bpp == 2 else '<u4').reshape(H, W).astype(np.int64) - 1  # 1-based location / sea-zone index, 0 = nothing
if len(sys.argv) > 7:
    # the map projection is not linear in latitude: crop by the pixel positions of the locations inside the box
    lon0, lon1, latN, latS = map(float, sys.argv[4:8])
    lx, ly, lo, la = geo['loc']['x'], geo['loc']['y'], geo['loc']['lon'], geo['loc']['lat']
    inside = [i for i in range(len(lx)) if lon0 <= lo[i] <= lon1 and latS <= la[i] <= latN]
    x0, x1 = int(min(lx[i] for i in inside)), int(max(lx[i] for i in inside))
    y0, y1 = int(min(ly[i] for i in inside)), int(max(ly[i] for i in inside))
    ids = ids[max(0, y0):min(H, y1), max(0, x0):min(W, x1)]
step = max(1, int(round(1 / scale)))
ids = ids[::step, ::step]
L = geo['L']
owner = np.array(snap['owner'] + [-1] * 0, dtype=np.int64)
colors = np.array(snap['colors'], dtype=np.uint8)
img = np.zeros(ids.shape + (3,), dtype=np.uint8)
sea = (ids < 0) | (ids >= L)
img[sea] = (38, 62, 92)
land = ~sea
o = np.full(ids.shape, -1, dtype=np.int64)
o[land] = owner[ids[land]]
un = land & (o < 0)
img[un] = (150, 140, 120)
own = land & (o >= 0)
img[own] = colors[o[own]]
# borders between owners
b = np.zeros(ids.shape, dtype=bool)
b[:, 1:] |= (o[:, 1:] != o[:, :-1]) & land[:, 1:] & land[:, :-1]
b[1:, :] |= (o[1:, :] != o[:-1, :]) & land[1:, :] & land[:-1, :]
img[b] = (img[b] * 0.45).astype(np.uint8)
im = Image.fromarray(img)
ImageDraw.Draw(im).text((10, 10), str(snap.get('year', '')), fill=(255, 255, 255))
im.save(out)
print('wrote', out, im.size)
