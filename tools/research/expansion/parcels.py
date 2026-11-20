"""Parcels: the land one polity holds in one province (province x owner). Round 2 moves land parcel by parcel, so
the map stays in blocks the size of Bennett's regions (a province of our map is ~20'000 km2, his region ~25'000 km2).
"""

import json
from pathlib import Path

import numpy as np
from common import ROOT


class Geo:
    def __init__(self, world):
        self.w = world
        geo = json.loads(Path(ROOT, 'public', 'data', 'geo.json').read_text(encoding='utf-8'))
        kmpp = (geo['lon1'] - geo['lon0']) / geo['W'] * 111.32
        self.kx = world.x * kmpp * np.cos(np.radians(world.lat))
        self.ky = world.y * kmpp
        col = {int(p): k for k, p in enumerate(world.places)}
        self.prov = np.zeros(world.P, np.int64)
        for pi, p in enumerate(geo['provinces']):
            for loc in p['locs']:
                k = col.get(loc - 1)
                if k is not None:
                    self.prov[k] = pi
        self.K = np.maximum(world.pop, 1.0)


def parcels(g, own):
    """Parcel id per place (-1 where no owner), and per parcel: owner, size, sums for means, centroid."""
    w = g.w
    ok = own >= 0
    key = np.where(ok, g.prov * (1 << 22) + (own.astype(np.int64) & ((1 << 22) - 1)), -1)
    uk, pid = np.unique(key[ok], return_inverse=True)
    par = np.full(w.P, -1)
    par[ok] = pid
    n = len(uk)
    idx = np.nonzero(ok)[0]
    owner = np.zeros(n, np.int64)
    owner[pid] = own[idx]
    size = np.bincount(pid, minlength=n).astype(float)
    S = {
        'owner': owner,
        'size': size,
        'K': np.bincount(pid, weights=g.K[idx], minlength=n),
        'elev': np.bincount(pid, weights=w.elev[idx], minlength=n) / size / 1000,
        'rough': np.bincount(pid, weights=w.rough[idx], minlength=n) / size / 1000,
        'town': np.bincount(pid, weights=w.town[idx], minlength=n),
        'cx': np.bincount(pid, weights=g.kx[idx], minlength=n) / size,
        'cy': np.bincount(pid, weights=g.ky[idx], minlength=n) / size,
    }
    # parcel adjacency across owners
    a, b = par[w.ea], par[w.eb]
    m = (a >= 0) & (b >= 0) & (owner[np.maximum(a, 0)] != owner[np.maximum(b, 0)])
    pairs = np.unique(np.stack([a[m], b[m]], 1), axis=0)
    S['adj'] = pairs  # (parcel, neighbouring parcel of another owner)
    return par, S


def polities(g, own):
    """Per polity: ids, places, sum K (elites), border places, depot (centroid), towns."""
    w = g.w
    ok = own >= 0
    ids, inv = np.unique(own[ok], return_inverse=True)
    n = len(ids)
    idx = np.nonzero(ok)[0]
    cnt = np.bincount(inv, minlength=n).astype(float)
    pol = (own[w.ea] != own[w.eb]) & (own[w.ea] >= 0)
    bp = np.zeros(w.P, bool)
    bp[w.ea[pol]] = True
    return {
        'ids': ids,
        'size': cnt,
        'K': np.bincount(inv, weights=g.K[idx], minlength=n),
        'border': np.bincount(inv, weights=bp[idx].astype(float), minlength=n),
        'town': np.bincount(inv, weights=w.town[idx], minlength=n),
        'cx': np.bincount(inv, weights=g.kx[idx], minlength=n) / cnt,
        'cy': np.bincount(inv, weights=g.ky[idx], minlength=n) / cnt,
    }
