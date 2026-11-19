#!/usr/bin/env python3
# Reads the town plans fetched by osm_fetch.py and writes the form of each town's old core, the part of a real plan
# that the world can take at its scale (docs/wiki/siedlung/gassen.md, "Massstab"): where the market and the main
# church lie from the centre, how far the town wall reaches, and in which directions the main streets leave the core.
#   python3 tools/settlement/osm_read.py <plans dir> <centres.json> <out.json>
# Metres east (x) and south (z) of the OSM place node, as the parcels. Data (c) OpenStreetMap contributors, ODbL.
import gzip
import json
import math
import os
import sys
from pathlib import Path

MAIN = {'trunk', 'primary', 'secondary', 'tertiary'}
CORE = 600  # metres: the core where no wall is mapped. PLACEHOLDER


def xy(lat0, lon0):
    k = math.cos(math.radians(lat0))
    return lambda lat, lon: ((lon - lon0) * 111320 * k, -(lat - lat0) * 111320)


def pts(e, f):
    if 'geometry' in e:
        return [f(p['lat'], p['lon']) for p in e['geometry'] if p]
    if 'lat' in e:
        return [f(e['lat'], e['lon'])]
    if 'members' in e:
        return [f(p['lat'], p['lon']) for m in e['members'] for p in m.get('geometry', []) if p]
    if 'bounds' in e:
        b = e['bounds']
        return [f((b['minlat'] + b['maxlat']) / 2, (b['minlon'] + b['maxlon']) / 2)]
    return []


def area(p):
    return abs(sum(p[i][0] * p[i - 1][1] - p[i - 1][0] * p[i][1] for i in range(len(p)))) / 2 if len(p) > 2 else 0


def mid(p):
    return (sum(q[0] for q in p) / len(p), sum(q[1] for q in p) / len(p))


def town(d):
    c = d['centre']
    f = xy(c['lat'], c['lon'])
    els = d['elements']
    wall = [
        q
        for e in els
        if e.get('tags', {}).get('historic') == 'city_walls' or e.get('tags', {}).get('barrier') == 'city_wall'
        for q in pts(e, f)
    ]
    # the wall: its median distance from the centre, if enough of it is mapped round the centre
    r_wall = None
    if len(wall) >= 8:
        sides = {int((math.atan2(z, x) + math.pi) / (math.pi / 4)) % 8 for x, z in wall if math.hypot(x, z) < 1400}
        if len(sides) >= 5:
            r_wall = sorted(math.hypot(x, z) for x, z in wall)[len(wall) // 2]
    core = r_wall or CORE
    out = {'osm': c.get('osm'), 'name': c.get('name'), 'wall': round(r_wall) if r_wall else None, 'core': round(core)}
    # the market: a market place, else a square, nearest the centre within the core
    best = None
    for kind, test in (
        ('marketplace', lambda t: t.get('amenity') == 'marketplace'),
        ('square', lambda t: t.get('place') == 'square'),
    ):
        for e in els:
            t = e.get('tags', {})
            if not test(t):
                continue
            p = pts(e, f)
            if not p:
                continue
            m = mid(p)
            r = math.hypot(*m)
            if r <= core and (best is None or r < best[2]):
                best = (kind, m, r, t.get('name'), area(p))
        if best:
            break
    out['market'] = (
        {'kind': best[0], 'x': round(best[1][0]), 'z': round(best[1][1]), 'name': best[3], 'area': round(best[4])}
        if best
        else None
    )
    # the main church: the largest place of worship (mapped as an area) within the core
    big = None
    for e in els:
        t = e.get('tags', {})
        if t.get('amenity') != 'place_of_worship':
            continue
        p = pts(e, f)
        if not p:
            continue
        m = mid(p)
        if math.hypot(*m) <= core and (big is None or area(p) > big[1]):
            big = (m, area(p), t.get('name'), t.get('religion'))
    out['church'] = (
        {'x': round(big[0][0]), 'z': round(big[0][1]), 'area': round(big[1]), 'name': big[2], 'religion': big[3]}
        if big
        else None
    )
    # the main streets: where the ways of the main road classes cross the edge of the core, by direction (8 sectors)
    crossing = {}
    for e in els:
        t = e.get('tags', {})
        if t.get('highway') not in MAIN or 'geometry' not in e:
            continue
        p = pts(e, f)
        for a, b in zip(p, p[1:]):
            ra, rb = math.hypot(*a), math.hypot(*b)
            if (ra - core) * (rb - core) > 0:
                continue
            s = (core - ra) / (rb - ra) if rb != ra else 0
            x, z = a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1])
            sec = int(((math.degrees(math.atan2(-z, x)) + 360 + 22.5) % 360) // 45)  # 0 east, 2 north, 4 west, 6 south
            crossing[sec] = crossing.get(sec, 0) + 1
    out['ways'] = {['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'][k]: n for k, n in sorted(crossing.items())}
    out['elements'] = len(els)
    return out


def main():
    plans, centres, dst = sys.argv[1], json.loads(Path(sys.argv[2]).read_text()), sys.argv[3]
    res = {}
    for site, c in centres.items():
        path = os.path.join(plans, f'{site}.json.gz')
        if not os.path.exists(path):
            res[site] = {'name': c['name'], 'missing': True}
            continue
        with gzip.open(path, 'rt') as fh:
            d = json.load(fh)
        res[site] = {
            'town': c['name'],
            'named': bool(c.get('candidates') and c['candidates'][0].get('named')),
            **town(d),
        }
    out = {
        'about': 'The form of the old core of the large towns of 1291 read from OpenStreetMap (c) OpenStreetMap contributors, ODbL, by tools/settlement/osm_read.py. Metres east (x) and south (z) of the OSM place node.',
        'towns': res,
    }
    Path(dst).write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(
        len(res),
        'towns;',
        sum(1 for r in res.values() if r.get('market')),
        'with a market,',
        sum(1 for r in res.values() if r.get('wall')),
        'with a wall',
    )


main()
