#!/usr/bin/env python3
# Reads the dates of the OSM objects of the fetched town plans: the OSM tags start_date / construction_date and, for
# objects with a wikidata tag, Wikidata's inception (P571) and dissolution (P576). Runs where wikidata.org is
# reachable: python3 osm_dates.py <plans dir> <out.json>. Resumes: ids already in out.json are not asked again.
# Data: (c) OpenStreetMap contributors, ODbL; Wikidata, CC0.
import gzip, json, os, sys, time, urllib.parse, urllib.request

UA = 'sundered-crowns-research/1.0'
API = 'https://www.wikidata.org/w/api.php'

def year(v):
    # Wikidata time '+1163-00-00T00:00:00Z' or an OSM date '1163', 'C12', '~1200', '1163-1345'
    v = str(v).strip().lstrip('~').lstrip('+')
    if v.upper().startswith('C') and v[1:].isdigit(): return (int(v[1:]) - 1) * 100 + 50
    neg = v.startswith('-'); v = v.lstrip('-')
    digits = ''
    for ch in v:
        if ch.isdigit(): digits += ch
        else: break
    return (-int(digits) if neg else int(digits)) if digits else None

def claims(ent, p):
    out = []
    for c in ent.get('claims', {}).get(p, []):
        dv = c.get('mainsnak', {}).get('datavalue', {}).get('value')
        if isinstance(dv, dict) and 'time' in dv: out.append(year(dv['time']))
    return [y for y in out if y is not None]

def main():
    plans, dst = sys.argv[1], sys.argv[2]
    res = json.load(open(dst)) if os.path.exists(dst) else {'osm': {}, 'wikidata': {}}
    want = set()
    for name in sorted(os.listdir(plans)):
        if not name.endswith('.json.gz'): continue
        with gzip.open(os.path.join(plans, name), 'rt') as fh: d = json.load(fh)
        for e in d['elements']:
            t = e.get('tags', {}); key = f"{e['type']}/{e['id']}"
            got = {k: year(t[k]) for k in ('start_date', 'construction_date') if k in t and year(t[k]) is not None}
            if 'wikidata' in t: got['wikidata'] = t['wikidata']; want.add(t['wikidata'])
            if got: res['osm'][key] = got
    ask = sorted(q for q in want if q not in res['wikidata'] and q.startswith('Q'))
    print(len(res['osm']), 'dated or linked OSM objects;', len(ask), 'Wikidata items to ask', flush=True)
    for i in range(0, len(ask), 50):
        ids = '|'.join(ask[i:i + 50])
        url = API + '?' + urllib.parse.urlencode({'action': 'wbgetentities', 'ids': ids, 'props': 'claims|labels', 'languages': 'en', 'format': 'json'})
        for attempt in range(5):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as r: ents = json.loads(r.read())['entities']
                break
            except Exception as e:
                print('  retry', e, flush=True); time.sleep(10 * (attempt + 1))
        else: continue
        for q, ent in ents.items():
            res['wikidata'][q] = {'label': ent.get('labels', {}).get('en', {}).get('value'), 'inception': min(claims(ent, 'P571'), default=None), 'dissolved': min(claims(ent, 'P576'), default=None)}
        json.dump(res, open(dst, 'w'), ensure_ascii=False)
        time.sleep(1)
    json.dump(res, open(dst, 'w'), ensure_ascii=False)
    dated = sum(1 for v in res['wikidata'].values() if v['inception'] is not None)
    print(len(res['wikidata']), 'Wikidata items,', dated, 'with an inception')

main()
