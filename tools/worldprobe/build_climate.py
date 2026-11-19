"""Makes the climate layer of the world probe: what kind of land a place is, for the colour of its ground and its trees.

One byte per two by two map pixels (the grid of public/map/biome.png), once round the globe and as far south as the
world goes (build_region.py): the low bits are the kind of land (LAND below), taken from the Köppen-Geiger climate
zones; bit 7 is set where the game's own forest layer of 1356 knows the place, bit 6 where its fields are known (the
old world of the game map). The forest layer does not reach beyond the game map, and
on it where the game has sea, jungle, tundra or wasteland: for those it sets no forest at all. Nor does it in the
Americas, of which the game map has only the eastern half and that as one forest, prairie and all: the land would
change at the map's edge, in the middle of the continent. There the probe plants the woods the climate grows.

The climate zones do not tell the prairie from the forest beside it: both have the same climate, and what keeps the
trees off the grass is fire, grazing and soil. So where the land is grassland by nature (the biomes of the
ecoregions), a wooded climate becomes the kind 'grassland', or 'savanna' in the tropics.

Input: the Köppen-Geiger map of Rubel et al. (2017, doi:10.1127/metz/2016/0816) at 100 arc seconds, as packaged by
kgcpy (github.com/cwru-sdle/kgcpy, BSD-3). It shows the climate of 1986-2010; that of 1356 is not mapped anywhere at
this detail, and the zones lay much the same. The biomes of the RESOLVE Ecoregions 2017 (Dinerstein et al. 2017,
doi:10.1093/biosci/bix014, CC BY 4.0), rastered once into the cache folder (needs rasterio and fiona).
Output: public/map/climate.bin.gz

Usage: python3 tools/worldprobe/build_climate.py
"""

import gzip
import io
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'geo'))
from build_region import CACHE, WORLD_H, WORLD_W, cached, world_lonlat
from build_setup import TERRAINS
from common import ROOT, H, W

Image.MAX_IMAGE_PIXELS = None
SOURCE = 'https://raw.githubusercontent.com/cwru-sdle/kgcpy/4bce28ba7596f870e50838a16e3799a9067eb742/kgcpy/kmz_int_reshape.png'
# the zones in the order of the source's numbers 1 … 32
ZONES = [
    'Af',
    'Am',
    'As',
    'Aw',
    'BSh',
    'BSk',
    'BWh',
    'BWk',
    'Cfa',
    'Cfb',
    'Cfc',
    'Csa',
    'Csb',
    'Csc',
    'Cwa',
    'Cwb',
    'Cwc',
    'Dfa',
    'Dfb',
    'Dfc',
    'Dfd',
    'Dsa',
    'Dsb',
    'Dsc',
    'Dsd',
    'Dwa',
    'Dwb',
    'Dwc',
    'Dwd',
    'EF',
    'ET',
    'Ocean',
]
# kinds of land, as src/worldprobe/climate.ts names them
# west of this longitude, in the middle of the Atlantic, lie the Americas
OLD_WORLD_FROM = -30
LAND = {
    'temperate': 1,
    'mediterranean': 2,
    'steppe': 3,
    'desert': 4,
    'savanna': 5,
    'rainforest': 6,
    'boreal': 7,
    'tundra': 8,
    'ice': 9,
    'grassland': 10,
}
BIOMES = 'https://storage.googleapis.com/teow2016/Ecoregions2017.zip'
# the biomes are rastered at this many degrees a cell
BIOME_CELL = 0.05
# the numbers of the biomes that are grassland by nature: temperate and montane; tropical and flooded
GRASS, SAVANNA = (8, 10), (7, 9)


def kind(zone):
    if zone == 'Ocean':
        return 0
    if zone in ('Af', 'Am'):
        return LAND['rainforest']
    if zone[0] == 'A':
        return LAND['savanna']
    if zone[:2] == 'BS':
        return LAND['steppe']
    if zone[:2] == 'BW':
        return LAND['desert']
    if zone == 'EF':
        return LAND['ice']
    if zone == 'ET':
        return LAND['tundra']
    if zone[:2] == 'Cs':
        return LAND['mediterranean']
    # the cold-summer zones of the continents are the conifer belt
    if zone[0] == 'D' and zone[2] in 'cd':
        return LAND['boreal']
    return LAND['temperate']


def biomes():
    """The number of the biome every place has by nature, from 180° west and 90° north in cells of BIOME_CELL degrees (0: none)."""
    kept = os.path.join(CACHE, 'biomes_resolve2017.png')
    if not os.path.exists(kept):
        import fiona
        from rasterio import features, transform

        cached(BIOMES, 'Ecoregions2017.zip')
        with fiona.open('zip://' + os.path.join(CACHE, 'Ecoregions2017.zip')) as source:
            shapes = [(f['geometry'], int(f['properties']['BIOME_NUM'])) for f in source]
        grid = features.rasterize(
            shapes,
            out_shape=(round(180 / BIOME_CELL), round(360 / BIOME_CELL)),
            transform=transform.from_origin(-180, 90, BIOME_CELL, BIOME_CELL),
            dtype='uint8',
        )
        Image.fromarray(grid).save(kept)
    return np.asarray(Image.open(kept))


def main():
    zones = np.asarray(Image.open(io.BytesIO(cached(SOURCE, 'koeppen_rubel2017.png'))))
    kinds = np.array([0] + [kind(z) for z in ZONES], np.uint8)[zones]
    # where the source has sea, the nearest land speaks: its coast is not the map's
    near = ndimage.distance_transform_edt(kinds == 0, return_distances=False, return_indices=True)
    kinds = kinds[near[0], near[1]]
    lon, lat = world_lonlat(np.arange(WORLD_W // 2) * 2 + 1.0, np.arange(WORLD_H // 2) * 2 + 1.0)
    x = ((lon + 180) / 360 * zones.shape[1]).astype(int) % zones.shape[1]
    y = np.clip(((90 - lat) / 180 * zones.shape[0]).astype(int), 0, zones.shape[0] - 1)
    out = kinds[np.ix_(y, x)]
    # grassland by nature under a climate that would grow woods
    nature = biomes()
    nature = nature[
        np.ix_(
            np.clip(((90 - lat) / BIOME_CELL).astype(int), 0, nature.shape[0] - 1),
            ((lon + 180) / BIOME_CELL).astype(int) % nature.shape[1],
        )
    ]
    out[np.isin(nature, GRASS) & np.isin(out, [LAND[k] for k in ('temperate', 'mediterranean', 'boreal')])] = LAND[
        'grassland'
    ]
    out[np.isin(nature, SAVANNA) & np.isin(out, [LAND[k] for k in ('temperate', 'mediterranean', 'rainforest')])] = (
        LAND['savanna']
    )
    # the game's terrain class of each place (0 sea, else 1 + its place in TERRAINS)
    terrain = np.asarray(Image.open(os.path.join(ROOT, 'public', 'map', 'biome.png')).convert('RGBA'))[..., 0]
    old_world = lon[None, : W // 2] > OLD_WORLD_FROM
    known = ~np.isin(terrain, [0] + [TERRAINS.index(t) + 1 for t in ('jungle', 'tundra', 'wasteland')]) & old_world
    out[: H // 2, : W // 2] |= known.astype(np.uint8) << 7
    # the fields of 1356 are known all over the old world of the game map
    out[: H // 2, : W // 2] |= np.broadcast_to(old_world, (H // 2, W // 2)).astype(np.uint8) << 6
    path = os.path.join(ROOT, 'public', 'map', 'climate.bin.gz')
    with open(path, 'wb') as f:
        f.write(gzip.compress(out.tobytes(), 9, mtime=0))
    names = {v: k for k, v in LAND.items()}
    print(
        f'climate: {out.shape[1]} x {out.shape[0]}, {os.path.getsize(path) / 1e3:.0f} kB, '
        + ', '.join(f'{names[k]} {np.mean((out & 63) == k):.0%}' for k in sorted(names))
    )
    Image.fromarray((out & 63) * 25).save(os.path.join(os.environ.get('GEO_CACHE', '/tmp'), 'climate_check.png'))


if __name__ == '__main__':
    main()
