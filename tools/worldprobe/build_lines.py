"""Makes the two lines of the heights for the world probe, everywhere on earth: the snow line, above which snow lies
all year, and the tree line, above which no tree grows.

Neither is a matter of latitude alone. In the Alps the snow line lies near 2900 m, on the wet south side of the
Himalaya near 5000 m, and on the dry plateau of Tibet behind it above 6000 m: where little snow falls, a cold summer
is needed to keep it. Ohmura, Kasser and Funk (1992, Journal of Glaciology 38, "Climate at the equilibrium line of
glaciers") measured this on 70 glaciers: at the height where a glacier neither grows nor shrinks, the precipitation of
the year P (mm) and the mean temperature of the three summer months in the free air T (°C) obey

    P = 645 + 296 T + 9 T²

So the snow line of a place is the height at which its summer is cold enough for its precipitation, and never lower
than the height at which the mean of the whole year is at freezing: where the summer is no season (the tropics) or
hardly warmer than the winter (the ocean's edge, Patagonia), the snow melts all year, and the glaciers end near that
level (Kaser and Osmaston 2002, Tropical Glaciers). The relation was measured up to 4000 mm a year; wetter places
count as that.

The tree line is a matter of the warmth of the growing season, the world over: Paulsen and Körner (2014, Alpine
Botany 124, "A climate-based model to predict potential treeline position around the globe") found trees to end
where the season of growth (the days with a mean above 0.9 °C) is shorter than 94 days or its mean temperature below
6.4 °C. So it lies at 2300 m in the Alps, but at 600 m in Scotland and at 300 m in Iceland, whose summers are long
and cool: the tree line of the ocean's edge lies far lower than its latitude says.

Temperature and precipitation are taken from the ERA5 reanalysis (Hersbach et al. 2020, doi:10.1002/qj.3803; contains
modified Copernicus Climate Change Service information), as its climatology of 1990-2019 on a grid of 0.7 degrees
packaged by WeatherBench 2 (Rasp et al. 2024, public bucket gs://weatherbench2): the temperature 2 m above ERA5's own
ground, day by day, carried to other heights with the lapse rate of the free air (6.5 K per km), and the
precipitation of the year. The summer is June to August north of the equator and December to February south of it.
The climate is that of today; the lines of 1356, at the start of the Little Ice Age, lay about as high (within some
100 m).

One byte per 16 by 16 map pixels of the world (once round the globe): the height in steps of STEP metres.
Output: public/map/snowline.bin.gz, public/map/treeline.bin.gz

Usage: python3 tools/worldprobe/build_lines.py     (needs numcodecs; fetches 1 GB into the cache folder once)
"""

import gzip
import os
import sys

import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'geo'))
from build_region import CACHE, WORLD_H, WORLD_W, cached, world_lonlat
from common import ROOT

BUCKET = 'https://storage.googleapis.com/weatherbench2/datasets/'
CLIMATE = BUCKET + 'era5-hourly-climatology/1990-2019_6h_512x256_equiangular_conservative.zarr/'
STATIC = BUCKET + 'era5/1959-2022-6h-512x256_equiangular_conservative.zarr/'
# the grid of the source, and its days of the year in chunks of 30
LONS, LATS, DAYS, CHUNK = 512, 256, 366, 30
# the summer of each half of the globe, as days of the year counted from 0: June to August, December to February
SUMMER_NORTH, SUMMER_SOUTH = range(152, 244), [*range(335, 366), *range(60)]
LAPSE = 0.0065
# the most precipitation of a year (mm) among the glaciers the relation was measured on
WETTEST = 4000
# map pixels a cell of the layer, and metres a step of its bytes
CELL, STEP = 16, 32
# the season of growth: the days with a mean above this (°C); trees need so many of them, and this mean over them
GROWS_FROM, SEASON_DAYS, SEASON_MEAN = 0.9, 94, 6.4
KEPT = os.path.join(CACHE, 'era5', 'days_and_rain.npz')


def chunk(url, name, shape):
    from numcodecs import Blosc

    return np.frombuffer(Blosc().decode(cached(url, os.path.join('era5', name))), '<f4').reshape(shape)


def climate():
    """Mean temperature (°C) of every day of the year, precipitation of the year (mm) and height of the ground (m), on the source's grid (longitude, latitude)."""
    if os.path.exists(KEPT):
        kept = np.load(KEPT)
        return [kept[k] for k in ('days', 'rain', 'ground', 'lon', 'lat')]

    # a chunk holds CHUNK days, the last one filled up beyond the end of the year
    def year(field, k):
        return chunk(
            f'{CLIMATE}{field}/0.{k}.0.0', f'{"t2m" if field[0] == "2" else "tp"}_{k}', (4, CHUNK, LONS, LATS)
        )[:, : min(CHUNK, DAYS - k * CHUNK)]

    chunks = range((DAYS + CHUNK - 1) // CHUNK)
    days = np.concatenate([year('2m_temperature', k).mean(0) for k in chunks]).astype(np.float32) - 273.15
    # each of the four hours of a day carries the precipitation of the 24 hours before it, in metres
    rain = (
        sum(year('total_precipitation_24hr', k).mean(0).sum(0, dtype=np.float64) for k in chunks) * 1000 * 365.25 / DAYS
    )
    ground = chunk(f'{STATIC}geopotential_at_surface/0.0', 'zs', (LONS, LATS)) / 9.80665
    lon, lat = (
        np.frombuffer(
            __import__('numcodecs').Blosc().decode(cached(f'{CLIMATE}{axis}/0', os.path.join('era5', axis))), '<f8'
        )
        for axis in ('longitude', 'latitude')
    )
    np.savez_compressed(KEPT, days=days, rain=rain, ground=ground, lon=lon, lat=lat)
    return days, rain, ground, lon, lat


def snow_line(summer, year, rain, ground):
    """Height (m) at which the summer is as cold as the snow of the year needs (Ohmura et al. 1992), and the year's mean at freezing at the lowest."""
    needed = (-296 + np.sqrt(296**2 - 36 * (645 - np.minimum(rain, WETTEST)))) / 18
    return ground + np.maximum(summer - needed, year) / LAPSE


def tree_line(days, ground):
    """Height (m) up to which the season of growth is long and warm enough for trees (Paulsen and Körner 2014)."""

    def grows(up):
        t = days - LAPSE * up
        season = t > GROWS_FROM
        n = season.sum(0)
        return (n >= SEASON_DAYS) & ((t * season).sum(0) >= SEASON_MEAN * n)

    # between far below the ground and far above it, halved until the line is known to a metre
    low, high = np.full(ground.shape, -9000.0), np.full(ground.shape, 9000.0)
    for _ in range(15):
        mid = (low + high) / 2
        ok = grows(mid)
        low, high = np.where(ok, mid, low), np.where(ok, high, mid)
    return ground + low


def main():
    days, rain, ground, lon, lat = climate()
    north, south = days[list(SUMMER_NORTH)].mean(0, dtype=np.float64), days[SUMMER_SOUTH].mean(0, dtype=np.float64)
    lines = {
        'snowline': snow_line(np.where(lat[None, :] >= 0, north, south), days.mean(0, dtype=np.float64), rain, ground),
        'treeline': tree_line(days, ground),
    }
    # onto the cells of the layer, between the points of the source
    wlon, wlat = world_lonlat(
        np.arange(WORLD_W // CELL) * CELL + CELL / 2, np.arange(WORLD_H // CELL) * CELL + CELL / 2
    )
    fx = ((wlon % 360) - lon[0]) / (lon[1] - lon[0])
    fy = (wlat - lat[0]) / (lat[1] - lat[0])
    out = {}
    for name, line in lines.items():
        out[name] = ndimage.map_coordinates(
            np.pad(line, ((0, 1), (0, 0)), mode='wrap'),
            np.meshgrid(fx % LONS, np.clip(fy, 0, LATS - 1), indexing='ij'),
            order=1,
            mode='nearest',
        ).T
        cells = np.clip(np.round(out[name] / STEP), 0, 255).astype(np.uint8)
        path = os.path.join(ROOT, 'public', 'map', f'{name}.bin.gz')
        with open(path, 'wb') as f:
            f.write(gzip.compress(cells.tobytes(), 9, mtime=0))
        print(f'{name}: {cells.shape[1]} x {cells.shape[0]}, {os.path.getsize(path) / 1e3:.0f} kB')

    def at(name, lo, la):
        return int(out[name][np.abs(wlat - la).argmin(), np.abs((wlon - lo + 180) % 360 - 180).argmin()])

    for place, lo, la in (
        ('Alps', 9.5, 46.5),
        ('Pyrenees', 0.5, 42.6),
        ('Caucasus', 43, 43),
        ('Tatra', 20.1, 49.2),
        ('Norway', 7, 61.5),
        ('Jotunheimen', 8.3, 61.6),
        ('Scotland', -4, 57.1),
        ('Iceland', -19, 64.2),
        ('Tibet', 86, 33),
        ('Everest', 87, 28),
        ('Karakoram', 76, 36),
        ('Pamir', 73, 38.5),
        ('Tian Shan', 80, 42),
        ('Kilimanjaro', 37.3, -3),
        ('Atacama Andes', -68, -24),
        ('Patagonia', -73.5, -49),
        ('Alaska Range', -151, 63),
        ('Colorado', -106, 39.5),
        ('Atlas', -7.9, 31),
    ):
        print(f'  {place}: snow {at("snowline", lo, la)} m, trees {at("treeline", lo, la)} m')


if __name__ == '__main__':
    main()
