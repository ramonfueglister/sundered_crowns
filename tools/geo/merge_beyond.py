"""Joins the places of the rest of the globe (tools/geo/build_beyond.py) to the game map, keeping the 15,220 places
of the game map as they are (Ramon, 2026-11-15).

Numbering: the land places of the game map keep their ids 1..L; the new land places follow as L+1..L+L2; then come
the sea zones, the game map's first (their ids move up by L2) and the new ones after them. Nothing in the state of a
running world refers to a sea zone, and every array per place only grows at its end (src/sim/upgrade.ts adds the new
places to a running world).

Per new place: centre, area, height, neighbours (also across the edges of the game map), a province, a name, its
terrain and climate (build_setup.py, climate.py), culture, faith and people (data/history/1356/world_beyond.json
"demography"), and its holder in 1356: the realms of world_beyond.json and those of the game map that reach beyond it
("extends") spread from their capitals and holdings over the land, as build_setup.py spreads them.

Writes public/data/geo.json, world.json, land.json, setup_1356.json, public/map/ids.bin.gz (the sea
zones renumbered) and public/map/beyond.bin.gz (the new raster: u16 ids over step z3 of the world frame, 0 inside the
game map). Run once on the files as committed before the merge: python3 tools/geo/merge_beyond.py
"""

import gzip
import json
import os
import sys
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

sys.path.insert(0, os.path.dirname(__file__))
from beyond_holders import spread_holders, xyz
from beyond_terrain import terrain_of
from beyond_yield import add_yield
from build_beyond import frame, load_step
from climate import climate
from common import CACHE, ROOT
from common import H as MAP_H
from common import W as MAP_W
from district_names import add_peoples_beyond, gen_name
from provinces import build_areas, build_provinces
from resources import assign_resources

DATA = os.path.join(ROOT, 'public', 'data')
MAP = os.path.join(ROOT, 'public', 'map')


def read(name):
    return json.loads(Path(os.path.join(DATA, name)).read_text(encoding='utf-8'))


add_peoples_beyond()

REGIONS = [  # region key of a new place (as geo.json's region_key): first box that holds it, (lon0, lon1, lat0, lat1)
    ('china', 97, 125, 18, 42),
    ('korea_japan', 124, 150, 24, 46),
    ('tibet', 78, 104, 26, 38),
    ('india', 66, 98, 5, 37),
    ('southeast_asia', 92, 141, -12, 28),
    ('central_asia', 66, 98, 36, 50),
    ('mongolia', 85, 135, 41, 54),
    ('siberia', 60, 180, 50, 90),
    ('oceania', 110, 180, -50, 0),
    ('pacific', -180, -120, -50, 30),
    ('americas', -180, -60, -60, 90),
]


def region_of(lo, la, elev):
    if 26 <= la <= 40 and 72 <= lo <= 104 and elev > 2500:
        return 'tibet'
    for k, a, b, c, d in REGIONS:
        if k == 'tibet':
            continue
        if a <= lo <= b and c <= la <= d:
            return k
    return 'oceania' if la < 0 else 'siberia'


def main():
    geo = read('geo.json')
    if 'beyond' in geo:
        raise SystemExit('geo.json holds the rest of the world already: start from the committed files')
    L, S = geo['L'], geo['S']
    beyond = np.load(os.path.join(CACHE, 'beyond', 'ids.npy'))
    meta = json.loads(Path(os.path.join(CACHE, 'beyond', 'places.json')).read_text(encoding='utf-8'))
    L2, S2, cells = meta['L'], meta['S'], meta['cells']
    h, w = beyond.shape
    ix, _, water, height = load_step()
    lon_of, lat_of, km_per_px, _ = frame(ix, cells)
    worldW = ix['worldW']
    print(f'game map L {L} S {S}; beyond L {L2} S {S2}')

    def new_id(b):  # an id of the beyond raster -> its id after the merge
        b = np.asarray(b)
        return np.where(b == 0, 0, np.where(b <= L2, L + b, L + L2 + S + (b - L2)))

    def old_id(g):  # an id of the game map -> its id after the merge
        g = np.asarray(g)
        return np.where(g <= L, g, g + L2)

    # --- the new places: centre, area, height ------------------------------------------------------------------------
    flat = beyond.ravel()
    ys, xs = np.divmod(np.arange(flat.size), w)
    n = L2 + S2 + 1
    cnt = np.bincount(flat, minlength=n).astype(np.float64)
    # x is unwrapped across the seam at 100° W, so that the places west of it lie at negative x next to the game map
    mx = (xs + 0.5) / cells
    mx = np.where(lon_of(mx) < -100, mx - worldW, mx)
    sx = np.bincount(flat, weights=mx, minlength=n) / np.maximum(cnt, 1)
    sy = np.bincount(flat, weights=(ys + 0.5) / cells, minlength=n) / np.maximum(cnt, 1)
    lat = lat_of(sy)
    lon = lon_of(np.mod(sx, worldW))
    kmc = km_per_px(np.mod((xs + 0.5) / cells, worldW), lat_of((ys + 0.5) / cells)) / cells
    area = np.bincount(flat, weights=kmc**2, minlength=n)
    hf = height.ravel().astype(np.float64)
    elev = np.bincount(flat, weights=hf, minlength=n) / np.maximum(cnt, 1)
    rough = np.sqrt(np.maximum(np.bincount(flat, weights=hf * hf, minlength=n) / np.maximum(cnt, 1) - elev**2, 0))
    emax = np.full(n, -1e9)
    np.maximum.at(emax, flat, hf)
    # --- neighbours ---------------------------------------------------------------------------------------------------
    pairs = {}

    def count(a, b, c=1):
        a, b = int(a), int(b)
        if a == b or a == 0 or b == 0:
            return
        k = (min(a, b), max(a, b))
        pairs[k] = pairs.get(k, 0) + c

    def add_pairs(A, B):
        m = (A != B) & (A > 0) & (B > 0)
        if not m.any():
            return
        lo, hi = np.minimum(A[m], B[m]), np.maximum(A[m], B[m])
        keys, c = np.unique(lo.astype(np.int64) * 100000 + hi, return_counts=True)
        for k, v in zip(keys, c):
            count(k // 100000, k % 100000, int(v))

    nb = new_id(beyond)
    add_pairs(nb[:, :-1], nb[:, 1:])
    add_pairs(nb[:-1, :], nb[1:, :])
    add_pairs(nb[:, -1], nb[:, 0])
    # across the edges of the game map (its raster is one map pixel a cell, the new one half that)
    raw = gzip.decompress(Path(os.path.join(MAP, 'ids.bin.gz')).read_bytes())
    gids = np.frombuffer(raw, '<u2').reshape(MAP_H, MAP_W).astype(np.int64)
    gx, gy = int(MAP_W * cells), int(MAP_H * cells)
    rows = np.arange(MAP_H)
    add_pairs(old_id(gids[:, MAP_W - 1]), nb[(rows * cells).astype(int), gx])  # east edge, 70° E
    add_pairs(old_id(gids[:, 0]), nb[(rows * cells).astype(int), w - 1])  # west edge, 100° W
    cols = np.arange(MAP_W)
    add_pairs(old_id(gids[MAP_H - 1, :]), nb[gy, (cols * cells).astype(int)])  # south edge, 38° S
    Lt, St = L + L2, S + S2
    edges = []
    for a, b, k, c, rf in geo['edges']:
        edges.append([int(old_id(a)), int(old_id(b)), k, c, rf])
    for (a, b), c in pairs.items():
        kind = 0 if a <= Lt and b <= Lt else 2 if a > Lt and b > Lt else 1
        edges.append([a, b, kind, int(max(1, round(c / cells if a > L and b > L else c))), 0.0])
    print('edges', len(geo['edges']), '->', len(edges))
    adj = [[] for _ in range(Lt + St + 1)]
    for a, b, _k, _c, _rf in edges:
        adj[a].append(b)
        adj[b].append(a)

    # --- people: culture, faith, density -------------------------------------------------------------------------------
    hist = json.loads(
        Path(os.path.join(ROOT, 'data', 'history', '1356', 'world_beyond.json')).read_text(encoding='utf-8')
    )
    an = hist['demography']

    tree = cKDTree(xyz(np.array([a['lon'] for a in an]), np.array([a['lat'] for a in an])))
    nl = slice(1, L2 + 1)
    dd, jj = tree.query(xyz(lon[nl], lat[nl]), k=3)
    culture = [an[j[0]]['culture'] for j in jj]
    faith = [an[j[0]]['faith'] for j in jj]
    wts = 1 / np.maximum(dd, 1e-4) ** 2
    dens = (np.array([[an[k]['density'] for k in j] for j in jj]) * wts).sum(1) / wts.sum(1)

    # --- terrain and climate (build_setup.py's rules; deserts and the impassable from aridity and height) ---------------
    temp, arid = climate(lon[1:], lat[1:], elev[1:])
    temp, arid = np.asarray(temp), np.asarray(arid)
    coastal = np.zeros(L2, bool)
    for i in range(L2):
        coastal[i] = any(v > Lt for v in adj[L + 1 + i])
    terrain, forest = terrain_of(temp, arid, lat, elev, rough, emax, dens, L2)
    resource = assign_resources(L2, lon[nl], lat[nl], terrain, coastal, T=temp, A=arid, dens=dens, forest=forest)
    tmul = {
        'wasteland': 0.02,
        'mountains': 0.45,
        'desert': 0.15,
        'tundra': 0.25,
        'marsh': 0.45,
        'forest': 0.7,
        'hills': 0.85,
        'steppe': 0.6,
        'jungle': 0.5,
        'plains': 1.0,
        'farmland': 1.15,
    }
    pop = np.array([dens[i] * area[1 + i] * tmul[terrain[i]] for i in range(L2)])
    seeds = meta['places']
    for i in range(L2):
        if seeds[i][6]:
            pop[i] += float(seeds[i][6])

    # --- names: the researched ones, the rest after the people's naming --------------------------------------------------
    world = read('world.json')
    used = {n for n in world['name'] if n}
    names = []
    for i in range(L2):
        nm = seeds[i][2]
        if not nm or nm in used:
            nm = gen_name(culture[i], L + 1 + i, used, lon[1 + i], lat[1 + i])
        used.add(nm)
        names.append(nm)

    # --- provinces and areas, built over the new places alone ----------------------------------------------------------
    ladj = [[] for _ in range(L2 + 1)]
    for a, b, _k, _c, _rf in edges:
        if L < a <= Lt and L < b <= Lt:
            ladj[a - L].append(b - L)
            ladj[b - L].append(a - L)
    pn = [None] + names
    size = [0] + [int(s[3] or 0) for s in seeds]
    provs = build_provinces(L2, ladj, [None] * (L2 + 1), pn, size, area, sx, sy, lat)
    prov_of = np.zeros(L2 + 1, np.int32)
    for pi, p in enumerate(provs):
        for i in p['locs']:
            prov_of[i] = pi
    rkey = [None] + [region_of(lon[1 + i], lat[1 + i], elev[1 + i]) for i in range(L2)]
    areas = build_areas(provs, prov_of, ladj, rkey, L2)
    P0 = len(geo['provinces'])
    for pi, p in enumerate(provs):
        p['locs'] = [L + i for i in p['locs']]
        p['capital'] = L + p['capital']
        p['area'] = next(ai for ai, a in enumerate(areas) if pi in a['provinces']) + len(geo['areas'])
        p['region'] = rkey[p['capital'] - L]
    for a in areas:
        a['provinces'] = [P0 + q for q in a['provinces']]
    print('provinces', len(provs), 'areas', len(areas))

    # --- holders in 1356 -------------------------------------------------------------------------------------------------
    setup = read('setup_1356.json')
    states, owner = spread_holders(geo, setup, hist, adj, lon, lat, L, L2)
    # culture and faith of a realm's own core where the people's points say nothing better
    minority = [None] * L2

    # --- write ------------------------------------------------------------------------------------------------------------
    loc = geo['loc']

    def ins(
        arr, new_land, new_sea=None
    ):  # an array per place and sea zone: the new land after the old land, the new sea at the end
        return arr[:L] + list(new_land) + arr[L:] + (list(new_sea) if new_sea is not None else [])

    sea_sl = slice(L2 + 1, n)
    loc['x'] = ins(loc['x'], np.round(sx[nl], 1).tolist(), np.round(sx[sea_sl], 1).tolist())
    loc['y'] = ins(loc['y'], np.round(sy[nl], 1).tolist(), np.round(sy[sea_sl], 1).tolist())
    loc['lon'] = ins(loc['lon'], np.round(lon[nl], 3).tolist(), np.round(lon[sea_sl], 3).tolist())
    loc['lat'] = ins(loc['lat'], np.round(lat[nl], 3).tolist(), np.round(lat[sea_sl], 3).tolist())
    loc['area'] = ins(loc['area'], np.round(area[nl], 1).tolist(), np.round(area[sea_sl], 1).tolist())
    loc['elev'] = ins(loc['elev'], elev[nl].astype(int).tolist(), elev[sea_sl].astype(int).tolist())
    loc['rough'] = ins(loc['rough'], rough[nl].astype(int).tolist(), rough[sea_sl].astype(int).tolist())
    loc['emax'] = ins(loc['emax'], emax[nl].astype(int).tolist(), emax[sea_sl].astype(int).tolist())
    loc['name'] = ins(loc['name'], names, [None] * S2)
    loc['alt'] = loc['alt'] + [seeds[i][5] for i in range(L2)]
    loc['size'] = loc['size'] + [int(seeds[i][3] or 0) for i in range(L2)]
    loc['pop'] = loc['pop'] + [seeds[i][6] for i in range(L2)]
    loc['region_key'] = loc['region_key'] + rkey[1:]
    geo['L'], geo['S'] = Lt, St
    geo['edges'] = edges
    geo['straits'] = [[int(old_id(a)), int(old_id(b)), nm] for a, b, nm in geo['straits']]
    geo['passes'] = [[int(old_id(a)), nm] for a, nm in geo['passes']]
    geo['provinces'] += provs
    geo['areas'] += areas
    geo['beyond'] = {
        'L0': L,
        'S0': S,
        'L': L2,
        'S': S2,
        'cells': cells,
        'w': w,
        'h': h,
        'worldW': worldW,
        'raster': 'map/beyond.bin.gz',
    }
    Path(os.path.join(DATA, 'geo.json')).write_text(
        json.dumps(geo, ensure_ascii=False, separators=(',', ':')), encoding='utf-8'
    )
    world['terrain'] += terrain
    world['resource'] += resource
    world['name'] += names
    world['coastal'] += [bool(c) for c in coastal]
    world['forest'] += [round(float(v), 2) for v in forest]
    world['temp'] = ins(
        world['temp'],
        [round(float(v), 1) for v in temp],
        [round(float(v), 1) for v in climate(lon[sea_sl], lat[sea_sl], np.zeros(S2))[0]],
    )
    world['arid'] = ins(
        world['arid'],
        [round(float(v), 2) for v in arid],
        [round(float(v), 2) for v in climate(lon[sea_sl], lat[sea_sl], np.zeros(S2))[1]],
    )
    Path(os.path.join(DATA, 'world.json')).write_text(
        json.dumps(world, ensure_ascii=False, separators=(',', ':')), encoding='utf-8'
    )
    land = read('land.json')
    add_yield(land, flat, xs, ys, cells, worldW, lon_of, lat_of, kmc, n, L2)
    Path(os.path.join(DATA, 'land.json')).write_text(
        json.dumps(land, ensure_ascii=False, separators=(',', ':')), encoding='utf-8'
    )
    setup['states'] = states
    setup['owner'] = [int(v) for v in owner[1 : L + 1]] + [
        int(v) for v in owner[L + 1 :]
    ]  # -1: no realm, as the game map's own setup writes it
    setup['culture'] += culture
    setup['faith'] += faith
    setup['minority'] += minority
    setup['pop'] += [int(v) for v in pop]
    setup['density'] += [round(float(v), 2) for v in dens]
    setup['wars'] += hist['wars']
    Path(os.path.join(DATA, 'setup_1356.json')).write_text(
        json.dumps(setup, ensure_ascii=False, separators=(',', ':')), encoding='utf-8'
    )
    for name, a in (('ids.bin.gz', old_id(gids)), ('beyond.bin.gz', nb)):
        with (
            open(os.path.join(MAP, name), 'wb') as raw,
            gzip.GzipFile(fileobj=raw, mode='wb', compresslevel=9, mtime=0) as f,
        ):
            f.write(a.astype('<u2').tobytes())
    print('written: L', Lt, 'S', St, 'people beyond (M)', round(pop.sum() / 1e6, 1))


if __name__ == '__main__':
    main()
