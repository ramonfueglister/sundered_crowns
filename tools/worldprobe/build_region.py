"""Cuts a region of the real world out of open geodata for the world probe (src/worldprobe).

The region is a window of the game map (same Mercator projection as tools/geo) at CELLS cells per map pixel, so that
it lines up with locations and borders later. It is written as square tiles of TILE cells, which the probe loads as it
needs them. Per cell: height in metres after river erosion, drainage area, water class, forest and cultivation share.
Rivers go along as lines, tile by tile, because the probe draws them on its own turned grid.

Inputs (all open, fetched into GEO_CACHE on first use):
  - AWS Terrain Tiles, terrarium, zoom 8 (SRTM / GMTED derived), about 430 m per pixel at 45° N
  - Natural Earth 10m: land, lakes, rivers, each with its European supplement (public domain)
  - the game's own 1356 layers: coast, lake and river overrides (data/history/1356), forest and cultivation (public/map/biome.png)
Outputs in public/map/regions/<name>/: index.json (projection, list of tiles), <tx>_<ty>.bin.gz (the rasters of a tile,
layer after layer, row by row) and <tx>_<ty>.json (the rivers that cross it, in cells of the whole map). Tiles are
named by their place on the whole map.

The whole map is too large to cut in one go, so the region `world` is cut part by part (PARTS): every part writes
its tiles into public/map/regions/world/ and leaves those of the other parts alone. A part is worked out together
with a margin of land around it, so that its rivers and valleys do not end at its edge.

Usage: python3 tools/worldprobe/build_region.py europe      (a part of the world: up to an hour and 8 GB of memory;
                                                             the smaller parts take 3 GB, so that two can run at once)
       python3 tools/worldprobe/build_region.py alps        (a region of its own, a minute)
then   python3 tools/worldprobe/build_overviews.py world    (the coarser steps of the whole)
"""
import gzip, http.client, io, json, math, os, shutil, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'geo'))
from erosion import erode
from common import CACHE, H, LAT_N, LAT_S, LON0, LON1, ROOT, W, lonlat_to_px, load_json, lines_from_geojson_geom, polys_from_geojson_geom, px_to_lonlat_np

Image.MAX_IMAGE_PIXELS = None
CELLS = 4
TILE = 512
ZOOM = 8
REGIONS = {
    # name: west, south, east, north (degrees); the window is widened to whole tiles
    'alps': (6.0, 43.0, 15.0, 48.6),
}
# the parts of the region `world`: first tile and the tile after the last, across and down (the map is 48 x 41 tiles)
PARTS = {
    'europe': (21, 0, 41, 20),
    'asia': (41, 0, 48, 20),
    'africa_north_west': (21, 20, 35, 30),
    'africa_south_west': (21, 30, 35, 41),
    'africa_north_east': (35, 20, 48, 30),
    'africa_south_east': (35, 30, 48, 41),
    'america_north_west': (0, 0, 11, 14),
    'america_north_east': (11, 0, 21, 14),
    'america_middle_west': (0, 14, 11, 28),
    'america_middle_east': (11, 14, 21, 28),
    'america_south': (0, 28, 21, 41),
}
# cells of land worked out around a part (Europe was cut first, without)
MARGIN = {'europe': 0}
MARGIN_CELLS = 256
TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/{name}.geojson'
SEA, LAKE = 1, 2
ROWS = 512  # rows sampled at a time, to keep the memory in bounds


def cached(url, path):
    """The bytes behind `url`, kept in the cache folder."""
    full = os.path.join(CACHE, path)
    if not os.path.exists(full):
        os.makedirs(os.path.dirname(full), exist_ok=True)
        for attempt in range(5):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'worldprobe'}), timeout=120) as r:
                    data = r.read()
                break
            except (OSError, http.client.HTTPException):
                # the line drops now and then: wait and ask again
                if attempt == 4: raise
                time.sleep(2 ** attempt)
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
        yy, xx = np.meshgrid(ys[r:r + ROWS], xs, indexing='ij')
        out[r:r + ROWS] = ndimage.map_coordinates(field, [yy, xx], order=order, mode='nearest')
    return out


def elevation(lon, lat):
    """Metres above sea level on the grid of longitudes `lon` and latitudes `lat`, from terrarium tiles, bilinear."""
    n = 2 ** ZOOM
    tx = (lon + 180) / 360 * n
    ty = (1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2 * n
    x0, x1, y0, y1 = int(tx.min()), int(tx.max()), int(ty.min()), int(ty.max())
    wanted = [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
    with ThreadPoolExecutor(16) as pool:
        list(pool.map(lambda t: cached(TILES.format(z=ZOOM, x=t[0], y=t[1]), f'terrarium/{ZOOM}_{t[0]}_{t[1]}.png'), wanted))
    mosaic = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), np.float32)
    for x, y in wanted:
        a = np.asarray(Image.open(io.BytesIO(cached(TILES.format(z=ZOOM, x=x, y=y), f'terrarium/{ZOOM}_{x}_{y}.png'))).convert('RGB'), dtype=np.float32)
        mosaic[(y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    return grid(mosaic, (ty - y0) * 256 - 0.5, (tx - x0) * 256 - 0.5)


def read_rivers(area, water, drawn, km):
    """
    (`km` is the size of a cell in each row.)
    The rivers that the drawn lines leave out, read from the drainage: every run of land cells through which at least
    RIVER_FROM km² drain, from where it lies clear of the drawn rivers down to the water or to the drawn river it
    joins. A run ends where the path goes straight for long, which is where the heights are too flat to say where the
    water runs; what then ends in the open plain is dropped.
    """
    RIVER_FROM, CLEAR_KM, STRAIGHT, SHORTEST = 400, 7, 10, 10
    h, w = area.shape
    img = Image.new('L', (w, h), 0); d = ImageDraw.Draw(img)
    for r in drawn: d.line([tuple(p) for p in r['pts']], fill=1, width=1)
    away = ndimage.distance_transform_edt(np.asarray(img) == 0)
    clear, stream = away * km[:, None] > CLEAR_KM, (area >= RIVER_FROM * 1e6) & (water == 0)
    down = {}
    for y, x in zip(*np.nonzero(stream)):
        best = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                ny, nx = y + dy, x + dx
                if (dy or dx) and 0 <= ny < h and 0 <= nx < w and area[ny, nx] > area[y, x] and (best is None or area[ny, nx] < area[best]): best = (ny, nx)
        if best: down[(y, x)] = best
    fed = {v for c, v in down.items() if clear[c]}
    heads, seen, found = [c for c in down if clear[c] and c not in fed], set(), []
    for head in sorted(heads, key=lambda c: area[c]):
        path, c, beside = [], head, 0
        while c in down and c not in seen:
            seen.add(c); path.append(c)
            beside = 0 if clear[c] else beside + 1
            # beside a drawn river: it is joined soon, or the path is that river itself, read a little off its line
            if away[c] <= 1.5: break
            if beside * km[c[0]] > 2 * CLEAR_KM: path = path[:-beside]; break
            c = down[c]
        else: path.append(c)
        # cut out the straight stretches
        runs, start = [], 0
        for i in range(1, len(path)):
            step = (path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
            if i == 1 or step != last: turn = i - 1
            last = step
            if i - turn == STRAIGHT: runs.append(path[start:turn + 1]); start = None
            if start is None and i - turn < STRAIGHT: start = i - 1
        if start is not None: runs.append(path[start:])
        found += [run for run in runs if len(run) >= SHORTEST]
    # a river goes on to water, to a drawn river or to another river that does; what ends in the open plain is dropped
    kept, reached = [], ~clear | ndimage.binary_dilation(water != 0, iterations=2)
    while True:
        more = [run for run in found if reached[run[-1]]]
        if not more: break
        for run in more:
            found.remove(run); kept.append(run)
            for c in run: reached[c] = True
    return [{'name': '', 'rank': 10 if area[run[-1]] < 2000e6 else 9, 'pts': [[float(x) + 0.5, float(y) + 0.5] for y, x in run[::2] + run[-1:]]} for run in kept]


def main(name):
    if name in PARTS:
        # the tiles to write, and around them the margin, as far as the map goes
        cx0, cy0, cx1, cy1 = (v * TILE for v in PARTS[name]); m = MARGIN.get(name, MARGIN_CELLS)
        gx0, gy0, gx1, gy1 = max(cx0 - m, 0), max(cy0 - m, 0), min(cx1 + m, W * CELLS), min(cy1 + m, H * CELLS // TILE * TILE)
        folder = 'world'
    else:
        west, south, east, north = REGIONS[name]
        # the window in cells of the whole map, widened to whole tiles
        gx0, gy0 = (int(math.floor(v * CELLS / TILE)) * TILE for v in lonlat_to_px(west, north))
        gx1, gy1 = (int(math.ceil(v * CELLS / TILE)) * TILE for v in lonlat_to_px(east, south))
        gy0, gy1 = max(gy0, 0), min(gy1, H * CELLS // TILE * TILE)
        cx0, cy0, cx1, cy1, folder = gx0, gy0, gx1, gy1, name
    w, h = gx1 - gx0, gy1 - gy0
    # cell centres in map pixels and in degrees: columns share a longitude, rows a latitude
    mx, my = (gx0 + np.arange(w) + 0.5) / CELLS, (gy0 + np.arange(h) + 0.5) / CELLS
    lon, lat = px_to_lonlat_np(mx, my)
    height = elevation(lon, lat)
    # a cell is as wide as it is high (Mercator), and smaller towards the north
    km = np.cos(np.radians(lat)) * (LON1 - LON0) / W * 111.32 / CELLS
    west, east, north, south = lon[0], lon[-1], lat[0], lat[-1]

    def to_cell(lo, la):
        x, y = lonlat_to_px(lo, la)
        return x * CELLS - gx0, y * CELLS - gy0

    def mask(rings_of_polys):
        img = Image.new('L', (w, h), 0); d = ImageDraw.Draw(img)
        for poly in rings_of_polys:
            for i, ring in enumerate(poly):
                pts = [to_cell(lo, la) for lo, la in ring]
                if len(pts) >= 3: d.polygon(pts, fill=1 if i == 0 else 0)
        return np.asarray(img).astype(bool)

    def polys(features):
        for f in features:
            yield from polys_from_geojson_geom(f['geometry'])

    def near(features):
        """Features whose bounding box touches the region (keeps the drawing fast)."""
        for f in features:
            c = np.array([p for poly in polys_from_geojson_geom(f['geometry']) for p in poly[0]] or [p for l in lines_from_geojson_geom(f['geometry']) for p in l])
            if len(c) and c[:, 0].max() >= west and c[:, 0].min() <= east and c[:, 1].max() >= south and c[:, 1].min() <= north: yield f

    ov = load_json(os.path.join(ROOT, 'data', 'history', '1356', 'terrain_overrides.json'), {}) or {}
    # today's lakes without the reservoirs of the 20th century
    dammed = set((ov.get('reservoirs') or {}).get('names') or [])
    def natural(features):
        for f in features:
            p = f['properties']
            if not (p.get('featurecla') == 'Reservoir' and (not p.get('name') or p['name'] in dammed)): yield f
    land = mask(polys(near(natural_earth('ne_10m_land'))))
    lake = mask(polys(natural(near(natural_earth('ne_10m_lakes'))))) | mask(polys(natural(near(natural_earth('ne_10m_lakes_europe')))))
    # the coast and the lakes of 1356 where they differ from today's
    for e in ov.get('coast_1356') or []:
        if not isinstance(e, dict) or len(e.get('polygon') or []) < 3: continue
        m = mask([[e['polygon']]])
        # lagoons are left as Natural Earth draws them: its coast has their islands and spits, the override is a rough outline
        if e.get('type') == 'sea': land &= ~m
        elif e.get('type') == 'land': land |= m
    for e in ov.get('lakes_1356') or []:
        ring = e.get('polygon') if isinstance(e, dict) else e
        if ring and len(ring) >= 3: lake |= mask([[ring]])
    water = np.zeros((h, w), np.uint8)
    water[~land] = SEA
    water[lake & land] = LAKE
    # a lake is level: every lake takes the height of its lowest tenth; the sea lies at 0
    labels, count = ndimage.label(water == LAKE)
    for k, box in enumerate(ndimage.find_objects(labels), 1):
        m = labels[box] == k
        height[box][m] = np.percentile(height[box][m], 10)
    del labels
    height[water == SEA] = 0
    height = np.where(water == 0, np.maximum(height, 1), height)

    # the same land after river erosion: clean valleys and ridges, the broad shape kept (see erosion.py)
    shaped, area = erode(height, water != 0, km * 1000)

    # forest and cultivation of 1356 from the game's biome layer (half map resolution: G forest, B cultivation)
    biome = np.asarray(Image.open(os.path.join(ROOT, 'public', 'map', 'biome.png')).convert('RGBA'))
    forest = grid(biome[..., 1].astype(np.float32), my / 2 - 0.5, mx / 2 - 0.5)
    crops = grid(biome[..., 2].astype(np.float32), my / 2 - 0.5, mx / 2 - 0.5)

    # rivers: today's lines, without the reaches that ran elsewhere in 1356, then the courses of 1356, then the rivers
    # the lines leave out, read from the drainage
    changed = [e for e in ov.get('rivers_1356') or [] if isinstance(e, dict) and len(e.get('line') or []) >= 2]
    dropped = {e['name']: mask([[e['replaces']]]) for e in changed if e.get('replaces')}
    rivers = []
    for source in ('ne_10m_rivers_lake_centerlines', 'ne_10m_rivers_europe'):
        for f in near(natural_earth(source)):
            p = f['properties']
            if str(p.get('featurecla', '')).lower().startswith('lake'): continue
            river = p.get('name_en') or p.get('name') or ''; gone = dropped.get(river)
            for line in lines_from_geojson_geom(f['geometry']):
                run = []
                for ll in list(line) + [None]:
                    pt = None if ll is None else [round(v, 1) for v in to_cell(ll[0], ll[1])]
                    inside = pt is not None and gone is not None and 0 <= int(pt[1]) < h and 0 <= int(pt[0]) < w and gone[int(pt[1]), int(pt[0])]
                    if pt is not None and not inside: run.append(pt); continue
                    if len(run) >= 2: rivers.append({'name': river, 'rank': int(p.get('scalerank') or 10), 'pts': run})
                    run = []
    for e in changed:
        rivers.append({'name': e['name'], 'rank': int(e.get('rank') or 10), 'pts': [[round(v, 1) for v in to_cell(lo, la)] for lo, la in e['line']]})
    rivers += read_rivers(area, water, rivers, km)

    out = os.path.join(ROOT, 'public', 'map', 'regions', folder)
    if folder == name: shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out, exist_ok=True)
    # of a region cut in parts, the tiles of the other parts stay
    mine = lambda key: cx0 <= int(key.split('_')[0]) * TILE < cx1 and cy0 <= int(key.split('_')[1]) * TILE < cy1
    for f in os.listdir(out):
        if f[0].isdigit() and mine(f.split('.')[0]): os.remove(os.path.join(out, f))
    layers = [np.clip(np.round(shaped), -500, 9000).astype('<i2'),
              # drainage area in km² as a logarithm: 16 steps per doubling
              np.clip(np.round(16 * np.log2(area / 1e6 + 1)), 0, 255).astype(np.uint8), water,
              np.clip(np.round(forest), 0, 255).astype(np.uint8), np.clip(np.round(crops), 0, 255).astype(np.uint8)]
    tiles = []
    for ky in range(cy0 // TILE, cy1 // TILE):
        for kx in range(cx0 // TILE, cx1 // TILE):
            # the tile's place in the window, in tiles
            tx, ty = (kx * TILE - gx0) / TILE, (ky * TILE - gy0) / TILE
            box = (slice(int(ty * TILE), int((ty + 1) * TILE)), slice(int(tx * TILE), int((tx + 1) * TILE)))
            if (water[box] == SEA).all(): continue
            key = f'{kx}_{ky}'; tiles.append(key)
            with gzip.open(os.path.join(out, f'{key}.bin.gz'), 'wb', compresslevel=9) as f:
                for layer in layers: f.write(layer[box].tobytes())
            # the rivers that cross the tile or pass close by, cut to the stretch that does
            x0, y0, x1, y1, crossing = tx * TILE - 8, ty * TILE - 8, (tx + 1) * TILE + 8, (ty + 1) * TILE + 8, []
            for r in rivers:
                inside = [x0 <= p[0] <= x1 and y0 <= p[1] <= y1 for p in r['pts']]
                run = []
                for i, p in enumerate(r['pts'] + [None]):
                    if p is not None and (inside[i] or (i > 0 and inside[i - 1]) or (i + 1 < len(inside) and inside[i + 1])): run.append([round(p[0] + gx0, 1), round(p[1] + gy0, 1)]); continue
                    if len(run) >= 2: crossing.append({'name': r['name'], 'rank': r['rank'], 'pts': run})
                    run = []
            with open(os.path.join(out, f'{key}.json'), 'w', encoding='utf-8') as f:
                json.dump(crossing, f, ensure_ascii=False, separators=(',', ':'))
    tiles = sorted((f.split('.')[0] for f in os.listdir(out) if f.endswith('.bin.gz')), key=lambda k: [int(v) for v in k.split('_')][::-1])
    meta = {'name': folder, 'tile': TILE, 'cells': CELLS, 'mapW': W, 'mapH': H, 'lon0': LON0, 'lon1': LON1, 'latN': LAT_N, 'latS': LAT_S,
            'layers': ['shaped:i16', 'drainage:u8', 'water:u8', 'forest:u8', 'crops:u8'], 'tiles': tiles}
    with open(os.path.join(out, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, separators=(',', ':'))
    size = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out) if os.path.isfile(os.path.join(out, f)))
    print(f'{name}: {w} x {h} cells, {folder} now {len(tiles)} tiles, {size / 1e6:.0f} MB, height {height.min():.0f} … {height.max():.0f} m, '
          f'sea {np.mean(water == SEA):.1%}, lakes {count}, rivers {len(rivers)}')


if __name__ == '__main__':
    # a cut of one's own, to try something out: build_region.py <name> <west> <south> <east> <north>
    if len(sys.argv) == 6: REGIONS[sys.argv[1]] = tuple(float(v) for v in sys.argv[2:])
    main(sys.argv[1] if len(sys.argv) > 1 else 'alps')
