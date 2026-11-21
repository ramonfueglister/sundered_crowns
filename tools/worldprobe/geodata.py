"""The open geodata the world probe's tools read, fetched once into the cache folder (GEO_CACHE, tools/geo/common.py).

- AWS Terrain Tiles, terrarium, zoom ZOOM (SRTM / GMTED derived), about 430 m per pixel at 45° N
- Natural Earth 10m layers (public domain)
"""

import http.client
import io
import json
import math
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'geo'))
from common import CACHE

ZOOM = 8
TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/{name}.geojson'
ROWS = 512  # rows sampled at a time, to keep the memory in bounds


def cached(url, path):
    """The bytes behind `url`, kept in the cache folder."""
    full = os.path.join(CACHE, path)
    if not os.path.exists(full):
        os.makedirs(os.path.dirname(full), exist_ok=True)
        for attempt in range(5):
            try:
                with urllib.request.urlopen(
                    urllib.request.Request(url, headers={'User-Agent': 'worldprobe'}), timeout=120
                ) as r:
                    data = r.read()
                break
            except (OSError, http.client.HTTPException):
                # the line drops now and then: wait and ask again
                if attempt == 4:
                    raise
                time.sleep(2**attempt)
        # written under another name first, so that no half file is ever read
        with open(f'{full}.{os.getpid()}', 'wb') as f:
            f.write(data)
        os.replace(f'{full}.{os.getpid()}', full)
    with open(full, 'rb') as f:
        return f.read()


def natural_earth(name):
    return json.loads(cached(NE.format(name=name), f'{name}.geojson'))['features']


def grid(field, ys, xs, order=1):
    """`field` sampled on the grid of rows `ys` and columns `xs` (pixel coordinates of the field), a few rows at a time."""
    out = np.empty((len(ys), len(xs)), np.float32)
    for r in range(0, len(ys), ROWS):
        yy, xx = np.meshgrid(ys[r : r + ROWS], xs, indexing='ij')
        out[r : r + ROWS] = ndimage.map_coordinates(field, [yy, xx], order=order, mode='nearest')
    return out


def elevation(lon, lat, land):
    """
    Metres above sea level on the grid of longitudes `lon` and latitudes `lat`, from terrarium tiles, bilinear. Only
    the tiles that `land` (the grid's cells that are not sea) reaches are fetched; the rest of the grid stays 0.
    """
    n = 2**ZOOM
    tx = (lon + 180) / 360 * n
    ty = (1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2 * n
    x0, x1, y0, y1 = int(tx.min()), int(tx.max()), int(ty.min()), int(ty.max())
    # the tiles with land, and those beside them, which the blend at a tile's edge reaches into
    dry = np.zeros((y1 - y0 + 1, x1 - x0 + 1), bool)
    rows, cols = ty.astype(int) - y0, tx.astype(int) - x0
    for r in np.unique(rows):
        dry[r, np.unique(cols[land[rows == r].any(0)])] = True
    dry = ndimage.binary_dilation(dry, np.ones((3, 3), bool))
    # round the globe the tiles begin again
    wanted = [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1) if dry[y - y0, x - x0]]

    def source(x, y):
        return cached(TILES.format(z=ZOOM, x=x % n, y=y), f'terrarium/{ZOOM}_{x % n}_{y}.png')

    with ThreadPoolExecutor(16) as pool:
        list(pool.map(lambda t: source(*t), wanted))
    mosaic = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), np.float32)
    for x, y in wanted:
        a = np.asarray(Image.open(io.BytesIO(source(x, y))).convert('RGB'), dtype=np.float32)
        mosaic[(y - y0) * 256 : (y - y0 + 1) * 256, (x - x0) * 256 : (x - x0 + 1) * 256] = (
            a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
        )
    return grid(mosaic, (ty - y0) * 256 - 0.5, (tx - x0) * 256 - 0.5)
