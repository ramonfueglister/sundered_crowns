"""Which place of the map lies in which Cliopatria polity, row by row (step 1 of the border feature, doc "Grenzen nach
echten Daten"): data/history/borders/cliopatria_places.json.

Source: Cliopatria (Seshat Global History Databank; Bennett et al. 2025, Scientific Data, doi 10.1038/s41597-025-04516-9),
CC BY 4.0. Each row of Cliopatria is one polity over a range of years (FromYear..ToYear, inclusive) with its polygons.
A place belongs to a row when its centre (public/data/geo.json loc lon/lat) lies inside the row's polygons. Only rows of
Type POLITY that overlap 1291..1848 and the world frame (data/content/world_extent.json) are kept; the polygons are
not stored, only the place ids, the years and the names and ids the row gives.

    python3 tools/history/borders/cliopatria_places.py <cliopatria.geojson>

Needs shapely (2.x).
"""

import json
import os
import sys

import numpy as np
from shapely import STRtree, prepare
from shapely.geometry import Point, shape

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
FIRST, LAST = 1291, 1848


def main(path):
    geo = json.load(open(os.path.join(ROOT, 'public', 'data', 'geo.json'), encoding='utf-8'))
    ext = json.load(open(os.path.join(ROOT, 'data', 'content', 'world_extent.json'), encoding='utf-8'))
    L = geo['L']
    lon = np.array(geo['loc']['lon'][:L])
    lat = np.array(geo['loc']['lat'][:L])
    inside = (lon >= ext['west']) & (lon <= ext['east']) & (lat >= ext['south']) & (lat <= ext['north'])
    ids = np.nonzero(inside)[0]
    points = [Point(float(lon[i]), float(lat[i])) for i in ids]
    tree = STRtree(points)
    src = json.load(open(path, encoding='utf-8'))
    rows, skipped = [], {'type': 0, 'years': 0, 'frame': 0}
    for f in src['features']:
        p = f['properties']
        if p.get('Type') != 'POLITY':
            skipped['type'] += 1
            continue
        a, b = int(p['FromYear']), int(p['ToYear'])
        if b < FIRST or a > LAST:
            skipped['years'] += 1
            continue
        g = shape(f['geometry'])
        prepare(g)
        hit = [int(ids[k]) for k in tree.query(g, predicate='contains_properly')] if not g.is_empty else []
        if not hit:
            skipped['frame'] += 1
            continue
        rows.append(
            {
                'name': p.get('Name'),
                'wikidata': p.get('Wikidata') or '',
                'wikipedia': p.get('Wikipedia') or '',
                'from': a,
                'to': b,
                'memberOf': p.get('MemberOf') or '',
                'places': sorted(hit),
            }
        )
    rows.sort(key=lambda r: (r['name'] or '', r['from']))
    out = {
        'source': 'Cliopatria (Seshat Global History Databank), Bennett et al. 2025, Scientific Data, '
        'doi:10.1038/s41597-025-04516-9, CC BY 4.0',
        'file': os.path.basename(path),
        'years': [FIRST, LAST],
        'frame': ext,
        'rule': 'place centre inside the row polygons',
        'rows': rows,
        'skipped': skipped,
    }
    dst = os.path.join(ROOT, 'data', 'history', 'borders', 'cliopatria_places.json')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, 'w', encoding='utf-8') as fo:
        json.dump(out, fo, ensure_ascii=False, separators=(',', ':'))
    n = sum(len(r['places']) for r in rows)
    print(
        f'{len(rows)} rows, {len(set(r["name"] for r in rows))} polities, {n} place-rows, {inside.sum()} places in the frame; skipped {skipped}'
    )


if __name__ == '__main__':
    main(sys.argv[1])
