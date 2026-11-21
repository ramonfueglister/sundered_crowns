# A man's felt hat (round 134): a round crown and a broad brim, in one sheet, in the form of a plait's strand
# (hairlib `write_bound`: the builder reads it as it reads a rope, and evens out how the head carries it).
#
# The crown is a shell round the head's middle: in every direction above the line it sits on it stands as far out
# as the skin and the hair under it do (the hair meshes given, read on MakeHuman's base head: the hair that lies
# flat under a hood, and the horseshoe round a bare top), evened to one dome, plus a gap, and higher over the top
# of the head than at the line. The line: across the forehead and level round the head, above the ears
# (`HAT_AT`). The brim leaves the crown at that line, goes out and a little down, turns round its edge and comes
# back underneath to the crown: felt has a thickness, and the brim's underside is what a face under it shows.
#
# usage: python3 -I hat.py base.obj out name [hair_view.obj[,hair_view.obj...]]
#   HAT_AT     the line's height over the head's middle, in degrees seen from there: in front, behind
#   HAT_GAP    how far the crown stands off what is under it, how much higher it stands over the top of the head
#              than at the line, and over how many degrees it is evened
#   HAT_BRIM   the brim: how broad, how many degrees it falls outward, how thick, how far its edge rises and falls
#              round the head (felt that has been rained on), and how often
#   HAT_COCK   (round 135) a brim turned up behind: by how many degrees it rises there (0: a brim that falls all
#              round), from how many degrees round the head it begins to turn up and from how many it is up in
#              full; and in front how much longer it is at the middle (a share), over how many degrees to
#              either side: a point
#   HAT_TILE   the length of felt one tile of the image covers
#   HAT_EVEN   how often the builder evens out how the head carries the hat
import os
import sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hairlib import Head, bind_points, write_bound, dirs, unit

base, out, name = sys.argv[1:4]
hairs = sys.argv[4] if len(sys.argv) > 4 else ''
_e = lambda k, d: [float(t) for t in os.environ.get(k, d).split(',')]
F, B = _e('HAT_AT', '2,8')
GAP, DOME, SOFT = _e('HAT_GAP', '0.08,0.4,12')
BW, FALL, THICK, WAVE, WAVES = _e('HAT_BRIM', '0.6,20,0.06,0.06,2')
COCK, C0, C1, PEAK, PEAK_W = _e('HAT_COCK', '0,60,130,0,25')
TILE = _e('HAT_TILE', '0.5')[0]

H = Head(base)
smooth = lambda t: np.clip(t, 0, 1) ** 2 * (3 - 2 * np.clip(t, 0, 1))

# how far out skin and hair stand, by direction (a grid of 2 degrees; the farthest within 3 degrees), as coif.py
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
far = raw.copy()
for j in range(len(EL)):
    k = int(min(len(TH) // 2, np.ceil(1.5 / max(np.cos(np.radians(EL[j])), 0.02))))
    col = np.pad(raw, ((0, 0), (1, 1)), mode='edge')[:, j:j + 3].max(1)
    far[:, j] = np.max([np.roll(col, s) for s in range(-k, k + 1)], axis=0)


def even(a, over):
    n = int(3 * over / STEP)
    g = np.exp(-0.5 * (np.arange(-n, n + 1) * STEP / over) ** 2); g /= g.sum()
    a = np.stack([np.convolve(np.pad(r, n, mode='edge'), g, 'valid') for r in a])
    res = a.copy()
    for j in range(a.shape[1]):
        o = min(60.0, over / max(np.cos(np.radians(EL[j])), 0.05))
        m = int(3 * o / STEP)
        gj = np.exp(-0.5 * (np.arange(-m, m + 1) * STEP / o) ** 2); gj /= gj.sum()
        c = a[:, j]
        reps = int(np.ceil(m / len(c))) + 1
        res[:, j] = np.convolve(np.concatenate([np.tile(c, reps)[-m:] if m else c[:0], c, np.tile(c, reps)[:m]]), gj, 'valid')
    return res


def line(th):
    return F + (B - F) * 0.5 * (1 - np.cos(np.radians(th)))


# One dome: evened, and out again to where nothing comes through above the line
worn = EL[None, :] > np.array([line(t) for t in TH])[:, None] - 4
e = far.copy()
for _ in range(4):
    e = np.maximum(even(e, SOFT), far * worn + e * ~worn)
e = even(e, 0.4 * SOFT)
env = e + np.maximum(0.0, (far - e)[worn]).max()
print(f'{name}: the crown stands {(env + GAP - far)[worn].mean() * 10:.2f} cm over what is under it at the mean at its line\'s gap, {(env + GAP - far)[worn].max() * 10:.2f} at most')


def radius(d):
    th = np.degrees(np.arctan2(d[..., 0], d[..., 2])); el = np.degrees(np.arcsin(np.clip(d[..., 1], -1, 1)))
    i = ((th + 180) / STEP) % len(TH); j = np.clip((el + 80) / STEP, 0, len(EL) - 1.001)
    i0, j0 = np.floor(i).astype(int), np.floor(j).astype(int)
    fi, fj = i - i0, j - j0
    i0, i1 = i0 % len(TH), (i0 + 1) % len(TH)
    return env[i0, j0] * (1 - fi) * (1 - fj) + env[i1, j0] * fi * (1 - fj) + env[i0, j0 + 1] * (1 - fi) * fj + env[i1, j0 + 1] * fi * fj


# the crown: rings from the top down to the line
N, M = 96, 20
ATH = -180 + 360 * np.arange(N) / N
UP = np.array([0.0, 1.0, 0.0])
verts, vdir, rho = [H.hc + UP * (radius(UP) + GAP + DOME)], [UP], [0.0]
for j in range(1, M + 1):
    for t in ATH:
        q = j / M
        d = dirs(np.array(t), np.array(90 - q * (90 - line(t))))
        verts.append(H.hc + d * (radius(d) + GAP + DOME * (1 - smooth(q)))); vdir.append(d); rho.append(0.0)
crown_n = len(verts)
ring = lambda j, i: 1 + (j - 1) * N + i % N
# the brim: out and a little down from the line, round its edge, and back underneath
K = 7
prof = [(BW * k / K, 0.0) for k in range(1, K + 1)] + [(BW + 0.5 * THICK, -0.5 * THICK), (BW, -THICK)] + [(BW * k / K, -THICK) for k in range(K - 1, -1, -1)]
for s, low in prof:
    for i, t in enumerate(ATH):
        p0 = np.array(verts[ring(M, i)])
        o = unit(np.array([p0[0] - H.hc[0], 0.0, p0[2] - H.hc[2]]))
        # (how far round the head the place is from the front: there the brim falls, behind it may be turned up)
        up = smooth((abs(t) - C0) / (C1 - C0)) if COCK else 0.0
        fall = np.radians(FALL * (1 - up) - COCK * up)
        long = 1 + PEAK * np.exp(-(t / PEAK_W) ** 2)
        wave = WAVE * np.sin(np.radians(WAVES * t) + 0.7) * (s / BW) ** 2 * (1 - up)
        # (a brim that falls all round is as thick straight down; one turned up, across itself)
        along, under = o * np.cos(fall) - UP * np.sin(fall), (-UP * np.cos(fall) - o * np.sin(fall)) if COCK else -UP
        verts.append(p0 + along * s * long + under * -low + UP * wave); vdir.append(vdir[ring(M, i)]); rho.append(0.0)
verts, vdir = np.array(verts), np.array(vdir)
R = len(prof)
# the image: one sheet laid out round the top (a place's way down from the top, and its direction round the head)
for i in range(N):
    way = 0.0
    prev = verts[0]
    for j in range(1, M + R + 1):
        k = ring(j, i)
        way += np.linalg.norm(verts[k] - prev); prev = verts[k]
        rho[k] = way
uv = lambda k: (0.5 + rho[k] * np.sin(np.arctan2(vdir[k][0], vdir[k][2]) if k else 0.0) / TILE, 0.5 + rho[k] * np.cos(np.arctan2(vdir[k][0], vdir[k][2]) if k else 0.0) / TILE)
tri_list, tri_uv = [], []


def tri(a, b, c):
    tri_list.append([a, b, c]); tri_uv.append([uv(a), uv(b), uv(c)])


# (the crown's triangles first, then the brim's)
for i in range(N):
    tri(0, ring(1, i + 1), ring(1, i))
    for j in range(1, M):
        a, b, c, d = ring(j, i), ring(j, i + 1), ring(j + 1, i), ring(j + 1, i + 1)
        tri(a, b, c); tri(b, d, c)
for i in range(N):
    for j in range(M, M + R):
        a, b, c, d = ring(j, i), ring(j, i + 1), ring(j + 1, i), ring(j + 1, i + 1)
        tri(a, b, c); tri(b, d, c)
# (wound so that the crown's outer side faces out; the brim's underside then faces down)
q = verts[np.array(tri_list)]
if (np.cross(q[:, 1] - q[:, 0], q[:, 2] - q[:, 0]) * (q.mean(1) - H.hc)).sum(1)[:N * (2 * M - 1)].sum() < 0:
    tri_list = [t[::-1] for t in tri_list]; tri_uv = [u[::-1] for u in tri_uv]
# Each corner of the crown goes with the skin in its own direction from the head's middle, a corner of the brim
# with the skin under the place on the line it hangs from.
anc = H.at(vdir, np.zeros(len(vdir)))
write_bound(out, name, bind_points(H, verts, anc), tri_list, tri_uv, int(os.environ.get('HAT_EVEN', '12')))
with open(os.path.join(out, name + '_view.obj'), 'w') as f:
    for p in verts:
        f.write('v %.5f %.5f %.5f\n' % tuple(p))
    for t in tri_list:
        f.write('f %d %d %d\n' % (t[0] + 1, t[1] + 1, t[2] + 1))
lo = verts[:crown_n]
print(f'{name}: {len(verts)} points, {len(tri_list)} triangles ({N * (2 * M - 1)} the crown); the crown from y {lo[:, 1].min():.2f} to {lo[:, 1].max():.2f}, '
      f'{2 * np.abs(lo[:, 0]).max() * 10:.1f} cm broad, the line at y {verts[ring(M, N // 2)][1]:.2f} in front, {verts[ring(M, N // 4)][1]:.2f} at the side, {verts[ring(M, 0)][1]:.2f} behind; the hat {2 * np.abs(verts[:, 0]).max() * 10:.1f} cm broad')
