"""The models of the study as chosen on the fitting years (coef.json)."""

import json
import os

import bennett
import numpy as np
import transitions as T
from evaluate import border_noise, persistence

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'coef.json'), encoding='utf-8') as f:
    COEF = json.load(f)


def logit(name, feats):
    return T.make(np.array([COEF[name][k] for k in feats]), feats, 5)


MODELS = {
    'M0 Stillstand': lambda: persistence,
    'Zufall 0.01': lambda: border_noise(0.01),
    'M1 Bennett s2.1 r0.05': lambda: bennett.make(s=2.1, rounds=0.05),
    'M1 Bennett s2.1 r0.1': lambda: bennett.make(s=2.1, rounds=0.1),
    'M3 Literatur': lambda: logit('M3', T.M3_FEATS),
    'M3b Literatur+Phase': lambda: logit('M3b', T.M3B_FEATS),
    'M4 Statistik': lambda: logit('M4', T.M4_FEATS),
}
