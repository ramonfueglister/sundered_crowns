"""Stage C: per-location geometry/statistics, adjacency graph, provinces/areas/regions, sea names; exports
public/map/ids.bin.gz (uint16 id raster), public/map/height.bin.gz (int16 delta rows), data/map/geo.json.
"""
import os, json, math, gzip
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree
from common import *

STAGE = os.path.join(CACHE, 'stage')

def main():
    ids = np.load(os.path.join(STAGE, 'ids.npy'))
    raw = json.load(open(os.path.join(STAGE, 'locations_raw.json')))
    L, S = raw['L'], raw['S']; seeds = raw['seeds']
    hgt = np.load(os.path.join(STAGE, 'height.npy'))
    river = np.load(os.path.join(STAGE, 'river.npy'))
    N = L + S + 1
    flat = ids.ravel()
    ys, xs = np.divmod(np.arange(flat.size), W)
    cnt = np.bincount(flat, minlength=N).astype(np.float64)
    sx = np.bincount(flat, weights=xs + 0.5, minlength=N); sy = np.bincount(flat, weights=ys + 0.5, minlength=N)
    cx = sx / np.maximum(cnt, 1); cy = sy / np.maximum(cnt, 1)
    lon, lat = px_to_lonlat_np(cx, cy)
    # area in km² (mercator: per-pixel area = kmpp²)
    pix_lat = px_to_lonlat_np(np.zeros(H), np.arange(H) + 0.5)[1]
    pa = km_per_px(pix_lat) ** 2
    area = np.bincount(flat, weights=pa[ys], minlength=N)
    hf = hgt.ravel()
    landmask = (flat >= 1) & (flat <= L)
    elev = np.bincount(flat, weights=np.where(landmask, np.maximum(hf, 0), hf), minlength=N) / np.maximum(cnt, 1)
    elev2 = np.bincount(flat, weights=np.where(landmask, np.maximum(hf, 0), hf) ** 2, minlength=N) / np.maximum(cnt, 1)
    rough = np.sqrt(np.maximum(elev2 - elev ** 2, 0))
    emax = ndimage.maximum(hgt, ids, index=np.arange(N))
    del ys, xs
    # representative point: pixel of the location closest to centroid that lies inside it (for labels / units)
    # use the seed position if it lies in the location, else nearest pixel of the location to the centroid
    px = cx.copy(); py = cy.copy()
    for i in range(1, L + 1):
        s = seeds[i - 1]
        if s[0] is not None:
            xi, yi = int(s[0]), int(s[1])
            if 0 <= xi < W and 0 <= yi < H and ids[yi, xi] == i:
                px[i], py[i] = s[0], s[1]; continue
        xi, yi = int(cx[i]), int(cy[i])
        if 0 <= xi < W and 0 <= yi < H and ids[yi, xi] == i: continue
        # search window
        r = 3
        while r < 200:
            y0, y1, x0, x1 = max(0, yi - r), min(H, yi + r + 1), max(0, xi - r), min(W, xi + r + 1)
            m = np.argwhere(ids[y0:y1, x0:x1] == i)
            if len(m):
                d = (m[:, 0] + y0 - cy[i]) ** 2 + (m[:, 1] + x0 - cx[i]) ** 2
                k = m[np.argmin(d)]; py[i], px[i] = k[0] + y0 + 0.5, k[1] + x0 + 0.5; break
            r *= 2
    for i in range(L + 1, N):
        xi, yi = int(cx[i]), int(cy[i])
        if 0 <= xi < W and 0 <= yi < H and ids[yi, xi] == i: continue
        m = np.argwhere(ids[max(0, yi - 200):yi + 200, max(0, xi - 200):xi + 200] == i)
        if len(m):
            d = (m[:, 0] + max(0, yi - 200) - cy[i]) ** 2 + (m[:, 1] + max(0, xi - 200) - cx[i]) ** 2
            k = m[np.argmin(d)]; py[i], px[i] = k[0] + max(0, yi - 200) + 0.5, k[1] + max(0, xi - 200) + 0.5
    # adjacency with shared border length and river fraction
    pairs = {}
    def add_pairs(a, b, rv):
        m = (a != b) & (a > 0) & (b > 0)
        aa = a[m].astype(np.int64); bb = b[m].astype(np.int64); r = rv[m]
        lo = np.minimum(aa, bb); hi = np.maximum(aa, bb)
        key = lo * N + hi
        uk, inv = np.unique(key, return_inverse=True)
        c = np.bincount(inv); rc = np.bincount(inv, weights=(r > 0))
        for k, cc, rr in zip(uk, c, rc):
            p = pairs.get(int(k))
            if p: p[0] += cc; p[1] += rr
            else: pairs[int(k)] = [int(cc), float(rr)]
    rv = np.maximum(river[:, :-1], river[:, 1:])
    add_pairs(ids[:, :-1], ids[:, 1:], rv)
    rv = np.maximum(river[:-1, :], river[1:, :])
    add_pairs(ids[:-1, :], ids[1:, :], rv)
    # also diagonal-adjacent small islands: connect sea zone to island even if only diagonal (rare) – skip
    edges = []
    for k, (c, rc) in pairs.items():
        a, b = divmod(k, N)
        kind = 0  # 0 land-land, 1 land-sea, 2 sea-sea
        if a <= L and b <= L: kind = 0
        elif a > L and b > L: kind = 2
        else: kind = 1
        edges.append((a, b, kind, c, rc / max(c, 1)))
    # straits (land-land across water)
    straits = [
        ('Bosporus', (28.98, 41.03), (29.03, 41.03)), ('Dardanelles', (26.40, 40.20), (26.38, 40.10)),
        ('Øresund', (12.60, 56.03), (12.70, 56.04)), ('Great Belt', (10.95, 55.33), (11.12, 55.33)),
        ('Little Belt', (9.72, 55.50), (9.78, 55.48)), ('Strait of Gibraltar', (-5.60, 36.02), (-5.35, 35.89)),
        ('Strait of Messina', (15.62, 38.25), (15.65, 38.21)), ('Kerch Strait', (36.47, 45.33), (36.60, 45.25)),
        ('Strait of Bonifacio', (9.17, 41.39), (9.20, 41.26)), ('Fehmarn Belt', (11.15, 54.45), (11.20, 54.55)),
        ('Strait of Dover', (1.30, 51.10), (1.80, 50.92)), ('Euripus', (23.59, 38.46), (23.60, 38.47)),
        ('Strait of Otranto', (18.49, 40.15), (19.45, 40.40)), ('Kvarken', (21.30, 63.50), (20.60, 63.70)),
        ('Strait of Hormuz', (56.30, 26.60), (56.20, 26.20)), ('Bab-el-Mandeb', (43.40, 12.70), (43.30, 12.40)),
        ('Strait of Belle Isle', (-57.10, 51.50), (-56.80, 51.60)), ('Menai Strait', (-4.20, 53.22), (-4.17, 53.20)),
        ('Solent', (-1.30, 50.76), (-1.30, 50.80)), ('Strait of Sicily', (11.0, 37.0), (11.05, 37.0)),
    ]
    landtree_mask = (flat >= 1) & (flat <= L)
    strait_edges = []
    for name, a, b in straits:
        def nearest_land(lo, la):
            x, y = lonlat_to_px(lo, la); xi, yi = int(x), int(y)
            for r in range(0, 40):
                y0, y1, x0, x1 = max(0, yi - r), min(H, yi + r + 1), max(0, xi - r), min(W, xi + r + 1)
                win = ids[y0:y1, x0:x1]; m = (win >= 1) & (win <= L)
                if m.any():
                    yy, xx = np.argwhere(m)[0]; return int(win[yy, xx])
            return 0
        la, lb = nearest_land(*a), nearest_land(*b)
        if la and lb and la != lb:
            strait_edges.append((min(la, lb), max(la, lb), name))
    # mountain passes (lower movement cost through these locations)
    passes = [('Brenner Pass', 11.51, 47.00), ('St Gotthard Pass', 8.57, 46.56), ('Great St Bernard Pass', 7.17, 45.87),
              ('Mont Cenis Pass', 6.90, 45.25), ('Simplon Pass', 8.03, 46.25), ('Septimer Pass', 9.64, 46.42),
              ('Roncesvalles Pass', -1.32, 43.01), ('Somport Pass', -0.52, 42.79), ('Col de la Perche', 2.05, 42.50),
              ('Semmering Pass', 15.83, 47.63), ('Dukla Pass', 21.68, 49.40), ('Iron Gate', 22.50, 44.67),
              ('Shipka Pass', 25.32, 42.75), ('Darial Gorge', 44.63, 42.75), ('Cilician Gates', 34.77, 37.27),
              ('Khyber approaches', 69.0, 34.1), ('Jablunkov Pass', 18.76, 49.53), ('Tarvis Pass', 13.58, 46.51)]
    pass_locs = []
    for nm, lo, la in passes:
        x, y = lonlat_to_px(lo, la); xi, yi = int(x), int(y)
        if 0 <= xi < W and 0 <= yi < H and 1 <= ids[yi, xi] <= L:
            pass_locs.append([int(ids[yi, xi]), nm])
    # --- names, provinces ------------------------------------------------
    names = [None] * (L + 1); prov_name = [None] * (L + 1); region_key = [None] * (L + 1); size = [0] * (L + 1); pop = [None] * (L + 1); alt = [None] * (L + 1)
    named_pts = []
    for i in range(1, L + 1):
        s = seeds[i - 1]
        if s[2]:
            names[i] = s[2]; size[i] = s[3]; prov_name[i] = s[4]; region_key[i] = s[5]; alt[i] = s[6]; pop[i] = s[7]
            named_pts.append(i)
    if named_pts:
        t = cKDTree(np.stack([px[named_pts], py[named_pts]], 1))
        for i in range(1, L + 1):
            if prov_name[i] is None or region_key[i] is None:
                d, j = t.query([px[i], py[i]])
                km = d * float(km_per_px(lat[i]))
                k = named_pts[j]
                if km < 90:
                    if prov_name[i] is None: prov_name[i] = prov_name[k]
                if region_key[i] is None: region_key[i] = region_key[k]
    # land adjacency lists
    adj = [[] for _ in range(N)]
    for a, b, kind, c, rf in edges:
        adj[a].append(b); adj[b].append(a)
    for a, b, nm in strait_edges:
        adj[a].append(b); adj[b].append(a)
    provs = build_provinces(L, adj, prov_name, names, size, area, px, py, lat)
    prov_of = np.zeros(L + 1, np.int32)
    for pi, p in enumerate(provs):
        for i in p['locs']: prov_of[i] = pi
    # areas: cluster provinces into groups of ~6-8 adjacent provinces of same region key
    areas = build_areas(provs, prov_of, adj, region_key, L)
    # sea names
    marine = json.load(open(os.path.join(CACHE, 'ne_10m_geography_marine_polys.geojson')))
    sea_names = name_seas(marine, L, S, px, py, lon, lat)
    rivers = json.load(open(os.path.join(STAGE, 'rivers.json')))
    out = {
        'W': W, 'H': H, 'lon0': LON0, 'lon1': LON1, 'latN': LAT_N, 'latS': LAT_S, 'L': L, 'S': S,
        'loc': {
            'x': [round(float(v), 1) for v in px[1:]], 'y': [round(float(v), 1) for v in py[1:]],
            'lon': [round(float(v), 3) for v in lon[1:]], 'lat': [round(float(v), 3) for v in lat[1:]],
            'area': [round(float(v), 1) for v in area[1:]], 'elev': [int(v) for v in elev[1:]],
            'rough': [int(v) for v in rough[1:]], 'emax': [int(v) for v in emax[1:]],
            'name': names[1:L + 1] + sea_names, 'alt': alt[1:], 'size': size[1:], 'pop': pop[1:],
            'region_key': region_key[1:],
        },
        'edges': [[int(a), int(b), int(k), int(c), round(float(rf), 2)] for a, b, k, c, rf in edges],
        'straits': [[a, b, nm] for a, b, nm in strait_edges],
        'passes': pass_locs,
        'provinces': provs,
        'areas': areas,
        'rivers': [r for r in rivers if r['rank'] <= 6],
    }
    os.makedirs(OUT_DATA, exist_ok=True); os.makedirs(OUT_PUBLIC, exist_ok=True)
    json.dump(out, open(os.path.join(OUT_DATA, 'geo.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    with gzip.open(os.path.join(OUT_PUBLIC, 'ids.bin.gz'), 'wb', compresslevel=9) as f:
        f.write(ids.astype('<u2').tobytes())
    # height at half resolution, int16 metres, row-delta encoded
    hh = ndimage.zoom(hgt, 0.5, order=1).astype(np.float32)
    hi = np.clip(np.round(hh), -11000, 9000).astype(np.int32)
    d = hi.copy(); d[:, 1:] = hi[:, 1:] - hi[:, :-1]
    with gzip.open(os.path.join(OUT_PUBLIC, 'height.bin.gz'), 'wb', compresslevel=9) as f:
        f.write(np.array([hh.shape[1], hh.shape[0]], '<u4').tobytes()); f.write(d.astype('<i2').tobytes())
    print('export done: L', L, 'S', S, 'provinces', len(provs), 'areas', len(areas), 'edges', len(edges), 'straits', len(strait_edges))

def build_provinces(L, adj, prov_name, names, size, area, px, py, lat):
    """Group locations into provinces of ~6–18 locations following historical province names where known."""
    lab = [-1] * (L + 1)
    groups = []
    for i in range(1, L + 1):
        if lab[i] >= 0: continue
        key = prov_name[i]
        comp = [i]; lab[i] = len(groups); q = [i]
        while q:
            u = q.pop()
            for v in adj[u]:
                if v <= L and lab[v] < 0 and key is not None and prov_name[v] == key:
                    lab[v] = len(groups); comp.append(v); q.append(v)
        groups.append(comp)
    # split large groups with BFS from k seeds (largest towns)
    out = []
    for comp in groups:
        if len(comp) <= 26:
            out.append(comp); continue
        k = int(math.ceil(len(comp) / 16))
        cs = set(comp)
        seeds_ = sorted(comp, key=lambda i: (-size[i], i))
        chosen = [seeds_[0]]
        cpts = np.array([[px[i], py[i]] for i in comp])
        while len(chosen) < k:
            d = np.min(np.stack([((cpts - [px[c], py[c]]) ** 2).sum(1) for c in chosen]), 0)
            chosen.append(comp[int(np.argmax(d))])
        own = {c: j for j, c in enumerate(chosen)}
        q = list(chosen); parts = [[c] for c in chosen]
        while q:
            nq = []
            for u in q:
                for v in adj[u]:
                    if v in cs and v not in own:
                        own[v] = own[u]; parts[own[u]].append(v); nq.append(v)
            q = nq
        for v in comp:
            if v not in own: parts[0].append(v)
        out.extend([p for p in parts if p])
    # merge small groups (< 5 locations) into the smallest adjacent group
    lab = [-1] * (L + 1)
    for gi, g in enumerate(out):
        for i in g: lab[i] = gi
    alive = [True] * len(out)
    changed = True
    while changed:
        changed = False
        for gi in sorted(range(len(out)), key=lambda g: len(out[g])):
            if not alive[gi] or len(out[gi]) >= 9: continue
            nb = {}
            for u in out[gi]:
                for v in adj[u]:
                    if v <= L and lab[v] != gi and lab[v] >= 0 and alive[lab[v]]:
                        nb[lab[v]] = nb.get(lab[v], 0) + 1
            if not nb: continue
            tgt = min(nb, key=lambda g: (len(out[g]) > 22, -nb[g] if prov_name[out[g][0]] == prov_name[out[gi][0]] else 0, len(out[g])))
            if len(out[tgt]) + len(out[gi]) > 32: continue
            for u in out[gi]: lab[u] = tgt
            out[tgt].extend(out[gi]); out[gi] = []; alive[gi] = False; changed = True
    provs = []
    used_names = {}
    for g in out:
        if not g: continue
        big = max(g, key=lambda i: (size[i], -i))
        nm = prov_name[big] or names[big] or None
        if nm is None:
            nm = next((names[i] for i in sorted(g, key=lambda i: -size[i]) if names[i]), None)
        if nm in used_names and names[big]:
            nm = f"{nm} – {names[big]}" if prov_name[big] else names[big]
        used_names[nm] = 1
        provs.append({'name': nm, 'locs': sorted(g), 'capital': big})
    return provs

def build_areas(provs, prov_of, adj, region_key, L):
    P = len(provs)
    padj = [set() for _ in range(P)]
    for pi, p in enumerate(provs):
        for u in p['locs']:
            for v in adj[u]:
                if v <= L and prov_of[v] != pi: padj[pi].add(int(prov_of[v]))
    reg = []
    for p in provs:
        ks = [region_key[i] for i in p['locs'] if region_key[i]]
        reg.append(max(set(ks), key=ks.count) if ks else 'unknown')
    lab = [-1] * P; areas = []
    order = sorted(range(P), key=lambda p: -len(provs[p]['locs']))
    for p in order:
        if lab[p] >= 0: continue
        a = [p]; lab[p] = len(areas); frontier = [p]
        while frontier and len(a) < 7:
            nf = []
            for u in frontier:
                for v in sorted(padj[u]):
                    if lab[v] < 0 and reg[v] == reg[p] and len(a) < 7:
                        lab[v] = len(areas); a.append(v); nf.append(v)
            frontier = nf
        areas.append({'name': provs[p]['name'], 'provinces': a, 'region': reg[p]})
    for ai, a in enumerate(areas):
        for p in a['provinces']: provs[p]['area'] = ai
        for p in a['provinces']: provs[p]['region'] = a['region']
    return areas

def name_seas(marine, L, S, px, py, lon, lat):
    from PIL import Image, ImageDraw
    feats = []
    for f in marine['features']:
        p = f['properties']; nm = p.get('name_en') or p.get('name') or p.get('NAME')
        if not nm: continue
        feats.append((nm, f, p.get('scalerank', 5)))
    # rasterize marine polys at 1/4 res, smaller scalerank drawn last (more specific polys win)
    Wq, Hq = W // 4, H // 4
    img = Image.new('I', (Wq, Hq), 0); d = ImageDraw.Draw(img)
    feats.sort(key=lambda t: -(t[2] or 0))
    # draw big (low scalerank) first, specific (high scalerank) later so they win
    feats.sort(key=lambda t: (t[2] or 0))
    for k, (nm, f, sr) in enumerate(feats):
        for poly in polys_from_geojson_geom(f['geometry']):
            pts = [lonlat_to_px(lo, max(min(la, 85), -85)) for lo, la in poly[0]]
            pts = [(x / 4, y / 4) for x, y in pts]
            if len(pts) >= 3: d.polygon(pts, fill=k + 1)
    arr = np.asarray(img)
    out = []; counts = {}
    raw = []
    for i in range(L + 1, L + S + 1):
        xi, yi = int(px[i] / 4), int(py[i] / 4)
        k = arr[min(Hq - 1, yi), min(Wq - 1, xi)] if 0 <= xi < Wq and 0 <= yi < Hq else 0
        if k == 0:
            # search nearby
            win = arr[max(0, yi - 30):yi + 30, max(0, xi - 30):xi + 30]
            nz = win[win > 0]
            k = int(np.bincount(nz).argmax()) if len(nz) else 0
        nm = feats[k - 1][0] if k else ('Atlantic Ocean' if lon[i] < -10 else 'Open Sea')
        nm = nm.title() if nm.isupper() else nm
        raw.append(nm); counts[nm] = counts.get(nm, 0) + 1
    # disambiguate with compass direction relative to the centroid of zones with the same name
    cent = {}
    for nm, i in zip(raw, range(L + 1, L + S + 1)):
        c = cent.setdefault(nm, [0, 0, 0]); c[0] += lon[i]; c[1] += lat[i]; c[2] += 1
    seen = {}
    for nm, i in zip(raw, range(L + 1, L + S + 1)):
        if counts[nm] == 1: out.append(nm); continue
        c = cent[nm]; dx = lon[i] - c[0] / c[2]; dy = lat[i] - c[1] / c[2]
        ang = math.degrees(math.atan2(dy, dx)) % 360
        dirs = ['East', 'North-East', 'North', 'North-West', 'West', 'South-West', 'South', 'South-East']
        dname = dirs[int(((ang + 22.5) % 360) // 45)] if abs(dx) + abs(dy) > 0.8 else 'Central'
        base = f"{nm} ({dname})"
        seen[base] = seen.get(base, 0) + 1
        out.append(base if seen[base] == 1 else f"{base} {seen[base]}")
    return out

if __name__ == '__main__':
    main()
