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
        """The places that bear a name: those whose own name it is, else those with it as another name."""
        for table in (self.own, self.other):
            for v in variants(name):
                if v in table:
                    return [self.at[i] for i in table[v]]
        return []

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
                    if s > best_like or (s == best_like and best and detour(p, ends) < detour(best, ends)):
                        best, best_like = p, s
        return best


def reach(p, end):
    return end is None or km(p, end[0]) <= HASTE_KM_PER_DAY * max(end[1], 1)


def detour(p, ends):
    if len(ends) == 2:
        return km(p, ends[0][0]) + km(p, ends[1][0]) - km(ends[0][0], ends[1][0])
    return km(p, ends[0][0])


def within(p, before, after):
    ends = [e for e in (before, after) if e]
    return reach(p, before) and reach(p, after) and detour(p, ends) <= (DETOUR_KM if len(ends) == 2 else DETOUR_KM / 2)


def one_place(cands):
    """The place of a name all whose bearers lie together (the most populous of them), else None."""
    top = max(cands, key=lambda c: c[2])
    return top if all(km(top, c) <= ONE_PLACE_KM for c in cands) else None


def place_days(days, gaz, report):
    """The place of each day of an itinerary: days are (date, day number, [names in the order of the day]); returns
    (date, name, lat, lon) for the days placed, and the days left out. The day goes to the last of its names that can
    be placed."""
    cands, unplaced = {}, []
    for _, _, names in days:
        for n in names:
            if n not in cands:
                cands[n] = gaz.lookup(n)
    # the days whose last name found only one place can bear, while each is within reach of the one before or after
    anchor = []
    for _, _, names in days:
        found = [n for n in names if cands[n]]
        anchor.append(one_place(cands[found[-1]]) if found else None)
    for _ in range(20):
        idx = [i for i, a in enumerate(anchor) if a]
        bad = [
            i
            for j, i in enumerate(idx)
            if j > 0
            and j + 1 < len(idx)
            and not reach(anchor[i], (anchor[idx[j - 1]], days[i][1] - days[idx[j - 1]][1]))
            and not reach(anchor[i], (anchor[idx[j + 1]], days[idx[j + 1]][1] - days[i][1]))
        ]
        if not bad:
            break
        report['anchors_out_of_reach'] += len(bad)
        for i in bad:
            anchor[i] = None
    idx = [i for i, a in enumerate(anchor) if a]
    out, k = [], 0
    for i, (date, day, names) in enumerate(days):
        while k < len(idx) and idx[k] < i:
            k += 1
        if anchor[i]:
            out.append((date, last_found(names, cands), round(anchor[i][0], 4), round(anchor[i][1], 4)))
            continue
        b = idx[k - 1] if k > 0 else None
        a = idx[k] if k < len(idx) else None
        before = (anchor[b], day - days[b][1]) if b is not None else None
        after = (anchor[a], days[a][1] - day) if a is not None else None
        ends = [e for e in (before, after) if e]
        for n in reversed(names):
            ok = [c for c in cands[n] if reach(c, before) and reach(c, after)]
            if ok:
                p = min(ok, key=lambda c: detour(c, ends) if ends else -c[2])
                report['days_by_nearness'] += 1
                break
            p = gaz.near(n, before, after)
            if p:
                report['days_by_like_name_nearby'] += 1
                break
        else:
            if names:
                unplaced.append(f'{date} {" / ".join(names)}')
            continue
        out.append((date, n, round(p[0], 4), round(p[1], 4)))
    report['days_unplaced'] = len(unplaced)
    return out, unplaced


def last_found(names, cands):
    return [n for n in names if cands[n]][-1]
