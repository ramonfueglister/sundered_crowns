"""Round 2, second source: borders after 100 years against Euratlas (euratlas_check.edge_skill, Europe only).
Selection: 1300->1400 and 1400->1500; test: 1500->1600, 1600->1700, 1700->1800 (run once with the test).
Usage: python3 euratlas_round2.py <out dir of prep_owners.py> <select2 | test2> [model prefixes]"""

import json
import sys
import time
from multiprocessing import Pool

from euratlas_check import edge_skill
from select_round2 import MODELS, ONLY, w

PAIRS = {'select2': [(1300, 1400), (1400, 1500)], 'test2': [(1500, 1600), (1600, 1700), (1700, 1800)]}[sys.argv[2]]


def job(p):
    name, a, b = p
    t = time.time()
    r = edge_skill(w, MODELS[name](), a, b, runs=1 if name.startswith('M0') else 20)
    return name, a, b, {k: round(float(v), 4) for k, v in r.items()}, round(time.time() - t)


if __name__ == '__main__':
    grid = [(n, a, b) for n in MODELS if ONLY is None or n.split()[0] in ONLY for a, b in PAIRS]
    grid.sort(key=lambda g: g[0].startswith('M3'), reverse=True)
    with Pool(4) as pool:
        for res in pool.imap_unordered(job, grid):
            print(json.dumps(res, ensure_ascii=False), flush=True)
