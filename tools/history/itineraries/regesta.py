"""The journeys of the Roman-German kings 1273-1378 from the Regesta Imperii (data/history/itineraries/).

Every regest (a charter of the king, calendared) with one day and a place of issue is a day on which the king's
chancery, and as a rule the king, was at that place. Reads the CSV exports of the Regesta Imperii (CC BY 4.0,
https://gitlab.rlp.net/adwmainz/regesta-imperii/lab/regesta-imperii-data, data/), which a browser in the cloud cannot
fetch (the host is blocked there): a clone on another computer is read, and only this file's result is kept in the
repository.

    python3 tools/history/itineraries/regesta.py <clone>/data data/history/itineraries/regesta_imperii.json

Rules (nothing is invented):
- A king is a person of the chronicle of rulers by the Wikidata id (public/data/rulers_1291.json); Rudolf I. is not
  in it (he died in 1291 holding no realm of the map) and Albrecht I. is missing from the export (18 regesta).
- Only the regesta of the king's reign as king (the volume of the Regesta Imperii is ordered by it).
- Only the king's own acts: the volumes also calendar letters of others to or about the king (RI VIII: the popes,
  "Reichssachen", the queens; RI VI,4: letters of Clement V among Heinrich's), whose place of issue is not the
  king's. The column `title` names the part of the volume a regest stands in; a regest counts when it begins with the
  king's name ('Karl IV.', 'Karl IV. Nachträge.', but not 'Karls IV. Gemahlinnen.' or 'Clemens VI.'). Within the
  king's part, a letter dated by the year of the pontificate ("pontificatus nostri anno", the dating of papal
  letters) is the pope's and is left out, and so is a forgery (a regest number with "†" or "Fälschung").
- A regest whose day is a range, or whose place is missing or unknown ("...."), is left out.
- A place has the coordinates of the Regesta Imperii's own list of places (places/RI-Places.csv) or of its register
  (indexes/combined_all.csv), by the Wikidata id of the place of issue, else by the name; a place without them is left
  out and counted. Where the linked data of the Regesta (ri-lod/PlaceOfIssueWikidata.csv) names a place that its own
  list of places contradicts, the list wins (`CORRECTED`, each with the entry of the list).
- OWN RULE: where the regesta of one day name several places, the day goes to the place most of them name (ties: the
  first place in the order of the regesta), so that a day has one place; the sources read give no rule for this.
"""

import csv
import json
import re
import sys
from collections import Counter, defaultdict

csv.field_size_limit(10**9)

#: (Wikidata id in the chronicle, name, volume of the Regesta Imperii, the name the column `title` begins with in the
#: king's own part of the volume, first and last day of the reign as king)
KINGS = [
    ('Q160101', 'Adolf von Nassau', '06', 'Adolf', '1292-05-05', '1298-06-23'),
    ('Q153956', 'Albrecht I.', '06', 'Albrecht', '1298-06-24', '1308-05-01'),
    ('Q152717', 'Heinrich VII.', '06', 'Heinrich VII.', '1308-11-27', '1313-08-24'),
    ('Q57161', 'Ludwig IV. (der Bayer)', '07', 'Ludwig', '1314-10-20', '1347-10-11'),
    ('Q155669', 'Karl IV.', '08', 'Karl IV.', '1346-07-11', '1378-11-29'),
]
#: places of issue whose Wikidata id in ri-lod/PlaceOfIssueWikidata.csv the list of places contradicts, with the right
#: id: 'Tridenti' is linked to Triest (Q546), but the list names 'in Tridento', 'ap. civitatem Tridenti' and 'Trientum'
#: as Trient (Q3376, places/RI-Places.csv ID 10487 and 6780)
CORRECTED = {'Tridenti': 'Q3376'}
UNKNOWN_PLACE = {'', '-', '?', '....'}
PAPAL_DATING = re.compile(r'pontificatus', re.IGNORECASE)
QID = re.compile(r'Q\d+')


def number(text):
    try:
        return float(str(text).strip().replace(',', '.'))
    except ValueError:
        return None


def norm(name):
    return re.sub(r'\s+', ' ', (name or '').strip().lower())


def coordinates(data):
    """The coordinates of the places of the Regesta Imperii: by Wikidata id and by name."""
    by_qid, by_name = {}, {}

    def add(qid, names, lat, lon):
        if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return
        if qid:
            by_qid.setdefault(qid, (lat, lon))
        for n in names:
            if n:
                by_name.setdefault(norm(n), (lat, lon))

    with open(f'{data}/places/RI-Places.csv', newline='', encoding='utf-8-sig') as f:
        rows = csv.reader(f)
        head = {h: i for i, h in enumerate(next(rows)) if h}
        for row in rows:

            def get(key, row=row):
                return row[head[key]] if key in head and head[key] < len(row) else ''

            m = QID.search(get('wikidataId'))
            names = [get('Original'), get('Alternativname'), get('normalisiertDeutsch')]
            add(m.group(0) if m else None, names, number(get('Lat')), number(get('Long')))
    with open(f'{data}/indexes/combined_all.csv', newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            if (row.get('type') or '').strip() not in ('ort', 'place', ''):
                continue
            m = QID.search(f'{row.get("wikidataId") or ""} {row.get("wikidata") or ""}')
            names = [row.get('labelNorm'), row.get('label'), row.get('origLabel')]
            add(m.group(0) if m else None, names, number(row.get('lat')), number(row.get('long')))
    return by_qid, by_name


def place_qids(data):
    """The Wikidata id of the place of issue of a regest, by the regest's uid."""
    out = {}
    with open(f'{data}/ri-lod/PlaceOfIssueWikidata.csv', newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            m = QID.search(row.get('p.wikidataId') or '')
            if m:
                out[(row.get('uid') or '').strip()] = m.group(0)
    return out


def main(data, out_path):
    by_qid, by_name = coordinates(data)
    qid_of_uid = place_qids(data)
    places, place_index, kings, report = [], {}, [], {}
    for qid, name, volume, title, start, end in KINGS:
        count = Counter()
        days = defaultdict(list)
        with open(f'{data}/regesta-csv/RI_{volume}.csv', newline='', encoding='utf-8-sig') as f:
            for row in csv.DictReader(f, delimiter='\t'):
                first, last = (row.get('start_date') or '').strip(), (row.get('end_date') or '').strip()
                if not first or not start <= first <= end:
                    continue
                if not re.sub(r'\s+', ' ', row.get('title') or '').strip().startswith(title):
                    continue
                count['regesta'] += 1
                if PAPAL_DATING.search(row.get('original_date') or ''):
                    count['papal'] += 1
                    continue
                if re.search(r'†|Fälschung', row.get('identifier') or ''):
                    count['forgery'] += 1
                    continue
                where = (row.get('locality_string') or '').strip()
                if last and last != first:
                    count['not_one_day'] += 1
                    continue
                if where in UNKNOWN_PLACE:
                    count['no_place'] += 1
                    continue
                uid = (row.get('uid') or '').strip()
                q = CORRECTED.get(where) or qid_of_uid.get(uid)
                at = by_qid.get(q) if q else None
                at = at or by_name.get(norm(where)) or by_name.get(norm(re.sub(r'\s*\(.*?\)', '', where)))
                if not at:
                    count['no_coordinates'] += 1
                    continue
                key = (where, round(at[0], 4), round(at[1], 4))
                if key not in place_index:
                    place_index[key] = len(places)
                    places.append(list(key))
                days[first].append((place_index[key], int(uid) if uid.isdigit() else -1))
        stops = []
        for day in sorted(days):
            named = Counter(p for p, _ in days[day])
            top = max(named.values())
            stops.append([day, *next(pu for pu in days[day] if named[pu[0]] == top)])
        count['days'] = len(stops)
        report[name] = dict(count)
        kings.append({'key': qid, 'name': name, 'from': start, 'to': end, 'stops': stops})
    out = {
        'source': 'Regesta Imperii, CSV exports (data/regesta-csv, places/RI-Places.csv, indexes/combined_all.csv, '
        'ri-lod/PlaceOfIssueWikidata.csv)',
        'url': 'https://gitlab.rlp.net/adwmainz/regesta-imperii/lab/regesta-imperii-data',
        'license': 'CC BY 4.0 (https://www.regesta-imperii.de/regesten/suche.html)',
        'columns': {'places': ['place of issue', 'lat', 'lon'], 'stops': ['day', 'place', 'uid of the first regest']},
        'places': places,
        'kings': kings,
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps(report, ensure_ascii=False, indent=1))
    print(f'{len(places)} places')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
