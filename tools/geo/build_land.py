"""Stage L1: land productivity per place from the Caloric Suitability Index (docs/ECONOMY_DESIGN.md, feature 1).

Reads public/map/ids.bin.gz (the place of every map pixel), the crop written by build_csi_crop.py and the outline of
England written by build_england.py, and writes public/data/land.json:

  yield    per place, the mean of the index over the place's land, weighted by ground area. Cells of zero yield count
           as zero; cells without data are left out; null when no cell of the place has data.
  england  the land of England as the calibration of the harvest needs it (src/sim/systems/harvest.ts):
           land   = mean index x area in hectares of the map's land inside the outline
           places = places with at least half of their area inside the outline

Nothing is tuned here. The report printed at the end says how much of the map the index covers.
"""
import gzip, json, os
import numpy as np
from PIL import Image, ImageDraw
from common import LON0, LON1, OUT_DATA, OUT_PUBLIC, ROOT, km_per_px, lonlat_to_px_np, px_to_lonlat_np

DATA = os.path.join(ROOT, 'tools', 'geo', 'data')


def main():
    geo = json.load(open(os.path.join(OUT_DATA, 'geo.json'), encoding='utf-8'))
    names = json.load(open(os.path.join(OUT_DATA, 'world.json'), encoding='utf-8'))['name']
    W, H, L, S = geo['W'], geo['H'], geo['L'], geo['S']
    ids = np.frombuffer(gzip.open(os.path.join(OUT_PUBLIC, 'ids.bin.gz')).read(), dtype='<u2').reshape(H, W)
    meta = json.load(open(os.path.join(DATA, 'csi', 'pre1500_max.json'), encoding='utf-8'))
    crop = meta['crop']
    csi = np.frombuffer(gzip.open(os.path.join(DATA, 'csi', crop['file'])).read(), dtype='<f4').reshape(crop['height'], crop['width'])
    eng = json.load(open(os.path.join(DATA, 'ne', 'england.json'), encoding='utf-8'))

    # every map pixel takes the value of the index cell its centre lies in (a map pixel is about a third of a cell wide)
    lon = LON0 + (np.arange(W) + 0.5) / W * (LON1 - LON0)
    lat = px_to_lonlat_np(np.zeros(H), np.arange(H) + 0.5)[1]
    col = np.floor((lon - crop['lon0']) / crop['cell_lon']).astype(np.int64)
    row = np.floor((crop['lat0'] - lat) / crop['cell_lat']).astype(np.int64)
    assert col.min() >= 0 and col.max() < crop['width'] and row.min() >= 0 and row.max() < crop['height'], 'crop does not cover the map'
    v = csi[row[:, None], col[None, :]]
    has = np.isfinite(v)
    v0 = np.where(has, v, 0.0).astype(np.float64)
    km2 = np.broadcast_to((km_per_px(lat) ** 2)[:, None], ids.shape)  # ground area of a pixel (Mercator)

    N = L + S + 1
    flat = ids.ravel()
    area = np.bincount(flat, weights=km2.ravel(), minlength=N)[1:L + 1]
    covered = np.bincount(flat, weights=(km2 * has).ravel(), minlength=N)[1:L + 1]
    total = np.bincount(flat, weights=(km2 * v0).ravel(), minlength=N)[1:L + 1]
    mean = np.divide(total, covered, out=np.full(L, np.nan), where=covered > 0)

    # England: the outline drawn into the map's pixel grid
    x0, y0, x1, y1 = eng['bbox']
    (px0, px1), (py0, py1) = lonlat_to_px_np([x0, x1], [y1, y0])
    wx0, wy0 = int(np.floor(px0)) - 1, int(np.floor(py0)) - 1
    wx1, wy1 = int(np.ceil(px1)) + 1, int(np.ceil(py1)) + 1
    img = Image.new('L', (wx1 - wx0, wy1 - wy0), 0)
    draw = ImageDraw.Draw(img)
    for poly in eng['polygons']:
        for k, ring in enumerate(poly):  # ring 0 is the outline, further rings are holes
            xs, ys = lonlat_to_px_np([p[0] for p in ring], [p[1] for p in ring])
            draw.polygon([(float(x) - wx0, float(y) - wy0) for x, y in zip(xs, ys)], fill=1 if k == 0 else 0)
    inside = np.zeros(ids.shape, dtype=bool)
    inside[wy0:wy1, wx0:wx1] = np.asarray(img, dtype=bool)
    land = (ids >= 1) & (ids <= L)
    e = inside & land
    e_area = float(km2[e].sum())
    e_cov = float(km2[e & has].sum())
    e_mean = float((km2[e] * v0[e]).sum() / e_cov)
    e_land = e_mean * e_area * 100.0  # index x hectares
    share = np.bincount(flat, weights=(km2 * inside).ravel(), minlength=N)[1:L + 1] / area
    places = [int(i) for i in np.nonzero(share >= 0.5)[0]]

    out = {
        'source': {
            'dataset': meta['source']['dataset'], 'doi': meta['source']['doi'], 'paper': meta['source']['paper'],
            'raster': meta['raster']['file'], 'sha256': meta['raster']['sha256'],
            'licence': 'CC BY-SA 4.0; this file is adapted from the data set and carries the same licence',
        },
        'unit': 'value of the source raster: potential calories per hectare and year of the best crop available '
                'before 1500, rain-fed, low inputs',
        'method': 'mean over the land of each place weighted by ground area; cells of zero yield count as zero; '
                  'cells without data are left out; null: no cell with data',
        'yield': [None if np.isnan(m) else round(float(m), 1) for m in mean],
        'england': {
            'outline': '%s (%s)' % (eng['source']['dataset'], eng['source']['licence']),
            'area_km2': round(e_area, 1), 'mean': round(e_mean, 2), 'land': round(e_land, 0), 'places': places,
        },
    }
    path = os.path.join(OUT_DATA, 'land.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')

    # ---- report
    tot = float(area.sum())
    cover = covered / area
    print('land of the map: %.0f km2 in %d places' % (tot, L))
    print('  with data %.2f %%, of which zero yield %.2f %% of the land' % (
        100 * covered.sum() / tot, 100 * float(km2[land & has & (v == 0)].sum()) / tot))
    print('  places without any data: %d, below 50 %% cover: %d, below 90 %% cover: %d' % (
        int((covered == 0).sum()), int((cover < 0.5).sum()), int((cover < 0.9).sum())))
    for i in np.nonzero(covered == 0)[0]:
        print('    no data: %5d %-24s lat %6.2f lon %7.2f, %5.0f km2' % (i, names[i], geo['loc']['lat'][i], geo['loc']['lon'][i], area[i]))
    ok = ~np.isnan(mean)
    q = np.percentile(mean[ok], [5, 25, 50, 75, 95])
    print('  yield per place: zero in %d places; percentiles 5/25/50/75/95: %s; highest %.0f' % (
        int((mean[ok] == 0).sum()), ' / '.join('%.0f' % x for x in q), mean[ok].max()))
    print('England (outline: %s)' % eng['source']['dataset'])
    print('  outline %.0f km2; map land inside %.0f km2 (%.2f %% of the outline), with data %.2f %%' % (
        eng['area_km2'], e_area, 100 * e_area / eng['area_km2'], 100 * e_cov / e_area))
    print('  mean index %.1f, land %.4g (index x hectares)' % (e_mean, e_land))
    pl = np.array(places)
    print('  places at least half inside: %d, %.0f km2, sum of yield x hectares %.4g (%.2f %% of land)' % (
        len(places), area[pl].sum(), float(np.nansum(mean[pl] * area[pl]) * 100), 100 * float(np.nansum(mean[pl] * area[pl]) * 100) / e_land))
    print('wrote %s (%d bytes)' % (path, os.path.getsize(path)))


if __name__ == '__main__':
    main()
