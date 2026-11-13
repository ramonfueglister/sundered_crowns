import os
import json, glob, os, sys, collections
sys.path.insert(0, '.')
from lib import loc_at, km, _loc, L
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')) + ''
RANKS='empire kingdom grand_duchy duchy principality margraviate landgraviate county lordship prince_bishopric archbishopric free_city republic order khanate sultanate emirate beylik despotate tribe chiefdom'.split()
GOVS='feudal_monarchy elective_monarchy merchant_republic city_republic theocracy military_order nomadic_horde tribal_federation imperial'.split()
PERS='conqueror trader isolationist zealot opportunist diplomat builder'.split()
FAITHS='latin orthodox sunni shia ibadi jewish tengri baltic_old finnic_old sami_old coptic ethiopian church_of_east armenian_apostolic african_traditional american_traditional mesoamerican andean'.split()
import re
cult_src=open(ROOT+'/src/sim/content/peoples.ts').read()
CULTS=set(re.findall(r"'([a-z_]+)'", cult_src.split('export const GROUP_OF')[0]))
st={}; wars=[]
for f in sorted(glob.glob(ROOT+'/data/history/1492/*.json')):
    d=json.load(open(f))
    if 'states' not in d: continue
    for s in d['states']:
        if s['id'] in st: print('DUP', s['id'])
        s['_f']=os.path.basename(f); st[s['id']]=s
    wars+=d['wars']
print('states', len(st), 'wars', len(wars))
for s in st.values():
    for k,v,allowed in (('rank',s['rank'],RANKS),('gov',s['government'],GOVS),('pers',s['personality'],PERS),('faith',s['faith'],FAITHS),('cult',s['culture'],CULTS)):
        if v not in allowed: print('BADENUM', s['id'], k, v)
    for k in ('allies','rivals','claims_on'):
        for x in s[k]:
            if x not in st: print('BADREF', s['id'], k, x)
    if s['overlord'] and s['overlord'] not in st: print('BADOVER', s['id'], s['overlord'])
    for r in ('ruler','heir','consort'):
        c=s.get(r)
        if c and c.get('born') and c['born']>1492: print('BORN', s['id'], r, c)
for w in wars:
    for x in w['attackers']+w['defenders']:
        if x not in st: print('BADWAR', w['name']['en'], x)
owner=collections.defaultdict(list)
for s in st.values():
    cap=(s['capital']['lat'], s['capital']['lon'])
    for i,h in enumerate(s['holdings']):
        l=loc_at(h['lon'],h['lat'])
        if not l: print('OFFMAP', s['id'], h['name']); continue
        owner[l].append((s['id'],h['name']))
        d=km((h['lat'],h['lon']),cap)
        lim=int(sys.argv[1]) if len(sys.argv)>1 else 700
        if d>lim: print('DIST', s['id'], h['name'], int(d), _loc['region_key'][l-1])
for l,v in owner.items():
    ids={a for a,_ in v}
    if len(ids)>1: print('CONFLICT', _loc['name'][l-1], v)
