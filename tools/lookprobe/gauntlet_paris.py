"""The gauntlet of the Paris prototype: the Paris probe (paris-probe.html) against Ramon's reference picture of the
Île de la Cité of 20 November 2026 ("so stelle ich mir das eher vor").

Usage: python3 tools/lookprobe/gauntlet_paris.py reference.png probe.png
The probe is shot at the reference's size (SHOT_W=1448 SHOT_H=1086 node tools/lookprobe/shot.mjs ...). Only the town
part of the reference is measured, the houses and the market square at its left (REF_BOX, below the river and above
the quay wall): its cathedral, town wall, river and bridge are not built by the house kit. The probe is all town, so
the whole probe picture is measured. The edge angles are not compared: the reference is drawn from a camera turned
about 30 degrees off ours, and the camera is the game's, not the houses'. What is measured, each against a limit that
a glance could not tell apart: the light (saturation, brightness and its spread), the share and colour of each class
of surface (roofs, pale walls, dark timber and openings, slate, green, paving), the share of each band of hue, how
varied the roofs are from house to house and how finely they are cut into surfaces, the windows and other small spots
per area, fine detail and the overlap of the colour spread.
"""

import sys

import numpy as np
from gauntlet import class_colour, detail, hexc, hsv, lum
from PIL import Image
from scipy import ndimage as ndi

REF_BOX = (0, 255, 680, 970)
CLASSES = {
    'Dach': lambda h, s, v: ((h < 32) | (h > 345)) & (s > 0.38) & (v > 0.22) & (v < 0.86),
    'Wand hell': lambda h, s, v: (s < 0.32) & (v > 0.68),
    'Balken/Öffnung': lambda h, s, v: v < 0.3,
    'Schiefer': lambda h, s, v: (s < 0.2) & (v > 0.25) & (v < 0.55) & (h > 190) & (h < 320),
    'Grün': lambda h, s, v: (h > 60) & (h < 150) & (s > 0.3),
    'Pflaster': lambda h, s, v: (s < 0.25) & (v > 0.45) & (v <= 0.68),
}

# bands of hue for the coloured pixels (saturation over 0.25, brightness over 0.25), in degrees: added after the first
# search found pink walls and ochre roofs that the classes above do not hold (their hues fall between the classes)
HUES = ((345, 10), (10, 20), (20, 30), (30, 45), (45, 75))


# the same for the pale warm pixels (saturation 0.22 to 0.45, brightness over 0.6): cream walls against pink ones,
# added after the second search turned the walls pink, which the hues above count with the red roofs
PALE = ((340, 20), (20, 40))


def hue_band(h, s, v, lo, hi, pale=False):
    inside = (h >= lo) | (h < hi) if lo > hi else (h >= lo) & (h < hi)
    return inside & ((s > 0.22) & (s < 0.45) & (v > 0.6) if pale else (s > 0.25) & (v > 0.25))


def spread(im):
    """the colour spread: the share of the picture in each of 18 hues by 5 saturations by 5 brightnesses"""
    h, s, v = hsv(im)
    cube = np.stack([h.ravel() / 360, s.ravel(), v.ravel()], 1)
    return np.histogramdd(cube, bins=(18, 5, 5), range=((0, 1),) * 3)[0] / h.size


def load(path, box=None):
    im = Image.open(path).convert('RGB')
    if im.size != (1448, 1086):
        im = im.resize((1448, 1086), Image.LANCZOS)
    a = np.asarray(im).astype(float) / 255
    if box:
        x0, y0, x1, y1 = box
        a = a[y0:y1, x0:x1]
    return a


def roofs(im):
    """the roof surfaces as patches: the picture blurred by 2.5 pixels (the AI reference's grain would split every
    roof into tiles), the roof and slate classes cut into bands of brightness (0.08) and hue (12 degrees), each band
    split into its connected patches. A slope in sun and one in shade, or two neighbouring roofs of another colour,
    fall into different patches; a row of roofs of one colour into one. Returns the number of patches of at least 300
    pixels per million pixels, and the spread of their mean colours: the standard deviation of their brightness and
    of their hue in degrees"""
    sm = ndi.gaussian_filter(im, (2.5, 2.5, 0))
    h, s, v = hsv(sm)
    m = CLASSES['Dach'](h, s, v)
    hh = np.where(h > 180, h - 360, h)
    band = (np.floor(v / 0.08) * 100 + np.floor((hh + 40) / 12)).astype(int)
    band[~m] = -1
    bright, hue = [], []
    for k in np.unique(band[band >= 0]):
        lab, n = ndi.label(ndi.binary_opening(band == k, iterations=1))
        if not n:
            continue
        idx = np.arange(1, n + 1)
        keep = idx[ndi.sum(np.ones_like(v), lab, idx) >= 300]
        bright += list(ndi.mean(v, lab, keep))
        hue += list(ndi.mean(hh, lab, keep))
    if len(bright) < 3:
        return 0, 0, 0
    return len(bright) / v.size * 1e6, float(np.std(bright)), float(np.std(hue))


def spot_groups(im, sign):
    """small spots that stand out from their surroundings, merged where they lie within two pixels of each other (the
    AI reference is grainy): windows, doors, chimneys, timber crossings, figures. Returns their number per hundred
    thousand pixels and the median size of the dark ones in pixels, which says how large a window is in the picture
    and so how large a house is"""
    g = lum(im)
    lab, n = ndi.label((g - ndi.gaussian_filter(g, 4)) * sign > 0.1)
    sizes = ndi.sum(np.ones_like(g), lab, range(1, n + 1))
    good = (sizes >= 3) & (sizes <= 90)
    keep = np.isin(lab, np.where(good)[0] + 1)
    return ndi.label(ndi.binary_dilation(keep, iterations=2))[1] / g.size * 1e5, float(np.median(sizes[good]))


def ratio(a, b, lo, hi):
    """how far the probe's value b is from the reference's a, as a share of the allowed range [lo, hi] of b / a,
    negative below"""
    q = max(b, 1e-6) / max(a, 1e-6)
    return np.log(q) / np.log(hi) if q >= 1 else -np.log(q) / np.log(lo)


def measure(ref, probe):
    """every check as (name, reference, probe, error, format): the error is the distance divided by what is allowed,
    positive where the probe has more, so a check passes at an error between -1 and 1"""
    rows = []

    def check(name, a, b, err, fmt='{:.3f}'):
        rows.append((name, a, b, float(err), fmt))

    (rh, rs, rv), (ph, ps, pv) = hsv(ref), hsv(probe)
    check('mittlere Sättigung', rs.mean(), ps.mean(), (ps.mean() - rs.mean()) / 0.03)
    check('mittlere Helligkeit', rv.mean(), pv.mean(), (pv.mean() - rv.mean()) / 0.03)
    for name, q in (('dunkelste 5 %', 5), ('Median', 50), ('hellste 5 %', 95)):
        a, b = np.percentile(rv, q), np.percentile(pv, q)
        check(f'Helligkeit {name}', a, b, (b - a) / 0.04)
    warm_r = (ref[..., 0] - ref[..., 2]).mean()
    warm_p = (probe[..., 0] - probe[..., 2]).mean()
    check('Wärme (Rot minus Blau)', warm_r, warm_p, (warm_p - warm_r) / 0.03)
    for name, f in CLASSES.items():
        ma, mb = f(rh, rs, rv), f(ph, ps, pv)
        tol = max(0.01, 0.2 * ma.mean())
        check(f'Anteil {name} (%)', ma.mean() * 100, mb.mean() * 100, (mb.mean() - ma.mean()) / tol, '{:.1f}')
        for part, lo, hi in (('dunkel', 0.05, 0.15), ('mittel', 0.45, 0.55), ('hell', 0.85, 0.95)):
            a, b = class_colour(ref, ma, lo, hi), class_colour(probe, mb, lo, hi)
            # the channel that differs most, with its sign
            d = np.array([1.0]) if a is None or b is None else b - a
            check(f'Farbe {name} {part}', hexc(a), hexc(b), d[np.argmax(np.abs(d))] / 0.08, '{}')
    # the hues of the coloured surfaces: pink, red, orange-brown, ochre and yellow-green, each as a share of the picture
    for lo, hi in HUES:
        ma, mb = hue_band(rh, rs, rv, lo, hi), hue_band(ph, ps, pv, lo, hi)
        tol = max(0.01, 0.2 * ma.mean())
        check(f'Farbton {lo}–{hi}° (%)', ma.mean() * 100, mb.mean() * 100, (mb.mean() - ma.mean()) / tol, '{:.1f}')
    for lo, hi in PALE:
        ma, mb = hue_band(rh, rs, rv, lo, hi, True), hue_band(ph, ps, pv, lo, hi, True)
        tol = max(0.01, 0.2 * ma.mean())
        check(
            f'blass, Farbton {lo}–{hi}° (%)', ma.mean() * 100, mb.mean() * 100, (mb.mean() - ma.mean()) / tol, '{:.1f}'
        )
    (rn, rb, rhs), (pn, pb, phs) = roofs(ref), roofs(probe)
    check('Dachflächen je Megapixel', rn, pn, ratio(rn, pn, 0.7, 1.4), '{:.0f}')
    check('Dachvielfalt Helligkeit', rb, pb, ratio(rb, pb, 0.75, 1.33))
    check('Dachvielfalt Farbton (Grad)', rhs, phs, ratio(rhs, phs, 0.75, 1.33), '{:.1f}')
    for label, sign in (('dunkle Tupfer', -1), ('helle Tupfer', 1)):
        (a, sa), (b, sb) = spot_groups(ref, sign), spot_groups(probe, sign)
        check(f'{label} je 100k Pixel', a, b, ratio(a, b, 0.75, 1.33), '{:.1f}')
        if sign < 0:
            check('Grösse dunkler Tupfer (Pixel)', sa, sb, ratio(sa, sb, 0.75, 1.33), '{:.1f}')
    (rf, rc), (pf, pc) = (
        detail(ref, (0, 0, ref.shape[1], ref.shape[0])),
        detail(probe, (0, 0, probe.shape[1], probe.shape[0])),
    )
    check('Feindetail', rf * 100, pf * 100, ratio(rf, pf, 0.8, 1.25), '{:.2f}')
    check('Formenreichtum', rc * 100, pc * 100, ratio(rc, pc, 0.8, 1.25), '{:.2f}')

    overlap = np.minimum(spread(ref), spread(probe)).sum()
    check('Überdeckung der Farbverteilung', 1, overlap, (1 - overlap) / 0.25)
    return rows


def main(ref_path, probe_path):
    rows = measure(load(ref_path, REF_BOX), load(probe_path))
    print(f'{"Prüfung":38s} {"Referenz":>9s} {"Probe":>9s}')
    for name, a, b, err, fmt in rows:
        print(f'{name:38s} {fmt.format(a):>9s} {fmt.format(b):>9s}  {"PASS" if abs(err) <= 1 else "FAIL"}')
    fails = sum(abs(err) > 1 for *_, err, _ in rows)
    print(f'\n{len(rows) - fails} von {len(rows)} Prüfungen bestanden')
    return fails


if __name__ == '__main__':
    sys.exit(1 if main(*sys.argv[1:3]) else 0)
