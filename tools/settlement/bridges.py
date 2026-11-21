"""The bridges of 1291 known from the sources (settlement feature 7, docs/SETTLEMENT_DESIGN.md).

Writes src/sim/content/bridges_1291.json from data/history/1291/settlement/bridges_1291.csv, each row with its source:

  1. `named`: the bridges known by name in a town, what they were built of in 1291 (`stone`) and whether houses
     stood on them. A town's bridges known by name go to its widest crossings, in the order of the file
     (src/sim/systems/bridges.ts).
  2. `ferry`: the towns whose great river was crossed by ferry or on boats in 1291, not on a bridge.

A town is matched by its name in src/sim/content/cities_1291.json.

Run: python3 tools/settlement/bridges.py
"""

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'data' / 'history' / '1291' / 'settlement' / 'bridges_1291.csv'
CITIES = ROOT / 'src' / 'sim' / 'content' / 'cities_1291.json'
OUT = ROOT / 'src' / 'sim' / 'content' / 'bridges_1291.json'


def main():
    cities = {c['name']: c['site'] for c in json.loads(CITIES.read_text(encoding='utf-8'))['cities']}
    named, ferry = [], []
    with SRC.open(encoding='utf-8') as f:
        for r in csv.DictReader(f):
            site = cities[r['town']]
            if r['what'] == 'named':
                named.append(
                    {
                        'site': site,
                        'name': r['bridge'],
                        'stone': r['stone'] == 'yes',
                        'houses': r['houses'] == 'yes',
                        'source': r['source'],
                    }
                )
            elif r['what'] == 'ferry':
                ferry.append({'site': site, 'name': r['town'], 'source': r['source']})
            else:
                raise ValueError(f'{SRC.name}: unknown row {r["what"]!r}')
    out = {
        'source': 'see each row',
        'note': 'written by tools/settlement/bridges.py from data/history/1291/settlement/bridges_1291.csv',
        'named': named,
        'ferry': ferry,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{OUT.name}: {len(named)} bridges known by name, {len(ferry)} towns crossed by ferry')


if __name__ == '__main__':
    main()
