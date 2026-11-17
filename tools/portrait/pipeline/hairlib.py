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


def farthest(hc, A, B, C, D):
    """For each direction of D the farthest place from hc where it meets one of the triangles A, B, C; 0 where it
    meets none."""
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
        R[s:s + 400] = np.where(ok, t, 0).max(1)
    return R


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
        R = farthest(self.hc, A, B, C, D).reshape(len(self.TH), len(self.EL))
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

    def covered(self, reach, soft, where=None, trend=0.0):
        """The skin as hair lying over it takes it: by direction the farthest skin within `reach` degrees, then
        evened out over `soft` degrees. Hair that follows the skin itself stands off at an ear as a wing, and
        dips in behind it; over this it passes the ear in one bow. `where(th, el)`: how much of that is taken at
        a direction (0: the skin itself, 1: all of it), everywhere if left out. `trend`: the farthest skin is
        looked for in what the skin stands off its own mean over so many degrees, not in the skin's distance
        itself: from the head's middle the neck is further away the lower one looks, and "the farthest within
        reach" lifts hair off the whole neck by what the neck gains over `reach` degrees (hair that ends above
        the neck needs none of this: 0)."""
        k = max(1, int(round(reach / self.step)))
        R = self.R[:-1]                                   # round the head: the last column is the first again
        def even(a, over):
            g = np.exp(-0.5 * (np.arange(-int(3 * over / self.step), int(3 * over / self.step) + 1) * self.step / max(over, 1e-6)) ** 2); g /= g.sum()
            n = len(g) // 2
            a = np.stack([np.convolve(np.concatenate([c[-n:], c, c[:n]]), g, 'valid') for c in a.T], 1)
            return np.stack([np.convolve(np.pad(r, n, mode='edge'), g, 'valid') for r in a])
        skin = R
        low = even(R, trend) if trend > 0 else 0 * R
        R = R - low
        far = R.copy()
        for i in range(-k, k + 1):
            for j in range(-k, k + 1):
                if i * i + j * j <= k * k:
                    sh = np.roll(R, i, axis=0)
                    sh = np.pad(sh, ((0, 0), (k, k)), mode='edge')[:, k + j:k + j + R.shape[1]]
                    far = np.maximum(far, sh)
        g = np.exp(-0.5 * (np.arange(-3 * k, 3 * k + 1) * self.step / max(soft, 1e-6)) ** 2); g /= g.sum()
        n = len(g) // 2
        far = np.stack([np.convolve(np.concatenate([c[-n:], c, c[:n]]), g, 'valid') for c in far.T], 1)
        far = np.stack([np.convolve(np.pad(r, n, mode='edge'), g, 'valid') for r in far])
        far = np.maximum(far, R) + low
        R = skin
        if where is not None:
            far = R + (far - R) * where(*np.meshgrid(self.TH[:-1], self.EL, indexing='ij'))
        other = Head.__new__(Head)
        other.__dict__.update(self.__dict__)
        other.R = np.concatenate([far, far[:1]])
        return other

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


def cards_from_wisps(head, S, lab, K, rng, width, taper, tile, clump=(0.15, 0.7), wmin=0.12, wmax=0.3, arch=0.005, wave=None):
    """One card per wisp along its centre line, every column at the centre
    line's height over the skin. width: factor on the wisp's spread; taper:
    end width relative to the root (or a function of the root direction);
    tile: function(root direction) -> atlas tile. wave: None, or (to the
    side, off the head, length of a wave): the wisp swings to the side and
    lifts off the head along its run, each wisp with its own phase (wavy
    hair, whose outline is not the head's)."""
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
        if wave is not None:
            run = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(c, axis=0), axis=1))])
            ramp = np.clip(run / (0.5 * wave[2]), 0, 1)
            ph = rng.uniform(0, 2 * np.pi, 2)
            c = c + b * (wave[0] * ramp * np.sin(2 * np.pi * run / wave[2] + ph[0]))[:, None]
            hcen = hcen + wave[1] * ramp * (0.5 + 0.5 * np.sin(2 * np.pi * run / wave[2] + ph[1]))
        def put(q, extra):
            dd = unit(q - head.hc)
            return head.hc + dd * (head.skin(dd) + hcen + extra)[:, None]
        cards.append((put(c - b * w[:, None] / 2, -0.002), put(c, arch), put(c + b * w[:, None] / 2, -0.002)))
        tiles.append(tile(n0[0]))
    return cards, tiles


LOCK_BODY = 0.75     # the share of a lock's image that is its length; the rest is its frayed end (lock_tex.py)
LOCK_END = 0.985     # how far down the image a lock's very end lies: at the lower edge the image's top shows again


def locks_from_wisps(head, S, lab, K, rng, wmin, wmax, flat, layer, m=5, tip=(0.3, 0.25, 0.8, 0.4), root=(0.15, 0.2, 0.7, 0.3), jitter=0.012, wave=None, vlen=1.0, ring=0.14, clump=(0.12, 0.65), over=None, spread=4.0, back=0.0, vary=None):
    """Locks: one arched band per wisp along its centre line: in section the upper half of a lens, as broad as the
    wisp (`spread` times the mean distance of its strands from its middle, between `wmin` and `wmax`) and `flat`
    times as high, `m` corners from flank to flank. Its image's length part lies back and forth
    along the lock (once back and forth over about two `vlen`), its frayed part over the lock's two ends: the
    beginning (`root`: the share of the lock's length, at most so long, and how much of its breadth and of its
    height it has at the very beginning) and the end (`tip`, the same four; a fifth, 0: the end is drawn with the
    length's part, whole to its last ring: hair that is gathered there, not cut). A ring of corners at every place
    where the image turns, and between them one every `ring` at most. A lock lies the higher over the skin the
    further it has run from its root (`layer`: lowest, highest, the run over which it rises; a fourth number: how
    much higher still for every unit it has run, for long hair that is drawn to one place: there the locks that
    have come furthest lie on top, and at one height they cut through each other in jagged lines), as hair rooted
    higher up lies on the hair rooted below it; each lock a little higher or lower by `jitter`. `wave` as for
    cards. `over`: the skin the locks lie over, if not the head's own (`Head.covered`). `back`: a lock begins so
    far before the middle of its strands' roots, against the way it sets off (the roots of a wisp lie on a patch
    of skin as broad as the wisp, and the band begins in that patch's middle: along a parting the locks of either
    side began a finger's breadth off it, a bare strip between two rows of ends). `vary` (three numbers and a
    seed): each lock's end by chance longer or shorter than `tip` says (the share of that length), broader or
    narrower (of the lock's breadth), and the lock itself shorter than its strands by up to so much. Returns bands
    for write_tubes(closed=False)."""
    over = head if over is None else over
    steps = S.shape[1] - 1
    turn = np.linspace(-np.pi / 2, np.pi / 2, m)
    u_round = np.linspace(0, 1, m)
    smooth = lambda g: g * g * (3 - 2 * g)
    bands = []
    tip0 = tuple(tip)
    for j in range(K):
        mk = lab == j
        if mk.sum() < 6:
            continue
        Sj = S[mk]
        c0 = Sj.mean(0)
        cl = np.linspace(clump[0], clump[1], steps + 1)[None, :, None]
        Sj = Sj + (c0[None] - Sj) * cl
        b0 = unit(np.cross(unit(np.gradient(c0, axis=0)), unit(c0 - head.hc)))
        w0 = np.clip(spread * np.sqrt((((Sj - c0[None]) * b0[None]).sum(-1) ** 2).mean(0)), wmin, wmax)
        if back > 0:
            c0 = np.concatenate([c0[:1] - unit(c0[1] - c0[0])[None] * back, c0])
            w0 = np.concatenate([w0[:1], w0])
        run0 = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(c0, axis=0), axis=1))])
        total = max(run0[-1], 1e-6)
        tb = tip[2]
        if vary is not None:
            # no two locks end alike: this one's end is longer or shorter and broader or narrower than the style's,
            # and the lock itself ends a little before its strands do (a line of hair cut at one height is many
            # locks deep, and the lowest ends make its edge: all of one length, that edge is drawn with a ruler)
            rv = np.random.default_rng(vary[3] + j)
            tip = tip0[:1] + (tip0[1] * (1 + vary[0] * rv.uniform(-1, 1)),) + tip0[2:]
            tb = float(np.clip(tip0[2] + vary[1] * rv.uniform(-1, 1), 0.05, 1))
            less = min(vary[2] * rv.random(), 0.4 * total)
            if less > 0:
                keep = run0 <= total - less
                last = np.array([np.interp(total - less, run0, c0[:, i]) for i in range(3)])
                c0 = np.concatenate([c0[keep], last[None]]); w0 = np.concatenate([w0[keep], [np.interp(total - less, run0, w0)]])
                run0 = np.concatenate([run0[keep], [total - less]]); total = total - less
        rl, el = min(root[0] * total, root[1]), min(tip[0] * total, tip[1])
        body = total - rl - el
        half = max(1, int(round(body / (2 * vlen))))                 # how often the image goes back and forth
        per = int(np.ceil(body / (2 * half) / ring))                # rings between two turns
        run = np.concatenate([[0], rl + body * np.arange(2 * half * per + 1) / (2 * half * per), total - el + el * np.arange(1, 4) / 3])
        c = np.stack([np.interp(run, run0, c0[:, i]) for i in range(3)], -1)
        w = np.interp(run, run0, w0)
        n0 = unit(c - head.hc)
        b = unit(np.cross(unit(np.gradient(c, axis=0)), n0))
        r = np.clip(run / rl, 0, 1)                                 # 0..1 along the beginning
        e = np.clip((run - (total - el)) / el, 0, 1)                # 0..1 along the end
        h = layer[0] + (layer[1] - layer[0]) * (1 - np.exp(-run / layer[2])) + rng.uniform(-jitter, jitter)
        if len(layer) > 3:
            h = h + layer[3] * run
        if wave is not None:
            ramp = np.clip(run / (0.5 * wave[2]), 0, 1)
            ph = rng.uniform(0, 2 * np.pi, 2)
            c = c + b * (wave[0] * ramp * np.sin(2 * np.pi * run / wave[2] + ph[0]))[:, None]
            h = h + wave[1] * ramp * (0.5 + 0.5 * np.sin(2 * np.pi * run / wave[2] + ph[1]))
        hw = 0.5 * w * (root[2] + (1 - root[2]) * smooth(r)) * (1 - (1 - tb) * smooth(e))
        ht = 0.5 * flat * w * (root[3] + (1 - root[3]) * smooth(r)) * (1 - (1 - tip[3]) * smooth(e))
        h = np.maximum(h, ht + 0.006)                               # its flanks stay off the skin
        q = c[:, None, :] + b[:, None, :] * (hw[:, None] * np.sin(turn)[None, :])[..., None]
        dd = unit(q - head.hc)
        rings = head.hc + dd * (over.skin(dd) + h[:, None] + ht[:, None] * (2 * np.cos(turn)[None, :] - 1))[..., None]
        x = 1 + (run - rl) * 2 * half / body
        # the image's length part is laid from its lower end (where the frayed part begins) up and back: all of it
        # on a lock long enough. On a short lock that would be the whole image pressed into a finger's breadth
        # (hairs that sway over a hand's length turn into a dark net of crossing lines: the block at the temple
        # of a short cut, the scales of a bald head's horseshoe): there only as much of the image as the lock is
        # long, and turned round gently, so that no hair has a kink where the image turns
        far = np.abs(x % 2 - 1)
        reach = min(1.0, body / (2 * half) / vlen)
        if reach < 1:
            far = reach * np.sin(0.5 * np.pi * far) ** 2
        along = LOCK_BODY * (1 - far)
        frayed = LOCK_BODY + (LOCK_END - LOCK_BODY) * e if len(tip) < 5 or tip[4] else along
        v = np.where(run < rl, LOCK_END - (LOCK_END - LOCK_BODY) * r, np.where(run > total - el, frayed, along))
        uv = np.stack(np.broadcast_arrays(u_round[None, :] + rng.random(), v[:, None]), -1)
        cc = head.hc + n0 * (over.skin(n0) + h)[:, None]
        bands.append((rings, uv, cc))
    return bands


def bind_points(head, verts, anc):
    """Binds points to the head: each to the triangle nearest to its anchor (itself, or a point given for it), as
    the triangle's three corners, their weights at the anchor's foot on it, and the way from that foot to the point."""
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
    return bind


def write_bound(out, name, bind, tri_list, tri_uv, even=None):
    """The file the builder reads: the number of points and of triangles (and for tubes, if given, how often the
    builder evens out their way with the body along them), a line for each point (three corners of the head,
    three weights, the way from there), a line for each triangle (three points, three places in the image)."""
    with open(os.path.join(out, name + '.txt'), 'w') as f:
        f.write(f'{len(bind)} {len(tri_list)}' + ('' if even is None else f' {even}') + '\n')
        for r, w_, o in bind:
            f.write(' '.join(map(str, r)) + ' ' + ' '.join(f'{x:.6f}' for x in list(w_) + list(o)) + '\n')
        for t, uv in zip(tri_list, tri_uv):
            # v as in OBJ files (up from the bottom): the reader flips it
            f.write(' '.join(map(str, t)) + ' ' + ' '.join(f'{u:.6f} {1 - v:.6f}' for u, v in uv) + '\n')


def write_cards(head, out, name, cards, tiles, ntiles=8, anchors=None, vstart=None, vend=1.0):
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
            # a short card shows only the tip end of its tile (strands keep their shape); a card cut short ends
            # at `vend` of it, before the strands thin out into single tips
            vA, vB = v0 + (vend - v0) * s / steps, v0 + (vend - v0) * (s + 1) / steps
            for (i, jj) in [(0, 1), (1, 2)]:
                a0, a1 = o + 3 * s + i, o + 3 * s + jj
                b0, b1 = o + 3 * (s + 1) + i, o + 3 * (s + 1) + jj
                # counter-clockwise seen from outside (left lies at -b, b = tangent x normal)
                tri_list.append([a0, a1, b0]); tri_uv.append([(us[i], vA), (us[jj], vA), (us[i], vB)])
                tri_list.append([a1, b1, b0]); tri_uv.append([(us[jj], vA), (us[jj], vB), (us[i], vB)])
    verts = np.array(verts).reshape(-1, 3)
    anc = verts if anchors is None else np.repeat(np.concatenate(anchors), 3, axis=0)
    bind = bind_points(head, verts, anc)
    write_bound(out, name, bind, tri_list, tri_uv)
    with open(os.path.join(out, name + '_cards.obj'), 'w') as f:
        for p in verts:
            f.write('v %.5f %.5f %.5f\n' % tuple(p))
        k = 1
        for t, uv in zip(tri_list, tri_uv):
            for u, v in uv:
                f.write('vt %.5f %.5f\n' % (u, 1 - v))
            f.write('f %d/%d %d/%d %d/%d\n' % (t[0] + 1, k, t[1] + 1, k + 1, t[2] + 1, k + 2)); k += 3
    return len(verts), len(tri_list)


def write_tubes(head, out, name, tubes, even=None, closed=True):
    """Round strands (a plait's): each tube is its rings (n rings of m corners, closed round, counted so that the
    corners go round the strand's direction as the fingers of the right hand go round its thumb), the place in the
    image of each corner (n rings of m + 1: the first corner again at the end, so that the image may have a seam
    there), and for each ring the point it is bound to the body by (a whole ring moves with one triangle and keeps
    its form). The triangles are counter-clockwise seen from outside; the builder reads the surface's direction
    from them, so that each strand is lit as the round thing it is. `even`: how often the builder evens out the
    tubes' way with the body along them (a plait, which hangs from jaw to chest, by the builder's own count; locks
    on the head a few times). `closed=False`: bands instead of tubes, the rings not closed round (m corners
    from flank to flank, and m places in the image): the builder takes a surface that is not closed as one seen
    from both sides."""
    verts, anc, tri_list, tri_uv = [], [], [], []
    for rings, uv, anchors in tubes:
        n, m = rings.shape[:2]
        o = len(verts)
        verts += list(rings.reshape(-1, 3))
        anc += list(np.repeat(anchors, m, axis=0))
        for s in range(n - 1):
            for j in range(m if closed else m - 1):
                k = (j + 1) % m
                a, b, c, d = o + s * m + j, o + s * m + k, o + (s + 1) * m + j, o + (s + 1) * m + k
                ua, ub, uc, ud = uv[s, j], uv[s, j + 1], uv[s + 1, j], uv[s + 1, j + 1]
                tri_list.append([a, b, c]); tri_uv.append([tuple(ua), tuple(ub), tuple(uc)])
                tri_list.append([b, d, c]); tri_uv.append([tuple(ub), tuple(ud), tuple(uc)])
    verts = np.array(verts).reshape(-1, 3)
    write_bound(out, name, bind_points(head, verts, np.array(anc).reshape(-1, 3)), tri_list, tri_uv, even)
    with open(os.path.join(out, name + '.obj'), 'w') as f:
        for p in verts:
            f.write('v %.5f %.5f %.5f\n' % tuple(p))
        for t in tri_list:
            f.write('f %d %d %d\n' % (t[0] + 1, t[1] + 1, t[2] + 1))
    return len(verts), len(tri_list)


def write_locks(head, bind, out, name, S, key, wave=None, over='8,6,35,30', tip='0.3,0.25,0.8,0.4', root='0.15,0.2,0.7,0.3', back='0', trend='0', jitter='0.012', vary='', seed=87, form=None, label='', ring='0.14', m='5'):
    """Locks (round 87): the grown strands `S` gathered into wisps, each an arched band that is solid (`hairlib.py`
    `locks_from_wisps`), written as `name_locks.txt` in `out`, bound to the head `bind`; `head`: the head they are
    laid over (its centre and skin). The switches are read under the style's own name `key` (`BOB`, `PLAIT`,
    `CROP` for a beard):
    `<key>_LOCKS`: how many, their least and greatest breadth, their height as a share of the breadth, their height
    over the skin at the root and far from it, and the run over which it rises (base units, 0.1 = 1 cm), an
    eighth number: how much higher still for every unit it has run (`locks_from_wisps(layer=)`);
    `<key>_LOCK_JITTER`: how much higher or lower a lock lies than the next, by chance;
    `<key>_LOCK_OVER`: the locks pass the ears in one bow: how far round a place the skin is looked at for that,
    over how many degrees it is evened out, and from how many degrees off the face's middle over how many more (in
    front the locks keep to the forehead: over a bow that takes in the brows a fringe hangs lower); a fifth and
    sixth number: the height in degrees up to which nothing of the bow is taken, and from which all of it (hair
    that goes on down the neck lies on the neck: over the bow from skull to shoulder it stands off as a sheet);
    `<key>_LOCK_TREND`: the bow is taken over what the skin stands off its own mean over so many degrees
    (`Head.covered(trend=)`: for hair that goes on down to the neck);
    `<key>_LOCK_TIP`, `<key>_LOCK_ROOT`: a lock's end and its beginning as a share of its length and at most so
    long, and its breadth and thickness there against its middle; `<key>_LOCK_BACK`: how far before its strands'
    roots a lock begins (`locks_from_wisps(back=)`: for a parting); `<key>_LOCK_VARY`: no two locks end alike:
    by how much of itself an end is longer or shorter than `_LOCK_TIP` says, by how much of the lock's breadth it
    is broader or narrower, and by how much at most the lock ends before its strands do (`locks_from_wisps(vary=)`;
    nothing: all ends alike); `<key>_LOCK_M`: corners across a band;
    `<key>_LOCK_RING`: from ring to ring; `<key>_LOCK_EVEN`: how often the builder evens out the locks' way with a
    head along them (a few times, so that a lock stays the head's form: evened out to the end it would move as a
    stiff piece). The wisps are drawn with random numbers of their own (`seed`): the cards and the painted layer
    of a style stay as they were. `form`: the skin the locks lie over, given whole (a beard's own form:
    `<key>_LOCK_OVER` is not read then). All PLACEHOLDER by eye."""
    get = lambda name, default: os.environ.get(key + name, default)
    LK, LW0, LW1, LFLAT, *LAYER = [float(t) for t in os.environ[key + '_LOCKS'].split(',')]
    rl = np.random.default_rng(seed)
    lab2 = wisps(S, int(LK), rl)
    cover = [float(t) for t in get('_LOCK_OVER', over).split(',')]
    def beside(th, el):
        g = np.clip((np.abs(th) - cover[2]) / cover[3], 0, 1)
        g = g * g * (3 - 2 * g)
        if len(cover) > 4:
            e = np.clip((el - cover[4]) / (cover[5] - cover[4]), 0, 1)
            g = g * e * e * (3 - 2 * e)
        return g
    fours = lambda name, default: tuple(float(t) for t in get(name, default).split(','))
    VARY = (fours('_LOCK_VARY', vary) + (0.0, 0.0, 0.0))[:3] + (seed * 1000,) if get('_LOCK_VARY', vary) else None
    bands = locks_from_wisps(head, S, lab2, int(LK), rl, LW0, LW1, LFLAT, tuple(LAYER), m=int(get('_LOCK_M', m)), jitter=float(get('_LOCK_JITTER', jitter)),
                             tip=fours('_LOCK_TIP', tip), root=fours('_LOCK_ROOT', root),
                             wave=wave, ring=float(get('_LOCK_RING', ring)), back=float(get('_LOCK_BACK', back)), vary=VARY,
                             over=form if form is not None else head.covered(cover[0], cover[1], beside, trend=float(get('_LOCK_TREND', trend))) if cover[0] > 0 else None)
    nvr, ntr = write_tubes(bind, out, name + '_locks', bands, even=int(get('_LOCK_EVEN', '3')), closed=False)
    print(label, 'locks', len(bands), 'corners', nvr, 'tris', ntr)
    return bands


def write_head_obj(head, path):
    with open(path, 'w') as f:
        for p in head.V:
            f.write('v %.5f %.5f %.5f\n' % tuple(p))
        for t in head.T:
            f.write('f %d %d %d\n' % tuple(t + 1))


def outside(margin, step=0.5):
    """How far outside the hair a direction lies: the angle in degrees to the nearest place where `margin` is not
    negative, 0 inside. (`margin` itself counts degrees of height over the hairline: where the hairline is steep,
    in front of the ear, a place many degrees under it lies a millimetre beside the hair.) Returns f(directions),
    read from a table over the sphere, a place every `step` degrees."""
    th = np.arange(-180, 180, step); el = np.arange(-90, 90 + step, step)
    TH, EL = np.meshgrid(th, el)
    ins = margin(TH, EL) >= 0
    up = np.pad(ins, ((1, 0), (0, 0)), mode='edge')[:-1]; dn = np.pad(ins, ((0, 1), (0, 0)), mode='edge')[1:]
    rim = ins & ~(np.roll(ins, 1, 1) & np.roll(ins, -1, 1) & up & dn)
    E = dirs(TH[rim], EL[rim])
    G = dirs(TH, EL).reshape(-1, 3)
    far = np.zeros(len(G))
    for k in range(0, len(G), 2048):
        far[k:k + 2048] = np.degrees(np.arccos(np.clip((G[k:k + 2048] @ E.T).max(1), -1, 1)))
    far = np.where(ins, 0, far.reshape(TH.shape))
    def f(d):
        t, e = ang(d)
        x = (t + 180) / step; y = (e + 90) / step
        x0 = np.floor(x).astype(int); y0 = np.clip(np.floor(y).astype(int), 0, len(el) - 2)
        fx = x - x0; fy = y - y0
        x0 = x0 % len(th); x1 = (x0 + 1) % len(th)
        return (far[y0, x0] * (1 - fx) + far[y0, x1] * fx) * (1 - fy) + (far[y0 + 1, x0] * (1 - fx) + far[y0 + 1, x1] * fx) * fy
    return f


def paint_cap(head, out, name, margin, flow, rng, Lc, shade, n=60000, steps=10, curl=0.0, curl_len=0.06,
              base=0.8, base_ramp=7.0, mean=0.6, tex=2048, pick=None, ymin=6.6, uvc=None, lift=None, cut=None, fade=None):
    """The cap: scalp triangles lifted 0.008, textured with n painted fine
    hairs along the flow (length Lc(th, el) each, brightness shade(dirs)),
    over a darker base inside the margin. curl: sideways swing (radians of
    head angle) of curly hairs, period curl_len. lift(V, margin, triangles):
    how much further each vertex stands off the skin (a vector per vertex),
    for a layer that has a thickness of its own (a beard cut close).
    cut(root directions, directions): how much of a hair is drawn at a point
    of its way (0 to 1); from where it is cut the hair stays cut.
    fade (from, to; degrees): the layer ends outside the hair, between so many degrees from it (`outside`): the
    painted hairs run on over the hairline, and without this the layer ends where its net ends, covering in full,
    in the straight edges of the skin's triangles (under a head of hair that covers it nobody sees that; a short
    cut leaves the temple and the place in front of the ear bare: a dark block with corners)."""
    V, T, hc = head.V, head.T, head.hc
    cdir = unit(V - hc)
    cm = margin(*ang(cdir))
    if fade is None:
        tsel = [t for t in T if cm[t].max() > -7 and V[t][:, 1].min() > ymin]
    else:
        beyond = outside(margin)
        cf = beyond(cdir)
        tsel = [t for t in T if cf[t].min() < fade[1] + 1 and V[t][:, 1].min() > ymin]
    if lift is not None:
        # a layer that stands off the skin must be the skin's outer side alone: the triangles are chosen by their
        # direction from the head's centre, which also takes the walls of the mouth's hollow that lie behind the
        # lower face; on the skin they stay hidden inside the head, lifted they come out through it
        cen = V[np.array(tsel)].mean(1)
        nrm = np.cross(V[np.array(tsel)[:, 1]] - V[np.array(tsel)[:, 0]], V[np.array(tsel)[:, 2]] - V[np.array(tsel)[:, 0]])
        out_ = ((cen - hc) * nrm).sum(1) > 0
        far = np.linalg.norm(cen - hc, axis=1) > 0.85 * head.skin(unit(cen - hc))
        tsel = [t for t, k in zip(tsel, out_ & far) if k]
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
    head.cap_hairs = len(Q)
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
    keep = np.ones((len(Q), steps + 1))
    if cut is not None:
        keep = np.minimum.accumulate(np.stack([cut(Q, QP[:, s1]) for s1 in range(steps + 1)], 1), axis=1)
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
        wgt = 0.5 * wq[idx] * np.minimum(1, fl * 6) * (1 - fl ** 3) * (keep[idx, s1] * (1 - f) + keep[idx, s1 + 1] * f)
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
    if fade is not None:
        g = np.clip((beyond(gd) - fade[0]) / (fade[1] - fade[0]), 0, 1)
        a = a * (1 - g * g * (3 - 2 * g))
    c = c / max(1e-6, (c * a).sum() / max(a.sum(), 1e-6)) * mean
    img = np.dstack([np.clip(c, 0, 1)] * 3 + [np.clip(a, 0, 1)])
    Image.fromarray((img * 255).astype(np.uint8), 'RGBA').save(os.path.join(out, name + '_cap.png'))
    more = lift(V, cm, tsel) if lift is not None else np.zeros_like(V)
    with open(os.path.join(out, name + '_cap.txt'), 'w') as f:
        f.write(f'{len(cv)} {len(tsel)}\n')
        for o in cv:
            nn = head.vn[o] * 0.008 + more[o]
            f.write(f'{head.remap[o]} {head.remap[o]} {head.remap[o]} 1 0 0 {nn[0]:.6f} {nn[1]:.6f} {nn[2]:.6f}\n')
        for t in tsel:
            f.write(' '.join(str(cmap[i]) for i in t) + ' ' + ' '.join(f'{cuv[i][0]:.6f} {1 - cuv[i][1]:.6f}' for i in t) + '\n')
    with open(os.path.join(out, name + '_capview.obj'), 'w') as f:
        for o in cv:
            f.write('v %.5f %.5f %.5f\n' % tuple(V[o] + head.vn[o] * 0.008 + more[o]))
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
