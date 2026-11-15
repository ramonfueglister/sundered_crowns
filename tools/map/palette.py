"""Colours of the realms of 1356 for the political map, in the muted key of the EU5 atlas reference.

Every realm keeps the hue it was given (its heraldic or customary colour: England red, France blue, Castile gold),
moved only as far as needed so that neighbours stand apart. Lightness and chroma are chosen inside the atlas band
(OKLCH L 0.44 ... 0.67, C 0.03 ... 0.11; land there: L median 0.50, 5-95 % 0.37 ... 0.67, C median 0.045, measured on karte/referenz-eu5/eu5-atlas-europa.png).

Method: perceptual graph colouring. The realms' adjacency is weighted by the length of their common border
(public/data/geo.json edges). The cost of a colouring is
    sum over neighbours  w_ab * max(0, D - dE_ok(a, b))^2           (neighbours closer than D in OKLab)
  + sum over realms      size_a * (hue shift_a / 180)^2 * K_HUE      (big realms keep their customary hue)
  + sum over realms      ((L_a - L0)^2 + (C_a - C0)^2) * K_BAND      (stay in the middle of the band)
and is lowered by coordinate descent over sampled candidates (deterministic seed).

Writes the colours into public/data/setup_1356.json and into the state files data/history/1356/*.json.
Run: python3 tools/map/palette.py [--dry]
"""
import json, math, os, sys, glob, random
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
D = 0.11            # neighbours closer than this in OKLab are pushed apart
L_LOW, L_HIGH, L0 = 0.44, 0.67, 0.55
C_LOW, C_HIGH, C0 = 0.03, 0.11, 0.065
K_HUE, K_BAND = 0.9, 0.6
ROUNDS, CANDIDATES = 40, 60

# The great realms keep the colour they have on the atlas reference (karte/referenz-eu5), read by eye from it, since
# the reference is a dim, blurred photograph whose patches mix in names and border glow; sampled patches are in
# docs/map/political-map.md. Lightness lies in the atlas band.
ANCHORS = {
    'france': '#3d3f8c', 'england': '#9a5242', 'scotland': '#a29a42', 'castile': '#b08a3c', 'portugal': '#4f8088',
    'aragon': '#9c6448', 'sweden': '#3f8aa0', 'denmark': '#94504b', 'hungary': '#9b7559',
    'poland': '#a06872', 'lithuania': '#977a98', 'bohemia': '#a08a55', 'serbia': '#8c3b34', 'bulgaria': '#9b8b70',
    'wallachia': '#7b96ad', 'naples': '#9a4f8a', 'sicily': '#a39b3c', 'novgorod': '#8b9a52', 'golden_horde': '#ae923f',
    'mamluk': '#b98549', 'granada': '#9a9a80', 'kiev': '#7888ad', 'byzantium': '#7b4f87',
    'ottoman': '#5d8a6b', 'venice': '#3f7d70', 'papal_states': '#b6ae86', 'teutonic_order': '#6e6e74', 'moscow': '#6f8c50',
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
    setup_path = os.path.join(ROOT, 'public', 'data', 'setup_1356.json')
    setup = json.load(open(setup_path, encoding='utf-8'))
    geo = json.load(open(os.path.join(ROOT, 'public', 'data', 'geo.json'), encoding='utf-8'))
    states, owner, L = setup['states'], setup['owner'], geo['L']
    n = len(states)
    size = [0.0] * n
    for i, o in enumerate(owner):
        if o is not None and o >= 0:
            size[o] += geo['loc']['area'][i]
    total = sum(size) or 1
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
    sea_c, sand_c = to_oklch('#4f6d83'), to_oklch('#a69884')
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
        big = math.sqrt(size[i] / smed) if size[i] > 0 else 0.3
        if i in pinned:
            return 30 * (dist(p, orig[i]) / 0.03) ** 2
        return big * K_HUE * (hue_shift(h, orig[i][2]) / 60) ** 2 + K_BAND * (((l - L0) / 0.12) ** 2 + ((c - C0) / 0.035) ** 2) * 0.05

    def pair_cost(i, p):
        s = 0.0
        for j, w in nb[i]:
            gap = max(0.0, D - dist(p, cur[j]))
            s += (w / wmed) ** 0.5 * (gap / D) ** 2 * 10
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
    for f in glob.glob(os.path.join(ROOT, 'data', 'history', '1356', '*.json')):
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
