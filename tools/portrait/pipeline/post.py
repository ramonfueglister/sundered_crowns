# Atlas post-processing: grey normalised so opaque pixels average 0.85.
# usage: python3 -I post.py raw.png out.png
import sys
import numpy as np
from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert('RGBA')).astype(np.float32) / 255
m = a[..., 3] > 0.3
g = a[..., :3].mean(-1) / np.maximum(a[..., 3], 1e-3)
g = np.clip(g / max(g[m].mean(), 1e-3) * 0.85, 0, 1)
o = np.dstack([g, g, g, a[..., 3]])
print('alpha mean', a[..., 3].mean().round(3))
Image.fromarray((o * 255).astype(np.uint8)).save(sys.argv[2])
