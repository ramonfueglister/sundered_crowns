# Hair as a modelled body (round 109), built in Blender: a dark shell over the skull, and on it layers of thick
# bundles that run from the whorl to the line the hair is cut at, each a ridge with flanks, frayed into wisps at
# its end (round 138; until then cut at a slant). Until round 108 a head's hair was some 950 narrow locks, each
# begun where its strands were rooted: scales all over the head and a fringe of stepped bands. A bundle here
# begins under the bundles above it and shows its length and its end only.
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
# to the side and off the head, and the length of a wave: curly hair. `turn` (a cut's, round 133): at the
# sides and behind each bundle's end is turned out and up into a roll (not over the forehead: from 45 degrees
# round, in full from 70): through how many degrees (least, greatest), the roll's radius (least, greatest: of the
# roll's middle over the topmost layer), how far at most it runs to the side for each radian turned (a corkscrew,
# not a hoop), how much of the shade the bake gives the turned band's underside is taken back, how much of the
# roll's length the bundle's slanted end may take, and how much of its breadth the bundle has left where it ends.
# `fray` (a cut's, round 138): a bundle that is not turned keeps its breadth to its end and is parted there into
# wisps side by side, each narrowing to a point of its own: over what length before the end (least, greatest), a
# wisp's breadth, the least share of that length a wisp has (one has all of it), how much flatter a wisp is at
# its point than the bundle, and how far its point may lie outside its own share of the breadth (`lay(frayed=)`).
# A layer's `fray` (round 141; False: its bundles are not frayed) and `point` (how much of the slant its end is
# cut at is left, and a power on the way along its end by which it narrows): a lock, broad along its length,
# narrowing over `tip` to a point near its middle, as a leaf does. Since round 141 a bowl cut has two layers
# of such locks over its two layers of bundles (in place of a third of single strands), few and broad, ending
# at heights of their own above the cut's line: until then some hundred bundles of one breadth ran side by side
# from the crown to that line, a comb. The bundles under them keep the fringe as thick as it was. A cut's
# `locks`: a factor on how high its locks' ridges stand and how much they lean (hair that lies flat under a hood or
# a hat).
# All PLACEHOLDER by eye, beside the reference's bowl cuts (docs/PORTRAITS.md, round 109).
# (round 147) `cut` -5 degrees (-12.5 until then): the fringe ends on the middle of the forehead, as the
# reference's bowl cuts do; at -12.5 it ended two fingers over the eyes, on the brows in a picture.
_e = lambda k, d: [float(t) for t in os.environ.get(k, d).split(',')]
BOWL = dict(
    cut=-5.0, end=-43.0, over=(8, 6, 35, 30), lift=1.0, round=1.0,
    comb=(0.03, 1.6, 0.12, 0.8),
    shell=dict(h=0.085, up=9.0, shade=0.75),
    thin=0.35, thin_over=0.5,
    fray=tuple(_e('FRAY', '0.08,0.2,0.035,0.45,0.6,0.25')),
    layers=[
        dict(n=52, fit=1.6, vary=0.25, flat=0.16, h=0.115, long=(1.2, 1.8), ends=(-0.5, 0.8), tip=(0.03, 0.06), wave=(0.003, 0.01, 1.2, 2.2), roll=0.15, tone=0.95, seed=3),
        dict(n=34, fit=1.25, vary=0.35, flat=0.2, h=0.155, roots=(0.1, 0.55, 0.3, 0.55), ends=(-1.2, 1.2), tip=(0.04, 0.09), wave=(0.004, 0.015, 1.2, 2.2), roll=0.35, tone=1.0, seed=5),
        dict(n=26, fit=1.4, vary=0.35, flat=0.3, h=0.17, roots=(0.1, 0.55, 0.3, 0.55), ends=(1.0, 5.0), tip=(0.25, 0.5), fray=False, point=(0.4, 1.6), wave=(0.01, 0.03, 1.2, 2.2), roll=0.35, tone=1.02, seed=11),
        dict(n=16, fit=1.25, vary=0.4, flat=0.36, h=0.195, roots=(0.15, 0.4, 0.25, 0.45), ends=(4.0, 10.0), tip=(0.3, 0.6), fray=False, point=(0.4, 1.6), wave=(0.02, 0.05, 1.0, 1.8), roll=0.3, tone=1.06, seed=7),
    ],
)

# The cuts by the name of their file: England's men, boys and small children (`portrait/src/dress.rs`
# `ENGLAND_1356`)
CUTS = {
    'bob01': BOWL,                                          # to the ear's lower end
    'bob06': dict(BOWL, end=-31.0),                         # to above the ear
    'bob07': dict(BOWL, end=-51.0),                         # to the jaw
    'bob02': dict(BOWL, lift=0.22, round=0.6, locks=0.15),   # under a hood: lying flat
    'bob03': dict(BOWL, recede=(34.0, 11.0, 22.0)),         # gone back at the temples: the fringe's line rises there
    'bob04': dict(BOWL, lift=0.25, round=0.6, locks=0.15, bare=True),    # a horseshoe round a bare top
    'bob05': dict(BOWL, curl=(0.04, 0.03, 0.65)),          # curls
    'bob08': dict(BOWL, cut=2.0, end=-38.0, lift=0.75),     # a small child's: the fringe cut high
    # to the jaw, its ends turned out and up (round 133); all PLACEHOLDER by eye
    'bob09': dict(BOWL, end=_e('TURN_END', '-62')[0], locks=0.5, turn=tuple(_e('TURN', '140,220,0.07,0.09,0.003,0.85,0.3,0.5'))),
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
# A woman's hair under a veil that is set back on the head (round 121; `portrait/src/dress.rs` `hair_veiled`,
# `Veil::Back`): parted as a girl's, laid over the ears and on to the nape, where it is pinned up under the veil
# (`to`: there is no plait; `by`: lower at the temple, so that the hair covers the ear down to its lobe). In
# front of the veil's rim it is fuller than a girl's and begins lower on the forehead (`lift`; `PART_DROP`:
# degrees at the forehead's middle, none from 60 degrees to the side); under the veil it lies as flat as hers
# (`veil`: the veil's rim as a table like `line`, read off the draped veil `cloth_veil_back` in this script's
# angles; over how many degrees in front of the rim the hair comes to its full height; how much of the lift is
# left under the cloth). The painted layer and the scalp under it are the girl's. All PLACEHOLDER by eye.
VEIL_RIM = [(0, 50.6), (33, 47.5), (45, 40.4), (53, 21), (60, 8), (68, -14), (77, -34), (85, -45), (120, -45)]
CUTS['part01'] = dict(
    PARTED, to=tuple(_e('PART_TO', '130,-58')), by=tuple(_e('PART_BY', '64,-14')), lift=_e('PART_LIFT', '1.5')[0],
    veil=(VEIL_RIM, *_e('PART_VEIL', '10,0')),
    line=[(th, el - _e('PART_DROP', '2.5')[0] * max(0.0, min(1.0, (60 - th) / 28))) for th, el in PARTED['line']],
)
# A man's hair parted in the middle and cut at the jaw (round 125; `portrait/src/dress.rs` `hair_lengths`): the
# parted hair's bundles, not drawn to a plait but falling free past the temple and over the ear, and cut where
# they cross a level line (`end`, degrees, as a bowl cut's; `ends`: how far above or below it a bundle ends).
# `to` lies far below the ear, so that the hair's way there is down; it stands as high off the head as a bowl
# cut's (`lift`) and swings as combed hair does (`comb`). Its bundles keep their breadth to the end (`gather`'s
# third number 1). The parting runs on down the back of the head as a girl's does. No painted layer and no scalp
# of its own: the builder takes the girl's (`DressSet::under_of`). All PLACEHOLDER by eye, beside the reference's
# men with hair to the jaw.
CUTS['page01'] = dict(
    PARTED, to=tuple(_e('PAGE_TO', '100,-85')), by=tuple(_e('PAGE_BY', '64,-14')), lift=_e('PAGE_LIFT', '2.2')[0],
    end=_e('PAGE_END', '-50')[0], ends=tuple(_e('PAGE_ENDS', '-2.5,2.5')), comb=tuple(_e('PAGE_COMB', '0.025,0.9,0,1')),
    layers=[dict(L, gather=(0.05, 0.1, 1.0)) for L in PARTED['layers']], fray=BOWL['fray'],
)
# The same in waves (round 130): `waves`: how far the bundles swing to the side and off the head, the length of a
# wave, and how far from a bundle's beginning the waves begin. All PLACEHOLDER by eye.
CUTS['page02'] = dict(CUTS['page01'], waves=tuple(_e('PAGE_WAVES', '0.055,0.04,0.7,0.3')))
# A small girl's hair, worn down (round 162; `portrait/src/dress.rs` `hair_small`): parted as `page01`, not cut at
# the jaw but hanging to over the shoulders (`end`), and hanging: from the head's middle down it lies in no
# direction nearer the head's upright than it does above (`hang`: from how many degrees down), where `page01`
# goes in under the ear to the neck. Closer to the head than a man's (`lift`). All PLACEHOLDER by eye.
CUTS['loose01'] = dict(
    CUTS['page01'], to=tuple(_e('LOOSE_TO', '170,-87')), end=_e('LOOSE_END', '-60')[0], ends=tuple(_e('LOOSE_ENDS', '-3,3')), lift=_e('LOOSE_LIFT', '1.7')[0],
    hang=_e('LOOSE_HANG', '0')[0], part_to=_e('LOOSE_PART', '-25')[0],
)
# Tightly curled hair (round 111): no bundles and no strands that run anywhere. Each hair is a coil of a few
# millimetres, and a head of them is one springy mass that stands off the skull the same height all round, its
# surface small tufts side by side, its edge the hairline itself. `h`: how high the mass stands over the skin;
# `edge`: its height at the hairline as a share of that, and over how many degrees inside the line it comes to its
# full height; `ragged`: by how many degrees the mass ends inside or outside the line, and the size of that
# unevenness (units): no hairline is drawn with a compass; `tufts`: sizes of the tufts and how high each size
# stands (two sizes, one on the other); `bare`: a horseshoe round a bare top (`bare`'s line); `grid`:
# degrees between the rays from the whorl, and the rings along a ray; `line`: the hairline (parted hair's);
# `shade`: its tone. All PLACEHOLDER by eye: no picture of the reference shows such hair (its pictures here are of
# Europeans), and nothing was read on how it was worn in 1356.
COILY = dict(
    coily=True, over=(8, 6, 35, 30), lift=1.0, round=1.0, line=PARTED['line'],
    h=0.16, edge=(0.03, 10.0), ragged=(1.6, 0.05), tufts=((0.06, 0.02), (0.028, 0.011)), grid=(2.0, 72), shade=0.92,
)
CUTS['coil01'] = COILY                                  # a man's: a thumb's breadth high
CUTS['coil02'] = dict(COILY, h=0.36, edge=(0.03, 12.0), tufts=((0.08, 0.03), (0.035, 0.014)))  # a woman's: fuller
CUTS['coil03'] = dict(COILY, h=0.07, edge=(0.05, 6.0), tufts=((0.05, 0.012), (0.025, 0.007)))   # a small child's, and a head that loses its hair: close
CUTS['coil04'] = dict(COILY, h=0.09, edge=(0.05, 6.0), tufts=((0.05, 0.012), (0.025, 0.007)), bare=True)   # a horseshoe round a bare top
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
if 'hang' in C:
    # hair that hangs (round 162): going down from `hang` degrees, no nearer the head's upright than above
    _low = OVER.EL <= C['hang']
    _rho = (OVER.R * np.cos(np.radians(OVER.EL))[None, :])[:, _low]
    OVER.R = OVER.R.copy()
    OVER.R[:, _low] = np.maximum.accumulate(_rho[:, ::-1], axis=1)[:, ::-1] / np.cos(np.radians(OVER.EL[_low]))[None, :]
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
    curl, turn, fray = C.get('curl'), C.get('turn'), C.get('fray')
    # (the wisps draw random numbers of their own: a bundle is what it was up to where it frays)
    wrng = np.random.default_rng(L['seed'] + 100 * SEED + 7919)
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
        rolled = None
        # (a turned end: not over the forehead, where the fringe hangs as it is cut; the rolls of all layers lie
        # in one another, round one middle `turn[2..3]` over the topmost layer, so a lower layer's is the wider;
        # a ring every 1.2 mm of it, and it begins before the bundle narrows to its point)
        deg = rng.uniform(turn[0], turn[1]) * smooth((abs(th_end[k]) - 45) / 25) if turn else 0.0
        if deg > 20:
            R = rng.uniform(turn[2], turn[3]) + 0.88 * LIFT * (max(l['h'] for l in C['layers']) - L['h'])
            lf = min(R * np.radians(deg), 0.4 * total)
            tl = min(tl, turn[6] * lf)
            before = np.arange(0, total - lf - 0.02, 0.05)
            run = np.concatenate([before, total - lf + np.linspace(0, lf, max(int(lf / 0.012) + 1, 8))])
            rolled = (len(before), np.clip((run - (total - lf)) / R, 0, None), R, rng.uniform(-turn[4], turn[4]))
        # (a frayed end, round 138: the band keeps its breadth to its end and is parted there into wisps)
        frayed = None
        if fray and rolled is None and L.get('fray', True):
            tl = min(wrng.uniform(fray[0], fray[1]), 0.45 * total)
            before = np.arange(0, total - tl - 0.02, 0.03 if curl else 0.05)
            run = np.concatenate([before, total - tl + np.linspace(0, tl, 9)])
            frayed = len(before)
        d = unit(np.stack([np.interp(run, run0, D[:, i]) for i in range(3)], -1))
        a = np.arccos(np.clip(d @ W, -1, 1))
        fan = np.inf if C.get('bare') else 1.15 * 2 * np.pi * np.sin(np.minimum(a, np.pi / 2)) * OVER.skin(d) / np.maximum(np.searchsorted(begun, a, side='right'), 1)
        e = np.clip((run - (total - tl)) / tl, 0, 1)                 # 0..1 along its end
        r = np.clip(run / rl, 0, 1)                                   # 0..1 along its beginning
        # (a turned end keeps `turn`'s eighth number of its breadth: a roll does not end in a claw)
        # (a lock, round 141: its end narrows by a power of the way along it, and is cut at less of a slant)
        pt = L.get('point', (1.0, 1.0)) if rolled is None else (1.0, 1.0)
        hw = 0.5 * np.minimum(width, fan) * (0.25 + 0.75 * smooth(r)) * (1 - (0 if frayed else 1 - turn[7] if rolled else 1) * e ** pt[1])
        # its way: a swing to either side as long as the bundle and longer (a bow, not a wave), and its end cut
        # at a slant, the point on one flank's line
        side = unit(np.cross(d, unit(np.gradient(d, axis=0))))
        A, lam = rng.uniform(L['wave'][0], L['wave'][1]), total * rng.uniform(L['wave'][2], L['wave'][3])
        off = A * np.sin(2 * np.pi * run / lam + rng.uniform(0, 2 * np.pi)) * smooth(run / 0.4) + (0 if frayed else pt[0]) * rng.choice([-1, 1]) * rng.uniform(0.5, 0.95) * hw[np.argmax(e > 0) - 1] * e ** 1.3
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
        low_ = C.get('locks', 1.0) if 'point' in L else 1.0          # (a lock under a hood: flat, and not leaning)
        ht = ROUND * L['flat'] * hw * low_
        h = np.maximum(h, ht + 0.004)                                 # its flanks stay off the skin
        roll = L['roll'] * rng.uniform(-1, 1) * ROUND * low_
        out_ += lay(d, h, hw, ht, roll, run, L['tone'] * float(np.clip(rng.lognormal(0, 0.1), 0.78, 1.25)) * (0.7 + 0.3 * smooth(run / 0.3)), rng, rolled=rolled, frayed=frayed, wrng=wrng)
    return out_


def free(d):
    """How high parted hair stands at a place, as a factor: the cut's `lift`, and under a veil (`veil`) what is
    left of it over 1, from a finger's breadth in front of the rim."""
    if 'veil' not in C:
        return LIFT + 0 * d[..., 0]
    rim, band, left = C['veil']
    rim = np.array(rim, float)
    th, el = ang(d)
    return 1 + (LIFT - 1) * (left + (1 - left) * smooth((np.interp(np.abs(th), rim[:, 0], rim[:, 1]) - el) / band))


def parted(L, rng):
    """The bands of one layer of parted hair, as `bundles` gives a cut's."""
    line = np.array(C['line'], float)
    to0, to1 = C['to']
    front = np.interp(0, line[:, 0], line[:, 1]) + 6           # the parting begins a centimetre behind the hairline
    # degrees along the parting: over the top, down the back (as far as the place the hair goes to, or `part_to`)
    span = (90 - front) + (90 - C.get('part_to', to1))
    wrng = np.random.default_rng(L['seed'] + 100 * SEED + 7919)
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
        # (hair that is cut: each bundle ends where it crosses the cut's line, a little above or below it)
        low = C['end'] + rng.uniform(C['ends'][0], C['ends'][1], len(d0)) if 'end' in C else None
        G = dirs(sgn * to0, to1)
        d = d0.copy()
        ways = [[p] for p in d0]
        alive = np.ones(len(d0), bool)
        for i in range(1, int(4.0 / STEP)):
            dn = unit(d + flow(d) * (STEP / OVER.skin(d))[:, None])
            alive &= np.arccos(np.clip(dn @ G, -1, 1)) > near
            if low is not None:
                alive &= ang(dn)[1] > low
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
            # (hair that is cut ends frayed, as a bowl cut's: round 138)
            frayed = None
            if 'fray' in C:
                tl = min(wrng.uniform(C['fray'][0], C['fray'][1]), 0.3 * total)
                before = np.arange(0, total - tl - 0.02, 0.05)
                run = np.concatenate([before, total - tl + np.linspace(0, tl, 9)])
                frayed = len(before)
            d = unit(np.stack([np.interp(run, run0, D[:, i]) for i in range(3)], -1))
            a = np.arccos(np.clip(d @ G, -1, 1))
            e = np.clip((run - (total - tl)) / tl, 0, 1)
            r = np.clip(run / rl, 0, 1)
            # drawn to one place: the nearer it, the narrower
            g = L['gather'][2] + (1 - L['gather'][2]) * smooth((a - near[k]) / 0.8)
            begin = 1.0 if L['kind'] == 'part' else 0.25 + 0.75 * smooth(r)
            hw = 0.5 * width * g * begin * (1 - (0 if frayed else 0.8) * e)
            side = unit(np.cross(d, unit(np.gradient(d, axis=0))))
            A, lam = rng.uniform(L['wave'][0], L['wave'][1]), total * rng.uniform(L['wave'][2], L['wave'][3])
            cb = C['comb']
            off = A * np.sin(2 * np.pi * run / lam + rng.uniform(0, 2 * np.pi)) * smooth(run / 0.4)
            off = off + cb[0] * np.sin(2 * np.pi * run / cb[1] + 2.5 * np.sin(1.3 * key[k] + SEED)) * smooth(run / 0.3) * smooth((a - near[k]) / 0.4)
            up = 0.0
            if 'waves' in C:
                # waved hair: the bundles of a side swing together, to the side and off the head, by the way still
                # to go to the cut (bundles side by side have the same, wherever they began), each a little off
                # its neighbours
                ws, wu, wl, w0 = C['waves']
                ph = 2 * np.pi * (total - run) / (wl * rng.uniform(0.98, 1.02)) + 1.2 * np.sin(1.3 * key[k] + SEED) + rng.uniform(-0.2, 0.2)
                ramp = smooth((run - w0) / 0.4)
                off = off + ws * ramp * np.sin(ph)
                up = wu * ramp * (0.5 + 0.5 * np.sin(ph + 1.3))
            d = unit(d + side * (off / OVER.skin(d))[:, None])
            lift = free(d)
            h = lift * (L['h'] + L['rise'] * run) * (0.2 + 0.8 * smooth(r)) + lift * rng.uniform(-0.004, 0.004) + up
            ht = ROUND * L['flat'] * hw
            h = np.maximum(h, ht + 0.004)
            roll = L['roll'] * rng.uniform(-1, 1) * ROUND
            out_ += lay(d, h, hw, ht, roll, run, L['tone'] * float(np.clip(rng.lognormal(0, 0.1), 0.78, 1.25)) * (0.75 + 0.25 * smooth(run / 0.2)), rng, frayed=frayed, wrng=wrng)
    return out_


def lay(d, h, hw, ht, roll, run, shade, rng, m=7, rolled=None, frayed=None, wrng=None):
    """A band laid over the skin: its middle's directions, its height, half breadth and half thickness ring by
    ring, how much it leans to one flank. Returns its pieces, for each its rings, their places in the image, the
    points they are bound by, a shade for each ring and for each ring how far it is turned off the head (0: not).
    `rolled`: from that ring on the band leaves the skin and turns out and up in a roll (each ring's angle, the
    radius, the way to the side for a radian): the ring where it begins, carried round, as broad as the band is
    there; the roll is bound by the place it begins at.
    `frayed` (round 138): the band ends at that ring, and from there on it is parted into wisps side by side (the
    cut's `fray`: a wisp's breadth, the least share of the frayed length a wisp has, how much flatter it is at its
    point, how far its point may lie outside its own share of the breadth), each a piece of its own that lies in
    the band's own surface and narrows to a point: hair ends one hair after the other, not as a block."""
    turn = np.linspace(-np.pi / 2, np.pi / 2, m)
    if frayed is not None:
        # the wisps' edges are corners of every ring of the band, so that a wisp begins on the band's last ring,
        # corner on corner: the breadth shared out evenly, each edge a little off the even place (a band of two
        # wisps has the seven corners of any other; one of three or four keeps a corner on each flank)
        wide, least, flat, astray = C['fray'][2:6]
        nw = int(np.clip(round(2 * hw[frayed] / wide), 2, 7))
        first = [0, 3, 6]
        if nw > 2:
            edges = (np.arange(nw + 1) + np.concatenate([[0], wrng.uniform(-0.25, 0.25, nw - 1), [0]])) / nw * 2 - 1
            flank = [0.87] if nw < 5 else []
            turn = np.arcsin(np.concatenate([[-1.0], [-f for f in flank], edges[1:-1], flank, [1.0]]))
            first = [0] + [len(flank) + k for k in range(1, nw)] + [len(turn) - 1]
        m = len(turn)
    c = OVER.at(d, h)
    n0 = unit(c - hc)
    b = unit(np.cross(unit(np.gradient(c, axis=0)), n0))

    def arch(c_, b_, h_, hw_, ht_, a_):
        # the band's surface at the angles `a_` across it (a quarter turn to either flank), ring by ring
        lat = hw_[:, None] * np.sin(a_)
        dd = unit(c_[:, None, :] + b_[:, None, :] * lat[..., None] - hc)
        return hc + dd * (OVER.skin(dd) + h_[:, None] + ht_[:, None] * (2 * np.cos(a_) - 1) + roll * lat)[..., None]

    rings = arch(c, b, h, hw, ht, turn[None, :])
    out = np.zeros(len(c))
    if rolled is not None:
        i0, phi, R, drift = rolled
        t0 = unit(c[i0] - c[i0 - 1])
        n = unit(c[i0] - hc)
        n = unit(n - t0 * (n @ t0))
        b0 = np.cross(t0, n)
        rel = rings[i0] - c[i0]
        lt, ln, lb = rel @ t0, rel @ n, rel @ b0
        # (the band's arch turns over as it rolls: its ridge stays on the side that is seen)
        out = smooth((phi - 0.8) / 1.4)
        lit = smooth(phi / 1.0)
        for k in range(i0 + 1, len(c)):
            s, cp, sp = hw[k] / hw[i0], np.cos(phi[k]), np.sin(phi[k])
            cen = c[i0] + t0 * R * sp + n * R * (1 - cp) + b0 * drift * phi[k]
            rings[k] = cen + s * (lb[:, None] * b0 + lt[:, None] * (t0 * cp + n * sp) + (1 - 2 * out[k]) * ln[:, None] * (n * cp - t0 * sp))
        c = c.copy()
        c[i0 + 1:] = c[i0]
        out = lit
    flip = rng.random() >= 0.5
    u = turn / np.pi + 0.5 if frayed is not None else np.linspace(0, 1, m)
    u = 1 - u if flip else u
    v0 = rng.random()
    uv = np.stack(np.broadcast_arrays(u[None, :], (v0 + run * VSCALE)[:, None]), -1)
    if frayed is None:
        return [(rings, uv, c, shade, out)]
    i0 = frayed
    pieces = [(rings[:i0 + 1], uv[:i0 + 1], c[:i0 + 1], shade[:i0 + 1], out[:i0 + 1])]
    share = wrng.uniform(least, 1.0, nw)
    share[wrng.integers(nw)] = 1.0                                  # one of them as long as the band
    along = lambda x, at: np.stack([np.interp(at, run, x[:, i]) for i in range(3)], -1) if x.ndim == 2 else np.interp(at, run, x)
    for j in range(nw):
        cols = np.arange(first[j], first[j + 1] + 1)
        a0, a1 = turn[cols[0]], turn[cols[-1]]
        mid = 0.5 * (a0 + a1)
        point = mid + wrng.uniform(-1, 1) * (0.5 + astray) * (a1 - a0)
        t = np.linspace(0, 1, 6)
        at = run[i0] + t * share[j] * (run[-1] - run[i0])
        a_ = (mid + (point - mid) * t ** 1.5)[:, None] + (turn[cols] - mid)[None, :] * (1 - t ** 1.6)[:, None]
        a_ = np.clip(a_, -np.pi / 2, np.pi / 2)
        cw = along(c, at)
        wr = arch(cw, unit(along(b, at)), along(h, at), along(hw, at), along(ht, at) * (1 - flat * t), a_)
        wr[0], cw[0] = rings[i0, cols], c[i0]                      # (to the last digit: the builder takes them for one)
        uw = a_ / np.pi + 0.5
        wuv = np.stack([1 - uw if flip else uw, np.broadcast_to((v0 + at * VSCALE)[:, None], uw.shape)], -1)
        wuv[0] = uv[i0, cols]
        pieces.append((wr, wuv, cw, along(shade, at), np.zeros(len(at))))
    return pieces


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


def lattice(P, seed):
    """Smooth noise over space, 0 to 1: random values at the corners of a grid of unit cubes, blended between."""
    i = np.floor(P).astype(np.int64)
    f = P - i
    f = f * f * (3 - 2 * f)
    out_ = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                x, y, z = i[..., 0] + dx, i[..., 1] + dy, i[..., 2] + dz
                hsh = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (seed * 2654435761)
                hsh = (hsh ^ (hsh >> 13)) * 1274126177
                r = ((hsh ^ (hsh >> 16)) & 0xffff) / 65535.0
                out_ = out_ + r * np.where(dx, f[..., 0], 1 - f[..., 0]) * np.where(dy, f[..., 1], 1 - f[..., 1]) * np.where(dz, f[..., 2], 1 - f[..., 2])
    return out_


def fleece():
    """Tightly curled hair: one mass over the skull from the whorl to the hairline, as rays from the whorl (no
    ray's end is seen from the front), its surface tufts. As `shell` gives its own: points, their places in the
    image, triangles, tone."""
    line = np.array(C['line'], float)
    step, rings = C['grid']
    phi = np.radians(np.arange(0, 360, step))
    e1 = unit(np.cross(W, np.array([1.0, 0, 0])))
    e2 = np.cross(W, e1)
    ray = np.cos(phi)[:, None] * e1 + np.sin(phi)[:, None] * e2

    def at(a):
        return np.cos(a)[..., None] * W + np.sin(a)[..., None] * ray

    # how far along each ray the hairline lies
    a = np.radians(np.arange(1.0, 175.0, 0.25))
    D = at(a[:, None] * np.ones(len(phi))[None, :])
    th, el = ang(D)
    inside = el > np.interp(np.abs(th), line[:, 0], line[:, 1])
    far = a[np.argmax(~inside, axis=0)]
    # (evened out round the whorl: a ray's end is not a corner of the line's table)
    for _ in range(2):
        far = 0.25 * np.roll(far, 1) + 0.5 * far + 0.25 * np.roll(far, -1)
    # (and uneven at the size of a tuft)
    rag, size = C['ragged']
    far = far + np.radians(rag) * (2 * lattice(OVER.at(at(far), 0 * far) / size, SEED + 7) - 1)
    t = np.linspace(0, 1, rings + 1)[1:]
    d = at(t[:, None] * far[None, :])
    rim_ = d[-1]
    # how far inside the hairline a point is, in degrees (to the line's nearest point)
    near = np.degrees(np.arccos(np.clip(np.einsum('ijk,lk->ijl', d, rim_), -1, 1))).min(-1)
    grow = smooth(near / C['edge'][1])
    if C.get('bare'):
        # a horseshoe: nothing above its upper edge, and coming up from the skin below it
        th_, el_ = ang(d)
        top = smooth((bare(th_) - el_) / 9.0)
        grow = grow * top
    h = LIFT * C['h'] * (C['edge'][0] + (1 - C['edge'][0]) * grow)
    P0 = OVER.at(d, h)
    for k, (size, high) in enumerate(C['tufts']):
        h = h + LIFT * high * (2 * lattice(P0 / size + 31.7 * k, SEED + k) - 1) * (0.25 + 0.75 * grow)
    # its edge goes into the skin: a mass that ended a hair's breadth over the skin would end in a line of light
    P = OVER.at(d, np.where(grow < 0.02, -0.012, np.maximum(h, 0.003)))
    n = len(phi)
    verts = [OVER.at(W, np.array(LIFT * C['h']))] + list(P.reshape(-1, 3))
    uvs = [(0.0, 0.0)] + [(float(ph) * 0.95, float(tt * fa) * 0.95) for tt in t for ph, fa in zip(phi, far)]
    tris = [(0, 1 + (j + 1) % n, 1 + j) for j in range(n)]
    for i in range(rings - 1):
        for j in range(n):
            q0, q1, q2, q3 = 1 + i * n + j, 1 + i * n + (j + 1) % n, 1 + (i + 1) * n + j, 1 + (i + 1) * n + (j + 1) % n
            tris += [(q0, q1, q2), (q1, q3, q2)]
    if C.get('bare'):
        # (no triangle on the bare top)
        on = np.concatenate([[0.0], top.reshape(-1)]) > 0.0
        tris = [t_ for t_ in tris if on[list(t_)].any()]
    V = np.array(verts)
    # counter-clockwise seen from outside (the builder reads the surface's direction from the triangles)
    q = np.array(tris[len(tris) // 2])
    if np.dot(np.cross(V[q[1]] - V[q[0]], V[q[2]] - V[q[0]]), V[q[0]] - hc) < 0:
        tris = [(t_[0], t_[2], t_[1]) for t_ in tris]
    # a triangle's places in the image: the seam where the rays have come round once is a jump of the image there
    tuv = []
    for t_ in tris:
        uv = [list(uvs[i]) for i in t_]
        us = [u for u, _ in uv]
        if max(us) - min(us) > np.pi * 0.95:
            uv = [[u + (2 * np.pi * 0.95 if u < np.pi * 0.95 else 0), v] for u, v in uv]
        tuv.append(tuple(tuple(x) for x in uv))
    return V, tuv, tris, C['shade']


verts, anchors, shades, tris, tri_uv, turned = [], [], [], [], [], []
if C.get('coily'):
    sv, stuv, stris, sshade = fleece()
    verts, anchors, shades = list(sv), list(sv), [sshade] * len(sv)
    tris, tri_uv = list(stris), list(stuv)
for L in C.get('layers', []):
    for rings, uv, anc, shade, over in (parted if C.get('parted') else bundles)(L, np.random.default_rng(L['seed'] + 100 * SEED)):
        n, m = rings.shape[:2]
        o = len(verts)
        turned += [(o + i * m + j, w) for i, w in enumerate(over) if w > 0 for j in range(m)]
        verts += list(rings.reshape(-1, 3))
        anchors += list(np.repeat(anc, m, axis=0))
        shades += list(np.repeat(shade, m))
        for s in range(n - 1):
            for j in range(m - 1):
                a, b_, c_, d_ = o + s * m + j, o + s * m + j + 1, o + (s + 1) * m + j, o + (s + 1) * m + j + 1
                ua, ub, uc, ud = uv[s, j], uv[s, j + 1], uv[s + 1, j], uv[s + 1, j + 1]
                tris.append((a, b_, c_)); tri_uv.append((tuple(ua), tuple(ub), tuple(uc)))
                tris.append((b_, d_, c_)); tri_uv.append((tuple(ub), tuple(ud), tuple(uc)))
if not C.get('parted') and not C.get('coily'):
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
    # (a band that is turned over shows its underside, which the bake reads as facing the head: `turn`'s sixth
    # number of the way to an open place's shade is given back to it)
    for i, w in turned:
        ao[i] += (1 - ao[i]) * w * C['turn'][5]
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
