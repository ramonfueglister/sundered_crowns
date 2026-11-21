"""The dates of the border changes of tools/history/borders/build.py.

The date of a change: Cliopatria gives only the first year of the row that shows it, so the change happened after the
first year of the row that held the places before, and after 1291 and the places' last change (the window). Within that
window, in this order:
1. the end of the losing realm's title in the ruler lists, when the change takes the realm's last places (Bosnia
   5 June 1463, Granada 1492);
2. a row of the Wikipedia timelines of geopolitical changes (data/history/borders/wikipedia_timeline.json) that
   links both the gaining and the losing polity (their Wikidata ids); the latest such row;
3. else the middle of the window, precision "window" with the window's years (counted). Merges carry their day.
"""

import collections
import datetime
import json
import os
from pathlib import Path

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))


def precision(d):
    return {4: 'year', 7: 'month', 10: 'day'}[len(d)]


def date_events(events, rulers):
    """the dates of the transfers (rules in the header); removes the helper fields"""
    tl = json.loads(
        Path(os.path.join(ROOT, 'data', 'history', 'borders', 'wikipedia_timeline.json')).read_text(encoding='utf-8')
    )
    rows = tl['rows']
    by_q = collections.defaultdict(list)
    for i, t in enumerate(rows):
        for l in t['links']:
            if l.get('qid'):
                by_q[l['qid']].append(i)
    ends, open_ = {}, set()
    for r in rulers['reigns']:
        if r['end'] is None:
            open_.add(r['realm'])
        elif r['realm'] not in ends or r['end'] > ends[r['realm']]:
            ends[r['realm']] = r['end']
    for e in events:
        if e['kind'] == 'transfer':
            y = int(e['date'])
            lo = min(e['_since'], y - 1)  # a place that moved twice in one year: that year
            d, how = None, None
            end = ends.get(e['from']) if e['from'] not in open_ else None
            if end and lo < int(end[:4]) <= y and e['_last']:
                d, how = end, 'title'
            if d is None:
                cand = [
                    i
                    for i in set(by_q.get(e['_gain'], [])) | {i for q in e['_lost'] for i in by_q.get(q, [])}
                    if lo < rows[i]['year'] <= y
                ]
                good = [
                    i
                    for i in cand
                    if any(l.get('qid') == e['_gain'] for l in rows[i]['links'])
                    and any(l.get('qid') in e['_lost'] for l in rows[i]['links'])
                ]
                if good:
                    t = rows[max(good, key=lambda i: (rows[i]['year'], i))]
                    d, how = t['date'], 'timeline'
                    e['source'] += f'; date: {t["page"]} (revision {t["revid"]}): {t["text"]}'
            if d:
                e['date'], e['precision'] = d, precision(d)
                if how == 'title':
                    e['source'] += f'; date: end of the title of {e["from"]} in the ruler lists'
            else:  # undated: the middle of the window
                a, b = datetime.date(lo + 1, 1, 1), datetime.date(y, 12, 31)
                e['date'], e['precision'], e['window'] = (a + (b - a) / 2).isoformat(), 'window', [str(lo + 1), str(y)]
        for k in ('_gain', '_lost', '_since', '_last'):
            e.pop(k, None)
    events.sort(key=lambda e: e['date'])  # stable: equal dates keep the order as built
