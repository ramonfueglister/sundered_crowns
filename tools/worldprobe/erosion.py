"""River erosion after the stream power law, to give the real heights the clean valleys and ridges of water-carved land.

Method: Cordonnier et al. 2016, "Large Scale Terrain Generation from Tectonic Uplift and Fluvial Erosion" (Computer
Graphics Forum 35/2). Height changes by uplift minus k · A^m · slope^n, with A the area draining through a cell;
with n = 1 the step is solved implicitly, cell after cell from the outlets upstream (their equation for h(t + δt)).
Slopes steeper than a talus angle are cut back, as in the paper. Constants k, m, n and δt are the paper's.

Here the land does not start from nothing: it starts as the real terrain, and the uplift is steered so that the broad
shape (heights smoothed over a few kilometres) stays the real one. Erosion then only redraws what is finer than that.
Needs numba.
"""

import heapq

import numpy as np
from numba import njit
from scipy import ndimage

K, M, DT = 5.61e-7, 0.5, 2.5e5
TALUS = np.tan(np.radians(30))
NEIGHBOURS = np.array([[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]])


@njit(cache=True)
def _fill(h, fixed):
    """Raises pits until every cell drains to a fixed cell (priority flood, with a slight fall so that water finds its way)."""
    rows, cols = h.shape
    out = np.full(h.shape, np.inf)
    heap = [(0.0, 0, 0)][:0]
    for y in range(rows):
        for x in range(cols):
            if fixed[y, x] or y == 0 or x == 0 or y == rows - 1 or x == cols - 1:
                out[y, x] = h[y, x]
                heapq.heappush(heap, (h[y, x], y, x))
    while len(heap) > 0:
        v, y, x = heapq.heappop(heap)
        for k in range(8):
            ny, nx = y + NEIGHBOURS[k, 0], x + NEIGHBOURS[k, 1]
            if ny < 0 or nx < 0 or ny >= rows or nx >= cols or out[ny, nx] != np.inf:
                continue
            out[ny, nx] = max(h[ny, nx], v + 0.01)
            heapq.heappush(heap, (out[ny, nx], ny, nx))
    return out


@njit(cache=True)
def _step(h, fixed, uplift, cell):
    """One time step; `cell` is the cell size of each row. Returns the new heights and the drainage area of every cell (m²)."""
    rows, cols = h.shape
    h = _fill(h, fixed)
    order = np.argsort(h.ravel())
    receiver = np.full(rows * cols, -1)
    reach = np.zeros(rows * cols)
    for y in range(rows):
        for x in range(cols):
            if fixed[y, x] or y == 0 or x == 0 or y == rows - 1 or x == cols - 1:
                continue
            steepest = 0.0
            for k in range(8):
                ny, nx = y + NEIGHBOURS[k, 0], x + NEIGHBOURS[k, 1]
                d = cell[y] * np.sqrt(NEIGHBOURS[k, 0] ** 2 + NEIGHBOURS[k, 1] ** 2)
                fall = (h[y, x] - h[ny, nx]) / d
                if fall > steepest:
                    steepest = fall
                    receiver[y * cols + x] = ny * cols + nx
                    reach[y * cols + x] = d
    area = np.repeat(cell * cell, cols)
    for i in order[::-1]:
        if receiver[i] >= 0:
            area[receiver[i]] += area[i]
    new = h.ravel().copy()
    flat_uplift = uplift.ravel()
    for i in order:
        j = receiver[i]
        if j < 0:
            continue
        c = K * area[i] ** M / reach[i] * DT
        new[i] = (new[i] + DT * flat_uplift[i] + c * new[j]) / (1 + c)
        if new[i] - new[j] > TALUS * reach[i]:
            new[i] = new[j] + TALUS * reach[i]
    return new.reshape(rows, cols), area.reshape(rows, cols)


def erode(height, fixed, cell, steps=60, keep=6.0):
    """
    Erodes `height` (metres) for `steps` time steps. `fixed` cells (water, the edge) keep their height. `cell` is the
    cell size in metres, one value or one per row, `keep` the width in cells over which the real shape is held. Returns heights and drainage area.
    """
    real, cell = height.astype(np.float64), np.broadcast_to(np.asarray(cell, np.float64), height.shape[:1]).copy()
    broad = ndimage.gaussian_filter(real, keep)
    h, uplift, area = real.copy(), 5e-4 * np.clip(broad / 2000, 0, None), None
    for _ in range(steps):
        h, area = _step(h, fixed, uplift, cell)
        # steer the uplift: where the land has sunk below the real broad shape it is pushed up harder, and the reverse
        uplift *= np.clip((broad + 100) / (ndimage.gaussian_filter(h, keep) + 100), 0.8, 1.25)
    return np.where(fixed, real, h), area


def erode_lands(height, fixed, sea, cell, apart=48):
    """
    `erode` for a window that is mostly sea: every piece of land, with the sea within `apart` cells of it, is eroded on
    its own, in the box that holds it. Pieces of land farther apart than that do not drain into each other, so the
    land comes out as if the whole window had been eroded at once, and the open sea is not worked on at all.
    """
    cell = np.broadcast_to(np.asarray(cell, np.float64), height.shape[:1])
    shaped, area = height.astype(np.float64).copy(), np.repeat((cell * cell)[:, None], height.shape[1], axis=1)
    pieces, _ = ndimage.label(ndimage.maximum_filter((~sea).astype(np.uint8), size=2 * apart + 1))
    for k, box in enumerate(ndimage.find_objects(pieces), 1):
        own = pieces[box] == k
        h, a = erode(height[box], fixed[box], cell[box[0]])
        shaped[box][own], area[box][own] = h[own], a[own]
    return shaped, area
