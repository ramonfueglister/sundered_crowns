# Settlement design

Same working rules as the economy (docs/ECONOMY_DESIGN.md): one feature at a time, every number with its source,
nothing built before Ramon agrees. Proposal with sources (German): https://claude.ai/artifact/XCrmNTWzWDu7oGXBDHnNQn

## Goal (Ramon, 14 and 16 November 2026)

Villages and towns grow by real models. The realms of players grow as the player builds; the places of the AI grow by
themselves. Real landmarks stand at their real spot. Bridges and town walls belong to it. Only what the simulation
computes is in the world: what a town shows must be state of the ECS.

## Features

| # | Feature | Status |
|---|---|---|
| 1 | Every family of a town has a parcel (the land register) | agreed by Ramon 16 Nov 2026 as a draft; built in state 17, not merged; the world graphic does not draw from it yet |
| – | Parcels of the farmers' hamlets; where a new house arises and streets grow; walls and gates; bridges; landmarks on their ground; building by players | not proposed yet |

## Feature 1: every family of a town has a parcel

Code: `src/sim/settlement/rule.ts` (the arithmetic), `src/sim/systems/lots.ts` (the register), state in
`src/sim/state.ts` (`lot`, `family.lot`), `src/net/lots.ts` (what the world server tells), measured towns in
`src/sim/content/settled_area_1300.json` (written by `tools/history/1291/settled_area.py`). Tests:
`tests/settlement.test.ts`.

Written once when a world is founded (or by the upgrade 16 → 17 of an older one). Nothing changes while the world
runs yet: nobody is born, dies, marries or moves, so no parcel is laid out, split or left. No row is ever freed.

| Table | Column | Type | Meaning |
|---|---|---|---|
| lot | kind | u8 | what the ground is: 0 a parcel (walls, gates, bridges, streets, squares, landmarks later) |
| lot | place | i16 | place of the map |
| lot | site | i16 | the town: index into data/content/gazetteer.json (a place may hold several towns) |
| lot | x, z | f32 | middle of the ground: metres east and south of the town's centre, at the scale of the houses |
| lot | w, d | f32 | metres along the street, metres deep |
| lot | front | u8 | side of the street: 0 north, 1 east, 2 south, 3 west |
| family | lot | i32 | the parcel the family lives on, −1 without one (rulers) |

`GET /lots/<site>` and `GET /lots?sites=a,b,…` (at most 200) give the ground of towns as columns: id, kind, x, z, w,
d, front, family (−1 vacant), persons.

### Steps

1. **Who lives in the town.** The families of the town and their persons (`townFamilies`). Today these are all
   persons founded for the town; once families live in hamlets, only those in the town count.
2. **Ground.** Settled area of the real town, A = a·N^β hectares with N = persons × 100. A town the data measured
   takes its measured hectares, carried along the exponent from the data's inhabitants to N (it keeps how far it lies
   off the line). The world's town takes a hundredth of it at the scale of the houses: ground = A × 100 m².
3. **Parcels.** 76 % of the ground is parcels, shared equally among the families; a parcel is three times as deep as
   wide: w = √(0.76 · ground / families / 3), d = 3w.
4. **Where.** A grid of square blocks, each two rows of six parcels back to back, fronting the streets north and
   south of the block; streets as wide as leaves the parcels 76 % (0.147 of a block's side). The town fills from the
   centre outwards as a square; the family with the lowest id gets the innermost parcel.

### Parameters

| Parameter | Value | Source |
|---|---|---|
| a, β | 0.1194 ha, 0.714 | own least squares of ln A on ln N over the 173 towns of Cesaretti et al. (2016), dataset S1 (SE of β 0.026, R² 0.81, residual sd 0.31 in ln); the paper's Table 1 and Lobo et al. (2020), Table 2, give the same exponent |
| measured towns | 156 of 558 | the same dataset, matched by name within 30 km (17 of the 173 are no town of the world; Bruges carries the coordinates of Bruges in the Gironde in the dataset and is matched by name) |
| share of parcels | 0.76 | Grenade-sur-Garonne, founded 1290: 3,000 lots = 75.76 ha on about 100 ha with streets, square and church (Boerefijn 2000, Urban Morphology 4(2), note 37 p. 60) |
| depth : width | 3 | Grenade: lots of 5 × 15 brasses = 9.175 × 27.525 m (Boerefijn 2000). Freiburg im Breisgau: Hofstätte 50 × 100 feet, 1 : 2 (Löbbecke, Schau-ins-Land 126, pp. 7–18) |
| parcels in a row | 6 | Grenade: blocks of 55.05 m = six lots of 9.175 m; PLACEHOLDER grid |
| narrowest front | 4.1 m | three quarters of the Edinburgh unit of 5.5 m (Stell & Tait 2016, Urban History 43(1); the product is our arithmetic). Not enforced: the narrowest of 1291 is 5.4 m |

### What the world of 1291 gets (seed 1291)

26,815 parcels for 26,815 families in 558 towns; the 314 ruler families have none. Families per town 8 / 29 / 983
(smallest, median, largest). Fronts 5.4 / 8.9 / 13.2 m. Town ground per family 116 / 310 / 683 m² (Grenade planned
333 m² of town per lot: an independent check of the law's level, not of the share, which is Grenade's own).

| Town | People of the time | Families | Parcel | Ground | Width at 125 m per house block |
|---|---|---|---|---|---|
| Limoges (smallest, measured) | 4,000 | 13 | 12.1 × 36.3 m | 7,500 m² | 6.0 km |
| Bayonne (median, by the law) | 11,000 | 32 | 8.5 × 25.6 m | 9,183 m² | 7.3 km |
| Zürich (measured) | 11,550 | 27 | 8.7 × 26.1 m | 8,073 m² | 7.5 km |
| Venice (measured) | 106,400 | 267 | 5.5 × 16.4 m | 31,639 m² | 11.5 km |
| Paris (measured) | 214,667 | 570 | 6.1 × 18.4 m | 84,156 m² | 18.1 km |
| Cairo (by the law) | 382,000 | 983 | 5.5 × 16.4 m | 115,661 m² | 22.1 km |

Width = the larger side of the box around the parcels, in house blocks of 2 m, each shown as 125 m of land (the half
house size of the landscape work, not merged). Median over all towns 7.7 km (3.4 to 22.1). The outer ring of blocks
is only partly filled, so a small town is wider than the square root of its ground (median 6.0 km). Two pairs of
towns would touch: Cairo and Fustat, Rabat and Salé.

### Own rules and gaps (no source)

- The measured towns keep their distance from the line when the world counts them differently (ratio 0.4 to 3.3).
- All families of a town get equal parcels; who lives in the centre is the order of the ids.
- One family a parcel. No source read on families per house; the narrowest attested front is not reached.
- The law is fitted to western European towns of 1,000 to 200,000; Cairo (382,000) and towns outside western Europe
  are extrapolated.
- The grid is a placeholder: no square, no church, no bent streets, no wall. The ground (water, rock, slope) is not
  known to the simulation: `foundLots` and `layParcels` take a `free` test for it, which nothing passes yet. The
  landscape thread writes the building-ground layer (`public/data/ground_<year>.json`) after its half-size change.
- The town stands still until persons are born, die and move.
- The world graphic still builds its towns from `public/data/towns_1291.json` (src/worldprobe/settle.ts); it will
  set one house on each parcel from `/lots`.

### Sources

- Cesaretti, Lobo, Bettencourt, Ortman & Smith (2016): Population-Area Relationship for Medieval European Cities.
  PLOS ONE 11(10): e0162678. https://doi.org/10.1371/journal.pone.0162678 (dataset S1, CC BY 4.0, in
  data/history/1291/settlement/)
- Lobo et al. (2020), Table 2: the same 173 towns, exponent 0.71, SE 0.03, R² 0.81.
  https://www.colorado.edu/socialreactors/sites/default/files/attached-files/lobo_et_al._2019_published_urban_studies.pdf
- Boerefijn (2000), Urban Morphology 4(2), pp. 53–54 and note 37 p. 60 (Grenade-sur-Garonne, 1290).
  https://journal.urbanform.org/index.php/jum/article/download/3871/3200/13152
- Löbbecke, Schau-ins-Land 126, pp. 7–18 (the Hofstätte of Freiburg im Breisgau).
  https://regionalia.blb-karlsruhe.de/files/17820/BLB_Loebbecke_Parzellenstruktur_Freiburg.pdf
- Stell & Tait (2016): Framework and form: burgage plots, street lines and domestic architecture in early urban
  Scotland. Urban History 43(1), pp. 5 and 23
