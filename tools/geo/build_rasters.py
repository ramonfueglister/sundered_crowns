"""Stage A: base rasters (elevation, land/water, lakes, rivers, deserts, 1356 overrides).

Inputs (public-domain / open):
  - Natural Earth 10m land, lakes, rivers, geography regions (public domain)
  - AWS Terrain Tiles (terrarium, zoom 6) – SRTM/GMTED/ETOPO1 derived, open data
Outputs: CACHE/stage/*.npy
"""
import os, glob, json, math
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from common import *

STAGE = os.path.join(CACHE, 'stage'); os.makedirs(STAGE, exist_ok=True)
Image.MAX_IMAGE_PIXELS = None

def build_height():
    Z = 6; X0, X1, Y0, Y1 = 14, 44, 13, 39
    tw = (X1 - X0 + 1) * 256; th = (Y1 - Y0 + 1) * 256
    mosaic = np.zeros((th, tw), np.float32)
    for x in range(X0, X1 + 1):
        for y in range(Y0, Y1 + 1):
            p = os.path.join(CACHE, 'terrarium', f'6_{x}_{y}.png')
            a = np.asarray(Image.open(p).convert('RGB'), dtype=np.float32)
            h = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
            mosaic[(y - Y0) * 256:(y - Y0 + 1) * 256, (x - X0) * 256:(x - X0 + 1) * 256] = h
    # map our pixels to mosaic pixels
    xs = np.arange(W) + 0.5; ys = np.arange(H) + 0.5
    lon, _ = px_to_lonlat_np(xs, np.zeros_like(xs))
    _, lat = px_to_lonlat_np(np.zeros_like(ys), ys)
    n = 2 ** Z * 256
    tx = (lon + 180) / 360 * n - X0 * 256 - 0.5
    Ym = np.arcsinh(np.tan(np.radians(lat)))
    ty = (1 - Ym / math.pi) / 2 * n - Y0 * 256 - 0.5
    TX, TY = np.meshgrid(tx, ty)
    hgt = ndimage.map_coordinates(mosaic, [TY.ravel(), TX.ravel()], order=1, mode='nearest').reshape(H, W).astype(np.float32)
    np.save(os.path.join(STAGE, 'height.npy'), hgt)
    return hgt

def rasterize_polys(features, value=1, size=(W, H), filt=None, holes=True):
    img = Image.new('L', size, 0); d = ImageDraw.Draw(img)
    for f in features:
        if filt and not filt(f):
            continue
        for poly in polys_from_geojson_geom(f['geometry']):
            for i, ring in enumerate(poly):
                pts = [lonlat_to_px(lo, max(min(la, 85), -85)) for lo, la in ring]
                if len(pts) < 3:
                    continue
                d.polygon(pts, fill=(value if i == 0 or not holes else 0))
    return np.asarray(img)

def rasterize_ring_list(rings, size=(W, H)):
    img = Image.new('L', size, 0); d = ImageDraw.Draw(img)
    for ring in rings:
        pts = [lonlat_to_px(lo, la) for lo, la in ring]
        if len(pts) >= 3:
            d.polygon(pts, fill=1)
    return np.asarray(img)

def main():
    hp = os.path.join(STAGE, 'height.npy')
    hgt = np.load(hp) if os.path.exists(hp) else build_height()
    print('height', hgt.shape, hgt.min(), hgt.max())
    land = json.load(open(os.path.join(CACHE, 'ne_10m_land.geojson')))
    landm = rasterize_polys(land['features']).astype(bool)
    lakes = json.load(open(os.path.join(CACHE, 'ne_10m_lakes.geojson')))
    lakem = rasterize_polys(lakes['features'], filt=lambda f: (f['properties'].get('scalerank') or 9) <= 6).astype(bool)
    ov = load_json(os.path.join(ROOT, 'data', 'history', '1356', 'terrain_overrides.json'), {}) or {}
    def rings_of(key):
        out = []
        for item in ov.get(key, []) or []:
            if isinstance(item, dict):
                r = item.get('polygon') or item.get('coords') or item.get('points')
            else:
                r = item
            if r and isinstance(r[0], (list, tuple)) and len(r) >= 3 and isinstance(r[0][0], (int, float)):
                out.append(r)
        return out
    lakes1356 = rasterize_ring_list(rings_of('lakes_1356')).astype(bool) if ov else np.zeros((H, W), bool)
    lakem |= lakes1356
    landm &= ~lakem
    # 1356 coastline differences (Zuiderzee, Lauwerszee, Zwin, inner Wash ...: sea; Grote Waard, Strand: land)
    for e in (ov.get('coast_1356') or []):
        if not isinstance(e, dict) or not e.get('polygon') or len(e['polygon']) < 3: continue
        m = rasterize_ring_list([e['polygon']]).astype(bool)
        if e.get('type') in ('sea', 'lagoon'): landm &= ~m
        elif e.get('type') == 'land': landm |= m & (np.load(os.path.join(STAGE, 'height.npy')) > -15)
    # Caspian Sea & big lakes: water with height below threshold inside land? NE land excludes Caspian already.
    water = ~landm
    # tiny islets (< 4 px) removed, tiny lakes (< 6 px) filled
    lbl, n = ndimage.label(landm)
    sizes = ndimage.sum(np.ones_like(lbl), lbl, index=np.arange(1, n + 1))
    small = np.zeros(n + 1, bool); small[1:] = sizes < 4
    landm[small[lbl]] = False
    lbl, n = ndimage.label(~landm)
    sizes = ndimage.sum(np.ones_like(lbl), lbl, index=np.arange(1, n + 1))
    small = np.zeros(n + 1, bool); small[1:] = sizes < 6
    landm[small[lbl]] = True
    water = ~landm
    # lake vs sea: water components not touching the map edge or connected to ocean = lake
    lbl, n = ndimage.label(water)
    edge = set(np.unique(np.concatenate([lbl[0], lbl[-1], lbl[:, 0], lbl[:, -1]]))) - {0}
    sizes = ndimage.sum(np.ones_like(lbl), lbl, index=np.arange(1, n + 1))
    sea_comp = np.zeros(n + 1, bool)
    for i in range(1, n + 1):
        if i in edge or sizes[i - 1] > 40000:  # big enclosed basins (Caspian, Black Sea if detached) count as sea
            sea_comp[i] = True
    sea = sea_comp[lbl] & water
    lake = water & ~sea
    np.save(os.path.join(STAGE, 'land.npy'), landm)
    np.save(os.path.join(STAGE, 'sea.npy'), sea)
    np.save(os.path.join(STAGE, 'lake.npy'), lake)
    print('land px', landm.sum(), 'sea px', sea.sum(), 'lake px', lake.sum())
    # rivers
    riv = json.load(open(os.path.join(CACHE, 'ne_10m_rivers_lake_centerlines.geojson')))
    img = Image.new('L', (W, H), 0); d = ImageDraw.Draw(img)
    river_lines = []
    for f in riv['features']:
        p = f['properties']; sr = p.get('scalerank') or 10
        if sr > 7 or p.get('featurecla', '').lower().startswith('lake'):
            continue
        name = p.get('name_en') or p.get('name') or ''
        for line in lines_from_geojson_geom(f['geometry']):
            pts = [lonlat_to_px(lo, la) for lo, la in line]
            if len(pts) < 2: continue
            wv = int(max(1, 9 - sr))  # importance 2..8
            d.line(pts, fill=wv, width=1)
            river_lines.append({'name': name, 'rank': int(sr), 'pts': [[round(x, 1), round(y, 1)] for x, y in pts]})
    rivr = np.asarray(img)
    np.save(os.path.join(STAGE, 'river.npy'), rivr)
    os.makedirs(OUT_DATA, exist_ok=True)
    json.dump(river_lines, open(os.path.join(STAGE, 'rivers.json'), 'w'))
    # deserts & regions
    reg = json.load(open(os.path.join(CACHE, 'ne_10m_geography_regions_polys.geojson')))
    des = rasterize_polys(reg['features'], filt=lambda f: f['properties']['FEATURECLA'] == 'Desert', holes=False).astype(bool)
    np.save(os.path.join(STAGE, 'desert_poly.npy'), des)
    imp = rasterize_ring_list(rings_of('impassable')).astype(bool) if ov else np.zeros((H, W), bool)
    marsh = rasterize_ring_list(rings_of('marsh')).astype(bool) if ov else np.zeros((H, W), bool)
    np.save(os.path.join(STAGE, 'impassable_poly.npy'), imp)
    np.save(os.path.join(STAGE, 'marsh_poly.npy'), marsh)
    fb = np.zeros((H, W), np.float32)
    for item in (ov.get('forest_bias') or []):
        if isinstance(item, dict):
            r = item.get('polygon'); v = float(item.get('extra_forest', 0.3))
            if r and len(r) >= 3:
                m = rasterize_ring_list([r]).astype(bool); fb[m] = np.maximum(fb[m], v)
    np.save(os.path.join(STAGE, 'forest_bias.npy'), fb)
    print('done stage A')

if __name__ == '__main__':
    main()
