# A mantle (round 145): a cloth that lies round the back of the neck and on both shoulders, falls over the arms and
# the back and is open in front, its front edges and its neck faced with the fur it is lined with. One sheet, laid,
# not draped: MakeHuman's base stands with its arms spread, and a cloth let fall on it hangs from the arms as a
# curtain, which the builder then swings into the body when the arms come down. The sheet is a tent instead: at
# every height it goes round the body, the arms and the gown as a taut string would (the convex hull of that
# height's section, a gap outside it), and from the shoulders down it never comes in again (a cloth hangs). With
# the arms down, the builder's `calm` brings the part over an arm down with it (`tunic_bind.py` binds the sheet).
# Its folds are laid on it: hollows that run down the cloth and deepen below the shoulders.
#
# usage: python3 -I mantle.py base.obj dir out name
#   (reads the gowns `MANTLE_OVER` from `dir`, as `dag.py` reads a bound file; writes `out/name.txt`,
#   `out/name_ao.txt` and `out/name_view.obj`)
#   MANTLE_OVER  the gowns the mantle has to lie outside of (files of `dir`, bound by `tunic_bind.py`)
#   MANTLE_AT    where the sheet begins: how far from the body's upright axis round the neck; how far it stands off
#                body and gown; down to which height it goes (the gowns end at 1.84: a child's picture shows the
#                cloth 12 cm below where the head's own data ends, at 3.45); how far out on an arm; how far from
#                the axis it begins at the back of the neck
#   MANTLE_OPEN  the opening in front: degrees to either side of the middle, seen from the axis
#   MANTLE_GRID  the sheet's corners: degrees between two columns, length between two rings
#   MANTLE_FOLD  the folds: how deep; below which height they begin; over what length they reach their depth; how
#                many round the body
#   MANTLE_FUR   the facing: how broad along the front edges; how broad round the neck; how far the fur stands
#                over the cloth; how far off the axis the sheet stands where the first is measured
#   MANTLE_CLASP where a brooch sits on either front edge: at which height, how far in from the edge
# The triangles of the facing are marked in the image's coordinates, which repeat with every whole number: 64 is
# added to the first (the builder draws them with the fur's image), and 128 where a brooch sits.
import os
import subprocess
import sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hairlib import Head, unit

base, src, out, name = sys.argv[1:5]
_e = lambda k, d: [float(t) for t in os.environ.get(k, d).split(',')]
OVER = os.environ.get('MANTLE_OVER', 'cloth_cote,cloth_cote_v,cloth_kirtle').split(',')
RNECK, GAP, HEM, XCUT, RBACK = _e('MANTLE_AT', '0.8,0.1,2.3,3.6,0.66')
OPEN = _e('MANTLE_OPEN', '36')[0]
DPH, DS = _e('MANTLE_GRID', '3,0.11')
F_DEEP, F_Y, F_LEN, F_N = _e('MANTLE_FOLD', '0.16,5.45,0.8,9')
FUR_EDGE, FUR_NECK, FUR_UP, FUR_R = _e('MANTLE_FUR', '0.7,0.6,0.05,1.25')
CL_Y, CL_IN = _e('MANTLE_CLASP', '5.42,0.2')
AX = np.array([0.0, 0.1])
smooth = lambda t: np.clip(t, 0, 1) ** 2 * (3 - 2 * np.clip(t, 0, 1))


def rows_of(n):
    path = os.path.join(src, n + '.txt')
    if os.path.exists(path):
        return open(path).read().split('\n')
    import zstandard
    return zstandard.ZstdDecompressor().decompress(open(path + '.zst', 'rb').read()).decode().split('\n')


H = Head(base, ymin=3.4, hc=(0.0, 5.0, 0.2), xmax=2.85)
HB = H.V[H.used]


def laid(n):
    # a bound garment as it lies on the base body (as the builder reads it, `mh_cloth`)
    rows = rows_of(n)
    nv, nt = map(int, rows[0].split())
    V0 = np.array([[float(t) for t in l.split()] for l in rows[1:1 + nv]])
    r = V0[:, :3].astype(int)
    a, b, c = HB[r[:, 0]], HB[r[:, 1]], HB[r[:, 2]]
    n_ = unit(np.cross(b - a, c - a)); e1 = unit(b - a); e2 = np.cross(n_, e1)
    P = V0[:, 3:4] * a + V0[:, 4:5] * b + V0[:, 5:6] * c + n_ * V0[:, 6:7] + e1 * V0[:, 7:8] + e2 * V0[:, 8:9]
    T = np.array([[float(t) for t in l.split()] for l in rows[1 + nv:1 + nv + nt]])
    return P, T[:, :3].astype(int), T[:, 3:].reshape(-1, 3, 2)


# what the mantle lies on: the body (its arms as far as they go) and the gowns, as points on their triangles
vs, faces, g = [], {}, None
for l in open(base):
    if l.startswith('v '):
        vs.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('g '):
        g = l.split()[1]
    elif l.startswith('f '):
        faces.setdefault(g, []).append([int(t.split('/')[0]) - 1 for t in l.split()[1:]])
V = np.array(vs)
tri = np.array([[f[0], f[k], f[k + 1]] for f in faces['body'] for k in range(1, len(f) - 1)])
clouds = [V[tri]]
for n in OVER:
    P, T, _ = laid(n)
    clouds.append(P[T])
W = np.array([[i, j, 3 - i - j] for i in range(4) for j in range(4 - i)]) / 3.0
pts = np.concatenate([np.einsum('kc,tcx->tkx', W, c).reshape(-1, 3) for c in clouds])
pts = pts[(pts[:, 1] > HEM - 0.2) & (pts[:, 1] < 6.4)]


def hull(q):
    # the convex hull of points in the plane, counter-clockwise (Andrew's chain)
    q = q[np.lexsort((q[:, 1], q[:, 0]))]
    def half(seq):
        h = []
        for p in seq:
            while len(h) > 1 and (h[-1][0] - h[-2][0]) * (p[1] - h[-2][1]) - (h[-1][1] - h[-2][1]) * (p[0] - h[-2][0]) <= 0:
                h.pop()
            h.append(p)
        return h
    lo, hi = half(q), half(q[::-1])
    return np.array(lo[:-1] + hi[:-1])


PH = np.arange(-180.0, 180.0, DPH)
DIR = np.stack([np.sin(np.radians(PH)), np.cos(np.radians(PH))], -1)
YS = np.arange(6.3, HEM - 0.1, -0.02)
R = np.zeros((len(YS), len(PH)))
for j, y in enumerate(YS):
    q = pts[np.abs(pts[:, 1] - y) < 0.03][:, [0, 2]]
    hp = hull(q) - AX
    a, b = hp, np.roll(hp, -1, 0)
    e = b - a
    # the ray AX + t d meets the edge a + u e
    den = DIR[:, None, 0] * e[None, :, 1] - DIR[:, None, 1] * e[None, :, 0]
    den = np.where(np.abs(den) < 1e-12, 1e-12, den)
    t = (a[None, :, 0] * e[None, :, 1] - a[None, :, 1] * e[None, :, 0]) / den
    u = (a[None, :, 0] * DIR[:, None, 1] - a[None, :, 1] * DIR[:, None, 0]) / den
    R[j] = np.where((u >= -1e-9) & (u <= 1 + 1e-9) & (t > 0), t, 0).max(1)
# (evened a little down the body and round it: a section's hull has corners where a point of the gown stands out)
for _ in range(2):
    R = (np.roll(R, 1, 1) + 2 * R + np.roll(R, -1, 1)) / 4
    R[1:-1] = (R[:-2] + 2 * R[1:-1] + R[2:]) / 4
R += GAP

# a column of the sheet for every direction: from where body and gown stand `RNECK` off the axis, down the cloth
idx, G, meta = {}, [], []
for k, ph in enumerate(PH):
    if abs(ph) < OPEN:
        continue
    # (round the back of the neck it begins nearer the axis, `RBACK`: the nape stands nearer to it than the throat
    # and the shoulders do, and the cloth began a hand below the gown's neck there)
    rn = RNECK + (RBACK - RNECK) * smooth((abs(ph) - 110) / 50)
    js = int(np.argmax(R[:, k] >= rn))
    r = np.maximum(rn, np.maximum.accumulate(R[js:, k]))
    y = YS[js:]
    run = np.concatenate([[0], np.cumsum(np.hypot(np.diff(r), np.diff(y)))])
    # (its last ring at the hem's height in every column: rings a set length apart end at any height, a hem of teeth)
    end = float(np.interp(HEM, y[::-1], run[::-1]))
    for j, s in enumerate(list(np.arange(0.0, end - DS / 2, DS)) + [end]):
        rr, yy = np.interp(s, run, r), np.interp(s, run, y)
        p = np.array([AX[0] + DIR[k, 0] * rr, yy, AX[1] + DIR[k, 1] * rr])
        if abs(p[0]) > XCUT:
            break
        idx[(j, k)] = len(G); G.append(p); meta.append([k, s, rr])
G, meta = np.array(G), np.array(meta)
quads = []
for (j, k), i in idx.items():
    k2 = (k + 1) % len(PH)
    a, b, c = idx.get((j, k2)), idx.get((j + 1, k)), idx.get((j + 1, k2))
    if a is not None and b is not None and c is not None:
        quads.append([i, b, c, a])
T = np.array([t for q in quads for t in ([q[0], q[1], q[2]], [q[0], q[2], q[3]])])
used = np.unique(T)
print('sheet', len(G), 'corners,', len(T), 'triangles; arc', round(float(meta[:, 1].max()), 2), 'x to', round(float(np.abs(G[:, 0]).max()), 2))

ph_of = np.radians(PH[meta[:, 0].astype(int)])
out_h = np.stack([np.sin(ph_of), np.zeros(len(G)), np.cos(ph_of)], -1)
# the folds: hollows down the cloth, none on the shoulders, at their depth `F_LEN` below `F_Y`; the cloth only goes
# outward for them (it lies on the gown)
rng = np.random.default_rng(145)
wave = np.zeros(len(G))
for n_, a_ in ((F_N, 1.0), (round(F_N * 1.6), 0.5), (round(F_N * 0.55), 0.6)):
    wave += a_ * np.cos(n_ * ph_of + rng.uniform(0, 6.28) + 0.35 * rng.normal() * (F_Y - G[:, 1]))
wave = 0.5 + 0.5 * wave / 2.1
G = G + out_h * (F_DEEP * smooth((F_Y - G[:, 1]) / F_LEN) * wave)[:, None]
# the facing: along both front edges and round the neck, standing over the cloth as fur does
# (by whole columns and rings of the sheet, so that the fur ends along a line of it and not in a saw's teeth: as many
# columns as make `FUR_EDGE` where the sheet stands `FUR_R` off the axis, on the chest)
edge = (np.abs(np.degrees(ph_of)) - OPEN) * np.pi / 180 * meta[:, 2]
col = np.round((np.abs(np.degrees(ph_of)) - OPEN) / DPH)
ring = np.round(meta[:, 1] / DS)
K, M = round(FUR_EDGE / (np.radians(DPH) * FUR_R)), round(FUR_NECK / DS)
fur = (col <= K) | (ring <= M)
vn = np.zeros_like(G)
for t in T:
    vn[t] += np.cross(G[t[1]] - G[t[0]], G[t[2]] - G[t[0]])
vn = unit(vn)
if (vn * out_h).sum() < 0:
    vn, T = -vn, T[:, [0, 2, 1]]
G = G + vn * (FUR_UP * np.maximum(smooth((K - col) / 2), smooth((M - ring) / 2)))[:, None]
# where a brooch sits: on either front edge, `CL_IN` in from it, at the height `CL_Y`
clasp = np.zeros(len(G), bool)
for sg in (1, -1):
    side = np.where((np.sign(G[:, 0]) == sg) & np.isin(np.arange(len(G)), used))[0]
    at = side[np.argmin(np.abs(edge[side] - CL_IN) + np.abs(G[side, 1] - CL_Y))]
    clasp[side[np.linalg.norm(G[side] - G[at], axis=1) < 0.13]] = True
    print('brooch', sg, 'at', G[at].round(2), int(clasp[side].sum()), 'corners')

obj = os.path.join(out, name + '_sheet.obj')
with open(obj, 'w') as f:
    for p in G:
        f.write('v %.5f %.5f %.5f\n' % tuple(p))
    for t in T:
        f.write('f %d %d %d\n' % tuple(t + 1))
env = dict(os.environ, HEM='all', R_HEM=os.environ.get('R_HEM', '0.03'), TAUBIN=os.environ.get('TAUBIN', '0'), HEMSMOOTH=os.environ.get('HEMSMOOTH', '12'), AO='9', XMAX=str(XCUT + 1), BUST='1', YCUT=str(HEM - 0.05))
subprocess.run([sys.executable, '-I', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tunic_bind.py'), base, obj, out, name], check=True, env=env)
os.remove(obj)
os.remove(os.path.join(out, name + '.png'))

# the bound file's triangles marked: each corner is what the sheet's nearest corner is
src = out
P, BT, UV = laid(name)
near = np.array([np.argmin(((G - p) ** 2).sum(1)) for p in P])
is_fur, is_clasp = fur[near], clasp[near]
rows = open(os.path.join(out, name + '.txt')).read().split('\n')
nv, nt = map(int, rows[0].split())
n_fur = n_clasp = 0
for i in range(nt):
    f = rows[1 + nv + i].split()
    t = [int(x) for x in f[:3]]
    add = 128 if is_clasp[t].sum() >= 2 else 64 if is_fur[t].all() else 0
    n_fur += add > 0; n_clasp += add == 128
    if add:
        for c in (3, 5, 7):
            f[c] = '%.6f' % (float(f[c]) + add)
        rows[1 + nv + i] = ' '.join(f)
open(os.path.join(out, name + '.txt'), 'w').write('\n'.join(rows))
with open(os.path.join(out, name + '_view.obj'), 'w') as f:
    for p in P:
        f.write('v %.5f %.5f %.5f\n' % tuple(p))
    for t in BT:
        f.write('f %d %d %d\n' % tuple(t + 1))
print(name, nv, 'corners,', nt, 'triangles,', n_fur, 'of fur,', n_clasp, 'under a brooch; y', P[:, 1].min().round(2), 'to', P[:, 1].max().round(2))
