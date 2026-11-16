"""Makes the villages of a start year for the world graphic: for every village and small town of the gazetteer
(data/content/gazetteer.json), the people of the land round it that live there.

The simulation holds the people of every place of the map (public/data/setup_<year>.json, `pop`), and the towns of
the world graphic hold the people of their year (public/data/towns_<year>.json, `people` per place of the gazetteer
and `place`, the place of the map each lies in). What is left of a place's people after its towns are the people on
its land. No house of the graphic stands alone: all of them live in the villages and small towns of the gazetteer
(size 1 and 2, the places settle.ts builds without a wall), each piece of land's people in the nearest one, as the
crow flies. The gazetteer holds a few of the villages there were, so a village of the graphic stands for those of
the land round it and is larger than a village was.

    people on a piece of land = max(0, pop[place] − Σ people of its towns) · its ground area / the place's

Output: public/data/villages_<year>.json, `people[k]` for gazetteer place k: the people of the time on the land
that live there (0 for the walled towns and for a village no land is nearest to). src/worldprobe/towns.ts adds them
to the people the towns file knows of the place.

    python3 tools/worldprobe/build_villages.py 1291

Run it again when setup_<year>.json, towns_<year>.json or the gazetteer change.
"""
import gzip
import json
import sys
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/geo'))
from common import LON0, LON1, km_per_px, px_to_lonlat_np  # noqa: E402

WALLED_FROM = 3  # settle.ts: places from this size on are walled towns


def on_sphere(lon, lat):
    lon, lat = np.radians(lon), np.radians(lat)
    return np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], -1)


def main(year: int) -> None:
    geo = json.loads((ROOT / 'public/data/geo.json').read_text())
    setup = json.loads((ROOT / f'public/data/setup_{year}.json').read_text())
    towns = json.loads((ROOT / f'public/data/towns_{year}.json').read_text())
    gaz = json.loads((ROOT / 'data/content/gazetteer.json').read_text())['places']
    w, h, places = geo['W'], geo['H'], geo['L']
    ids = np.frombuffer(gzip.open(ROOT / 'public/map/ids.bin.gz').read(), dtype='<u2').reshape(h, w)
    pop = np.array([p or 0 for p in setup['pop']], float)
    in_towns = np.zeros(places)
    for people, place in zip(towns['people'], towns['place']):
        if people and place is not None and 0 <= place < places:
            in_towns[place] += people
    on_land = np.maximum(0, pop - in_towns)

    # the land in pieces of two by two map pixels, each with the place of the pixel in its middle
    place = ids[1::2, 1::2].astype(np.int64) - 1
    lon = LON0 + (np.arange(1, w, 2) + 0.5) / w * (LON1 - LON0)
    lat = px_to_lonlat_np(np.zeros(h // 2), np.arange(1, h, 2) + 0.5)[1]
    land = (place >= 0) & (place < places)
    ys, xs = np.nonzero(land)
    owner, km2 = place[land], km_per_px(lat[ys]) ** 2
    share = km2 / np.bincount(owner, weights=km2, minlength=places)[owner]
    villages = np.array([k for k, p in enumerate(gaz) if p['size'] < WALLED_FROM])
    tree = cKDTree(on_sphere(np.array([gaz[k]['lon'] for k in villages]), np.array([gaz[k]['lat'] for k in villages])))
    nearest = tree.query(on_sphere(lon[xs], lat[ys]))[1]
    people = np.zeros(len(gaz))
    np.add.at(people, villages[nearest], on_land[owner] * share)

    out = ROOT / f'public/data/villages_{year}.json'
    about = ('The people of the time on the land that live in each village and small town of the gazetteer (by its index): '
             'the people of the simulation\'s places outside their towns, each piece of land\'s in the nearest such place. '
             'Made by tools/worldprobe/build_villages.py.')
    out.write_text(json.dumps({'year': year, 'about': about, 'people': [int(round(p)) for p in people]}, separators=(',', ':')) + '\n')
    got = people[villages]
    left = on_land.sum() - on_land[np.unique(owner)].sum()
    print(f'{out.relative_to(ROOT)}: {int(on_land.sum())} people on the land of {year} in {len(villages)} villages and small towns '
          f'({int(left)} in places without a pixel of their own); a village holds {np.median(got):.0f} at the median, '
          f'{np.percentile(got, 90):.0f} at nine in ten, {got.max():.0f} at most ({gaz[villages[got.argmax()]]["name"]}); {int((got == 0).sum())} hold none')


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 1291)
