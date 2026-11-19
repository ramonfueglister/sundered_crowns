"""Makes the hamlets and fields of the towns for the world graphic: for every town it builds, the persons that live
inside it, the persons and families of its hamlets before the walls, and the land under its plough.

Only the persons of the simulation live in the world (src/sim/systems/hamlets.ts): the families of a town that live
from farming have their houses in hamlets before its walls, and the land their place has under the plough is theirs.
The simulation counts per place (public/data/hamlets_<year>.json, tools/sim/write_hamlets.ts) and cultivates for
every place (src/sim/systems/cultivation.ts)

    arable = min(c · people, min(s, fertile) · land)

with the people of the time its persons are (persons times 100, src/sim/scale.ts), c and s of
public/data/cultivation.json and the fertile share of public/data/land.json. The towns of the graphic are places of
the gazetteer (public/data/towns_<year>.json gives each its place of the game map and its people); where a place has
more than one town, they share its persons and its arable by their people.

The graphic lays a town's fields round it, field by field on the open ground, and leaves the woods standing
(src/worldprobe/world.ts). `reach_km` is how far from the town they so reach: the radius of the disc whose open
ground, GROUND of it ploughed, is the town's arable. Open ground is land of the game map (public/map/ids.bin.gz)
that does not stand under trees (the forest of the year, public/map/forest<year>.bin.gz), read at points spread
evenly over the disc. Where a town has little land about it (islands, coasts) the reach ends at MOST_KM and its
fields fall short of its arable.

Output: public/data/hamletland_<year>.json with, per town, `town` (index in the gazetteer), `inside` (persons in
the town itself), `hamlet` (persons in its hamlets), `families` (families in its hamlets), `km2` (land under the
plough, the fallow counted in) and `reach_km`. src/worldprobe/hamlets.ts reads it.

    python3 tools/worldprobe/build_hamletland.py 1291

Run it again when the hamlets, the cultivation or the towns change (tests/worldprobe/hamlets.test.ts holds the file
against the hamlets of the simulation).
"""

import gzip
import json
import math
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PEOPLE_PER_PERSON = 100  # src/sim/scale.ts
HECTARES_PER_KM2 = 100
GROUND = 70 / 88 * 0.85  # settle.ts FIELD_GROUND: the share of the ground that is ploughed where field lies by field
MOST_KM = 60  # no town's fields reach farther
KM_PER_DEGREE = 111.32
# points spread evenly over the unit disc (a sunflower), at which the open ground is read
SPREAD = [
    (
        math.sqrt((k + 0.5) / 600) * math.cos(k * math.pi * (3 - math.sqrt(5))),
        math.sqrt((k + 0.5) / 600) * math.sin(k * math.pi * (3 - math.sqrt(5))),
    )
    for k in range(600)
]


def merc(lat: float) -> float:
    return math.asinh(math.tan(math.radians(lat)))


def reach_of(km2: float, lon: float, lat: float, geo: dict, land: np.ndarray, forest: np.ndarray) -> float:
    """The radius in km of the disc round a town whose open ground holds its arable."""
    if km2 <= 0:
        return 0.0
    w, h = geo['W'], geo['H']
    x = (lon - geo['lon0']) / (geo['lon1'] - geo['lon0']) * w
    y = (merc(geo['latN']) - merc(lat)) / (merc(geo['latN']) - merc(geo['latS'])) * h
    km_per_px = (geo['lon1'] - geo['lon0']) / w * KM_PER_DEGREE * math.cos(math.radians(lat))
    xs, zs = np.array([p[0] for p in SPREAD]), np.array([p[1] for p in SPREAD])

    def open_share(r: float) -> float:
        px, py = (
            np.clip((x + xs * r / km_per_px).astype(int), 0, w - 1),
            np.clip((y + zs * r / km_per_px).astype(int), 0, h - 1),
        )
        return float((land[py, px] * (1 - forest[py >> 1, px >> 1])).mean())

    r = math.sqrt(km2 / (math.pi * GROUND))
    for _ in range(12):
        r = min(MOST_KM, math.sqrt(km2 / (math.pi * GROUND * max(0.02, open_share(r)))))
    return r


def main(year: int) -> None:
    data = ROOT / 'public/data'
    hamlets, towns = (
        json.loads((data / f'hamlets_{year}.json').read_text()),
        json.loads((data / f'towns_{year}.json').read_text()),
    )
    geo, land, cultivation = (
        json.loads((data / 'geo.json').read_text()),
        json.loads((data / 'land.json').read_text()),
        json.loads((data / 'cultivation.json').read_text()),
    )
    gazetteer = json.loads((ROOT / 'data/content/gazetteer.json').read_text())
    gazetteer = gazetteer['places'] if isinstance(gazetteer, dict) else gazetteer
    ids = np.frombuffer(gzip.open(ROOT / 'public/map/ids.bin.gz').read(), dtype='<u2').reshape(geo['H'], geo['W'])
    is_land = ((ids >= 1) & (ids <= geo['L'])).astype(np.float32)
    raw = np.frombuffer(gzip.open(ROOT / f'public/map/forest{year}.bin.gz').read(), dtype=np.uint8)
    # the forest lies on the grid of the whole world's map, two by two pixels to a cell; the game map is its left part
    world = json.loads((ROOT / 'public/map/regions/world/index.json').read_text())
    raw = raw.reshape(world['worldH'] // 2, world['worldW'] // 2)
    forest = np.where(raw == 255, 0, raw / 250).astype(np.float32)
    of_place: dict[int, list[tuple[int, float]]] = {}
    for town, (place, people) in enumerate(zip(towns['place'], towns['people'])):
        if people:
            of_place.setdefault(place, []).append((town, people))
    rows, without = [], 0
    for place, persons, in_hamlets, families in zip(
        hamlets['place'], hamlets['persons'], hamlets['hamlet_persons'], hamlets['hamlet_families']
    ):
        limit = (
            min(cultivation['landLimit'], land['curve']['fertile'][place])
            * geo['loc']['area'][place]
            * HECTARES_PER_KM2
        )
        km2 = min(cultivation['arablePerHead'] * persons * PEOPLE_PER_PERSON, limit) / HECTARES_PER_KM2
        here = of_place.get(place, [])
        if not here:
            without += in_hamlets
            continue
        whole = sum(people for _, people in here)
        for town, people in here:
            share = people / whole
            rows.append(
                (
                    town,
                    round((persons - in_hamlets) * share),
                    round(in_hamlets * share),
                    round(families * share),
                    round(km2 * share, 1),
                    round(
                        reach_of(km2 * share, gazetteer[town]['lon'], gazetteer[town]['lat'], geo, is_land, forest), 2
                    ),
                )
            )
    rows.sort()
    out = {
        'year': year,
        'about': 'Per town of the world graphic (index in data/content/gazetteer.json): persons inside it, persons and families of its hamlets, km² under its plough, km its fields reach from it. Written by tools/worldprobe/build_hamletland.py from hamlets_<year>.json.',
        'town': [r[0] for r in rows],
        'inside': [r[1] for r in rows],
        'hamlet': [r[2] for r in rows],
        'families': [r[3] for r in rows],
        'km2': [r[4] for r in rows],
        'reach_km': [r[5] for r in rows],
    }
    path = data / f'hamletland_{year}.json'
    path.write_text(json.dumps(out, separators=(',', ':')) + '\n')
    print(
        f'{path.relative_to(ROOT)}: {len(rows)} towns, {sum(out["inside"])} persons inside, {sum(out["hamlet"])} in hamlets ({sum(out["families"])} families), '
        f'{sum(out["km2"]):.0f} km² under the plough; {without} hamlet persons in places without a town of the graphic'
    )


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 1291)
