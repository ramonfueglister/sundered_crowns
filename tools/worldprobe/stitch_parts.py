"""Joins the parts of the world where they meet.

Every part of the world is shaped by its rivers on its own (build_region.py), with a margin of land around it. Where
a wide closed basin or a long valley is cut by the edge of a part, the two parts shape it differently, and the land
steps where they meet. This takes the step out: along every line on which two parts meet, what the land steps by
beyond its own slope there is spread over REACH cells to either side, half to each. Water keeps its level, and so
does the land on its shore.

Run it once all parts are built, before build_overviews.py. A part built anew is joined to its neighbours by
naming it: then only the lines along its edges are joined. (A line joined twice is spread a little further each
time, so the lines of parts that have not changed are left alone.)

Usage: python3 tools/worldprobe/stitch_parts.py [--dry] [part ...]      (--dry only tells how the land steps at every line)
"""

import os, sys
import numpy as np
from scipy import ndimage

from build_region import ACROSS, PARTS, ROOT, SEA, TILE, tile_start
import tiles as tiles_file

# the step is spread over this many cells to either side of the line
REACH = 96
# along the line the step is taken as its middle value over this many cells, then evened out over as many again
ALONG = 9
# within this many cells of water the land keeps more and more of its height, on the shore all of it
SHORE = 12
OUT = os.path.join(ROOT, 'public', 'map', 'regions', 'world')


def key(tx, ty):
    return f'{tx % ACROSS}_{ty}'


def width(tx):
    return tile_start(tx % ACROSS + 1) - tile_start(tx % ACROSS)


def read(tx, ty):
    """The heights and the water of a tile (None: open sea), and all its bytes."""
    raw = tiles_file.read(OUT, key(tx, ty), TILE)
    if raw is None:
        return None
    raw = bytearray(raw)
    return (
        raw,
        np.frombuffer(raw, '<i2', TILE * TILE).reshape(TILE, TILE),
        np.frombuffer(raw, np.uint8, TILE * TILE, TILE * TILE * 3).reshape(TILE, TILE),
    )


def lines():
    """The lines on which two parts meet: (upright, the tile after the line, the first tile along it and the one after the last)."""
    seen = set()
    for x0, y0, x1, y1 in PARTS.values():
        for line in ((True, x0 % ACROSS, y0, y1),) + (((False, y0, x0, x1),) if y0 > 0 else ()):
            if line not in seen:
                seen.add(line)
                yield line


def touches(line, part):
    """Whether a line runs along an edge of a part."""
    upright, at, first, last = line
    x0, y0, x1, y1 = PARTS[part]
    if upright:
        return at in (x0 % ACROSS, x1 % ACROSS) and first < y1 and last > y0
    return at in (y0, y1) and any(first < x1 + lap and last > x0 + lap for lap in (-ACROSS, 0, ACROSS))


def strips(upright, at, k):
    """The two strips of REACH cells that meet at a line within tile `k` along it, each as (tile, heights, water) seen from the line outwards."""
    sides = []
    for after in (False, True):
        tx, ty = (at if after else at - 1, k) if upright else (k, at if after else at - 1)
        tile = read(tx, ty)
        if tile is None:
            sides.append(None)
            continue
        _, h, water = tile
        w = width(tx)
        if upright:
            cut = (slice(None), slice(0, REACH) if after else slice(w - 1, w - 1 - REACH, -1))
        else:
            cut = (slice(0, REACH) if after else slice(TILE - 1, TILE - 1 - REACH, -1), slice(0, w))
        hs, ws = h[cut], water[cut]
        # along the line first, outwards second
        sides.append((tile, hs if upright else hs.T, ws if upright else ws.T, (tx, ty)))
    return sides


def stitch(upright, at, first, last, dry):
    held = [strips(upright, at, k) for k in range(first, last)]
    n = [TILE if upright else width(k) for k in range(first, last)]

    def whole(side, layer, empty):
        return np.concatenate(
            [(s[side][layer] if s[side] else np.full((m, REACH), empty)) for s, m in zip(held, n)]
        ).astype(np.float32)

    a, b, wa, wb = whole(0, 1, 0), whole(1, 1, 0), whole(0, 2, SEA), whole(1, 2, SEA)
    # the step at the line beyond the slope the land has to either side of it
    land = (wa[:, :2] == 0).all(1) & (wb[:, :2] == 0).all(1)
    step = np.where(land, (b[:, 0] - a[:, 0]) - ((a[:, 0] - a[:, 1]) + (b[:, 1] - b[:, 0])) / 2, 0)
    even = ndimage.uniform_filter1d(ndimage.median_filter(step, ALONG, mode='nearest'), ALONG, mode='nearest')
    name = f'{"|" if upright else "-"} {at} from {first} to {last}'
    if not land.any():
        return 0
    print(
        f'{name}: land {land.mean():.0%}, step {np.abs(step[land]).mean():.1f} m, evened {np.abs(even[land]).mean():.1f} m, largest {np.abs(even).max():.0f} m, over 20 m {np.mean(np.abs(even[land]) > 20):.1%}'
    )
    if dry:
        return 0
    # how much of the step a cell takes: half at the line, falling to nothing REACH cells out, and nothing on a shore
    fall = 0.25 * (1 + np.cos(np.pi * (np.arange(REACH) + 0.5) / REACH))
    both = np.concatenate([wa[:, ::-1], wb], 1) == 0
    dry_land = np.clip(ndimage.distance_transform_edt(both) / SHORE, 0, 1)
    shift = even[:, None] * fall[None, :]
    new_a = np.where(wa == 0, np.maximum(1, a + shift * dry_land[:, :REACH][:, ::-1]), a)
    new_b = np.where(wb == 0, np.maximum(1, b - shift * dry_land[:, REACH:]), b)
    written, row = 0, 0
    for s, m in zip(held, n):
        for side, new in ((0, new_a), (1, new_b)):
            if s[side] is None:
                continue
            (raw, h, _), hs, _, (tx, ty) = s[side]
            fresh = np.round(new[row : row + m]).astype('<i2')
            if (fresh == hs).all():
                continue
            w = width(tx)
            # the heights of the tile look into its bytes: the strip is written back where it was cut from
            if upright:
                h[:, (slice(0, REACH) if side else slice(w - 1, w - 1 - REACH, -1))] = fresh
            else:
                h[(slice(0, REACH) if side else slice(TILE - 1, TILE - 1 - REACH, -1)), :w] = fresh.T
            # written beside the tile and put in its place whole, so that a run cut short leaves no half tile
            tiles_file.write(OUT, key(tx, ty), bytes(raw), TILE, tiles_file.coded(OUT))
            written += 1
        row += m
    return written


if __name__ == '__main__':
    dry, named = '--dry' in sys.argv, [a for a in sys.argv[1:] if a != '--dry']
    for part in named:
        if part not in PARTS:
            sys.exit(f'no part {part}')
    # the upright lines first: where four parts meet, the level ones then join what those have made
    count = sum(
        stitch(*line, dry)
        for line in sorted(lines(), key=lambda l: not l[0])
        if not named or any(touches(line, p) for p in named)
    )
    print(f'{count} tiles written')
