# Shared parts of the hairstyle generators: the MakeHuman base head, angles
# around the head's centre, strands grown along a flow field, wisps turned
# into hair cards bound to head.bin vertices, and the painted cap of fine
# hairs under the cards (stereographic texture) with its scalp mask.
#
# A style gives: a margin m(th, el) in degrees (positive inside the hair),
# a flow t(d, th, el) along the scalp, lengths, lifts and widths.
import os
import numpy as np
from PIL import Image


def dirs(th, el):
    th, el = np.radians(th), np.radians(el)
    return np.stack([np.cos(el) * np.sin(th), np.sin(el), np.cos(el) * np.cos(th)], -1)


def ang(d):
    return np.degrees(np.arctan2(d[..., 0], d[..., 2])), np.degrees(np.arcsin(np.clip(d[..., 1], -1, 1)))


def unit(v):
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-9)


def tangent(v, d):
    """v projected onto the tangent plane at direction d, unit length."""
    return unit(v - (v * d).sum(-1, keepdims=True) * d)


class Head:
    def __init__(self, base, ymin=6.4, hc=None, xmax=2.85, elmin=-70, step=2.0, tkeep=None):
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
        self.ymin = ymin
        parts = [[f for f in faces['body'] if keep(f)], [f for f in faces['helper-tights'] if keep(f)],
                 faces['helper-hair'], faces['helper-l-eye'], faces['helper-r-eye']]
        self.used = sorted({i for p in parts for f in p for i in f})
        self.remap = {o: n for n, o in enumerate(self.used)}
        tris = []
        for f in parts[0]:
            if min(V[i][1] for i in f) > ymin and max(abs(V[i][0]) for i in f) < xmax and (tkeep is None or tkeep(V[f])):
                for k in range(1, len(f) - 1):
                    tris.append([f[0], f[k], f[k + 1]])
        self.V, self.T = V, np.array(tris)
        A, B, C = V[self.T[:, 0]], V[self.T[:, 1]], V[self.T[:, 2]]
        self.A, self.B, self.C = A, B, C
        hp = V[np.unique(self.T)]
        band = hp[(hp[:, 1] > 7.6) & (hp[:, 1] < 7.9)]
        self.hc = np.array([0.0, 7.75, 0.5 * (band[:, 2].min() + band[:, 2].max())]) if hc is None else np.array(hc, float)
        # skin radius by direction: the farthest hit from the head's centre
        self.step, self.elmin = step, elmin
        self.TH = np.arange(-180, 180 + step / 2, step)
        self.EL = np.arange(elmin, 90 + step / 2, step)
        D = dirs(*np.meshgrid(self.TH, self.EL, indexing='ij')).reshape(-1, 3)
        e1, e2 = B - A, C - A
        R = np.zeros(len(D))
        for s in range(0, len(D), 400):
            d = D[s:s + 400][:, None, :]
            p = np.cross(d, e2[None]); det = (e1[None] * p).sum(-1)
            inv = 1 / np.where(np.abs(det) < 1e-9, np.nan, det)
            tv = self.hc[None, None] - A[None]
            u = (tv * p).sum(-1) * inv
            q = np.cross(tv, e1[None]); v = (d * q).sum(-1) * inv
            t = (e2[None] * q).sum(-1) * inv
            ok = (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0)
            R[s:s + 400] = np.where(ok, t, 0).max(1)
        R = R.reshape(len(self.TH), len(self.EL))
        for _ in range(4):
            m = R == 0
            if not m.any():
                break
            Rp = np.pad(R, 1, mode='edge')
            nb = np.stack([Rp[:-2, 1:-1], Rp[2:, 1:-1], Rp[1:-1, :-2], Rp[1:-1, 2:]])
            cnt = (nb > 0).sum(0)
            R = np.where(m & (cnt > 0), nb.sum(0) / np.maximum(cnt, 1), R)
        if (R == 0).any():
            R = np.where(R == 0, R[R > 0].mean(), R)
        self.R = R
        vn = np.zeros_like(V)
        for t in self.T:
            vn[t] += np.cross(V[t[1]] - V[t[0]], V[t[2]] - V[t[0]])
        self.vn = unit(vn)

    def skin(self, d):
        th, el = ang(d)
        th, el = np.nan_to_num(th), np.nan_to_num(el)
        i = np.clip((th + 180) / self.step, 0, len(self.TH) - 1.001)
        j = np.clip((el - self.elmin) / self.step, 0, len(self.EL) - 1.001)
        i0, j0 = i.astype(int), j.astype(int)
        fi, fj = i - i0, j - j0
        R = self.R
        return (R[i0, j0] * (1 - fi) * (1 - fj) + R[i0 + 1, j0] * fi * (1 - fj)
                + R[i0, j0 + 1] * (1 - fi) * fj + R[i0 + 1, j0 + 1] * fi * fj)

    def at(self, d, h):
        """The point over direction d at height h above the skin."""
        return self.hc + d * (self.skin(d) + h)[..., None]

    def height(self, p):
        d = p - self.hc
        r = np.linalg.norm(d, axis=-1)
        return r - self.skin(d / r[..., None])


def golden(n, rng, jitter=0.006):
    k = np.arange(n); y = 1 - 2 * (k + 0.5) / n; r = np.sqrt(1 - y * y); a = k * 2.399963
    P = np.stack([r * np.cos(a), y, r * np.sin(a)], -1)
    return unit(P + rng.normal(0, jitter, P.shape))


def roots(n, margin, rng, at_least=0.5):
    P = golden(n * 4, rng)
    P = P[margin(*ang(P)) > at_least]
    return P[rng.permutation(len(P))[:n]]


def grow(head, P, L, steps, flow, lift):
    """Strands from root directions P, length L each, along the flow, at
    height lift(s, d, P) over the skin (s = 0..1 along the strand)."""
    S = np.zeros((len(P), steps + 1, 3))
    d = P.copy()
    S[:, 0] = head.at(d, lift(0.0, d, P))
    pos = S[:, 0].copy()
    for s in range(1, steps + 1):
        t = flow(d, *ang(d))
        pos = pos + t * (L / steps)[:, None]
        d = unit(pos - head.hc)
        pos = head.at(d, lift(s / steps, d, P))
        S[:, s] = pos
    return S


def wisps(S, K, rng, iters=12):
    feat = np.concatenate([S[:, 0], S[:, -1] * 0.6], 1)
    cent = feat[rng.choice(len(feat), K, replace=False)]
    for _ in range(iters):
        lab = np.empty(len(feat), int)
        for s0 in range(0, len(feat), 3000):
            lab[s0:s0 + 3000] = ((feat[s0:s0 + 3000, None] - cent[None]) ** 2).sum(-1).argmin(1)
        for j in range(K):
            m = lab == j
            if m.any():
                cent[j] = feat[m].mean(0)
    return lab


def cards_from_wisps(head, S, lab, K, rng, width, taper, tile, clump=(0.15, 0.7), wmin=0.12, wmax=0.3, arch=0.005):
    """One card per wisp along its centre line, every column at the centre
    line's height over the skin. width: factor on the wisp's spread; taper:
    end width relative to the root (or a function of the root direction);
    tile: function(root direction) -> atlas tile."""
    steps = S.shape[1] - 1
    cards, tiles = [], []
    for j in range(K):
        m = lab == j
        if m.sum() < 6:
            continue
        Sj = S[m]
        c = Sj.mean(0)
        cl = np.linspace(clump[0], clump[1], steps + 1)[None, :, None]
        Sj = Sj + (c[None] - Sj) * cl
        n0 = unit(c - head.hc)
        tang = unit(np.gradient(c, axis=0))
        b = unit(np.cross(tang, n0))
        lat = ((Sj - c[None]) * b[None]).sum(-1)
        tp = taper(n0[0]) if callable(taper) else taper
        w = np.clip(width * np.sqrt((lat ** 2).mean(0)), wmin, wmax) * np.linspace(1.0, tp, steps + 1)
        hcen = np.maximum(np.linalg.norm(c - head.hc, axis=-1) - head.skin(n0), 0.012)
        def put(q, extra):
            dd = unit(q - head.hc)
            return head.hc + dd * (head.skin(dd) + hcen + extra)[:, None]
        cards.append((put(c - b * w[:, None] / 2, -0.002), put(c, arch), put(c + b * w[:, None] / 2, -0.002)))
        tiles.append(tile(n0[0]))
    return cards, tiles


def write_cards(head, out, name, cards, tiles, ntiles=8, anchors=None, vstart=None):
    verts, tri_list, tri_uv = [], [], []
    for ci, (lft, mid, rgt) in enumerate(cards):
        steps = len(lft) - 1
        o = len(verts)
        for s in range(steps + 1):
            verts += [lft[s], mid[s], rgt[s]]
        u0 = tiles[ci] / ntiles
        tw = 1.0 / ntiles
        us = [u0 + 0.004, u0 + tw / 2, u0 + tw - 0.004]
        v0 = 0.0 if vstart is None else vstart[ci]
        for s in range(steps):
            # a short card shows only the tip end of its tile (strands keep their shape)
            vA, vB = v0 + (1 - v0) * s / steps, v0 + (1 - v0) * (s + 1) / steps
            for (i, jj) in [(0, 1), (1, 2)]:
                a0, a1 = o + 3 * s + i, o + 3 * s + jj
                b0, b1 = o + 3 * (s + 1) + i, o + 3 * (s + 1) + jj
                # counter-clockwise seen from outside (left lies at -b, b = tangent x normal)
                tri_list.append([a0, a1, b0]); tri_uv.append([(us[i], vA), (us[jj], vA), (us[i], vB)])
                tri_list.append([a1, b1, b0]); tri_uv.append([(us[jj], vA), (us[jj], vB), (us[i], vB)])
    verts = np.array(verts).reshape(-1, 3)
    anc = verts if anchors is None else np.repeat(np.concatenate(anchors), 3, axis=0)
    A, B, C, T = head.A, head.B, head.C, head.T
    cen = (A + B + C) / 3
    bind = []
    for p, pa in zip(verts, anc):
        best = None
        for ti in ((cen - pa) ** 2).sum(1).argsort()[:12]:
            a, b_, c_ = A[ti], B[ti], C[ti]
            nrm = unit(np.cross(b_ - a, c_ - a))
            q = pa - nrm * ((pa - a) @ nrm)
            v0, v1, v2 = b_ - a, c_ - a, q - a
            d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1
            den = d00 * d11 - d01 * d01
            wv = (d11 * d20 - d01 * d21) / den; ww = (d00 * d21 - d01 * d20) / den
            bc = np.clip([1 - wv - ww, wv, ww], 0, 1); bc /= bc.sum()
            on = bc[0] * a + bc[1] * b_ + bc[2] * c_
            dist = np.linalg.norm(pa - on)
            if best is None or dist < best[0]:
                best = (dist, ti, bc, p - on)
        _, ti, bc, off = best
        bind.append(([head.remap[x] for x in T[ti]], bc, off))
    with open(os.path.join(out, name + '.txt'), 'w') as f:
        f.write(f'{len(verts)} {len(tri_list)}\n')
        for r, w_, o in bind:
            f.write(' '.join(map(str, r)) + ' ' + ' '.join(f'{x:.6f}' for x in list(w_) + list(o)) + '\n')
        for t, uv in zip(tri_list, tri_uv):
            # v as in OBJ files (up from the bottom): the reader flips it
            f.write(' '.join(map(str, t)) + ' ' + ' '.join(f'{u:.6f} {1 - v:.6f}' for u, v in uv) + '\n')
    with open(os.path.join(out, name + '_cards.obj'), 'w') as f:
        for p in verts:
            f.write('v %.5f %.5f %.5f\n' % tuple(p))
        k = 1
        for t, uv in zip(tri_list, tri_uv):
            for u, v in uv:
                f.write('vt %.5f %.5f\n' % (u, 1 - v))
            f.write('f %d/%d %d/%d %d/%d\n' % (t[0] + 1, k, t[1] + 1, k + 1, t[2] + 1, k + 2)); k += 3
    return len(verts), len(tri_list)


def write_head_obj(head, path):
    with open(path, 'w') as f:
        for p in head.V:
            f.write('v %.5f %.5f %.5f\n' % tuple(p))
        for t in head.T:
            f.write('f %d %d %d\n' % tuple(t + 1))


def paint_cap(head, out, name, margin, flow, rng, Lc, shade, n=60000, steps=10, curl=0.0, curl_len=0.06,
              base=0.8, base_ramp=7.0, mean=0.6, tex=2048, pick=None, ymin=6.6, uvc=None):
    """The cap: scalp triangles lifted 0.008, textured with n painted fine
    hairs along the flow (length Lc(th, el) each, brightness shade(dirs)),
    over a darker base inside the margin. curl: sideways swing (radians of
    head angle) of curly hairs, period curl_len."""
    V, T, hc = head.V, head.T, head.hc
    cdir = unit(V - hc)
    cm = margin(*ang(cdir))
    tsel = [t for t in T if cm[t].max() > -7 and V[t][:, 1].min() > ymin]
    cv = sorted({i for t in tsel for i in t}); cmap = {o: k for k, o in enumerate(cv)}
    ax_ = np.array([0, 1.0, 0]) if uvc is None else unit(np.array(uvc, float))
    e1 = unit(np.cross(np.array([0, 0, 1.0]) if abs(ax_[2]) < 0.9 else np.array([1.0, 0, 0]), ax_)) if uvc is not None else np.array([1.0, 0, 0])
    e2 = np.cross(e1, ax_) if uvc is not None else np.array([0, 0, 1.0])
    def stereo(d):
        dy = d @ ax_
        return np.stack([(d @ e1) / (1 + dy), (d @ e2) / (1 + dy)], -1)
    st = stereo(cdir[cv]); QC = 0.5 * (st.min(0) + st.max(0)); RS = 0.5 * (st.max(0) - st.min(0)).max() * 1.03
    def uvof(d):
        return 0.5 + (stereo(d) - QC) / (2 * RS)
    cuv = uvof(cdir)
    Q = golden(n * 3, rng, 0.004)
    qm = margin(*ang(Q)); Q = Q[qm > -2.0]; Q = Q[rng.permutation(len(Q))[:n]]
    qt, qe = ang(Q)
    L = Lc(qt, qe) * (0.7 + 0.5 * rng.random(len(Q)))
    shd_q = shade(Q) * rng.uniform(0.85, 1.1, len(Q))
    wq = np.clip((margin(qt, qe) + 2.0) / 4.0, 0.2, 1.0)
    ph = rng.uniform(0, 2 * np.pi, len(Q))
    QP = np.zeros((len(Q), steps + 1, 3)); dq = Q.copy(); QP[:, 0] = dq
    run = np.zeros(len(Q))
    for s1 in range(1, steps + 1):
        t_ = flow(dq, *ang(dq))
        stp = L / steps / head.skin(dq)
        if curl:
            # curly: the hair swings from side to side, period curl_len
            side = unit(np.cross(dq, t_))
            run += L / steps
            al = curl * np.sin(2 * np.pi * run / curl_len + ph)
            t_ = np.cos(al)[:, None] * t_ + np.sin(al)[:, None] * side
        dq = unit(dq + t_ * stp[:, None])
        QP[:, s1] = dq
    px = uvof(QP) * tex
    Aacc = np.zeros((tex, tex)); Cacc = np.zeros((tex, tex))
    for s1 in range(steps):
        p0, p1 = px[:, s1], px[:, s1 + 1]
        ln = np.linalg.norm(p1 - p0, axis=-1)
        ns = np.maximum(1, np.ceil(ln / 0.5).astype(int))
        idx = np.repeat(np.arange(len(Q)), ns)
        off = np.arange(ns.sum()) - np.repeat(np.cumsum(ns) - ns, ns)
        f = (off + 0.5) / ns[idx]
        pts = p0[idx] + (p1 - p0)[idx] * f[:, None]
        fl = (s1 + f) / steps
        wgt = 0.5 * wq[idx] * np.minimum(1, fl * 6) * (1 - fl ** 3)
        shd = shd_q[idx] * (0.7 + 0.45 * np.sin(np.pi * np.minimum(fl * 1.4, 1)))
        x0 = np.floor(pts[:, 0] - 0.5).astype(int); y0 = np.floor(pts[:, 1] - 0.5).astype(int)
        fx = pts[:, 0] - 0.5 - x0; fy = pts[:, 1] - 0.5 - y0
        for dx, dy, ww in [(0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)]:
            xi = np.clip(x0 + dx, 0, tex - 1); yi = np.clip(y0 + dy, 0, tex - 1)
            np.add.at(Aacc, (yi, xi), wgt * ww)
            np.add.at(Cacc, (yi, xi), wgt * ww * shd)
    a_s = 1 - np.exp(-1.4 * Aacc)
    c_s = Cacc / np.maximum(Aacc, 1e-6)
    gy, gx = np.mgrid[0:tex, 0:tex]
    qu = ((gx + 0.5) / tex - 0.5) * 2 * RS + QC[0]; qv = ((gy + 0.5) / tex - 0.5) * 2 * RS + QC[1]
    rr2 = qu * qu + qv * qv
    gd = (qu * 2 / (1 + rr2))[..., None] * e1 + ((1 - rr2) / (1 + rr2))[..., None] * ax_ + (qv * 2 / (1 + rr2))[..., None] * e2
    a_b = base * np.clip((margin(*ang(gd)) - 1.0) / base_ramp, 0, 1) ** 1.5
    c_b = 0.42
    a = 1 - (1 - a_s) * (1 - a_b)
    c = (c_s * a_s + c_b * a_b * (1 - a_s)) / np.maximum(a, 1e-6)
    c = c / max(1e-6, (c * a).sum() / max(a.sum(), 1e-6)) * mean
    img = np.dstack([np.clip(c, 0, 1)] * 3 + [np.clip(a, 0, 1)])
    Image.fromarray((img * 255).astype(np.uint8), 'RGBA').save(os.path.join(out, name + '_cap.png'))
    with open(os.path.join(out, name + '_cap.txt'), 'w') as f:
        f.write(f'{len(cv)} {len(tsel)}\n')
        for o in cv:
            nn = head.vn[o] * 0.008
            f.write(f'{head.remap[o]} {head.remap[o]} {head.remap[o]} 1 0 0 {nn[0]:.6f} {nn[1]:.6f} {nn[2]:.6f}\n')
        for t in tsel:
            f.write(' '.join(str(cmap[i]) for i in t) + ' ' + ' '.join(f'{cuv[i][0]:.6f} {1 - cuv[i][1]:.6f}' for i in t) + '\n')
    with open(os.path.join(out, name + '_capview.obj'), 'w') as f:
        for o in cv:
            f.write('v %.5f %.5f %.5f\n' % tuple(V[o] + head.vn[o] * 0.008))
        for o in cv:
            f.write('vt %.5f %.5f\n' % (cuv[o][0], 1 - cuv[o][1]))
        for t in tsel:
            f.write('f ' + ' '.join(f'{cmap[i]+1}/{cmap[i]+1}' for i in t) + '\n')
    # the scalp tint under it, per head.bin vertex
    mask = np.zeros(len(head.used))
    for o, k in head.remap.items():
        if V[o][1] < ymin:
            continue
        mask[k] = np.clip((cm[o] + 1.5) / 4, 0, 1)
    np.savetxt(os.path.join(out, name + '_scalp.txt'), mask, fmt='%.3f')
    return float((a > 0.5).mean())


def make_shade(head, S, lab, K, rng):
    roots_ = unit(S[:, 0] - head.hc)
    wb = rng.uniform(0.62, 1.0, K)
    def shade(Q):
        near = np.empty(len(Q), int)
        for s0 in range(0, len(Q), 4000):
            near[s0:s0 + 4000] = (Q[s0:s0 + 4000] @ roots_.T).argmax(1)
        return wb[lab[near]]
    return shade
