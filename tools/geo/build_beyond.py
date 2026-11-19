"""The rest of the globe: places and sea zones of the world outside the game map (east of 70° E, west of 100° W and
south of 38° S), added to the 15,220 places of the game map without changing them (Ramon, 2026-11-15: "Restliche Welt
dazubauen").

The world frame is the world probe's (public/map/regions/world: the game map's Mercator once round the globe, 13024 x
6400 map pixels). The places are made as tools/geo/build_locations.py makes those of the game map: settlements as
seeds (data/content/gazetteer_world.json, our research of the towns of 1356, then Natural Earth's populated places),
filled by Poisson-disc sampling with a spacing that follows how densely the land was settled around 1350, and grown
into warped Voronoi cells over the land; the sea into coarse zones. They are made at half the game map's resolution
(the world probe's step z3, 2 map pixels a cell): the borders of the realms are drawn from them only on the map from
afar.

These places are LIVE since 2026-11-15 (state v7 of the running world, tools/geo/merge_beyond.py): a new run with
other seeds or settings numbers them anew, so it must not replace them. Lists of towns for other uses (the voxel
world's settlements) go into files of their own, not into data/content/gazetteer_world.json.

Writes CACHE/beyond/ids.npy (int32 over step z3 of the world frame; 0 inside the game map and on lakes, 1..L2 land,
L2+1..L2+S2 sea) and CACHE/beyond/places.json (seeds, L2, S2). tools/geo/merge_beyond.py joins them to the game map.
Run: python3 tools/geo/build_beyond.py
"""

import gzip
import json
import math
import os
import sys

import numpy as np
from build_locations import fix_components, value_noise
from common import CACHE, LON0, LON1, ROOT, YMAX, YMIN
from common import H as MAP_H
from common import W as MAP_W
from scipy import ndimage
from scipy.spatial import cKDTree

OUT = os.path.join(CACHE, 'beyond')
REGION = os.path.join(ROOT, 'public', 'map', 'regions', 'world', 'z3')
LAND, SEA, LAKE = 0, 1, 2
rng = np.random.default_rng(1356)


def load_step():
    """Water and height of step z3 of the world frame (half a cell a map pixel)."""
    ix = json.load(open(os.path.join(REGION, 'index.json')))
    T, cells = ix['tile'], ix['cells']
    w, h = int(ix['worldW'] * cells), int(ix['worldH'] * cells)
    water = np.full((h, w), SEA, np.uint8)
    height = np.zeros((h, w), np.int16)
    n = T * T
    for k in ix['tiles']:
        tx, ty = map(int, k.split('_'))
        b = gzip.open(os.path.join(REGION, f'{k}.bin.gz')).read()
        y0, x0 = ty * T, tx * T
        y1, x1 = min(h, y0 + T), min(w, x0 + T)
        if y0 >= h or x0 >= w:
            continue
        height[y0:y1, x0:x1] = np.frombuffer(b[: 2 * n], np.int16).reshape(T, T)[: y1 - y0, : x1 - x0]
        water[y0:y1, x0:x1] = np.frombuffer(b[3 * n : 4 * n], np.uint8).reshape(T, T)[: y1 - y0, : x1 - x0]
    return ix, cells, water, height


def frame(ix, cells):
    """Map pixel <-> lon/lat of the world frame (as src/worldprobe/region.ts: the game map's span, then the rest of the globe)."""
    mapW, worldW, span = ix['mapW'], ix['worldW'], LON1 - LON0

    def lon_of(x):  # x in map pixels of the frame
        x = np.asarray(x, np.float64)
        return np.where(x < mapW, LON0 + x / mapW * span, LON1 + (x - mapW) / (worldW - mapW) * (360 - span))

    def lat_of(y):
        Y = YMAX - np.asarray(y, np.float64) / MAP_H * (YMAX - YMIN)
        return np.degrees(np.arctan(np.sinh(Y)))

    def km_per_px(x, lat):
        deg = np.where(np.asarray(x) < mapW, span / mapW, (360 - span) / (worldW - mapW))
        return deg * 111.32 * np.cos(np.radians(lat))

    def px_of(lon, lat):
        e = (np.asarray(lon, np.float64) - LON0) % 360
        x = np.where(e <= span, e / span * mapW, mapW + (e - span) / (360 - span) * (worldW - mapW))
        y = (YMAX - np.arcsinh(np.tan(np.radians(lat)))) / (YMAX - YMIN) * MAP_H
        return x, y

    return lon_of, lat_of, km_per_px, px_of


def spacing_km(lon, lat, height):
    """How far apart places lie, in km: close where the land was densely settled around 1350 (HYDE 3.2 population of
    1350 and the agrarian cores of the time), far apart on steppe, taiga, high plateau and desert."""
    lon = np.asarray(lon)
    lat = np.asarray(lat)
    height = np.asarray(height)
    r = np.full(lon.shape, 130.0)
    box = lambda a, b, c, d: (lon >= a) & (lon <= b) & (lat >= c) & (lat <= d)
    r[box(70, 180, -12, 56)] = 80  # Asia, generally
    r[box(70, 100, 5, 37)] = 40  # the Indian subcontinent
    r[box(73, 92, 21, 31)] = 32  # Gangetic plain, Punjab
    r[box(98, 123, 20, 41)] = 34  # China within the Great Wall
    r[box(110, 122, 27, 36)] = 28  # the lower Yangzi and Huai
    r[box(124, 131, 33, 43)] = 32  # Korea
    r[box(129, 146, 30, 42)] = 30  # Japan
    r[box(102, 110, 8, 23)] = 38  # Dai Viet, Champa
    r[box(92, 110, -11, 28) & ~box(102, 110, 8, 23)] = 60  # mainland and island South-East Asia
    r[box(105, 115, -9, -5.5)] = 30  # Java
    r[box(70, 92, 36, 46)] = 70  # Ferghana, Kashgar, Ili
    r[box(75, 112, 36, 46)] = 140  # Taklamakan, Gobi, Alashan
    r[box(85, 125, 42, 54)] = 120  # Mongolia, Manchurian steppe
    r[box(70, 180, 54, 90)] = 170  # Siberia
    r[box(-180, -100, 50, 90)] = 170  # Alaska, the Canadian north-west
    r[box(-130, -100, 30, 50)] = 120  # the American West
    r[box(-125, -117, 37, 50)] = 90  # the Pacific coast
    r[box(-110, -100, 14, 30)] = 55  # western Mexico
    r[box(110, 155, -45, -10)] = 170  # Australia
    r[box(165, 180, -48, -33)] = 120  # Aotearoa
    r[lat < -38] = 130  # Patagonia, the Cape
    r[(height > 3000) & (lat > 26) & (lat < 40)] = 150  # Tibet, the Pamirs
    return r


def main():
    if '--again' not in sys.argv:
        sys.exit(
            'the places beyond the game map are live (see the module text); run with --again only to study a new build'
        )
    os.makedirs(OUT, exist_ok=True)
    ix, cells, water, height = load_step()
    h, w = water.shape
    lon_of, lat_of, km_per_px, px_of = frame(ix, cells)
    inside = np.zeros((h, w), bool)
    inside[: int(MAP_H * cells), : int(MAP_W * cells)] = True
    land = (water == LAND) & ~inside
    sea = (water == SEA) & ~inside
    print('land cells', int(land.sum()), 'sea cells', int(sea.sum()))
    # --- seeds: researched towns of 1356, then Natural Earth's populated places --------------------------------
    seeds = []  # [x, y (cells), name, size, region, alt, pop]
    gz = os.path.join(ROOT, 'data', 'content', 'gazetteer_world.json')
    if os.path.exists(gz):
        for g in json.load(open(gz, encoding='utf-8'))['places']:
            x, y = px_of(g['lon'], g['lat'])
            seeds.append(
                [
                    float(x) * cells,
                    float(y) * cells,
                    g['name'],
                    int(g.get('size') or 2),
                    g.get('region'),
                    g.get('alt'),
                    g.get('pop1356'),
                ]
            )
    pp = json.load(open(os.path.join(CACHE, 'ne_10m_populated_places_simple.geojson'), encoding='utf-8'))
    for f in pp['features']:
        p = f['properties']
        lo, la = f['geometry']['coordinates'][:2]
        x, y = px_of(lo, la)
        sz = (
            4
            if p.get('scalerank', 9) <= 1
            else 3
            if p.get('scalerank', 9) <= 3
            else 2
            if p.get('scalerank', 9) <= 6
            else 1
        )
        # modern towns are only seeds: they carry no name of 1356 (the names come with the cultures, build_setup)
        seeds.append([float(x) * cells, float(y) * cells, None, sz, None, None, None])
    landdist, (iy, ixx) = ndimage.distance_transform_edt(~land, return_indices=True)
    kept = []
    for s in seeds:
        xi, yi = int(s[0]), int(s[1])
        if not (0 <= xi < w and 0 <= yi < h) or landdist[yi, xi] > 3:
            continue
        s[0], s[1] = float(ixx[yi, xi]) + 0.5, float(iy[yi, xi]) + 0.5
        kept.append(s)
    seeds = sorted(kept, key=lambda s: (s[2] is None, -s[3]))
    print('seeds on land', len(seeds))

    def r_cells(x, y):
        xi = np.clip(np.asarray(x).astype(int), 0, w - 1)
        yi = np.clip(np.asarray(y).astype(int), 0, h - 1)
        mx, my = np.asarray(x) / cells, np.asarray(y) / cells
        lo, la = lon_of(mx), lat_of(my)
        return spacing_km(lo, la, height[yi, xi]) / km_per_px(mx, la) * cells

    accepted, grid, cell = [], {}, 4.0

    def ok(x, y, r):
        gx, gy, rr = int(x // cell), int(y // cell), int(math.ceil(r / cell))
        for yy in range(gy - rr, gy + rr + 1):
            for xx in range(gx - rr, gx + rr + 1):
                for j in grid.get((xx, yy), ()):
                    if (accepted[j][0] - x) ** 2 + (accepted[j][1] - y) ** 2 < r * r:
                        return False
        return True

    def add(s):
        accepted.append(s)
        grid.setdefault((int(s[0] // cell), int(s[1] // cell)), []).append(len(accepted) - 1)

    rs = r_cells(np.array([s[0] for s in seeds]), np.array([s[1] for s in seeds]))
    for s, r in zip(seeds, rs):
        if ok(s[0], s[1], r * (0.45 if s[2] else 0.7)):
            add(s)
    print('seeds kept', len(accepted))
    ly, lx = np.nonzero(land)
    n_c = 700000
    pick = rng.integers(0, len(lx), n_c)
    cx, cy = lx[pick] + rng.random(n_c), ly[pick] + rng.random(n_c)
    for x, y, r in zip(cx, cy, r_cells(cx, cy)):
        if ok(x, y, r * 0.82):
            add([float(x), float(y), None, 0, None, None, None])
    print('land seeds', len(accepted))
    # --- warped Voronoi over the land ------------------------------------------------------------------------
    nx = value_noise(h // 2, w // 2, 6, octaves=3, seed=11)
    ny = value_noise(h // 2, w // 2, 6, octaves=3, seed=12)
    nx = ndimage.zoom(nx / nx.std(), 2, order=1)[:h, :w]
    ny = ndimage.zoom(ny / ny.std(), 2, order=1)[:h, :w]
    tree = cKDTree(np.array([[a[0], a[1]] for a in accepted]))
    ys, xs = np.nonzero(land)
    amp = np.clip(9.0 / km_per_px(xs / cells, lat_of(ys / cells)) * cells, 1, 6)
    _, idx = tree.query(np.stack([xs + 0.5 + nx[ys, xs] * amp, ys + 0.5 + ny[ys, xs] * amp], 1), workers=4)
    ids = np.zeros((h, w), np.int32)
    ids[ys, xs] = idx + 1
    ids = fix_components(ids, land, len(accepted))
    used = np.unique(ids[ids > 0])
    remap = np.zeros(ids.max() + 1, np.int32)
    remap[used] = np.arange(1, len(used) + 1)
    ids = remap[ids]
    places = [accepted[o - 1] if o - 1 < len(accepted) else [None, None, None, 0, None, None, None] for o in used]
    L2 = len(used)
    print('land places', L2)
    # --- sea zones: coarse, finer along coasts -------------------------------------------------------------
    coast = ndimage.distance_transform_edt(water == SEA)
    sy_, sx_ = np.nonzero(sea)
    pick = rng.integers(0, len(sx_), 300000)
    px, py = sx_[pick] + 0.5, sy_[pick] + 0.5
    la = lat_of(py / cells)
    kpc = km_per_px(px / cells, la) / cells
    dkm = coast[py.astype(int), px.astype(int)] * kpc
    r = np.where(dkm < 150, 320, 800) / kpc
    acc, sgrid, scell = [], {}, 16.0
    for i in np.argsort(dkm):
        x, y, rr = px[i], py[i], r[i]
        gx, gy, k = int(x // scell), int(y // scell), int(math.ceil(rr / scell))
        if any(
            (acc[j][0] - x) ** 2 + (acc[j][1] - y) ** 2 < (rr * 0.85) ** 2
            for yy in range(gy - k, gy + k + 1)
            for xx in range(gx - k, gx + k + 1)
            for j in sgrid.get((xx, yy), ())
        ):
            continue
        acc.append((x, y))
        sgrid.setdefault((gx, gy), []).append(len(acc) - 1)
    _, sidx = cKDTree(np.array(acc)).query(np.stack([sx_ + 0.5, sy_ + 0.5], 1), workers=4)
    zones = np.zeros((h, w), np.int32)
    zones[sy_, sx_] = sidx + 1
    zones = fix_components(zones, sea, len(acc))
    used = np.unique(zones[zones > 0])
    remap = np.zeros(zones.max() + 1, np.int32)
    remap[used] = np.arange(1, len(used) + 1)
    zones = remap[zones]
    S2 = int(zones.max())
    ids[sea] = zones[sea] + L2
    print('sea zones', S2)
    np.save(os.path.join(OUT, 'ids.npy'), ids)
    json.dump(
        {
            'L': L2,
            'S': S2,
            'cells': cells,
            'w': w,
            'h': h,
            'places': [
                [None if v is None else (round(float(v), 2) if isinstance(v, (float, np.floating)) else v) for v in p]
                for p in places
            ],
        },
        open(os.path.join(OUT, 'places.json'), 'w', encoding='utf-8'),
        ensure_ascii=False,
    )


if __name__ == '__main__':
    main()
