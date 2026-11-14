"""Cuts one region of the real world out of open geodata for the world probe (src/worldprobe).

The region is a window of the game map (same Mercator projection as tools/geo) at CELLS cells per map pixel, so that
it lines up with locations and borders later. Per cell: height in metres (as measured, and after river erosion), drainage area, water class, forest and
cultivation share.
Rivers go along as lines, because the probe draws them on its own turned grid.

Inputs (all open, fetched into GEO_CACHE on first use):
  - AWS Terrain Tiles, terrarium, zoom 8 (SRTM / GMTED derived), about 430 m per pixel at 45° N
  - Natural Earth 10m: land, lakes, rivers, each with its European supplement (public domain)
  - the game's own 1356 layers: coast, lake and river overrides (data/history/1356), forest and cultivation (public/map/biome.png)
Outputs: public/map/regions/<name>.json (window, rivers) and <name>.bin.gz (the rasters, row by row).

Usage: python3 tools/worldprobe/build_region.py alps
"""
import gzip, io, json, math, os, sys, urllib.request
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'geo'))
from erosion import erode
from common import CACHE, H, LAT_N, LAT_S, LON0, LON1, ROOT, W, lonlat_to_px, lonlat_to_px_np, load_json, lines_from_geojson_geom, polys_from_geojson_geom, px_to_lonlat_np

Image.MAX_IMAGE_PIXELS = None
CELLS = 4
ZOOM = 8
REGIONS = {
    # name: west, south, east, north (degrees)
    'alps': (6.0, 43.0, 15.0, 48.6),
}
TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/{name}.geojson'
SEA, LAKE = 1, 2


def cached(url, path):
    """The bytes behind `url`, kept in the cache folder."""
    full = os.path.join(CACHE, path)
    if not os.path.exists(full):
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'worldprobe'}), timeout=120) as r:
            data = r.read()
        with open(full, 'wb') as f:
            f.write(data)
    with open(full, 'rb') as f:
        return f.read()


def natural_earth(name):
    return json.loads(cached(NE.format(name=name), f'{name}.geojson'))['features']


def elevation(lon, lat):
    """Metres above sea level at arrays of lon/lat, from terrarium tiles, bilinear."""
    n = 2 ** ZOOM
    tx = (lon + 180) / 360 * n
    ty = (1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2 * n
    x0, x1, y0, y1 = int(tx.min()), int(tx.max()), int(ty.min()), int(ty.max())
    mosaic = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), np.float32)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            a = np.asarray(Image.open(io.BytesIO(cached(TILES.format(z=ZOOM, x=x, y=y), f'terrarium/{ZOOM}_{x}_{y}.png'))).convert('RGB'), dtype=np.float32)
            mosaic[(y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    return ndimage.map_coordinates(mosaic, [(ty - y0) * 256 - 0.5, (tx - x0) * 256 - 0.5], order=1, mode='nearest')


def read_rivers(area, water, drawn, km):
    """
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
    clear, stream = away * km > CLEAR_KM, (area >= RIVER_FROM * 1e6) & (water == 0)
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
            if beside * km > 2 * CLEAR_KM: path = path[:-beside]; break
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
    west, south, east, north = REGIONS[name]
    px0, py0 = (int(math.floor(v)) for v in lonlat_to_px(west, north))
    px1, py1 = (int(math.ceil(v)) for v in lonlat_to_px(east, south))
    w, h = (px1 - px0) * CELLS, (py1 - py0) * CELLS
    # cell centres in map pixels and in degrees
    mx, my = np.meshgrid(px0 + (np.arange(w) + 0.5) / CELLS, py0 + (np.arange(h) + 0.5) / CELLS)
    lon, lat = px_to_lonlat_np(mx, my)
    height = elevation(lon, lat)
    meta_km = float(np.mean(np.cos(np.radians(lat))) * (LON1 - LON0) / W * 111.32 / CELLS)

    def to_cell(lo, la):
        x, y = lonlat_to_px(lo, la)
        return (x - px0) * CELLS, (y - py0) * CELLS

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

    land = mask(polys(near(natural_earth('ne_10m_land'))))
    lake = mask(polys(near(natural_earth('ne_10m_lakes')))) | mask(polys(near(natural_earth('ne_10m_lakes_europe'))))
    # the coast and the lakes of 1356 where they differ from today's
    ov = load_json(os.path.join(ROOT, 'data', 'history', '1356', 'terrain_overrides.json'), {}) or {}
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
    for k in range(1, count + 1):
        m = labels == k
        height[m] = np.percentile(height[m], 10)
    height[water == SEA] = 0
    height = np.where(water == 0, np.maximum(height, 1), height)

    # the same land after river erosion: clean valleys and ridges, the broad shape kept (see erosion.py)
    shaped, area = erode(height, water != 0, meta_km * 1000)

    # forest and cultivation of 1356 from the game's biome layer (half map resolution: G forest, B cultivation)
    biome = np.asarray(Image.open(os.path.join(ROOT, 'public', 'map', 'biome.png')).convert('RGBA'))
    by, bx = my / 2 - 0.5, mx / 2 - 0.5
    forest = ndimage.map_coordinates(biome[..., 1].astype(np.float32), [by, bx], order=1, mode='nearest')
    crops = ndimage.map_coordinates(biome[..., 2].astype(np.float32), [by, bx], order=1, mode='nearest')

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
    rivers += read_rivers(area, water, rivers, meta_km)

    out = os.path.join(ROOT, 'public', 'map', 'regions'); os.makedirs(out, exist_ok=True)
    meta = {'name': name, 'w': w, 'h': h, 'x0': px0, 'y0': py0, 'cells': CELLS, 'mapW': W, 'mapH': H,
            'lon0': LON0, 'lon1': LON1, 'latN': LAT_N, 'latS': LAT_S,
            'kmPerCell': round(meta_km, 4),
            'layers': ['height:i16', 'shaped:i16', 'drainage:u8', 'water:u8', 'forest:u8', 'crops:u8'], 'rivers': rivers}
    with open(os.path.join(out, f'{name}.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, separators=(',', ':'))
    with gzip.open(os.path.join(out, f'{name}.bin.gz'), 'wb', compresslevel=9) as f:
        f.write(np.clip(np.round(height), -500, 9000).astype('<i2').tobytes())
        f.write(np.clip(np.round(shaped), -500, 9000).astype('<i2').tobytes())
        # drainage area in km² as a logarithm: 16 steps per doubling
        f.write(np.clip(np.round(16 * np.log2(area / 1e6 + 1)), 0, 255).astype(np.uint8).tobytes())
        f.write(water.tobytes())
        f.write(np.clip(np.round(forest), 0, 255).astype(np.uint8).tobytes())
        f.write(np.clip(np.round(crops), 0, 255).astype(np.uint8).tobytes())
    print(f'{name}: {w} x {h} cells, {meta["kmPerCell"]} km per cell, height {height.min():.0f} … {height.max():.0f} m, '
          f'sea {np.mean(water == SEA):.1%}, lakes {count}, rivers {len(rivers)}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'alps')
