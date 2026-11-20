"""M1-P, round 2: Bennett 2022 (bennett.py) on provinces instead of places, with his own step of 2 years.

Our provinces hold 12 places on average, ~20'000 km2, about Bennett's region of ~25'000 km2 (plan, "Einheit
Provinz"), so his step of 2 years can be used as it is, without the rate per year that round 1 had to estimate.
A territory is the land one owner holds in one province at the start (a parcel, parcels.py), so the start map is
kept exactly; the land without an owner in a province is one hinterland territory. Per territory: depot distance
from its centre, capacity = sum of the places' capacity, not attackable when its mean elevation is above 3000 m.
Everything else is bennett.simulate unchanged. s (Bennett: 1.1 to 2.1) is estimated on the round-2 fitting years.
"""

from types import SimpleNamespace

import bennett
import numpy as np
from parcels import Geo

STEP_YEARS = 2.0


class TerrGeo:
    def __init__(self, pg, own0):
        w = pg.w
        key = pg.prov * (1 << 22) + (own0.astype(np.int64) & ((1 << 22) - 1))
        uk, tid = np.unique(key, return_inverse=True)
        n = len(uk)
        cnt = np.bincount(tid, minlength=n).astype(float)
        self.tid = tid
        self.owner = np.zeros(n, np.int32)
        self.owner[tid] = own0
        self.kx = np.bincount(tid, weights=pg.kx, minlength=n) / cnt
        self.ky = np.bincount(tid, weights=pg.ky, minlength=n) / cnt
        self.K = np.bincount(tid, weights=pg.K, minlength=n)
        self.attackable = np.bincount(tid, weights=w.elev, minlength=n) / cnt < bennett.MAX_ELEV
        a, b = tid[w.ea], tid[w.eb]
        m = a != b
        pairs = np.unique(np.stack([a[m], b[m]], 1), axis=0)
        ea, eb = pairs[:, 0], pairs[:, 1]
        ekm = np.hypot(self.kx[ea] - self.kx[eb], self.ky[ea] - self.ky[eb])
        self.w = SimpleNamespace(ea=ea, eb=eb, P=n)
        self.L1 = bennett.L(np.median(ekm), bennett.S_HINTERLAND)


def make(s=2.1):
    def run(world, o0, y0, horizon, runs, rng):
        if run.pg is None or run.pg.w is not world:
            run.pg = Geo(world)
        tg = TerrGeo(run.pg, o0)
        steps = int(round(horizon / STEP_YEARS))
        out = np.empty((runs, world.P), np.int32)
        for r in range(runs):
            t_own = bennett.simulate(tg, tg.owner.copy(), steps, STEP_YEARS, s, rng, None, None)
            out[r] = t_own[tg.tid]
        return out

    run.pg = None
    return run
