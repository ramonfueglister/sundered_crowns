# extreme_set.py out.json : founders of all origins, the most extreme face genes first
import json, random, copy, sys
src=json.load(open('/home/claude/work/kleider_b.json'))
man=[p for p in src if not p['female']][0]; wom=[p for p in src if p['female']][0]
GENES=["headW","headH","headF","fore","jaw","chin","chinH","cheek","noseL","noseW","hump","tip","eyeS","eyeD","brow","browA","ear","earF","mouthW","lips","neck","weight","muscle","typA","typB","typC","skin","hairL","hairR","eye","curl","bald","grey","beardG"]
O=['Italia','Gallia','Germania','Graecia','Syria','Aegyptus','Africa']
RANGES=[
 [("skin",40,130),("hairL",10,120),("hairR",0,60),("eye",0,140),("curl",40,150),("typA",0,50),("typB",0,40),("typC",170,255)],
 [("skin",0,80),("hairL",50,220),("hairR",20,170),("eye",50,255),("curl",0,100),("typA",0,20),("typB",0,30),("typC",210,255)],
 [("skin",0,60),("hairL",90,240),("hairR",10,150),("eye",100,255),("curl",0,80),("typA",0,15),("typB",0,30),("typC",220,255)],
 [("skin",50,130),("hairL",0,90),("hairR",0,50),("eye",0,110),("curl",60,170),("typA",0,50),("typB",0,50),("typC",170,255)],
 [("skin",70,160),("hairL",0,60),("hairR",0,40),("eye",0,80),("curl",60,190),("typA",0,60),("typB",20,100),("typC",140,230)],
 [("skin",100,190),("hairL",0,50),("hairR",0,30),("eye",0,60),("curl",100,220),("typA",60,170),("typB",0,60),("typC",90,200)],
 [("skin",110,240),("hairL",0,40),("hairR",0,20),("eye",0,50),("curl",140,255),("typA",120,255),("typB",0,30),("typC",30,140)]]
SH=json.load(open('/home/claude/work/howells/face_shift.json'))['shift']
rng=random.Random(23)
def am():
    s=sum(rng.randrange(256) for _ in range(4)); return max(0,min(255,int(128+(s-510)*48*122/(255*100))))
def person(o, fem, k):
    d=[0]*68
    for i,g in enumerate(GENES):
        r=[x for x in RANGES[o] if x[0]==g]
        sh=SH[O[o]].get(g,0)
        for a in (0,1):
            if r: v=rng.randint(r[0][1],r[0][2])
            elif g in ('bald','grey'): v=rng.randrange(40)
            else: v=max(0,min(255,am()+sh))
            d[i+34*a]=v
    p=copy.deepcopy(wom if fem else man); p['dna']=d; p['pid']=940000+k; p['origin']=O[o]; p['stand']=1; p['age']=32.0
    return p
def score(p):
    d=p['dna']; return sum(max(0,abs((d[i]+d[i+34])/2-128)/24-1.5)**2 for i in range(21))
pool=[person(k%7, k%2==1, k) for k in range(120)]
pool.sort(key=score, reverse=True)
ext=[p for p in pool if not p['female']][:6]+[p for p in pool if p['female']][:6]
for p in ext: print(p['pid'], p['origin'], 'F' if p['female'] else 'M', round(score(p),2))
json.dump(ext, open(sys.argv[1],'w'))
