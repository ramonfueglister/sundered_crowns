"""Stage L0: crop the Caloric Suitability Index raster to the map window.

Source: Galor, O., Özak, Ö. (2015). Caloric Suitability Index - Data (v1.0) [data set]. Zenodo.
https://doi.org/10.5281/zenodo.14714917, licence CC BY-SA 4.0.
Paper: Galor, O., Özak, Ö. (2016). The Agricultural Origins of Time Preference. AER 106(10), 3064-3103.

The cloud build environment cannot reach zenodo.org. This step therefore runs wherever the raster can be downloaded
and writes a lossless crop of it into the repository (tools/geo/data/csi/); build_land.py derives the land
productivity per place from that crop. Nothing is resampled or rescaled here: the crop holds the source cells as they
are, with every no-data cell written as NaN.

Usage:
  python3 build_csi_crop.py --csi pre1500MaximumCalories.tif [--csi0 pre1500MaximumCalories0.tif]

--csi   raster that keeps cells of zero yield (file name without the trailing 0)
--csi0  the variant that drops them; only compared against --csi, and exported as well if the two disagree on
        cells where both hold a value
"""
import argparse, datetime, gzip, hashlib, json, os, sys
import numpy as np
from common import LON0, LON1, LAT_N, LAT_S, ROOT

OUT = os.path.join(ROOT, 'tools', 'geo', 'data', 'csi')
MARGIN = 2  # cells kept around the map window
RECORD = 'https://zenodo.org/records/14714917'

T_SCALE, T_TIE, T_MATRIX, T_GEOKEYS, T_NODATA = 33550, 33922, 34264, 34735, 42113

# (name, lat, lon): printed so that the georeferencing can be checked by eye
SAMPLES = [
    ('London', 51.5, -0.1), ('Norfolk', 52.7, 1.0), ('Paris basin', 48.85, 2.35), ('Po valley', 45.1, 10.5),
    ('Alps, Bernina', 46.4, 9.9), ('Castile', 41.7, -4.7), ('Novgorod', 58.5, 31.3), ('Kyiv', 50.45, 30.5),
    ('Nile delta', 30.9, 31.1), ('Cairo', 30.05, 31.25), ('Sahara, Murzuq', 25.9, 13.9), ('Baghdad', 33.3, 44.4),
    ('Iceland interior', 64.8, -18.5), ('Mid-Atlantic', 40.0, -35.0), ('North Sea', 56.0, 3.0),
]


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def read_tiff(path):
    """Return (array, tags) of the first image in a TIFF. Pillow first, tifffile if Pillow cannot decode it."""
    try:
        from PIL import Image
        Image.MAX_IMAGE_PIXELS = None
        im = Image.open(path)
        tags = {int(k): im.tag_v2[k] for k in im.tag_v2}
        return np.asarray(im), tags, 'Pillow'
    except Exception as e:  # noqa: BLE001 - any decoder failure falls through to tifffile
        print('Pillow could not read %s (%s), trying tifffile' % (os.path.basename(path), e))
        import tifffile
        with tifffile.TiffFile(path) as tf:
            page = tf.pages[0]
            return page.asarray(), {int(t.code): t.value for t in page.tags}, 'tifffile'


def as_floats(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return [float(v)]
    return [float(x) for x in v]


def georef(tags, shape):
    """Top-left corner (x0, y0) and cell size (sx, sy) in degrees, y0 north, rows running south."""
    h, w = shape
    scale, tie, keys = as_floats(tags.get(T_SCALE)), as_floats(tags.get(T_TIE)), tags.get(T_GEOKEYS)
    info = {'pixel_scale': scale, 'tiepoint': tie, 'matrix': as_floats(tags.get(T_MATRIX)), 'raster_type': None,
            'geographic_type': None, 'assumed': False}
    if keys is not None:
        k = [int(x) for x in keys]
        for i in range(4, len(k) - 3, 4):
            if k[i] == 1025: info['raster_type'] = k[i + 3]      # 1 PixelIsArea, 2 PixelIsPoint
            if k[i] == 2048: info['geographic_type'] = k[i + 3]  # 4326 WGS 84
    if scale and tie and len(tie) >= 6:
        sx, sy = scale[0], scale[1]
        x0 = tie[3] - tie[0] * sx
        y0 = tie[4] + tie[1] * sy
        if info['raster_type'] == 2:  # the tiepoint names a cell centre
            x0 -= sx / 2; y0 += sy / 2
    elif (h, w) == (2160, 4320):
        sx = sy = 1.0 / 12.0; x0, y0 = -180.0, 90.0; info['assumed'] = True
    else:
        sys.exit('no georeferencing tags and not a global 5 arc-minute grid: %s' % (shape,))
    info.update({'x0': x0, 'y0': y0, 'sx': sx, 'sy': sy})
    return info


def nodata_value(tags):
    v = tags.get(T_NODATA)
    if v is None:
        return None
    if isinstance(v, bytes):
        v = v.decode('ascii', 'replace')
    if isinstance(v, (tuple, list)):
        v = v[0]
    try:
        return float(str(v).strip().strip('\x00'))
    except ValueError:
        return None


def clean(arr, nd):
    """float32 copy with every no-data cell as NaN."""
    a = np.array(arr, dtype=np.float32)
    if nd is not None and not np.isnan(nd):
        a[np.asarray(arr) == arr.dtype.type(nd)] = np.nan
    a[~np.isfinite(a)] = np.nan
    return a


def describe(name, a):
    fin = np.isfinite(a)
    v = a[fin]
    pos = v[v > 0]
    out = {'cells': int(a.size), 'nodata': int(a.size - fin.sum()), 'negative': int((v < 0).sum()),
           'zero': int((v == 0).sum()), 'positive': int(pos.size)}
    if pos.size:
        q = np.percentile(pos, [1, 25, 50, 75, 99])
        out.update({'min_positive': float(pos.min()), 'max': float(pos.max()), 'mean_positive': float(pos.mean()),
                    'p01': float(q[0]), 'p25': float(q[1]), 'p50': float(q[2]), 'p75': float(q[3]), 'p99': float(q[4]),
                    'integer_valued': bool(np.all(pos == np.round(pos)))})
    print('  %s: %s' % (name, json.dumps(out)))
    return out


def sample(a, g, lat, lon):
    c = int(np.floor((lon - g['x0']) / g['sx'])); r = int(np.floor((g['y0'] - lat) / g['sy']))
    if 0 <= r < a.shape[0] and 0 <= c < a.shape[1]:
        return float(a[r, c])
    return None


def load(path):
    arr, tags, reader = read_tiff(path)
    if arr.ndim != 2:
        sys.exit('%s: expected one band, got shape %s' % (path, arr.shape))
    g = georef(tags, arr.shape)
    nd = nodata_value(tags)
    print('%s' % os.path.basename(path))
    print('  bytes %d, sha256 %s, reader %s' % (os.path.getsize(path), sha256(path), reader))
    print('  shape %s, dtype %s, nodata tag %r' % (arr.shape, arr.dtype, tags.get(T_NODATA)))
    print('  georef %s' % json.dumps(g))
    raw_nd = int((np.asarray(arr) == arr.dtype.type(nd)).sum()) if nd is not None and not np.isnan(nd) else 0
    print('  cells equal to the nodata tag: %d, non-finite cells: %d' % (raw_nd, int((~np.isfinite(arr)).sum())))
    a = clean(arr, nd)
    stats = describe('whole raster', a)
    return a, g, {'file': os.path.basename(path), 'bytes': os.path.getsize(path), 'sha256': sha256(path),
                  'width': int(arr.shape[1]), 'height': int(arr.shape[0]), 'dtype': str(arr.dtype),
                  'nodata_tag': None if tags.get(T_NODATA) is None else str(tags.get(T_NODATA)), 'georef': g,
                  'stats': stats}


def window(g, shape):
    h, w = shape
    c0 = max(0, int(np.floor((LON0 - g['x0']) / g['sx'])) - MARGIN)
    c1 = min(w, int(np.ceil((LON1 - g['x0']) / g['sx'])) + MARGIN)
    r0 = max(0, int(np.floor((g['y0'] - LAT_N) / g['sy'])) - MARGIN)
    r1 = min(h, int(np.ceil((g['y0'] - LAT_S) / g['sy'])) + MARGIN)
    return r0, r1, c0, c1


def export(a, g, meta, stem):
    r0, r1, c0, c1 = window(g, a.shape)
    crop = np.ascontiguousarray(a[r0:r1, c0:c1]).astype('<f4')
    os.makedirs(OUT, exist_ok=True)
    bin_path = os.path.join(OUT, stem + '.f32.gz')
    with open(bin_path, 'wb') as raw:  # mtime 0 keeps the file byte-identical between runs
        with gzip.GzipFile(filename='', fileobj=raw, mode='wb', compresslevel=9, mtime=0) as f:
            f.write(crop.tobytes())
    print('crop of %s: rows %d..%d, cols %d..%d' % (meta['file'], r0, r1, c0, c1))
    side = {
        'source': {
            'dataset': 'Galor, O., Özak, Ö. (2015). Caloric Suitability Index - Data (v1.0). Zenodo.',
            'doi': '10.5281/zenodo.14714917',
            'url': RECORD + '/files/' + meta['file'],
            'paper': 'Galor, O., Özak, Ö. (2016). The Agricultural Origins of Time Preference. '
                     'American Economic Review 106(10), 3064-3103.',
            'licence': 'CC BY-SA 4.0',
            'downloaded': datetime.date.today().isoformat(),
        },
        'raster': meta,
        'crop': {'file': stem + '.f32.gz', 'encoding': 'gzip, float32 little-endian, row-major, NaN = no data',
                 'row0': r0, 'col0': c0, 'width': int(crop.shape[1]), 'height': int(crop.shape[0]),
                 'lon0': g['x0'] + c0 * g['sx'], 'lat0': g['y0'] - r0 * g['sy'], 'cell_lon': g['sx'],
                 'cell_lat': g['sy'], 'stats': describe('crop', crop)},
    }
    with open(os.path.join(OUT, stem + '.json'), 'w', encoding='utf-8') as f:
        json.dump(side, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('wrote %s (%d bytes) and %s.json' % (bin_path, os.path.getsize(bin_path), stem))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--csi', required=True)
    ap.add_argument('--csi0')
    args = ap.parse_args()

    a, g, meta = load(args.csi)
    b = gb = metab = None
    if args.csi0:
        b, gb, metab = load(args.csi0)

    print('samples (lat, lon): value in --csi%s' % (' | --csi0' if b is not None else ''))
    for name, lat, lon in SAMPLES:
        row = '  %-18s %6.2f %7.2f  %s' % (name, lat, lon, sample(a, g, lat, lon))
        if b is not None:
            row += ' | %s' % sample(b, gb, lat, lon)
        print(row)

    differ = False
    if b is not None:
        if b.shape != a.shape or any(abs(g[k] - gb[k]) > 1e-9 for k in ('x0', 'y0', 'sx', 'sy')):
            print('comparison: the two rasters do not share one grid')
            differ = True
        else:
            fa, fb = np.isfinite(a), np.isfinite(b)
            both = fa & fb
            diff = np.abs(a[both] - b[both])
            only_a = fa & ~fb
            cmp = {'both_valid': int(both.sum()), 'both_valid_and_different': int((diff > 0).sum()),
                   'max_abs_difference': float(diff.max()) if diff.size else 0.0,
                   'valid_only_in_csi': int(only_a.sum()), 'of_which_zero': int((a[only_a] == 0).sum()),
                   'of_which_positive': int((a[only_a] > 0).sum()), 'valid_only_in_csi0': int((fb & ~fa).sum()),
                   'zero_in_csi0': int((b[fb] == 0).sum())}
            print('comparison --csi against --csi0: %s' % json.dumps(cmp))
            differ = cmp['both_valid_and_different'] > 0 or cmp['of_which_positive'] > 0 or cmp['valid_only_in_csi0'] > 0

    export(a, g, meta, 'pre1500_max')
    if b is not None and differ:
        export(b, gb, metab, 'pre1500_max0')
    elif b is not None:
        print('--csi0 holds the same values wherever it has data; only --csi is exported')


if __name__ == '__main__':
    main()
