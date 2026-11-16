"""The border events of 1291 to 1848 (step 1 of the border feature, doc "Grenzen nach echten Daten"):
public/data/borders_1291.json, from the places of every Cliopatria row (data/history/borders/cliopatria_places.json),
the owners of the world of 1291 (public/data/setup_1291.json) and the holders of the titles
(public/data/rulers_1291.json).

Rules (nothing is invented; what the sources leave open is counted):
- The owner of a place in Cliopatria in a year is the row of that year that holds it. Hulls (names in brackets, such as
  "(Holy Roman Empire)") are no owner. Where two rows hold a place, the one with fewer places holds it.
- A place changes hands in Cliopatria in year y when its owner in y differs from its owner in y - 1. Our world takes
  the change over only where it moves the place to another of OUR realms; a change between two names of the same
  realm moves nothing.
- Which of our realms a Cliopatria polity is, decided once, the first year the polity is needed, by the places it holds
  then and their owners in our world that day, in this order:
  1. the entry of data/history/borders/cliopatria_to_realms.json, where there is one (each with its reason);
  2. the realm of the same name;
  3. the hull it belongs to (Cliopatria's MemberOf, e.g. a county "(Kingdom of France)") when that hull is a realm;
  4. the same realm, when one realm holds most of the polity's places AND most of that realm's places lie in the
     polity (mutual majority), and that realm's title still has a holder that year (or we have no list for it);
  5. a union, when two or more of our realms that still have a holder each have most of their places in it (the
     Habsburg lands, the minor states of the Empire). A union keeps our division. A place that comes into a union keeps
     its realm when its polity of last year has ended and the realm still has a holder, or when the realm's holder is a
     holder of the union (one person wears both crowns: Naples under Charles VI); else it goes back to the realm that
     held it before, when that realm's holder is a holder of the union (Hungary retaken from the Ottomans in 1686-1699);
     else to the head of the union named in the file (conquests of the Habsburg Monarchy go to Austria); else to the
     realm of the union whose place is nearest over the land (the spread of tools/history/1291/build.py). A league (the
     Empire, the Confederation of the Rhine, the German Confederation, the houses) has no holder of its own: a place
     that comes into it from another union keeps its realm while that realm has a holder (Prague, Habsburg lands, in
     the Empire's row of 1619-1621); a place taken from a polity of one realm goes back to the last realm that held it
     before, is a member of the league (has places that stay in it) and still has a holder (Berlin and Magdeburg,
     French from 1807, Prussian again in the Confederation of the Rhine).
  6. else a new realm, which comes into the world with its first place.
- A realm whose title ended into another realm (the merges of the same file: Aragon into Castile 1707, Scotland
  into England 1707) gives all its places to that realm that year.
- A realm whose title ended while its state went on under another title of the same holder (Moscow 1547 tsardom,
  England 1707 Great Britain, Brandenburg 1806 Prussia; the successions of the same file) counts as held after.
- The date of a change: Cliopatria gives only the first year of the row that shows it, so the change happened after
  the first year of the row that held the places before, and after 1291 and the places' last change (the window). Within that window, in this order:
  1. the end of the losing realm's title in the ruler lists, when the change takes the realm's last places (Bosnia
     5 June 1463, Granada 1492);
  2. a row of the Wikipedia timelines of geopolitical changes (data/history/borders/wikipedia_timeline.json) that
     links both the gaining and the losing polity (their Wikidata ids); the latest such row;
  3. else the middle of the window, precision "window" with the window's years (counted). Merges carry their day.

    python3 tools/history/borders/build.py
"""
import collections, datetime, json, os, re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
FIRST, LAST = 1291, 1848
STOP = (r'\b(kingdom|duchy|grand|county|principality|margraviate|electorate|landgraviate|republic|sultanate|empire|'
        r'dynasty|khanate|emirate|beylik|of|the|despotate|free|city|imperial|archbishopric|bishopric|prince|house|'
        r'lordship|banate|giudicato|crown|old|first|second|great|order|state|confederation|caliphate|tsardom|commonwealth)\b')


def core(n):
    n = n.lower(); n = re.sub(r'\(.*?\)', '', n); n = re.sub(STOP, ' ', n); n = re.sub(r'[^a-zà-ÿ ]', ' ', n)
    return ' '.join(n.split())


def slug(name):
    return 'c_' + re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')


def year_of(d):
    return int(d[:4]) if d else None


def build():
    J = lambda *p: json.load(open(os.path.join(ROOT, *p), encoding='utf-8'))
    clio, setup, rulers, geo = J('data', 'history', 'borders', 'cliopatria_places.json'), J('public', 'data', 'setup_1291.json'), \
        J('public', 'data', 'rulers_1291.json'), J('public', 'data', 'geo.json')
    manual_path = os.path.join(ROOT, 'data', 'history', 'borders', 'cliopatria_to_realms.json')
    mfile = J('data', 'history', 'borders', 'cliopatria_to_realms.json') if os.path.exists(manual_path) else {}
    manual, successions, merges = mfile.get('polities', {}), mfile.get('successions', {}), mfile.get('merges', {})
    rows = [r for r in clio['rows'] if not r['name'].startswith('(')]
    keys = [st['id'] for st in setup['states']]
    index = {k: i for i, k in enumerate(keys)}
    current = list(setup['owner'])
    changed = [FIRST] * len(current)                     # the year of a place's last change in our world
    history = [[] for _ in current]                       # the realms that held a place before its present one, oldest first
    frame = sorted({p for r in clio['rows'] for p in r['places']})
    nbr = collections.defaultdict(list)
    for a, b, *_ in geo['edges']: nbr[a].append(b); nbr[b].append(a)

    # the titles: which realm has a holder in which year (a realm without a list counts as held)
    held = collections.defaultdict(set)
    holders = collections.defaultdict(lambda: collections.defaultdict(set))   # realm -> year -> the persons holding it
    for r in rulers['reigns']:
        a, b = year_of(r['start']) or FIRST, year_of(r['end']) or LAST
        held[r['realm']].update(range(max(a, FIRST), min(b, LAST) + 1))
        for y in range(max(a, FIRST), min(b, LAST) + 1): holders[r['realm']][y].add(r['person'])
    for k, sc in successions.items(): held[k].update(range(sc['from'], LAST + 1))   # the state went on under a new title
    listed = set(held)
    polity_of = {}                                       # a new realm: the Cliopatria polity it was made for
    names_in = collections.defaultdict(set)              # year -> the polities that exist that year
    def has_holder(k, y):
        if k in polity_of: return polity_of[k] in names_in[y]   # a new realm lives as long as its polity
        return (k not in listed) or (y in held[k])

    names = collections.defaultdict(set)
    for i, st in enumerate(setup['states']):
        for n in (st['name'].get('en', ''), (st.get('short') or {}).get('en', ''), st['id'].replace('_', ' ')):
            if core(n): names[core(n)].add(i)

    by_year = collections.defaultdict(list)
    for i, r in enumerate(rows):
        for y in range(max(r['from'], FIRST - 1), min(r['to'], LAST) + 1): by_year[y].append(i); names_in[y].add(r['name'])
    def owners(y):
        o = {}
        for i in sorted(by_year[y], key=lambda i: -len(rows[i]['places'])):
            for p in rows[i]['places']: o[p] = i
        return o

    kind, new_realms, report, why = {}, [], collections.Counter(), {}
    def classify(name, held_places, y, member_of):
        if name in kind: return kind[name]
        size = collections.Counter(current[p] for p in frame if current[p] >= 0)
        c = collections.Counter(current[p] for p in held_places if current[p] >= 0)
        def put(k, how): kind[name] = k; why[name] = how; report[how] += 1; return k
        m = manual.get(name)
        if m is not None:
            if m.get('as'):
                other = m['as']
                if other not in kind:
                    o = next((x for x in rows if x['name'] == other), None)
                    if o: classify(other, o['places'], y, o['memberOf'])
                if other in kind: return put(kind[other], 'manual')
            elif m['realm'] == 'union': return put(('union',), 'manual')
            elif m['realm'] in index: return put(('same', index[m['realm']]), 'manual')
            elif m['realm'] == 'new': return make_new(name, y, put)
        same_name = [i for i in names.get(core(name), ()) if c[i] > 0] or list(names.get(core(name), ()))
        if len(same_name) == 1: return put(('same', same_name[0]), 'name')
        if len(same_name) > 1: return put(('same', max(same_name, key=lambda i: c[i])), 'name')
        for hull in (member_of or '').split(';'):
            h = hull.strip()[1:-1] if hull.strip().startswith('(') else ''
            if h and h != name and h in kind and kind[h][0] == 'same': return put(kind[h], 'hull')
        if c:
            r, n = c.most_common(1)[0]
            if 2 * n > len(held_places) and 2 * n > size[r] and has_holder(keys[r], y): return put(('same', r), 'majority')
        inside = [r for r, n in c.items() if 2 * n > size[r] and has_holder(keys[r], y)]
        if len(inside) >= 2: return put(('union',), 'union')
        return make_new(name, y, put)

    def make_new(name, y, put):
        row = next(x for x in rows if x['name'] == name)
        keys.append(slug(name)); idx = len(keys) - 1; index[keys[idx]] = idx; polity_of[keys[idx]] = name
        new_realms.append({'id': keys[idx], 'name': name, 'wikidata': row['wikidata'], 'wikipedia': row['wikipedia'], 'first': y})
        return put(('new', idx), 'new' if name not in manual else 'manual')

    def nearest(p, members, staying):
        """the realm of the union whose staying place is nearest to p over the land (breadth first, edge counts)"""
        seen, frontier = {p}, [p]
        while frontier:
            nxt = []
            for a in frontier:
                for b in nbr[a]:
                    if b in seen: continue
                    seen.add(b)
                    if b in staying and current[b] in members: return current[b]
                    nxt.append(b)
            frontier = nxt
        return None

    prev = owners(FIRST)
    for i in sorted(set(prev.values()), key=lambda i: rows[i]['name']):
        name = rows[i]['name']
        classify(name, [p for p, j in prev.items() if rows[j]['name'] == name], FIRST, rows[i]['memberOf'])
    events = []
    for y in range(FIRST + 1, LAST + 1):
        for k, mg in sorted(merges.items()):
            if mg['year'] != y or k not in index or mg['into'] not in index: continue
            a, b = index[k], index[mg['into']]
            places = [p for p in frame if current[p] == a]
            if not places: continue
            for p in places: history[p].append(a); current[p] = b
            events.append({'date': mg.get('date', str(y)), 'precision': 'day' if 'date' in mg else 'year', 'from': k,
                           'to': mg['into'], 'places': places, 'kind': 'merge', 'source': mg['source']})
            report['merges'] += 1; report['place_moves'] += len(places)
        now = owners(y)
        moved = collections.defaultdict(list)
        held_now = collections.defaultdict(list)
        row_of = {}
        for p, i in now.items(): held_now[rows[i]['name']].append(p); row_of[rows[i]['name']] = i
        alive = {rows[i]['name'] for i in now.values()}
        # a union (see the rules above): first the places that keep their realm, then the members (the realms of those
        # places and the head), then the places that keep their realm because its holder is a holder of the union
        unions = {}
        for q, places in held_now.items():
            if classify(q, places, y, rows[row_of[q]]['memberOf'])[0] != 'union': continue
            m = manual.get(q, {}); league = bool(m.get('league'))
            head = index.get(m.get('head', ''), -1)
            keep = set()
            for x in places:
                was = rows[prev[x]]['name'] if x in prev else None
                ended = was is None or was not in alive or (league and kind.get(was, ('',))[0] == 'union')
                if was == q or (ended and current[x] >= 0 and has_holder(keys[current[x]], y)): keep.add(x)
            members = {current[x] for x in keep if current[x] >= 0} | ({head} if head >= 0 and has_holder(keys[head], y) else set())
            persons = set().union(*(holders[keys[r]][y] for r in members)) if members else set()
            if not league:
                for x in places:
                    r = current[x]
                    if x not in keep and r >= 0 and has_holder(keys[r], y) and holders[keys[r]][y] & persons: keep.add(x)
                members |= {current[x] for x in keep if current[x] >= 0}
            unions[q] = (keep, members, persons, league, head)
        for p, i in sorted(now.items()):
            q = rows[i]['name']
            if p in prev and rows[prev[p]]['name'] == q: continue
            k = classify(q, held_now[q], y, rows[i]['memberOf'])
            if k[0] == 'union':
                keep, members, persons, league, head = unions[q]
                if p in keep: report['union_keeps'] += 1; continue
                if league: back = [b for b in reversed(history[p]) if b in members and has_holder(keys[b], y)]
                else: back = [b for b in history[p][-1:] if b >= 0 and has_holder(keys[b], y) and holders[keys[b]][y] & persons]
                if back:
                    to = back[0]; report['union_restores'] += 1
                elif head in members: to = head; report['union_head'] += 1
                else: to = nearest(p, members, keep)
                if to is None: report['union_no_member'] += 1; continue
            else:
                to = k[1]
            if to == current[p]: report['same_realm'] += 1; continue
            moved[(current[p], to, i)].append(p)
        lose = collections.Counter(a for (a, b, i), places in moved.items() for p in places)
        size_now = collections.Counter(current[p] for p in frame)
        for (a, b, i), places in sorted(moved.items(), key=lambda kv: (kv[0][1], kv[0][0], kv[0][2])):
            last = a >= 0 and lose[a] == size_now[a]
            for p in places: history[p].append(current[p]); current[p] = b
            r = rows[i]
            events.append({'date': str(y), 'precision': 'year', 'from': keys[a] if a >= 0 else None, 'to': keys[b],
                           'places': sorted(places), 'kind': 'transfer',
                           'source': f"Cliopatria v0.2.1: {r['name']} {r['from']}-{r['to']} ({r['wikidata']})",
                           '_gain': r['wikidata'], '_lost': sorted({rows[prev[p]]['wikidata'] for p in places if p in prev}),
                           '_last': last, '_since': max([FIRST] + [changed[p] for p in places] +
                                                         [min((rows[prev[p]]['from'] for p in places if p in prev), default=y - 1)])})
            for p in places: changed[p] = y
            report['events'] += 1; report['place_moves'] += len(places)
        prev = now
    date_events(events, rulers)
    out = {'year': FIRST, 'until': f'{LAST}-12-31', 'source': clio['source'], 'realms': new_realms, 'events': events,
           'mapping': {n: {'how': why[n], 'realm': (keys[kind[n][1]] if kind[n][0] != 'union' else 'union')} for n in sorted(kind)}}
    return out, report, keys, current, frame


def precision(d):
    return {4: 'year', 7: 'month', 10: 'day'}[len(d)]


def date_events(events, rulers):
    """the dates of the transfers (rules in the header); removes the helper fields"""
    tl = json.load(open(os.path.join(ROOT, 'data', 'history', 'borders', 'wikipedia_timeline.json'), encoding='utf-8'))
    rows = tl['rows']; by_q = collections.defaultdict(list)
    for i, t in enumerate(rows):
        for l in t['links']:
            if l.get('qid'): by_q[l['qid']].append(i)
    ends, open_ = {}, set()
    for r in rulers['reigns']:
        if r['end'] is None: open_.add(r['realm'])
        elif r['realm'] not in ends or r['end'] > ends[r['realm']]: ends[r['realm']] = r['end']
    left = collections.Counter()                      # places each realm holds, played forward
    for e in events:
        if e['kind'] == 'transfer':
            y, lo = int(e['date']), e['_since']
            d, how = None, None
            end = ends.get(e['from']) if e['from'] not in open_ else None
            if end and lo < int(end[:4]) <= y and e['_last']: d, how = end, 'title'
            if d is None:
                cand = [i for i in set(by_q.get(e['_gain'], [])) | {i for q in e['_lost'] for i in by_q.get(q, [])}
                        if lo < rows[i]['year'] <= y]
                good = [i for i in cand if any(l.get('qid') == e['_gain'] for l in rows[i]['links'])
                        and any(l.get('qid') in e['_lost'] for l in rows[i]['links'])]
                if good:
                    t = rows[max(good, key=lambda i: (rows[i]['year'], i))]
                    d, how = t['date'], 'timeline'
                    e['source'] += f"; date: {t['page']} (revision {t['revid']}): {t['text']}"
            if d:
                e['date'], e['precision'] = d, precision(d)
                if how == 'title': e['source'] += f"; date: end of the title of {e['from']} in the ruler lists"
            else:                                     # undated: the middle of the window
                a, b = datetime.date(lo + 1, 1, 1), datetime.date(y, 12, 31)
                e['date'], e['precision'], e['window'] = (a + (b - a) / 2).isoformat(), 'window', [str(lo + 1), str(y)]
        for k in ('_gain', '_lost', '_since', '_last'): e.pop(k, None)
    events.sort(key=lambda e: e['date'])               # stable: equal dates keep the order as built


if __name__ == '__main__':
    out, report, keys, current, frame = build()
    json.dump(out, open(os.path.join(ROOT, 'public', 'data', 'borders_1291.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    print(dict(report))
    held = collections.Counter(keys[current[p]] for p in frame if current[p] >= 0)
    print('1848, realms holding most places in the frame:', held.most_common(40))
