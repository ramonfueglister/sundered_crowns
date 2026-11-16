# Forest of 1291

Layer for the world probe: `public/map/forest1291.bin.gz` (share of each place's land under trees around 1291) and
`public/map/conifer1291.bin.gz` (share of those trees that are evergreen), built by
`tools/worldprobe/build_forest1291.py`. Format and method: see that file's docstring.

## Measured, modelled, written down, assumed

| What | Source | Kind |
|---|---|---|
| Share of trees per 1° cell, AD 1250-1600 (`reveals_1250_1600.csv`) | Githumbi et al. 2022, Front. Ecol. Evol. 10:795794 (REVEALS on 1,128 pollen records, spatial model by Pirzamanbein et al.) | measured (pollen), interpolated between records |
| Where inside a cell the land was cleared; outside Europe how much | KK10, Kaplan et al. 2011, The Holocene 21:775 (data doi:10.1594/PANGAEA.871369), mean 1281-1301 | modelled (population x land quality) |
| England 8.8 % | 15 % in 1086 (Domesday; Rackham), about 7 % by 1349 (RFS / Forestry Commission England 2015) | written down; the straight line between the two dates is an assumption |
| Potential forest by kind of land (`POTENTIAL`) | none: temperate, boreal, wet tropics 1.0; Mediterranean 0.8; savanna 0.3; grassland 0.15; steppe 0.1; desert, tundra, ice 0 | assumed |

## Known gaps

- The pollen window spans 350 years, including the time after the Black Death (more woods again); 1291 lies early in it.
- The pollen maps are interpolated where records are few (steppe, south-east Europe, the Near East); there the
  potential holds the trees down (224 of 1,858 cells sit below the pollen for that reason).
- Ireland: the pollen overstates its trees for 1600-1850 (Kaplan et al. 2017, Land 6:91); for about 1300 no count is
  known, and KK10 alone would give more trees (51 %) than the pollen (35 %). Left at the pollen.
- KK10 is 5 arc-minutes (about 9 km); the fine pattern below that (valleys and plains cleared first) is the world
  probe's.
- The climate kinds are today's.
- After smoothing between the 1° cells, cells keep the pollen to 1.8 % on average (95 % within 7.9 %).

KK10 is not in the repo (cut from a 17 GB file on Ramon's Mac by range requests): put
`kk10_1281_1301_mean.npy`, `lat.npy`, `lon.npy` in `$GEO_CACHE/kk10/`, and Natural Earth's
`ne_10m_admin_0_map_units.geojson` in `$GEO_CACHE/ne/`.
