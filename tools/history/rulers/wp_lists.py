#!/usr/bin/env python3
"""Helper for building the ruler lists in data/history/rulers/lists/.

Fetches English Wikipedia wikitext through the MediaWiki API, caches it locally
(raw wikitext is NOT committed), resolves article titles to Wikidata ids, and
validates the list CSVs. All requests from all processes share one lock so the
API sees at most about one request per second.

Usage:
  wp_lists.py search "<query>"            # top search hits (title, snippet)
  wp_lists.py fetch "<title>"             # wikitext to cache; prints path, final title, revid, url
  wp_lists.py sections "<title>"          # numbered section headings of a cached/fetched page
  wp_lists.py qids "<title>" ["<title>" ...]   # title -> wikibase_item (redirects followed)
  wp_lists.py validate <csv> [...]        # check a list CSV
"""

import csv
import fcntl
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

API = 'https://en.wikipedia.org/w/api.php'
UA = 'research-client/0.1'
CACHE = os.path.expanduser('~/Coding/grand_strategy_game/herrscher_wikipedia')
LOCK = os.path.join(CACHE, '.ratelimit')
COLS = [
    'order',
    'name',
    'born',
    'died',
    'reign_start',
    'reign_end',
    'precision',
    'house',
    'qid',
    'note',
    'source_url',
    'source_revid',
]


def api(params):
    os.makedirs(CACHE, exist_ok=True)
    params = dict(params, format='json', formatversion='2')
    url = API + '?' + urllib.parse.urlencode(params)
    with open(LOCK, 'a+') as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        lk.seek(0)
        try:
            last = float(lk.read() or 0)
        except ValueError:
            last = 0
        wait = 1.0 - (time.time() - last)
        if wait > 0:
            time.sleep(wait)
        for attempt in range(5):
            try:
                req = urllib.request.Request(url, headers={'User-Agent': UA})
                with urllib.request.urlopen(req, timeout=60) as r:
                    data = json.load(r)
                break
            except Exception:  # network hiccup / 429
                if attempt == 4:
                    raise
                time.sleep(2 ** (attempt + 1))
        lk.seek(0)
        lk.truncate()
        lk.write(str(time.time()))
        lk.flush()
        fcntl.flock(lk, fcntl.LOCK_UN)
    return data


def safe(title):
    return re.sub(r'[^\w\-]+', '_', title)[:150]


def fetch(title):
    d = api(
        {
            'action': 'query',
            'prop': 'revisions',
            'rvprop': 'content|ids',
            'rvslots': 'main',
            'titles': title,
            'redirects': 1,
        }
    )
    p = d['query']['pages'][0]
    if p.get('missing'):
        sys.exit(f'missing page: {title}')
    rev = p['revisions'][0]
    text = rev['slots']['main']['content']
    final = p['title']
    path = os.path.join(CACHE, safe(final) + '.wikitext')
    with open(path, 'w') as f:
        f.write(text)
    meta = {
        'title': final,
        'revid': rev['revid'],
        'url': 'https://en.wikipedia.org/wiki/' + urllib.parse.quote(final.replace(' ', '_')),
    }
    with open(path + '.json', 'w') as f:
        json.dump(meta, f)
    print(f'path\t{path}\ntitle\t{final}\nrevid\t{rev["revid"]}\nurl\t{meta["url"]}\nchars\t{len(text)}')
    if text.lower().startswith('#redirect'):
        print('NOTE: page is a redirect (section redirect?)', text[:200])


def sections(title):
    path = os.path.join(CACHE, safe(title) + '.wikitext')
    if not os.path.exists(path):
        fetch(title)
    for i, line in enumerate(open(path), 1):
        if re.match(r'^=+[^=].*=+\s*$', line):
            print(i, line.rstrip())


def qids(titles):
    out = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i : i + 50]
        d = api(
            {
                'action': 'query',
                'prop': 'pageprops',
                'ppprop': 'wikibase_item',
                'titles': '|'.join(chunk),
                'redirects': 1,
            }
        )
        q = d['query']
        alias = {}
        for n in q.get('normalized', []):
            alias[n['from']] = n['to']
        redir = {r['from']: r['to'] for r in q.get('redirects', [])}
        bytitle = {p['title']: p.get('pageprops', {}).get('wikibase_item', '') for p in q['pages']}
        for t in chunk:
            x = alias.get(t, t)
            x = redir.get(x, x)
            out[t] = bytitle.get(x, '')
    for t in titles:
        print(f'{t}\t{out.get(t, "")}')


DATE = re.compile(r'^\d{3,4}(-\d{2}(-\d{2})?)?$')


def validate(paths):
    bad = 0
    for path in paths:
        with open(path, newline='') as f:
            rows = list(csv.reader(f))
        if rows[0] != COLS:
            print(f'{path}: header mismatch {rows[0]}')
            bad += 1
            continue
        for n, r in enumerate(rows[1:], 2):
            if len(r) != len(COLS):
                print(f'{path}:{n}: {len(r)} fields')
                bad += 1
                continue
            d = dict(zip(COLS, r))
            for k in ('born', 'died', 'reign_start', 'reign_end'):
                if d[k] and not DATE.match(d[k]):
                    print(f'{path}:{n}: bad {k} {d[k]!r}')
                    bad += 1
            if d['precision'] not in ('day', 'month', 'year', 'circa', ''):
                print(f'{path}:{n}: bad precision {d["precision"]!r}')
                bad += 1
            if d['qid'] and not re.match(r'^Q\d+$', d['qid']):
                print(f'{path}:{n}: bad qid {d["qid"]!r}')
                bad += 1
            if not d['source_url'].startswith('https://en.wikipedia.org/wiki/'):
                print(f'{path}:{n}: bad source_url')
                bad += 1
            if not d['source_revid'].isdigit():
                print(f'{path}:{n}: bad source_revid')
                bad += 1
            if not d['order'].isdigit():
                print(f'{path}:{n}: bad order')
                bad += 1
            if d['reign_start'] and d['reign_start'][:4] > '1848':
                print(f'{path}:{n}: reign starts after 1848')
                bad += 1
        print(f'{path}: {len(rows) - 1} rows checked')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == 'search':
        d = api({'action': 'query', 'list': 'search', 'srsearch': args[0], 'srlimit': 10})
        for h in d['query']['search']:
            print(h['title'], '|', re.sub(r'<[^>]+>', '', h['snippet'])[:120])
    elif cmd == 'fetch':
        fetch(args[0])
    elif cmd == 'sections':
        sections(args[0])
    elif cmd == 'qids':
        qids(args)
    elif cmd == 'validate':
        validate(args)
    else:
        sys.exit(__doc__)
