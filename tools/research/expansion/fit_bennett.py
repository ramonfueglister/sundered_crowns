"""M1 on the fitting years: Brier skill of Bennett's war for each s (1.1 and 2.1, his range) and number of steps per
year, from the real maps. Usage: python3 fit_bennett.py <out dir of prep_owners.py>"""

import itertools
import json
import os
import sys
import time
from multiprocessing import Pool

import bennett
from common import World
from evaluate import score

w = World(os.path.join(sys.argv[1], 'owners_line.npz'))


def job(p):
    s, rounds = p
    t = time.time()
    r = score(w, bennett.make(s=s, rounds=rounds), 'fit', 25, runs=10)
    return s, rounds, {k: round(float(v), 4) for k, v in r.items()}, round(time.time() - t)


if __name__ == '__main__':
    with Pool(4) as pool:
        for res in pool.imap_unordered(job, itertools.product([1.1, 2.1], [0.02, 0.05, 0.1, 0.2, 0.5, 1.0])):
            print(json.dumps(res), flush=True)
