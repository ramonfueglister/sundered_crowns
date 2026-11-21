# (round 156) A gown's place in its cloth's image, as a tailor cuts it: a front and a back, each laid flat.
#
# `tunic_bind.py` writes a gown's texture coordinates round the body: the angle about the body's upright and the
# height. For a plain weave that is enough. On the shoulders' tops, which lie level, and along a sleeve, which
# runs outwards, the height hardly changes and the angle does not: there the image is drawn out into streaks,
# which a figured silk shows (round 156: the palmettes on a shoulder were stripes of gold).
#
# This writes them anew for a bound gown, leaving every other number of the file as it is. The gown is parted
# into a front and a back along the shoulders' ridge and down the sides and the sleeves, where a gown has its
# seams. On each part the coordinates are the ones whose slopes come nearest, over all its triangles, to one
# step of the image for each 20 cm of cloth, up the cloth and across it (a least-squares fit: the Poisson
# equation with the triangles' cotangent weights, Pinkall and Polthier 1993, "Computing discrete minimal
# surfaces and their conjugates", Experimental Mathematics 2). "Up the cloth" is the body's upright on the
# trunk, on over the shoulder where the cloth lies level, and the arm's own line on a sleeve, each laid into
# the triangle's plane (`up_at`). A hem's roll keeps its own coordinates (the builder knows a hem by them).
#
# usage: python3 -I cloth_panels.py base.obj bound.txt out.txt
# (bound.txt unpacked: `zstd -d public/portrait/real/cloth_cote_court.txt.zst -o bound.txt`)
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from collections import defaultdict
import numpy as np
from hairlib import Head, unit, BUST_Y, BUST_X

base, bound, out = sys.argv[1:4]
# the image's steps for each base unit (10 cm) of cloth, as `tunic_bind.py` has them up the body (height / 2)
STEP = 0.5
# between which distances from the body's middle the trunk's upright passes into the arm's line (the shoulder
# joint lies between them), and beyond which a point is taken for the sleeve whose line is measured.
# PLACEHOLDER, read off the base body
ARM = (1.5, 2.1)
H = Head(base, ymin=BUST_Y, hc=(0.0, 5.0, 0.2), xmax=BUST_X, tkeep=lambda P: P[:, 1].max() < 6.6, bust=True)
HV = H.V[H.used]

lines = open(bound).read().strip().split('\n')
nv, nt = (int(t) for t in lines[0].split())
rows_v, rows_t = lines[1:1 + nv], lines[1 + nv:1 + nv + nt]
assert len(rows_t) == nt
# where the gown's points lie on the base body (as bust_bind.py reads them)
P = np.zeros((nv, 3))
for i, l in enumerate(rows_v):
    f = l.split()
    a, b, c = (HV[int(t)] for t in f[:3])
    w, o = np.array(f[3:6], float), np.array(f[6:9], float)
    n = unit(np.cross(b - a, c - a)); e1 = unit(b - a)
    P[i] = w[0] * a + w[1] * b + w[2] * c + o[0] * n + o[1] * e1 + o[2] * np.cross(n, e1)
T = np.array([[int(t) for t in l.split()[:3]] for l in rows_t])
UV = np.array([[float(t) for t in l.split()[3:9]] for l in rows_t]).reshape(nt, 3, 2)
hem = (np.abs(1 - UV[..., 1]) <= 0.05).all(1)
sheet = np.where(~hem)[0]

# the seam: the shoulder's ridge and the sleeve's top line, and straight down from them. For each distance from
# the body's middle, how far to the front the cloth's highest points lie; within the neck's breadth, where the
# highest points are the neck's edge, the ridge's value beside the neck
pts = np.unique(T[sheet])
ax = np.abs(P[pts, 0])
edges = np.arange(0.0, ax.max() + 0.2, 0.2)
ridge = np.full(len(edges) - 1, np.nan)
for k in range(len(ridge)):
    m = (ax >= edges[k]) & (ax < edges[k + 1])
    if m.sum() >= 8:
        top = P[pts[m]]
        ridge[k] = top[top[:, 1] >= np.quantile(top[:, 1], 0.92), 2].mean()
NECK = 0.9
first = int(np.searchsorted(edges, NECK))
ridge[:first] = ridge[first]
mid = (edges[:-1] + edges[1:]) / 2
ok = ~np.isnan(ridge)
def seam(x):
    return np.interp(np.abs(x), mid[ok], ridge[ok])
cen = P[T].mean(1)
front = cen[:, 2] > seam(cen[:, 0])

def parts(tris):
    """The triangles `tris` as groups that hang together by a side."""
    by_side = defaultdict(list)
    for t in tris:
        for k in range(3):
            by_side[tuple(sorted((T[t, k], T[t, (k + 1) % 3])))].append(t)
    next_to = defaultdict(list)
    for ts in by_side.values():
        for a in ts:
            next_to[a] += [b for b in ts if b != a]
    seen, found = set(), []
    for t in tris:
        if t in seen:
            continue
        group, todo = [], [t]
        seen.add(t)
        while todo:
            a = todo.pop()
            group.append(a)
            for b in next_to[a]:
                if b not in seen:
                    seen.add(b); todo.append(b)
        found.append(group)
    return sorted(found, key=len, reverse=True)

# a fold near the seam can lie on the other side of it: every scrap goes to the part round it, until front and
# back are one piece each
for _ in range(20):
    scraps = [g for side in (True, False) for g in parts([t for t in sheet if front[t] == side])[1:]]
    if not scraps:
        break
    for g in scraps:
        front[g] = ~front[g]
assert not scraps, 'front and back do not come to one piece each'

# the arm's line: from a sleeve's end towards the shoulder, by the sleeve's points on either side
def arm_line(sign):
    m = P[pts, 0] * sign > ARM[1]
    q = P[pts[m]]
    _, _, vt = np.linalg.svd(q - q.mean(0))
    d = vt[0]
    return d if d[0] * sign < 0 else -d            # towards the body
LINE = {1: arm_line(1), -1: arm_line(-1)}
def up_at(c, nrm, side):
    """Which way is up the cloth at a triangle (its middle, its normal, front or back). On the trunk the body's
    upright; where the cloth lies level, on a shoulder's top, on over the shoulder towards the ridge, as the
    panel's own length runs (the steepest way up there leads to the neck, and the coordinates run together
    round it); on a sleeve the arm's line."""
    w = np.clip((abs(c[0]) - ARM[0]) / (ARM[1] - ARM[0]), 0, 1)
    w = w * w * (3 - 2 * w)
    level = max(nrm[1], 0.0)
    over = np.array([0.0, 0.0, -1.0 if side else 1.0]) * level / (1.02 - level)
    return unit((1 - w) * (np.array([0.0, 1.0, 0.0]) + over) + w * LINE[1 if c[0] > 0 else -1])

new = UV.copy()
for side in (True, False):
    tris = np.array([t for t in sheet if front[t] == side])
    ids = np.unique(T[tris])
    at = {v: k for k, v in enumerate(ids)}
    n_ = len(ids)
    L = np.zeros((n_, n_))
    bu, bv = np.zeros(n_), np.zeros(n_)
    for t in tris:
        i = [at[v] for v in T[t]]
        p = P[T[t]]
        nrm = np.cross(p[1] - p[0], p[2] - p[0])
        area = np.linalg.norm(nrm) / 2
        if area < 1e-10:
            continue
        nrm = nrm / (2 * area)
        up = up_at(cen[t], nrm, side)
        lay = up - (up @ nrm) * nrm
        # a triangle that lies across "up" says little about where up is: it counts by how much it says
        say = np.linalg.norm(lay)
        ev = lay / max(say, 1e-9)
        eu = np.cross(ev, nrm)
        wgt = area * (say + 0.05)
        # the slope of a function on the triangle: sum of its corner values times grad(k), the hat functions' slopes
        grad = [np.cross(nrm, p[(k + 2) % 3] - p[(k + 1) % 3]) / (2 * area) for k in range(3)]
        for a in range(3):
            bu[i[a]] += wgt * STEP * (grad[a] @ eu)
            bv[i[a]] += wgt * STEP * (grad[a] @ ev)
            for b in range(3):
                L[i[a], i[b]] += wgt * (grad[a] @ grad[b])
    # the coordinates are known up to a shift: a small weight holds them, and the shift is set below
    L += np.eye(n_) * 1e-9 * np.trace(L) / n_
    u, v = np.linalg.solve(L, bu), np.linalg.solve(L, bv)
    # the shift: the body's middle line at 0 across, and up the cloth as the height halved on the whole
    near = np.abs(P[ids, 0]) < 0.15
    u -= u[near].mean()
    v += (P[ids, 1] * STEP - v).mean()
    for t in tris:
        for k in range(3):
            new[t, k] = [u[at[T[t, k]]], 1 - v[at[T[t, k]]]]
    slopes = []
    for t in tris:
        p, q = P[T[t]], np.array([[u[at[x]], v[at[x]]] for x in T[t]])
        e = np.linalg.norm(p[[1, 2, 0]] - p, axis=1)
        slopes += list(np.linalg.norm(q[[1, 2, 0]] - q, axis=1) / np.maximum(e, 1e-9))
    slopes = np.array(slopes) / STEP
    print('front' if side else 'back', len(tris), 'triangles,', n_, 'points; a side of a triangle in the image against the cloth: median', np.median(slopes).round(3), '5 in 100 under', np.quantile(slopes, 0.05).round(3), 'and over', np.quantile(slopes, 0.95).round(3))
assert (np.abs(1 - new[sheet][..., 1]) > 0.05).all(), 'a place of the cloth has a hem\'s coordinates'
with open(out, 'w') as f:
    f.write('\n'.join(lines[:1 + nv]) + '\n')
    for t in range(nt):
        f.write(' '.join(map(str, T[t])) + ' ' + ' '.join(f'{c[0]:.6f} {c[1]:.6f}' for c in new[t]) + '\n')
    rest = lines[1 + nv + nt:]
    if rest:
        f.write('\n'.join(rest) + '\n')
print('written', out, ':', len(sheet), 'triangles of cloth anew,', int(hem.sum()), 'of hems kept')
