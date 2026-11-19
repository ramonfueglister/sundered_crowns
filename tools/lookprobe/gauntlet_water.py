"""The gauntlet of the water: pictures of the world probe against pictures of EU5's map (as a bar of quality only).

Usage: python3 tools/lookprobe/gauntlet_water.py picture.png[:x0,y0,x1,y1] ...   (the measurements of each picture)
       python3 tools/lookprobe/gauntlet_water.py --gauntlet <folder>              (the rows of the bar, green or red)
The part after the colon cuts the picture to that rectangle (the reference's panels and buttons are left out so).
The folder holds the pictures of the scenes in SCENES, as tools/lookprobe/water_shots.sh takes them.
For each picture it finds the water (blue to cyan, not grey) and measures, by the distance of each dot of water
from the nearest dot that is not water (the shore):
  - the colour by the shore (4 to 20 dots out) and on the open water (from 80 dots out), in CIELAB
  - how much lighter the water by the shore is than the open water (the shallows)
  - the chop: how much the water's lightness varies from dot to dot (lightness less its blur over 3 dots)
  - the glints: the share of open water at least 14 lighter than its surroundings (sun on waves, foam)
  - the stripes: how much of the chop lies in its single strongest wave (a regular pattern of a few sines gives
    one bright peak in the picture's spectrum; a natural sea spreads its energy)
  - the shore line: how much lighter the water's first 3 dots are than the water 6 to 12 dots out (surf, wet sand)

The bar was read off 16 screenshots of EU5 from its Steam page (19 November 2026; kept outside the repository, in the
project's files under wasser/referenz_eu5): the close view of the coast at Valencia (steam_05, cut to 480,60,1790,1000:
open water L 47, a -11, b -15; by the shore 49/-8/-15; shallows 2 lighter; chop 2.1; glints 0.44 %) and five views
from the middle distance (steam_01, 06, 09, 11 cut alike, 16 to 1000,60,1790,1000: open water 42/-6/-15, by the shore
52/-11/-12, shallows 2 to 15 lighter, chop 1.3 to 2.7, glints 0.03 to 0.45 %, stripes 0.01 to 0.02).
Before the first round (19 November 2026) ours had stripes of 0.5 to 0.8 from near: 7 of 30 rows.
"""

import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def srgb_to_lab(rgb):
    c = rgb / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    lab_l = 116 * f[..., 1] - 16
    return np.stack([lab_l, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def water_mask(rgb):
    r, g, b = rgb[..., 0].astype(float), rgb[..., 1].astype(float), rgb[..., 2].astype(float)
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    s = (mx - mn) / np.maximum(mx, 1)
    # blue-ish: blue the largest or green and blue together well above red (turquoise), and not grey
    m = (b >= g - 30) & (b > r + 25) & (s > 0.28) & (mx > 40)
    # foam, glints and boats on the water count as water where they lie within it (holes of up to 1500 dots), so
    # that the distance from the shore is the distance from the land
    # (the picture's edge is no shore: the mask is carried on past it while it is smoothed)
    pad = 4
    m = np.pad(m, pad, mode='edge')
    m = ndi.binary_opening(ndi.binary_closing(m, iterations=2), iterations=1)[pad:-pad, pad:-pad]
    holes, n_holes = ndi.label(ndi.binary_fill_holes(m) & ~m)
    if n_holes:
        small = np.flatnonzero(ndi.sum(np.ones_like(m), holes, range(1, n_holes + 1)) <= 1500) + 1
        m = m | np.isin(holes, small)
    lab, n = ndi.label(m)
    if n == 0:
        return m
    sizes = ndi.sum(m, lab, range(1, n + 1))
    keep = np.isin(lab, 1 + np.flatnonzero(sizes > 4000))
    return keep


def peak_share(lum_hp, dist):
    """share of the chop's energy in its strongest wave, over the largest square of open water (0: none found)"""
    h, w = dist.shape
    yy, xx = np.mgrid[0:h, 0:w]
    inside = np.minimum(dist, 1.5 * np.minimum(np.minimum(yy, h - 1 - yy), np.minimum(xx, w - 1 - xx)))
    y, x = np.unravel_index(np.argmax(inside), dist.shape)
    dist = inside
    half = int(min(dist[y, x] / 1.5, 128))
    if half < 48:
        return float('nan')
    patch = lum_hp[y - half : y + half, x - half : x + half]
    patch = patch - patch.mean()
    win = np.outer(np.hanning(patch.shape[0]), np.hanning(patch.shape[1]))
    p = np.abs(np.fft.fftshift(np.fft.fft2(patch * win))) ** 2
    c = np.array(p.shape) // 2
    p[c[0] - 1 : c[0] + 2, c[1] - 1 : c[1] + 2] = 0
    # a peak and its mirror image are one wave; a 3x3 neighbourhood holds a windowed peak
    pk = ndi.uniform_filter(p, 3) * 9
    return float(2 * pk.max() / max(p.sum(), 1e-9))


def measure(path, box=None):
    rgb = np.asarray(Image.open(path).convert('RGB'))
    if box:
        x0, y0, x1, y1 = box
        rgb = rgb[y0:y1, x0:x1]
    m = water_mask(rgb)
    lab = srgb_to_lab(rgb.astype(float))
    dist = ndi.distance_transform_edt(m)
    lum = lab[..., 0]
    hp = lum - ndi.gaussian_filter(lum, 3)
    near = (dist >= 4) & (dist <= 20)
    open_ = dist >= 80
    if open_.sum() < 2000:
        open_ = dist >= 40
    edge = (dist >= 1) & (dist <= 3)
    ring = (dist >= 6) & (dist <= 12)
    inner = dist >= 30
    local = ndi.uniform_filter(lum, 15)
    out = {
        'water %': 100 * m.mean(),
        'shore L,a,b': tuple(np.median(lab[near], 0)) if near.any() else (np.nan,) * 3,
        'open L,a,b': tuple(np.median(lab[open_], 0)) if open_.any() else (np.nan,) * 3,
        'shallows dL': float(np.median(lum[near]) - np.median(lum[open_])) if near.any() and open_.any() else np.nan,
        'chop': float(hp[inner].std()) if inner.any() else np.nan,
        'glints %': float(100 * ((lum - local)[inner] > 14).mean()) if inner.any() else np.nan,
        'stripes': peak_share(hp, dist),
        'shore line dL': float(np.median(lum[edge]) - np.median(lum[ring])) if edge.any() else np.nan,
    }
    return out


# the scenes: name, address options of the world probe, near (True) or middle/far distance
SCENES = [
    ('n60_valencia', 'lon=-0.33&lat=39.45&wide=60', True),
    ('n190_valencia', 'lon=-0.30&lat=39.40&wide=190', True),
    ('n190_venezia', 'lon=12.33&lat=45.43&wide=190', True),
    ('m1200_valencia', 'lon=-0.30&lat=39.40&wide=1200', False),
    ('f3000_bosporus', 'lon=28.9&lat=40.8&wide=3000', False),
]
OPEN = {True: (47, -11, -15), False: (42, -6, -15)}
SHORE = {True: (49, -8, -15), False: (52, -11, -12)}


def delta_e(a, b):
    return float(np.sqrt(sum((x - y) ** 2 for x, y in zip(a, b, strict=True))))


def rows(r, near):
    """the rows of the bar for one scene: (name, value, green)"""
    out = [
        ('Streifen <= 0.06', r['stripes'], r['stripes'] <= 0.06 or np.isnan(r['stripes'])),
        ('Kräuselung 1.3-2.7', r['chop'], 1.3 <= r['chop'] <= 2.7),
        ('Farbe offen dE <= 8', delta_e(r['open L,a,b'], OPEN[near]), delta_e(r['open L,a,b'], OPEN[near]) <= 8),
        ('Farbe Ufer dE <= 8', delta_e(r['shore L,a,b'], SHORE[near]), delta_e(r['shore L,a,b'], SHORE[near]) <= 8),
        ('Flachwasser dL 1.5-15', r['shallows dL'], 1.5 <= r['shallows dL'] <= 15),
        (
            'Glanz ' + ('0.1-1 %' if near else '<= 0.5 %'),
            r['glints %'],
            0.1 <= r['glints %'] <= 1 if near else r['glints %'] <= 0.5,
        ),
    ]
    return out


def gauntlet(folder):
    green = total = 0
    for name, _, near in SCENES:
        r = measure(f'{folder}/{name}.png')
        for row, v, ok in rows(r, near):
            total += 1
            green += bool(ok)
            print(f'{"GRÜN" if ok else "ROT "}  {name:16s} {row:24s} {v:6.2f}')
    print(f'{green} von {total} grün')


def fmt(v):
    if isinstance(v, tuple):
        return '/'.join(f'{x:.0f}' for x in v)
    return f'{v:.2f}'


if __name__ == '__main__':
    if sys.argv[1] == '--gauntlet':
        gauntlet(sys.argv[2])
        sys.exit(0)
    for arg in sys.argv[1:]:
        path, _, b = arg.partition(':')
        box = tuple(int(x) for x in b.split(',')) if b else None
        r = measure(path, box)
        print(path.split('/')[-1], '  '.join(f'{k} {fmt(v)}' for k, v in r.items()))
