"""Writes data/history/rulers/realms_frame.json: the realms of the start setup of 1291 that hold land inside the world
frame (data/content/world_extent.json), with what the 1291 research says about them. It is the work list for the
lists of rulers 1291-1848 (one list per realm, every row with its source)."""

import collections
import glob
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
geo = json.load(open(ROOT / 'public/data/geo.json'))
setup = json.load(open(ROOT / 'public/data/setup_1291.json'))
ext = json.load(open(ROOT / 'data/content/world_extent.json'))
loc = geo['loc']
hist = {}
for f in sorted(glob.glob(str(ROOT / 'data/history/1291/*.json'))):
    for st in json.load(open(f)).get('states', []):
        hist[st['id']] = st
places = collections.Counter(
    o
    for i, o in enumerate(setup['owner'])
    if o >= 0 and ext['west'] <= loc['lon'][i] <= ext['east'] and ext['south'] <= loc['lat'][i] <= ext['north']
)
out = []
for k, n in places.most_common():
    st = setup['states'][k]
    h = hist.get(st['id'], {})
    ru = h.get('ruler') or {}
    out.append(
        {
            'id': st['id'],
            'name': st['name']['en'],
            'short': (st.get('short') or st['name'])['en'],
            'rank': st.get('rank'),
            'government': h.get('government'),
            'places': n,
            'capital': (h.get('capital') or {}).get('name'),
            'ruler_1291': ru.get('name'),
            'ruler_born': ru.get('born'),
            'dynasty': ru.get('dynasty'),
            'overlord': h.get('overlord'),
        }
    )
json.dump(
    {
        'note': 'Realms of setup_1291 with land in the world frame, largest first. Built by tools/history/rulers/realms_frame.py.',
        'realms': out,
    },
    open(ROOT / 'data/history/rulers/realms_frame.json', 'w'),
    ensure_ascii=False,
    indent=1,
)
print(len(out))
