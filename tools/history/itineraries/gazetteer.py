"""The places of an itinerary on the map, from GeoNames (used by tools/history/itineraries/gough.py).

A name is looked for among the names GeoNames gives a place: first their own names, then their other names. Where
several places bear it, the one is taken that lies nearest the days around it that only one place can be: the reading
of the names that grounds them all in the smallest region is the likeliest (Leidner, Sinclair & Webber 2003,
"Grounding spatial named entities for information extraction and question answering", sec. 3). A place must lie
within the king's reach from the days around it at the pace in haste, 56 km a day (Ludwig 1897, "Untersuchungen über
die Reise- und Marschgeschwindigkeit im XII. und XIII. Jahrhundert", p. 20; ORBIS routine horseback; the pace of
src/sim/content/travel.ts). A name not found, or found only out of reach, is looked for among the places within
reach whose names are like it (OWN RULE: the book spells some places as the records do, Bambrough for Bamburgh, and
the OCR spoils letters); a day still without a place is left out and counted.
"""

import difflib
import math
import re
import unicodedata
from collections import defaultdict

#: km a day of a king in haste (above)
HASTE_KM_PER_DAY = 56
#: places of one name nearer each other than this are one place (OWN RULE: the size of a parish with its hamlets)
ONE_PLACE_KM = 25
#: how far off the straight way between the days around it a place with a like name may lie, and how like the names
#: must be (OWN RULE: a day's ride at the court's pace, 30 km, out and back with a margin; one letter in five)
DETOUR_KM = 100
LIKE = 0.8
#: GeoNames features a medieval king stayed at besides places: castles, abbeys and priories, churches, houses, ruins
FEATURES = {'CSTL', 'MSTY', 'CH', 'RUIN', 'HSEC', 'HSE', 'PAL', 'EST', 'ANS', 'MNMT', 'ISL'}
#: words GeoNames adds to the name of a house or a ruin that the book leaves out
ADDED = ('castle', 'abbey', 'priory', 'manor', 'house', 'park', 'palace', 'hall')


def key(name):
    """A name for matching: without accents, dots, apostrophes and hyphens, 'saint' as 'st'."""
    s = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"[.'’`\"]", '', s)
    s = re.sub(r'[-–/]', ' ', s)
    s = re.sub(r'\bsaint\b', 'st', s)
    return re.sub(r'\s+', ' ', s).strip()


def variants(name):
    """The keys a name of the book may have in GeoNames."""
    first = name.split(',')[0]
    k = key(first)
    out = [k, re.sub(r'\s*\(.*?\)', '', k), re.sub(r'^the ', '', k), k.replace(' on ', ' upon '), k.replace(' ', '')]
    out += [k[: -len(w) - 1] for w in ADDED if k.endswith(' ' + w)]
    out += [f'{k} {w}' for w in ADDED]
    return list(dict.fromkeys(v for v in out if v))


def km(a, b):
    p = math.pi / 180
    h = (
        math.sin((b[0] - a[0]) * p / 2) ** 2
        + math.cos(a[0] * p) * math.cos(b[0] * p) * math.sin((b[1] - a[1]) * p / 2) ** 2
    )
    return 12742 * math.asin(math.sqrt(h))


def like(g, e):
    """How like a name of the book (key g) is a name of GeoNames (key e): 1 the same, 0.95 where the words of the one
    are among those of the other ('Melford', 'Long Melford'), 0.9 where the book's words begin the other's
    ('Hav atte B', 'Havering atte Bower'), else the share of letters in common."""
    if g == e:
        return 1.0
    gw, ew = g.split(), e.split()
    if len(e) >= 5 and len(g) >= 5 and (set(gw) <= set(ew) or set(ew) <= set(gw)):
        return 0.95
    if len(gw) == len(ew) > 1 and all(b.startswith(a) for a, b in zip(gw, ew)):
        return 0.9
    m = difflib.SequenceMatcher(None, g, e)
    return m.ratio() if m.real_quick_ratio() >= LIKE and m.quick_ratio() >= LIKE else 0.0


class Gazetteer:
    """The places of GeoNames (a cut of the dumps: id, name, asciiname, alternatenames, lat, lon, class, code,
    country, admin1, admin2, population), by name and by cell of half a degree."""

    def __init__(self, path):
        self.at, self.names = [], []
        self.own, self.other, self.cells = defaultdict(list), defaultdict(list), defaultdict(list)
        with open(path, encoding='utf-8') as f:
            for line in f:
                c = line.rstrip('\n').split('\t')
                if len(c) < 12 or (c[6] != 'P' and c[7] not in FEATURES):
                    continue
                i = len(self.at)
                lat, lon = float(c[4]), float(c[5])
                self.at.append((lat, lon, int(c[11] or 0)))
                own = {key(c[1]), key(c[2])}
                other = {key(n) for n in c[3].split(',') if n} - own
                self.names.append(tuple(own | other))
                for k in own:
                    self.own[k].append(i)
                for k in other:
                    self.other[k].append(i)
                self.cells[(math.floor(lat * 2), math.floor(lon * 2))].append(i)

    def lookup(self, name):
        """The places that bear a name: those whose own name it is, else those with it as another name; and whether
        it is their own name."""
        for own, table in ((True, self.own), (False, self.other)):
            for v in variants(name):
                if v in table:
                    return [self.at[i] for i in table[v]], own
        return [], False

    def near(self, name, before, after):
        """The place within reach of the days around (before, after: (place, days) or None) whose name is likest the
        name of the book, at least LIKE; None where there is none."""
        ends = [e for e in (before, after) if e]
        if not ends or (len(ends) == 2 and km(ends[0][0], ends[1][0]) > 3 * DETOUR_KM):
            return None
        lat0 = min(e[0][0] for e in ends) - DETOUR_KM / 111
        lat1 = max(e[0][0] for e in ends) + DETOUR_KM / 111
        dlon = DETOUR_KM / (111 * math.cos(math.radians((lat0 + lat1) / 2)))
        lon0, lon1 = min(e[0][1] for e in ends) - dlon, max(e[0][1] for e in ends) + dlon
        g, best, best_like = key(name.split(',')[0]), None, LIKE
        for cy in range(math.floor(lat0 * 2), math.floor(lat1 * 2) + 1):
            for cx in range(math.floor(lon0 * 2), math.floor(lon1 * 2) + 1):
                for i in self.cells.get((cy, cx), ()):
                    p = self.at[i]
                    if not within(p, before, after):
                        continue
                    s = max(like(g, e) for e in self.names[i])
                    if s > best_like or (s == best_like and (not best or detour(p, ends) < detour(best, ends))):
                        best, best_like = p, s
        return best


def reach(p, end):
    return end is None or km(p, end[0]) <= HASTE_KM_PER_DAY * max(end[1], 1)


def detour(p, ends):
    if len(ends) == 2:
        return km(p, ends[0][0]) + km(p, ends[1][0]) - km(ends[0][0], ends[1][0])
    return km(p, ends[0][0])


def reachable(p, before, after):
    """Whether the king can be at p coming from the stay before or going on to the stay after (where the two
    contradict each other, src/sim/content/travel.ts reachableStops keeps the stay more days name)."""
    return (
        (before is None and after is None)
        or (before is not None and reach(p, before))
        or (after is not None and reach(p, after))
    )


def within(p, before, after):
    ends = [e for e in (before, after) if e]
    return reachable(p, before, after) and detour(p, ends) <= (DETOUR_KM if len(ends) == 2 else DETOUR_KM / 2)


def one_place(cands):
    """The place of a name all whose bearers lie together (the most populous of them), else None."""
    top = max(cands, key=lambda c: c[2])
    return top if all(km(top, c) <= ONE_PLACE_KM for c in cands) else None


def place_days(days, gaz, report):
    """The place of each day of an itinerary: days are (date, day number, [names in the order of the day]); returns
    (date, name, lat, lon) for the days placed, and the days left out. A day goes by the last of its names that is
    found; days one after the other under one name are one stay and are placed together. First the stays whose name
    only one place bears (as its own name) are placed, then the others by the nearest of those, then each again by the
    stays placed around it."""
    found = {}
    for _, _, names in days:
        for n in names:
            if n not in found:
                found[n] = gaz.lookup(n)
    stays = []
    for date, day, names in days:
        if not names:
            continue
        name = ([n for n in names if found[n][0]] or names)[-1]
        if stays and stays[-1]['name'] == name:
            stays[-1]['days'].append((date, day))
        else:
            stays.append({'name': name, 'days': [(date, day)], 'at': None, 'sure': False})
    for s in stays:
        cands, own = found[s['name']]
        s['at'] = one_place(cands) if own and cands else None
        s['sure'] = s['at'] is not None
    for _ in range(20):
        sure = [s for s in stays if s['sure']]
        bad = [
            s
            for j, s in enumerate(sure)
            if 0 < j < len(sure) - 1
            and not reachable(s['at'], around(s, sure[j - 1], -1), around(s, sure[j + 1], 1))
            and len(s['days']) <= max(len(sure[j - 1]['days']), len(sure[j + 1]['days']))
        ]
        if not bad:
            break
        report['stays_out_of_reach'] += len(bad)
        for s in bad:
            s['at'], s['sure'] = None, False
    for by in ('sure', 'at'):
        for i, s in enumerate(stays):
            if s['sure']:
                continue
            before = next((around(s, t, -1) for t in reversed(stays[:i]) if t[by]), None)
            after = next((around(s, t, 1) for t in stays[i + 1 :] if t[by]), None)
            ends = [e for e in (before, after) if e]
            ok = [c for c in found[s['name']][0] if reachable(c, before, after)]
            near = None if ok else gaz.near(s['name'], before, after)
            if ok:
                s['at'] = min(ok, key=lambda c: detour(c, ends) if ends else -c[2])
            elif near or by == 'sure':
                s['at'] = near
            if by == 'at' and s['at']:
                report['stays_by_nearness' if ok else 'stays_by_like_name_nearby'] += 1
    out, unplaced = [], []
    for s in stays:
        for date, _ in s['days']:
            if s['at']:
                out.append((date, s['name'], round(s['at'][0], 4), round(s['at'][1], 4)))
            else:
                unplaced.append(f'{date} {s["name"]}')
    report['stays'] = len(stays)
    report['stays_by_one_place'] = sum(s['sure'] for s in stays)
    report['days_unplaced'] = len(unplaced)
    return out, unplaced


def around(s, t, side):
    """The stay t before (side -1) or after (side 1) the stay s, as (its place, the days between)."""
    gap = s['days'][0][1] - t['days'][-1][1] if side < 0 else t['days'][0][1] - s['days'][-1][1]
    return (t['at'], gap)
