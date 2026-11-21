# A hood's cape with a dagged hem (round 136): the cloth of a bound garment (`tunic_bind.py`'s file) cut into
# tongues along its lowest edge. Nothing is draped anew: the garment's own sheet is made finer near that edge and
# cut where a tongue ends; what is left of it lies where it lay. The rolled hem of that edge is left out (a dag is
# cut into fulled wool and not hemmed); the garment's other edges keep theirs.
#
# usage: python3 -I dag.py base.obj dir name out out_name
#   (reads `dir/name.txt` or `dir/name.txt.zst` and `dir/name_ao.txt`; writes `out/out_name.txt`, `_ao.txt` and
#   `_view.obj`)
#   DAG       how many tongues round the hem; how deep they are cut (units of 10 cm); their form (0: tongues with a
#             round end, 1: with a square end); a tongue's breadth as a share of the room it has; what lies at
#             the front's middle (0: a tongue's middle, 0.5: a cut; a share of a tongue's room)
#   DAG_FINE  how often the sheet is made finer near the hem (each time an edge is halved)
#   HEM_NS    the corners round a rolled hem's tube, as `tunic_bind.py` wrote it
import os
import sys
import collections
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hairlib import Head, unit

base, src, name, out, out_name = sys.argv[1:6]
_e = lambda k, d: [float(t) for t in os.environ.get(k, d).split(',')]
N, DEEP, FORM, FILL, PHASE = _e('DAG', '18,0.45,0,0.85,0')
FINE = int(_e('DAG_FINE', '1')[0])
NS = int(_e('HEM_NS', '6')[0])

path = os.path.join(src, name + '.txt')
if os.path.exists(path):
    rows = open(path).read().split('\n')
else:
    import zstandard
    rows = zstandard.ZstdDecompressor().decompress(open(path + '.zst', 'rb').read()).decode().split('\n')
nv, nt = map(int, rows[0].split())
bound = rows[1:1 + nv]
T0 = np.array([[float(t) for t in l.split()] for l in rows[1 + nv:1 + nv + nt]])
ao0 = np.loadtxt(os.path.join(src, name + '_ao.txt'))

# the garment as it lies on the base body (as the builder reads it, `mh_cloth`)
H = Head(base, ymin=3.4, hc=(0.0, 5.0, 0.2), xmax=2.85)
HB = H.V[H.used]
V0 = np.array([[float(t) for t in l.split()] for l in bound])
r = V0[:, :3].astype(int)
a, b, c = HB[r[:, 0]], HB[r[:, 1]], HB[r[:, 2]]
n = unit(np.cross(b - a, c - a)); e1 = unit(b - a); e2 = np.cross(n, e1)
P = V0[:, 3:4] * a + V0[:, 4:5] * b + V0[:, 5:6] * c + n * V0[:, 6:7] + e1 * V0[:, 7:8] + e2 * V0[:, 8:9]
tri = T0[:, :3].astype(int)
tuv = T0[:, 3:].reshape(-1, 3, 2)

SHEET0 = P.copy()
# the cloth's edges: where a hem's tube hangs on the sheet an edge has more than two triangles
ec = collections.Counter(tuple(sorted((t[k], t[(k + 1) % 3]))) for t in tri for k in range(3))
adj = collections.defaultdict(list)
for (x, y), k in ec.items():
    if k > 2:
        adj[x].append(y); adj[y].append(x)
loops, seen = [], set()
for s in sorted(adj):
    if s in seen:
        continue
    loop, cur = [s], s
    seen.add(s)
    while True:
        nx = [q for q in adj[cur] if q not in seen]
        if not nx:
            break
        cur = nx[0]; seen.add(cur); loop.append(cur)
    loops.append(loop)
m = sum(len(l) for l in loops)
n_cloth, t_cloth = nv - m * (NS - 1), nt - 2 * m * NS
assert (tri[:t_cloth] < n_cloth).all() and (tri[t_cloth:].max(1) >= n_cloth).all(), 'the hems are not tubes of HEM_NS corners'
hem = min(loops, key=lambda l: P[l, 1].mean())
# (the tubes: each a piece of its own; the one on the lowest edge goes)
par = list(range(nv))


def top(i):
    while par[i] != i:
        par[i] = par[par[i]]; i = par[i]
    return i


for t in tri[t_cloth:]:
    q = [i for i in t if i >= n_cloth]
    for i in q[1:]:
        par[top(i)] = top(q[0])
gone = {top(i) for t in tri[t_cloth:] if set(t) & set(hem) for i in t if i >= n_cloth}
tube = np.array([k for k in range(t_cloth, nt) if not any(i >= n_cloth and top(i) in gone for i in tri[k])], dtype=int)

Q = P[hem]
QN = np.roll(Q, -1, axis=0)
SEG = QN - Q
LEN = np.linalg.norm(SEG, axis=1)
RUN = np.concatenate([[0.0], np.cumsum(LEN)])
ROOM = RUN[-1] / N
# (the front's middle: where the hem crosses x = 0 in front of its own middle)
k0 = next(k for k in range(len(Q)) if Q[k, 2] > Q[:, 2].mean() and Q[k, 0] * QN[k, 0] <= 0 and Q[k, 0] != QN[k, 0])
FRONT = RUN[k0] + LEN[k0] * Q[k0, 0] / (Q[k0, 0] - QN[k0, 0])


def level(X):
    """How far inside what is left of the cloth a place is (below 0: cut away): its way from the hem less the
    depth of the cut at its place round the hem."""
    w = X[:, None, :] - Q[None]
    t = np.clip((w * SEG[None]).sum(2) / (LEN ** 2)[None], 0, 1)
    d = np.linalg.norm(w - t[..., None] * SEG[None], axis=2)
    k = d.argmin(1)
    i = np.arange(len(X))
    x = np.abs(((RUN[k] + t[i, k] * LEN[k] - FRONT) / ROOM + PHASE + 0.5) % 1.0 * 2 - 1)
    cut = np.where(x < FILL, 0.0 if FORM else 1 - np.sqrt(np.clip(1 - (x / FILL) ** 2, 0, 1)), 1.0)
    return d[i, k] - DEEP * cut


def near(P, tri, margin):
    low = P[:, 1] < Q[:, 1].max() + DEEP + margin + 0.3
    f = np.full(len(P), 9.0)
    f[low] = level(P[low]) + DEEP          # (at most the way from the hem)
    return f, (f[tri].min(1) < DEEP + margin)


# the sheet finer near the hem: every edge of a triangle there is halved, and its neighbours are cut to fit
P, ao = list(P[:n_cloth]), list(ao0[:n_cloth])
ct, cuv = tri[:t_cloth], tuv[:t_cloth]
for _ in range(FINE):
    _, mask = near(np.array(P), ct, 0.1)
    mid = {}
    for t in ct[mask]:
        for k in range(3):
            e = tuple(sorted((t[k], t[(k + 1) % 3])))
            if e not in mid:
                mid[e] = len(P)
                P.append(0.5 * (P[e[0]] + P[e[1]])); ao.append(0.5 * (ao[e[0]] + ao[e[1]]))
    nt_, nuv = [], []
    for t, u in zip(ct, cuv):
        ms = [mid.get(tuple(sorted((t[k], t[(k + 1) % 3])))) for k in range(3)]
        mu = [0.5 * (u[k] + u[(k + 1) % 3]) for k in range(3)]
        cnt = sum(x is not None for x in ms)
        if cnt == 0:
            nt_.append(t); nuv.append(u)
        elif cnt == 3:
            for q, w in (((t[0], ms[0], ms[2]), (u[0], mu[0], mu[2])), ((ms[0], t[1], ms[1]), (mu[0], u[1], mu[1])), ((ms[2], ms[1], t[2]), (mu[2], mu[1], u[2])), ((ms[0], ms[1], ms[2]), (mu[0], mu[1], mu[2]))):
                nt_.append(q); nuv.append(w)
        elif cnt == 1:
            k = [x is not None for x in ms].index(True)
            i, j, l = k, (k + 1) % 3, (k + 2) % 3
            nt_ += [(t[i], ms[k], t[l]), (ms[k], t[j], t[l])]; nuv += [(u[i], mu[k], u[l]), (mu[k], u[j], u[l])]
        else:
            k = [x is None for x in ms].index(True)       # (the edge left whole: from l to i)
            i, j, l = (k + 1) % 3, (k + 2) % 3, k
            m1, m2, u1, u2 = ms[i], ms[j], mu[i], mu[j]
            # corners in turn: i, m1 (on i-j), j, m2 (on j-l), l
            nt_ += [(m1, t[j], m2), (t[i], m1, m2), (t[i], m2, t[l])]; nuv += [(u1, u[j], u2), (u[i], u1, u2), (u[i], u2, u[l])]
    ct, cuv = np.array(nt_), np.array(nuv)
P, ao = np.array(P), np.array(ao)

# cut: a triangle wholly inside stays, one wholly outside goes, one across the line keeps its part inside
f, _ = near(P, ct, 0.1)
f -= DEEP
inside = f > -1e-7
cuts = {}
for t in ct:
    for k in range(3):
        i, j = t[k], t[(k + 1) % 3]
        if inside[i] != inside[j]:
            cuts.setdefault((i, j) if inside[i] else (j, i), None)
keys = list(cuts)
if keys:
    A_, B_ = P[[k[0] for k in keys]], P[[k[1] for k in keys]]
    lo, hi = np.zeros(len(keys)), np.ones(len(keys))
    for _ in range(14):
        md = 0.5 * (lo + hi)
        ins = level(A_ + md[:, None] * (B_ - A_)) > -1e-7
        lo, hi = np.where(ins, md, lo), np.where(ins, hi, md)
    P = np.concatenate([P, A_ + lo[:, None] * (B_ - A_)])
    ao = np.concatenate([ao, ao[[k[0] for k in keys]] * (1 - lo) + ao[[k[1] for k in keys]] * lo])
    for q, k in enumerate(keys):
        cuts[k] = (len(P) - len(keys) + q, lo[q])


def cut_at(t, u, i, j):
    """The corner where the edge from t[i] (inside) to t[j] (outside) is cut, and its place in the image."""
    k, s = cuts[(t[i], t[j])]
    return k, u[i] + s * (u[j] - u[i])


ft, fuv = [], []
for t, u in zip(ct, cuv):
    ins = inside[t]
    if ins.all():
        ft.append(tuple(t)); fuv.append(tuple(u))
    elif ins.sum() == 1:
        i = int(np.argmax(ins)); j, l = (i + 1) % 3, (i + 2) % 3
        (kj, uj), (kl, ul) = cut_at(t, u, i, j), cut_at(t, u, i, l)
        ft.append((t[i], kj, kl)); fuv.append((u[i], uj, ul))
    elif ins.sum() == 2:
        l = int(np.argmin(ins)); i, j = (l + 1) % 3, (l + 2) % 3
        (kj, uj), (ki, ui) = cut_at(t, u, j, l), cut_at(t, u, i, l)
        ft += [(t[i], t[j], kj), (t[i], kj, ki)]; fuv += [(u[i], u[j], uj), (u[i], uj, ui)]
n_sheet = len(ft)
# the other hems' tubes after the sheet
tube_v = sorted({i for k in tube for i in tri[k] if i >= n_cloth})
old_n = len(P)
tmap = {o: old_n + k for k, o in enumerate(tube_v)}
for k in tube:
    ft.append(tuple(tmap.get(i, i) for i in tri[k])); fuv.append(tuple(tuv[k]))
ft, fuv = np.array(ft), np.array(fuv)
used = sorted(set(ft.reshape(-1)))
re = {o: k for k, o in enumerate(used)}

# each corner's binding: the file's own for a corner the file had, the nearest triangle of the body for a new one
A, B, C, HT = H.A, H.B, H.C, H.T
HCEN = (A + B + C) / 3


def nearest(p):
    best = None
    for ti in ((HCEN - p) ** 2).sum(1).argsort()[:12]:
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
    return best


lines, shade, view = [], [], []
for o in used:
    if o >= old_n or o < n_cloth:
        src_i = tube_v[o - old_n] if o >= old_n else o
        lines.append(bound[src_i]); shade.append(ao0[src_i])
        p = V0[src_i]
        a, b, c = HB[int(p[0])], HB[int(p[1])], HB[int(p[2])]
        n = unit(np.cross(b - a, c - a)); e1 = unit(b - a); e2 = np.cross(n, e1)
        view.append(p[3] * a + p[4] * b + p[5] * c + n * p[6] + e1 * p[7] + e2 * p[8])
    else:
        _, ti, bc, off = nearest(P[o])
        a, b_, c_ = A[ti], B[ti], C[ti]
        n = unit(np.cross(b_ - a, c_ - a)); e1 = unit(b_ - a); e2 = np.cross(n, e1)
        lines.append(' '.join(str(H.remap[x]) for x in HT[ti]) + ' ' + ' '.join(f'{x:.6f}' for x in list(bc) + [off @ n, off @ e1, off @ e2]))
        shade.append(ao[o]); view.append(P[o])
os.makedirs(out, exist_ok=True)
with open(os.path.join(out, out_name + '.txt'), 'w') as fh:
    fh.write(f'{len(used)} {len(ft)}\n')
    fh.write('\n'.join(lines) + '\n')
    for t, u in zip(ft, fuv):
        fh.write(' '.join(str(re[i]) for i in t) + ' ' + ' '.join(f'{x:.6f}' for x in u.reshape(-1)) + '\n')
np.savetxt(os.path.join(out, out_name + '_ao.txt'), np.array(shade), fmt='%.3f')
with open(os.path.join(out, out_name + '_view.obj'), 'w') as fh:
    for p in view:
        fh.write('v %.5f %.5f %.5f\n' % tuple(p))
    for t in ft:
        fh.write('f %d %d %d\n' % tuple(re[i] + 1 for i in t))
view = np.array(view)
now = np.array([[re[i] for i in t] for t in ft[:n_sheet]])
area = lambda X, tt: 0.5 * np.linalg.norm(np.cross(X[tt[:, 1]] - X[tt[:, 0]], X[tt[:, 2]] - X[tt[:, 0]]), axis=1).sum()
print(f'{out_name}: {len(used)} points ({nv}), {len(ft)} triangles ({nt}), {n_sheet} the sheet ({t_cloth}); the hem {RUN[-1] * 10:.0f} cm round, '
      f'{int(N)} tongues of {ROOM * FILL * 10:.1f} cm in rooms of {ROOM * 10:.1f} cm, cut {DEEP * 10:.1f} cm deep; '
      f'the sheet from y {view[np.unique(now)][:, 1].min():.2f}, {100 * (1 - area(view, now) / area(SHEET0, tri[:t_cloth])):.1f} in a hundred of its cloth cut away')
