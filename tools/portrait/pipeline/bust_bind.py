# The bust of a bound gown (round 124): a gown as `tunic_bind.py` wrote it ends where the portrait was cut (every
# triangle above 3.45 and within 2.55 of the middle, a ragged edge across the chest and round the upper arms). This
# sets the rest of a draped gown under it, down to its hem at the waist and out to the ends of its sleeves, and
# binds it to the bust's vertices of head.bin (`extend_head.py`, `hairlib.bust_faces`).
#
# What is in the file stays as it is, row for row: its points, their binding, its triangles and their shade. Hoods,
# veils and wimples were draped over that gown and the tests read its folds. The rest comes from a drape of the
# same garment (`tunic_sim.py`'s OBJ; a simulation does not write the same folds twice, so it is not the drape the
# file was cut from): its triangles that lie wholly below the old cut by `GAP`, or beyond it on a sleeve. Between
# the file's open edges and the open edges of that piece a strip is sewn (round the line through the two edges' middles,
# each edge's points in the order of their angle about it, always on to the point with the lesser angle; sewn by
# the shorter of the two next seams the strip of a sleeve was a fan from one point under the arm to the whole of
# the other edge, through the arm), and the piece's points near the strip are evened out, so that the two drapes
# pass into each other.
#
# usage: python3 -I bust_bind.py base.obj drape.obj bound.txt bound_ao.txt outdir name
# (bound.txt unpacked: `zstd -d public/portrait/real/cloth_cote.txt.zst -o cote.txt`)
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from collections import Counter, defaultdict
import numpy as np
from hairlib import Head, unit, BUST_Y, BUST_X

base, drape, bound, bound_ao, out, name = sys.argv[1:7]
GAP = float(os.environ.get('GAP', '0.2'))
# how many rows of points from the strip are evened out, and how often
EVEN, EVEN_IT = int(os.environ.get('EVEN', '5')), int(os.environ.get('EVEN_IT', '30'))
H = Head(base, ymin=BUST_Y, hc=(0.0, 5.0, 0.2), xmax=BUST_X, tkeep=lambda P: P[:, 1].max() < 6.6, bust=True)
A, B, C, HT = H.A, H.B, H.C, H.T
HCEN = (A + B + C) / 3
HV = H.V[H.used]

# The arm and the flank under it. The builder brings the arms down from MakeHuman's pose, about the shoulder joint
# (morph.rs): what is bound to the arm swings in towards the body, what is bound to the flank stays. A sleeve hangs
# as a bag under the arm it was draped on, between arm and flank, and each of its points was bound to the nearer of
# the two: with the arm down the bag was torn into flags. So a point of a sleeve is bound to the arm and a point of
# the body's cloth to the trunk (`SLEEVE` below), and the sleeve swings in whole.
# `ARMPIT`: where arm and flank part on the base body (x, y), and the line between them from there downward.
ARMPIT, PART = np.array([1.72, 4.45]), np.array([0.9726, 0.2325])
def side(p):
    """1 on the arm, -1 on the flank, 0 above the armpit (there the body is one piece)."""
    return 0 if p[1] >= ARMPIT[1] else (1 if (abs(p[0]) - ARMPIT[0]) * PART[0] + (p[1] - ARMPIT[1]) * PART[1] > 0 else -1)
HSIDE = np.array([side(c) for c in HCEN])

def nearest(p, want=0):
    # the body's point nearest to p (as tunic_bind.py): distance, triangle, weights of its corners, the way to p.
    # `want`: 1 not on the flank, -1 not on the arm
    best = None
    d2 = ((HCEN - p) ** 2).sum(1)
    if want:
        d2 = np.where(HSIDE == -want, np.inf, d2)
    for ti in d2.argsort()[:12]:
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

def frame(a, b_, c_):
    n = unit(np.cross(b_ - a, c_ - a)); e1 = unit(b_ - a)
    return n, e1, np.cross(n, e1)

# the file as it is, and where its points lie on the base body
lines = open(bound).read().strip().split('\n')
nv0, nt0 = (int(t) for t in lines[0].split())
rows_v, rows_t = lines[1:1 + nv0], lines[1 + nv0:1 + nv0 + nt0]
assert len(rows_t) == nt0
P0 = np.zeros((nv0, 3))
for i, l in enumerate(rows_v):
    f = l.split()
    a, b_, c_ = (HV[int(t)] for t in f[:3])
    w, o = np.array(f[3:6], float), np.array(f[6:9], float)
    n, e1, e2 = frame(a, b_, c_)
    P0[i] = w[0] * a + w[1] * b_ + w[2] * c_ + o[0] * n + o[1] * e1 + o[2] * e2
T0 = np.array([[int(t) for t in l.split()[:3]] for l in rows_t])
ao0 = np.loadtxt(bound_ao)
assert len(ao0) == nv0

def loops(T):
    """The open edges of triangles as closed rows of points."""
    ec = Counter(tuple(sorted((int(t[k]), int(t[(k + 1) % 3])))) for t in T for k in range(3))
    adj = defaultdict(list)
    for (a, b_), n in ec.items():
        if n == 1:
            adj[a].append(b_); adj[b_].append(a)
    assert all(len(v) == 2 for v in adj.values()), 'an open edge that is not a plain loop'
    seen, found = set(), []
    for s in adj:
        if s in seen:
            continue
        ch = [s]; seen.add(s)
        while True:
            nx = [q for q in adj[ch[-1]] if q not in seen]
            if not nx:
                break
            ch.append(nx[0]); seen.add(nx[0])
        found.append(ch)
    return found

# the drape, smoothed as tunic_bind.py smooths it
cv, cf = [], []
for l in open(drape):
    if l.startswith('v '):
        cv.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('f '):
        f = [int(t) - 1 for t in l.split()[1:]]
        cf += [[f[0], f[k], f[k + 1]] for k in range(1, len(f) - 1)]
CV = np.array(cv)
nbs = defaultdict(set)
for f in cf:
    for k in range(3):
        nbs[f[k]].update((f[k - 1], f[(k + 1) % 3]))
idx = np.array(sorted(nbs)); nl = [np.array(sorted(nbs[i])) for i in idx]
for _ in range(int(os.environ.get('TAUBIN', '4'))):
    for lam in (0.5, -0.53):
        m = np.array([CV[n].mean(0) for n in nl])
        CV[idx] = CV[idx] + lam * (m - CV[idx])
own = loops(cf)   # the drape's own edges: neck, hem, the sleeves' ends
below = lambda p: p[1] < 3.45 - GAP or abs(p[0]) > 2.55 + GAP
piece = [f for f in cf if all(below(CV[i]) for i in f)]
# only what hangs together with one of the drape's own edges (the hem, a sleeve's end): no loose scraps
comp = {}
def root(i):
    while comp.setdefault(i, i) != i:
        comp[i] = comp[comp[i]]; i = comp[i]
    return i
for f in piece:
    for k in range(3):
        comp[root(f[k])] = root(f[k - 1])
ends = {root(ch[0]) for ch in own if ch[0] in comp and all(below(CV[i]) for i in ch)}
piece = [f for f in piece if root(f[0]) in ends]
used = sorted({i for f in piece for i in f}); rm = {o: nv0 + k for k, o in enumerate(used)}
P = np.concatenate([P0, CV[used]])
T1 = [[rm[i] for i in f] for f in piece]
own_sets = [set(rm[i] for i in ch) for ch in own if all(i in rm for i in ch)]
cut1 = [ch for ch in loops(T1) if not any(set(ch) == s for s in own_sets)]
cut0 = loops(T0)
print('the file:', nv0, 'points,', nt0, 'triangles, open edges', [len(c) for c in cut0], '| the piece:', len(used), 'points,', len(T1), 'triangles, cut edges', [len(c) for c in cut1])
assert len(cut0) == len(cut1), 'the piece has not one cut edge for each open edge of the file'

def area_normal(ch):
    q = P[ch]
    return np.cross(q, np.roll(q, -1, 0)).sum(0)

strip, seam = [], set()
for a in cut0:
    b_ = min(cut1, key=lambda ch: np.linalg.norm(P[ch].mean(0) - P[a].mean(0)))
    cut1 = [ch for ch in cut1 if ch is not b_]
    if area_normal(a) @ area_normal(b_) < 0:
        b_ = b_[::-1]
    # Sewn by the angle round the line from the middle of one edge to the middle of the other (along the arm for a
    # sleeve, upright for the trunk): each next triangle goes to the edge whose next point comes first round that
    # line, so that the top of a sleeve is sewn to the top and its underside to its underside. By the shorter of
    # the two next seams, from the two nearest points on, the kirtle's right sleeve was sewn as a fan from one
    # point under the arm to the whole of the file's edge over it: triangles 12 cm long straight through the arm,
    # and the arm's skin bare between shoulder and elbow.
    ca, cb = P[a].mean(0), P[b_].mean(0)
    u = unit(cb - ca); e1 = unit(np.cross(u, [0.0, 0.0, 1.0]) if abs(u[2]) < 0.9 else np.cross(u, [1.0, 0.0, 0.0])); e2 = np.cross(u, e1)
    def round_line(ch, c):
        """The edge's points in the order of their angle round the line, from the least on, and those angles (rising)."""
        turn = lambda q: np.arctan2((P[q] - c) @ e2, (P[q] - c) @ e1)
        steps = lambda th: (np.diff(th) + np.pi) % (2 * np.pi) - np.pi
        if steps(np.append(turn(ch), turn(ch[:1]))).sum() < 0:
            ch = ch[::-1]
        k = int(turn(ch).argmin()); ch = ch[k:] + ch[:k]; th = turn(ch)
        return ch, np.concatenate([[th[0]], th[0] + np.cumsum(steps(th))])
    (a, ta), (b_, tb) = round_line(a, ca), round_line(b_, cb)
    ta, tb = np.append(ta, ta[0] + 2 * np.pi), np.append(tb, tb[0] + 2 * np.pi)
    i = j = 0
    while i < len(a) or j < len(b_):
        ai, bj, an, bn = a[i % len(a)], b_[j % len(b_)], a[(i + 1) % len(a)], b_[(j + 1) % len(b_)]
        step_a = j >= len(b_) or (i < len(a) and ta[i + 1] <= tb[j + 1])
        if step_a:
            strip.append([ai, an, bj]); i += 1
        else:
            strip.append([ai, bn, bj]); j += 1
    longest = max(np.linalg.norm(P[t[k]] - P[t[k - 1]]) for t in strip[-(len(a) + len(b_)):] for k in range(3))
    seam.update(b_)
    print('  sewn: an edge of', len(a), 'to one of', len(b_), '(the longest seam', round(float(longest), 3), ')')
T = np.array(T0.tolist() + strip + T1)

# the piece's points near the strip evened out: the strip is as flat as its two edges let it be, and the drape
# below it passes into the file's. Less from row to row; the file's own points stay
near = defaultdict(set)
for t in T:
    for k in range(3):
        near[int(t[k])].update((int(t[k - 1]), int(t[(k + 1) % 3])))
share, ring = {i: 1.0 for i in seam}, set(seam)
for r in range(1, EVEN):
    ring = {j for i in ring for j in near[i] if j >= nv0 and j not in share}
    share.update({j: 1 - r / EVEN for j in ring})
ids = sorted(share)
for _ in range(EVEN_IT):
    m = np.array([P[sorted(near[i])].mean(0) for i in ids])
    P[ids] += np.array([share[i] for i in ids])[:, None] * 0.5 * (m - P[ids])

# wound as the file's triangles are, from them outward over the strip and the piece
edge_of = defaultdict(list)
for k, t in enumerate(T):
    for e in range(3):
        edge_of[tuple(sorted((int(t[e]), int(t[(e + 1) % 3]))))].append(k)
done, todo, turned = set(range(nt0)), list(range(nt0)), 0
while todo:
    k = todo.pop()
    for e in range(3):
        a, b_ = int(T[k][e]), int(T[k][(e + 1) % 3])
        for q in edge_of[tuple(sorted((a, b_)))]:
            if q in done:
                continue
            t = [int(x) for x in T[q]]
            # a neighbour runs along the shared edge the other way
            if (t.index(a) + 1) % 3 == t.index(b_):
                T[q] = T[q][[0, 2, 1]]; turned += 1
            done.add(q); todo.append(q)
assert len(done) == len(T), 'a part of the piece is not joined to the file'
print('triangles', len(T), '(', len(strip), 'in the strip),', turned, 'turned to the file\'s winding')

# Which points are a sleeve's: those nearer, along the cloth, to what lies out on the arm than to what lies on the
# trunk (the way along the cloth from the bag under the arm to the trunk leads up through the armpit)
import heapq
def along(seeds):
    dist = np.full(len(P), np.inf)
    heap = [(0.0, int(i)) for i in seeds]
    for _, i in heap:
        dist[i] = 0.0
    while heap:
        d, i = heapq.heappop(heap)
        if d > dist[i]:
            continue
        for j in near[i]:
            dj = d + float(np.linalg.norm(P[i] - P[j]))
            if dj < dist[j]:
                dist[j] = dj; heapq.heappush(heap, (dj, j))
    return dist
OUT, IN = float(os.environ.get('SLEEVE_OUT', '2.3')), float(os.environ.get('SLEEVE_IN', '1.2'))
to_arm, to_trunk = along(np.flatnonzero(np.abs(P[:, 0]) > OUT)), along(np.flatnonzero(np.abs(P[:, 0]) < IN))
SLEEVE = to_arm < to_trunk
print('a sleeve\'s points:', int(SLEEVE.sum()), 'of', len(P), '(', int(SLEEVE[:nv0].sum()), 'of the file\'s)')

# A sleeve that fits the arm. As draped, on an arm held out, the sleeve's surplus hangs under the arm as a bag,
# a hand's breadth and more; with the arm down that bag swings into the trunk and its walls come out through the
# gown's front and back as flags. What of a sleeve stands further than `FIT` from the arm's middle line is drawn
# in to `FIT` and a share `SLACK` of what it stood beyond (the folds stay, smaller); the sleeve's top, which lies
# on the arm, stays as draped. Not at the armpit, where sleeve and trunk meet: there by the share of the way.
SHOULDER, ELBOW, HAND = np.array([1.68, 5.25, 0.15]), np.array([3.13, 3.49, 0.13]), np.array([4.31, 2.45, 1.76])
FIT, SLACK, FADE = float(os.environ.get('FIT', '0.62')), float(os.environ.get('SLACK', '0.2')), float(os.environ.get('FADE', '0.2'))
def on_arm(q):
    """The point of the arm's middle line (shoulder, elbow, hand) nearest to q (x taken as its distance from the middle)."""
    best = None
    for a, b_ in ((SHOULDER, ELBOW), (ELBOW, HAND)):
        t = np.clip((q - a) @ (b_ - a) / ((b_ - a) @ (b_ - a)), 0, 1)
        c = a + t * (b_ - a)
        if best is None or np.linalg.norm(q - c) < np.linalg.norm(q - best):
            best = c
    return best
moved = np.zeros(len(P), bool)
for i in np.flatnonzero(SLEEVE):
    q = np.array([abs(P[i, 0]), P[i, 1], P[i, 2]])
    c = on_arm(q); r = np.linalg.norm(q - c)
    if r > FIT:
        f = min(1.0, (to_trunk[i] - to_arm[i]) / FADE)
        q = q + f * (c + (q - c) / r * (FIT + SLACK * (r - FIT)) - q)
        P[i] = [np.sign(P[i, 0]) * q[0], q[1], q[2]]; moved[i] = True
# And the trunk's cloth under the armpit in to the flank: as draped, a web of cloth hangs between the arm and
# the flank down to the chest's height (the armhole of a loose gown on an arm held out). Its sleeve half is drawn
# in to the arm above; its other half, left where it hung, stood out between arm and trunk as a flap. What of the
# trunk's cloth beside the flank (further out than `WEB[0]`, below the armpit) stands more than `WEB[1]` off the
# body is drawn in to that, with the same slack. The web's seam then spans from flank to arm while the arm is
# held out, and closes when it comes down.
WEB = [float(t) for t in os.environ.get('WEB', '1.45,0.3').split(',')]
webbed = 0
for i in np.flatnonzero(~SLEEVE & (np.abs(P[:, 0]) > WEB[0]) & (P[:, 1] < ARMPIT[1])):
    dist, _, _, off = nearest(P[i], -1)
    if dist > WEB[1]:
        P[i] = P[i] - off + off / dist * (WEB[1] + SLACK * (dist - WEB[1])); moved[i] = True; webbed += 1
print('drawn in to the arm or the flank:', int(moved.sum()), 'points (', int(moved[:nv0].sum()), 'of the file\'s;', webbed, 'to the flank)')

# The image: round the body as tunic_bind.py lays it (a triangle that spans the line down the back kept whole); on
# a sleeve round the arm and along it (round the body a sleeve's whole girth was a third of a tile: streaks)
arm = unit(ELBOW - SHOULDER); up = unit(np.cross([0.0, 0.0, 1.0], arm)); fw = np.cross(up, arm)   # (the image's seam under the arm)
def laid(t):
    q = P[t]
    if SLEEVE[t].sum() >= 2:
        q = np.stack([np.abs(q[:, 0]), q[:, 1], q[:, 2]], -1) - SHOULDER
        th = np.arctan2(q @ fw, q @ up)
        th = np.where((np.ptp(th) > np.pi) & (th < 0), th + 2 * np.pi, th)
        # (three tiles up: a hem's roll is known by its coordinates, which run from 0 to 0.05 of the image)
        return np.stack([th * 0.55 / 2.0, 3.0 - (q @ arm) / 2.0], -1)
    u = np.arctan2(q[:, 0], q[:, 2] - 0.2) * 1.2 / 2.0
    u = np.where((np.ptp(u) > np.pi * 0.6) & (u < 0), u + np.pi * 1.2, u)
    return np.stack([u, q[:, 1] / 2.0], -1)
TUV = np.array([laid(t) for t in T])

# shade in the folds, as tunic_bind.py reads it, for the new points
nbl = [np.array(sorted(near[i])) if near[i] else np.array([i]) for i in range(len(P))]
vn = np.zeros_like(P)
for t in T:
    vn[t] += np.cross(P[t[1]] - P[t[0]], P[t[2]] - P[t[0]])
vn = unit(vn)
Ps = P.copy()
for _ in range(int(os.environ.get('AOIT', '30'))):
    Ps = 0.5 * Ps + 0.5 * np.array([Ps[n_].mean(0) for n_ in nbl])
dh = ((P - Ps) * vn).sum(1)
for _ in range(2):
    dh = 0.5 * dh + 0.5 * np.array([dh[n_].mean() for n_ in nbl])
ao = np.clip(1 + float(os.environ.get('AO', '9')) * dh, 0.5, 1.1)
ao[:nv0] = ao0
np.savetxt(os.path.join(out, name + '_ao.txt'), ao, fmt='%.3f')

def row(p, want):
    dist, ti, bc, off = nearest(p, want)
    n, e1, e2 = frame(A[ti], B[ti], C[ti])
    return dist, ' '.join(str(H.remap[x]) for x in HT[ti]) + ' ' + ' '.join(f'{x:.6f}' for x in list(bc) + [off @ n, off @ e1, off @ e2])
# The seam under the arm is left open: the triangles between a sleeve's points and the trunk's, below the armpit.
# They span from the flank to the arm while it is held out; with the arm down one end of each goes with the arm
# and the other stays, and on a body whose arm does not lie against it (a child's) they stood out beside the
# chest as a row of teeth. Open, the sleeve and the gown's side hang each on its own; the slit lies under the arm.
open_seam = np.array([os.environ.get('SEAM', 'open') == 'open' and 0 < SLEEVE[t].sum() < 3 and P[t, 1].max() < ARMPIT[1] for t in T])
print('the seam under the arms: left open,', int(open_seam.sum()), 'triangles (', int(open_seam[:nt0].sum()), 'of the file\'s)')
with open(os.path.join(out, name + '.txt'), 'w') as f:
    f.write(f'{len(P)} {len(T) - int(open_seam.sum())}\n')
    # the file's points keep their rows, but for those bound across: a sleeve's to the flank, the body's to the arm
    # (a hem's tube goes with the cloth's point it is welded to: none lies there)
    again = 0
    for i, l in enumerate(rows_v):
        want = 1 if SLEEVE[i] else -1
        if moved[i] or side(HV[[int(t) for t in l.split()[:3]]].mean(0)) == -want:
            l = row(P[i], want)[1]; again += 1
        f.write(l + '\n')
    off_most = 0.0
    for i in range(nv0, len(P)):
        dist, l = row(P[i], 1 if SLEEVE[i] else -1)
        off_most = max(off_most, dist)
        f.write(l + '\n')
    # (a triangle of the file's that is not a sleeve's keeps its row)
    for k, t in enumerate(T):
        if open_seam[k]:
            continue
        if k < nt0 and SLEEVE[t].sum() < 2:
            f.write(rows_t[k] + '\n')
        else:
            f.write(' '.join(map(str, t)) + ' ' + ' '.join(f'{u:.6f} {1 - v:.6f}' for u, v in TUV[k]) + '\n')
print(again, 'of the file\'s points bound anew (drawn in to the arm, or bound across the armpit)')
print('points', len(P), 'triangles', len(T) - int(open_seam.sum()), '| the new points stand at most', round(float(off_most), 3), 'off the body | lowest', P[:, 1].min().round(2), 'furthest out', np.abs(P[:, 0]).max().round(2))
# to look at
with open(os.path.join(out, name + '_view.obj'), 'w') as f:
    f.write(''.join(f'v {p[0]:.5f} {p[1]:.5f} {p[2]:.5f}\n' for p in P) + ''.join(f'f {t[0] + 1} {t[1] + 1} {t[2] + 1}\n' for t in T))
