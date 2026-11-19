"""Research data for the empire-expansion study (doc "Forschungsplan: Besseres Modell für Reichsausdehnung"):
which Cliopatria polity holds each land place of the map in each year from FIRST to LAST.

Source: Cliopatria v0.2.1 (Bennett et al. 2025, Scientific Data, doi 10.1038/s41597-025-04516-9), CC BY 4.0, the same
file as tools/history/borders/cliopatria_places.py (see data/history/borders/README.md for its SHA-256). A place
belongs to a row when its centre lies inside the row's polygons. Where several rows cover a place in one year,
the place goes to the row with the smallest area (the most specific polity) and `top` follows MemberOf up to a row
that is no member of another. Output (not committed, large): <out>/owners.npz with
  years (Y), places (P place ids), own (Y x P int16, -1 = no polity), top (Y x P int16), names (polity names);
<out>/owners_line.npz the same with lineage ids (lineage.py), which every score of the study uses.

    python3 tools/research/expansion/prep_owners.py <cliopatria.geojson> <out dir>
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
from lineage import lineages
from shapely import STRtree, prepare
from shapely.geometry import Point, shape

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
FIRST, LAST = 900, 1848


def main(path, out):
    geo = json.loads(Path(ROOT, 'public', 'data', 'geo.json').read_text(encoding='utf-8'))
    ext = json.loads(Path(ROOT, 'data', 'content', 'world_extent.json').read_text(encoding='utf-8'))
    L = geo['L']
    lon = np.array(geo['loc']['lon'][:L])
    lat = np.array(geo['loc']['lat'][:L])
    inside = (lon >= ext['west']) & (lon <= ext['east']) & (lat >= ext['south']) & (lat <= ext['north'])
    ids = np.nonzero(inside)[0]
    tree = STRtree([Point(float(lon[i]), float(lat[i])) for i in ids])
    src = json.loads(Path(path).read_text(encoding='utf-8'))
    names, idx = [], {}
    rows = []
    for f in src['features']:
        p = f['properties']
        if p.get('Type') != 'POLITY':
            continue
        a, b = int(p['FromYear']), int(p['ToYear'])
        if b < FIRST or a > LAST:
            continue
        g = shape(f['geometry'])
        if g.is_empty:
            continue
        prepare(g)
        hit = tree.query(g, predicate='contains_properly')
        if len(hit) == 0:
            continue
        n = p['Name']
        if n not in idx:
            idx[n] = len(names)
            names.append(n)
        rows.append((max(a, FIRST), min(b, LAST), idx[n], float(p.get('Area') or 0), p.get('MemberOf') or '', hit))
    Y = LAST - FIRST + 1
    own = np.full((Y, len(ids)), -1, np.int16)
    best = np.full((Y, len(ids)), np.inf)
    for a, b, k, area, _m, hit in rows:
        for y in range(a - FIRST, b - FIRST + 1):
            better = area < best[y, hit]
            own[y, hit[better]] = k
            best[y, hit[better]] = area
    member = {}  # (polity, year) -> polity it is a member of
    for a, b, k, _area, m, _hit in rows:
        if m and m in idx:
            for y in range(a, b + 1):
                member[(k, y)] = idx[m]
    top = own.copy()
    for y in range(Y):
        yr = y + FIRST
        for k in np.unique(own[y]):
            if k < 0:
                continue
            t, seen = int(k), set()
            while (t, yr) in member and t not in seen:
                seen.add(t)
                t = member[(t, yr)]
            if t != k:
                top[y, own[y] == k] = t
    os.makedirs(out, exist_ok=True)
    np.savez_compressed(
        os.path.join(out, 'owners.npz'),
        years=np.arange(FIRST, LAST + 1),
        places=ids,
        own=own,
        top=top,
        names=np.array(names),
    )
    np.savez_compressed(
        os.path.join(out, 'owners_line.npz'),
        years=np.arange(FIRST, LAST + 1),
        places=ids,
        own=lineages(own, names),
        top=lineages(top, names),
        names=np.array(names),
    )
    cov = (own >= 0).mean(axis=1)
    print(
        f'{len(rows)} rows, {len(names)} polities, {len(ids)} places; covered share 1000/1200/1300/1500: '
        f'{cov[1000 - FIRST]:.3f}/{cov[1200 - FIRST]:.3f}/{cov[1300 - FIRST]:.3f}/{cov[1500 - FIRST]:.3f}'
    )


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
