"""Makes the coarser steps of a region of the world probe, for views from far away.

Step z of a region is the same map with cells 2^z times as wide, in the same tiles and files as the region itself
(public/map/regions/<name>/z<z>/). Each step is made from the one before it, two by two cells into one: a cell is land
if half of it is, its height lies between the mean and the highest of its land, its drainage is the largest, forest
and cultivation are the means. Of the rivers only the larger ones go along, the fewer the coarser the step.

A world goes round the globe: its width is a whole number of the cells of every step (build_region.py), so that
each step joins itself as the world does.

Usage: python3 tools/worldprobe/build_overviews.py world      (some minutes and 6 GB of memory; run after build_region.py)
"""
import gzip, json, os, shutil, sys
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
STEPS = 7
LAND, SEA, LAKE = 0, 1, 2
BAND = 2048
# the rivers of a step: those of at most this rank (Natural Earth's scale rank; rivers read from the drainage are 9 and 10)
RANK = {1: 10, 2: 8, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2}


def write(out, meta, layers, rivers, gx0, gy0):
    """Writes the tiles of one step: `layers` cover the window that starts at cell (gx0, gy0) of the step's whole map."""
    T, (h, w) = meta['tile'], layers[2].shape
    shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    tiles = []
    for ty in range(gy0 // T, (gy0 + h - 1) // T + 1):
        for tx in range(gx0 // T, (gx0 + w - 1) // T + 1):
            # the tile's part of the window; what lies outside the window is open sea
            y0, y1, x0, x1 = max(gy0, ty * T), min(gy0 + h, (ty + 1) * T), max(gx0, tx * T), min(gx0 + w, (tx + 1) * T)
            if (layers[2][y0 - gy0:y1 - gy0, x0 - gx0:x1 - gx0] == SEA).all(): continue
            key = f'{tx}_{ty}'; tiles.append(key)
            with gzip.open(os.path.join(out, f'{key}.bin.gz'), 'wb', compresslevel=9) as f:
                for k, layer in enumerate(layers):
                    full = np.full((T, T), SEA if k == 2 else 0, layer.dtype)
                    full[y0 - ty * T:y1 - ty * T, x0 - tx * T:x1 - tx * T] = layer[y0 - gy0:y1 - gy0, x0 - gx0:x1 - gx0]
                    f.write(full.tobytes())
            bx0, by0, bx1, by1, crossing = tx * T - 8, ty * T - 8, (tx + 1) * T + 8, (ty + 1) * T + 8, []
            for r in rivers:
                inside = [bx0 <= p[0] <= bx1 and by0 <= p[1] <= by1 for p in r['pts']]
                run = []
                for i, p in enumerate(r['pts'] + [None]):
                    if p is not None and (inside[i] or (i > 0 and inside[i - 1]) or (i + 1 < len(inside) and inside[i + 1])): run.append(p); continue
                    if len(run) >= 2: crossing.append({'name': r['name'], 'rank': r['rank'], 'pts': run})
                    run = []
            with open(os.path.join(out, f'{key}.json'), 'w', encoding='utf-8') as f:
                json.dump(crossing, f, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(out, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump({**meta, 'tiles': tiles}, f, separators=(',', ':'))
    return len(tiles), sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))


def halve(*layers):
    """Two by two cells into one, a band of rows at a time to keep the memory in bounds."""
    bands = [halve_band(*(l[r:r + BAND] for l in layers)) for r in range(0, layers[0].shape[0], BAND)]
    return tuple(np.concatenate([b[k] for b in bands]) for k in range(len(layers)))


def halve_band(shaped, drainage, water, forest, crops):
    four = lambda a: a.reshape(a.shape[0] // 2, 2, a.shape[1] // 2, 2).swapaxes(1, 2).reshape(a.shape[0] // 2, a.shape[1] // 2, 4)
    w4, s4 = four(water), four(shaped).astype(np.float32)
    land, lake = w4 == LAND, w4 == LAKE
    n_land, n_lake = land.sum(2), lake.sum(2)
    out = np.where(n_land >= 2, LAND, np.where(n_lake > 4 - n_land - n_lake, LAKE, SEA)).astype(np.uint8)
    over = lambda v, m, n: (v * m).sum(2) / np.maximum(n, 1)
    high = np.where(land, s4, -1e9).max(2)
    height = np.where(out == LAND, 0.5 * over(s4, land, n_land) + 0.5 * high, np.where(out == LAKE, over(s4, lake, n_lake), 0))
    return (np.round(height).astype('<i2'), four(drainage).max(2), out,
            np.round(np.where(out == LAND, over(four(forest).astype(np.float32), land, n_land), 0)).astype(np.uint8),
            np.round(np.where(out == LAND, over(four(crops).astype(np.float32), land, n_land), 0)).astype(np.uint8))


def main(name):
    base = os.path.join(ROOT, 'public', 'map', 'regions', name)
    meta = json.load(open(os.path.join(base, 'index.json')))
    T, keys, cells = meta['tile'], [tuple(map(int, k.split('_'))) for k in meta.pop('tiles')], meta['cells']
    # the tiles the region reaches over: all of a world (the last one across is cut short where it joins itself and
    # filled up with sea, which stays sea at every step), else the box of those it has
    tx0, ty0 = (0, 0) if 'worldW' in meta else (min(k[0] for k in keys), min(k[1] for k in keys))
    across, down = (-(-meta['worldW'] * cells // T), meta['worldH'] * cells // T) if 'worldW' in meta else (max(k[0] for k in keys) - tx0 + 1, max(k[1] for k in keys) - ty0 + 1)
    # the first step is made tile by tile, so that the region itself is never held whole
    w, h, half = across * T // 2, down * T // 2, T // 2
    layers = [np.zeros((h, w), '<i2'), np.zeros((h, w), np.uint8), np.full((h, w), SEA, np.uint8), np.zeros((h, w), np.uint8), np.zeros((h, w), np.uint8)]
    rivers = []
    for tx, ty in keys:
        raw, at, tile = gzip.open(os.path.join(base, f'{tx}_{ty}.bin.gz')).read(), 0, []
        for layer in layers:
            n = T * T * layer.dtype.itemsize
            tile.append(np.frombuffer(raw[at:at + n], layer.dtype).reshape(T, T)); at += n
        for layer, halved in zip(layers, halve_band(*tile)): layer[(ty - ty0) * half:(ty - ty0 + 1) * half, (tx - tx0) * half:(tx - tx0 + 1) * half] = halved
        rivers += json.load(open(os.path.join(base, f'{tx}_{ty}.json'), encoding='utf-8'))
    gx0, gy0 = tx0 * T, ty0 * T
    for z in range(1, STEPS + 1):
        if z > 1: layers = halve(*layers)
        gx0 //= 2; gy0 //= 2; k = 2 ** z
        coarse = []
        for r in rivers:
            if r['rank'] > RANK[z]: continue
            pts = []
            for i, (x, y) in enumerate(r['pts']):
                p = [round(x / k, 2), round(y / k, 2)]
                if not pts or i == len(r['pts']) - 1 or abs(p[0] - pts[-1][0]) + abs(p[1] - pts[-1][1]) >= 0.75: pts.append(p)
            if len(pts) >= 2 and abs(pts[0][0] - pts[-1][0]) + abs(pts[0][1] - pts[-1][1]) >= 1: coarse.append({'name': r['name'], 'rank': r['rank'], 'pts': pts})
        n, size = write(os.path.join(base, f'z{z}'), {**meta, 'name': f'{name}/z{z}', 'cells': cells / k}, layers, coarse, gx0, gy0)
        print(f'{name}/z{z}: {layers[2].shape[1]} x {layers[2].shape[0]} cells, {n} tiles, {size / 1e6:.1f} MB, {len(coarse)} river pieces')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'world')
