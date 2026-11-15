# Grey version of each hair texture (alpha kept), mean brightness 0.85 where
# opaque, so the hair colour of the genes tints it. usage: tex.py hairdir outdir name...
import sys, os, glob
import numpy as np
from PIL import Image
hdir, out = sys.argv[1:3]
for name in sys.argv[3:]:
    f = glob.glob(os.path.join(hdir, name, 'textures', '*diffuse*.png')) or glob.glob(os.path.join(hdir, name, 'textures', '*.png'))
    a = np.asarray(Image.open(f[0]).convert('RGBA')).astype(np.float32) / 255
    lum = a[..., 0] * 0.3 + a[..., 1] * 0.59 + a[..., 2] * 0.11
    m = a[..., 3] > 0.5
    g = np.clip(lum / max(lum[m].mean(), 1e-3) * 0.85, 0, 1)
    gain = float(os.environ.get('ALPHA_GAIN', '1'))
    o = np.dstack([g, g, g, np.clip(a[..., 3] * gain, 0, 1)])
    Image.fromarray((o * 255).astype(np.uint8)).save(os.path.join(out, name + '.png'))
    print(name, f[0].split('/')[-1], a.shape, 'opaque share', round(float(m.mean()), 3))
