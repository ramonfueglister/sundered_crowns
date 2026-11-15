# Age wrinkles for the real look, baked from line definitions on the base head.
#   * skin_<group>_<sex>_w<E>_n.webp: the pore normal map of that age group with
#     the wrinkles of "wrinkle age" E pressed in (crisp creases, normal map)
#   * wrinkle_fold.txt: per vertex of head.bin (Head.used order) one column per
#     line group, the broad shade of the fold (0..1), for continuous darkening
#   * wrinkle_lines.txt: per group onset, span, depth men, depth women, shade
# Where and in what order lines appear after Lemperle et al. (2001), Coleman &
# Grover (2006) and Luebberding et al. (2014: men deeper on forehead, glabella and
# crow's feet, women deeper around the lips); not verified online. Positions in
# base-mesh units (1 = 10 cm), x mirrored; widths, depths, onsets PLACEHOLDER.
# usage: python3 -I wrinkle_bake.py pos.npy base.obj realdir outdir
import sys
import numpy as np
from PIL import Image
posf, base, realdir, outdir = sys.argv[1:5]
pos = np.load(posf)
N = pos.shape[0]

# kind: 'c' crease, 'f' fold (crease with a bulge on side +1 or -1 of the line's
# left normal); pts: polyline (x, y); w: half width; zmin: front only
G = [
    # name, onset, span, depth m, depth f, shade, kind, side, w, zmin, lines
    ('stirn', 20, 45, 1.0, 0.7, 0.10, 'c', 0, 0.017, 0.6, [
        [(0, 7.74), (0.15, 7.745), (0.28, 7.76), (0.38, 7.79)],
        [(0, 7.84), (0.14, 7.845), (0.26, 7.86), (0.34, 7.89)],
        [(0, 7.94), (0.12, 7.945), (0.22, 7.965)]]),
    ('zorn', 30, 40, 1.0, 0.6, 0.10, 'c', 0, 0.013, 1.0, [
        [(0.05, 7.46), (0.06, 7.54), (0.072, 7.62)],
        [(0.0, 7.475), (0.05, 7.47)]]),
    ('kraehen', 25, 40, 1.0, 0.85, 0.06, 'c', 0, 0.011, 0.3, [
        [(0.49, 7.37), (0.56, 7.41), (0.62, 7.45)],
        [(0.50, 7.335), (0.57, 7.34), (0.64, 7.35)],
        [(0.49, 7.30), (0.55, 7.26), (0.61, 7.22)],
        [(0.48, 7.27), (0.53, 7.21), (0.57, 7.17)]]),
    ('lid', 34, 40, 0.8, 0.7, 0.10, 'c', 0, 0.012, 0.8, [
        [(0.17, 7.245), (0.25, 7.215), (0.34, 7.21), (0.42, 7.225), (0.47, 7.26)]]),
    ('traenen', 45, 35, 0.8, 0.7, 0.22, 'f', 1, 0.024, 0.8, [
        [(0.16, 7.20), (0.25, 7.135), (0.36, 7.125), (0.45, 7.15), (0.50, 7.20)]]),
    ('naso', 25, 45, 1.0, 0.9, 0.30, 'f', -1, 0.022, 0.8, [
        [(0.17, 6.97), (0.215, 6.86), (0.26, 6.74), (0.30, 6.64), (0.33, 6.56)]]),
    ('marionette', 48, 35, 0.9, 0.9, 0.25, 'f', -1, 0.02, 0.6, [
        [(0.31, 6.57), (0.315, 6.48), (0.30, 6.38), (0.28, 6.30)]]),
    ('lippen', 50, 30, 0.5, 0.9, 0.05, 'c', 0, 0.006, 1.0, [
        [(0.04, 6.705), (0.045, 6.765)], [(0.08, 6.70), (0.09, 6.77)],
        [(0.12, 6.69), (0.135, 6.755)], [(0.16, 6.675), (0.18, 6.73)]]),
    ('hals', 40, 40, 0.8, 0.8, 0.12, 'c', 0, 0.02, 0.2, [
        [(0, 6.02), (0.2, 6.03), (0.38, 6.07), (0.48, 6.12)],
        [(0, 5.90), (0.22, 5.91), (0.40, 5.95)]]),
    ('wange', 58, 30, 0.6, 0.6, 0.08, 'c', 0, 0.015, 0.6, [
        [(0.47, 7.02), (0.485, 6.86), (0.50, 6.70)]]),
]
BUCKETS = [30, 38, 46, 54, 62, 70, 78, 86]
GROUPS = {'middleage': [38, 46, 54, 62], 'old': [46, 54, 62, 70, 78, 86]}
MAXD = 0.009   # deepest crease, base units (0.9 mm) PLACEHOLDER

rng = np.random.default_rng(11)

def seg_dist(P, a, b):
    """distance of points P (n,2) to segment a-b, signed side, and t along"""
    a, b = np.array(a), np.array(b)
    d = b - a
    L2 = d @ d
    t = np.clip(((P - a) @ d) / L2, 0, 1)
    q = a + t[:, None] * d
    r = P - q
    side = np.sign(r @ np.array([-d[1], d[0]]))
    return np.hypot(r[:, 0], r[:, 1]), side, t

def group_height(P, Z, g, widen=1.0):
    """unit height field (<= 0 in the crease, bulge > 0) of group g at points P"""
    name, on, sp, dm, df, sh, kind, sideref, w, zmin, lines = g
    w = w * widen
    h = np.zeros(len(P))
    X = np.c_[np.abs(P[:, 0]), P[:, 1]]
    for li, pl in enumerate(lines):
        best = np.full(len(P), 1e9); bside = np.zeros(len(P)); along = np.zeros(len(P))
        acc = 0.0
        L = [np.hypot(pl[i + 1][0] - pl[i][0], pl[i + 1][1] - pl[i][1]) for i in range(len(pl) - 1)]
        for i in range(len(pl) - 1):
            d, s, t = seg_dist(X, pl[i], pl[i + 1])
            m = d < best
            best[m], bside[m], along[m] = d[m], s[m], (acc + t[m] * L[i]) / sum(L)
            acc += L[i]
        # depth along the line: fades at both ends, broken up a little
        ph = rng.random() * 6.28
        env = np.clip(np.minimum(along, 1 - along) / 0.18, 0, 1) ** 0.7 * (0.75 + 0.25 * np.sin(along * 9 + ph))
        v = -np.exp(-(best / w) ** 2) * env
        if kind == 'f':
            # the soft tissue above / beside the fold bulges over it
            sd = best * bside * sideref
            v += 0.45 * np.exp(-((sd - 1.8 * w) / (1.6 * w)) ** 2) * env * (sd > 0)
        h = np.minimum(h, v) if kind == 'c' else np.where(np.abs(v) > np.abs(h), v, h)
    h *= np.clip((Z - zmin) / 0.15, 0, 1)
    return h

ok = ~np.isnan(pos[..., 0])
P = pos[ok][:, :2]; Z = pos[ok][:, 2]
H = []
for g in G:
    hh = np.zeros((N, N), np.float32)
    hh[ok] = group_height(P, Z, g)
    H.append(hh)
    print(g[0], 'texels', int((hh < -0.05).sum()))

# physical size of a texel (base units) along x and y of the atlas
def spacing(axis):
    a = np.roll(pos, -1, axis) - np.roll(pos, 1, axis)
    s = np.linalg.norm(a, axis=-1) * 0.5
    s[~np.isfinite(s)] = np.nan
    return s
sx, sy = spacing(1), spacing(0)
med = np.nanmedian(np.r_[sx[ok], sy[ok]])
sx = np.where(np.isfinite(sx) & (sx < 4 * med), sx, med)
sy = np.where(np.isfinite(sy) & (sy < 4 * med), sy, med)
print('texel', round(float(med) * 100, 3), 'mm')

def depth(g, E, fem):
    name, on, sp, dm, df = g[:5]
    return (df if fem else dm) * np.clip((E - on) / sp, 0, 1) ** 0.7

def load_n(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32) / 127.5 - 1
    return a

lines_out = []
for g in G:
    lines_out.append(f'{g[1]} {g[2]} {g[3]} {g[4]} {g[5]}')
open(f'{outdir}/wrinkle_lines.txt', 'w').write('\n'.join(lines_out) + '\n')

for sex in ('male', 'female'):
    fem = sex == 'female'
    for grp, Es in GROUPS.items():
        pore = load_n(f'{realdir}/skin_{grp}_{sex}_n.webp')
        if pore.shape[0] != N:
            pore = np.asarray(Image.fromarray(((pore + 1) * 127.5).astype(np.uint8)).resize((N, N), Image.LANCZOS)).astype(np.float32) / 127.5 - 1
        for E in Es:
            h = sum(depth(g, E, fem) * H[k] for k, g in enumerate(G)) * MAXD
            gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 / sx
            gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 / sy
            wn = np.stack([-gx, gy, np.ones_like(h)], -1)
            wn /= np.linalg.norm(wn, axis=-1, keepdims=True)
            # whiteout blend of the pores and the wrinkles
            n = np.stack([pore[..., 0] + wn[..., 0], pore[..., 1] + wn[..., 1], pore[..., 2] * wn[..., 2]], -1)
            n /= np.linalg.norm(n, axis=-1, keepdims=True)
            ang = np.degrees(np.arccos(np.clip(wn[..., 2], -1, 1)))
            out = f'{outdir}/skin_{grp}_{sex}_w{E}_n.webp'
            Image.fromarray(((n * 0.5 + 0.5) * 255).round().astype(np.uint8)).save(out, quality=90, method=6)
            print(out, 'wrinkle tilt 99%', round(float(np.percentile(ang[ok], 99)), 1), 'max', round(float(ang[ok].max()), 1))

# per-vertex fold shade (Head.used order, as skin_red.py)
vs, faces, g_ = [], {}, None
for l in open(base):
    if l.startswith('v '):
        vs.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('g '):
        g_ = l.split()[1]
    elif l.startswith('f '):
        faces.setdefault(g_, []).append([int(t.split('/')[0]) - 1 for t in l.split()[1:]])
V = np.array(vs)
keep = lambda f: all(vs[i][1] > 3.4 and abs(vs[i][0]) < 2.85 for i in f)
parts = [[f for f in faces['body'] if keep(f)], [f for f in faces['helper-tights'] if keep(f)],
         faces['helper-hair'], faces['helper-l-eye'], faces['helper-r-eye']]
used = sorted({i for p_ in parts for f in p_ for i in f})
bodyv = set(i for f in faces['body'] for i in f)
PV = V[used]
cols = []
for g in G:
    h = group_height(PV[:, :2], PV[:, 2], g, widen=2.2)
    c = np.clip(-h, 0, 1)
    c[[u not in bodyv for u in used]] = 0
    cols.append(c)
np.savetxt(f'{outdir}/wrinkle_fold.txt', np.array(cols).T, fmt='%.2f')
print('vertices', len(used))
