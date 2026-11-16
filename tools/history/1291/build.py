"""Bakes the researched realms of 1 January 1291 onto all places of the map (game map and the rest of the globe):
public/data/setup_1291.json in the shape of setup_1356.json.

Who holds a place:
  1. every realm's researched anchors (capital and holdings in data/history/1291/*.json) are seeds;
  2. the realms spread over the land graph (public/data/geo.json edges, straits included) by weighted distance, as
     tools/geo/build_setup.py does for 1356 (same weights, same reach), so a border lies between the nearest anchors;
  3. where Euratlas 1300 labels a place (data/history/1291/ref, derived per place), only the realms that
     data/history/1291/ref/euratlas_to_1291.json maps that label to may take it (1291 differences as overrides there);
     a labelled place is filled even beyond the usual reach, an unlabelled one only within it;
  4. the researched corrections of data/history/1291/borders.json (tools/map/borders.py) are applied last.
Culture, faith, minority, people and density per place are taken over from setup_1356.json (the demography of 1291
is not researched yet: a gap).

Run: python3 tools/history/1291/build.py   (after the region scripts; then python3 tools/map/palette.py 1291)
"""
import glob, heapq, json, math, os, sys
import numpy as np
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'geo')); sys.path.insert(0, os.path.join(ROOT, 'tools', 'map'))
from common import lonlat_to_px, W, H, km_per_px  # noqa: E402
import borders  # noqa: E402

YEAR = 1291
RANK_W = {'free_city': 2.6, 'lordship': 1.5, 'county': 1.25, 'prince_bishopric': 1.35, 'archbishopric': 1.3, 'landgraviate': 1.1,
          'margraviate': 1.05, 'principality': 1.1, 'duchy': 1.0, 'grand_duchy': 0.85, 'kingdom': 0.8, 'empire': 0.75,
          'khanate': 0.7, 'sultanate': 0.85, 'republic': 1.2, 'order': 1.0, 'tribe': 1.0, 'chiefdom': 1.2, 'emirate': 1.0, 'beylik': 1.0, 'despotate': 1.0}
OUTPOST_KM = 45
NEAR_KM = 90        # a labelled place cut off on the mainland
ISLAND_KM = 700     # a labelled island (Orkney from Bergen, Aegean islands from the mainland)


def load_states():
    states, wars = [], []
    for f in sorted(glob.glob(os.path.join(ROOT, 'data', 'history', str(YEAR), '*.json'))):
        d = json.load(open(f, encoding='utf-8'))
        if 'states' not in d: continue
        states += d['states']; wars += d.get('wars') or []
    ids = [s['id'] for s in states]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup: raise SystemExit(f'realms twice: {dup}')
    known = set(ids); bad = []
    for s in states:
        for k in ('allies', 'rivals', 'claims_on'):
            for x in s.get(k) or []:
                if x not in known: bad.append((s['id'], k, x))
        if s.get('overlord') and s['overlord'] not in known: bad.append((s['id'], 'overlord', s['overlord']))
    for w in wars:
        for x in w['attackers'] + w['defenders']:
            if x not in known: bad.append((w['name']['en'], 'war', x))
    if bad: raise SystemExit(f'references to realms that do not exist in {YEAR}: {bad}')
    return states, wars


def euratlas_allow(states, lon, lat, L, min_conf=0.5):
    """Per place 1..L: the set of realm indices that may hold it by the Euratlas 1300 label, or None (no label)."""
    ref = os.path.join(ROOT, 'data', 'history', str(YEAR), 'ref')
    lab = json.load(open(os.path.join(ref, 'euratlas_1300_places.json'), encoding='utf-8'))
    mp = json.load(open(os.path.join(ref, 'euratlas_to_1291.json'), encoding='utf-8'))
    rows = [l.rstrip('\n').split('\t') for l in open(os.path.join(ref, 'euratlas_1300_states.tsv'), encoding='utf-8')][1:]
    key = {int(r[0]): f'{r[0]}:{r[1]}' for r in rows}
    idx = {s['id']: i for i, s in enumerate(states)}
    sets = {k: (None if v is None else frozenset(idx[x] for x in v)) for k, v in mp['map'].items()}
    allow = [None] * (L + 1); n = 0; ov = 0
    for i in range(L):
        if lab['confidence'][i] < min_conf: continue
        ent = None
        for e in (lab['dependent'][i], lab['place'][i]):
            if e is not None and e >= 0 and sets.get(key[e]) is not None: ent = key[e]; break
        if ent is None: continue
        a = sets[ent]
        for o in mp['overrides']:
            x0, y0, x1, y1 = o['box']
            if o['entity'] == ent and x0 <= lon[i] <= x1 and y0 <= lat[i] <= y1:
                a = frozenset(idx[x] for x in o['to']); ov += 1
        allow[i + 1] = a; n += 1
    print('places bound by Euratlas 1300 labels:', n, 'of them by a 1291 override:', ov)
    return allow


def main():
    geo = json.load(open(os.path.join(ROOT, 'public', 'data', 'geo.json'), encoding='utf-8'))
    L, S, loc = geo['L'], geo['S'], geo['loc']
    L0 = geo['beyond']['L0']
    lon = np.array(loc['lon'][:L]); lat = np.array(loc['lat'][:L]); lx = np.array(loc['x'][:L]); ly = np.array(loc['y'][:L])
    names = json.load(open(os.path.join(ROOT, 'public', 'data', 'world.json'), encoding='utf-8'))['name']
    ids = np.load(os.path.join(os.environ.get('GEO_CACHE', '/home/user/geo-cache'), 'stage', 'ids.npy'))
    adj = [[] for _ in range(L + S + 1)]
    for a, b, kind, c, rf in geo['edges']:
        adj[a].append(b); adj[b].append(a)
    for a, b, nm in geo['straits']:
        adj[a].append(b); adj[b].append(a)
    # places on the sphere for the nearest-place lookup outside the game map's raster
    rl, rp = np.radians(lat), np.radians(lon)
    xyz = np.stack([np.cos(rl) * np.cos(rp), np.cos(rl) * np.sin(rp), np.sin(rl)], 1)
    tree = cKDTree(xyz)

    def loc_at(lo, la, max_km=120):
        x, y = lonlat_to_px(lo, la); xi, yi = int(x), int(y)
        if 0 <= xi < W and 0 <= yi < H:
            v = int(ids[yi, xi])
            if 1 <= v <= L0: return v
            for r in range(1, 12):
                win = ids[max(0, yi - r):yi + r + 1, max(0, xi - r):xi + r + 1]
                m = (win >= 1) & (win <= L0)
                if m.any(): return int(np.bincount(win[m]).argmax())
        p = np.radians([la, lo])
        q = [math.cos(p[0]) * math.cos(p[1]), math.cos(p[0]) * math.sin(p[1]), math.sin(p[0])]
        d, j = tree.query(q)
        return int(j) + 1 if d * 6371 <= max_km else 0

    states, wars = load_states()
    print('realms', len(states), 'wars', len(wars))
    weights = []
    for s in states:
        w = RANK_W.get(s.get('rank'), 1.0)
        if s.get('government') == 'nomadic_horde': w *= 0.7
        weights.append(w)
    # seats: the place named after the seat nearby, else the place under it
    capital_loc = []
    for s in states:
        cn, c = s['capital']['name'], s['capital']
        cx, cy = lonlat_to_px(c['lon'], c['lat'])
        same = [i + 1 for i in range(L0) if names[i] == cn and (lx[i] - cx) ** 2 + (ly[i] - cy) ** 2 < 40 ** 2]
        cl = min(same, key=lambda v: (lx[v - 1] - cx) ** 2 + (ly[v - 1] - cy) ** 2) if same else loc_at(c['lon'], c['lat'], 250)
        if not cl: print('  seat off the map:', s['id'], cn)
        capital_loc.append(cl)
    # two seats on one place: the realm with more anchors keeps it, the other takes the nearest free neighbour
    by = {}
    for si, l in enumerate(capital_loc): by.setdefault(l, []).append(si)
    taken = set(capital_loc)
    for l, sis in by.items():
        if not l or len(sis) < 2: continue
        sis.sort(key=lambda si: -len(states[si].get('holdings') or []))
        for si in sis[1:]:
            seen, frontier, new = {l}, [l], 0
            for _ in range(4):
                nxt = [v for u in frontier for v in adj[u] if v <= L and v not in seen]
                seen.update(nxt)
                cand = [v for v in nxt if v not in taken]
                if cand:
                    c = states[si]['capital']; cx, cy = lonlat_to_px(c['lon'], c['lat'])
                    new = min(cand, key=lambda v: (lx[v - 1] - cx) ** 2 + (ly[v - 1] - cy) ** 2); break
                frontier = nxt
            if new:
                print('  seat moved:', states[si]['id'], 'shares', states[sis[0]]['id'], '->', names[new - 1])
                capital_loc[si] = new; taken.add(new)
    allow = euratlas_allow(states, lon, lat, L)
    best = np.full(L + 1, np.inf); owner = np.full(L + 1, -1, np.int32); pq = []; conflicts = []

    def anchor(si, p, l):
        if not l: return
        if best[l] > 0:
            best[l] = 0; owner[l] = si
            rcap = float(p.get('radius_km') or (OUTPOST_KM if p.get('outpost') else math.inf))
            heapq.heappush(pq, (0.0, l, si, weights[si], rcap))
        elif owner[l] != si:
            conflicts.append((states[si]['id'], p.get('name'), states[owner[l]]['id']))
    for si, s in enumerate(states): anchor(si, s['capital'], capital_loc[si])
    for si, s in enumerate(states):
        for p in (s.get('holdings') or [])[1:]:
            anchor(si, p, loc_at(float(p['lon']), float(p['lat'])))
    print('anchor conflicts (the first realm keeps the place):', len(conflicts))
    for c in conflicts: print('  ', c)
    kmpp = km_per_px(lat)

    def reach(i):
        if i > L0: return 380                         # the rest of the globe (tools/geo/merge_beyond.py)
        if lon[i - 1] < -30 or lat[i - 1] < 10: return 260
        if 40 < lon[i - 1] or lat[i - 1] < 30: return 420
        return 300

    def step_km(u, v):
        if u <= L0 and v <= L0:
            return math.hypot(lx[u - 1] - lx[v - 1], ly[u - 1] - ly[v - 1]) * kmpp[u - 1]
        a, b = math.radians(lat[u - 1]), math.radians(lat[v - 1])
        return 6371 * math.acos(min(1, math.sin(a) * math.sin(b) + math.cos(a) * math.cos(b) * math.cos(math.radians(lon[u - 1] - lon[v - 1]))))
    while pq:
        d, u, si, w, rcap = heapq.heappop(pq)
        if d > best[u] or owner[u] != si: continue
        for v in adj[u]:
            if v > L: continue
            al = allow[v]
            if al is not None and si not in al: continue
            nd = d + step_km(u, v) * w
            if nd < best[v] and (al is not None or nd < reach(v)) and nd < rcap * w:
                best[v] = nd; owner[v] = si
                heapq.heappush(pq, (nd, v, si, w, rcap))
    # a labelled place the constrained spread could not reach (an island, or land behind another realm's label) goes to
    # the nearest place held by one of the realms its label allows: within ISLAND_KM on islands without a seat, else NEAR_KM
    comp = np.zeros(L + 1, np.int32); cid = 0
    for st0 in range(1, L + 1):
        if comp[st0]: continue
        cid += 1; comp[st0] = cid; stack = [st0]
        while stack:
            u = stack.pop()
            for v in adj[u]:
                if v <= L and not comp[v]: comp[v] = cid; stack.append(v)
    csize = np.bincount(comp); seated = {comp[l] for l in capital_loc if l}
    held_xyz = {}
    for l in range(1, L + 1):
        if owner[l] >= 0: held_xyz.setdefault(int(owner[l]), []).append(l)
    trees = {si: (cKDTree(xyz[np.array(ls) - 1]), ls) for si, ls in held_xyz.items()}
    filled = 0
    for l in range(1, L + 1):
        al = allow[l]
        if owner[l] >= 0 or not al: continue
        cap = ISLAND_KM if (csize[comp[l]] < 300 and comp[l] not in seated) else NEAR_KM
        best_d, best_si = cap / 6371, -1
        for si in al:
            if si not in trees: continue
            d, _ = trees[si][0].query(xyz[l - 1])
            if d < best_d: best_d, best_si = d, si
        if best_si >= 0: owner[l] = best_si; filled += 1
    print('labelled places filled from the nearest allowed realm:', filled)
    fixed = [int(v) for v in owner[1:]]
    borders.apply(fixed, [s['id'] for s in states], geo, names, YEAR)
    print('places held', sum(1 for o in fixed if o >= 0), 'of', L)
    s56 = json.load(open(os.path.join(ROOT, 'public', 'data', 'setup_1356.json'), encoding='utf-8'))
    out_states = []
    for si, s in enumerate(states):
        o = dict(s); o['capital_loc'] = capital_loc[si]; out_states.append(o)
    setup = {'year': YEAR, 'states': out_states, 'wars': wars, 'owner': fixed,
             'culture': s56['culture'], 'faith': s56['faith'], 'minority': s56['minority'], 'pop': s56['pop'], 'density': s56['density']}
    path = os.path.join(ROOT, 'public', 'data', f'setup_{YEAR}.json')
    json.dump(setup, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    size = np.bincount([o for o in fixed if o >= 0], minlength=len(states))
    print('realms without a place:', [states[i]['id'] for i in range(len(states)) if size[i] == 0])
    print('written', path)


if __name__ == '__main__':
    main()
