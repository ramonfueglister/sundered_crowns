# A brow whose tail tapers to nothing: the hairs' image of a brow (two brows, one above the other, as tex.py
# writes MakeHuman's) with the thin streak at each brow's outer end faded out. MakeHuman's brow ends in a streak
# two or three pixels thin and a tenth of the brow long; on the head it is a drawn line from the brow's tail
# down towards the temple.
# usage: python3 -I brow_tail.py eyebrow001.png eyebrow1356.png
# TAIL=0.2,0.05: the share of the brow's length at its outer end over which it fades out, and the share at the
# very end that is gone. PLACEHOLDER, by eye.
# (Tried in round 76 and without effect: the hairs' grey carried out under the pixels that no hair covers, which
# tex.py leaves black. The hairs' covering falls off so gently that the black never shows.)
import os, sys
import numpy as np
from PIL import Image
src, out = sys.argv[-2], sys.argv[-1]
TAIL = [float(t) for t in os.environ.get('TAIL', '0.2,0.05').split(',')]
im = np.asarray(Image.open(src).convert('RGBA')).astype(np.float64) / 255
a = im[..., 3].copy()
h, w = a.shape
for rows in (slice(0, h // 2), slice(h // 2, h)):
    cols = np.nonzero((a[rows] > 0.15).any(axis=0))[0]
    x0, x1 = cols.min(), cols.max()
    thick = lambda xs: np.mean([(a[rows, x] > 0.15).sum() for x in xs])
    tail_right = thick(range(x1 - 30, x1)) < thick(range(x0, x0 + 30))
    t = (np.arange(w) - x0) / max(1, x1 - x0)          # 0 at the left end, 1 at the right
    d = (1 - t) if tail_right else t                    # the distance from the tail's end, in lengths of the brow
    fade = np.clip((d - TAIL[1]) / max(1e-6, TAIL[0] - TAIL[1]), 0, 1)
    a[rows] *= (fade * fade * (3 - 2 * fade))[None, :]
    print('brow in rows', rows.start, 'to', rows.stop, ': columns', x0, 'to', x1, ', tail at the', 'right' if tail_right else 'left')
im[..., 3] = a
Image.fromarray((np.clip(im, 0, 1) * 255).round().astype(np.uint8)).save(out)
print(out, 'covering', round(float(im[..., 3].mean()), 4))
