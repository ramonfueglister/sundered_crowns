import os
import json, collections, sys
R=os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')) + '/public/data'
def load(y):
    d=json.load(open(f'{R}/setup_{y}.json'))
    c=collections.Counter(d['owner'])
    return {s['id']:(c.get(i,0), s) for i,s in enumerate(d['states'])}
a=load(1356); b=load(1492)
geo=json.load(open(R+'/geo.json')); names=geo['loc']['name']
rows=[]
for k,(n,s) in b.items():
    o=a.get(k,(None,None))[0]
    rows.append((n,k,o,len(s['holdings']), names[s['capital_loc']-1]))
rows.sort()
for n,k,o,h,cl in rows: print(f'{n:5d} {k:28s} 1356={o!s:5s} anchors={h:3d} cap_loc={cl}')
