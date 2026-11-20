"""The search of the Paris gauntlet: tries settings of the Paris probe's knobs (src/lookprobe/paris_probe.ts) and keeps
the one that comes closest to Ramon's reference picture by gauntlet_paris.py.

Usage: python3 tools/lookprobe/search_paris.py reference.png out_dir [evaluations] [start.json]
with the dev server on http://localhost:5199 (npx vite --port 5199). Each try shoots the probe (about 25 s) and
measures it. The search is a (1+1) evolution strategy with the one-fifth success rule (Rechenberg 1973; Beyer and
Schwefel, "Evolution strategies", Natural Computing 1, 2002, section 4.1): change a few knobs by a normal step, keep
the change if it is no worse, widen the step after successes and narrow it after failures. The score counts the failed
checks and adds how far the failed ones miss (their error above 1, capped at 4, a third each), so that the search
also moves where a change does not yet flip a check. Every try is written to out_dir/log.jsonl, the best picture to
out_dir/best.png and its address to out_dir/best.json.
"""

import colorsys
import json
import os
import random
import subprocess
import sys
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
    'wall_h': (5, 35, 26),
    'wall_s': (0.08, 0.35, 0.26),
    'wall_v': (0.6, 1, 0.8),
    'wallspread': (0.3, 2, 1),
    'pave_h': (-15, 30, 5),
    'pave_s': (0.04, 0.3, 0.21),
    'pave_v': (0.35, 0.8, 0.49),
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
    o.update({k: round(x[k], 3) for k in ('tshare', 'tlow', 'tspread', 'treesize', 'jetty')})
    o['tone'] = 'neutral'
    o['skycol'] = ''.join(f'{round(c):02x}' for c in SKY_GREY + (SKY_BLUE - SKY_GREY) * x['skyblue'])
    for knob, key in (('wall', 'wall'), ('pave', 'pave'), ('roof', 'roof'), ('timber', 'timb')):
        o[knob] = hexc(x[key + '_h'], x[key + '_s'], x[key + '_v'])
    o.update({k: int(x[k]) for k in WHOLE})
    return '&'.join(f'{k}={v}' for k, v in o.items())


def score(rows):
    fails = [err for *_, err, _ in rows if err > 1]
    return len(fails) + sum(min(err, 4) - 1 for err in fails) / 3, len(rows) - len(fails)


def shoot(x, png):
    env = dict(os.environ, SHOT_W='1448', SHOT_H='1086', PROBE_URL='http://localhost:5199')
    env['PROBE_PAGE'] = 'paris-probe.html'
    cmd = ['node', 'tools/lookprobe/shot.mjs', str(png), address(x)]
    subprocess.run(cmd, cwd=ROOT, env=env, capture_output=True, timeout=400, check=False)
    return png.exists()


def main(ref_path, out, n=200, start=None):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    ref = load(ref_path, REF_BOX)
    x = {k: v[2] for k, v in {**SPACE, **WHOLE}.items()}
    if start:
        x.update(json.loads(Path(start).read_text())['knobs'])
    rnd = random.Random(1)
    step, best, tries, wins = 0.15, None, 0, 0
    log = (out / 'log.jsonl').open('a')
    for i in range(n):
        y = dict(x)
        if best is not None:
            for k in rnd.sample(sorted(SPACE), rnd.randint(1, 4)):
                lo, hi, _ = SPACE[k]
                y[k] = min(hi, max(lo, y[k] + rnd.gauss(0, step) * (hi - lo)))
            if rnd.random() < 0.15:
                k = rnd.choice(sorted(WHOLE))
                y[k] = min(WHOLE[k][1], max(WHOLE[k][0], y[k] + rnd.choice((-1, 1))))
        png = out / 'try.png'
        png.unlink(missing_ok=True)
        if not shoot(y, png):
            continue
        rows = measure(ref, load(png))
        s, passed = score(rows)
        log.write(json.dumps({'i': i, 'score': s, 'passed': passed, 'knobs': y, 'address': address(y)}) + '\n')
        log.flush()
        tries += 1
        if best is None or s <= best:
            wins += 1 if best is not None and s < best else 0
            best, x = s, y
            png.replace(out / 'best.png')
            (out / 'best.json').write_text(
                json.dumps({'score': s, 'passed': passed, 'knobs': y, 'address': address(y)})
            )
        print(f'{i:4d} score {s:6.2f} passed {passed:2d}  best {best:6.2f}  step {step:.3f}', flush=True)
        if tries % 10 == 0:
            step = min(0.3, step * 1.5) if wins > 2 else max(0.02, step / 1.5)
            wins = 0


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], *(int(a) if a.isdigit() else a for a in sys.argv[3:5]))
