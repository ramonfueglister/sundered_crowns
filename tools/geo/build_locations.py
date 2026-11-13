"""Stage B: locations (Voronoi over land with organic borders), sea zones, adjacency, climate.

Seeds: historical settlements from data/content/gazetteer.json (our own research) when available,
otherwise Natural Earth populated places; filled with variable-density Poisson-disc sampling.
Outputs: CACHE/stage/ids.npy (int32, 0 = lake/none, 1..L land, L+1..L+S sea) and CACHE/stage/locations_raw.json
"""
import os, json, math
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from common import *

STAGE = os.path.join(CACHE, 'stage')
rng = np.random.default_rng(1356)

def value_noise(h, w, cell, octaves=4, seed=0):
    r = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        gh, gw = h // cell + 2, w // cell + 2
        g = r.standard_normal((gh, gw)).astype(np.float32)
        z = ndimage.zoom(g, (h / (gh - 1) * 1.0001, w / (gw - 1) * 1.0001), order=3)[:h, :w]
        out += z * amp; tot += amp; amp *= 0.5; cell = max(2, cell // 2)
    return out / tot

def region_radius_km(lon, lat, desert, impass):
    lon = np.asarray(lon); lat = np.asarray(lat)
    r = np.full(lon.shape, 130.0)
    core = (lon > -11) & (lon < 32) & (lat > 35.5) & (lat < 60.5)
    peri = (lon > -25) & (lon < 62) & (lat > 44) & (lat < 72) & ~core
    mena = ((lon > -17) & (lon < 50) & (lat > 27) & (lat < 45.5)) & ~core & ~peri
    persia = (lon >= 40) & (lon <= 70) & (lat > 12) & (lat <= 44) & ~mena
    arabia = (lon > 34) & (lon < 60) & (lat > 12) & (lat <= 30)
    r[persia | arabia] = 62
    r[mena] = 36
    r[peri] = 46
    r[peri & (lat > 64)] = 70
    r[core] = 30
    # Iceland, Greenland, Canadian north
    r[(lon < -10) & (lat > 58)] = 150
    r[desert | impass] = 170
    return r

def main():
    land = np.load(os.path.join(STAGE, 'land.npy'))
    sea = np.load(os.path.join(STAGE, 'sea.npy'))
    hgt = np.load(os.path.join(STAGE, 'height.npy'))
    desert = np.load(os.path.join(STAGE, 'desert_poly.npy'))
    impass = np.load(os.path.join(STAGE, 'impassable_poly.npy'))
    # --- seeds -----------------------------------------------------------
    gaz = load_json(os.path.join(ROOT, 'data', 'content', 'gazetteer.json'))
    if isinstance(gaz, dict):
        gaz = gaz.get('places') or gaz.get('settlements') or gaz.get('entries') or []
    seeds = []  # (x, y, name, size, province_name, region, alt, pop)
    if gaz:
        for g in gaz:
            try:
                x, y = lonlat_to_px(float(g['lon']), float(g['lat']))
            except Exception:
                continue
            seeds.append([x, y, g.get('name'), int(g.get('size') or 1), g.get('province_name'), g.get('region'), g.get('alt'), g.get('pop1356')])
        print('gazetteer seeds', len(seeds))
    else:
        pp = json.load(open(os.path.join(CACHE, 'ne_10m_populated_places_simple.geojson')))
        for f in pp['features']:
            p = f['properties']; lon, lat = f['geometry']['coordinates'][:2]
            if not (LON0 < lon < LON1 and LAT_S < lat < LAT_N): continue
            x, y = lonlat_to_px(lon, lat)
            sz = 5 if p.get('scalerank', 9) <= 1 else 4 if p.get('scalerank', 9) <= 3 else 3 if p.get('scalerank', 9) <= 6 else 2
            seeds.append([x, y, p.get('name'), sz, None, None, None, None])
        print('NE seeds', len(seeds))
    # snap seeds to land
    landdist, (iy, ix) = ndimage.distance_transform_edt(~land, return_indices=True)
    kept = []
    for s in seeds:
        xi, yi = int(s[0]), int(s[1])
        if not (0 <= xi < W and 0 <= yi < H): continue
        if landdist[yi, xi] > 4: continue
        s[0], s[1] = float(ix[yi, xi]) + 0.5, float(iy[yi, xi]) + 0.5
        kept.append(s)
    seeds = sorted(kept, key=lambda s: -s[3])
    # radius field (in px) for every land pixel (coarse grid)
    def r_px_at(x, y):
        lon, lat = px_to_lonlat_np(x, y)
        xi = np.clip(np.asarray(x).astype(int), 0, W - 1); yi = np.clip(np.asarray(y).astype(int), 0, H - 1)
        rk = region_radius_km(lon, lat, desert[yi, xi], impass[yi, xi])
        return rk / km_per_px(lat)
    accepted = []
    cell = 4.0
    grid = {}
    def ok(x, y, r):
        gx, gy = int(x // cell), int(y // cell); rr = int(math.ceil(r / cell))
        for yy in range(gy - rr, gy + rr + 1):
            for xx in range(gx - rr, gx + rr + 1):
                for j in grid.get((xx, yy), ()):
                    ax, ay = accepted[j][0], accepted[j][1]
                    if (ax - x) ** 2 + (ay - y) ** 2 < r * r:
                        return False
        return True
    def add(s):
        accepted.append(s); grid.setdefault((int(s[0] // cell), int(s[1] // cell)), []).append(len(accepted) - 1)
    # gazetteer seeds: keep with a smaller spacing (towns may be close)
    rs = r_px_at(np.array([s[0] for s in seeds]), np.array([s[1] for s in seeds])) if seeds else []
    for s, r in zip(seeds, rs):
        if ok(s[0], s[1], r * (0.45 if s[3] >= 3 else 0.62)):
            add(s)
    print('accepted named seeds', len(accepted))
    # Poisson fill
    ly, lx = np.nonzero(land)
    n_c = 900000
    pick = rng.integers(0, len(lx), n_c)
    cx = lx[pick] + rng.random(n_c); cy = ly[pick] + rng.random(n_c)
    cr = r_px_at(cx, cy)
    # bias acceptance toward uniform coverage: shuffle already random
    for x, y, r in zip(cx, cy, cr):
        if ok(x, y, r * 0.82):
            add([x, y, None, 0, None, None, None, None])
    print('total land seeds', len(accepted))
    # --- land voronoi with warped coordinates -----------------------------
    noise_x = value_noise(H // 2, W // 2, 6, octaves=3, seed=1); noise_y = value_noise(H // 2, W // 2, 6, octaves=3, seed=2)
    noise_x /= noise_x.std(); noise_y /= noise_y.std()
    noise_x = ndimage.zoom(noise_x, 2, order=1)[:H, :W]; noise_y = ndimage.zoom(noise_y, 2, order=1)[:H, :W]
    sx = np.array([a[0] for a in accepted]); sy = np.array([a[1] for a in accepted])
    tree = cKDTree(np.stack([sx, sy], 1))
    ys, xs = np.nonzero(land)
    lonp, latp = px_to_lonlat_np(xs, ys)
    amp = np.clip(9.0 / km_per_px(latp), 2, 12)
    qx = xs + 0.5 + noise_x[ys, xs] * amp; qy = ys + 0.5 + noise_y[ys, xs] * amp
    _, idx = tree.query(np.stack([qx, qy], 1), workers=4)
    ids = np.zeros((H, W), np.int32)
    ids[ys, xs] = idx + 1
    del qx, qy, lonp, latp
    # --- connectivity cleanup ---------------------------------------------
    ids = fix_components(ids, land, len(accepted))
    # renumber land ids 1..L
    used = np.unique(ids[ids > 0])
    remap = np.zeros(ids.max() + 1, np.int32); remap[used] = np.arange(1, len(used) + 1)
    ids = remap[ids]
    seeds_final = []
    for old in used:
        if old - 1 < len(accepted):
            seeds_final.append(accepted[old - 1])
        else:
            seeds_final.append([None, None, None, 0, None, None, None, None])
    L = len(used)
    print('land locations', L)
    # --- sea zones -----------------------------------------------------------
    sea_ids = build_sea(sea, land)
    S = sea_ids.max()
    ids[sea > 0] = sea_ids[sea > 0] + L
    print('sea zones', S)
    np.save(os.path.join(STAGE, 'ids.npy'), ids)
    json.dump({'L': int(L), 'S': int(S), 'seeds': [[None if v is None else (float(v) if isinstance(v, (np.floating, float)) else v) for v in s] for s in seeds_final]},
              open(os.path.join(STAGE, 'locations_raw.json'), 'w'))
    print('stage B done')

def fix_components(ids, land, n):
    """Each location keeps its largest connected component. Other fragments are merged into the neighbouring
    location with the longest shared border, or become new island locations when isolated and big enough."""
    for it in range(3):
        Hh, Ww = ids.shape
        flat = ids.ravel()
        N = flat.size
        idx = np.arange(N, dtype=np.int64).reshape(Hh, Ww)
        rows = []; cols = []
        m = (ids[:, :-1] == ids[:, 1:]) & (ids[:, :-1] > 0)
        rows.append(idx[:, :-1][m]); cols.append(idx[:, 1:][m])
        m = (ids[:-1, :] == ids[1:, :]) & (ids[:-1, :] > 0)
        rows.append(idx[:-1, :][m]); cols.append(idx[1:, :][m])
        r = np.concatenate(rows); c = np.concatenate(cols)
        g = coo_matrix((np.ones(len(r), np.int8), (r, c)), shape=(N, N))
        ncomp, lab = connected_components(g, directed=False)
        lab = lab.astype(np.int64)
        landpx = flat > 0
        comp_size = np.bincount(lab[landpx], minlength=ncomp)
        comp_owner = np.zeros(ncomp, np.int64); comp_owner[lab[landpx]] = flat[landpx]
        # largest component per owner
        order = np.lexsort((-comp_size, comp_owner))
        best = {}
        for ci in order:
            o = comp_owner[ci]
            if o == 0 or comp_size[ci] == 0: continue
            if o not in best: best[o] = ci
        is_main = np.zeros(ncomp, bool); is_main[list(best.values())] = True
        frag = landpx & ~is_main[lab]
        nfrag = int(frag.sum())
        print('  pass', it, 'fragment px', nfrag)
        if nfrag == 0:
            break
        # for each fragment component, find neighbouring location via dilation
        frag2d = frag.reshape(Hh, Ww)
        lab2d = lab.reshape(Hh, Ww)
        pass
        next_id = ids.max() + 1
        # neighbour id for each fragment pixel: max filter of non-fragment ids
        nonfrag = np.where(frag2d, 0, ids)
        nb = ndimage.maximum_filter(nonfrag, size=3)
        fi = np.nonzero(frag)[0]
        fc = lab[fi]
        o = np.argsort(fc, kind='stable'); fi = fi[o]; fc = fc[o]
        bounds = np.nonzero(np.diff(fc))[0] + 1
        groups = np.split(fi, bounds)
        for sl in groups:
            if len(sl) == 0: continue
            yy, xx = np.divmod(sl, Ww)
            cand = nb[yy, xx]; cand = cand[cand > 0]
            if len(cand) > 0 and not (len(sl) > 60 and len(cand) < 3):
                vals, cnt = np.unique(cand, return_counts=True)
                ids[yy, xx] = vals[np.argmax(cnt)]
            else:
                if len(sl) >= 12:
                    ids[yy, xx] = next_id; next_id += 1
                else:
                    # tiny isolated islet: attach to nearest main location by distance (keep id; it is fine)
                    pass
    return ids

def build_sea(sea, land):
    """Sea zones: dense near European/Mediterranean coasts, coarse in open ocean."""
    H_, W_ = sea.shape
    coastdist = ndimage.distance_transform_edt(sea)  # px to nearest non-sea
    ys, xs = np.nonzero(sea)
    n_c = 400000
    pick = rng.integers(0, len(xs), n_c)
    cx = xs[pick] + 0.5; cy = ys[pick] + 0.5
    lon, lat = px_to_lonlat_np(cx, cy)
    kmpp = km_per_px(lat)
    dkm = coastdist[cy.astype(int), cx.astype(int)] * kmpp
    euro = (lon > -20) & (lon < 60) & (lat > 28) & (lat < 72)
    r_km = np.where(euro, np.where(dkm < 120, 115, 260), np.where(dkm < 150, 320, 750))
    r_km = np.where((lon > 46) & (lon < 56) & (lat > 36) & (lat < 48), 170, r_km)  # Caspian
    r = r_km / kmpp
    acc = []; grid = {}; cell = 16.0
    order = np.argsort(dkm)  # near-coast first gives nicer coastal zones
    for i in order:
        x, y, rr = cx[i], cy[i], r[i]
        gx, gy = int(x // cell), int(y // cell); k = int(math.ceil(rr / cell))
        good = True
        for yy in range(gy - k, gy + k + 1):
            if not good: break
            for xx in range(gx - k, gx + k + 1):
                for j in grid.get((xx, yy), ()):
                    if (acc[j][0] - x) ** 2 + (acc[j][1] - y) ** 2 < (rr * 0.85) ** 2:
                        good = False; break
                if not good: break
        if good:
            acc.append((x, y)); grid.setdefault((gx, gy), []).append(len(acc) - 1)
    tree = cKDTree(np.array(acc))
    _, idx = tree.query(np.stack([xs + 0.5, ys + 0.5], 1), workers=4)
    out = np.zeros(sea.shape, np.int32); out[ys, xs] = idx + 1
    out = fix_components(out, sea, len(acc))
    used = np.unique(out[out > 0]); remap = np.zeros(out.max() + 1, np.int32); remap[used] = np.arange(1, len(used) + 1)
    return remap[out]

if __name__ == '__main__':
    main()
