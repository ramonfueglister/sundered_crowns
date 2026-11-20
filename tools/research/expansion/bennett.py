"""M1: the agrarian war of Bennett 2022 on our place graph.

Bennett, J. S. (2022). Retrodicting the rise, spread, and fall of large-scale states in the Old World. PLOS ONE 17(1):
e0261816, doi 10.1371/journal.pone.0261816; supplement NADSM_SM_PLoS_v3.pdf and code NADSM.py in
github.com/jbennettgit/NADSM_PLOSONE v1.0.4 (CC BY 4.0). What is taken over, with the place in his work:
  - force at a contested place: H(d) = (sum of the polity's elites / number of its places on a political border) * L(d)
    (supplement Eq. 6; NADSM.py War.execute, PolityCommon.update_power)
  - L(d) = (1 + 1/s)^(-d / 100 km), d = straight-line km from the depot (Eq. 7, Boulding 1962; power_projection_factor)
  - the depot is the polity's geographic centre (supplement p. 5; update_capital: mean lat/lon of its regions)
  - annexation when H_attacker / H_defender >= Delta = 1.2 (Eq. 8; War_victory)
  - each step a polity writes orders against at most 45 % of the neighbouring places it can attack, chosen at random;
    all orders of all polities are shuffled and executed, an order is dropped when either place changed hands
    (supplement p. 5; machiavelli, attack_budget_fraction)
  - after a victory the vanquished lose 80 % of their projected army, the victors 10 % of that, taken from all places
    of each polity in proportion to their elites (vanquished/victorious_death_fraction)
  - places above 3000 m are not attacked (War_max_elevation)
  - places with no polity are hinterland: defended by their own elites / 4 (hinterland_border_cost) at L = 1, attack
    with their own elites / 4 at the one-region L with s_h = 0.5 * 1.1 (power_scale_1, hinterland_s_scale_factor); a
    hinterland place that wins becomes a new state (hinterland_arise = 1)
  - elites regrow logistically to their share of the carrying capacity at 1.35 %/year (supplement Eq. 1, base_birth_rate)
What differs, and why:
  - carrying capacity per place = the population of the place in public/data/geo.json (Bennett: biome x density); only
    ratios of forces matter in Eq. 8, so the elite share cancels.
  - Bennett's step is 2 years on regions of ~25'000 km2 (spacing ~2 degrees); our places are ~1'700 km2. `rounds` (steps
    per year) is estimated on the fitting years instead of being fixed (a front moves one place per won battle).
  - s: Bennett's s rises from 1.1 to at most 2.1 by nomadic pressure; the maps give no s, so one s for all states is
    estimated on the fitting years (within 1.1..2.1).
  - civil war: Bennett splits a state when its elites reach 85 % of their carrying capacity (demographic-structural);
    the elite state of a real polity in a given year is not on any map, so M1 has no civil war (M2 adds the size
    hazard of Turchin et al. 2013).
"""

import json
from pathlib import Path

import numpy as np
from common import ROOT
from evaluate import NEW

DELTA = 1.2
BUDGET = 0.45
LOSS_VANQUISHED = 0.8
LOSS_VICTOR = 0.1
MAX_ELEV = 3000.0
HINTERLAND_COST = 4.0
S_HINTERLAND = 0.5 * 1.1
BIRTH = 0.0135


def L(d_km, s):
    return (1.0 + 1.0 / s) ** (-d_km / 100.0)


class Geo:
    """Arrays a run needs, in km."""

    def __init__(self, world):
        self.w = world
        geo = json.loads(Path(ROOT, 'public', 'data', 'geo.json').read_text(encoding='utf-8'))
        kmpp = (geo['lon1'] - geo['lon0']) / geo['W'] * 111.32
        self.kx = world.x * kmpp * np.cos(np.radians(world.lat))
        self.ky = world.y * kmpp
        self.K = np.maximum(world.pop, 1.0)
        self.attackable = world.elev < MAX_ELEV
        # one-region distance for the hinterland: the median edge length
        self.L1 = L(np.median(world.ekm), S_HINTERLAND)


def make(s=2.1, rounds=1.0, extra_defense=None, collapse=None):
    """A model function for evaluate.score. `extra_defense(geo, places) -> factor` multiplies the defender's force
    (used by M3); `collapse(geo, own, rng, dt) -> own` splits states (used by M2/M3)."""

    def run(world, o0, y0, horizon, runs, rng):
        g = run.geo if getattr(run, 'geo', None) is not None and run.geo.w is world else Geo(world)
        run.geo = g
        out = np.empty((runs, world.P), np.int32)
        steps = int(round(horizon * rounds))
        dt = 1.0 / rounds
        for r in range(runs):
            out[r] = simulate(g, o0.copy(), steps, dt, s, rng, extra_defense, collapse)
        return out

    run.geo = None
    return run


def simulate(g, own, steps, dt, s, rng, extra_defense, collapse):
    w = g.w
    ea, eb = w.ea, w.eb
    E = g.K.copy()  # elites, in units of their share of capacity
    next_id = NEW
    for _ in range(steps):
        if collapse is not None:
            own, next_id = collapse(g, own, rng, dt, next_id)
        # depots and forces per polity
        st = own >= 0
        ids, inv = np.unique(np.where(st, own, -1), return_inverse=True)
        n = len(ids)
        sumE = np.bincount(inv, weights=E, minlength=n)
        cnt = np.bincount(inv, minlength=n).astype(float)
        cx = np.bincount(inv, weights=g.kx, minlength=n) / np.maximum(cnt, 1)
        cy = np.bincount(inv, weights=g.ky, minlength=n) / np.maximum(cnt, 1)
        oa, ob = own[ea], own[eb]
        pol = oa != ob
        border_place = np.zeros(w.P, bool)
        border_place[ea[pol]] = True
        nb = np.bincount(inv, weights=border_place.astype(float), minlength=n)
        raw = sumE / np.maximum(nb, 1)
        # orders: a polity (or a hinterland place) against a neighbouring place of another owner
        cand = pol & g.attackable[eb] & ~((oa < 0) & (ob < 0))  # hinterland does not fight hinterland here
        k = np.nonzero(cand)[0]
        if len(k) == 0:
            continue
        att_key = np.where(oa[k] >= 0, oa[k], -2 - ea[k])  # each hinterland place acts alone
        # one order per (attacker, target)
        key = att_key.astype(np.int64) * (w.P + 1) + eb[k]
        _, first = np.unique(key, return_index=True)
        k = k[first]
        att_key = att_key[first]
        # attack budget: per attacker, a random 45 % (floor) of its targets
        rnd = rng.random(len(k))
        order = np.lexsort((rnd, att_key))
        k, att_key = k[order], att_key[order]
        starts = np.r_[0, np.nonzero(np.diff(att_key))[0] + 1]
        sizes = np.diff(np.r_[starts, len(k)])
        rank = np.arange(len(k)) - np.repeat(starts, sizes)
        keep = rank < np.floor(np.repeat(sizes, sizes) * BUDGET)
        k = k[keep]
        if len(k) == 0:
            continue
        # shuffle all orders; one order per target place (the first after shuffling) and drop orders whose
        # attacking place is itself taken earlier in the same step
        k = k[rng.permutation(len(k))]
        _, first = np.unique(eb[k], return_index=True)
        k = k[np.sort(first)]
        a_pl, t_pl = ea[k], eb[k]
        a_own, t_own = own[a_pl], own[t_pl]
        ia = np.searchsorted(ids, a_own)
        it = np.searchsorted(ids, t_own)
        # attacker force at the target
        d_att = np.hypot(g.kx[t_pl] - cx[ia], g.ky[t_pl] - cy[ia])
        H_att = np.where(a_own >= 0, raw[ia] * L(d_att, s), E[a_pl] / HINTERLAND_COST * g.L1)
        d_def = np.hypot(g.kx[t_pl] - cx[it], g.ky[t_pl] - cy[it])
        H_def = np.where(t_own >= 0, raw[it] * L(d_def, s), E[t_pl] / HINTERLAND_COST)
        if extra_defense is not None:
            H_def = H_def * extra_defense(g, t_pl)
        win = H_att >= DELTA * H_def
        # an attacking place that is the target of another winning order this step loses its order
        won_targets = np.zeros(w.P, bool)
        won_targets[t_pl[win]] = True
        win &= ~won_targets[a_pl] | (rng.random(len(win)) < 0.5)
        if win.any():
            # deaths, spread over the polity's places in proportion to their elites
            dead_v = LOSS_VANQUISHED * H_def[win]
            dead_w = LOSS_VICTOR * dead_v
            lossv = np.bincount(it[win], weights=dead_v, minlength=n)
            lossw = np.bincount(ia[win], weights=dead_w, minlength=n)
            frac = (lossv + lossw) / np.maximum(sumE, 1e-9)
            E = E * np.clip(1 - frac[inv] * st, 0, 1)
            # hinterland winners become new states; several places of one new state are not merged (rare)
            new_owner = a_own[win].copy()
            h = new_owner < 0
            if h.any():
                new_owner[h] = next_id + np.arange(h.sum())
                own[a_pl[win][h]] = new_owner[h]
                next_id += int(h.sum())
            own[t_pl[win]] = new_owner
        # elites regrow toward capacity
        E = E + BIRTH * dt * E * (1 - E / g.K)
    return own
