"""The geometry of Euratlas Periodis for tools/history/borders/euratlas_places.py (step 4 of its method): the entity
frame fitted to longitude and latitude by control cities, and the checks of the quarter maps against it.
"""

import numpy as np
from PIL import Image
from scipy import ndimage as nd

ORDER = 3
PROJ = {'lon0': 0.0, 'lat0': 45.0}
# quarter map pixel -> entity frame pixel: ent = scale * q + offset (measured on 1300 by colour matching)
CROP = {'NW': (0.595, 5, -2), 'NE': (0.593, 361, -2), 'SW': (0.595, 5, 278), 'SE': (0.592, 361, 279)}
CONTROL_POINTS = [  # quarter, city, lon, lat, x, y (pixel on the quarter map; measured on the 1300 quarters)
    ('NW', 'York', -1.08, 53.96, 212.0, 252.0),
    ('NW', 'Lincoln', -0.54, 53.23, 224.0, 278.5),
    ('NW', 'Colchester', 0.9, 51.89, 254.5, 326.0),
    ('NW', 'London', -0.13, 51.51, 234.0, 340.0),
    ('NW', 'Paris', 2.35, 48.86, 286.5, 430.0),
    ('NW', 'Bordeaux', -0.58, 44.84, 224.0, 555.0),
    ('NW', 'Krakow', 19.94, 50.06, 681.0, 387.0),
    ('NW', 'Konstanz', 9.17, 47.66, 436.3, 470.7),
    ('NW', 'Esztergom', 18.74, 47.79, 643.5, 465.5),
    ('NW', 'Hamburg', 9.99, 53.55, 454.0, 267.5),
    ('NW', 'Edinburgh', -3.19, 55.95, 166, 175.5),
    ('NW', 'Dijon', 5.04, 47.32, 346, 480.5),
    ('NW', 'Lyon', 4.84, 45.76, 342, 530),
    ('SW', 'Lyon', 4.84, 45.76, 341.5, 58.5),
    ('SW', 'Bordeaux', -0.58, 44.84, 223.0, 86.0),
    ('SW', 'Marseille', 5.37, 43.3, 353.0, 133.5),
    ('SW', 'Zaragoza', -0.88, 41.65, 216.0, 180.5),
    ('SW', 'Barcelona', 2.17, 41.39, 283.7, 190.3),
    ('SW', 'Toledo', -4.02, 39.86, 148.0, 232.0),
    ('SW', 'Valencia', -0.38, 39.47, 226.3, 243.7),
    ('SW', 'Lisbon', -9.14, 38.72, 33.7, 266.7),
    ('SW', 'Cordoba', -4.78, 37.88, 131.5, 288.0),
    ('SW', 'Granada', -3.6, 37.18, 158.0, 308.5),
    ('SW', 'Cadiz', -6.29, 36.53, 98.7, 326.3),
    ('SW', 'Palermo', 13.36, 38.12, 528.5, 282.5),
    ('SW', 'Tunis', 10.18, 36.8, 458.7, 317.7),
    ('SW', 'Sfax', 10.76, 34.74, 470.5, 373.0),
    ('SW', 'Naples', 14.27, 40.85, 546.3, 204.3),
    ('SW', 'Ancona', 13.52, 43.62, 531.0, 123.5),
    ('SW', 'Rimini', 12.57, 44.06, 509.7, 110.7),
    ('SW', 'Durres', 19.45, 41.32, 660.5, 193.0),
    ('SW', 'Venice', 12.33, 45.44, 506.0, 68.0),
    ('SW', 'Genoa', 8.93, 44.41, 430.0, 100.0),
    ('SE', 'Durres', 19.45, 41.32, 62.7, 193.3),
    ('SE', 'Constantinople', 28.98, 41.01, 270.5, 200.5),
    ('SE', 'Thessaloniki', 22.94, 40.64, 140.0, 211.5),
    ('SE', 'Silistra', 27.26, 44.12, 233.5, 109.5),
    ('SE', 'Bursa', 29.06, 40.19, 273.5, 222.5),
    ('SE', 'Thebes', 23.32, 38.32, 147.3, 275.7),
    ('SE', 'Monemvasia', 23.05, 36.69, 140.7, 321.3),
    ('SE', 'Rhodes', 28.22, 36.43, 254.0, 328.0),
    ('SE', 'Candia', 25.13, 35.34, 187.0, 358.8),
    ('SE', 'Damietta', 31.81, 31.42, 334.0, 460.5),
    ('SE', 'Cairo', 31.24, 30.04, 320.0, 492.5),
    ('SE', 'Jerusalem', 35.22, 31.78, 407.0, 450.0),
    ('SE', 'Aleppo', 37.16, 36.2, 450.0, 334.5),
    ('SE', 'Mosul', 43.13, 36.34, 580.0, 330.5),
    ('SE', 'Tabriz', 46.29, 38.08, 649.0, 284.0),
    ('SE', 'Tarsus', 34.89, 36.92, 400.0, 315.0),
    ('SE', 'Erzurum', 41.27, 39.9, 540.5, 231.5),
    ('SE', 'Trebizond', 39.72, 41.0, 505.5, 201.0),
    ('SE', 'Sivas', 37.02, 39.75, 446.5, 236.5),
    ('SE', 'Caffa', 35.38, 45.03, 409.8, 80.4),
    ('SE', 'Edessa', 38.79, 37.16, 485.5, 309),
    ('SE', 'Damascus', 36.29, 33.51, 430.5, 405.5),
    ('SE', 'Baghdad', 44.36, 33.31, 607, 410),
    ('NE', 'Novgorod', 31.27, 58.52, 320.7, 72.3),
    ('NE', 'Kiev', 30.52, 50.45, 304.7, 378.3),
    ('NE', 'Krakow', 19.94, 50.06, 74.3, 390.3),
    ('NE', 'Esztergom', 18.74, 47.79, 46.2, 465.0),
    ('NE', 'Silistra', 27.26, 44.12, 233.5, 581),
    ('NE', 'Caffa', 35.38, 45.03, 409.8, 552.2),
]


def proj(ll):
    l = np.radians(ll[:, 0] - PROJ['lon0'])
    p = np.radians(ll[:, 1])
    return np.stack([l * np.cos(np.radians(PROJ['lat0'])), p], -1)


def design(P, order):
    x, y = P[:, 0], P[:, 1]
    cols = [np.ones_like(x), x, y]
    if order >= 2:
        cols += [x * x, x * y, y * y]
    if order >= 3:
        cols += [x**3, x * x * y, x * y * y, y**3]
    return np.stack(cols, -1)


def fit(ll, px, order):
    C, *_ = np.linalg.lstsq(design(proj(ll), order), px, rcond=None)
    return C


def apply(C, ll, order):
    return design(proj(ll), order) @ C


def entity_fit():
    pts = {}
    for q, name, lon, lat, x, y in CONTROL_POINTS:
        f, ox, oy = CROP[q]
        pts.setdefault(name, [(lon, lat), []])[1].append((f * x + ox, f * y + oy))
    names = sorted(pts)
    ll = np.array([pts[n][0] for n in names])
    px = np.array([np.mean(pts[n][1], 0) for n in names])
    C = fit(ll, px, ORDER)
    r = np.linalg.norm(apply(C, ll, ORDER) - px, axis=1)
    loo = []
    for i in range(len(names)):
        m = np.arange(len(names)) != i
        Ci = fit(ll[m], px[m], ORDER)
        loo.append(np.linalg.norm(apply(Ci, ll[i : i + 1], ORDER)[0] - px[i]))
    loo = np.array(loo)
    return C, {
        'control_points': len(names),
        'points_on_quarters': len(CONTROL_POINTS),
        'model': f'{ORDER}rd-order polynomial in lon/lat (equirectangular, lon0 0, lat0 45)'
        if ORDER == 3
        else f'order {ORDER}',
        'rms_px': round(float(np.sqrt((r**2).mean())), 2),
        'loo_rms_px': round(float(np.sqrt((loo**2).mean())), 2),
        'max_px': round(float(r.max()), 2),
        'per_city_px': {n: round(float(v), 2) for n, v in zip(names, r)},
    }


def darkdots(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = (b > 90) & (r < 110) & (g < 90) & (b - r > 50) & (b - g > 60) & (a.sum(-1) < 420)
    lab, n = nd.label(m)
    if n == 0:
        return np.zeros((0, 2))
    cs = nd.center_of_mass(m, lab, range(1, n + 1))
    ss = nd.sum(m, lab, range(1, n + 1))
    return np.array([(c[1], c[0]) for c, s in zip(cs, ss) if 1 <= s <= 16])


def crop_check(qimg, base, f, ox, oy):
    """share of quarter pixels whose colour matches the entity-frame median at the crop, best over +-3 px"""
    I = np.asarray(
        Image.fromarray(qimg.astype(np.uint8)).resize(
            (int(round(qimg.shape[1] * f)), int(round(qimg.shape[0] * f))), Image.BILINEAR
        )
    ).astype(int)
    H, W = base.shape[:2]
    h, w = I.shape[:2]
    best = None
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            x0, y0 = ox + dx, oy + dy
            ya, yb, xa, xb = max(0, y0), min(H, y0 + h), max(0, x0), min(W, x0 + w)
            d = (np.abs(base[ya:yb, xa:xb] - I[ya - y0 : yb - y0, xa - x0 : xb - x0]).sum(-1) < 30).mean()
            if best is None or d > best[0]:
                best = (float(d), dx, dy)
    return best
