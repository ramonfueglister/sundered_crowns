"""The climate of a location of the map (stage D, build_setup.py, and the lands beyond, merge_beyond.py): the mean
temperature and the aridity by latitude, longitude and height, with the dry belts of c.1356.
"""

import hashlib

import numpy as np


def smoothstep(a, b, x):
    t = np.clip((np.asarray(x, float) - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# northern edge of the true steppe (aridity ≈ 0.55) as (lon, lat), c.1356
STEPPE_EDGE = [
    (24, 45.0),
    (26, 45.6),
    (28, 46.6),
    (30, 47.6),
    (32, 48.4),
    (34, 48.9),
    (36, 49.3),
    (38, 49.9),
    (40, 50.5),
    (42, 51.0),
    (44, 51.5),
    (46, 52.0),
    (48, 52.5),
    (50, 52.8),
    (55, 53.2),
    (60, 53.5),
    (65, 54.0),
    (70, 54.3),
]


def steppe_aridity(lon, lat):
    """Aridity of the Pontic–Caspian steppe belt and its forest-steppe fringe; 0.25 (humid) far to the north."""
    lon = np.asarray(lon, float)
    lat = np.asarray(lat, float)
    ex, ey = zip(*STEPPE_EDGE)
    # signed distance (degrees latitude) north of the steppe edge, with a gentle meander so the ecotone is not a ruled line
    d = lat - np.interp(lon, ex, ey) + 0.45 * np.sin(0.55 * lon + 1.3) + 0.3 * np.sin(1.7 * lon + 0.8 * lat)
    # steppe core 0.62 → edge 0.55 → forest-steppe (open land with groves, 0.55–0.47) → mixed forest 0.25
    A = np.interp(d, [-2.0, -0.3, 0.0, 1.0, 2.0, 3.0, 4.0], [0.62, 0.575, 0.55, 0.51, 0.47, 0.34, 0.25])
    # forest-steppe mosaic: per-location jitter, strongest in the ecotone (deterministic hash of position)
    h = np.array(
        [int(hashlib.md5(f'{a:.3f},{b:.3f}'.encode()).hexdigest()[:6], 16) / 0xFFFFFF for a, b in zip(lon, lat)]
    )
    eco = np.interp(d, [-1.5, -0.3, 2.0, 3.2], [0.0, 1.0, 1.0, 0.0])
    A = A + eco * 0.06 * (h * 2 - 1)
    # fades out towards the Wallachian plain in the west and the Caucasus in the south
    fade = smoothstep(25.0, 27.5, lon) * smoothstep(43.2, 44.2, lat)
    return 0.25 + (A - 0.25) * fade


def climate(lon, lat, elev):
    lon = np.asarray(lon, float)
    lat = np.asarray(lat, float)
    alat = np.abs(lat)
    T = 27 - 0.55 * np.maximum(0, alat - 18) - 0.0065 * np.maximum(elev, 0)
    cont = np.where((lat > 40) & (lon > 12), (lon - 12) * 0.09, 0)
    T = T - np.minimum(cont, 6)
    A = np.full(lon.shape, 0.25)
    # Mediterranean summer drought
    med = (lat > 30) & (lat < 43.5) & (lon > -10) & (lon < 42)
    A = np.where(med, 0.45, A)
    # Pontic–Caspian & Central Asian steppe. No box: aridity follows the distance to the northern edge of the
    # true steppe, which runs south-west to north-east (Budjak – lower Dnieper – Donets – middle Volga – southern Urals).
    # North of it lies a 2–3° wide forest-steppe ecotone (a mosaic of open land and groves), then mixed forest.
    A = np.maximum(A, steppe_aridity(lon, lat))
    A = np.where((lat > 35) & (lat <= 44.5) & (lon > 50) & (lon < 70), 0.82, A)
    A = np.where((lat > 46) & (lat < 49) & (lon > 19) & (lon < 22), 0.48, A)  # Hungarian puszta
    # Anatolian & Iranian plateaus
    A = np.where((lat > 37) & (lat < 40.5) & (lon > 30) & (lon < 41), 0.55, A)
    A = np.where((lat > 25) & (lat < 37) & (lon > 49) & (lon < 70), 0.78, A)
    # Sahara, Arabia, Syrian desert
    sah = (lat > 15.5) & (lat < 30.5) & (lon > -17) & (lon < 34)
    A = np.where(sah, 0.95, A)
    A = np.where((lat > 30.5) & (lat < 33) & (lon > -2) & (lon < 32), 0.75, A)
    A = np.where((lat > 12.5) & (lat < 31) & (lon > 34.5) & (lon < 60), 0.9, A)
    A = np.where((lat > 31) & (lat < 36) & (lon > 37.5) & (lon < 46), 0.8, A)
    # Maghreb coast & Levant coast wetter
    A = np.where((lat > 33) & (lat < 37.5) & (lon > -9) & (lon < 11), 0.5, A)
    A = np.where((lat > 31) & (lat < 37) & (lon > 34) & (lon < 36.5), 0.5, A)
    # Yemen & Ethiopia highlands
    A = np.where((lat > 12.5) & (lat < 17) & (lon > 43) & (lon < 46), 0.5, A)
    # Sahel & savanna
    A = np.where((lat > 11) & (lat <= 15.5) & (lon > -17) & (lon < 40), 0.6, A)
    A = np.where((lat > 4) & (lat <= 11) & (lon > -17) & (lon < 40), 0.35, A)
    A = np.where((lat > -12) & (lat <= 4) & (lon > 8) & (lon < 30), 0.12, A)
    A = np.where((lat > -35) & (lat <= -12) & (lon > 12) & (lon < 40), 0.5, A)
    A = np.where((lat > -30) & (lat <= -17) & (lon > 11) & (lon < 22), 0.88, A)  # Namib/Kalahari
    # Americas
    A = np.where((lat > -15) & (lat < 6) & (lon > -80) & (lon < -44), 0.1, A)
    A = np.where((lat > 6) & (lat < 22) & (lon > -92) & (lon < -60), 0.25, A)
    A = np.where((lat > 20) & (lat < 33) & (lon > -100) & (lon < -98), 0.6, A)
    A = np.where((lat > 22) & (lat < 32) & (lon > -100) & (lon < -103), 0.75, A)
    A = np.where((lat > -12) & (lat < -3) & (lon > -42) & (lon < -35), 0.55, A)
    A = np.where((lat > -38) & (lat < -15) & (lon > -72) & (lon < -66), 0.8, A)
    A = np.where((lat > -38) & (lat < -30) & (lon > -66) & (lon < -57), 0.4, A)
    # Nile valley is irrigated: handled by demography density; keep arid but not wasteland
    return T, A
