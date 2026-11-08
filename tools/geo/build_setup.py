"""Stage D: historical 1356 setup baked onto the map.

- merges the researched state files (data/history/<year>/*.json)
- assigns every location to a state (weighted multi-source Dijkstra from each state's researched anchor places)
- culture, faith, minority and population density per location (data/history/1356/demography.json)
- climate, terrain and natural resources per location
- names unnamed rural locations with culture-appropriate district names
- writes data/map/setup_<year>.json, data/map/world.json (static per-location data) and public/map/biome.png
"""
import os, sys, json, math, glob, heapq, hashlib
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree
from common import *

STAGE = os.path.join(CACHE, 'stage')
YEAR = int(sys.argv[1]) if len(sys.argv) > 1 else 1356

ALIASES = {'bavaria': 'bavaria_upper', 'chobanids': 'chobanid', 'holy_roman_empire': 'bohemia',
           'knights_hospitaller': 'hospitallers', 'mamluks': 'mamluk', 'marinids': 'marinid', 'ottomans': 'ottoman',
           'trier': 'archbishopric_trier'}

TERRAINS = ['plains', 'farmland', 'forest', 'hills', 'mountains', 'marsh', 'steppe', 'desert', 'jungle', 'tundra', 'wasteland']

def load_states():
    files = sorted(glob.glob(os.path.join(ROOT, 'data', 'history', str(YEAR), '*.json')))
    states = {}; wars = []; order = []
    for f in files:
        d = json.load(open(f, encoding='utf-8'))
        if 'states' not in d: continue
        prefer = 'empire' in os.path.basename(f)
        for s in d['states']:
            sid = s['id']
            if sid in states and not prefer: continue
            if sid not in states: order.append(sid)
            states[sid] = s
        for w in d.get('wars', []) or []:
            wars.append(w)
    ids = set(states)
    def fix(x):
        x = ALIASES.get(x, x)
        return x if x in ids else None
    for s in states.values():
        for k in ('allies', 'rivals', 'claims_on'):
            s[k] = [y for y in (fix(v) for v in (s.get(k) or [])) if y and y != s['id']]
        s['overlord'] = fix(s['overlord']) if s.get('overlord') else None
        if s['overlord'] == s['id']: s['overlord'] = None
    for w in wars:
        w['attackers'] = [y for y in (fix(v) for v in w.get('attackers', [])) if y]
        w['defenders'] = [y for y in (fix(v) for v in w.get('defenders', [])) if y]
    wars = [w for w in wars if w['attackers'] and w['defenders']]
    return [states[i] for i in order], wars

def main():
    geo = json.load(open(os.path.join(OUT_DATA, 'geo.json'), encoding='utf-8'))
    L, S = geo['L'], geo['S']
    loc = geo['loc']
    lx = np.array(loc['x']); ly = np.array(loc['y']); lon = np.array(loc['lon']); lat = np.array(loc['lat'])
    area = np.array(loc['area']); elev = np.array(loc['elev'], float); rough = np.array(loc['rough'], float); emax = np.array(loc['emax'], float)
    ids = np.load(os.path.join(STAGE, 'ids.npy'))
    # adjacency (land graph with distances)
    adj = [[] for _ in range(L + S + 1)]
    coastal = np.zeros(L + 1, bool)
    for a, b, kind, c, rf in geo['edges']:
        adj[a].append(b); adj[b].append(a)
        if kind == 1:
            coastal[min(a, b)] = True
    for a, b, nm in geo['straits']:
        adj[a].append(b); adj[b].append(a)
    states, wars = load_states()
    print('states', len(states), 'wars', len(wars))
    # ---------------- ownership ----------------
    def loc_at(lo, la):
        x, y = lonlat_to_px(lo, la); xi, yi = int(x), int(y)
        if not (0 <= xi < W and 0 <= yi < H): return 0
        v = ids[yi, xi]
        if 1 <= v <= L: return int(v)
        # nearest land within 10 px
        for r in range(1, 12):
            win = ids[max(0, yi - r):yi + r + 1, max(0, xi - r):xi + r + 1]
            m = (win >= 1) & (win <= L)
            if m.any():
                vals = win[m]; return int(np.bincount(vals).argmax())
        return 0
    rank_w = {'free_city': 2.6, 'lordship': 1.5, 'county': 1.25, 'prince_bishopric': 1.35, 'archbishopric': 1.3, 'landgraviate': 1.1,
              'margraviate': 1.05, 'principality': 1.1, 'duchy': 1.0, 'grand_duchy': 0.85, 'kingdom': 0.8, 'empire': 0.75,
              'khanate': 0.7, 'sultanate': 0.85, 'republic': 1.2, 'order': 1.0, 'tribe': 1.0, 'chiefdom': 1.2, 'emirate': 1.0, 'beylik': 1.0, 'despotate': 1.0}
    INF = 1e18
    best = np.full(L + 1, INF); owner = np.full(L + 1, -1, np.int32)
    pq = []
    capital_loc = []
    for si, s in enumerate(states):
        w = rank_w.get(s.get('rank'), 1.0)
        if s.get('government') in ('nomadic_horde',): w *= 0.7
        cap = loc_at(s['capital']['lon'], s['capital']['lat'])
        capital_loc.append(cap)
        pts = [s['capital']] + list(s.get('holdings') or [])
        for p in pts:
            try:
                l = loc_at(float(p['lon']), float(p['lat']))
            except Exception:
                continue
            if l and best[l] > 0:
                best[l] = 0; owner[l] = si
                heapq.heappush(pq, (0.0, l, si, w))
    # Dijkstra over the land graph; cost = km * weight; max reach by region
    kmpp = km_per_px(lat)
    def reach(i):
        if lon[i - 1] < -30 or lat[i - 1] < 10: return 260
        if 40 < lon[i - 1] or lat[i - 1] < 30: return 420
        return 300
    while pq:
        d, u, si, w = heapq.heappop(pq)
        if d > best[u] or owner[u] != si: continue
        for v in adj[u]:
            if v > L: continue
            dx = (lx[u - 1] - lx[v - 1]); dy = (ly[u - 1] - ly[v - 1])
            km = math.sqrt(dx * dx + dy * dy) * kmpp[u - 1]
            nd = d + km * w
            if nd < best[v] and nd < reach(v):
                best[v] = nd; owner[v] = si
                heapq.heappush(pq, (nd, v, si, w))
    owned = (owner[1:] >= 0).sum()
    print('owned locations', owned, 'of', L)
    # ---------------- demography ----------------
    demo = load_json(os.path.join(ROOT, 'data', 'history', str(YEAR), 'demography.json')) or load_json(os.path.join(ROOT, 'data', 'history', '1356', 'demography.json'))
    culture = [None] * L; faith = [None] * L; dens = np.zeros(L); minority = [None] * L
    if demo and demo.get('anchors'):
        an = demo['anchors']
        ax, ay = lonlat_to_px_np([a['lon'] for a in an], [a['lat'] for a in an])
        t = cKDTree(np.stack([ax, ay], 1))
        dd, jj = t.query(np.stack([lx, ly], 1), k=3)
        for i in range(L):
            a = an[jj[i, 0]]
            culture[i] = a['culture']; faith[i] = a['faith']
            # density: inverse-distance blend of the 3 nearest anchors
            wts = 1.0 / np.maximum(dd[i], 1.0) ** 2
            dens[i] = float(sum(an[j].get('density', 5) * wv for j, wv in zip(jj[i], wts)) / wts.sum())
            mins = a.get('minorities') or []
            if mins:
                m = max(mins, key=lambda m: m.get('share', 0))
                minority[i] = [m.get('culture') or a['culture'], m.get('faith') or a['faith'], float(m.get('share', 0.1))]
    for i in range(L):
        si = owner[i + 1]
        if culture[i] is None:
            if si >= 0:
                culture[i] = states[si]['culture']; faith[i] = states[si]['faith']
            else:
                culture[i] = 'unknown'; faith[i] = 'african_traditional' if lat[i] < 20 and lon[i] > -20 else 'american_traditional'
        if dens[i] == 0:
            dens[i] = 12 if si >= 0 else 1.5
    # ---------------- climate, terrain ----------------
    desert_p = np.load(os.path.join(STAGE, 'desert_poly.npy')); imp_p = np.load(os.path.join(STAGE, 'impassable_poly.npy'))
    marsh_p = np.load(os.path.join(STAGE, 'marsh_poly.npy')); fb = np.load(os.path.join(STAGE, 'forest_bias.npy'))
    N = L + S + 1
    def frac(mask):
        return ndimage.mean(mask.astype(np.float32), labels=ids, index=np.arange(1, L + 1))
    fdes = frac(desert_p); fimp = frac(imp_p); fmar = frac(marsh_p); ffb = ndimage.mean(fb, labels=ids, index=np.arange(1, L + 1))
    temp, arid = climate(lon, lat, elev)
    terrain = []
    forest_cover = np.zeros(L)
    for i in range(L):
        T, A = temp[i], arid[i]
        if fimp[i] > 0.5 or (fdes[i] > 0.5 and dens[i] < 0.3) or (lat[i] > 60 and lon[i] < -15 and elev[i] > 500):
            t = 'wasteland'
        elif emax[i] > 2300 or (elev[i] > 1200 and rough[i] > 220) or rough[i] > 420:
            t = 'mountains'
        elif fmar[i] > 0.35:
            t = 'marsh'
        elif A > 0.85 or fdes[i] > 0.4:
            t = 'desert'
        elif T > 23 and A < 0.35 and (lat[i] < 15):
            t = 'jungle'
        elif T < -1.5:
            t = 'tundra'
        elif elev[i] > 450 or rough[i] > 130:
            t = 'hills'
        elif A > 0.55:
            t = 'steppe'
        else:
            # forest vs open farmland: humid temperate land is forested unless people cleared it (density)
            humid = 1 - A
            fc = np.clip(humid * 1.15 - dens[i] / 32.0 + ffb[i] * 0.6, 0, 1)
            if lat[i] > 58: fc = min(1, fc + 0.25)
            forest_cover[i] = fc
            t = 'forest' if fc > 0.55 else ('farmland' if dens[i] > 14 else 'plains')
        if t in ('hills', 'mountains'):
            forest_cover[i] = float(np.clip((1 - A) * 0.9 - dens[i] / 50 + ffb[i] * 0.5, 0, 1))
        terrain.append(t)
    # ---------------- resources ----------------
    res = assign_resources(L, lon, lat, terrain, coastal[1:], T=temp, A=arid, dens=dens, forest=forest_cover)
    # ---------------- population ----------------
    pop = np.zeros(L)
    tmul = {'wasteland': 0.02, 'mountains': 0.45, 'desert': 0.15, 'tundra': 0.25, 'marsh': 0.45, 'forest': 0.7, 'hills': 0.85, 'steppe': 0.6, 'jungle': 0.5, 'plains': 1.0, 'farmland': 1.15}
    for i in range(L):
        pop[i] = dens[i] * area[i] * tmul[terrain[i]]
        p0 = loc['pop'][i]
        if p0:
            try: pop[i] += float(p0)
            except Exception: pass
        else:
            sz = loc['size'][i] or 0
            pop[i] += [0, 400, 1500, 4000, 12000, 40000][min(5, sz)]
    # ---------------- names ----------------
    names = list(loc['name'][:L])
    used = set(n for n in names if n)
    for i in range(L):
        if not names[i]:
            names[i] = gen_name(culture[i], i, used, lon[i], lat[i]); used.add(names[i])
    # ---------------- output ----------------
    st_out = []
    for si, s in enumerate(states):
        o = dict(s)
        o['capital_loc'] = capital_loc[si]
        st_out.append(o)
    setup = {
        'year': YEAR,
        'states': st_out, 'wars': wars,
        'owner': [int(v) for v in owner[1:]],
        'culture': culture, 'faith': faith, 'minority': minority,
        'pop': [int(v) for v in pop], 'density': [round(float(v), 2) for v in dens],
    }
    json.dump(setup, open(os.path.join(OUT_DATA, f'setup_{YEAR}.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    if YEAR == 1356:
        world = {'terrain': terrain, 'resource': res, 'name': names, 'coastal': [bool(c) for c in coastal[1:]],
                 'temp': [round(float(v), 1) for v in temp], 'arid': [round(float(v), 2) for v in arid],
                 'forest': [round(float(v), 2) for v in forest_cover]}
        json.dump(world, open(os.path.join(OUT_DATA, 'world.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
        build_biome(ids, L, terrain, forest_cover, dens, desert_p, marsh_p, fb)
    from collections import Counter
    print('terrain', Counter(terrain).most_common())
    print('total pop (M)', round(pop.sum() / 1e6, 1), 'europe-ish', round(pop[((lon > -12) & (lon < 45) & (lat > 35))[:L]].sum() / 1e6, 1))

def climate(lon, lat, elev):
    lon = np.asarray(lon, float); lat = np.asarray(lat, float)
    alat = np.abs(lat)
    T = 27 - 0.55 * np.maximum(0, alat - 18) - 0.0065 * np.maximum(elev, 0)
    cont = np.where((lat > 40) & (lon > 12), (lon - 12) * 0.09, 0)
    T = T - np.minimum(cont, 6)
    A = np.full(lon.shape, 0.25)
    # Mediterranean summer drought
    med = (lat > 30) & (lat < 43.5) & (lon > -10) & (lon < 42)
    A = np.where(med, 0.45, A)
    # Pontic–Caspian & Central Asian steppe
    A = np.where((lat > 44) & (lat < 52.5) & (lon > 30) & (lon < 70), 0.62, A)
    A = np.where((lat > 35) & (lat <= 44.5) & (lon > 50) & (lon < 70), 0.82, A)
    A = np.where((lat > 46) & (lat < 49) & (lon > 19) & (lon < 22), 0.48, A)  # Hungarian puszta
    # Anatolian & Iranian plateaus
    A = np.where((lat > 37) & (lat < 40.5) & (lon > 30) & (lon < 41), 0.55, A)
    A = np.where((lat > 25) & (lat < 37) & (lon > 49) & (lon < 70), 0.78, A)
    # Sahara, Arabia, Syrian desert
    sah = (lat > 15.5) & (lat < 30.5) & (lon > -17) & (lon < 34)
    A = np.where(sah, 0.95, A)
    A = np.where((lat > 30.5) & (lat < 33) & (lon > -2) & (lon < 32), 0.75, A)
    A = np.where((lat > 12.5) & (lat < 31) & (lon > 34.5) & (lon < 60), 0.9, A)
    A = np.where((lat > 31) & (lat < 36) & (lon > 37.5) & (lon < 46), 0.8, A)
    # Maghreb coast & Levant coast wetter
    A = np.where((lat > 33) & (lat < 37.5) & (lon > -9) & (lon < 11) , 0.5, A)
    A = np.where((lat > 31) & (lat < 37) & (lon > 34) & (lon < 36.5), 0.5, A)
    # Yemen & Ethiopia highlands
    A = np.where((lat > 12.5) & (lat < 17) & (lon > 43) & (lon < 46), 0.5, A)
    # Sahel & savanna
    A = np.where((lat > 11) & (lat <= 15.5) & (lon > -17) & (lon < 40), 0.6, A)
    A = np.where((lat > 4) & (lat <= 11) & (lon > -17) & (lon < 40), 0.35, A)
    A = np.where((lat > -12) & (lat <= 4) & (lon > 8) & (lon < 30), 0.12, A)
    A = np.where((lat > -35) & (lat <= -12) & (lon > 12) & (lon < 40), 0.5, A)
    A = np.where((lat > -30) & (lat <= -17) & (lon > 11) & (lon < 22), 0.88, A)  # Namib/Kalahari
    # Americas
    A = np.where((lat > -15) & (lat < 6) & (lon > -80) & (lon < -44), 0.1, A)
    A = np.where((lat > 6) & (lat < 22) & (lon > -92) & (lon < -60), 0.25, A)
    A = np.where((lat > 20) & (lat < 33) & (lon > -100) & (lon < -98), 0.6, A)
    A = np.where((lat > 22) & (lat < 32) & (lon > -100) & (lon < -103), 0.75, A)
    A = np.where((lat > -12) & (lat < -3) & (lon > -42) & (lon < -35), 0.55, A)
    A = np.where((lat > -38) & (lat < -15) & (lon > -72) & (lon < -66), 0.8, A)
    A = np.where((lat > -38) & (lat < -30) & (lon > -66) & (lon < -57), 0.4, A)
    # Nile valley is irrigated: handled by demography density; keep arid but not wasteland
    return T, A

RES_POINTS = [
    # (good, lon, lat, radius_km) – historical deposits and specialised regions c.1356
    ('silver', 15.27, 49.95, 40), ('silver', 13.34, 50.92, 40), ('silver', 11.71, 47.35, 35), ('silver', 18.90, 48.45, 40),
    ('silver', 15.58, 49.40, 35), ('silver', 10.43, 51.89, 30), ('silver', 8.53, 39.31, 50), ('silver', 21.42, 42.73, 40),
    ('silver', 19.30, 44.10, 40), ('silver', 23.0, 48.0, 35), ('gold', 18.90, 48.67, 40), ('gold', 23.20, 46.20, 60),
    ('gold', -5.0, 12.0, 300), ('gold', -1.5, 6.5, 200), ('gold', 31.0, -19.0, 250),
    ('copper', 15.63, 60.60, 60), ('copper', 11.55, 51.60, 40), ('copper', 19.15, 48.73, 40), ('copper', 33.0, 35.0, 60),
    ('iron_ore', 14.90, 47.52, 50), ('iron_ore', 15.0, 59.9, 120), ('iron_ore', -2.9, 43.3, 70), ('iron_ore', 11.9, 49.45, 50),
    ('iron_ore', 7.8, 51.2, 50), ('iron_ore', 9.6, 45.9, 50), ('iron_ore', 2.0, 42.3, 50), ('iron_ore', 31.6, 61.5, 150),
    ('tin', -5.0, 50.3, 70), ('tin', 13.0, 50.6, 40),
    ('salt', 13.65, 47.56, 30), ('salt', 13.09, 47.68, 30), ('salt', 12.88, 47.72, 25), ('salt', 10.41, 53.25, 30), ('salt', 20.05, 49.98, 35),
    ('salt', -2.0, 47.0, 60), ('salt', -8.9, 38.5, 50), ('salt', 6.3, 46.8, 50), ('salt', 24.0, 47.0, 80), ('salt', -2.2, 53.2, 40),
    ('salt', -10.0, 23.0, 250), ('salt', 34.5, 46.2, 80), ('salt', 18.0, 49.95, 25),
    ('alum', 26.75, 38.65, 60), ('alum', 11.95, 42.15, 30),
    ('fish', 12.9, 55.4, 120), ('fish', 13.5, 68.2, 180), ('fish', 4.5, 52.5, 100), ('fish', -4.0, 57.5, 120), ('fish', 5.5, 61.0, 160),
    ('furs', 40.0, 62.0, 700), ('furs', 31.0, 58.5, 200), ('furs', 55.0, 60.0, 500), ('furs', -70.0, 50.0, 1000),
    ('wool', -1.5, 52.5, 250), ('wool', -4.5, 40.5, 300), ('wool', -3.5, 55.5, 120), ('wool', 13.0, 41.8, 120),
    ('grapes', -0.6, 44.85, 120), ('grapes', 4.5, 47.0, 90), ('grapes', 4.0, 49.1, 50), ('grapes', 7.5, 50.0, 90), ('grapes', 11.2, 43.5, 120),
    ('grapes', -8.0, 41.2, 80), ('grapes', 16.5, 48.4, 60), ('grapes', 21.4, 48.2, 50), ('grapes', 23.0, 38.0, 200), ('grapes', 3.5, 43.6, 120),
    ('grapes', -3.0, 39.0, 220), ('grapes', 14.5, 41.0, 150), ('grapes', 33.0, 34.9, 80),
    ('olives', -4.5, 37.5, 200), ('olives', 16.5, 40.8, 160), ('olives', 22.5, 37.5, 200), ('olives', 10.0, 35.5, 150), ('olives', 36.0, 34.0, 150), ('olives', 13.5, 37.5, 100),
    ('silk', 10.5, 43.85, 60), ('silk', 15.0, 37.8, 80), ('silk', -1.0, 37.5, 80), ('silk', 49.5, 37.3, 120), ('silk', 36.5, 35.0, 120), ('silk', 29.0, 40.2, 60),
    ('cotton', 37.2, 36.2, 150), ('cotton', 31.0, 30.5, 200), ('cotton', 33.0, 35.0, 80), ('cotton', 55.0, 38.0, 250),
    ('sugarcane', 33.0, 35.0, 80), ('sugarcane', 31.2, 30.5, 150), ('sugarcane', 13.5, 37.9, 60), ('sugarcane', -0.4, 38.8, 60),
    ('dyes', 4.8, 43.9, 80), ('dyes', 10.5, 50.9, 70), ('dyes', 1.6, 43.6, 80),
    ('horses', 36.0, 48.0, 400), ('horses', 19.8, 47.0, 120), ('horses', -5.5, 37.5, 120), ('horses', 45.0, 47.0, 400), ('horses', 3.0, 34.5, 300),
    ('amber', 20.3, 54.8, 80), ('honey', 25.0, 54.5, 300), ('honey', 37.0, 55.0, 400),
    ('saltpeter', 15.5, 49.8, 120), ('saltpeter', 48.0, 31.5, 200),
    ('stone', 2.4, 48.5, 60), ('stone', 10.1, 44.07, 30),
    ('spices', 43.5, 13.0, 200), ('coffee', 43.7, 14.5, 140),
    ('cotton', -88.0, 20.0, 400), ('cotton', -75.0, -10.0, 400), ('tobacco', -78.0, 21.0, 600), ('sugarcane', -70.0, 19.0, 400),
]

def assign_resources(L, lon, lat, terrain, coastal, T, A, dens, forest):
    pts = np.array([[p[1], p[2]] for p in RES_POINTS])
    out = []
    for i in range(L):
        t = terrain[i]
        # nearest specific deposit
        d = np.sqrt(((pts[:, 0] - lon[i]) * np.cos(np.radians(lat[i]))) ** 2 + (pts[:, 1] - lat[i]) ** 2) * 111
        k = int(np.argmin(d / np.array([p[3] for p in RES_POINTS])))
        h = int(hashlib.md5(f'{i}'.encode()).hexdigest()[:6], 16) / 0xFFFFFF
        if d[k] < RES_POINTS[k][3] and h < 0.65:
            out.append(RES_POINTS[k][0]); continue
        if t == 'wasteland': out.append('salt' if h < 0.1 else 'stone'); continue
        if coastal[i] and h < 0.28: out.append('fish'); continue
        if t == 'mountains': out.append(['stone', 'iron_ore', 'livestock', 'timber', 'copper'][int(h * 5)]); continue
        if t == 'hills': out.append(['livestock', 'wool', 'grapes' if T[i] > 9 and A[i] < 0.6 else 'stone', 'iron_ore', 'timber'][int(h * 5)]); continue
        if t == 'forest': out.append(['timber', 'timber', 'furs' if lat[i] > 52 else 'honey', 'livestock'][int(h * 4)]); continue
        if t == 'tundra': out.append('furs' if h < 0.6 else 'fish'); continue
        if t == 'marsh': out.append(['fish', 'livestock', 'salt'][int(h * 3)]); continue
        if t == 'steppe': out.append(['horses', 'livestock', 'wool', 'grain'][int(h * 4)]); continue
        if t == 'desert': out.append(['livestock', 'salt', 'horses'][int(h * 3)]); continue
        if t == 'jungle': out.append(['timber', 'dyes', 'spices' if lon[i] > 0 else 'cotton'][int(h * 3)]); continue
        # plains / farmland
        if T[i] > 14 and A[i] > 0.35 and h < 0.35: out.append('olives' if lon[i] > -10 else 'cotton'); continue
        if lat[i] > 47 and lat[i] < 60 and h < 0.3: out.append('flax'); continue
        out.append(['grain', 'grain', 'grain', 'livestock', 'wool'][int(h * 5)])
    return out

SYL = {
    'german': (['Al', 'Bern', 'Eber', 'Hohen', 'Wald', 'Ober', 'Nieder', 'Rot', 'Schön', 'Lich', 'Ried', 'Hart', 'Wolf', 'Mar', 'Gun', 'Otten', 'Hilde', 'Reichen', 'Stein', 'Ell'],
               ['dorf', 'heim', 'bach', 'hausen', 'burg', 'feld', 'stadt', 'rode', 'au', 'berg', 'ingen', 'stein', 'walde', 'hofen']),
    'gallic': (['Ville', 'Mont', 'Beau', 'Saint-Ger', 'Châtel', 'Ro', 'Ber', 'Fon', 'Mar', 'Belle', 'Cor', 'Ver', 'Sau', 'Aur'],
               ['ville', 'court', 'mont', 'ac', 'y', 'ières', 'eux', 'ay', 'igny', 'ens', 'ois']),
    'iberian': (['Villa', 'Torre', 'Val', 'Fuen', 'Al', 'Castro', 'Mon', 'Ri', 'San', 'Medina', 'Ara', 'Bena'],
                ['real', 'franca', 'mayor', 'dolid', 'cázar', 'verde', 'nueva', 'ejo', 'illa', 'osa', 'ena']),
    'italian': (['Castel', 'Monte', 'San', 'Villa', 'Borgo', 'Roc', 'Val', 'Ponte', 'Cas', 'Ter', 'Fio'],
                ['nuovo', 'franco', 'alto', 'ana', 'ello', 'one', 'ano', 'ina', 'occhio', 'aro']),
    'west_slavic': (['Bro', 'Dob', 'Kra', 'Lub', 'Pr', 'Sob', 'Wol', 'Zab', 'Chot', 'Nov', 'Bel', 'Star', 'Hrad'],
                    ['ice', 'ów', 'ina', 'ec', 'any', 'ov', 'ín', 'ice', 'nik', 'sko']),
    'east_slavic': (['Bel', 'Gor', 'Kras', 'Nov', 'Ol', 'Sem', 'Star', 'Vol', 'Zar', 'Ples', 'Dub', 'Lyub', 'Rad'],
                    ['ovo', 'sk', 'ets', 'ino', 'gorod', 'itsy', 'any', 'ichi', 'evo', 'ograd']),
    'south_slavic': (['Bel', 'Gor', 'Kru', 'Nov', 'Ra', 'Slav', 'Vel', 'Zla', 'Pri', 'Dra', 'Stu'],
                     ['ac', 'ovo', 'ica', 'ište', 'evo', 'grad', 'jane', 'ina']),
    'baltic': (['Ker', 'Pa', 'Rag', 'Tel', 'Vil', 'Ža', 'Gir', 'Lau', 'Mer', 'Dar'], ['ai', 'iai', 'ava', 'ėnai', 'upis', 'ys', 'iškis']),
    'finnic': (['Ka', 'Lah', 'Mus', 'Pih', 'Rau', 'Sal', 'Tai', 'Vil', 'Kok', 'Jär'], ['la', 'koski', 'järvi', 'mäki', 'salo', 'nen', 'pää']),
    'norse': (['Ås', 'Ber', 'Dal', 'Fjell', 'Hol', 'Lund', 'Sand', 'Ström', 'Vik', 'Tor', 'Bjør'], ['by', 'stad', 'vik', 'sund', 'heim', 'holm', 'ås', 'rud']),
    'british': (['Ash', 'Brad', 'Chad', 'Hart', 'Kings', 'Lang', 'Mar', 'Nor', 'Stan', 'Wey', 'Bal', 'Kil', 'Dun'],
                ['ton', 'ford', 'ley', 'bury', 'ham', 'wick', 'by', 'field', 'more', 'ock']),
    'low_lands': (['Ber', 'Dor', 'Hol', 'Mid', 'Oost', 'Zuid', 'Wes', 'Bre', 'Gro'], ['dam', 'drecht', 'hem', 'kerke', 'zele', 'wijk', 'gem', 'loo', 'sum']),
    'carpathian': (['Bé', 'Fel', 'Ke', 'Sze', 'Tö', 'Vár', 'Al', 'Ne', 'Ho', 'Mi'], ['falva', 'háza', 'egyháza', 'telek', 'vár', 'eni', 'ești', 'hely']),
    'hellenic': (['Agio', 'Kali', 'Neo', 'Pala', 'Ka', 'Me', 'Lith', 'Ther'], ['khori', 'polis', 'kastro', 'ni', 'ada', 'one', 'ia']),
    'turkic': (['Ak', 'Kara', 'Kızıl', 'Yeni', 'Ulu', 'Eski', 'Sarı', 'Kum', 'Bey', 'Ala'], ['köy', 'hisar', 'su', 'pınar', 'kent', 'tepe', 'çay', 'ova', 'dağ']),
    'arab': (['Al-', 'Bir ', 'Dar ', 'Kafr ', 'Tell ', 'Wadi ', 'Ain ', 'Qasr ', 'Ras '], ['Hamra', 'Kabir', 'Qadim', 'Nakhl', 'Bayda', 'Sharqi', 'Gharbi', 'Rumman', 'Zaytun', 'Jadid']),
    'berber': (['Ait ', 'Tizi ', 'Tala ', 'Igh', 'Tin', 'Agadir '], ['Ouzzal', 'Ifri', 'Amlal', 'Ouzou', 'Ghir', 'Tazert', 'Iminen']),
    'iranian': (['Deh', 'Kuh', 'Shah', 'Bagh', 'Ab', 'Chah', 'Ruz', 'Kal'], ['abad', 'an', 'shahr', 'deh', 'gerd', 'rud', 'sar']),
    'caucasian': (['Mtsk', 'Tsi', 'Ani', 'Ga', 'Vard', 'Kar', 'Ale'], ['eti', 'shen', 'avan', 'uri', 'kert', 'ani']),
}

CULT_GROUP = {}
for grp, members in {
    'british': 'english scottish irish welsh', 'gallic': 'french occitan breton picard burgundian_fr',
    'iberian': 'castilian portuguese galician catalan aragonese basque', 'low_lands': 'flemish hollandic frisian',
    'german': 'low_saxon central_german bavarian alemannic franconian rhinelander prussian_german ashkenazi',
    'italian': 'tuscan lombard venetian ligurian neapolitan sicilian sardinian roman',
    'west_slavic': 'czech slovak polish silesian sorbian pomeranian', 'east_slavic': 'russian ruthenian novgorodian',
    'south_slavic': 'croatian serbian bosnian bulgarian slovene', 'baltic': 'lithuanian latvian old_prussian samogitian',
    'finnic': 'finnish estonian karelian sami mordvin komi', 'norse': 'swedish danish norwegian icelandic',
    'carpathian': 'hungarian vlach szekely', 'hellenic': 'greek albanian', 'caucasian': 'armenian georgian circassian',
    'turkic': 'anatolian_turkish turkmen tatar bashkir crimean azeri kipchak_nomad mongol',
    'arab': 'maghrebi egyptian_arab levantine iraqi_arab bedouin hejazi yemeni andalusi sephardi',
    'berber': 'berber tuareg guanche', 'iranian': 'persian kurdish lur baluch',
}.items():
    for m in members.split(): CULT_GROUP[m] = grp

def gen_name(cult, i, used, lo, la):
    grp = CULT_GROUP.get(cult)
    h = int(hashlib.md5(f'{cult}-{i}'.encode()).hexdigest(), 16)
    if grp is None:
        # peoples outside the European naming sets: describe the district neutrally
        return None or f"{'Upland' if h % 2 else 'Lowland'} district {i % 997}"
    a, b = SYL[grp]
    for k in range(20):
        nm = a[(h >> (k * 3)) % len(a)] + b[(h >> (k * 5 + 7)) % len(b)]
        if nm not in used: return nm
    return nm + f' {i % 97}'

def build_biome(ids, L, terrain, forest, dens, desert_p, marsh_p, fb):
    """RGBA biome texture at half resolution: R terrain class, G forest density, B cultivation, A snow-proneness."""
    tix = np.zeros(ids.max() + 1, np.uint8); fo = np.zeros(ids.max() + 1, np.float32); cu = np.zeros(ids.max() + 1, np.float32)
    for i in range(L):
        tix[i + 1] = TERRAINS.index(terrain[i]) + 1
        fo[i + 1] = forest[i]; cu[i + 1] = min(1.0, dens[i] / 30.0) if terrain[i] not in ('wasteland', 'desert', 'tundra') else 0
    small = ids[::2, ::2]
    R = tix[small]
    # smooth forest/cultivation fields across location borders and add organic noise
    G = ndimage.gaussian_filter(fo[small], 2.0)
    B = ndimage.gaussian_filter(cu[small], 2.0)
    rng = np.random.default_rng(7)
    nz = ndimage.gaussian_filter(rng.standard_normal(G.shape).astype(np.float32), 3.0)
    nz /= (nz.std() + 1e-6)
    G = np.clip(G + nz * 0.18, 0, 1)
    B = np.clip(B - nz * 0.1, 0, 1)
    hgt = np.load(os.path.join(STAGE, 'height.npy'))[::2, ::2]
    A = np.clip(hgt / 3500.0, 0, 1)
    img = np.stack([R, (G * 255).astype(np.uint8), (B * 255).astype(np.uint8), (A * 255).astype(np.uint8)], -1)
    Image.fromarray(img, 'RGBA').save(os.path.join(OUT_PUBLIC, 'biome.png'), optimize=True)

if __name__ == '__main__':
    main()
