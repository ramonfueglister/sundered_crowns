"""Writes the tiles of a region anew in the coding of tiles.py (heights as differences, zipped with Brotli), where
they are plain rasters zipped with gzip, without cutting the region again. Every tile is checked to come back to the
very bytes it held. The index says the coding once all tiles are written. The coarser steps (z1 … z7) stay as they
are: the world graphic draws their pieces from the tables built ahead (src/worldprobe/table.ts).

Usage: python3 tools/worldprobe/recode_regions.py world      (some minutes on all cores; needs pip install brotli)
"""

import gzip, json, os, sys
from multiprocessing import Pool
import tiles

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')


def recode(job):
    folder, key, tile = job
    old = tiles.path_of(folder, key, br=False)
    if not os.path.exists(old):
        return 0, 0
    with open(old, 'rb') as f:
        zipped = f.read()
    raw = gzip.decompress(zipped)
    packed = tiles.pack(raw, tile)
    if tiles.unpack(packed, tile) != raw:
        raise ValueError(f'{key}: not the same after packing')
    with open(tiles.path_of(folder, key) + '.new', 'wb') as f:
        f.write(packed)
    os.replace(tiles.path_of(folder, key) + '.new', tiles.path_of(folder, key))
    os.remove(old)
    return len(zipped), len(packed)


def main(name):
    folder = os.path.join(ROOT, 'public', 'map', 'regions', name)
    index_path = os.path.join(folder, 'index.json')
    index = json.load(open(index_path))
    jobs = [(folder, key, index['tile']) for key in index['tiles']]
    before = after = done = 0
    with Pool() as pool:
        for b, a in pool.imap_unordered(recode, jobs, chunksize=8):
            before += b
            after += a
            done += 1
            if done % 500 == 0:
                print(f'{done} of {len(jobs)}', flush=True)
    left = [key for key in index['tiles'] if not os.path.exists(tiles.path_of(folder, key))]
    if left:
        sys.exit(f'{len(left)} tiles not written, e.g. {left[0]}: the index stays as it was')
    index['coding'] = 'br'
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, separators=(',', ':'))
    print(
        f'{name}: {len(jobs)} tiles, {before / 1e6:.0f} MB before, {after / 1e6:.0f} MB now'
        if before
        else f'{name}: written in this coding already'
    )


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'world')
