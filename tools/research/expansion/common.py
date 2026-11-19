"""Shared data for the empire-expansion study: the place graph of the map and the yearly owners from prep_owners.py.

The graph: land places of the frame, linked by the land and coast edges of public/data/geo.json and the straits
(as src/sim/world.ts builds its adjacency); edge length in km from the map coordinates (world.ts kmPerPx).
"""

import json
import math
import os
from pathlib import Path

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
EUROPE = {
    'france',
    'low_countries',
    'british_isles',
    'germany',
    'iberia',
    'italy',
    'scandinavia',
    'baltic',
    'poland',
    'bohemia',
    'hungary',
    'balkans',
    'greece',
    'rus',
    'atlantic_islands',
}


class World:
    def __init__(self, owners_npz):
        geo = json.loads(Path(ROOT, 'public', 'data', 'geo.json').read_text(encoding='utf-8'))
        d = np.load(owners_npz)
        self.years = d['years']
        self.first = int(self.years[0])
        self.places = d['places']  # place ids of the map, one column each
        self.own = d['own']
        self.top = d['top']
        self.names = d['names']
        P = len(self.places)
        col = {int(p): k for k, p in enumerate(self.places)}
        loc = geo['loc']
        take = lambda key: np.array([loc[key][int(p)] or 0 for p in self.places], dtype=float)  # noqa: E731
        self.x, self.y = take('x'), take('y')
        self.lat = take('lat')
        self.elev = take('elev')  # m
        self.rough = take('rough')
        self.area = take('area')  # km2
        self.pop = take('pop')
        self.town = take('size')
        self.region = np.array([loc['region_key'][int(p)] for p in self.places])
        self.europe = np.isin(self.region, list(EUROPE))
        kmpp0 = (geo['lon1'] - geo['lon0']) / geo['W'] * 111.32
        kmpp = kmpp0 * np.cos(np.radians(self.lat))
        a, b, km = [], [], []
        pairs = [(e[0], e[1]) for e in geo['edges'] if e[2] in (0, 1)] + [(s[0], s[1]) for s in geo['straits']]
        for a1, b1 in pairs:
            i, j = col.get(a1 - 1), col.get(b1 - 1)
            if i is None or j is None:
                continue
            dist = math.hypot(self.x[i] - self.x[j], self.y[i] - self.y[j]) * (kmpp[i] + kmpp[j]) * 0.5
            a += [i, j]
            b += [j, i]
            km += [dist, dist]
        order = np.lexsort((b, a))
        self.ea = np.array(a)[order]
        self.eb = np.array(b)[order]
        self.ekm = np.array(km)[order]
        self.P = P

    def row(self, year, level='top'):
        return (self.top if level == 'top' else self.own)[year - self.first].astype(np.int32)
