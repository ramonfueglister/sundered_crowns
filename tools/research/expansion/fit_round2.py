"""Round 2 fitting (starts 1000-1265, maps up to 1290): M3 refitted and M5. Writes coef_round2.json.
Usage: python3 fit_round2.py <out dir of prep_owners.py>"""

import json
import os
import sys

import m5
import transitions as T
from common import World
from evaluate import END, SPLITS

w = World(os.path.join(sys.argv[1], 'owners_line.npz'))
pl = T.Places(w)
data = T.choice_data(pl, SPLITS['fit2'], 5, T.M3_FEATS, end=END['fit2'])
b, _ = T.fit(data, len(T.M3_FEATS))
out = {'M3': dict(zip(T.M3_FEATS, b.tolist())), 'M5': m5.fit(w, SPLITS['fit2'], END['fit2'])}
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'coef_round2.json'), 'w', encoding='utf-8') as f:
    json.dump(out, f, indent=1)
print(json.dumps(out, indent=1))
