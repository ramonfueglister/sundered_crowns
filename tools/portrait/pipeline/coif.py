# A man's coif (round 132): a close cap of linen over the hair and the ears, tied under the chin. One sheet with
# its edge turned in, and two strings from below the ears to under the chin, in the form of a plait's strand
# (hairlib `write_bound`: the builder reads it as it reads a rope, and evens out how the head carries it).
#
# The cap is a shell round the head's middle: in every direction above its edge it stands as far out as the hair
# and the skin under it do (the hair meshes given, read on MakeHuman's base head; none given: a bare head), evened
# so that it passes over an ear in one bow, plus a gap. Its edge: across the forehead, down in front of the ears to
# below the lobes, and round the nape (`COIF_EDGE`). The image lies on each half as on a flat piece of cloth laid
# against the side of the head, and the halves meet in a seam over the crown, as a coif's two pieces do.
#
# usage: python3 -I coif.py base.obj out name [hair_view.obj[,hair_view.obj...]]
#   COIF_EDGE    the edge's height over the head's middle, in degrees seen from there: in front, at the side,
#                behind; and the directions round the head (degrees from the front) between which it goes from the
#                front's height to the side's, and from the side's to the back's
#   COIF_GAP     how far the cap stands off what is under it, over the crown and at its edge (where it is not
#                evened and a head's own ear or jaw comes nearest); COIF_HEM how far its edge is turned in
#   COIF_SOFT    over how many degrees the cap is evened, over how many at its edge, and how many degrees above
#                the edge it is evened in full
#   COIF_STRING  the strings: breadth, how far off the skin, where they meet under the chin (degrees round the
#                head and below its middle), and how many pieces along one; COIF_CORNER where one leaves the
#                cap (degrees round the head from the front)
#   COIF_TILE    the length of cloth one tile of the image covers
#   COIF_EVEN    how often the builder evens out how the head carries the cap
import os
import sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hairlib import Head, bind_points, write_bound, dirs, unit

base, out, name = sys.argv[1:4]
hairs = sys.argv[4] if len(sys.argv) > 4 else ''
_e = lambda k, d: [float(t) for t in os.environ.get(k, d).split(',')]
F, S, B, T1, T2, T3, T4 = _e('COIF_EDGE', '6,-45,-38,45,72,105,150')
(GAP, GAP_EDGE), HEM, TILE = _e('COIF_GAP', '0.04,0.055'), _e('COIF_HEM', '0.05')[0], _e('COIF_TILE', '1.5')[0]
SW, SOFF, STH, SEL, SN = _e('COIF_STRING', '0.07,0.02,0,-66,28')

H = Head(base)
# (the strings go under the chin, which the head as hair is laid on it leaves out)
HS = Head(base, ymin=6.0)
smooth = lambda t: np.clip(t, 0, 1) ** 2 * (3 - 2 * np.clip(t, 0, 1))

# how far out skin and hair stand, by direction (a grid of 2 degrees; the farthest within 3 degrees)
STEP = 2.0
TH = np.arange(-180, 180, STEP)
EL = np.arange(-80, 90 + STEP / 2, STEP)
G = dirs(*np.meshgrid(TH, EL, indexing='ij'))
raw = H.skin(G.reshape(-1, 3)).reshape(len(TH), len(EL))
pts = [H.V[np.unique(H.T)]]
for path in [p for p in hairs.split(',') if p]:
    pts.append(np.array([[float(t) for t in l.split()[1:4]] for l in open(path) if l.startswith('v ')]))
P = np.concatenate(pts) - H.hc
r_p = np.linalg.norm(P, axis=1)
i_p = np.round((np.degrees(np.arctan2(P[:, 0], P[:, 2])) + 180) / STEP).astype(int) % len(TH)
j_p = np.clip(np.round((np.degrees(np.arcsin(P[:, 1] / r_p)) + 80) / STEP).astype(int), 0, len(EL) - 1)
np.maximum.at(raw, (i_p, j_p), r_p)
# (round the top every direction is the same place)
far = raw.copy()
for j in range(len(EL)):
    k = int(min(len(TH) // 2, np.ceil(1.5 / max(np.cos(np.radians(EL[j])), 0.02))))
    col = np.pad(raw, ((0, 0), (1, 1)), mode='edge')[:, j:j + 3].max(1)
    far[:, j] = np.max([np.roll(col, s) for s in range(-k, k + 1)], axis=0)


def even(a, over):
    n = int(3 * over / STEP)
    g = np.exp(-0.5 * (np.arange(-n, n + 1) * STEP / over) ** 2); g /= g.sum()
    a = np.stack([np.convolve(np.pad(r, n, mode='edge'), g, 'valid') for r in a])
    # (round the head as far as the place is broad: near the top a degree round is no way at all)
    res = a.copy()
    for j in range(a.shape[1]):
        o = min(60.0, over / max(np.cos(np.radians(EL[j])), 0.05))
        m = int(3 * o / STEP)
        gj = np.exp(-0.5 * (np.arange(-m, m + 1) * STEP / o) ** 2); gj /= gj.sum()
        c = a[:, j]
        reps = int(np.ceil(m / len(c))) + 1
        res[:, j] = np.convolve(np.concatenate([np.tile(c, reps)[-m:] if m else c[:0], c, np.tile(c, reps)[:m]]), gj, 'valid')
    return res


def edge(th):
    a = np.abs((th + 180) % 360 - 180)
    return F + (S - F) * smooth((a - T1) / (T2 - T1)) + (B - S) * smooth((a - T3) / (T4 - T3))


# Evened over what the head's form itself does (from the head's middle the jaw and the neck are further away the
# lower one looks: evened with that in it, the cap stood off the whole lower head), and out again to where
# nothing comes through above the edge
TREND = _e('COIF_TREND', '20')[0]
low = even(far, TREND)
hi = far - low
worn = EL[None, :] > np.array([edge(t) for t in TH])[:, None] - 4


def over(soft):
    e = hi.copy()
    for _ in range(4):
        e = np.maximum(even(e, soft), hi)
    e = even(e, 0.4 * soft)
    return e + np.maximum(0.0, (hi - e)[worn]).max() + low


# Near its edge the cap lies closer (evened over `COIF_SOFT`'s second number): evened as far as over the crown,
# the bow over an ear went on below the lobe, and the cap's side stood off the cheek and the neck as a helmet's
SOFT, TIGHT, REACH = (_e('COIF_SOFT', '5,1.5,14') + [1.5, 14])[:3]
env = over(TIGHT)
full = smooth((EL[None, :] - np.array([edge(t) for t in TH])[:, None]) / REACH)
env = env + (over(SOFT) - env) * full + GAP_EDGE - GAP + (GAP - GAP_EDGE) * full
print(f'{name}: the cap stands {(env + GAP - far)[worn].mean() * 10:.2f} cm over what is under it at the mean, {(env + GAP - far)[worn].max() * 10:.2f} at most, {np.maximum(0.0, (hi - even(hi, SOFT))[worn]).max() * 10:.2f} cm evened away at most')


def radius(d):
    th = np.degrees(np.arctan2(d[..., 0], d[..., 2])); el = np.degrees(np.arcsin(np.clip(d[..., 1], -1, 1)))
    i = ((th + 180) / STEP) % len(TH); j = np.clip((el + 80) / STEP, 0, len(EL) - 1.001)
    i0, j0 = np.floor(i).astype(int), np.floor(j).astype(int)
    fi, fj = i - i0, j - j0
    i0, i1 = i0 % len(TH), (i0 + 1) % len(TH)
    return env[i0, j0] * (1 - fi) * (1 - fj) + env[i1, j0] * fi * (1 - fj) + env[i0, j0 + 1] * (1 - fi) * fj + env[i1, j0 + 1] * fi * fj


# the cap: rings from the top down to the edge, then the edge turned in (two rings more)
N, M = 96, 30
ATH = -180 + 360 * np.arange(N) / N
verts, vdir = [H.hc + np.array([0.0, 1.0, 0.0]) * (radius(np.array([0.0, 1.0, 0.0])) + GAP)], [np.array([0.0, 1.0, 0.0])]
for j in range(1, M + 3):
    for t in ATH:
        el = 90 - min(j, M) / M * (90 - edge(t))
        d = dirs(np.array(t), np.array(el))
        rr = radius(d) + GAP
        if j == M + 1:
            rr -= 0.02
        if j == M + 2:
            # (turned in: back up inside the cap)
            el2 = el + np.degrees(HEM / rr)
            d = dirs(np.array(t), np.array(el2))
            rr = radius(d) + GAP - 0.02
        verts.append(H.hc + d * rr); vdir.append(d)
verts, vdir = np.array(verts), np.array(vdir)
ring = lambda j, i: 1 + (j - 1) * N + i % N


# the image on a half: as on a flat piece laid against the side of the head (by the angle from the side's
# direction and the bearing round it, lengths kept along every line from there)
def image(d, side):
    c = unit(np.array([side * 1.0, -0.25, 0.0]))
    e1 = unit(np.array([0.0, 0.0, 1.0]) - c * c[2]); e2 = np.cross(c, e1)
    g = np.arccos(np.clip(d @ c, -1, 1))
    t = d - c * (d @ c)
    n = np.linalg.norm(t)
    t = t / n if n > 1e-9 else e1
    return np.array([0.5 + side * 0.25 + 0.85 * g * (t @ e1) / TILE, 0.85 * g * (t @ e2) / TILE])


tri_list, tri_uv = [], []


def tri(a, b, c, uv=None):
    if uv is None:
        side = 1.0 if (vdir[a][0] + vdir[b][0] + vdir[c][0]) >= 0 else -1.0
        uv = [image(vdir[k], side) for k in (a, b, c)]
    tri_list.append([a, b, c]); tri_uv.append([tuple(u) for u in uv])


for i in range(N):
    tri(0, ring(1, i + 1), ring(1, i))
    for j in range(1, M):
        a, b, c, d = ring(j, i), ring(j, i + 1), ring(j + 1, i), ring(j + 1, i + 1)
        tri(a, b, c); tri(b, d, c)
# the edge and what is turned in: the image along the edge
s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(np.concatenate([verts[[ring(M, i) for i in range(N)]], verts[[ring(M, 0)]]]), axis=0), axis=1))])
tiles = max(1, round(s[-1] / TILE))
for i in range(N):
    u0, u1 = s[i] / s[-1] * tiles, s[i + 1] / s[-1] * tiles
    for j, (v0, v1) in ((M, (0.0, 0.02 / TILE)), (M + 1, (0.02 / TILE, (0.02 + HEM) / TILE))):
        a, b, c, d = ring(j, i), ring(j, i + 1), ring(j + 1, i), ring(j + 1, i + 1)
        tri(a, b, c, [(u0, v0), (u1, v0), (u0, v1)]); tri(b, d, c, [(u1, v0), (u1, v1), (u0, v1)])
# (wound so that the sheet's outer side faces out)
q = verts[np.array(tri_list)]
if (np.cross(q[:, 1] - q[:, 0], q[:, 2] - q[:, 0]) * (q.mean(1) - H.hc)).sum(1)[:2 * N * (M - 1)].sum() < 0:
    tri_list = [t[::-1] for t in tri_list]; tri_uv = [u[::-1] for u in tri_uv]
cap_n, cap_t = len(verts), len(tri_list)

# the strings: from inside the cap's corner below the ear, along the jaw, to where they meet under the chin; each a
# flat band on the skin (two faces, so that it is closed and seen from outside)
sverts, sanc = [], []
SN = int(SN)
# (a string's way: where the plane through the two corners below the ears and the place under the chin cuts the
# skin, so that it runs down behind the jaw's angle and along under the jaw)
corner_th = _e('COIF_CORNER', '84')[0]
el0 = edge(corner_th) + 5.0
C0 = H.hc + dirs(np.array(corner_th), np.array(el0)) * HS.skin(dirs(np.array(corner_th), np.array(el0)))
U = H.hc + dirs(np.array(STH), np.array(SEL)) * HS.skin(dirs(np.array(STH), np.array(SEL)))
print(f'{name}: the strings from ({C0[0]:.2f}, {C0[1]:.2f}, {C0[2]:.2f}) to under the chin at ({U[0]:.2f}, {U[1]:.2f}, {U[2]:.2f})')


def on_skin(y, z):
    out_of = lambda x: np.linalg.norm(np.array([x, y, z]) - H.hc) - HS.skin(unit(np.array([x, y, z]) - H.hc))
    if out_of(0.0) > 0:
        d = unit(np.array([0.0, y, z]) - H.hc)
        return d
    lo_x, hi_x = 0.0, 1.3
    for _ in range(30):
        m = 0.5 * (lo_x + hi_x)
        lo_x, hi_x = (m, hi_x) if out_of(m) < 0 else (lo_x, m)
    return unit(np.array([0.5 * (lo_x + hi_x), y, z]) - H.hc)


for side in (-1.0, 1.0):
    t = np.linspace(0, 1, SN + 1)
    D = np.array([on_skin(C0[1] + (U[1] - C0[1]) * q, C0[2] + (U[2] - C0[2]) * q) for q in t]) * np.array([side, 1.0, 1.0])
    # (evened along the way: the skin is read off a grid)
    for _ in range(3):
        D[1:-1] = unit(0.25 * D[:-2] + 0.5 * D[1:-1] + 0.25 * D[2:])
    mid = H.hc + D * (HS.skin(D) + SOFF)[:, None]
    # (inside the cap at its beginning: as far out as the cap's inner side)
    start = smooth(1 - t / 0.15)
    mid = mid + D * (np.maximum(0.0, radius(D) + GAP - 0.035 - HS.skin(D) - SOFF) * start)[:, None]
    tan = np.gradient(mid, axis=0); tan /= np.linalg.norm(tan, axis=1)[:, None]
    across = unit(np.cross(tan, D))
    base_i = cap_n + len(sverts)
    for k in range(SN + 1):
        for w, o in ((-0.5, 0.0), (0.5, 0.0), (0.5, 0.01), (-0.5, 0.01)):
            sverts.append(mid[k] + across[k] * SW * w + D[k] * o); sanc.append(mid[k] - D[k] * SOFF)
    L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(mid, axis=0), axis=1))]) / TILE
    for k in range(SN):
        for c in range(4):
            a, b = base_i + 4 * k + c, base_i + 4 * k + (c + 1) % 4
            a2, b2 = a + 4, b + 4
            v0, v1 = [0, SW, SW + 0.01, 2 * SW + 0.01, 2 * SW + 0.02][c] / TILE, [0, SW, SW + 0.01, 2 * SW + 0.01, 2 * SW + 0.02][c + 1] / TILE
            q = [(L[k], v0), (L[k], v1), (L[k + 1], v0), (L[k + 1], v1)]
            if side > 0:
                tri_list.append([a, a2, b]); tri_uv.append([q[0], q[2], q[1]])
                tri_list.append([b, a2, b2]); tri_uv.append([q[1], q[2], q[3]])
            else:
                tri_list.append([a, b, a2]); tri_uv.append([q[0], q[1], q[2]])
                tri_list.append([b, b2, a2]); tri_uv.append([q[1], q[3], q[2]])
    # its two ends closed
    for k, flip in ((0, side > 0), (SN, side < 0)):
        a = base_i + 4 * k
        f = [[a, a + 1, a + 2], [a, a + 2, a + 3]]
        for t3 in f:
            tri_list.append(t3 if flip else t3[::-1]); tri_uv.append([(0.0, 0.0), (0.02, 0.0), (0.02, 0.02)])
verts = np.concatenate([verts, np.array(sverts)])
# (a string's faces wound outward: its volume counts positive)
for k in range(2):
    lo_t = cap_t + k * (len(tri_list) - cap_t) // 2; hi_t = lo_t + (len(tri_list) - cap_t) // 2
    q = verts[np.array(tri_list[lo_t:hi_t])]
    c = q.reshape(-1, 3).mean(0)
    if (np.cross(q[:, 0] - c, q[:, 1] - c) * (q[:, 2] - c)).sum() < 0:
        tri_list[lo_t:hi_t] = [t[::-1] for t in tri_list[lo_t:hi_t]]; tri_uv[lo_t:hi_t] = [u[::-1] for u in tri_uv[lo_t:hi_t]]
# Each corner goes with the skin in its own direction from the head's middle, a string's with the skin it lies on.
u = (verts[:cap_n] - H.hc) / np.linalg.norm(verts[:cap_n] - H.hc, axis=1)[:, None]
anc = np.concatenate([H.at(u, np.zeros(cap_n)), np.array(sanc)])
write_bound(out, name, bind_points(H, verts, anc), tri_list, tri_uv, int(os.environ.get('COIF_EVEN', '3')))
with open(os.path.join(out, name + '_view.obj'), 'w') as f:
    for q in verts:
        f.write('v %.5f %.5f %.5f\n' % tuple(q))
    for t in tri_list:
        f.write('f %d %d %d\n' % (t[0] + 1, t[1] + 1, t[2] + 1))
lo = verts[:cap_n]
print(f'{name}: {len(verts)} points, {len(tri_list)} triangles ({cap_t} the cap); the cap from y {lo[:, 1].min():.2f} to {lo[:, 1].max():.2f}, '
      f'{2 * np.abs(lo[:, 0]).max() * 10:.1f} cm broad, its edge at y {verts[ring(M, N // 2)][1]:.2f} in front, {verts[ring(M, N // 4)][1]:.2f} at the side, {verts[ring(M, 0)][1]:.2f} behind')
