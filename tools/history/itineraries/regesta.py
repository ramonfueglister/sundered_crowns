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
- A regest whose place of issue the editors mark in a footnote as not where the king was (the charter dated ahead or
  back, or given a made-up place: "passt nicht ins Itinerar", "vordatiert", "fiktiv") is left out, and so is one that
  is not the king's act or whose place the editors leave open (`NOT_THE_KINGS`).
- A place has the coordinates of the Regesta Imperii's own list of places (places/RI-Places.csv) or of its register
  (indexes/combined_all.csv), by the Wikidata id of the place of issue, else by the name; a place without them is left
  out and counted. Where the Regesta put a place of issue at another place of the same or a like name, it is put
  right by the regest itself and the days around it (`CORRECTED`, each with its reasons), with the coordinates of
  Wikidata where the Regesta's lists have none or a wrong one (`WIKIDATA_COORDINATES`).
- OWN RULE: where the regesta of one day name several places, the day goes to the place most of them name (ties: the
  first place in the order of the regesta), so that a day has one place; the sources read give no rule for this.
"""

import csv
import html
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
#: places of issue the Regesta put at the wrong place, by the name the regest writes (or by its uid), with the Wikidata
#: id of the right one; the days around are those of the king's itinerary in regesta_imperii.json
CORRECTED = {
    # ri-lod links 'Tridenti' to Triest (Q546), but the list of places names 'in Tridento', 'ap. civitatem Tridenti'
    # and 'Trientum' as Trient (places/RI-Places.csv ID 10487 and 6780)
    'Tridenti': 'Q3376',
    # RI VIII n. 256 (1346-10-04) confirms a fief from the toll at Luxembourg, between Luxembourg (09-22) and
    # Thionville (10-07): Arlon (RI-Places ID 3173), not Arluno by Milan
    'in Arluno': 'Q675960',
    # Budissin is Bautzen (RI-Places 'Budissin', 119 regesta); 'Budessin' (1363, 1371) lies between Guben or Pirna and
    # Prague, not at Büdesheim by Bingen (Q285879)
    'Budessin': 'Q14835',
    # Karl IV.'s Sulzbach is the seat of his lands in the Upper Palatinate (the register of the Regesta,
    # indexes/combined_all.csv: 'Sulzbach(-Rosenberg), Kr. Amberg-Sulzbach'), between Nuremberg, Lauf and Prague;
    # RI-Places puts it at Sulzbach in the Hunsrück (49.83, 7.33)
    'Sulzbach': 'Q503633',
    'Sulzpach': 'Q503633',
    'Sulczbach': 'Q503633',
    'Sulczpach': 'Q503633',
    'Sultzbach': 'Q503633',
    # Karl IV.'s 'Laufen' (1361-1366) lies between his stays at Nuremberg and Sulzbach, as 'Lauff' on the days next to
    # it (1362-03-27 and 03-31): Lauf an der Pegnitz, not Laufen by Basel (Q68363)
    'Laufen': 'Q504334',
    # 'Luckow' (1373) lies between Mühlberg and Prague and between Mühlberg and Frankfurt an der Oder: Luckau in Lower
    # Lusatia (RI-Places 'Luckau', 'Luckaw'), not Luckow in Western Pomerania (Q695458)
    'Luckow': 'Q539288',
    # 'Godingen' (1372, 1375) lies between Brno and Prague: Göding (Hodonín) in Moravia, not Godingen in Lorraine
    # (Q21704)
    'Godingen': 'Q321778',
    # Ludwig's 'Gundelfingen' (1325-11-30, 1326-01-11): the regesta concern Donaualtheim, Holzheim and the cathedral of
    # Augsburg, between Munich, Ulm and Nuremberg: Gundelfingen an der Donau, not in the Breisgau (Q535222)
    'Gundelfingen': 'Q509648',
    # Karl IV. at Frankfurt an der Oder, not am Main: 'Frankenvorde' (RI VIII n. 5528, 1375-11-25) between Berlin and
    # Fürstenberg an der Oder, on a matter of Königsberg in the Neumark; 'vor Frankfurt' (n. 5215a, 1373-07-13) in the
    # field between Luckau and Fürstenwalde; 'bei Frankfurt' (n. 766a-769, October 1348: the siege of the town, the
    # marches of Brandenburg) in the field between Spremberg and Bautzen
    '63350': 'Q4024',
    '63021': 'Q4024',
    '58242': 'Q4024',
    '58243': 'Q4024',
    '58244': 'Q4024',
    '58245': 'Q4024',
    # 'Grätz' (RI VIII n. 1331, 1350-08-29): the king called the reeves to 'Gretz super Albea', between two stays at
    # Brno: Königgrätz (Hradec Králové), not Graz
    '58842': 'Q180139',
    # 'vor Kunigsperg' (RI VIII n. 5791, 1377-07-13), in the field for the abbey of Chorin, between Tangermünde and
    # Dramburg: Königsberg in the Neumark (Chojna), not Königsberg in Prussia
    '63635': 'Q954157',
    # Ludwig 'im Lager bei Landau' (RI VII H. 4 n. 12, 1320-08-27) asks Strasbourg for food for his army, between
    # Frankfurt and Speyer: Landau in der Pfalz (RI-Places lists the camp 'vor Landau' there), not an der Isar
    '55320': 'Q7052',
}
#: coordinates (Wikidata P625, read 20 November 2026) of the right places the Regesta's lists have none for, or a
#: wrong one: RI-Places puts Zittau (Q157200) at latitude 48.40014 instead of 50.90
WIKIDATA_COORDINATES = {
    'Q157200': (50.896111, 14.807222),
    'Q503633': (49.5, 11.75),
    'Q321778': (48.848951, 17.132439),
    'Q509648': (48.55, 10.366667),
    'Q954157': (52.96389, 14.42797),
}
#: regesta whose place of issue is not where the king was, by uid
NOT_THE_KINGS = {
    # RI VI,4,2 n. 445 (Ivrea, 1310-05-26): an answer of the commune of Ivrea to the king's envoys, written by its
    # notary, while the king was still north of the Alps
    '193966',
    # RI VI,2 n. 633 ('(Grüningen)', 1295-07-22): the editors leave open which Grüningen (commentary: in the Wetterau,
    # against Böhmer's guess)
    '51005',
}
#: the editors' footnote on a place of issue that says the king was not there (RI VII H. 11 n. 208 note 1: "wodurch der
#: Ausstellungsort nicht ins Itinerar passt"; H. 14 n. 128 note 1: "vordatiert und mit einem fiktivem Ausstellungsort";
#: H. 5 n. 157 note 1: "paßt nicht ins Itinerar ... dürfte in Ravensburg rückdatiert sein")
OFF_ITINERARY = re.compile(r'nicht ins Itinerar|vordatiert|rückdatiert|vorausdatiert|Vorausdatierung|fiktiv', re.I)
FOOTNOTE_MARK = re.compile(r'<sup>\s*(\d+)\s*\)?\s*</sup>')
FOOTNOTE = re.compile(r'<li>\s*<sup>\s*(\d+)\s*</sup>(.*?)</li>', re.S)
UNKNOWN_PLACE = {'', '-', '?', '....'}
PAPAL_DATING = re.compile(r'pontificatus', re.IGNORECASE)
QID = re.compile(r'Q\d+')


def number(text):
    try:
        return float(str(text).strip().replace(',', '.'))
    except ValueError:
        return None


def norm(name):
    return re.sub(r'\s+', ' ', html.unescape(name or '').strip().lower())


def coordinates(data):
    """The coordinates of the places of the Regesta Imperii: by Wikidata id and by name."""
    by_qid, by_name = {}, {}

    def add(qid, names, lat, lon):
        lat, lon = WIKIDATA_COORDINATES.get(qid, (lat, lon))
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


def off_itinerary(where, footnotes):
    """Whether the editors' footnote on the place of issue says the king was not there."""
    marks = set(FOOTNOTE_MARK.findall(where))
    notes = dict(FOOTNOTE.findall(html.unescape(footnotes or '')))
    return any(OFF_ITINERARY.search(notes.get(n, '')) for n in marks)


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
                where = html.unescape(row.get('locality_string') or '').strip()
                if last and last != first:
                    count['not_one_day'] += 1
                    continue
                if where in UNKNOWN_PLACE:
                    count['no_place'] += 1
                    continue
                uid = (row.get('uid') or '').strip()
                if uid in NOT_THE_KINGS:
                    count['not_the_king'] += 1
                    continue
                if off_itinerary(where, row.get('footnotes')):
                    count['off_itinerary'] += 1
                    continue
                q = CORRECTED.get(uid) or CORRECTED.get(where) or qid_of_uid.get(uid)
                at = (WIKIDATA_COORDINATES.get(q) or by_qid.get(q)) if q else None
                bare = re.sub(r'<sup>.*?</sup>|<[^>]+>', '', where)
                at = at or by_name.get(norm(bare)) or by_name.get(norm(re.sub(r'\s*\(.*?\)', '', bare)))
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
