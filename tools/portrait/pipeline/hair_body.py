# Hair as a modelled body (round 109), built in Blender: a dark shell over the skull, and on it layers of thick
# bundles that run from the whorl to the line the hair is cut at, each a ridge with flanks, cut at a slant at its
# end. Until round 108 a head's hair was some 950 narrow locks, each begun where its strands were rooted: scales
# all over the head and a fringe of stepped bands. A bundle here begins under the bundles above it and shows its
# length and its end only.
#
# Runs with Blender's Python (inside Blender, `blender -b -P hair_body.py -- ...`, or the `bpy` module from pip):
#   python hair_body.py base.obj outdir name [cut: another name's, if not its own]
# Writes `<name>_body.txt` (the builder's `mh_rope` reads it: points bound to the head, a shade for each, and
# triangles with their places in the image), `<name>_body_view.obj` to look at, and with `BLEND=path` the Blender
# file. Coordinates are MakeHuman's base.obj: y up, the face towards +z, 0.1 = 1 cm. Angles are seen from the hair
# scripts' centre of the head (`hairlib.Head.hc`): the hairline lies near 20 degrees, the brows near -25.
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import bpy
from hairlib import Head, dirs, ang, unit, tangent, bind_points

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
base, out, name = argv[:3]
cut = argv[3] if len(argv) > 3 else name

STEP = 0.02          # a bundle's way is traced in steps of 2 mm
VSCALE = 0.75        # the image's height to a unit of a bundle's length (10 cm), as the locks' image
W = dirs(180, 52)    # the whorl

# A cut: where the hair ends in front of the face and at the sides and back (degrees), how high it stands
# (`lift`: a factor on every height below) and how round its bundles are (`round`: a factor on every `flat`), the
# shell under the bundles (its height over the skin, how far above the cut it ends, its tone), how much thinner
# the hair is at its ends and over what length, and the layers of bundles from the lowest to the topmost.
# `comb`: the hair is combed, neighbours lie the same way: how far all bundles swing to the side together and the
# length of that swing along the hair (the swing's place changes slowly round the head), and how far the bundles
# of a side lean one way together at their ends, over what length before the end.
# A layer: how many bundles round the head (`n`); their breadth as a share of the room each has between its
# neighbours at the cut (`fit`; `vary`: how far a bundle's place is off the even one, as a share of the even room:
# broad and narrow bundles side by side, and none missing) or in units (`w`: least, greatest: single strands);
# how high a bundle's ridge stands over its middle, as a share of its half breadth (`flat`); its middle's height
# over the skin (`h`); how far from the whorl its bundles begin (`roots`, radians: one of these in turn round the
# head) or how long they are (`long`: least, greatest); how far up or down the cut's line a bundle ends (`ends`,
# degrees: least, greatest); the length of its slanted end (`tip`); how far it swings to the side by itself
# (least, greatest) and the length of that swing as a share of its own (least, greatest): a bow; how much it
# leans over to one flank (`roll`); its tone against the hair's colour. `curl` (a cut's): how far a bundle swings
# to the side and off the head, and the length of a wave: curly hair.
# All PLACEHOLDER by eye, beside the reference's bowl cuts (docs/PORTRAITS.md, round 109).
BOWL = dict(
    cut=-12.5, end=-43.0, over=(8, 6, 35, 30), lift=1.0, round=1.0,
    comb=(0.03, 1.6, 0.12, 0.8),
    shell=dict(h=0.085, up=9.0, shade=0.75),
    thin=0.35, thin_over=0.5,
    layers=[
        dict(n=52, fit=1.6, vary=0.25, flat=0.16, h=0.115, long=(1.2, 1.8), ends=(-0.5, 0.8), tip=(0.03, 0.06), wave=(0.003, 0.01, 1.2, 2.2), roll=0.15, tone=0.95, seed=3),
        dict(n=34, fit=1.25, vary=0.35, flat=0.2, h=0.155, roots=(0.1, 0.55, 0.3, 0.55), ends=(-1.2, 1.2), tip=(0.04, 0.09), wave=(0.004, 0.015, 1.2, 2.2), roll=0.35, tone=1.0, seed=5),
        dict(n=16, w=(0.05, 0.09), flat=0.4, h=0.18, roots=(0.15, 0.4, 0.25, 0.45), ends=(-1.0, 7.0), tip=(0.1, 0.2), wave=(0.015, 0.04, 1.0, 1.8), roll=0.2, tone=1.1, seed=7),
    ],
)

# The cuts by the name of their file: England's men, boys and small children (`portrait/src/dress.rs`
# `ENGLAND_1356`)
CUTS = {
    'bob01': BOWL,                                          # to the ear's lower end
    'bob06': dict(BOWL, end=-31.0),                         # to above the ear
    'bob07': dict(BOWL, end=-51.0),                         # to the jaw
    'bob02': dict(BOWL, lift=0.22, round=0.6),              # under a hood: lying flat
    'bob03': dict(BOWL, recede=(34.0, 11.0, 22.0)),         # gone back at the temples: the fringe's line rises there
    'bob04': dict(BOWL, lift=0.25, round=0.6, bare=True),    # a horseshoe round a bare top
    'bob05': dict(BOWL, curl=(0.04, 0.03, 0.65)),          # curls
    'bob08': dict(BOWL, cut=2.0, end=-38.0, lift=0.75),     # a small child's: the fringe cut high
}
# A girl's and a young woman's hair: parted in the middle, drawn down over the ears to the place below each ear
# where her plait begins (`styles.py`, style `plait`: `to` that place, `by` the temple the front hair goes by,
# `line` the hairline's table). No shell: the hair lies close, and the painted layer on the scalp is under it.
# Its layers: `part` bundles begin side by side along the parting, from the forehead over the top and down the
# back of the head (`n` on each side); `edge` bundles begin along the hairline from the forehead's middle to in
# front of the ear, where the hair comes out of the skin; `under` bundles begin anywhere in the hair below them.
# `rise`: how much higher a bundle lies for every unit it has run (those that have come furthest lie on top where
# all run together); `gather`: how near the place below the ear a bundle ends (radians: least, greatest) and how
# much of its breadth it has left there.
PARTED = dict(
    parted=True, to=(92.0, -44.0), by=(60.0, 4.0), over=(8, 6, 35, 30, -50, -42), trend=14, lift=1.0, round=1.0,
    line=[(0, 8), (20, 4.9), (32, -2.4), (44, -8.4), (58, -13), (66, -17.5), (71, -24), (75, -20), (78, -12), (84, -12), (102, -12), (112, -16), (126, -28), (145, -40), (165, -46), (180, -48)],
    comb=(0.012, 0.7, 0.0, 1.0),
    shell=dict(h=0.02),
    layers=[
        dict(kind='under', n=44, w=(0.2, 0.32), flat=0.14, h=0.03, rise=0.012, gather=(0.1, 0.3, 0.35), wave=(0.002, 0.008, 1.2, 2.2), roll=0.15, tone=0.92, seed=3),
        dict(kind='edge', n=11, fit=1.5, vary=0.25, flat=0.18, h=0.036, rise=0.016, gather=(0.1, 0.3, 0.3), wave=(0.002, 0.008, 1.2, 2.2), roll=0.2, tone=0.97, seed=4),
        dict(kind='part', n=24, fit=1.35, vary=0.3, flat=0.2, h=0.05, rise=0.02, gather=(0.06, 0.2, 0.3), wave=(0.003, 0.01, 1.2, 2.2), roll=0.3, tone=1.0, seed=5),
        dict(kind='part', n=7, w=(0.05, 0.09), flat=0.4, h=0.062, rise=0.02, gather=(0.1, 0.5, 0.5), wave=(0.008, 0.02, 1.0, 1.8), roll=0.2, tone=1.1, seed=7),
    ],
)
CUTS['plait01'] = PARTED
C = CUTS[cut]
LIFT, ROUND = C['lift'], C['round']
SEED = sum(map(ord, cut))          # each cut with random numbers of its own: no two cuts wear the same bundles

H = Head(base)
hc = H.hc
cover = C['over']


def beside(th, el):
    g = np.clip((np.abs(th) - cover[2]) / cover[3], 0, 1)
    g = g * g * (3 - 2 * g)
    if len(cover) > 4:
        # hair that goes on down the neck lies on the neck: nothing of the bow below, all of it above
        e = np.clip((el - cover[4]) / (cover[5] - cover[4]), 0, 1)
        g = g * e * e * (3 - 2 * e)
    return g


# the skin as hair takes it: past the ears in one bow (`hairlib.py` `write_locks`, `<key>_LOCK_OVER`, `_TREND`)
OVER = H.covered(cover[0], cover[1], beside, trend=C.get('trend', 0.0))
# what the points are bound to: hair that goes on below the ear lies on the neck, and goes with it
BIND = Head(base, ymin=3.9, hc=H.hc) if C.get('parted') else H


def smooth(g):
    g = np.clip(g, 0, 1)
    return g * g * (3 - 2 * g)


def flow(d):
    """The way hair lies: away from the whorl on top, down at the sides (the bob's of `styles.py`); parted hair
    from the parting down the side, in front by the temple, to the place below the ear (its `plait`'s)."""
    th, el = ang(d)
    if C.get('parted'):
        side = np.where(d[..., 0] >= 0, 1.0, -1.0)
        to = dirs(side * C['to'][0], C['to'][1] + 0 * side)
        by = dirs(side * C['by'][0], C['by'][1] + 0 * side)
        f = (np.clip((C['by'][0] - 5 - np.abs(th)) / 20, 0, 1) * np.clip((el - C['by'][1]) / 12, 0, 1))[..., None]
        k = np.clip((el - 35) / 40, 0, 1)[..., None]
        across = tangent(side[..., None] * np.array([1.0, 0, 0]), d)
        return unit((1 - k) * tangent((1 - f) * to + f * by - d, d) + k * across)
    t = tangent(d - W, d)
    a = np.arccos(np.clip((d * W).sum(-1), -1, 1))
    whorl = unit(t + 0.25 * np.exp(-a / 0.45)[..., None] * np.cross(d, t))
    down = tangent(np.broadcast_to(np.array([0, -1.0, 0]), d.shape).copy(), d)
    w = np.clip((62 - el) / 35, 0, 1)[..., None]
    return unit((1 - w) * whorl + w * down)


def level(th):
    """The line the hair is cut at, in degrees: the fringe's in front of the face, the cut's at the sides and back."""
    f = smooth((np.abs(th) - 45) / 25)
    front = C['cut']
    if 'recede' in C:
        at, wide, up = C['recede']
        front = front + up * np.exp(-0.5 * ((np.abs(th) - at) / wide) ** 2)
    return front * (1 - f) + C['end'] * f


def bare(th):
    """The upper edge of a horseshoe of hair round a bare top (`styles.py` `BARE`), in degrees."""
    return np.interp(np.abs(th), [0, 45, 60, 80, 100, 130, 180], [-30, -6, 16, 30, 35, 40, 42]) + 2.5 * np.sin(np.radians(th) * 9 + 1.0)


def rim(n, rng, jitter=0.25):
    """n places on the cut's line, each a little off the even one, and the room each has between its neighbours
    (a place is the middle of its room: no room is left out). Round the whole head, or round as much of it as a
    horseshoe has hair."""
    th = np.arange(0, 360, 0.25)
    th = np.where(th > 180, th - 360, th)                  # from the face's middle round by one side, the back, the other
    if C.get('bare'):
        th = th[bare(th) - level(th) > 14]
    P = OVER.at(dirs(th, level(th)), 0.1)
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    run = np.concatenate([[0], np.cumsum(seg)])
    whole = run[-1] + (0 if C.get('bare') else np.linalg.norm(P[0] - P[-1]))
    if C.get('bare'):
        n = max(4, int(round(n * whole / 6.2)))
    at = (np.arange(n) + rng.uniform(-jitter, jitter, n) + (0.5 if C.get('bare') else rng.random())) * whole / n
    right = 0.5 * (at + np.roll(at, -1))
    left = np.roll(right, 1)
    if C.get('bare'):
        left[0], right[-1] = 0.0, whole
    else:
        right[-1] = 0.5 * (at[-1] + at[0] + whole)
        left[0] = right[-1] - whole
    k = np.clip(np.searchsorted(run, 0.5 * (left + right) % whole), 0, len(th) - 1)
    return th[k], right - left


def trace_back(d0, stop, most, under):
    """From each end up against the hair's way, until so near the whorl (`stop`, radians), so long (`most`), or
    (a horseshoe) so near under its upper edge (`under`, degrees). Returns for each bundle its directions from
    its beginning to its end."""
    d = d0.copy()
    ways = [[p] for p in d0]
    alive = np.ones(len(d0), bool)
    for i in range(1, int(np.max(most) / STEP) + 1):
        dn = unit(d - flow(d) * (STEP / OVER.skin(d))[:, None])
        a = np.arccos(np.clip(dn @ W, -1, 1))
        alive &= (a > stop) & (i * STEP <= most)
        if C.get('bare'):
            th, el = ang(dn)
            alive &= bare(th) - el > under
        if not alive.any():
            break
        d = np.where(alive[:, None], dn, d)
        for k in np.where(alive)[0]:
            ways[k].append(d[k])
    return [np.array(w[::-1]) for w in ways]


def bundles(L, rng):
    """The bands of one layer: for each its rings (n rings of m corners), their places in the image, the point each
    ring is bound to the head by, and a shade for each ring."""
    th_end, room = rim(L['n'], rng, L.get('vary', 0.25))
    n = len(th_end)
    ends = rng.uniform(L['ends'][0], L['ends'][1], n)
    d_end = dirs(th_end, level(th_end) + ends)
    if 'roots' in L:
        stop = np.array([L['roots'][k % len(L['roots'])] for k in range(n)]) * rng.uniform(0.85, 1.2, n)
        most = np.full(n, 6.0)
        under = rng.uniform(1.0, 14.0, n)
    else:
        stop = np.full(n, 0.08)
        most = rng.uniform(L['long'][0], L['long'][1], n)
        under = rng.uniform(8.0, 20.0, n)
    ways = trace_back(d_end, stop, most, under)
    # how many bundles of the layer there are at a distance from the whorl: there a bundle has that share of the
    # way round the whorl for itself, and is no broader
    begun = np.sort([np.arccos(np.clip(w[0] @ W, -1, 1)) for w in ways])
    curl = C.get('curl')
    out_ = []
    for k, D in enumerate(ways):
        if len(D) < 12:
            continue
        run0 = np.arange(len(D)) * STEP
        total = run0[-1]
        width = L['fit'] * room[k] if 'fit' in L else rng.uniform(L['w'][0], L['w'][1])
        tl = min(rng.uniform(L['tip'][0], L['tip'][1]), 0.45 * total)
        rl = min(0.3, 0.3 * total)
        # rings: one every 5 mm along its length (curly hair: every 3), closer in its end
        run = np.concatenate([np.arange(0, total - tl, 0.03 if curl else 0.05), total - tl + tl * np.linspace(0, 1, 9) ** 0.8])
        d = unit(np.stack([np.interp(run, run0, D[:, i]) for i in range(3)], -1))
        a = np.arccos(np.clip(d @ W, -1, 1))
        fan = np.inf if C.get('bare') else 1.15 * 2 * np.pi * np.sin(np.minimum(a, np.pi / 2)) * OVER.skin(d) / np.maximum(np.searchsorted(begun, a, side='right'), 1)
        e = np.clip((run - (total - tl)) / tl, 0, 1)                 # 0..1 along its end
        r = np.clip(run / rl, 0, 1)                                   # 0..1 along its beginning
        hw = 0.5 * np.minimum(width, fan) * (0.25 + 0.75 * smooth(r)) * (1 - e)
        # its way: a swing to either side as long as the bundle and longer (a bow, not a wave), and its end cut
        # at a slant, the point on one flank's line
        side = unit(np.cross(d, unit(np.gradient(d, axis=0))))
        A, lam = rng.uniform(L['wave'][0], L['wave'][1]), total * rng.uniform(L['wave'][2], L['wave'][3])
        off = A * np.sin(2 * np.pi * run / lam + rng.uniform(0, 2 * np.pi)) * smooth(run / 0.4) + rng.choice([-1, 1]) * rng.uniform(0.5, 0.95) * hw[np.argmax(e > 0) - 1] * e ** 1.3
        # combed: neighbours swing together, and the bundles of a side lean one way together at their ends
        # (both by the way still to go to the end: bundles side by side have the same, wherever they began)
        tk, cb = np.radians(th_end[k]), C['comb']
        off = off + cb[0] * np.sin(2 * np.pi * (total - run) / cb[1] + 2.5 * np.sin(2 * tk + 0.3 + SEED) + 1.5 * np.sin(5 * tk + 1.1)) * smooth(run / 0.4)
        off = off + cb[2] * np.sin(2 * tk + 0.8 + SEED) * np.exp(-(total - run) / cb[3])
        up = 0.0
        if curl:
            # (neighbours wave nearly together: a head of waves, not of worms)
            ph = 2.5 * np.sin(2 * tk + 0.3 + SEED) + rng.uniform(-0.9, 0.9, 2) + np.array([0, 1.3])
            ramp = smooth(run / (0.5 * curl[2]))
            lc = curl[2] * rng.uniform(0.92, 1.1)
            off = off + curl[0] * ramp * np.sin(2 * np.pi * run / lc + ph[0])
            up = curl[1] * ramp * (0.5 + 0.5 * np.sin(2 * np.pi * run / lc + ph[1]))
        d = unit(d + side * (off / OVER.skin(d))[:, None])
        # its height over the skin: it comes up from under the shell, and the hair is thinner towards its ends
        thin = 1 - C['thin'] * smooth((run - (total - C['thin_over'])) / C['thin_over'])
        low = C['shell']['h'] - 0.03
        h = LIFT * (low + (L['h'] - low) * smooth(run / 0.35)) * thin + LIFT * rng.uniform(-0.006, 0.006) + up
        ht = ROUND * L['flat'] * hw
        h = np.maximum(h, ht + 0.004)                                 # its flanks stay off the skin
        roll = L['roll'] * rng.uniform(-1, 1) * ROUND
        out_.append(lay(d, h, hw, ht, roll, run, L['tone'] * float(np.clip(rng.lognormal(0, 0.1), 0.78, 1.25)) * (0.7 + 0.3 * smooth(run / 0.3)), rng))
    return out_


def parted(L, rng):
    """The bands of one layer of parted hair, as `bundles` gives a cut's."""
    line = np.array(C['line'], float)
    to0, to1 = C['to']
    front = np.interp(0, line[:, 0], line[:, 1]) + 6           # the parting begins a centimetre behind the hairline
    span = (90 - front) + (90 - to1)                            # degrees along the parting: over the top, down the back
    out_ = []
    for sgn in (1.0, -1.0):
        n = L['n']
        if L['kind'] == 'part':
            jit = L.get('vary', 0.25)
            at = (np.arange(n) + rng.uniform(-jit, jit, n) + 0.5) * span / n
            right = 0.5 * (at + np.roll(at, -1)); left = np.roll(right, 1)
            left[0], right[-1] = 0.0, span
            mid = 0.5 * (left + right)
            d0 = np.where((mid <= 90 - front)[:, None], dirs(0 * mid, front + mid), dirs(180 + 0 * mid, 90 - (mid - (90 - front))))
            d0 = unit(d0 + sgn * np.array([0.004, 0, 0]))
            room = np.radians(right - left) * OVER.skin(d0)
            key = np.radians(mid)
        elif L['kind'] == 'edge':
            jit = L.get('vary', 0.25)
            at = 4 + (np.arange(n) + rng.uniform(-jit, jit, n) + 0.5) * 62 / n
            right = 0.5 * (at + np.roll(at, -1)); left = np.roll(right, 1)
            left[0], right[-1] = 4.0, 66.0
            mid = 0.5 * (left + right)
            d0 = dirs(sgn * mid, np.interp(mid, line[:, 0], line[:, 1]) + 3.5)
            room = np.linalg.norm(OVER.at(dirs(sgn * right, np.interp(right, line[:, 0], line[:, 1]) + 3.5), 0 * mid) - OVER.at(dirs(sgn * left, np.interp(left, line[:, 0], line[:, 1]) + 3.5), 0 * mid), axis=1)
            key = np.radians(mid)
        else:
            # anywhere in the hair of this side, a finger's breadth and more inside the hairline
            P = unit(np.random.default_rng(L['seed'] + (0 if sgn > 0 else 1)).normal(size=(n * 40, 3)))
            th, el = ang(P)
            P = P[(P[:, 0] * sgn > 0.1) & (el - np.interp(np.abs(th), line[:, 0], line[:, 1]) > 6)][:n]
            d0, room, key = P, np.zeros(len(P)), np.radians(ang(P)[1])
        near = rng.uniform(L['gather'][0], L['gather'][1], len(d0))
        G = dirs(sgn * to0, to1)
        d = d0.copy()
        ways = [[p] for p in d0]
        alive = np.ones(len(d0), bool)
        for i in range(1, int(4.0 / STEP)):
            dn = unit(d + flow(d) * (STEP / OVER.skin(d))[:, None])
            alive &= np.arccos(np.clip(dn @ G, -1, 1)) > near
            if not alive.any():
                break
            d = np.where(alive[:, None], dn, d)
            for k in np.where(alive)[0]:
                ways[k].append(d[k])
        for k, way in enumerate(ways):
            if len(way) < 12:
                continue
            D = np.array(way)
            if L['kind'] == 'part':
                # it begins across the parting, under the hair of the other side
                D = np.concatenate([unit(D[:1] - sgn * np.array([0.012, 0, 0])), D])
            run0 = np.arange(len(D)) * STEP
            total = run0[-1]
            width = L['fit'] * room[k] if 'fit' in L else rng.uniform(L['w'][0], L['w'][1])
            tl = min(0.1, 0.3 * total)
            rl = 0.12 if L['kind'] == 'part' else min(0.3, 0.3 * total)
            run = np.concatenate([np.arange(0, total - tl, 0.05), total - tl + tl * np.linspace(0, 1, 5)])
            d = unit(np.stack([np.interp(run, run0, D[:, i]) for i in range(3)], -1))
            a = np.arccos(np.clip(d @ G, -1, 1))
            e = np.clip((run - (total - tl)) / tl, 0, 1)
            r = np.clip(run / rl, 0, 1)
            # drawn to one place: the nearer it, the narrower
            g = L['gather'][2] + (1 - L['gather'][2]) * smooth((a - near[k]) / 0.8)
            begin = 1.0 if L['kind'] == 'part' else 0.25 + 0.75 * smooth(r)
            hw = 0.5 * width * g * begin * (1 - 0.8 * e)
            side = unit(np.cross(d, unit(np.gradient(d, axis=0))))
            A, lam = rng.uniform(L['wave'][0], L['wave'][1]), total * rng.uniform(L['wave'][2], L['wave'][3])
            cb = C['comb']
            off = A * np.sin(2 * np.pi * run / lam + rng.uniform(0, 2 * np.pi)) * smooth(run / 0.4)
            off = off + cb[0] * np.sin(2 * np.pi * run / cb[1] + 2.5 * np.sin(1.3 * key[k] + SEED)) * smooth(run / 0.3) * smooth((a - near[k]) / 0.4)
            d = unit(d + side * (off / OVER.skin(d))[:, None])
            h = LIFT * (L['h'] + L['rise'] * run) * (0.2 + 0.8 * smooth(r)) + LIFT * rng.uniform(-0.004, 0.004)
            ht = ROUND * L['flat'] * hw
            h = np.maximum(h, ht + 0.004)
            roll = L['roll'] * rng.uniform(-1, 1) * ROUND
            out_.append(lay(d, h, hw, ht, roll, run, L['tone'] * float(np.clip(rng.lognormal(0, 0.1), 0.78, 1.25)) * (0.75 + 0.25 * smooth(run / 0.2)), rng))
    return out_


def lay(d, h, hw, ht, roll, run, shade, rng, m=7):
    """A band laid over the skin: its middle's directions, its height, half breadth and half thickness ring by
    ring, how much it leans to one flank; its rings, their places in the image, the points they are bound by."""
    turn = np.linspace(-np.pi / 2, np.pi / 2, m)
    c = OVER.at(d, h)
    n0 = unit(c - hc)
    b = unit(np.cross(unit(np.gradient(c, axis=0)), n0))
    lat = hw[:, None] * np.sin(turn)[None, :]
    q = c[:, None, :] + b[:, None, :] * lat[..., None]
    dd = unit(q - hc)
    rings = hc + dd * (OVER.skin(dd) + h[:, None] + ht[:, None] * (2 * np.cos(turn)[None, :] - 1) + roll * lat)[..., None]
    u = np.linspace(0, 1, m) if rng.random() < 0.5 else np.linspace(1, 0, m)
    uv = np.stack(np.broadcast_arrays(u[None, :], (rng.random() + run * VSCALE)[:, None]), -1)
    return rings, uv, c, shade


def shell():
    """The shell under the bundles: the skull's form a little off the skin, from the top (a horseshoe: from under
    its upper edge, where it comes out of the skin) to just above the cut."""
    S = C['shell']
    th = np.arange(-180, 180, 5.0)
    q = np.linspace(0, 1, 22)[1:]
    thin = 1 - C['thin'] * smooth((q - 0.75) / 0.25)
    if C.get('bare'):
        th = th[bare(th) - level(th) > 14]
        q = np.linspace(0, 1, 12)
        thin = (1 - C['thin']) * smooth(q / 0.3)
        top_el = bare(th) - 5.0
    else:
        top_el = np.full(len(th), 90.0)
    el = top_el[None, :] + (level(th)[None, :] + S['up'] - top_el[None, :]) * q[:, None]
    d = dirs(np.broadcast_to(th[None, :], el.shape), el)
    P = OVER.at(d, np.maximum(LIFT * S['h'] * thin[:, None] * np.ones_like(el), 0.003))
    n = len(th)
    verts = list(P.reshape(-1, 3))
    uvs = [(t / 45.0, 1.5 * qq) for qq in q for t in th]
    tris = []
    closed = not C.get('bare')
    for i in range(len(q) - 1):
        for j in range(n):
            if (th[(j + 1) % n] - th[j]) % 360 > 6:       # a horseshoe is open in front of the face
                continue
            # (counter-clockwise seen from outside: the builder reads the surface's direction from the triangles)
            a, b_, c_, d_ = i * n + j, i * n + (j + 1) % n, (i + 1) * n + j, (i + 1) * n + (j + 1) % n
            tris += [(a, c_, b_), (b_, c_, d_)]
    if closed:
        verts.append(OVER.at(np.array([0, 1.0, 0]), np.array(LIFT * S['h'])))
        uvs.append((0.5, 0.0))
        for j in range(n):
            tris.append((len(verts) - 1, j, (j + 1) % n))
    return np.array(verts), uvs, tris, S['shade']


verts, anchors, shades, tris, tri_uv = [], [], [], [], []
for L in C['layers']:
    for rings, uv, anc, shade in (parted if C.get('parted') else bundles)(L, np.random.default_rng(L['seed'] + 100 * SEED)):
        n, m = rings.shape[:2]
        o = len(verts)
        verts += list(rings.reshape(-1, 3))
        anchors += list(np.repeat(anc, m, axis=0))
        shades += list(np.repeat(shade, m))
        for s in range(n - 1):
            for j in range(m - 1):
                a, b_, c_, d_ = o + s * m + j, o + s * m + j + 1, o + (s + 1) * m + j, o + (s + 1) * m + j + 1
                ua, ub, uc, ud = uv[s, j], uv[s, j + 1], uv[s + 1, j], uv[s + 1, j + 1]
                tris.append((a, b_, c_)); tri_uv.append((tuple(ua), tuple(ub), tuple(uc)))
                tris.append((b_, d_, c_)); tri_uv.append((tuple(ub), tuple(ud), tuple(uc)))
if not C.get('parted'):
    sv, suv, stris, sshade = shell()
    o = len(verts)
    verts += list(sv)
    anchors += list(sv)
    shades += [sshade] * len(sv)
    for t in stris:
        tris.append(tuple(o + i for i in t)); tri_uv.append(tuple(suv[i] for i in t))
verts = np.array(verts); anchors = np.array(anchors); shades = np.array(shades)

# The same as a Blender object (to look at, to work on by hand, to bake), in base.obj's coordinates
me = bpy.data.meshes.new(name + '_body')
me.from_pydata([tuple(v) for v in verts], [], [tuple(t) for t in tris])
lay = me.uv_layers.new(name='UVMap')
for p in me.polygons:
    for k, li_ in enumerate(p.loop_indices):
        lay.data[li_].uv = tri_uv[p.index][k]
ob = bpy.data.objects.new(name + '_body', me)
scene = bpy.context.scene
for o_ in list(scene.objects):
    bpy.data.objects.remove(o_)
scene.collection.objects.link(ob)
# The shade between the bundles, baked in Blender (Cycles, ambient occlusion per corner, the head standing in the
# hair): a furrow between two ridges, a bundle's beginning under its neighbours and the shell behind them see
# less of the sky than a ridge does. `AO=dist,samples,floor,power` (0: none): how far a place looks, how often,
# how dark a place that sees nothing is drawn, and the measure's power.
AO = [float(t) for t in os.environ.get('AO', '0.15,96,0.4,1.0').split(',')]
if AO[0] > 0:
    hm = bpy.data.meshes.new('head')
    hm.from_pydata([tuple(v) for v in H.V], [], [tuple(int(i) for i in t) for t in H.T])
    scene.collection.objects.link(bpy.data.objects.new('head', hm))
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = int(AO[1])
    if scene.world is None:
        scene.world = bpy.data.worlds.new('world')
    scene.world.light_settings.distance = AO[0] * max(LIFT, 0.4)
    me.materials.append(bpy.data.materials.new('hair'))
    col = me.color_attributes.new('ao', 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = col
    for o_ in scene.objects:
        o_.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    ao = np.array([c.color[0] for c in me.color_attributes['ao'].data])
    print('shade: mean', round(float(ao.mean()), 3), 'lowest tenth', round(float(np.quantile(ao, 0.1)), 3), 'highest tenth', round(float(np.quantile(ao, 0.9)), 3))
    shades = shades * (AO[2] + (1 - AO[2]) * np.clip(ao, 0, 1) ** AO[3])
if os.environ.get('BLEND'):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.environ['BLEND']))

os.makedirs(out, exist_ok=True)
bind = bind_points(BIND, verts, anchors)
with open(os.path.join(out, name + '_body.txt'), 'w') as f:
    f.write(f'{len(bind)} {len(tris)} {int(os.environ.get("EVEN", "6"))}\n')
    for (r, w_, o_), s in zip(bind, shades):
        f.write(' '.join(map(str, r)) + ' ' + ' '.join(f'{x:.6f}' for x in list(w_) + list(o_)) + f' {s:.3f}\n')
    for t, uv in zip(tris, tri_uv):
        # v as in OBJ files (up from the bottom): the reader flips it
        f.write(' '.join(map(str, t)) + ' ' + ' '.join(f'{u:.6f} {1 - v:.6f}' for u, v in uv) + '\n')
with open(os.path.join(out, name + '_body_view.obj'), 'w') as f:
    for p in verts:
        f.write('v %.5f %.5f %.5f\n' % tuple(p))
    for t in tris:
        f.write('f %d %d %d\n' % (t[0] + 1, t[1] + 1, t[2] + 1))
print(cut, name, 'corners', len(verts), 'triangles', len(tris))
