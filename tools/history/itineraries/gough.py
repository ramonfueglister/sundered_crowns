"""The journeys of Edward I of England 1286-1307 from Gough's itinerary (data/history/itineraries/gough_edward_i.json).

Henry Gough, Itinerary of King Edward the First throughout his Reign, A.D. 1272-1307, vol. II, 1286-1307 (Paisley
1900; public domain): for every day the place where the records of the king's government (the rolls of the chancery,
the wardrobe accounts) show the king. Reads the OCR text of the scan in the Internet Archive (itineraryofkinge02gouguoft,
the file _djvu.txt) and the GeoNames dumps of GB, FR, BE and NL (CC BY 4.0, cut to their places, castles and abbeys:
id, name, asciiname, alternatenames, lat, lon, class, code, country, admin1, admin2, population), which a browser in
the cloud cannot fetch: they are read on another computer and only this file's result is kept in the repository.

    python3 tools/history/itineraries/gough.py <_djvu.txt> <geonames.tsv> data/history/itineraries/gough_edward_i.json

Rules (nothing is invented):
- The itinerary runs from the running head "A.D. 1285-6" to the explanation of the references. A month begins at its
  heading (or, where the OCR lost it, when the days begin again at 1), and the months follow one another; the first
  year is that of the running head (the book counts the year from 25 March: "1285-6" is January 1286). A day is the
  next day of the month when the number the OCR read or the weekday agrees with it (the book uses the Julian
  calendar, as the game does).
- An entry lists a feast, the place, the county (or ditto ',,') and the records (the abbreviations of the book's
  "Explanation of references to records"); the place is the part of the entry that is none of the others. The rest of
  the day's row begins the entry: on some pages the OCR read the place into it.
- OWN RULE: the book names a county where it changes and leaves the column blank or writes a ditto below it (Exeter,
  Devon, then Exeter with a ditto or blank), so a place without a county is in the county named last.
- OWN RULE: where an entry names two places on one day, the day goes to the last that can be placed (the king reached
  it that day; the book lists them in order).
- A place the OCR misread is the place of the book's index of places with the most like name (difflib, 85 %), or
  the place of a day around it with a like name (70 %; OWN RULE: the book repeats a place day by day).
- The places are found in GeoNames by the rules of tools/history/itineraries/gazetteer.py.
"""

import difflib
import json
import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gazetteer import Gazetteer, key, place_days  # noqa: E402

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
SUNDAY = re.compile(r'^(?:\(S|\(s|\(5|3B|3b|38|3D|2\)|jf|Jf|JF|\]f|\[f|J|f|®|j£|\]£|\(£|£|\(t|B|C)$')
DAY_ROW = re.compile(r'^(\S{1,3})\s+(\S{1,3})(?:\s{2,}(.*))?$')
#: the abbreviations of the records (Explanation of references to records), lower case without dots and spaces, and
#: how the OCR reads some of them
# fmt: off
RECORDS = {
    'ar', 'bain', 'chf', 'chr', 'clr', 'c1r', 'cir', 'fr', 'foed', 'fœd', 'feed', 'fced', 'ha', 'hr', 'ir', 'inq',
    'itin', 'lq', 'lr', 'liba', 'libb', 'lib', 'mr', 'ms', 'msi', 'pr', 'ps', 'palg', 'pdr', 'prr', 'prynne', 'rr',
    'romr', 'sr', 'vr', 'wa', 'wr',
}
# fmt: on
#: the feasts and the Sundays the book names before the place of a day; a column may open with one ('Circumcision St.
#: Macaire'), FEAST_LEAD is the feast at its start with its number ('2 in Lent') and its day ('Easter Day')
FEAST_WORDS = (
    r'(?:after|aft\.?|Circumcision|Epiphany|Purification|Annunciation|Easter|Ascen\w*|Pentecost|Whit[- ]?(?:sun|mon|tues)\w*|'
    r'Trinity|Corpus|Xti|Christmas|Nativity|Assumption|Michaelmas|Advent|Septuag\w*|Sexag\w*|Quinquag\w*|'
    r'Quadrag\w*|Lent|Palm|Passion|Mid-?\s?summer|Lady\s+day|Good\s+Friday|Ash\s+Wednesday|Rogation|Low\s+S(?:unday)?|'
    r'Innocents|All\s+Saints|All\s+Souls|Candlemas|Lammas|Exaltation|Invention|Conversion|Decollation|Translation|'
    r'Sunday|Vigil|begins|Edw)'
)
FEAST = re.compile(r'\b' + FEAST_WORDS + r'(?!\w)', re.IGNORECASE)
FEAST_LEAD = re.compile(
    r'^(?:[\dil]{1,2}\s+(?:after|aft\.?|in)\s+)?' + FEAST_WORDS + r'(?!\w)(?:\s+(?:Day|Eve|Even|Sunday)(?!\w))?\.?',
    re.IGNORECASE,
)
DITTO = {',,', '„', ',', '"', '»'}
#: the last day of the reign: Edward I died at Burgh by Sands on 7 July 1307; the book's days run on to the end of
#: that month
REIGN_END = (1307, 7, 7)
PROSE = re.compile(r'\b(?:the|was|were|is|had|appears|read|ibid|see|which|that)\b', re.IGNORECASE)
#: the counties and lands of the county column that are not also the name of a town, as the book writes them in full
#: or shortened (keys), besides those its index of places names; Béarn as the OCR also reads it ('Beam')
# fmt: off
COUNTIES = {
    'beds', 'berks', 'bucks', 'buckm', 'cambs', 'cheshire', 'cornwall', 'cumberland', 'devon', 'dorset', 'essex',
    'glouc', 'hants', 'herts', 'hunts', 'kent', 'lanc', 'leic', 'middx', 'norfolk', 'nland', 'nton', 'notts', 'nottm',
    'oxon', 'rutland', 'salop', 'som', 'somerset', 'ston', 'soton', 'staff', 'suffolk', 'surrey', 'sussex', 'warw',
    'westm', 'wilts', 'worc', 'fife', 'guienne', 'gascony', 'flanders', 'ponthieu', 'picardy', 'poitou', 'saintonge',
    'agenais', 'brabant', 'aunis', 'bearn', 'beam', 'brittany', 'britanny', 'aragon', 'valencia', 'navarre', 'bigorre',
    'armagnac', 'perigord', 'limousin', 'quercy',
}
# fmt: on


def julian_weekday(y, m, d):
    """Monday 0 ... Sunday 6, of a date of the Julian calendar (the Julian day number)."""
    return julian_day(y, m, d) % 7


def julian_day(y, m, d):
    a = (14 - m) // 12
    yy, mm = y + 4800 - a, m + 12 * a - 3
    return d + (153 * mm + 2) // 5 + 365 * yy + yy // 4 - 32083


def month_days(y, m):
    return [31, 29 if y % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]


def head_years(h):
    """The years of a running head ("A.D. 1290-91" gives 1290 and 1291), or None where the OCR spoiled them."""
    first = h.group(1).translate(DIGITS)
    if not first.isdigit():
        return None
    second = (h.group(2) or '').translate(DIGITS)
    return int(first), (int(first[: 4 - len(second)] + second) if second.isdigit() else None)


def segments(line):
    """The columns of a line (three spaces or more apart), each with its words one space apart."""
    return [re.sub(r'\s+', ' ', s).strip() for s in re.split(r'\s{3,}', line.strip()) if s.strip()]


def is_record(token):
    t = re.sub(r'[\[\]().,;:\s]', '', token).lower()
    return t in RECORDS or (bool(re.fullmatch(r'[A-Z][A-Za-z1]?\.[A-Z1]\.?\]?', token.strip('[]()'))))


def split_records(seg):
    """A column without the abbreviations of records at its end ('Hertford P.S'), and whether it had any."""
    words = re.sub(r'\bW\.?\s+A\.', 'W.A.', seg).split()
    n = len(words)
    while n and is_record(words[n - 1]):
        n -= 1
    return ' '.join(words[:n]), n < len(words)


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
    """A place as the book writes it: without the note numbers and marks glued to it, the editor's brackets joined
    ('Chester [-le-Street]' is Chester-le-Street)."""
    s = re.sub(r'\s*\[\s*-', '-', seg.strip()).replace('[', '').replace(']', '')
    s = re.sub(r'\s+[a-z]$', '', re.sub(r'\d+$', '', s))
    s = s.strip(' \'"“”„»*.,;:-|')
    return re.sub(r'\s+', ' ', s)


def parts(seg, places, counties):
    """A column as the columns in it: a place with the county or the ditto the OCR set too close to it ('Saintes
    Saintonge', 'Ponton „') split off; a county that is also a town only after a place of the index ('Durham
    Durham')."""
    words = seg.split()
    for n in (1, 2):
        if len(words) > n:
            rest, tail = ' '.join(words[:-n]), ' '.join(words[-n:])
            k = key(clean(tail))
            if tail in DITTO or (k in counties and (k not in places or key(clean(rest)) in places)):
                return [rest, tail]
    return [seg]


def parse(lines):
    """The days of the itinerary: [date, [lines of the entry], line number], and what the parse met."""
    report, days, odd = Counter(), [], []
    start = next(
        i
        for i, t in enumerate(lines)
        if (h := RUNNING_HEAD.match(t.strip()))
        and (ys := head_years(h))
        and 1285 <= ys[0] <= 1307
        and ys[1] in (None, ys[0] + 1)
    )
    y = m = last = years = None
    page_head = in_notes = False
    entry, taken = None, set()
    for n in range(start, len(lines)):
        t = lines[n].strip()
        if not t:
            continue
        if END.match(t):
            break
        h = RUNNING_HEAD.match(t)
        if h:
            years, page_head, in_notes = head_years(h), True, False
            report['pages'] += 1
            continue
        if page_head:
            page_head = False
            if len(t) <= 4:
                continue
        if NOTES.match(t):
            in_notes = True
            report['notes'] += 1
        mo = MONTH.match(t)
        # the notes run to the next page of the itinerary, or to its next month or day where the OCR lost the head
        if in_notes and not mo and not continues(t, y, m, last):
            continue
        in_notes = False
        if mo:
            month = MONTHS.index(mo.group(1)) + 1
            if month == m:
                continue
            hy = years and (years[1] if years[1] and month <= 6 else years[0])
            if m is None:
                y = hy
            else:
                ny = y + (month < m)
                if hy and hy != ny:
                    report['head_year_not_sequence'] += 1
                    odd.append(f'{n + 1}: {mo.group(1)} head {hy}, sequence {ny} kept')
                if month != m % 12 + 1:
                    report['months_skipped'] += 1
                    odd.append(f'{n + 1}: {mo.group(1)} after month {m} of {y}')
                y = ny
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
                date = day_of_row(y, m, last, number, weekday, taken, report)
                if date and date not in taken:
                    taken.add(date)
                    if date[1] != m:
                        report['month_inferred'] += 1
                        y, m = date[0], date[1]
                    last = date[2]
                    # the rest of the row is the start of the entry (the feast, or on some pages the place itself)
                    entry = [date, [row.group(3)] if row.group(3) else [], n + 1]
                    days.append(entry)
                    continue
                if number is not None and weekday is not None:
                    # what follows a row that is not the next day belongs to that row, not to the day before
                    report['day_row_rejected'] += 1
                    odd.append(f'{n + 1}: rejected day row {t!r} after {y}-{m}-{last}')
                    entry = None
                    continue
        if entry is not None:
            entry[1].append(t)
    days.sort(key=lambda d: d[0])
    return days, report, odd


def day_of_row(y, m, last, number, weekday, taken, report):
    """The date of a day row after day `last` of month `m`, none of the days taken: the next day where the number or
    the weekday read agree with it, a later day of the month or a day of the next where both agree (the days between
    are lost), or an earlier day of the month not yet read where both agree (the OCR read the rows of a page in blocks
    out of their order: November 1298 as 1-2, 20-30, 3-19)."""
    nxt = last + 1
    if nxt <= month_days(y, m) and (y, m, nxt) not in taken:
        wd = julian_weekday(y, m, nxt)
        if number == nxt and weekday in (wd, None):
            return y, m, nxt
        if number == nxt or (weekday == wd and (number is None or number > 31)):
            report['day_by_one_of_two'] += 1
            return y, m, nxt
        if weekday == wd and number is not None and not (nxt < number <= month_days(y, m)):
            report['day_number_misread'] += 1
            return y, m, nxt
    if number is not None and nxt < number <= month_days(y, m) and weekday == julian_weekday(y, m, number):
        report['days_missing'] += number - nxt
        return y, m, number
    ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
    # OWN RULE: only late in a month (from the 20th), so that a number misread early in one does not skip a month
    if (
        number is not None
        and last >= 20
        and number < nxt
        and number <= month_days(ny, nm)
        and weekday == julian_weekday(ny, nm, number)
    ):
        if number > 1:
            report['days_missing'] += number - 1
        return ny, nm, number
    if (
        number is not None
        and 1 <= number < nxt
        and (y, m, number) not in taken
        and weekday == julian_weekday(y, m, number)
    ):
        report['days_read_back'] += 1
        report['days_missing'] -= 1
        return y, m, number
    return None


def continues(t, y, m, last):
    """Whether a line is the day row of the next day, number and weekday both read right."""
    row = DAY_ROW.match(t)
    if not row or m is None:
        return False
    num, wd = row.group(1).translate(DIGITS), row.group(2)
    weekday = WEEKDAYS.get(wd, 6 if SUNDAY.match(wd) else None)
    nxt = last + 1
    if nxt > month_days(y, m):
        y, m, nxt = (y + 1, 1, 1) if m == 12 else (y, m + 1, 1)
    return num == str(nxt) and weekday == julian_weekday(y, m, nxt)


def place_in(seg):
    """The place a column names, after a feast that may open it ('Circumcision St. Macaire'); '' where it names none."""
    rest = FEAST_LEAD.sub('', seg, count=1).strip() if FEAST.search(seg) else seg
    return '' if not rest or FEAST.search(rest) or is_noise(rest) else clean(rest)


def places_of(entry_lines, places, counties, county, report):
    """The places an entry names, in order (above), each as [place, the key of its county]; and the county named last,
    which the next entry goes on from."""
    out, state = [], 'place'
    for t in entry_lines:
        for column in segments(t):
            column, had_records = split_records(column)
            if not column:
                state = 'place'
                continue
            for seg in parts(column, places, counties):
                k = key(clean(seg))
                if seg in DITTO:
                    state = 'records'
                elif not place_in(seg):
                    report['segments_skipped'] += 1
                elif k in counties and k not in places or (state == 'county' and (k in counties or k not in places)):
                    county = k
                    if out:
                        out[-1][1] = k
                    state = 'records'
                else:
                    out.append([place_in(seg), county])
                    state = 'county'
            if had_records:
                state = 'place'
    return out, county


def index_names(lines):
    """The names of the book's index of places, by their key, with the variants of inverted names ('Allerton
    (North-)' is North Allerton), and the counties it names."""
    start = next((i for i, t in enumerate(lines) if INDEX.match(t.strip())), None)
    names, counties = {}, set()
    if start is None:
        return names, counties
    head = re.compile(
        r'^["“]?\s*([A-Z][A-Za-z\'’\- .]+?)\s*(?:\(([A-Za-z\'’\- ]+?)-?\))?\s*["”]?\s*(?:,\s*([^:]{1,30}?))?\s*:'
    )
    for t in lines[start + 1 :]:
        h = head.match(t.strip())
        if not h:
            continue
        name, pre = h.group(1).strip(' .'), h.group(2)
        forms = [name] if not pre else [f'{pre.strip(" -")} {name}', f'{pre.strip(" -")}{name.lower()}']
        for f in forms:
            names.setdefault(key(f), f)
        for c in (h.group(3) or '').split(','):
            if key(c):
                counties.add(key(c))
    return names, counties


def misread(days, gaz, index, report):
    """Put the names the OCR misread right by the index of places or by the days around (above)."""
    found = {}
    for _, names, _ in days:
        for n, _ in names:
            if n not in found:
                found[n] = bool(gaz.lookup(n)[0])
    for n in [n for n, ok in found.items() if not ok]:
        close = difflib.get_close_matches(key(n), list(index), n=1, cutoff=0.85)
        if close and close[0] != key(n) and gaz.lookup(index[close[0]])[0]:
            found[n] = index[close[0]]
            report['names_by_index'] += 1
    for i, (_, names, _) in enumerate(days):
        for name in names:
            n = name[0]
            if isinstance(found[n], str):
                name[0] = found[n]
                continue
            if found[n]:
                continue
            near = [m for d in days[max(0, i - 3) : i + 4] for m, _ in d[1] if found.get(m) is True]
            ratio = {m: difflib.SequenceMatcher(None, key(n), key(m)).ratio() for m in near}
            best = max(ratio, key=ratio.get, default=None)
            if best and ratio[best] >= 0.7:
                name[0] = best
                report['names_by_neighbour'] += 1


def main(text_path, geonames_path, out_path):
    with open(text_path, encoding='utf-8') as f:
        lines = f.read().split('\n')
    days, report, odd = parse(lines)
    index, counties = index_names(lines)
    report['index_names'], report['index_counties'] = len(index), len(counties)
    county = ''
    for d in days:
        d[1], county = places_of(d[1], index, counties | COUNTIES, county, report)
        # OWN RULE: the book names one place a day, two where the king moved on; more are a column of places the OCR
        # read apart from its days (February 1288), whose days cannot be told
        if len(d[1]) > 2:
            report['entries_read_apart'] += 1
            d[1] = []
    days = [d for d in days if d[0] <= REIGN_END]
    report['days'] = len(days)
    report['days_with_a_place'] = sum(1 for d in days if d[1])
    gaz = Gazetteer(geonames_path)
    misread(days, gaz, index, report)
    dated = [(f'{y:04d}-{m:02d}-{d:02d}', julian_day(y, m, d), names) for (y, m, d), names, _ in days]
    stops, unplaced = place_days(dated, gaz, report)
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
        'kings': [
            {
                'key': 'Q57798',
                'name': 'Edward I',
                'from': dated[0][0],
                'to': '{:04d}-{:02d}-{:02d}'.format(*REIGN_END),
                'stops': rows,
            }
        ],
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps(dict(report), indent=1))
    print(f'{len(places)} places; first day {dated[0][0]}, last {dated[-1][0]}')
    print('odd lines (first 60):', *odd[:60], sep='\n  ')
    print('days left out by why:', dict(Counter(why for _, _, why in unplaced)))
    names = Counter((n, why) for _, n, why in unplaced)
    print(
        'names of the days left out (most days first, 80):',
        *[f'{c} {n} ({why})' for (n, why), c in names.most_common(80)],
        sep='\n  ',
    )


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
