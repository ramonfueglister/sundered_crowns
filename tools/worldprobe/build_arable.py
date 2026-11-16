"""Makes the layer of the land under the plough for the world graphic: for every place of the game map, the share
of its land the simulation has cultivated in the world's start year.

The simulation cultivates for every place (src/sim/systems/cultivation.ts, feature 2 of the economy)

    arable = min(c · people, min(s, fertile) · land)

with c hectares a head and the land limit s fitted to England in 1300 and 1380 (public/data/cultivation.json), the
people of the start year (public/data/setup_<year>.json, `pop`) and the share of a place's land that bears a harvest
(public/data/land.json, `curve.fertile`). The arable counts the fallow in. The world graphic lays its fields by this
share (src/worldprobe/world.ts), so that it shows as much ploughed land as the simulation reckons with.

Output: public/map/arable_<year>.bin.gz, one byte per two by two pixels of the game map (public/map/ids.bin.gz, the
pixel in the middle of the four): 255 where no place is (sea, lakes, beyond the game map), else the share as
round(250 · share).

    python3 tools/worldprobe/build_arable.py 1291
"""
import gzip
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
FULL = 250  # the byte of a place all under the plough
HECTARES_PER_KM2 = 100


def main(year: int) -> None:
    data = ROOT / 'public/data'
    geo, setup = json.loads((data / 'geo.json').read_text()), json.loads((data / f'setup_{year}.json').read_text())
    land, cultivation = json.loads((data / 'land.json').read_text()), json.loads((data / 'cultivation.json').read_text())
    w, h, places = geo['W'], geo['H'], geo['L']
    ids = np.frombuffer(gzip.open(ROOT / 'public/map/ids.bin.gz').read(), dtype='<u2').reshape(h, w)
    hectares = np.array(geo['loc']['area'][:places], float) * HECTARES_PER_KM2
    people = np.array([p or 0 for p in setup['pop']], float)
    limit = np.minimum(cultivation['landLimit'], np.array(land['curve']['fertile'][:places], float))
    arable = np.minimum(cultivation['arablePerHead'] * people, limit * hectares)
    share = np.where(hectares > 0, arable / np.maximum(hectares, 1e-9), 0)
    code = np.round(FULL * share).astype(np.uint8)
    # the pixel in the middle of every two by two; ids hold place + 1, 0 where nothing is, and sea zones above the places
    middle = ids[1::2, 1::2].astype(np.int64) - 1
    layer = np.where((middle >= 0) & (middle < places), code[np.clip(middle, 0, places - 1)], 255).astype(np.uint8)
    out = ROOT / f'public/map/arable_{year}.bin.gz'
    with gzip.GzipFile(out, 'wb', compresslevel=9, mtime=0) as f:
        f.write(layer.tobytes())
    known = layer[layer != 255] / FULL
    print(f'{out.relative_to(ROOT)}: {layer.shape[1]} x {layer.shape[0]}, {out.stat().st_size} bytes; share of the land under the '
          f'plough, by map area: mean {known.mean():.3f}, median {np.median(known):.3f}, most {known.max():.3f}')


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 1291)
