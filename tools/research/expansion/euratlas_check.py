"""Second source (plan: "mit Euratlas gegenpruefen"): start each model from the Cliopatria map of year A and compare the
borders it predicts for year B with the Euratlas map of year B (data/history/.../euratlas_<B>_places.json, sovereign
holder per place). Names of the two sources differ, so the score is about borders, not names: for every land edge
between two places that both have a sovereign in Euratlas B, truth = the two places have different sovereigns; the
model's probability = share of runs in which their owners differ. Brier skill against the Cliopatria map of year A."""

import json
from pathlib import Path

import numpy as np
from common import ROOT


def euratlas(year):
    p = Path(
        ROOT,
        'data',
        'history',
        '1291' if year == 1300 else 'borders',
        'ref' if year == 1300 else 'euratlas',
        f'euratlas_{year}_places.json',
    )
    return np.array(json.loads(p.read_text(encoding='utf-8'))['place'])


def edge_skill(world, model, a, b, runs=20, seed=7, europe_only=True):
    rng = np.random.default_rng(seed)
    ea_ = euratlas(b)[world.places]
    o0 = world.row(a)
    m = world.ea < world.eb
    i, j = world.ea[m], world.eb[m]
    ok = (ea_[i] >= 0) & (ea_[j] >= 0) & (o0[i] >= 0) & (o0[j] >= 0)
    if europe_only:
        ok &= world.europe[i] & world.europe[j]
    i, j = i[ok], j[ok]
    truth = (ea_[i] != ea_[j]).astype(float)
    sims = model(world, o0, a, b - a, runs, rng)
    p = (sims[:, i] != sims[:, j]).mean(0)
    p0 = (o0[i] != o0[j]).astype(float)
    bm, b0 = ((p - truth) ** 2).mean(), ((p0 - truth) ** 2).mean()
    return {
        'edges': int(len(i)),
        'border_share': float(truth.mean()),
        'brier': float(bm),
        'brier0': float(b0),
        'skill': float(1 - bm / b0),
    }
