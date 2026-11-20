"""The search of the Paris gauntlet: finds the setting of the Paris probe's knobs (src/lookprobe/paris_probe.ts) that
comes closest to Ramon's reference picture by gauntlet_paris.py.

Usage: python3 tools/lookprobe/search_paris.py reference.png out_dir [rounds] [start.json]
with the dev server on http://localhost:5199 (npx vite --port 5199). Each try shoots the probe (about 25 s, two at a
time) and measures it. The search is Levenberg-Marquardt (Levenberg 1944; Marquardt, "An algorithm for least-squares
estimation of nonlinear parameters", J. SIAM 11, 1963) on the checks' signed errors, capped at 4: each round moves
every knob by a small step to learn how it shifts every check (forward differences), then solves for the step that
shrinks the errors most at three dampings, and keeps the best try of the round by the score. The score counts the
failed checks and adds how far they miss (their error above 1, capped at 4, a third each). Knobs work on a scale of 0
to 1 between their bounds. Every try is written to out_dir/log.jsonl, the best picture to out_dir/best.png and its
address to out_dir/best.json.
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
# knob: (lowest, highest, start); colours are searched as hue in degrees, saturation and value and given as hex
SPACE = {
    'across': (40, 70, 66),
    'elev': (28, 42, 34),
    'lane': (3.5, 8, 4.5),
    'block': (9, 14, 11),
    'depth': (3.8, 5.5, 4.6),
    'exposure': (0.9, 1.6, 1.2),
    'saturation': (0.6, 1.2, 0.8),
    'sun': (0.6, 1.8, 1.05),
    'side': (0.3, 1.3, 0.7),
    'sky': (0.2, 1.4, 0.75),
    'bounce': (0, 0.5, 0.26),
    'fill': (0, 0.8, 0.5),
    'skyblue': (0, 1, 0),
    'wall_h': (10, 40, 26),
    'wall_s': (0.08, 0.35, 0.26),
    'wall_v': (0.6, 1, 0.8),
    'wallspread': (0.3, 1.6, 1),
    'pave_h': (-15, 30, 5),
    'pave_s': (0.04, 0.3, 0.21),
    'pave_v': (0.35, 0.8, 0.49),
    'pspread': (0.5, 3, 1),
    'glass_h': (0, 200, 16),
    'glass_s': (0.1, 0.7, 0.3),
    'glass_v': (0.2, 0.9, 0.29),
    'roof_h': (5, 30, 21),
    'roof_s': (0.35, 0.75, 0.58),
    'roof_v': (0.35, 0.8, 0.58),
    'roofspread': (0.5, 2, 1),
    'timb_h': (0, 35, 25),
    'timb_s': (0.15, 0.65, 0.4),
    'timb_v': (0.15, 0.5, 0.37),
    'tshare': (0.3, 1, 0.65),
    'tlow': (0.7, 1, 0.9),
    'tspread': (0.05, 0.4, 0.15),
    'treesize': (0.7, 1.6, 1),
    'leaf_h': (50, 110, 74),
    'leaf_s': (0.5, 1, 0.9),
    'leaf_v': (0.35, 0.8, 0.6),
    'olive_h': (60, 120, 87),
    'olive_s': (0.5, 1, 0.8),
    'olive_v': (0.2, 0.55, 0.35),
    'jetty': (0, 0.8, 0.35),
}
# knobs that take whole fine blocks
WHOLE = {'winw': (1, 3, 2), 'winh': (2, 4, 3)}
SKY_GREY, SKY_BLUE = np.array([0xC8, 0xD4, 0xF0]), np.array([0x8C, 0xA8, 0xF0])


def hexc(h, s, v):
    return ''.join(f'{round(c * 255):02x}' for c in colorsys.hsv_to_rgb((h % 360) / 360, s, v))


def address(x):
    """the probe's address options for a setting"""
    o = {k: round(x[k], 3) for k in ('across', 'elev', 'lane', 'block', 'depth', 'exposure', 'saturation')}
    o.update({k: round(x[k], 3) for k in ('sun', 'side', 'sky', 'bounce', 'fill', 'wallspread', 'roofspread')})
    o.update({k: round(x[k], 3) for k in ('tshare', 'tlow', 'tspread', 'treesize', 'jetty', 'pspread')})
    o['tone'] = 'neutral'
    o['skycol'] = ''.join(f'{round(c):02x}' for c in SKY_GREY + (SKY_BLUE - SKY_GREY) * x['skyblue'])
    for knob in ('wall', 'pave', 'roof', 'timber', 'glass', 'leaf', 'olive'):
        key = 'timb' if knob == 'timber' else knob
        o[knob] = hexc(x[key + '_h'], x[key + '_s'], x[key + '_v'])
    o.update({k: int(x[k]) for k in WHOLE})
    return '&'.join(f'{k}={v}' for k, v in o.items())


def score(rows):
    fails = [abs(err) for *_, err, _ in rows if abs(err) > 1]
    return len(fails) + sum(min(err, 4) - 1 for err in fails) / 3, len(rows) - len(fails)


def shoot(x, png):
    env = dict(os.environ, SHOT_W='1448', SHOT_H='1086', PROBE_URL='http://localhost:5199')
    env['PROBE_PAGE'] = 'paris-probe.html'
    png.unlink(missing_ok=True)
    cmd = ['node', 'tools/lookprobe/shot.mjs', str(png), address(x)]
    subprocess.run(cmd, cwd=ROOT, env=env, capture_output=True, timeout=400, check=False)
    return png.exists()


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
            png = self.out / f'try{i}.png'
            x = knobs(u, whole)
            if not shoot(x, png):
                return None
            rows = measure(self.ref, load(png))
            s, passed = score(rows)
            with self.lock:
                self.n += 1
                rec = {'n': self.n, 'score': s, 'passed': passed, 'knobs': x, 'address': address(x)}
                self.log.write(json.dumps(rec) + '\n')
                self.log.flush()
                if self.best is None or s < self.best['score']:
                    self.best = rec
                    png.replace(self.out / 'best.png')
                    (self.out / 'best.json').write_text(json.dumps(rec))
            png.unlink(missing_ok=True)
            return np.clip([err for *_, err, _ in rows], -4, 4), s

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
