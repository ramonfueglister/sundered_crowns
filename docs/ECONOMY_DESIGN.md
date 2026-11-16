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

Ramon, 15 November 2026, on the economy after feature 4: less work on sources, more code and clean tests for the
economic system. And the shape of the system: every city is an economy of its own with all its parts (what the model
calls a country is a city before modern times), and the cities are connected through their foreign relations.

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
| 3 | England as one national economy, computed by the port of BeforeIT.jl | agreed by Ramon 15 Nov 2026 and built as proposed; in the running world since 15 Nov 2026. Replaced in the game by feature 5: the port, the calibration table and its sources stay |
| 4 | England's economy computes every day | agreed by Ramon 15 Nov 2026 and built as proposed. It never ran in the world as England's clock: feature 5 took its place before the world server was redeployed, and the daily clock is now the clock of every city |
| 5 | Cities as economies of their own that trade with each other | direction given by Ramon 15 Nov 2026; that the cities replace England's economy in the game decided by him the same day ("Ja, Städte ersetzen England", 17:15 UTC). Built; in the running world once the world server is redeployed. Over decades the linked cities sank (section 5); feature 6 mends it |
| 6 | The cities pay the model's unemployment benefit | agreed by Ramon 15 Nov 2026 for the time being ("das kannst du gerne einstellen für den moment", 19:29 UTC). Built; in the running world together with feature 5 once the world server is redeployed |
| 7 | The cities pay wages in money | agreed by Ramon 16 Nov 2026 ("Ja, Lohn in Geld bauen", 07:05 UTC): only this, the price rule and the unemployment benefit stay. Built on the branch of features 5 and 6; not in the running world |

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

Feature 4 (below) changed the period of the model from a year to a day. This section describes the build of feature
3 as it was: where it says "one period a year", "computed on 1 January" or gives yearly figures of the game, feature
4 has replaced it. The port, the calibration table, its sources and the limits stay as described here.

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
unemployment benefit (rate 1e-9; the port divides by it; switched on for the cities of the game by feature 6),
pensions (0), Taylor rule (policy rate fixed at 0; the loan
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

## 4. England's economy computes every day

Feature 5 (below) replaced England's economy in the game by the economies of the cities. The daily clock of this
section is the clock of every city, unchanged. The check against history below was measured for England as one
economy; it has not been repeated for the cities. `npm run economy:check` now computes the cities.

Direction: on 15 November 2026 Ramon set the priority ("mich interessiert weniger die perfekte geschichte als das
perfekte wirtschaftssystem sota 2026 agentbasiert nach papers und modellen. und ja tägliches rechnen", 12:22 UTC).
Feature 4 was proposed with trial runs outside the game and agreed by him the same day ("Ja, so bauen", 13:10 UTC).
Proposal and result for Ramon (German): https://claude.ai/artifact/Kg3HJCK3K6VwKSVs21U1SE. Player wiki:
docs/wiki/wirtschaft/volkswirtschaft-england.md. The trial programs are kept outside the repository (project files,
wirtschaft/feature-4-tagestakt).

**What it is.** One period of the model is one day of the game instead of one year. Every day goods are made and
bought, wages are paid, the crown and the rest of the world buy, and the books are closed, by the unchanged rules of
the port with the amounts of a day. Two rules of the port are replaced, through the port's own mechanism for model
types (its `Extension` trait, `src/extension.rs`); the port stays pinned at commit 7291531 and not a line of it is
changed or copied. The calibration is the one of feature 3, turned from the year into the day.

**What it is not.** No new agents, goods or markets; no seasons (every day is like every other); no link to harvest,
cultivated land or the people of the places; no second country; nothing a player does reaches it.

**Why two rules had to be replaced.** The port's rules know no length of a period, but the period is also the speed
of behaviour: every firm sets its supply to the demand of the period before, in every period, and lays off at once.
Run unchanged with a day as the period, the economy swings 2.5 times harder than with a year, and in the worst trial
world 31 % were without work at times (table of the trial runs below). So a day as the period needs a statement
about how often an agent decides.

**The two rules** (`economy/src/clock.rs`, the model type `DailyClock`).

1. *Plan day.* Every firm has its own plan day, the firms spread evenly over 30 days in their order (firm i plans
   when day − 1 ≡ i mod 30; on the first day all firms plan). Only on that day it sets its supply and its price, by
   the port's rule (A.5, A.8, A.9):

   Q_s,i = mean demand per day since its last plan × (1 + γ_e)^30,  P_i ← P_i × (1 + π_c,i) × (1 + π_e)^30

   with π_c,i the cost push of the port's rule and γ_e, π_e the growth and inflation expected per day. On the other 29
   days the firm keeps both. Employment, materials and investment follow from the supply as in the port (A.14, A.18,
   A.22).
2. *Expectations.* Growth and inflation are expected as in the port (an AR(1) forecast with a random shock, A.6, A.7,
   A.10), but on sums over windows of 365 days that end today (the last 365 days, the 365 days before them, and so
   on; each of the 76 yearly values of the history before 1356 stands for 365 days). The result is expressed per
   day.

With a plan every day and windows of one day both rules are the port's rules: the engine then computes the port's
numbers bit for bit (tested).

**Where the rules come from.**
- The timing is that of Eurace@Unibi (Dawid, Gemkow, Harting, van der Hoog, Neugart 2011, user manual): the clock is
  the day, a firm acts "monthly on the ideosyncratic day of the month to act" (section 2.3), "Firms perform the
  following activities on a monthly base" (section 4.1.1), and the malls report "at the end of each day". A month is
  taken as 30 days.
- The rules themselves are the port's (Poledna et al. 2023). I found no paper that runs the model of Poledna et al.
  on a daily clock: the combination of its rules with the timing of Eurace@Unibi is ours and is marked as such here.
- Expectations stay on yearly sums because the sources of 1356 are yearly (Wiese et al. 2024, section 3.4, choose
  their period "based on the timefrequency of the data sources we use"). It is also what the trial runs demanded:
  with expectations on windows of 30 days all 5 trial worlds stopped after 141 to 183 days, with windows of 90 days
  after 342 to 1,021 days (prices exploded). My reading, not shown one by one: a history made of yearly values is
  smooth within a year, so the estimated inflation follows every movement in full.
- Without a source and marked as our own: the window of 365 days as such, the plan day by the order of the firms,
  all firms planning on the first day, and three of the seven conversions below.

**From the year to the day** (`dailyEconomy` in `tools/sim/economy_calibration.ts`; the table of sources
`data/economy/england_1356.json` is unchanged but for the two entries of the clock: 365 days a year, an assumption,
and 30 days between two plans, from Eurace@Unibi).

| Quantity | Year | Day | Rule | Where the rule comes from |
|---|---|---|---|---|
| Flows: output per employee, output per capital, depreciation, wage | yearly value | yearly value / 365 | flows times the time scale | the port, `src/calibration.rs` |
| Interest | 7.5 % | 0.0198 % | (1 + interest)^(1/365) − 1 | the port, `src/calibration.rs`, lines 697 to 706 (year to quarter there) |
| Share of a loan repaid | 0.05 | 0.000137 | share / 365 | the form of Pichler et al., footnote 15 |
| Purchases of the crown, AR(1) | persistence 0.952, spread 0.168 | 0.999866 and 0.00902 | α^(1/365); the same long-run mean and the same variance of the level | our own conversion |
| Exports, AR(1) | persistence 0.371, spread 0.331 | 0.997287 and 0.0262 | as above | our own conversion |
| History before 1356 | 76 yearly values | 76 values, each standing for 365 days | every day of a year = the yearly value / 365 | our own |
| Plan of a firm | did not exist | every 30 days | an own day per firm, monthly | Eurace@Unibi, manual of 2011 |

Shares and stocks stay as they are (propensity to consume, tax rates, dividend share, capital rules, deposits,
capital, the people).

**How it is built.**
- `economy/src/clock.rs` holds the model type and what it adds to a model: per firm the demand since its last plan
  and the number of those days, the plan period and the window. `economy/src/lib.rs` builds the port's model with it;
  `economy/src/state.rs` saves it with the model (format 2). The crate uses `libm` for logarithm, exponential and
  power, as the port does, so the native and the WebAssembly build agree bit for bit.
- Key figures (`figures`, 16 numbers): GDP and its uses are sums over the last 365 days (while fewer days are
  computed, the starting position fills the rest), the persons and the deposits are those of today, and the new 16th
  figure is the price level of today (the port's price index of the day, `P_bar`: the prices of all firms weighted
  with what they made today).
- The accounts of the port (one row of 40 numbers per period) are kept for the last 365 days only: the shell drops
  older rows after each step, which needs no change of the port (item 6 of the proposal). The figures of each
  calendar year are kept as a row of `years` in the state of the world, written before 1 January is computed. Still
  growing: the port's series of GDP and inflation, 16 bytes a day (5.8 kB a game year).
- `src/sim/systems/economy.ts`: one period for each day of the world. State version 7 at the time (the cities are
  version 8 now, section 5). A world saved by an older
  build (the running world, state version 6) is upgraded when it is loaded: England starts again from the starting
  position of 1356 and computes every day the world has seen (`src/sim/upgrade.ts`); the result is the economy of a
  world that had the daily clock from its first day, and the yearly figures shown before are gone. If a day cannot
  be computed, the economy stands still with the state of the day before and the date and reason.
- The place panel "Volkswirtschaft England" shows the sums of the last 365 days up to today and the price level of
  today, and asks for them again on every new day. The two new fields of the protocol are optional, so a client and
  a server of different builds understand each other.
- Measured in the game (this sandbox, one core): a day takes 6.3 ms in the engine and 10.5 ms in the world (the
  1.8 MB of state go into the engine and come back every day); the world's day lasts 240 s. The state of the economy
  is 1.74 MB at the start and 1.90 MB after 2,800 days.

**Rehearsal of the upgrade.** A world of the build before (main with the genes of the persons, state version 6) was
run for 2,800 days with a player, saved, and resumed by this build: the upgrade took 19.0 s (the catch-up of 2,800
days), and the resumed world has the same hash as a world of this build run for 2,800 days from its first day.

**Trial runs of the proposal** (outside the game; 5 worlds, seeds 1356 to 1360, 30 years each from the calibration
of 1356; growth, standard deviation and mean are means of the worlds, the worst value is that of the worst world,
the price level is the range of the worlds).

| Variant | Growth a year | Sd of annual growth | Without work, mean | Without work, worst | Price level in year 30 (start 100) |
|---|---|---|---|---|---|
| Yearly model (feature 3) | +0.28 % | 4.0 % | 0.48 % | 8.8 % | 23 to 594 |
| Port unchanged, period a quarter | −0.03 % | 3.0 % | 2.33 % | 15.4 % | 35 to 500 |
| Port unchanged, period a month | −0.47 % | 5.1 % | 8.05 % | 27.3 % | 3 to 353 |
| Port unchanged, period a day | +0.10 % | 10.0 % | 3.70 % | 30.5 % | 54 to 256 |
| **Daily clock, plan every 30 days (built)** | +0.43 % | 2.1 % | 0.02 % | 2.1 % | 124 to 143 |
| Daily clock, plan every 90 days | +0.43 % | 1.3 % | 0.00 % | 1.2 % | 115 to 180 |
| Daily clock, plan every 365 days | +0.23 % | 0.8 % | 0.23 % | 5.6 % | 121 to 241 |

**Model against history (`npm run economy:check`; nothing tuned).** 20 worlds of the game over 64 years from 1356,
run day by day (seeds 1356 to 1375; the running world has seed 1356); all 20 computed every day. A year of the model
is the sum of the 365 days up to 31 December; the starting position stands for 1356, so the model after t years is
set against the history of 1356 + t. History: real GDP and GDP deflator of Broadberry et al. (Bank of England
workbook, sheet A1; `data/economy/england_after_1356.json`). The yearly model of feature 3 is in its section above.

| Real GDP | Model (mean of the worlds) | Range of the worlds | History |
|---|---|---|---|
| Mean growth a year | +0.17 % | −0.03 % to +0.25 % | −0.14 % |
| Standard deviation of annual growth | 2.1 % | 1.0 % to 2.7 % | 6.7 % |
| Lowest year (start = 100) | 100 | 96 to 100 | 77 |
| Highest year | 118 | 116 to 119 | 110 |
| Mean level of all years | 113.6 | 110.3 to 115.5 | 92.8 |
| Level after 64 years | 112 | 98 to 117 | 91 |

| Price level of GDP | Model (mean of the worlds) | Range of the worlds | History |
|---|---|---|---|
| Level after 64 years (start = 100) | 171 (median 163) | 113 to 252 | 96 |
| Standard deviation of annual inflation | 0.9 % | 0.6 % to 1.4 % | 8.4 % |

| Share of real GDP | At the start | Mean of all years and worlds |
|---|---|---|
| Household consumption | 88.8 % | 88.6 % |
| Crown | 2.3 % | 1.8 % |
| Investment | 7.4 % | 7.4 % |
| Exports (with duty) | 4.7 % | 4.1 % |
| Imports | 3.3 % | 2.0 % |

| The days | Mean of the worlds | Range of the worlds |
|---|---|---|
| Days on which the price level of the day moves | 100.0 % | 100.0 % to 100.0 % |
| Price level of the last day (start = 100) | 172 (median 164) | 114 to 256 |
| Without work, mean of all days (share of the labour force) | 0.03 % | 0.00 % to 0.28 % |
| Without work, the worst day | 1.3 % | 0.0 % to 7.0 % |

| Years after the start | History (1356 = 100) | Model, mean | Model, world 1356 |
|---|---|---|---|
| 0 (1356) | 100 | 100 | 100 |
| 8 (1364) | 103 | 114 | 117 |
| 16 (1372) | 85 | 115 | 118 |
| 24 (1380) | 90 | 115 | 114 |
| 32 (1388) | 92 | 114 | 118 |
| 40 (1396) | 94 | 114 | 117 |
| 48 (1404) | 94 | 114 | 117 |
| 56 (1412) | 85 | 113 | 118 |
| 64 (1420) | 91 | 112 | 114 |

Reading:
- Real GDP rises to the ceiling of about 118 within a few years, as in the yearly model, and then stays close to it:
  the mean level of all years is 113.6 (yearly model 106.0, history 92.8). The daily economy is further above
  history than the yearly one, because it has almost no downturns.
- It is much calmer than history: annual growth spreads by 2.1 % (history 6.7 %, yearly model 5.0 %), annual
  inflation by 0.9 % (history 8.4 %, yearly model 9.9 %). The 2.1 % is what the trial of the proposal showed.
- The price level still has no anchor, but it no longer runs away: after 64 years it stands at 113 to 252 in the 20
  worlds (yearly model 17 to 1,410, history 96). It rises in every world.
- Almost nobody is without work: 0.03 % of the labour force on the mean of all days; the worst day of the worst
  world had 7.0 % (the trial of the proposal, 5 worlds over 30 years: 2.1 %).
- The price level of the day moved on every day of every world. It is the port's index, weighted with the output of
  the day, so it also moves when only the quantities move; about 93 firms set a new price each day.
- Imports fall from 3.3 % to 2.0 % of real GDP (yearly model 2.9 %); the crown and exports fall by about as much as
  GDP rises. Why imports fall further than in the yearly model was not traced.

**Differences from the trial program of the proposal.** The plan day of a firm is its place in the order of the
firms (i mod 30) instead of a hash of it; the power is the one of `libm` instead of the standard library's; the
history is kept as 76 yearly values that each stand for 365 days instead of 27,740 daily values (the same windows).
With the trial program set to the same plan days and the same power, the engine gave the same employees, people
without work and deposits of households and firms on each of 401 days. The numbers of the game above are measured
again and are not those of the trial.

**Tests.** `economy/src/clock.rs` and `economy/tests/shell.rs` (cargo test, 15 tests): with a plan and a window of
one period the engine computes what the port computes; a firm sets supply and price only on its plan day, as the
mean demand times the expected growth; the accounts keep the rows of one window and the figures are their sums; one
call for many periods equals many calls; a state loads bit for bit and continues as if it had never stopped; the
clock stops when it does not hold every firm; the accounting identities hold. `tests/economy.test.ts` (36 of the 774 tests of the game): the
daily calibration follows from the yearly one by the rules above; the WebAssembly engine gives bit for bit the
figures of the native build (65 days, two seeds, and 10 periods with the clock of the port); the identities hold
every day; the same seed gives the same world; one period a day in the world; many days at once equal the days one
by one; the row of a year; save in the middle of a month, load and continue; the upgrade of a world with the yearly
economy; the days replayed from the command log of the world server and resumed from disk; the view of a place; the
standstill with its date.

**Limits (none is addressed by this feature).**
- The combination of the port's rules with a daily clock is not from a paper (see above).
- Calmer than history and further above it: annual growth spreads by 2.1 % (history 6.7 %), the mean level of GDP
  is 113.6 (history 92.8). Nothing was tuned to close the gap.
- Almost always full employment (0.03 % without work): the economy runs close to its capacity, and the port's labour
  market fills a vacancy on the same day.
- No seasons: every day is the same; the harvest of feature 1 is not connected.
- The price level still has no anchor; it rises in every world, in a narrower band than in the yearly model.
- The random part of the expectations is drawn anew every day and reaches only the firms that plan on that day; in
  the yearly model it reached all firms at once.
- The yearly sums of exports and of the crown's purchases spread somewhat less than in the yearly model, because the
  conversion matches the level of a day only.
- The model's year has 365 days; a leap day of the calendar is computed like any other day, so the row of a leap
  year holds its last 365 days.
- All limits of feature 3 stay (no land, no families, one bank, one country, fixed population, thirteen inputs
  without a source).

**Sources** (opened on 15 November 2026 unless noted)
- Dawid, H., Gemkow, S., Harting, P., van der Hoog, S., Neugart, M. (2011). The Eurace@Unibi Model: An Agent-Based
  Macroeconomic Model for Economic Policy Analysis. Model v1.0 User Manual. https://core.ac.uk/download/16690523.pdf
  (sections 2.3 and 4.1.1: the day as the clock, an own day of the month per firm, decisions monthly)
- Pichler, A., Pangallo, M., del Rio-Chanona, R. M., Lafond, F., Farmer, J. D. In and out of lockdown: propagation
  of supply and demand shocks in a dynamic input-output model. arXiv 2102.09608 (a step is a day; footnote 15: a
  quarterly quantity turned into a daily one). The journal version was not checked.
- Wiese et al. (2024). arXiv 2409.18760, section 3.4: the period follows the frequency of the data sources.
- CANVAS: Bank of Canada Staff Working Paper 2022-51,
  https://www.bankofcanada.ca/wp-content/uploads/2022/12/swp2022-51.pdf (equations 36 to 38: the price rule of the
  firms)
- port-beforeit, commit 7291531: `src/calibration.rs` (time scale of the flows, conversion of interest),
  `src/firms.rs` (the rule of the firms), `src/aggregates.rs` (expectations), `src/extension.rs` (rules that can be
  replaced).
- Not readable: Poledna et al. (2023) in the version of IIASA (barrier for automated readers) and Dawid et al.
  (2019) in the Journal of Evolutionary Economics (paywall). The equation numbers of the model of Poledna et al.
  are therefore those of the comments of the port.

## 5. Cities as economies of their own that trade with each other

Status: built in the engine and in the game. Ramon decided on 15 November 2026 (17:15 UTC, "Ja, Städte ersetzen
England") that in the game the largest cities each compute an economy of their own and trade with each other, and
that England's economy as one whole goes. In the running world once the world server is redeployed. Player wiki:
docs/wiki/wirtschaft/wirtschaft-der-staedte.md.

Feature 6 (below) switched the model's unemployment benefit on in the calibration of every city. The tables of the
game in this section ("Five years in the game", "Thirty years in the game" and what follows them) were measured
before that and are kept as the record of what was found; the figures of the game as it is now stand in section 6.

### What it is

Every city is a whole economy of the port: its own persons, firms, bank, crown and rest of the world, computed day by
day with the daily clock of feature 4. The rest of the world of a city is the other cities.

In the port the rest of the world is two random series: a demand for exports and a supply of imports, each drawn from
a rule of its own (A.76, A.81). Nothing connects them. A city on its own therefore sells goods to nobody and buys
goods from nowhere, and its claims on the rest of the world grow without anyone owing them (in the trial below: 10 %
of a year's output after five years). Exactly this one rule is replaced. Every other rule of a city is the port's.

### The merchants (economy/src/trade.rs)

Between the cities stand merchants. They are the foreign consumers and the foreign sellers that the port already has
in every economy; new is only what they want and what they bring.

1. What the merchants buy in a city on a day lies the next day at their stalls in the cities it was ordered for,
   product by product.
2. They sell at what the goods cost them, the export duty of the city of origin included. So their worth, money in
   all cities plus stock at cost, never changes: no money is made or lost between the cities.
3. In every city they want to have on offer every morning what the calibration of the city gives as its supply of
   imports, as a share of the city's output, product by product. An order placed today is bought tomorrow and on
   offer the day after, so they order what will be missing by then: the stock to keep minus what is left of today's
   stock if tomorrow sells the same part of it as today.
4. An order is split over the cities of origin as if the merchants picked a seller among the firms of the product
   in all other cities, with the weights of every buyer of the port (half by price, half by what the seller offers:
   its production plus its stock). A city has the weights of its firms. So it counts by the number of its firms and
   by what they offer, not by what it sells.
5. A city exports the products that are ordered from it. The mix of its exports, a constant of the calibration in
   the port, becomes the mix of the orders of the day.

Rules 3 and 5 are ours: the port has no linked economies, and no source was looked for (Ramon's direction above).
Travel takes one day between any two cities and costs nothing.

The port takes one model type per model, so the model type of the daily clock carries the link (economy/src/clock.rs).
An economy without merchants computes as before, number for number (tested against the port bit for bit with a
clock of one day).

One more rule of the port is touched for a reason of arithmetic: the port divides the exports of a day by the mean
price paid for them, which is 0 / 0 on a day without exports. Its own rule always exports, the merchants may not. On
such a day the model type sets that price to 1, so real exports are 0.

### Tests (economy/tests/cities.rs, 14 tests)

- The merchants' worth does not change, and for every product the goods bought equal the goods sold plus the goods in
  stock, day after day (both to better than 1e-12 of their size in the trial below).
- The books of every city balance as the port's identities demand (income, nominal and real GDP by uses, central
  bank, banks).
- What one city exports lies in the other the next day, at what it cost; the stall asks cost; a city's demand for
  exports and supply of imports are what the merchants ordered and hold.
- A stall is full again the morning after next when its orders were filled and it sells the same part of its stock.
- The merchants pick among the firms of the other cities as a buyer of the port does: the part of a city is the
  sum of the weights of its firms; it falls when its firms are dearer and rises when they offer more; what the city
  has sold does not count; firms that are alike count one by one; no city orders from itself.
- The order in which the cities compute changes nothing; the same cities give the same days; cities saved in the
  middle of a run and loaded continue as a straight run, bit for bit; broken bytes and cities that cannot trade are
  refused.
- A day without exports has real exports of 0 and a real GDP that is a number.

### Trial of the engine: the 30 cities for five years

Before the cities came into the game, outside it and with the first form of rule 4 (see "Rule 4 corrected" below) (economy/examples/cities.rs; calibrations and results in the project files under wirtschaft/staedte).
Every city is England's calibration of 1356 at the city's share of England's people: an assumption, no city has data
of its own. Seed 1356, plan every 30 days, windows of 365 days. All 30 cities together.

| After five years | On their own (the port's rule) | Linked, England's wool duty on all trade | Linked, no duty |
|---|---|---|---|
| Real output (start = 100) | 111.8 | 91.7 | 106.5 |
| Range over the cities | 84 to 118 | 76 to 103 | 100 to 114 |
| Price level (start = 100) | 104.7 | 149.7 | 104.9 |
| Without work, mean of the cities | 0.7 % | 7.7 % | 0.6 % |
| Without work, the worst city | 13.2 % | 20.5 % | 2.7 % |
| Exports, share of output | 4.8 % | 1.2 % | 2.7 % |
| Imports, share of output | 2.7 % | 0.9 % | 2.7 % |
| Claims of the cities on nobody | 10 % of a year's output | 0 | 0 |

Reading:

- The link closes the books. On their own the cities pile up claims that nobody owes; linked, exports of one city are
  imports of another, and without a duty both are the same 2.7 % of output.
- Without a duty the linked cities behave much like cities on their own, with less spread between them.
- England's calibration carries the wool duty of 1356, 44 % of the value of exports. Put on every trade between
  cities it makes imports that much dearer everywhere. In the model that is not a single step of the price level but
  lasting inflation (the firms' cost push looks at the prices paid, which stay above their own), and output falls.
  So the duty between cities has to be set with care when the cities come into the game; it is a lever that works.

Speed: one day of all 30 cities takes 13 ms in the native build (England alone in the world server: 6 ms); the
state of all 30 cities is 6.2 MB (England: 1.9 MB).

### In the game

**Which cities.** The cities of `src/sim/content/cities_1356.json` (the 30 largest of the world in 1356 after
Chandler, the places that have persons). Two of them, Texcoco and Tenayuca, lie in the same place of the map and are
one economy, so there are 29 economies. Together they have 2,572,165 people, by chance almost the people of England
in the table (2,583,180).

**Calibration of a city** (`data/economy/england_1356.json`, section `cities`; `tools/sim/economy_calibration.ts`,
`cityTable`). Two assumptions, both marked as such in the table (feature 6 adds a third, the unemployment
benefit; section 6):

1. Every city has the structure of England in 1356: England's table at the city's share of England's people. No city
   has data of its own. London (60,862 people) is 2.36 % of England: at the scale of 1 : 100 a real GDP of £1,066 a
   year, 266 working persons, 67 firms. Cairo, the largest: 1,527 working persons, 381 firms. All cities together:
   11,228 working persons, 2,791 firms, a real GDP of £45,055.
2. No duty between cities. England's wool duty is not put on trade between cities (the trial of the engine above
   shows what it does). The crown of a city then lives from the direct tax alone, and in the starting position a city
   imports as much as it exports (3.3 % of its output).

`npm run economy:calibrate` writes `public/data/economy_cities.json`; a test fails if the file does not follow from
the table.

**In the world** (`src/sim/systems/economy.ts`). The state of the world holds the state of all cities and of the
merchants as one block of bytes (`economy.cities.model`), the figures of every city, and one row of figures per city
for every calendar year that is complete. On every day of the world all cities compute one day. Every city has its
own seed, derived from the seed of the world and the place of the city. If the engine cannot compute a day, all
cities stop with the day before and the panel names date and reason; the world goes on.

**State version 8 and the running world.** A world saved with England's economy (version 7, the running world
since main took version 7 for the places and realms of the whole globe on 15 November 2026; older versions take
their steps first) founds the cities on the day it has reached: they start from the starting position of 1356 on
that day, and no past days are computed for them. England's state is dropped. (Computing the past would hold the
world server for minutes when it starts; the cities of a new world start on its first day.) Rehearsed with a world
of 400 days made by the build of main (fbdc9be, state version 7, 25,103 places): upgraded by this build to
version 8 in 0.03 s, 60 more days computed in 1.0 s with the books off by at most 6e-15, saved (6.3 MB) and loaded
again with the same hash, and both go on to the same state. (First rehearsed with a world of main c84e60b, then
version 6.)

**What a player sees.** The panel of a place with a city has the section "Wirtschaft der Stadt": real GDP of the last
365 days, its level against the start, the price level of today, consumption, the crown's purchases, investment,
exports to and imports from the other cities, persons with and without work, coin of households and firms; all at
1 : 100. Places without one of these cities show no economy (also the English places that showed England's).

**Protocol.** `PlaceDetail.cityEconomy` is a new optional field and the old field `economy` is gone, so a client
older than the server shows no economy instead of England's title over a city's numbers.

**Tests** (`tests/economy.test.ts`, 44 tests with feature 5; 47 with feature 6). The calibration of England (unchanged) and of the cities; the
WebAssembly build against the native build bit for bit with three cities; the books of the cities and of the
merchants; the cities in the world: one day per day of the world, the yearly rows, a year of books, many days at
once, snapshots, halting, the upgrade from versions 3, 6 and 7; what a player is told; the world server.

**Five years in the game** (`npm run economy:check 5 8`: 8 worlds of the game, seeds 1356 to 1363, every day
computed in all of them; with rule 4 as corrected below; before feature 6).

| All cities together, year 5 | Mean of the worlds | Range of the worlds |
|---|---|---|
| Real output (start = 100) | 104.3 | 100.2 to 107.7 |
| Price level of output (start = 100) | 104.3 | 103.6 to 105.5 |
| Exports = imports, share of output | 2.55 % | 2.25 % to 2.86 % |
| Without work, mean of all cities and days | 0.91 % | 0.33 % to 1.73 % |
| Without work, the worst city on its worst day | 5.6 % | 2.2 % to 10.0 % |
| City with the lowest output (its start = 100) | 97.8 | 91.7 to 103.5 |
| City with the highest output | 111.9 | 106.1 to 114.4 |
| Lowest price level of a city on the last day (start = 100) | 101.6 | 100.1 to 103.5 |
| Highest price level of a city on the last day | 108.0 | 106.7 to 111.3 |

The books (the identities of every city and the books of the merchants, once a month) are off by at most 9.8e-14
of the amount they are judged by.

**Rule 4 corrected (15 November 2026, after the first five-year tables).** The first tables showed the largest
cities falling behind (Cairo at 88.6 in the world of seed 1356). Traced in 8 worlds: the first form of rule 4 split
an order over the *cities* with the port's weights, half by price and half by size. The half by price gave every
city the same part, whatever its size. So Cairo was asked for 1.7 % of its output in the first year and the smallest
cities for 3.9 % (correlation of the export share with the logarithm of the people: -0.97), and the level of a city
after five years fell with its size (correlation -0.78). Now the merchants pick among the *firms* of the other
cities, which is the port's rule taken as it stands. Same 8 worlds, year 5:

| | First form (cities as sellers) | Now (firms as sellers) |
|---|---|---|
| Exports in year 1, Cairo / the smallest cities, share of output | 1.70 % / 3.9 % | 2.68 % / 3.1 % |
| Cairo, real output (mean of the worlds, lowest world) | 101.1, 88.6 | 105.2, 101.6 |
| Lowest city of any world | 82.1 | 91.7 |
| Spread of the cities' levels (standard deviation) | 5.6 | 3.4 |
| Without work, mean / worst city on its worst day | 0.88 % / 7.9 % | 0.91 % / 5.6 % |
| All cities, real output | 104.3 | 104.3 |

Two other forms were measured and dropped. Counting a city by its output in both halves took the bias away but made
a slump feed itself (a city that sells less is asked for less): 1.34 % without work, worst day 13.1 %. Counting a
city by what the merchants sell there (they buy where they sell) balanced the trade of every city but let the trade
of the large cities run down (Cairo from 2.6 % to 1.7 % of output in five years).

A smaller effect of size is left and now points the other way: the large cities stand at about 105, the small ones
at 102 to 103, with 0.3 % against 1.1 % without work. See the next point for one reason.

**Why trade shrinks.** Trade falls from 3.3 % of output in the starting position to 2.55 % in year 5. The orders of
the merchants are filled (99.9 %); it is the stalls that do not sell all they offer: 92 % of their goods in year 1,
84 % in year 5 (economy/examples/cities.rs prints both). In the port a buyer picks among the sellers of a product
half by price, and there the stall is one seller among all firms of the city, however much it offers. In Cairo (218
firms of the first product) the stall sells 70 to 80 % of its goods, in the smallest cities (31 firms) nearly all.
This is the port's goods market, untouched; England as one economy lost imports in the same way (section 4). So
small cities import a little more than they export and large ones the other way round.

**Thirty years in the game** (`npm run economy:check 30 4`: 4 worlds, seeds 1356 to 1359, every day computed;
before feature 6).

| All cities together | Year 5 | Year 10 | Year 20 | Year 30 | Range of the worlds in year 30 |
|---|---|---|---|---|---|
| Real output (start = 100), mean of the worlds | 102.8 | 101.9 | 100.1 | 97.1 | 74.8 to 110.6 |
| World of seed 1356 | 100.2 | 97.0 | 90.0 | 74.8 | |
| Exports = imports, share of output | 2.43 % | 2.17 % | 2.17 % | 2.19 % | 1.68 % to 2.63 % |

In year 30: price level 126.6 (124.1 to 129.5); without work 4.86 % as the mean of all cities and days of the 30
years (1.40 % to 10.60 %), the worst city on its worst day 23.8 % (13.3 % to 39.5 %); the lowest city at 78.2 of its
start (46.0 to 100.9), the highest at 112.5.

**Linked cities sank over decades; cities on their own did not.** (Before feature 6.) This is the finding that
matters for a world that runs for ever (a year of the game is a day of real time). Measured with the native build over 30 years
(economy/examples/cities.rs with the game's calibrations, every city with a seed of its own):

| After 30 years | Real output of all cities | Without work, mean of the cities | Cities below 80 |
|---|---|---|---|
| On their own (the port's rule), 2 seeds | 109, 107 | 2.5 %, 2.6 % | 1, 2 of 29 |
| Linked, rule 4 as now, 3 seeds | 100, 92, 87 | 6.4 %, 10.7 %, 15.6 % | 1, 8, 15 of 29 |
| Linked, first form of rule 4, 1 seed | 90 | 11.1 % | 8 of 29 |
| Linked, a city counted by its output, 3 seeds | 79, 96, 77 | 22.0 %, 9.9 %, 21.1 % | 16, 9, 17 of 29 |

A city that sinks stays down: in one run (of the form that counts a city by its output) a city stood at 20 % of
its starting output with half its people without work after 30 years. What binds there, read from the state of the
model in that run, is demand, nothing else: the bank could
lend (its room for loans is untouched), the capital stock is whole, materials are there. The firms plan less and
less because they sell less and less, their unsold goods pile up to weeks of output, their coin drains away, and
their prices go on rising all the while (to 126 with half the city out of work). The port's rules for that: a
firm sets its supply to its last demand (A.5) and its price to the old price times the change of its costs times
expected inflation (A.8); what it sells is not in the price rule. Its wage is a fixed real rate from the start, paid
times the price index of the households. So prices and wages can fall with costs and expected inflation, but
neither answers a slump: the model adjusts quantities. Persons
without work have no income in this calibration (no dole in 1356) and buy nothing, so a slump has nothing that
stops it.

Why the link does it, in the sums over all cities of one seed (linked: rule 4 as now):

| After 30 years | Coin of households and firms | Price level | Coin in goods | Coin of the firms | Unsold goods |
|---|---|---|---|---|---|
| Start | 11,019 | 100 | 100 | 2,204 | 0 |
| Linked | 10,436 | 125 | 76 | 1,106 | 1,224 |
| On their own | 18,169 | 126 | 131 | 1,765 | 633 |

Prices rise by about 0.75 % a year in both; the model has nothing that holds the price level (section 3). On its own
a city sells more to the port's rest of the world than it buys there, year after year, and is paid in coin that
comes from nowhere: the "claims on nobody" of the engine's trial. That coin keeps up with the prices. The merchants
closed that hole, as they were meant to; the coin of all cities together is now fixed, prices still rise, and what
the coin buys shrinks by a quarter in 30 years. Households keep their coin (they spend from income only), the firms
lose theirs.

So the merchants' rules are not the place to mend this. The first reading was that the closed system needs what
the open one got for nothing: something that anchors prices or lets coin grow or be spent. That reading was too
pessimistic. The cause lay in our own calibration: it had switched off the model's unemployment benefit, the one
rule of the model that keeps a person without work buying. With the benefit as the original code sets it, the linked
cities hold over 30 years although prices still rise and the coin is still fixed (section 6).

What the tables do not say: nothing here is checked against history, and the long runs are few (2 to 4 worlds).

**Speed and size.** One day of all 29 cities takes about 15 ms in the world server; a day of the world lasts
240 s. The state of the cities is 1.85 MB at the start and grows through the first year, while the daily accounts
of the last 365 days fill up, to about 6 MB; after that by 16 bytes per city and day (10.3 MB after 30 years in the
native build). A snapshot of the world after 60 days is 3.3 MB on disk.

### Limits

- Over decades the linked cities sank, one after another, and did not come back ("Linked cities sank over decades"
  above). Mended by feature 6 (section 6). What is left of it: the coin of the closed system does not keep up with
  its prices.
- All cities have England's structure and differ only in size and in their random numbers. Cairo is England with more
  people.
- The countryside is inside each city's economy (the calibration is that of a whole country); places that are not
  among the 30 cities have no economy. England's own places, York for one, had England's economy before and have none
  now.
- The cities are those of the whole map, so Texcoco in Mexico and Niani in Mali trade with Paris from one day to the
  next.
- The economies are not connected to the persons of the cities, to harvest and land, to realms or to anything a
  player does. The crown of a city is the model's government and no realm of the game.
- In a running world the cities start on the day of the changeover, from the starting position of 1356.
- No distance: every city is one day from every other, and carrying goods costs nothing.
- The port does not record exports product by product. What the merchants bought counts as bought in the mix they
  ordered.
- An order is filled only as far as the firms of the city of origin have goods to sell.

## 6. The cities pay the model's unemployment benefit

Status: built. Ramon agreed on 15 November 2026 (19:29 UTC): "das kannst du gerne einstellen für den moment. aber
historisch gab es ja kein arbeitslosengeld? wie würde die wirschaft dann immer noch gehen?" So it is set for the
time being, and what it stands for in 1356 is an open question of his (see "What it stands for" below). His
condition for mending the slump of section 5 (18:34 UTC): "das muss aber in einklang mit dem echten urcode und dem
paper passieren." In the running world together with feature 5 once the world server is redeployed; no state of a
running world changes with it, because feature 5 is not live yet. Player wiki:
docs/wiki/wirtschaft/arbeitslosengeld-der-staedte.md.

### What it is

One entry in the calibration of the cities. Not a line of the engine changes, and no rule is written in the game.

In the model a person without an employer is paid a part `theta_UB` of the last wage (Poledna et al. 2023, online
appendix, A.44 and A.53; `households_income_act` in src/households.rs of the port). The government pays it and adds
what it lacks to its debt (A.60, A.61; `gov_loans`). The original code calibrates the part as

    theta_UB = 0.55 · (1 − tau_INC) · (1 − tau_SIW)

(BeforeIT.jl; src/calibration.rs, line 1287 of the port): 55 % of the wage after tax and social insurance. The
calibration of England in 1356 (feature 3) had switched this off, because England had no such benefit. The cities of
the game now have it with the constant of the original code.

### Why

Section 5 found that linked cities sink over decades and stay down, and that what binds in a sunken city is demand
and nothing else. A person without work had no income in our calibration, bought nothing, the firms sold less and
laid off more. In the original this loop is cut by the benefit: a person who loses work goes on buying with a little
more than half the income. The cities on their own did not sink only because the port's rest of the world paid them
coin from nowhere; the merchants of feature 5 closed that, as they were meant to, and the missing benefit showed.

### Calibration (`data/economy/england_1356.json`, `tools/sim/economy_calibration.ts`)

| Entry | Value | Kind |
|---|---|---|
| `cities.unemployment_benefit` | 0.55 | assumption: the constant of the original code; no source for 1356 |
| `inputs.unemployment_benefit` (England's own table) | 0 | England had no such benefit; the model's benefit stays off there |

`cityTable` gives a city the value of `cities`. `unemploymentBenefit` computes from it:

- `theta_UB = 0.55 · (1 − tau_INC) · (1 − tau_SIW)` = 0.5362 in every city (direct tax 2.51 % of income, no social
  insurance).
- `w_UB`, the benefit of a person at the start. The original takes it from data (benefits paid, divided by the
  persons without work). No such data exist here, so it is the benefit on the mean wage of an employee of the city:
  London £1.77 a year at 1 : 100 (mean wage £3.30), a 365th of it per day. The port starts every person with the
  last wage `w_UB / theta_UB`, which is then that mean wage. This choice is ours.
- The income households spend from includes the benefits paid at the start, as in the original's calibration
  (disposable income with social benefits; src/calibration.rs, lines 1150 and 1282). The calibration has one person
  without work, so the propensity to consume of a city falls by the benefit of one person over the city's income:
  by 0.18 % in London, by 0.03 % in Cairo. Households then buy at the start what the accounts say, and the port's
  identities hold from the first day (without this the accounts of the starting position were off by the benefit of
  one person; a test found it).
- With a period of a day the benefit of the start is divided by 365, like the wage.

Nothing else of the calibration changes (a test compares every parameter of every city with the same city without
the benefit).

### What it stands for

No unemployment benefit existed in 1356, and the table says so. The entry is the model's own way of saying that a
person without wage work goes on eating: the model has no household that grows its own food, no family that feeds a
member, no alms. What a person without wage work lived on in a city of 1356 was not looked up in a source for this
feature. Two things in it are plainly not of 1356: the crown of the city pays, and the 55 % is the value of the
original code, made for an economy of today. Ramon's question of 19:29 UTC ("wie würde die wirtschaft dann immer
noch gehen?") is answered by the model only this far: without any income for persons without work it does not hold
(section 5), with the model's own rule it does (below). A support that is closer to 1356, such as a household living
from the harvest of its place, would be a link of our own between the model and the rest of the game and no longer
the paper's rule. That is a later feature and Ramon's to decide.

### Tests

`economy/tests/benefit.rs` (4 tests, on London of the game, read from the file the world server reads):

- The calibration of a city sets the rate of the original code, and every person starts with the mean wage as the
  last wage.
- On each of 400 days every person has the income of A.53 as the port computes it: the wage after tax with an
  employer, 55 % of that without; every person plans to buy; the books of the city balance.
- The control: the same city with the benefit switched off, as before this feature. A person without work has no
  income and a budget of nothing.
- The crown pays: after one day the debt of the crown with the benefit differs from the debt without it by the
  benefit of the one person without work (to 1 %).

`tests/economy.test.ts` (3 new tests, 47 in all): the rule of the original code in `unemploymentBenefit`, a rate of 0
and rates that are refused; every city has 55 % of the wage after tax, the benefit of a day on the mean wage, a
365th of the year's, and nothing else changed against the same city without the benefit; the table marks the entry
as an assumption and names the line of the original code; England's own calibration stays without the benefit. The
test of the books (three cities in WebAssembly, every day) covers the accounts of the first day.

The purpose itself, that no city sinks over decades, is not a unit test: 30 years of 29 cities take 100 seconds
natively and six minutes for four worlds of the game. `npm run economy:check 30 4` is that check, and its tables
are below.

### In the game

`npm run economy:check 30 4` (4 worlds of the game, seeds 1356 to 1359, every day computed in all of them) and
`npm run economy:check 5 8` (8 worlds, seeds 1356 to 1363), each against the same worlds before this feature
(section 5):

| All cities together, year 30 (4 worlds) | Before | Now | Range of the worlds now |
|---|---|---|---|
| Real output (start = 100) | 97.1 | 107.2 | 105.3 to 108.6 (before: 74.8 to 110.6) |
| Price level of output (start = 100) | 126.6 | 123.6 | 119.1 to 127.1 |
| Exports = imports, share of output | 2.19 % | 2.25 % | 2.06 % to 2.43 % |
| Without work, mean of all cities and days of the 30 years | 4.86 % | 0.70 % | 0.62 % to 0.81 % (before: 1.40 % to 10.60 %) |
| Without work, the worst city on its worst day | 23.8 % | 4.9 % | 4.3 % to 5.9 % (before: up to 39.5 %) |
| City with the lowest output (its start = 100) | 78.2 | 101.3 | 100.2 to 102.2 (before: 46.0 to 100.9) |
| City with the highest output | 112.5 | 113.9 | 112.0 to 115.3 |

| All cities together, mean of the 4 worlds | Year 5 | Year 10 | Year 20 | Year 30 |
|---|---|---|---|---|
| Real output (start = 100), now | 105.1 | 107.0 | 108.0 | 107.2 |
| Before | 102.8 | 101.9 | 100.1 | 97.1 |
| World of seed 1356, now | 104.3 | 106.4 | 109.2 | 107.2 |
| World of seed 1356, before | 100.2 | 97.0 | 90.0 | 74.8 |
| Exports = imports, share of output, now | 2.58 % | 2.43 % | 2.31 % | 2.25 % |

| All cities together, year 5 (8 worlds) | Before | Now | Range of the worlds now |
|---|---|---|---|
| Real output (start = 100) | 104.3 | 105.0 | 104.3 to 106.7 |
| Price level of output (start = 100) | 104.3 | 103.7 | 102.6 to 104.5 |
| Exports = imports, share of output | 2.55 % | 2.57 % | 2.46 % to 2.76 % |
| Without work, mean of all cities and days | 0.91 % | 0.51 % | 0.39 % to 0.63 % |
| Without work, the worst city on its worst day | 5.6 % | 2.9 % | 2.6 % to 3.6 % |
| City with the lowest output (its start = 100) | 97.8 | 100.8 | 99.1 to 101.8 |
| City with the highest output | 111.9 | 111.2 | 107.8 to 114.5 |

In none of the 4 worlds a city stands below its start after 30 years. The books (the identities of every city and
the books of the merchants, once a month) are off by at most 1.4e-13 of the amount they are judged by. The outputs
of both runs lie in the project files (wirtschaft/staedte/befunde/feature6_check_30_4.txt and
feature6_check_5_8.txt).

Before the build the same was tried outside the game (native build, the game's calibrations with only `theta_UB`
and `w_UB` changed, without the adjustment of the propensity to consume): 5 seeds over 30 years gave an output of 104
to 109, 0.4 % to 1.9 % without work and no city below 97; 2 seeds over 100 years an output of 102 and 108 with 2.2 %
and 0.6 % without work and the lowest city at 98 and 101.

### What it does not change

- Prices still rise, by about 0.7 % a year (123.6 after 30 years; 248 and 263 after 100 years in the trial). The
  model has nothing that holds the price level (section 3), and the coin of the cities together is still fixed.
  Feature 7 (section 7) holds the price level.
- Trade still shrinks, from 3.3 % of output at the start to 2.25 % in year 30 (the stalls do not sell out;
  section 5).
- Cities still differ by chance and a little by size: in the world of seed 1356 the cities stand between 101.2
  and 114.8 after 30 years, the four largest between 104.5 and 112.6.
- In the trial outside the game the coin of the firms went on draining slowly (2,204 to 1,220 in 30 years, all
  cities of one seed), and the crowns ran a surplus (their debt fell to −409): the real purchases of a crown follow
  their own rule (A.55, A.56) while its revenue grows with output. Not measured in the game.

### Limits

- The benefit is no institution of 1356. It is set for the time being (Ramon, 15 November 2026), with the value of
  the original code, and paid by the crown of the city.
- Every person without an employer is paid, for as long as it lasts, and nobody is excluded.
- The benefit at the start is the benefit on the mean wage; the original takes it from data.
- The long runs are few: 4 worlds over 30 years in the game, 2 runs over 100 years outside it. A year of the game is
  a day of real time, so 30 years are a month of the running world.
- Nothing here is checked against history.

## 7. The cities pay wages in money

Status: built on the branch of features 5 and 6 (draft pull request 17), not in the running world. Ramon agreed on
16 November 2026 (07:05 UTC) on the card "Soll ich den Lohn in Geld als Feature 7 bauen?" with "Ja, Lohn in Geld
bauen": only this, in the cities, with tests and numbers from the game; the price rule and the unemployment benefit
stay, nothing goes live. Player wiki: docs/wiki/wirtschaft/lohn-in-geld.md.

It comes from his objection to feature 6 on 15 November 2026: "löhne und preise sollte auch in der modernen
wirtschaft sinken" (21:18 UTC) and "naja aber das stimmt doch nicht historsich. wie könnten wir das sauber fien?
erweitern etc?" (21:26 UTC), and from three trials outside the game that he released one by one (project files
wirtschaft/staedte/befunde/feature7_probelauf_canvas.txt, feature7_probelauf_preisregeln.txt,
feature7_probelauf_lohnregeln.txt).

### What the trials found

In the model of the paper a firm has a real wage that never changes, and what it pays is that real wage times the
consumer price level of the period (BeforeIT.jl, src/agent_actions/firms.jl, lines 120 to 127 and line 221; in the
port `firms_wages` and `firms_profits` in src/firms.rs; A.26). The wage follows the prices one to one. So nothing in
the model holds the level of prices: in section 6 they rose by 0.7 % a year, and every price rule of the literature
that reacts to a firm's sales ran away in our cities when it was put in place of the paper's (the rule of CANVAS,
Hommes et al. 2022; the mark-up of the K+S model, Dosi et al. 2010; the rule of CATS, Assenza et al. 2015).

What holds the level is a wage in money. Assenza, Delli Gatti and Grazzini (2015, Emergent Dynamics of a
Macroeconomic Agent Based Model with Capital and Credit, CESifo Working Paper 4765, table 2) keep the nominal wage
constant (w = 1). With that, the paper's own price rule kept the prices of the 29 cities at 100.0 for 100 years in
the trial. The two rules of the literature that tie the wage to the labour market did not hold in the cities: the
wage equation of the K+S model (Dosi et al. 2015, equation 8) divides by a rate of unemployment that is close to
zero here and broke 6 of 12 runs; the rule of Lengnick (2013, equation 5) multiplied the prices of Cairo by 12.8 in
30 years.

### The rule (`economy/src/clock.rs`)

Not a line of the port changes. The model type of the daily clock gains two numbers per firm, both kept in the state:
the wage in money `wage` and the real wage of the start `real_wage`.

1. When the economy is made, `wage = w_bar_i · P_bar_HH`: the wage every firm pays at the start (the consumer price
   level of the start is 1). It never changes after that.
2. Every day, before the firms decide, the real wage of every firm is set to `w_bar_i = wage / P_bar_HH`, with the
   consumer price level the firms know on that day. The port's rules then pay "real wage times consumer price
   level" as before, which is now the wage in money. (The port multiplies by the price level at the end of the day,
   so the wage paid on a day is off by the change of the consumer prices within that day.)
3. In the cost push of a firm's price (A.9) the port has the term of labour
   `(1 + tau_SIF) · w_bar_i / alpha_bar_i · (P_bar_HH / P_i − 1)`: the price of labour is the consumer price level,
   because the wage follows it. Here the price of labour is the wage in money over the real wage of the start, which
   stays at 1: the term is `(1 + tau_SIF) / alpha_bar_i · (wage / P_i − real_wage)`. The terms of materials and of
   capital are the port's. A firm whose price lies above its start now sees labour as cheap against its price and
   lowers the price; that is what pulls prices back.

Points 2 and 3 are how the constant wage of Assenza et al. enters the model of Poledna et al.; that carrying over is
ours and stands in no paper. Their own model has another price rule and no cost push.

An economy without the feature computes as before, bit for bit: the port's own data set for Austria against the
port used directly (economy/tests/shell.rs), and the WebAssembly build against the native one with either wage.

The state of an economy has the format 3 (the two lists at the end of the clock's fields; empty lists for the port's
wage). The state of the world stays version 8, which is not in the running world yet.

### Calibration and the way into the game

| Entry | Value | Kind |
|---|---|---|
| `cities.wage` in `data/economy/england_1356.json` | `money` | assumption: no source for 1356; the constant nominal wage of Assenza et al. (2015), table 2; set by Ramon's word of 16 November 2026. `prices` is the port's wage |

`npm run economy:calibrate` writes it as the key `wage` of `public/data/economy_cities.json`; no parameter of a city
changes. The world hands it to the engine when it founds the economies (`sce_create` has a fifth argument, 0 for the
port's wage and 1 for the wage in money; `EconomyWage` in src/sim/economy/engine.ts).

### Tests

`economy/tests/wage.rs` (8 tests; Austria by the port's own rules and London of the game):

- The port pays a real wage times the prices, the feature a wage in money: over 40 quarters of Austria the port's
  real wages stay as they are while consumer prices move by more than 5 %; with the feature the wage in money of
  every firm stays the same bit for bit, the real wage of every period is that wage over the consumer prices the
  firms knew, what a firm pays for a unit of work is the wage in money up to the price change within the period, and
  the books balance.
- The cost push takes the wage in money as the price of labour: at the start it is the port's; with every price a
  quarter higher the port's push is unchanged (it does not see the level), the feature's is lower by exactly the
  term of labour; it does not depend on the real wage the port holds at the moment.
- Prices come back: every price of London raised by 20 % on day 60. Two years later the price level is above 115
  with the port's wage and within 2 % of the start with the wage in money (3 seeds).
- The price level of London stays within 2 % of the start in each of 6 years (3 seeds), and the wage of every person
  with an employer is the wage of that firm.
- The wages are part of the state: 45 days through bytes day by day give the same economy as 45 days in one go; the
  state of an economy with the port's wage loads as such; wages that do not fit the firms are refused.
- The clock stops when it does not hold the wage of every firm.
- Cities that trade pay wages in the same way (a mix is refused); three cities with wages in money trade for 90
  days with balanced books and unchanged wages.
- The calibration of the cities says `money`.

Taking out point 2 fails the first test; taking out point 3 fails the tests of the cost push and of the price level.

`tests/economy.test.ts` (1 new test, 48 in all): the table marks the wage as an assumption and names the paper, the
lines of the original it replaces and that the carrying over is ours; the file of the cities carries it and no
parameter of a city changes with it. The engine tests now create the cities with the wage of the game, compare the
WebAssembly build with the native one for both wages (also with the clock of the port), and refuse a wage that is
neither.

### In the game

`npm run economy:check 30 4` (4 worlds of the game, seeds 1356 to 1359) and `npm run economy:check 5 8` (8 worlds,
seeds 1356 to 1363), every day computed in all of them, against the same worlds with feature 6 alone (section 6):

| All cities together, year 30 (4 worlds) | Feature 6 | Now | Range of the worlds now |
|---|---|---|---|
| Real output (start = 100) | 107.2 | 104.1 | 103.2 to 104.8 |
| Price level of output (start = 100) | 123.6 | 100.0 | 100.0 to 100.1 |
| Price level of a single city on the last day | not kept | 99.5 to 100.5 | 99.5 to 100.6 |
| Exports = imports, share of output | 2.25 % | 2.00 % | 1.97 % to 2.03 % |
| Without work, mean of all cities and days of the 30 years | 0.70 % | 1.14 % | 0.77 % to 1.34 % |
| Without work, the worst city on its worst day | 4.9 % | 6.2 % | 5.8 % to 7.3 % |
| City with the lowest output (its start = 100) | 101.3 | 98.5 | 97.5 to 99.4 |
| City with the highest output | 113.9 | 114.1 | 113.6 to 114.7 |

| All cities together, mean of the 4 worlds | Year 5 | Year 10 | Year 12 | Year 20 | Year 30 |
|---|---|---|---|---|---|
| Real output (start = 100), now | 106.1 | 106.6 | 107.4 | 105.5 | 104.1 |
| Feature 6 | 105.1 | 107.0 | | 108.0 | 107.2 |
| Exports = imports, share of output, now | 2.67 % | 2.33 % | 2.36 % | 2.12 % | 2.00 % |

| All cities together, year 5 (8 worlds) | Feature 6 | Now | Range of the worlds now |
|---|---|---|---|
| Real output (start = 100) | 105.0 | 106.9 | 104.7 to 109.3 |
| Price level of output (start = 100) | 103.7 | 100.1 | 100.0 to 100.1 |
| Exports = imports, share of output | 2.57 % | 2.77 % | 2.53 % to 2.93 % |
| Without work, mean of all cities and days | 0.51 % | 0.35 % | 0.19 % to 0.50 % |
| Without work, the worst city on its worst day | 2.9 % | 2.5 % | 1.9 % to 3.2 % |
| City with the lowest output (its start = 100) | 100.8 | 102.6 | 99.6 to 104.4 |
| City with the highest output | 111.2 | 113.7 | 108.4 to 114.7 |

The price level holds: 100.0 after 30 years in every world, and no city further than 0.6 from 100. The books are
off by at most 2.0e-13 of the amount they are judged by. The outputs of both runs lie in the project files
(wirtschaft/staedte/befunde/feature7_check_30_4.txt and feature7_check_5_8.txt).

The goods side is better in the first years and worse later than with feature 6 alone. Output peaks in year 12 at
107.4 and then falls slowly, to 104.1 in year 30. In the world of seed 1356 two of the 29 cities stand below their
start after 30 years (Isfahan 98.6, Aleppo 99.0); with feature 6 alone none did.

Outside the game the same 29 linked cities ran 100 years in 3 runs (native build, the calibrations of the game,
seeds 1356 to 1358, every day computed; `economy/examples/cities.rs` with `money`). Output does not keep falling: it
swings between 102 and 108 for the whole century and ends at 102.3, 106.6 and 104.3. The price level of all cities
stays between 99.9 and 100.2 in every year checked, no city further than 1.0 from 100. Between 0 and 9 of the 29
cities stand below their start at a time, the lowest at 95.1; on the days checked 0.5 % to 2.6 % are without work.
The merchants' books are off by at most 2.5e-13. The output of the three runs lies in the project files
(wirtschaft/staedte/befunde/feature7_100_jahre.txt).

| Year (3 runs outside the game) | 10 | 30 | 50 | 75 | 100 |
|---|---|---|---|---|---|
| Real output of all cities (start = 100) | 105.1 to 105.7 | 103.2 to 106.6 | 103.2 to 104.4 | 103.6 to 104.6 | 102.3 to 106.6 |
| Price level of all cities (start = 100) | 99.9 to 100.0 | 100.0 to 100.1 | 100.0 to 100.1 | 100.0 to 100.1 | 100.0 to 100.1 |
| Lowest city (its start = 100) | 98.8 to 100.2 | 97.1 to 101.1 | 97.2 to 98.3 | 95.1 to 98.3 | 98.0 to 100.4 |
| Cities below their start | 0 to 1 | 0 to 7 | 4 to 6 | 3 to 8 | 0 to 9 |

### What it does not change

- The price rule is the paper's (A.8, A.9). Prices move with costs and with expected inflation, not with what a
  firm sells. The rule of CANVAS on top of the wage in money was tried outside the game (output 116, nobody without
  work, with and without the benefit); it is not built and would be a feature of its own.
- The unemployment benefit of feature 6 stays. A person without work keeps the real wage of the last day of work,
  and the benefit is 55 % of it at the prices of the day, as in the port.
- Households still expect their income of the next day at today's prices times the expected inflation
  (`households_income_act` of the port).
- Trade still shrinks, to 2.00 % of output in year 30.

### Limits

- A wage that never changes cannot fall either, and it cannot rise. Ramon's point that wages should be able to fall
  is not met by this feature; it is the anchor that a rule for wages or prices needs before it can hold.
- The wage is fixed firm by firm at the value of the start. Nothing ties it to the labour market, to output per
  head or to the coin in the city.
- How the constant wage enters the cost push is our reading of A.9, not a rule of a paper.
- A wage in money that never changes for decades is no finding about 1356. The Ordinance of Labourers of 1349 set
  wages at the level customary before the plague, as a ceiling; no source was used to calibrate this feature.
- The long runs are few: 4 worlds over 30 years in the game, 3 runs over 100 years outside it.
- Nothing here is checked against history.
