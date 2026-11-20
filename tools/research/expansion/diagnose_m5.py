"""Why M5 makes too many polities (plan amendment of 20 Nov), on the round-2 fitting years only (starts 1000-1265,
maps up to 1290): where new polities come from in the data, and births and deaths of M5 and M5b against the data.
Usage: python3 diagnose_m5.py <out dir of prep_owners.py>"""

import json
import os
import sys

import m5
import m5b
import numpy as np
from common import World
from evaluate import END, NEW, SPLITS
from parcels import Geo, parcels, polities
from transitions import FAR

w = World(os.path.join(sys.argv[1], 'owners_line.npz'))
g = Geo(w)
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'coef_round2.json'), encoding='utf-8') as f:
    C = json.load(f)
YEARS = [y for y in SPLITS['fit2'] if y + 5 <= END['fit2']]
rng = np.random.default_rng(3)

# 1. new polities in the data, and parcels drawn one by one as M5 does
bp = np.array([C['M5']['parcel'][f] for f in m5.P_FEATS])
acc = {'parcels_to_new': 0.0, 'new_polities': 0.0, 'main_source_survives': 0.0, 'm5_new_polities': 0.0}
for y0 in YEARS:
    o0, o1 = w.row(y0), w.row(y0 + 5)
    ok = (o0 >= 0) & (o1 >= 0)
    live0 = set(np.unique(o0[o0 >= 0]).tolist())
    live1 = set(np.unique(o1[o1 >= 0]).tolist())
    newm = ok & ~np.isin(o1, list(live0))
    for n in np.unique(o1[newm]):
        v, c = np.unique(o0[newm & (o1 == n)], return_counts=True)
        acc['new_polities'] += 1
        acc['main_source_survives'] += int(v[c.argmax()]) in live1
    par, S = parcels(g, o0)
    for p in np.nonzero(np.isin(S['owner'], list(live1)))[0]:
        m = (par == p) & ok
        if m.any():
            v, c = np.unique(o1[m], return_counts=True)
            acc['parcels_to_new'] += int(v[c.argmax()]) not in live0
    P = polities(g, o0)
    p_r, pj_r, PX = m5.parcel_rows(g, o0, P, par, S)
    for _ in range(4):
        rows = m5._sample(p_r, PX @ bp, rng)
        sel = pj_r[rows] == NEW
        acc['m5_new_polities'] += len(np.unique(S['owner'][p_r[rows][sel]])) / 4
print('per 5 years:', {k: round(v / len(YEARS), 2) for k, v in acc.items()})
b = C['M5b']
print('secession events', b['secession_events'], 'new polities in them', sum(len(e) for e in b['secession_blocks']))
print('break-ups by number of successors', dict(zip(*np.unique(b['breakup_successors'], return_counts=True))))


# 2. births and deaths, data against M5 and M5b
def stats(o0, o1, ok):
    l0 = set(np.unique(o0[ok & (o0 >= 0)]).tolist())
    l1 = set(np.unique(o1[ok & (o1 >= 0) & (o1 != FAR)]).tolist())
    return np.array([len(l1), len(l1 - l0), len(l0 - l1), (ok & (o0 != o1)).mean()])


models = {'M5': m5.make(C['M5']), 'M5b': m5b.make(C['M5b'])}
for H in (5, 25):
    res = {'data': [], 'M5': [], 'M5b': []}
    for y0 in [y for y in SPLITS['fit2'] if y + H <= END['fit2']]:
        o0, o1 = w.row(y0), w.row(y0 + H)
        ok = (o0 >= 0) & (o1 >= 0)
        res['data'].append(stats(o0, o1, ok))
        for name, model in models.items():
            res[name] += [stats(o0, s, ok) for s in model(w, o0, y0, H, 4, rng)]
    for name, v in res.items():
        n, bi, de, ch = np.mean(v, 0)
        print(f'{H:2d} years {name:5s} polities {n:5.1f}  new {bi:5.2f}  gone {de:5.2f}  places changed {ch:.3f}')
