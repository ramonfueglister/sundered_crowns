"""Makes the snow line layer of the world probe: the height above which snow lies all year, everywhere on earth.

The snow line is not a matter of latitude alone. In the Alps it lies near 2900 m, on the wet south side of the
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

Temperature and precipitation are taken from the ERA5 reanalysis (Hersbach et al. 2020, doi:10.1002/qj.3803; contains
modified Copernicus Climate Change Service information), as its climatology of 1990-2019 on a grid of 0.7 degrees
packaged by WeatherBench 2 (Rasp et al. 2024, public bucket gs://weatherbench2): the temperature 2 m above ERA5's own
ground, carried to other heights with the lapse rate of the free air (6.5 K per km), and the precipitation of the
year. The summer is June to August north of the equator and December to February south of it. The climate is that of
today; the snow line of 1356, at the start of the Little Ice Age, lay about as high (within some 100 m).

One byte per 16 by 16 map pixels of the world (once round the globe): the height in steps of STEP metres.
Output: public/map/snowline.bin.gz

Usage: python3 tools/worldprobe/build_snowline.py     (needs numcodecs; fetches 1 GB into the cache folder once)
"""
import gzip, os, sys
import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'geo'))
from common import ROOT
from build_region import CACHE, WORLD_H, WORLD_W, cached, world_lonlat

BUCKET = 'https://storage.googleapis.com/weatherbench2/datasets/'
CLIMATE = BUCKET + 'era5-hourly-climatology/1990-2019_6h_512x256_equiangular_conservative.zarr/'
STATIC = BUCKET + 'era5/1959-2022-6h-512x256_equiangular_conservative.zarr/'
# the grid of the source, and its days of the year in chunks of 30
LONS, LATS, DAYS, CHUNK = 512, 256, 366, 30
# the summer of each half of the globe, as days of the year counted from 0: June to August, December to February
SUMMER_NORTH, SUMMER_SOUTH = range(152, 244), [*range(335, 366), *range(0, 60)]
LAPSE = 0.0065
# the most precipitation of a year (mm) among the glaciers the relation was measured on
WETTEST = 4000
# map pixels a cell of the layer, and metres a step of its bytes
CELL, STEP = 16, 32
KEPT = os.path.join(CACHE, 'era5', 'summer_and_rain.npz')


def chunk(url, name, shape):
    from numcodecs import Blosc
    return np.frombuffer(Blosc().decode(cached(url, os.path.join('era5', name))), '<f4').reshape(shape)


def climate():
    """Mean temperature (°C) of each half of the globe's summer and of the year, precipitation of the year (mm) and height of the ground (m), on the source's grid (longitude, latitude)."""
    if os.path.exists(KEPT):
        kept = np.load(KEPT)
        return [kept[k] for k in ('north', 'south', 'year', 'rain', 'ground', 'lon', 'lat')]
    # a chunk holds CHUNK days, the last one filled up beyond the end of the year
    days = lambda k: min(CHUNK, DAYS - k * CHUNK)
    year = lambda field, k: chunk(f'{CLIMATE}{field}/0.{k}.0.0', f"{'t2m' if field[0] == '2' else 'tp'}_{k}", (4, CHUNK, LONS, LATS))[:, :days(k)]
    warm = {}
    for name, summer in (('north', SUMMER_NORTH), ('south', SUMMER_SOUTH), ('year', range(DAYS))):
        total = np.zeros((LONS, LATS)); n = 0
        for k in sorted({d // CHUNK for d in summer}):
            t = year('2m_temperature', k)
            mine = [d - k * CHUNK for d in summer if d // CHUNK == k]
            total += t[:, mine].mean(0).sum(0); n += len(mine)
        warm[name] = total / n - 273.15
    rain = np.zeros((LONS, LATS))
    for k in range((DAYS + CHUNK - 1) // CHUNK):
        # each of the four hours of a day carries the precipitation of the 24 hours before it, in metres
        rain += year('total_precipitation_24hr', k).mean(0).sum(0)
    rain *= 1000 * 365.25 / DAYS
    ground = chunk(f'{STATIC}geopotential_at_surface/0.0', 'zs', (LONS, LATS)) / 9.80665
    lon, lat = (np.frombuffer(__import__('numcodecs').Blosc().decode(cached(f'{CLIMATE}{axis}/0', os.path.join('era5', axis))), '<f8') for axis in ('longitude', 'latitude'))
    np.savez_compressed(KEPT, **warm, rain=rain, ground=ground, lon=lon, lat=lat)
    return warm['north'], warm['south'], warm['year'], rain, ground, lon, lat


def snow_line(summer, year, rain, ground):
    """Height (m) at which the summer is as cold as the snow of the year needs (Ohmura et al. 1992), and the year's mean at freezing at the lowest."""
    needed = (-296 + np.sqrt(296 ** 2 - 36 * (645 - np.minimum(rain, WETTEST)))) / 18
    return ground + np.maximum(summer - needed, year) / LAPSE


def main():
    north, south, year, rain, ground, lon, lat = climate()
    line = snow_line(np.where(lat[None, :] >= 0, north, south), year, rain, ground)
    # onto the cells of the layer, between the points of the source
    wlon, wlat = world_lonlat(np.arange(WORLD_W // CELL) * CELL + CELL / 2, np.arange(WORLD_H // CELL) * CELL + CELL / 2)
    fx = ((wlon % 360) - lon[0]) / (lon[1] - lon[0]); fy = (wlat - lat[0]) / (lat[1] - lat[0])
    out = ndimage.map_coordinates(np.pad(line, ((0, 1), (0, 0)), mode='wrap'), np.meshgrid(fx % LONS, np.clip(fy, 0, LATS - 1), indexing='ij'), order=1, mode='nearest').T
    cells = np.clip(np.round(out / STEP), 0, 255).astype(np.uint8)
    path = os.path.join(ROOT, 'public', 'map', 'snowline.bin.gz')
    with open(path, 'wb') as f: f.write(gzip.compress(cells.tobytes(), 9, mtime=0))
    print(f'snow line: {cells.shape[1]} x {cells.shape[0]}, {os.path.getsize(path) / 1e3:.0f} kB')
    at = lambda lo, la: int(out[np.abs(wlat - la).argmin(), np.abs((wlon - lo + 180) % 360 - 180).argmin()])
    for name, lo, la in (('Alps', 9.5, 46.5), ('Pyrenees', 0.5, 42.6), ('Caucasus', 43, 43), ('Norway', 7, 61.5), ('Tibet', 86, 33), ('Everest', 87, 28), ('Karakoram', 76, 36), ('Pamir', 73, 38.5),
                         ('Tian Shan', 80, 42), ('Kilimanjaro', 37.3, -3), ('Atacama Andes', -68, -24), ('Patagonia', -73.5, -49), ('Alaska Range', -151, 63), ('Colorado', -106, 39.5), ('Atlas', -7.9, 31)):
        print(f'  {name}: {at(lo, la)} m')


if __name__ == '__main__':
    main()
