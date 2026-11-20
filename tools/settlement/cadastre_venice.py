#!/usr/bin/env python3
# The real street skeleton of Venice from the Napoleonic land register of 1808 (settlement feature 3, real plans; EPFL
# DHLAB, "Venice 1808 Land Registers" v1.1, DOI 10.5281/zenodo.20715172, CC BY 4.0, in data/cadastre/venice_1808/).
# The register draws the streets as areas without names. Their middle lines: the areas rasterized at RES metres and
# thinned (skimage, Lee et al. 1994), the network read off the thinned picture (sknw); a dead end shorter than twice
# the half width at its junction is a corner of a wider space, not a street, and junctions closer than their half widths
# are one. The streets are strokes: at each junction the two pieces that run on most nearly straight, within 60 degrees,
# are one street (Thomson & Richardson 1999; Porta, Crucitti & Latora 2006). The strokes that carry the most shortest
# ways between all junctions (edge betweenness by length) are kept whole up to as many metres to the hectare as Paris
# keeps (PARIS) and laid as in Paris (cadastre_skeleton.py): in radii of the town, east-west and north-south.
# The ground of the town is the register's too: water where it draws none of its land and the water is wider than the
# longest bridge spans (the narrower canals were bridged wherever a street met them); per cell of CELL radii its share
# of water.
# Writes Venice into src/sim/content/town_plans_1291.json and its measure into data/cadastre/venice_1808.json.
#   pip install scikit-image scipy sknw pillow shapely networkx
#   python3 tools/settlement/cadastre_venice.py   (about 15 minutes, most of it the thinning)
import base64
import collections
import gzip
import json
import math
import multiprocessing
import os
import pickle
import tempfile
from pathlib import Path

import networkx as nx
import numpy as np
import sknw
from PIL import Image, ImageDraw
from scipy import ndimage
from shapely.geometry import LineString, Polygon, shape
from shapely.ops import transform, unary_union
from skimage.morphology import skeletonize

SRC = Path('data/cadastre/venice_1808/venice_1808_landregister_geometries.geojson.gz')
OUT = Path('src/sim/content/town_plans_1291.json')
MEASURE = Path('data/cadastre/venice_1808.json')
VENICE = 1329  # site of Venice in the gazetteer (src/sim/content/cities_1291.json)
LAT0, LON0 = 45.4345, 12.3397  # the Basilica di San Marco, where the world sets the church
MARKET = (45.43825, 12.33565)  # Campo San Giacomo di Rialto: the market of Venice since the 11th century
K = math.cos(math.radians(LAT0))
RES = 0.5  # metres per pixel: the narrowest calli are about a metre wide. PLACEHOLDER
SPUR = 3.0  # metres: a dead end at least this long is a street. PLACEHOLDER
ANGLE = 60.0  # degrees: two pieces of street running on within this are one stroke (Thomson & Richardson 1999)
LOOK = 10.0  # metres along a piece that give its direction at a junction. PLACEHOLDER
PARIS = ('68', 3500.0)  # Paris's plan: its site and the real metres of skeleton it keeps (cadastre_skeleton.py, KEEP)
# real metres of skeleton, the busiest strokes first: as many to the hectare as Paris keeps inside its wall (KEEP over
# the area of Paris's radius); Venice's own shares of junctions cannot be met by the world's street growth, which was
# calibrated against Paris (docs/SETTLEMENT_DESIGN.md)
CACHE = os.environ.get('CACHE')  # a file to keep the network in between runs of the calibration
STEP = 0.13  # radii: a street is simplified to this before it is laid in steps (as Paris). PLACEHOLDER
SHORTEST = 0.02  # radii: a shorter piece is left out (as Paris). PLACEHOLDER
CELL = 0.01  # radii (about 11 m): a cell of the ground; a block of the world (2 m) takes about 0.015 at Venice's size
SUB = 8  # sub-cells a side of a cell, over which its share of water is counted
# metres: the Rialto bridge, the longest span over a canal (BRIDGE_SPAN in src/sim/settlement/plan_ground.ts)
SPAN = 28.8


def xy(x, y, z=None):
    return ((x - LON0) * 111320 * K, -(y - LAT0) * 111320)


def picture(tmp):
    """The streets as a picture of RES-metre pixels: their half widths and their middle lines (Lee's thinning; the 2D
    thinning of skimage breaks the picture apart at this size). Run in a process of its own: at this size the
    thinning leaves the heap of its process broken."""
    feats = json.loads(gzip.decompress(SRC.read_bytes()))['features']
    streets = unary_union(
        [
            transform(xy, shape(f['geometry']).buffer(0))
            for f in feats
            if f['properties']['geometry_type'] in ('street', 'sottoportico')
        ]
    )
    land = unary_union(
        [
            transform(xy, shape(f['geometry']).buffer(0))
            for f in feats
            if f['properties']['geometry_type'] not in ('water', None)
        ]
    )
    x0, y0, x1, y1 = streets.bounds
    img = Image.new('1', (int((x1 - x0) / RES) + 3, int((y1 - y0) / RES) + 3), 0)
    draw = ImageDraw.Draw(img)

    def px(cs):
        return [((x - x0) / RES + 1, (y - y0) / RES + 1) for x, y in cs]

    for p in getattr(streets, 'geoms', [streets]):
        draw.polygon(px(p.exterior.coords), fill=1)
        for hole in p.interiors:
            draw.polygon(px(hole.coords), fill=0)
    area = np.array(img, dtype=bool)
    half = ndimage.distance_transform_edt(area)
    np.save(f'{tmp}/half.npy', half * RES)
    # (the thinning is given a fresh array: on the array read from PIL it returns the picture unthinned)
    np.save(f'{tmp}/thin.npy', skeletonize(half > 0, method='lee') > 0)
    return x0, y0, math.sqrt(land.area / math.pi)


def ground(radius):
    """The register's ground round the centre in cells of CELL radii, rows from north to south, west to east: the share
    of each cell that is water, in sixteenths of its 8 x 8 sub-cells (0 to 15, 16 counted as 15), packed two cells to a
    byte, the lower half first. Water is what the register does not draw as land: the lagoon and the canals. A canal
    no wider than the longest bridge spans was crossed by a bridge wherever a street met it, and is land here; the
    world's Venice keeps the wider water only (the Grand Canal, the Giudecca, the basins)."""
    feats = json.loads(gzip.decompress(SRC.read_bytes()))['features']
    drawn = [(f['properties']['geometry_type'], transform(xy, shape(f['geometry']).buffer(0))) for f in feats]
    # the canals the register leaves open between the blocks are holes of what it draws: filled, as the canals it
    # draws, they are water
    covered = unary_union([g for _, g in drawn])
    filled = unary_union([Polygon(p.exterior) for p in getattr(covered, 'geoms', [covered])])
    water = filled.difference(unary_union([g for t, g in drawn if t not in ('water', None)]))
    # a canal no wider than the longest span is crossed by bridges wherever a street meets it: it is land, and only
    # the water wider than the span stays (an opening by a disk as wide as the span)
    wide = water.buffer(-SPAN / 2).buffer(SPAN / 2).intersection(water)
    land = filled.difference(wide)
    x0, y0, x1, y1 = covered.bounds
    cell = CELL * radius
    sub = cell / SUB
    u0, v0 = math.floor(x0 / cell), math.floor(y0 / cell)
    w, h = math.ceil(x1 / cell) - u0, math.ceil(y1 / cell) - v0
    img = Image.new('1', (SUB * w, SUB * h), 0)
    draw = ImageDraw.Draw(img)

    def px(cs):
        return [((x - u0 * cell) / sub, (y - v0 * cell) / sub) for x, y in cs]

    for p in getattr(land, 'geoms', [land]):
        draw.polygon(px(p.exterior.coords), fill=1)
        for hole in p.interiors:
            draw.polygon(px(hole.coords), fill=0)
    dry = np.array(img, dtype=bool).reshape(h, SUB, w, SUB).mean(axis=(1, 3))
    wet = np.minimum(15, np.round((1 - dry) * 16)).astype(np.uint8).ravel()
    if len(wet) % 2:
        wet = np.append(wet, 0)
    packed = wet[0::2] | (wet[1::2] << 4)
    print(f'ground: {w} x {h} cells of {cell:.1f} m, water {1 - dry.mean():.3f}', flush=True)
    return {
        'x0': round(u0 * CELL, 3),
        'z0': round(v0 * CELL, 3),
        'cell': CELL,
        'w': w,
        'h': h,
        'water': base64.b64encode(packed.tobytes()).decode(),
    }


def network():
    with tempfile.TemporaryDirectory() as tmp:
        with multiprocessing.get_context('spawn').Pool(1) as pool:
            x0, y0, radius = pool.apply(picture, (tmp,))
        half = np.load(f'{tmp}/half.npy')
        thin = np.load(f'{tmp}/thin.npy').astype(np.uint16)
    print('thinned', flush=True)
    g = nx.MultiGraph(sknw.build_sknw(thin, multi=False, iso=False, ring=True))
    print('network', g.number_of_nodes(), flush=True)
    at = lambda p: (x0 + (p[1] - 1) * RES, y0 + (p[0] - 1) * RES)  # noqa: E731
    wid = lambda u: half[tuple(g.nodes[u]['o'].astype(int))]  # noqa: E731
    for _, _, d in g.edges(data=True):
        d['line'] = [at(p) for p in d['pts']]
        d['length'] = d['weight'] * RES
    # the corners of wider spaces
    while True:
        spurs = [
            u
            for u in g.nodes
            if g.degree(u) == 1
            and (v := next(iter(g[u]))) != u
            and g.degree(v) >= 3
            and min(d['length'] for d in g[u][v].values()) < max(SPUR, 2 * wid(v))
        ]
        if not spurs:
            break
        g.remove_nodes_from(spurs)
    # junctions closer than their half widths are one: the thinning splits a crossing of wide streets in two
    merged = True
    while merged:
        merged = False
        for u, v, d in list(g.edges(data=True)):
            if u != v and g.degree(u) >= 3 and g.degree(v) >= 3 and d['length'] < wid(u) + wid(v):
                for a, b, dd in list(g.edges(v, data=True)):
                    o = b if a == v else a
                    if o != u:
                        g.add_edge(u, o if o != v else u, **dd)
                g.remove_node(v)
                merged = True
                break
    g = g.subgraph(max(nx.connected_components(g), key=len)).copy()
    return g, radius, x0, y0


def direction(line, from_start):
    pts = line if from_start else line[::-1]
    p0, s = pts[0], 0.0
    for a, b in zip(pts, pts[1:], strict=False):
        s += math.dist(a, b)
        if s >= LOOK:
            return math.atan2(b[1] - p0[1], b[0] - p0[0])
    return math.atan2(pts[-1][1] - p0[1], pts[-1][0] - p0[0])


def strokes(g):
    """The edges grouped into strokes: at each junction the pairs of pieces with the smallest deflection, within
    ANGLE, are joined, the best pair first (every-best-fit, Porta et al. 2006)."""
    edges = list(g.edges(keys=True))
    parent = {e: e for e in edges}

    def find(e):
        while parent[e] != e:
            parent[e] = parent[parent[e]]
            e = parent[e]
        return e

    for n in g.nodes:
        ends = []
        for u, v, k, d in g.edges(n, keys=True, data=True):
            e = (u, v, k) if (u, v, k) in parent else (v, u, k)
            starts = math.dist(d['line'][0], g.nodes[n]['xy']) <= math.dist(d['line'][-1], g.nodes[n]['xy'])
            ends.append((e, direction(d['line'], starts)))
        pairs = []
        for i in range(len(ends)):
            for j in range(i + 1, len(ends)):
                dev = abs(((ends[i][1] - ends[j][1]) % (2 * math.pi)) - math.pi)  # 0: straight on
                if math.degrees(dev) <= ANGLE:
                    pairs.append((dev, i, j))
        used = set()
        for _, i, j in sorted(pairs):
            if i in used or j in used:
                continue
            used |= {i, j}
            parent[find(ends[i][0])] = find(ends[j][0])
    groups = collections.defaultdict(list)
    for e in edges:
        groups[find(e)].append(e)
    return list(groups.values())


def steps(line, radius):
    s = LineString([(x / radius, z / radius) for x, z in line]).simplify(STEP / 2)
    out = []
    pts = list(s.coords)
    for (x0, z0), (x1, z1) in zip(pts, pts[1:], strict=False):
        x0, z0, x1, z1 = round(x0, 3), round(z0, 3), round(x1, 3), round(z1, 3)
        if abs(x1 - x0) >= abs(z1 - z0):
            out += [(x0, z0, x1, z0), (x1, z0, x1, z1)]
        else:
            out += [(x0, z0, x0, z1), (x0, z1, x1, z1)]
    return [q for q in out if abs(q[2] - q[0]) + abs(q[3] - q[1]) >= SHORTEST]


def main():
    if CACHE and Path(CACHE).exists():
        g, radius, x0, y0 = pickle.loads(Path(CACHE).read_bytes())
    else:
        g, radius, x0, y0 = network()
        if CACHE:
            Path(CACHE).write_bytes(pickle.dumps((g, radius, x0, y0)))
    for n in g.nodes:
        o = g.nodes[n]['o']
        g.nodes[n]['xy'] = (x0 + (o[1] - 1) * RES, y0 + (o[0] - 1) * RES)
    deg = collections.Counter(d for _, d in g.degree())
    junctions = deg[1] + deg[3] + sum(v for k, v in deg.items() if k >= 4)
    measure = {
        'source': 'Venice 1808 Land Registers v1.1 (EPFL DHLAB, DOI 10.5281/zenodo.20715172, CC BY 4.0); streets and sottoportici; tools/settlement/cadastre_venice.py',
        'land_ha': round(math.pi * radius**2 / 1e4, 1),
        'street_km': round(sum(d['length'] for *_, d in g.edges(data=True)) / 1000, 1),
        'junctions': {str(k): v for k, v in sorted(deg.items())},
        'dead': round(deg[1] / junctions, 3),
        'T': round(deg[3] / junctions, 3),
        'X': round(sum(v for k, v in deg.items() if k >= 4) / junctions, 3),
    }
    MEASURE.write_text(json.dumps(measure, indent=1) + '\n')
    # the busiest strokes: edge betweenness of the shortest ways by length between all junctions
    simple = nx.Graph()
    for u, v, k, d in g.edges(keys=True, data=True):
        if u != v and (not simple.has_edge(u, v) or simple[u][v]['length'] > d['length']):
            simple.add_edge(u, v, length=d['length'], key=k)
    bc = nx.edge_betweenness_centrality(simple, weight='length', normalized=True)

    def load(u, v, k):
        if simple.has_edge(u, v) and simple[u][v]['key'] == k:
            return bc.get((u, v), bc.get((v, u), 0.0))
        return 0.0

    scored = []
    for s in strokes(g):
        length = sum(g.edges[e]['length'] for e in s)
        scored.append((sum(load(*e) * g.edges[e]['length'] for e in s) / length, length, s))
    paris = json.loads(OUT.read_text())['towns'][PARIS[0]]
    most = PARIS[1] * (radius / paris['radius']) ** 2
    keep, total = [], 0.0
    for _, length, s in sorted(scored, key=lambda t: -t[0]):
        if total + length > most:
            continue
        keep += [g.edges[e]['line'] for e in s]
        total += length
    pieces = sorted({q for line in keep for q in steps(line, radius)})
    mx, mz = xy(MARKET[1], MARKET[0])
    plan = json.loads(OUT.read_text())
    plan['towns'][str(VENICE)] = {
        'town': 'Venice',
        'source': 'Venice 1808 Land Registers v1.1 (EPFL DHLAB, DOI 10.5281/zenodo.20715172, CC BY 4.0): the streets and sottoportici of the Napoleonic land register; centre: the Basilica di San Marco; market: Campo San Giacomo di Rialto',
        'radius': round(radius),
        'market': [round(mx / radius, 3), round(mz / radius, 3)],
        'streets': [list(q) for q in pieces],
        'ground': ground(radius),
    }
    plan['towns'] = dict(sorted(plan['towns'].items(), key=lambda kv: int(kv[0])))
    OUT.write_text(json.dumps(plan, ensure_ascii=False) + '\n')
    print(
        f'Venice: {measure["street_km"]} km, junctions {measure["junctions"]}, dead/T/X {measure["dead"]}/{measure["T"]}/{measure["X"]}; kept {total:.0f} m, {len(pieces)} pieces; radius {radius:.0f} m; market at {mx / radius:.2f}, {mz / radius:.2f}'
    )


if __name__ == '__main__':
    main()
