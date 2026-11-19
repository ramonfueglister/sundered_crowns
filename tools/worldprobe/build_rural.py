"""Makes the layer of the people on the land for the world graphic: for every place of the game map, how many
people per km² live outside its towns in the world's start year.

The simulation holds the people of every place (public/data/setup_<year>.json, `pop`), and the towns of the world
graphic hold the people of their year (public/data/towns_<year>.json, `people` per place of the gazetteer and `place`,
the place of the map each lies in). What is left of a place's people after its towns are the people on its land:
they live in the farmhouses the world graphic stands beside its fields (src/worldprobe/settle.ts), so that the land
shows where many people live and where few, from the same numbers the simulation counts with.

    people on the land per km² = max(0, pop[place] − Σ people of its towns) / area[place]

The towns whose people the towns file does not know (it builds them as their size says) are not taken off: their
people are a guess of the graphic, not a number of the simulation.

Output: public/map/rural_<year>.bin.gz, one byte per two by two pixels of the game map (public/map/ids.bin.gz, the
pixel in the middle of the four): 255 where no place is (sea, lakes, beyond the game map), else the people per km²
d as round(25 · log2(1 + d)), up to 250 (1023 per km²).

    python3 tools/worldprobe/build_rural.py 1291
"""

import gzip
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
STEPS = 25  # steps of the byte per doubling of 1 + d


def main(year: int) -> None:
    geo = json.loads((ROOT / 'public/data/geo.json').read_text())
    setup = json.loads((ROOT / f'public/data/setup_{year}.json').read_text())
    towns = json.loads((ROOT / f'public/data/towns_{year}.json').read_text())
    w, h, places = geo['W'], geo['H'], geo['L']
    ids = np.frombuffer(gzip.decompress(Path(ROOT / 'public/map/ids.bin.gz').read_bytes()), dtype='<u2').reshape(h, w)
    area, pop = np.array(geo['loc']['area'][:places], float), np.array(setup['pop'], float)
    in_towns = np.zeros(places)
    for people, place in zip(towns['people'], towns['place']):
        if people and place is not None and 0 <= place < places:
            in_towns[place] += people
    density = np.where(area > 0, np.maximum(0, pop - in_towns) / np.maximum(area, 1e-9), 0)
    code = np.minimum(250, np.round(STEPS * np.log2(1 + density))).astype(np.uint8)
    # the pixel in the middle of every two by two; ids hold place + 1, 0 where nothing is, and sea zones above the places
    middle = ids[1::2, 1::2].astype(np.int64) - 1
    layer = np.where((middle >= 0) & (middle < places), code[np.clip(middle, 0, places - 1)], 255).astype(np.uint8)
    out = ROOT / f'public/map/rural_{year}.bin.gz'
    with gzip.GzipFile(out, 'wb', compresslevel=9, mtime=0) as f:
        f.write(layer.tobytes())
    land = layer[layer != 255]
    print(
        f'{out.relative_to(ROOT)}: {layer.shape[1]} x {layer.shape[0]}, {out.stat().st_size} bytes; people per km² on the land, '
        f'by area: median {2 ** (np.median(land) / STEPS) - 1:.1f}, nine tenths below {2 ** (np.percentile(land, 90) / STEPS) - 1:.1f}'
    )


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 1291)
