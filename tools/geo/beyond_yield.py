"""The yield of the places beyond the game map (tools/geo/merge_beyond.py): the Caloric Suitability Index of the whole
globe (tools/geo/build_csi_crop.py --world), read over the new places as tools/geo/build_land.py reads it over the game
map: each cell of the step takes the index cell its centre lies in.
"""

import gzip
import json
import os
from pathlib import Path

import numpy as np
from build_land import yield_curve
from common import ROOT


def add_yield(land, flat, xs, ys, cells, worldW, lon_of, lat_of, kmc, n, L2):
    """appends the yield and the yield curve of the new places to land.json's arrays; flat is the beyond raster, xs and
    ys the column and row of each of its cells, kmc their side in km"""
    cmeta = json.loads(
        Path(os.path.join(ROOT, 'tools', 'geo', 'data', 'csi', 'pre1500_max_world.json')).read_text(encoding='utf-8')
    )
    if cmeta['raster']['sha256'] != land['source']['sha256']:
        raise SystemExit('the whole raster is not the one of land.json')
    cc = cmeta['crop']
    csi = np.frombuffer(
        gzip.decompress(Path(os.path.join(ROOT, 'tools', 'geo', 'data', 'csi', cc['file'])).read_bytes()), dtype='<f4'
    ).reshape(cc['height'], cc['width'])
    clon = np.mod(lon_of(np.mod((xs + 0.5) / cells, worldW)) + 180.0, 360.0) - 180.0
    clat = lat_of((ys + 0.5) / cells)
    ccol = np.clip(np.floor((clon - cc['lon0']) / cc['cell_lon']).astype(np.int64), 0, cc['width'] - 1)
    crow = np.floor((cc['lat0'] - clat) / cc['cell_lat']).astype(np.int64)
    inside = (crow >= 0) & (crow < cc['height'])
    cv = np.full(flat.size, np.nan, np.float32)
    cv[inside] = csi[crow[inside], ccol[inside]]
    has = np.isfinite(cv)
    cv0 = np.where(has, cv, 0.0).astype(np.float64)
    km2c = kmc**2
    nland = (flat >= 1) & (flat <= L2)
    cov = np.bincount(flat, weights=km2c * has, minlength=n)[1 : L2 + 1]
    tot = np.bincount(flat, weights=km2c * cv0, minlength=n)[1 : L2 + 1]
    ymean = np.divide(tot, cov, out=np.full(L2, np.nan), where=cov > 0)
    cell_ix = np.where(inside, crow, 0) * cc['width'] + ccol
    fert2, steps2 = yield_curve(flat, nland, cell_ix, cc['width'] * cc['height'], cv0, km2c, L2)
    land['yield'] += [None if np.isnan(m) else round(float(m), 1) for m in ymean]
    land['curve']['fertile'] += [float(f) for f in fert2]
    land['curve']['steps'] += steps2
    land['source']['beyond'] = 'places beyond the game map: the whole raster, {}'.format(cc['file'])
    print(
        'yield of the new places: without data %d, median %.0f'
        % (int(np.isnan(ymean).sum()), float(np.nanmedian(ymean)))
    )
