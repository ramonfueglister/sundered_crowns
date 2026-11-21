"""Stage D: historical 1356 setup baked onto the map.

- merges the researched state files (data/history/<year>/*.json)
- assigns every location to a state (weighted multi-source Dijkstra from each state's researched anchor places),
  then applies the researched corrections of data/history/<year>/borders.json (tools/map/borders.py)
- culture, faith, minority and population density per location (data/history/1356/demography.json)
- climate, terrain and natural resources per location
- names unnamed rural locations with culture-appropriate district names
- writes data/map/setup_<year>.json, data/map/world.json (static per-location data) and public/map/biome.png
"""

import contextlib
import glob
import heapq
import json
import math
import os
import sys
from pathlib import Path

import numpy as np
from climate import climate
from common import CACHE, OUT_DATA, OUT_PUBLIC, ROOT, H, W, km_per_px, load_json, lonlat_to_px, lonlat_to_px_np
from district_names import gen_name
from PIL import Image
from resources import assign_resources
from scipy import ndimage
from scipy.spatial import cKDTree

STAGE = os.path.join(CACHE, 'stage')
YEAR = int(sys.argv[1]) if len(sys.argv) > 1 else 1356

ALIASES = {
    'bavaria': 'bavaria_upper',
    'chobanids': 'chobanid',
    'holy_roman_empire': 'bohemia',
    'knights_hospitaller': 'hospitallers',
    'mamluks': 'mamluk',
    'marinids': 'marinid',
    'ottomans': 'ottoman',
    'trier': 'archbishopric_trier',
}

OUTPOST_KM = 45  # reach of an anchor marked 'outpost': true

TERRAINS = [
    'plains',
    'farmland',
    'forest',
    'hills',
    'mountains',
    'marsh',
    'steppe',
    'desert',
    'jungle',
    'tundra',
    'wasteland',
]


def load_states():
    files = sorted(glob.glob(os.path.join(ROOT, 'data', 'history', str(YEAR), '*.json')))
    states = {}
    wars = []
    order = []
    for f in files:
        d = json.loads(Path(f).read_text(encoding='utf-8'))
        if 'states' not in d:
            continue
        prefer = 'empire' in os.path.basename(f)
        for s in d['states']:
            sid = s['id']
            if sid in states and not prefer:
                continue
            if sid not in states:
                order.append(sid)
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
        if s['overlord'] == s['id']:
            s['overlord'] = None
    for w in wars:
        w['attackers'] = [y for y in (fix(v) for v in w.get('attackers', [])) if y]
        w['defenders'] = [y for y in (fix(v) for v in w.get('defenders', [])) if y]
    wars = [w for w in wars if w['attackers'] and w['defenders']]
    return [states[i] for i in order], wars


def main():
    geo = json.loads(Path(os.path.join(OUT_DATA, 'geo.json')).read_text(encoding='utf-8'))
    L, S = geo['L'], geo['S']
    loc = geo['loc']
    lx = np.array(loc['x'])
    ly = np.array(loc['y'])
    lon = np.array(loc['lon'])
    lat = np.array(loc['lat'])
    area = np.array(loc['area'])
    elev = np.array(loc['elev'], float)
    rough = np.array(loc['rough'], float)
    emax = np.array(loc['emax'], float)
    ids = np.load(os.path.join(STAGE, 'ids.npy'))
    # adjacency (land graph with distances)
    adj = [[] for _ in range(L + S + 1)]
    coastal = np.zeros(L + 1, bool)
    for a, b, kind, _c, _rf in geo['edges']:
        adj[a].append(b)
        adj[b].append(a)
        if kind == 1:
            coastal[min(a, b)] = True
    for a, b, _nm in geo['straits']:
        adj[a].append(b)
        adj[b].append(a)
    states, wars = load_states()
    print('states', len(states), 'wars', len(wars))

    # ---------------- ownership ----------------
    def loc_at(lo, la):
        x, y = lonlat_to_px(lo, la)
        xi, yi = int(x), int(y)
        if not (0 <= xi < W and 0 <= yi < H):
            return 0
        v = ids[yi, xi]
        if 1 <= v <= L:
            return int(v)
        # nearest land within 10 px
        for r in range(1, 12):
            win = ids[max(0, yi - r) : yi + r + 1, max(0, xi - r) : xi + r + 1]
            m = (win >= 1) & (win <= L)
            if m.any():
                vals = win[m]
                return int(np.bincount(vals).argmax())
        return 0

    rank_w = {
        'free_city': 2.6,
        'lordship': 1.5,
        'county': 1.25,
        'prince_bishopric': 1.35,
        'archbishopric': 1.3,
        'landgraviate': 1.1,
        'margraviate': 1.05,
        'principality': 1.1,
        'duchy': 1.0,
        'grand_duchy': 0.85,
        'kingdom': 0.8,
        'empire': 0.75,
        'khanate': 0.7,
        'sultanate': 0.85,
        'republic': 1.2,
        'order': 1.0,
        'tribe': 1.0,
        'chiefdom': 1.2,
        'emirate': 1.0,
        'beylik': 1.0,
        'despotate': 1.0,
    }
    INF = 1e18
    best = np.full(L + 1, INF)
    owner = np.full(L + 1, -1, np.int32)
    pq = []
    capital_loc = []
    weights = []
    for _si, s in enumerate(states):
        w = rank_w.get(s.get('rank'), 1.0)
        if s.get('government') in ('nomadic_horde',):
            w *= 0.7
        weights.append(w)
        # the land location named after the seat, when there is one nearby (a lagoon city such as Venice lies on the
        # water, and the nearest land would be a neighbour's)
        cn = s['capital'].get('name')
        cl = 0
        if cn:
            cx, cy = lonlat_to_px(s['capital']['lon'], s['capital']['lat'])
            same = [i + 1 for i in range(L) if loc['name'][i] == cn and (lx[i] - cx) ** 2 + (ly[i] - cy) ** 2 < 40**2]
            if same:
                cl = min(same, key=lambda v: (lx[v - 1] - cx) ** 2 + (ly[v - 1] - cy) ** 2)
        if not cl:
            cl = loc_at(s['capital']['lon'], s['capital']['lat'])
        if not cl:  # seat outside the land raster window: take the nearest land location centre
            cx, cy = lonlat_to_px(s['capital']['lon'], s['capital']['lat'])
            cl = int(np.argmin((lx[:L] - cx) ** 2 + (ly[:L] - cy) ** 2)) + 1
        capital_loc.append(cl)
    # Two seats on one location (a free city and its bishop, a county town and its overlord): the realm
    # with more researched holdings keeps it, the other moves to the nearest free neighbouring location.
    by_loc = {}
    for si in range(len(states)):
        by_loc.setdefault(capital_loc[si], []).append(si)
    taken = set(capital_loc)
    for l, sis in by_loc.items():
        if len(sis) < 2:
            continue
        sis.sort(key=lambda si: -len(states[si].get('holdings') or []))
        for si in sis[1:]:
            seen = {l}
            frontier = [l]
            new = 0
            for _ in range(4):
                nxt = []
                for u in frontier:
                    for v in adj[u]:
                        if v > L or v in seen:
                            continue
                        seen.add(v)
                        nxt.append(v)
                cand = [v for v in nxt if v not in taken]
                if cand:
                    cx, cy = lonlat_to_px(states[si]['capital']['lon'], states[si]['capital']['lat'])
                    new = min(cand, key=lambda v: (lx[v - 1] - cx) ** 2 + (ly[v - 1] - cy) ** 2)
                    break
                frontier = nxt
            if new:
                print(
                    '  seat moved:', states[si]['id'], 'shares', states[sis[0]]['id'], '->', loc['name'][new - 1] or new
                )
                capital_loc[si] = new
                taken.add(new)
    # Anchors in two passes: every capital first, so that a neighbour's holding that snaps onto the same
    # location (Pera onto Constantinople, a Habsburg town onto Basel) can never take a realm's seat.
    conflicts = []

    def anchor(si, p, l=None):
        if l is None:
            try:
                l = loc_at(float(p['lon']), float(p['lat']))
            except Exception:
                return
        if not l:
            return
        if best[l] > 0:
            best[l] = 0
            owner[l] = si
            # optional per-anchor reach limit (small coastal forts, trading posts): 'radius_km' or 'outpost': true
            rcap = float(p.get('radius_km') or (OUTPOST_KM if p.get('outpost') else math.inf))
            heapq.heappush(pq, (0.0, l, si, weights[si], rcap))
        elif owner[l] != si:
            conflicts.append((states[si]['id'], p.get('name'), states[owner[l]]['id']))

    for si, s in enumerate(states):
        anchor(si, s['capital'], capital_loc[si])
    for si, s in enumerate(states):
        for p in s.get('holdings') or []:
            anchor(si, p)
    print('anchor conflicts (holding dropped, location kept by first owner):', len(conflicts))
    for c in conflicts[:40]:
        print('  ', c)
    # Dijkstra over the land graph; cost = km * weight; max reach by region
    kmpp = km_per_px(lat)

    def reach(i):
        if lon[i - 1] < -30 or lat[i - 1] < 10:
            return 260
        if lon[i - 1] > 40 or lat[i - 1] < 30:
            return 420
        return 300

    while pq:
        d, u, si, w, rcap = heapq.heappop(pq)
        if d > best[u] or owner[u] != si:
            continue
        for v in adj[u]:
            if v > L:
                continue
            dx = lx[u - 1] - lx[v - 1]
            dy = ly[u - 1] - ly[v - 1]
            km = math.sqrt(dx * dx + dy * dy) * kmpp[u - 1]
            nd = d + km * w
            if nd < best[v] and nd < reach(v) and nd < rcap * w:
                best[v] = nd
                owner[v] = si
                heapq.heappush(pq, (nd, v, si, w, rcap))
    owned = (owner[1:] >= 0).sum()
    print('owned locations', owned, 'of', L)
    # ---------------- demography ----------------
    demo = load_json(os.path.join(ROOT, 'data', 'history', str(YEAR), 'demography.json')) or load_json(
        os.path.join(ROOT, 'data', 'history', '1356', 'demography.json')
    )
    culture = [None] * L
    faith = [None] * L
    dens = np.zeros(L)
    minority = [None] * L
    if demo and demo.get('anchors'):
        an = demo['anchors']
        ax, ay = lonlat_to_px_np([a['lon'] for a in an], [a['lat'] for a in an])
        t = cKDTree(np.stack([ax, ay], 1))
        dd, jj = t.query(np.stack([lx, ly], 1), k=3)
        for i in range(L):
            a = an[jj[i, 0]]
            culture[i] = a['culture']
            faith[i] = a['faith']
            # density: inverse-distance blend of the 3 nearest anchors
            wts = 1.0 / np.maximum(dd[i], 1.0) ** 2
            dens[i] = float(sum(an[j].get('density', 5) * wv for j, wv in zip(jj[i], wts)) / wts.sum())
            mins = a.get('minorities') or []
            if mins:
                m = max(mins, key=lambda m: m.get('share', 0))
                minority[i] = [
                    m.get('culture') or a['culture'],
                    m.get('faith') or a['faith'],
                    float(m.get('share', 0.1)),
                ]
    for i in range(L):
        si = owner[i + 1]
        if culture[i] is None:
            if si >= 0:
                culture[i] = states[si]['culture']
                faith[i] = states[si]['faith']
            else:
                culture[i] = 'unknown'
                faith[i] = 'african_traditional' if lat[i] < 20 and lon[i] > -20 else 'american_traditional'
        if dens[i] == 0:
            dens[i] = 12 if si >= 0 else 1.5
    # ---------------- climate, terrain ----------------
    desert_p = np.load(os.path.join(STAGE, 'desert_poly.npy'))
    imp_p = np.load(os.path.join(STAGE, 'impassable_poly.npy'))
    marsh_p = np.load(os.path.join(STAGE, 'marsh_poly.npy'))
    fb = np.load(os.path.join(STAGE, 'forest_bias.npy'))

    def frac(mask):
        return ndimage.mean(mask.astype(np.float32), labels=ids, index=np.arange(1, L + 1))

    fdes = frac(desert_p)
    fimp = frac(imp_p)
    fmar = frac(marsh_p)
    ffb = ndimage.mean(fb, labels=ids, index=np.arange(1, L + 1))
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
            # groves and gallery woods thin out gradually into the steppe instead of stopping at its edge
            forest_cover[i] = float(np.clip((0.68 - A) * 2.2 - dens[i] / 60 + ffb[i] * 0.5, 0, 0.3))
        else:
            # forest vs open farmland: humid temperate land is forested unless people cleared it (density)
            humid = 1 - A
            fc = np.clip(humid * 1.15 - dens[i] / 32.0 + ffb[i] * 0.6, 0, 1)
            if lat[i] > 58:
                fc = min(1, fc + 0.25)
            forest_cover[i] = fc
            t = 'forest' if fc > 0.55 else ('farmland' if dens[i] > 14 else 'plains')
        if t in ('hills', 'mountains'):
            forest_cover[i] = float(np.clip((1 - A) * 0.9 - dens[i] / 50 + ffb[i] * 0.5, 0, 1))
        terrain.append(t)
    # ---------------- resources ----------------
    res = assign_resources(L, lon, lat, terrain, coastal[1:], T=temp, A=arid, dens=dens, forest=forest_cover)
    # ---------------- population ----------------
    pop = np.zeros(L)
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
    for i in range(L):
        pop[i] = dens[i] * area[i] * tmul[terrain[i]]
        p0 = loc['pop'][i]
        if p0:
            with contextlib.suppress(Exception):
                pop[i] += float(p0)
        else:
            sz = loc['size'][i] or 0
            pop[i] += [0, 400, 1500, 4000, 12000, 40000][min(5, sz)]
    # ---------------- names ----------------
    names = list(loc['name'][:L])
    used = {n for n in names if n}
    for i in range(L):
        if not names[i]:
            names[i] = gen_name(culture[i], i, used, lon[i], lat[i])
            used.add(names[i])
    # ---------------- researched corrections of the holders (islands, where the spread is wrong) ----------------
    sys.path.insert(0, os.path.join(ROOT, 'tools', 'map'))
    import borders

    fixed = [int(v) for v in owner[1:]]
    borders.apply(fixed, [s['id'] for s in states], geo, names, YEAR)
    owner[1:] = fixed
    # ---------------- output ----------------
    st_out = []
    for si, s in enumerate(states):
        o = dict(s)
        o['capital_loc'] = capital_loc[si]
        st_out.append(o)
    setup = {
        'year': YEAR,
        'states': st_out,
        'wars': wars,
        'owner': [int(v) for v in owner[1:]],
        'culture': culture,
        'faith': faith,
        'minority': minority,
        'pop': [int(v) for v in pop],
        'density': [round(float(v), 2) for v in dens],
    }
    Path(os.path.join(OUT_DATA, f'setup_{YEAR}.json')).write_text(
        json.dumps(setup, ensure_ascii=False, separators=(',', ':'))
    )
    if YEAR == 1356:
        world = {
            'terrain': terrain,
            'resource': res,
            'name': names,
            'coastal': [bool(c) for c in coastal[1:]],
            'temp': [round(float(v), 1) for v in temp],
            'arid': [round(float(v), 2) for v in arid],
            'forest': [round(float(v), 2) for v in forest_cover],
        }
        Path(os.path.join(OUT_DATA, 'world.json')).write_text(
            json.dumps(world, ensure_ascii=False, separators=(',', ':'))
        )
        build_biome(ids, L, terrain, forest_cover, dens, desert_p, marsh_p, fb)
    from collections import Counter

    print('terrain', Counter(terrain).most_common())
    print(
        'total pop (M)',
        round(pop.sum() / 1e6, 1),
        'europe-ish',
        round(pop[((lon > -12) & (lon < 45) & (lat > 35))[:L]].sum() / 1e6, 1),
    )


def build_biome(ids, L, terrain, forest, dens, desert_p, marsh_p, fb):
    """RGBA biome texture at half resolution: R terrain class, G forest density, B cultivation, A snow-proneness."""
    tix = np.zeros(ids.max() + 1, np.uint8)
    fo = np.zeros(ids.max() + 1, np.float32)
    cu = np.zeros(ids.max() + 1, np.float32)
    for i in range(L):
        tix[i + 1] = TERRAINS.index(terrain[i]) + 1
        fo[i + 1] = forest[i]
        cu[i + 1] = min(1.0, dens[i] / 30.0) if terrain[i] not in ('wasteland', 'desert', 'tundra') else 0
    small = ids[::2, ::2]
    R = tix[small]
    # smooth forest/cultivation fields across location borders and add organic noise
    G = ndimage.gaussian_filter(fo[small], 2.0)
    B = ndimage.gaussian_filter(cu[small], 2.0)
    rng = np.random.default_rng(7)
    nz = ndimage.gaussian_filter(rng.standard_normal(G.shape).astype(np.float32), 3.0)
    nz /= nz.std() + 1e-6
    G = np.clip(G + nz * 0.18, 0, 1)
    B = np.clip(B - nz * 0.1, 0, 1)
    hgt = np.load(os.path.join(STAGE, 'height.npy'))[::2, ::2]
    A = np.clip(hgt / 3500.0, 0, 1)
    img = np.stack([R, (G * 255).astype(np.uint8), (B * 255).astype(np.uint8), (A * 255).astype(np.uint8)], -1)
    Image.fromarray(img, 'RGBA').save(os.path.join(OUT_PUBLIC, 'biome.png'), optimize=True)


if __name__ == '__main__':
    main()
