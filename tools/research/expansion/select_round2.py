"""Round 2: every model with the round-2 scores (evaluate2.score2) on one split.
Usage: python3 select_round2.py <out dir of prep_owners.py> <split: select2 | test2> [model prefixes, comma-separated]"""

import json
import os
import sys
import time
from multiprocessing import Pool

import bennett
import bennett_p
import m5
import m5b
import numpy as np
import transitions as T
from common import World
from evaluate import border_noise, persistence
from evaluate2 import score2

w = World(os.path.join(sys.argv[1], 'owners_line.npz'))
SPLIT = sys.argv[2]
ONLY = sys.argv[3].split(',') if len(sys.argv) > 3 else None
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'coef_round2.json'), encoding='utf-8') as f:
    C = json.load(f)
MODELS = {
    'M0 Stillstand': lambda: persistence,
    'Zufall 0.01': lambda: border_noise(0.01),
    'M1 Bennett s2.1 r0.05': lambda: bennett.make(s=2.1, rounds=0.05),
    'M3 Literatur': lambda: T.make(np.array([C['M3'][k] for k in T.M3_FEATS]), T.M3_FEATS, 5),
    'M5 Zwei Ebenen': lambda: m5.make(C['M5']),
    # added by the plan amendment of 20 Nov (fit_round2b.py)
    'M1-P Bennett Provinzen': lambda: bennett_p.make(C['M1-P']['s']),
    'M5b Zwei Ebenen, Abspaltung als Staatsereignis': lambda: m5b.make(C['M5b']),
}


def job(p):
    name, h, eu = p
    t = time.time()
    r = score2(w, MODELS[name](), SPLIT, h, runs=1 if name.startswith('M0') else 30, europe_only=eu)
    return name, SPLIT, h, eu, {k: round(float(v), 4) for k, v in r.items()}, round(time.time() - t)


if __name__ == '__main__':
    grid = [
        (n, h, eu)
        for n in MODELS
        if ONLY is None or n.split()[0] in ONLY
        for h, eu in ((25, False), (25, True), (50, False))
    ]
    grid.sort(key=lambda g: g[0].startswith('M3'), reverse=True)
    with Pool(4) as pool:
        for res in pool.imap_unordered(job, grid):
            print(json.dumps(res, ensure_ascii=False), flush=True)
