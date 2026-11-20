"""What happens to the polities of year t by t+5, on the round-2 fitting years: absorbed whole by one existing
polity, broken up into polities new at t+5, or alive (and then which parcels move)."""

import os
import sys

import numpy as np
from common import World
from parcels import Geo

w = World(os.path.join(sys.argv[1], 'owners_line.npz'))
g = Geo(w)
tot = {'polities': 0, 'absorbed': 0, 'absorbed_adj': 0, 'broken': 0, 'other_gone': 0}
places = {'changed': 0, 'absorbed': 0, 'broken': 0, 'alive_parcel_whole': 0, 'alive_other': 0}
for y0 in range(1000, 1266, 5):
    o0, o1 = w.row(y0), w.row(y0 + 5)
    live0 = set(np.unique(o0[o0 >= 0]).tolist())
    live1 = set(np.unique(o1[o1 >= 0]).tolist())
    ok = (o0 >= 0) & (o1 >= 0)
    ch = ok & (o0 != o1)
    places['changed'] += ch.sum()
    adjpairs = set(zip(o0[w.ea].tolist(), o0[w.eb].tolist()))
    for c in live0:
        m = (o0 == c) & ok
        if m.sum() == 0:
            continue
        tot['polities'] += 1
        if c in live1:
            continue
        dest = o1[m]
        vals, cnt = np.unique(dest, return_counts=True)
        top, share = vals[cnt.argmax()], cnt.max() / m.sum()
        old = np.isin(dest, list(live0))
        if top in live0 and share >= 0.5:
            tot['absorbed'] += 1
            tot['absorbed_adj'] += (c, int(top)) in adjpairs
            places['absorbed'] += (ch & m).sum()
        elif (~old).mean() >= 0.5:
            tot['broken'] += 1
            places['broken'] += (ch & m).sum()
        else:
            tot['other_gone'] += 1
    # alive polities: are changes whole parcels?
    alive = np.isin(o0, list(live1)) & ch
    key = g.prov * 100000 + o0
    for k in np.unique(key[alive]):
        m = (key == k) & ok
        moved = o1[m] != o0[m]
        if moved.all() and len(np.unique(o1[m])) == 1:
            places['alive_parcel_whole'] += m.sum()
        else:
            places['alive_other'] += moved.sum()
print(tot)
print(dict(places), {k: round(v / places['changed'], 3) for k, v in places.items()})
