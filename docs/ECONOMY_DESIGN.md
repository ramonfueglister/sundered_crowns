# Economy design

## Working rules (Ramon, 14 November 2026)

1. **One feature at a time.** A single feature is proposed, discussed, built and shown before the next one is raised.
   No bundles, no topic lists for approval.
2. **Paper-based.** Every feature rests on published economic and economic-history research. Each number in the model
   carries its source (paper, table, page). Nothing is cited that has not been opened and read.
3. **Historically correct.** A feature is calibrated on one documented historical case and then checked, without further
   tuning, against others. Deviations are shown to Ramon, not tuned away.
4. **Economically modelled.** The mechanism is a model from the literature (stated as an equation), not a rule of thumb
   invented for the game.
5. Nothing is built before Ramon has agreed to the feature.

The earlier drafts in this file (about 40 goods in three tiers, six estates, closed money circulation, need tiers and
a standard-of-living formula) were rejected by Ramon on 14 November 2026 for breaking rules 1 to 4. They are not to be
revived. The diorama scale of 1 : 100 for people and quantities was answered with "finde ich gut" on the same day; it is
reconfirmed when the first quantities appear on screen.

Technical frame (unchanged, docs/ARCHITECTURE.md): deterministic systems over component arrays on the world server;
players and the AI of realms without a player act through the same commands.

## Features

| # | Feature | Status |
|---|---|---|
| 1 | Grain harvest per place | agreed, built and accepted by Ramon 14 Nov 2026; in the running world since then (world server redeployed, the public site follows with the rebuild) |
| 2 | Cultivated land per place | agreed by Ramon 14 Nov 2026 and built as proposed; in the running world once the world server is redeployed |
| 3 | England as one national economy, computed by the port of BeforeIT.jl | agreed by Ramon 15 Nov 2026 and built as proposed; in the running world once the world server is redeployed |

## 1. Grain harvest per place

Proposal and result for Ramon (German): https://claude.ai/artifact/UfkTR85DULTcDZc52gZjya

**Scope.** Every place brings in one grain harvest per year. Nothing else: no consumption, population change, prices,
trade, taxes, towns, weather or other goods.

**Model.** Malthusian production function (Ashraf and Galor 2011, equation 1):

    Y_i = Z · (A_i · X_i)^α · L_i^(1−α)

| Symbol | Meaning | Value | Source |
|---|---|---|---|
| Y | harvest of the place per year: kilocalories of food from arable farming, net of seed, fodder and the losses of storage and processing | result | unit of the calibration target, Broadberry et al. 2010, table 19 |
| A | land productivity, potential calories per hectare and year | per place, Caloric Suitability Index, pre-1500 crops, rain-fed, low inputs, 5′ grid (raster pre1500MaximumCalories.tif) | Galor and Özak 2016 |
| X | land area of the place (ha) | map | – |
| L | people living from agriculture | 74 % of the place's population | Allen 2000 (England 74 %, France 73 % around 1500), as cited by Crafts and Harley 2002, p. 2 |
| α | land share | 0.70 | Bouscasse, Nakamura and Steinsson 2025, p. 847 (estimated for England 1250–1870 from the rise of wages after the Black Death). Cross-check with the older calibration 0.4 (Voigtländer and Voth 2013, table 1) |
| Z | one constant for the whole map, constant over time | fixed by England 1300–09 | Broadberry et al. 2010; no productivity growth in England before 1600: Bouscasse, Nakamura and Steinsson 2025, p. 848 |

Constant returns to scale: dividing land and people by 100 divides the harvest by 100, so the 1 : 100 scale leaves all
per-head values unchanged. The simulation still holds people and land at 1 : 1; the scale is a decision of its own.

**Calibration.** England in 1300–09 is taken as one piece of land T_E = Σ A·X, worked by L_E people who brought in
Y_E: Y_E = Z · T_E^α · L_E^(1−α). This is the total of the place-level function when labour is spread over the land in
proportion to A·X, the allocation under which every place is equally well fed. With Z replaced:

    Y_i = Y_E · (A_i · X_i / T_E)^α · (L_i / L_E)^(1−α)

- Y_E = 1,242 kcal per head and day × 4.72 m people × 365 days (Broadberry et al. 2010, table 19, row 1300/09)
- L_E = 0.74 × 4.72 m people. While the share of 74 % is the same everywhere it cancels out of L_i / L_E.
- T_E = 7,323.3 (mean index) × 13.25 m ha: the land of the map inside the outline of England (Natural Earth,
  Admin 0 map units, 1:10m). The outline encloses 129,916 km²; the map has 132,525 km² of land inside it.

**Data.** tools/geo/build_csi_crop.py crops the source raster to the map window without resampling
(tools/geo/data/csi/, with checksum and provenance). tools/geo/build_england.py extracts the outline of England.
tools/geo/build_land.py overlays both on the place raster and writes public/data/land.json: the mean of the index over
the land of each place, weighted by ground area. Cells of zero yield count as zero, cells without data are left out.
The index covers 99.73 % of the map's land; 26.92 % of the land has zero yield; 13 places have no data at all (the
Azores and two map artefacts) and bring in no harvest; 107 places have data for less than 90 % of their area.
The first step needs zenodo.org, which the cloud environment cannot reach; it was run on Ramon's Mac on 14 November
2026. The outline (tools/geo/data/ne/england.json) was built on the Mac and again in the cloud environment from the
same source file, with the same checksum, and build_land.py reproduces land.json byte for byte in both places.
land.json and the crop are adapted from the data set and carry its licence, CC BY-SA 4.0.

**Implementation.** src/sim/systems/harvest.ts holds the model and the system, which runs on the first day of each
year over all places. The harvest is a column of the places (state version 2); a world saved by an older build is
brought up to date when it is loaded (src/sim/upgrade.ts). The view of a place and the place panel show the harvest
in kilocalories per year and per head and day, with land, land productivity and people in agriculture.
tests/harvest.test.ts covers model, calibration, system, upgrade and view.

**Model against history** (npm run harvest:check; nothing is tuned after the calibration).

England through time, the model with England as one piece of land, against Broadberry et al. 2010, table 19
(kcal per head and day from arable farming, net):

| Decade | People (m) | History, kcal per head and day | Model α = 0.7 | Deviation | Model α = 0.4 | Deviation |
|---|---|---|---|---|---|---|
| 1270/79 | 4.40 | 1,415 | 1,305 | -8 % | 1,277 | -10 % |
| 1300/09 (calibrated) | 4.72 | 1,242 | 1,242 | +0 % | 1,242 | +0 % |
| 1310/19 | 4.63 | 1,199 | 1,259 | +5 % | 1,252 | +4 % |
| 1380/89 | 2.36 | 1,801 | 2,018 | +12 % | 1,639 | -9 % |
| 1420/29 | 2.03 | 1,468 | 2,242 | +53 % | 1,741 | +19 % |
| 1450/59 | 1.93 | 1,512 | 2,323 | +54 % | 1,776 | +17 % |
| 1600/09 | 4.27 | 1,664 | 1,332 | -20 % | 1,293 | -22 % |
| 1691/1700 | 5.14 | 1,678 | 1,170 | -30 % | 1,200 | -28 % |

- 1270 to 1389 the model stays within −8 % and +12 %.
- In the fifteenth century it is 53 % too high. After the Black Death England moved land from grain to pasture
  (animal products rise from 139 to 292 kcal per head and day in the same table); the model keeps all land in grain.
- After 1600 it is 20 to 30 % too low: productivity growth begins around 1600 (Bouscasse, Nakamura and Steinsson
  2025), the model holds Z fixed.
- The rows 1300/09 and 1380/89 alone imply α = 0.54, the land share the same authors estimate when capital is a
  third factor. The model keeps their two-factor estimate 0.70.

England on the map at the start of 1356: 162 places inside the outline hold 2.58 m people (table 16: 2.60 m in 1351,
2.50 m in 1377). Their harvest is 1,856 kcal per head and day (1,543 with α = 0.4) against 1,801 in 1380/89.

Regions of the map with the start population of 1356. The benchmark is a floor of about 1,500 kcal per head and day
(Broadberry et al. 2010, pp. 28–29). The floor is for all food; the model gives the part from arable farming only
(England 1300/09: 1,242 of 1,381 kcal):

| Region | People (m) | Land (1000 km²) | People per km² | Mean yield of the soil | kcal per head and day, α = 0.7 | α = 0.4 |
|---|---|---|---|---|---|---|
| americas | 31.32 | 26,448 | 1.2 | 8,345 | 12,531 | 4,184 |
| east_africa | 25.10 | 9,633 | 2.6 | 5,867 | 6,188 | 2,983 |
| west_africa | 16.46 | 5,616 | 2.9 | 8,137 | 7,080 | 3,222 |
| france | 10.80 | 487 | 22.2 | 8,459 | 1,855 | 1,533 |
| sahel | 8.20 | 6,276 | 1.3 | 3,105 | 6,427 | 3,029 |
| germany | 7.24 | 585 | 12.4 | 8,241 | 2,731 | 1,911 |
| italy | 5.62 | 307 | 18.3 | 7,681 | 1,905 | 1,518 |
| persia | 5.25 | 3,657 | 1.4 | 2,559 | 4,880 | 2,408 |
| egypt | 4.98 | 4,046 | 1.2 | 2,113 | 3,791 | 1,483 |
| iberia | 4.40 | 600 | 7.3 | 7,586 | 3,703 | 2,259 |
| maghreb | 3.62 | 4,411 | 0.8 | 717 | 3,038 | 1,855 |
| british_isles | 3.48 | 324 | 10.7 | 5,532 | 2,252 | 1,697 |
| low_countries | 2.65 | 90 | 29.4 | 8,583 | 1,493 | 1,339 |
| anatolia | 2.44 | 663 | 3.7 | 7,767 | 6,108 | 3,010 |
| rus | 2.14 | 2,966 | 0.7 | 4,449 | 12,739 | 4,548 |
| scandinavia | 1.84 | 2,690 | 0.7 | 915 | 4,241 | 2,327 |
| balkans | 1.77 | 524 | 3.4 | 9,464 | 7,483 | 3,405 |
| steppe | 1.74 | 3,368 | 0.5 | 4,330 | 14,878 | 4,782 |
| arabia | 1.61 | 2,853 | 0.6 | 21 | 148 | 109 |
| hungary | 1.60 | 321 | 5.0 | 9,637 | 5,810 | 2,955 |
| greece | 1.31 | 166 | 7.9 | 7,833 | 3,484 | 2,120 |
| mesopotamia | 1.28 | 582 | 2.2 | 2,549 | 3,761 | 2,134 |
| bohemia | 1.09 | 114 | 9.6 | 8,762 | 3,437 | 2,186 |
| poland | 1.08 | 309 | 3.5 | 9,508 | 7,355 | 3,373 |
| levant | 0.96 | 294 | 3.3 | 2,852 | 3,129 | 1,966 |
| baltic | 0.93 | 460 | 2.0 | 8,711 | 10,155 | 4,040 |
| caucasus | 0.89 | 381 | 2.3 | 7,552 | 8,289 | 3,615 |
| atlantic_islands | 0.03 | 20 | 1.6 | 2,649 | 4,433 | 2,040 |
| **whole map** | 149.81 | 78,193 | 1.9 | 5,626 | 6,613 | 2,869 |

- The densely settled core lies near subsistence without any tuning: Low Countries 1,493, France 1,855, Italy 1,905,
  British Isles 2,252, Germany 2,731.
- Thinly settled regions are far above it: Hungary 5,810, Poland 7,355, the Balkans 7,483, the Baltic 10,155, Rus
  12,739, the steppe 14,878. The model counts all land of a place as worked. Where few people sit on much land that
  is wrong: most of it was forest, pasture or waste. This is the largest deviation and it is not tuned away.
- Irrigated land is missing from the index: Cairo's place has a yield of zero, Arabia 148 kcal per head and day.
- A place with a large town cannot feed itself (Paris: 394 kcal per head and day). Trade is not part of the feature.

**Known limits.**
- All land of a place counts as worked (see above). Feature 2 replaces this by the cultivated land; the tables of
  this section show feature 1 on its own, as it was built.
- Irrigation is not in the index (Galor and Özak 2015, p. 4, fn. 1): the Nile valley and Mesopotamia are understated and
  need their own source.
- The index uses the FAO's present-day agro-climatic data, not the climate of the fourteenth century. The data set
  describes its unit as calories per hectare and year; the unit drops out through Z.
- 74 % and α = 0.70 come from England (France for the 74 %) and are applied to the whole map. α is estimated for the
  whole English economy, not for agriculture alone. Allen's original table was not accessible; only the citation in
  Crafts and Harley was read.
- English yields are demesne yields, assumed representative; Stone (2006) puts peasant yields about 11 % higher
  (Broadberry et al. 2010).
- One harvest per year, booked on 1 January for every place; no regional harvest calendars, no second harvests.
- The harvest is shown in kilocalories, not in tonnes of grain as first proposed. The source gives bushels (table 3)
  and kilocalories (table 19); for tonnes a sourced weight per bushel of each grain is missing.
- The outline of England is today's; the places follow it to within 0.4 % of T_E.

**Sources** (all opened on 14 November 2026)
- Ashraf, Q., Galor, O. (2011). Dynamics and Stagnation in the Malthusian Epoch. American Economic Review 101(5),
  2003–2041. https://www.nber.org/papers/w17037.pdf (production function p. 3; table 5: elasticity of population density
  in 1500 with respect to land productivity 0.584, of income per capita 0.041)
- Galor, O., Özak, Ö. (2016). The Agricultural Origins of Time Preference. American Economic Review 106(10), 3064–3103.
  Data: Galor, O., Özak, Ö. (2015). Caloric Suitability Index – Data (v1.0). Zenodo.
  https://doi.org/10.5281/zenodo.14714917, described at https://ozak.github.io/Caloric-Suitability-Index/ (CC BY-SA 4.0)
- Galor, O., Özak, Ö. (2015). Land Productivity and Economic Development: Caloric Suitability vs. Agricultural
  Suitability. https://economics.brown.edu/sites/default/files/papers/2015-5_paper_0.pdf
- Bouscasse, P., Nakamura, E., Steinsson, J. (2025). When Did Growth Begin? New Estimates of Productivity Growth in
  England from 1250 to 1870. Quarterly Journal of Economics 140(2), 835–888.
  https://eml.berkeley.edu/~enakamura/papers/malthus.pdf
- Voigtländer, N., Voth, H.-J. (2013). The Three Horsemen of Riches: Plague, War, and Urbanization in Early Modern
  Europe. Review of Economic Studies 80, 774–811. https://www.jvoth.com/Three_Horsemen.pdf
- Broadberry, S., Campbell, B., Klein, A., Overton, M., van Leeuwen, B. (2010). English Economic Growth, 1270–1700.
  CAGE Working Paper 21, University of Warwick.
  https://warwick.ac.uk/fac/soc/economics/research/centres/cage/manage/publications/21.2010_broadberry_complete.pdf
  (table 16 p. 51, table 19 p. 56, subsistence pp. 28–29)
- Allen, R. C. (2000). Economic structure and agricultural productivity in Europe, 1300–1800. European Review of
  Economic History 4(1), 1–25. https://ora.ox.ac.uk/objects/uuid:9ef3c3c6-512f-44b6-b74e-53266cc42ae2
- Crafts, N. F. R., Harley, C. K. (2002). Precocious British Industrialization: A General Equilibrium Perspective.
  LSE Working Paper 67/02. https://www.lse.ac.uk/asset-library/information/wp6702.pdf
- Slicher van Bath, B. H. (1963). Yield Ratios, 810–1820. A.A.G. Bijdragen 10, Wageningen.
  https://edepot.wur.nl/296371 (p. 16: 3.0–4.7 grains harvested per grain sown before 1500, which is why the harvest is
  counted net of seed)
- Natural Earth. Admin 0 – Map Units, 1:10m. Public domain. https://www.naturalearthdata.com/

## 2. Cultivated land per place

Proposed on 14 November 2026 after Ramon chose "Bestellte Fläche vorschlagen"; agreed by him the same day ("Ja, so
bauen" on the decision card, 22:33 UTC) and built exactly as proposed. Proposal and result for Ramon (German):
https://claude.ai/artifact/UumAzzpLcdRmHcSUB5kRTz. Player wiki: docs/wiki/wirtschaft/bestellte-flaeche.md.
All tables below are printed by `npm run harvest:check` from game code. They reproduce the numbers of the proposal,
which had been computed outside the game (one ratio rounds differently: Europe against HYDE 1.28, not 1.27).

**What it changes.** Feature 1 counts all land of a place as worked. Feature 2 replaces that by the land the people
of the place cultivate: X_i = min(c · P_i, s · F_i, F⁺_i), best soil first. The harvest equation of feature 1 stays;
A·X becomes the sum of yield times area over the cultivated land.

| Symbol | Meaning | Value | Source |
|---|---|---|---|
| X | cultivated land of the place in ha: arable including fallow | result | |
| P | people of the place | game state | |
| F | land area of the place | game map | |
| F⁺ | land of the place with a yield above zero | Caloric Suitability Index as in feature 1 | |
| s | land limit: largest share of a place that becomes arable | 39.2 % | chosen so that England's 162 places with 4.72 m people together give 11.52 m acres of arable: Broadberry et al. 2010, table 1 (1300) and table 19 (1300/09); the source takes 1300 as the medieval peak of the arable acreage (pp. 5–6) |
| c | arable per head while land is free | 1.759 ha (4.35 acres) | chosen so that the same places with 2.36 m people together give 8.73 m acres: table 1 (1380), table 19 (1380/89) |
| Z | calibration constant of the harvest | recalibrated | England 1300/09, 1,242 kcal per head and day (table 19), now with the cultivated land of England's places |
| α, L, A | unchanged | | feature 1 |

**Where the rule comes from.** It is the method of the published land-use reconstructions applied to a single place:
cropland = cropland per capita × population (Klein Goldewijk et al. 2017, HYDE 3.2, sect. 2.3.1; Pongratz et al. 2008,
paras 12 and 14, per-capita area constant before AD 1700), a maximum area per grid cell (HYDE 3.2, eq. 1), saturation
with population density and "the highest quality land for crops is cleared first" (Kaplan et al. 2009). The grid of
HYDE is not imported: it is itself modelled, with its own population; a grid for one year cannot follow the game's
population; and HYDE states an uncertainty range of 50 % at 850 CE and 25 % at 1700 CE (sect. 5).

**Calibration.** One case, England, at two dates (two parameters need two dates). The people of every English place
on the map (1356) are scaled by the same factor to the population of the decade. Directly from the source, arable per
head was 2.44 acres in 1300, 3.70 in 1380, 3.82 in 1420 and 3.96 in 1450; c is higher (4.35) because 57 of the 162
English places are still at the land limit in 1380 on the map.

The two values are not typed in: tools/sim/calibrate_cultivation.ts (part of `npm run land`) solves for them on the
map with the game's own functions and writes public/data/cultivation.json (land limit 0.3923, arable per head
1.7586 ha, T_E = 3.603 × 10¹⁰: the sum of yield × hectares over the cultivated land of England's places in 1300/09).
tests/cultivation.test.ts fails if the stored values no longer follow from the map.

**Data.** tools/geo/build_land.py adds a yield curve per place to public/data/land.json: the land of the place sorted
by yield, best first, as the mean yield between fixed shares of its land (33 edges from 0.1 % to 100 %, every 2 %
between 10 % and 40 %) and the share of the land with a yield above zero. The sum of yield × area is exact at every
edge and linear in between. 72.81 % of the map's land has a yield above zero.

**Implementation.** src/sim/systems/cultivation.ts holds the rule and the system; it runs on the first day of each
year before the harvest and writes the cultivated land into a new column of the places (state version 3; older worlds
are brought up to date when loaded, src/sim/upgrade.ts). src/sim/systems/harvest.ts takes the soil of the cultivated
land instead of the mean yield times all land. The place panel shows the cultivated land in hectares and per cent of
the land, whether the place is at the land limit, and the mean yield of the cultivated soil.
tests/cultivation.test.ts and tests/harvest.test.ts cover rule, curve, calibration, system, upgrade and view. A
world created by the build of feature 1 was resumed by this build and its command log replayed to the same hash.

**Model against history (npm run harvest:check; nothing tuned beyond the calibration).** England through time, arable in million
acres, harvest in kcal per head and day from arable farming (Broadberry et al. 2010, tables 1 and 19):

| Decade | People (m) | Arable, history | Arable, model | Deviation | Harvest, history | Feature 1 | Deviation | Feature 2 | Deviation |
|---|---|---|---|---|---|---|---|---|---|
| 1270/79 | 4.40 | 11.52 | 11.28 | -2 % | 1,415 | 1,305 | -8 % | 1,289 | -9 % |
| 1300/09 | 4.72 | 11.52 | 11.52 | calibrated | 1,242 | 1,242 | calibrated | 1,242 | calibrated |
| 1310/19 | 4.63 | | 11.46 | | 1,199 | 1,259 | +5 % | 1,255 | +5 % |
| 1380/89 | 2.36 | 8.73 | 8.73 | calibrated | 1,801 | 2,018 | +12 % | 1,709 | -5 % |
| 1420/29 | 2.03 | 7.76 | 8.05 | +4 % | 1,468 | 2,242 | +53 % | 1,802 | +23 % |
| 1450/59 | 1.93 | 7.64 | 7.82 | +2 % | 1,512 | 2,323 | +54 % | 1,832 | +21 % |
| 1600/09 | 4.27 | 8.87 | 11.16 | +26 % | 1,664 | 1,332 | -20 % | 1,309 | -21 % |
| 1691/1700 | 5.14 | 9.70 | 11.72 | +21 % | 1,678 | 1,170 | -30 % | 1,181 | -30 % |

England on the map at the start of 1356 (2.58 m people): 9.15 m acres of arable, 61 of 162 places at the land limit,
1,653 kcal per head and day (history 1380/89 with 2.36 m people: 8.73 m acres, 1,801 kcal; feature 1: 1,856 kcal).

Regions at the start of 1356, kcal per head and day, feature 1 → feature 2: Low Countries 1,493 → 1,385, Scandinavia
4,241 → 1,559, Italy 1,905 → 1,584, British Isles 2,252 → 1,617, Greece 3,484 → 1,681, France 1,855 → 1,722, Iberia
3,703 → 1,850, Rus 12,739 → 1,857, Germany 2,731 → 2,016, Bohemia 3,437 → 2,027, Baltic 10,155 → 2,043, Poland
7,355 → 2,179, Balkans 7,483 → 2,253, Hungary 5,810 → 2,257, steppe 14,878 → 1,463, whole map 6,613 → 1,843. The dry
regions fall far below subsistence (Egypt 3,791 → 699, Persia 4,880 → 1,071, Mesopotamia 3,761 → 1,161, Maghreb
3,038 → 1,262, Arabia 148 → 47): the index knows rain-fed farming only, and the huge area no longer hides it. The full
table is in the wiki page. No documented harvest per head was found for regions outside England.

Arable against HYDE 3.2 (Klein Goldewijk et al. 2017, table 2, 1400 CE, million ha; the paper does not define its
regions, the mapping of the map's regions is ours, and HYDE uses its own population):

| Group | Model 1356 | HYDE 3.2, 1400 | Model / HYDE | HYDE 3.2.1 grid on the map, 1400 |
|---|---|---|---|---|
| Europe without the former Soviet Union | 64.0 | 50.2 | 1.28 | 50.5 |
| North Africa and Middle East | 24.8 | 18.0 | 1.38 | 22.6 |
| Tropical Africa | 86.6 | 27.1 | 3.20 | 24.5 |
| Americas | 52.8 | 20.6 | 2.56 | 16.0 |
| Former Soviet Union (the map covers the west only) | 10.0 | 12.0 | not comparable | 10.0 |

In Europe the model is 28 % above HYDE, of the order of HYDE's own range; Kaplan et al. (2017) find that HYDE 3.1
shows roughly 25 % less open land than pollen-based reconstructions in preindustrial Europe. Outside Europe the model
is 2.6 to 3.2 times HYDE: England's arable per head does not transfer to Africa and the Americas.

**Every region against the HYDE grid** (the check promised in the proposal, done after the build). The grids of
HYDE 3.2.1 (baseline) for 1300 and 1400, cropland in km² and people per 5 arc-minute cell, were fetched on Ramon's
Mac on 14 November 2026 from the DANS archive and summed over the land of each region of the map
(tools/geo/check_hyde.py; the sums, with file names, sizes and checksums, are in
tools/geo/data/hyde/hyde_regions.json; the grids themselves stay out of the repository). HYDE 3.3 could not be
fetched: Utrecht's data server answers automated requests with a bot check, on the Mac as well. Summed over the
map's European regions the grid gives 50.5 million hectares in 1400 against 50.2 in the printed table 2, so overlay
and assignment of regions agree with the paper. Arable in million hectares, people in millions:

| Region | People, map 1356 | People, HYDE 1300 | HYDE 1400 | Arable, model 1356 | HYDE 1300 | HYDE 1400 | Model / HYDE 1300 | Model / HYDE 1400 | ha per head, model | HYDE 1300 | HYDE 1400 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| americas | 31.32 | 39.32 | 42.92 | 52.83 | 14.92 | 15.98 | 3.54 | 3.31 | 1.69 | 0.38 | 0.37 |
| east_africa | 25.10 | 13.28 | 14.90 | 43.71 | 6.34 | 7.08 | 6.89 | 6.17 | 1.74 | 0.48 | 0.48 |
| west_africa | 16.46 | 15.86 | 18.00 | 28.91 | 9.01 | 10.21 | 3.21 | 2.83 | 1.76 | 0.57 | 0.57 |
| france | 10.80 | 13.53 | 9.37 | 14.95 | 15.59 | 10.41 | 0.96 | 1.44 | 1.39 | 1.15 | 1.11 |
| sahel | 8.20 | 8.81 | 9.84 | 14.02 | 6.41 | 7.18 | 2.19 | 1.95 | 1.71 | 0.73 | 0.73 |
| germany | 7.24 | 13.75 | 9.87 | 11.96 | 16.97 | 9.83 | 0.70 | 1.22 | 1.65 | 1.23 | 1.00 |
| italy | 5.62 | 12.19 | 7.81 | 7.23 | 11.54 | 7.11 | 0.63 | 1.02 | 1.29 | 0.95 | 0.91 |
| persia | 5.25 | 7.97 | 8.62 | 8.14 | 5.75 | 5.96 | 1.42 | 1.36 | 1.55 | 0.72 | 0.69 |
| egypt | 4.98 | 7.75 | 7.37 | 3.47 | 3.65 | 3.58 | 0.95 | 0.97 | 0.70 | 0.47 | 0.48 |
| iberia | 4.40 | 8.69 | 6.38 | 7.36 | 5.56 | 6.24 | 1.32 | 1.18 | 1.67 | 0.64 | 0.98 |
| maghreb | 3.62 | 4.74 | 4.21 | 5.22 | 4.32 | 3.82 | 1.21 | 1.37 | 1.44 | 0.91 | 0.91 |
| british_isles | 3.48 | 7.13 | 3.50 | 5.26 | 5.55 | 2.54 | 0.95 | 2.08 | 1.51 | 0.78 | 0.72 |
| low_countries | 2.65 | 3.17 | 2.18 | 2.76 | 2.03 | 1.26 | 1.36 | 2.19 | 1.04 | 0.64 | 0.58 |
| anatolia | 2.44 | 5.77 | 4.65 | 4.21 | 7.57 | 5.95 | 0.56 | 0.71 | 1.73 | 1.31 | 1.28 |
| rus | 2.14 | 3.74 | 3.74 | 3.72 | 2.45 | 2.47 | 1.52 | 1.51 | 1.74 | 0.65 | 0.66 |
| scandinavia | 1.84 | 2.35 | 1.25 | 2.96 | 3.57 | 1.98 | 0.83 | 1.49 | 1.61 | 1.52 | 1.59 |
| balkans | 1.77 | 3.79 | 3.08 | 3.11 | 4.36 | 3.41 | 0.71 | 0.91 | 1.76 | 1.15 | 1.11 |
| steppe | 1.74 | 2.87 | 2.92 | 3.04 | 3.69 | 3.71 | 0.82 | 0.82 | 1.75 | 1.29 | 1.27 |
| arabia | 1.61 | 4.88 | 4.48 | 0.21 | 0.11 | 0.08 | 1.93 | 2.66 | 0.13 | 0.02 | 0.02 |
| hungary | 1.60 | 3.52 | 2.93 | 2.81 | 3.66 | 2.93 | 0.77 | 0.96 | 1.76 | 1.04 | 1.00 |
| greece | 1.31 | 1.98 | 1.48 | 1.87 | 1.06 | 0.78 | 1.76 | 2.39 | 1.43 | 0.54 | 0.53 |
| mesopotamia | 1.28 | 1.52 | 1.47 | 2.05 | 1.41 | 1.33 | 1.45 | 1.53 | 1.60 | 0.93 | 0.91 |
| bohemia | 1.09 | 2.74 | 2.35 | 1.83 | 2.08 | 1.65 | 0.88 | 1.11 | 1.67 | 0.76 | 0.70 |
| poland | 1.08 | 2.64 | 2.64 | 1.90 | 2.37 | 2.32 | 0.80 | 0.82 | 1.76 | 0.90 | 0.88 |
| levant | 0.96 | 2.34 | 1.87 | 1.45 | 2.41 | 1.91 | 0.60 | 0.76 | 1.51 | 1.03 | 1.02 |
| baltic | 0.93 | 1.13 | 1.14 | 1.63 | 1.85 | 1.79 | 0.88 | 0.91 | 1.76 | 1.64 | 1.57 |
| caucasus | 0.89 | 1.88 | 1.56 | 1.57 | 2.47 | 2.03 | 0.64 | 0.77 | 1.76 | 1.31 | 1.30 |
| atlantic_islands | 0.03 | 0.19 | 0.14 | 0.03 | 0.01 | 0.01 | 4.28 | 3.63 | 1.09 | 0.04 | 0.07 |
| **whole map** | 149.81 | 197.56 | 180.66 | 238.22 | 146.68 | 123.56 | 1.62 | 1.93 | 1.59 | 0.74 | 0.68 |
| England (162 places) | 2.58 | 4.72 | 2.13 | 3.70 | 4.09 | 1.75 | 0.90 | 2.11 | 1.43 | 0.87 | 0.82 |

- Area. In Europe the model's arable of 1356 lies between HYDE's values for 1300 and 1400 in France, Germany,
  Italy, the British Isles, Scandinavia and Bohemia, the regions where HYDE's population falls strongly between the
  two years. It is above both in the Low Countries (1.36 and 2.19 times), Greece (1.76 and 2.39) and Iberia (1.32 and
  1.18) and below both in Anatolia, the Balkans, Hungary, Poland, the Baltic, the Levant, the Caucasus and the
  steppe (0.56 to 0.96).
- Per head. The model cultivates more land per head than HYDE in every region: 1.0 to 2.7 times HYDE's value of
  1400 in Europe (the Atlantic islands aside), 2.3 to 4.5 times in Africa south of the Sahara and the Americas. The areas in Europe are closer than that only
  because the map of 1356 holds fewer people than HYDE (42.9 m in the European group against 53.0 m in HYDE in 1400
  and 75.7 m in 1300).
- Where the difference comes from. For England's places HYDE has 4.72 m people and 10.12 m acres of cropland in
  1300 (Broadberry et al.: 11.52 m acres of arable, 14 % more) but only 2.13 m people and 4.33 m acres in 1400
  (Broadberry et al.: 8.73 m in 1380, 7.76 m in 1420). HYDE lets cropland fall almost in step with population
  (0.87 and 0.82 ha per head); Broadberry et al. find 2.44 acres per head in 1300 and 3.70 in 1380. The model is
  calibrated on Broadberry et al., so its arable per head on free land (1.76 ha) is above HYDE's value for every
  European region (0.53 to 1.59 ha per head in 1400). The two sources contradict each other for England after the Black Death; nothing was changed in the model
  because of it.
- The people of the map are not HYDE's: 149.8 m on the map in 1356 against 197.6 m (1300) and 180.7 m (1400) in
  the same window, with large differences by region (East Africa 25.1 m against 14.9 m, Germany 7.2 m against
  9.9 m, Arabia 1.6 m against 4.5 m). The start population is not part of this feature.

**Known limits.**
- Both numbers come from England and are applied to the whole map; no source says they hold for Flanders, the Po
  plain or Poland. Outside Europe the comparison with HYDE speaks against them.
- The calibration assumes that people were spread over England's places in 1300 and 1380 as on the map in 1356. No
  source.
- c is only loosely pinned down: c = 1.5 ha with a land limit of 42.6 % gives 8.28 m acres in 1380, 5 % below the
  source.
- The source estimates too: its starting point is an estimate for 1300; 1270 to 1500 are extrapolated from it with the
  trends of demesne acreage and tithes, 1600 is interpolated backwards with population (pp. 5–6).
- Fifteenth century still 21 to 23 % too high: the source shows less harvest per head than in 1380 although arable per
  head was higher. After 1600 the arable is 21 to 26 % too large and the harvest 21 to 30 % too small (Z fixed).
- Irrigation is missing (Cairo: no cultivated land). Towns cannot feed themselves (Paris 418 kcal per head and day).
- The rule has a kink (free land or land limit); Kaplan et al. 2009 describe a smooth curve. The area follows the
  people within the same year; in England arable per head still rose from 3.70 to 3.96 acres between 1380 and 1450.
- Fallow is part of the cultivated land and its share is not modelled (36 % in 1300, 40 % in 1380, 20 % in 1700 in
  table 1).
- "Best soil first" cannot be tested on England: without it England's numbers change by at most 3 kcal, those of the
  regions by up to 13 % (Persia, Scandinavia, Levant). The index has a 5 arc-minute grid.
- Land that is not arable has no use yet (no pasture, woodland, livestock).
- Not opened: the HYDE 3.3 grids and country values (the data server blocks automated access), the per-capita
  cropland by country (Klein Goldewijk et al. 2017, Journal of Land Use Science), the grids of Kaplan et al. 2009 and
  Pongratz et al. 2008. The comparison uses the printed table 2 of HYDE 3.2 and the grids of HYDE 3.2.1 for 1300 and
  1400 only.

**Sources** (all opened on 14 November 2026)
- Broadberry et al. (2010), as above: table 1 (arable land use), table 19, method pp. 5–6.
- Klein Goldewijk, K., Beusen, A., Doelman, J., Stehfest, E. (2017). Anthropogenic land use estimates for the
  Holocene – HYDE 3.2. Earth System Science Data 9, 927–953.
  https://essd.copernicus.org/articles/9/927/2017/essd-9-927-2017.pdf (sect. 2.3.1, eq. 1, table 2, sect. 5)
- Pongratz, J., Reick, C., Raddatz, T., Claussen, M. (2008). A reconstruction of global agricultural areas and land
  cover for the last millennium. Global Biogeochemical Cycles 22, GB3018.
  https://pure.mpg.de/pubman/item/item_994221_6/component/file_1786333/gbc1508.pdf
- Kaplan, J. O., Krumhardt, K. M., Zimmermann, N. (2009). The prehistoric and preindustrial deforestation of Europe.
  Quaternary Science Reviews 28, 3016–3034. https://doi.org/10.1016/j.quascirev.2009.09.028
- Kaplan, J. O. et al. (2017). Constraining the deforestation history of Europe. Land 6(4), 91.
  https://doi.org/10.3390/land6040091
- Klein Goldewijk, K. (2017). Anthropogenic land-use estimates for the Holocene; HYDE 3.2 (data set, release
  3.2.1). DANS. https://doi.org/10.17026/dans-25g-gez3 (baseline scenario; cropland and population count for 1300
  and 1400; the archive page states CC0 1.0, the readme of the data set CC BY 3.0)
- Klein Goldewijk, K. (2023). HYDE 3.3. Utrecht University. https://doi.org/10.24416/UU01-67UHB4 (catalogue page only)

## 3. England as one national economy

Direction: on 15 November 2026 Ramon asked for the state-of-the-art system itself instead of further regional
features, and chose his own Rust port of BeforeIT.jl as its engine ("Ja, Port als Motor", 08:07 UTC). Feature 3 was
proposed with two trial runs outside the game and agreed by him the same day ("Ja, so bauen", 08:47 UTC). Proposal and
result for Ramon (German): https://claude.ai/artifact/HMoTEyc5UXQKuh2J4hkJPk. Player wiki:
docs/wiki/wirtschaft/volkswirtschaft-england.md.

**What it is.** England runs in the world as one national economy. It is computed by the unchanged port
(github.com/ramonfueglister/port-beforeit, commit 7291531, Apache-2.0) of BeforeIT.jl (Banca d'Italia, commit
0926398), the implementation of the agent-based model of Poledna, Miess, Hommes and Rabitsch (2023): persons, firms
in sectors, a bank, a central bank, a government and the rest of the world, each with a balance sheet, meeting on the
markets for credit, labour and goods; stock-flow consistent (online appendix, equations A.1 to A.84). One period of
the model is one year of the game, computed on 1 January. The model is calibrated on England in 1356, the start year
of the world, at the scale 1:100. Not a line of the port is copied or changed, and no rule is written in the game.

**What it is not.** No link to harvest, cultivated land or the people of the places; no second country and no trade
between countries; nothing a player does reaches it; none of the deviations below is corrected.

**How the port is built in.**
- `economy/` is a small Rust crate with the port as a dependency pinned to the commit. It does four things: create a
  model from parameters, compute periods (the port's `run`), hand out key figures, save and load the state. The port
  has no save format; `economy/src/state.rs` writes every field of the model (all are public) and the state of its
  random number generator, taking each struct apart without `..`, so a change of the port's fields stops the build.
- The crate is built to one WebAssembly file (0.66 MB) that the world server loads (Node 22, no second process, no
  native code). `server/Dockerfile` builds it in a Rust stage; `npm run economy:build` builds it locally. The compiler
  is fixed (`economy/rust-toolchain.toml`, 1.88.0).
- The engine keeps nothing between calls (`src/sim/economy/engine.ts`): the state of the economy is 1.7 MB of bytes
  in the state of the world (`state.economy.england`, state version 4), a period takes the bytes and gives new ones.
  So the period is a function of the state like every other system, the snapshot holds the whole economy, and its
  hash covers it. The economy draws from the port's own generator (xoshiro256**), seeded with the seed of the world.
- `src/sim/systems/economy.ts` is the system: one period on the first day of each year. A world saved by an older
  build gets the economy when it is loaded, with the years it has already seen (`src/sim/upgrade.ts`); the result is
  the economy of a world that had it from its first day. A world that does not start in 1356 has no economy.
- If the engine cannot compute a year (a rule of the port fails, or the year ends without a GDP), the economy stands
  still from then on with the state of the year before and the reason; the world goes on. This did not happen in any
  run.
- The licence text and the NOTICE of the port are in `economy/THIRD_PARTY/port-beforeit/`.

**Calibration.** The port computes its parameters from national accounts (its `src/calibration.rs`). The table
`data/economy/england_1356.json` holds every input with its source, or marked as an assumption;
`tools/sim/economy_calibration.ts` applies the port's formulas and `npm run economy:calibrate` writes
`public/data/economy_england.json` (the port's `Parameters` and `InitialConditions`). A test fails if the file no
longer follows from the table. Three sectors (agriculture, industry, services); amounts in pounds of 1356.

| Input | 1356 | Source |
|---|---|---|
| GDP at current prices | £4.52 m | Bank of England, Millennium of macroeconomic data v3.1, sheet A1 (Broadberry et al.) |
| People | 2.583 m | same, sheet A1 |
| Value added: agriculture / industry / services | 45.5 / 28.8 / 25.7 % | Broadberry, Campbell, van Leeuwen (2013), table 7A, 1381 |
| Labour force: agriculture / industry / services | 57.2 / 19.2 / 23.6 % | same, table 7B, 1381 |
| Participation of men / women | 97.1 / 43.0 % | same, pp. 13–14 (rates of the 19th century, carried back by the authors) |
| Shares of income: wages / land rent / other capital / house rent | 61.0 / 16.5 / 21.6 / 0.9 % | Clark, workbook of 2015, sheet Decadal, 1350–59 (ratios only) |
| Interest | 7.5 % | Clark, Microbes and Markets, table 7: 1340s, one transfer; no observation for the 1350s, 5 % in the 1370s; fn. 15: 6 to 8 % in the mid-century |
| Revenue of the crown (nine-year mean) | £105,544 | Bank of England workbook, sheet A26 (O'Brien and Hunt) |
| Coin in circulation | £1.107 m | same, sheet A22 (Palma) |
| Wool exports | 32,666 sacks at £4.05, duty 40 s a sack | Munro (2011), tables 1 and 14, 1356–60 |
| Cloth exports | 9,061 cloths | Munro (2011), table 1, 1356–60 |
| Real GDP, deflator, revenue, export volume before the start | 1280 to 1356, annual | Bank of England workbook, sheets A1 and A26 |

Derived: value added = GDP minus the wool duty (the model's one tax on products); capital = capital income / interest
(2.8 years of GDP); dwellings = house rents / interest; the crown spends its revenue; direct tax = revenue minus
duty; household consumption = what is left of each sector's supply; AR(1) of crown spending and exports by the
port's formula on the series 1281 to 1356. Land rent has no place in the model and is part of the firms' profit.

Without a source (assumptions, marked as such in the table; none is a statement about history):

| Input | Value | What exists |
|---|---|---|
| Output per intermediate input, by sector | 4 / 2.5 / 5 | earliest input-output table 1841 (Horrell, Humphries, Weale 1994), paywall |
| Who supplies whom (3 × 3) | set | same |
| Persons per firm | 4 | social table c. 1290 (Campbell 2008), paywall |
| Share of the people aged 15 and over | 62 % | poll tax of 1377, not read |
| Unemployed at the start | 1 person | none |
| Depreciation | 2.5 % a year | none |
| Imports | as high as exports; 30 / 70 / 0 | import series only from 1560 |
| What the crown buys | 20 / 30 / 50 | none |
| What is invested (firms; dwellings) | 30 / 60 / 10; 0 / 100 / 0 | none |
| Coin of households / firms | 80 / 20 | none |
| Equity of the bank | 5 % of the coin | none |
| Rest of the world | constant | none |
| Behaviour (repayment 5 %, bank rules, utilisation 85 %, firm sizes) | values of the original | none for the 14th century |
| Value of a cloth in 1356–60 | £1.751 | Munro's table 8 starts in 1371; its value for 1371–75 |

Switched off by parameters: value added tax, social insurance, corporate tax and the other taxes of the model (0),
unemployment benefit (rate 1e-9; the port divides by it), pensions (0), Taylor rule (policy rate fixed at 0; the loan
rate is the interest above), shocks to output abroad and imports (1e-12).

Scaled 1:100: GDP £45,248, 25,832 people, labour force 11,219 (8,415 employees in 2,804 firms, their owners, one
bank owner, one person without work), coin £11,067.

**Model against history (`npm run economy:check`; nothing tuned).** 20 worlds of the game from 1356 to 1420, run day
by day (seeds 1356 to 1375; the running world has seed 1356); all 20 computed every year. History: real GDP and GDP
deflator of Broadberry et al. (Bank of England workbook, sheet A1; `data/economy/england_after_1356.json`).

| Real GDP | Model (mean of the worlds) | Range of the worlds | History |
|---|---|---|---|
| Mean growth a year | +0.06 % | −0.36 % to +0.25 % | −0.14 % |
| Standard deviation of annual growth | 5.0 % | 3.5 % to 6.6 % | 6.7 % |
| Lowest year (1356 = 100) | 86 | 73 to 100 | 77 |
| Highest year | 118 | 116 to 119 | 110 |
| Mean level of all years | 106.0 | 95.9 to 113.7 | 92.8 |
| Level in 1420 | 104 | 80 to 117 | 91 |

| Price level of GDP | Model (mean of the worlds) | Range of the worlds | History |
|---|---|---|---|
| Level in 1420 (1356 = 100) | 292 (median 79) | 17 to 1,410 | 96 |
| Standard deviation of annual inflation | 9.9 % | 7.8 % to 11.7 % | 8.4 % |

| Share of real GDP | At the start | Mean of all years and worlds |
|---|---|---|
| Household consumption | 88.8 % | 88.9 % |
| Crown | 2.3 % | 2.1 % |
| Investment | 7.4 % | 7.4 % |
| Exports (with duty) | 4.7 % | 4.4 % |
| Imports | 3.3 % | 2.9 % |
| Without work (share of the labour force) | 0.01 % | 1.14 % (highest year 14.5 %) |

| Year | History | Model, mean | Model, world 1356 |
|---|---|---|---|
| 1356 | 100 | 100 | 100 |
| 1364 | 103 | 106 | 116 |
| 1372 | 85 | 109 | 113 |
| 1380 | 90 | 108 | 116 |
| 1388 | 92 | 108 | 111 |
| 1396 | 94 | 104 | 113 |
| 1404 | 94 | 104 | 110 |
| 1412 | 85 | 105 | 110 |
| 1420 | 91 | 104 | 117 |

Reading: real GDP stays in a band like the historical one, but about 14 % higher on average (firms start at 85 %
utilisation and fill up within a few years, ceiling about 118), it does not fall with the population (the model's
population is fixed), and the price level has no anchor (some worlds inflate, some deflate).

**Differences from the trial run of the proposal.** The proposal's table for 1356 still used the exports and the
interest of 1381. The build uses the values of 1356 throughout: exports of 1356–60 (£148,165 instead of £137,351 at
full scale), interest 7.5 % instead of 5 %, and the value of a cloth as a marked assumption (a thirteenth gap). Value
added is GDP minus the duty, so the model starts at the GDP of the source (the trial started 1 % above it). The
series handed to the model end in 1356 (the trial handed over twelve later years, which the port does not read).
With these the proposal's +0.17 % growth, level 109.0 and price level 294 became +0.06 %, 106.0 and 292.

**Tests.** `economy/tests/shell.rs` (cargo test): the shell computes what the port computes directly; a state loads
bit for bit, also with removed agents and with NaN; save, load, continue equals a straight run; broken bytes are
refused; the accounting identities hold. `tests/economy.test.ts`: the calibration follows from the table and
balances; the WebAssembly engine gives bit for bit the figures of the native build (25 years, two seeds); the
accounting identities of the port hold every year; one period per year in the world; snapshot, hash and upgrade of
an older world; a year change replayed from the command log and resumed from disk; the view of a place; the
standstill. The server image was built with the Rust stage and started; its engine gave the same states over 64
years as the local build.

**Limits (none is addressed by this feature).**
- No land and no harvest: firms produce from labour, capital and inputs (Leontief, A.13). The rise of income per
  head after the Black Death cannot come out of the model.
- Persons have no family: who does not work lives on transfers in the model. So the model's persons are the labour
  force; children and the old are in their consumption. This mapping is ours, not from a paper.
- Institutions England did not have are parameters set to zero, not removed.
- One bank; the coin is deposits with it. How much credit there was is not measurable (Palma 2016, p. 22).
- One country, one market, no space. The rest of the world is a series, not a country.
- Fixed population; firms as today (an owner and employees, sizes by a power law; every firm needs an employee);
  behaviour of today's banks and firms.
- The period is a year; the original computes quarters.
- The price level has no anchor with the central bank switched off.
- Thirteen inputs have no source. In the trial run they moved the mean level of GDP between 104 and 109.
- Clark and Broadberry disagree on levels (national income of the 1380s £8.5 m against GDP £4.0 m); only Clark's
  ratios are used.

**Sources** (all opened on 15 November 2026)
- Poledna, S., Miess, M. G., Hommes, C., Rabitsch, K. (2023). Economic forecasting with an agent-based model.
  European Economic Review 151, 104306.
- port-beforeit, commit 7291531, https://github.com/ramonfueglister/port-beforeit, a port of
  bancaditalia/BeforeIT.jl at commit 0926398 (both Apache-2.0). Read: src/calibration.rs, agents.rs, params.rs,
  firms.rs, aggregates.rs, rotw.rs, data.rs, lib.rs.
- Broadberry, S., Campbell, B., van Leeuwen, B. (2013). When did Britain industrialise? Explorations in Economic
  History 50(1), 16–27. Manuscript:
  https://pureadmin.qub.ac.uk/ws/portalfiles/portal/1640964/EEH_Sectoral_shares_paper.pdf (tables 7A, 7B, pp. 13–14)
- Thomas, R., Dimsdale, N. (2017). A millennium of macroeconomic data for the UK, version 3.1. Bank of England.
  https://www.bankofengland.co.uk/statistics/research-datasets (sheets A1, A22, A26; no open licence: only single
  values are in the repository)
- Clark, G. (2015). National income, prices, wages, land rents, population, England, 1209–1869 (workbook, sheet
  Decadal). https://faculty.econ.ucdavis.edu/faculty/gclark/data.html
- Clark, G. Microbes and markets: was the Black Death an economic revolution? Manuscript:
  https://scispace.com/pdf/microbes-and-markets-was-the-black-death-an-economic-gecu8oa7fi.pdf (table 7, p. 34;
  p. 32)
- Munro, J. H. (2011). Statistical tables on medieval and early-modern textiles.
  https://www.economics.utoronto.ca/munro5/MedTextileStats.pdf (tables 1, 8, 14)
- Palma, N. (2016). Reconstruction of annual money supply over the long run: the case of England, 1279–1870. EHES
  Working Paper 94. https://www.ehes.org/wp/EHES_94.pdf (p. 22)
- Not opened (paywall), only seen cited: Horrell, Humphries, Weale (1994), Economic History Review 47(3); Campbell
  (2008), Economic History Review 61(4); Broadberry et al. (2015), British Economic Growth 1270–1870.
