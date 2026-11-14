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
| 1 | Grain harvest per place | agreed and built 14 Nov 2026, awaiting Ramon's review |

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
The two first steps need zenodo.org and raw.githubusercontent.com, which the cloud environment cannot reach; they were
run on Ramon's Mac on 14 November 2026. land.json and the crop are adapted from the data set and carry its licence,
CC BY-SA 4.0. The outline file (tools/geo/data/ne/england.json) is still to be pushed from the Mac; land.json was
built there with it (its checksum is in the commit that added land.json).

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
- All land of a place counts as worked (see above). A reconstruction of cultivated land would be the obvious source;
  none has been checked yet.
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
