"""Stage L0b: the outline of England, used to calibrate the harvest on England 1300-09 (docs/ECONOMY_DESIGN.md).

Source: Natural Earth, Admin 0 - Map Units, scale 1:10m (public domain), https://www.naturalearthdata.com/
The map units split the United Kingdom into England, Wales, Scotland and Northern Ireland.

Like build_csi_crop.py this runs where the source can be downloaded; it writes tools/geo/data/ne/england.json.

Usage: python3 build_england.py --map-units ne_10m_admin_0_map_units.geojson
"""
import argparse, datetime, hashlib, json, math, os, sys
from common import ROOT

OUT = os.path.join(ROOT, 'tools', 'geo', 'data', 'ne')
R_KM = 6371.0088  # mean Earth radius


def ring_area_km2(ring):
    """Area enclosed by a ring of (lon, lat) on the sphere (signed)."""
    s = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        s += math.radians(x1 - x0) * (math.sin(math.radians(y0)) + math.sin(math.radians(y1)))
    return s * R_KM * R_KM / 2.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--map-units', required=True)
    args = ap.parse_args()
    raw = open(args.map_units, 'rb').read()
    fc = json.loads(raw)
    feats = fc['features']
    low = lambda p: {k.lower(): v for k, v in p.items()}
    hits = [f for f in feats if 'England' in (low(f['properties']).get(k) for k in ('geounit', 'name', 'name_long', 'subunit'))]
    if len(hits) != 1:
        uk = sorted({str(low(f['properties']).get('geounit')) for f in feats if low(f['properties']).get('admin') == 'United Kingdom'})
        sys.exit('expected one feature named England, found %d; map units of the United Kingdom: %s' % (len(hits), uk))
    f = hits[0]
    g = f['geometry']
    polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
    # 5 decimals are about one metre; the source has no more precision than that
    polys = [[[[round(x, 5), round(y, 5)] for x, y, *_ in ring] for ring in poly] for poly in polys]
    area = sum(abs(ring_area_km2(p[0])) - sum(abs(ring_area_km2(h)) for h in p[1:]) for p in polys)
    xs = [x for p in polys for x, _ in p[0]]; ys = [y for p in polys for _, y in p[0]]
    p = low(f['properties'])
    out = {
        'source': {
            'dataset': 'Natural Earth, Admin 0 - Map Units, 1:10m', 'url': 'https://www.naturalearthdata.com/',
            'licence': 'public domain', 'file': os.path.basename(args.map_units), 'bytes': len(raw),
            'sha256': hashlib.sha256(raw).hexdigest(), 'downloaded': datetime.date.today().isoformat(),
        },
        'properties': {k: p.get(k) for k in ('geounit', 'admin', 'su_a3', 'gu_a3', 'type', 'ne_id')},
        'area_km2': round(area, 1),
        'bbox': [min(xs), min(ys), max(xs), max(ys)],
        'polygons': polys,
    }
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'england.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write('\n')
    print('properties %s' % json.dumps(out['properties']))
    print('polygons %d, vertices %d, area %.0f km2, bbox %s' % (len(polys), sum(len(r) for q in polys for r in q), area, out['bbox']))
    print('source bytes %d, sha256 %s' % (len(raw), out['source']['sha256']))
    print('wrote %s (%d bytes)' % (path, os.path.getsize(path)))


if __name__ == '__main__':
    main()
