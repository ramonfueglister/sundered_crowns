"""Round 2, after the plan amendment of 20 Nov: fits M5b (m5b.py) and estimates s of M1-P (bennett_p.py) on the
fitting years (starts 1000-1265, maps up to 1290). Adds both to coef_round2.json; M3 and M5 stay as they are.
Usage: python3 fit_round2b.py <out dir of prep_owners.py>"""

import json
import os
import sys
from multiprocessing import Pool

import bennett_p
import m5b
from common import World
from evaluate import END, SPLITS
from evaluate2 import score2

w = World(os.path.join(sys.argv[1], 'owners_line.npz'))
PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'coef_round2.json')
S_GRID = (1.1, 1.3, 1.5, 1.7, 1.9, 2.1)


def bennett_job(s):
    r = score2(w, bennett_p.make(s), 'fit2', 25, runs=10, seed=7)
    return s, round(float(r['place_skill']), 4)


if __name__ == '__main__':
    with open(PATH, encoding='utf-8') as f:
        C = json.load(f)
    with Pool(4) as pool:
        grid = dict(pool.map(bennett_job, S_GRID))
    C['M5b'] = m5b.fit_b(w, SPLITS['fit2'], END['fit2'], C['M5'])
    C['M1-P'] = {'s': max(grid, key=grid.get), 'fit_place_skill_25y': {str(k): v for k, v in grid.items()}}
    with open(PATH, 'w', encoding='utf-8') as f:
        json.dump(C, f, indent=1)
    print(json.dumps({k: C[k] for k in ('M5b', 'M1-P')}, indent=1))
