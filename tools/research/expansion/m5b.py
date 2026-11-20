"""M5b, round 2: M5 with the two corrections of the plan amendment of 20 Nov (plan doc, "Runde 2: Änderung am Plan").

Both rest only on the fitting years (starts 1000-1265, maps up to 1290), measured after M5 overshot the number of
polities on the selection years (events_check.py, the numbers are in the doc):
  1. Secession is an event of the state, not of the single province. On the fitting years 9.5 parcels per 5 years go
     to polities that did not exist before, but they form only 2.0 new polities; M5 draws every parcel on its own and
     makes 7.2. So M5b asks once per polity and step whether a part of it splits off (logistic, same form as the
     break-up: constant, log places, towns per place; Turchin et al. 2013 tie disintegration to size, Abramson 2017
     to towns). On the fitting years one such event made 1.7 new polities on average (52 events, 88 new polities),
     so the blocks of one event are drawn together: one of the 52 observed events is drawn, and each of its blocks
     takes the same share of the polity's land as it did then. Each block grows over the polity's parcels from a
     random border parcel (Bennett 2022, create_factions: seeds drawn among the border territories, the faction grows
     into touching territory).
  2. A break-up does not always give two halves. Bennett 2022 draws the number of factions from faction_odds (his
     runs: always 2); on the fitting years 27 of 31 break-ups went to one new polity with almost all the land (a new
     regime on the same land, which the lineage rule did not catch), 4 to two. M5b draws the number from these counts.
Absorption and break-up chance keep the M5 weights (same data). The parcel choice is refitted without "new", on the
parcels that did not secede (secession is now step 3). Everything else as m5.py.
"""

import m5
import numpy as np
from evaluate import NEW
from m5 import A_FEATS, B_FEATS, STEP, absorb_rows, breakup_x
from parcels import Geo, parcels, polities
from scipy.optimize import minimize
from transitions import FAR

S_FEATS = ['const', 'size_c', 'town_c']
Q_FEATS = [f for f in m5.P_FEATS if f not in ('new', 'new_size')]
_QCOLS = [m5.P_FEATS.index(f) for f in Q_FEATS]


def parcel_rows_b(g, own, P, par, S):
    p, j, X = m5.parcel_rows(g, own, P, par, S)
    keep = j != NEW
    return p[keep], j[keep], X[keep][:, _QCOLS]


def fit_data_b(world, years, end):
    """Secession rows, block shares, successor counts of break-ups, and the parcel rows without "new"."""
    g = Geo(world)
    Sec, shares, nsucc, Qd = [], [], [], []
    for y0 in years:
        if y0 + STEP > end:
            continue
        o0, o1 = world.row(y0), world.row(y0 + STEP)
        ok = (o0 >= 0) & (o1 >= 0)
        live0 = set(np.unique(o0[o0 >= 0]).tolist())
        live1 = set(np.unique(o1[o1 >= 0]).tolist())
        P = polities(g, o0)
        ids = P['ids']
        newm = ok & ~np.isin(o1, list(live0))
        # secession: the polity survives and is the main source of one or more new polities
        block = {}
        for n in np.unique(o1[newm]):
            m = newm & (o1 == n)
            v, c = np.unique(o0[m], return_counts=True)
            src = int(v[c.argmax()])
            if src in live1:
                share = c.max() / ((o0 == src) & ok).sum()
                block.setdefault(src, []).append(round(float(share), 4))
        alive = np.array([int(c) in live1 and ((o0 == c) & ok).any() for c in ids])
        y = np.array([int(c) in block for c in ids])
        Sec.append((breakup_x(P)[alive], y[alive]))
        shares += [sorted(v, reverse=True) for v in block.values()]
        # break-ups: how many new polities take at least 10 % of the land
        for c in live0 - live1:
            m = (o0 == c) & ok
            if m.sum() == 0:
                continue
            d = o1[m]
            isnew = ~np.isin(d, list(live0))
            if isnew.mean() < 0.5:
                continue
            _, cnt = np.unique(d[isnew], return_counts=True)
            nsucc.append(max(1, int((cnt / m.sum() >= 0.1).sum())))
        # parcels of surviving polities that did not go to a new polity
        par, S = parcels(g, o0)
        p_r, pj_r, PX = parcel_rows_b(g, o0, P, par, S)
        idx = np.nonzero(ok & (par >= 0))[0]
        dest = np.full(len(S['owner']), -(10**9))
        if len(idx):
            k = par[idx].astype(np.int64) * (1 << 23) + (o1[idx].astype(np.int64) + 1)
            uk, cnt = np.unique(k, return_counts=True)
            best = {}
            for pp, oo, cc in zip((uk >> 23).tolist(), ((uk & ((1 << 23) - 1)) - 1).tolist(), cnt.tolist()):
                if pp not in best or cc > best[pp][1]:
                    best[pp] = (oo, cc)
            for pp, (oo, _) in best.items():
                dest[pp] = oo
        to_new = (dest >= 0) & ~np.isin(dest, list(live0))
        has = dest[p_r] == pj_r
        hasp = np.zeros(len(S['owner']), bool)
        hasp[p_r[has]] = True
        chosen = has | ((pj_r == FAR) & ~hasp[p_r] & (dest[p_r] >= 0))
        keep = np.isin(S['owner'], list(live1))[p_r] & (dest[p_r] > -(10**9)) & ~to_new[p_r]
        Qd.append((p_r[keep], PX[keep], chosen[keep]))
    return Sec, shares, nsucc, Qd


def fit_b(world, years, end, m5coef):
    Sec, shares, nsucc, Qd = fit_data_b(world, years, end)
    r = minimize(m5._lr_nll, np.zeros(len(S_FEATS)), args=(Sec,), jac=True, method='L-BFGS-B')
    q = minimize(m5._cl_nll, np.zeros(len(Q_FEATS)), args=(Qd,), jac=True, method='L-BFGS-B')
    return {
        'absorb': m5coef['absorb'],
        'breakup': m5coef['breakup'],
        'secession': dict(zip(S_FEATS, r.x.tolist())),
        'secession_nll': float(r.fun),
        'secession_events': int(sum(int(y.sum()) for _, y in Sec)),
        'secession_blocks': sorted(shares),
        'breakup_successors': sorted(nsucc),
        'parcel': dict(zip(Q_FEATS, q.x.tolist())),
        'parcel_nll': float(q.fun),
    }


# ---- simulation ----------------------------------------------------------------------------------------------------


def _own_adj(g, par, own, c):
    """Parcel adjacency inside polity c, and c's border parcels (touching land of another owner or none)."""
    w = g.w
    a, b = w.ea, w.eb
    mine_a = own[a] == c
    inner = mine_a & (own[b] == c) & (par[a] != par[b])
    adj = {}
    for x, y in np.unique(np.stack([par[a[inner]], par[b[inner]]], 1), axis=0):
        adj.setdefault(int(x), []).append(int(y))
    border = np.unique(par[a[mine_a & (own[b] != c)]]).tolist()
    return adj, border


def _secede(g, own, c, S, par, share, rng, new_id):
    """One block of c, grown breadth-first from a random border parcel until it holds share x c's places."""
    mine = np.nonzero(S['owner'] == c)[0]
    if len(mine) < 2:
        return own
    adj, border = _own_adj(g, par, own, c)
    border = border or mine.tolist()
    target = max(1.0, share * S['size'][mine].sum())
    seed = int(rng.choice(border))
    taken, front, got = [seed], [seed], S['size'][seed]
    seen = {seed}
    while got < target and front and len(taken) < len(mine) - 1:
        nxt = []
        for p in front:
            nb = [q for q in adj.get(p, []) if q not in seen]
            rng.shuffle(nb)
            for q in nb:
                if got >= target or len(taken) >= len(mine) - 1:
                    break
                seen.add(q)
                taken.append(q)
                nxt.append(q)
                got += S['size'][q]
        front = nxt
    own = own.copy()
    own[np.isin(par, taken)] = new_id
    return own


def make(coef):
    ba = np.array([coef['absorb'][f] for f in A_FEATS])
    bb = np.array([coef['breakup'][f] for f in B_FEATS])
    bs = np.array([coef['secession'][f] for f in S_FEATS])
    bq = np.array([coef['parcel'][f] for f in Q_FEATS])
    events = coef['secession_blocks']
    nsucc = np.array(coef['breakup_successors'])

    def run(world, o0, y0, horizon, runs, rng):
        g = run.g if run.g is not None and run.g.w is world else Geo(world)
        run.g = g
        out = np.empty((runs, world.P), np.int32)
        for r in range(runs):
            out[r] = simulate(g, o0.copy(), max(1, round(horizon / STEP)), ba, bb, bs, bq, events, nsucc, rng)
        return out

    run.g = None
    return run


def simulate(g, own, steps, ba, bb, bs, bq, events, nsucc, rng):
    next_id = NEW
    for _ in range(steps):
        if not (own >= 0).any():
            break
        P = polities(g, own)
        ids = P['ids']
        touched = np.zeros(len(ids), bool)
        # 1. absorption (as M5)
        c_r, j_r, X = absorb_rows(g, own, P)
        rows = m5._sample(c_r, X @ ba, rng)
        absorber = np.full(len(ids), -1, np.int64)
        absorber[c_r[rows]] = j_r[rows]
        gone = set()
        new_own = own.copy()
        for k in rng.permutation(len(ids)):
            j = absorber[k]
            if j == -1:
                continue
            c = ids[k]
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
        # 2. break-up of the untouched: one or two successors, drawn from the fitting years
        pb = 1 / (1 + np.exp(-(breakup_x(P) @ bb)))
        brk = (~touched) & (rng.random(len(ids)) < pb)
        if brk.any():
            par, S = parcels(g, own)
            for k in np.nonzero(brk)[0]:
                if rng.choice(nsucc) >= 2 and P['size'][k] >= 2:
                    own = m5._split(g, own, ids[k], S, par, rng, (next_id, next_id + 1))
                    next_id += 2
                else:
                    own = np.where(own == ids[k], next_id, own)
                    next_id += 1
                touched[k] = True
        # 3. secession of blocks from the untouched: the block shares of one observed event
        ps = 1 / (1 + np.exp(-(breakup_x(P) @ bs)))
        sec = (~touched) & (rng.random(len(ids)) < ps)
        for k in np.nonzero(sec)[0]:
            size0 = P['size'][k]
            for share in events[rng.integers(len(events))]:
                par, S = parcels(g, own)
                left = S['size'][S['owner'] == ids[k]].sum()
                own = _secede(g, own, ids[k], S, par, share * size0 / max(left, 1), rng, next_id)
                next_id += 1
        # 4. parcel transfers of the untouched polities (not of blocks new in this step)
        P2 = polities(g, own)
        par, S = parcels(g, own)
        p_r, pj_r, QX = parcel_rows_b(g, own, P2, par, S)
        cand = np.isin(S['owner'], ids[~touched])
        rows = m5._sample(p_r, QX @ bq, rng)
        dest, pid = pj_r[rows], p_r[rows]
        move = cand[pid] & (dest != S['owner'][pid])
        own2 = own.copy()
        for p, d in zip(pid[move].tolist(), dest[move].tolist()):
            own2[par == p] = d
        own = own2
    return own
