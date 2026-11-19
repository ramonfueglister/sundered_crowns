"""M3, M3b and M4 on the fitting years: maximum likelihood of the conditional logit (transitions.py) on the 5-year
transitions starting 1000-1245 (maps up to 1250). Writes coef.json next to this script.
Usage: python3 fit_transitions.py <out dir of prep_owners.py>"""

import json
import os
import sys

import numpy as np
import transitions as T
from common import World
from evaluate import END, SPLITS

STEP = 5

w = World(os.path.join(sys.argv[1], 'owners_line.npz'))
pl = T.Places(w)
res = {}
for name, feats in (('M3', T.M3_FEATS), ('M3b', T.M3B_FEATS), ('M4', T.M4_FEATS)):
    data = T.choice_data(pl, SPLITS['fit'], STEP, feats, end=END['fit'])
    b, r = T.fit(data, len(feats))
    print(name, r.message, 'nll', round(r.fun), dict(zip(feats, np.round(b, 3).tolist())), flush=True)
    res[name] = dict(zip(feats, b.tolist()))
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'coef.json'), 'w', encoding='utf-8') as f:
    json.dump(res, f, indent=1)
