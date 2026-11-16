"""The towns of a start year for the world graphic: people of the time per place of the gazetteer
(data/content/gazetteer.json), the towns settle.ts (src/worldprobe) builds. Writes public/data/towns_<year>.json:
`people[k]` belongs to gazetteer place k, null where nothing is known (settle.ts then takes the people of its size);
`place[k]` is the place of the map it lies in.

  1. a city Chandler gives for the year (data/history/<year>/chandler_<year>.json, tools/history/1291/chandler.py):
     its value, at the gazetteer place it stands at;
  2. any other place with an estimate for 1356 (pop1356): that times the factor of its region in
     data/history/<year>/demography.json. ASSUMPTION: a town lost as large a share in the Black Death as its land
     (no town-by-town source read for these places).

The world counts heads at 1:100 (src/sim/scale.ts); settle.ts divides by 100 (PEOPLE_PER_PERSON), the simulation by
SCALE, so a town of the picture and its place in the simulation count with the same factor. build.py lifts a place of
the map that would hold fewer people than its towns to their sum (`towns_by_place`).

Run: python3 tools/history/1291/towns.py [year]   (build.py imports it for the setup)
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))


def factor_of(regions, lon, lat):
    for r in regions:
        x0, y0, x1, y1 = r['box']
        if x0 <= lon <= x1 and y0 <= lat <= y1: return r['factor']
    return 1.0


def towns(year=1291):
    """People of the time per gazetteer place, and where each value comes from ('chandler', 'factor' or None)."""
    gaz = json.load(open(os.path.join(ROOT, 'data', 'content', 'gazetteer.json'), encoding='utf-8'))['places']
    dem = json.load(open(os.path.join(ROOT, 'data', 'history', str(year), 'demography.json'), encoding='utf-8'))['regions']
    ch = json.load(open(os.path.join(ROOT, 'data', 'history', str(year), f'chandler_{year}.json'), encoding='utf-8'))['cities']
    people, how = [None] * len(gaz), [None] * len(gaz)
    for k, p in enumerate(gaz):
        if p.get('pop1356'):
            people[k] = int(round(p['pop1356'] * factor_of(dem, p['lon'], p['lat']))); how[k] = 'factor'
    for c in ch:
        people[c['site']] = c['people']; how[c['site']] = 'chandler'
    return gaz, people, how


def place_of(gaz, loc_lon, loc_lat):
    """The place of the map (0-based) each gazetteer place belongs to: the place whose centre is nearest, as
    tools/people/build_cities.py finds the place of a city. The places of the map were seeded at the places of the
    gazetteer (tools/geo/build_locations.py), so this is the place the town named; the raster of places is not used,
    because its borders are warped and a town's point may fall in its neighbour or in the sea (Venice)."""
    import numpy as np
    from scipy.spatial import cKDTree
    lon, lat = np.radians(np.asarray(loc_lon)), np.radians(np.asarray(loc_lat))
    tree = cKDTree(np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], 1))
    a, b = np.radians([p['lat'] for p in gaz]), np.radians([p['lon'] for p in gaz])
    return [int(j) for j in tree.query(np.stack([np.cos(a) * np.cos(b), np.cos(a) * np.sin(b), np.sin(a)], 1))[1]]


def towns_by_place(year, L, loc_lon, loc_lat):
    """Sum of the people of the towns in each place of the map."""
    gaz, people, _ = towns(year)
    at = place_of(gaz, loc_lon, loc_lat)
    s = [0] * L
    for k, n in enumerate(people):
        if n and 0 <= at[k] < L: s[at[k]] += n
    return s


def main(year=1291):
    gaz, people, how = towns(year)
    geo = json.load(open(os.path.join(ROOT, 'public', 'data', 'geo.json'), encoding='utf-8'))
    place = place_of(gaz, geo['loc']['lon'][:geo['L']], geo['loc']['lat'][:geo['L']])
    doc = {'year': year,
           'about': 'People of the time per place of data/content/gazetteer.json (index), the towns of the world graphic; '
                    'null = unknown (settle.ts takes the people of its size). Written by tools/history/1291/towns.py.',
           'sources': ['Chandler (1987) via Reba, Reitsma & Seto (2016), CC BY 4.0: data/history/%d/chandler_%d.json' % (year, year),
                       'other towns: pop1356 of the gazetteer times the factor of the region in data/history/%d/demography.json '
                       '(assumption: towns lost the share their land lost)' % year],
           'people': people,
           # the place of the map (index into setup_<year>.json) each town lies in: the people of a place outside its
           # towns are setup.pop[place] minus the towns in it
           'place': place}
    path = os.path.join(ROOT, 'public', 'data', f'towns_{year}.json')
    json.dump(doc, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    n = lambda w: sum(1 for h in how if h == w)
    print(f'{n("chandler")} towns after Chandler, {n("factor")} by the factor of their region, '
          f'{sum(1 for p in people if p is None)} unknown; {sum(p or 0 for p in people)} people -> {path}')


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 1291)
