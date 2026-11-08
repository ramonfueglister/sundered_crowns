import os
import sys, json, numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')) + '/tools/geo')
from common import *
year = sys.argv[1]; out = sys.argv[2]
crop = sys.argv[3] if len(sys.argv) > 3 else None   # lon0,lat0,lon1,lat1
scale = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5
setup = json.load(open(fos.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')) + '/public/data/setup_{year}.json'))
geo = json.load(open(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')) + '/public/data/geo.json'))
L = geo['L']
ids = np.load('/home/user/geo-cache/stage/ids.npy')
pal = np.zeros((ids.max() + 1, 3), np.uint8)
pal[:] = (40, 70, 110)
pal[1:L + 1] = (150, 150, 140)
for i, o in enumerate(setup['owner']):
    if o >= 0:
        c = setup['states'][o]['color'].lstrip('#'); pal[i + 1] = [int(c[k:k + 2], 16) for k in (0, 2, 4)]
own = np.full(ids.max() + 1, -2, np.int32); own[1:L + 1] = setup['owner']
if crop:
    a, b, c, d = map(float, crop.split(','))
    x0, y1 = lonlat_to_px(a, b); x1, y0 = lonlat_to_px(c, d)
    x0, x1, y0, y1 = int(x0), int(x1), int(y0), int(y1)
else:
    x0, y0, x1, y1 = 0, 0, ids.shape[1], ids.shape[0]
sub = ids[y0:y1, x0:x1]
img = pal[sub].copy()
o = own[sub]
edge = np.zeros(o.shape, bool)
edge[:, 1:] |= o[:, 1:] != o[:, :-1]; edge[1:, :] |= o[1:, :] != o[:-1, :]
img[edge] = (img[edge] * 0.35).astype(np.uint8)
im = Image.fromarray(img)
if scale != 1: im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
dr = ImageDraw.Draw(im)
if len(sys.argv) > 5:
    for st in setup['states']:
        cl = st.get('capital_loc', 0)
        if cl <= 0: continue
        x, y = lonlat_to_px(st['capital']['lon'], st['capital']['lat'])
        x = (x - x0) * scale; y = (y - y0) * scale
        if 0 <= x < im.width and 0 <= y < im.height:
            dr.text((x - 8, y - 5), st['id'][:14], fill=(0, 0, 0))
im.save(out)
print(im.size)
