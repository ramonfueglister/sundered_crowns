"""Colours of the realms of 1356 for the political map, in the muted key of the EU5 atlas reference.

Every realm keeps the hue it was given (its heraldic or customary colour: England red, France blue, Castile gold),
moved only as far as needed so that neighbours stand apart. Lightness and chroma are chosen inside the atlas band
(OKLCH L 0.37 ... 0.56, C 0.02 ... 0.095), measured on karte/referenz-eu5/eu5-weltkarte-1337.png: realms of Europe
L 5-50-95 % 0.37 / 0.46 / 0.53, C 0.021 / 0.055 / 0.094; sea #4d5e6a (L 0.47), land without a realm #7a716b (L 0.555).

Method: perceptual graph colouring. The realms' adjacency is weighted by the length of their common border
(public/data/geo.json edges). The cost of a colouring is
    sum over neighbours  w_ab * max(0, D - dE_ok(a, b))^2           (neighbours closer than D in OKLab)
  + sum over realms      size_a * (hue shift_a / 180)^2 * K_HUE      (big realms keep their customary hue)
  + sum over realms      ((L_a - L0)^2 + (C_a - C0)^2) * K_BAND      (stay in the middle of the band)
and is lowered by coordinate descent over sampled candidates (deterministic seed).

Writes the colours into public/data/setup_1356.json and into the state files data/history/1356/*.json.
Run: python3 tools/map/palette.py [year] [--dry]   (year: 1356 by default)
"""
import json, math, os, sys, glob, random
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
D_SMALL = 0.16      # ... and two small realms closer than this
D = 0.1            # neighbours closer than this in OKLab are pushed apart
L_LOW, L_HIGH, L0 = 0.37, 0.56, 0.48
C_LOW, C_HIGH, C0 = 0.02, 0.095, 0.055
K_HUE, K_BAND = 0.9, 0.6
GREAT = 4           # realms this many times the median size keep their hue fully (weight sqrt(size)); smaller ones less
ROUNDS, CANDIDATES = 40, 60

# The realms that the reference shows keep its colour: the median of a 9 x 9 patch inside each (ink left out) of
# karte/referenz-eu5/eu5-weltkarte-1337.png, sampled by tools/map/ref_anchors.py.
ANCHORS = {
    'alodia': '#67676f',
    'aragon': '#6e4b4b',
    'ashikaga': '#6c3748',
    'bohemia': '#6f663c',
    'castile': '#816627',
    'chagatai': '#555558',
    'cyprus': '#236355',
    'delhi': '#6d773c',
    'england': '#82453f',
    'france': '#39376e',
    'gampola': '#30573b',
    'georgia': '#744242',
    'golden_horde': '#7d6c42',
    'goryeo': '#73744f',
    'great_perm': '#826c53',
    'hafsid_tunis': '#6d6646',
    'hungary': '#6f5553',
    'jalayirid': '#6a7260',
    'khmer': '#6c7148',
    'kiev': '#526077',
    'lithuania': '#6f4e5b',
    'majapahit': '#763242',
    'makuria': '#745142',
    'mali': '#74746b',
    'mamluk': '#75623f',
    'marinid': '#765c47',
    'moscow': '#523c55',
    'naples': '#2d5664',
    'norway': '#5f6d73',
    'novgorod': '#62643d',
    'poland': '#705156',
    'portugal': '#3f5b64',
    'serbia': '#733330',
    'sicily': '#575711',
    'sukhothai': '#6f323a',
    'sweden': '#325b6b',
    'teutonic_order': '#615a5c',
    'volhynia': '#7a3e3a',
    'vyatka': '#606e7b',
    'wallachia': '#536b7f',
    'yuan': '#756c49',
}


def srgb_to_lin(v):
    v /= 255
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def lin_to_srgb(v):
    v = max(0.0, min(1.0, v))
    return round((v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055) * 255)


def to_oklch(hexc):
    r, g, b = (srgb_to_lin(int(hexc[i:i + 2], 16)) for i in (1, 3, 5))
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
    a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
    bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    return L, math.hypot(a, bb), math.degrees(math.atan2(bb, a)) % 360


def lab(L, C, h):
    return L, C * math.cos(math.radians(h)), C * math.sin(math.radians(h))


def in_gamut(L, C, h):
    _, a, b = lab(L, C, h)
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
    rgb = (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
    return all(-1e-4 <= v <= 1 + 1e-4 for v in rgb), rgb


def to_hex(L, C, h):
    ok, rgb = in_gamut(L, C, h)
    return '#%02x%02x%02x' % tuple(lin_to_srgb(v) for v in rgb)


def dist(p, q):
    a, b = lab(*p), lab(*q)
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def hue_shift(a, b):
    d = abs(a - b) % 360
    return min(d, 360 - d)


def main():
    dry = '--dry' in sys.argv
    year = int(next((a for a in sys.argv[1:] if a.isdigit()), 1356))
    setup_path = os.path.join(ROOT, 'public', 'data', f'setup_{year}.json')
    setup = json.load(open(setup_path, encoding='utf-8'))
    geo = json.load(open(os.path.join(ROOT, 'public', 'data', 'geo.json'), encoding='utf-8'))
    states, owner, L = setup['states'], setup['owner'], geo['L']
    n = len(states)
    size = [0.0] * n
    for i, o in enumerate(owner):
        if o is not None and o >= 0:
            size[o] += geo['loc']['area'][i]
    weight = defaultdict(float)
    for a, b, kind, c, _ in geo['edges']:
        if kind != 0 or a > L or b > L:
            continue
        oa, ob = owner[a - 1], owner[b - 1]
        if oa is None or ob is None or oa < 0 or ob < 0 or oa == ob:
            continue
        weight[(min(oa, ob), max(oa, ob))] += max(1, c)
    # the sea and land without a realm are neighbours of fixed colour (paint.ts SEA and SAND)
    fixed = defaultdict(list)
    sea_c, sand_c = to_oklch('#4d5e6a'), to_oklch('#7a716b')
    shore, wild = defaultdict(float), defaultdict(float)
    for a, b, kind, c, _ in geo['edges']:
        if kind == 1:
            land = min(a, b)
            o = owner[land - 1] if land <= L else None
            if o is not None and o >= 0: shore[o] += max(1, c)
        elif kind == 0 and a <= L and b <= L:
            oa, ob = owner[a - 1], owner[b - 1]
            oa = -1 if oa is None else oa; ob = -1 if ob is None else ob
            if oa >= 0 and ob < 0: wild[oa] += max(1, c)
            if ob >= 0 and oa < 0: wild[ob] += max(1, c)
    for o, w in shore.items(): fixed[o].append((sea_c, w))
    for o, w in wild.items(): fixed[o].append((sand_c, w))
    nb = defaultdict(list)
    for (a, b), w in weight.items():
        nb[a].append((b, w)); nb[b].append((a, w))
    # weights relative to a typical border, sizes relative to a typical realm
    wmed = sorted(weight.values())[len(weight) // 2] if weight else 1
    smed = sorted(s for s in size if s > 0)[len([s for s in size if s > 0]) // 2]
    orig = [to_oklch(s['color']) for s in states]
    pinned = set()
    for i, s in enumerate(states):
        if s['id'] in ANCHORS:
            orig[i] = to_oklch(ANCHORS[s['id']]); pinned.add(i)
    missing = set(ANCHORS) - {s['id'] for s in states}
    if missing: print('anchors without a realm:', missing)
    cur = [(l, c, h) if i in pinned else (min(L_HIGH, max(L_LOW, l)), min(C_HIGH, max(C_LOW, c)), h) for i, (l, c, h) in enumerate(orig)]

    def own_cost(i, p):
        l, c, h = p
        # big realms keep their customary hue; the small ones (the confetti of the Empire and Italy) may take any hue
        # that sets them apart, as on the reference, where they show every hue
        r = size[i] / smed
        big = min(1, r / GREAT) * math.sqrt(r) if r > 0 else 0.01
        if i in pinned:
            return 30 * (dist(p, orig[i]) / 0.03) ** 2
        return big * K_HUE * (hue_shift(h, orig[i][2]) / 60) ** 2 + K_BAND * (((l - L0) / 0.12) ** 2 + ((c - C0) / 0.035) ** 2) * 0.05

    def pair_cost(i, p):
        s = 0.0
        for j, w in nb[i]:
            # two small neighbours stand further apart: the confetti of small realms shows every hue, as on the reference
            d = D_SMALL if size[i] < GREAT * smed and size[j] < GREAT * smed else D
            gap = max(0.0, d - dist(p, cur[j]))
            s += (w / wmed) ** 0.5 * (gap / d) ** 2 * 10
        for q, w in fixed[i]:
            gap = max(0.0, D - dist(p, q))
            s += (w / wmed) ** 0.5 * (gap / D) ** 2 * 10
        return s

    def total_cost():
        return sum(own_cost(i, cur[i]) for i in range(n)) + sum(pair_cost(i, cur[i]) for i in range(n)) / 2

    rnd = random.Random(1356)
    print('cost before', round(total_cost(), 2))
    order = sorted(range(n), key=lambda i: -sum(w for _, w in nb[i]))
    for rnd_i in range(ROUNDS):
        moved = 0
        for i in order:
            if not nb[i] and rnd_i > 0:
                continue
            best, best_c = cur[i], own_cost(i, cur[i]) + pair_cost(i, cur[i])
            for _ in range(CANDIDATES):
                h = (orig[i][2] + rnd.gauss(0, 35 if rnd.random() < 0.7 else 90)) % 360
                p = (rnd.uniform(L_LOW, L_HIGH), rnd.uniform(C_LOW, C_HIGH), h)
                if i in pinned:
                    p = (orig[i][0] + rnd.gauss(0, 0.02), max(0.01, orig[i][1] + rnd.gauss(0, 0.01)), (orig[i][2] + rnd.gauss(0, 6)) % 360)
                if not in_gamut(*p)[0]:
                    continue
                c = own_cost(i, p) + pair_cost(i, p)
                if c < best_c - 1e-9:
                    best, best_c = p, c
            if best != cur[i]:
                cur[i] = best; moved += 1
        if rnd_i % 5 == 0 or moved == 0:
            print('round', rnd_i, 'moved', moved, 'cost', round(total_cost(), 2))
        if moved == 0:
            break
    close = [(states[a]['id'], states[b]['id'], round(dist(cur[a], cur[b]), 3)) for (a, b) in weight if dist(cur[a], cur[b]) < D * 0.6]
    print('neighbour pairs still close:', len(close), close[:15])
    colours = {s['id']: to_hex(*cur[i]) for i, s in enumerate(states)}
    for s in states[:12]:
        print(s['id'], s['color'], '->', colours[s['id']])
    if dry:
        return
    for s in states:
        s['color'] = colours[s['id']]
    json.dump(setup, open(setup_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    for f in glob.glob(os.path.join(ROOT, 'data', 'history', str(year), '*.json')):
        d = json.load(open(f, encoding='utf-8'))
        if 'states' not in d:
            continue
        for s in d['states']:
            if s['id'] in colours:
                s['color'] = colours[s['id']]
        json.dump(d, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('written')


if __name__ == '__main__':
    main()
