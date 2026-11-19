#!/usr/bin/env python3
# Measures the street network of Paris inside the wall of Philippe Auguste (1190-1215, the wall of 1291) from the
# Vasserot cadastre (1810-1836, ALPAGE, ODbL): junction shares, street length, the blocks and their areas.
#   python3 tools/settlement/cadastre_paris.py [out.json]
import collections
import gzip
import json
import math
import sys
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.ops import transform, unary_union

ROOT = 'data/cadastre/'
LAT0, LON0 = 48.8530, 2.3499  # the parvis of Notre-Dame
K = math.cos(math.radians(LAT0))


def xy(x, y, z=None):
    return ((x - LON0) * 111320 * K, -(y - LAT0) * 111320)  # metres east, south


SNAP = 2.0  # metres: line ends this close are one node. PLACEHOLDER


def load(p):
    return json.load(gzip.open(ROOT + p))['features']


walls = load('paris_walls/walls.wgs84.geojson.gz')
wall = unary_union(
    [transform(xy, shape(f['geometry'])) for f in walls if 'Philippe' in (f['properties']['LIBELLE'] or '')]
).convex_hull
streets = [
    (f['properties'], transform(xy, shape(f['geometry'])))
    for f in load('paris_vasserot/VASSEROT_VOIES.wgs84.geojson.gz')
]
inner = wall.buffer(-50)  # junctions this far inside, so that cut ends at the wall are not dead ends

length = 0.0
kinds = collections.Counter()
lines = []
for props, g in streets:
    if not g.intersects(wall):
        continue
    length += g.intersection(wall).length
    kinds[props.get('TYPE')] += 1
    lines.append(g.simplify(0.5))
net = unary_union(lines)  # one planar network: overlaps dissolved, every crossing noded
deg = collections.Counter()
for l in getattr(net, 'geoms', [net]):
    cs = list(l.coords)
    deg[(round(cs[0][0], 1), round(cs[0][1], 1))] += 1
    deg[(round(cs[-1][0], 1), round(cs[-1][1], 1))] += 1
parent = {n: n for n in deg}


def root(n):
    while parent[n] != n:
        parent[n] = parent[parent[n]]
        n = parent[n]
    return n


grid = collections.defaultdict(list)
for n in deg:
    grid[(math.floor(n[0] / SNAP), math.floor(n[1] / SNAP))].append(n)
for (gx, gz), ns in grid.items():
    for dx in (-1, 0, 1):
        for dz in (-1, 0, 1):
            for m in grid.get((gx + dx, gz + dz), []):
                for n in ns:
                    if n < m and math.dist(n, m) <= SNAP:
                        parent[root(n)] = root(m)
node = collections.Counter()
for n, d in deg.items():
    node[root(n)] += d
c = collections.Counter()
for n, d in node.items():
    if d != 2 and inner.contains(Point(n)):
        c[min(d, 4)] += 1
j = c[1] + c[3] + c[4]
blocks = [transform(xy, shape(f['geometry'])) for f in load('paris_vasserot/Vasserot_Ilots.wgs84.geojson.gz')]
inb = sorted(b.area for b in blocks if wall.contains(b.representative_point()))
big = [a for a in inb if a >= 200]
tau = 1 + len(big) / sum(math.log(a / 200) for a in big)  # Clauset, Shalizi & Newman 2009, Eq. 3.1
out = {
    'wall_ha': round(wall.area / 1e4, 1),
    'street_km': round(length / 1000, 1),
    'streets': sum(kinds.values()),
    'kinds': dict(kinds.most_common(8)),
    'junctions': dict(c),
    'dead': round(c[1] / j, 3),
    'T': round(c[3] / j, 3),
    'X': round(c[4] / j, 3),
    'blocks': len(inb),
    'block_median_m2': round(inb[len(inb) // 2]),
    'tau': round(tau, 2),
}
print(json.dumps(out, ensure_ascii=False, indent=1))
if len(sys.argv) > 1:
    Path(sys.argv[1]).write_text(json.dumps(out, ensure_ascii=False, indent=1))
