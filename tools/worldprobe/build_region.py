"""Cuts one region of the real world out of open geodata for the world probe (src/worldprobe).

The region is a window of the game map (same Mercator projection as tools/geo) at CELLS cells per map pixel, so that
it lines up with locations and borders later. Per cell: height in metres, water class, forest and cultivation share.
Rivers go along as lines, because the probe draws them on its own turned grid.

Inputs (all open, fetched into GEO_CACHE on first use):
  - AWS Terrain Tiles, terrarium, zoom 8 (SRTM / GMTED derived), about 430 m per pixel at 45° N
  - Natural Earth 10m: land, lakes, rivers, each with its European supplement (public domain)
  - the game's own 1356 layers: coast and lake overrides (data/history/1356), forest and cultivation (public/map/biome.png)
Outputs: public/map/regions/<name>.json (window, rivers) and <name>.bin.gz (the rasters, row by row).

Usage: python3 tools/worldprobe/build_region.py alps
"""
import gzip, io, json, math, os, sys, urllib.request
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'geo'))
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


def main(name):
    west, south, east, north = REGIONS[name]
    px0, py0 = (int(math.floor(v)) for v in lonlat_to_px(west, north))
    px1, py1 = (int(math.ceil(v)) for v in lonlat_to_px(east, south))
    w, h = (px1 - px0) * CELLS, (py1 - py0) * CELLS
    # cell centres in map pixels and in degrees
    mx, my = np.meshgrid(px0 + (np.arange(w) + 0.5) / CELLS, py0 + (np.arange(h) + 0.5) / CELLS)
    lon, lat = px_to_lonlat_np(mx, my)
    height = elevation(lon, lat)

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

    # forest and cultivation of 1356 from the game's biome layer (half map resolution: G forest, B cultivation)
    biome = np.asarray(Image.open(os.path.join(ROOT, 'public', 'map', 'biome.png')).convert('RGBA'))
    by, bx = my / 2 - 0.5, mx / 2 - 0.5
    forest = ndimage.map_coordinates(biome[..., 1].astype(np.float32), [by, bx], order=1, mode='nearest')
    crops = ndimage.map_coordinates(biome[..., 2].astype(np.float32), [by, bx], order=1, mode='nearest')

    rivers = []
    for source in ('ne_10m_rivers_lake_centerlines', 'ne_10m_rivers_europe'):
        for f in near(natural_earth(source)):
            p = f['properties']
            if str(p.get('featurecla', '')).lower().startswith('lake'): continue
            for line in lines_from_geojson_geom(f['geometry']):
                pts = [[round(v, 1) for v in to_cell(lo, la)] for lo, la in line]
                if len(pts) >= 2: rivers.append({'name': p.get('name_en') or p.get('name') or '', 'rank': int(p.get('scalerank') or 10), 'pts': pts})

    out = os.path.join(ROOT, 'public', 'map', 'regions'); os.makedirs(out, exist_ok=True)
    meta = {'name': name, 'w': w, 'h': h, 'x0': px0, 'y0': py0, 'cells': CELLS, 'mapW': W, 'mapH': H,
            'lon0': LON0, 'lon1': LON1, 'latN': LAT_N, 'latS': LAT_S,
            'kmPerCell': round(float(np.mean(np.cos(np.radians(lat))) * 170 / W * 111.32 / CELLS), 4),
            'layers': ['height:i16', 'water:u8', 'forest:u8', 'crops:u8'], 'rivers': rivers}
    with open(os.path.join(out, f'{name}.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, separators=(',', ':'))
    with gzip.open(os.path.join(out, f'{name}.bin.gz'), 'wb', compresslevel=9) as f:
        f.write(np.clip(np.round(height), -500, 9000).astype('<i2').tobytes())
        f.write(water.tobytes())
        f.write(np.clip(np.round(forest), 0, 255).astype(np.uint8).tobytes())
        f.write(np.clip(np.round(crops), 0, 255).astype(np.uint8).tobytes())
    print(f'{name}: {w} x {h} cells, {meta["kmPerCell"]} km per cell, height {height.min():.0f} … {height.max():.0f} m, '
          f'sea {np.mean(water == SEA):.1%}, lakes {count}, rivers {len(rivers)}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'alps')
