"""M3 / M4: transition model per place (conditional logit, McFadden 1974), fitted on the fitting years.

For place i in year t the choices for its owner in year t + STEP are: stay with the current owner c; each other polity
holding a place within MAXHOP steps of i; "new" (a polity that does not exist in t); "far" (an existing polity further
away, which no border model can reach). P(j) = exp(b . x_ij) / sum_k exp(b . x_ik).

Features, each with its source (M3 uses only these):
  hop          steps from i to j's land (1..MAXHOP)           Turchin et al. 2013, Bennett 2022: war only across a border
  dforce       log H_j(i) - log H_c(i), H = elites / border places of the polity (Bennett 2022, supplement Eq. 6)
  dist_j, dist_c   km/100 from j's and c's depot to i: log L(d) = -d/100 * log(1 + 1/s) (Eq. 7); the fitted weights
               give an implied s that can be compared with Bennett's 1.1..2.1
  elev         km above sea, for a change of owner                     Turchin et al. 2013 (defender power, gamma)
  rough        terrain roughness / 1000, for a change of owner         Fernandez-Villaverde et al. 2023 (fractured land)
  town         town size class 0..5 of i, for a change of owner        Abramson 2017 (cities protect polities)
  new_size     log places of c, for "new"                              Turchin et al. 2013 (disintegration rises with size)
  far_size     log places of c, for "far"                              (constant + size; the share no model explains)
M3b adds the phase of the state (Turchin & Nefedov 2009, Secular Cycles: disintegrative and integrative phases last
decades), measured over the 10 years before t:
  shrink_c     share of c's places of t-10 that c no longer holds in t, for a change of owner
  grow_j       log(places of j in t / places of j in t-10), for a change to j
M4 adds, as a measure of what the data allow and not as a game rule:
  prov_share   share of i's province held by j in t                    (data: 40-49 % of changed places move with
                                                                         their whole province)
"""

import json
from pathlib import Path

import numpy as np
from common import ROOT
from evaluate import NEW
from scipy.optimize import minimize

MAXHOP = 3
FAR = -3  # owner id for "an existing polity far away": never equals a real owner, so it scores as a miss
M3_FEATS = [
    'stay',
    'new',
    'far',
    'hop2',
    'hop3',
    'dforce',
    'dist_j',
    'dist_c',
    'elev',
    'rough',
    'town',
    'new_size',
    'far_size',
]
M3B_FEATS = M3_FEATS + ['shrink_c', 'grow_j']
M4_FEATS = M3B_FEATS + ['prov_share']


class Places:
    def __init__(self, world):
        self.w = world
        geo = json.loads(Path(ROOT, 'public', 'data', 'geo.json').read_text(encoding='utf-8'))
        kmpp = (geo['lon1'] - geo['lon0']) / geo['W'] * 111.32
        self.kx = world.x * kmpp * np.cos(np.radians(world.lat))
        self.ky = world.y * kmpp
        col = {int(p): k for k, p in enumerate(world.places)}
        self.prov = np.full(world.P, -1)
        for pi, p in enumerate(geo['provinces']):
            for loc in p['locs']:
                k = col.get(loc - 1)
                if k is not None:
                    self.prov[k] = pi
        self.K = np.maximum(world.pop, 1.0)


def candidates(pl, own):
    """(place, polity, hop) for every polity within MAXHOP steps of a place, the place's own polity excluded."""
    w = pl.w
    cur = np.unique(np.stack([np.arange(w.P), own], 1)[own >= 0], axis=0)
    seen = {(int(a), int(b)) for a, b in cur}
    out = []
    frontier = cur
    for hop in range(1, MAXHOP + 1):
        # expand: (place a, polity p) -> (neighbour b of a, polity p)
        if len(frontier) == 0:
            break
        order = np.argsort(frontier[:, 0])
        frontier = frontier[order]
        starts = np.searchsorted(w.ea, frontier[:, 0], 'left')
        ends = np.searchsorted(w.ea, frontier[:, 0], 'right')
        reps = ends - starts
        idx = np.repeat(starts, reps) + (np.arange(reps.sum()) - np.repeat(np.cumsum(reps) - reps, reps))
        nxt = np.stack([w.eb[idx], np.repeat(frontier[:, 1], reps)], 1)
        nxt = np.unique(nxt, axis=0)
        keep = np.array([(int(a), int(b)) not in seen for a, b in nxt], bool) if len(nxt) else np.zeros(0, bool)
        nxt = nxt[keep]
        for a, b in nxt:
            seen.add((int(a), int(b)))
        out.append(np.c_[nxt, np.full(len(nxt), hop)])
        frontier = nxt
    c = np.concatenate(out) if out else np.zeros((0, 3), int)
    c = c[own[c[:, 0]] != c[:, 1]]
    return c


def polity_stats(pl, own, E=None):
    E = pl.K if E is None else E
    st = own >= 0
    ids, inv = np.unique(np.where(st, own, -1), return_inverse=True)
    n = len(ids)
    cnt = np.bincount(inv, minlength=n).astype(float)
    sumE = np.bincount(inv, weights=E, minlength=n)
    cx = np.bincount(inv, weights=pl.kx, minlength=n) / np.maximum(cnt, 1)
    cy = np.bincount(inv, weights=pl.ky, minlength=n) / np.maximum(cnt, 1)
    w = pl.w
    pol = own[w.ea] != own[w.eb]
    bp = np.zeros(w.P, bool)
    bp[w.ea[pol]] = True
    nb = np.bincount(inv, weights=bp.astype(float), minlength=n)
    return ids, cnt, np.log(sumE / np.maximum(nb, 1) + 1e-9), cx, cy


def design(pl, own, feats, prev=None):
    """All choice rows for the places that have an owner: returns (place, owner id, X) with one row per choice."""
    w = pl.w
    ids, cnt, logH, cx, cy = polity_stats(pl, own)
    idx_of = lambda o: np.searchsorted(ids, o)  # noqa: E731
    live = np.nonzero(own >= 0)[0]
    c = candidates(pl, own)
    c = c[own[c[:, 0]] >= 0]
    # province shares: places of each province per polity
    if 'prov_share' in feats:
        pk = pl.prov.astype(np.int64) * (1 << 21) + np.where(own >= 0, own, (1 << 21) - 1)
        u, pc = np.unique(pk, return_counts=True)
        ptot = np.bincount(pl.prov[pl.prov >= 0], minlength=pl.prov.max() + 1)
    rows_place, rows_owner, X = [], [], []
    F = {f: k for k, f in enumerate(feats)}
    if 'shrink_c' in feats:
        # per polity of t: places in t-10, places kept
        before = np.bincount(np.searchsorted(ids, prev[(prev >= 0) & np.isin(prev, ids)]), minlength=len(ids))
        kept_m = (prev >= 0) & (prev == own)
        kept = np.bincount(np.searchsorted(ids, own[kept_m]), minlength=len(ids))
        shrink = np.where(before > 0, 1 - kept / np.maximum(before, 1), 0.0)
        grow = np.log((cnt + 1) / (before + 1))

    def block(place, owner, kind, hop):
        n = len(place)
        x = np.zeros((n, len(feats)))
        cur = own[place]
        ic = idx_of(cur)
        if kind == 'stay':
            x[:, F['stay']] = 1
            j_owner = cur
        elif kind == 'new':
            x[:, F['new']] = 1
            x[:, F['new_size']] = np.log(cnt[ic])
            j_owner = np.full(n, NEW)
        elif kind == 'far':
            x[:, F['far']] = 1
            x[:, F['far_size']] = np.log(cnt[ic])
            j_owner = np.full(n, FAR)
        else:
            ij = idx_of(owner)
            x[:, F['hop2']] = hop == 2
            x[:, F['hop3']] = hop == 3
            dj = np.hypot(pl.kx[place] - cx[ij], pl.ky[place] - cy[ij]) / 100
            dc = np.hypot(pl.kx[place] - cx[ic], pl.ky[place] - cy[ic]) / 100
            x[:, F['dforce']] = logH[ij] - logH[ic]
            x[:, F['dist_j']] = dj
            x[:, F['dist_c']] = dc
            x[:, F['elev']] = w.elev[place] / 1000
            x[:, F['rough']] = w.rough[place] / 1000
            x[:, F['town']] = w.town[place]
            if 'prov_share' in feats:
                k = pl.prov[place].astype(np.int64) * (1 << 21) + owner
                pos = np.searchsorted(u, k)
                pos = np.minimum(pos, len(u) - 1)
                share = np.where(u[pos] == k, pc[pos], 0) / np.maximum(ptot[pl.prov[place]], 1)
                x[:, F['prov_share']] = share
            if 'shrink_c' in feats:
                x[:, F['shrink_c']] = shrink[ic]
                x[:, F['grow_j']] = grow[ij]
            j_owner = owner
        rows_place.append(place)
        rows_owner.append(j_owner)
        X.append(x)

    block(live, None, 'stay', None)
    block(live, None, 'new', None)
    block(live, None, 'far', None)
    block(c[:, 0], c[:, 1], 'cand', c[:, 2])
    place = np.concatenate(rows_place)
    owner = np.concatenate(rows_owner)
    X = np.concatenate(X)
    order = np.argsort(place, kind='stable')
    return place[order], owner[order], X[order]


def choice_data(pl, years, step, feats, level='top', end=None):
    w = pl.w
    out = []
    for y0 in years:
        if end is not None and y0 + step > end:
            continue
        o0, o1 = w.row(y0, level), w.row(y0 + step, level)
        live = set(np.unique(o0[o0 >= 0]).tolist())
        place, owner, X = design(pl, o0, feats, w.row(y0 - 10, level))
        t = o1[place]
        t = np.where(np.isin(t, list(live)), t, NEW)
        ok = o1[place] >= 0
        chosen = owner == t
        # a place whose new owner is an existing polity not among its choices chose "far"
        has = np.zeros(w.P, bool)
        has[place[chosen]] = True
        chosen |= (owner == FAR) & ~has[place] & (t != NEW)
        out.append((place[ok], X[ok], chosen[ok]))
    return out


def nll(b, data, l2=1e-3):
    tot, grad = 0.0, np.zeros_like(b)
    for place, X, chosen in data:
        u = X @ b
        starts = np.r_[0, np.nonzero(np.diff(place))[0] + 1]
        m = np.maximum.reduceat(u, starts)
        mm = np.repeat(m, np.diff(np.r_[starts, len(u)]))
        e = np.exp(u - mm)
        s = np.add.reduceat(e, starts)
        p = e / np.repeat(s, np.diff(np.r_[starts, len(u)]))
        tot -= (u[chosen] - mm[chosen] - np.log(np.repeat(s, np.diff(np.r_[starts, len(u)]))[chosen])).sum()
        grad -= X[chosen].sum(0) - (p[:, None] * X).sum(0)
    return tot + l2 * (b @ b), grad + 2 * l2 * b


def fit(data, nfeat):
    r = minimize(nll, np.zeros(nfeat), args=(data,), jac=True, method='L-BFGS-B')
    return r.x, r


def make(b, feats, step):
    """A model for evaluate.score: chains `horizon / step` transitions, sampling each place's next owner."""

    def run(world, o0, y0, horizon, runs, rng):
        pl = run.pl if run.pl is not None and run.pl.w is world else Places(world)
        run.pl = pl
        out = np.empty((runs, world.P), np.int32)
        n = max(1, int(round(horizon / step)))
        for r in range(runs):
            own = o0.copy()
            next_id = NEW
            hist = [world.row(y0 - 10), world.row(y0 - 5), own]
            for _ in range(n):
                place, owner, X = design(pl, own, feats, hist[-3])
                u = X @ b
                starts = np.r_[0, np.nonzero(np.diff(place))[0] + 1]
                lens = np.diff(np.r_[starts, len(u)])
                m = np.repeat(np.maximum.reduceat(u, starts), lens)
                e = np.exp(u - m)
                cs = np.cumsum(e)
                tot_before = np.repeat(np.r_[0, cs[starts[1:] - 1]], lens)
                tot = np.repeat(np.add.reduceat(e, starts), lens)
                q = (cs - tot_before) / tot
                pick_r = np.repeat(rng.random(len(starts)), lens)
                first = q >= pick_r
                # first row per place with q >= r
                cand_rows = np.nonzero(first)[0]
                pl_rows = place[cand_rows]
                _, firstidx = np.unique(pl_rows, return_index=True)
                rows = cand_rows[firstidx]
                newo = owner[rows].copy()
                # each "new" draw within one current polity becomes one new polity (a split), "far" stays FAR
                isnew = newo == NEW
                if isnew.any():
                    cur = own[place[rows][isnew]]
                    u_c, inv = np.unique(cur, return_inverse=True)
                    newo[isnew] = next_id + inv
                    next_id += len(u_c)
                own = own.copy()
                own[place[rows]] = newo
                hist.append(own)
            out[r] = own
        return out

    run.pl = None
    return run
