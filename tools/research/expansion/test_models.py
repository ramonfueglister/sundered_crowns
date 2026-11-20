"""The one test run (plan: starts 1291-1475, maps up to 1500) and the Euratlas border check 1300->1400 and 1400->1500,
with the models and coefficients chosen before (coef.json). Usage: python3 test_models.py <out dir of prep_owners.py>"""

import json
import os
import sys
import time
from multiprocessing import Pool

from common import World
from euratlas_check import edge_skill
from evaluate import score
from models import MODELS

w = World(os.path.join(sys.argv[1], 'owners_line.npz'))
TESTED = [
    'M0 Stillstand',
    'Zufall 0.01',
    'M1 Bennett s2.1 r0.05',
    'M3 Literatur',
    'M3b Literatur+Phase',
    'M4 Statistik',
]


def job(p):
    name, kind, a, b = p
    t = time.time()
    if kind == 'euratlas':
        r = edge_skill(w, MODELS[name](), a, b, runs=20)
    else:
        r = score(w, MODELS[name](), 'test', a, runs=1 if name.startswith('M0') else 30, europe_only=b)
    return name, kind, a, b, {k: round(float(v), 4) for k, v in r.items()}, round(time.time() - t)


if __name__ == '__main__':
    grid = [(n, 'score', h, eu) for n in TESTED for h, eu in ((25, False), (25, True), (10, False), (50, False))]
    grid += [(n, 'euratlas', a, a + 100) for n in TESTED for a in (1300, 1400)]
    with Pool(4) as pool:
        for res in pool.imap_unordered(job, grid):
            print(json.dumps(res, ensure_ascii=False), flush=True)
