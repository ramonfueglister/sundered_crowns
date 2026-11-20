"""The places of an itinerary on the map, from GeoNames (used by tools/history/itineraries/gough.py).

A name is looked for among the names GeoNames gives a place: first their own names, then their other names. Where
several places bear it, the one is taken that lies nearest the days around it that only one place can be: the reading
of the names that grounds them all in the smallest region is the likeliest (Leidner, Sinclair & Webber 2003,
"Grounding spatial named entities for information extraction and question answering", sec. 3). A place must lie
within the king's reach from the days on both sides of it at the pace in haste, 56 km a day (Ludwig 1897,
"Untersuchungen über die Reise- und Marschgeschwindigkeit im XII. und XIII. Jahrhundert", p. 20; ORBIS routine
horseback; the pace of src/sim/content/travel.ts), and in the county the book puts it in (OWN RULE: near the other
places the book puts in that county). A name not found, or found only out of reach or out of its county, is looked for
among the places within reach whose names are like it, and of those the one nearest the way is taken, by the same rule
of the smallest region (OWN RULE: the book spells some places as the records do, Bambrough for Bamburgh, and the OCR
spoils letters); a day still without a place is left out and counted.
"""

import difflib
import functools
import math
import re
import unicodedata
from collections import Counter, defaultdict

#: km a day of a king in haste (above)
HASTE_KM_PER_DAY = 56
#: places of one name nearer each other than this are one place (OWN RULE: the size of a parish with its hamlets)
ONE_PLACE_KM = 25
#: how far off the straight way between the days around it a place with a like name may lie, and how like the names
#: must be (OWN RULE: a day's ride at the court's pace, 30 km, out and back with a margin; one letter in five)
DETOUR_KM = 100
LIKE = 0.8
#: a place the book puts in a county lies within COUNTY_KM of another place it puts there that only one place can be,
#: where it puts COUNTY_MIN such places there (OWN RULE: an English shire is 50 to 100 km across; three places outline
#: it)
COUNTY_KM = 60
COUNTY_MIN = 3
#: stays of one name within a month of each other are at one place: one sense per discourse (Gale, Church & Yarowsky
#: 1992, "One sense per discourse", Proceedings of the DARPA Speech and Natural Language Workshop; OWN RULE: a month is
#: the discourse)
SAME_NAME_DAYS = 30
#: GeoNames features a medieval king stayed at besides places: castles, abbeys and priories, churches, houses, ruins
FEATURES = {'CSTL', 'MSTY', 'CH', 'RUIN', 'HSEC', 'HSE', 'PAL', 'EST', 'ANS', 'MNMT', 'ISL'}
#: words GeoNames adds to the name of a house or a ruin that the book leaves out, and the French words it puts before
#: one ('Le Gard', the Abbaye du Gard)
ADDED = ('castle', 'abbey', 'priory', 'manor', 'house', 'park', 'palace', 'hall')
ADDED_BEFORE = tuple(f'{w} {a}' for w in ('abbaye', 'chateau', 'prieure') for a in ('de', 'du', 'de la', 'des', 'd'))


def key(name):
    """A name for matching: without accents, dots, apostrophes and hyphens, 'saint' as 'st'."""
    s = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"[.'’`\"]", '', s)
    s = re.sub(r'[-–/]', ' ', s)
    s = re.sub(r'\bsaint\b', 'st', s)
    return re.sub(r'\s+', ' ', s).strip()


@functools.cache
def variants(name):
    """The keys a name of the book may have in GeoNames: the book keeps the French article of some English places
    ('La Rose', Rose Castle); it writes a saint's place with and without the possessive ('St. Andrew', 'St. Andrew's',
    Saint Andrews); the OCR sets the first letter apart ('H olme-Cultram')."""
    k = key(name.split(',')[0])
    k = re.sub(r'^([a-z]) (?=[a-z])', r'\1', k)
    bare = re.sub(r'^(?:the|la|le|les) ', '', k)
    out = [k, re.sub(r'\s*\(.*?\)', '', k), bare, k.replace(' on ', ' upon '), k.replace(' ', '')]
    if k.startswith('st '):
        out.append(k[:-1] if k.endswith('s') else k + 's')
    for b in dict.fromkeys((k, bare)):
        out += [b[: -len(w) - 1] for w in ADDED if b.endswith(' ' + w)]
        out += [f'{b} {w}' for w in ADDED]
    out += [f'{w} {bare}' for w in ADDED_BEFORE]
    return tuple(dict.fromkeys(v for v in out if v))


def same_name(a, b):
    """Whether two names of the book are one name (some form of them is the same)."""
    return a == b or not set(variants(a)).isdisjoint(variants(b))


def km(a, b):
    p = math.pi / 180
    h = (
        math.sin((b[0] - a[0]) * p / 2) ** 2
        + math.cos(a[0] * p) * math.cos(b[0] * p) * math.sin((b[1] - a[1]) * p / 2) ** 2
    )
    return 12742 * math.asin(math.sqrt(h))


def like(g, e, words=True):
    """How like a name of the book (key g) is a name of GeoNames (key e): 1 the same, 0.95 where the words of the one
    are among those of the other ('Melford', 'Long Melford'), 0.9 where the book's words begin the other's
    ('Hav atte B', 'Havering atte Bower'), else the share of letters in common, of the whole name or (where words) for
    a name of one word, of one word of the other ('Shene', 'East Sheen')."""
    if g == e:
        return 1.0
    gw, ew = g.split(), e.split()
    if len(e) >= 5 and len(g) >= 5 and (set(gw) <= set(ew) or set(ew) <= set(gw)):
        return 0.95
    if len(gw) == len(ew) > 1 and all(b.startswith(a) for a, b in zip(gw, ew)):
        return 0.9
    one = ew if words and len(gw) == 1 < len(ew) and len(g) >= 5 else []
    return max([ratio(g, e)] + [ratio(g, w) for w in one])


def ratio(a, b):
    m = difflib.SequenceMatcher(None, a, b)
    return m.ratio() if m.real_quick_ratio() >= LIKE and m.quick_ratio() >= LIKE else 0.0


class Gazetteer:
    """The places of GeoNames (a cut of the dumps: id, name, asciiname, alternatenames, lat, lon, class, code,
    country, admin1, admin2, population), by name and by cell of half a degree; now_called gives a place the book
    names (by its key) under the name GeoNames knows it by."""

    def __init__(self, path, now_called=None):
        self.now_called = now_called or {}
        self.at, self.names, self.own_names, self.settled, self.church = [], [], [], [], []
        self.own, self.other, self.cells = defaultdict(list), defaultdict(list), defaultdict(list)
        with open(path, encoding='utf-8') as f:
            for line in f:
                c = line.rstrip('\n').split('\t')
                # OWN RULE: an English civil parish (ADM3) bears the name of the manor or village it grew from, and is
                # at times the only trace of one (Clarendon Park, the parish of the palace of Clarendon)
                if len(c) < 12 or not (c[6] == 'P' or c[7] in FEATURES or (c[7] == 'ADM3' and c[8] == 'GB')):
                    continue
                i = len(self.at)
                lat, lon = float(c[4]), float(c[5])
                self.at.append((lat, lon, int(c[11] or 0)))
                self.settled.append(c[6] in ('P', 'A'))
                self.church.append(c[7] == 'CH')
                own = {key(c[1]), key(c[2])}
                other = {key(n) for n in c[3].split(',') if n} - own
                self.names.append(tuple(own | other))
                self.own_names.append(tuple(own))
                for k in own:
                    self.own[k].append(i)
                for k in other:
                    self.other[k].append(i)
                self.cells[(math.floor(lat * 2), math.floor(lon * 2))].append(i)

    def lookup(self, name):
        """The places that bear a name in any of its forms (variants): those whose own name it is, else those with it
        as another name; whether it is their own name; and of them the towns, villages and parishes (all of them where
        none is one), which a stay is sure of where they lie together. A church is one of them only where nothing else
        bears the name (OWN RULE: a church bears the name of its saint, the king lodged in a town, a castle, an abbey or
        a house; 'St. Andrew's' is the town in Fife, not the church of Cheddar)."""
        forms = list(variants(name))
        forms += [v for f in forms if f in self.now_called for v in variants(self.now_called[f])]
        for own, table in ((True, self.own), (False, self.other)):
            every = sorted({i for v in forms for i in table.get(v, ())})
            every = [i for i in every if not self.church[i]] or every
            if every:
                towns = [i for i in every if self.settled[i]] or every
                return [self.at[i] for i in every], own, [self.at[i] for i in towns]
        return [], False, []

    def near(self, name, before, after, fits):
        """The place near the way between the stays around (before, after: (place, days) or None), for which
        fits(place) holds (within reach, in its county), whose name is like the name of the book, at least LIKE, and
        that lies nearest the way (the likest of those that lie as near); None where there is none. Where the two lie
        far apart (a crossing of the sea, a gap of weeks), the way is the nearer of them in days alone. One word of a
        longer name is compared only with a place's own names: its other names hold transliterations ('sheng zhan mu
        si', St James's)."""
        ends = [e for e in (before, after) if e]
        if len(ends) == 2 and km(ends[0][0], ends[1][0]) > 3 * DETOUR_KM:
            ends = [min(ends, key=lambda e: e[1])]
        if not ends:
            return None
        lat0 = min(e[0][0] for e in ends) - DETOUR_KM / 111
        lat1 = max(e[0][0] for e in ends) + DETOUR_KM / 111
        dlon = DETOUR_KM / (111 * math.cos(math.radians((lat0 + lat1) / 2)))
        lon0, lon1 = min(e[0][1] for e in ends) - dlon, max(e[0][1] for e in ends) + dlon
        detour_limit = DETOUR_KM if len(ends) == 2 else DETOUR_KM / 2
        g, best, best_detour, best_like = key(name.split(',')[0]), None, math.inf, 0.0
        for cy in range(math.floor(lat0 * 2), math.floor(lat1 * 2) + 1):
            for cx in range(math.floor(lon0 * 2), math.floor(lon1 * 2) + 1):
                for i in self.cells.get((cy, cx), ()):
                    p = self.at[i]
                    if detour(p, ends) > detour_limit or not fits(p):
                        continue
                    s = max([like(g, e) for e in self.own_names[i]] + [like(g, e, False) for e in self.names[i]])
                    if s < LIKE:
                        continue
                    d = detour(p, ends)
                    if best is None or d < best_detour or (d == best_detour and s > best_like):
                        best, best_detour, best_like = p, d, s
        return best


def reach(p, end):
    return end is None or km(p, end[0]) <= HASTE_KM_PER_DAY * max(end[1], 1)


def detour(p, ends):
    if len(ends) == 2:
        return km(p, ends[0][0]) + km(p, ends[1][0]) - km(ends[0][0], ends[1][0])
    return km(p, ends[0][0])


def reachable(p, before, after):
    """Whether the king can be at p coming from the stay before and going on to the stay after; from one of them
    where the two are out of each other's reach (the one of them is wrong, and src/sim/content/travel.ts
    reachableStops keeps the stay more days name)."""
    if before and after and km(before[0], after[0]) > HASTE_KM_PER_DAY * max(before[1] + after[1], 1):
        return reach(p, before) or reach(p, after)
    return reach(p, before) and reach(p, after)


def one_place(cands):
    """The place of a name all whose bearers lie together (the most populous of them), else None."""
    top = max(cands, key=lambda c: c[2])
    return top if all(km(top, c) <= ONE_PLACE_KM for c in cands) else None


def in_county(p, region):
    """Whether p can lie in a county, region the places the book puts in it that only one place can be (above)."""
    others = [q for q in region if q != p]
    return len(others) < COUNTY_MIN or any(km(p, q) <= COUNTY_KM for q in others)


def place_days(days, gaz, report):
    """The place of each day of an itinerary: days are (date, day number, [(name, county key or '') in the order of
    the day]); returns (date, name, lat, lon) for the days placed, and (date, name, why) for the days left out. A day
    goes by the last of its names that is found; days one after the other under one name are one stay and are placed
    together. First the stays whose name only one place bears (as its own name) are placed, where that place lies in
    the county the book names, and those of them out of each other's reach are thinned as the game thins an
    itinerary; then the others by the nearest of those, then each again by the stays placed around it."""
    found = {}
    for _, _, names in days:
        for n, _ in names:
            if n not in found:
                found[n] = gaz.lookup(n)
    stays = []
    for date, day, names in days:
        if not names:
            continue
        name, county = ([nc for nc in names if found[nc[0]][0]] or names)[-1]
        if not stays or stays[-1]['name'] != name:
            stays.append({'name': name, 'days': [], 'counties': Counter(), 'at': None, 'sure': False})
        stays[-1]['days'].append((date, day))
        if county:
            stays[-1]['counties'][county] += 1
    for s in stays:
        s['county'] = s['counties'].most_common(1)[0][0] if s['counties'] else ''
        _, own, towns = found[s['name']]
        s['at'] = one_place(towns) if own and towns else None
        s['sure'] = s['known'] = s['at'] is not None
    regions = counties(stays)
    for s in [s for s in stays if s['sure'] and not in_county(s['at'], regions.get(s['county'], ()))]:
        for t in stays:
            if t['sure'] and same_name(t['name'], s['name']) and apart(s, t) <= SAME_NAME_DAYS:
                t['at'], t['sure'] = None, False
                report['stays_out_of_county'] += 1
    for s in thin([s for s in stays if s['sure']]):
        s['at'], s['sure'], s['why'] = None, False, 'out of reach of the stays around'
        report['stays_out_of_reach'] += 1
    regions = counties(stays)
    for by in ('sure', 'at'):
        for i, s in enumerate(stays):
            if not s['sure']:
                place(s, i, stays, by, found[s['name']][0], regions.get(s['county'], ()), gaz, report)
    one_sense(stays, regions, report)
    # the itinerary as the game will thin it (src/sim/content/travel.ts reachableStops), so that the file holds no
    # step the game leaves out
    for s in thin([s for s in stays if s['at']]):
        s['at'], s['why'] = None, 'out of reach of the stays around'
        report['stays_thinned'] += 1
    out, unplaced = [], []
    for s in stays:
        if not s['at'] and 'why' not in s:
            cands, region = found[s['name']][0], regions.get(s['county'], ())
            nearest = min((km(c, q) for c in cands for q in region), default=0)
            s['why'] = (
                'no such place, none like it nearby'
                if not cands
                else f'out of its county {s["county"]!r} ({len(region)} places, nearest {nearest:.0f} km)'
                if not any(in_county(c, region) for c in cands)
                else 'out of reach'
            )
        for date, _ in s['days']:
            if s['at']:
                out.append((date, s['name'], round(s['at'][0], 4), round(s['at'][1], 4)))
            else:
                unplaced.append((date, s['name'], s['why']))
    report['stays'] = len(stays)
    report['stays_by_one_place'] = sum(s['sure'] for s in stays)
    report['days_unplaced'] = len(unplaced)
    return out, unplaced


def place(s, i, stays, by, cands, region, gaz, report):
    """Place stay s (stays[i]) by the stays around it that are placed (by 'sure': only those sure of their place): at
    the place of a stay of its name within SAME_NAME_DAYS, else at the place of its name nearest the way between them,
    else at the likest name near it; each first within reach of both, then within reach of those as many days name
    (as src/sim/content/travel.ts reachableStops, a stay fewer days name gives way where two contradict). A place of
    the name comes before a like name: the name is the book's word, the likeness a guess; and a name only one place
    bears is never taken for a like name (OWN RULE: the likeness is for names the gazetteer does not know or knows
    only far off; a day out of reach of the one place of its name is a wrong day, not a wrong name: Jedburgh in
    August 1304, between Stirling and Perth, is not Edinburgh)."""
    prev = next((t for t in reversed(stays[:i]) if t[by]), None)
    nxt = next((t for t in stays[i + 1 :] if t[by]), None)
    before, after = prev and around(s, prev, -1), nxt and around(s, nxt, 1)
    longer = (
        before if prev and len(prev['days']) >= len(s['days']) else None,
        after if nxt and len(nxt['days']) >= len(s['days']) else None,
    )
    ends = [e for e in (before, after) if e]
    same = [
        t['at']
        for t in stays
        if t is not s and t['at'] and same_name(t['name'], s['name']) and apart(s, t) <= SAME_NAME_DAYS
    ]
    for rb, ra in ((before, after), longer):

        def fits(p, rb=rb, ra=ra):
            return reachable(p, rb, ra) and in_county(p, region)

        ok = [c for c in same if fits(c)] or [c for c in cands if fits(c)]
        if ok:
            s['at'] = min(ok, key=lambda c: detour(c, ends) if ends else -c[2])
            if by == 'at':
                report['stays_by_nearness'] += 1
            return
    for rb, ra in ((before, after), longer) if not s['known'] else ():
        near = gaz.near(s['name'], before, after, lambda p, rb=rb, ra=ra: reachable(p, rb, ra) and in_county(p, region))
        if near:
            s['at'] = near
            if by == 'at':
                report['stays_by_like_name_nearby'] += 1
            return
    if by == 'sure':
        s['at'] = None


def one_sense(stays, regions, report):
    """One name, one place within SAME_NAME_DAYS (above), whatever the order the stays were placed in: where the
    placed stays of a name a month apart at most (a discourse) lie at more than one place, all of them go to the one
    of those places that every one of them can be at, coming from the stays placed around the discourse and going on
    to them, and in its county; of several, the one nearest the ways ('Oleron' in autumn 1288 is Oloron in Béarn, not
    the Île d'Oléron)."""
    placed = [(i, s) for i, s in enumerate(stays) if s['at']]
    discourses = []
    for i, s in placed:
        d = next((d for d in reversed(discourses) if same_name(d[-1][1]['name'], s['name'])), None)
        if d and apart(d[-1][1], s) <= SAME_NAME_DAYS:
            d.append((i, s))
        else:
            discourses.append([(i, s)])
    for d in discourses:
        at = list(dict.fromkeys(s['at'] for _, s in d))
        if len(at) < 2:
            continue
        inside, ends = {i for i, _ in d}, []
        for i, s in d:
            prev = next((t for k, t in reversed(placed) if k < i and k not in inside), None)
            nxt = next((t for k, t in placed if k > i and k not in inside), None)
            ends.append((prev and around(s, prev, -1), nxt and around(s, nxt, 1), regions.get(s['county'], ())))
        ok = [p for p in at if all(reachable(p, b, a) and in_county(p, r) for b, a, r in ends)]
        if not ok:
            continue
        best = min(ok, key=lambda p: sum(detour(p, [e for e in (b, a) if e]) for b, a, _ in ends if b or a))
        for _, s in d:
            if s['at'] != best:
                s['at'] = best
                report['stays_by_one_sense'] += 1


def thin(sure):
    """The stays of sure (in their order) that src/sim/content/travel.ts reachableStops leaves out: where the king
    could not have gone from one stay to the next at the pace in haste, even on the straight line, the one with fewer
    days, of two with as many the one without which the way from the stay before them to the stay after them is the
    shorter; a stay at the place of the one before it, once a stay between them is left out, is one stay with it."""
    groups, out = [[s] for s in sure], []

    def km_between(a, b):
        return km(a[0]['at'], b[0]['at']) if a and b else 0

    changed = True
    while changed:
        changed, kept = False, []
        for k, g in enumerate(groups):
            before = kept[-1] if kept else None
            if before and km_between(before, g) > HASTE_KM_PER_DAY * (g[0]['days'][0][1] - before[-1]['days'][-1][1]):
                changed = True
                earlier, after = (kept[-2] if len(kept) > 1 else None), (groups[k + 1] if k + 1 < len(groups) else None)
                nb, ng = sum(len(s['days']) for s in before), sum(len(s['days']) for s in g)
                drop_before = (
                    nb < ng
                    if nb != ng
                    else km_between(earlier, g) + km_between(g, after)
                    < km_between(earlier, before) + km_between(before, after)
                )
                if not drop_before:
                    out += g
                    continue
                out += kept.pop()
            if kept and kept[-1][0]['at'] == g[0]['at']:
                kept[-1] += g
            else:
                kept.append(g)
        groups = kept
    return out


def counties(stays):
    """The places of each county that only one place can be, by the county's key."""
    regions = defaultdict(set)
    for s in stays:
        if s['sure'] and s['county']:
            regions[s['county']].add(s['at'])
    return regions


def apart(s, t):
    """The days between two stays (0 where they touch)."""
    return max(t['days'][0][1] - s['days'][-1][1], s['days'][0][1] - t['days'][-1][1], 0)


def around(s, t, side):
    """The stay t before (side -1) or after (side 1) the stay s, as (its place, the days between)."""
    gap = s['days'][0][1] - t['days'][-1][1] if side < 0 else t['days'][0][1] - s['days'][-1][1]
    return (t['at'], gap)
