# pack_real.py src_dir out_dir needed.txt : the real look's files for the game
# images -> WebP, at most 1024 px (normal maps lossy q90, colour q92 with exact alpha)
# text  -> copied (zpack packs the big ones afterwards)
import sys, os, shutil
from PIL import Image
src, out, lst = sys.argv[1], sys.argv[2], sys.argv[3]
for f in open(lst).read().split():
    p = os.path.join(src, f)
    if f.endswith('.png'):
        im = Image.open(p)
        im.load()
        w, h = im.size
        k = min(1.0, 1024 / max(w, h))
        if k < 1.0:
            im = im.resize((round(w * k), round(h * k)), Image.LANCZOS)
        o = os.path.join(out, f[:-4] + '.webp')
        if f.endswith('_n.png'):
            im.convert('RGB').save(o, 'WEBP', quality=90, method=6)
        elif im.mode == 'RGBA':
            im.save(o, 'WEBP', quality=92, method=6, exact=True, alpha_quality=100)
        else:
            im.convert('RGB').save(o, 'WEBP', quality=92, method=6)
    else:
        shutil.copy(p, os.path.join(out, f))
