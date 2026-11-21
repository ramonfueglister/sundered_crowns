"""Cuts a region of the real world out of open geodata for the world probe (src/worldprobe).

The region is a window of the game map (same Mercator projection as tools/geo) at CELLS cells per map pixel, so that
it lines up with locations and borders later. It is written as square tiles of TILE cells, which the probe loads as it
needs them. The region `world` goes on beyond the game map, once round the globe and south to Cape Horn (world_grid.py). Per cell: height in metres after river erosion, drainage area, water class, forest and cultivation share.
Rivers go along as lines, tile by tile, because the probe draws them on its own turned grid.

Inputs (all open, fetched into GEO_CACHE on first use by geodata.py):
  - AWS Terrain Tiles, terrarium, zoom 8 (SRTM / GMTED derived), about 430 m per pixel at 45° N
  - Natural Earth 10m: land, lakes, rivers, each with its European supplement (public domain)
  - the game's own 1356 layers: coast, lake and river overrides (data/history/1356), forest and cultivation (public/map/biome.png)
Outputs in public/map/regions/<name>/: index.json (projection, list of tiles), <tx>_<ty>.bin (the rasters of a tile,
layer after layer, row by row, as tiles.py writes them) and <tx>_<ty>.json (the rivers that cross it, in cells of the whole map). Tiles are
named by their place on the whole map. The river lists get the beds of their rivers (`bed`, `mid`) from
build_overviews.py, which has the whole region at hand: run it after every cut.

The whole world is too large to cut in one go, so the region `world` is cut part by part (PARTS): every part writes
its tiles into public/map/regions/world/ and leaves those of the other parts alone. A part is worked out together
with a margin of land around it, so that its rivers and valleys do not end at its edge. Outside the game map nothing
is known of the forests and fields of 1356: there both layers are empty, and the probe grows what the climate grows.

Usage: python3 tools/worldprobe/build_region.py europe      (a part of the world: up to an hour and 8 GB of memory;
                                                             the smaller parts take 3 GB, so that two can run at once)
       python3 tools/worldprobe/build_region.py alps        (a region of its own, a minute)
then   python3 tools/worldprobe/build_overviews.py world    (the coarser steps of the whole)
"""

import json
import math
import os
import shutil
import sys

import numpy as np
import tiles as tiles_file
from drainage_rivers import read_rivers
from geodata import elevation, grid, natural_earth
from PIL import Image, ImageDraw
from scipy import ndimage
from world_grid import ACROSS, CELLS, SPAN, TILE, WORLD_H, WORLD_W, tile_start, world_lonlat, world_px

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'geo'))
from common import (
    LAT_N,
    LAT_S,
    LON0,
    LON1,
    ROOT,
    H,
    W,
    lines_from_geojson_geom,
    load_json,
    lonlat_to_px,
    polys_from_geojson_geom,
)
from erosion import erode_lands

Image.MAX_IMAGE_PIXELS = None
REGIONS = {
    # name: west, south, east, north (degrees); the window is widened to whole tiles
    'alps': (6.0, 43.0, 15.0, 48.6),
}
# the parts of the region `world`: first tile and the tile after the last, across and down. Across, the tiles are
# counted on round the globe: tile ACROSS is tile 0 again.
PARTS = {
    'europe': (21, 0, 41, 20),
    'asia': (41, 0, 46, 20),
    'africa_north_west': (21, 20, 35, 30),
    'africa_south_west': (21, 30, 35, 39),
    'africa_north_east': (35, 20, 46, 30),
    'africa_south_east': (35, 30, 46, 39),
    'africa_far_south': (21, 39, 46, 50),
    'america_north_west': (2, 0, 11, 14),
    'america_north_east': (11, 0, 21, 14),
    'america_middle_west': (2, 14, 11, 28),
    'america_middle_east': (11, 14, 21, 28),
    'america_south': (2, 28, 21, 39),
    'america_far_south': (2, 39, 21, 50),
    'asia_far_north_west': (46, 0, 58, 10),
    'asia_far_north_middle': (58, 0, 69, 10),
    'asia_far_north_east': (69, 0, 80, 10),
    'asia_north_west': (46, 10, 58, 20),
    'asia_north_middle': (58, 10, 69, 20),
    'asia_north_east': (69, 10, 80, 20),
    'asia_south_west': (46, 20, 58, 30),
    'asia_south_middle': (58, 20, 69, 30),
    'asia_south_east': (69, 20, 80, 30),
    'oceania_west': (46, 30, 63, 39),
    'oceania_east': (63, 30, 80, 39),
    'oceania_far_south_west': (46, 39, 63, 50),
    'oceania_far_south_east': (63, 39, 80, 50),
    'pacific_north_west': (80, 0, 92, 14),
    'pacific_north_east': (92, 0, 104, 14),
    'pacific_middle_west': (80, 14, 92, 28),
    'pacific_middle_east': (92, 14, 104, 28),
    'pacific_south': (80, 28, 104, 39),
    'pacific_far_south': (80, 39, 104, 50),
}
# cells of land worked out around a part (Europe was cut first, without)
MARGIN = {'europe': 0}
MARGIN_CELLS = 256
SEA, LAKE = 1, 2


def main(name):
    part = name in PARTS
    if part:
        # the tiles to write, counted on round the globe, and around them the margin, as far down as the world goes
        tx0, ty0, tx1, ty1 = PARTS[name]
        m = MARGIN.get(name, MARGIN_CELLS)
        cx0, cy0, cx1, cy1 = tile_start(tx0), ty0 * TILE, tile_start(tx1), ty1 * TILE
        gx0, gy0, gx1, gy1 = cx0 - m, max(cy0 - m, 0), cx1 + m, min(cy1 + m, WORLD_H * CELLS)
        folder, wanted = (
            'world',
            [(t % ACROSS, ky, tile_start(t), tile_start(t + 1)) for ky in range(ty0, ty1) for t in range(tx0, tx1)],
        )
    else:
        west, south, east, north = REGIONS[name]
        # the window in cells of the whole map, widened to whole tiles
        gx0, gy0 = (int(math.floor(v * CELLS / TILE)) * TILE for v in lonlat_to_px(west, north))
        gx1, gy1 = (int(math.ceil(v * CELLS / TILE)) * TILE for v in lonlat_to_px(east, south))
        gy0, gy1 = max(gy0, 0), min(gy1, H * CELLS // TILE * TILE)
        folder, wanted = (
            name,
            [
                (kx, ky, kx * TILE, (kx + 1) * TILE)
                for ky in range(gy0 // TILE, gy1 // TILE)
                for kx in range(gx0 // TILE, gx1 // TILE)
            ],
        )
    w, h, round_the_globe = gx1 - gx0, gy1 - gy0, WORLD_W * CELLS
    # cell centres in map pixels and in degrees: columns share a longitude, rows a latitude
    mx, my = (gx0 + np.arange(w) + 0.5) / CELLS, (gy0 + np.arange(h) + 0.5) / CELLS
    lon, lat = world_lonlat(mx, my)
    # a cell is as wide as it is high (Mercator), and smaller towards the poles
    km = np.cos(np.radians(lat)) * SPAN / W * 111.32 / CELLS
    north, south = lat[0], lat[-1]

    def laps(lons):
        """The laps of the globe on which a shape with these longitudes touches the window."""
        x0, x1 = (float(v) * CELLS for v in world_px(np.array([np.min(lons), np.max(lons)]), 0)[0])
        return [k for k in (-1, 0, 1, 2) if x1 + k * round_the_globe >= gx0 and x0 + k * round_the_globe <= gx1]

    def cells_of(line, lap=0):
        """The points of a line of places in degrees, in cells of the window."""
        c = np.asarray(line, np.float64)
        x, y = world_px(c[:, 0], np.clip(c[:, 1], -85, 85))
        return list(zip((x * CELLS + lap * round_the_globe - gx0).tolist(), (y * CELLS - gy0).tolist()))

    def mask(rings_of_polys):
        img = Image.new('L', (w, h), 0)
        d = ImageDraw.Draw(img)
        for poly in rings_of_polys:
            if len(poly[0]) < 3:
                continue
            for lap in laps(np.asarray(poly[0], np.float64)[:, 0]):
                for i, ring in enumerate(poly):
                    if len(ring) >= 3:
                        d.polygon(cells_of(ring, lap), fill=1 if i == 0 else 0)
        return np.asarray(img).astype(bool)

    def polys(features):
        for f in features:
            yield from polys_from_geojson_geom(f['geometry'])

    def near(features):
        """Features whose bounding box touches the region (keeps the drawing fast)."""
        for f in features:
            c = np.array(
                [p[:2] for poly in polys_from_geojson_geom(f['geometry']) for p in poly[0]]
                or [p[:2] for l in lines_from_geojson_geom(f['geometry']) for p in l]
            )
            if len(c) and c[:, 1].max() >= south and c[:, 1].min() <= north and laps(c[:, 0]):
                yield f

    ov = load_json(os.path.join(ROOT, 'data', 'history', '1356', 'terrain_overrides.json'), {}) or {}
    # today's lakes without the reservoirs of the 20th century
    dammed = set((ov.get('reservoirs') or {}).get('names') or [])

    def natural(features):
        for f in features:
            p = f['properties']
            if not (p.get('featurecla') == 'Reservoir' and (not p.get('name') or p['name'] in dammed)):
                yield f

    land = mask(polys(near(natural_earth('ne_10m_land'))))
    lake = mask(polys(natural(near(natural_earth('ne_10m_lakes'))))) | mask(
        polys(natural(near(natural_earth('ne_10m_lakes_europe'))))
    )
    # the coast and the lakes of 1356 where they differ from today's
    for e in ov.get('coast_1356') or []:
        if not isinstance(e, dict) or len(e.get('polygon') or []) < 3:
            continue
        m = mask([[e['polygon']]])
        # lagoons are left as Natural Earth draws them: its coast has their islands and spits, the override is a rough outline
        if e.get('type') == 'sea':
            land &= ~m
        elif e.get('type') == 'land':
            land |= m
    for e in ov.get('lakes_1356') or []:
        ring = e.get('polygon') if isinstance(e, dict) else e
        if ring and len(ring) >= 3:
            lake |= mask([[ring]])
    water = np.zeros((h, w), np.uint8)
    water[~land] = SEA
    water[lake & land] = LAKE
    height = elevation(lon, lat, land)
    # a lake is level: every lake takes the height of its lowest tenth; the sea lies at 0
    labels, count = ndimage.label(water == LAKE)
    for k, box in enumerate(ndimage.find_objects(labels), 1):
        m = labels[box] == k
        height[box][m] = np.percentile(height[box][m], 10)
    del labels
    height[water == SEA] = 0
    height = np.where(water == 0, np.maximum(height, 1), height)

    # the same land after river erosion: clean valleys and ridges, the broad shape kept (see erosion.py)
    shaped, area = erode_lands(height, water != 0, water == SEA, km * 1000)

    # forest and cultivation of 1356 from the game's biome layer (half map resolution: G forest, B cultivation)
    biome = np.asarray(Image.open(os.path.join(ROOT, 'public', 'map', 'biome.png')).convert('RGBA'))
    # the layer ends with the game map
    known = (my < H)[:, None] & (mx % WORLD_W < W)[None, :]
    forest = np.where(known, grid(biome[..., 1].astype(np.float32), my / 2 - 0.5, mx % WORLD_W / 2 - 0.5), 0)
    crops = np.where(known, grid(biome[..., 2].astype(np.float32), my / 2 - 0.5, mx % WORLD_W / 2 - 0.5), 0)

    # rivers: today's lines, without the reaches that ran elsewhere in 1356, then the courses of 1356, then the rivers
    # the lines leave out, read from the drainage
    changed = [e for e in ov.get('rivers_1356') or [] if isinstance(e, dict) and len(e.get('line') or []) >= 2]
    dropped = {e['name']: mask([[e['replaces']]]) for e in changed if e.get('replaces')}
    rivers = []
    for source in ('ne_10m_rivers_lake_centerlines', 'ne_10m_rivers_europe'):
        for f in near(natural_earth(source)):
            p = f['properties']
            if str(p.get('featurecla', '')).lower().startswith('lake'):
                continue
            river = p.get('name_en') or p.get('name') or ''
            gone = dropped.get(river)
            for line in lines_from_geojson_geom(f['geometry']):
                line = np.asarray(line, np.float64)[:, :2]
                for lap in laps(line[:, 0]):
                    run = []
                    for xy in cells_of(line, lap) + [None]:
                        pt = None if xy is None else [round(v, 1) for v in xy]
                        inside = (
                            pt is not None
                            and gone is not None
                            and 0 <= int(pt[1]) < h
                            and 0 <= int(pt[0]) < w
                            and gone[int(pt[1]), int(pt[0])]
                        )
                        if pt is not None and not inside:
                            run.append(pt)
                            continue
                        if len(run) >= 2:
                            rivers.append({'name': river, 'rank': int(p.get('scalerank') or 10), 'pts': run})
                        run = []
    for e in changed:
        for lap in laps(np.asarray(e['line'], np.float64)[:, 0]):
            rivers.append(
                {
                    'name': e['name'],
                    'rank': int(e.get('rank') or 10),
                    'pts': [[round(v, 1) for v in xy] for xy in cells_of(e['line'], lap)],
                }
            )
    rivers += read_rivers(area, water, rivers, km)

    out = os.path.join(ROOT, 'public', 'map', 'regions', folder)
    if not part:
        shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out, exist_ok=True)
    # of a region cut in parts, the tiles of the other parts stay
    mine = {f'{kx}_{ky}' for kx, ky, _, _ in wanted}
    for f in os.listdir(out):
        if f.split('.')[0] in mine:
            os.remove(os.path.join(out, f))
    # (the tiles of the other parts must be in the coding this writes: tiles.py)
    if any(f.endswith('.bin.gz') for f in os.listdir(out)):
        sys.exit(f'{out} holds tiles zipped with gzip: python3 tools/worldprobe/recode_regions.py {folder} first')
    layers = [
        np.clip(np.round(shaped), -500, 9000).astype('<i2'),
        # drainage area in km² as a logarithm: 16 steps per doubling
        np.clip(np.round(16 * np.log2(area / 1e6 + 1)), 0, 255).astype(np.uint8),
        water,
        np.clip(np.round(forest), 0, 255).astype(np.uint8),
        np.clip(np.round(crops), 0, 255).astype(np.uint8),
    ]
    for kx, ky, first, after in wanted:
        # the tile's place in the window, in cells; where the world joins itself the tile is cut short and filled up with sea
        box = (slice(ky * TILE - gy0, (ky + 1) * TILE - gy0), slice(first - gx0, after - gx0))
        if (water[box] == SEA).all():
            continue
        key, raw = f'{kx}_{ky}', b''
        for k, layer in enumerate(layers):
            full = np.full((TILE, TILE), SEA if k == 2 else 0, layer.dtype)
            full[:, : after - first] = layer[box]
            raw += full.tobytes()
        tiles_file.write(out, key, raw, TILE)
        # the rivers that cross the tile or pass close by, cut to the stretch that does, in the cells the tile itself counts in
        x0, y0, x1, y1, to_x, crossing = (
            first - gx0 - 8,
            ky * TILE - gy0 - 8,
            after - gx0 + 8,
            (ky + 1) * TILE - gy0 + 8,
            gx0 - first + kx * TILE,
            [],
        )
        for r in rivers:
            inside = [x0 <= p[0] <= x1 and y0 <= p[1] <= y1 for p in r['pts']]
            run = []
            for i, p in enumerate(r['pts'] + [None]):
                if p is not None and (
                    inside[i] or (i > 0 and inside[i - 1]) or (i + 1 < len(inside) and inside[i + 1])
                ):
                    run.append([round(p[0] + to_x, 1), round(p[1] + gy0, 1)])
                    continue
                if len(run) >= 2:
                    crossing.append({'name': r['name'], 'rank': r['rank'], 'pts': run})
                run = []
        with open(os.path.join(out, f'{key}.json'), 'w', encoding='utf-8') as f:
            json.dump(crossing, f, ensure_ascii=False, separators=(',', ':'))
    tiles = sorted(
        (f.split('.')[0] for f in os.listdir(out) if f.endswith('.bin')),
        key=lambda k: [int(v) for v in k.split('_')][::-1],
    )
    meta = {
        'name': folder,
        'tile': TILE,
        'cells': CELLS,
        'mapW': W,
        'mapH': H,
        'lon0': LON0,
        'lon1': LON1,
        'latN': LAT_N,
        'latS': LAT_S,
        'layers': ['shaped:i16', 'drainage:u8', 'water:u8', 'forest:u8', 'crops:u8'],
        'coding': 'br',
        'tiles': tiles,
    }
    # the world goes round the globe: its width in map pixels, after which it begins again, and its height
    if part:
        meta.update(worldW=WORLD_W, worldH=WORLD_H)
    with open(os.path.join(out, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, separators=(',', ':'))
    size = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out) if os.path.isfile(os.path.join(out, f)))
    print(
        f'{name}: {w} x {h} cells, {folder} now {len(tiles)} tiles, {size / 1e6:.0f} MB, height {height.min():.0f} … {height.max():.0f} m, '
        f'sea {np.mean(water == SEA):.1%}, lakes {count}, rivers {len(rivers)}'
    )


if __name__ == '__main__':
    # a cut of one's own, to try something out: build_region.py <name> <west> <south> <east> <north>
    if len(sys.argv) == 6:
        REGIONS[sys.argv[1]] = tuple(float(v) for v in sys.argv[2:])
    main(sys.argv[1] if len(sys.argv) > 1 else 'alps')
