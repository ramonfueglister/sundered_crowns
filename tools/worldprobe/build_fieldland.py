"""Makes the layer of the field land for the world graphic: for every piece of the game map, the share of its land
that lies under field lots when the simulation's arable is laid on the best soil first.

The simulation cultivates for every place (src/sim/systems/cultivation.ts, feature 2 of the economy)

    arable = min(c · people, min(s, fertile) · land)

with c hectares a head and the land limit s fitted to England in 1300 and 1380 (public/data/cultivation.json), the
people of the start year (public/data/setup_<year>.json, `pop`), and it takes the best soil of the place first:
tools/geo/build_land.py sorts the land of every place by its yield in the Caloric Suitability Index (Galor & Özak
2016, cells of 5 arc minutes), best first. The arable counts the fallow in.

The world graphic lays its fields in the same order (src/worldprobe/world.ts): a place's land is cut into its
pieces (the part of one cell of the index that lies in the place), the pieces are taken best first, ties by cell as
in build_land.py, and field lots are laid over the open ground of each until the ploughed ground of the lots makes
up the place's arable. Open ground is what neither stands under trees (the forest of the year:
public/map/forest<year>.bin.gz) nor under a town or village of the graphic (the people of
public/data/towns_<year>.json and villages_<year>.json at the places of the gazetteer, on the ground settle.ts builds
them on). Where field lies by field, GROUND of the ground is ploughed (settle.ts FIELD_GROUND: the rest are the
balks), so the lots of a place take arable / GROUND of open land. Land that bears nothing (no yield, or no data of
the index) is never taken; where the open, fertile land of a place is less than that, its fields fall short of the
arable, and the report says by how much. The graphic never lays more: water, rock and steep ground under a lot
take from its fields.

Output: public/map/fieldland_<year>.bin.gz, one byte per two by two pixels of the game map (public/map/ids.bin.gz;
such a cell counts with the place and the soil of the pixel in its middle): 255 where that is no land of a place,
else round(250 · share of the cell's land under field lots), the ground of the towns and villages counted as land
the lots would lie on (the graphic builds on it instead).

    python3 tools/worldprobe/build_villages.py 1291 && python3 tools/worldprobe/build_fieldland.py 1291

Run it again when the setup, the cultivation, the land's yields, the forest, the towns, the villages or the
constants below change (tests/worldprobe/fields.test.ts holds the layer against the simulation's own state and the
constants against settle.ts).
"""
import gzip
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/geo'))
from common import LON0, LON1, km_per_px, lonlat_to_px_np, px_to_lonlat_np  # noqa: E402

FULL = 250  # the byte of land that is all under field lots
NONE = 255
GROUND = 70 / 88  # settle.ts FIELD_GROUND: the share of the ground that is ploughed where field lies by field
HECTARES_PER_KM2 = 100
BLOCKS_PER_PIXEL = 8  # finest blocks to a pixel of the game map (land.ts: four cells of the data, each two blocks)
PEOPLE_PER_PERSON = 100  # settle.ts: the world has a hundredth of the people of the time
WALLED_FROM, VILLAGE_MOST, POP_OF_SIZE = 3, 2500, [0, 500, 2000]  # settle.ts
# The blocks of ground a village and a walled town of p persons take with what lies between and round their houses:
# a·p + b·√p + c, fitted to what settle.ts builds on a level meadow (tests/worldprobe/villages.test.ts holds them).
VILLAGE_GROUND, TOWN_GROUND = (2.2, 14, 40), (1.9, 12, 260)


def built_ground(year: int, w: int, h: int):
    """The share of every map pixel that lies under a town or village of the graphic: each a disc of its ground at its place."""
    gaz = json.loads((ROOT / 'data/content/gazetteer.json').read_text())['places']
    towns = json.loads((ROOT / f'public/data/towns_{year}.json').read_text())['people']
    villages = json.loads((ROOT / f'public/data/villages_{year}.json').read_text())['people']
    built = np.zeros((h, w))
    sub = (np.arange(4) + 0.5) / 4
    for k, p in enumerate(gaz):
        people = (towns[k] or 0) + villages[k] or p['pop1356'] or POP_OF_SIZE[min(p['size'], 2)]
        persons = people / PEOPLE_PER_PERSON
        if p['size'] < WALLED_FROM: persons = min(VILLAGE_MOST, persons)
        a, b, c = VILLAGE_GROUND if p['size'] < WALLED_FROM else TOWN_GROUND
        r = np.sqrt((a * persons + b * np.sqrt(persons) + c) / np.pi) / BLOCKS_PER_PIXEL
        x, y = lonlat_to_px_np(p['lon'], p['lat'])
        x0, x1, y0, y1 = int(np.floor(x - r)), int(np.floor(x + r)) + 1, int(np.floor(y - r)), int(np.floor(y + r)) + 1
        if x0 < 0 or y0 < 0 or x1 > w or y1 > h: continue
        xs, ys = (np.arange(x0, x1)[:, None] + sub[None, :]).ravel(), (np.arange(y0, y1)[:, None] + sub[None, :]).ravel()
        inside = (np.hypot(xs[None, :] - x, ys[:, None] - y) <= r).reshape(y1 - y0, 4, x1 - x0, 4).mean((1, 3))
        built[y0:y1, x0:x1] += inside
    return np.minimum(built, 1)


def main(year: int) -> None:
    data = ROOT / 'public/data'
    geo, setup = json.loads((data / 'geo.json').read_text()), json.loads((data / f'setup_{year}.json').read_text())
    soil, cultivation = json.loads((data / 'land.json').read_text()), json.loads((data / 'cultivation.json').read_text())
    w, h, places = geo['W'], geo['H'], geo['L']
    ids = np.frombuffer(gzip.open(ROOT / 'public/map/ids.bin.gz').read(), dtype='<u2').reshape(h, w)
    crop = json.loads((ROOT / 'tools/geo/data/csi/pre1500_max.json').read_text())['crop']
    csi = np.frombuffer(gzip.open(ROOT / 'tools/geo/data/csi' / crop['file']).read(), dtype='<f4').reshape(crop['height'], crop['width'])

    # The land in the cells of the layer, two by two map pixels: a cell belongs to the place of the pixel in its
    # middle and takes the index cell that pixel's centre lies in (as build_land.py does pixel by pixel), with the
    # ground area of its four pixels.
    place = ids[1::2, 1::2].astype(np.int64) - 1
    land = (place >= 0) & (place < places)  # the places beyond the game map have no pixels here
    lon = LON0 + (np.arange(1, w, 2) + 0.5) / w * (LON1 - LON0)
    lat = px_to_lonlat_np(np.zeros(h // 2), np.arange(1, h, 2) + 0.5)[1]
    col = np.floor((lon - crop['lon0']) / crop['cell_lon']).astype(np.int64)
    row = np.floor((crop['lat0'] - lat) / crop['cell_lat']).astype(np.int64)
    ncell = crop['width'] * crop['height']
    key = (place * ncell + (row[:, None] * crop['width'] + col[None, :]))[land]
    pieces, piece = np.unique(key, return_inverse=True)  # one piece per (place, index cell)
    owner = pieces // ncell
    km2 = np.broadcast_to((4 * km_per_px(lat) ** 2)[:, None], place.shape)[land]
    # the forest of the year lies on the grid of the world, whose cells are these; 255 where it is not known
    trees = np.frombuffer(gzip.open(ROOT / f'public/map/forest{year}.bin.gz').read(), np.uint8)
    trees = trees.reshape(-1, json.loads((ROOT / 'public/map/regions/world/index.json').read_text())['worldW'] // 2)[:h // 2, :w // 2][land]
    unwooded = 1 - np.where(trees == NONE, 0.0, trees / FULL)
    open_share = unwooded * (1 - built_ground(year, w, h).reshape(h // 2, 2, w // 2, 2).mean((1, 3))[land])
    value = csi[row[:, None], col[None, :]][land]
    yields = np.zeros(len(pieces))
    yields[piece] = np.where(np.isfinite(value), value, 0.0)
    area = np.bincount(piece, weights=km2)
    open_area = np.where(yields > 0, np.bincount(piece, weights=km2 * open_share), 0.0)  # open ground that bears

    # the simulation's arable of every place: its own rule on its own numbers (the place's area of the map's data)
    here = np.bincount(owner, minlength=places) > 0
    fertile = np.array(soil['curve']['fertile'][:places], float)
    total = np.array(geo['loc']['area'][:places], float)
    people = np.array([p or 0 for p in setup['pop']], float)
    arable = np.where(here, np.minimum(cultivation['arablePerHead'] * people / HECTARES_PER_KM2, np.minimum(cultivation['landLimit'], fertile) * total), 0.0)  # km²
    # the cells of a place bear on about the share of its land that the simulation's curve says (it counts pixel by pixel)
    bears = np.bincount(owner, weights=area * (yields > 0), minlength=places)[here] / np.bincount(owner, weights=area, minlength=places)[here]
    assert np.abs(bears - fertile[here]).mean() < 0.01, 'the pieces do not bear as land.json says'

    # best soil first within a place, ties by cell: lots over the open ground of each piece until the place has its arable
    order = np.lexsort((pieces, -yields, owner))
    start = np.searchsorted(owner[order], np.arange(places + 1))
    before = np.concatenate([[0.0], np.cumsum(open_area[order])])
    own = owner[order]
    taken = np.zeros(len(pieces))
    with np.errstate(divide='ignore', invalid='ignore'):
        taken[order] = np.clip((arable[own] / GROUND - (before[:-1] - before[start[own]])) / open_area[order], 0, 1)
    taken[open_area <= 0] = 0

    laid = GROUND * np.bincount(owner, weights=taken * open_area, minlength=places)
    assert (laid <= arable + 1e-6).all(), 'more fields than arable'
    short = arable - laid
    # the graphic lays the lots over the ground whether built on or not, and its towns and villages then take theirs
    layer = np.full(place.shape, NONE, np.uint8)
    layer[land] = np.round(FULL * taken[piece] * unwooded)
    out = ROOT / f'public/map/fieldland_{year}.bin.gz'
    with gzip.GzipFile(out, 'wb', compresslevel=9, mtime=0) as f:
        f.write(layer.tobytes())
    print(f'{out.relative_to(ROOT)}: {layer.shape[1]} x {layer.shape[0]}, {out.stat().st_size} bytes; {len(pieces)} pieces of land in {int(here.sum())} places, '
          f'{100 * (area * (yields > 0)).sum() / area.sum():.1f} % of the land bears, {100 * open_area.sum() / area.sum():.1f} % is open and bears')
    print(f'arable of {year}: {arable.sum():.0f} km²; laid as fields {laid.sum():.0f} km² ({100 * laid.sum() / arable.sum():.2f} %); '
          f'{int((short > 0.01 * np.maximum(arable, 1e-9)).sum())} places fall short by more than a hundredth for want of open, fertile land')


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 1291)
