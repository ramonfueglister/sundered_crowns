import sys
# brow_shape.py dump.obj brow_obj_index eye_obj_index : outer tail of the brow card vs eye
objs={}; cur=None
for l in open(sys.argv[1]):
    if l.startswith('o '): cur=l.split()[1]; objs[cur]=[]
    elif l.startswith('v '): objs[cur].append(tuple(map(float,l.split()[1:4])))
b=[v for v in objs['s'+sys.argv[2]] if v[0]>0]; e=[v for v in objs['s'+sys.argv[3]] if v[0]>0]
ex=max(e,key=lambda v:v[0]); etop=max(v[1] for v in e); ec=(etop+min(v[1] for v in e))/2
print('eye outer corner x=%.3f, eye centre y=%.3f top=%.3f'%(ex[0],ec,etop))
xs=sorted(b,key=lambda v:v[0]); x0,x1=xs[0][0],xs[-1][0]
for k in range(9):
    lo=x0+(x1-x0)*k/9; hi=x0+(x1-x0)*(k+1)/9
    s=[v for v in b if lo<=v[0]<=hi]
    if s: print('x %.3f-%.3f  y %.3f..%.3f (rel eye centre %.3f..%.3f)'%(lo,hi,min(v[1] for v in s),max(v[1] for v in s),min(v[1] for v in s)-ec,max(v[1] for v in s)-ec))
