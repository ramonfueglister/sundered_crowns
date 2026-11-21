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
| 1 | Every family who lives in a town has a parcel (the land register) | agreed by Ramon 16 Nov 2026 as a draft; built in state 20, on main since 17 Nov 2026 (PR #61). The world graphic sets a house on each parcel of `public/data/lots_1291.json` |
| 2 | Every farming family has a farmstead in a hamlet (hamlets and farmsteads in the land register) | agreed by Ramon 17 Nov 2026 as a draft with the small farmstead ("Ja, mit kleinem Hof"); built in the same state step, on main since 17 Nov 2026 (PR #61). The world graphic sets the hamlets where the register has them and a farmhouse on each farmstead (PR #64) |
| 3 | The streets and the market of every town grow to its parcels (the street network in the state) | agreed by Ramon 18 Nov 2026 ("ja"); built in state 33 |
| 4 | Every farmstead has its fields: the furlongs of each hamlet in the courses of its open field, a strip of each farmstead in every furlong | agreed by Ramon 19 Nov 2026 ("ok"); built in state 37. The world graphic draws only these fields round the towns |
| 5 | The landmarks of every town at their real place and size: the church of its see, the great buildings known by name, the convents of the mendicants, the ruler's residence, the great abbeys alone | agreed by Ramon 19 Nov 2026 ("Ja, alles wie vorgeschlagen"); built in state 38. The world graphic draws only these landmarks |
| 6 | Every town has its wall and gates: a ring round the town (or the walled share the sources know), open at water, a gate where a way crosses it | agreed by Ramon 21 Nov 2026 ("ja alle"); built in state 41. The world graphic draws only this wall |
| – | Where a new house arises while the world runs; more real plans of the large towns; bridges; building by players | not proposed yet |

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
4. **Where.** Since feature 3 at the streets that grow to them (below). Until then: a grid of square blocks, each two
   rows of six parcels back to back, fronting the streets north and south of the block; streets as wide as leaves
   the parcels 76 % (0.147 of a block's side). The town filled from the centre outwards as a square; the family with
   the lowest id got the innermost parcel.
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
- The grid was a placeholder (no square, no bent streets, no wall), replaced by the streets of feature 3; the church
  and the great buildings stand where the world graphic sets them, and the parcels keep off them.
- The building ground is a file of the world graphic's ground: when that ground changes (terrain, monuments), the
  file is written anew and a new world lays its parcels differently from a running one. The back of a parcel (its
  yard) may lie on ground no house could stand on.
- The town stands still until persons are born, die and move.
- The world graphic (src/worldprobe/lots.ts, settle.ts `onParcels`) sets one house on each parcel of
  `public/data/lots_<year>.json` at the nearest zoom step, and not yet from `/lots`; without the file it packs its
  towns as before. The far zoom steps (far.ts) show the houses the nearest step builds through
  `public/data/plan_<year>.json` (tools/worldprobe/build_plan.ts, PR #64): when the register changes, the plan must
  be written anew.

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
   town (20 m), off its streets and its market (beside them it may lie: feature 3; in 1291 this sends 56 of the
   1,857 hamlets farther out), clear of the hamlets before it (4 m) and carries all its farmhouses (`houseGround`, as for the
   parcels); else the nearest such spot farther out (within 128 blocks); else the clear spot near its own that
   carries the most. The ground of a hamlet is the dry ground round the town (`public/data/dry_<year>.json`, written
   by `tools/worldprobe/build_plan.ts` of the world graphic: no water, no rock, up to 227 blocks from the centre;
   `World.dry`). Steps do not count there, because the world graphic levels the ground of a hamlet. Without that
   file the building ground of the town is used, as far as it reaches.

### Parameters

| Parameter | Value | Source |
|---|---|---|
| farmsteads in a hamlet | 10 at most | HLS, Dorf: three to five Gehöfte already made a village, most villages had 10 to 20. Henkel (2007): the Drubbel has 3 to 15 Hofstätten. Bolòs (2026): Catalan hamlets "generally fewer than ten" houses |
| farmstead | 10 × 17.5 m | half the sides of the smallest measured: Cottam (Yorkshire), a row of four regular tofts of just over 20 m by 35 m (Historic England, list entry 1017068). The half is Ramon's choice, no source: at 20 × 35 m a hamlet of ten would be 6.2 km wide on the map and the farmsteads would take 30 % of the median town's arable. Larger ones are attested too: Cottam's seven lesser tofts 20 m by up to 100 m, Croxton's enclosures 40 by 50 m (list entry 1016858), a single farm near Dorsten 3,800 m² (Pfeffer) |
| rows at a lane | 2 | Cottam's row; Pfaffenschlag, sixteen houses along the stream (Archaeological Atlas of Bohemia) |
| lane | 5.15 m | the street share of Grenade applied to the farmsteads; no source for a hamlet's lane |
| land to a block | 125 m | the half house size of the world graphic (src/worldprobe/land.ts), nominal: a block is some 130 m in middle Europe |
| distances 20 m, 4 m, search 8 and 128 blocks | – | PLACEHOLDER, no source |

### What the world of 1291 gets (seed 1291)

2,127 hamlets with 18,665 farmsteads for the 18,665 farming families (75,918 persons); with the 8,150 parcels the
register has 26,815 rows, and only the 314 ruler families are without ground. Hamlets per town 1 / 2 / 8 / 71
(smallest, median, nine in ten at most, largest: Cairo); farmsteads per hamlet 5 to 10, median 9. A hamlet lies
4.3 / 8.0 / 24.4 km from the centre of its town (nearest, median, farthest). No hamlet lies on another or on its
town. In 3 hamlets not every farmhouse stands on dry ground (27 farmhouses): one each of Ceuta, Alexandria and
Rhodes, with no dry spot for them within reach. By the building ground alone, which ends 96 blocks from the centre
and counts every step, it would be 117. 28 hamlets found no clear spot near their own and lie farther off.

### Own rules and gaps (no source)

- The size of the farmstead (above). All farmsteads are alike; Cottam shows two classes.
- The limit of ten farmsteads comes from Switzerland, Westphalia and Catalonia and is applied everywhere.
- Real hamlets lay 0.5 to 1.5 km apart (Bolòs 2026). The world has a hundredth of the people on the real land, so a
  hundredth of the hamlets: they lie some kilometres apart.
- Which family lives in which hamlet (by id), the even split, the sunflower, the lane running east-west.
- Thirteen towns have no arable in their place (Cairo, Fustat, Asyut, Qus, Kush, Sijilmasa, Medina, Mecca, Sana'a,
  Zabid, Ta'izz, Aden, Timbuktu: no fertile land in `land.json`): their hamlets lie in the ring their room makes.
- Hamlets of different towns are not held apart. The dry ground is surveyed as far as the outermost hamlet of each
  town may lie (the ring of step 4, half a hamlet and the near search; the world graphic adds 20 blocks): when the
  ring of a town grows, its survey must grow with it.
- A house is built at its real size and the land is 125 m to a block, so the hamlets of a large town crowd its
  fields: the ground of Paris's 39 hamlets is 69 % of the disc that holds its arable, and in the world graphic the
  cultivated blocks round Paris fall from 35,560 to 24,430. For the median town it is 9 %.
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

## Feature 3: the streets and the market of a town

Proposal with the sources as Ramon read it: https://claude.ai/artifact/CvAtxPqaLr8sG7T8TxXYMZ (Ramon, 18 November
2026: "echte Simulation von wirtschaftlicher Stadtentwicklung bei Strassen, entweder Papers oder wenn Pläne vorhanden
echte Pläne"; for the smaller places the state of research in generators, and "die müssen alle echt werden": checked
against real towns). Agreed with "ja" the same day.

Code: `src/sim/settlement/streets.ts` (the growth, only arithmetic), `src/sim/systems/lots.ts` (`layStreets`: the
plan of a town into the register; `relayTowns`: the upgrade 32 → 33), `src/sim/content/town_ways.ts` and
`town_ways_1291.json` (the ways of the world that leave each town, written by `tools/settlement/town_ways.ts` from
`public/data/roads_1291.json`), `src/sim/content/town_plans.ts` and `town_plans_1291.json` (the real plans, written by
`tools/settlement/cadastre_skeleton.py` from `data/cadastre/`), state in `src/sim/state.ts` (`street`), `src/net/lots.ts` and `tools/sim/write_lots.ts`
(the streets in the answer of the server and in the file), the calibration `tools/settlement/streets_probe.ts`.
Tests: `tests/settlement.test.ts`.

Written once when a world is founded, as the parcels (feature 1), or by the upgrade 32 → 33 of a running world:
every parcel keeps its id, its family and its size and moves to its street. Nothing changes while the world runs.

| Table | Column | Type | Meaning |
|---|---|---|---|
| street | site | i16 | the town |
| street | x0, z0, x1, z1 | f32 | a straight piece of street from end to end on its middle line, east-west or north-south; for the market the corners of its square. Metres east and south of the town's centre, as the parcels |
| street | kind | u8 | 0 a lane grown to the parcels, 1 track, 2 road, 3 highway (a street that runs out along a way of the world of that kind), 4 the market |
| street | width | f32 | metres (0 for the market) |

### Steps

The model of Barthelemy & Flammini (2008): centres appear and the street network grows towards them, each new piece
in the direction that shortens the way most. Here the centres are the families' parcels.

1. **Ways.** The ways of the world (the road network of 1291 the goods travel on) that leave a town, each with its
   direction and kind: the lines of `roads_1291.json` that pass within 1.5 pixels of the town, their direction 3
   pixels on, ways within 30° taken as one. 538 of the 558 towns have one to five, 20 none.
2. **Market.** A square as deep as a parcel, with a lane round it. It lies on open ground nearest the town's centre,
   because the world graphic sets the church at the centre: the market lies beside it (Pounds 2005, pp. 12, 23–24:
   the market at the meeting of the ways, at the nucleus of the town).
3. **Streets out.** From the market a street runs out along each way, by the nearest of the four directions, as far
   as the parcels would reach packed round the market and a parcel more; it ends where the ground ends (water,
   rock). A town with one way or none is one street through it (Pounds, pp. 23–26: the streets of an unplanned town
   grew from the paths by which people approached it). A town with a real plan lays the main streets of its plan
   instead (below, Real plans).
4. **Where the families want to live.** Each family draws a spot from a density that falls exponentially from the
   market, P(r) ∝ e^(−r / r_c) (Barthelemy & Flammini 2008 after Clark 1951; Barthelemy & Flammini 2009 derive it from
   households weighing the way to the centre against a rent that rises with density), r_c a share of the radius the
   parcels and their streets would take packed round the market. The nearest spot comes first.
5. **Lanes grow.** Where no street passes within a parcel's depth of a spot, the nearest street grows towards it:
   square from the street, one metre at a time along the axis with the larger part of the way to the spot, turning
   once at a right angle when the spot lies beside it (MM′ ∝ u_A, Barthelemy & Flammini 2008, Eq. 2). A lane that
   would run beside another ends on it; one that would end blind runs on to a street ahead or to either side within
   five parcel depths (Emilien et al. 2012, Sec. 4.3: a loop instead of a dead end; Strano et al. 2012,
   densification). A lane leaves from the open side of a T-junction near its spot rather than from the nearest point
   if that costs at most two parcel widths more, so that it crosses the street there. When every family has its
   parcel, each dead end left runs on the same way to a street within five parcel depths, straight over ground
   where no parcel stands.
6. **Parcels.** Each family, the nearest spot first, takes the parcel nearest its spot that fronts a street with its
   narrow side, lies on building ground with its house (`houseGround`, feature 1) and on no other parcel. Where the
   streets are full, a lane grows to the spot; where none can, a lane runs two parcels deep into the open ground from
   the street point nearest the spot (exploration, Strano et al. 2012). A parcel at a street to its east or west lies
   the other way round (`footprint`).
7. **Spread.** Where the streets close in before every family has a parcel, r_c grows by half and the town is laid
   again, up to seven times. A town whose ground does not hold its families at all is laid out without regard to the
   ground, as in feature 1.

The plan of a town is laid in steps of about a metre, so that a parcel is a whole number of steps wide and deep and
keeps its exact ground (feature 1): the step is the parcel's width divided by the width rounded to metres.

### Parameters

| Parameter | Value | Source |
|---|---|---|
| street width | 6 × w × (1/√0.76 − 1): 6.6 / 9.3 / 21.1 m (smallest, median, widest of 1291) | as wide as the streets of feature 1's grid: Grenade's share of parcels round a block of two rows of six (Boerefijn 2000) |
| market | a parcel deep, a lane round it | PLACEHOLDER, no measure of a market read |
| r_c | 0.5 of the packed radius | calibrated: the blocks of the world of 1291 fall off as A^−1.87 above 200 m² (Dresden: A^−1.9, Lämmer et al. 2006; Barthelemy & Flammini 2008 get it with an exponential density of centres) |
| join | 3 parcel depths | calibrated against the share of dead ends of medieval Paris (Vasserot, 0.10), with the landmarks of feature 5: 4 gives Paris 0.05 dead ends; 5 before feature 5 |
| crossing | 2.5 parcel widths | calibrated against the share of crossings of medieval Paris (0.12), with the landmarks of feature 5: 2 makes 0.09, 2.5 makes 0.12; 2 before feature 5 |
| served | 1 parcel depth | PLACEHOLDER: a spot this near a street takes its parcel there |
| market search | 3 parcel depths | PLACEHOLDER |
| ways | 1.5 px near, 3 px on, 30° | PLACEHOLDER: what reads the road map of 1291 as the ways of a town |

Calibration (`npx tsx tools/settlement/streets_probe.ts 1291`, with `TUNE=rc,join,cross`): of the 557 towns with
families, over those with 20 streets and more. Ramon chose medieval Paris as the target on 19 November 2026 ("ja"):
the street network of the Vasserot cadastre (1810–1836) inside the wall of Philippe Auguste, 256 ha, 62 km of street
(`tools/settlement/cadastre_paris.py`, `data/cadastre/paris_1291.json`). Before, the target were today's cities
(Barthelemy & Boeing 2025: 0.18, 0.62, 0.19), which the model met with 0.26, 0.57, 0.17 and no dead end joined after
the parcels.

| r_c, join, crossing | dead ends | T-junctions | crossings | τ of the blocks |
|---|---|---|---|---|
| target (medieval Paris; Lämmer et al. 2006) | 0.10 | 0.78 | 0.12 | 1.9 |
| **0.5, 5, 2 (chosen)** | 0.13 | 0.77 | 0.11 | 1.88 |
| 0.5, 5, 2, dead ends not joined after the parcels | 0.23 | 0.62 | 0.15 | 1.87 |
| 0.5, 10, 2 | 0.13 | 0.77 | 0.11 | 1.87 |
| 0.5, 5, 1 | 0.13 | 0.81 | 0.07 | 1.86 |
| 0.5, 5, 2.5 | 0.12 | 0.73 | 0.15 | 1.89 |

Recalibrated with feature 5 (20 Nov 2026): the landmarks laid before the streets, on the building ground surveyed
without what the world graphic built of its own, Paris's landmarks drawn together as its plan. Paris alone in brackets.

| r_c, join, crossing | dead ends | T-junctions | crossings |
|---|---|---|---|
| 0.5, 5, 2 (as before) | 0.14 (0.05) | 0.78 (0.86) | 0.09 (0.08) |
| 0.5, 5, 2.5 | 0.10 (0.05) | 0.78 (0.84) | 0.11 (0.11) |
| 0.5, 4, 2.5 | 0.11 (0.05) | 0.78 (0.82) | 0.11 (0.13) |
| **0.5, 3, 2.5 (chosen)** | 0.11 (0.08) | 0.77 (0.78) | 0.12 (0.15) |
| 0.5, 5, 3 | 0.10 (0.05) | 0.78 (0.84) | 0.12 (0.11) |
| 0.45, 5, 2.5 | 0.12 (0.05) | 0.73 (0.84) | 0.15 (0.10) |

### Real plans

Ramon, 19 November 2026: "Alte Kataster, Stadt für Stadt" (OpenStreetMap shows today's town, Haussmann's Paris; no
street in it is dated before 1291). The plan gives the form, not the size: where the market lies and how the main
streets run. Paris first, then Venice (the land register of 1808, EPFL), whose plan draws its land and water too.

1. **The old plan.** Paris: the streets of the Vasserot cadastre (1810–1836, ALPAGE via Stanford EarthWorks, ODbL)
   inside the convex hull of the wall of Philippe Auguste (1190–1215; ALPAGE walls, Noizet & Lallau 2013). The plan of
   the streets outlives the houses (Conzen 1960), so the cadastre of 1810 shows the streets of the walled town.
2. **The main streets.** The network as a graph, ends within 2 m one junction; each street (its name in the cadastre)
   weighted by the mean edge betweenness of its metres (the share of shortest ways between all junctions that run over
   it, Porta, Crucitti & Latora 2006); the streets whole, the busiest first, up to 3,500 m.
3. **Form, not size.** Every length in radii of the walled town (902 m: the radius of a circle of its area), centred
   on the parvis of Notre-Dame, where the world sets the church. The market: the Rue du Marché aux Poirées at the
   Halles (the market since Philippe Auguste), 1.08 radii north of the centre. Each street simplified to 0.13 radii
   and laid in pieces east-west and north-south, the longer axis first.
4. **In the world.** The plan is laid as wide as twice the town's packed radius (where the density of its families
   falls to a tenth), its market there, its main streets as roads where their ground lets a street pass (water,
   rock: the piece goes on beyond). A main street that ends short of another runs on to it within five parcel depths.
   The lanes grow from them as in any town.

| Parameter | Value | Source |
|---|---|---|
| main streets | 3,500 m of the busiest | calibrated: Paris in the world then meets 0.09, 0.80, 0.11 (Vasserot 0.10, 0.78, 0.12); 2,000 m gives 0.22 dead ends, 7,000 m 0.91 T-junctions |
| size in the world | 2 × the packed radius | OWN RULE: r − half ~ Gamma(2, r_c) holds 90 % of the families within 3.9 r_c ≈ 2 packed radii; the wall held the town |
| simplified to | 0.13 radii (120 m in Paris) | PLACEHOLDER |
| shortest piece | 0.02 radii (18 m) | PLACEHOLDER |
| one junction | ends within 2 m | PLACEHOLDER |

#### Venice: its land, its water and its bridges

Ramon, 20 November 2026: "Zuerst Boden und Brücken", then "weiter". The Napoleonic land register of Venice (1808,
"Venice 1808 Land Registers" v1.1, Di Lenardo et al., EPFL DHLAB, DOI 10.5281/zenodo.20715172, CC BY 4.0;
data/cadastre/venice_1808/) draws every building, courtyard, sottoportico and street as an area
(tools/settlement/cadastre_venice.py).

1. **The street skeleton.** The register's streets and sottoportici rasterized at 0.5 m and thinned (Lee et al. 1994);
   the network read off (150 km; dead ends, T-junctions and crossings 0.37, 0.54, 0.09: data/cadastre/venice_1808.json);
   strokes joined within 60° (Thomson & Richardson 1999); the busiest strokes by edge betweenness kept whole up to as
   many metres to the hectare as Paris keeps inside its wall (3,500 m on 256 ha, so 5,474 m on Venice's 400 ha). The
   centre is the Basilica di San Marco, the market the Campo San Giacomo di Rialto (the market since the 11th century),
   0.28 radii west and 0.37 north. Radius 1,128 m (the circle of the register's land).
2. **The ground.** Water is what the register does not draw as land, wider than the longest span of a bridge of
   Venice: the Rialto bridge, 28.80 m (Structurae, structure 20000461). A narrower canal (a rio) was crossed by a
   bridge wherever a street met it, and is land in the world; what stays is the Grand Canal, the basins of the
   Arsenal and the lagoon. Stored as the share of water of cells of 0.01 radii (11 m).
3. **In the world.** The plan's ground is laid at the plan's size (src/sim/settlement/plan_ground.ts): a block of 2 m
   is water where more than half of it is. The land register lays Venice's parcels, streets and landmarks on it
   instead of the surveyed ground (src/sim/systems/lots.ts), and the world graphic draws it in place of the map's land
   and water, round the town's site block (src/worldprobe/plan_ground.ts; the size comes with the register,
   `ground` in src/net/lots.ts and lots_<year>.json). Where a main street of the plan crosses water no wider than the
   Rialto spans (at the plan's size, and a block for the rounding), its blocks within the street's half width are
   land: a bridge. At the Rialto the Grand Canal is no wider than the span, so it is land there already, a flat
   crossing at the bridge's place.

Venice in the world of 1291: its 48 families fit on its register (before: laid out without regard to the ground),
238 streets, 1,868 m, the market 64 m from the centre. Its streets meet as Paris's do, not as Venice's: 0.03, 0.83,
0.14 against 0.37, 0.54, 0.09 in the register. The growth calibrated against Paris joins almost every dead end; the
dead ends of Venice end at the canals, which the world makes land. Not tuned (no rule of Venice's own read).

### What the world of 1291 gets (seed 1291)

5,743 rows in the street table: the 557 markets and 5,186 straight pieces. Streets per town 5 / 7 / 60 (fewest,
median, most: Cairo), 351 m of street in the median town, 1,854 m in Cairo. The market lies 34 m from the centre in
the median town (at most 92 m; three towns have it at the centre). The 5,766 parcels front the streets on all four
sides (1,541 north, 1,471 east, 1,384 south, 1,370 west). The towns with 20 streets and more have 0.13 dead ends,
0.77 T-junctions and 0.11 crossings (medieval Paris 0.10, 0.78, 0.12); over all towns it is 0.32, 0.62 and 0.06,
because a small town is one or two streets with their ends. (The other counts of this paragraph are those before the
real plan of Paris and the dead ends joined after the parcels.) 870 blocks are enclosed by streets, 748 of them of 200 m²
and more, median 578 m², their areas falling off as A^−1.87. 18 towns spread wider (step 7). Two towns are laid out
without regard to their ground: Venice (islands; it needs bridges) and Hormuz (an island too small for its streets).
(Venice since its register: on its own ground, see Real plans.)

| Town | Families in the town | Ways | Streets | Length | Width | Market from the centre |
|---|---|---|---|---|---|---|
| Limoges | 1 | 3 | 7 | 497 m | 21.1 m | 82 m |
| Bayonne | 7 | 2 | 6 | 252 m | 11.0 m | 48 m |
| Zürich | 7 | 3 | 7 | 395 m | 10.9 m | 39 m |
| Venice | 48 | real plan | 238 | 1,868 m | 7.4 m | 64 m (the Rialto) |
| Paris | 102 | real plan | 161 | 2,814 m | 9.2 m | 231 m (the Halles) |
| Cairo | 148 | 2 | 60 | 1,854 m | 7.4 m | 34 m |

Founding the land register of a world takes about 2.7 s, 0.5 s before the streets.

### Own rules and gaps (no source)

- Every street runs east-west or north-south and turns at right angles: the world is built of blocks and a house
  stands square to them (src/worldprobe/settle.ts). A way that leaves at a slant leaves by the nearest direction.
- The market beside the church, its size, the spot a family draws and the order of the families (by id).
- The towns have more dead ends than the cities Barthelemy & Boeing measured (0.26 against 0.18): those are today's
  cities from OpenStreetMap, not medieval ones. No measure of medieval street networks read.
- Every street of a town is as wide as every other; a highway is no wider than a lane. The street width follows the
  parcel width, so a town of one large parcel (Limoges) has a 21 m street.
- Only Paris and Venice have a real plan yet; every other town grows by the model, calibrated against Paris. The plan's river
  is not the world's: where the world's Seine lies elsewhere, the main streets end at it or cross ground the real
  Seine covered.
- No bridges but Venice's: a town cut by water grows on the side of its market. Venice's narrow canals are land and
  its bridges are flat land where a main street crosses (no arch, no steps).
- The world graphic paves the streets and the market (`onStreets`, src/worldprobe/settle.ts): every block whose
  middle lies on a street, as wide as the register has it, where the ground is dry and no rock. It draws no kerb,
  no gutter and no lamp, and a highway looks like a lane. `public/data/plan_<year>.json` must be written anew when the
  register changes (feature 1).
- The town stands still while the world runs: no street grows after the founding.

### Sources

- Barthelemy & Flammini (2008): Modeling urban street patterns. Physical Review Letters 100, 138702.
  https://arxiv.org/abs/0708.4360
- Barthelemy & Flammini (2009): Co-evolution of density and topology in a simple model of city formation.
  https://arxiv.org/abs/0810.1376 (read up to Eq. 3; the journal it appeared in not checked)
- Clark (1951): Urban population densities. Journal of the Royal Statistical Society A 114(4), 490–496 (cited after
  Barthelemy & Flammini).
- Emilien, Bernhardt, Peytavie, Cani & Galin (2012): Procedural generation of villages on arbitrary terrains. The
  Visual Computer 28, 809–818. https://doi.org/10.1007/s00371-012-0699-7
- Strano, Nicosia, Latora, Porta & Barthelemy (2012): Elementary processes governing the evolution of road networks.
  Scientific Reports 2, 296. https://arxiv.org/abs/1203.0300
- Barthelemy & Boeing (2025): A universal model of urban street networks. https://arxiv.org/abs/2509.21931
- Lämmer, Gehlsen & Helbing (2006): Scaling laws in the spatial structure of urban road networks. Physica A 363,
  89–95 (cited after Barthelemy & Flammini 2008).
- Clauset, Shalizi & Newman (2009): Power-law distributions in empirical data. SIAM Review 51, 661–703, Eq. 3.1 (the
  estimate of τ). https://arxiv.org/abs/0706.1062
- Pounds (2005): The Medieval City. Greenwood, pp. 12, 23–26.
- Vasserot cadastre (1810–1836), streets (VASSEROT_VOIES), ALPAGE, via Stanford EarthWorks; ODbL 1.0
  (`data/cadastre/paris_vasserot/`).
- Di Lenardo, Viaccoz, Guhennec, Musso & Kaplan, Venice 1808 Land Registers v1.1 (2026), EPFL DHLAB, DOI 10.5281/zenodo.20715172; CC BY 4.0
- Structurae, Rialto Bridge (structure 20000461): main span 28.80 m. https://structurae.net/en/structures/rialto-bridge
- Lee, Kashyap & Chu (1994), Building skeleton models via 3-D medial surface/axis thinning algorithms (the thinning of skimage)
- Thomson & Richardson (1999), The 'good continuation' principle of perceptual organization applied to the generalization of road networks
- Noizet & Lallau (2013): the walls of Paris, ALPAGE; ODbL 1.0 (`data/cadastre/paris_walls/`).
- Porta, Crucitti & Latora (2006): The network analysis of urban streets: a primal approach. Environment and Planning
  B 33, 705–725 (edge betweenness).
- Conzen (1960): Alnwick, Northumberland: a study in town-plan analysis. Institute of British Geographers 27.

## Feature 4: the fields of every farmstead

Proposal with the sources as Ramon read it: https://claude.ai/artifact/7UtpuRDL3UkES6MA28F8q2 (Ramon, 18 November
2026: "zuerst felder je hof, dann wahrzeichen"). Agreed with "ok" on 19 November 2026.

Code: `src/sim/settlement/fields.ts` (the arithmetic: lots, furlongs, courses, strips, the crop of a year),
`src/sim/systems/fields.ts` (`foundFields`: the furlongs into the register; `placeFarmFields`, `farmHarvest`),
`src/sim/content/tilth.ts` and `public/data/tilth_<year>.json` (the ground round each town a furlong can lie on,
written by `tools/worldprobe/build_tilth.ts` from the world graphic), state in `src/sim/state.ts` (`field`),
`src/net/lots.ts` and `tools/sim/write_lots.ts` (the furlongs and the order of the strips in the answer of the server
and in the file), `src/net/people.ts` and `src/people/economy_rows.ts` (the farm in the family's window), the drawing in
`src/worldprobe/settle.ts`, `far.ts` and `lots.ts`. Tests: `tests/fields.test.ts`, `tests/worldprobe/hamlets.test.ts`.

Written once when a world is founded, after the farmsteads (feature 2), or by the upgrade 36 → 37 of a running world.
Nothing changes while the world runs except the crop: which course bears what follows from the year.

| Table | Column | Type | Meaning |
|---|---|---|---|
| field | place, site | i16 | place of the map and the town |
| field | hamlet | i32 | the hamlet whose open field it lies in |
| field | x, z | f32 | its middle, metres east and south of the town's centre (as the parcels; a block of the world graphic is 2 m) |
| field | w, d | f32 | metres east-west and north-south: 20 × 14 for a whole furlong, the last of a course shorter |
| field | zelge | u8 | its course: 0, 1 or 2 |
| field | courses | u8 | the courses its land is tilled in: 3, or 2 in the Mediterranean kind of land |
| field | farm | i32 | the farmstead that holds it whole (two courses), −1 in the open field |

The strips are not stored: in the open field every farmstead of the hamlet has one strip in every furlong, in the order
of `stripOrder`. The crop is `cropOf(zelge, courses, year) = (zelge + year) mod courses`: 0 winter corn, 1 spring
corn, 2 fallow (two courses: 0 corn, 1 fallow).

### Steps

1. **Land of a farmstead.** Every farmstead of a place gets an equal share of the place's arable (`place.arable`,
   economy feature 2): the town's share is the place's arable × its farmsteads / the farmsteads of the place. No new
   number: the economy says how much land a farm has.
2. **Ground.** The world graphic lays its fields on a grid of lots of 11 × 8 blocks, every other row shifted by 5. A lot
   can hold a furlong where the ground is dry, without rock, nothing built, level to within two blocks with a balk
   round it, and not wooded (`build_tilth.ts`, the `room` hook of settle). Lots inside the town and its parcels and
   streets, or within the gap of a hamlet, are left out.
3. **Open field of a hamlet.** The hamlets of a town take in turn the nearest free lot each until each has the land of
   its farmsteads, so that no hamlet goes without. A furlong is 10 × 7 blocks, 109.4 ha (a lot without its balk).
4. **Courses.** The furlongs of a hamlet are split by their bearing from the hamlet, from the north round by the east,
   into three runs of equal land: winter corn, spring corn, fallow (HLS Zelgensysteme: three courses "von annähernd
   gleicher Grösse"). The last furlong of each run is shortened north-south so that the land comes out exact. Each
   year each course moves one on.
5. **Strips.** Every furlong is cut into as many strips of equal width as the hamlet has farmsteads, in the order of
   the farmsteads from the west, the northern row first (sun division, solskifte: Chouquer 2023): every farmstead has
   the same land in every course and the same share of good and poor ground.
6. **Mediterranean.** Where the map has the Mediterranean kind of land at the town, two courses and no common field:
   every furlong belongs whole to one farmstead, the farmsteads taking in turn the nearest free lot, and the courses
   alternate (Bolòs 2026: farmsteads of a house and the land that depended on it).
7. **Harvest of a farm.** The harvest of the place stays as calibrated (economy). A farmstead gets the share of its
   hectares in all furlongs of the place; in a hamlet of the open field that share is the same for all. Computed in
   the view (`farmHarvest`), not stored.

### Parameters

| Parameter | Value | Source |
|---|---|---|
| furlong | 10 × 7 blocks = 1,250 × 875 m of land, 109.4 ha | the field of the world graphic without its balk; a furlong of the world stands for those of 100 families |
| courses | 3; 2 in the Mediterranean kind of land | HLS Dreifelderwirtschaft, Zelgensysteme; the boundary by the map's kind of land is our own |
| land of a farmstead | place arable / farmsteads of the place | economy feature 2 (Broadberry et al. 2010, HYDE 3.2) |
| survey reach | farthest hamlet + 2.5 × the radius of one hamlet's arable, at most 700 blocks | PLACEHOLDER: enough ground for nearly every town |
| not wooded | woods below 0.5 | as the world graphic lays its fields |

### What the world of 1291 gets (seed 1291)

107,447 furlongs in 1,762 hamlets with fields (of 1,857; the hamlets of the towns without arable, Cairo among them,
have none). 97.3 % of the arable asked for is laid. 63 furlongs per hamlet in the median (fewest 3, nine in ten at
most 96, most 162). 460 hamlets till in two courses. The survey finds 698,221 lots with room round 545 towns.

The median furlong lies 8.4 km of land from its hamlet (nine in ten within 14.3 km, at most 48.9 km): one hamlet of
the world stands for 100, and its open field is theirs together.

Check against history: a farmstead of the world stands for 100 real families, so its land / 100 is the arable of one
real farming family. Nothing is calibrated to it.

| | Arable per farming family |
|---|---|
| world 1291, median of the 545 towns with arable | 9.9 ha (one in ten below 4.2 ha, one in ten above 13.2 ha) |
| a common Hufe (Lexikon der Geographie) | 7.5 to 15 ha |
| virgate of Alwalton, Hundred Rolls 1279 | 25 acres = 10.1 ha |
| virgate in Kent (Witney) | 30 acres = 12.1 ha |
| Zürich / Bayonne / Limoges | 12.0 / 9.2 / 7.0 ha |
| London / Barcelona / Florence / Paris / Venice | 5.0 / 5.5 / 1.7 / 1.5 / 0.6 ha: places at the land frontier |

32 towns get less land than asked, where the ground round them is mountain, sea or woods: Trabzon 9 %, Messina 17 %,
Trento 32 %, Palermo 34 %, Tripoli 48 %, Nice 48 %, Granada 49 %, Novgorod 49 %, Reggio Calabria 52 %, Genova 58 %,
Candia 59 %, L'Aquila 60 %, Istanbul 65 %, Fez 69 %, Ceuta 70 %, the rest above 75 %.

### Own rules and gaps (no source)

- Equal land for every farmstead and equal courses: the HLS names the ideal but says considerable differences were
  usual early. Whole and half holdings and cottars without land (Alwalton) are not in: the simulation has no measure
  that tells them apart.
- The courses as three sectors round the hamlet; the hamlets choosing in turn; the nearest ground first.
- Sun division is attested for Scandinavia and the Danelaw, not for all of Europe; it is the simplest attested rule
  for the order of the strips.
- The boundary between two and three courses by the map's Mediterranean kind of land; the HLS knows two courses in the
  Breisgau and the Vaud too.
- A block of the world graphic is a nominal 125 m of land; a strip of the world (125 m or less × 875 m) stands for
  the strips of 100 families (real ones about 200 m long and 5 to 20 m wide).
- The fields do not follow the arable of later years; the fields of neighbouring towns are not held apart from each
  other; 32 towns are short of ground.
- No pasture, common, meadow or vineyard; the vines stay a matter of the graphics. No irrigation, terraces or field
  paths.
- `tilth_<year>.json` must be written anew when the towns, the hamlets, the forest or the ground change, then
  `lots_<year>.json` and the far view's tables.

### Sources

- Schnyder & Ineichen (2010): Dreifelderwirtschaft. Historisches Lexikon der Schweiz, version of 7 Jan 2010.
  https://hls-dhs-dss.ch/de/articles/027644
- Zelgensysteme. Historisches Lexikon der Schweiz, article 013702, version of 5 Feb 2014.
  https://hls-dhs-dss.ch/de/articles/013702
- Hufe. Lexikon der Geographie, Spektrum 2001. https://www.spektrum.de/lexikon/geographie/hufe
- Hundred Rolls 1279, manor of Alwalton (Huntingdonshire), after Translations and Reprints III (1897).
- Witney: Kentish land measurements of the thirteenth century. Archaeologia Cantiana 109, 29–39.
- Chouquer (2023): Qu'est-ce qu'un « partage selon le soleil » (solskifte) en Scandinavie ? Académie d'Agriculture de
  France, fiche 13.03.Q03.
- McCloskey (1991): The Prudent Peasant: New Findings on Open Fields. Journal of Economic History 51(2), 343–355
  (abstract only). https://doi.org/10.1017/S0022050700038985
- Bolòs (2026): Understanding the Formation of a Mediterranean Landscape. Land 15(2), 225 (abstract only).
- Hall (2014): The Open Fields of England. Oxford (summary only; its types are not taken over).

## Feature 5: the landmarks of every town

Proposal with the sources as Ramon read it: https://claude.ai/artifact/8fJhERPyMorP25hDhPo7XN (Ramon, 18 November
2026: "zuerst felder je hof, dann wahrzeichen"). Agreed with "Ja, alles wie vorgeschlagen" on 19 November 2026.

Code: `src/sim/settlement/landmarks.ts` (the arithmetic: kinds, sizes, the mendicant orders, `builtIn`, `URBAN`),
`src/sim/content/landmarks.ts` and `src/sim/content/landmarks_1291.json` (the sees of the towns and the buildings known
by name), `src/sim/systems/landmarks.ts` (`coreLandmarks`, `edgeLandmarks`, `aloneLandmarks`: where each is laid),
`src/sim/systems/lots.ts` (laid with the towns), state in `src/sim/state.ts` (`landmark`), `src/net/lots.ts` and
`tools/sim/write_lots.ts` (the landmarks in the answer of the server and in the file), the drawing in
`src/worldprobe/landmarks.ts`, `settle.ts` and `world.ts`. Tests: `tests/landmarks.test.ts`.

Written once when a world is founded, with the land register, or by the upgrade 37 → 38 of a running world, which
lays its towns out anew round the landmarks (`relayTowns`: every parcel keeps its family and size, the hamlets stay
where they are). Nothing changes while the
world runs; how far a building is built follows from the year.

| Table | Column | Type | Meaning |
|---|---|---|---|
| landmark | kind | u8 | 0 cathedral, 1 orthodox cathedral, 2 Friday mosque, 3 convent, 4 abbey, 5 castle, 6 palace, 7 church, 8 monument |
| landmark | place, site | i16 | place of the map and the town; −1 for one that stands alone |
| landmark | x, z | f32 | its middle, metres east and south of the town's centre (as the parcels) |
| landmark | lat, lon | f32 | its real place, for one known by name (NaN for the others) |
| landmark | w, d | f32 | metres east-west and north-south (the long side east-west, as a church is built) |
| landmark | start, end, ruined | i16 | the years its building began and ended, and it became a ruin; −32768 where none |
| landmark | named | i16 | its row in `landmarks_<year>.json` `named`, −1 for none |
| landmark | order | u8 | the mendicant order of a convent (0 Franciscans, 1 Dominicans, 2 Augustinian hermits, 3 Carmelites), 255 for none |

### Steps

1. **The church of the see.** Every town that was the see of a Latin archbishop or bishop in 1291 has its cathedral, of
   an orthodox (or other eastern) bishop its orthodox cathedral, a Muslim town its Friday mosque. Where the church is
   known by name, at its real place; otherwise at the centre of the town (where the world graphic stood its church).
2. **Buildings known by name in a town.** At their real place: their real metres from the town's point times
   `URBAN` = √(1/SCALE) = 0.1. A town of the world has 1/100 of the people at the density of houses of the real town
   (feature 1), so it is a tenth as wide; a building keeps its real size. The church of the see first, then the
   others in the order of the file. Where its spot is taken by one laid before, or is not building ground, a landmark
   moves to the nearest spot round it that is (rings of 4 m, at most 80 m).
3. **Streets round them.** These landmarks are laid before the streets (feature 3). No street runs over a landmark;
   no parcel lies nearer than 4 m (`LANDMARK_GAP`), and a street may run in that gap, round the church.
4. **Convents at the edge.** A Latin town has a convent of each mendicant order it was large enough for in 1291
   (`ORDERS`: Franciscans from 2,000 people of the time, Dominicans from 4,000, Augustinian hermits from 10,000,
   Carmelites from 15,000), after its parcels and hamlets: one after another round the town from the east by the
   south, each on the first free ground out from 0.7 of the town's reach (Le Goff 1968: the friars settled at the edge
   of the towns and in their suburbs).
5. **The ruler's residence.** The largest town of the place that holds the capital of a realm has the residence of
   its ruler, a palace where the realm is Muslim, a castle elsewhere, at its edge as a convent, unless one is known by
   name (or the town's great church holds it, as St Mark's the Doge's Palace).
6. **Alone.** The buildings known by name outside the towns (abbeys, castles, Great Zimbabwe) stand at their real
   place.
7. **Built in a year.** `builtIn(start, end, ruined, year)`: not yet begun, being built (the share of its years),
   standing, a ruin. The world graphic draws one being built as the part built so far from its east end (a church was
   built from its choir), at least 0.4 of it; a ruin at 0.35 of its height; one not yet begun not at all.

The world graphic draws only these landmarks (`settle.ts` `marks`, `world.ts`): the model of the kind in the town's
building tradition, or the own model of a building known by name, turned so that its long side runs as the landmark's
and scaled evenly so that its long side has the landmark's real length, on levelled ground. A castle or palace rises at
most 30 m. The towers of a town stay a matter of the graphics.

### Parameters

| Parameter | Value | Source |
|---|---|---|
| sees of 1291 | 48 archbishops, 182 bishops, 19 orthodox, 75 Friday mosques among the 558 towns | Eubel (1913) for the Latin sees; a check of 18 by the sources below; Darrouzès (1981) not read |
| buildings known by name | 64: 27 abbeys, 12 cathedrals, 10 castles, 7 palaces, 3 monuments, 2 churches, 2 mosques, 1 orthodox; 24 alone | the Wikipedia articles of each, with the years of building as of 1291 |
| URBAN | √(1/SCALE) = 0.1 | OWN RULE, from the scale |
| a town with a real plan | as its plan: the walled town as wide as twice the town packed round its market (Paris 0.23), round the church of its see | OWN RULE: the landmarks stand where they stood among its streets |
| size where not known | cathedral 90 × 32 m (an archbishop's 130 × 45), orthodox 40 × 30, mosque 60 × 45 (a town of 50,000 people of the time 100 × 80), convent 60 × 36, abbey 100 × 60, castle 60 × 50, palace 100 × 70, church 50 × 25, monument 40 × 40 | PLACEHOLDER: the middle of what the buildings known by name measure |
| mendicant orders | from 2,000 / 4,000 / 10,000 / 15,000 people of the time | PLACEHOLDER: the order in which they came into the towns (Le Goff 1968); the thresholds not read from Le Goff or Emery (1962) |
| gap, search | 4 m; 80 m in steps of 4 m; edge from 0.7 of the town's reach | PLACEHOLDER |
| castle height | at most 30 m | PLACEHOLDER: the keep of the Louvre 31 m, the White Tower 27 m |

### What the world of 1291 gets (seed 1291)

1,766 landmarks: 230 cathedrals, 19 orthodox cathedrals, 75 Friday mosques, 1,247 convents (454 Franciscan, 454
Dominican, 212 Augustinian, 127 Carmelite), 27 abbeys, 141 castles, 22 palaces, 2 churches, 3 monuments. Paris has 7
(Notre-Dame, being built until 1345; the Palais de la Cité; the Louvre; four convents), London 8, Cologne 6, Venice 6,
Zürich 4, Cairo 2.

Of the 40 buildings known by name in the towns, 17 stand at their spot, 23 moved off it (median 40 m, at most 104 m)
where the water or one laid before took it. Of the 309 churches of a see without a name, 106 stand at the centre of
their town, the others moved off it (median of all 16 m, nine in ten within 48 m).

Two towns are laid out without regard to their ground (feature 1), but clear of their landmarks (before Venice's real
plan read its ground there were three, with Venice): Aberdeen and Seville (a river, and the landmarks at their real place, leave too little ground on one bank). Before
feature 5: Venice and Hormuz.

The building ground of the towns (`ground_<year>.json`) is surveyed before anything the world graphic builds of its
own (`build_ground.ts`, settle.ts): before it had the graphic's church and towers at the centre of every town as
built ground, and a town whose neighbour's houses stood on its middle (Fustat beside Cairo) had none. The streets
were recalibrated on it, with the landmarks laid before them, against medieval Paris (feature 3: join 3 parcel depths,
crossing 2.5 parcel widths; the towns of 20 streets and more 0.11, 0.77, 0.12, Paris 0.08, 0.78, 0.15; Vasserot 0.10,
0.78, 0.12). In a town with a real plan (Paris) the landmarks are drawn together as its plan, round the church of
its see where the plan has its centre: by URBAN they stood on the main streets of the plan, drawn at 0.23. On it the fields of feature 4 come out at 108,261 furlongs with
97.9 % of the arable laid, 28 towns short of ground (before 107,447, 97.3 %, 32). Beyond the surveyed ground of a town its dry ground
counts too (`widened`, from `dry_<year>.json`), so that the landmarks at its edge find room.

### Own rules and gaps (no source)

- The sees are compiled from knowledge and checked against the sources for 18 of them (Murcia 1291, Grasse 1244,
  Chioggia, L'Aquila 1257, Bayonne, Dax, Dorpat, Reval; Zaragoza an archbishop only from 1318, Toulouse from 1317,
  Prague from 1344, Pamiers a bishop from 1295; the Great Mosque of Tripoli 1294–98, so none in 1291; the Djenné mosque
  uncertain, about 1200–1330; an archbishop of Dongola attested 1113). Eubel itself was not read (archive.org is
  blocked here).
- A church of a see without a name at the centre, the convents and residences at the edge by a fixed bearing; their
  sizes; the thresholds of the orders (Le Goff and Emery not read); a residence only for the capital of a realm.
- `URBAN` draws the buildings known by name together as the town is drawn together (a town with a real plan as its
  plan); their size stays real, so a
  great church takes much of a small town of the world.
- The models are those of the world graphic, scaled evenly; only some buildings known by name have their own.
- No parish churches, hospitals, town halls, guild halls, synagogues, bridges or walls; no landmark is built while the
  world runs; the list is of 1291 only.
- The upgrade 37 → 38 lays the towns of a running world out anew round their landmarks (relayTowns): every family keeps its parcel, the hamlets stay where they are, and a world that has not run gets them exactly as a new world. The register cannot be founded anew in a world that has run: its persons are no longer those of its founding.
- `ground_<year>.json` must be written anew when the world graphic's ground changes, then `lots_<year>.json`, the tilth
  survey, `lots_<year>.json` again, the plan and the far view's tables.

### Sources

- Eubel, Conrad (1913): Hierarchia catholica medii aevi, vol. 1. Münster, Regensberg (the bishops of every Latin see
  from 1198; not read, the list compiled from it at second hand).
- Le Goff, Jacques (1968): Apostolat mendiant et fait urbain dans la France médiévale: l'implantation des ordres
  mendiants. Programme-questionnaire pour une enquête. Annales ESC 23(2), 335–352 (the summary of the enquiry read).
- Emery, Richard W. (1962): The Friars in Medieval France. A Catalogue of French Mendicant Convents, 1200–1550. New
  York, Columbia University Press (not read).
- Darrouzès, Jean (1981): Notitiae episcopatuum Ecclesiae Constantinopolitanae. Paris, Institut français d'études
  byzantines (not read).
- The Wikipedia articles of the buildings known by name, for their place, size and years: among them the Lighthouse of
  Alexandria (collapse in the earthquake of 1303; Ibn Battuta 1326 "one of its faces in ruins") and the Moscow Kremlin
  (destroyed 1238; oak walls 1339–1340; stone walls from 1367).

## Feature 6: the walls and gates of every town

Proposal with the sources as Ramon read it: https://claude.ai/artifact/YBFNgkumzYqtchxKDubJwv (Ramon chose "Stadtmauern
und Tore" on 21 November 2026). Agreed with "ja alle" on 21 November 2026, both recommendations with it: every town
walled but where a source says none, and the walled share where the sources know it.

Code: `src/sim/settlement/walls.ts` (the geometry: where a ring opens, its gates, the ways that run on through it),
`src/sim/settlement/wall_shape.ts` (the shape of a ring round its town), `src/sim/content/walls.ts` and
`src/sim/content/walls_1291.json` (written by `tools/settlement/walls.py` from
`data/history/1291/settlement/cesaretti_2016_s2_walled.csv`), the wall of Paris in `src/sim/content/town_plans_1291.json`
(`tools/settlement/plan_walls.py`), `src/sim/systems/walls.ts` (`foundWalls`), state in `src/sim/state.ts` (`wall`),
`src/net/lots.ts` and `tools/sim/write_lots.ts` (the wall in the answer of the server and in the file), the drawing in
`src/buildings/fortified/ring-wall.ts`, `src/worldprobe/register.ts`, `settle.ts` and `far_places.ts`. Tests:
`tests/walls.test.ts`.

Written once when a world is founded, after the fields, or by the upgrade 40 → 41 of a running world (a world that has
not run gets them exactly as a new world). Nothing changes while the world runs: the towns do not grow yet.

| Table | Column | Type | Meaning |
|---|---|---|---|
| wall | site | i16 | the town |
| wall | x0, z0, x1, z1 | f32 | the ends of a straight piece of the ring, metres east and south of the town's centre (as the parcels) |
| wall | kind | u8 | 0 wall, 1 gate, 2 postern |

### Steps

1. **Every town is walled.** "Even the smallest of towns had walls" (Pounds 2005, p. 29). Not a town a source knows to
   have had none: Venice, whose lagoon stood in for a wall (Gelichi 2016, pp. 265, 268–269: very few fortifications in the lagoon up to the modern era).
2. **What the ring holds.** Most towns filled their circuit (Pounds 2005, pp. 27–29): the ring holds every parcel and
   the church of the see. Where Cesaretti et al. (2016, appendix S2) give the walled area of a circuit that stood in
   1291 against the settled area, the ring holds that share of the town: below one the parcels nearest the market (all
   parcels of a town have one size, so their count is the area), the others are its suburbs; above one (King's Lynn)
   the ring round the whole town is stretched from the market until it holds that share. 29 towns of the world are
   among the 41 of S2; Norwich, Coventry, Great Yarmouth, Ghent, Bruges and Lucca are left out, their circuit of S2 was
   built after 1291, and Ypres has its circuit of the 12th century.
3. **A town with a real plan that draws its wall** has that wall at the plan's scale: Paris the wall of Philippe
   Auguste (ALPAGE, Noizet & Lallau 2013; its convex hull, 15 corners, 254 ha at the real size). Its share from S2 is
   left aside, the plan being laid as wide as its walled town (feature 3).
4. **The shape.** The ring follows the town round what it holds, a street's width clear of it, so that a lane runs
   along its inside; it is smoothed over bays three streets wide and keeps a street's width off the farmsteads of the
   hamlets (`shapeAround`, on a grid of 2 m). A town on both banks of a river has a ring on each.
5. **Nothing is cut.** A parcel of the suburbs or any other landmark (a convent, a residence, a building known by name)
   that the ring would cut is taken in where its middle lies inside, else the ring bends round it, until no ring cuts
   any. A building known by name may stand outside (Westminster Abbey outside London).
6. **Open at water.** Where water or rock lies under it the ring is open: a river or the sea stood in for the wall
   (Boston, "bounded by walls and river", Cesaretti et al. 2016, S2 note 18). In Paris, whose wall of the plan crosses
   parcels laid on it, the wall also ends at the houses.
7. **Gates.** A gate stands where a street along a way of the world crosses the ring, a postern where a lane does
   (gates let people in and took the tolls, Pounds 2005, p. 50). A way's street that ends within three street widths of
   the ring runs on through it. Where no street of a way reaches the ring, a gate stands where each way of the world
   leaves the town from its market.

The world graphic draws only this wall (`ringWall`), at every zoom the same: the wall along each piece, stepping with
the ground, a tower at each corner, each open end and beside each gate and every 50 m between them, a gatehouse over
each gate, a low arch over each postern. The square wall it drew of its own is gone for every town of the register.

### Parameters

| Parameter | Value | Source |
|---|---|---|
| towns without a wall | Venice | Gelichi (2016) |
| walled share | 29 towns, 0.25 (Narbonne) to 1.27 (King's Lynn) | Cesaretti et al. (2016), appendix S2 |
| Paris | the wall of Philippe Auguste, 15 corners | ALPAGE (Noizet & Lallau 2013), simplified to 0.02 radii of the plan |
| clear of what it holds, of the farmsteads | a street's width | OWN RULE: a lane along the inside of the wall; the sources give where some circuits ran, not how near the houses stood |
| smoothing, corners | three street widths; 2 m off the line at the least | OWN RULE: keeps the ring from going in and out round every parcel |
| a way runs on | within three street widths | OWN RULE: the streets end where the parcels end, the ring a street's width beyond them |
| gate | two street widths | OWN RULE: no source in hand for the width of a gatehouse |
| graphic | wall 4 m high and 1.6 m thick, towers every 50 m | OWN RULE: the measures of the square wall it replaces |

### What the world of 1291 gets (seed 1291)

556 towns walled (557 with parcels, Venice without), 21,597 pieces, 327 km of ring at the scale of the houses, 1,196
gates and 1,053 posterns. A town has 2 gates in the median, Paris the most with 17. Ten towns have no gate (Damietta,
Rhodes, Stettin, Colchester, Göttingen, Ragusa, Ravensburg, Plzeň, Louviers, Dax): their ways reach the ring over
water only. No ring cuts a farmstead, and outside Paris none cuts a parcel or a landmark.

The share of its parcels a ring holds against the walled share of S2:

| Town | S2 | World | Town | S2 | World |
|---|---|---|---|---|---|
| Paris (plan) | 0.31 | 0.59 | Bristol | 0.42 | 0.60 |
| London | 0.61 | 0.84 | Canterbury | 0.44 | 0.75 |
| Avignon | 0.30 | 0.60 | Lincoln | 0.47 | 1.00 |
| Narbonne | 0.25 | 0.62 | Oxford | 0.40 | 0.57 |
| Ypres | 0.45 | 0.57 | Leicester | 0.54 | 0.50 |
| Erfurt | 1.00 | 1.00 | King's Lynn | 1.27 | 1.00 |

The ring holds more than S2 says in most towns: the suburbs it would cut are taken in (step 5), and the parcels of a
town of the world lie closer than those of the real one, so a ring a street clear of the inner ones reaches the outer.

### Own rules and gaps (no source)

- The shape of a ring (its margin, smoothing and corners) and the width of a gate; that every way's street near the
  ring runs on through it.
- A ring holds more than the walled share of S2 where it would cut suburbs; for the towns not in S2 the whole town.
- The sources tell for few towns whether their circuit stood in 1291 (Gatehouse's murage grants not used yet, Mangini &
  Petroff's geocoded Stoob not public); every other town is walled by Pounds' rule.
- Only one circuit: no older inner ring (Paris, Cologne), no castle walls, no wall that changes while the world runs.
- The wall of Paris is the convex hull of the ALPAGE walls, and ends at the houses of the plan where it crosses them.
- The graphic's measures and towers.

### Sources

- Pounds, Norman J. G. (2005): The Medieval City. Westport, Greenwood (pp. 25, 27–29, 50).
- Cesaretti, Rudolf; Lobo, José; Bettencourt, Luís M. A.; Ortman, Scott G.; Smith, Michael E. (2016): Population-Area
  Relationship for Medieval European Cities. PLOS ONE 11(10): e0162678, appendix S2 (the walled areas).
- Gelichi, Sauro (2016): Castles on the Water? Defences in Venice and Comacchio during the Early Middle Ages. In:
  Christie, Neil; Herold, Hajnalka (eds): Fortified Settlements in Early Medieval Europe. Oxford, Oxbow, pp. 265,
  268–269 (very few fortifications in the lagoon up to the modern era).
- Noizet, Hélène; Lallau, Émilie (2013): ALPAGE, the wall of Philippe Auguste (ODbL), `data/cadastre/`.

