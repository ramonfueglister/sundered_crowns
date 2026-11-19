"""The gauntlet of the near view: the near probe (near-probe.html) against the reference class image of the houses.

Usage: python3 tools/lookprobe/gauntlet_near.py reference.png probe.png
The measurements are those of gauntlet.py (colour classes, what lies on their surfaces, spots, fine detail, tiles),
with the regions of the reference class image: the row of houses, the quay before it, the water at the lower right.
The reference shows fields and palms at the upper left, which Venice has not: that corner is left out of the regions,
and the classes of green and yellow are not compared. The edge angles are not measured either: the reference has no
one camera (its row of houses runs as seen from 16 degrees up, its roofs as seen from 40), and the camera is the
stage's, not the houses'.
"""

import sys

import numpy as np
from gauntlet import class_colour, detail, hexc, hsv, inner, load, lum
from scipy import ndimage as ndi

# picture regions (x0, y0, x1, y1) in a 1672 x 941 frame, read off the reference class image
REGIONS = {'Häuser': (170, 150, 1672, 660), 'Kai': (0, 600, 1300, 941), 'Wasser': (950, 640, 1672, 941)}
CLASSES = {
    'Wasser': lambda h, s, v: (h > 165) & (h < 205) & (s > 0.35),
    'Dach': lambda h, s, v: ((h < 24) | (h > 350)) & (s > 0.5) & (v > 0.5),
    'Wand': lambda h, s, v: (h >= 14) & (h < 48) & (s > 0.12) & (s <= 0.6) & (v > 0.5),
    'Grau/Schatten': lambda h, s, v: (s < 0.25) & (v <= 0.55),
}


def region_mask(shape):
    m = np.zeros(shape[:2], bool)
    for x0, y0, x1, y1 in REGIONS.values():
        m[y0:y1, x0:x1] = True
    return m


def spot_groups(im, box, sign):
    """spots as gauntlet.spots counts them, but merged where they lie within three pixels of each other: the AI
    reference's spots are grainy and one window or bush falls into three or four fragments, which a clean voxel
    picture would never match; merged, both count the windows, flowers and lights, not the grain"""
    x0, y0, x1, y1 = box
    g = lum(im)[y0:y1, x0:x1]
    lab, n = ndi.label((g - ndi.gaussian_filter(g, 4)) * sign > 0.1)
    sizes = ndi.sum(np.ones_like(g), lab, range(1, n + 1))
    keep = np.isin(lab, np.where((sizes >= 3) & (sizes <= 90))[0] + 1)
    return int(ndi.label(ndi.binary_dilation(keep, iterations=3))[1])


def main(ref_path, probe_path):
    ref, probe = load(ref_path), load(probe_path)
    fails = 0

    def check(name, a, b, ok, fmt='{:.3f}'):
        nonlocal fails
        fails += 0 if ok else 1
        print(f'{name:34s} {fmt.format(a):>9s} {fmt.format(b):>9s}  {"PASS" if ok else "FAIL"}')

    print(f'{"Prüfung":34s} {"Referenz":>9s} {"Probe":>9s}')
    (rh, rs, rv), (ph, ps, pv) = hsv(ref), hsv(probe)
    roi = region_mask(ref.shape)
    check('mittlere Sättigung', rs[roi].mean(), ps[roi].mean(), abs(rs[roi].mean() - ps[roi].mean()) <= 0.03)
    check('mittlere Helligkeit', rv[roi].mean(), pv[roi].mean(), abs(rv[roi].mean() - pv[roi].mean()) <= 0.03)
    for name, q in (('dunkelste 5 %', 5), ('Median', 50), ('hellste 5 %', 95)):
        a, b = np.percentile(rv[roi], q), np.percentile(pv[roi], q)
        check(f'Helligkeit {name}', a, b, abs(a - b) <= 0.04)
    for name, f in CLASSES.items():
        ma, mb = f(rh, rs, rv) & roi, f(ph, ps, pv) & roi
        check(f'Anteil {name} (%)', ma.mean() * 100, mb.mean() * 100, abs(ma.mean() - mb.mean()) <= 0.03, '{:.1f}')
        for part, lo, hi in (('dunkel', 0.05, 0.15), ('mittel', 0.45, 0.55), ('hell', 0.85, 0.95)):
            a, b = class_colour(ref, ma, lo, hi), class_colour(probe, mb, lo, hi)
            dist = 1 if a is None or b is None else float(np.abs(a - b).max())
            fails += 0 if dist <= 0.08 else 1
            print(
                f'{"Farbe " + name + " " + part:34s} {hexc(a):>9s} {hexc(b):>9s}  {"PASS" if dist <= 0.08 else "FAIL"}'
            )
    for name, f in CLASSES.items():
        if name == 'Grau/Schatten':
            continue
        (ra, rt), (pa, pt) = inner(ref, f(rh, rs, rv) & roi), inner(probe, f(ph, ps, pv) & roi)
        check(f'Struktur auf {name}', rt * 100, pt * 100, 0.75 <= pt / max(rt, 1e-6) <= 1.33, '{:.2f}')
        check(f'geschlossene Fläche {name} (%)', ra * 100, pa * 100, abs(ra - pa) <= 0.02 + 0.2 * ra, '{:.1f}')
    for name, box in REGIONS.items():
        for label, sign in (('dunkle Tupfer', -1), ('helle Tupfer', 1)):
            a, b = spot_groups(ref, box, sign), spot_groups(probe, box, sign)
            check(f'{label} {name}', a, b, 0.75 <= b / max(a, 1) <= 1.33, '{:.0f}')
    for name, box in REGIONS.items():
        (rf, rc), (pf, pc) = detail(ref, box), detail(probe, box)
        check(f'Feindetail {name}', rf * 100, pf * 100, 0.8 <= pf / rf <= 1.25, '{:.2f}')
        check(f'Formenreichtum {name}', rc * 100, pc * 100, 0.8 <= pc / rc <= 1.25, '{:.2f}')
    # the regions cut into tiles of 209 x 188: each tile close to the reference in mean colour and in liveliness
    ok_colour = ok_live = n = 0
    for ty in range(5):
        for tx in range(8):
            box = (tx * 209, ty * 188, (tx + 1) * 209, (ty + 1) * 188)
            if not roi[box[1] : box[3], box[0] : box[2]].all():
                continue
            n += 1
            a, b = (
                ref[box[1] : box[3], box[0] : box[2]].mean((0, 1)),
                probe[box[1] : box[3], box[0] : box[2]].mean((0, 1)),
            )
            ok_colour += np.abs(a - b).max() <= 0.1
            (rf, rc), (pf, pc) = detail(ref, box), detail(probe, box)
            ok_live += 0.7 <= (pf + pc) / (rf + rc) <= 1.4
    check(f'Kacheln mit passender Farbe (% von {n})', 100, ok_colour / n * 100, ok_colour >= 0.8 * n, '{:.0f}')
    check(f'Kacheln mit passendem Detail (% von {n})', 100, ok_live / n * 100, ok_live >= 0.8 * n, '{:.0f}')

    def hist(h, s_, v, m):
        return np.histogramdd(np.stack([h[m] / 360, s_[m], v[m]], 1), bins=(18, 5, 5), range=((0, 1),) * 3)[0] / m.sum()

    overlap = np.minimum(hist(rh, rs, rv, roi), hist(ph, ps, pv, roi)).sum()
    check('Überdeckung der Farbverteilung', 1, overlap, overlap >= 0.75)
    print(f'\n{fails} Prüfungen nicht bestanden' if fails else '\nAlle Prüfungen bestanden')


if __name__ == '__main__':
    main(*sys.argv[1:3])
