"""Does land change hands from the new owner's side outward? For every place that goes from A to an existing polity B
within a 25-year span, compare the year of the change with the steps from the place to B's land at the start.
Spearman rank correlation per (start, B), pooled; positive = farther places change later.
Usage: python3 order_check.py <out dir of prep_owners.py>"""

import os
import sys

import numpy as np
from common import World
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.stats import spearmanr

w = World(os.path.join(sys.argv[1], 'owners_line.npz'))
A = csr_matrix((np.ones(len(w.ea)), (w.ea, w.eb)), shape=(w.P, w.P))
for label, starts in (('fit 1000-1225', range(1000, 1226, 25)), ('test 1291-1475', range(1291, 1476, 25))):
    rs, ns, early_near = [], [], []
    for y0 in starts:
        o0 = w.row(y0)
        live = set(np.unique(o0[o0 >= 0]).tolist())
        first = np.full(w.P, -1)
        dest = np.full(w.P, -1)
        for y in range(y0 + 1, y0 + 26):
            o = w.row(y)
            ch = (first < 0) & (o0 >= 0) & (o >= 0) & (o != o0)
            first[ch] = y
            dest[ch] = o[ch]
        for b in set(dest[dest >= 0].tolist()) & live:
            pl = np.nonzero(dest == b)[0]
            if len(np.unique(first[pl])) < 2 or len(pl) < 5:
                continue
            d = dijkstra(A, indices=np.nonzero(o0 == b)[0], min_only=True, unweighted=True)[pl]
            ok = np.isfinite(d)
            if ok.sum() < 5 or len(np.unique(d[ok])) < 2:
                continue
            r = spearmanr(d[ok], first[pl][ok]).statistic
            if np.isfinite(r):
                rs.append(r)
                ns.append(ok.sum())
    rs, ns = np.array(rs), np.array(ns)
    print(
        label,
        'transfers with >1 change year:',
        len(rs),
        'places:',
        ns.sum(),
        'weighted mean rho: %.3f' % np.average(rs, weights=ns),
        'share rho>0: %.2f' % (rs > 0).mean(),
        'median rho: %.3f' % np.median(rs),
    )
