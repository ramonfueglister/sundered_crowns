# Beards from the same pipeline as the hair (hairlib.py): a beard zone on the
# MakeHuman base head (cheek line, neckline, mouth and nose left free), a
# flow of growth (down on cheeks and chin, out and down on the upper lip,
# back towards the neck under the jaw), short beards lying on the skin, long
# beards hanging free below the chin (gravity, drawn together towards the
# middle, kept in front of neck and chest), cards bound to head.bin, and a
# painted layer of short hairs on the skin under them.
# usage: python3 -I beards.py base.obj outdir style name
#   style: region (control image) | stubble | short | full | phil | chin
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(sys.argv[0])))
import numpy as np
from PIL import Image, ImageDraw
from hairlib import Head, dirs, ang, unit, tangent, golden, wisps, write_cards, paint_cap, write_head_obj

base, out, style, name = sys.argv[1:5]
rng = np.random.default_rng(23)
HC = (0.0, 6.9, 0.35)          # the lower face's centre (base coordinates)
UVC = (0.0, -0.55, 0.83)        # texture centre of the painted layer: front and down
H = Head(base, ymin=5.65, hc=HC, xmax=1.3, elmin=-89, step=1.0,
         tkeep=lambda P: P[:, 1].max() < 7.9 and P[:, 2].min() > -0.35)
hc = H.hc

# --- the body seen from the front (max z per x, y), for hanging beards ---
def front_depth():
    vs, fs, g = [], [], None
    for l in open(base):
        if l.startswith('v '):
            vs.append([float(t) for t in l.split()[1:4]])
        elif l.startswith('g '):
            g = l.split()[1]
        elif l.startswith('f ') and g == 'body':
            fs.append([int(t.split('/')[0]) - 1 for t in l.split()[1:]])
    V = np.array(vs)
    X0, Y0, DX = -1.4, 3.6, 0.02
    Z = np.full((141, 181), -9.0)
    for f in fs:
        P = V[f]
        if P[:, 1].max() < 3.6 or P[:, 1].min() > 7.2 or P[:, 2].max() < -0.3:
            continue
        for k in range(1, len(f) - 1):
            tri = P[[0, k, k + 1]]
            i0 = int(np.floor((tri[:, 0].min() - X0) / DX)); i1 = int(np.ceil((tri[:, 0].max() - X0) / DX))
            j0 = int(np.floor((tri[:, 1].min() - Y0) / DX)); j1 = int(np.ceil((tri[:, 1].max() - Y0) / DX))
            ii, jj = np.meshgrid(np.arange(max(i0, 0), min(i1, 140) + 1), np.arange(max(j0, 0), min(j1, 180) + 1), indexing='ij')
            px, py = X0 + ii * DX, Y0 + jj * DX
            (x1, y1, z1), (x2, y2, z2), (x3, y3, z3) = tri
            den = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
            if abs(den) < 1e-9:
                continue
            l1 = ((y2 - y3) * (px - x3) + (x3 - x2) * (py - y3)) / den
            l2 = ((y3 - y1) * (px - x3) + (x1 - x3) * (py - y3)) / den
            l3 = 1 - l1 - l2
            ok = (l1 >= -1e-3) & (l2 >= -1e-3) & (l3 >= -1e-3)
            zz = l1 * z1 + l2 * z2 + l3 * z3
            Z[ii[ok], jj[ok]] = np.maximum(Z[ii[ok], jj[ok]], zz[ok])
    def zf(x, y):
        i = np.clip((x - X0) / DX, 0, 139.999); j = np.clip((y - Y0) / DX, 0, 179.999)
        i0, j0 = i.astype(int), j.astype(int); fi, fj = i - i0, j - j0
        return (Z[i0, j0] * (1 - fi) * (1 - fj) + Z[i0 + 1, j0] * fi * (1 - fj) + Z[i0, j0 + 1] * (1 - fi) * fj + Z[i0 + 1, j0 + 1] * fi * fj)
    return zf

# --- the beard zone: a signed distance (units, positive inside) ---
TOPS = {'stubble': 7.3, 'short': 7.35, 'full': 7.45, 'phil': 7.45, 'chin': 7.2}.get(style, 7.35)
RAISE = {'full': 0.04, 'phil': 0.07}.get(style, 0.0)

def gfield(p):
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    ax = np.abs(x)
    top = np.interp(ax, [0, 0.3, 0.45, 0.55, 0.68, 0.78, 1.3], [6.86, 6.85, 6.80, 6.745 + RAISE, 6.93 + RAISE, TOPS, TOPS])
    g = top - y
    g = np.minimum(g, y - (6.05 + 0.37 * np.clip((0.8 - z) / 0.5, 0, 1)))       # neckline
    g = np.minimum(g, z - np.interp(y, [6.3, 6.6, 6.85, 7.5], [0.25, 0.45, 0.6, 0.66]))    # in front of the ear
    g = np.minimum(g, 0.86 - ax)
    em = (np.sqrt((x / 0.39) ** 2 + ((y - 6.6) / 0.12) ** 2) - 1) * 0.11          # the mouth
    g = np.minimum(g, np.where(z > 1.0, em, 1.0))
    if style == 'chin':
        # chin beard with moustache: the chin below the mouth, widening to the corners
        w = 0.32 + 0.14 * np.clip((y - 6.42) / 0.3, 0, 1)
        g = np.minimum(g, w - ax)
        g = np.minimum(g, z - 0.85)
    return g

def margin(th, el):
    d = dirs(th, el)
    return gfield(H.at(d, 0.0 * th)) / 0.015

def e_th(d):
    return tangent(np.stack([d[..., 2], np.zeros_like(d[..., 0]), -d[..., 0]], -1), d)

def const(v, d):
    return tangent(np.broadcast_to(np.array(v, float), d.shape).copy(), d)

def flow(d, th, el):
    p = H.at(d, 0.0 * th)
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    ax = np.abs(x)
    dn = const([0, -1, 0], d)
    fwd = const([0, 0, 1], d)
    out_ = np.sign(x + 1e-6)[..., None] * e_th(d)
    wm = (np.clip((y - 6.66) / 0.05, 0, 1) * np.clip((0.6 - ax) / 0.12, 0, 1) * np.clip((z - 1.1) / 0.2, 0, 1))[..., None]
    wc = np.clip((ax - 0.25) / 0.3, 0, 1)[..., None] * (1 - wm)
    wu = (np.clip((6.32 - y) / 0.12, 0, 1) * np.clip((1.25 - z) / 0.3, 0, 1))[..., None]
    t = dn + 0.25 * wc * fwd + wm * (1.1 * np.clip(ax / 0.12, 0, 1)[..., None] * out_ + 0.2 * dn) + wu * const([0, -0.4, -1.0], d)
    return unit(t)

def roots_b(n, at_least=0.5):
    P = golden(n * 24, rng, 0.003)
    P = P[margin(*ang(P)) > at_least]
    return P[rng.permutation(len(P))[:n]]

if style == 'region':
    # control image: vertices of the lower face, inside the zone brown, with flow arrows
    V = H.V
    used = np.unique(H.T)
    S = 700
    img = Image.new('RGB', (2 * S, S), (250, 250, 250))
    dr = ImageDraw.Draw(img)
    def px(a, b, off):
        return off + S / 2 + a * S / 2.4, S - (b - 5.6) * S / 2.2
    vd = unit(V[used] - hc)
    mv = margin(*ang(vd))
    sk = H.at(vd, 0 * mv)
    fl = flow(vd, *ang(vd))
    for view, off in ((0, 0), (1, S)):
        order = np.argsort(V[used, 2] if view == 0 else V[used, 0])
        for k in order:
            o = used[k]
            x, y, z = V[o]
            if not (5.7 < y < 7.6) or z < -0.6 or (view == 1 and x < -0.02):
                continue
            a = x if view == 0 else z - 0.5
            col = (205, 205, 205) if mv[k] <= 0 else (120, 70, 30)
            p = px(a, y, off)
            dr.ellipse([p[0] - 2, p[1] - 2, p[0] + 2, p[1] + 2], fill=col)
            if mv[k] > 0 and k % 3 == 0:
                q = sk[k] + fl[k] * 0.06
                p2 = px(q[0] if view == 0 else q[2] - 0.5, q[1], off)
                dr.line([p, p2], fill=(30, 120, 30))
    img.save(os.path.join(out, name + '.png'))
    print('zone vertices', int((mv > 0).sum()))
    sys.exit(0)

# --- per style ---
P_ = dict(
    stubble=dict(cards=False, Lc=0.013, Lm=0.013, base=0.3, mean=0.5, n=65000),
    shortcap=dict(cards=False, Lc=0.024, base=0.6, mean=0.55, n=95000),
    short=dict(cards=False, Lc=0.03, Lm=0.038, base=0.82, mean=0.55, n=115000),
    full=dict(cards=True, K=340, Nr=14000, L=(0.32, 0.62, 0.11), lift=(0.012, 0.09), hang=True, steps=18, w=(0.07, 0.16), taper=0.35, Lc=0.07, base=0.9, mean=0.55, n=110000, conv=0.55, wave=0.012, Lm=0.075),
    phil=dict(cards=True, K=380, Nr=16000, L=(0.5, 1.0, 0.13), lift=(0.012, 0.1), hang=True, steps=24, w=(0.08, 0.17), taper=0.35, Lc=0.07, base=0.9, mean=0.55, n=110000, conv=0.38, wave=0.022, Lm=0.085),
    chin=dict(cards=True, K=160, Nr=6000, L=(0.2, 0.42, 0.08), lift=(0.01, 0.05), hang=True, steps=14, w=(0.06, 0.13), taper=0.35, Lc=0.06, base=0.88, mean=0.55, n=80000, conv=0.6, wave=0.01, Lm=0.06),
)[style]

def lengths(P):
    """Root length: cheeks P['L'][0], chin P['L'][1], moustache P['L'][2]."""
    sk = H.at(P, np.zeros(len(P)))
    x, y, z = sk[:, 0], sk[:, 1], sk[:, 2]
    ax = np.abs(x)
    chin = np.clip(1 - ax / 0.55, 0, 1) ** 0.8 * np.clip((6.6 - y) / 0.25, 0, 1) ** 0.5
    under = np.clip((6.3 - y) / 0.15, 0, 1) * np.clip((1.2 - z) / 0.3, 0, 1)
    L0, L1, Lm = P_['L']
    L = L0 + (L1 - L0) * np.maximum(chin, 0.7 * under * np.clip(1 - ax / 0.7, 0, 1))
    must = (y > 6.66) & (ax < 0.55) & (z > 1.1)
    L = np.where(must, Lm, L)
    return L * (0.85 + 0.3 * rng.random(len(P))), must

if P_['cards']:
    zf = front_depth()
    P = roots_b(P_['Nr'])
    L, must = lengths(P)
    steps = P_['steps']
    l0, l1 = P_['lift']
    S = np.zeros((len(P), steps + 1, 3))
    d = P.copy()
    pos = H.at(d, np.full(len(P), l0))
    S[:, 0] = pos
    run = np.zeros(len(P))
    for s in range(1, steps + 1):
        f = s / steps
        t = flow(d, *ang(d))
        lift = l0 + (l1 - l0) * np.minimum(1, f * 1.6) * np.where(must, 0.35, 1.0)
        if P_['hang']:
            # gravity takes over along the strand, more for long strands
            wg = np.clip((run - 0.06) / 0.18, 0, 1) * np.where(must, 0.5, 1.0)
            hang = unit(np.stack([-P_['conv'] * pos[:, 0], -np.ones(len(P)), 0.12 * np.ones(len(P))], -1))
            t = unit((1 - wg)[:, None] * t + wg[:, None] * hang)
            pos = pos + t * (L / steps)[:, None]
            run += L / steps
            d = unit(pos - hc)
            # pushed out of the skin where the skin is known, never pulled onto it
            hgt = H.height(pos)
            on = pos[:, 1] > 5.85
            push = on & (hgt < lift)
            pos[push] = H.at(d[push], lift[push])
            # in front of neck and chest
            low = pos[:, 1] < 6.2
            zmin = zf(pos[:, 0], pos[:, 1]) + np.interp(pos[:, 1], [5.5, 6.2], [0.16, 0.05])
            pos[:, 2] = np.where(low, np.maximum(pos[:, 2], zmin), pos[:, 2])
            d = unit(pos - hc)
        else:
            pos = pos + t * (L / steps)[:, None]
            d = unit(pos - hc)
            pos = H.at(d, lift)
        S[:, s] = pos
    # moustache and beard as wisps of their own (no card across the mouth)
    # the moustache is painted (short cards look like teeth); cards only for the beard
    K = P_['K']
    Km = 0
    lab = np.full(len(S), -1)
    # chin beard: the cards start below the lower lip, the corners stay painted
    ok = ~must & ((S[:, 0, 1] < 6.47) if style == 'chin' else True)
    lab[ok] = wisps(S[ok], K, rng)
    # cards along each wisp's centre line, kept where it hangs; normal outward from
    # the beard's axis (the vertical line x = 0, z = 0.35 below the face's centre)
    cards, tiles, anchors, vstart = [], [], [], []
    for j in range(K):
        m = lab == j
        if m.sum() < 6:
            continue
        Sj = S[m]
        c = Sj.mean(0)
        mo = j >= K - Km
        cl = np.linspace(0.1, 0.5 if mo else 0.75, steps + 1)[None, :, None]
        Sj = Sj + (c[None] - Sj) * cl
        nrm = unit(np.stack([c[:, 0], np.maximum(c[:, 1] - HC[1], 0), c[:, 2] - HC[2]], -1))
        tang = unit(np.gradient(c, axis=0))
        b = unit(np.cross(tang, nrm))
        if P_['wave']:
            ph = rng.uniform(0, 6.3)
            run_c = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(c, axis=0), axis=1))])
            c = c + b * (P_['wave'] * np.clip(run_c / 0.1, 0, 1) * np.sin(2 * np.pi * run_c / 0.16 + ph))[:, None]
        lat = ((Sj - Sj.mean(0)[None]) * b[None]).sum(-1)
        wmin, wmax = P_['w']
        if mo:
            wmin, wmax = 0.05, 0.09
        w = np.clip(3.0 * np.sqrt((lat ** 2).mean(0)), wmin, wmax) * np.linspace(1.0, 0.7 if mo else P_['taper'], steps + 1)
        lift_c = np.where(np.arange(steps + 1) == 0, -0.004, 0.0)[:, None] * nrm
        cards.append((c - b * w[:, None] / 2 + lift_c, c + nrm * 0.006, c + b * w[:, None] / 2 + lift_c))
        # bind every column to the head at the wisp's root (the strand moves with the chin)
        root = Sj[:, 0].mean(0)
        hangs = c[:, 1] < 6.2
        anchors.append(np.where(hangs[:, None], root[None], c))
        tiles.append(int(rng.integers(0, 4)) if (not P_['hang'] or mo) else int(rng.integers(0, 8)))
        clen = float(np.linalg.norm(np.diff(c, axis=0), axis=1).sum())
        vstart.append(0.0 if P_['hang'] else 1 - float(np.clip(clen / (4 * w[0]), 0.15, 1)))
    nv, nt = write_cards(H, out, name, cards, tiles, anchors=anchors, vstart=vstart)
    rl = unit(S[:, 0] - hc)
    wb = rng.uniform(0.62, 1.0, K)
    def shade(Q):
        near = np.empty(len(Q), int)
        for s0 in range(0, len(Q), 4000):
            near[s0:s0 + 4000] = (Q[s0:s0 + 4000] @ rl.T).argmax(1)
        return wb[lab[near]]
    np.save(os.path.join(out, name + '_strands.npy'), S)
    print(style, 'cards', len(cards), 'tris', nt, 'lowest y', round(float(S[:, :, 1].min()), 3))
else:
    with open(os.path.join(out, name + '.txt'), 'w') as f:
        f.write('0 0\n')
    shade = lambda Q: rng.uniform(0.7, 1.0, len(Q))

Lc, Lm = P_['Lc'], P_['Lm']
def Lfun(th, el):
    sk = H.at(dirs(th, el), 0.0 * th)
    x, y, z = sk[..., 0], sk[..., 1], sk[..., 2]
    wm = np.clip((y - 6.66) / 0.04, 0, 1) * np.clip((0.58 - np.abs(x)) / 0.1, 0, 1) * np.clip((z - 1.1) / 0.2, 0, 1)
    return Lc + (Lm - Lc) * wm
cov = paint_cap(H, out, name, margin, flow, rng, Lfun, shade, n=P_['n'], steps=8,
                base=P_['base'], base_ramp=4.0, mean=P_['mean'], ymin=5.7, uvc=UVC)
print(style, 'cap coverage', round(cov, 3))
write_head_obj(H, os.path.join(out, name + '_head.obj'))
