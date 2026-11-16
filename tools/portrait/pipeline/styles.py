# More hairstyles from the same pipeline (hairlib.py): short crop, bald
# (horseshoe), receding temples, short curls, a side parting of about 1900,
# a women's crown braid, and (for 1350) the bob and a parting with two plaits.
# usage: python3 -I styles.py base.obj outdir style name
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(sys.argv[0])))
import numpy as np
from hairlib import Head, dirs, ang, unit, tangent, roots, grow, wisps, cards_from_wisps, locks_from_wisps, write_cards, write_tubes, paint_cap, make_shade, write_head_obj

base, out, style, name = sys.argv[1:5]
rng = np.random.default_rng(int(os.environ.get('SEED', '17')))
H = Head(base)
hc = H.hc
_wb = np.random.default_rng(11).uniform(0, 6.3, 3)


def line(tab):
    tab = np.array(tab, float)
    def hl(th):
        return np.interp(np.abs(th), tab[:, 0], tab[:, 1])
    def hln(th):
        t = np.radians(th)
        return hl(th) + 0.9 * np.sin(7 * t + _wb[0]) + 0.6 * np.sin(13 * t + _wb[1]) + 0.4 * np.sin(23 * t + _wb[2])
    return hl, hln


MEN = [(0, 20), (20, 19), (32, 13), (44, 2), (58, -8), (66, -16), (71, -30), (75, -24), (78, -6), (84, -2), (102, -2), (112, -12), (126, -28), (145, -40), (165, -46), (180, -48)]
# receding at the temples (an M-shaped hairline)
REC = [(0, 30), (12, 31), (24, 40), (34, 46), (46, 34), (58, 6), (66, -14), (71, -30), (75, -24), (78, -6), (84, -2), (102, -2), (112, -12), (126, -28), (145, -40), (165, -46), (180, -48)]
# the upper edge of a horseshoe of hair round the sides and back, the top bare
BARE = lambda th: np.interp(np.abs(th), [0, 45, 60, 80, 100, 130, 180], [-30, -6, 16, 30, 35, 40, 42]) + 2.5 * np.sin(np.radians(th) * 9 + 1.0)
W = dirs(180, 52)  # the crown whorl


def from_whorl(d, th, el, twist=0.35):
    t = tangent(d - W, d)
    a = np.arccos(np.clip((d * W).sum(-1), -1, 1))
    return unit(t + twist * np.exp(-a / 0.45)[..., None] * np.cross(d, t))


def e_th(d):
    return tangent(np.stack([d[..., 2], np.zeros_like(d[..., 0]), -d[..., 0]], -1), d)


def e_dn(d):
    return tangent(np.broadcast_to(np.array([0, -1.0, 0]), d.shape).copy(), d)


def empty_cards():
    with open(os.path.join(out, name + '.txt'), 'w') as f:
        f.write('0 0\n')
    with open(os.path.join(out, name + '_cards.obj'), 'w') as f:
        f.write('')


def men_cards(margin, flow, L, K, lift0, taper, tile=lambda d: int(rng.integers(0, 4)), wmax=0.3, wmin=0.12, steps=8, clump=(0.15, 0.7), Nr=9000, trim=None, wave=None, strands_only=False):
    P = roots(Nr, margin, rng)
    th, el = ang(P)
    Ls = L(th, el) * (0.9 + 0.2 * rng.random(len(P)))
    lw = lift0(P)
    S = grow(H, P, Ls, steps, flow, lambda s, d, P0: lw * min(1, 0.35 + s * 2) + 0.004)
    if trim is not None:
        S = trim(S)
    if strands_only:
        return S, None, 0, 0
    lab = wisps(S, K, rng)
    cards, tiles = cards_from_wisps(H, S, lab, K, rng, 4.0, taper, tile, clump=clump, wmax=wmax, wmin=wmin, wave=wave)
    nv, nt = write_cards(H, out, name, cards, tiles)
    return S, lab, len(cards), nt


def lift_whorl(P):
    return 0.014 + 0.04 * (1 - np.arccos(np.clip((P * W).sum(-1), -1, 1)) / np.pi)


if style == 'crop':
    # cropped short all over: only the painted layer, no cards
    hl, hln = line(MEN)
    margin = lambda th, el: el - hln(th)
    empty_cards()
    cov = paint_cap(H, out, name, margin, from_whorl, rng, lambda th, el: 0.11 + 0 * th,
                    lambda Q: rng.uniform(0.75, 1.0, len(Q)), n=70000, base=0.88, base_ramp=5.0, mean=0.62)
    print(style, 'cap coverage', round(cov, 3))

elif style in ('bald', 'receding'):
    if style == 'bald':
        # a horseshoe of short hair round the sides and back, the top bare
        hl, hln = line(MEN)
        margin = lambda th, el: np.minimum(el - hln(th), BARE(th) - el)
        empty_cards()
        cov = paint_cap(H, out, name, margin, lambda d, th, el: unit(e_dn(d) + 0.4 * tangent(np.broadcast_to(np.array([0, 0, -1.0]), d.shape).copy(), d)), rng,
                        lambda th, el: 0.12 + 0 * th, lambda Q: rng.uniform(0.75, 1.0, len(Q)), n=50000, base=0.85, base_ramp=5.0, mean=0.62)
        print(style, 'cap coverage', round(cov, 3))
    else:
        # receding at the temples (an M-shaped hairline), short locks forward
        hl, hln = line(REC)
        margin = lambda th, el: el - hln(th)
        S, lab, nc, nt = men_cards(margin, from_whorl, lambda th, el: np.interp(np.abs(th), [0, 40, 80, 120, 180], [0.32, 0.3, 0.22, 0.2, 0.2]), 240, lift_whorl, 0.75)
        cov = paint_cap(H, out, name, margin, from_whorl, rng, lambda th, el: 0.2 + 0 * th, make_shade(H, S, lab, 240, rng), n=50000, mean=0.6)
        print(style, 'cards', nc, 'tris', nt, 'cap coverage', round(cov, 3))

elif style == 'curly':
    # short tight curls: curly painted hairs and small tufts standing off the head
    hl, hln = line(MEN)
    margin = lambda th, el: el - hln(th)
    lift = lambda P: 0.03 + 0.05 * rng.random(len(P))
    S, lab, nc, nt = men_cards(margin, lambda d, th, el: from_whorl(d, th, el, 0.2),
                               lambda th, el: np.interp(np.abs(th), [0, 60, 120, 180], [0.2, 0.18, 0.15, 0.14]), 520, lift, 0.55,
                               wmax=0.18, steps=6, clump=(0.2, 0.8), Nr=12000)
    cov = paint_cap(H, out, name, margin, from_whorl, rng, lambda th, el: 0.2 + 0 * th, make_shade(H, S, lab, 520, rng),
                    n=70000, steps=16, curl=1.1, curl_len=0.05, base=0.88, mean=0.55)
    print(style, 'cards', nc, 'tris', nt, 'cap coverage', round(cov, 3))

elif style == 'sidepart':
    # about 1900: a side parting, the top combed across, short back and sides
    hl, hln = line([(0, 22), (20, 20), (32, 14), (44, 4), (58, -8), (66, -16), (71, -30), (75, -24), (78, -8), (84, -4), (102, -4), (112, -14), (126, -30), (145, -42), (165, -46), (180, -48)])
    margin = lambda th, el: el - hln(th)
    TP = -32.0  # the parting, degrees from the front
    def flow(d, th, el):
        sd = np.where(th > TP, 1.0, -1.0)[..., None]
        wt = (np.clip((el - 15) / 35, 0, 1) * np.clip(1 - (np.abs(th) - 95) / 40, 0, 1))[..., None]
        back = tangent(np.broadcast_to(np.array([0, 0, -1.0]), d.shape).copy(), d)
        front = np.clip(1 - np.abs(th) / 50, 0, 1)[..., None] * np.clip((el - 15) / 20, 0, 1)[..., None]
        t = wt * sd * e_th(d) * np.where(th > TP, 1.0, 0.5)[..., None] + (1 - wt) * e_dn(d) + 0.5 * front * back
        return unit(t)
    S, lab, nc, nt = men_cards(margin, flow, lambda th, el: np.interp(el, [-40, 0, 25, 45, 90], [0.1, 0.14, 0.26, 0.48, 0.5]),
                               180, lambda P: 0.016 + 0.03 * np.clip((ang(P)[1] - 10) / 50, 0, 1), 0.8)
    cov = paint_cap(H, out, name, margin, flow, rng, lambda th, el: np.interp(el, [-40, 0, 40, 90], [0.1, 0.13, 0.3, 0.32]), make_shade(H, S, lab, 180, rng), n=60000, mean=0.6)
    print(style, 'cards', nc, 'tris', nt, 'cap coverage', round(cov, 3))

elif style == 'braid':
    # centre parting, the hair drawn back, a braid laid round the head like a crown
    hl, hln = line([(0, 19), (20, 18), (32, 12), (44, 3), (58, -6), (66, -14), (71, -24), (75, -20), (78, -12), (84, -12), (102, -12), (112, -16), (126, -28), (145, -40), (165, -46), (180, -48)])
    margin = lambda th, el: el - hln(th)
    BK = dirs(180, -20)
    EX = np.array([1.0, 0, 0])
    def flow(d, th, el):
        g = tangent(np.broadcast_to(BK, d.shape).copy(), d)
        sx = np.sign(d[..., 0:1] + 1e-6) * EX
        sd = tangent(sx, d)
        ks = 1.6 * np.clip(np.cos(np.radians(th)), 0, 1) ** 0.7 * np.clip(el / 45, 0, 1)
        kd = 0.9 * np.exp(-((np.abs(th) - 70) / 30) ** 2) * np.clip((el + 5) / 25, 0, 1)
        return unit(g + ks[..., None] * sd + kd[..., None] * e_dn(d))
    S, lab, nc0, nt0 = men_cards(margin, flow, lambda th, el: 0.5 + 0 * th, 240,
                                 lambda P: 0.014 + 0.02 * np.clip((ang(P)[1] + 50) / 140, 0, 1), 0.6, steps=12, clump=(0.1, 0.6))
    # the braid: three strands woven along a ring over the head
    cards, tiles = [], []
    ring_th = np.linspace(-180, 180, 721)
    ring_el = 29 + 11 * np.cos(np.radians(ring_th))      # higher at the front
    rd = dirs(ring_th, ring_el)
    rp = H.at(rd, 0.07 + 0 * ring_th)
    arc = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(rp, axis=0), axis=1))])
    total = arc[-1]
    RB, LAM = 0.085, 0.22
    nseg = int(total / 0.28)
    for k in range(3):
        for sg in range(nseg):
            a0 = sg * total / nseg; a1 = a0 + total / nseg * 1.15
            tt = np.linspace(a0, a1, 13) % total
            c = np.stack([np.interp(tt, arc, rp[:, i]) for i in range(3)], -1)
            nrm = unit(c - hc)
            tg = unit(np.gradient(np.stack([np.interp(np.linspace(a0, a1, 13), arc, rp[:, i], period=total) for i in range(3)], -1), axis=0))
            bn = unit(np.cross(tg, nrm))
            ph = 2 * np.pi * np.linspace(a0, a1, 13) / LAM + 2 * np.pi * k / 3
            p = c + bn * (RB * np.sin(ph))[:, None] + nrm * (0.4 * RB * np.sin(2 * ph) + 0.02)[:, None]
            tg2 = unit(np.gradient(p, axis=0)); n2 = unit(p - hc); b2 = unit(np.cross(tg2, n2))
            w = 0.1
            cards.append((p - b2 * w / 2, p + n2 * 0.006, p + b2 * w / 2))
            tiles.append(int(rng.integers(0, 4)))
    # the hair cards again (same wisps) together with the braid
    hair_cards, hair_tiles = cards_from_wisps(H, S, lab, 240, rng, 4.0, 0.6, lambda d: int(rng.integers(0, 4)), clump=(0.1, 0.6))
    nv, nt = write_cards(H, out, name, hair_cards + cards, hair_tiles + tiles)
    cov = paint_cap(H, out, name, margin, flow, rng, lambda th, el: 0.4 + 0 * th, make_shade(H, S, lab, 240, rng), n=60000, mean=0.6)
    print(style, 'cards', len(hair_cards), '+ braid', len(cards), 'tris', nt, 'cap coverage', round(cov, 3))

elif style == 'plait':
    # about 1350, girls and unmarried women: a centre parting, the hair drawn down over the ears to below them,
    # from there two plaits falling in front of the shoulders (PLACEHOLDER by eye, to be checked against the
    # picture sources). The plaits lie on the gown of England 1356: their way down is measured on its cote.obj
    # and written here as a table (x to the side, y up, z to the front, in base units).
    # the hairline of the crown braid, on the forehead lower by PLAIT_HL degrees (a parting with the hair lying
    # flat shows the whole forehead)
    _hl = float(os.environ.get('PLAIT_HL', '11'))
    # and lower still at the temples by PLAIT_TEMPLE degrees: with the line of the crown braid the hairline has a
    # corner above each temple, a square forehead as of a man whose hair goes back there
    _tp = float(os.environ.get('PLAIT_TEMPLE', '7'))
    hl, hln = line([(0, 19 - _hl), (20, 18 - _hl - 0.3 * _tp), (32, 12 - 0.8 * _hl - 0.8 * _tp), (44, 3 - 0.4 * _hl - _tp), (58, -6 - _tp), (66, -14 - 0.5 * _tp), (71, -24), (75, -20), (78, -12), (84, -12), (102, -12), (112, -16), (126, -28), (145, -40), (165, -46), (180, -48)])
    margin = lambda th, el: el - hln(th)
    GTH, GEL = [float(t) for t in os.environ.get('PLAIT_G', '92,-44').split(',')]
    TTH, TEL = [float(t) for t in os.environ.get('PLAIT_T', '60,4').split(',')]
    def gd(d):
        return dirs(np.where(d[..., 0] >= 0, GTH, -GTH), GEL + 0 * d[..., 0])
    def td(d):
        return dirs(np.where(d[..., 0] >= 0, TTH, -TTH), TEL + 0 * d[..., 0])
    def front(th, el):
        # how much a place belongs to the front of the head, whose hair goes by the temple
        return np.clip((TTH - 5 - np.abs(th)) / 20, 0, 1) * np.clip((el - TEL) / 12, 0, 1)
    def flow(d, th, el):
        # from the parting down the side first; in front by the temple, so that the hair frames the forehead
        # in a round line and covers the ear, then to the place below the ear where the plait begins
        k = np.clip((el - 35) / 40, 0, 1)[..., None]
        f = front(th, el)[..., None]
        sx = tangent(np.sign(d[..., 0:1] + 1e-6) * np.array([1.0, 0, 0]), d)
        return unit((1 - k) * tangent((1 - f) * gd(d) + f * td(d) - d, d) + k * sx)
    def length(th, el):
        d = dirs(th, el)
        ac = lambda a_, b_: np.arccos(np.clip((a_ * b_).sum(-1), -1, 1))
        f = front(th, el)
        way = f * (ac(d, td(d)) + ac(td(d), gd(d))) + (1 - f) * ac(d, gd(d))
        return 0.98 * way * (0.92 + 0.1 * rng.random(np.shape(th))) + 0.08
    _l = [float(t) for t in os.environ.get('PLAIT_LIFT', '0.075,0.05').split(',')]
    # PLAIT_ROPE_ONLY: the plaits' file alone (a few seconds; the head's hair takes more than a minute)
    rope_only = bool(os.environ.get('PLAIT_ROPE_ONLY'))
    if not rope_only:
        S, lab, nc0, nt0 = men_cards(margin, flow, length, 320, lambda P: _l[0] + _l[1] * rng.random(len(P)), 0.7, steps=14, clump=(0.1, 0.6), Nr=12000, wmax=0.42, wmin=0.26)
    WAY = np.array([[0.74, 7.02, 0.34], [0.80, 6.55, 0.42], [0.84, 5.98, 0.62], [0.82, 5.40, 1.12], [0.76, 4.60, 1.46], [0.72, 4.15, 1.66]])
    # The plait itself: three round strands, plaited (round 86). Until then it was flat cards along the same three
    # ways, 1.9 cm broad: ragged ribbons, each lit as one face turned away from the head, the whole 4.5 cm broad.
    # `PLAIT_ROPE`: how far a strand's middle swings to the side and in depth, half its breadth and half its
    # thickness, and the length of one swing to both sides and back (base units, 0.1 = 1 cm). A plait of half a
    # head's hair is about 3 cm broad and 1.7 cm thick; where the strands cross in its middle they run about
    # 40 degrees off its length (PLACEHOLDER by eye, not measured on plaits).
    RA, RD, RW, RH, LAM = [float(t) for t in os.environ.get('PLAIT_ROPE', '0.085,0.03,0.062,0.045,0.62').split(',')]
    ROUND = 8                     # corners round a strand
    V_LEN = 1.0                   # the length of strand that one height of the image covers
    turn = -np.pi / 2 + 2 * np.pi * np.arange(ROUND) / ROUND
    # across the image from one flank of the strand over its front to the other, and back again behind it; along
    # it down the image and up again: the image has no seam anywhere
    u_round = 1 - np.abs(2 * np.arange(ROUND + 1) / ROUND - 1)
    tubes = []
    for sgn in (1.0, -1.0):
        way = WAY * np.array([sgn, 1, 1])
        way[0] = H.at(dirs(np.array([sgn * GTH]), np.array([GEL])), np.array([0.05]))[0]
        # a smooth line through the table's points
        u0 = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(way, axis=0), axis=1))])
        uu = np.linspace(0, u0[-1], 400)
        rp = np.stack([np.interp(uu, u0, way[:, i]) for i in range(3)], -1)
        for _ in range(40):
            rp[1:-1] = 0.5 * rp[1:-1] + 0.25 * (rp[:-2] + rp[2:])
        if not rope_only:
            # the head's hair is laid with numbers drawn after those the plaits' cards took (as many as the line
            # smoothed so far was long): drawn still, so that it stays as it was, card for card
            for _ in range(3 * int(np.linalg.norm(np.diff(rp, axis=0), axis=1).sum() / 0.36)):
                rng.integers(0, 4)
        # a plait is stiff: it turns over a hand's breadth, not at a point of the table (smoothed 40 times as the
        # cards were, the line turned 40 degrees within 2 cm below the ear and 20 at the collar and on the chest)
        for _ in range(int(os.environ.get('PLAIT_EVEN', '600'))):
            rp[1:-1] = 0.5 * rp[1:-1] + 0.25 * (rp[:-2] + rp[2:])
        arc = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(rp, axis=0), axis=1))])
        total = arc[-1]
        tt = np.linspace(0, total, int(total / 0.025) + 1)
        c = np.stack([np.interp(tt, arc, rp[:, i]) for i in range(3)], -1)
        nrm = unit(c - np.stack([0 * c[:, 0], c[:, 1], 0.2 + 0 * c[:, 0]], -1))
        tg = unit(np.gradient(c, axis=0))
        nrm = unit(nrm - (nrm * tg).sum(-1, keepdims=True) * tg)
        bn = unit(np.cross(tg, nrm))
        g = np.clip((total - tt) / (0.14 * total), 0, 1); thin = 0.3 + 0.7 * g * g * (3 - 2 * g)   # the end runs out thin
        g = np.clip(tt / 0.3, 0, 1); part = g * g * (3 - 2 * g)              # gathered below the ear, the strands part over 3 cm
        e = 0.06; tip = np.sqrt(np.clip(1 - (np.clip(tt - (total - e), 0, None) / e) ** 2, 0, 1))   # a round end
        tip = tip * np.sqrt(np.clip(1 - np.clip(1 - tt / e, 0, None) ** 2, 0, 1))                    # and a round beginning, in the hair below the ear
        for k in range(3):
            ph = 2 * np.pi * tt / LAM + 2 * np.pi * k / 3
            q = c + bn * (RA * thin * part * np.sin(ph))[:, None] + nrm * (RD * thin * part * np.sin(2 * ph) + (RD + RH) * thin + 0.01)[:, None]
            tg2 = unit(np.gradient(q, axis=0))
            n2 = unit(nrm - (nrm * tg2).sum(-1, keepdims=True) * tg2)
            b2 = np.cross(tg2, n2)
            size = thin * tip * (1 + 0.35 * (1 - part))
            rings = q[:, None, :] + n2[:, None, :] * (RH * size[:, None] * np.cos(turn)[None, :])[..., None] + b2[:, None, :] * (RW * size[:, None] * np.sin(turn)[None, :])[..., None]
            along = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(q, axis=0), axis=1))]) / V_LEN + 0.37 * k
            v = 1 - np.abs(along % 2 - 1)
            uv = np.stack(np.broadcast_arrays(u_round[None, :], v[:, None]), -1)
            tubes.append((rings, uv, c))
    # the plaits are bound to neck, shoulders and chest as well: a head that knows the body down to there
    H2 = Head(base, ymin=3.9, hc=H.hc)
    nvr, ntr = write_tubes(H2, out, name + '_rope', tubes)
    if rope_only:
        print(style, 'plaits alone: corners', nvr, 'tris', ntr)
        sys.exit(0)
    hair_cards, hair_tiles = cards_from_wisps(H, S, lab, 320, rng, 4.0, 0.7, lambda d: int(rng.integers(0, 4)), clump=(0.1, 0.6), wmax=0.42, wmin=0.26)
    nv, nt = write_cards(H2, out, name, hair_cards, hair_tiles)
    cov = paint_cap(H, out, name, margin, flow, rng, lambda th, el: 0.4 + 0 * th, make_shade(H, S, lab, 320, rng), n=60000, mean=0.6)
    print(style, 'cards', len(hair_cards), 'tris', nt, '+ plaits: corners', nvr, 'tris', ntr, 'cap coverage', round(cov, 3))

elif style == 'bob':
    # about 1350: the hair grown to the jaw all round, covering the ears, a
    # short fringe on the forehead, the ends turned a little outwards
    # (PLACEHOLDER lengths, to be checked against the picture sources). BOB_LINE: the same hair on a head that
    # loses it, `rec` with the hairline gone back at the temples, `bald` as a horseshoe round a bare top
    LINE = os.environ.get('BOB_LINE', 'men')
    hl, hln = line(REC if LINE == 'rec' else MEN)
    margin = (lambda th, el: np.minimum(el - hln(th), BARE(th) - el)) if LINE == 'bald' else (lambda th, el: el - hln(th))
    END = float(os.environ.get('BOB_END', '-24'))     # where the hair ends at the sides and back, degrees
    FR = float(os.environ.get('BOB_FRINGE', '26'))    # where the fringe ends on the forehead
    def flow(d, th, el):
        w = np.clip((62 - el) / 35, 0, 1)[..., None]
        return unit((1 - w) * from_whorl(d, th, el, 0.25) + w * e_dn(d))
    def length(th, el):
        side = 0.95 * np.radians(np.maximum(el - END, 4)) + 0.1
        fringe = float(os.environ.get('BOB_FK', '0.95')) * np.radians(np.maximum(el - FR, float(os.environ.get('BOB_FMIN', '2')))) + 0.03
        f = np.clip((np.abs(th) - float(os.environ.get('BOB_FW', '38'))) / 22, 0, 1)
        return (fringe * (1 - f) + side * f) * (0.9 + 0.12 * rng.random(np.shape(th)))   # uneven ends
    def trim(S):
        # a strand's length follows from where its root is; one rooted behind the crown with the length of the
        # sides can still run forward over the forehead (a lone lock down to the nose). So every strand is cut
        # where it crosses the fringe's line in front of the face (BOB_CUT); the sides are left as they grow
        # (angles seen from the head's centre of the hair scripts, which lies high and forward: the hairline is
        # at 20 degrees, the brows near -25, the jaw near -60)
        th, el = ang(unit(S - H.hc))
        f = np.clip((np.abs(th) - 45) / 25, 0, 1)
        over = el < float(os.environ.get('BOB_CUT', '-20')) * (1 - f) - 90 * f
        out_ = S.copy(); t = np.arange(S.shape[1])
        for i in np.where(over.any(1))[0]:
            k = max(1, int(np.argmax(over[i])))          # the first point beyond the line
            u = np.linspace(0, k - 1, S.shape[1]) if k > 1 else np.zeros(S.shape[1])
            for c in range(3):
                out_[i, :, c] = np.interp(u, t, S[i, :, c])
        return out_
    # wavy hair: how far a strand swings to the side and lifts off the head, and the length of a wave
    WAVE = tuple(float(t) for t in os.environ['BOB_WAVE'].split(',')) if os.environ.get('BOB_WAVE') else None
    _l = [float(t) for t in os.environ.get('BOB_LIFT', '0.07,0.07').split(',')]   # height over the skin: least, and spread
    # how many strands (cards) and their least and greatest width
    BK = int(os.environ.get('BOB_K', '420')); _w = [float(t) for t in os.environ.get('BOB_W', '0.34,0.5').split(',')]
    # Locks (round 87): the same strands gathered into fewer wisps, each an arched band that is solid (`hairlib.py`
    # `locks_from_wisps`), written as `name_rope.txt`; the game draws them in place of the cards. `BOB_LOCKS`:
    # how many, their least and greatest breadth, their height as a share of the breadth, their height over the
    # skin at the root and far from it, and the run over which it rises (base units, 0.1 = 1 cm). `BOB_LOCKS_ONLY`
    # writes that file alone (a minute; cards and the painted layer take several). All PLACEHOLDER by eye.
    locks_only = bool(os.environ.get('BOB_LOCKS_ONLY'))
    S, lab, nc, nt = men_cards(margin, flow, length, BK, lambda P: _l[0] + _l[1] * rng.random(len(P)), 0.9, steps=14, clump=(0.12, 0.65), Nr=14000, wmax=_w[1], wmin=_w[0], trim=trim, wave=WAVE, strands_only=locks_only)
    if os.environ.get('BOB_LOCKS'):
        LK, LW0, LW1, LFLAT, LH0, LH1, LRUN = [float(t) for t in os.environ['BOB_LOCKS'].split(',')]
        rl = np.random.default_rng(87)      # numbers of their own: cards and painted layer stay as they were
        lab2 = wisps(S, int(LK), rl)
        # the locks pass the ears in one bow (`BOB_LOCK_OVER`): how far round a place the skin is looked at for
        # that, over how many degrees it is evened out, and from how many degrees off the face's middle over how
        # many more (in front the locks keep to the forehead: over a bow that takes in the brows a fringe hangs
        # lower)
        cover = [float(t) for t in os.environ.get('BOB_LOCK_OVER', '8,6,35,30').split(',')]
        def beside(th, el):
            g = np.clip((np.abs(th) - cover[2]) / cover[3], 0, 1)
            return g * g * (3 - 2 * g)
        fours = lambda key, default: tuple(float(t) for t in os.environ.get(key, default).split(','))
        bands = locks_from_wisps(H, S, lab2, int(LK), rl, LW0, LW1, LFLAT, (LH0, LH1, LRUN), m=int(os.environ.get('BOB_LOCK_M', '5')),
                                 tip=fours('BOB_LOCK_TIP', '0.3,0.25,0.8,0.4'), root=fours('BOB_LOCK_ROOT', '0.15,0.2,0.7,0.3'),
                                 wave=WAVE, ring=float(os.environ.get('BOB_LOCK_RING', '0.14')),
                                 over=H.covered(cover[0], cover[1], beside) if cover[0] > 0 else None)
        # (`BOB_LOCK_EVEN`: how often the builder evens out the locks' way with a head along them; a few times,
        # so that a lock stays the head's form: evened out to the end it would move as a stiff piece)
        nvr, ntr = write_tubes(H, out, name + '_rope', bands, even=int(os.environ.get('BOB_LOCK_EVEN', '3')), closed=False)
        print(style, 'locks', len(bands), 'corners', nvr, 'tris', ntr)
        if locks_only:
            sys.exit(0)
    cov = paint_cap(H, out, name, margin, flow, rng, lambda th, el: 0.35 + 0 * th, make_shade(H, S, lab, BK, rng), n=60000, mean=0.6)
    print(style, 'cards', nc, 'tris', nt, 'cap coverage', round(cov, 3))

write_head_obj(H, os.path.join(out, name + '_head.obj'))
