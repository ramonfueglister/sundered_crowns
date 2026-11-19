"""The files of a region's tiles (public/map/regions/<name>/<tx>_<ty>.bin), as src/worldprobe/region.ts reads them.

A tile holds its rasters layer after layer, row by row: the heights (int16) and four layers of bytes (drainage, water,
forest, crops). The heights are written as their differences to the cell on the left (in the first column: to the
cell above), zigzagged into whole numbers from nought (0, -1, 1, -2 … as 0, 1, 2, 3 …), the low bytes of all cells
before their high bytes: the land rises smoothly, so most differences are small and their high bytes nought. The
layers follow as they are, and the whole is zipped with Brotli. A tile is 26 % smaller so than as plain rasters
zipped with gzip (22 tiles of the world: 263 instead of 358 KB in the mean), and a fifth of that comes of the
differences. A region's index says so with "coding": "br"; one without it has its tiles as <tx>_<ty>.bin.gz, the
plain rasters zipped with gzip (the coarser steps of build_overviews.py).

Needs Brotli for Python: pip install brotli
"""
import gzip, os
import numpy as np


def coded(folder):
    """Whether the tiles of a region's folder are written in the coding above, by its index."""
    import json
    path = os.path.join(folder, 'index.json')
    return os.path.exists(path) and json.load(open(path)).get('coding') == 'br'


def path_of(folder, key, br=True):
    return os.path.join(folder, f'{key}.bin' if br else f'{key}.bin.gz')


def pack(raw, tile):
    """The plain rasters of a tile (bytes) in the coding above."""
    import brotli
    t = tile * tile
    s = np.frombuffer(raw, '<i2', t).reshape(tile, tile).astype(np.int32)
    d = np.empty_like(s)
    d[:, 1:] = s[:, 1:] - s[:, :-1]; d[1:, 0] = s[1:, 0] - s[:-1, 0]; d[0, 0] = s[0, 0]
    d = (d + 32768) % 65536 - 32768
    z = np.where(d >= 0, 2 * d, -2 * d - 1).astype('<u2').view(np.uint8).reshape(-1, 2)
    body = z[:, 0].tobytes() + z[:, 1].tobytes() + bytes(raw[t * 2:])
    return brotli.compress(body, quality=10, lgwin=22)


def unpack(packed, tile):
    """The plain rasters of a tile from the coding above."""
    import brotli
    body, t = brotli.decompress(packed), tile * tile
    z = np.frombuffer(body, np.uint8, t).astype(np.int64) | (np.frombuffer(body, np.uint8, t, t).astype(np.int64) << 8)
    d = np.where(z & 1, -((z + 1) >> 1), z >> 1).reshape(tile, tile)
    d[:, 0] = np.cumsum(d[:, 0])
    s = (np.cumsum(d, axis=1) + 32768) % 65536 - 32768
    return s.astype('<i2').tobytes() + body[t * 2:]


def read(folder, key, tile):
    """The plain rasters of a tile of a region's folder, as bytes; None where the folder has no such tile."""
    for br in (True, False):
        path = path_of(folder, key, br)
        if os.path.exists(path):
            with open(path, 'rb') as f: data = f.read()
            return unpack(data, tile) if br else gzip.decompress(data)
    return None


def write(folder, key, raw, tile, br=True):
    """Writes the plain rasters of a tile into a region's folder: in the coding above, or plain and zipped with gzip
    (no time of writing in the file: a tile that has not changed stays the same file). The other file of the tile goes."""
    path, other = path_of(folder, key, br), path_of(folder, key, not br)
    data = pack(raw, tile) if br else gzip.compress(bytes(raw), 9, mtime=0)
    with open(path + '.new', 'wb') as f: f.write(data)
    os.replace(path + '.new', path)
    if os.path.exists(other): os.remove(other)
