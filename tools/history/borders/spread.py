"""The spread of the undated border changes of tools/history/borders/build.py.

An undated change (rule 3 of dating.py) does not move all its places on one day: it spreads from the land the new owner
holds that day outward, province by province (`spread_windows`). Ring 1 is the change's land in the provinces that touch
the new owner's land over the land (or a strait), ring 2 the land in the provinces that touch ring 1, and so on; each
ring moves on one day. Why: a polity attacks only across its border (Turchin et al. 2013, PNAS 110(41):16384-16389;
Bennett 2022, PLOS ONE 17(1):e0261816, supplement p. 5), and in Cliopatria land does go from the new owner's side
outward (Spearman rho 0.40 in 1000-1225, 0.16 in 1291-1475) while 40-49 % of the changed places move with their whole
province (tools/research/expansion, results/order_check.txt and the plan doc there). The pace is Bennett's: a front
moves at most one region deep per step of 2 years, and his region (~25'000 km2) is about our province (~20'000 km2). The
rings are 2 years apart around the middle of the window; where the window is shorter than that, they share it evenly
(ring k of n at its start + (k - 1/2) / n of its length). OWN RULE: no source gives the pace inside a window, so the
window is shared evenly. What the order does not cover stays on the middle of the window: a change to a realm that holds
no land yet (a new state comes as one block, round 2 of the study), and land with no way over the land from the new
owner's. A split that would change the order of two changes of one place is not made.
"""

import collections
import datetime

STEP_DAYS = 730  # Bennett 2022: one step of his model is 2 years, a front moves at most one region per step


def ring_dates(window, n):
    """The days of n rings in a window [first year, last year]: 2 years apart around its middle, or the window
    shared evenly when it is too short for that."""
    a, b = datetime.date(int(window[0]), 1, 1), datetime.date(int(window[1]), 12, 31)
    width = (b - a).days
    if (n - 1) * STEP_DAYS <= width:
        mid = a + (b - a) / 2
        return [mid + datetime.timedelta(days=(k - (n - 1) / 2) * STEP_DAYS) for k in range(n)]
    return [a + datetime.timedelta(days=width * (k + 0.5) / n) for k in range(n)]


def rings(places, to, held, nbr, prov):
    """The provinces of a change in rings from the new owner's land: [[places of ring 1], ...], places left over."""
    inside = set(places)
    mine = held[to] - inside
    by_prov = collections.defaultdict(list)
    for p in places:
        by_prov[prov[p]].append(p)
    ring = {q: 0 for q, ps in by_prov.items() if any(n in mine for p in ps for n in nbr[p])}
    adj = collections.defaultdict(set)
    for p in places:
        for n in nbr[p]:
            if n in inside and prov[n] != prov[p]:
                adj[prov[p]].add(prov[n])
    front = sorted(ring)
    while front:
        nxt = []
        for q in front:
            for r in sorted(adj[q]):
                if r not in ring:
                    ring[r] = ring[q] + 1
                    nxt.append(r)
        front = nxt
    n = max(ring.values(), default=-1) + 1
    out = [[p for p in places if ring.get(prov[p]) == k] for k in range(n)]
    return out, [p for p in places if prov[p] not in ring]


def spread_windows(events, setup, nbr, provinces, report):
    """An undated change spreads over its window from the new owner's land outward (rules in the header)."""
    keys = [st['id'] for st in setup['states']]
    P = len(setup['owner'])
    prov = [-1 - p for p in range(P)]  # a place in no province is a province of its own
    for pi, pv in enumerate(provinces):
        for loc in pv['locs']:
            if 0 < loc <= P:
                prov[loc - 1] = pi
    skip = set()
    while True:
        own = [keys[o] if o >= 0 else None for o in setup['owner']]
        held = collections.defaultdict(set)
        for p, o in enumerate(own):
            if o:
                held[o].add(p)
        out = []
        for i, e in enumerate(events):
            parts = [(e, i)]
            if e['kind'] == 'transfer' and e['precision'] == 'window' and i not in skip:
                ring_places, rest = rings(e['places'], e['to'], held, nbr, prov)
                if len(ring_places) > 1:
                    parts = []
                    days = ring_dates(e['window'], len(ring_places))
                    for k, (ps, d) in enumerate(zip(ring_places, days)):
                        why = f'; order: ring {k + 1} of {len(ring_places)} from the land of {e["to"]} (spread_windows)'
                        parts.append(({**e, 'places': ps, 'date': d.isoformat(), 'source': e['source'] + why}, i))
                    if rest:
                        why = f'; no way over the land from the land of {e["to"]}: the middle of the window'
                        parts.append(({**e, 'places': rest, 'source': e['source'] + why}, i))
            out += parts
            if e['kind'] != 'name':
                for p in e['places']:
                    if own[p]:
                        held[own[p]].discard(p)
                    own[p] = e['to']
                    held[e['to']].add(p)
        out.sort(key=lambda x: x[0]['date'])  # stable: equal dates keep the order as built
        # a split must not change the order of two changes of one place
        last = {}
        bad = set()
        for e, i in out:
            if e['kind'] == 'name':
                continue
            for p in e['places']:
                if last.get(p, -1) > i:
                    bad |= {i, last[p]}
                last[p] = max(last.get(p, -1), i)
        bad -= {i for i, e in enumerate(events) if e['kind'] != 'transfer' or e['precision'] != 'window'}
        if not bad - skip:
            break
        skip |= bad
    report['spread_changes'] = len({i for e, i in out if 'spread_windows' in e['source']})
    report['spread_events'] = sum('spread_windows' in e['source'] for e, _ in out)
    report['spread_kept_for_order'] = len(skip)
    return [e for e, _ in out]
