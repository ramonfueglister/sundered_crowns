"""The town walls of the towns with a real plan (settlement feature 6, docs/SETTLEMENT_DESIGN.md).

Paris: the wall of Philippe Auguste (1190-1215; ALPAGE walls, Noizet & Lallau 2013, ODbL 1.0,
data/cadastre/paris_walls/), as the convex hull the plan's streets were cut to (tools/settlement/cadastre_skeleton.py),
simplified to SIMPLIFY radii. Adds `wall` to the town in src/sim/content/town_plans_1291.json: its corners [x, z] east
and south of the town's centre, in radii of the walled town, as the plan's streets are.

Run: python3 tools/settlement/plan_walls.py
"""

import gzip
import json
import math
from pathlib import Path

from shapely.geometry import shape
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parents[2]
PLANS = ROOT / 'src' / 'sim' / 'content' / 'town_plans_1291.json'
WALLS = ROOT / 'data' / 'cadastre' / 'paris_walls' / 'walls.wgs84.geojson.gz'
PARIS = 68  # as tools/settlement/cadastre_skeleton.py
LAT0, LON0 = 48.8530, 2.3499  # the parvis of Notre-Dame, as tools/settlement/cadastre_skeleton.py
K = math.cos(math.radians(LAT0))
# radii: the corners of the hull this close to the line between their neighbours are left out (18 m in Paris). OWN
# RULE: the world lays a town's wall in pieces of whole metres; finer corners would not show
SIMPLIFY = 0.02


def xy(x, y, z=None):
    return ((x - LON0) * 111320 * K, -(y - LAT0) * 111320)


def main():
    with gzip.open(WALLS) as f:
        feats = json.load(f)['features']
    hull = unary_union(
        [transform(xy, shape(f['geometry'])) for f in feats if 'Philippe' in (f['properties']['LIBELLE'] or '')]
    ).convex_hull
    plans = json.loads(PLANS.read_text(encoding='utf-8'))
    town = plans['towns'][str(PARIS)]
    r = town['radius']
    ring = transform(lambda x, y, z=None: (x / r, y / r), hull).simplify(SIMPLIFY)
    town['wall'] = [[round(x, 3), round(z, 3)] for x, z in list(ring.exterior.coords)[:-1]]
    PLANS.write_text(json.dumps(plans, ensure_ascii=False) + '\n', encoding='utf-8')
    print(
        f'Paris: a wall of {len(town["wall"])} corners, {ring.length * r:.0f} m round, {ring.area * r * r / 1e4:.0f} ha'
    )


if __name__ == '__main__':
    main()
