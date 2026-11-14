"""The gauntlet: every round of the look probe has to pass these measurements against the reference image.

Usage: python3 tools/lookprobe/gauntlet.py reference.png probe.png
Needs Pillow, numpy and scipy. Prints one line per check with the reference value, the probe value and PASS or FAIL.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

# picture regions (x0, y0, x1, y1) in a 1672 x 941 frame; the probe scene is laid out like the reference
REGIONS = {'Stadt': (760, 380, 1420, 700), 'Land': (0, 230, 720, 640), 'Wald/Berg': (0, 0, 900, 220), 'Wasser': (1050, 640, 1672, 941)}


def load(path):
    return np.asarray(Image.open(path).convert('RGB').resize((1672, 941), Image.LANCZOS)).astype(float) / 255


def hsv(im):
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    mx, mn = im.max(-1), im.min(-1)
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    return h, np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0), mx


def lum(im):
    return im @ np.array([0.2126, 0.7152, 0.0722])


def edge_angles(im):
    """the two strongest edge directions off the vertical: degrees, positive = running down to the right"""
    g = ndi.gaussian_filter(lum(im), 1.0)
    gx, gy = ndi.sobel(g, axis=1), ndi.sobel(g, axis=0)
    mag = np.hypot(gx, gy)
    m = mag > np.percentile(mag, 90)
    ang = (np.degrees(np.arctan2(gy[m], gx[m])) + 90) % 180
    ang = np.where(ang > 90, ang - 180, ang)
    hist, _ = np.histogram(ang, bins=180, range=(-90, 90), weights=mag[m])
    hist = ndi.gaussian_filter1d(hist, 1.5)
    c = np.arange(-89.5, 90, 1)
    down = c[(c > 5) & (c < 45)][np.argmax(hist[(c > 5) & (c < 45)])]
    up = c[(c < -5) & (c > -45)][np.argmax(hist[(c < -5) & (c > -45)])]
    return down, up


def detail(im, box):
    """small-scale liveliness of a region: mean local contrast at the scale of a few pixels"""
    x0, y0, x1, y1 = box
    g = lum(im)[y0:y1, x0:x1]
    fine = np.abs(g - ndi.gaussian_filter(g, 1.5)).mean()            # what a 3-pixel blur removes
    coarse = np.abs(ndi.gaussian_filter(g, 1.5) - ndi.gaussian_filter(g, 6)).mean()  # shapes of 5 to 20 pixels
    return fine, coarse


def class_colour(im, mask, lo, hi):
    px = im[mask]
    if len(px) < 300:
        return None
    order = np.argsort(lum(px))
    return np.median(px[order[int(len(px) * lo):int(len(px) * hi)]], axis=0)


def hexc(c):
    return '   -   ' if c is None else '#%02x%02x%02x' % tuple(int(round(v * 255)) for v in c)


def main(ref_path, probe_path):
    ref, probe = load(ref_path), load(probe_path)
    fails = 0

    def check(name, a, b, ok, fmt='{:.3f}'):
        nonlocal fails
        fails += 0 if ok else 1
        print(f"{name:34s} {fmt.format(a):>9s} {fmt.format(b):>9s}  {'PASS' if ok else 'FAIL'}")

    print(f"{'Prüfung':34s} {'Referenz':>9s} {'Probe':>9s}")
    (rd, ru), (pd, pu) = edge_angles(ref), edge_angles(probe)
    check('Kantenwinkel abwärts (Grad)', rd, pd, abs(rd - pd) <= 2, '{:+.1f}')
    check('Kantenwinkel aufwärts (Grad)', ru, pu, abs(ru - pu) <= 2, '{:+.1f}')

    (rh, rs, rv), (ph, ps, pv) = hsv(ref), hsv(probe)
    check('mittlere Sättigung', rs.mean(), ps.mean(), abs(rs.mean() - ps.mean()) <= 0.03)
    check('mittlere Helligkeit', rv.mean(), pv.mean(), abs(rv.mean() - pv.mean()) <= 0.03)
    for name, q in (('dunkelste 5 %', 5), ('Median', 50), ('hellste 5 %', 95)):
        a, b = np.percentile(rv, q), np.percentile(pv, q)
        check(f'Helligkeit {name}', a, b, abs(a - b) <= 0.04)

    classes = {
        'Grün': lambda h, s, v: (h > 62) & (h < 140) & (s > 0.35),
        'Gelb': lambda h, s, v: (h > 38) & (h <= 62) & (s > 0.5),
        'Wasser': lambda h, s, v: (h > 165) & (h < 205) & (s > 0.35),
        'Dach': lambda h, s, v: ((h < 24) | (h > 350)) & (s > 0.5) & (v > 0.5),
        'helle Wand': lambda h, s, v: (s < 0.3) & (v > 0.55),
        'Grau/Schatten': lambda h, s, v: (s < 0.25) & (v <= 0.55),
    }
    for name, f in classes.items():
        ma, mb = f(rh, rs, rv), f(ph, ps, pv)
        check(f'Anteil {name} (%)', ma.mean() * 100, mb.mean() * 100, abs(ma.mean() - mb.mean()) <= 0.035, '{:.1f}')
        for part, lo, hi in (('dunkel', 0.05, 0.15), ('mittel', 0.45, 0.55), ('hell', 0.85, 0.95)):
            a, b = class_colour(ref, ma, lo, hi), class_colour(probe, mb, lo, hi)
            dist = 1 if a is None or b is None else float(np.abs(a - b).max())
            fails += 0 if dist <= 0.1 else 1
            print(f"{'Farbe ' + name + ' ' + part:34s} {hexc(a):>9s} {hexc(b):>9s}  {'PASS' if dist <= 0.1 else 'FAIL'}")

    for name, box in REGIONS.items():
        (rf, rc), (pf, pc) = detail(ref, box), detail(probe, box)
        check(f'Feindetail {name}', rf * 100, pf * 100, 0.75 <= pf / rf <= 1.35, '{:.2f}')
        check(f'Formenreichtum {name}', rc * 100, pc * 100, 0.75 <= pc / rc <= 1.35, '{:.2f}')
    print(f"\n{fails} Prüfungen nicht bestanden" if fails else "\nAlle Prüfungen bestanden")


if __name__ == '__main__':
    main(*sys.argv[1:3])
