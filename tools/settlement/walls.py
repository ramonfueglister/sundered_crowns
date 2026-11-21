"""The town walls of 1291 (settlement feature 6, docs/SETTLEMENT_DESIGN.md).

Writes src/sim/content/walls_1291.json:

  1. `towns`: the towns whose walled area of 1291 is known, with the walled and the settled hectares of Cesaretti,
     Lobo, Bettencourt, Ortman & Smith (2016), PLOS ONE 11(10): e0162678, appendix S2 (CC BY 4.0;
     data/history/1291/settlement/cesaretti_2016_s2_walled.csv, read out of S2 section S2.5 and its notes). Only a
     circuit that stood in 1291 counts (`stood_1291`): the great circuits of Ghent, Bruges, Norwich, Coventry, Great
     Yarmouth and Lucca came later. A town is matched by the dataset's name as src/sim/content/settled_area_1300.json
     matched it (`as`).
  2. `unwalled`: the towns that had no circuit of walls, with the source that says so.

Run: python3 tools/settlement/walls.py
"""

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'data' / 'history' / '1291' / 'settlement' / 'cesaretti_2016_s2_walled.csv'
AREA = ROOT / 'src' / 'sim' / 'content' / 'settled_area_1300.json'
CITIES = ROOT / 'src' / 'sim' / 'content' / 'cities_1291.json'
OUT = ROOT / 'src' / 'sim' / 'content' / 'walls_1291.json'
# the dataset spells it with a straight apostrophe, settled_area_1300.json with a typographic one
SPELLING = {"King's Lynn": 'King’s Lynn'}
UNWALLED = [
    (
        'Venice',
        'Gelichi (2016), Castles on the Water? Defences in Venice and Comacchio during the Early Middle Ages, in '
        'Christie & Herold (eds), Fortified Settlements in Early Medieval Europe, pp. 265, 268-269: very few '
        'fortifications in the lagoon up to the modern era; the wall of John the Deacon has no material evidence',
    ),
]


def main():
    sites = {t['as']: (t['site'], t['name']) for t in json.loads(AREA.read_text(encoding='utf-8'))['towns']}
    cities = {c['name']: c['site'] for c in json.loads(CITIES.read_text(encoding='utf-8'))['cities']}
    towns, missing = [], []
    with SRC.open(encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if r['stood_1291'] != 'yes':
                continue
            hit = sites.get(SPELLING.get(r['Settlement'], r['Settlement']))
            if not hit:
                missing.append(r['Settlement'])
                continue
            towns.append(
                {
                    'site': hit[0],
                    'name': hit[1],
                    'walled_ha': float(r['walled_ha']),
                    'settled_ha': float(r['settled_ha']),
                    'circuit': r['circuit'],
                    'source': r['source'],
                }
            )
    out = {
        'source': 'Cesaretti, Lobo, Bettencourt, Ortman & Smith (2016), PLOS ONE 11(10): e0162678, appendix S2 (CC BY 4.0)',
        'note': 'written by tools/settlement/walls.py from data/history/1291/settlement/cesaretti_2016_s2_walled.csv',
        'towns': sorted(towns, key=lambda t: t['site']),
        'unwalled': [{'site': cities[n], 'name': n, 'source': s} for n, s in UNWALLED],
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(
        f'{OUT.name}: {len(towns)} towns with a walled area of 1291, {len(UNWALLED)} unwalled; not in the world: {missing}'
    )


if __name__ == '__main__':
    main()
