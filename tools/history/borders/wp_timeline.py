"""Wikipedia timelines of geopolitical changes 1291..1848 as data (step 2 of the border feature, doc "Grenzen nach
echten Daten"): data/history/borders/wikipedia_timeline.json.

Source: English Wikipedia, "Timeline of geopolitical changes (before 1500)" and "Timeline of geopolitical changes
(1500–1899)" at fixed revisions (REVISIONS below), CC BY-SA 4.0. The wikitext tables (Year | Date | Event) are parsed;
each row keeps the page, the revision, the date as the source gives it (YYYY, YYYY-MM or YYYY-MM-DD), the original
date text, the event as plain text and the linked article titles in order. For every link the MediaWiki API gives the
Wikidata item (pageprops wikibase_item) and the coordinates of the article, if any (after redirects). A row is
in_frame when at least one linked article has coordinates inside the world frame (data/content/world_extent.json);
rows without any coordinates have in_frame null.

    python3 tools/history/borders/wp_timeline.py [--cache DIR]

--cache keeps the raw API answers in DIR (they are not committed). Needs only the standard library.
"""
import json, os, re, sys, time, urllib.parse, urllib.request, urllib.error

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
FIRST, LAST = 1291, 1848
API = 'https://en.wikipedia.org/w/api.php'
UA = 'sundered-crowns-borders/0.1 (data build script)'
REVISIONS = {'Timeline of geopolitical changes (before 1500)': 1382963230,
             'Timeline of geopolitical changes (1500–1899)': 1383299739}
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
          'November', 'December']
MONTH_RE = '|'.join(MONTHS)


def api(params, cache=None, key=None):
    if cache and key and os.path.exists(os.path.join(cache, key)):
        return json.load(open(os.path.join(cache, key), encoding='utf-8'))
    url = API + '?' + urllib.parse.urlencode({**params, 'format': 'json', 'formatversion': 2})
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for attempt in range(8):
        try:
            d = json.load(urllib.request.urlopen(req, timeout=60)); break
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503): raise
            time.sleep(5 * (attempt + 1))
    else:
        raise RuntimeError('API keeps refusing: ' + url)
    time.sleep(1)
    if cache and key:
        os.makedirs(cache, exist_ok=True)
        json.dump(d, open(os.path.join(cache, key), 'w', encoding='utf-8'))
    return d


def plain(s):
    s = re.sub(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', '', s, flags=re.S)
    s = re.sub(r'\{\{[^{}]*\}\}', '', s)
    s = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', r'\1', s)
    s = re.sub(r"'{2,}", '', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = s.replace('&nbsp;', ' ').replace('&ndash;', '–')
    return re.sub(r'\s+', ' ', s).strip()


def cell(c):
    m = re.match(r'\s*((?:[a-z-]+\s*=\s*(?:"[^"]*"|[^|\s]*)\s*)+)\|(?!\|)(.*)$', c, re.S)
    attrs, val = (m.group(1), m.group(2)) if m else ('', c)
    span = re.search(r'rowspan\s*=\s*"?(\d+)', attrs)
    return val.strip(), int(span.group(1)) if span else 1


def parse(page, revid, text):
    out = []
    for tbl in re.findall(r'\{\|(.*?)\n\|\}', text, re.S):
        year_text, ys, date_text, ds = None, 0, '', 0
        for raw in re.split(r'\n\|-+[^\n]*', tbl)[1:]:
            raw = raw.strip()
            if not raw or raw.startswith('!'): continue
            body = raw[1:] if raw.startswith('|') else raw
            cells = [cell(c) for c in re.split(r'\|\||\n\|', body)]
            i = 0
            if ys > 1: ys -= 1
            else: year_text, ys = cells[i]; i += 1
            if ds > 1: ds -= 1
            elif len(cells) - i >= 2: date_text, ds = cells[i]; i += 1
            else: date_text, ds = '', 1
            event = ' '.join(v for v, _ in cells[i:]).strip()
            yt = plain(year_text or '')
            ym = re.search(r'\d{3,4}', yt)
            if not ym or not event: continue
            year = int(ym.group())
            if 'BC' in yt: year = -year
            dt = plain(date_text)
            uncertain = bool(re.search(r'\bc\.|\bca\.|circa|\?|–|-|/', yt))
            date = None
            if not uncertain:
                mo = re.search(MONTH_RE, dt)
                dd = re.search(r'\b(\d{1,2})\b', dt)
                if mo and dd: date = f'{year:04d}-{MONTHS.index(mo.group()) + 1:02d}-{int(dd.group(1)):02d}'
                elif mo: date = f'{year:04d}-{MONTHS.index(mo.group()) + 1:02d}'
                else: date = f'{year:04d}'
            links = []
            for l in re.findall(r'\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]', event):
                l = l.strip()
                if l and not re.match(r'(?i)(file|image|category):', l): links.append(l[0].upper() + l[1:])
            out.append({'page': page, 'revid': revid, 'year': year, 'date': date, 'year_text': yt, 'date_text': dt,
                        'text': plain(event), 'links': links})
    return out


def main(argv):
    cache = argv[argv.index('--cache') + 1] if '--cache' in argv else None
    ext = json.load(open(os.path.join(ROOT, 'data', 'content', 'world_extent.json'), encoding='utf-8'))
    rows = []
    for page, rev in REVISIONS.items():
        d = api({'action': 'query', 'prop': 'revisions', 'revids': rev, 'rvprop': 'ids|timestamp|content',
                 'rvslots': 'main'}, cache, f'rev_{rev}.json')
        p = d['query']['pages'][0]; r = p['revisions'][0]
        assert r['revid'] == rev and p['title'] == page, (p['title'], r['revid'])
        rows += [x for x in parse(page, rev, r['slots']['main']['content']) if FIRST <= x['year'] <= LAST]
    titles = sorted({l for x in rows for l in x['links']})
    info = {}
    for k in range(0, len(titles), 50):
        batch = titles[k:k + 50]
        d = api({'action': 'query', 'prop': 'pageprops|coordinates', 'ppprop': 'wikibase_item', 'colimit': 'max',
                 'redirects': 1, 'titles': '|'.join(batch)}, cache, f'props_{k // 50:04d}.json')['query']
        norm = {x['from']: x['to'] for x in d.get('normalized', [])}
        red = {x['from']: x['to'] for x in d.get('redirects', [])}
        pages = {p['title']: p for p in d.get('pages', [])}
        for t in batch:
            t2 = norm.get(t, t); t3 = red.get(t2, t2); p = pages.get(t3, {})
            c = (p.get('coordinates') or [None])[0]
            info[t] = {'title': t, 'target': t3 if t3 != t else None,
                       'qid': (p.get('pageprops') or {}).get('wikibase_item'),
                       'lon': c['lon'] if c else None, 'lat': c['lat'] if c else None}
    def inside(i):
        return i['lon'] is not None and ext['west'] <= i['lon'] <= ext['east'] and ext['south'] <= i['lat'] <= ext['north']
    for x in rows:
        ls = [info[l] for l in x['links']]
        x['links'] = [{k: v for k, v in i.items() if v is not None} for i in ls]
        has = [i for i in ls if i['lon'] is not None]
        x['in_frame'] = any(inside(i) for i in has) if has else None
    rows.sort(key=lambda x: (x['year'], x['date'] or '', x['page']))
    n_links = sum(len(x['links']) for x in rows); n_qid = sum(1 for x in rows for l in x['links'] if 'qid' in l)
    out = {'source': 'English Wikipedia, CC BY-SA 4.0', 'pages': [{'title': t, 'revid': r} for t, r in REVISIONS.items()],
           'years': [FIRST, LAST], 'frame': ext,
           'rule': 'in_frame: a linked article has coordinates inside the frame; null when no linked article has any',
           'rows': rows}
    dst = os.path.join(ROOT, 'data', 'history', 'borders', 'wikipedia_timeline.json')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, 'w', encoding='utf-8') as fo: json.dump(out, fo, ensure_ascii=False, indent=0)
    prec = {}
    for x in rows:
        k = 'none' if x['date'] is None else {4: 'year', 7: 'month', 10: 'day'}[len(x['date'])]
        prec[k] = prec.get(k, 0) + 1
    fr = sum(1 for x in rows if x['in_frame']); nf = sum(1 for x in rows if x['in_frame'] is None)
    print(f'{len(rows)} rows ({fr} in frame, {len(rows) - fr - nf} outside, {nf} unknown), dates {prec}, '
          f'{n_links} links, {n_qid} with QID ({100 * n_qid / max(n_links, 1):.1f}%), {len(titles)} distinct titles')


if __name__ == '__main__':
    main(sys.argv[1:])
