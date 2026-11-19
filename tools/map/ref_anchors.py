"""Samples the colours of the realms on the EU5 reference (karte/referenz-eu5/eu5-weltkarte-1337.png) for the ANCHORS of
tools/map/palette.py: the median of a 9 x 9 patch inside each realm, its ink (OKLab L < 0.33) left out.
Run: python3 tools/map/ref_anchors.py [reference.png]   (prints the colours as JSON)
"""

import numpy as np


def lin(v):
    v = v / 255
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def oklch(rgb):
    r, g, b = [lin(rgb[..., i]) for i in range(3)]
    l = np.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    m = np.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    s = np.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
    A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
    B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    return np.stack([L, np.hypot(A, B), np.degrees(np.arctan2(B, A)) % 360], -1)


import json
import sys

from PIL import Image

# points inside the realms on the reference picture (its own pixels, 2552 x 1272)
POINTS = {
    'france': (1175, 325),
    'england': (1175, 270),
    'castile': (1160, 385),
    'portugal': (1122, 385),
    'aragon': (1182, 380),
    'naples': (1297, 395),
    'sicily': (1280, 410),
    'serbia': (1325, 370),
    'hungary': (1312, 307),
    'bohemia': (1280, 290),
    'poland': (1317, 267),
    'sweden': (1280, 170),
    'norway': (1255, 180),
    'novgorod': (1417, 187),
    'moscow': (1450, 175),
    'lithuania': (1360, 237),
    'kiev': (1407, 282),
    'volhynia': (1357, 277),
    'teutonic_order': (1335, 220),
    'golden_horde': (1550, 247),
    'great_perm': (1557, 187),
    'vyatka': (1530, 192),
    'wallachia': (1355, 342),
    'georgia': (1510, 380),
    'jalayirid': (1467, 413),
    'cyprus': (1415, 435),
    'mamluk': (1410, 497),
    'makuria': (1405, 580),
    'alodia': (1420, 617),
    'marinid': (1127, 457),
    'hafsid_tunis': (1237, 427),
    'mali': (1085, 640),
    'chagatai': (1735, 383),
    'yuan': (1960, 319),
    'delhi': (1732, 510),
    'ashikaga': (2151, 419),
    'goryeo': (2069, 392),
    'gampola': (1750, 674),
    'khmer': (1928, 629),
    'sukhothai': (1909, 597),
    'majapahit': (1978, 807),
}

if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/karte/referenz-eu5/eu5-weltkarte-1337.png'
    im = np.asarray(Image.open(path).convert('RGB')).astype(float)
    out = {}
    for k, (x, y) in POINTS.items():
        b = im[y - 4 : y + 5, x - 4 : x + 5].reshape(-1, 3)
        b = b[oklch(b)[:, 0] > 0.33]
        out[k] = '#%02x%02x%02x' % tuple(int(round(v)) for v in np.median(b, 0))
    print(json.dumps(out, indent=1))
