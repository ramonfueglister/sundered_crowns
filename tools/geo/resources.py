"""The natural resource of every location of the map (stage D, build_setup.py, and the lands beyond, merge_beyond.py):
the historical deposits and specialised regions of c.1356 where a location lies near one, else by terrain and climate.
"""

import hashlib

import numpy as np

RES_POINTS = [
    # (good, lon, lat, radius_km) – historical deposits and specialised regions c.1356
    ('silver', 15.27, 49.95, 40),
    ('silver', 13.34, 50.92, 40),
    ('silver', 11.71, 47.35, 35),
    ('silver', 18.90, 48.45, 40),
    ('silver', 15.58, 49.40, 35),
    ('silver', 10.43, 51.89, 30),
    ('silver', 8.53, 39.31, 50),
    ('silver', 21.42, 42.73, 40),
    ('silver', 19.30, 44.10, 40),
    ('silver', 23.0, 48.0, 35),
    ('gold', 18.90, 48.67, 40),
    ('gold', 23.20, 46.20, 60),
    ('gold', -5.0, 12.0, 300),
    ('gold', -1.5, 6.5, 200),
    ('gold', 31.0, -19.0, 250),
    ('copper', 15.63, 60.60, 60),
    ('copper', 11.55, 51.60, 40),
    ('copper', 19.15, 48.73, 40),
    ('copper', 33.0, 35.0, 60),
    ('iron_ore', 14.90, 47.52, 50),
    ('iron_ore', 15.0, 59.9, 120),
    ('iron_ore', -2.9, 43.3, 70),
    ('iron_ore', 11.9, 49.45, 50),
    ('iron_ore', 7.8, 51.2, 50),
    ('iron_ore', 9.6, 45.9, 50),
    ('iron_ore', 2.0, 42.3, 50),
    ('iron_ore', 31.6, 61.5, 150),
    ('tin', -5.0, 50.3, 70),
    ('tin', 13.0, 50.6, 40),
    ('salt', 13.65, 47.56, 30),
    ('salt', 13.09, 47.68, 30),
    ('salt', 12.88, 47.72, 25),
    ('salt', 10.41, 53.25, 30),
    ('salt', 20.05, 49.98, 35),
    ('salt', -2.0, 47.0, 60),
    ('salt', -8.9, 38.5, 50),
    ('salt', 6.3, 46.8, 50),
    ('salt', 24.0, 47.0, 80),
    ('salt', -2.2, 53.2, 40),
    ('salt', -10.0, 23.0, 250),
    ('salt', 34.5, 46.2, 80),
    ('salt', 18.0, 49.95, 25),
    ('alum', 26.75, 38.65, 60),
    ('alum', 11.95, 42.15, 30),
    ('fish', 12.9, 55.4, 120),
    ('fish', 13.5, 68.2, 180),
    ('fish', 4.5, 52.5, 100),
    ('fish', -4.0, 57.5, 120),
    ('fish', 5.5, 61.0, 160),
    ('furs', 40.0, 62.0, 700),
    ('furs', 31.0, 58.5, 200),
    ('furs', 55.0, 60.0, 500),
    ('furs', -70.0, 50.0, 1000),
    ('wool', -1.5, 52.5, 250),
    ('wool', -4.5, 40.5, 300),
    ('wool', -3.5, 55.5, 120),
    ('wool', 13.0, 41.8, 120),
    ('grapes', -0.6, 44.85, 120),
    ('grapes', 4.5, 47.0, 90),
    ('grapes', 4.0, 49.1, 50),
    ('grapes', 7.5, 50.0, 90),
    ('grapes', 11.2, 43.5, 120),
    ('grapes', -8.0, 41.2, 80),
    ('grapes', 16.5, 48.4, 60),
    ('grapes', 21.4, 48.2, 50),
    ('grapes', 23.0, 38.0, 200),
    ('grapes', 3.5, 43.6, 120),
    ('grapes', -3.0, 39.0, 220),
    ('grapes', 14.5, 41.0, 150),
    ('grapes', 33.0, 34.9, 80),
    ('olives', -4.5, 37.5, 200),
    ('olives', 16.5, 40.8, 160),
    ('olives', 22.5, 37.5, 200),
    ('olives', 10.0, 35.5, 150),
    ('olives', 36.0, 34.0, 150),
    ('olives', 13.5, 37.5, 100),
    ('silk', 10.5, 43.85, 60),
    ('silk', 15.0, 37.8, 80),
    ('silk', -1.0, 37.5, 80),
    ('silk', 49.5, 37.3, 120),
    ('silk', 36.5, 35.0, 120),
    ('silk', 29.0, 40.2, 60),
    ('cotton', 37.2, 36.2, 150),
    ('cotton', 31.0, 30.5, 200),
    ('cotton', 33.0, 35.0, 80),
    ('cotton', 55.0, 38.0, 250),
    ('sugarcane', 33.0, 35.0, 80),
    ('sugarcane', 31.2, 30.5, 150),
    ('sugarcane', 13.5, 37.9, 60),
    ('sugarcane', -0.4, 38.8, 60),
    ('dyes', 4.8, 43.9, 80),
    ('dyes', 10.5, 50.9, 70),
    ('dyes', 1.6, 43.6, 80),
    ('horses', 36.0, 48.0, 400),
    ('horses', 19.8, 47.0, 120),
    ('horses', -5.5, 37.5, 120),
    ('horses', 45.0, 47.0, 400),
    ('horses', 3.0, 34.5, 300),
    ('amber', 20.3, 54.8, 80),
    ('honey', 25.0, 54.5, 300),
    ('honey', 37.0, 55.0, 400),
    ('saltpeter', 15.5, 49.8, 120),
    ('saltpeter', 48.0, 31.5, 200),
    ('stone', 2.4, 48.5, 60),
    ('stone', 10.1, 44.07, 30),
    ('spices', 43.5, 13.0, 200),
    ('coffee', 43.7, 14.5, 140),
    ('cotton', -88.0, 20.0, 400),
    ('cotton', -75.0, -10.0, 400),
    ('tobacco', -78.0, 21.0, 600),
    ('sugarcane', -70.0, 19.0, 400),
]


def assign_resources(L, lon, lat, terrain, coastal, T, A, dens, forest):
    pts = np.array([[p[1], p[2]] for p in RES_POINTS])
    out = []
    for i in range(L):
        t = terrain[i]
        # nearest specific deposit
        d = np.sqrt(((pts[:, 0] - lon[i]) * np.cos(np.radians(lat[i]))) ** 2 + (pts[:, 1] - lat[i]) ** 2) * 111
        k = int(np.argmin(d / np.array([p[3] for p in RES_POINTS])))
        h = int(hashlib.md5(f'{i}'.encode()).hexdigest()[:6], 16) / 0xFFFFFF
        if d[k] < RES_POINTS[k][3] and h < 0.65:
            out.append(RES_POINTS[k][0])
            continue
        if t == 'wasteland':
            out.append('salt' if h < 0.1 else 'stone')
            continue
        if coastal[i] and h < 0.28:
            out.append('fish')
            continue
        if t == 'mountains':
            out.append(['stone', 'iron_ore', 'livestock', 'timber', 'copper'][int(h * 5)])
            continue
        if t == 'hills':
            out.append(
                ['livestock', 'wool', 'grapes' if T[i] > 9 and A[i] < 0.6 else 'stone', 'iron_ore', 'timber'][
                    int(h * 5)
                ]
            )
            continue
        if t == 'forest':
            out.append(['timber', 'timber', 'furs' if lat[i] > 52 else 'honey', 'livestock'][int(h * 4)])
            continue
        if t == 'tundra':
            out.append('furs' if h < 0.6 else 'fish')
            continue
        if t == 'marsh':
            out.append(['fish', 'livestock', 'salt'][int(h * 3)])
            continue
        if t == 'steppe':
            out.append(['horses', 'livestock', 'wool', 'grain'][int(h * 4)])
            continue
        if t == 'desert':
            out.append(['livestock', 'salt', 'horses'][int(h * 3)])
            continue
        if t == 'jungle':
            out.append(['timber', 'dyes', 'spices' if lon[i] > 0 else 'cotton'][int(h * 3)])
            continue
        # plains / farmland
        if T[i] > 14 and A[i] > 0.35 and h < 0.35:
            out.append('olives' if lon[i] > -10 else 'cotton')
            continue
        if lat[i] > 47 and lat[i] < 60 and h < 0.3:
            out.append('flax')
            continue
        out.append(['grain', 'grain', 'grain', 'livestock', 'wool'][int(h * 5)])
    return out
