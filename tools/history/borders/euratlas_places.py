"""Euratlas Periodis, one year, read per place of the map (border feature, doc "Grenzen nach echten Daten"):
data/history/borders/euratlas/euratlas_<year>_places.json and euratlas_<year>_states.tsv, in the format of
data/history/1291/ref/euratlas_1300_*.

Source: Euratlas Periodis (Christos Nüssli), the maps of one year as shown on euratlas.net: the four quarter maps
(<year>_Northwest/Northeast/Southwest/Southeast) and the per-entity maps. The images stay on the Mac; only derived
facts (which entity holds the centre of each place) go into the repository.

Method (the one of the 1300 reading, made into one script):
1. Entities: name, full name, status (S sovereign, D dependent, P people) and "Depends on" from the entity pages.
2. Masks: each entity page highlights one entity on the same full-Europe frame (728x588). The difference to the
   per-pixel median of all pages of the year gives a red outline (sovereignty) or a green outline / tint
   (dependency); the outline is filled with a ray-parity inside test, with fixes for thin outlines and flat-colour
   fills that pass the same test.
3. Raster: per pixel the smallest sovereign mask and the smallest dependent mask (a dependent's overlord where no
   sovereign mask covers it; a sovereign holding land under another goes to the dependent slot).
4. Geometry: the entity frame is the same in every year (checked per year against the median image of 1300), so
   one fit is used: CONTROL_POINTS, 55 cities measured as dots on the 1300 quarter maps (62 points; cities on two
   quarters are averaged), mapped into the entity frame by the quarter crops (scale ~0.59, offsets below), fitted
   with a polynomial of ORDER in an equirectangular projection (lon0 0, lat0 45). Per year the script checks the
   quarter crops against the year's own images and reports the distance from each predicted city to the nearest
   city dot on the year's quarter maps (residuals_px).
5. Sampling: each place centre is labelled in the entity frame (3x3 majority) and on each quarter that covers it
   (the flat-colour segment it lies in, labelled by the entity-raster majority of that segment); weighted vote.
   Regional maps are not used (they need their own control points per sheet).

    python3 tools/history/borders/euratlas_places.py <year> <dir with index.html, quarter jpgs, entities/>

Needs numpy, scipy, scikit-image and Pillow.
"""

import csv, glob, html, json, os, re, sys
import numpy as np
from PIL import Image
from scipy import ndimage as nd
from skimage.measure import label as sklabel

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
ORDER = 3
PROJ = dict(lon0=0.0, lat0=45.0)
QUARTERS = ('Northwest', 'Northeast', 'Southwest', 'Southeast')
QK = dict(Northwest='NW', Northeast='NE', Southwest='SW', Southeast='SE')
# quarter map pixel -> entity frame pixel: ent = scale * q + offset (measured on 1300 by colour matching)
CROP = dict(NW=(0.595, 5, -2), NE=(0.593, 361, -2), SW=(0.595, 5, 278), SE=(0.592, 361, 279))
SEA = np.array([230, 233, 242])
BLIND = [(503, 512, 684, 544)]  # "Copyright Euratlas" box in the entity frame: no data
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


# ---------------------------------------------------------------- geometry
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
    return C, dict(
        control_points=len(names),
        points_on_quarters=len(CONTROL_POINTS),
        model=f'{ORDER}rd-order polynomial in lon/lat (equirectangular, lon0 0, lat0 45)'
        if ORDER == 3
        else f'order {ORDER}',
        rms_px=round(float(np.sqrt((r**2).mean())), 2),
        loo_rms_px=round(float(np.sqrt((loo**2).mean())), 2),
        max_px=round(float(r.max()), 2),
        per_city_px={n: round(float(v), 2) for n, v in zip(names, r)},
    )


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


# ---------------------------------------------------------------- entities and masks
def read_entities(d):
    pages = sorted(glob.glob(os.path.join(d, 'entities', 'entity_*.html')))
    status = {}
    for p in pages[:3]:
        s = open(p, encoding='utf-8', errors='replace').read()
        for m in re.finditer(r'href="entity_(\d+)\.html">([^<]*?)\s*\((\w)\)', s):
            status[m.group(1)] = (html.unescape(m.group(2)).strip(), m.group(3))
    ents = {}
    for p in pages:
        e = os.path.basename(p)[7:-5]
        if not os.path.exists(p[:-5] + '.jpg'):
            continue
        s = open(p, encoding='utf-8', errors='replace').read()
        h = re.search(r'<h3[^>]*>(.*?)</h3>', s, re.S).group(1)
        bs = re.findall(r'<b[^>]*>(.*?)</b>', h, re.S)
        full = html.unescape(re.sub('<[^>]+>', '', bs[0])).strip()
        m = re.match(r'(.*)\((.*)\)$', full)
        short = m.group(2).strip() if m else full
        long = m.group(1).strip() if m else full
        dep = None
        for b in bs[1:]:
            t = html.unescape(re.sub('<[^>]+>', '', b)).strip()
            if t.startswith('Depends on'):
                dep = t[len('Depends on') :].strip()
        ents[e] = dict(short=short, long=long, dep=dep, status=status.get(e, (None, None))[1], page=os.path.basename(p))
    return ents


DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]


def inside_vote(cm, wall, anchor, y, x):
    H, W = wall.shape
    votes = []
    for dy, dx in DIRS:
        cy, cx, cr, inw = y, x, 0, False
        while 0 <= cy < H and 0 <= cx < W:
            w = wall[cy, cx]
            if w and not inw:
                cr += 1
            inw = w
            if not w and anchor[cy, cx] and not cm[cy, cx]:
                votes.append(cr % 2)
                break
            cy += dy
            cx += dx
    return votes


def lines_of(a, base):
    d = np.abs(a - base).sum(-1)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return d, {
        'red': (d > 60) & (r > 150) & (g < 120) & (b < 120),
        'grn': (d > 60) & (g > 140) & (g - r > 25) & (g - b > 35),
    }


def build_masks(d, ents, base):
    H, W = base.shape[:2]
    sea18 = np.abs(base - SEA).sum(-1) < 18
    lab, _ = nd.label(sea18)
    sz = np.bincount(lab.ravel())
    anchor18 = np.isin(lab, np.where(sz > 40)[0][1:])
    sea = np.abs(base - SEA).sum(-1) < 25
    white = base.min(-1) > 247
    lab, _ = nd.label(sea | white)
    sz = np.bincount(lab.ravel())
    anchor25 = np.isin(lab, np.where(sz > 40)[0][1:])
    masks = {}
    for e, v in ents.items():
        a = np.asarray(Image.open(os.path.join(d, 'entities', f'entity_{e}.jpg')).convert('RGB')).astype(int)
        dd, lines = lines_of(a, base)
        res = {}
        # seg2: fill outlines by parity
        for kind, line in lines.items():
            if line.sum() < 5:
                continue
            wall = nd.binary_dilation(line, iterations=1)
            lab, n = nd.label(~wall)
            m = np.zeros((H, W), bool)
            objs = nd.find_objects(lab)
            for c in range(1, n + 1):
                sl = objs[c - 1]
                cm = lab[sl] == c
                s = cm.sum()
                if s > H * W * 0.5 or (cm & anchor18[sl]).sum() > 0.5 * s:
                    continue
                dt = nd.distance_transform_edt(cm)
                iy, ix = np.unravel_index(dt.argmax(), dt.shape)
                full = np.zeros((H, W), bool)
                full[sl] = cm
                vts = inside_vote(full, wall, anchor18, iy + sl[0].start, ix + sl[1].start)
                if vts and sum(vts) * 2 > len(vts):
                    m |= full
            m |= wall & nd.binary_dilation(m, iterations=2)
            m |= line
            res[kind] = m
        # tint: green tint touching the green outline
        if 'grn' in res:
            df = a - base
            tint = (dd > 30) & (df[..., 1] > 12) & (df[..., 1] - df[..., 0] > 8) & (df[..., 1] - df[..., 2] > 8)
            tint = nd.binary_opening(tint, iterations=1) | lines['grn']
            lab, n = nd.label(tint)
            touch = np.unique(lab[nd.binary_dilation(res['grn'], iterations=1) & tint])
            res['grn'] |= np.isin(lab, touch[touch > 0])
        # refill: thin outlines without interior
        for kk, m in list(res.items()):
            line = lines[kk]
            ln = line.sum()
            interior = m & ~nd.binary_dilation(line, iterations=1)
            if interior.sum() >= 0.15 * ln or ln < 30:
                continue
            for it in (2, 3):
                wall = nd.binary_dilation(line, iterations=it)
                lab, n = nd.label(~wall)
                sz = np.bincount(lab.ravel())
                sz[0] = 0
                big = sz.argmax()
                add = np.zeros((H, W), bool)
                for c in range(1, n + 1):
                    if c == big or sz[c] < 3 or sz[c] > 0.3 * H * W:
                        continue
                    cm = lab == c
                    if (cm & sea).sum() > 0.5 * sz[c]:
                        continue
                    ring = nd.binary_dilation(cm, iterations=it + 1) & ~cm
                    if (ring & wall).sum() < 0.8 * ring.sum():
                        continue
                    add |= cm
                if add.sum() > 0:
                    if add.sum() <= 6 * ln:
                        res[kk] = m | (nd.binary_dilation(add, iterations=1) & ~sea) | add
                    break
        # fixfill: flat-colour areas inside a red outline
        if 'red' in res and v['status'] != 'D' and lines['red'].sum() >= 300:
            line = lines['red']
            wall = nd.binary_dilation(line, iterations=1)
            m = res['red']
            ring = nd.binary_dilation(line, iterations=3) & ~wall & ~sea & ~white & (base.sum(-1) > 250)
            if ring.sum():
                keys, cnt = np.unique(base[ring] // 12, axis=0, return_counts=True)
                for ci in np.argsort(-cnt)[:8]:
                    c = keys[ci] * 12 + 6
                    if np.abs(c - SEA).sum() < 45 or cnt[ci] < 0.02 * ring.sum():
                        continue
                    same = nd.binary_closing(np.abs(base - c).sum(-1) < 30, iterations=1) & ~wall
                    lab, n = nd.label(same)
                    for comp in range(1, n + 1):
                        cm = lab == comp
                        if cm.sum() < 10 or (cm & m).sum() == cm.sum():
                            continue
                        dt = nd.distance_transform_edt(cm)
                        ys, xs = np.nonzero(dt >= max(1, dt.max() * 0.5))
                        pick = np.linspace(0, len(ys) - 1, min(5, len(ys))).astype(int)
                        votes = sum((inside_vote(cm, wall, anchor25, ys[k], xs[k]) for k in pick), [])
                        if len(votes) >= 3 and sum(votes) > 0.7 * len(votes):
                            m = m | cm
                res['red'] = m
        masks[e] = res
        print(f'  mask {e} {v["short"]}: ' + ', '.join(f'{k} {int(x.sum())}' for k, x in res.items()), flush=True)
    return masks


def raster(ents, order, masks, base):
    H, W = base.shape[:2]
    idx = {e: i for i, e in enumerate(order)}
    byname = {ents[e]['short']: idx[e] for e in order}
    sov = np.full((H, W), -1)
    sovA = np.full((H, W), 1e9)
    dep = np.full((H, W), -1)
    depA = np.full((H, W), 1e9)
    hold = np.full((H, W), -1)
    holdA = np.full((H, W), 1e9)
    for e in order:
        v = ents[e]
        i = idx[e]
        for kk, m in masks.get(e, {}).items():
            core = nd.binary_erosion(m, iterations=1)
            if core.sum() < 3:
                core = m
            a = float(m.sum())
            if v['status'] in ('S', 'P') and kk == 'red':
                u = core & (a < sovA)
                sov[u] = i
                sovA[u] = a
            elif v['status'] == 'D':
                u = core & (a < depA)
                dep[u] = i
                depA[u] = a
            elif kk == 'grn':
                u = core & (a < holdA)
                hold[u] = i
                holdA[u] = a
    over = np.array([byname.get(ents[e]['dep'], -1) if ents[e]['dep'] else -1 for e in order] + [-1])
    m = (dep >= 0) & (sov < 0)
    sov[m] = over[dep[m]]
    m = (hold >= 0) & (dep < 0)
    dep[m] = hold[m]
    m = (hold >= 0) & (sov < 0)
    sov[m] = hold[m]
    sea = np.abs(base - SEA).sum(-1) < 25
    white = base.min(-1) > 247
    lab = sov >= 0
    dist, (iy, ix) = nd.distance_transform_edt(~lab, return_indices=True)
    fill = (~lab) & (dist <= 3) & ~sea & ~white
    sov2 = sov.copy()
    sov2[fill] = sov[iy[fill], ix[fill]]
    dep2 = dep.copy()
    dep2[fill] = dep[iy[fill], ix[fill]]
    for x0, y0, x1, y1 in BLIND:
        sov2[y0:y1, x0:x1] = -2
        dep2[y0:y1, x0:x1] = -2
    return sov2, dep2


# ---------------------------------------------------------------- sampling
def segment(a):
    m = np.stack([nd.median_filter(a[..., c], size=3) for c in range(3)], -1).astype(int)
    key = (m[..., 0] // 10) * 10000 + (m[..., 1] // 10) * 100 + (m[..., 2] // 10)
    return sklabel(key, background=-1, connectivity=1)


def label_segments(seg, sov, dep, f, off, sea):
    H, W = seg.shape
    yy, xx = np.mgrid[0:H, 0:W]
    fx, fy = f * xx + off[0], f * yy + off[1]
    ex = np.clip(np.round(fx).astype(int), 0, sov.shape[1] - 1)
    ey = np.clip(np.round(fy).astype(int), 0, sov.shape[0] - 1)
    inside = (fx >= 0) & (fx < sov.shape[1]) & (fy >= 0) & (fy < sov.shape[0])
    ps = np.where(inside, sov[ey, ex], -2)
    pd = np.where(inside, dep[ey, ex], -2)
    n = seg.max() + 1
    out_s = np.full(n, -1)
    out_d = np.full(n, -1)
    pur = np.zeros(n)
    o = np.argsort(seg.ravel(), kind='stable')
    segs = seg.ravel()[o]
    bounds = np.searchsorted(segs, np.arange(n + 1))
    PS, PD, SE = ps.ravel()[o], pd.ravel()[o], sea.ravel()[o]
    for s in range(1, n):
        a, b = bounds[s], bounds[s + 1]
        if b - a < 15 or SE[a:b].mean() > 0.5:
            continue
        v = PS[a:b]
        nin = (v != -2).sum()
        v = v[v >= 0]
        if nin < 15 or len(v) < 0.5 * nin:
            continue
        u, c = np.unique(v, return_counts=True)
        out_s[s] = u[c.argmax()]
        pur[s] = c.max() / len(v)
        w = PD[a:b]
        w = w[w >= 0]
        if len(w) > 0.3 * (b - a):
            u, c = np.unique(w, return_counts=True)
            out_d[s] = u[c.argmax()]
    return out_s, out_d, pur


def vote(labs):
    labs = np.asarray(labs)
    ok = labs >= 0
    if ok.sum() == 0:
        return -1, 0.0
    u, c = np.unique(labs[ok], return_counts=True)
    return int(u[c.argmax()]), float(c.max() / ok.sum()) * min(1.0, 2 * ok.sum() / len(labs))


def sample(LL, C, sov, dep, quarters):
    EH, EW = sov.shape
    ent_px = apply(C, LL, ORDER)

    def ent_label(p):
        x, y = int(round(p[0])), int(round(p[1]))
        if not (0 <= x < EW and 0 <= y < EH):
            return None
        for r in (1, 2, 3):
            ws = sov[max(0, y - r) : y + r + 1, max(0, x - r) : x + r + 1].ravel()
            wd = dep[max(0, y - r) : y + r + 1, max(0, x - r) : x + r + 1].ravel()
            s, sh = vote(ws)
            if s >= 0:
                dd = wd[ws == s]
                d = vote(dd)[0] if (dd >= 0).sum() * 2 > len(dd) else -1
                return s, d, sh * (1 if r == 1 else 0.8)
        return -1, -1, 0.0

    def map_label(M, p):
        seg = M['seg']
        H, W = seg.shape
        x, y = int(round(p[0])), int(round(p[1]))
        if not (3 <= x < W - 3 and 3 <= y < H - 3):
            return None
        for r in (2, 4, 6):
            ss = seg[max(0, y - r) : y + r + 1, max(0, x - r) : x + r + 1].ravel()
            lab = M['s'][ss]
            s, sh = vote(lab)
            if s >= 0:
                dl = M['d'][ss][lab == s]
                d = vote(dl)[0] if (dl >= 0).sum() * 2 > len(dl) else -1
                return s, d, sh * min(1, float(np.mean(M['pur'][ss][lab == s])) + 0.2) * (1 if r == 2 else 0.85)
        return -1, -1, 0.0

    N = len(LL)
    out_s = np.full(N, -1)
    out_d = np.full(N, -1)
    conf = np.zeros(N)
    for i in range(N):
        cands = []
        for k, M in quarters.items():
            r = map_label(M, (ent_px[i] - [M['ox'], M['oy']]) / M['f'])
            if r and r[0] >= 0:
                cands.append(r)
        e = ent_label(ent_px[i])
        if e is not None and e[0] >= 0:
            cands.append(e)
        if not cands:
            continue
        w = {}
        for s, d, c in cands:
            w[s] = w.get(s, 0) + c
        best = max(w, key=w.get)
        tot = sum(w.values())
        pick = [c for c in cands if c[0] == best]
        top = max(pick, key=lambda c: c[2])
        dv = {}
        for s, d, c in pick:
            dv[d] = dv.get(d, 0) + c
        out_s[i] = best
        out_d[i] = max(dv, key=dv.get)
        conf[i] = round(min(1.0, (w[best] / tot) * top[2]), 2)
    inbox = (ent_px[:, 0] >= 0) & (ent_px[:, 0] < EW) & (ent_px[:, 1] >= 0) & (ent_px[:, 1] < EH)
    return out_s, out_d, conf, inbox, ent_px


# ---------------------------------------------------------------- main
def main(year, d):
    year = int(year)
    ents = read_entities(d)
    order = sorted(ents, key=lambda e: (ents[e]['short'].lower(), e))
    A = np.stack(
        [
            np.asarray(Image.open(os.path.join(d, 'entities', f'entity_{e}.jpg')).convert('RGB')).astype(np.int16)
            for e in order
        ]
    )
    base = np.median(A, axis=0).astype(int)
    del A
    C, ent_fit = entity_fit()
    residuals = {}
    quarters = {}
    for qn in QUARTERS:
        k = QK[qn]
        f, ox, oy = CROP[k]
        a = np.asarray(Image.open(os.path.join(d, f'{year}_{qn}.jpg')).convert('RGB')).astype(int)
        cc = crop_check(a, base, f, ox, oy)
        # predicted cities vs the city dots of this year's quarter
        dots = darkdots(a)
        ll = np.array([(lon, lat) for q, n, lon, lat, x, y in CONTROL_POINTS if q == k])
        pred = (apply(C, ll, ORDER) - [ox, oy]) / f
        dist = [float(np.linalg.norm(dots - p, axis=1).min()) for p in pred] if len(dots) else []
        near = [x for x in dist if x <= 6]
        residuals[f'{year}_{qn}'] = dict(
            crop_of_entity_frame=dict(scale=f, offset_px=[ox, oy]),
            crop_colour_match=round(cc[0], 3),
            crop_best_shift_px=[cc[1], cc[2]],
            control_cities=len(pred),
            city_dots_found=len(dots),
            cities_with_dot_within_6px=len(near),
            rms_px_to_nearest_dot=round(float(np.sqrt(np.mean(np.square(near)))), 2) if near else None,
        )
        quarters[k] = dict(a=a, f=f, ox=ox, oy=oy)
        print(
            f'{qn}: colour match {cc[0]:.3f} at shift {cc[1:]}; {len(near)}/{len(pred)} cities with a dot within 6 px',
            flush=True,
        )
    residuals['entity_maps_frame'] = {k: v for k, v in ent_fit.items() if k != 'per_city_px'}
    residuals['entity_maps_frame']['per_city_px'] = ent_fit['per_city_px']
    masks = build_masks(d, ents, base)
    sov, dep = raster(ents, order, masks, base)
    sea = lambda a: np.abs(a - SEA).sum(-1) < 25
    for k, M in quarters.items():
        seg = segment(M['a'])
        s, dd, pur = label_segments(seg, sov, dep, M['f'], (M['ox'], M['oy']), sea(M['a']))
        M.update(seg=seg, s=s, d=dd, pur=pur)
        del M['a']
    g = json.load(open(os.path.join(ROOT, 'public', 'data', 'geo.json'), encoding='utf-8'))
    L = g['L']
    LL = np.stack([np.array(g['loc']['lon'][:L]), np.array(g['loc']['lat'][:L])], 1)
    out_s, out_d, conf, inbox, ent_px = sample(LL, C, sov, dep, quarters)
    ext = json.load(open(os.path.join(ROOT, 'data', 'content', 'world_extent.json'), encoding='utf-8'))
    inframe = (
        (LL[:, 0] >= ext['west']) & (LL[:, 0] <= ext['east']) & (LL[:, 1] >= ext['south']) & (LL[:, 1] <= ext['north'])
    )
    # states.tsv
    STATUS = dict(S='sovereign', D='dependent', P='people')
    qbox = {k: (ox, oy, ox + 728 * f, oy + 593 * f) for k, (f, ox, oy) in CROP.items()}
    outdir = os.path.join(ROOT, 'data', 'history', 'borders', 'euratlas')
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, f'euratlas_{year}_states.tsv'), 'w', encoding='utf-8', newline='') as fo:
        w = csv.writer(fo, delimiter='\t', lineterminator='\n')
        w.writerow(['index', 'name', 'full_name', 'status', 'overlord', 'capital', 'quarter', 'page'])
        for i, e in enumerate(order):
            v = ents[e]
            quarter = ''
            ms = [m for m in masks.get(e, {}).values() if m.any()]
            if ms:
                ys, xs = np.nonzero(np.logical_or.reduce(ms))
                cx, cy = xs.mean(), ys.mean()
                quarter = min(
                    qbox, key=lambda k: np.hypot(cx - (qbox[k][0] + qbox[k][2]) / 2, cy - (qbox[k][1] + qbox[k][3]) / 2)
                )
            w.writerow([i, v['short'], v['long'], STATUS.get(v['status'], ''), v['dep'] or '', '', quarter, v['page']])
    lab = out_s >= 0
    summary = dict(
        entities=len(order),
        places=int(L),
        places_in_entity_frame=int(inbox.sum()),
        places_in_world_frame=int(inframe.sum()),
        labelled=int(lab.sum()),
        labelled_share_of_entity_frame=round(float((lab & inbox).sum() / max(inbox.sum(), 1)), 3),
        labelled_share_of_world_frame=round(float((lab & inframe).sum() / max(inframe.sum(), 1)), 3),
        with_dependent=int((out_d >= 0).sum()),
        mean_confidence=round(float(conf[lab].mean()), 3) if lab.any() else 0,
        entities_with_mask=sum(1 for e in order if masks.get(e)),
        entities_holding_places=int(len(np.unique(out_s[lab]))),
    )
    out = dict(
        source=f'Euratlas Periodis {year} (Nüssli), maps viewed on euratlas.net, sampled at place centres',
        method='Identity from the per-entity maps (one shared frame; red outline = held in sovereignty, green outline/tint = held as '
        'a dependency), filled to area masks (ray-parity inside test; colour fill checked by parity where outlines failed). '
        'Sovereign = smallest sovereign mask covering the pixel, dependent = smallest dependent mask (or a sovereign holding '
        'the land under another). Geometry: the four quarter maps are 0.59x crops of the entity frame; the entity frame is the '
        'same as in 1300, so the 1300 fit (55 cities measured as dots on the 1300 quarters, 3rd-order polynomial) is used and '
        "checked against this year's quarter maps (residuals_px). Each place is sampled in the entity frame (3x3 majority) and "
        'on the quarter maps (flat-colour segment of the place, labelled by entity-raster majority); weighted vote. No regional '
        'maps. confidence = vote share x local agreement; -1 = outside Euratlas coverage or unmapped (desert/white).',
        script='tools/history/borders/euratlas_places.py',
        summary=summary,
        residuals_px=residuals,
        entities=[ents[e]['short'] for e in order],
        entity_pages=[ents[e]['page'] for e in order],
        place=out_s.tolist(),
        dependent=out_d.tolist(),
        confidence=[float(c) for c in conf],
    )
    with open(os.path.join(outdir, f'euratlas_{year}_places.json'), 'w', encoding='utf-8') as fo:
        json.dump(out, fo, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps(summary))
    return out


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
