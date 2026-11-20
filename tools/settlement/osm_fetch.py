#!/usr/bin/env python3
# Fetches from OpenStreetMap (Overpass API) the streets, squares, market places, churches and town walls round the
# centre of each large town of 1291, for the real plans of settlement feature 3. Runs where overpass-api.de is
# reachable (not in the cloud environment): python3 osm_fetch.py towns.json out_dir
# towns.json: [{site, name, lat, lon, ...}]. Writes out_dir/<site>.json.gz (the raw Overpass answer plus the centre
# chosen) and out_dir/centres.json. Stdlib only. Data (c) OpenStreetMap contributors, ODbL.
import gzip
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
R = 1500  # metres round the centre
FIND = 60000  # metres round the gazetteer point in which the town's place node is looked for (the gazetteer point of Cairo lies 25 km off)
UA = 'sundered-crowns-research/1.0'


def ask(q):
    for attempt in range(6):
        for url in SERVERS:
            try:
                req = urllib.request.Request(
                    url, data=urllib.parse.urlencode({'data': q}).encode(), headers={'User-Agent': UA}
                )
                with urllib.request.urlopen(req, timeout=200) as r:
                    return json.loads(r.read())
            except Exception as e:
                print('  retry', url, e, flush=True)
                time.sleep(10 * (attempt + 1))
    raise RuntimeError('overpass failed')


def dist(a, b, c, d):
    k = math.cos(math.radians((a + c) / 2))
    return math.hypot((a - c) * 111320, (b - d) * 111320 * k)


def centre(t):
    q = f'[out:json][timeout:60];node[place~"^(city|town)$"](around:{FIND},{t["lat"]},{t["lon"]});out body;'
    els = ask(q)['elements']
    want = t['name'].lower()

    def score(e):
        tags = e.get('tags', {})
        named = any(
            v.lower() == want
            for k, v in tags.items()
            if k == 'name' or k.startswith('name:') or k in ('int_name', 'old_name', 'alt_name')
        )
        try:
            pop = float(tags.get('population', '0').replace(',', '').replace(' ', ''))
        except ValueError:
            pop = 0
        return (named, tags.get('place') == 'city', pop, -dist(t['lat'], t['lon'], e['lat'], e['lon']))

    if not els:
        return None, []
    best = max(els, key=score)
    if not score(best)[0]:
        return None, [
            {'id': e['id'], 'name': e.get('tags', {}).get('name'), 'lat': e['lat'], 'lon': e['lon']} for e in els[:5]
        ]  # no place of that name: no plan (a lost town such as Sarai)
    return best, [
        {
            'id': e['id'],
            'name': e.get('tags', {}).get('name'),
            'place': e.get('tags', {}).get('place'),
            'lat': e['lat'],
            'lon': e['lon'],
            'named': score(e)[0],
        }
        for e in sorted(els, key=score, reverse=True)[:5]
    ]


def plan(lat, lon):
    a = f'(around:{R},{lat},{lon})'
    q = f"""[out:json][timeout:180];
(
 way[highway~"^(trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|footway|steps)$"]{a};
 nwr[place=square]{a};
 nwr[amenity=marketplace]{a};
 nwr[amenity=place_of_worship]{a};
 way[historic=city_walls]{a};
 way[barrier=city_wall]{a};
 way[waterway~"^(river|canal)$"]{a};
 nwr[natural=water]{a};
);
out tags geom;"""
    return ask(q)


def main():
    towns = json.loads(Path(sys.argv[1]).read_text())
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    cpath = os.path.join(out, 'centres.json')
    centres = json.loads(Path(cpath).read_text()) if os.path.exists(cpath) else {}
    for i, t in enumerate(towns):
        path = os.path.join(out, f'{t["site"]}.json.gz')
        if os.path.exists(path):
            continue
        best, cands = centre(t)
        time.sleep(2)
        if best is None:
            centres[str(t['site'])] = {'name': t['name'], 'found': None}
            print(i + 1, t['name'], 'no place node', flush=True)
            continue
        data = plan(best['lat'], best['lon'])
        data['centre'] = {
            'lat': best['lat'],
            'lon': best['lon'],
            'osm': best['id'],
            'name': best.get('tags', {}).get('name'),
        }
        with gzip.open(path, 'wt') as f:
            json.dump(data, f)
        centres[str(t['site'])] = {'name': t['name'], 'found': data['centre'], 'candidates': cands}
        Path(cpath).write_text(json.dumps(centres, ensure_ascii=False, indent=1))
        print(i + 1, t['name'], '->', data['centre']['name'], len(data['elements']), 'elements', flush=True)
        time.sleep(3)


main()
