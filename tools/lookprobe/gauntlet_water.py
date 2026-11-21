"""The gauntlet of the water: pictures of the world probe against pictures of EU5's map (as a bar of quality only).

Usage: python3 tools/lookprobe/gauntlet_water.py picture.png[:x0,y0,x1,y1] ...   (the measurements of each picture)
       python3 tools/lookprobe/gauntlet_water.py --gauntlet <folder>              (the rows of the bar, green or red)
The part after the colon cuts the picture to that rectangle (the reference's panels and buttons are left out so).
The folder holds the pictures of the scenes in SCENES, as tools/lookprobe/water_shots.sh takes them.
For each picture it finds the water (blue to cyan, not grey) and measures, by the distance of each dot of water
from the nearest dot that is not water (the shore):
  - the colour by the shore (4 to 20 dots out) and on the open water (from 80 dots out), in CIELAB, and their hues
  - how full in colour the water is against the land beside it (the medians of their saturation)
  - how much lighter the water by the shore is than the open water (the shallows)
  - the chop: how much the water's lightness varies from dot to dot (lightness less its blur over 3 dots)
  - the flecks and glints: the share of open water at least 14 lighter than its surroundings
  - the stripes: how much of the chop lies in its single strongest wave (a regular pattern of a few sines gives
    one bright peak in the picture's spectrum; a natural sea spreads its energy)
  - the shore line: how much lighter the water's first 3 dots are than the water 6 to 12 dots out (surf, wet sand)

EU5's water changes with the distance it is seen from, and the bars are read off its pictures of each distance
(SCENES): 16 screenshots from its Steam page and 23 of the players' most liked ones from its Steam community (19 and
20 November 2026; kept outside the repository, in the project's files under wasser/referenz_eu5 and
wasser/referenz_eu5/zoomstufen, each cut to its water without the panels):
  - nearest (an island or a coast across the picture; z_140, z_025, z_058, z_170): open water L 43 to 56, the
    shallows 5 to 12 lighter, chop 1.8 to 2.4, white flecks 0.07 to 0.39 %;
  - the middle distance (a sea across; z_143, z_201, z_133): smooth (chop 0.7 to 1.0), the shelves 8 to 23 lighter
    than the deep water, no flecks;
  - far (half the Mediterranean; z_128, z_046): smooth, the shelves 9 lighter, as haloes round the coasts;
  - everywhere the water is as full in colour as the land, or fuller (0.87 to 3.1), its hue 217 to 270 degrees, by
    the shore greener (by 0 to 29).
The first round (19 November 2026) held the water at every distance to EU5's nearest (a fine natural chop, a muted
blue): 30 of 30 rows of its own bar, but it looked like a photograph laid into the model. The second round (20
November) holds each distance to its own kind, and the colour to the land's.

Where the water moves (MOVES), the scene is also taken a frame (1/30 s) and half a second later (MOMENTS,
water_frames.mjs), and two more rows hold the motion: the water moves (the mean change of its lightness in half a
second) and does not flicker (few dots change much from one frame to the next: a fleck that pops up or vanishes at
once, or glitter that jumps). These two bars are not read off EU5 (no moving pictures of it were at hand) but set by
what they are for: a change one can see in half a second, and none that jumps. A third row holds the foam along the
coast (sea_shore.ts): how much more of the water within FOAM_COLUMNS columns of the shore is white than of the open
water beyond (where only the wind's flecks are), over the three moments.

The fifth round (20 November 2026) leaves EU5's nearest view behind where Ramon found it wrong: "man sieht extrem
weit rausgezoomt immer noch wellen" and "gibt es schöneres wasser auch im poly bereich nicht?". From EU5's nearest
distance on the water is calm, as the low-poly worlds' is: 'nah' is held to the middle distance's chop and flecks,
and no longer moves; only the diorama does, and its coasts have foam.

The sixth round (21 November 2026) holds the foam's lines to smooth bows: in round 5 they ran in zigzags from corner
to corner of the water's columns. A fourth row of the diorama measures how fast the lines of foam turn, in degrees to
a dot along them (FOAM_BENDS; round 5: 2.1).

The eighth round (21 November 2026) works on the near water itself (Ramon: "das wasser ist das problem nicht die
umgebung"): the bed shows through the shallows, the open water is rippled, and the two thick rows of foam round every
coast are a thin line at the water's edge. So the foam's row turns round: by the same measure EU5's nearest pictures
have 0.1 to 0.9 points more white by the shore than on the open water (z_025, z_058, z_140; within 35 dots of the
shore), rounds 5 and 6 had 4 to 5, and the bar is a most, no longer a least. Measured beside it, not as rows (in
EU5's pictures they are the scene's as much as the water's): the open water's lightness over the picture, blurred
over 25 dots, between its 5th and 95th hundredth, EU5 12 to 17, round 6 2 to 4, round 8 6.5 to 7; and the open
water's colour, EU5 z_140 L 54, a -17, b -13, round 6 56, -17, -30, round 8 57, -19, -21.
"""

import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def srgb_to_lab(rgb):
    c = rgb / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    lab_l = 116 * f[..., 1] - 16
    return np.stack([lab_l, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def water_mask(rgb):
    r, g, b = rgb[..., 0].astype(float), rgb[..., 1].astype(float), rgb[..., 2].astype(float)
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    s = (mx - mn) / np.maximum(mx, 1)
    # blue-ish: blue the largest or green and blue together well above red (turquoise), and not grey
    m = (b >= g - 30) & (b > r + 25) & (s > 0.28) & (mx > 40)
    # foam, glints and boats on the water count as water where they lie within it (holes of up to 1500 dots that
    # are pale or grey on the whole, not the green or yellow of a small island), so that the distance from the
    # shore is the distance from the land
    # (the picture's edge is no shore: the mask is carried on past it while it is smoothed)
    pad = 4
    m = np.pad(m, pad, mode='edge')
    m = ndi.binary_opening(ndi.binary_closing(m, iterations=2), iterations=1)[pad:-pad, pad:-pad]
    holes, n_holes = ndi.label(ndi.binary_fill_holes(m) & ~m)
    if n_holes:
        ids = range(1, n_holes + 1)
        pale = ndi.mean(s, holes, ids) < 0.3
        small = np.flatnonzero((ndi.sum(np.ones_like(m), holes, ids) <= 1500) & pale) + 1
        m = m | np.isin(holes, small)
    # and so does the foam along the coast (sea_shore.ts), which touches the land and so is no hole: light dots
    # within 6 dots of the water, bluish where the foam is mixed into the water's colour, and where it is white,
    # white in the sun's warm light (a little redder than blue, as the white walls are); the land's pale stone by the
    # water is darker (the quays' walls in their shade) or redder, its sand fuller
    foam = (mx > 150) & (((s < 0.35) & (b > r + 3)) | ((s < 0.12) & (b > r - 16)))
    m = m | (foam & ndi.binary_dilation(m, iterations=6))
    lab, n = ndi.label(m)
    if n == 0:
        return m
    sizes = ndi.sum(m, lab, range(1, n + 1))
    keep = np.isin(lab, 1 + np.flatnonzero(sizes > 4000))
    return keep


def hue(lab):
    """the hue angle of a colour in CIELAB, in degrees (0 to 360: about 200 cyan, 260 blue)"""
    return float(np.degrees(np.arctan2(lab[2], lab[1])) % 360)


def peak_share(lum_hp, dist):
    """share of the chop's energy in its strongest wave, over the largest square of open water (0: none found)"""
    h, w = dist.shape
    yy, xx = np.mgrid[0:h, 0:w]
    inside = np.minimum(dist, 1.5 * np.minimum(np.minimum(yy, h - 1 - yy), np.minimum(xx, w - 1 - xx)))
    y, x = np.unravel_index(np.argmax(inside), dist.shape)
    dist = inside
    half = int(min(dist[y, x] / 1.5, 128))
    if half < 48:
        return float('nan')
    patch = lum_hp[y - half : y + half, x - half : x + half]
    patch = patch - patch.mean()
    win = np.outer(np.hanning(patch.shape[0]), np.hanning(patch.shape[1]))
    p = np.abs(np.fft.fftshift(np.fft.fft2(patch * win))) ** 2
    c = np.array(p.shape) // 2
    p[c[0] - 1 : c[0] + 2, c[1] - 1 : c[1] + 2] = 0
    # a peak and its mirror image are one wave; a 3x3 neighbourhood holds a windowed peak
    pk = ndi.uniform_filter(p, 3) * 9
    return float(2 * pk.max() / max(p.sum(), 1e-9))


def measure(path, box=None):
    rgb = np.asarray(Image.open(path).convert('RGB'))
    if box:
        x0, y0, x1, y1 = box
        rgb = rgb[y0:y1, x0:x1]
    m = water_mask(rgb)
    lab = srgb_to_lab(rgb.astype(float))
    dist = ndi.distance_transform_edt(m)
    lum = lab[..., 0]
    hp = lum - ndi.gaussian_filter(lum, 3)
    near = (dist >= 4) & (dist <= 20)
    open_ = dist >= 80
    if open_.sum() < 2000:
        open_ = dist >= 40
    edge = (dist >= 1) & (dist <= 3)
    ring = (dist >= 6) & (dist <= 12)
    inner = dist >= 30
    local = ndi.uniform_filter(lum, 15)
    # how full a colour is against the fullest of its hue and lightness that a screen shows (HSV's saturation: the
    # chroma of CIELAB would hold a blue to a green's fullness, which no blue of the water's lightness reaches)
    rgb_f = rgb.astype(float)
    full = (rgb_f.max(-1) - rgb_f.min(-1)) / np.maximum(rgb_f.max(-1), 1)
    # the land: what lies more than 6 dots from the water (the beaches and the water's blurred edge left out)
    land = ~ndi.binary_dilation(m, iterations=6)
    shore_lab = tuple(np.median(lab[near], 0)) if near.any() else (np.nan,) * 3
    open_lab = tuple(np.median(lab[open_], 0)) if open_.any() else (np.nan,) * 3
    out = {
        'water %': 100 * m.mean(),
        'shore L,a,b': shore_lab,
        'open L,a,b': open_lab,
        'open hue': hue(open_lab),
        'shore hue': hue(shore_lab),
        'full': float(np.median(full[dist >= 4]) / max(np.median(full[land]), 1e-6)) if land.any() else np.nan,
        'shallows dL': float(np.median(lum[near]) - np.median(lum[open_])) if near.any() and open_.any() else np.nan,
        'chop': float(hp[inner].std()) if inner.any() else np.nan,
        'glints %': float(100 * ((lum - local)[inner] > 14).mean()) if inner.any() else np.nan,
        'stripes': peak_share(hp, dist),
        'shore line dL': float(np.median(lum[edge]) - np.median(lum[ring])) if edge.any() else np.nan,
    }
    return out


# the scenes: name, address options of the world probe, and which of EU5's kinds of water it is held against:
#  'diorama' nearer than EU5 can come (a street to a town and its fields across the picture): EU5's nearest bars
#            where they fit, and the model's own look;
#  'nah'     EU5's nearest view (an island or a stretch of coast across the picture: steam_05, z_140, z_025, z_058,
#            z_170): turquoise shallows, blue beyond; calm since the fifth round (EU5 has a fine swell and a few white
#            flecks here: Ramon wants no waves this far out);
#  'mittel'  EU5's middle distance (a sea across the picture: z_143, z_201, z_133): smooth, light shelves, deep blue
#            beyond;
#  'fern'    EU5's far views before the paper map (half the Mediterranean: z_128, z_046): smooth, the shelves as light
#            haloes round the coasts.
SCENES = [
    ('d60_valencia', 'lon=-0.33&lat=39.45&wide=60', 'diorama'),
    ('d190_venezia', 'lon=12.33&lat=45.43&wide=190', 'diorama'),
    ('n1000_attika', 'lon=23.9&lat=37.85&wide=1000', 'nah'),
    ('m3000_aegaeis', 'lon=25&lat=38.3&wide=3000', 'mittel'),
    ('f12000_aegaeis', 'lon=25&lat=38.5&wide=12000', 'fern'),
]
# the bars by kind: chop (most), the shallows' lightness over the open water (least, most), the flecks and glints in
# % (least, most); from EU5's pictures of each kind (see the head)
CHOP = {'diorama': 2.4, 'nah': 1.2, 'mittel': 1.2, 'fern': 1.2}
SHALLOWS = {'diorama': (3, 15), 'nah': (4, 15), 'mittel': (5, 25), 'fern': (5, 25)}
FLECKS = {'diorama': (0.05, 1), 'nah': (0, 0.05), 'mittel': (0, 0.05), 'fern': (0, 0.05)}
# the water about as full in colour as the land beside it, at least (EU5 0.87 to 3.1; the land of the model is far
# fuller than EU5's, so its water must be too: the first round's was 0.56 to 0.79 from near and in the middle); the
# open water's hue (EU5 217 to 270 degrees), the water by the shore at least this much greener (EU5 0 to 29, mostly
# 7 to 19)
FULL = 0.85
HUE = (215, 275)
GREENER = 5
# the kinds whose water moves, the moments they are taken at (s), and the motion's bars: the mean change of the
# water's lightness in half a second (least), and the share of the water (%) whose lightness changes by more than
# FLICKER_L from one frame to the next (most)
MOVES = ('diorama',)
MOMENTS = (0, 0.0333, 0.5)
MOTION = 0.8
FLICKER, FLICKER_L = 0.3, 20
# the foam along the coast: within how many columns of the shore (a column is 1672 / wide dots, wide the scene's
# blocks across), what is white (HSV saturation below, CIELAB lightness above: no water is as light, EU5's nearest
# shallows reach L 68), and how many points of % more of the water there is white than of the open water (most:
# EU5's nearest pictures 0.1 to 0.9, a thin line at the water's edge 0.5 to 0.7, round 6's two thick rows 4 to 5)
FOAM_COLUMNS = 4
FOAM_WHITE = (0.3, 72)
FOAM = 1.0
# the lines of foam run in smooth bows: how many degrees their direction turns to a dot along them, on the median
# (most; a bow of 44 dots' radius turns 1.3 degrees to a dot, a zigzag from corner to corner of the columns, a kink
# of 45 degrees every 14 to 28 dots, 1.6 to 3.2; round 5 measured 2.1, round 6 0.9 to 1.0). A line: a white shape
# by the coast at least FOAM_LINE dots long (the flecks are shorter)
FOAM_BENDS = 1.3
FOAM_LINE = 40


def motion(folder, name):
    """the motion of a scene's water: the mean change of its lightness in half a second, and the share (%) of it that
    changes by more than FLICKER_L from one frame to the next (pictures <name>.png, <name>_1.png, <name>_2.png)"""
    lum = [
        srgb_to_lab(np.asarray(Image.open(f'{folder}/{name}{k}.png').convert('RGB')).astype(float))[..., 0]
        for k in ('', '_1', '_2')
    ]
    m = water_mask(np.asarray(Image.open(f'{folder}/{name}.png').convert('RGB')))
    inner = ndi.distance_transform_edt(m) >= 4
    move = float(np.abs(lum[2] - lum[0])[inner].mean())
    flicker = float(100 * (np.abs(lum[1] - lum[0])[inner] > FLICKER_L).mean())
    return move, flicker


def foam(folder, name, wide):
    """how many points of % more of the water within FOAM_COLUMNS columns of the shore is white than of the open water
    beyond, over the three moments"""
    rgb = np.asarray(Image.open(f'{folder}/{name}.png').convert('RGB'))
    dist = ndi.distance_transform_edt(water_mask(rgb))
    reach = max(FOAM_COLUMNS * 1672 / wide, 6)
    band, beyond = (dist >= 2) & (dist <= reach), dist > reach + 10
    more = []
    for k in ('', '_1', '_2'):
        f = np.asarray(Image.open(f'{folder}/{name}{k}.png').convert('RGB')).astype(float)
        full = (f.max(-1) - f.min(-1)) / np.maximum(f.max(-1), 1)
        white = (full < FOAM_WHITE[0]) & (srgb_to_lab(f)[..., 0] > FOAM_WHITE[1])
        more.append(100 * (white[band].mean() - white[beyond].mean()))
    return float(np.mean(more))


def bends(folder, name, wide):
    """how fast the lines of foam along the coast turn: the degrees their direction changes to a dot, on the median
    over the lines' dots and the mean over the three moments (the direction: that of the lines' edges within 3 dots,
    as the angle doubled, so that a line's two edges agree)"""
    rgb = np.asarray(Image.open(f'{folder}/{name}.png').convert('RGB'))
    dist = ndi.distance_transform_edt(water_mask(rgb))
    band = (dist >= 3) & (dist <= max(FOAM_COLUMNS * 1672 / wide, 6) + 10)
    turns = []
    for k in ('', '_1', '_2'):
        f = np.asarray(Image.open(f'{folder}/{name}{k}.png').convert('RGB')).astype(float)
        full = (f.max(-1) - f.min(-1)) / np.maximum(f.max(-1), 1)
        white = (full < FOAM_WHITE[0]) & (srgb_to_lab(f)[..., 0] > FOAM_WHITE[1]) & band
        shapes, n = ndi.label(white)
        long_ = [
            i + 1
            for i, o in enumerate(ndi.find_objects(shapes))
            if max(o[0].stop - o[0].start, o[1].stop - o[1].start) >= FOAM_LINE
        ]
        lines = np.isin(shapes, long_)
        core = ndi.binary_erosion(lines)
        if not core.any():
            continue
        soft = ndi.gaussian_filter(lines.astype(float), 1.5)
        gx, gy = ndi.sobel(soft, 1), ndi.sobel(soft, 0)
        xx, yy, xy = (ndi.gaussian_filter(v, 3) for v in (gx * gx, gy * gy, gx * gy))
        twice = np.arctan2(2 * xy, xx - yy)
        c, s = np.cos(twice), np.sin(twice)
        # (sobel's sum is 8 times the step, and the doubled angle turns twice as fast)
        turn = np.sqrt(sum(ndi.sobel(v, axis) ** 2 for v in (c, s) for axis in (0, 1))) / 16
        turns.append(float(np.degrees(np.median(turn[core]))))
    return float(np.mean(turns)) if turns else float('nan')


def rows(r, kind):
    """the rows of the bar for one scene: (name, value, green)"""
    lo, hi = SHALLOWS[kind]
    f0, f1 = FLECKS[kind]
    hue_open, hue_shore = r['open hue'], r['shore hue']
    return [
        ('Streifen <= 0.06', r['stripes'], r['stripes'] <= 0.06 or np.isnan(r['stripes'])),
        (f'Kräuselung <= {CHOP[kind]}', r['chop'], r['chop'] <= CHOP[kind]),
        (f'Sättigung zum Land >= {FULL}', r['full'], r['full'] >= FULL),
        (f'Farbton offen {HUE[0]}-{HUE[1]}', hue_open, HUE[0] <= hue_open <= HUE[1]),
        (f'Ufer grüner >= {GREENER}', hue_open - hue_shore, hue_open - hue_shore >= GREENER),
        (f'Flachwasser dL {lo}-{hi}', r['shallows dL'], lo <= r['shallows dL'] <= hi),
        (f'Flocken {f0}-{f1} %', r['glints %'], f0 <= r['glints %'] <= f1),
    ]


def gauntlet(folder):
    green = total = 0
    for name, address, kind in SCENES:
        r = measure(f'{folder}/{name}.png')
        more = []
        if kind in MOVES:
            move, flicker = motion(folder, name)
            wide = float(address.split('wide=')[1].split('&')[0])
            white, bent = foam(folder, name, wide), bends(folder, name, wide)
            more = [
                (f'Bewegung >= {MOTION}', move, move >= MOTION),
                (f'Flimmern <= {FLICKER} %', flicker, flicker <= FLICKER),
                (f'Schaumsaum <= {FOAM} %-Pkt', white, white <= FOAM),
                # (no line of foam long enough to be measured: none that could run in zigzags)
                (f'Schaumbögen <= {FOAM_BENDS} °/Pkt', bent, bent <= FOAM_BENDS or np.isnan(bent)),
            ]
        for row, v, ok in rows(r, kind) + more:
            total += 1
            green += bool(ok)
            print(f'{"GRÜN" if ok else "ROT "}  {name:16s} {row:26s} {v:7.2f}')
    print(f'{green} von {total} grün')


def fmt(v):
    if isinstance(v, tuple):
        return '/'.join(f'{x:.0f}' for x in v)
    return f'{v:.2f}'


if __name__ == '__main__':
    if sys.argv[1] == '--gauntlet':
        gauntlet(sys.argv[2])
        sys.exit(0)
    for arg in sys.argv[1:]:
        path, _, b = arg.partition(':')
        box = tuple(int(x) for x in b.split(',')) if b else None
        r = measure(path, box)
        print(path.split('/')[-1], '  '.join(f'{k} {fmt(v)}' for k, v in r.items()))
