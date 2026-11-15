# The draped tunic (OBJ from tunic_sim.py) as a game asset: the part above the
# portrait's cut, each vertex bound to the nearest body triangle of head.bin
# (barycentric weights plus offset, as the hair cards), uv wrapped round the
# body (1 texture tile = 2 base units, about 20 cm), and a woollen cloth
# texture with its normal map.
# usage: python3 -I tunic_bind.py base.obj tunic.obj outdir name
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
from hairlib import Head, unit

base, cloth, out, name = sys.argv[1:5]
# (a veil binds to the head too: HEAD=1 keeps the head's triangles)
H = Head(base, ymin=3.4, hc=(0.0, 5.0, 0.2), xmax=2.85, tkeep=None if os.environ.get('HEAD') == '1' else (lambda P: P[:, 1].max() < 6.6))
cv, cf = [], []
for l in open(cloth):
    if l.startswith('v '):
        cv.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('f '):
        cf.append([int(t) - 1 for t in l.split()[1:]])
CV = np.array(cv)
# Taubin smoothing: takes out the small ripples of the simulation, keeps the folds
nbs = {}
for f in cf:
    for k in range(len(f)):
        nbs.setdefault(f[k], set()).update((f[k - 1], f[(k + 1) % len(f)]))
idx = np.array(sorted(nbs)); nl = [np.array(sorted(nbs[i])) for i in idx]
for _ in range(int(os.environ.get('TAUBIN', '6'))):
    for lam in (0.5, -0.53):
        m = np.array([CV[n].mean(0) for n in nl])
        CV[idx] = CV[idx] + lam * (m - CV[idx])
tris = []
for f in cf:
    for k in range(1, len(f) - 1):
        t = [f[0], f[k], f[k + 1]]
        if CV[t, 1].min() > 3.45 and np.abs(CV[t, 0]).max() < float(os.environ.get('XMAX', '9')):
            tris.append(t)
used = sorted({i for t in tris for i in t}); rm = {o: k for k, o in enumerate(used)}
P = CV[used]
T = np.array([[rm[i] for i in t] for t in tris])
# keep the winding outward (normal away from the body's axis)
c = P[T].mean(1)
nrm = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
outw = np.stack([c[:, 0], np.zeros(len(c)), c[:, 2] - 0.2], -1)
flip = (nrm * outw).sum(1) < 0
print('triangles', len(T), 'flipped to outward', int(flip.sum()))
if flip.mean() > 0.5:  # the whole mesh one way (it is consistent)
    T = T[:, [0, 2, 1]]
# uv round the body
th = np.arctan2(P[:, 0], P[:, 2] - 0.2)
uv = np.stack([th * 1.2 / 2.0, P[:, 1] / 2.0], -1)
# a rolled hem along the neckline: a thin tube on the boundary edges near the neck
from collections import Counter, defaultdict
ec = Counter(tuple(sorted((t[k], t[(k + 1) % 3]))) for t in T for k in range(3))
if os.environ.get('HEM', 'neck') == 'all':
    # every edge in the portrait (not the cut at the bottom)
    bed = [e for e, n in ec.items() if n == 1 and P[list(e), 1].min() > 3.6]
else:
    bed = [e for e, n in ec.items() if n == 1 and P[list(e), 1].min() > 5.0 and np.abs(P[list(e), 0]).max() < 1.1]
adj = defaultdict(list)
for a_, b_ in bed:
    adj[a_].append(b_); adj[b_].append(a_)
vn = np.zeros_like(P)
for t in T:
    vn[t] += np.cross(P[t[1]] - P[t[0]], P[t[2]] - P[t[0]])
vn = unit(vn)
seen, chains = set(), []
for st in adj:
    if st in seen or len(adj[st]) == 2 and any(len(adj[q]) == 1 for q in adj):
        if st in seen or len(adj[st]) != 1:
            continue
    if st in seen:
        continue
    ch = [st]; seen.add(st)
    while True:
        nx = [q for q in adj[ch[-1]] if q not in seen]
        if not nx:
            break
        ch.append(nx[0]); seen.add(nx[0])
    if len(ch) > 3:
        chains.append(ch)
# the cut edge runs along the helper mesh's triangles and zigzags: smooth it
# along the chain (the cloth's own edge moves with it)
for ch in chains:
    closed = ch[0] in adj[ch[-1]] and len(ch) > 3
    for _ in range(int(os.environ.get('HEMSMOOTH', '12'))):
        q = P[ch].copy()
        m_ = 0.5 * (np.roll(q, 1, 0) + np.roll(q, -1, 0))
        if not closed:
            m_[0], m_[-1] = q[0], q[-1]
        P[ch] = q + 0.6 * (m_ - q)
uv = np.stack([np.arctan2(P[:, 0], P[:, 2] - 0.2) * 1.2 / 2.0, P[:, 1] / 2.0], -1)
R_HEM, NS = float(os.environ.get('R_HEM', '0.028')), 6
newP, newT, newUV = [P], [T], [uv]
base_i = len(P)
for ch in chains:
    closed = ch[0] in adj[ch[-1]] and len(ch) > 3
    pts = P[ch]
    tg = unit(np.roll(pts, -1, 0) - np.roll(pts, 1, 0)) if closed else unit(np.gradient(pts, axis=0))
    nn = vn[ch]
    bb = unit(np.cross(tg, nn))
    ring = []
    run = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    for i in range(len(ch)):
        cen = pts[i] + nn[i] * R_HEM * 0.6
        for k in range(NS):
            a = 2 * np.pi * k / NS
            ring.append(cen + R_HEM * (np.cos(a) * nn[i] + np.sin(a) * bb[i]))
    ring = np.array(ring)
    m = len(ch)
    tri = []
    for i in range(m if closed else m - 1):
        j = (i + 1) % m
        for k in range(NS):
            k2 = (k + 1) % NS
            a0, a1, b0, b1 = base_i + i * NS + k, base_i + i * NS + k2, base_i + j * NS + k, base_i + j * NS + k2
            tri += [[a0, b0, a1], [a1, b0, b1]]
    # wound so that the tube's normals point away from its axis (as the cloth's point away from the body): wound
    # the other way, as until round 61, the builder's normals point into the tube, the stage's shadow lookup,
    # which starts a little off the surface along the normal, starts inside it, and the hem is in its own
    # shadow all round: a black cord
    tri = np.array(tri)
    q = ring[tri - base_i]
    away = q.mean(1) - np.repeat(pts + nn * R_HEM * 0.6, NS, axis=0)[(tri[:, 0] - base_i)]
    if (np.cross(q[:, 1] - q[:, 0], q[:, 2] - q[:, 0]) * away).sum(1).mean() < 0:
        tri = tri[:, [0, 2, 1]]
    newP.append(ring); newT.append(tri)
    newUV.append(np.stack([np.repeat(run, NS) / 2.0, np.tile(np.arange(NS) / NS * 0.05, m)], -1))
    base_i += len(ring)
print('hem chains', [len(c) for c in chains])
P = np.concatenate(newP); T = np.concatenate(newT); uv = np.concatenate(newUV)
# shade in the folds: how far a vertex lies below the cloth smoothed over a few
# centimetres (a fold's valley darker, its ridge a little lighter)
nbr = [set() for _ in range(len(P))]
for t in T:
    for k in range(3):
        nbr[t[k]].update((t[(k + 1) % 3], t[(k + 2) % 3]))
nbl = [np.array(sorted(n_)) if n_ else np.array([i]) for i, n_ in enumerate(nbr)]
vn2 = np.zeros_like(P)
for t in T:
    vn2[t] += np.cross(P[t[1]] - P[t[0]], P[t[2]] - P[t[0]])
vn2 = unit(vn2)
Ps = P.copy()
for _ in range(int(os.environ.get('AOIT', '30'))):
    Ps = 0.5 * Ps + 0.5 * np.array([Ps[n_].mean(0) for n_ in nbl])
dh = ((P - Ps) * vn2).sum(1)
for _ in range(2):
    dh = 0.5 * dh + 0.5 * np.array([dh[n_].mean() for n_ in nbl])
print('fold depth sd', dh.std().round(4), 'min', dh.min().round(3), 'max', dh.max().round(3))
ao = np.clip(1 + float(os.environ.get('AO', '4.0')) * dh, 0.5, 1.1)
# the hem is the cloth's own edge rolled in, not a fold: it has no shade of its own (measured against the
# smoothed cloth it is a valley all along, which drew a black cord round every edge)
ao[len(newP[0]):] = float(os.environ.get('HEM_AO', '1.0'))
np.savetxt(os.path.join(out, name + '_ao.txt'), ao, fmt='%.3f')
print('ao range', ao.min().round(2), ao.max().round(2), 'mean', ao.mean().round(3))
# binding (as write_cards)
A, B, C, HT = H.A, H.B, H.C, H.T
cen = (A + B + C) / 3
bind = []
for p in P:
    best = None
    for ti in ((cen - p) ** 2).sum(1).argsort()[:12]:
        a, b_, c_ = A[ti], B[ti], C[ti]
        n = unit(np.cross(b_ - a, c_ - a))
        q = p - n * ((p - a) @ n)
        v0, v1, v2 = b_ - a, c_ - a, q - a
        d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1
        den = d00 * d11 - d01 * d01
        wv = (d11 * d20 - d01 * d21) / den; ww = (d00 * d21 - d01 * d20) / den
        bc = np.clip([1 - wv - ww, wv, ww], 0, 1); bc /= bc.sum()
        on = bc[0] * a + bc[1] * b_ + bc[2] * c_
        dist = np.linalg.norm(p - on)
        if best is None or dist < best[0]:
            best = (dist, ti, bc, p - on)
    _, ti, bc, off = best
    # the offset in the triangle's own frame (normal, first edge, across), so that it
    # follows the morphed body (mh_cloth in build.rs reads it so)
    a, b_, c_ = A[ti], B[ti], C[ti]
    n = unit(np.cross(b_ - a, c_ - a)); e1 = unit(b_ - a); e2 = np.cross(n, e1)
    bind.append(([H.remap[x] for x in HT[ti]], bc, np.array([off @ n, off @ e1, off @ e2])))
with open(os.path.join(out, name + '.txt'), 'w') as f:
    f.write(f'{len(P)} {len(T)}\n')
    for r, w_, o in bind:
        f.write(' '.join(map(str, r)) + ' ' + ' '.join(f'{x:.6f}' for x in list(w_) + list(o)) + '\n')
    for t in T:
        f.write(' '.join(map(str, t)) + ' ' + ' '.join(f'{uv[i][0]:.6f} {1 - uv[i][1]:.6f}' for i in t) + '\n')
# woollen cloth: soft mottling and faint uneven yarn, tileable, grey around 0.85
# (a visible weave would only shimmer at portrait size)
rng = np.random.default_rng(5)
N = 512
def tile_noise(scale, amp):
    k = rng.normal(0, 1, (N // scale, N // scale))
    k = np.tile(k, (3, 3))
    im = Image.fromarray(((k - k.min()) / (np.ptp(k) + 1e-9) * 255).astype(np.uint8)).resize((3 * N, 3 * N), Image.BICUBIC)
    a = np.asarray(im).astype(np.float32)[N:2 * N, N:2 * N] / 255 - 0.5
    return a * amp
rowv = np.repeat(rng.normal(0, 1, N // 8), 8)[:, None]
img = np.clip(0.85 * (1 + tile_noise(64, 0.10) + tile_noise(16, 0.05) + tile_noise(4, 0.04)), 0, 1)
Image.fromarray((np.dstack([img] * 3 + [np.ones_like(img)]) * 255).astype(np.uint8), 'RGBA').save(os.path.join(out, name + '.png'))
print('verts', len(P), 'tris', len(T))
