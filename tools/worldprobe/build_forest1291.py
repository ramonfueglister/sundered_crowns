"""Makes the forest of 1291 for the world probe: the share of each place's land that stood under trees in the years
around 1291, built from what was measured and written down, not from a rule of thumb.

Three sources, each where it is the best evidence there is:

1. Pollen (measured). Githumbi, Pirzamanbein, Lindström et al. 2022 ("Pollen-based maps of past regional vegetation
   cover in Europe over 12 millennia - evaluation and potential", Frontiers in Ecology and Evolution 10:795794,
   doi:10.3389/fevo.2022.795794) turned 1,128 pollen records with the REVEALS model (Sugita 2007) into complete maps
   of Europe at 1 degree: the share of evergreen trees, of summer-green trees and of open land. Their time window
   700-350 BP is AD 1250-1600; 1291 lies early in it. Files: github.com/BehnazP/SpatioCompo_entireHolocene,
   Land_Cover_550.csv, kept in data/history/1291/forest/ (free to use with attribution to the paper).

2. Land use (modelled). KK10, Kaplan, Krumhardt, Ellis, Ruddiman, Lemmen & Klein Goldewijk 2011 (The Holocene 21,
   775-791, doi:10.1177/0959683610386983; data doi:10.1594/PANGAEA.871369): the share of every 5 arc-minute cell
   under fields, pasture and other use, year by year, from the population of each region and the quality of its
   land. Kaplan, Krumhardt, Gaillard et al. 2017 (Land 6:91) found it to agree with the pollen at the scale of a
   country (slope 0.97). Here it says WHERE inside a 1-degree cell the land was cleared, and how much outside the
   pollen maps (North Africa, the Near East, the steppe's far edge). Mean of 1281-1301, cut out of the 17 GB file
   on Ramon's Mac by range requests; kept in the cache folder (kk10/).

3. History (written down), only where the literature shows the pollen to be wrong:
   - England: woodland covered about 15 % in 1086 (Domesday Book; Rackham, Trees and Woodland in the British
     Landscape) and about 7 % by 1349 (Royal Forestry Society / Forestry Commission England 2015, "A brief history of
     British woodlands"). 1291 is set on the straight line between them (8.8 %); the line is an assumption.
   - Ireland is NOT corrected, for want of a number: the pollen overstates its trees for 1600-1850 (about 40 %
     against 2 to 12.5 % in the Civil Survey and in McCracken; Kaplan et al. 2017; Rackham 2001), but for the time
     around 1300 no count of Ireland's woods is known, and KK10 alone would give more trees (51 %) than the pollen
     (35 %). The pollen stands, as the lower of the two.

How they are put together. A place's forest is its potential forest (what the climate would grow without people,
POTENTIAL below, by its kind of land in climate.bin) times what people left of it:

    forest = potential * sigmoid(logit(1 - kk10) + b)

where b is one number per 1-degree cell, solved so that the cell's mean forest equals the pollen's share of trees
(in logit space, so cleared land stays the cleared land of KK10 and the order of places is kept). b is then spread
smoothly between the cells' centres, and fades to 0 within 2 degrees outside the pollen maps. Where the potential is
below the pollen (steppe, where the pollen maps are least sure), the potential holds: the result is reported.

Output: public/map/forest1291.bin.gz, one byte per 2 x 2 map pixels of the world (the grid of climate.bin):
0-250 = share of the land under trees in steps of 0.4 %, 255 = no value (sea, or outside the world's frame in
data/content/world_extent.json). public/map/conifer1291.bin.gz, the same grid: share of the trees that are evergreen
(conifers) from the pollen, 0-250, 255 where the pollen maps do not reach.

Usage: python3 tools/worldprobe/build_forest1291.py [--report]
"""

import csv
import gzip
import json
import os
import pathlib
import sys

import numpy as np
from matplotlib.path import Path
from scipy import ndimage

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'geo'))
from common import CACHE, ROOT, H, W

sys.path.insert(0, os.path.dirname(__file__))
from build_region import WORLD_H, WORLD_W, world_lonlat

SRC = os.path.join(ROOT, 'data', 'history', '1291', 'forest')
POLLEN = os.path.join(SRC, 'reveals_1250_1600.csv')
KK10 = os.path.join(CACHE, 'kk10')
# Potential forest share by kind of land (climate.ts Land): an assumption, stated. Temperate, boreal and wet tropical
# climates grow closed forest; the Mediterranean's own cover is a mosaic of woods and maquis; savanna, steppe and the
# grasslands of the ecoregions only groves and gallery woods; desert, tundra and ice none.
POTENTIAL = {0: 0.0, 1: 1.0, 2: 0.8, 3: 0.1, 4: 0.0, 5: 0.3, 6: 1.0, 7: 1.0, 8: 0.0, 9: 0.0, 10: 0.15}
ENGLAND_1291 = 0.15 + (0.07 - 0.15) * (1291 - 1086) / (1349 - 1086)
FADE_DEG = 2.0
# the most a cell may move KK10's odds of clearing, in logits (e^3: twentyfold)
B_MAX = 3.0
SOFT_DEG = 0.4
STEP = 250


def frame():
    e = json.loads(pathlib.Path(os.path.join(ROOT, 'data', 'content', 'world_extent.json')).read_text())
    return e['west'], e['east'], e['south'], e['north']


def grid():
    """Columns and rows of the climate grid inside the frame, with their degrees."""
    west, east, south, north = frame()
    lon, lat = world_lonlat(np.arange(WORLD_W // 2) * 2 + 1.0, np.arange(WORLD_H // 2) * 2 + 1.0)
    cols = np.nonzero((lon >= west) & (lon <= east))[0]
    rows = np.nonzero((lat >= south) & (lat <= north))[0]
    return cols, rows, lon[cols], lat[rows]


def land_mask(cols, rows):
    ids = np.frombuffer(
        gzip.decompress(pathlib.Path(os.path.join(ROOT, 'public', 'map', 'ids.bin.gz')).read_bytes()), '<u2'
    ).reshape(H, W)
    L = json.loads(pathlib.Path(os.path.join(ROOT, 'public', 'data', 'geo.json')).read_text())['L']
    py = np.clip(rows * 2 + 1, 0, H - 1)
    px = np.clip(cols * 2 + 1, 0, W - 1)
    v = ids[np.ix_(py, px)]
    return (v >= 1) & (v <= L)


def climate_kinds(cols, rows):
    c = np.frombuffer(
        gzip.decompress(pathlib.Path(os.path.join(ROOT, 'public', 'map', 'climate.bin.gz')).read_bytes()), np.uint8
    ).reshape(WORLD_H // 2, WORLD_W // 2)
    return c[np.ix_(rows, cols)] & 63


def pollen():
    """1-degree cells: centre lon, lat, share of trees, share of the trees that are evergreen."""
    out = []
    with open(POLLEN) as f:
        for r in csv.DictReader(f):
            c, b = float(r['C_KK10LonLatElev']), float(r['B_KK10LonLatElev'])
            out.append((float(r['Lon']), float(r['Lat']), c + b, c / max(c + b, 1e-9)))
    return np.array(out)


def kk10(lon, lat):
    """KK10 land use (share) at the grid's places: mean of 1281-1301, bilinear between the 5' cells."""
    u = np.load(os.path.join(KK10, 'kk10_1281_1301_mean.npy')).astype(np.float32)
    klat = np.load(os.path.join(KK10, 'lat.npy'))
    klon = np.load(os.path.join(KK10, 'lon.npy'))
    if u.shape != (klat.size, klon.size):
        u = u.T
    u = np.where((u < 0) | (u > 1), np.nan, u)
    # KK10 has no value on water; a shore takes its land's, not none (else every lake and coast gets a ring of woods)
    idx = ndimage.distance_transform_edt(np.isnan(u), return_distances=False, return_indices=True)
    u = u[idx[0], idx[1]]
    if klat[0] > klat[-1]:
        klat = klat[::-1]
        u = u[::-1]
    fy = np.interp(lat, klat, np.arange(klat.size))
    fx = np.interp(lon, klon, np.arange(klon.size))
    return ndimage.map_coordinates(u, np.meshgrid(fy, fx, indexing='ij'), order=1, mode='nearest')


def polygon_mask(lon, lat, units):
    """Cells inside the Natural Earth map units named (ne_10m_admin_0_map_units, cached in ne/)."""
    d = json.loads(pathlib.Path(os.path.join(CACHE, 'ne', 'ne_10m_admin_0_map_units.geojson')).read_text())
    LON, LAT = np.meshgrid(lon, lat)
    pts = np.c_[LON.ravel(), LAT.ravel()]
    m = np.zeros(pts.shape[0], bool)
    for f in d['features']:
        if f['properties'].get('GEOUNIT') not in units:
            continue
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for p in polys:
            ring = np.array(p[0])
            x0, y0 = ring.min(0)
            x1, y1 = ring.max(0)
            sel = (pts[:, 0] >= x0) & (pts[:, 0] <= x1) & (pts[:, 1] >= y0) & (pts[:, 1] <= y1)
            if sel.any():
                m[sel] |= Path(ring).contains_points(pts[sel])
    return m.reshape(LAT.shape)


def sig(z):
    return 1 / (1 + np.exp(-z))


def logit(p):
    return np.log(np.clip(p, 1e-4, 1 - 1e-4) / (1 - np.clip(p, 1e-4, 1 - 1e-4)))


def solve_offset(pot, base, wgt, groups, target, n, lo=-12.0, hi=12.0):
    """Per group, the b in pot * sigmoid(base + b) whose weighted mean is the target (bisection, all at once)."""
    a = np.full(n, lo)
    z = np.full(n, hi)
    sw = np.bincount(groups, wgt, n)
    for _ in range(50):
        m = (a + z) / 2
        mean = np.bincount(groups, wgt * pot * sig(base + m[groups]), n) / np.maximum(sw, 1e-12)
        up = mean < target
        a = np.where(up, m, a)
        z = np.where(up, z, m)
    return (a + z) / 2


def main():
    report = '--report' in sys.argv
    cols, rows, lon, lat = grid()
    land = land_mask(cols, rows)
    pot = np.vectorize(POTENTIAL.get)(climate_kinds(cols, rows)).astype(np.float64)
    # the kinds come in blocks of the climate sources' cells (up to half a degree); nature has no such edges: the
    # potential is eased over SOFT_DEG between them (on land only, so the sea does not thin the coast)
    k = SOFT_DEG / abs(lat[0] - lat[1])
    lm = land.astype(float)
    pot = np.where(land, ndimage.gaussian_filter(pot * lm, k) / np.maximum(ndimage.gaussian_filter(lm, k), 1e-6), pot)
    used = kk10(lon, lat)
    base = logit(1 - used)
    area = np.broadcast_to(np.cos(np.radians(lat))[:, None] ** 2, land.shape)  # Mercator cells: area ~ cos² lat
    P = pollen()
    # 1-degree lattice over the pollen maps
    x0, y0 = P[:, 0].min(), P[:, 1].min()
    nx, ny = int(round(P[:, 0].max() - x0)) + 1, int(round(P[:, 1].max() - y0)) + 1
    T = np.full((ny, nx), np.nan)
    C = np.full((ny, nx), np.nan)
    ix = np.round(P[:, 0] - x0).astype(int)
    iy = np.round(P[:, 1] - y0).astype(int)
    T[iy, ix] = P[:, 2]
    C[iy, ix] = P[:, 3]
    # which lattice cell each grid place is in
    gx = np.floor(lon - (x0 - 0.5)).astype(int)
    gy = np.floor(lat - (y0 - 0.5)).astype(int)
    GX, GY = np.meshgrid(gx, gy)
    inside = (GX >= 0) & (nx > GX) & (GY >= 0) & (ny > GY)
    cell = np.where(inside, GY.clip(0, ny - 1) * nx + GX.clip(0, nx - 1), -1)
    known = inside & ~np.isnan(T.ravel()[cell.clip(0)]) & land
    # history overrides: England's overall level from the records
    england = polygon_mask(lon, lat, {'England'}) & land
    # solve b per lattice cell, then spread it smoothly; repeat so the smooth field keeps the cells' means
    n = nx * ny
    g = np.where(known, cell, n)
    target = np.append(np.nan_to_num(T.ravel()), 0)
    # cells whose potential cannot carry the pollen's trees keep their potential (reported)

    def spread(bc):
        """b of the lattice, missing cells from the nearest known, eased over a cell, bilinear between the cells' centres, faded
        out within FADE_DEG of the pollen maps' edge (the fade itself eased over a cell, so its steps do not show)."""
        grid_b = bc[:n].reshape(ny, nx)
        have = np.zeros((ny, nx), bool)
        have.ravel()[np.unique(g[g < n])] = True
        idx = ndimage.distance_transform_edt(~have, return_distances=False, return_indices=True)
        filled = ndimage.gaussian_filter(grid_b[idx[0], idx[1]], 0.75, mode='nearest')
        fade = ndimage.gaussian_filter(
            np.clip(1 - ndimage.distance_transform_edt(np.isnan(T)) / FADE_DEG, 0, 1), 1.0, mode='nearest'
        )
        fy = np.clip(lat - y0, 0, ny - 1)
        fx = np.clip(lon - x0, 0, nx - 1)
        FY, FX = np.meshgrid(fy, fx, indexing='ij')
        field = ndimage.map_coordinates(filled, [FY, FX], order=1, mode='nearest')
        out_y = np.maximum(0, np.maximum(y0 - lat, lat - (y0 + ny - 1)))[:, None]
        out_x = np.maximum(0, np.maximum(x0 - lon, lon - (x0 + nx - 1)))[None, :]
        w = np.clip(ndimage.map_coordinates(fade, [FY, FX], order=3, mode='nearest'), 0, 1) * np.clip(
            1 - np.hypot(out_y, out_x) / FADE_DEG, 0, 1
        )
        return field * w

    wgt = np.where(known, area, 0.0)
    field = np.zeros(land.shape)
    for _ in range(20):
        # solve each cell's b with the smooth field of the others as its base, then take the step into the field
        bc = solve_offset(pot.ravel(), (base + field).ravel(), wgt.ravel(), g.ravel(), target, n + 1)
        bc[n] = 0
        bc = np.clip(bc, -B_MAX, B_MAX)  # a cell its potential cannot carry (or bare of trees) asks for no end of b
        field = field + spread(bc)
    forest = pot * sig(base + field)
    # England: one offset over the whole of it so its woods are those of the records; eased in over half a degree
    if england.any():
        eb = solve_offset(
            pot[england],
            (base + field)[england],
            area[england],
            np.zeros(england.sum(), int),
            np.array([ENGLAND_1291]),
            1,
        )[0]
        ease = ndimage.gaussian_filter(england.astype(float), sigma=max(1, int(0.25 / abs(lat[1] - lat[0]))))
        ease = np.where(england, 1.0, ease)
        field = field + eb * ease
        forest = pot * sig(base + field)
    out = np.full((WORLD_H // 2, WORLD_W // 2), 255, np.uint8)
    out[np.ix_(rows, cols)] = np.where(land, np.round(np.clip(forest, 0, 1) * STEP), 255).astype(np.uint8)
    con = np.full((WORLD_H // 2, WORLD_W // 2), 255, np.uint8)
    FY, FX = np.meshgrid(np.clip(lat - y0, 0, ny - 1), np.clip(lon - x0, 0, nx - 1), indexing='ij')
    cfill = C.copy()
    miss = np.isnan(cfill)
    idx = ndimage.distance_transform_edt(miss, return_distances=False, return_indices=True)
    cfill = cfill[idx[0], idx[1]]
    cv = ndimage.map_coordinates(cfill, [FY, FX], order=1, mode='nearest')
    con[np.ix_(rows, cols)] = np.where(
        land & inside & (ndimage.map_coordinates((~miss).astype(float), [FY, FX], order=1) > 0.5),
        np.round(cv * STEP),
        255,
    ).astype(np.uint8)
    for name, arr in (('forest1291', out), ('conifer1291', con)):
        with open(os.path.join(ROOT, 'public', 'map', f'{name}.bin.gz'), 'wb') as f:
            f.write(gzip.compress(arr.tobytes(), 9, mtime=0))
    # how well the cells keep the pollen
    mean = np.bincount(g.ravel(), (wgt * forest).ravel(), n + 1)[:n] / np.maximum(
        np.bincount(g.ravel(), wgt.ravel(), n + 1)[:n], 1e-12
    )
    ok = np.bincount(g.ravel(), wgt.ravel(), n + 1)[:n] > 0
    capped = ok & (
        np.bincount(g.ravel(), (wgt * pot).ravel(), n + 1)[:n]
        / np.maximum(np.bincount(g.ravel(), wgt.ravel(), n + 1)[:n], 1e-12)
        < target[:n] - 0.02
    )
    err = (mean - target[:n])[ok & ~capped]
    print(
        f'pollen cells {ok.sum()}: {capped.sum()} held lower by the potential (desert, steppe); the other {err.size}: mean |error| {np.abs(err).mean() * 100:.1f} %, 95 % within {np.percentile(np.abs(err), 95) * 100:.1f} %, worst {np.abs(err).max() * 100:.1f} %'
    )
    print(
        f'England {np.average(forest[england], weights=area[england]) * 100:.1f} % (records {ENGLAND_1291 * 100:.1f} %)'
    )
    if report:
        np.savez_compressed(
            os.path.join(KK10, 'forest1291_report.npz'),
            lon=lon,
            lat=lat,
            forest=np.where(land, forest, np.nan),
            pot=pot,
            used=used,
            field=field,
        )


if __name__ == '__main__':
    main()
