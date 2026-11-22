"""Who holds the places beyond the game map in 1356 (tools/geo/merge_beyond.py): the realms of
data/history/1356/world_beyond.json and those of the game map that reach beyond it ("extends") spread from their capitals
and holdings over the land, as build_setup.py spreads them.
"""

import heapq
import math

import numpy as np
from scipy.spatial import cKDTree


def xyz(lo, la):
    """points on the globe as unit vectors, so that a k-d tree finds the nearest by straight distance"""
    lo, la = np.radians(lo), np.radians(la)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], -1)


def spread_holders(geo, setup, hist, adj, lon, lat, L, L2):
    """the holder of every land place after the merge (-1: none), and the realms with the new ones of hist after them;
    lon and lat by the ids of the beyond raster (0 unused), adj the neighbours of every place after the merge"""
    Lt = L + L2
    nl = slice(1, L2 + 1)
    states = setup['states']
    ids_of = {s['id']: k for k, s in enumerate(states)}
    for s in hist['states']:
        if s['id'] in ids_of:
            raise SystemExit(f'realm {s["id"]} exists already')
        o = dict(s)
        o['capital_loc'] = 0
        o.pop('reach_km', None)
        ids_of[s['id']] = len(states)
        states.append(o)
    owner = np.full(Lt + 1, -1, np.int32)
    owner[1 : L + 1] = [-1 if v is None else v for v in setup['owner']]
    tree_new = cKDTree(xyz(lon[nl], lat[nl]))

    def place_at(lo, la):
        d, j = tree_new.query(xyz(np.array([lo]), np.array([la]))[0])
        return L + 1 + int(j) if d < math.radians(1.5) else 0

    REACH = 380
    rank_w = {
        'kingdom': 0.8,
        'empire': 0.75,
        'khanate': 0.7,
        'sultanate': 0.85,
        'duchy': 1.0,
        'principality': 1.1,
        'lordship': 1.5,
        'chiefdom': 1.2,
    }
    best = np.full(Lt + 1, np.inf)
    pq = []

    def anchor(si, p, wgt):
        l = place_at(p['lon'], p['lat'])
        if not l or best[l] == 0:
            return l
        best[l] = 0
        owner[l] = si
        heapq.heappush(pq, (0.0, l, si, wgt))
        return l

    for s in hist['states']:
        # a small realm whose land the sources bound (the chiefdoms of the Philippines) spreads only as far as its reach
        si = ids_of[s['id']]
        wgt = rank_w.get(s['rank'], 1.0) * (REACH / s['reach_km'] if s.get('reach_km') else 1.0)
        cap = anchor(si, s['capital'], wgt)
        states[si]['capital_loc'] = int(cap) if cap else 0
        for p in s['holdings'][1:]:
            anchor(si, p, wgt)
    for sid, pts in hist['extends'].items():
        si = ids_of[sid]
        wgt = rank_w.get(states[si].get('rank'), 1.0)
        for spec in pts:
            nm, c = spec.split('@')
            la, lo = map(float, c.split(','))
            anchor(si, {'lon': lo, 'lat': la}, wgt)

    def wander(lo, la, k):
        """a smooth field in 0..1 of a few hundred km, so that the spread's fronts are not circles or straight lines"""
        a, b = math.radians(lo), math.radians(la)
        v = (
            math.sin(7.3 * a + 2.1 * b + k)
            + math.sin(-3.1 * a + 9.7 * b + 1.7 + 2 * k)
            + math.sin(11.9 * a - 6.2 * b + 4.4 + 3 * k)
            + 0.5 * math.sin(23.0 * a + 17.0 * b + k)
        )
        return min(1.0, max(0.0, 0.5 + v / 7))

    # realms of the game map that reach beyond it go on across its edge: a new place next to one of their places
    # starts their spread as well, so that their land does not end on the meridian of the edge
    for u in range(L + 1, Lt + 1):
        if best[u] == 0:
            continue
        for v in adj[u]:
            o = owner[v] if 1 <= v <= L else -1
            if o >= 0 and states[o]['id'] in hist['extends']:
                # a head start that wanders along the edge, so that the realm's new border does not run parallel to it
                d0 = 0.45 * REACH * wander(lon[u - L], lat[u - L], 0)
                if d0 < best[u]:
                    best[u] = d0
                    owner[u] = o
                    heapq.heappush(pq, (d0, u, o, rank_w.get(states[o].get('rank'), 1.0)))
                break
    old_owner = owner.copy()
    new_ids = {s['id'] for s in hist['states']}
    lon0, lat0 = geo['loc']['lon'], geo['loc']['lat']

    def ll(u):
        return (lon[u - L], lat[u - L]) if u > L else (lon0[u - 1], lat0[u - 1])

    def km_between(u, v):
        return float(np.degrees(np.arccos(np.clip((xyz(*ll(u)) * xyz(*ll(v))).sum(), -1, 1)))) * 111.2

    while pq:
        d, u, si, wgt = heapq.heappop(pq)
        if d > best[u] or owner[u] != si:
            continue
        for v in adj[u]:
            # the new realms also take land of the game map that no realm holds next to theirs (Sindh beside Delhi),
            # so that no realm ends on the meridian of the map's edge
            # (those reaching beyond it too in the steppe south of 55° N, not the forest of Yugra to the north)
            if not (
                L < v <= Lt
                or (
                    1 <= v <= L
                    and old_owner[v] < 0
                    and (states[si]['id'] in new_ids or (states[si]['id'] in hist['extends'] and lat0[v - 1] < 55))
                )
            ):
                continue
            nd = d + km_between(u, v) * wgt * (0.7 + 0.6 * wander(*ll(v), 1))
            if nd < best[v] and nd < REACH:
                best[v] = nd
                owner[v] = si
                heapq.heappush(pq, (nd, v, si, wgt))
    taken = [int(v) for v in range(1, L + 1) if owner[v] != old_owner[v]]
    print('places of the game map no realm held that the new realms take', len(taken))
    held = int((owner[L + 1 :] >= 0).sum())
    print('new places held', held, 'of', L2)
    for s in hist['states']:
        si = ids_of[s['id']]
        if not states[si]['capital_loc']:
            print('  no capital place for', s['id'])
    return states, owner
