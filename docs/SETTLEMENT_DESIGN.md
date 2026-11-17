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
| 2 | Every farming family has a farmstead in a hamlet (hamlets and farmsteads in the land register) | agreed by Ramon 17 Nov 2026 as a draft with the small farmstead ("Ja, mit kleinem Hof"); built in the same state step, not merged. The world graphic still sets its own hamlets on a spiral until it reads them from the file |
| – | Where a new house arises and streets grow; walls and gates; bridges; landmarks on their ground; which field belongs to which farm; building by players | not proposed yet |

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
| family | lot | i32 | the parcel or the farmstead (feature 2) the family lives on, −1 without one (rulers) |

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
have farmsteads (feature 2) and the 314 ruler families have no ground. Families per town 1 / 9 / 280 (smallest, median, largest). Fronts 5.9 / 9.6 /
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

## Feature 2: every farming family has a farmstead in a hamlet

Proposal with the sources as Ramon read it: https://claude.ai/artifact/K7hysEWpwvBCFTrkqgsVfA

Code: `src/sim/settlement/hamlets.ts` (the arithmetic), `src/sim/systems/lots.ts` (`foundLots` lays the hamlets
after the parcels of the town), state in `src/sim/state.ts` (`hamlets`, `lot.hamlet`, `LOT_KIND.farmstead`),
`src/net/lots.ts` and `tools/sim/write_lots.ts` (the hamlets in the answer of the server and in the file). Tests:
`tests/settlement.test.ts`. Before this feature the simulation held only `family.hamlet = 1`; how many hamlets a
town has and where they lie was the world graphic's own (src/worldprobe/hamlets.ts).

| Table | Column | Type | Meaning |
|---|---|---|---|
| hamlets | place, site | i16 | place of the map and the town the hamlet belongs to |
| hamlets | x, z | f32 | its middle: metres east and south of the town's centre, at the scale of the houses (as the parcels) |
| hamlets | farms | u16 | farmsteads laid out in it |
| lot | hamlet | i32 | the hamlet a farmstead lies in, −1 for the ground of the town itself |
| lot | kind | u8 | 1 = farmstead |

### Steps

1. **Hamlets.** The farming families of a town (`family.hamlet`) make as few hamlets as hold them at ten farmsteads
   each: ⌈families / 10⌉, the families shared out evenly, lowest ids first.
2. **Farmstead.** 10 m at the lane, 17.5 m deep, one per family.
3. **In the hamlet.** Two rows at a lane that runs east-west, each fronting the lane; the lane as wide as the
   streets of a town of such parcels (5.15 m). A hamlet of ten takes 50 m by 40.15 m.
4. **Where the hamlet lies.** The hamlets of a town are spread evenly (a sunflower: equal ground to each, the golden
   angle between one and the next) over the ring from the edge of the town (its outermost parcel + 20 m + half a
   hamlet) to the edge of its fields: the radius of the disc that holds the town's arable (`place.arable`, of which
   a town has the share of its farming persons among those of its place), at 125 m of land to a block of 2 m. The
   ring is never narrower than gives each hamlet the square of its diagonal.
5. **Ground.** Each hamlet takes the spot nearest to its own (within 8 blocks) that is clear of every parcel of the
   town (20 m) and of the hamlets before it (4 m) and, where the building ground is surveyed, carries all its
   farmhouses (`houseGround`, as for the parcels); else the clear spot that carries the most; else the nearest
   clear spot farther out.

### Parameters

| Parameter | Value | Source |
|---|---|---|
| farmsteads in a hamlet | 10 at most | HLS, Dorf: three to five Gehöfte already made a village, most villages had 10 to 20. Henkel (2007): the Drubbel has 3 to 15 Hofstätten. Bolòs (2026): Catalan hamlets "generally fewer than ten" houses |
| farmstead | 10 × 17.5 m | half the sides of the smallest measured: Cottam (Yorkshire), a row of four regular tofts of just over 20 m by 35 m (Historic England, list entry 1017068). The half is Ramon's choice, no source: at 20 × 35 m a hamlet of ten would be 6.2 km wide on the map and the farmsteads would take 30 % of the median town's arable. Larger ones are attested too: Cottam's seven lesser tofts 20 m by up to 100 m, Croxton's enclosures 40 by 50 m (list entry 1016858), a single farm near Dorsten 3,800 m² (Pfeffer) |
| rows at a lane | 2 | Cottam's row; Pfaffenschlag, sixteen houses along the stream (Archaeological Atlas of Bohemia) |
| lane | 5.15 m | the street share of Grenade applied to the farmsteads; no source for a hamlet's lane |
| land to a block | 125 m | the half house size of the world graphic (src/worldprobe/land.ts), nominal: a block is some 130 m in middle Europe |
| distances 20 m, 4 m, search 8 blocks | – | PLACEHOLDER, no source |

### What the world of 1291 gets (seed 1291)

2,127 hamlets with 18,665 farmsteads for the 18,665 farming families (75,918 persons); with the 8,150 parcels the
register has 26,815 rows, and only the 314 ruler families are without ground. Hamlets per town 1 / 2 / 8 / 71
(smallest, median, nine in ten at most, largest: Cairo); farmsteads per hamlet 5 to 10, median 9. A hamlet lies
4.2 / 8.0 / 21.8 km from the centre of its town (nearest, median, farthest). No hamlet lies on another or on its
town. In 544 hamlets not every farmhouse stands on building ground: 209 of them lie beyond the survey of their town
(it ends at 12 km), the others on steps, water or rock. 11 hamlets found no clear spot near their own and lie
farther off.

### Own rules and gaps (no source)

- The size of the farmstead (above). All farmsteads are alike; Cottam shows two classes.
- The limit of ten farmsteads comes from Switzerland, Westphalia and Catalonia and is applied everywhere.
- Real hamlets lay 0.5 to 1.5 km apart (Bolòs 2026). The world has a hundredth of the people on the real land, so a
  hundredth of the hamlets: they lie some kilometres apart.
- Which family lives in which hamlet (by id), the even split, the sunflower, the lane running east-west.
- Thirteen towns have no arable in their place (Cairo, Fustat, Asyut, Qus, Kush, Sijilmasa, Medina, Mecca, Sana'a,
  Zabid, Ta'izz, Aden, Timbuktu: no fertile land in `land.json`): their hamlets lie in the ring their room makes.
- Hamlets of different towns are not held apart, and the building ground is known only as far as the survey of the
  town reaches.
- Which field belongs to which farm is not in the register. Nothing changes while the world runs.

### Sources

- Dubler & Della Casa: Dorf. Historisches Lexikon der Schweiz, version of 25.03.2015.
  https://hls-dhs-dss.ch/de/articles/007947/2015-03-25/
- Henkel (2007): Ländliche Siedlungsformen in Westfalen.
  https://www.lwl.org/westfalen-regional-download/PDF/S098_Siedlungsformen.pdf
- Bolòs (2026): Land 15(2), 225. https://www.mdpi.com/2073-445X/15/2/225
- Historic England: Cottam medieval settlement and cultivation terraces, list entry 1017068.
  https://historicengland.org.uk/listing/the-list/list-entry/1017068
- Historic England: Medieval settlement of Croxton, list entry 1016858.
  https://historicengland.org.uk/listing/the-list/list-entry/1016858
- Pfeffer: Die Ergebnisse der Ausgrabung am Nonnenkamp. Ein hochmittelalterlicher Bauernhof vor den Toren von
  Dorsten, pp. 32–33.
  https://www.lwl-archaeologie.de/media/filer_public/75/22/7522895f-c814-4547-93d5-1b30efade942/ein_hochmittelalterlicher_bauernhof_dorsten_pfeffer.pdf
- Archaeological Atlas of Bohemia: Slavonice, deserted medieval village Pfaffenschlag.
  https://www.archeologickyatlas.cz/en/lokace/slavonice_jh_ves_pfaffenschlag
- Shukurov et al., citing Chisholm (1979, p. 72): fields "within not more than about 5 km of the settlement, and
  preferably within 1–2 km" (Chisholm itself not opened). https://arxiv.org/pdf/1505.05121

