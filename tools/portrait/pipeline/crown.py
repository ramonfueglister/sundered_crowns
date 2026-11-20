# A crown (round 144): a circlet of gold round the head, on the hair, with fleurons standing on it, large and
# small in turn, and stones set in it. One file of one mesh, in the form of a plait's strand as the fillet's is
# (hairlib `write_bound`: the builder reads it as a rope and evens out how the head carries it over the mesh, so
# that it keeps its form on every head).
#
# What it is made after (docs/PORTRAITS.md, round 144): the crowns in Richard II's treasure as the Institute of
# Historical Research's page describes them (circlets with fleurons, large and small alternating, eight to
# fourteen; the one that survives, of c. 1380, twelve plaques and six large and six small fleurons; sapphires,
# balas rubies, pearls). No measure is given there: every length below is by eye, PLACEHOLDER. The plaques, their
# hinges, tracery and enamel are not made: the circlet is one smooth band with a raised rim at foot and top.
#
# The circlet is a wall round the head's upright axis as the fillet is (fillet.py): its foot runs round the head,
# higher behind than in front on the base's head (a portrait's bust leans back, and there it is level), and at
# every place it stands as far out as the hair under it does (the hair meshes given, read on MakeHuman's base
# head), evened round the head so that it is one oval, plus a gap. A fleuron is a flat plate cut as a lily, as
# thick as the band, standing on the band's top on the band's own corners. A stone is a low dome centred on a
# corner of the gold; a pearl a ball. Stones and fleurons are bound to the skin where their place on the band is
# bound, and a stone is tied to its corner of the gold by a triangle without area, so that the builder's evening
# carries all of it as one piece.
#
# What a triangle is of is said by where it lies in the (empty) image, from left to right: gold, the stones of the
# circlet (two kinds in turn), the stone of a large fleuron, pearls (`KINDS`; build.rs reads it).
#
# usage: python3 -I crown.py base.obj out name hair_view.obj[,hair_view.obj...]
#   CROWN_AT     the foot's height over the head's middle in front and behind (1 = 10 cm)
#   CROWN_BAND   the band's height, its thickness, how far it stands off the hair, how far its top stands further
#                out than its foot
#   CROWN_LILY   a large fleuron's height and a small one's
#   CROWN_SOFT   over how many degrees the band's distance from the axis is evened round the head
#   CROWN_EVEN   how often the builder evens out how the head carries it
import os
import sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hairlib import Head, bind_points, write_bound

base, out, name, hairs = sys.argv[1:5]
_e = lambda k, d: [float(t) for t in os.environ.get(k, d).split(',')]
AT = _e('CROWN_AT', '-0.08,0.12')
WIDE, THICK, GAP, FLARE = _e('CROWN_BAND', '0.2,0.03,0.015,0.02')
LILY = _e('CROWN_LILY', '0.46,0.25')
EVEN = int(os.environ.get('CROWN_EVEN', '300'))
KINDS = 5
PLAQUES, STEPS = 12, 12
N = PLAQUES * STEPS

H = Head(base)
pts = [H.V[np.unique(H.T)]]
for path in hairs.split(','):
    pts.append(np.array([[float(t) for t in l.split()[1:4]] for l in open(path) if l.startswith('v ')]))
P = np.concatenate(pts) - H.hc
th_p, r_p = np.degrees(np.arctan2(P[:, 0], P[:, 2])), np.hypot(P[:, 0], P[:, 2])

TH = -180 + 360 * np.arange(N) / N
foot = AT[0] + (AT[1] - AT[0]) * (1 - np.cos(np.radians(TH))) / 2
raw = np.zeros(N)
for i, (t, y) in enumerate(zip(TH, foot)):
    near = (np.abs((th_p - t + 180) % 360 - 180) < 5) & (P[:, 1] > y - 0.05) & (P[:, 1] < y + WIDE)
    raw[i] = r_p[near].max() if near.any() else 0
# evened round the head (over `CROWN_SOFT` degrees), then out again to where nothing comes through. The fillet is
# evened twice over 25 degrees; a circlet so round stood a centimetre and a half off the temples.
SOFT = _e('CROWN_SOFT', '12')[0]
w = round(SOFT * N / 360)
g = np.exp(-0.5 * (np.arange(-w, w + 1) / (w / 2)) ** 2); g /= g.sum()
even = np.convolve(np.concatenate([raw[-w:], raw, raw[:w]]), g, 'valid')
r = even + max(0.0, (raw - even).max()) + GAP
print(f'{name}: the band stands {r.min():.2f} to {r.max():.2f} from the axis, {np.abs(raw - even).max():.3f} evened away at most')

UP = np.array([0.0, 1.0, 0.0])
verts, parent, tris = [], [], []   # a corner, the corner whose binding it takes (itself: its own), (a, b, c, kind)


def put(q, par=None):
    verts.append(np.asarray(q, float)); parent.append(len(verts) - 1 if par is None else par)
    return len(verts) - 1


def out_of(t):
    return np.array([np.sin(np.radians(t)), 0.0, np.cos(np.radians(t))])


# The band's rings: outer foot, outer rim under the middle, outer middle, outer rim over it, outer top, inner top,
# inner foot. The rims stand a little further out than the middle (a raised edge at foot and top).
RIM = 0.012
M = 7
ring = []
for t, rr, y in zip(TH, r, foot):
    d = out_of(t)
    q = H.hc + d * rr + UP * y
    at = lambda v, o: q + UP * v + d * (FLARE * v / WIDE + o)
    ring.append([put(at(0, RIM)), put(at(0.22 * WIDE, RIM)), put(at(0.5 * WIDE, 0)), put(at(0.78 * WIDE, RIM)), put(at(WIDE, RIM)),
                 put(at(WIDE, -THICK)), put(at(0, -THICK))])
for i in range(N):
    nx = (i + 1) % N
    for j in range(M):
        k = (j + 1) % M
        a, b, c, d = ring[i][j], ring[i][k], ring[nx][j], ring[nx][k]
        tris.append((a, c, b, 0)); tris.append((b, c, d, 0))


def clip(poly):
    """A simple polygon (counter-clockwise) cut into triangles, ear by ear."""
    idx = list(range(len(poly)))
    cr = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    res = []
    while len(idx) > 3:
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = poly[i0], poly[i1], poly[i2]
            if cr(a, b, c) <= 1e-12:
                continue
            if any(cr(a, b, poly[j]) >= 0 and cr(b, c, poly[j]) >= 0 and cr(c, a, poly[j]) >= 0 for j in idx if j not in (i0, i1, i2)):
                continue
            res.append((i0, i1, i2)); idx.pop(k)
            break
        else:
            raise SystemExit('no ear')
    res.append(tuple(idx))
    return res


def lily(height, large):
    """The right half of a fleuron's outline from its foot up to its tip: across from the middle, up from the
    band's top, in parts of its height. A large one has a leaf to either side that curls down again and a pointed
    leaf in the middle; a small one three short leaves."""
    if large:
        half = [(0.10, 0.0), (0.085, 0.2), (0.21, 0.3), (0.33, 0.44), (0.325, 0.6), (0.21, 0.56), (0.115, 0.47), (0.165, 0.7), (0.09, 0.88), (0.0, 1.0)]
    else:
        half = [(0.18, 0.0), (0.15, 0.25), (0.36, 0.42), (0.40, 0.66), (0.22, 0.63), (0.14, 0.52), (0.19, 0.76), (0.0, 1.0)]
    return [(u * height, v * height) for u, v in half]


def ball(c, rad, kind, par, n=8, m=5, axis=None):
    """A ball (or, with three radii along `axis`' frame, a dome's body) round c, tied to the corner `par`."""
    e0, e1, e2 = axis if axis is not None else (np.array([1.0, 0, 0]), UP, np.array([0, 0, 1.0]))
    rad = np.broadcast_to(rad, 3)
    top = put(c + e2 * rad[2], par); bot = put(c - e2 * rad[2], par)
    rows = []
    for j in range(1, m):
        el = np.pi * j / m
        rows.append([put(c + (e0 * np.cos(2 * np.pi * i / n) * rad[0] + e1 * np.sin(2 * np.pi * i / n) * rad[1]) * np.sin(el) + e2 * np.cos(el) * rad[2], par) for i in range(n)])
    for i in range(n):
        k = (i + 1) % n
        tris.append((top, rows[0][i], rows[0][k], kind))
        tris.append((bot, rows[-1][k], rows[-1][i], kind))
        for a, b in zip(rows, rows[1:]):
            tris.append((a[i], b[i], b[k], kind)); tris.append((a[i], b[k], a[k], kind))
    # (tied: a triangle without area from the gold's corner to each of the ball's)
    for q in [top, bot] + [x for row in rows for x in row]:
        tris.append((par, q, q, kind))


stones = 0
for pl in range(PLAQUES):
    i0 = (pl * STEPS + N // 2) % N   # (a large fleuron in front, at 0 degrees)
    large = pl % 2 == 0
    t, d = TH[i0], out_of(TH[i0])
    side = np.cross(UP, d)   # (side, UP and d are a right hand's: what runs counter-clockwise in (side, UP) faces out)
    # the fleuron: its foot on the band's top between the rings beside i0, front on the outer corners, back on the inner
    lo, hi = ring[(i0 - 1) % N], ring[(i0 + 1) % N]
    c_out, c_in = verts[ring[i0][4]], verts[ring[i0][5]]
    half = lily(LILY[0] if large else LILY[1], large)
    reach = np.linalg.norm(verts[hi[4]] - verts[lo[4]]) / 2
    scale = reach / half[0][0]   # (the foot as broad as the band's corners stand apart; the rest as drawn)
    out2d = [(u * (scale if v == 0 else 1.0), v) for u, v in half]
    poly = out2d + [(-u, v) for u, v in reversed(out2d[:-1])]   # (counter-clockwise seen from outside)
    lean = FLARE / WIDE
    front, back = [], []
    for k, (u, v) in enumerate(poly):
        if v == 0:
            f, b = (hi[4], hi[5]) if u > 0 else (lo[4], lo[5])
        else:
            f = put(c_out + side * u + UP * v + d * lean * v, ring[i0][4])
            b = put(c_in + side * u + UP * v + d * lean * v, ring[i0][4])
        front.append(f); back.append(b)
    for a, b, c in clip(poly):
        tris.append((front[a], front[b], front[c], 0)); tris.append((back[a], back[c], back[b], 0))
    for k in range(len(poly)):
        nx = (k + 1) % len(poly)
        if poly[k][1] == 0 and poly[nx][1] == 0:
            continue   # (the foot: on the band)
        tris.append((front[k], back[k], front[nx], 0)); tris.append((front[nx], back[k], back[nx], 0))
    # the stone of the circlet under the fleuron: a low dome on the band's middle
    mid = ring[i0][2]
    ball(verts[mid] + d * 0.004, (0.05, 0.042, 0.026) if large else (0.036, 0.032, 0.02), 1 + pl // 2 % 2 if large else 2 - pl // 2 % 2, mid, axis=(side, UP, d))
    stones += 1
    if large:
        h = LILY[0]
        tip = front[len(out2d) - 1]
        # a stone where the three leaves meet, and a pearl on each leaf
        ball(c_out + UP * 0.34 * h + d * (lean * 0.34 * h + 0.004), (0.04, 0.045, 0.024), 3, front[2], axis=(side, UP, d))
        for u, v, par in [(0.265, 0.5, front[4]), (-0.265, 0.5, front[len(poly) - 5]), (0.0, 0.8, tip)]:
            ball(c_out + side * u * h + UP * v * h + d * (lean * v * h + 0.012), 0.021, 4, par)
        stones += 4
    else:
        ball(c_out + UP * 0.5 * LILY[1] + d * (lean * 0.5 * LILY[1] + 0.003), (0.022, 0.026, 0.015), 2 - pl // 2 % 2, front[len(out2d) - 1], axis=(side, UP, d))
        stones += 1

verts = np.array(verts)
# Each corner of the band goes with the skin in its own direction from the head's middle; every other corner with
# the skin of the band's corner it stands on.
own = (verts - H.hc) / np.linalg.norm(verts - H.hc, axis=1)[:, None]
anc = H.at(own, np.zeros(len(verts)))
anc = anc[np.array(parent)]
tri_list = [list(t[:3]) for t in tris]
tri_uv = [[((t[3] + 0.5) / KINDS, 0.5)] * 3 for t in tris]
write_bound(out, name, bind_points(H, verts, anc), tri_list, tri_uv, EVEN)
with open(os.path.join(out, name + '_view.obj'), 'w') as f:
    for q in verts:
        f.write('v %.5f %.5f %.5f\n' % tuple(q))
    for t in tri_list:
        if t[1] != t[2]:
            f.write('f %d %d %d\n' % (t[0] + 1, t[1] + 1, t[2] + 1))
# (every triangle of the gold's faces and of a stone faces out of its own piece: the pieces are closed)
vol = sum(np.dot(verts[a], np.cross(verts[b], verts[c])) for a, b, c in tri_list) / 6
assert vol > 0, vol
print(f'{name}: {len(verts)} points, {len(tri_list)} triangles ({sum(1 for t in tri_list if t[1] == t[2])} without area), {PLAQUES} fleurons, {stones} stones; the foot {AT[0] * 10:.1f} cm over the head\'s middle in front, {AT[1] * 10:.1f} behind')
