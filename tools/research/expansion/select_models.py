"""Selection run: every model on the selection years (starts 1226-1265, maps up to 1290 only).
Usage: python3 select_models.py <out dir of prep_owners.py>"""

import json
import os
import sys
import time
from multiprocessing import Pool

from common import World
from evaluate import score
from models import MODELS

w = World(os.path.join(sys.argv[1], 'owners_line.npz'))


def job(p):
    name, h, eu = p
    t = time.time()
    r = score(w, MODELS[name](), 'select', h, runs=1 if name.startswith('M0') else 30, europe_only=eu)
    return name, h, eu, {k: round(float(v), 4) for k, v in r.items()}, round(time.time() - t)


if __name__ == '__main__':
    with Pool(4) as pool:
        for res in pool.imap_unordered(job, [(n, h, eu) for n in MODELS for h in (10, 25) for eu in (False, True)]):
            print(json.dumps(res, ensure_ascii=False), flush=True)
