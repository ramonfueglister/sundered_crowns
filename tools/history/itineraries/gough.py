"""The journeys of Edward I of England 1286-1307 from Gough's itinerary (data/history/itineraries/gough_edward_i.json).

Henry Gough, Itinerary of King Edward the First throughout his Reign, A.D. 1272-1307, vol. II, 1286-1307 (Paisley
1900; public domain): for every day the place where the records of the king's government (the rolls of the chancery,
the wardrobe accounts) show the king. Reads the OCR text of the scan in the Internet Archive (itineraryofkinge02gouguoft,
the file _djvu.txt) and the GeoNames dumps of GB, FR, BE and NL (CC BY 4.0, cut to their places, castles and abbeys:
id, name, asciiname, alternatenames, lat, lon, class, code, country, admin1, admin2, population), which a browser in
the cloud cannot fetch: they are read on another computer and only this file's result is kept in the repository.

    python3 tools/history/itineraries/gough.py <_djvu.txt> <geonames.tsv> data/history/itineraries/gough_edward_i.json

Rules (nothing is invented):
- The itinerary runs from the first running head of the year 1286 ("A.D. 1285-6") to the explanation of the
  references. A month begins at its heading (or, where the OCR lost it, when the days begin again at 1); the year is
  that of the running head (the book counts the year from 25 March, "1290-91", so January to March belong to the
  second year), and the day is the next day of the month when the number the OCR read and the weekday agree with it
  (the book uses the Julian calendar, as the game does).
- An entry lists a feast, the place, the county (or ditto ',,') and the records (the abbreviations of the book's
  "Explanation of references to records"); the place is the part of the entry that is none of the others.
- OWN RULE: where an entry names two places on one day, the day goes to the last that is found (the king reached it
  that day; the book lists them in order).
- A place the OCR misread is the place of the book's index of places with the most like name (difflib, 85 %), or
  the place of a day around it with a like name (70 %; OWN RULE: the book repeats a place day by day, and the OCR
  spoils one letter in four at most in the names seen).
- A place is found in GeoNames by its name and its other names; where several places bear it, the one nearest the
  places of the days around that bear a name only one place has: the reading of the names that grounds them all in
  the smallest region (Leidner, Sinclair & Webber 2003, "Grounding spatial named entities for information
  extraction and question answering", sec. 3). A place not found is left out and counted.
"""

import difflib
import json
import math
import re
import sys
import unicodedata
from collections import Counter

MONTHS = [
    'JANUARY',
    'FEBRUARY',
    'MARCH',
    'APRIL',
    'MAY',
    'JUNE',
    'JULY',
    'AUGUST',
    'SEPTEMBER',
    'OCTOBER',
    'NOVEMBER',
    'DECEMBER',
]
MONTH = re.compile(r'^(' + '|'.join(MONTHS) + r')\.?$')
RUNNING_HEAD = re.compile(r'^A\.\s?D\.\s+(\S{4})(?:\s?-\s?(\S{1,4}))?[,.]')
END = re.compile(r'^EXPLANATION\s+OF\s+REFERENCES')
INDEX = re.compile(r'^This\s+Index\s+is\s+in\s+four\s+divisions')
NOTES = re.compile(r'^\[?\s*Notes\s+to\s+p', re.IGNORECASE)
#: what the OCR reads for the digits of a day: 1 as i, I, l or ], 0 as o or O
DIGITS = str.maketrans({'i': '1', 'I': '1', 'l': '1', 'L': '1', ']': '1', '|': '1', '!': '1', 'o': '0', 'O': '0'})
#: the weekday letters of the book (Monday 0); Sunday is a black-letter dominical letter the OCR reads in many ways
WEEKDAYS = {'M': 0, 'T': 1, 'W': 2, 'Th': 3, 'F': 4, 'S': 5, 's': 5}
SUNDAY = re.compile(r'^(?:\(S|\(s|\(5|3B|3b|38|jf|Jf|JF|\]f|\[f|J|f|®)$')
DAY_ROW = re.compile(r'^(\S{1,3})\s+(\S{1,3})(?:\s{2,}(.*))?$')
#: the abbreviations of the records (Explanation of references to records), without dots and spaces, and how the OCR
#: reads some of them
RECORDS = {
    'AR',
    'Bain',
    'ChF',
    'ChR',
    'ClR',
    'C1R',
    'CIR',
    'FR',
    'Foed',
    'Fœd',
    'Feed',
    'Fced',
    'HA',
    'HR',
    'IR',
    'Inq',
    'LQ',
    'LR',
    'LibA',
    'LibB',
    'Lib',
    'MR',
    'MS',
    'MSI',
    'PR',
    'PS',
    'Palg',
    'PdR',
    'PrR',
    'Prynne',
    'RR',
    'RomR',
    'SR',
    'VR',
    'WA',
    'WR',
}
FEAST = re.compile(
    r'\b(?:after|Circumcision|Epiphany|Purification|Annunciation|Easter|Ascension|Pentecost|Whit|Trinity|Corpus|'
    r'Christmas|Nativity|Assumption|Michaelmas|Advent|Septuagesima|Sexagesima|Quinquagesima|Quadragesima|Lent|Palm|'
    r'Good\s+Friday|Ash\s+Wed|Rogation|Low\s+Sunday|Innocents|All\s+Saints|All\s+Souls|Candlemas|Lammas|Exaltation|'
    r'Invention|Conversion|Decollation|Translation|Sunday|Vigil|begins|Edw)\b',
    re.IGNORECASE,
)
PROSE = re.compile(r'\b(?:the|was|were|is|had|appears|read|ibid|see|which|that)\b', re.IGNORECASE)
#: GeoNames features a medieval king stayed at: places, castles, abbeys and priories, churches, houses, ruins, islands
FEATURES = {'CSTL', 'MSTY', 'CH', 'RUIN', 'HSEC', 'HSE', 'PAL', 'EST', 'ANS', 'MNMT', 'ISL'}
#: places of one name nearer each other than this are one place (OWN RULE: the size of a parish with its hamlets)
ONE_PLACE_KM = 25
#: how many days around a misread name are searched for the name it stands for, and how like the two must be (above)
NEAR_DAYS = 3
LIKE_NEIGHBOUR = 0.7


def julian_weekday(y, m, d):
    """Monday 0 ... Sunday 6, of a date of the Julian calendar (the Julian day number)."""
    a = (14 - m) // 12
    yy, mm = y + 4800 - a, m + 12 * a - 3
    return (d + (153 * mm + 2) // 5 + 365 * yy + yy // 4 - 32083) % 7


def month_days(y, m):
    return [31, 29 if y % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]


def head_year(m):
    """The years of a running head ("A.D. 1290-91" gives 1290 and 1291), or None where the OCR spoiled them."""
    first = m.group(1).translate(DIGITS)
    if not first.isdigit():
        return None
    a = int(first)
    second = (m.group(2) or '').translate(DIGITS)
    b = int(first[: 4 - len(second)] + second) if second.isdigit() else None
    return a, b


def key(name):
    """A name for matching: without accents, dots, apostrophes and hyphens, 'saint' as 'st'."""
    s = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"[.'’`\"]", '', s)
    s = re.sub(r'[-–/]', ' ', s)
    s = re.sub(r'\bsaint\b', 'st', s)
    return re.sub(r'\s+', ' ', s).strip()


def segments(line):
    """The columns of a line (three spaces or more apart), each with its words one space apart."""
    return [re.sub(r'\s+', ' ', s).strip() for s in re.split(r'\s{3,}', line.strip()) if s.strip()]


def is_records(seg):
    tokens = [re.sub(r'[\[\]().,;:\s]', '', t) for t in seg.split()]
    tokens = [t for t in tokens if t]
    if not tokens:
        return False
    if re.sub(r'[\[\]().,;:\s]', '', seg) in RECORDS:
        return True
    known = sum(t in RECORDS for t in tokens)
    rest = [t for t in tokens if t not in RECORDS and not re.fullmatch(r'[\dWAIivxlm]{1,4}|m|p|pp|n', t)]
    return known > 0 and not rest


def is_noise(seg):
    letters = re.sub(r'[^A-Za-z]', '', seg)
    return bool(
        len(letters) < 3
        or not re.match(r'["“A-Z]', seg)
        or (seg.isupper() and len(letters) <= 4)
        or len(seg.split()) > 5
        or PROSE.search(seg)
    )


def clean(seg):
    """A place as the book writes it: without the note numbers glued to it and stray marks."""
    s = re.sub(r'\d+$', '', seg.strip())
    s = s.strip(' \'"“”*.,;:-[]|')
    return re.sub(r'\s+', ' ', s)


def parse(lines):
    """The days of the itinerary: [(date, [places], line number)], and what the parse met."""
    report = Counter()
    days, odd = [], []
    start = next(
        i for i, t in enumerate(lines) if (m := RUNNING_HEAD.match(t.strip())) and (head_year(m) or (0,))[0] >= 1285
    )
    y = m = last = None
    page_head = False
    in_notes = False
    entry = None
    for n in range(start, len(lines)):
        t = lines[n].strip()
        if not t:
            continue
        if END.match(t):
            break
        h = RUNNING_HEAD.match(t)
        if h:
            years = head_year(h)
            page_head, in_notes = True, False
            report['pages'] += 1
            continue
        if page_head:
            page_head = False
            if len(t) <= 4:
                continue
        if NOTES.match(t):
            in_notes = True
        if in_notes:
            continue
        mo = MONTH.match(t)
        if mo:
            month = MONTHS.index(mo.group(1)) + 1
            hy = years and (years[1] if years[1] and month <= 3 else years[0])
            seq = None if m is None else (y + (month < m), month)
            if hy and 1285 < hy < 1308:
                if seq and seq[0] != hy:
                    report['year_from_head_not_sequence'] += 1
                    odd.append(f'{n + 1}: {mo.group(1)} head {hy} sequence {seq[0]}')
                y = hy
            elif seq:
                y = seq[0]
                report['head_unread'] += 1
            m, last = month, 0
            report['months'] += 1
            continue
        row = DAY_ROW.match(t)
        if row and m is not None:
            num = row.group(1).translate(DIGITS)
            wd = row.group(2)
            weekday = WEEKDAYS.get(wd, 6 if SUNDAY.match(wd) else None)
            number = int(num) if num.isdigit() else None
            if number is not None or weekday is not None:
                date = day_of_row(y, m, last, number, weekday, report)
                if date:
                    if date[1] != m:
                        report['month_inferred'] += 1
                        y, m = date[0], date[1]
                    last = date[2]
                    entry = (f'{date[0]:04d}-{date[1]:02d}-{date[2]:02d}', [], n + 1)
                    days.append(entry)
                    continue
                if number is not None and weekday is not None:
                    report['day_row_rejected'] += 1
                    odd.append(f'{n + 1}: rejected day row {t!r} after {y}-{m}-{last}')
                    continue
        if entry is not None:
            entry[1].append(t)
    return days, report, odd


def day_of_row(y, m, last, number, weekday, report):
    """The date of a day row after day `last` of month `m`: the next day where the number or the weekday read agree
    with it, a day a few days on where both agree, or the first days of the next month."""
    nxt = last + 1
    if nxt <= month_days(y, m):
        wd = julian_weekday(y, m, nxt)
        if number == nxt and weekday in (wd, None):
            return y, m, nxt
        if number == nxt or weekday == wd and (number is None or number > 31):
            report['day_by_one_of_two'] += 1
            return y, m, nxt
        if weekday == wd and number is not None:
            report['day_number_misread'] += 1
            return y, m, nxt
    if (
        number is not None
        and nxt < number <= min(nxt + 3, month_days(y, m))
        and weekday == julian_weekday(y, m, number)
    ):
        report['days_missing'] += number - nxt
        return y, m, number
    if number is not None and number <= 3 and last >= 27:
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        if weekday == julian_weekday(ny, nm, number):
            return ny, nm, number
    return None


def places_of(entry_lines, report):
    """The places an entry names, in order (above)."""
    out, state = [], 'place'
    for t in entry_lines:
        for seg in segments(t):
            if is_records(seg):
                state = 'place'
            elif seg in (',,', '„', ',', '"'):
                state = 'records'
            elif FEAST.search(seg) or is_noise(seg):
                report['segments_skipped'] += 1
            elif state == 'county':
                state = 'records'
            else:
                out.append(clean(seg))
                state = 'county'
    return [p for p in out if p]


def index_names(lines):
    """The names of the book's index of places, by their key, with the variants of inverted names ('Allerton
    (North-)' is North Allerton)."""
    start = next((i for i, t in enumerate(lines) if INDEX.match(t.strip())), None)
    out = {}
    if start is None:
        return out
    head = re.compile(r'^["“]?\s*([A-Z][A-Za-z\'’\- .]+?)\s*(?:\(([A-Za-z\'’\- ]+?)-?\))?\s*["”]?\s*[,:]')
    for t in lines[start + 1 :]:
        h = head.match(t.strip())
        if not h:
            continue
        name, pre = h.group(1).strip(' .'), h.group(2)
        forms = [name] if not pre else [f'{pre.strip(" -")} {name}', f'{pre.strip(" -")}{name.lower()}']
        for f in forms:
            out.setdefault(key(f), f)
    return out


def load_geonames(path):
    """The places of GeoNames by the key of each of their names: (lat, lon, population)."""
    out = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            c = line.rstrip('\n').split('\t')
            if len(c) < 12:
                continue
            if c[6] != 'P' and c[7] not in FEATURES:
                continue
            at = (float(c[4]), float(c[5]), int(c[11] or 0))
            names = {c[1], c[2], *c[3].split(',')}
            for n in names:
                if n:
                    out.setdefault(key(n), []).append(at)
    return out


def variants(name):
    k = key(name)
    yield k
    yield re.sub(r'\s*\(.*?\)', '', k)
    yield re.sub(r'^the ', '', k)
    yield k.replace(' on ', ' upon ')
    yield k.replace(' upon ', ' on ')
    for w in ('castle', 'abbey', 'priory', 'manor', 'palace', 'grange', 'park', 'forest', 'chase', 'church'):
        if k.endswith(' ' + w):
            yield k[: -len(w) - 1]


def candidates(name, geo, index, report):
    for v in variants(name):
        if v in geo:
            return geo[v]
    close = difflib.get_close_matches(key(name), list(index), n=1, cutoff=0.85)
    if close and close[0] != key(name):
        report['names_by_index'] += 1
        for v in variants(index[close[0]]):
            if v in geo:
                return geo[v]
    return []


def km(a, b):
    p = math.pi / 180
    h = (
        math.sin((b[0] - a[0]) * p / 2) ** 2
        + math.cos(a[0] * p) * math.cos(b[0] * p) * math.sin((b[1] - a[1]) * p / 2) ** 2
    )
    return 12742 * math.asin(math.sqrt(h))


def one_place(cands):
    """The place of a name all whose bearers lie together (the most populous of them), else None."""
    top = max(cands, key=lambda c: c[2])
    return top if all(km(top, c) <= ONE_PLACE_KM for c in cands) else None


def locate(days, geo, index, report):
    """The place of each day on the map: (date, name, lat, lon), by the rules above."""
    found = {}
    for _, names, _ in days:
        for n in names:
            if n not in found:
                found[n] = candidates(n, geo, index, report)
    # a name the OCR misread is the like name of a day around it that is found (the book repeats the place day by day)
    for i, (_, names, _) in enumerate(days):
        for j, n in enumerate(names):
            if found[n]:
                continue
            near = [m for d in days[max(0, i - NEAR_DAYS) : i + NEAR_DAYS + 1] for m in d[1] if found.get(m)]
            like = max(near, key=lambda m: difflib.SequenceMatcher(None, key(n), key(m)).ratio(), default=None)
            if like and difflib.SequenceMatcher(None, key(n), key(like)).ratio() >= LIKE_NEIGHBOUR:
                names[j] = like
                report['names_by_neighbour'] += 1
    unfound = Counter(n for _, names, _ in days for n in names if not found[n])
    # each day's place: the last place of the day that is found
    stops = []
    for date, names, _ in days:
        named = [n for n in names if found[n]]
        if named:
            stops.append((date, named[-1]))
        elif names:
            report['days_unfound'] += 1
    anchor = [one_place(found[n]) for _, n in stops]
    out = []
    for i, (date, n) in enumerate(stops):
        at = anchor[i]
        if at is None:
            before = next((anchor[j] for j in range(i - 1, -1, -1) if anchor[j]), None)
            after = next((anchor[j] for j in range(i + 1, len(stops)) if anchor[j]), None)
            at = min(found[n], key=lambda c: (km(c, before) if before else 0) + (km(c, after) if after else 0))
            report['days_by_nearness'] += 1
        out.append((date, n, round(at[0], 4), round(at[1], 4)))
    return out, unfound


def main(text_path, geonames_path, out_path):
    with open(text_path, encoding='utf-8') as f:
        lines = f.read().split('\n')
    days, report, odd = parse(lines)
    for d in days:
        d[1][:] = places_of(d[1], report)
    report['days'] = len(days)
    report['days_with_a_place'] = sum(1 for d in days if d[1])
    index = index_names(lines)
    report['index_names'] = len(index)
    stops, unfound = locate(days, load_geonames(geonames_path), index, report)
    report['days_placed'] = len(stops)
    places, place_index, rows = [], {}, []
    for date, n, lat, lon in stops:
        k = (n, lat, lon)
        if k not in place_index:
            place_index[k] = len(places)
            places.append(list(k))
        rows.append([date, place_index[k]])
    out = {
        'source': 'Henry Gough, Itinerary of King Edward the First throughout his Reign, vol. II (Paisley 1900), OCR '
        'text of the Internet Archive scan; places from GeoNames (GB, FR, BE, NL)',
        'url': 'https://archive.org/details/itineraryofkinge02gouguoft',
        'license': 'the book is in the public domain; GeoNames CC BY 4.0 (https://www.geonames.org)',
        'columns': {'places': ['place', 'lat', 'lon'], 'stops': ['day', 'place']},
        'places': places,
        'kings': [{'key': 'Q57798', 'name': 'Edward I', 'from': days[0][0], 'to': '1307-07-07', 'stops': rows}],
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps(dict(report), indent=1))
    print(f'{len(places)} places; first day {days[0][0]}, last {days[-1][0]}')
    print('odd lines (first 40):', *odd[:40], sep='\n  ')
    print('places not found (most days first, 60):', *[f'{c} {n}' for n, c in unfound.most_common(60)], sep='\n  ')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
