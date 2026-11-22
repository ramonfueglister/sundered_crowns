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

import csv
import glob
import html
import json
import os
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as nd
from skimage.measure import label as sklabel

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from euratlas_frame import CONTROL_POINTS, CROP, ORDER, apply, crop_check, darkdots, entity_fit
from euratlas_masks import SEA, build_masks

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
QUARTERS = ('Northwest', 'Northeast', 'Southwest', 'Southeast')
QK = {'Northwest': 'NW', 'Northeast': 'NE', 'Southwest': 'SW', 'Southeast': 'SE'}
BLIND = [(503, 512, 684, 544)]  # "Copyright Euratlas" box in the entity frame: no data


# ---------------------------------------------------------------- entities
def read_entities(d):
    pages = sorted(glob.glob(os.path.join(d, 'entities', 'entity_*.html')))
    status = {}
    for p in pages[:3]:
        s = Path(p).read_text(encoding='utf-8', errors='replace')
        for m in re.finditer(r'href="entity_(\d+)\.html">([^<]*?)\s*\((\w)\)', s):
            status[m.group(1)] = (html.unescape(m.group(2)).strip(), m.group(3))
    ents = {}
    for p in pages:
        e = os.path.basename(p)[7:-5]
        if not os.path.exists(p[:-5] + '.jpg'):
            continue
        s = Path(p).read_text(encoding='utf-8', errors='replace')
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
        ents[e] = {
            'short': short,
            'long': long,
            'dep': dep,
            'status': status.get(e, (None, None))[1],
            'page': os.path.basename(p),
        }
    return ents


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
        for M in quarters.values():
            r = map_label(M, (ent_px[i] - [M['ox'], M['oy']]) / M['f'])
            if r and r[0] >= 0:
                cands.append(r)
        e = ent_label(ent_px[i])
        if e is not None and e[0] >= 0:
            cands.append(e)
        if not cands:
            continue
        w = {}
        for s, _d, c in cands:
            w[s] = w.get(s, 0) + c
        best = max(w, key=w.get)
        tot = sum(w.values())
        pick = [c for c in cands if c[0] == best]
        top = max(pick, key=lambda c: c[2])
        dv = {}
        for _s, d, c in pick:
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
        residuals[f'{year}_{qn}'] = {
            'crop_of_entity_frame': {'scale': f, 'offset_px': [ox, oy]},
            'crop_colour_match': round(cc[0], 3),
            'crop_best_shift_px': [cc[1], cc[2]],
            'control_cities': len(pred),
            'city_dots_found': len(dots),
            'cities_with_dot_within_6px': len(near),
            'rms_px_to_nearest_dot': round(float(np.sqrt(np.mean(np.square(near)))), 2) if near else None,
        }
        quarters[k] = {'a': a, 'f': f, 'ox': ox, 'oy': oy}
        print(
            f'{qn}: colour match {cc[0]:.3f} at shift {cc[1:]}; {len(near)}/{len(pred)} cities with a dot within 6 px',
            flush=True,
        )
    residuals['entity_maps_frame'] = {k: v for k, v in ent_fit.items() if k != 'per_city_px'}
    residuals['entity_maps_frame']['per_city_px'] = ent_fit['per_city_px']
    masks = build_masks(d, ents, base)
    sov, dep = raster(ents, order, masks, base)

    def sea(a):
        return np.abs(a - SEA).sum(-1) < 25

    for _k, M in quarters.items():
        seg = segment(M['a'])
        s, dd, pur = label_segments(seg, sov, dep, M['f'], (M['ox'], M['oy']), sea(M['a']))
        M.update(seg=seg, s=s, d=dd, pur=pur)
        del M['a']
    g = json.loads(Path(os.path.join(ROOT, 'public', 'data', 'geo.json')).read_text(encoding='utf-8'))
    L = g['L']
    LL = np.stack([np.array(g['loc']['lon'][:L]), np.array(g['loc']['lat'][:L])], 1)
    out_s, out_d, conf, inbox, ent_px = sample(LL, C, sov, dep, quarters)
    ext = json.loads(Path(os.path.join(ROOT, 'data', 'content', 'world_extent.json')).read_text(encoding='utf-8'))
    inframe = (
        (LL[:, 0] >= ext['west']) & (LL[:, 0] <= ext['east']) & (LL[:, 1] >= ext['south']) & (LL[:, 1] <= ext['north'])
    )
    # states.tsv
    STATUS = {'S': 'sovereign', 'D': 'dependent', 'P': 'people'}
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
    summary = {
        'entities': len(order),
        'places': int(L),
        'places_in_entity_frame': int(inbox.sum()),
        'places_in_world_frame': int(inframe.sum()),
        'labelled': int(lab.sum()),
        'labelled_share_of_entity_frame': round(float((lab & inbox).sum() / max(inbox.sum(), 1)), 3),
        'labelled_share_of_world_frame': round(float((lab & inframe).sum() / max(inframe.sum(), 1)), 3),
        'with_dependent': int((out_d >= 0).sum()),
        'mean_confidence': round(float(conf[lab].mean()), 3) if lab.any() else 0,
        'entities_with_mask': sum(1 for e in order if masks.get(e)),
        'entities_holding_places': int(len(np.unique(out_s[lab]))),
    }
    out = {
        'source': f'Euratlas Periodis {year} (Nüssli), maps viewed on euratlas.net, sampled at place centres',
        'method': 'Identity from the per-entity maps (one shared frame; red outline = held in sovereignty, green outline/tint = held as '
        'a dependency), filled to area masks (ray-parity inside test; colour fill checked by parity where outlines failed). '
        'Sovereign = smallest sovereign mask covering the pixel, dependent = smallest dependent mask (or a sovereign holding '
        'the land under another). Geometry: the four quarter maps are 0.59x crops of the entity frame; the entity frame is the '
        'same as in 1300, so the 1300 fit (55 cities measured as dots on the 1300 quarters, 3rd-order polynomial) is used and '
        "checked against this year's quarter maps (residuals_px). Each place is sampled in the entity frame (3x3 majority) and "
        'on the quarter maps (flat-colour segment of the place, labelled by entity-raster majority); weighted vote. No regional '
        'maps. confidence = vote share x local agreement; -1 = outside Euratlas coverage or unmapped (desert/white).',
        'script': 'tools/history/borders/euratlas_places.py',
        'summary': summary,
        'residuals_px': residuals,
        'entities': [ents[e]['short'] for e in order],
        'entity_pages': [ents[e]['page'] for e in order],
        'place': out_s.tolist(),
        'dependent': out_d.tolist(),
        'confidence': [float(c) for c in conf],
    }
    with open(os.path.join(outdir, f'euratlas_{year}_places.json'), 'w', encoding='utf-8') as fo:
        json.dump(out, fo, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps(summary))
    return out


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
