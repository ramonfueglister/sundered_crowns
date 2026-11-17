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
| 1 | Every family who lives in a town has a parcel (the land register) | agreed by Ramon 16 Nov 2026 as a draft; built in state 20, not merged. The world graphic on main sets a house on each parcel as soon as `public/data/lots_1291.json` is on main |
| – | Parcels of the farmers' hamlets; where a new house arises and streets grow; walls and gates; bridges; landmarks on their ground; building by players | not proposed yet |

## Feature 1: every family of a town has a parcel

Code: `src/sim/settlement/rule.ts` (the arithmetic), `src/sim/systems/lots.ts` (the register), state in
`src/sim/state.ts` (`lot`, `family.lot`), `src/net/lots.ts` (what the world server tells), measured towns in
`src/sim/content/settled_area_1300.json` (written by `tools/history/1291/settled_area.py`). Tests:
`tests/settlement.test.ts`.

Written once when a world is founded (or by the upgrade 19 → 20 of an older one). Nothing changes while the world
runs yet: nobody is born, dies, marries or moves, so no parcel is laid out, split or left. No row is ever freed.

| Table | Column | Type | Meaning |
|---|---|---|---|
| lot | kind | u8 | what the ground is: 0 a parcel (walls, gates, bridges, streets, squares, landmarks later) |
| lot | place | i16 | place of the map |
| lot | site | i16 | the town: index into data/content/gazetteer.json (a place may hold several towns) |
| lot | x, z | f32 | middle of the ground: metres east and south of the town's centre, at the scale of the houses |
| lot | w, d | f32 | metres along the street, metres deep |
| lot | front | u8 | side of the street: 0 north, 1 east, 2 south, 3 west |
| family | lot | i32 | the parcel the family lives on, −1 without one (rulers, and the families of the hamlets: `family.hamlet` 1) |

`GET /lots/<site>` and `GET /lots?sites=a,b,…` (at most 200) give the ground of towns as columns: id, kind, x, z, w,
d, front, family (−1 vacant), persons.

`public/data/lots_1291.json` (`npm run lots:write 1291`, `tools/sim/write_lots.ts`) is the register of a new world
with the seed of the running one (1291), for the world graphic: its probe page has no world server. A copy of the
state, true while the register does not change; a test fails when it is not what a new world has. Once parcels
change while the world runs, the graphic has to read `/lots` instead.

### Steps

1. **Who lives in the town.** The families who live in the town and their persons (`townFamilies`): those founded
   for the town who do not live from agriculture. The families who do live in hamlets outside the walls
   (`family.hamlet`, src/sim/systems/hamlets.ts) and have no parcel yet.
2. **Ground.** Settled area of the real town, A = a·N^β hectares with N = persons × 100. A town the data measured
   takes its measured hectares, carried along the exponent from the data's inhabitants to N (it keeps how far it lies
   off the line). The world's town takes a hundredth of it at the scale of the houses: ground = A × 100 m².
3. **Parcels.** 76 % of the ground is parcels, shared equally among the families; a parcel is three times as deep as
   wide: w = √(0.76 · ground / families / 3), d = 3w.
4. **Where.** A grid of square blocks, each two rows of six parcels back to back, fronting the streets north and
   south of the block; streets as wide as leaves the parcels 76 % (0.147 of a block's side). The town fills from the
   centre outwards as a square; the family with the lowest id gets the innermost parcel.
5. **Building ground.** A parcel lies only where its house can stand (`houseGround`): every block of the strip at its
   street, as wide as the parcel and five blocks deep (the deepest house the world graphic builds), is building
   ground of the town (`public/data/ground_<year>.json`, written by `tools/worldprobe/build_ground.ts` from the
   ground of the world graphic: no water, no rock, no step higher than a block, not under the church, the great
   buildings, the towers or a monument; `src/sim/content/ground.ts`, `World.ground`). Parcels that cannot stand are
   left out of the grid, and the town reaches farther. A town without a survey, or one whose surveyed ground does
   not hold all its families, is laid out without regard to the ground (none in 1291).

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

8,150 parcels for the 8,150 families who live in the 558 towns (26,124 persons); the 18,665 families of the hamlets
and the 314 ruler families have none. Families per town 1 / 9 / 280 (smallest, median, largest). Fronts 5.9 / 9.6 /
17.3 m. Town ground per family 139 / 365 / 1,181 m² (Grenade planned 333 m² of town per lot: an independent check of
the law's level, not of the share, which is Grenade's own).

| Town | People of the time | Families in the town | Parcel | Ground | Width at 125 m per house block |
|---|---|---|---|---|---|
| Limoges (smallest, measured) | 4,000 | 3 | 17.3 × 51.9 m | 3,544 m² | 6.5 km |
| Bayonne (median, by the law) | 11,000 | 12 | 9.6 × 28.9 m | 4,379 m² | 8.3 km |
| Zürich (measured) | 11,550 | 9 | 9.0 × 26.9 m | 2,851 m² | 5.5 km |
| Venice (measured) | 106,400 | 78 | 6.0 × 17.9 m | 10,989 m² | 15.4 km |
| Paris (measured) | 214,667 | 182 | 6.8 × 20.4 m | 33,173 m² | 14.2 km |
| Cairo (by the law) | 382,000 | 280 | 6.2 × 18.7 m | 42,979 m² | 16.1 km |

"People of the time" are all people of the real town; about a quarter of the world's persons of a town live inside
it, and the ground follows from them alone. Width = the larger side of the box around the parcels, in house blocks
of 2 m, each shown as 125 m of land (the half house size, live since PR #59). Median over all towns 4.7 km (2.0 to
16.1). A town is wider than the square root of its ground: the outer ring of blocks is only partly filled, and the
parcels that cannot stand (2,454 of the 8,150 of the bare grid, in 363 towns: water, rock, the church) lie farther
out instead; Venice is twice as wide as on open ground. Two pairs of towns would touch: Cairo and Fustat, Rabat and
Salé.

### Own rules and gaps (no source)

- The measured towns keep their distance from the line when the world counts them differently (ratio 0.4 to 3.3).
- All families of a town get equal parcels; who lives in the centre is the order of the ids.
- One family a parcel. No source read on families per house; the narrowest attested front is not reached.
- The law is fitted to the whole population of a town. The world applies it to the persons who live inside (the
  farmers of the town live in hamlets), so its towns stand for real towns of 300 to 94,700 people.
- The law is fitted to western European towns of 1,000 to 200,000; Cairo (382,000) and towns outside western Europe
  are extrapolated.
- The grid is a placeholder: no square, no bent streets, no wall; the church and the great buildings stand where the
  world graphic sets them, and the parcels keep off them.
- The building ground is a file of the world graphic's ground: when that ground changes (terrain, monuments), the
  file is written anew and a new world lays its parcels differently from a running one. The back of a parcel (its
  yard) may lie on ground no house could stand on.
- The town stands still until persons are born, die and move.
- The world graphic (src/worldprobe/lots.ts, settle.ts `onParcels`, on main since PR #59) sets one house on each
  parcel of `public/data/lots_<year>.json`, at the nearest zoom step only, and not yet from `/lots`; without the file
  it packs its towns as before. The far zoom steps (far.ts) do not know the parcels yet.

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
