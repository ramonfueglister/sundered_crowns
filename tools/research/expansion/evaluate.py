"""Scoring of the empire-expansion study (doc "Forschungsplan", section Messverfahren).

A model is a function run(world, owner0, year0, horizon, runs, rng) -> int array (runs x P) of owners after `horizon`
years; ids >= NEW mark polities that did not exist at the start (scored as one class "new").
Score per place: multi-class Brier over the run frequencies; skill against persistence (M0).
"""

import numpy as np

NEW = 1 << 20
SPLITS = {'fit': range(1000, 1226, 5), 'select': range(1226, 1266, 5), 'test': range(1291, 1476, 5)}
# the last year whose map a split may look at: no fit run sees the selection years, no selection run the test years
END = {'fit': 1250, 'select': 1290, 'test': 1500}
# round 2 (plan section "Runde 2", 20 Nov 2026): 1291-1500 was seen in round 1, so it becomes the selection; the test
# moves to 1501-1848, which no model of the study has been scored on
SPLITS.update({'fit2': range(1000, 1266, 5), 'select2': range(1291, 1476, 5), 'test2': range(1501, 1824, 5)})
END.update({'fit2': 1290, 'select2': 1500, 'test2': 1848})


def score(world, model, split, horizon, runs=20, level='top', seed=1, europe_only=False):
    years = [y for y in SPLITS[split] if y + horizon <= END[split]]
    rng = np.random.default_rng(seed)
    acc = {'brier': 0.0, 'brier0': 0.0, 'n': 0, 'changed': 0, 'hit': 0, 'stayed': 0, 'false': 0}
    for y0 in years:
        o0 = world.row(y0, level)
        o1 = world.row(y0 + horizon, level)
        live = set(np.unique(o0[o0 >= 0]).tolist())
        truth = np.where(np.isin(o1, list(live)), o1, NEW)
        ok = (o0 >= 0) & (o1 >= 0)
        if europe_only:
            ok &= world.europe
        sims = model(world, o0, y0, horizon, runs, rng)
        sims = np.where(sims >= NEW, NEW, sims)
        idx = np.nonzero(ok)[0]
        S = sims[:, idx]
        t = truth[idx]
        # Brier = sum_k p_k^2 - 2 p_true + 1, p from the run frequencies
        srt = np.sort(S, axis=0)
        sq = np.zeros(len(idx))
        for c in range(S.shape[1]):
            _, cnt = np.unique(srt[:, c], return_counts=True)
            sq[c] = ((cnt / runs) ** 2).sum()
        pt = (t == S).mean(axis=0)
        acc['brier'] += (sq - 2 * pt + 1).sum()
        acc['brier0'] += (2.0 * (o0[idx] != t)).sum()
        ch = o0[idx] != t
        acc['n'] += len(idx)
        acc['changed'] += ch.sum()
        acc['hit'] += (ch & (pt >= 0.5)).sum()
        stay = ~ch
        acc['stayed'] += stay.sum()
        acc['false'] += (stay & ((o0[idx] != S).mean(axis=0) > 0.5)).sum()
    acc['starts'] = len(years)
    return {
        'starts': len(years),
        'skill': 1 - acc['brier'] / max(acc['brier0'], 1e-9),
        'brier': acc['brier'] / acc['n'],
        'brier0': acc['brier0'] / acc['n'],
        'hit_rate': acc['hit'] / max(acc['changed'], 1),
        'false_alarm': acc['false'] / max(acc['stayed'], 1),
        'changed_share': acc['changed'] / acc['n'],
    }


def persistence(world, o0, y0, horizon, runs, rng):
    return np.broadcast_to(o0, (runs, len(o0))).copy()


def border_noise(rate):
    """Null model without any mechanism: each year a place on a border goes, with probability `rate`, to the owner
    of a random neighbour. Answers whether a model's skill comes from its mechanism or only from spreading
    probability over border places."""

    def run(world, o0, y0, horizon, runs, rng):
        out = np.empty((runs, world.P), np.int32)
        for r in range(runs):
            o = o0.copy()
            for _ in range(horizon):
                oa, ob = o[world.ea], o[world.eb]
                edge = (oa != ob) & (ob >= 0) & (oa >= 0)
                k = np.nonzero(edge)[0]
                if len(k) == 0:
                    continue
                pick = rng.permutation(k)
                pl = world.ea[pick]
                _, first = np.unique(pl, return_index=True)
                pick = pick[first]
                go = rng.random(len(pick)) < rate
                o[world.ea[pick[go]]] = ob[pick[go]]
            out[r] = o
        return out

    return run
