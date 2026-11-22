"""The rivers that Natural Earth's lines leave out, read from the drainage of the eroded land (erosion.py).

build_region.py draws the rivers of Natural Earth and of 1356 on the cut, and adds these to them.
"""

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


def read_rivers(area, water, drawn, km):
    """
    (`km` is the size of a cell in each row.)
    The rivers that the drawn lines leave out, read from the drainage: every run of land cells through which at least
    RIVER_FROM km² drain, from where it lies clear of the drawn rivers down to the water or to the drawn river it
    joins. A run ends where the path goes straight for long, which is where the heights are too flat to say where the
    water runs; what then ends in the open plain is dropped.
    """
    RIVER_FROM, CLEAR_KM, STRAIGHT, SHORTEST = 400, 7, 10, 10
    h, w = area.shape
    img = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(img)
    for r in drawn:
        d.line([tuple(p) for p in r['pts']], fill=1, width=1)
    away = ndimage.distance_transform_edt(np.asarray(img) == 0)
    clear, stream = away * km[:, None] > CLEAR_KM, (area >= RIVER_FROM * 1e6) & (water == 0)
    down = {}
    for y, x in zip(*np.nonzero(stream)):
        best = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                ny, nx = y + dy, x + dx
                if (
                    (dy or dx)
                    and 0 <= ny < h
                    and 0 <= nx < w
                    and area[ny, nx] > area[y, x]
                    and (best is None or area[ny, nx] < area[best])
                ):
                    best = (ny, nx)
        if best:
            down[(y, x)] = best
    fed = {v for c, v in down.items() if clear[c]}
    heads, seen, found = [c for c in down if clear[c] and c not in fed], set(), []
    for head in sorted(heads, key=lambda c: area[c]):
        path, c, beside = [], head, 0
        while c in down and c not in seen:
            seen.add(c)
            path.append(c)
            beside = 0 if clear[c] else beside + 1
            # beside a drawn river: it is joined soon, or the path is that river itself, read a little off its line
            if away[c] <= 1.5:
                break
            if beside * km[c[0]] > 2 * CLEAR_KM:
                path = path[:-beside]
                break
            c = down[c]
        else:
            path.append(c)
        # cut out the straight stretches
        runs, start, last = [], 0, None
        for i in range(1, len(path)):
            step = (path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
            if i == 1 or step != last:
                turn = i - 1
            last = step
            if i - turn == STRAIGHT:
                runs.append(path[start : turn + 1])
                start = None
            if start is None and i - turn < STRAIGHT:
                start = i - 1
        if start is not None:
            runs.append(path[start:])
        found += [run for run in runs if len(run) >= SHORTEST]
    # a river goes on to water, to a drawn river or to another river that does; what ends in the open plain is dropped
    kept, reached = [], ~clear | ndimage.binary_dilation(water != 0, iterations=2)
    while True:
        more = [run for run in found if reached[run[-1]]]
        if not more:
            break
        for run in more:
            found.remove(run)
            kept.append(run)
            for c in run:
                reached[c] = True
    return [
        {
            'name': '',
            'rank': 10 if area[run[-1]] < 2000e6 else 9,
            'pts': [[float(x) + 0.5, float(y) + 0.5] for y, x in run[::2] + run[-1:]],
        }
        for run in kept
    ]
