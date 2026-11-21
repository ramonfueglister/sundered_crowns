"""The grid of the world probe: how its cells and tiles lie on the globe.

The world is the game map (same Mercator projection as tools/geo) at CELLS cells per map pixel, cut into square tiles
of TILE cells, and goes on beyond the game map once round the globe and south to Cape Horn (WORLD_W, WORLD_H).
build_region.py cuts it; the other tools of this folder read places on it through these functions.
"""

import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'geo'))
from common import LON0, LON1, YMAX, YMIN, H, W

CELLS = 4
TILE = 512
# The world goes once round the globe: WORLD_W map pixels across, of which the first W are the game map (LON0 … LON1)
# and the rest the other side of the earth, and WORLD_H down, the game map's rows and on to 58° south. Beyond the
# game map a pixel is 0.2 % narrower in longitude than on it, so that the way round is a whole number of the cells of
# every step of the map (see build_overviews.py) and the world joins itself without a seam.
WORLD_W, WORLD_H = 13024, 6400
SPAN = LON1 - LON0
# tiles across the way round (the last one is cut short where the world joins itself)
ACROSS = -(-WORLD_W * CELLS // TILE)


def tile_start(t):
    """The first cell across of tile `t`, counted on round the globe."""
    return t // ACROSS * WORLD_W * CELLS + t % ACROSS * TILE


def world_lonlat(x, y):
    """Degrees of the map pixels `x`, `y` of the world; the longitude counts on beyond 180° where the columns do."""
    lap, xm = np.divmod(np.asarray(x, np.float64), WORLD_W)
    lon = np.where(xm < W, LON0 + xm / W * SPAN, LON1 + (xm - W) / (WORLD_W - W) * (360 - SPAN)) + 360 * lap
    return lon, np.degrees(np.arctan(np.sinh(YMAX - np.asarray(y, np.float64) / H * (YMAX - YMIN))))


def world_px(lon, lat):
    """Map pixel of the world of a place in degrees (longitude -180 … 180); the columns west of the game map are negative."""
    lon, far = np.asarray(lon, np.float64), (WORLD_W - W) / (360 - SPAN)
    x = np.where(lon < LON0, (lon - LON0) * far, np.where(lon <= LON1, (lon - LON0) / SPAN * W, W + (lon - LON1) * far))
    return x, (YMAX - np.arcsinh(np.tan(np.radians(lat)))) / (YMAX - YMIN) * H
