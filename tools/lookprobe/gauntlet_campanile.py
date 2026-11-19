"""The campanile's own gauntlet: the bell tower of a probe shot measured against the reference image's tower.

Usage: python3 tools/lookprobe/gauntlet_campanile.py reference.png probe.png
Both pictures are the 1672 x 941 frame of the look probe. Needs Pillow, numpy and scipy. The tower is found in its window, its colour bands are
read along its axis (gold finial, green spire, white cornice, brick dado, white belfry, brick shaft) and compared:
heights of the bands, their colours, the stripes of the shaft, the openings of the belfry, the width of the shaft.
Prints one line per check with reference value, probe value and PASS or FAIL; exits 1 when a check fails.
"""

import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

WINDOW = (1180, 240, 1340, 560)  # x0, y0, x1, y1: the tower stands in here in both pictures
PX_PER_BLOCK = 8.33  # height, from the look probe's calibration


def hsv(im):
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    mx, mn = im.max(-1), im.min(-1)
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    return h, np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0), mx


def classify(im):
    """one letter per pixel: G spire green, W white stone, B brick, Y gold, D dark opening, . anything else"""
    h, s, v = hsv(im)
    c = np.full(h.shape, '.', dtype='<U1')
    c[(h >= 70) & (h <= 170) & (s > 0.2) & (v > 0.25)] = 'G'
    c[(s < 0.22) & (v > 0.72)] = 'W'
    c[((h < 28) | (h > 340)) & (s > 0.35) & (v > 0.3)] = 'B'
    c[(h >= 28) & (h <= 60) & (s > 0.45) & (v > 0.55)] = 'Y'
    c[v < 0.3] = 'D'
    return c


class Tower:
    """the bands of one tower, read along its axis"""

    def __init__(self, path):
        x0, y0, x1, y1 = WINDOW
        im = np.asarray(Image.open(path).convert('RGB').resize((1672, 941), Image.LANCZOS)).astype(float) / 255
        self.im, self.c = im[y0:y1, x0:x1], classify(im[y0:y1, x0:x1])
        c = self.c
        # the axis: the column where the tower's own classes stack up highest, refined to the shaft's centre
        score = np.convolve(((c == 'G') | (c == 'W') | (c == 'B')).sum(0), np.ones(9), 'same')
        cx = int(np.argmax(score))
        self.widths, centres = [], []
        for y in range(c.shape[0]):
            if c[y, cx] != 'B':
                continue
            l = r = cx
            while l > 0 and c[y, l - 1] in 'BDW':
                l -= 1
            while r < c.shape[1] - 1 and c[y, r + 1] in 'BDW':
                r += 1
            if 20 < r - l < 90:
                self.widths.append(r - l + 1)
                centres.append((l + r) / 2)
        self.cx = int(round(np.median(centres))) if centres else cx
        # the bands and colours are read on the sunlit face, right of the corner: the probe's stage shades the
        # other face far more than the reference does, which is the stage's business, not the tower's
        self.lit = slice(self.cx + 2, self.cx + 13)
        # the spire narrows, so it and the finial are read on the axis, everything below on the lit face
        self.rows, self.runs = self._rows(c[:, self.lit])
        self.rows_axis, self.runs_axis = self._rows(c[:, self.cx - 3 : self.cx + 4])
        self.bands = self._bands()

    @staticmethod
    def _rows(strip):
        rows, runs = [], []
        for y in range(strip.shape[0]):
            vals, cnt = np.unique(strip[y], return_counts=True)
            rows.append(vals[np.argmax(cnt)])
        for y, k in enumerate(rows):
            if runs and runs[-1][0] == k:
                runs[-1][2] += 1
            else:
                runs.append([k, y, 1])
        return rows, runs

    def _bands(self):
        """top to bottom: spire = the longest green run with the pale rows above it (its lit tip), finial = narrow gold
        above that, cap = the rows down to the first brick (its white rows are the cornice), dado = brick down to the
        next pale rows, belfry = down to the next long brick run, shaft = brick down to where the roofs hide it"""
        runs, rows = self.runs_axis, self.rows_axis
        gi = max(range(len(runs)), key=lambda i: runs[i][2] if runs[i][0] == 'G' else -1)
        top, bottom = runs[gi][1], runs[gi][1] + runs[gi][2]
        while top > 0 and rows[top - 1] in 'W':
            top -= 1
        b = {'spire': (top, bottom)}
        rows = self.rows
        # the finial: gold on the axis, with the strip's edges not gold (a gold field behind the tower is not a finial)
        b['finial'] = sum(
            1
            for y in range(max(0, top - 25), top)
            if (self.c[y, self.cx - 2 : self.cx + 3] == 'Y').any()
            and not (self.c[y, self.cx - 9] == 'Y' and self.c[y, self.cx + 9] == 'Y')
        )

        def next_run(y, kinds, n):
            while y + n <= len(rows) and not all(rows[k] in kinds for k in range(y, y + n)):
                y += 1
            return min(y, len(rows))

        d0 = next_run(bottom, 'B', 3)
        b['cornice'] = (bottom, bottom + sum(1 for y in range(bottom, d0) if rows[y] == 'W'))
        w1 = next_run(d0, 'W', 2)
        if w1 - d0 > 40:
            w1 = next_run(d0, 'W.D', 3)
        b['dado'] = (d0, w1)
        s0 = next_run(w1, 'B', 6)
        b['belfry'] = (w1, s0)
        b['shaft'] = (s0, next_run(s0, '.', 3))
        return b

    def band(self, name):
        y0, y1 = self.bands[name]
        return self.im[y0:y1, self.lit], self.c[y0:y1, self.lit]

    def height(self, name):
        y0, y1 = self.bands[name]
        return (y1 - y0) / PX_PER_BLOCK


def main(ref_path, probe_path):
    ref, probe = Tower(ref_path), Tower(probe_path)
    fails = 0

    def check(name, a, b, ok, fmt='{:.2f}'):
        nonlocal fails
        good = ok(a, b)
        fails += not good
        print(f'{"PASS" if good else "FAIL"}  {name:34s} ref {fmt.format(a):>12s}  probe {fmt.format(b):>12s}')

    within = lambda tol: lambda a, b: abs(a - b) <= tol
    rel = lambda tol: lambda a, b: abs(a - b) <= tol * max(abs(a), 1e-6)
    for name in ('spire', 'cornice', 'dado', 'belfry'):
        check(
            f'{name} height (blocks)',
            ref.height(name),
            probe.height(name),
            rel(0.2) if name != 'cornice' else within(0.4),
        )
    check('shaft visible (blocks, at least)', ref.height('shaft'), probe.height('shaft'), lambda a, b: b >= a * 0.8)
    check('finial gold rows (px)', ref.bands['finial'], probe.bands['finial'], lambda a, b: b >= min(a, 3), '{:d}')
    check('shaft width (px)', np.median(ref.widths), np.median(probe.widths), rel(0.2))

    def mean_colour(t, name, kind):
        im, c = t.band(name)
        px = im[c == kind]
        return px.mean(0) if len(px) > 20 else np.array([np.nan] * 3)

    rgbfmt = lambda v: '-' if np.isnan(v).any() else '#' + ''.join(f'{int(np.clip(x, 0, 1) * 255):02x}' for x in v)
    for label, name, kind in (
        ('spire green', 'spire', 'G'),
        ('shaft brick', 'shaft', 'B'),
        ('belfry white', 'belfry', 'W'),
        ('dado brick', 'dado', 'B'),
    ):
        a, b = mean_colour(ref, name, kind), mean_colour(probe, name, kind)
        check(label, rgbfmt(a), rgbfmt(b), lambda _a, _b, a=a, b=b: bool(np.all(np.abs(a - b) <= 0.08)), '{}')

    def frac(t, name, kind):
        _, c = t.band(name)
        return (c == kind).mean() if c.size else 0

    check('belfry openings (dark share)', frac(ref, 'belfry', 'D'), frac(probe, 'belfry', 'D'), within(0.12))
    check('belfry white share', frac(ref, 'belfry', 'W'), frac(probe, 'belfry', 'W'), within(0.15))
    check('dado white marks (share)', frac(ref, 'dado', 'W'), frac(probe, 'dado', 'W'), within(0.15))

    def stripes(t):
        im, c = t.band('shaft')
        lum = im @ np.array([0.2126, 0.7152, 0.0722])
        cols = lum.mean(0)
        return cols.std() / max(cols.mean(), 1e-6)

    check('shaft stripe contrast', stripes(ref), stripes(probe), rel(0.4))

    def fine(t, name):
        """small-scale liveliness of a band on the lit face: what a 3-pixel blur removes"""
        im, _ = t.band(name)
        g = im @ np.array([0.2126, 0.7152, 0.0722])
        return float(np.abs(g - ndi.gaussian_filter(g, 1.5)).mean()) if g.size else 0.0

    for name in ('spire', 'belfry', 'dado', 'shaft'):
        check(f'{name} fine detail', fine(ref, name), fine(probe, name), lambda a, b: b >= 0.75 * a, '{:.4f}')
    print(f'{fails} failed')
    return fails


if __name__ == '__main__':
    sys.exit(1 if main(sys.argv[1], sys.argv[2]) else 0)
