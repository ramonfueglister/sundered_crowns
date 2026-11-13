import os
"""Compact DSL for writing data/history/1492/*.json.

S(...) builds a state; continuing states inherit name/short/adjective/colour/coa/culture/faith/rank/government
from their 1356 entry (inherit=True or inherit='<1356 id>').  Places are resolved to coordinates from the 1356
holdings, the gazetteer and the map's named locations; 'Name@lat,lon' gives explicit coordinates.
"""
import json, glob, math, os, sys, unicodedata
import numpy as np
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')) + '/tools/geo')
from common import lonlat_to_px, W, H

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')) + ''
OLD = {}
for f in sorted(glob.glob(f'{ROOT}/data/history/1356/*.json')):
    d = json.load(open(f, encoding='utf-8'))
    for s in d.get('states', []) or []:
        if s['id'] not in OLD or 'empire' in os.path.basename(f):
            OLD[s['id']] = s

def norm(n):
    n = unicodedata.normalize('NFKD', n).encode('ascii', 'ignore').decode().lower()
    return n.replace('-', ' ').replace('  ', ' ').strip()

IDX = {}   # norm name -> list of (lat, lon, source)
def _add(name, lat, lon, src):
    if not name: return
    IDX.setdefault(norm(name), []).append((float(lat), float(lon), src))
for s in OLD.values():
    for p in [s['capital']] + list(s.get('holdings') or []):
        try: _add(p['name'], p['lat'], p['lon'], '1356')
        except Exception: pass
for p in json.load(open(f'{ROOT}/data/content/gazetteer.json', encoding='utf-8'))['places']:
    _add(p['name'], p['lat'], p['lon'], 'gaz')
    if p.get('alt'):
        for a in str(p['alt']).split('/'): _add(a.strip(), p['lat'], p['lon'], 'gaz-alt')
_geo = json.load(open(f'{ROOT}/public/data/geo.json', encoding='utf-8'))
L = _geo['L']; _loc = _geo['loc']
for i in range(L):
    _add(_loc['name'][i], _loc['lat'][i], _loc['lon'][i], 'geo')
    if _loc['alt'][i]: _add(_loc['alt'][i], _loc['lat'][i], _loc['lon'][i], 'geo-alt')
IDS = np.load('/home/user/geo-cache/stage/ids.npy')

def loc_at(lo, la):
    x, y = lonlat_to_px(lo, la); xi, yi = int(x), int(y)
    if not (0 <= xi < W and 0 <= yi < H): return 0
    v = IDS[yi, xi]
    if 1 <= v <= L: return int(v)
    for r in range(1, 12):
        win = IDS[max(0, yi - r):yi + r + 1, max(0, xi - r):xi + r + 1]
        m = (win >= 1) & (win <= L)
        if m.any():
            return int(np.bincount(win[m]).argmax())
    return 0

def km(a, b):
    return math.hypot((a[1] - b[1]) * math.cos(math.radians((a[0] + b[0]) / 2)), a[0] - b[0]) * 111.2

WARN = []
def place(spec, near=None, sid='?'):
    spec = spec.strip()
    if '@' in spec:
        nm, c = spec.split('@'); la, lo = map(float, c.split(','))
        return {'name': nm.strip(), 'lat': round(la, 3), 'lon': round(lo, 3)}
    cands = IDX.get(norm(spec))
    if not cands:
        WARN.append(f'{sid}: UNRESOLVED {spec}')
        return None
    pri = {'1356': 0, 'gaz': 1, 'geo': 2, 'gaz-alt': 3, 'geo-alt': 4}
    if near is not None:
        best = min(cands, key=lambda c: (km((c[0], c[1]), near) > 400, pri[c[2]], km((c[0], c[1]), near)))
        if km((best[0], best[1]), near) > 1500: WARN.append(f'{sid}: FAR {spec} {km((best[0], best[1]), near):.0f}km')
    else:
        best = min(cands, key=lambda c: pri[c[2]])
    spread = max(km((c[0], c[1]), (best[0], best[1])) for c in cands)
    if spread > 60 and near is None: WARN.append(f'{sid}: AMBIG {spec} {len(cands)} spread {spread:.0f}km')
    return {'name': spec, 'lat': round(best[0], 3), 'lon': round(best[1], 3)}

def P(name, born, dyn, gov, sta, gen, traits='', female=False):
    return {'name': name, 'born': born, 'dynasty': dyn, 'female': female, 'skills': [gov, sta, gen], 'traits': traits.split() if traits else []}
def F(name, born, dyn, gov, sta, gen, traits=''):
    return P(name, born, dyn, gov, sta, gen, traits, True)
def COUNCIL(name='City council', sk=(3, 3, 1), traits='mercantile cautious'):
    return {'name': name, 'born': None, 'dynasty': None, 'female': False, 'skills': list(sk), 'traits': traits.split()}

def C(blazon, field, charges=(), division='plain', field2=None, ordinary=None, otinc=None):
    ch = []
    for c in charges:
        d = {'type': c[0], 'tincture': c[1], 'count': c[2] if len(c) > 2 else 1}
        if len(c) > 3 and c[3]: d['arrangement'] = c[3]
        if len(c) > 4: d['text'] = c[4]
        ch.append(d)
    return {'blazon': blazon, 'field': field, 'division': division, 'field2': field2, 'ordinary': ordinary, 'ordinary_tincture': otinc, 'charges': ch}

def ids(s):
    return [x for x in (s.split() if isinstance(s, str) else list(s)) if x]

USED_IDS = set()
def S(id, *, inherit=None, n=None, sh=None, adj=None, rank=None, gov=None, cult=None, faith=None, color=None, cap=None,
      hold='', ruler=None, heir=None, consort=None, note='', over=None, subj=None, emp=None, elec=False, allies='',
      rivals='', claims='', pers='opportunist', diff=3, en='', de='', coa=None, outposts=''):
    assert id not in USED_IDS, id
    USED_IDS.add(id)
    base = None
    if inherit:
        base = OLD[id if inherit is True else inherit]
    def pick(v, key):
        if v is not None: return v
        if base is not None and key in base: return base[key]
        raise ValueError(f'{id}: missing {key}')
    st = {'id': id}
    st['name'] = {'en': n[0], 'de': n[1]} if n else pick(None, 'name')
    st['short'] = {'en': sh[0], 'de': sh[1]} if sh else pick(None, 'short')
    st['adjective'] = {'en': adj[0], 'de': adj[1]} if adj else pick(None, 'adjective')
    st['rank'] = pick(rank, 'rank'); st['government'] = pick(gov, 'government')
    st['culture'] = pick(cult, 'culture'); st['faith'] = pick(faith, 'faith'); st['color'] = pick(color, 'color')
    if isinstance(cap, str) and base is not None and '@' not in cap and norm(base['capital']['name']) == norm(cap):
        capp = {'name': base['capital']['name'], 'lat': base['capital']['lat'], 'lon': base['capital']['lon']}
    else:
        capp = place(cap, None, id) if isinstance(cap, str) else cap
    if capp is None: raise ValueError(f'{id}: capital {cap}')
    near = (capp['lat'], capp['lon'])
    st['capital'] = capp
    hl = [capp]
    for h in [x for x in hold.split(';') if x.strip()]:
        p = place(h, near, id)
        if p and all(km((p['lat'], p['lon']), (q['lat'], q['lon'])) > 1 for q in hl): hl.append(p)
    for h in [x for x in outposts.split(';') if x.strip()]:
        p = place(h, near, id)
        if p:
            p['outpost'] = True; hl.append(p)
    st['holdings'] = hl
    st['ruler'] = ruler; st['heir'] = heir; st['consort'] = consort
    st['dynasty_note'] = note
    st['overlord'] = over; st['subject_type'] = (subj or 'vassal') if over else None
    st['empire_member'] = bool(emp if emp is not None else (base or {}).get('empire_member', False))
    st['elector'] = elec
    st['allies'] = ids(allies); st['rivals'] = ids(rivals); st['claims_on'] = ids(claims)
    st['personality'] = pers; st['difficulty'] = diff
    st['summary'] = {'en': en, 'de': de}
    st['coa'] = coa if coa is not None else pick(None, 'coa')
    return st

def WAR(en, de, att, dfn, since, goal='conquest'):
    return {'name': {'en': en, 'de': de}, 'attackers': ids(att), 'defenders': ids(dfn), 'since': since, 'goal': goal}

def write(region, sources, states, wars, new_ids=(), notes=()):
    out = {'region': region, 'year': 1492, 'date': '1492-01-01', 'sources': list(sources), 'new_ids': list(new_ids)}
    if notes: out['notes'] = list(notes)
    out['states'] = states; out['wars'] = wars
    path = f'{ROOT}/data/history/1492/{region}.json'
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(region, len(states), 'states', len(wars), 'wars ->', path)
    for w in WARN: print('  WARN', w)
    WARN.clear()
