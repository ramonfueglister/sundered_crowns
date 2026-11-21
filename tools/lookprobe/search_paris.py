"""The search of the Paris gauntlet: finds the setting of the Paris probe's knobs (src/lookprobe/paris_probe.ts) that
comes closest to Ramon's reference picture by gauntlet_paris.py.

Usage: python3 tools/lookprobe/search_paris.py reference.png out_dir [rounds] [start.json]
with the dev server on http://localhost:5199 (npx vite --port 5199). Each try shoots the probe as two towns (SEEDS,
about 25 s each, two tries at a time) and measures them. The search is Levenberg-Marquardt (Levenberg 1944;
Marquardt, "An algorithm for least-squares estimation of nonlinear parameters", J. SIAM 11, 1963) on the checks'
signed errors, averaged over the towns and capped at 4: each round moves every knob by a small step to learn how it
shifts every check (forward differences), then solves for the step that shrinks the errors most at three dampings,
and keeps the best try of the round by the score. The score counts the failed checks and adds how far they miss
(their error above 1, capped at 4, a third each). Knobs work on a scale of 0 to 1 between their bounds. Every try is
written to out_dir/log.jsonl, the best picture to out_dir/best.png and its address to out_dir/best.json.
"""

import colorsys
import json
import os
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from gauntlet_paris import REF_BOX, load, measure

ROOT = Path(__file__).resolve().parents[2]
# knob: (lowest, highest, start); colours are searched as hue in degrees, saturation and value and given as hex; the
# starts are the best setting of the searches of 21 Nov 2026, whose colours src/buildings/traditions/paris.ts holds;
# the timber stays dark (value up to 0.4), as the picture draws it
SPACE = {
    'across': (40, 70, 63.182),
    'elev': (28, 42, 36.521),
    'lane': (3.5, 8, 5.181),
    'block': (9, 14, 12.033),
    'depth': (3.8, 5.5, 3.931),
    'exposure': (0.9, 1.6, 1.2),
    'saturation': (0.6, 1.2, 0.878),
    'sun': (0.6, 1.8, 1.364),
    'side': (0.3, 1.3, 0.923),
    'sky': (0.2, 1.4, 0.755),
    'bounce': (0, 0.5, 0.299),
    'fill': (0, 0.8, 0.611),
    'skyblue': (0, 1, 0.069),
    'wall_h': (10, 40, 22.548),
    'wall_s': (0.08, 0.35, 0.312),
    'wall_v': (0.6, 1, 0.924),
    'wallspread': (0.3, 1.6, 1),
    'pave_h': (-15, 30, 19.583),
    'pave_s': (0.04, 0.3, 0.216),
    'pave_v': (0.35, 0.8, 0.451),
    'pspread': (0.5, 3, 1.968),
    'glass_h': (0, 200, 119.815),
    'glass_s': (0.1, 0.7, 0.226),
    'glass_v': (0.2, 0.9, 0.544),
    'roof_h': (5, 30, 27.225),
    'roof_s': (0.35, 0.75, 0.522),
    'roof_v': (0.35, 0.8, 0.588),
    'roofspread': (0.5, 2, 1),
    'timb_h': (0, 35, 6.324),
    'timb_s': (0.15, 0.65, 0.253),
    'timb_v': (0.15, 0.4, 0.399),
    'stone_h': (10, 45, 33.779),
    'stone_s': (0.05, 0.35, 0.16),
    'stone_v': (0.5, 0.95, 0.908),
    'post': (0.6, 1.5, 0.883),
    'tshare': (0.3, 1, 0.989),
    'tlow': (0.7, 1, 0.811),
    'tspread': (0.05, 0.4, 0.4),
    'treesize': (0.7, 1.6, 0.956),
    'leaf_h': (50, 110, 69.758),
    'leaf_s': (0.5, 1, 1.0),
    'leaf_v': (0.35, 0.8, 0.451),
    'olive_h': (60, 120, 92.69),
    'olive_s': (0.5, 1, 0.532),
    'olive_v': (0.2, 0.55, 0.332),
    'jetty': (0, 0.8, 0.533),
}
# knobs that take whole fine blocks
WHOLE = {'winw': (1, 3, 1), 'winh': (2, 4, 3)}
SKY_GREY, SKY_BLUE = np.array([0xC8, 0xD4, 0xF0]), np.array([0x8C, 0xA8, 0xF0])


def hexc(h, s, v):
    return ''.join(f'{round(c * 255):02x}' for c in colorsys.hsv_to_rgb((h % 360) / 360, s, v))


def address(x):
    """the probe's address options for a setting"""
    o = {k: round(x[k], 3) for k in ('across', 'elev', 'lane', 'block', 'depth', 'exposure', 'saturation')}
    o.update({k: round(x[k], 3) for k in ('sun', 'side', 'sky', 'bounce', 'fill', 'wallspread', 'roofspread')})
    o.update({k: round(x[k], 3) for k in ('tshare', 'post', 'tlow', 'tspread', 'treesize', 'jetty', 'pspread')})
    o['tone'] = 'neutral'
    o['skycol'] = ''.join(f'{round(c):02x}' for c in SKY_GREY + (SKY_BLUE - SKY_GREY) * x['skyblue'])
    for knob in ('wall', 'pave', 'roof', 'timber', 'glass', 'leaf', 'olive', 'stone'):
        key = 'timb' if knob == 'timber' else knob
        o[knob] = hexc(x[key + '_h'], x[key + '_s'], x[key + '_v'])
    o.update({k: int(x[k]) for k in WHOLE})
    return '&'.join(f'{k}={v}' for k, v in o.items())


def score(errs):
    fails = [abs(err) for err in errs if abs(err) > 1]
    return len(fails) + sum(min(err, 4) - 1 for err in fails) / 3, len(errs) - len(fails)


def shoot(x, png, seed):
    env = dict(os.environ, SHOT_W='1448', SHOT_H='1086', PROBE_URL='http://localhost:5199')
    env['PROBE_PAGE'] = 'paris-probe.html'
    png.unlink(missing_ok=True)
    cmd = ['node', 'tools/lookprobe/shot.mjs', str(png), f'{address(x)}&seed={seed}']
    subprocess.run(cmd, cwd=ROOT, env=env, capture_output=True, timeout=400, check=False)
    return png.exists()


# the towns every try is measured on, its errors averaged over them: a setting fitted to one draw of the town fitted
# that draw (21 Nov 2026: 44 of 46 on the town it was searched on, 39 and 40 on two others)
SEEDS = (21, 31)
KEYS = sorted(SPACE)
LO, HI = np.array([SPACE[k][0] for k in KEYS]), np.array([SPACE[k][1] for k in KEYS])


def knobs(u, whole):
    return {**{k: float(v) for k, v in zip(KEYS, LO + (HI - LO) * np.clip(u, 0, 1))}, **whole}


class Search:
    def __init__(self, ref, out):
        self.ref, self.out, self.n, self.best = ref, out, 0, None
        self.log, self.lock = (out / 'log.jsonl').open('a'), threading.Lock()

    def try_all(self, us, whole):
        """shoots and measures the settings us, two at a time; returns their error vectors and scores"""

        def one(i_u):
            i, u = i_u
            x, errs = knobs(u, whole), []
            for seed in SEEDS:
                png = self.out / f'try{i}_{seed}.png'
                if not shoot(x, png, seed):
                    return None
                errs.append([err for *_, err, _ in measure(self.ref, load(png))])
            errs = np.mean(errs, 0)
            s, passed = score(errs)
            with self.lock:
                self.n += 1
                rec = {'n': self.n, 'score': s, 'passed': passed, 'knobs': x, 'address': address(x)}
                self.log.write(json.dumps(rec) + '\n')
                self.log.flush()
                if self.best is None or s < self.best['score']:
                    self.best = rec
                    (self.out / f'try{i}_{SEEDS[0]}.png').replace(self.out / 'best.png')
                    (self.out / 'best.json').write_text(json.dumps(rec))
            for seed in SEEDS:
                (self.out / f'try{i}_{seed}.png').unlink(missing_ok=True)
            return np.clip(errs, -4, 4), s

        with ThreadPoolExecutor(2) as pool:
            return list(pool.map(one, enumerate(us)))


def main(ref_path, out, rounds=4, start=None):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    x = {k: v[2] for k, v in {**SPACE, **WHOLE}.items()}
    if start:
        x.update(json.loads(Path(start).read_text())['knobs'])
    whole = {k: int(x[k]) for k in WHOLE}
    u = np.clip((np.array([x[k] for k in KEYS]) - LO) / (HI - LO), 0, 1)
    search, h, damp = Search(load(ref_path, REF_BOX), out), 0.08, 1.0
    ((r0, s0),) = search.try_all([u], whole)
    J = None
    for rnd in range(rounds):
        moved = []
        if J is None:
            # how each knob shifts each check: a step up, or down where the knob is at its top
            steps = np.where(u + h <= 1, h, -h)
            moved = search.try_all([u + np.eye(len(u))[i] * steps[i] for i in range(len(u))], whole)
            J = np.stack([(m[0] - r0) / steps[i] if m else np.zeros_like(r0) for i, m in enumerate(moved)], 1)
        A, g = J.T @ J, J.T @ r0
        damps = (damp / 4, damp, damp * 4)
        cands = [
            np.clip(u - np.linalg.solve(A + d * (np.diag(np.diag(A)) + 1e-3 * np.eye(len(u))), g), 0, 1) for d in damps
        ]
        tried = search.try_all(cands, whole)
        pool = [(t[1], c, t[0], k) for k, (t, c) in enumerate(zip(tried, cands)) if t]
        pool += [(m[1], u + np.eye(len(u))[i] * steps[i], m[0], None) for i, m in enumerate(moved) if m]
        s, c, r, k = min(pool, key=lambda p: p[0])
        if s < s0:
            # a step that worked: trust the model more if the least damped one won; learn the shifts anew there
            damp = damp / 4 if k == 0 else damp
            u, r0, s0, J = c, r, s, None
        else:
            # no try was better: the same shifts, a shorter step
            damp *= 8
        print(f'round {rnd}: score {s0:.2f}  damping {damp:.3g}  tries {search.n}', flush=True)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], *(int(a) if a.isdigit() else a for a in sys.argv[3:5]))
