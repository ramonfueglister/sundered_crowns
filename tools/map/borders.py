"""Researched corrections of who holds which place in a start year, applied after the anchor-based spread of
tools/geo/build_setup.py (which reaches only over land from each realm's researched places, so it leaves islands
empty and draws borders by distance).

The rules live in data/history/<year>/borders.json, each with its sources. They are applied in order:
  {"state": id, "places": [names]}                      the places of these names (exact; every name must exist)
  {"state": id, "area": [[lon, lat], ...], "from": [ids or null]}
                                                         every place whose centre lies inside the polygon and whose
                                                         holder is one of `from` (null: no realm; default [null])
  {"islands": {"km": 60, "box": [lon0, lat0, lon1, lat1]}}
                                                         every island in the box that no realm holds (a group of places
                                                         without a realm joined by land to no held place) goes to the
                                                         holder of the nearest held place within km of it (islands
                                                         belonged to the coastal power in sight); rules after it
                                                         correct the exceptions
Run on the baked setup: python3 tools/map/borders.py [year] [--dry]   (build_setup.py calls `apply` itself)
"""
import json, math, os, sys
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


def inside(lon, lat, ring):
    hit = False
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        if (y0 > lat) != (y1 > lat) and lon < x0 + (lat - y0) * (x1 - x0) / (y1 - y0):
            hit = not hit
    return hit


def km(lon0, lat0, lon1, lat1):
    p = math.radians((lat0 + lat1) / 2)
    return 111.32 * math.hypot((lon1 - lon0) * math.cos(p), lat1 - lat0)


def apply(owner, state_ids, geo, names, year=1356, log=print):
    """Applies the rules of `year` to `owner` (one realm index or -1 per land place, changed in place). Returns the changes."""
    path = os.path.join(ROOT, 'data', 'history', str(year), 'borders.json')
    if not os.path.exists(path):
        return []
    rules = json.load(open(path, encoding='utf-8'))['rules']
    index = {s: i for i, s in enumerate(state_ids)}
    lon, lat, L = geo['loc']['lon'], geo['loc']['lat'], len(owner)
    land_nb = defaultdict(list)
    for a, b, kind, _, _ in geo['edges']:
        if kind == 0 and a <= L and b <= L:
            land_nb[a - 1].append(b - 1); land_nb[b - 1].append(a - 1)
    by_name = defaultdict(list)
    for i, n in enumerate(names[:L]):
        by_name[n].append(i)
    changes = []

    def give(i, si, why):
        if owner[i] != si:
            changes.append((names[i], state_ids[owner[i]] if owner[i] >= 0 else None, state_ids[si] if si >= 0 else None, why))
            owner[i] = si

    for k, r in enumerate(rules):
        why = r.get('note') or f'rule {k}'
        if 'islands' in r:
            lo0, la0, lo1, la1 = r['islands']['box']; reach = r['islands']['km']
            held = [i for i in range(L) if owner[i] >= 0 and lo0 - 2 <= lon[i] <= lo1 + 2 and la0 - 2 <= lat[i] <= la1 + 2]
            seen = set()
            for start in range(L):
                if owner[start] >= 0 or start in seen or not (lo0 <= lon[start] <= lo1 and la0 <= lat[start] <= la1):
                    continue
                # the group of places without a realm joined to it by land; an island if none of them borders a held place
                group, stack, island = [], [start], True
                seen.add(start)
                while stack:
                    i = stack.pop(); group.append(i)
                    for j in land_nb[i]:
                        if owner[j] >= 0: island = False
                        elif j not in seen: seen.add(j); stack.append(j)
                if not island:
                    continue
                d, best = min(((km(lon[i], lat[i], lon[j], lat[j]), j) for i in group for j in held), default=(None, None))
                if best is not None and d <= reach:
                    for i in group:
                        give(i, owner[best], why)
            continue
        if r['state'] is not None and r['state'] not in index:
            raise SystemExit(f'borders.json rule {k}: no realm {r["state"]}')
        si = index[r['state']] if r['state'] is not None else -1
        if 'places' in r:
            for n in r['places']:
                if n not in by_name:
                    raise SystemExit(f'borders.json rule {k}: no place named {n}')
                for i in by_name[n]:
                    give(i, si, why)
        if 'area' in r:
            frm = {(-1 if f is None else index[f]) for f in r.get('from', [None])}
            ring = [tuple(p) for p in r['area']]
            for i in range(L):
                if owner[i] in frm and inside(lon[i], lat[i], ring):
                    give(i, si, why)
    log(f'borders.json: {len(changes)} places changed hands')
    return changes


def main():
    year = int(next((a for a in sys.argv[1:] if a.isdigit()), 1356)); dry = '--dry' in sys.argv
    setup_path = os.path.join(ROOT, 'public', 'data', f'setup_{year}.json')
    setup = json.load(open(setup_path, encoding='utf-8'))
    geo = json.load(open(os.path.join(ROOT, 'public', 'data', 'geo.json'), encoding='utf-8'))
    names = json.load(open(os.path.join(ROOT, 'public', 'data', 'world.json'), encoding='utf-8'))['name']
    owner = [-1 if o is None else o for o in setup['owner']]
    changes = apply(owner, [s['id'] for s in setup['states']], geo, names, year)
    by = defaultdict(list)
    for n, a, b, why in changes:
        by[(a, b, why)].append(n)
    for (a, b, why), ns in sorted(by.items(), key=lambda kv: -len(kv[1])):
        print(f'  {a} -> {b} ({len(ns)}): {", ".join(ns[:8])}{" ..." if len(ns) > 8 else ""}   [{why[:70]}]')
    if not dry:
        setup['owner'] = owner
        json.dump(setup, open(setup_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    main()
