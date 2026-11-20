# A fillet (round 128): a stiffened band of linen round the head, standing on the hair like a low crown. One
# closed band, in the form of a plait's strand (hairlib `write_tubes`: the builder reads it as it reads
# a rope, and evens out how the head carries it along the band, so that it keeps its form on every head).
#
# The band is a wall round the head's upright axis: its foot runs round the head from the forehead's top to the
# back of the head (`FILLET_AT`: 2 cm higher behind than in front on the base's head, which stands upright; a
# portrait's bust leans back, and there the band is level), and at every place it stands as far out as the hair
# under it does (the hair meshes given, read on MakeHuman's base head), evened round the head so that it is one
# oval, plus a gap. Its top stands a little further in than its foot (`FILLET_LEAN`); it does not follow the
# skull in above: a stiffened band does not.
#
# usage: python3 -I fillet.py base.obj out name hair_view.obj[,hair_view.obj...]
#   FILLET_AT    the foot's height over the head's middle in front and behind (1 = 10 cm)
#   FILLET_WIDE  the band's height, FILLET_THICK its thickness, FILLET_GAP how far it stands off the hair
#   FILLET_LEAN  how far the band's top stands further in than its foot
#   FILLET_TILE  the length of the band one tile of its image covers
import os
import sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hairlib import Head, bind_points, write_bound

base, out, name, hairs = sys.argv[1:5]
_e = lambda k, d: [float(t) for t in os.environ.get(k, d).split(',')]
AT, WIDE, THICK, GAP, LEAN, TILE = _e('FILLET_AT', '-0.1,0.1'), _e('FILLET_WIDE', '0.5')[0], _e('FILLET_THICK', '0.02')[0], _e('FILLET_GAP', '0.04')[0], _e('FILLET_LEAN', '0.08')[0], _e('FILLET_TILE', '0.4')[0]

H = Head(base)
# what the band goes round: the hair meshes' points and the skin's
pts = [H.V[np.unique(H.T)]]
for path in hairs.split(','):
    pts.append(np.array([[float(t) for t in l.split()[1:4]] for l in open(path) if l.startswith('v ')]))
P = np.concatenate(pts) - H.hc
th_p, r_p = np.degrees(np.arctan2(P[:, 0], P[:, 2])), np.hypot(P[:, 0], P[:, 2])

N = 120
TH = -180 + 360 * np.arange(N) / N
foot = AT[0] + (AT[1] - AT[0]) * (1 - np.cos(np.radians(TH))) / 2
# how far out the hair stands under the band, by direction (within 5 degrees to either side)
raw = np.zeros(N)
for i, (t, y) in enumerate(zip(TH, foot)):
    near = (np.abs((th_p - t + 180) % 360 - 180) < 5) & (P[:, 1] > y - 0.05) & (P[:, 1] < y + WIDE)
    raw[i] = r_p[near].max() if near.any() else 0
# evened round the head (twice over 25 degrees), then out again to where nothing comes through
g = np.exp(-0.5 * (np.arange(-25, 26) * 360 / N / 25) ** 2); g /= g.sum()
even = raw.copy()
for _ in range(2):
    even = np.convolve(np.concatenate([even[-25:], even, even[:25]]), g, 'valid')
r = even + max(0.0, (raw - even).max()) + GAP
print(f'{name}: the band stands {r.min():.2f} to {r.max():.2f} from the axis, {np.abs(raw - even).max():.3f} evened away at most')

# the rings: outer foot, outer top, inner top, inner foot (round the way the band runs, from the head's back by its
# left to the front and on)
def ring(t, rr, y):
    d = np.array([np.sin(np.radians(t)), 0.0, np.cos(np.radians(t))])
    up = np.array([0.0, 1.0, 0.0])
    q = H.hc + d * rr + up * y
    return np.array([q, q + up * WIDE - d * LEAN, q + up * WIDE - d * (LEAN + THICK), q - d * THICK])
rings = np.array([ring(t, rr, y) for t, rr, y in zip(TH, r, foot)])
mid = rings.mean(1)
# (the way round, back to the first ring: the band's last piece ends on the first ring's own points, so that its
# surface has no edge there; the image has its seam there)
s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(np.concatenate([mid, mid[:1]]), axis=0), axis=1))])
# the image: along the band a whole number of tiles, across it the outer face, the top, the inner face, the foot
tiles = max(1, round(s[-1] / TILE))
across = np.array([0, WIDE, WIDE + THICK, 2 * WIDE + THICK, 2 * WIDE + 2 * THICK]) / (s[-1] / tiles)
uv = np.stack([np.stack([np.full(5, u), across], -1) for u in s / s[-1] * tiles])
# Each corner goes with the skin in its own direction from the head's middle: the foot's corners with the skin of
# forehead, temples and the back of the head, the top's with the skin higher up, so that the band is as high on
# a head as that head's skull is between them.
verts = rings.reshape(-1, 3)
anc = H.at((verts - H.hc) / np.linalg.norm(verts - H.hc, axis=1)[:, None], np.zeros(len(verts)))
tri_list, tri_uv = [], []
n, m = rings.shape[:2]
for i in range(n):
    for j in range(m):
        k, nx = (j + 1) % m, (i + 1) % n
        a, b, c, d = i * m + j, i * m + k, nx * m + j, nx * m + k
        ua, ub, uc, ud = uv[i, j], uv[i, j + 1], uv[i + 1, j], uv[i + 1, j + 1]
        # (wound so that the band's outer side faces out: until round 132 it faced in, and the band was lit as
        # the inside of a ring is)
        tri_list.append([a, c, b]); tri_uv.append([tuple(ua), tuple(uc), tuple(ub)])
        tri_list.append([b, c, d]); tri_uv.append([tuple(ub), tuple(uc), tuple(ud)])
write_bound(out, name, bind_points(H, verts, anc), tri_list, tri_uv, int(os.environ.get('FILLET_EVEN', '300')))
with open(os.path.join(out, name + '.obj'), 'w') as f:
    for q in verts:
        f.write('v %.5f %.5f %.5f\n' % tuple(q))
    for t in tri_list:
        f.write('f %d %d %d\n' % (t[0] + 1, t[1] + 1, t[2] + 1))
print(f'{name}: {len(verts)} points, {len(tri_list)} triangles, {s[-1] * 10:.1f} cm round, {tiles} tiles; bound to skin between y {anc[:, 1].min():.2f} and {anc[:, 1].max():.2f}')
