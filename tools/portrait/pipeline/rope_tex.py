# The image of a plait's round strands, from an image of hair cards: one tile's middle, where the hairs lie close,
# with the gaps between them filled by the hairs beside them, a little darker (a gap in a strand of a plait shows
# the hair below it, not the air). No covering: a strand of a plait is solid.
# usage: python3 -I rope_tex.py cards.webp out.png [tile=1] [tiles=8]
import sys
import numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
tile = int(sys.argv[3]) if len(sys.argv) > 3 else 1
tiles = int(sys.argv[4]) if len(sys.argv) > 4 else 8
ACROSS = (0.19, 0.81)     # the part of the tile's breadth used
ALONG = (0.12, 0.56)      # and of its height: below it the hairs thin out into single tips
GAP = 0.7                 # how light a gap is against the hairs beside it
im = np.asarray(Image.open(src).convert('RGBA')).astype(np.float64) / 255
H, W = im.shape[:2]
tw = W // tiles
part = im[round(ALONG[0] * H):round(ALONG[1] * H), tile * tw + round(ACROSS[0] * tw):tile * tw + round(ACROSS[1] * tw)]
rgb, a = part[..., :3], part[..., 3:]
# the hairs beside a gap: the colours spread sideways, weighted by their covering
k = np.exp(-0.5 * (np.arange(-12, 13) / 4.0) ** 2)
num = np.stack([np.apply_along_axis(lambda r: np.convolve(r, k, 'same'), 1, (rgb * a)[..., i]) for i in range(3)], -1)
den = np.apply_along_axis(lambda r: np.convolve(r, k, 'same'), 1, a[..., 0])[..., None]
beside = num / np.maximum(den, 1e-6)
res = rgb * a + GAP * beside * (1 - a)
res = Image.fromarray(np.round(np.clip(res, 0, 1) * 255).astype(np.uint8), 'RGB').resize((128, 512), Image.LANCZOS)
res.save(out)
print('rope image', out, 'covering of the part used', round(float(a.mean()), 3))
