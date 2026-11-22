"""The families of the persons of the chronicle of rulers, from Wikidata (data/history/rulers/wikidata/families/).

A crown whose heir of history the world did not let be born goes to the next of kin (src/sim/systems/rulers.ts), and
most of the kin never reigned: the chronicle alone does not know them. This walks the family from every person of the
chronicle with a Wikidata id, along father (P22), mother (P25) and child (P40, and the P22/P25 of the child), up to
`--hops` steps, and writes every human it meets with sex, birth and death (and their precision), parents, spouses
(P26, not walked) and family (P53). The Wikidata Query Service refuses the cloud, so this runs on another computer;
only its result is kept in the repository.

    python3 tools/history/rulers/families.py public/data/rulers_1291.json data/history/rulers/wikidata/families \
        --cache ~/Coding/sundered_crowns-data/wikidata_families

Rules:
- A person met on the way is kept when Wikidata says it is a human (P31 Q5) and its birth year, or else its death
  year, lies in FIRST_YEAR..LAST_YEAR; a person with neither is kept and walked only from a person of the chronicle.
  OWN RULE: the window keeps the walk to the kin who can matter between 1291 and 1848 (a grandparent of a ruler of
  1291 was born after 1100).
- A date keeps the precision Wikidata gives (11 day: YYYY-MM-DD, 10 month: YYYY-MM, 9 year: YYYY); a coarser one
  (decade, century) is no date. Of several values the most precise is kept, then the earliest.
- A child named only by the parent's P40 is the father's or the mother's by the parent's sex.
- Every answer is kept in the cache, so a second run sends nothing it has sent before.
"""

import argparse
import csv
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ENDPOINT = 'https://query.wikidata.org/sparql'
UA = 'research-client/0.1'
FIRST_YEAR, LAST_YEAR = 1100, 1848
MALE, FEMALE = 'Q6581097', 'Q6581072'
#: the Query Service allows about a minute of query time a minute; one request at a time, a pause between them
PAUSE_S = 1.0
BATCH = 250
LANGS = 'en,de,fr,it,es,pt,nl,pl,cs,hu,sv,da,la,mul'

ATTRIBUTES = """SELECT ?p ?human ?sex ?b ?bp ?d ?dp ?fam ?pLabel ?famLabel WHERE {
 VALUES ?p { %s }
 OPTIONAL { ?p wdt:P31 wd:Q5 . BIND(1 AS ?human) }
 OPTIONAL { ?p wdt:P21 ?sex }
 OPTIONAL { ?p p:P569 ?bs . ?bs psv:P569 [ wikibase:timeValue ?b ; wikibase:timePrecision ?bp ] .
            FILTER NOT EXISTS { ?bs wikibase:rank wikibase:DeprecatedRank } }
 OPTIONAL { ?p p:P570 ?ds . ?ds psv:P570 [ wikibase:timeValue ?d ; wikibase:timePrecision ?dp ] .
            FILTER NOT EXISTS { ?ds wikibase:rank wikibase:DeprecatedRank } }
 OPTIONAL { ?p wdt:P53 ?fam }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "%s" . }
}"""
RELATIONS = """SELECT ?p ?rel ?q WHERE {
 VALUES ?p { %s }
 { ?p wdt:P22 ?q . BIND("father" AS ?rel) } UNION
 { ?p wdt:P25 ?q . BIND("mother" AS ?rel) } UNION
 { ?p wdt:P40 ?q . BIND("child" AS ?rel) } UNION
 { ?q wdt:P22 ?p . BIND("child" AS ?rel) } UNION
 { ?q wdt:P25 ?p . BIND("child" AS ?rel) } UNION
 { ?p wdt:P26 ?q . BIND("spouse" AS ?rel) }
}"""


def qid(uri: str) -> str:
    return uri.rsplit('/', 1)[-1]


def ask(query: str, cache: str) -> list[dict]:
    """The rows of a SPARQL query, from the cache when it was sent before."""
    path = os.path.join(cache, hashlib.sha1(query.encode()).hexdigest() + '.json')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            return json.load(f)['results']['bindings']
    body = urllib.parse.urlencode({'query': query, 'format': 'json'}).encode()
    for attempt in range(8):
        req = urllib.request.Request(ENDPOINT, data=body, headers={'User-Agent': UA, 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                text = r.read().decode('utf-8')
            break
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or attempt == 7:
                raise
            wait = float(e.headers.get('Retry-After') or 2**attempt)
            print(f'  {e.code}, waiting {wait:.0f} s', file=sys.stderr)
            time.sleep(wait)
        except (urllib.error.URLError, TimeoutError):
            if attempt == 7:
                raise
            time.sleep(2**attempt)
    time.sleep(PAUSE_S)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    return json.loads(text)['results']['bindings']


def date(value: str, precision: int) -> str:
    """A Wikidata time value cut to its precision ('' when coarser than a year)."""
    sign = '-' if value.startswith('-') else ''
    y, m, d = value.lstrip('+-')[:10].split('-')
    if precision >= 11:
        return f'{sign}{y}-{m}-{d}'
    if precision == 10:
        return f'{sign}{y}-{m}'
    if precision == 9:
        return f'{sign}{y}'
    return ''


def best(dates: set[tuple[int, str]]) -> str:
    """The most precise of several dates (precision, time value), then the earliest."""
    cut = [(-p, date(v, p)) for p, v in dates]
    cut = [c for c in cut if c[1]]
    return min(cut)[1] if cut else ''


def year(d: str) -> int | None:
    if not d:
        return None
    return int(d[:5]) if d.startswith('-') else int(d[:4])


def in_window(p: dict) -> bool | None:
    """Whether a person's life touches the window; None when neither birth nor death is known."""
    y = year(p['birth']) if p['birth'] else year(p['death'])
    return None if y is None else FIRST_YEAR <= y <= LAST_YEAR


def attributes(ids: list[str], cache: str) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for i in range(0, len(ids), BATCH):
        chunk = ids[i : i + BATCH]
        rows = ask(ATTRIBUTES % (' '.join('wd:' + q for q in chunk), LANGS), cache)
        acc: dict[str, dict] = {}
        for r in rows:
            q = qid(r['p']['value'])
            a = acc.setdefault(q, {'human': False, 'sex': set(), 'b': set(), 'd': set(), 'fam': {}, 'label': ''})
            a['human'] |= 'human' in r
            if 'sex' in r:
                a['sex'].add(qid(r['sex']['value']))
            if 'b' in r and 'bp' in r:
                a['b'].add((int(r['bp']['value']), r['b']['value']))
            if 'd' in r and 'dp' in r:
                a['d'].add((int(r['dp']['value']), r['d']['value']))
            if 'fam' in r:
                a['fam'][qid(r['fam']['value'])] = r.get('famLabel', {}).get('value', '')
            a['label'] = a['label'] or r.get('pLabel', {}).get('value', '')
        for q, a in acc.items():
            sex = 'm' if a['sex'] == {MALE} else 'f' if a['sex'] == {FEMALE} else ''
            fams = sorted(a['fam'])
            out[q] = {
                'qid': q,
                'label': a['label'] if a['label'] != q else '',
                'human': a['human'],
                'sex': sex,
                'birth': best(a['b']),
                'death': best(a['d']),
                'family': '|'.join(fams),
                'familyLabel': '|'.join(a['fam'][f] for f in fams),
            }
        print(f'  attributes {min(i + BATCH, len(ids))}/{len(ids)}', file=sys.stderr)
    return out


def relations(ids: list[str], cache: str) -> list[tuple[str, str, str]]:
    out = []
    for i in range(0, len(ids), BATCH):
        chunk = ids[i : i + BATCH]
        for r in ask(RELATIONS % ' '.join('wd:' + q for q in chunk), cache):
            out.append((qid(r['p']['value']), r['rel']['value'], qid(r['q']['value'])))
        print(f'  relations {min(i + BATCH, len(ids))}/{len(ids)}', file=sys.stderr)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('chronicle', help='public/data/rulers_<year>.json')
    ap.add_argument('out', help='folder for persons.csv and the report')
    ap.add_argument('--cache', required=True, help='folder for the answers of the Query Service (not committed)')
    ap.add_argument('--hops', type=int, default=4)
    a = ap.parse_args()
    os.makedirs(a.cache, exist_ok=True)
    os.makedirs(a.out, exist_ok=True)
    with open(a.chronicle, encoding='utf-8') as f:
        seeds = sorted({p['qid'] for p in json.load(f)['persons'] if p.get('qid', '').startswith('Q')})

    persons: dict[str, dict] = {}
    hop: dict[str, int] = {}
    parents: dict[str, dict[str, set]] = {}
    spouses: dict[str, set] = {}
    dropped = {'not human': 0, 'outside the window': 0}
    frontier = seeds
    for h in range(a.hops + 1):
        print(f'hop {h}: {len(frontier)} persons', file=sys.stderr)
        got = attributes(frontier, a.cache)
        walk = []
        for q in frontier:
            p = got.get(q)
            if p is None or not p['human']:
                dropped['not human'] += 1
                continue
            w = in_window(p)
            if w is False and h > 0:
                dropped['outside the window'] += 1
                continue
            persons[q], hop[q] = p, h
            if w or h == 0:
                walk.append(q)
        if h == a.hops:
            break
        nxt = set()
        for p, rel, q in relations(walk, a.cache):
            if rel == 'spouse':
                spouses.setdefault(p, set()).add(q)
                continue
            if rel in ('father', 'mother'):
                parents.setdefault(p, {'father': set(), 'mother': set()})[rel].add(q)
            else:
                sex = persons[p]['sex']
                if sex:
                    parents.setdefault(q, {'father': set(), 'mother': set()})['father' if sex == 'm' else 'mother'].add(
                        p
                    )
            if q not in hop:
                nxt.add(q)
        frontier = sorted(nxt - set(hop))
        for q in frontier:
            hop[q] = h + 1

    cols = ['qid', 'label', 'sex', 'birth', 'death', 'father', 'mother', 'spouses', 'family', 'familyLabel', 'hop']
    with open(os.path.join(a.out, 'persons.csv'), 'w', newline='', encoding='utf-8') as f:
        wr = csv.DictWriter(f, fieldnames=cols)
        wr.writeheader()
        for q in sorted(persons, key=lambda x: int(x[1:])):
            p, par = persons[q], parents.get(q, {'father': set(), 'mother': set()})
            wr.writerow(
                {
                    **{k: p[k] for k in ('qid', 'label', 'sex', 'birth', 'death', 'family', 'familyLabel')},
                    'father': '|'.join(sorted(x for x in par['father'] if x in persons)),
                    'mother': '|'.join(sorted(x for x in par['mother'] if x in persons)),
                    'spouses': '|'.join(sorted(spouses.get(q, ()))),
                    'hop': hop[q],
                }
            )
    report = {
        'fetched': time.strftime('%Y-%m-%d'),
        'endpoint': ENDPOINT,
        'chronicle': os.path.basename(a.chronicle),
        'seeds': len(seeds),
        'hops': a.hops,
        'window': [FIRST_YEAR, LAST_YEAR],
        'persons': len(persons),
        'by_hop': {str(h): sum(1 for q in persons if hop[q] == h) for h in range(a.hops + 1)},
        'dropped': dropped,
        'with_father': sum(1 for q in persons if parents.get(q, {}).get('father', set()) & persons.keys()),
        'with_mother': sum(1 for q in persons if parents.get(q, {}).get('mother', set()) & persons.keys()),
        'with_birth': sum(1 for p in persons.values() if p['birth']),
        'with_death': sum(1 for p in persons.values() if p['death']),
    }
    with open(os.path.join(a.out, 'report.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=1)
        f.write('\n')
    print(json.dumps(report, indent=1))


if __name__ == '__main__':
    main()
