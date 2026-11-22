"""The terrain and forest cover of the places beyond the game map (tools/geo/merge_beyond.py), after build_setup.py's
rules; the deserts and the impassable from aridity and height.
"""

import numpy as np


def terrain_of(temp, arid, lat, elev, rough, emax, dens, L2):
    """terrain and forest share of each new place; temp, arid and dens per new place, lat, elev, rough and emax by the
    ids of the beyond raster (0 unused)"""
    terrain, forest = [], np.zeros(L2)
    for i in range(L2):
        T, A, e, r, em = temp[i], arid[i], elev[1 + i], rough[1 + i], emax[1 + i]
        if (lat[1 + i] > 60 and e > 500) or (A > 0.95 and dens[i] < 0.1) or e > 4200:
            t = 'wasteland'
        elif em > 2300 or (e > 1200 and r > 220) or r > 420:
            t = 'mountains'
        elif A > 0.85:
            t = 'desert'
        elif T > 23 and A < 0.35 and abs(lat[1 + i]) < 15:
            t = 'jungle'
        elif T < -1.5:
            t = 'tundra'
        elif e > 450 or r > 130:
            t = 'hills'
        elif A > 0.55:
            t = 'steppe'
            forest[i] = float(np.clip((0.68 - A) * 2.2 - dens[i] / 60, 0, 0.3))
        else:
            fc = float(np.clip((1 - A) * 1.15 - dens[i] / 32.0, 0, 1))
            if lat[1 + i] > 58:
                fc = min(1, fc + 0.25)
            forest[i] = fc
            t = 'forest' if fc > 0.55 else ('farmland' if dens[i] > 14 else 'plains')
        if t in ('hills', 'mountains'):
            forest[i] = float(np.clip((1 - A) * 0.9 - dens[i] / 50, 0, 1))
        terrain.append(t)
    return terrain, forest
