"""Makes the climate layer of the world probe: what kind of land a place is, for the colour of its ground and its trees.

One byte per two by two map pixels (the grid of public/map/biome.png): the low bits are the kind of land (LAND below),
taken from the Köppen-Geiger climate zones; bit 7 is set where the game's own forest layer of 1356 knows the place,
which is the part of the map that has locations. Elsewhere the probe plants the woods the climate grows.

Input: the Köppen-Geiger map of Rubel et al. (2017, doi:10.1127/metz/2016/0816) at 100 arc seconds, as packaged by
kgcpy (github.com/cwru-sdle/kgcpy, BSD-3). It shows the climate of 1986-2010; that of 1356 is not mapped anywhere at
this detail, and the zones lay much the same.
Output: public/map/climate.bin.gz

Usage: python3 tools/worldprobe/build_climate.py
"""
import gzip, io, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'geo'))
from common import H, ROOT, W, px_to_lonlat_np
from build_region import cached

Image.MAX_IMAGE_PIXELS = None
SOURCE = 'https://raw.githubusercontent.com/cwru-sdle/kgcpy/4bce28ba7596f870e50838a16e3799a9067eb742/kgcpy/kmz_int_reshape.png'
# the zones in the order of the source's numbers 1 … 32
ZONES = 'Af Am As Aw BSh BSk BWh BWk Cfa Cfb Cfc Csa Csb Csc Cwa Cwb Cwc Dfa Dfb Dfc Dfd Dsa Dsb Dsc Dsd Dwa Dwb Dwc Dwd EF ET Ocean'.split()
# kinds of land, as src/worldprobe/climate.ts names them
LAND = {'temperate': 1, 'mediterranean': 2, 'steppe': 3, 'desert': 4, 'savanna': 5, 'rainforest': 6, 'boreal': 7, 'tundra': 8, 'ice': 9}


def kind(zone):
    if zone == 'Ocean': return 0
    if zone in ('Af', 'Am'): return LAND['rainforest']
    if zone[0] == 'A': return LAND['savanna']
    if zone[:2] == 'BS': return LAND['steppe']
    if zone[:2] == 'BW': return LAND['desert']
    if zone == 'EF': return LAND['ice']
    if zone == 'ET': return LAND['tundra']
    if zone[:2] == 'Cs': return LAND['mediterranean']
    # the cold-summer zones of the continents are the conifer belt
    if zone[0] == 'D' and zone[2] in 'cd': return LAND['boreal']
    return LAND['temperate']


def main():
    zones = np.asarray(Image.open(io.BytesIO(cached(SOURCE, 'koeppen_rubel2017.png'))))
    kinds = np.array([0] + [kind(z) for z in ZONES], np.uint8)[zones]
    # where the source has sea, the nearest land speaks: its coast is not the map's
    near = ndimage.distance_transform_edt(kinds == 0, return_distances=False, return_indices=True)
    kinds = kinds[near[0], near[1]]
    lon, lat = px_to_lonlat_np(np.arange(W // 2) * 2 + 1.0, np.arange(H // 2) * 2 + 1.0)
    x = np.clip(((lon + 180) / 360 * zones.shape[1]).astype(int), 0, zones.shape[1] - 1)
    y = np.clip(((90 - lat) / 180 * zones.shape[0]).astype(int), 0, zones.shape[0] - 1)
    out = kinds[np.ix_(y, x)]
    known = np.asarray(Image.open(os.path.join(ROOT, 'public', 'map', 'biome.png')).convert('RGBA'))[..., 0] != 0
    out = out | (known.astype(np.uint8) << 7)
    path = os.path.join(ROOT, 'public', 'map', 'climate.bin.gz')
    with gzip.open(path, 'wb', compresslevel=9) as f: f.write(out.tobytes())
    names = {v: k for k, v in LAND.items()}
    print(f'climate: {out.shape[1]} x {out.shape[0]}, {os.path.getsize(path) / 1e3:.0f} kB, ' + ', '.join(f'{names[k]} {np.mean((out & 127) == k):.0%}' for k in sorted(names)))
    Image.fromarray((out & 127) * 25).save(os.path.join(os.environ.get('GEO_CACHE', '/tmp'), 'climate_check.png'))


if __name__ == '__main__':
    main()
