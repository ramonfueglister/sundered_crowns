"""Round-2 scores (plan section "Runde 2"): in one pass over the same runs
- place: Brier skill against persistence, as evaluate.score (main score at 25 years)
- edge: Brier skill on the land edges between two places with an owner at both ends; truth = the two places have
  different owners in year t+h, the model's probability = share of runs in which they differ. It tells whether the
  map stays in one piece.
- patterns as in Bennett 2022 (Fig. 4-5): number of polities, share of the places held by the three largest, and
  the Kolmogorov-Smirnov distance between the polity sizes (places) of a run and of the real map in t+h; each as
  the mean absolute error over runs and starts, next to the same error of the start map (persistence).
"""

import numpy as np
from evaluate import END, NEW, SPLITS
from transitions import FAR


def _patterns(o, valid):
    v = o[valid & (o >= 0) & (o != FAR)]
    if len(v) == 0:
        return 0, 0.0, np.zeros(1)
    _, cnt = np.unique(v, return_counts=True)
    cnt = np.sort(cnt)[::-1]
    return len(cnt), cnt[:3].sum() / valid.sum(), np.log(cnt)


def _ks(a, b):
    xs = np.sort(np.r_[a, b])
    fa = np.searchsorted(np.sort(a), xs, 'right') / len(a)
    fb = np.searchsorted(np.sort(b), xs, 'right') / len(b)
    return np.abs(fa - fb).max()


def score2(world, model, split, horizon, runs=30, seed=1, europe_only=False):
    rng = np.random.default_rng(seed)
    years = [y for y in SPLITS[split] if y + horizon <= END[split]]
    acc = dict.fromkeys(('pb', 'pb0', 'pn', 'eb', 'eb0', 'en', 'npol', 'npol0', 'top3', 'top30', 'ks', 'ks0', 'k'), 0.0)
    m_e = world.ea < world.eb
    ei, ej = world.ea[m_e], world.eb[m_e]
    for y0 in years:
        o0, o1 = world.row(y0), world.row(y0 + horizon)
        live = set(np.unique(o0[o0 >= 0]).tolist())
        truth = np.where(np.isin(o1, list(live)), o1, NEW)
        ok = (o0 >= 0) & (o1 >= 0)
        if europe_only:
            ok &= world.europe
        sims = model(world, o0, y0, horizon, runs, rng)
        S = np.where(sims >= NEW, NEW, sims)
        idx = np.nonzero(ok)[0]
        Si, t = S[:, idx], truth[idx]
        srt = np.sort(Si, axis=0)
        # sum_k p_k^2 from runs of equal values per column
        sq = np.zeros(len(idx))
        for c in range(len(idx)):
            _, cnt = np.unique(srt[:, c], return_counts=True)
            sq[c] = ((cnt / runs) ** 2).sum()
        pt = (Si == t).mean(0)
        acc['pb'] += (sq - 2 * pt + 1).sum()
        acc['pb0'] += (2.0 * (o0[idx] != t)).sum()
        acc['pn'] += len(idx)
        # edges (raw ids: two different new polities are different owners)
        e_ok = ok[ei] & ok[ej]
        a, b = ei[e_ok], ej[e_ok]
        te = (o1[a] != o1[b]).astype(float)
        pe = (sims[:, a] != sims[:, b]).mean(0)
        acc['eb'] += ((pe - te) ** 2).sum()
        acc['eb0'] += (((o0[a] != o0[b]).astype(float) - te) ** 2).sum()
        acc['en'] += len(a)
        # patterns
        n1, t1, s1 = _patterns(o1, ok)
        n0, t0, s0 = _patterns(o0, ok)
        acc['npol0'] += abs(n0 - n1)
        acc['top30'] += abs(t0 - t1)
        acc['ks0'] += _ks(s0, s1)
        for r in range(runs):
            nr, tr, sr = _patterns(sims[r], ok)
            acc['npol'] += abs(nr - n1) / runs
            acc['top3'] += abs(tr - t1) / runs
            acc['ks'] += _ks(sr, s1) / runs
        acc['k'] += 1
    k = max(acc['k'], 1)
    return {
        'starts': len(years),
        'place_skill': 1 - acc['pb'] / max(acc['pb0'], 1e-9),
        'edge_skill': 1 - acc['eb'] / max(acc['eb0'], 1e-9),
        'npol_err': acc['npol'] / k,
        'npol_err0': acc['npol0'] / k,
        'top3_err': acc['top3'] / k,
        'top3_err0': acc['top30'] / k,
        'ks': acc['ks'] / k,
        'ks0': acc['ks0'] / k,
    }
