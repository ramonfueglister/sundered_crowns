"""Joins the places of the rest of the globe (tools/geo/build_beyond.py) to the game map, keeping the 15,220 places
of the game map as they are (Ramon, 2026-11-15).

Numbering: the land places of the game map keep their ids 1..L; the new land places follow as L+1..L+L2; then come
the sea zones, the game map's first (their ids move up by L2) and the new ones after them. Nothing in the state of a
running world refers to a sea zone, and every array per place only grows at its end (src/sim/upgrade.ts adds the new
places to a running world).

Per new place: centre, area, height, neighbours (also across the edges of the game map), a province, a name, its
terrain and climate (tools/geo/build_setup.py's rules), culture, faith and people (data/history/1356/world_beyond.json
"demography"), and its holder in 1356: the realms of world_beyond.json and those of the game map that reach beyond it
("extends") spread from their capitals and holdings over the land, as build_setup.py spreads them.

Writes public/data/geo.json, world.json, land.json, setup_1356.json, public/map/ids.bin.gz (the sea
zones renumbered) and public/map/beyond.bin.gz (the new raster: u16 ids over step z3 of the world frame, 0 inside the
game map). Run once on the files as committed before the merge: python3 tools/geo/merge_beyond.py
"""
import gzip, heapq, json, math, os, sys
import numpy as np
from scipy.spatial import cKDTree
sys.path.insert(0, os.path.dirname(__file__))
from common import CACHE, H as MAP_H, ROOT, W as MAP_W
from build_beyond import frame, load_step
from build_export import build_provinces, build_areas
from build_land import yield_curve
from build_setup import climate, assign_resources, gen_name, SYL, CULT_GROUP

DATA = os.path.join(ROOT, 'public', 'data')
MAP = os.path.join(ROOT, 'public', 'map')
read = lambda name: json.load(open(os.path.join(DATA, name), encoding='utf-8'))

# names for the peoples beyond the game map, built as build_setup.py builds the European ones (prefix + suffix)
SYL.update({
    'sinic': (['Ping', 'An', 'Chang', 'Lin', 'Shan', 'He', 'Nan', 'Bei', 'Dong', 'Xi', 'Feng', 'Yong', 'Jin', 'Qing', 'Huai', 'Gao', 'Bao', 'Fu', 'Ning', 'Long'],
              ['zhou', 'cheng', 'xian', 'ling', 'yang', 'an', 'shan', 'kou', 'jiang', 'ping', 'de', 'yuan', 'tai', 'hua']),
    'japonic': (['Taka', 'Naka', 'Kawa', 'Yama', 'Matsu', 'Oka', 'Hira', 'Fuku', 'Kita', 'Minami', 'Shima', 'Asa', 'Mori', 'Ise', 'Toyo'],
                ['saki', 'mura', 'hara', 'da', 'yama', 'shima', 'gawa', 'no', 'oka', 'zawa', 'ta', 'ura']),
    'korean': (['Gwang', 'Cheong', 'Yeong', 'Hae', 'Nam', 'Seo', 'Jin', 'Hwa', 'Mun', 'Pyeong', 'Dan', 'Ok'], ['ju', 'san', 'won', 'cheon', 'yang', 'seong', 'chang', 'do']),
    'indic': (['Rama', 'Chandra', 'Deva', 'Sri', 'Hari', 'Vijaya', 'Shiva', 'Ratna', 'Kanaka', 'Bhima', 'Indra', 'Gopal', 'Lakshmi', 'Narayan', 'Sona', 'Kali'],
              ['pur', 'nagar', 'garh', 'abad', 'kot', 'ganj', 'pura', 'gaon', 'wara', 'ghat', 'patan']),
    'dravidian': (['Kanchi', 'Tiru', 'Palla', 'Kumba', 'Vella', 'Manga', 'Kolla', 'Anna', 'Siru', 'Peri', 'Mel', 'Kil'], ['puram', 'palli', 'ur', 'koil', 'nadu', 'kottai', 'pettai', 'kudi']),
    'tai': (['Chiang ', 'Muang ', 'Ban ', 'Nong ', 'Wiang ', 'Phra ', 'Na ', 'Mae '], ['Rai', 'Kham', 'Thong', 'Saen', 'Luang', 'Khao', 'Yai', 'Noi', 'Kaeo', 'Chan']),
    'austroasiatic': (['Thanh ', 'Phú ', 'An ', 'Vĩnh ', 'Long ', 'Bình ', 'Kampong ', 'Prey ', 'Phnom ', 'Svay '], ['Hòa', 'Yên', 'Định', 'Xuân', 'Lộc', 'Thom', 'Chas', 'Srei', 'Meas', 'Sơn']),
    'austronesian': (['Kota ', 'Tanjung ', 'Sungai ', 'Batu ', 'Bukit ', 'Muara ', 'Kuala ', 'Pulau ', 'Teluk '], ['Besar', 'Lama', 'Raja', 'Mas', 'Tinggi', 'Putih', 'Merah', 'Baru', 'Panjang', 'Kecil']),
    'tibeto_burman': (['Myit', 'Taung', 'Nyaung', 'Shwe', 'Kyauk', 'Pyin', 'Gya', 'Nyang', 'Lho', 'Dra', 'Tsang', 'Ri'], ['gyi', 'oo', 'myo', 'pin', 'daw', 'kar', 'tse', 'gang', 'ling', 'rong', 'thang']),
    'polynesian': (['Moto', 'Hau', 'Kai', 'Lani', 'Ma', 'Wai', 'Puke', 'Rangi', 'Tai', 'Hono'], ['nui', 'ka', 'loa', 'iti', 'tea', 'roa', 'kau', 'pua']),
    'mongolic': (['Ulaan', 'Khar', 'Tsagaan', 'Shar', 'Ikh', 'Baga', 'Khongor', 'Altan', 'Bayan'], ['tolgoi', 'gol', 'nuur', 'bulag', 'khoshuu', 'uul', 'tal']),
})
for grp, members in {
    'sinic': 'han jurchen', 'japonic': 'japanese ryukyuan', 'korean': 'korean',
    'indic': 'hindustani bengali kashmiri dakhini rajput nepali assamese odia sinhala dhivehi gujarati punjabi newar',
    'dravidian': 'kannada tamil telugu malayali', 'tai': 'thai lao shan ahom', 'austroasiatic': 'vietnamese khmer mon',
    'austronesian': 'cham javanese sundanese malay bugis tagalog', 'tibeto_burman': 'tibetan burmese arakanese',
    'polynesian': 'polynesian maori', 'mongolic': 'mongol', 'turkic': 'chagatai_turkic uyghur',
}.items():
    for m in members.split(): CULT_GROUP[m] = grp

REGIONS = [  # region key of a new place (as geo.json's region_key): first box that holds it, (lon0, lon1, lat0, lat1)
    ('china', 97, 125, 18, 42), ('korea_japan', 124, 150, 24, 46), ('tibet', 78, 104, 26, 38), ('india', 66, 98, 5, 37),
    ('southeast_asia', 92, 141, -12, 28), ('central_asia', 66, 98, 36, 50), ('mongolia', 85, 135, 41, 54), ('siberia', 60, 180, 50, 90),
    ('oceania', 110, 180, -50, 0), ('pacific', -180, -120, -50, 30), ('americas', -180, -60, -60, 90),
]


def region_of(lo, la, elev):
    if 26 <= la <= 40 and 72 <= lo <= 104 and elev > 2500: return 'tibet'
    for k, a, b, c, d in REGIONS:
        if k == 'tibet': continue
        if a <= lo <= b and c <= la <= d: return k
    return 'oceania' if la < 0 else 'siberia'


def main():
    geo = read('geo.json')
    if 'beyond' in geo: raise SystemExit('geo.json holds the rest of the world already: start from the committed files')
    L, S = geo['L'], geo['S']
    beyond = np.load(os.path.join(CACHE, 'beyond', 'ids.npy'))
    meta = json.load(open(os.path.join(CACHE, 'beyond', 'places.json'), encoding='utf-8'))
    L2, S2, cells = meta['L'], meta['S'], meta['cells']
    h, w = beyond.shape
    ix, _, water, height = load_step()
    lon_of, lat_of, km_per_px, _ = frame(ix, cells)
    worldW = ix['worldW']
    print(f'game map L {L} S {S}; beyond L {L2} S {S2}')

    def new_id(b):   # an id of the beyond raster -> its id after the merge
        b = np.asarray(b)
        return np.where(b == 0, 0, np.where(b <= L2, L + b, L + L2 + S + (b - L2)))
    def old_id(g):   # an id of the game map -> its id after the merge
        g = np.asarray(g)
        return np.where(g <= L, g, g + L2)

    # --- the new places: centre, area, height ------------------------------------------------------------------------
    flat = beyond.ravel()
    ys, xs = np.divmod(np.arange(flat.size), w)
    n = L2 + S2 + 1
    cnt = np.bincount(flat, minlength=n).astype(np.float64)
    # x is unwrapped across the seam at 100° W, so that the places west of it lie at negative x next to the game map
    mx = (xs + 0.5) / cells; mx = np.where(lon_of(mx) < -100, mx - worldW, mx)
    sx = np.bincount(flat, weights=mx, minlength=n) / np.maximum(cnt, 1)
    sy = np.bincount(flat, weights=(ys + 0.5) / cells, minlength=n) / np.maximum(cnt, 1)
    lat = lat_of(sy); lon = lon_of(np.mod(sx, worldW))
    kmc = km_per_px(np.mod((xs + 0.5) / cells, worldW), lat_of((ys + 0.5) / cells)) / cells
    area = np.bincount(flat, weights=kmc ** 2, minlength=n)
    hf = height.ravel().astype(np.float64)
    elev = np.bincount(flat, weights=hf, minlength=n) / np.maximum(cnt, 1)
    rough = np.sqrt(np.maximum(np.bincount(flat, weights=hf * hf, minlength=n) / np.maximum(cnt, 1) - elev ** 2, 0))
    emax = np.full(n, -1e9); np.maximum.at(emax, flat, hf)
    # --- neighbours ---------------------------------------------------------------------------------------------------
    pairs = {}
    def count(a, b, c=1):
        a, b = int(a), int(b)
        if a == b or a == 0 or b == 0: return
        k = (min(a, b), max(a, b)); pairs[k] = pairs.get(k, 0) + c
    def add_pairs(A, B):
        m = (A != B) & (A > 0) & (B > 0)
        if not m.any(): return
        lo, hi = np.minimum(A[m], B[m]), np.maximum(A[m], B[m])
        keys, c = np.unique(lo.astype(np.int64) * 100000 + hi, return_counts=True)
        for k, v in zip(keys, c): count(k // 100000, k % 100000, int(v))
    nb = new_id(beyond)
    add_pairs(nb[:, :-1], nb[:, 1:]); add_pairs(nb[:-1, :], nb[1:, :]); add_pairs(nb[:, -1], nb[:, 0])
    # across the edges of the game map (its raster is one map pixel a cell, the new one half that)
    raw = gzip.open(os.path.join(MAP, 'ids.bin.gz')).read()
    gids = np.frombuffer(raw, '<u2').reshape(MAP_H, MAP_W).astype(np.int64)
    gx, gy = int(MAP_W * cells), int(MAP_H * cells)
    rows = np.arange(MAP_H)
    add_pairs(old_id(gids[:, MAP_W - 1]), nb[(rows * cells).astype(int), gx])          # east edge, 70° E
    add_pairs(old_id(gids[:, 0]), nb[(rows * cells).astype(int), w - 1])                # west edge, 100° W
    cols = np.arange(MAP_W)
    add_pairs(old_id(gids[MAP_H - 1, :]), nb[gy, (cols * cells).astype(int)])          # south edge, 38° S
    Lt, St = L + L2, S + S2
    edges = []
    for a, b, k, c, rf in geo['edges']:
        edges.append([int(old_id(a)), int(old_id(b)), k, c, rf])
    for (a, b), c in pairs.items():
        kind = 0 if a <= Lt and b <= Lt else 2 if a > Lt and b > Lt else 1
        edges.append([a, b, kind, int(max(1, round(c / cells if a > L and b > L else c))), 0.0])
    print('edges', len(geo['edges']), '->', len(edges))
    adj = [[] for _ in range(Lt + St + 1)]
    for a, b, k, c, rf in edges: adj[a].append(b); adj[b].append(a)

    # --- people: culture, faith, density -------------------------------------------------------------------------------
    hist = json.load(open(os.path.join(ROOT, 'data', 'history', '1356', 'world_beyond.json'), encoding='utf-8'))
    an = hist['demography']
    def xyz(lo, la):
        lo, la = np.radians(lo), np.radians(la)
        return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], -1)
    tree = cKDTree(xyz(np.array([a['lon'] for a in an]), np.array([a['lat'] for a in an])))
    nl = slice(1, L2 + 1)
    dd, jj = tree.query(xyz(lon[nl], lat[nl]), k=3)
    culture = [an[j[0]]['culture'] for j in jj]; faith = [an[j[0]]['faith'] for j in jj]
    wts = 1 / np.maximum(dd, 1e-4) ** 2
    dens = (np.array([[an[k]['density'] for k in j] for j in jj]) * wts).sum(1) / wts.sum(1)

    # --- terrain and climate (build_setup.py's rules; deserts and the impassable from aridity and height) ---------------
    temp, arid = climate(lon[1:], lat[1:], elev[1:])
    temp, arid = np.asarray(temp), np.asarray(arid)
    coastal = np.zeros(L2, bool)
    for i in range(L2):
        coastal[i] = any(v > Lt for v in adj[L + 1 + i])
    terrain, forest = [], np.zeros(L2)
    for i in range(L2):
        T, A, e, r, em = temp[i], arid[i], elev[1 + i], rough[1 + i], emax[1 + i]
        if (lat[1 + i] > 60 and e > 500) or (A > 0.95 and dens[i] < 0.1) or e > 4200: t = 'wasteland'
        elif em > 2300 or (e > 1200 and r > 220) or r > 420: t = 'mountains'
        elif A > 0.85: t = 'desert'
        elif T > 23 and A < 0.35 and abs(lat[1 + i]) < 15: t = 'jungle'
        elif T < -1.5: t = 'tundra'
        elif e > 450 or r > 130: t = 'hills'
        elif A > 0.55: t = 'steppe'; forest[i] = float(np.clip((0.68 - A) * 2.2 - dens[i] / 60, 0, 0.3))
        else:
            fc = float(np.clip((1 - A) * 1.15 - dens[i] / 32.0, 0, 1))
            if lat[1 + i] > 58: fc = min(1, fc + 0.25)
            forest[i] = fc
            t = 'forest' if fc > 0.55 else ('farmland' if dens[i] > 14 else 'plains')
        if t in ('hills', 'mountains'): forest[i] = float(np.clip((1 - A) * 0.9 - dens[i] / 50, 0, 1))
        terrain.append(t)
    resource = assign_resources(L2, lon[nl], lat[nl], terrain, coastal, T=temp, A=arid, dens=dens, forest=forest)
    tmul = {'wasteland': 0.02, 'mountains': 0.45, 'desert': 0.15, 'tundra': 0.25, 'marsh': 0.45, 'forest': 0.7, 'hills': 0.85, 'steppe': 0.6, 'jungle': 0.5, 'plains': 1.0, 'farmland': 1.15}
    pop = np.array([dens[i] * area[1 + i] * tmul[terrain[i]] for i in range(L2)])
    seeds = meta['places']
    for i in range(L2):
        if seeds[i][6]: pop[i] += float(seeds[i][6])

    # --- names: the researched ones, the rest after the people's naming --------------------------------------------------
    world = read('world.json')
    used = set(n for n in world['name'] if n)
    names = []
    for i in range(L2):
        nm = seeds[i][2]
        if not nm or nm in used:
            nm = gen_name(culture[i], L + 1 + i, used, lon[1 + i], lat[1 + i])
        used.add(nm); names.append(nm)

    # --- provinces and areas, built over the new places alone ----------------------------------------------------------
    ladj = [[] for _ in range(L2 + 1)]
    for a, b, k, c, rf in edges:
        if L < a <= Lt and L < b <= Lt: ladj[a - L].append(b - L); ladj[b - L].append(a - L)
    pn = [None] + names
    size = [0] + [int(s[3] or 0) for s in seeds]
    provs = build_provinces(L2, ladj, [None] * (L2 + 1), pn, size, area, sx, sy, lat)
    prov_of = np.zeros(L2 + 1, np.int32)
    for pi, p in enumerate(provs):
        for i in p['locs']: prov_of[i] = pi
    rkey = [None] + [region_of(lon[1 + i], lat[1 + i], elev[1 + i]) for i in range(L2)]
    areas = build_areas(provs, prov_of, ladj, rkey, L2)
    P0 = len(geo['provinces'])
    for pi, p in enumerate(provs):
        p['locs'] = [L + i for i in p['locs']]; p['capital'] = L + p['capital']
        p['area'] = next(ai for ai, a in enumerate(areas) if pi in a['provinces']) + len(geo['areas'])
        p['region'] = rkey[p['capital'] - L]
    for a in areas: a['provinces'] = [P0 + q for q in a['provinces']]
    print('provinces', len(provs), 'areas', len(areas))

    # --- holders in 1356 -------------------------------------------------------------------------------------------------
    setup = read('setup_1356.json')
    states = setup['states']
    ids_of = {s['id']: k for k, s in enumerate(states)}
    for s in hist['states']:
        if s['id'] in ids_of: raise SystemExit(f'realm {s["id"]} exists already')
        o = dict(s); o['capital_loc'] = 0; o.pop('reach_km', None)
        ids_of[s['id']] = len(states); states.append(o)
    owner = np.full(Lt + 1, -1, np.int32)
    owner[1:L + 1] = [-1 if v is None else v for v in setup['owner']]
    tree_new = cKDTree(xyz(lon[nl], lat[nl]))
    def place_at(lo, la):
        d, j = tree_new.query(xyz(np.array([lo]), np.array([la]))[0])
        return L + 1 + int(j) if d < math.radians(1.5) else 0
    REACH = 380
    rank_w = {'kingdom': 0.8, 'empire': 0.75, 'khanate': 0.7, 'sultanate': 0.85, 'duchy': 1.0, 'principality': 1.1, 'lordship': 1.5, 'chiefdom': 1.2}
    best = np.full(Lt + 1, np.inf); pq = []
    def anchor(si, p, wgt):
        l = place_at(p['lon'], p['lat'])
        if not l or best[l] == 0: return l
        best[l] = 0; owner[l] = si; heapq.heappush(pq, (0.0, l, si, wgt))
        return l
    for s in hist['states']:
        # a small realm whose land the sources bound (the chiefdoms of the Philippines) spreads only as far as its reach
        si = ids_of[s['id']]; wgt = rank_w.get(s['rank'], 1.0) * (REACH / s['reach_km'] if s.get('reach_km') else 1.0)
        cap = anchor(si, s['capital'], wgt)
        states[si]['capital_loc'] = int(cap) if cap else 0
        for p in s['holdings'][1:]: anchor(si, p, wgt)
    for sid, pts in hist['extends'].items():
        si = ids_of[sid]; wgt = rank_w.get(states[si].get('rank'), 1.0)
        for spec in pts:
            nm, c = spec.split('@'); la, lo = map(float, c.split(','))
            anchor(si, {'lon': lo, 'lat': la}, wgt)
    def wander(lo, la, k):
        """a smooth field in 0..1 of a few hundred km, so that the spread's fronts are not circles or straight lines"""
        a, b = math.radians(lo), math.radians(la)
        v = (math.sin(7.3 * a + 2.1 * b + k) + math.sin(-3.1 * a + 9.7 * b + 1.7 + 2 * k) + math.sin(11.9 * a - 6.2 * b + 4.4 + 3 * k)
             + 0.5 * math.sin(23.0 * a + 17.0 * b + k))
        return min(1.0, max(0.0, 0.5 + v / 7))
    # realms of the game map that reach beyond it go on across its edge: a new place next to one of their places
    # starts their spread as well, so that their land does not end on the meridian of the edge
    for u in range(L + 1, Lt + 1):
        if best[u] == 0: continue
        for v in adj[u]:
            o = owner[v] if 1 <= v <= L else -1
            if o >= 0 and states[o]['id'] in hist['extends']:
                # a head start that wanders along the edge, so that the realm's new border does not run parallel to it
                d0 = 0.45 * REACH * wander(lon[u - L], lat[u - L], 0)
                if d0 < best[u]:
                    best[u] = d0; owner[u] = o; heapq.heappush(pq, (d0, u, o, rank_w.get(states[o].get('rank'), 1.0)))
                break
    old_owner = owner.copy(); new_ids = {s['id'] for s in hist['states']}
    lon0, lat0 = geo['loc']['lon'], geo['loc']['lat']
    def ll(u): return (lon[u - L], lat[u - L]) if u > L else (lon0[u - 1], lat0[u - 1])
    def km_between(u, v):
        return float(np.degrees(np.arccos(np.clip((xyz(*ll(u)) * xyz(*ll(v))).sum(), -1, 1)))) * 111.2
    while pq:
        d, u, si, wgt = heapq.heappop(pq)
        if d > best[u] or owner[u] != si: continue
        for v in adj[u]:
            # the new realms also take land of the game map that no realm holds next to theirs (Sindh beside Delhi),
            # so that no realm ends on the meridian of the map's edge
            # (those reaching beyond it too in the steppe south of 55° N, not the forest of Yugra to the north)
            if not (L < v <= Lt or (1 <= v <= L and old_owner[v] < 0 and (states[si]['id'] in new_ids or (states[si]['id'] in hist['extends'] and lat0[v - 1] < 55)))): continue
            nd = d + km_between(u, v) * wgt * (0.7 + 0.6 * wander(*ll(v), 1))
            if nd < best[v] and nd < REACH:
                best[v] = nd; owner[v] = si; heapq.heappush(pq, (nd, v, si, wgt))
    taken = [int(v) for v in range(1, L + 1) if owner[v] != old_owner[v]]
    print('places of the game map no realm held that the new realms take', len(taken))
    held = int((owner[L + 1:] >= 0).sum())
    print('new places held', held, 'of', L2)
    for s in hist['states']:
        si = ids_of[s['id']]
        if not states[si]['capital_loc']: print('  no capital place for', s['id'])
    # culture and faith of a realm's own core where the people's points say nothing better
    minority = [None] * L2

    # --- write ------------------------------------------------------------------------------------------------------------
    loc = geo['loc']
    def ins(arr, new_land, new_sea=None):    # an array per place and sea zone: the new land after the old land, the new sea at the end
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
    geo['beyond'] = {'L0': L, 'S0': S, 'L': L2, 'S': S2, 'cells': cells, 'w': w, 'h': h, 'worldW': worldW, 'raster': 'map/beyond.bin.gz'}
    json.dump(geo, open(os.path.join(DATA, 'geo.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    world['terrain'] += terrain; world['resource'] += resource; world['name'] += names; world['coastal'] += [bool(c) for c in coastal]
    world['forest'] += [round(float(v), 2) for v in forest]
    world['temp'] = ins(world['temp'], [round(float(v), 1) for v in temp], [round(float(v), 1) for v in climate(lon[sea_sl], lat[sea_sl], np.zeros(S2))[0]])
    world['arid'] = ins(world['arid'], [round(float(v), 2) for v in arid], [round(float(v), 2) for v in climate(lon[sea_sl], lat[sea_sl], np.zeros(S2))[1]])
    json.dump(world, open(os.path.join(DATA, 'world.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    land = read('land.json')
    # the Caloric Suitability Index of the whole globe (tools/geo/build_csi_crop.py --world), read over the new places as
    # tools/geo/build_land.py reads it over the game map: each cell of the step takes the index cell its centre lies in
    cmeta = json.load(open(os.path.join(ROOT, 'tools', 'geo', 'data', 'csi', 'pre1500_max_world.json'), encoding='utf-8'))
    if cmeta['raster']['sha256'] != land['source']['sha256']: raise SystemExit('the whole raster is not the one of land.json')
    cc = cmeta['crop']
    csi = np.frombuffer(gzip.open(os.path.join(ROOT, 'tools', 'geo', 'data', 'csi', cc['file'])).read(), dtype='<f4').reshape(cc['height'], cc['width'])
    clon = np.mod(lon_of(np.mod((xs + 0.5) / cells, worldW)) + 180.0, 360.0) - 180.0; clat = lat_of((ys + 0.5) / cells)
    ccol = np.clip(np.floor((clon - cc['lon0']) / cc['cell_lon']).astype(np.int64), 0, cc['width'] - 1)
    crow = np.floor((cc['lat0'] - clat) / cc['cell_lat']).astype(np.int64)
    inside = (crow >= 0) & (crow < cc['height'])
    cv = np.full(flat.size, np.nan, np.float32); cv[inside] = csi[crow[inside], ccol[inside]]
    has = np.isfinite(cv); cv0 = np.where(has, cv, 0.0).astype(np.float64)
    km2c = kmc ** 2
    nland = (flat >= 1) & (flat <= L2)
    cov = np.bincount(flat, weights=km2c * has, minlength=n)[1:L2 + 1]
    tot = np.bincount(flat, weights=km2c * cv0, minlength=n)[1:L2 + 1]
    ymean = np.divide(tot, cov, out=np.full(L2, np.nan), where=cov > 0)
    cell_ix = np.where(inside, crow, 0) * cc['width'] + ccol
    fert2, steps2 = yield_curve(flat, nland, cell_ix, cc['width'] * cc['height'], cv0, km2c, L2)
    land['yield'] += [None if np.isnan(m) else round(float(m), 1) for m in ymean]
    land['curve']['fertile'] += [float(f) for f in fert2]
    land['curve']['steps'] += steps2
    land['source']['beyond'] = 'places beyond the game map: the whole raster, %s' % cc['file']
    print('yield of the new places: without data %d, median %.0f' % (int(np.isnan(ymean).sum()), float(np.nanmedian(ymean))))
    json.dump(land, open(os.path.join(DATA, 'land.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    setup['states'] = states
    setup['owner'] = [int(v) for v in owner[1:L + 1]] + [int(v) for v in owner[L + 1:]]  # -1: no realm, as the game map's own setup writes it
    setup['culture'] += culture; setup['faith'] += faith; setup['minority'] += minority
    setup['pop'] += [int(v) for v in pop]; setup['density'] += [round(float(v), 2) for v in dens]
    setup['wars'] += hist['wars']
    json.dump(setup, open(os.path.join(DATA, 'setup_1356.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    for name, a in (('ids.bin.gz', old_id(gids)), ('beyond.bin.gz', nb)):
        with open(os.path.join(MAP, name), 'wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', compresslevel=9, mtime=0) as f:
            f.write(a.astype('<u2').tobytes())
    print('written: L', Lt, 'S', St, 'people beyond (M)', round(pop.sum() / 1e6, 1))


if __name__ == '__main__':
    main()
