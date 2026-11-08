import os
"""data/history/1492/demography.json = the 1356 anchor set, updated for 1 January 1492."""
import json, copy
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')) + ''
d = json.load(open(f'{ROOT}/data/history/1356/demography.json', encoding='utf-8'))
an = copy.deepcopy(d['anchors'])

def at(lat, lon):
    m = [a for a in an if abs(a['lat'] - lat) < 0.005 and abs(a['lon'] - lon) < 0.005]
    assert len(m) == 1, (lat, lon, m); return m[0]

changed = 0
# 1. Lithuania (baptised 1387), Samogitia (1413) and the Old Prussians are Latin Christians by 1492.
for a in an:
    if a['faith'] == 'baltic_old' and a['culture'] in ('lithuanian', 'samogitian', 'old_prussian'):
        a['faith'] = 'latin'; changed += 1
    for m in a.get('minorities') or []:
        if m.get('faith') == 'baltic_old' and m.get('culture') in ('lithuanian', 'samogitian', 'old_prussian'):
            m['faith'] = 'latin'; changed += 1
    # merge duplicate minorities created by the change (e.g. old_prussian latin twice)
    if a.get('minorities'):
        seen = {}
        for m in a['minorities']:
            k = (m.get('culture'), m.get('faith'))
            if k == (a['culture'], a['faith']): continue
            if k in seen: seen[k]['share'] = round(seen[k]['share'] + m['share'], 2)
            else: seen[k] = m
        a['minorities'] = list(seen.values())
        if not a['minorities']: del a['minorities']

# 2. Ottoman Constantinople and Thrace (Ottoman since 1453 / 1360s): Turkish-Muslim majority, large Greek minority.
a = at(41.01, 28.98)
a.update(culture='anatolian_turkish', faith='sunni', density=70,
         minorities=[{'culture': 'greek', 'faith': 'orthodox', 'share': 0.3}, {'culture': 'armenian', 'faith': 'armenian_apostolic', 'share': 0.05},
                     {'culture': 'greek', 'faith': 'jewish', 'share': 0.08}, {'culture': 'ligurian', 'faith': 'latin', 'share': 0.03}])
for lat, lon, share in ((41.68, 26.56, 0.35), (41.57, 27.77, 0.4), (40.41, 26.67, 0.4)):
    a = at(lat, lon); a.update(culture='anatolian_turkish', faith='sunni', minorities=[{'culture': 'greek', 'faith': 'orthodox', 'share': share}])

# 3. Castilian conquests in the former Nasrid lands: Antequera 1410, Gibraltar 1462, Ronda 1485, Málaga 1487.
at(37.02, -4.56).update(culture='castilian', faith='latin', minorities=[{'culture': 'andalusi', 'faith': 'sunni', 'share': 0.15}])
at(36.14, -5.35).update(culture='castilian', faith='latin')
at(36.74, -5.17).update(culture='castilian', faith='latin', minorities=[{'culture': 'andalusi', 'faith': 'sunni', 'share': 0.4}])
# Baza, Guadix and Almería (Castilian since Dec 1489) keep their Mudéjar Muslim majority: unchanged.

# 4. Atlantic islands settled since 1356.
at(32.75, -16.95).update(density=15)                       # Madeira, settled from 1420
at(15.5, -24.0).update(density=1.5, minorities=[{'culture': 'wolof', 'faith': 'african_traditional', 'share': 0.4}])  # Santiago, from 1462
an += [
    {'lat': 37.75, 'lon': -25.67, 'culture': 'portuguese', 'faith': 'latin', 'density': 4.0},   # São Miguel, settled from 1439
    {'lat': 38.6, 'lon': -27.6, 'culture': 'portuguese', 'faith': 'latin', 'density': 2.0,
     'minorities': [{'culture': 'flemish', 'faith': 'latin', 'share': 0.2}]},                   # Terceira, Faial (Flemish settlers)
    {'lat': 29.0, 'lon': -13.7, 'culture': 'castilian', 'faith': 'latin', 'density': 1.5,
     'minorities': [{'culture': 'guanche', 'faith': 'latin', 'share': 0.3}]},                   # Lanzarote, Fuerteventura (from 1402)
    {'lat': 28.3, 'lon': -16.5, 'culture': 'guanche', 'faith': 'african_traditional', 'density': 3.0},  # Tenerife (conquered 1494–96)
    {'lat': 28.7, 'lon': -17.85, 'culture': 'guanche', 'faith': 'african_traditional', 'density': 2.0}, # La Palma (conquered 1492–93)
]
at(28.0, -15.6).update(culture='castilian', faith='latin', minorities=[{'culture': 'guanche', 'faith': 'latin', 'share': 0.45}])  # Gran Canaria, 1483

# 5. Densities: recovery from the plague of 1347–51 and its recurrences, by region (McEvedy & Jones; Livi Bacci).
BOX = [  # (lon0, lat0, lon1, lat1, factor) – first match wins
    (-11, 49.8, 2, 61, 0.95),     # British Isles: England lower c. 1490 than in the 1360s
    (4, 54, 32, 72, 1.05),        # Scandinavia, Finland
    (-10, 35.8, 4, 44, 1.1),      # Iberia
    (-5, 42, 8.2, 51.5, 1.05),    # France (war-ravaged until the 1450s)
    (2, 49.5, 8, 54, 1.15),       # Low Countries
    (6, 45.5, 17, 55.5, 1.15),    # Germany, Switzerland, Austria, Bohemia
    (6.5, 36.5, 19, 47.5, 1.1),   # Italy
    (14, 45, 30, 56, 1.3),        # Poland, Lithuania, Hungary
    (28, 50, 60, 66, 1.3),        # Muscovy, Novgorod lands
    (19, 34, 30, 45, 1.0),        # Balkans: Ottoman conquest wars
    (26, 35, 45, 42.5, 1.1),      # Anatolia
]
nd = 0
for a in an:
    for lo0, la0, lo1, la1, f in BOX:
        if lo0 <= a['lon'] <= lo1 and la0 <= a['lat'] <= la1:
            if a.get('density') and f != 1.0:
                a['density'] = round(a['density'] * f, 2); nd += 1
            break

out = {
    'year': 1492,
    'sources': d['sources'] + ['McEvedy & Jones, Atlas of World Population History (1978)', 'Livi Bacci, The Population of Europe (2000)',
                               'Inalcık, The Ottoman Empire: The Classical Age 1300–1600 (1973)', 'Ladero Quesada, Granada después de la conquista (1988)'],
    'new_ids': [], 'new_ids_detail': {'cultures': [], 'faiths': []},
    'notes': [
        'Derived from the 1356 set (same 1000 anchors plus 5 new ones on the Azores and Canaries), changed only where 1492 differs:',
        'Lithuanians, Samogitians and Old Prussians are Latin Christians (baptism of Lithuania 1387, Samogitia 1413).',
        'Constantinople and Thrace have a Turkish-Muslim majority with large Greek Orthodox minorities; Istanbul was repopulated by Mehmed II after 1453.',
        'Antequera, Gibraltar, Ronda and Málaga are Castilian-settled; Baza, Guadix and Almería keep their Mudéjar majority. Sephardi Jews are still present in Spain on 1 January 1492 (the Alhambra Decree is dated 31 March 1492).',
        'Madeira, the Azores, Cape Verde (with enslaved West Africans) and the conquered Canaries (Lanzarote, Fuerteventura, Gran Canaria) are settled; Tenerife and La Palma are still Guanche.',
        'Densities are scaled by region for the recovery from the plague: British Isles ×0.95, Scandinavia ×1.05, Iberia ×1.1, France ×1.05, Low Countries ×1.15, Germany/Bohemia/Austria ×1.15, Italy ×1.1, Poland/Lithuania/Hungary ×1.3, Muscovy ×1.3, Anatolia ×1.1; Balkans and the rest of the world unchanged.',
    ],
    'anchors': an,
}
json.dump(out, open(f'{ROOT}/data/history/1492/demography.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('anchors', len(an), 'faith changes', changed, 'density scaled', nd)
