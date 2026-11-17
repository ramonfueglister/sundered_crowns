"""The settled area of the towns around 1300 (settlement feature 1, docs/SETTLEMENT_DESIGN.md).

Reads the 173 towns of Cesaretti, Lobo, Bettencourt, Ortman & Smith (2016), "Population-Area Relationship for Medieval
European Cities", PLOS ONE 11(10): e0162678, dataset S1 (CC BY 4.0;
data/history/1291/settlement/cesaretti_2016_s1.csv: inhabitants and settled area in hectares around 1300) and writes
src/sim/content/settled_area_1300.json:

  1. `law`: the least-squares line ln A = ln a + beta ln N through all 173 towns (A in hectares, N inhabitants), as the
     paper fits it (its Table 1 gives the pooled exponent 0.714);
  2. `towns`: for each of the 173 that is a town of the world of 1291 (src/sim/content/cities_1291.json), its
     inhabitants and hectares in the dataset, by the town's `site`. A town is matched by its name (ALIAS where the
     spellings differ) and must lie within MAX_KM of the dataset's point.

Run: python3 tools/history/1291/settled_area.py
"""
import csv, json, math, os, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SRC = os.path.join(ROOT, 'data', 'history', '1291', 'settlement', 'cesaretti_2016_s1.csv')
OUT = os.path.join(ROOT, 'src', 'sim', 'content', 'settled_area_1300.json')
MAX_KM = 30
# dataset spelling -> the name in cities_1291.json
ALIAS = {
    'London & Southwark': 'London', 'Chalons-sur-Marne': 'Châlons', 'Bruges': 'Brugge', 'Mechlin': 'Mechelen', 'Marseilles': 'Marseille',
    'Aix-en-Provence': 'Aix', 'Carcassone': 'Carcassonne', 'Clermont-Ferrand': 'Clermont', 'Mantova': 'Mantua', 'Milano': 'Milan',
    'Padova': 'Padua', 'Venezia': 'Venice', 'Reggio Emilia': 'Reggio', 'Firenze': 'Florence', 'Goerlitz': 'Görlitz', 'Hannover': 'Hanover',
    'Luebeck': 'Lübeck', 'Lueneburg': 'Lüneburg', 'Noerdlingen': 'Nördlingen', 'Nuernberg': 'Nuremberg', 'Wuerzburg': 'Würzburg',
    'Braunschweig': 'Brunswick', 'Muehlhausen': 'Mühlhausen', 'Koeln': 'Cologne', 'Muenster': 'Münster', 'Osnabrueck': 'Osnabrück',
}
# the dataset's point is not the town's: Bruges (45,000 inhabitants, urban system "France & Belgium") carries the
# coordinates of Bruges in the Gironde
WRONG_POINT = {'Bruges'}


def norm(s):
    s = unicodedata.normalize('NFD', s.lower().replace('ß', 'ss'))
    return ''.join(ch for ch in s if ch.isalpha())


def km(lat0, lon0, lat1, lon1):
    p = math.pi / 180
    return 6371 * math.hypot((lon1 - lon0) * p * math.cos((lat0 + lat1) / 2 * p), (lat1 - lat0) * p)


def fit(rows):
    """Ordinary least squares of ln A on ln N: prefactor a (hectares), exponent, its standard error, R²."""
    x = [math.log(r['people']) for r in rows]; y = [math.log(r['area_ha']) for r in rows]; n = len(x)
    mx, my = sum(x) / n, sum(y) / n
    sxx = sum((v - mx) ** 2 for v in x); sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
    beta = sxy / sxx; ln_a = my - beta * mx
    sse = sum((b - ln_a - beta * a) ** 2 for a, b in zip(x, y)); sst = sum((b - my) ** 2 for b in y)
    return {'a_ha': math.exp(ln_a), 'beta': beta, 'se_beta': math.sqrt(sse / (n - 2) / sxx), 'r2': 1 - sse / sst, 'n': n,
            'sd_ln': math.sqrt(sse / (n - 2))}


def main():
    rows = []
    for r in csv.DictReader(open(SRC, encoding='utf-8')):
        rows.append({'name': r['Settlement'].strip(), 'people': float(r['Pop']), 'area_ha': float(r['Area']),
                     'lat': float(r['latitude']) if r['latitude'] else None, 'lon': float(r['longitude']) if r['longitude'] else None,
                     'system': r['UrbanSytem'].strip()})
    law = fit(rows)
    cities = json.load(open(os.path.join(ROOT, 'src', 'sim', 'content', 'cities_1291.json'), encoding='utf-8'))['cities']
    by_name = {}
    for c in cities: by_name.setdefault(norm(c['name']), []).append(c)
    towns, missing = [], []
    for r in rows:
        cs = by_name.get(norm(ALIAS.get(r['name'], r['name'])), [])
        if r['lat'] is not None and r['name'] not in WRONG_POINT: cs = [c for c in cs if km(r['lat'], r['lon'], c['lat'], c['lon']) <= MAX_KM]
        if len(cs) != 1: missing.append(r['name']); continue
        towns.append({'site': cs[0]['site'], 'name': cs[0]['name'], 'as': r['name'], 'people': int(r['people']), 'area_ha': r['area_ha']})
    towns.sort(key=lambda t: t['site'])
    assert len({t['site'] for t in towns}) == len(towns), 'two towns of the dataset at one site'
    out = {
        'year': 1300,
        'source': 'Cesaretti, Lobo, Bettencourt, Ortman & Smith (2016), PLOS ONE 11(10): e0162678, dataset S1 (CC BY 4.0)',
        'note': 'written by tools/history/1291/settled_area.py; law: ln A = ln a_ha + beta ln N over the 173 towns (A settled '
                'hectares, N inhabitants); towns: the inhabitants and settled hectares the dataset gives for a town of '
                'src/sim/content/cities_1291.json (site = its index into data/content/gazetteer.json)',
        'law': {k: (v if k == 'n' else float(f'{v:.6g}')) for k, v in law.items()},
        'towns': towns,
    }
    with open(OUT, 'w', encoding='utf-8') as f: json.dump(out, f, ensure_ascii=False, indent=1); f.write('\n')
    print('law', out['law']); print(len(towns), 'towns matched;', len(missing), 'not in the world:', ', '.join(missing))


if __name__ == '__main__':
    main()
