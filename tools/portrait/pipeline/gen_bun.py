# A Roman women's hairstyle: centre parting, hair combed down over the
# temples and the tops of the ears and drawn back into a coiled knot low at
# the back of the head (a common style of the early empire)
# grown from a flow field over the MakeHuman base head, clumped into wisps,
# turned into hair cards and bound to the head like a .mhclo (three body
# vertices + offset per card vertex, numbered as in head.bin).
# usage: python3 -I gen_hair.py base.obj outdir name
import sys, os, json
import numpy as np
base, out, name = sys.argv[1:4]
rng = np.random.default_rng(7)
vs, faces, g = [], {}, None
for l in open(base):
    if l.startswith('v '):
        vs.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('g '):
        g = l.split()[1]
    elif l.startswith('f '):
        faces.setdefault(g, []).append([int(t.split('/')[0]) - 1 for t in l.split()[1:]])
V = np.array(vs)
keep = lambda f: all(vs[i][1] > 3.4 and abs(vs[i][0]) < 2.85 for i in f)
parts = [[f for f in faces['body'] if keep(f)], [f for f in faces['helper-tights'] if keep(f)], faces['helper-hair'], faces['helper-l-eye'], faces['helper-r-eye']]
used = sorted({i for p in parts for f in p for i in f})
remap = {o: n for n, o in enumerate(used)}
tris = []
for f in parts[0]:
    if min(V[i][1] for i in f) > 6.4:
        for k in range(1, len(f) - 1):
            tris.append([f[0], f[k], f[k + 1]])
T = np.array(tris)
A, B, C = V[T[:, 0]], V[T[:, 1]], V[T[:, 2]]
hp = V[np.unique(T)]
band = hp[(hp[:, 1] > 7.6) & (hp[:, 1] < 7.9)]
hc = np.array([0.0, 7.75, 0.5 * (band[:, 2].min() + band[:, 2].max())])

def dirs(th, el):
    th, el = np.radians(th), np.radians(el)
    return np.stack([np.cos(el) * np.sin(th), np.sin(el), np.cos(el) * np.cos(th)], -1)

def ang(d):
    return np.degrees(np.arctan2(d[..., 0], d[..., 2])), np.degrees(np.arcsin(np.clip(d[..., 1], -1, 1)))

# skin radius by direction: the farthest hit from the head's centre
TH = np.arange(-180, 181, 2.0); EL = np.arange(-70, 91, 2.0)
D = dirs(*np.meshgrid(TH, EL, indexing='ij')).reshape(-1, 3)
e1, e2 = B - A, C - A
R = np.zeros(len(D))
for s in range(0, len(D), 400):
    d = D[s:s + 400][:, None, :]
    p = np.cross(d, e2[None]); det = (e1[None] * p).sum(-1)
    inv = 1 / np.where(np.abs(det) < 1e-9, np.nan, det)
    tv = hc[None, None] - A[None]
    u = (tv * p).sum(-1) * inv
    q = np.cross(tv, e1[None]); v = (d * q).sum(-1) * inv
    t = (e2[None] * q).sum(-1) * inv
    ok = (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0)
    t = np.where(ok, t, 0); R[s:s + 400] = t.max(1)
R = R.reshape(len(TH), len(EL))
# fill misses from neighbours
for _ in range(4):
    m = R == 0
    if not m.any(): break
    Rp = np.pad(R, 1, mode='edge'); nb = np.stack([Rp[:-2, 1:-1], Rp[2:, 1:-1], Rp[1:-1, :-2], Rp[1:-1, 2:]])
    cnt = (nb > 0).sum(0); R = np.where(m & (cnt > 0), nb.sum(0) / np.maximum(cnt, 1), R)

def skin(d):
    th, el = ang(d)
    i = np.clip((th + 180) / 2, 0, len(TH) - 1.001); j = np.clip((el + 70) / 2, 0, len(EL) - 1.001)
    i0, j0 = i.astype(int), j.astype(int); fi, fj = i - i0, j - j0
    return (R[i0, j0] * (1 - fi) * (1 - fj) + R[i0 + 1, j0] * fi * (1 - fj) + R[i0, j0 + 1] * (1 - fi) * fj + R[i0 + 1, j0 + 1] * fi * fj)

# the hairline (degrees up from the head's centre, by degrees from the front)
LINE = np.array([(0, 19), (20, 18), (32, 12), (44, 3), (58, -6), (66, -14), (71, -24), (75, -20), (78, -12), (84, -12), (102, -12), (112, -16), (126, -28), (145, -40), (165, -46), (180, -48)])
def hl(th):
    return np.interp(np.abs(th), LINE[:, 0], LINE[:, 1])
_wb = np.random.default_rng(11).uniform(0, 6.3, 3)
def hln(th):
    # the hairline with a small irregular wobble (degrees)
    t = np.radians(th)
    return hl(th) + 0.9 * np.sin(7 * t + _wb[0]) + 0.6 * np.sin(13 * t + _wb[1]) + 0.4 * np.sin(23 * t + _wb[2])

BK = dirs(180, 8)  # where the knot sits (high enough to show behind the crown)
W = BK
EX = np.array([1.0, 0, 0])
def flow(d, th, el):
    # towards the knot along the scalp ...
    g = BK - (d * BK).sum(-1, keepdims=True) * d
    g /= np.linalg.norm(g, axis=-1, keepdims=True) + 1e-9
    # ... and at the front first away from the centre parting, down over the temples
    sx = np.sign(d[..., 0:1] + 1e-6) * EX
    sd = sx - (d * sx).sum(-1, keepdims=True) * d
    sd /= np.linalg.norm(sd, axis=-1, keepdims=True) + 1e-9
    ks = 1.6 * np.clip(np.cos(np.radians(th)), 0, 1) ** 0.7 * np.clip(el / 45, 0, 1)
    # over the temples and ears the hair first falls, then turns back
    up = np.array([0, 1.0, 0]); dn = -(up - (d * up).sum(-1, keepdims=True) * d)
    dn /= np.linalg.norm(dn, axis=-1, keepdims=True) + 1e-9
    kd = 0.9 * np.exp(-((np.abs(th) - 70) / 30) ** 2) * np.clip((el + 5) / 25, 0, 1)
    t = g + ks[..., None] * sd + kd[..., None] * dn
    return t / (np.linalg.norm(t, axis=-1, keepdims=True) + 1e-9)

# roots: evenly inside the hairline (golden angle), a few thousand
N = 9000
k = np.arange(N * 3); y = 1 - 2 * (k + 0.5) / (N * 3); r = np.sqrt(1 - y * y); a = k * 2.399963
P = np.stack([r * np.cos(a), y, r * np.sin(a)], -1)
P += rng.normal(0, 0.006, P.shape); P /= np.linalg.norm(P, axis=-1, keepdims=True)
th, el = ang(P)
P = P[el > hl(th) + 0.5]
P = P[rng.permutation(len(P))[:N]]
th, el = ang(P)
print('roots', len(P))
RB = 0.27                      # the knot's radius
steps = 12
ds = 0.05
lift0 = 0.012 + 0.022 * np.clip((el + 50) / 140, 0, 1)   # hair from higher up lies on top
paths = np.zeros((len(P), 61, 3)); n_ok = np.zeros(len(P), int)
d = P.copy()
pos = hc + d * (skin(d) + 0.004)[:, None]
paths[:, 0] = pos
live = np.ones(len(P), bool)
for s_ in range(1, 61):
    th_, el_ = ang(d)
    t = flow(d, th_, el_)
    pos = pos + t * ds
    d = pos - hc; d /= np.linalg.norm(d, axis=-1, keepdims=True)
    th_, el_ = ang(d)
    ear = 0.065 * np.exp(-((np.abs(th_) - 90) / 35) ** 2) * np.exp(-((el_ + 2) / 22) ** 2) + 0.015 * np.clip(s_ / 6, 0, 1)
    ab = np.arccos(np.clip((d * BK).sum(-1), -1, 1))
    rise = np.clip(1 - (ab - 0.2) / 0.25, 0, 1) * RB * 0.6
    pos = hc + d * (skin(d) + np.minimum(1, s_ / 3) * lift0 + ear + rise + 0.004)[:, None]
    paths[:, s_] = np.where(live[:, None], pos, paths[:, s_ - 1])
    n_ok += live
    live &= ab > 0.2
print('strands reaching the knot', (~live).mean().round(3), 'mean steps', n_ok.mean().round(1))
# resample each strand to steps+1 points by arc length
S = np.zeros((len(P), steps + 1, 3))
for i in range(len(P)):
    q = paths[i, :n_ok[i] + 1]
    sl = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(q, axis=0), axis=1))])
    tt = np.linspace(0, sl[-1], steps + 1)
    S[i] = np.stack([np.interp(tt, sl, q[:, a]) for a in range(3)], -1)
# gentle waves across the strands on the sides (as on portraits of the period)
tg = np.gradient(S, axis=1); tg /= np.linalg.norm(tg, axis=-1, keepdims=True) + 1e-9
nr_ = S - hc; rad_ = np.linalg.norm(nr_, axis=-1); nr_ /= rad_[..., None]
bn = np.cross(tg, nr_); bn /= np.linalg.norm(bn, axis=-1, keepdims=True) + 1e-9
sl = np.concatenate([np.zeros((len(S), 1)), np.cumsum(np.linalg.norm(np.diff(S, axis=1), axis=-1), 1)], 1)
sidew = np.clip((np.abs(th) - 20) / 30, 0, 1)[:, None] * np.clip(1 - (np.abs(th) - 130) / 30, 0, 1)[:, None]
amp = 0.024 * sidew * np.clip(sl / 0.12, 0, 1) * np.clip((sl[:, -1:] - sl) / 0.2, 0, 1)
hgt = rad_ - skin(nr_.reshape(-1, 3)).reshape(rad_.shape)
S = S + bn * (amp * np.sin(2 * np.pi * sl / 0.3))[..., None]
dd_ = S - hc; dd_ /= np.linalg.norm(dd_, axis=-1, keepdims=True)
S = hc + dd_ * (skin(dd_.reshape(-1, 3)).reshape(rad_.shape) + hgt)[..., None]
# wisps: k-means on root and tip, then each strand pulled to its wisp's centre towards the tip
K = 240
feat = np.concatenate([S[:, 0], S[:, -1] * 0.6], 1)
cent = feat[rng.choice(len(feat), K, replace=False)]
for _ in range(12):
    lab = ((feat[:, None] - cent[None]) ** 2).sum(-1).argmin(1)
    for j in range(K):
        m = lab == j
        if m.any(): cent[j] = feat[m].mean(0)
cards, uvs, tile_of = [], [], []
for j in range(K):
    m = lab == j
    if m.sum() < 6: continue
    Sj = S[m]
    c = Sj.mean(0)
    # clump: towards the centre line, more at the tip
    cl = np.linspace(0.1, 0.8, steps + 1)[None, :, None]
    Sj = Sj + (c[None] - Sj) * cl
    n0 = c - hc; n0 /= np.linalg.norm(n0, axis=-1, keepdims=True)
    tang = np.gradient(c, axis=0); tang /= np.linalg.norm(tang, axis=-1, keepdims=True) + 1e-9
    b = np.cross(tang, n0); b /= np.linalg.norm(b, axis=-1, keepdims=True) + 1e-9
    lat = ((Sj - c[None]) * b[None]).sum(-1)
    fr = 0.0
    w = np.clip(4.0 * np.sqrt((lat ** 2).mean(0)), 0.12, 0.32) * np.linspace(1.0, 0.55, steps + 1)
    # height of the centre line over the skin, then every column at that height
    hcen = np.linalg.norm(c - hc, axis=-1) - skin(n0)
    hcen = np.maximum(hcen, 0.012)
    def put(q, extra):
        dd = q - hc; dd /= np.linalg.norm(dd, axis=-1, keepdims=True)
        return hc + dd * (skin(dd) + hcen + extra)[:, None]
    left, right = put(c - b * w[:, None] / 2, -0.002), put(c + b * w[:, None] / 2, -0.002)
    # a slight arch: the middle of the card stands a little above its edges
    mid = put(c, 0.005)
    cards.append((left, mid, right))
    tile_of.append(int(rng.integers(4, 8)) if fr > 0.5 else int(rng.integers(0, 4)))
nhair = len(cards)
BC = hc + BK * (skin(BK[None])[0] + RB * 0.75)
ax = BK; uu = np.cross(ax, [0, 1.0, 0]); uu /= np.linalg.norm(uu); vv = np.cross(ax, uu)
turns = 2.3; RR = 0.065
phi_all = np.linspace(0, 2 * np.pi * turns, 400)
def spiral(phi):
    rho = 0.03 + (RB * 0.92 - 0.03) * phi / (2 * np.pi * turns)
    z = np.sqrt(np.clip(RB ** 2 - rho ** 2, 0, None)) * 0.75
    return rho, z
for k_ in range(7):
    psi0 = 2 * np.pi * k_ / 7
    phi = 0.0
    while phi < 2 * np.pi * turns - 0.3:
        seg = rng.uniform(1.0, 1.6)
        ph = np.linspace(phi, min(phi + seg, 2 * np.pi * turns), steps + 1)
        rho, z = spiral(ph)
        ring = np.cos(ph)[:, None] * uu + np.sin(ph)[:, None] * vv
        cen = BC + rho[:, None] * ring + z[:, None] * ax
        # across the rope: outward (ring) and backward (axis), twisted along it
        tw = psi0 + 1.8 * ph
        nr = np.cos(tw)[:, None] * ring + np.sin(tw)[:, None] * ax
        c = cen + RR * nr
        tang = np.gradient(c, axis=0); tang /= np.linalg.norm(tang, axis=-1, keepdims=True) + 1e-9
        b = np.cross(tang, nr); b /= np.linalg.norm(b, axis=-1, keepdims=True) + 1e-9
        w = 0.085 * np.ones(steps + 1)
        cards.append((c - b * w[:, None] / 2, c + nr * 0.006, c + b * w[:, None] / 2))
        tile_of.append(int(rng.integers(0, 4)))
        phi += seg * rng.uniform(0.7, 0.95)
print('cards', nhair, '+ knot', len(cards) - nhair)
# vertices: per card 3 x (steps+1); triangles between columns
verts, tri_list, tri_uv = [], [], []
for ci, (lft, mid, rgt) in enumerate(cards):
    o = len(verts)
    for s in range(steps + 1):
        verts += [lft[s], mid[s], rgt[s]]
    u0 = tile_of[ci] / 8.0
    us = [u0 + 0.004, u0 + 0.0625, u0 + 0.125 - 0.004]
    for s in range(steps):
        vA, vB = s / steps, (s + 1) / steps
        for (i, jj) in [(0, 1), (1, 2)]:
            a0, a1 = o + 3 * s + i, o + 3 * s + jj
            b0, b1 = o + 3 * (s + 1) + i, o + 3 * (s + 1) + jj
            # counter-clockwise seen from outside (left lies at +b x ... so a0, a1, b0)
            tri_list.append([a0, a1, b0]); tri_uv.append([(us[i], vA), (us[jj], vA), (us[i], vB)])
            tri_list.append([a1, b1, b0]); tri_uv.append([(us[jj], vA), (us[jj], vB), (us[i], vB)])
verts = np.array(verts)
# bind each vertex to the nearest head triangle: its three corners, weights, offset
cen = (A + B + C) / 3
bind = []
for p in verts:
    i = ((cen - p) ** 2).sum(1).argsort()[:12]
    best = None
    for ti in i:
        a, b_, c_ = A[ti], B[ti], C[ti]
        nrm = np.cross(b_ - a, c_ - a); nrm /= np.linalg.norm(nrm)
        q = p - nrm * ((p - a) @ nrm)
        v0, v1, v2 = b_ - a, c_ - a, q - a
        d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1
        den = d00 * d11 - d01 * d01
        wv = (d11 * d20 - d01 * d21) / den; ww = (d00 * d21 - d01 * d20) / den; wu = 1 - wv - ww
        bc = np.clip([wu, wv, ww], 0, 1); bc /= bc.sum()
        on = bc[0] * a + bc[1] * b_ + bc[2] * c_
        dist = np.linalg.norm(p - on)
        if best is None or dist < best[0]:
            best = (dist, ti, bc, p - on)
    _, ti, bc, off = best
    bind.append(([remap[x] for x in T[ti]], bc, off))
with open(os.path.join(out, name + '.txt'), 'w') as f:
    f.write(f'{len(verts)} {len(tri_list)}\n')
    for r, w_, o in bind:
        f.write(' '.join(map(str, r)) + ' ' + ' '.join(f'{x:.6f}' for x in list(w_) + list(o)) + '\n')
    for t, uv in zip(tri_list, tri_uv):
        # v as in OBJ files (up from the bottom): the reader flips it
        f.write(' '.join(map(str, t)) + ' ' + ' '.join(f'{u:.6f} {1 - v:.6f}' for u, v in uv) + '\n')
# the scalp under the hair: a mask per head.bin vertex
mask = np.zeros(len(used))
for o, n in remap.items():
    d = V[o] - hc; rr = np.linalg.norm(d)
    if rr < 1e-6 or V[o][1] < 6.6: continue
    t_, e_ = ang(d / rr)
    mask[n] = np.clip((e_ - hl(t_) + 1.5) / 4, 0, 1)

# the cap: the scalp triangles lifted a little, with a painted layer of fine
# hairs from the same flow (stereographic texture around the head's centre),
# so that the cards never show bare skin between them
cdir = V - hc; cdir /= np.linalg.norm(cdir, axis=-1, keepdims=True)
cth, cel = ang(cdir)
inside = cel - hl(cth)
tsel = [t for t in T if inside[t].max() > -7 and V[t][:, 1].min() > 6.6]
vn = np.zeros_like(V)
for t in T:
    n_ = np.cross(V[t[1]] - V[t[0]], V[t[2]] - V[t[0]]); vn[t] += n_
vn /= np.linalg.norm(vn, axis=-1, keepdims=True) + 1e-9
cv = sorted({i for t in tsel for i in t}); cmap = {o: k for k, o in enumerate(cv)}
def stereo(d):
    return np.stack([d[..., 0] / (1 + d[..., 1]), d[..., 2] / (1 + d[..., 1])], -1)
st = stereo(cdir[cv]); QC = 0.5 * (st.min(0) + st.max(0)); RS = 0.5 * (st.max(0) - st.min(0)).max() * 1.03
def uvof(d):
    q = stereo(d); return 0.5 + (q - QC) / (2 * RS)
cuv = uvof(cdir)
TEX = 2048
# fine hairs: many short strands
Nc = 60000
k = np.arange(Nc * 3); y = 1 - 2 * (k + 0.5) / (Nc * 3); r = np.sqrt(1 - y * y); a = k * 2.399963
Q = np.stack([r * np.cos(a), y, r * np.sin(a)], -1)
Q += rng.normal(0, 0.004, Q.shape); Q /= np.linalg.norm(Q, axis=-1, keepdims=True)
qt, qe = ang(Q); Q = Q[qe > hln(qt) - 2.0]; Q = Q[rng.permutation(len(Q))[:Nc]]
qt, qe = ang(Q)
Lc = 0.4 * (0.7 + 0.5 * rng.random(len(Q)))
# brightness by wisp (the nearest card strand's wisp), so locks show in the cap too
roots = S[:, 0] - hc; roots /= np.linalg.norm(roots, axis=-1, keepdims=True)
wb = rng.uniform(0.62, 1.0, K)
near = np.empty(len(Q), int)
for s0 in range(0, len(Q), 4000):
    near[s0:s0 + 4000] = (Q[s0:s0 + 4000] @ roots.T).argmax(1)
shade_q = wb[lab[near]] * rng.uniform(0.85, 1.1, len(Q))
qt, qe = ang(Q)
wq = np.clip((qe - hln(qt) + 2.0) / 4.0, 0.2, 1.0)   # fine, sparse hairs at the line
cs = 10
QP = np.zeros((len(Q), cs + 1, 3)); dq = Q.copy(); QP[:, 0] = dq
for s1 in range(1, cs + 1):
    t_ = flow(dq, *ang(dq))
    # step along the sphere (directions): arc length / radius
    dq = dq + t_ * (Lc / cs / skin(dq))[:, None]; dq /= np.linalg.norm(dq, axis=-1, keepdims=True)
    QP[:, s1] = dq
px = uvof(QP) * TEX  # (n, cs+1, 2)
Aacc = np.zeros((TEX, TEX)); Cacc = np.zeros((TEX, TEX))
for s1 in range(cs):
    p0, p1 = px[:, s1], px[:, s1 + 1]
    ln = np.linalg.norm(p1 - p0, axis=-1)
    ns = np.maximum(1, np.ceil(ln / 0.5).astype(int))
    idx = np.repeat(np.arange(len(Q)), ns)
    off = np.arange(ns.sum()) - np.repeat(np.cumsum(ns) - ns, ns)
    f = (off + 0.5) / ns[idx]
    pts = p0[idx] + (p1 - p0)[idx] * f[:, None]
    fl = (s1 + f) / cs                       # along the strand, 0 root .. 1 tip
    wgt = 0.5 * wq[idx] * np.minimum(1, fl * 6) * (1 - fl ** 3)   # soft root, thin tip
    shd = shade_q[idx] * (0.7 + 0.45 * np.sin(np.pi * np.minimum(fl * 1.4, 1)))
    x0 = np.floor(pts[:, 0] - 0.5).astype(int); y0 = np.floor(pts[:, 1] - 0.5).astype(int)
    fx = pts[:, 0] - 0.5 - x0; fy = pts[:, 1] - 0.5 - y0
    for dx, dy, ww in [(0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)]:
        xi = np.clip(x0 + dx, 0, TEX - 1); yi = np.clip(y0 + dy, 0, TEX - 1)
        np.add.at(Aacc, (yi, xi), wgt * ww)
        np.add.at(Cacc, (yi, xi), wgt * ww * shd)
a_s = 1 - np.exp(-1.4 * Aacc)
c_s = Cacc / np.maximum(Aacc, 1e-6)
# a dark mass under the hairs inside the hairline
gy, gx = np.mgrid[0:TEX, 0:TEX]
qu = ((gx + 0.5) / TEX - 0.5) * 2 * RS + QC[0]; qv = ((gy + 0.5) / TEX - 0.5) * 2 * RS + QC[1]
rr2 = qu * qu + qv * qv
dy_ = (1 - rr2) / (1 + rr2); dxz = 2 / (1 + rr2)
gd = np.stack([qu * dxz, dy_, qv * dxz], -1)
gt, ge = ang(gd)
a_b = 0.8 * np.clip((ge - hln(gt) - 1.0) / 7, 0, 1) ** 1.5
c_b = 0.42
a = 1 - (1 - a_s) * (1 - a_b)
c = (c_s * a_s + c_b * a_b * (1 - a_s)) / np.maximum(a, 1e-6)
c = c / max(1e-6, (c * a).sum() / max(a.sum(), 1e-6)) * 0.6
from PIL import Image
img = np.dstack([np.clip(c, 0, 1)] * 3 + [np.clip(a, 0, 1)])
Image.fromarray((img * 255).astype(np.uint8), 'RGBA').save(os.path.join(out, name + '_cap.png'))
with open(os.path.join(out, name + '_cap.txt'), 'w') as f:
    f.write(f'{len(cv)} {len(tsel)}\n')
    for o in cv:
        nn = vn[o] * 0.008
        f.write(f'{remap[o]} {remap[o]} {remap[o]} 1 0 0 {nn[0]:.6f} {nn[1]:.6f} {nn[2]:.6f}\n')
    for t in tsel:
        # uv with v up from the bottom (the reader flips it); image rows go down
        f.write(' '.join(str(cmap[i]) for i in t) + ' ' + ' '.join(f'{cuv[i][0]:.6f} {1 - cuv[i][1]:.6f}' for i in t) + '\n')
with open(os.path.join(out, name + '_capview.obj'), 'w') as f:
    for o in cv: f.write('v %.5f %.5f %.5f\n' % tuple(V[o] + vn[o] * 0.008))
    for o in cv: f.write('vt %.5f %.5f\n' % (cuv[o][0], 1 - cuv[o][1]))
    for t in tsel: f.write('f ' + ' '.join(f'{cmap[i]+1}/{cmap[i]+1}' for i in t) + '\n')
print('cap', len(cv), 'verts', len(tsel), 'tris; coverage', round(float((a > 0.5).mean()), 3))
np.savetxt(os.path.join(out, name + '_scalp.txt'), mask, fmt='%.3f')
np.save(os.path.join(out, name + '_strands.npy'), S.astype(np.float32))

# debug: the cards in base space as OBJ (with uv), and the head
with open(os.path.join(out, name + '_cards.obj'), 'w') as f:
    for p in verts: f.write('v %.5f %.5f %.5f\n' % tuple(p))
    k = 1
    for t, uv in zip(tri_list, tri_uv):
        for u, v in uv: f.write('vt %.5f %.5f\n' % (u, 1 - v))
        f.write('f %d/%d %d/%d %d/%d\n' % (t[0]+1, k, t[1]+1, k+1, t[2]+1, k+2)); k += 3
with open(os.path.join(out, name + '_head.obj'), 'w') as f:
    for p in V: f.write('v %.5f %.5f %.5f\n' % tuple(p))
    for t in T: f.write('f %d %d %d\n' % tuple(t + 1))
print('verts', len(verts), 'tris', len(tri_list), 'hc', hc.round(3))
