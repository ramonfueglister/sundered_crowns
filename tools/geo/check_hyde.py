"""Check for economy feature 2 (docs/ECONOMY_DESIGN.md): cropland and people of the HYDE grid per region of the map.

HYDE (History Database of the Global Environment) gives cropland in km2 and inhabitants per 5 arc-minute grid cell
for a year. This script lays such grids over the place raster of the map and prints, as JSON, the sums per region,
for England's places and for the whole map. tools/sim/harvest_check.ts sets the model's cultivated land against them.
Nothing here feeds the game: the output is a check only.

A cell's cropland and people are spread over the map's land pixels inside the cell in proportion to their ground
area, so the sum over the map equals the sum over the cells that hold land of the map. Cropland in cells of the map
window without land of the map (other coastline) is reported as "outside".

The cloud build environment cannot reach the data servers; the script runs wherever the grids can be downloaded.

Usage (ESRI ASCII grids as they come out of HYDE's zip files; the year is read from the file name):
  python3 check_hyde.py --name "HYDE 3.3 baseline" --cropland cropland1300AD.asc cropland1400AD.asc \
                        --pop popc_1300AD.asc popc_1400AD.asc > hyde_regions.json
"""

import argparse
import gzip
import hashlib
import json
import os
import re
import sys

import numpy as np
from common import LON0, LON1, OUT_DATA, OUT_PUBLIC, km_per_px, px_to_lonlat_np


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def read_asc(path):
    """ESRI ASCII grid: (array with no-data as 0, header)."""
    head = {}
    with open(path, encoding='ascii', errors='replace') as f:
        for _ in range(6):
            k, v = f.readline().split()
            head[k.lower()] = float(v)
        a = np.loadtxt(f, dtype=np.float64)
    rows, cols = int(head['nrows']), int(head['ncols'])
    if a.shape != (rows, cols):
        sys.exit('%s: header says %d x %d, data is %s' % (path, rows, cols, a.shape))
    if 'xllcorner' not in head or 'yllcorner' not in head:
        sys.exit(f'{path}: no xllcorner/yllcorner in the header')
    nodata = head.get('nodata_value')
    n_nodata = int((a == nodata).sum()) if nodata is not None else 0
    if nodata is not None:
        a[a == nodata] = 0.0
    if (a < 0).any():
        sys.exit(f'{path}: negative values besides no-data')
    return a, head, n_nodata


def year_of(path):
    m = re.search(r'(\d+)\s*(AD|CE)', os.path.basename(path), re.I)
    if not m:
        sys.exit(f'no year in the file name: {path}')
    return int(m.group(1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--name', required=True, help='data set and version, as on its catalogue page')
    ap.add_argument('--cropland', nargs='+', required=True)
    ap.add_argument('--pop', nargs='*', default=[])
    args = ap.parse_args()

    geo = json.load(open(os.path.join(OUT_DATA, 'geo.json'), encoding='utf-8'))
    land_json = json.load(open(os.path.join(OUT_DATA, 'land.json'), encoding='utf-8'))
    W, H, L = geo['W'], geo['H'], geo['L']
    ids = np.frombuffer(gzip.open(os.path.join(OUT_PUBLIC, 'ids.bin.gz')).read(), dtype='<u2').reshape(H, W)
    lon = LON0 + (np.arange(W) + 0.5) / W * (LON1 - LON0)
    lat = px_to_lonlat_np(np.zeros(H), np.arange(H) + 0.5)[1]
    km2 = np.broadcast_to((km_per_px(lat) ** 2)[:, None], ids.shape)
    land = (ids >= 1) & (ids <= L)
    place = ids[land].astype(np.int64) - 1
    px_km2 = km2[land]
    area = np.bincount(place, weights=px_km2, minlength=L)

    region_of = np.full(L, -1, dtype=np.int64)
    regions = sorted({p['region'] for p in geo['provinces']})
    for p in geo['provinces']:
        for l in p['locs']:
            region_of[l - 1] = regions.index(p['region'])
    if (region_of < 0).any():
        sys.exit('%d places without a region' % int((region_of < 0).sum()))
    england = np.array(land_json['england']['places'], dtype=np.int64)

    def per_place(path):
        """Sum of the grid over each place, the part outside the map's land, and the file's record."""
        a, head, n_nodata = read_asc(path)
        cell, x0, y1 = head['cellsize'], head['xllcorner'], head['yllcorner'] + head['nrows'] * head['cellsize']
        col = np.floor((lon - x0) / cell).astype(np.int64)
        row = np.floor((y1 - lat) / cell).astype(np.int64)
        if col.min() < 0 or col.max() >= a.shape[1] or row.min() < 0 or row.max() >= a.shape[0]:
            sys.exit(f'{path} does not cover the map window')
        idx = row[:, None] * a.shape[1] + col[None, :]
        window = np.zeros(a.size, dtype=bool)
        window[idx.ravel()] = True
        idx = idx[land]
        cell_land = np.bincount(idx, weights=px_km2, minlength=a.size)
        flat = a.ravel()
        value = px_km2 / cell_land[idx] * flat[idx]
        outside = float(flat[window & (cell_land == 0)].sum())
        rec = {
            'file': os.path.basename(path),
            'bytes': os.path.getsize(path),
            'sha256': sha256(path),
            'ncols': int(head['ncols']),
            'nrows': int(head['nrows']),
            'xllcorner': head['xllcorner'],
            'yllcorner': head['yllcorner'],
            'cellsize': head['cellsize'],
            'nodata_cells': n_nodata,
            'sum_world': round(float(flat.sum()), 1),
            'sum_map_window': round(float(flat[window].sum()), 1),
            'outside_map_land': round(outside, 1),
        }
        return np.bincount(place, weights=value, minlength=L), rec

    def sums(v, digits):
        out = {r: round(float(v[region_of == k].sum()), digits) for k, r in enumerate(regions)}
        out['england_places'] = round(float(v[england].sum()), digits)
        out['whole_map'] = round(float(v.sum()), digits)
        return out

    out = {
        'dataset': args.name,
        'method': 'each grid cell spread over the land pixels of the map inside it, by ground area; sums per region '
        'of the map (public/data/geo.json), for the places of England (public/data/land.json) and for the '
        'whole map',
        'land_km2': sums(area, 0),
        'cropland_km2': {},
        'people': {},
        'files': [],
    }
    for kind, paths, digits in (('cropland_km2', args.cropland, 1), ('people', args.pop, 0)):
        for path in paths:
            v, rec = per_place(path)
            rec['kind'], rec['year'] = kind, year_of(path)
            out['files'].append(rec)
            out[kind][str(rec['year'])] = sums(v, digits)
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
