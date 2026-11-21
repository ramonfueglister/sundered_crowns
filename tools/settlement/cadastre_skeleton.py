#!/usr/bin/env python3
# The real street skeleton of the large towns whose old plan is open (settlement feature 3, real plans): Paris from the
# Vasserot cadastre (1810-1836, ALPAGE, ODbL) inside the wall of Philippe Auguste (1190-1215). The streets that carry
# the most shortest ways between all junctions (edge betweenness, Porta, Crucitti & Latora 2006) are kept and laid
# east-west and north-south as the world needs. The plan gives the form, not the size: every length is in radii of
# the walled town (the radius of a circle of its area), and the world lays the plan as wide as its own town
# (src/sim/settlement/streets.ts). Writes src/sim/content/town_plans_1291.json: per site the market and the pieces,
# east (x) and south (z) of the town's centre (Notre-Dame, where the world sets the church).
#   python3 tools/settlement/cadastre_skeleton.py
import collections
import gzip
import json
import math
from pathlib import Path

import networkx as nx
from shapely.geometry import LineString, shape
from shapely.ops import transform, unary_union

ROOT = Path('data/cadastre')
OUT = Path('src/sim/content/town_plans_1291.json')
PARIS = 68  # site of Paris in the gazetteer (src/sim/content/cities_1291.json)
LAT0, LON0 = 48.8530, 2.3499  # the parvis of Notre-Dame
K = math.cos(math.radians(LAT0))
SNAP = 2.0  # metres: ends this close are one junction. PLACEHOLDER
# real metres of skeleton, the busiest streets first. Calibrated: with 3,500 m the streets of Paris in the world meet
# as Vasserot's do (dead ends, T-junctions, crossings 0.12, 0.79, 0.10 against 0.10, 0.78, 0.12); 2,000 m gives 0.22
# dead ends, 7,000 m 0.91 T-junctions (tests/settlement.test.ts)
KEEP = 3500.0
STEP = 0.13  # radii: a street is simplified to this before it is laid in steps (120 m in Paris). PLACEHOLDER
SHORTEST = 0.02  # radii: a shorter piece is left out (18 m in Paris). PLACEHOLDER
ABOUT = (
    'Real street skeletons of the large towns whose old plan is open, for settlement feature 3 (docs/SETTLEMENT_DESIGN.md). '
    'Per site of the gazetteer: the market (x, z) and the streets as pieces [x0, z0, x1, z1] east-west or north-south, east '
    'and south of the centre of the town, in radii of the real town (radius: the real metres of one; the world lays a plan as '
    'wide as its own town). Written by tools/settlement/cadastre_skeleton.py (Paris) and cadastre_venice.py (Venice).'
)
MARKET = 'Rue du Marché aux Poirées'  # the street of the Halles, the market of Paris since Philippe Auguste


def xy(x, y, z=None):
    return ((x - LON0) * 111320 * K, -(y - LAT0) * 111320)


def load(p):
    with gzip.open(ROOT / p) as f:
        return json.load(f)['features']


def paris():
    walls = load('paris_walls/walls.wgs84.geojson.gz')
    wall = unary_union(
        [transform(xy, shape(f['geometry'])) for f in walls if 'Philippe' in (f['properties']['LIBELLE'] or '')]
    ).convex_hull
    feats = [
        (f['properties'], transform(xy, shape(f['geometry'])))
        for f in load('paris_vasserot/VASSEROT_VOIES.wgs84.geojson.gz')
    ]
    lines = [g.intersection(wall) for _, g in feats if g.intersects(wall)]
    net = unary_union([g for g in lines if not g.is_empty])
    # the network: junctions within SNAP metres are one node
    node = {}

    def nid(p):
        k = (round(p[0] / SNAP), round(p[1] / SNAP))
        return node.setdefault(k, (k[0] * SNAP, k[1] * SNAP))

    g = nx.Graph()
    for seg in getattr(net, 'geoms', [net]):
        if seg.geom_type != 'LineString' or seg.length < 0.5:
            continue
        a, b = nid(seg.coords[0]), nid(seg.coords[-1])
        if a == b:
            continue
        if not g.has_edge(a, b) or g[a][b]['length'] > seg.length:
            g.add_edge(a, b, length=seg.length, line=seg)
    g = g.subgraph(max(nx.connected_components(g), key=len)).copy()
    bc = nx.edge_betweenness_centrality(g, weight='length', normalized=True)
    # the edges by the street they belong to (its name in the cadastre); a street's weight is the mean betweenness of
    # its metres, and the streets come whole, the busiest first, until KEEP metres
    named = [
        (p.get('NOM_ENTIER') or f'#{i}', gm.intersection(wall))
        for i, (p, gm) in enumerate(feats)
        if gm.intersects(wall)
    ]
    street = collections.defaultdict(list)
    for (a, b), v in bc.items():
        line = g[a][b]['line']
        mid = line.interpolate(0.5, normalized=True)
        name = min(named, key=lambda nm: nm[1].distance(mid))[0]
        street[name].append((v, line))
    score = {n: sum(v * ln.length for v, ln in es) / sum(ln.length for _, ln in es) for n, es in street.items()}
    keep, total = [], 0.0
    for n in sorted(score, key=lambda n: -score[n]):
        length = sum(ln.length for _, ln in street[n])
        if total + length > KEEP:
            continue
        keep += [ln for _, ln in street[n]]
        total += length
    mk = [
        shape(f['geometry'])
        for p, f in [(f['properties'], f) for f in load('paris_vasserot/VASSEROT_VOIES.wgs84.geojson.gz')]
        if p.get('NOM_ENTIER') == MARKET
    ]
    m = unary_union([transform(xy, s) for s in mk]).centroid
    radius = math.sqrt(wall.area / math.pi)
    return keep, (m.x / radius, m.y / radius), g, total, radius


def steps(line, radius):
    """A real street in radii as pieces east-west and north-south: its line simplified to STEP, each stretch the
    longer axis first, then the shorter."""
    s = LineString([(x / radius, z / radius) for x, z in line.coords]).simplify(STEP / 2)
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
    keep, market, g, total, radius = paris()
    pieces = sorted({q for line in keep for q in steps(line, radius)})
    deg = collections.Counter(d for _, d in g.degree())
    plan = json.loads(OUT.read_text()) if OUT.exists() else {'about': ABOUT, 'towns': {}}
    plan['about'] = ABOUT
    plan['towns'][str(PARIS)] = {
        'town': 'Paris',
        'source': 'Vasserot cadastre 1810-1836 (ALPAGE via Stanford EarthWorks, ODbL 1.0) inside the wall of Philippe Auguste (ALPAGE walls, Noizet & Lallau 2013); centre: the parvis of Notre-Dame',
        'radius': round(radius),
        'market': [round(market[0], 3), round(market[1], 3)],
        'streets': [list(q) for q in pieces],
    }
    plan['towns'] = dict(sorted(plan['towns'].items(), key=lambda kv: int(kv[0])))
    OUT.write_text(json.dumps(plan, ensure_ascii=False) + '\n')
    print(
        f'Paris: {g.number_of_nodes()} junctions and bends, {g.number_of_edges()} edges ({dict(sorted(deg.items()))}); kept {len(keep)} edges, {total:.0f} m, {len(pieces)} pieces; radius {radius:.0f} m; market at {market[0]:.2f}, {market[1]:.2f}'
    )


main()
