"""M5, round 2: a model on two levels, moving land in blocks (plan section "Runde 2").

Every 5 years, in this order:
  1. Absorption of a whole polity c (conditional logit; choices: none, each polity j bordering c, "far" = a polity
     not bordering c). Features on the rows of j: a constant, dpower = log(E_j / B_j) - log(E_c / B_c), the ratio of Bennett's
     raw forces (2022, supplement Eq. 6: elites over border places); dist = km between the depots / 100 (Eq. 7 makes
     log force fall linearly with distance); on every absorbing row: log places of c (small polities go first) and
     towns per place of c (Abramson 2017: cities keep small polities alive). "far": constant and log places of c.
  2. Break-up of a polity that was not absorbed (logistic): constant, log places of c (Turchin et al. 2013: the
     chance to disintegrate rises with size), towns per place. A break-up splits c into two new polities grown from
     two random border parcels in turn (Bennett 2022: faction_odds = [2], faction_add_odds = 1, create_factions).
  3. Parcel transfers of the polities left (conditional logit per parcel = c's land in one province; choices: stay,
     the owner of each bordering parcel, "new" = secession, "far"). Features as M3 (transitions.py) on parcels:
     a constant, dpower, dist_j and dist_c (depot to parcel / 100 km), elevation and roughness of the parcel (Turchin et al.
     2013; Fernandez-Villaverde et al. 2023), towns in it (Abramson 2017), log places of the parcel; "new" and "far"
     with log places of c (Turchin et al. 2013). The whole parcel moves.
All weights are maximum-likelihood estimates on the round-2 fitting years (starts 1000-1265, maps up to 1290).
"""

import numpy as np
from evaluate import NEW
from parcels import Geo, parcels, polities
from scipy.optimize import minimize
from transitions import FAR

STEP = 5
A_FEATS = ['nbr', 'far', 'far_size', 'dpower', 'dist', 'size_c', 'town_c']
B_FEATS = ['const', 'size_c', 'town_c']
P_FEATS = ['nbr', 'new', 'far', 'dpower', 'dist_j', 'dist_c', 'elev', 'rough', 'town', 'psize', 'new_size', 'far_size']


def _idx(ids, o):
    return np.searchsorted(ids, o)


def logH(P):
    return np.log(P['K'] / np.maximum(P['border'], 1) + 1e-9)


def absorb_rows(g, own, P):
    """Rows of the absorption choice for every polity: (polity index, absorber id, X). Absorber -1 = none."""
    w = g.w
    ids = P['ids']
    a, b = own[w.ea], own[w.eb]
    m = (a >= 0) & (b >= 0) & (a != b)
    pairs = np.unique(np.stack([a[m], b[m]], 1), axis=0)  # (c, j) bordering
    lh = logH(P)
    n = len(ids)
    rows_c, rows_j, X = [], [], []
    F = {f: k for k, f in enumerate(A_FEATS)}
    size_c = np.log(P['size'])
    town_c = P['town'] / P['size']
    # none
    rows_c.append(np.arange(n))
    rows_j.append(np.full(n, -1))
    X.append(np.zeros((n, len(A_FEATS))))
    # far
    x = np.zeros((n, len(A_FEATS)))
    x[:, F['far']] = 1
    x[:, F['far_size']] = size_c
    rows_c.append(np.arange(n))
    rows_j.append(np.full(n, FAR))
    X.append(x)
    # bordering polities
    if len(pairs):
        ic, ij = _idx(ids, pairs[:, 0]), _idx(ids, pairs[:, 1])
        x = np.zeros((len(pairs), len(A_FEATS)))
        x[:, F['nbr']] = 1
        x[:, F['dpower']] = lh[ij] - lh[ic]
        x[:, F['dist']] = np.hypot(P['cx'][ij] - P['cx'][ic], P['cy'][ij] - P['cy'][ic]) / 100
        x[:, F['size_c']] = size_c[ic]
        x[:, F['town_c']] = town_c[ic]
        rows_c.append(ic)
        rows_j.append(pairs[:, 1])
        X.append(x)
    c = np.concatenate(rows_c)
    o = np.argsort(c, kind='stable')
    return c[o], np.concatenate(rows_j)[o], np.concatenate(X)[o]


def breakup_x(P):
    return np.stack([np.ones(len(P['ids'])), np.log(P['size']), P['town'] / P['size']], 1)


def parcel_rows(g, own, P, par, S):
    """Rows of the parcel choice: (parcel, owner id or NEW/FAR, X)."""
    ids = P['ids']
    lh = logH(P)
    n = len(S['owner'])
    F = {f: k for k, f in enumerate(P_FEATS)}
    ic_all = _idx(ids, S['owner'])
    size_c = np.log(P['size'][ic_all])
    rows_p, rows_j, X = [np.arange(n)], [S['owner']], [np.zeros((n, len(P_FEATS)))]
    for kind, oid in (('new', NEW), ('far', FAR)):
        x = np.zeros((n, len(P_FEATS)))
        x[:, F[kind]] = 1
        x[:, F[kind + '_size']] = size_c
        rows_p.append(np.arange(n))
        rows_j.append(np.full(n, oid))
        X.append(x)
    adj = S['adj']
    if len(adj):
        # one row per (parcel, neighbouring owner)
        pj = np.unique(np.stack([adj[:, 0], S['owner'][adj[:, 1]]], 1), axis=0)
        p, j = pj[:, 0], pj[:, 1]
        ic, ij = ic_all[p], _idx(ids, j)
        x = np.zeros((len(p), len(P_FEATS)))
        x[:, F['nbr']] = 1
        x[:, F['dpower']] = lh[ij] - lh[ic]
        x[:, F['dist_j']] = np.hypot(S['cx'][p] - P['cx'][ij], S['cy'][p] - P['cy'][ij]) / 100
        x[:, F['dist_c']] = np.hypot(S['cx'][p] - P['cx'][ic], S['cy'][p] - P['cy'][ic]) / 100
        x[:, F['elev']] = S['elev'][p]
        x[:, F['rough']] = S['rough'][p]
        x[:, F['town']] = S['town'][p]
        x[:, F['psize']] = np.log(S['size'][p])
        rows_p.append(p)
        rows_j.append(j)
        X.append(x)
    pp = np.concatenate(rows_p)
    o = np.argsort(pp, kind='stable')
    return pp[o], np.concatenate(rows_j)[o], np.concatenate(X)[o]


# ---- fitting -------------------------------------------------------------------------------------------------------


def fit_data(world, years, end):
    g = Geo(world)
    A, B, Pd = [], [], []
    for y0 in years:
        if y0 + STEP > end:
            continue
        o0, o1 = world.row(y0), world.row(y0 + STEP)
        live0 = set(np.unique(o0[o0 >= 0]).tolist())
        live1 = set(np.unique(o1[o1 >= 0]).tolist())
        P = polities(g, o0)
        ids = P['ids']
        ok = (o0 >= 0) & (o1 >= 0)
        fate = np.full(len(ids), -1)  # -1 alive / absorber id / FAR, -2 broken, -9 unclear
        for k, c in enumerate(ids):
            m = (o0 == c) & ok
            if m.sum() == 0 or c in live1:
                continue
            vals, cnt = np.unique(o1[m], return_counts=True)
            top, share = vals[cnt.argmax()], cnt.max() / m.sum()
            if top in live0 and share >= 0.5:
                fate[k] = top
            elif (~np.isin(o1[m], list(live0))).mean() >= 0.5:
                fate[k] = -2
            else:
                fate[k] = -9
        # absorption choices
        c_r, j_r, X = absorb_rows(g, o0, P)
        absorber = fate[c_r]
        bordering = np.zeros(len(ids), bool)
        hit = (j_r >= 0) & (j_r == absorber)
        bordering[c_r[hit]] = True
        chosen = hit | ((j_r == -1) & np.isin(absorber, [-1, -2])) | ((j_r == FAR) & (absorber >= 0) & ~bordering[c_r])
        keep = fate[c_r] != -9
        A.append((c_r[keep], X[keep], chosen[keep]))
        # break-up among those not absorbed
        nb = np.isin(fate, [-1, -2])
        B.append((breakup_x(P)[nb], fate[nb] == -2))
        # parcels of the polities alive at t+5
        par, S = parcels(g, o0)
        alive_owner = np.isin(S['owner'], list(live1))
        p_r, pj_r, PX = parcel_rows(g, o0, P, par, S)
        # destination of each parcel: majority owner at t+5 of its places
        idx = np.nonzero(ok & (par >= 0))[0]
        dest = np.full(len(S['owner']), -(10**9))
        if len(idx):
            k = par[idx].astype(np.int64) * (1 << 23) + (o1[idx].astype(np.int64) + 1)
            uk, cnt = np.unique(k, return_counts=True)
            pk = uk >> 23
            best = {}
            for pp, oo, cc in zip(pk.tolist(), ((uk & ((1 << 23) - 1)) - 1).tolist(), cnt.tolist()):
                if pp not in best or cc > best[pp][1]:
                    best[pp] = (oo, cc)
            for pp, (oo, _) in best.items():
                dest[pp] = oo
        dest = np.where((dest >= 0) & ~np.isin(dest, list(live0)), NEW, dest)
        has = dest[p_r] == pj_r
        hasp = np.zeros(len(S['owner']), bool)
        hasp[p_r[has]] = True
        chosen = has | ((pj_r == FAR) & ~hasp[p_r] & (dest[p_r] >= 0) & (dest[p_r] != NEW))
        keep = alive_owner[p_r] & (dest[p_r] > -(10**9))
        Pd.append((p_r[keep], PX[keep], chosen[keep]))
    return A, B, Pd


def _cl_nll(b, data, l2=1e-3):
    tot, grad = 0.0, np.zeros_like(b)
    for grp, X, chosen in data:
        if len(grp) == 0:
            continue
        u = X @ b
        starts = np.r_[0, np.nonzero(np.diff(grp))[0] + 1]
        lens = np.diff(np.r_[starts, len(u)])
        m = np.repeat(np.maximum.reduceat(u, starts), lens)
        e = np.exp(u - m)
        s = np.repeat(np.add.reduceat(e, starts), lens)
        p = e / s
        tot -= (u[chosen] - m[chosen] - np.log(s[chosen])).sum()
        grad -= X[chosen].sum(0) - (p[:, None] * X).sum(0)
    return tot + l2 * (b @ b), grad + 2 * l2 * b


def _lr_nll(b, data, l2=1e-3):
    tot, grad = 0.0, np.zeros_like(b)
    for X, y in data:
        z = X @ b
        p = 1 / (1 + np.exp(-z))
        tot -= (y * np.log(p + 1e-12) + (1 - y) * np.log(1 - p + 1e-12)).sum()
        grad -= X.T @ (y - p)
    return tot + l2 * (b @ b), grad + 2 * l2 * b


def fit(world, years, end):
    A, B, Pd = fit_data(world, years, end)
    out = {}
    for name, fn, data, feats in (
        ('absorb', _cl_nll, A, A_FEATS),
        ('breakup', _lr_nll, B, B_FEATS),
        ('parcel', _cl_nll, Pd, P_FEATS),
    ):
        r = minimize(fn, np.zeros(len(feats)), args=(data,), jac=True, method='L-BFGS-B')
        out[name] = dict(zip(feats, r.x.tolist()))
        out[name + '_nll'] = float(r.fun)
    return out


# ---- simulation ----------------------------------------------------------------------------------------------------


def _sample(grp, u, rng):
    starts = np.r_[0, np.nonzero(np.diff(grp))[0] + 1]
    lens = np.diff(np.r_[starts, len(u)])
    m = np.repeat(np.maximum.reduceat(u, starts), lens)
    e = np.exp(u - m)
    cs = np.cumsum(e)
    before = np.repeat(np.r_[0, cs[starts[1:] - 1]], lens)
    tot = np.repeat(np.add.reduceat(e, starts), lens)
    q = (cs - before) / tot
    r = np.repeat(rng.random(len(starts)), lens)
    rows = np.nonzero(q >= r)[0]
    _, first = np.unique(grp[rows], return_index=True)
    return rows[first]


def _split(g, own, c, S, par, rng, ids_new):
    """Bennett's create_factions on parcels: two seeds among c's border parcels grow in turn over c's parcels."""
    mine = np.nonzero(S['owner'] == c)[0]
    if len(mine) < 2:
        return own
    adj_all = {}
    w = g.w
    a, b = par[w.ea], par[w.eb]
    m = (a >= 0) & (b >= 0) & (a != b) & (S['owner'][np.maximum(a, 0)] == c) & (S['owner'][np.maximum(b, 0)] == c)
    for x, y in np.unique(np.stack([a[m], b[m]], 1), axis=0):
        adj_all.setdefault(int(x), []).append(int(y))
    border = [int(p) for p in mine if p in set(S['adj'][:, 0].tolist())] or [int(p) for p in mine]
    seeds = rng.choice(border, size=min(2, len(border)), replace=False)
    if len(seeds) < 2:
        return own
    side = {int(seeds[0]): 0, int(seeds[1]): 1}
    fronts = [[int(seeds[0])], [int(seeds[1])]]
    grew = True
    while grew:
        grew = False
        for f in (0, 1):
            nxt = []
            for p in fronts[f]:
                for q in adj_all.get(p, []):
                    if q not in side:
                        side[q] = f
                        nxt.append(q)
                        grew = True
            fronts[f] = nxt
    own = own.copy()
    for p, f in side.items():
        own[par == p] = ids_new[f]
    rest = [int(p) for p in mine if int(p) not in side]  # parcels not connected to a seed (exclaves)
    for p in rest:
        own[par == p] = ids_new[0]
    return own


def make(coef):
    ba = np.array([coef['absorb'][f] for f in A_FEATS])
    bb = np.array([coef['breakup'][f] for f in B_FEATS])
    bp = np.array([coef['parcel'][f] for f in P_FEATS])

    def run(world, o0, y0, horizon, runs, rng):
        g = run.g if run.g is not None and run.g.w is world else Geo(world)
        run.g = g
        out = np.empty((runs, world.P), np.int32)
        for r in range(runs):
            out[r] = simulate(g, o0.copy(), max(1, round(horizon / STEP)), ba, bb, bp, rng)
        return out

    run.g = None
    return run


def simulate(g, own, steps, ba, bb, bp, rng):
    next_id = NEW
    for _ in range(steps):
        live = own >= 0
        if not live.any():
            break
        P = polities(g, own)
        ids = P['ids']
        touched = np.zeros(len(ids), bool)
        # 1. absorption
        c_r, j_r, X = absorb_rows(g, own, P)
        rows = _sample(c_r, X @ ba, rng)
        absorber = np.full(len(ids), -1, np.int64)
        absorber[c_r[rows]] = j_r[rows]
        order = rng.permutation(len(ids))
        gone = set()
        new_own = own.copy()
        for k in order:
            j = absorber[k]
            if j == -1:
                continue
            c = ids[k]
            if c in gone:
                continue
            if j == FAR:
                new_own[own == c] = FAR
            else:
                kj = np.searchsorted(ids, j)
                if j in gone or touched[kj]:
                    continue
                new_own[own == c] = j
                touched[kj] = True
            gone.add(c)
            touched[k] = True
        own = new_own
        # 2. break-up of the untouched
        pb = 1 / (1 + np.exp(-(breakup_x(P) @ bb)))
        brk = (~touched) & (rng.random(len(ids)) < pb) & (P['size'] >= 2)
        if brk.any():
            par, S = parcels(g, own)
            for k in np.nonzero(brk)[0]:
                own = _split(g, own, ids[k], S, par, rng, (next_id, next_id + 1))
                next_id += 2
                touched[k] = True
        # 3. parcel transfers of the untouched
        P2 = polities(g, own)
        par, S = parcels(g, own)
        p_r, pj_r, PX = parcel_rows(g, own, P2, par, S)
        cand = ~np.isin(S['owner'], ids[touched])
        rows = _sample(p_r, PX @ bp, rng)
        dest = pj_r[rows]
        pid = p_r[rows]
        move = cand[pid] & (dest != S['owner'][pid])
        newc = {}
        own2 = own.copy()
        for p, d in zip(pid[move].tolist(), dest[move].tolist()):
            if d == NEW:
                c = int(S['owner'][p])
                if c not in newc:
                    newc[c] = next_id
                    next_id += 1
                d = newc[c]
            own2[par == p] = d
        own = own2
    return own
