# England's lashes from MakeHuman's: the image of the lashes' cards (four strips of single hairs, the two upper
# ones the upper lids', the two lower ones the lower lids') as a soft fringe. Seen from the front at a
# portrait's distance a row of lashes is a dark soft edge on the upper lid that runs out past the eye's outer
# corner; single hairs drawn dense enough to show stand off the lid as a doll's (rounds 65 and 76).
# usage: python3 -I lash_soft.py Eyelashes01.webp Eyelashes1356.webp 3 1.5 0.15
# The numbers: how far the hairs' covering is blurred (a Gaussian's sigma in pixels of the image's 512), the
# covering times this afterwards, and the lower lids' strips times this on top (seen from the front the lower
# lashes hang towards the viewer and show in full, the upper ones are seen from below and foreshortened: left
# alike, the lower lid gets a band of kohl). PLACEHOLDER, by eye beside the reference, and by the lid's rim read
# with tools/portrait/face_colour.mjs --brow. The image is grey (0.85) all over: the colour comes from the genes.
# Strips are told apart as connected parts of the hairs' covering.
import sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter
src,out,sig,gain,lower=sys.argv[1],sys.argv[2],float(sys.argv[3]),float(sys.argv[4]),float(sys.argv[5])
a=np.asarray(Image.open(src).convert('RGBA')).astype(float)/255
al=a[...,3]
m=np.asarray(Image.fromarray(((al>0.05)*255).astype('uint8')).filter(ImageFilter.MaxFilter(7)))>0
lab=np.zeros(m.shape,int); n=0; H,W=m.shape
for y0,x0 in zip(*np.where(m)):
    if lab[y0,x0]: continue
    n+=1; lab[y0,x0]=n; q=deque([(y0,x0)])
    while q:
        y,x=q.popleft()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            v,u=y+dy,x+dx
            if 0<=v<H and 0<=u<W and m[v,u] and not lab[v,u]: lab[v,u]=n; q.append((v,u))
parts=sorted(range(1,n+1),key=lambda k:np.where(lab==k)[0].mean())
assert n==4,n
res=np.zeros_like(al)
for i,k in enumerate(parts):
    one=Image.fromarray((np.where(lab==k,al,0)*255).astype('uint8')).filter(ImageFilter.GaussianBlur(sig))
    res+=np.asarray(one).astype(float)/255*gain*(lower if i>=2 else 1.0)
    ys,xs=np.where(lab==k); print('strip',i,'rows',ys.min(),ys.max(),'columns',xs.min(),xs.max(),'lower' if i>=2 else 'upper')
res=np.clip(res,0,1)
g=np.full_like(res,0.85)
Image.fromarray((np.dstack([g,g,g,res])*255).astype('uint8'),'RGBA').save(out,'WEBP',quality=92,method=6,exact=True,alpha_quality=100)
print(out,'coverage mean',round(float(res.mean()),4))
