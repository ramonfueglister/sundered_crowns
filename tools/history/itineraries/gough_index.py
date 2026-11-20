"""The book's index of places in Gough's itinerary of Edward I (used by tools/history/itineraries/gough.py): the names
it gives, by which the OCR's misreadings are put right, and the counties it names."""

import difflib
import re

from gazetteer import key

INDEX = re.compile(r'^This\s+Index\s+is\s+in\s+four\s+divisions')
#: one county under two keys
SAME_COUNTY = {'beam': 'bearn'}


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
