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
| 2 | Cultivated land per place | agreed by Ramon 14 Nov 2026 and built as proposed; in the running world since 15 Nov 2026 |
| 3 | England as one national economy, computed by the port of BeforeIT.jl | agreed by Ramon 15 Nov 2026 and built as proposed; in the running world since 15 Nov 2026. Replaced in the game by feature 5: the port, the calibration table and its sources stay |
| 4 | England's economy computes every day | agreed by Ramon 15 Nov 2026 and built as proposed. It never ran in the world as England's clock: feature 5 took its place before the world server was redeployed, and the daily clock is now the clock of every city |
| 5 | Cities as economies of their own that trade with each other | direction given by Ramon 15 Nov 2026; that the cities replace England's economy in the game decided by him the same day ("Ja, Städte ersetzen England", 17:15 UTC). Built; in the running world since 16 Nov 2026 14:04 UTC (pull request 17 merged as 0b8db90, world server release 13, world Europa 1291 resumed at day 15 with the cities founded on that day; the 1291 world takes the 1356 tables as placeholders). Over decades the linked cities sank (section 5); feature 6 mends it |
| 6 | The cities pay the model's unemployment benefit | agreed by Ramon 15 Nov 2026 for the time being ("das kannst du gerne einstellen für den moment", 19:29 UTC). Built. Taken out again by feature 9 before it ever ran in the world |
| 7 | The cities pay wages in money | agreed by Ramon 16 Nov 2026 ("Ja, Lohn in Geld bauen", 07:05 UTC): only this, the price rule and the unemployment benefit stay. Built; in the running world since 16 Nov 2026, with feature 5 |
| 8 | The firms of the cities plan by the demand pull of CANVAS | agreed by Ramon 16 Nov 2026 ("CANVAS-Preisregel bauen", 12:12 UTC): only this, the unemployment benefit stays. Built; in the running world since 16 Nov 2026, with feature 5 |
| 9 | The cities pay no unemployment benefit | agreed by Ramon 16 Nov 2026 ("Arbeitslosengeld entfernen", 12:53 UTC): the benefit of feature 6 is taken out of the cities, with tests and numbers from the game. Built; in the running world since 16 Nov 2026, with feature 5 |
| 10 | The persons of the cities' economies are the persons of the cities | direction given by Ramon 16 Nov 2026 ("das wollen wir mit ecs", 14:18 UTC), variant A agreed by him the same day ("A: Grösse aus den ECS-Personen", 15:57 UTC): the economies take their head count from the persons of the world, with tests and numbers from the game; nothing goes live. Built; in the running world since 16 Nov 2026 ("mergen und weiter", 17:36 UTC, and his release of the world server, 17:41 UTC) |
| 11 | The family is the purse, and a woman without a husband works | chosen by Ramon 16 Nov 2026 as the next feature ("Haushalt der Familie", 17:50 UTC), variant B agreed by him the same day ("B: Kasse, Frauen ohne Mann arbeiten", 18:01 UTC): the family as purse, and women without a husband work, so the economies are founded anew. Built, with tests and numbers from the game; in the running world since 16 Nov 2026 ("mergen und live", 18:22 UTC, and his release of the world server, 18:45 UTC) |
| 12 | The harvest feeds the cities: a city buys the food its harvest lacks | chosen by Ramon 17 Nov 2026 as the next feature ("Ernte speist die Städte", 15:49 UTC), variant A ("A, Ägypten vorerst wie England", 15:54 UTC); after the first build failed, the trade in food ("Getreide über die Händler kaufen", 16:03 UTC) and the rule as proposed ("Ja, so bauen", 16:16 UTC). Built, with tests and numbers from the game; not yet in the running world **Taken back 17 Nov 2026** (Ramon, "C: Feature 12 zurücknehmen", 17:38 UTC): the cities' trade does not add up together (section 14) |
| 13 | The merchants' money (examined, nothing built) | chosen by Ramon 17 Nov 2026 as the next feature ("Händlerguthaben abbauen"), with "möglichst papernah" and "kein delulu"; after the reading and the measurement he left the decision to Claude ("du entscheidest selbständig", 17:19 UTC): the finding is recorded, no rule is built (section 13) |
| 14 | The check of the model, and feature 12 taken back | asked by Ramon 17 Nov 2026 ("zuerst das modell jetzt sauber prüfen abschliessen ob alles aufgeht"); feature 12 taken back by his choice the same day; next by his order: distance in trade, then consumption and hunger (section 14) |
| 15 | Households spend out of their savings, and a family has a need of food | order changed by Ramon 17 Nov 2026 ("Verbrauch und Hunger zuerst", 19:27 UTC) after the slump of remote cities in the trials of the distance was traced to the households' consumption; he asked for "einfach möglichst genau nach beforeit" (20:02 UTC) and chose "BeforeIT plus Erspartes" (20:06 UTC): the market stays the port's, only the budget gets the spending out of savings, need and hunger are a booking of the family purse. Built, with tests and numbers from the game; not yet in the running world (section 15) |
| 16 | The crown of a city buys with what it took in | after feature 15 the distance in trade was tried again and one city still sank steadily; Ramon chose to clear that first ("Erst den Geldabfluss klären", 17 Nov 2026, 20:45 UTC). The money lay with the crown of the city, whose purchases follow a random series of their own. He chose "Krone gibt aus, was sie einnimmt" (18 Nov 2026, 02:36 UTC). Built, with tests and numbers; not yet in the running world (section 16) |
| 17 | Distance in trade: goods travel for days, and carrying costs labour | proposed 17 Nov 2026 (https://claude.ai/artifact/9Gt22ijoL8Xdqx4cfLM7NV), variant B agreed by Ramon ("ok"); held back until the money drain was cleared (features 15 and 16); built after his choice of 18 Nov 2026 ("Krone gibt aus, was sie einnimmt": then the distance). How the Americas stay apart in 1356 is asked of him (card of 18 Nov 2026). Built, with tests and numbers; not yet in the running world (section 17) |
| 19 | The firms and households keep the working days of their faith | step 3 of way A of the proposal «Personen: Archiv der Toten und Tagesplan» (https://claude.ai/artifact/8UqSxP49CfvpPfX1UCDULc), chosen by Ramon 19 Nov 2026, with merge and deploy ("vorwärts machen alles mergren comitten und feddich", "du darfst deployen"). Built, with tests and numbers from the game (section 19); people feature 8 holds the calendars |
| 20 | The days of rest without a leak | after feature 19 Ramon wrote "naja jetzt sind wir aber nicht fertig" (19 Nov 2026), chose to damp the firms' price rule first, "nur literaturkonform"; Calvo held the prices but cost work, and he chose "Zuerst Leck an Ruhetagen schliessen" (card, 19 Nov 2026). Built: materials for the next working day, the owner on his working days on the profit of the year; with tests and numbers from the game (section 20) |
| 21 | A world knows the history only up to its start | the open gap of feature 20, found to come from the history of the placeholder tables: a world of 1291 expected the recovery after the plague of 1348. Under Ramon's "nur literaturkonform" (19 Nov 2026) and his order to clear the open questions of the economy first; the port's window (data up to the date of the calibration). Built, with tests and numbers from the game (section 21). The gap of 1.5 % that remained, cleared at Ramon's choice ("Erst Restlücke 1,5 % klären", 20 Nov 2026): the owners' rule of the run it was measured against, not the days of rest; nothing built |
| 22 | The workers who are away: sickness and childbed | step 4 of way A of the proposal «Personen: Archiv der Toten und Tagesplan», proposed 20 Nov 2026 (https://claude.ai/artifact/QK327U5QQQGWNCnL5JhHV5) and chosen by Ramon the same day («So bauen, Lohn läuft weiter»): a firm works with the workers who are there, and everybody keeps the place and the wage. Built, with tests and numbers from the game (section 22); people feature 9 holds the sicknesses and the childbeds |

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
`src/sim/economy/calibration.ts` applies the port's formulas and `npm run economy:calibrate` writes
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

**From the year to the day** (`dailyEconomy` in `src/sim/economy/calibration.ts`; the table of sources
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
  version 10 now, section 5). A world saved by an older
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

**The past in a fixed size (`economy/src/past.rs`).** The port estimates the expectations on the whole past (A.6,
A.7, A.10): real GDP and inflation of every period since the start stay in the state, 16 bytes per city and day
without end, and every day all windows of the whole past are summed again. For a world that runs 557 years that is
1.8 GB of state for 550 cities and a day that computes longer the older the world is. The cities of the game
therefore keep the past in a fixed size (`Economy::with_bounded_past`; the engine does it for every city it founds,
and for cities of an older state on the first day it computes them). The rule stays the port's. The windows of a day
are the windows of the same day a year before and one more, and least squares of a value on the value before it and
a constant needs of all those pairs only their number and five sums, which follow from three sums, the first window
and the last. The clock keeps these per day of the year (365 positions, for real GDP and for inflation), and the
values of the last 365 days, from which the new window is summed: 29 KB per city, for good. The estimate is computed from the sums with the port's handling of regressors
that do not differ (its pseudoinverse); it is the port's estimate up to rounding, not bit for bit (12 digits for a
city of the game, `economy/src/past.rs` tests). Because the last digits decide single hirings and purchases, a world
that goes over is from then on another run of the same rules than it would have been: the same economy, not the
same numbers. The port appends real GDP and inflation of a period to its lists at the place its count of periods
gives; so with the fixed size every day is computed as the port's first period, its lists stay the history before
the start, and the clock counts the days. An economy made without it (the tests against the port, a state of an
older format that is only read) keeps the whole past and computes bit for bit as before. State format 6; formats 4
and 5 are still read. Measured (2026-11-17): 29 cities over 150 years keep a state of 3.4 MB and compute every year in
the same time; with the whole past the state grows by 1.7 MB in 10 years and the fourth decade computes twice as long
as the first. Output and prices of the two runs are the same economy (year 40: 116.0 and 95.2 against 116.3 and
95.3). For the 558 towns the state is 12.5 MB larger at first (45.0 MB instead of 32.5 MB at day 408) and smaller
from about the fifth year of the world on. Tests: `economy/src/past.rs` (the estimate from the sums against the
port's estimate on the whole past, fed day by day and built from a whole past, also with a history that never
moved) and `economy/tests/past.rs` (an economy with the fixed size expects what the whole past gives and computes
the same days until a last digit decides a hiring; its state stops growing; it loads bit for bit and continues as a
straight run; an economy that kept the whole past goes over on any day; a state of format 5 is read and keeps the
whole past).

**Tests.** `economy/src/clock.rs` and `economy/tests/shell.rs` (cargo test, 15 tests): with a plan and a window of
one period the engine computes what the port computes; a firm sets supply and price only on its plan day, as the
mean demand times the expected growth; the clock keeps one window of the series of the accounts that the figures
sum (the port keeps its last row alone, a state of the older format with whole rows is still read); one
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
that England's economy as one whole goes. In the running world since 16 November 2026 (world server release 13). Player wiki:
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

**Calibration of a city** (`data/economy/england_1356.json`, section `cities`; `src/sim/economy/calibration.ts`,
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

**State version 10 and the running world.** (The cities were version 8 while this branch was built; main then
took 8 for the people of 1291 and 9 for heads at 1:100, pull request 39, so the cities are the step 9 → 10.) A world
saved with England's economy (version 9, the running world of 1291; older versions take their steps first) founds
the cities on the day it has reached: they start from the starting position of 1356 on
that day, and no past days are computed for them. England's state is dropped. (Computing the past would hold the
world server for minutes when it starts; the cities of a new world start on its first day.) Rehearsed with a world
of 400 days made by the build of main (fbdc9be, state version 7, 25,103 places): upgraded by this build to
version 8 in 0.03 s, 60 more days computed in 1.0 s with the books off by at most 6e-15, saved (6.3 MB) and loaded
again with the same hash, and both go on to the same state. (First rehearsed with a world of main c84e60b, then
version 6.) Rehearsed again on 16 November 2026 with features 7 to 9 and the world server itself: the server of main
b746536 made a world of 1291 on disk (state version 9, 12 and 45 days), the server of this build resumed it in
1.6 s as version 10 with the economies of the 29 cities founded on the day reached, computed 70 more days (20 ms a
day) with the books off by at most 4e-15, replayed its log from its first snapshot to the live state, and stopped
and started again with the same hash. The same with a world of version 7 made by the server of main c5f2aa6.

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
paper passieren." It never ran in the world: feature 9 took it out before feature 5 went live. Player wiki:
docs/wiki/wirtschaft/arbeitslosengeld-der-staedte.md.

Since feature 9 (section 9) the cities pay no benefit any more: with wages in money (section 7) and the demand pull
(section 8) they hold without it. This section stays as the record of the feature and of why it was needed.

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

### Calibration (`data/economy/england_1356.json`, `src/sim/economy/calibration.ts`)

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

Status: built; in the running world since 16 November 2026 (pull request 17, world server release 13). Ramon agreed on
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
wage). The state of the world stays the cities' version (8 then, 10 since main took 8 and 9), which is not in the running
world yet.

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
  firm sells. The rule of CANVAS on top of the wage in money is feature 8 (section 8).
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

## 8. The firms of the cities plan by the demand pull of CANVAS

Status: built; in the running world since 16 November 2026 (pull request 17, world server release 13). Ramon agreed on
16 November 2026 (12:12 UTC) on the card "Wie soll es mit der Wirtschaft der Städte weitergehen?" with
"CANVAS-Preisregel bauen": only the price rule of CANVAS as feature 8, with tests and numbers from the game; the
unemployment benefit stays, nothing goes live. Player wiki: docs/wiki/wirtschaft/preise-nach-absatz.md.

### What it is

In the paper a firm's supply is the demand it met, and its price moves with its costs and with expected inflation
only (A.5, A.8, A.9): what a firm sells never reaches its price. Ramon's point of 15 November 2026 was that prices
and wages should be able to fall. CANVAS, the model of the Bank of Canada that is built on the paper's, has a rule
for that (Hommes, He, Poledna, Siqueira, Zhang 2022, CANVAS: A Canadian Behavioral Agent-Based Model, Bank of Canada
Staff Working Paper 2022-51, section 3.2.4, equations 34 to 37). BeforeIT.jl has it as a model type
(src/model_extensions/init_CANVAS.jl, lines 45 to 75), and so has the port (src/model_extensions/canvas.rs).

A firm compares the demand it met, `Q_d`, with the supply it had planned, `Q_s`. The gap is `Q_d / Q_s − 1`. It
changes either its supply or its price by the gap, never both:

| | its price is at least the price index of its sector | its price is below it |
|---|---|---|
| it sold out (`Q_s <= Q_d`) | supply rises by the gap | price rises by the gap |
| it did not sell out (`Q_s > Q_d`) | price falls by the gap | supply falls by the gap |

    supply = Q_s · (1 + expected growth) · (1 + gap or 0)
    price  = price · (1 + cost push) · (1 + expected inflation) · (1 + gap or 0)

The cost push and the two expectations are the paper's; the cost push takes the wage in money as the price of labour
(feature 7).

### How it enters the daily clock (`economy/src/clock.rs`)

Not a line of the port changes. The model type of the daily clock gains one switch, `demand_pull`, kept in the
state (format 4).

- A firm applies the rule on its plan day, every 30 days. `Q_s` is the supply per day of its last plan, `Q_d` the
  mean demand per day since, growth and inflation are those expected over the 30 days ahead. CANVAS applies it every
  quarter. That carrying over is ours. With a plan in every period it is the port's rule, bit for bit (a test).
- Every planning firm adjusts. The original code can let only a random part `theta_calvo` of the firms adjust; its
  default is 1 (src/model_init/init_properties.jl, line 85), and the plan day already spreads the firms over the
  month. Parameters with another `theta_calvo` are refused, and the port's random draw for it is not made.
- At the start the supply every firm had planned is set to the demand it met, as the original code does
  (`firms.Q_s_i .= firms.Q_d_i`, init_CANVAS.jl, line 146), so the first gap is 0.
- Of the two changes of CANVAS that the original code implements, this is one. The other, a central bank that
  learns its rule, is not taken: the cities have no rule for the rate (feature 3).

### Why it needs feature 7

With the port's wage, which follows the prices, the same rule drove the prices of the 29 cities to zero within 7 to
11 years in the trial of 15 November 2026, and the port's own CANVAS model on its data set for Italy ran away upward
(only measured in the port, not in Julia). The price level is then the sum of all gaps and nothing pulls it back.
The wage in money of feature 7 is what pulls it back: a firm whose price has fallen sees labour as dear against
its price, and the cost push raises the price again.

### Calibration and the way into the game

| Entry | Value | Kind |
|---|---|---|
| `cities.prices` in `data/economy/england_1356.json` | `demand` | assumption: no source for 1356; the rule of CANVAS; set by Ramon's word of 16 November 2026. `costs` is the paper's rule |

`npm run economy:calibrate` writes it as the key `prices` of `public/data/economy_cities.json`; no parameter of a
city changes. `sce_create` has a sixth argument (0 for the paper's rule, 1 for the demand pull); in TypeScript the
wage and the prices are the `EconomyRules` the world hands to the engine (src/sim/economy/engine.ts).

### Tests

`economy/tests/demand_pull.rs` (9 tests; the port's data set for Italy and London of the game):

- With a plan every period the clock decides what the port's CANVAS decides: for all firms of Italy, at the start
  and after 1 and 5 quarters, two seeds, the supply, the price and everything that follows from them are the same
  bit for bit; all four cases of the rule occur more than 100 times; without the switch the clock decides the
  paper's prices.
- A planning firm changes its supply or its price by the gap and never both: 150 days of London, every firm on
  every day against the formula above; firms that do not plan keep both; the books balance.
- The first plan is the paper's, because no firm has a gap yet: after the first day London with and without the
  demand pull are the same bit for bit, after 61 days they differ.
- With wages in money the price level holds, and without them it leaves: London, 10 years, 3 seeds. With the wage in
  money the price level stays within a tenth of its start in every year; with the port's wage it is further than a
  quarter away, or not a number, in at least one year of every seed.
- With the demand pull a city keeps its people in work without the benefit: London, 10 years, 3 seeds. With the
  paper's rule and no benefit more than 4 % are without work at the end of some year; with the demand pull at most
  1 % at the end of every year from the third on, with the benefit and without it.
- The demand pull goes with every planning firm adjusting (`theta_calvo` other than 1 is refused).
- The switch is part of the state (45 days through bytes day by day).
- Cities that trade set prices in the same way (a mix is refused); three cities trade for 90 days with balanced
  books.
- The calibration of the cities says `demand`, on top of `money`.

Swapping the two cases of the rule fails the first two tests.

`tests/economy.test.ts` (1 new test, 49 in all): the table marks the entry as an assumption and names the paper,
the lines of the original code and what is ours. The engine tests compare the WebAssembly build with the native one
for all four pairs of rules, refuse a rule that is none, and refuse parameters with another `theta_calvo`.

### In the game

`npm run economy:check 30 4` (4 worlds of the game, seeds 1356 to 1359) and `npm run economy:check 5 8` (8 worlds,
seeds 1356 to 1363), every day computed in all of them, against the same worlds with feature 7 (section 7) and
with feature 6 alone (section 6):

| All cities together, year 30 (4 worlds) | Feature 6 alone | With feature 7 | Now | Range of the worlds now |
|---|---|---|---|---|
| Real output (start = 100) | 107.2 | 104.1 | 116.4 | 116.1 to 116.6 |
| Price level of output (start = 100) | 123.6 | 100.0 | 94.8 | 94.1 to 95.3 |
| Price level of a single city on the last day | not kept | 99.5 to 100.5 | 90.0 to 100.7 | 88.8 to 101.9 |
| Exports = imports, share of output | 2.25 % | 2.00 % | 2.68 % | 2.64 % to 2.69 % |
| Without work, mean of all cities and days of the 30 years | 0.70 % | 1.14 % | 0.05 % | 0.04 % to 0.06 % |
| Without work, the worst city on its worst day | 4.9 % | 6.2 % | 2.4 % | 2.3 % to 2.5 % |
| City with the lowest output (its start = 100) | 101.3 | 98.5 | 111.4 | 109.8 to 113.3 |
| City with the highest output | 113.9 | 114.1 | 117.5 | 117.4 to 117.5 |

| All cities together, mean of the 4 worlds | Year 5 | Year 10 | Year 20 | Year 30 |
|---|---|---|---|---|
| Real output (start = 100), now | 107.9 | 113.2 | 115.9 | 116.4 |
| With feature 7 | 106.1 | 106.6 | 105.5 | 104.1 |
| Exports = imports, share of output, now | 2.75 % | 2.85 % | 2.72 % | 2.68 % |

| All cities together, year 5 (8 worlds) | With feature 7 | Now | Range of the worlds now |
|---|---|---|---|
| Real output (start = 100) | 106.9 | 107.8 | 106.9 to 108.6 |
| Price level of output (start = 100) | 100.1 | 99.7 | 99.4 to 99.8 |
| Exports = imports, share of output | 2.77 % | 2.73 % | 2.60 % to 2.85 % |
| Without work, mean of all cities and days | 0.35 % | 0.29 % | 0.23 % to 0.37 % |
| Without work, the worst city on its worst day | 2.5 % | 2.4 % | 2.3 % to 2.5 % |
| City with the lowest output (its start = 100) | 102.6 | 103.2 | 102.1 to 104.2 |
| City with the highest output | 114.2 | 114.2 | 112.9 to 115.9 |

The books are off by at most 1.2e-13 of the amount they are judged by. The outputs of both runs lie in the project
files (wirtschaft/staedte/befunde/feature8_check_30_4.txt and feature8_check_5_8.txt).

Output rises for about 20 years and then stays at 116: that is the limit of the capital of the cities. The
calibration starts every firm at 85 % of what its capital can make (`omega = 0.85`; `K_i = Y_i / (omega · kappa_i)`
in src/agents.rs of the port, line 387), a firm cannot make more than its capital allows (A.13), and investment only
replaces what wears off (A.14). So no city can stand above 100 / 0.85 = 117.6.

Outside the game the same 29 linked cities ran 100 years in 3 runs (native build, the calibrations of the game,
seeds 1356 to 1358; `economy/examples/cities.rs` with `money demand`). Output stays between 115.1 and 116.3 from
year 30 to year 100, the price level between 94.4 and 95.7, no city falls below its start in any year checked
(lowest 104.9 in year 10, at least 109.4 from year 20 on), and on the days checked nobody is without work after
year 5. The
merchants' books are off by at most 4.0e-13. In the run of seed 1356 the firms planned 3.4 million times: the demand
they met was between 0.14 and 2.2 times the supply they had planned, 1.1 % of the plans lay outside one half to
double, 64.5 % of the plans moved the price and the others the supply. The prices of single firms spread widely: the
cheapest firm stood at 0.14 of its start, the dearest at 1.87. The output lies in the project files
(wirtschaft/staedte/befunde/feature8_100_jahre.txt).

Without the unemployment benefit, which the game keeps, the cities hold as well. Outside the game the same cities
ran 30 years in 3 runs with the benefit switched off (the calibrations of the trial of 15 November 2026:
`theta_UB = 1e-9`, no benefit at the start), with the engine of this feature: output 115.8 to 116.1 in year 30, the
lowest city at 109.4 to 111.9, no city below its start in any year checked, nobody without work on the days checked
from year 10 on, price level 95.1 to 95.8 (project file wirtschaft/staedte/befunde/feature8_ohne_arbeitslosengeld.txt).
With feature 7 alone and no benefit the trial had output at 89.8 and the lowest city at 65.4.

### What it does not change

- The unemployment benefit of feature 6 stays. Taking it out is not part of this feature (it is feature 9, section
  9).
- The wage in money never changes (feature 7). Prices now fall and rise with what a firm sells; wages do not.
- Capital does not grow, so output has a ceiling (above).
- Trade still shrinks from 3.3 % of output at the start, now to 2.68 % in year 30 instead of 2.00 %.

### Limits

- The rule has no bound. A firm that met no demand at all since its last plan would set its price or its supply to
  zero, and a firm with no supply divides by zero at its next plan; the original code has the same property (a cap
  of the price change is commented out there, init_CANVAS.jl, line 63). The economies of a world would then stand
  still with the reason (src/sim/systems/economy.ts). In 3.4 million plans of 100 years the smallest demand was 0.14
  of the supply; it did not happen in any run. Nothing was added against it.
- Applying the rule on the plan day with the mean demand per day is our carrying over; CANVAS is quarterly.
- The price level settles at about 95, not at 100, and single cities between 89 and 102. Why at 95 was not
  examined.
- The prices of single firms drift far apart (0.14 to 1.87 of the start in 100 years).
- The cities run at the limit of their capital with nobody without work. Whether that is the economy the game
  wants is open; the model has no rule by which capital grows beyond replacement.
- The long runs are few: 4 worlds over 30 years in the game, 3 runs over 100 years outside it.
- Nothing here is checked against history, and no source for 1356 was used.

## 9. The cities pay no unemployment benefit

Status: built; in the running world since 16 November 2026 (pull request 17, world server release 13). Ramon agreed on
16 November 2026 (12:53 UTC) on the card "Wähle den nächsten Schritt für die Wirtschaft der Städte" with
"Arbeitslosengeld entfernen": the unemployment benefit of the cities is taken out as feature 9, with tests and
numbers from the game; nothing goes live. It answers his objection of 15 November 2026 to feature 6 ("aber
historisch gab es ja kein arbeitslosengeld? wie würde die wirschaft dann immer noch gehen?"). Player wiki:
docs/wiki/wirtschaft/ohne-arbeitslosengeld.md.

### What it is

One entry of the table changes: `cities.unemployment_benefit` goes from 0.55 to 0. The calibration of every city
then has the rate switched off (`theta_UB = 1e-9`, not 0, because the port divides the wage of the start by this
rate, src/agents.rs, line 222) and nobody starts with a benefit (`w_UB = 0`). That is the calibration the cities had
before feature 6, and the one England's own table has always had. No line of the engine changes, and the rule of
the model stays what it is (Poledna et al. 2023, appendix A.44, A.53): a person without an employer has the rate
times the last wage as income, which is now a billionth of that wage. Such a person buys nothing, and the crown of
the city pays nothing (A.60, A.61).

With the benefit gone, the income that households spend from at the start no longer includes the benefit of the one
person without work, so the share they consume of it (`psi`) and the share they build with (`psi_H`) are a little
higher (London 0.18 %, Cairo 0.03 %). No other number of a city changes; a test compares every parameter.

The calibration tool still computes the benefit of the original code when the table asks for it
(`unemploymentBenefit` in `src/sim/economy/calibration.ts`), and the engine still computes such cities.

### Why the cities hold without it

Section 5 found that linked cities without the benefit sank over decades and stayed down, and section 6 mended that
with the benefit. What has changed since is the firm. With the rule of the paper a firm that sells less plans less
and dismisses, the dismissed buy nothing, and the firms sell less again. With the demand pull (section 8) a firm
that sells less lowers its price or its supply by the gap, and with wages in money (section 7) a lower price is a
higher real wage of those in work. That this is why the cities come back is our reading of the runs, not something
taken apart further. What is measured is the difference: London alone without the benefit has more than 4 % without
work in some year within ten years with the paper's rule (in four of six seeds tried, up to 15 %), and with the
demand pull at most 3.4 % at the end of a year in its first six years and nobody from the seventh on (all six
seeds, 20 years).

### Tests

`economy/tests/benefit.rs` (4 tests, written anew; cities of the game with the rules of the game):

- No city of the game pays a person without work: all 29 calibrations have the rate at a billionth and no benefit
  at the start; the one person without work of London's start has no last wage.
- A person without work has no income and buys nothing: London, 730 days, 3 seeds, every person on every day. With
  an employer the income is the wage after tax (A.53); without one it is at most a billionth of the last wage, and
  so is the budget. Persons without work occur on 196, 460 and 700 of the 730 days (at most 1, 2 and 6 persons).
  The books balance every day.
- The crown owes nothing for persons without work: London, 400 days, what the rule pays is less than 1e-8 of the
  wages of the day.
- Cities that trade keep their people in work without the benefit: Cairo, Paris, Venice and London with the
  merchants between them, 10 years, 2 seeds. In every year every city stands above 95 % of its start with less than
  5 % without work and a price level within a tenth of its start; in year 10 every city stands above 105 % with
  nobody without work. A city can still have a slump: with the second seed Cairo has 3 % without work for six years
  and an output of 98 % before it comes back. The bounds are measured ones.

`economy/tests/demand_pull.rs` (9 tests as before, two of them changed, because their city is now London without the
benefit):

- With the demand pull a city keeps its people in work without the benefit: the bounds are those of the paragraph
  above (three of the four seeds in which the paper's rule shows its slump within ten years).
- With wages in money the price level holds, and without them it leaves: with the port's wage and the demand pull
  London's price level now leaves its start by a quarter, or the port stops over a number that is none
  (`N_d_i: cannot round NaN`), within ten years in all three seeds. The test counts both. This is not a
  configuration of the game.

`tests/economy.test.ts` (51 tests, 2 new): the table says 0 and names the rate the cities had; every city of the
game has the rate switched off; the same cities calibrated with 0.55 have the benefit of the original code and
differ from the game's in `theta_UB`, `w_UB`, `psi` and `psi_H` only; the engine computes three such cities for 40
days with balanced books.

The second new test comes with main of 16 November 2026, where a new world starts in 1291 and takes the tables of
1356 as placeholders (`src/sim/tables.ts`, pull request 36): the economies of the cities are founded in such a
world as well, by the same rule as the persons of the cities, and compute with balanced books (35 days). The
numbers of this section are from worlds that start in 1356; the cities' tables are the same in both.

`tests/cultivation.test.ts`: the test that jumps to 31 December has 30 s instead of 5 s, because the jump lets the
economies of the cities compute a year of days (about 5 s; it timed out when all files ran together).

### In the game

`npm run economy:check 30 4` (4 worlds of the game, seeds 1356 to 1359) and `npm run economy:check 5 8` (8 worlds,
seeds 1356 to 1363), every day computed in all of them, against the same worlds with the benefit (section 8):

| All cities together, year 30 (4 worlds) | With the benefit (feature 8) | Now | Range of the worlds now |
|---|---|---|---|
| Real output (start = 100) | 116.4 | 116.2 | 115.9 to 116.7 |
| Price level of output (start = 100) | 94.8 | 94.9 | 94.1 to 95.5 |
| Price level of a single city on the last day | 90.0 to 100.7 | 90.5 to 99.6 | 89.6 to 100.6 |
| Exports = imports, share of output | 2.68 % | 2.70 % | 2.65 % to 2.74 % |
| Without work, mean of all cities and days of the 30 years | 0.05 % | 0.07 % | 0.05 % to 0.09 % |
| Without work, the worst city on its worst day | 2.4 % | 3.0 % | 2.3 % to 3.4 % |
| City with the lowest output (its start = 100) | 111.4 | 111.2 | 108.6 to 113.7 |
| City with the highest output | 117.5 | 117.5 | 117.5 to 117.6 |

| All cities together, mean of the 4 worlds | Year 5 | Year 10 | Year 20 | Year 30 |
|---|---|---|---|---|
| Real output (start = 100), now | 108.6 | 113.6 | 115.9 | 116.2 |
| With the benefit (feature 8) | 107.9 | 113.2 | 115.9 | 116.4 |
| Now, world of the seed 1356 | 108.8 | 114.1 | 115.6 | 115.9 |
| Exports = imports, share of output, now | 2.81 % | 2.83 % | 2.73 % | 2.70 % |

| All cities together, year 5 (8 worlds) | With the benefit (feature 8) | Now | Range of the worlds now |
|---|---|---|---|
| Real output (start = 100) | 107.8 | 108.2 | 107.4 to 108.8 |
| Price level of output (start = 100) | 99.7 | 99.5 | 99.0 to 99.9 |
| Exports = imports, share of output | 2.73 % | 2.77 % | 2.67 % to 2.87 % |
| Without work, mean of all cities and days | 0.29 % | 0.39 % | 0.29 % to 0.54 % |
| Without work, the worst city on its worst day | 2.4 % | 3.0 % | 2.3 % to 3.4 % |
| City with the lowest output (its start = 100) | 103.2 | 103.2 | 102.7 to 104.0 |
| City with the highest output | 114.2 | 115.5 | 114.3 to 116.5 |

The books are off by at most 1.7e-13 of the amount they are judged by. The outputs of both runs lie in the project
files (wirtschaft/staedte/befunde/feature9_check_30_4.txt and feature9_check_5_8.txt).

So the cities stand where they stood with the benefit. More people are without work, 0.07 % instead of 0.05 % over
30 years and on the worst day of the worst city 3.0 % instead of 2.4 %, and no city sinks. In the first years output is a little
higher than with the benefit, because households spend a little more of their income (`psi` above).

Outside the game the same 29 linked cities ran 100 years in 3 runs (native build, the calibrations of the game,
seeds 1356 to 1358; `economy/examples/cities.rs` with `money demand`), every day computed:

| Year (3 runs) | 5 | 10 | 30 | 50 | 75 | 100 |
|---|---|---|---|---|---|---|
| Real output of all cities (start = 100) | 108.3 to 109.1 | 113.8 to 113.9 | 115.8 to 116.1 | 116.2 to 116.5 | 116.0 to 116.4 | 115.9 to 116.4 |
| Price level of all cities (start = 100) | 98.8 to 99.8 | 97.4 to 98.0 | 95.1 to 95.8 | 94.4 to 95.2 | 94.6 to 95.3 | 94.7 to 95.5 |
| City with the lowest output (its start = 100) | 102.5 to 103.9 | 108.5 to 108.8 | 109.4 to 111.9 | 113.3 to 114.6 | 112.2 to 113.7 | 111.9 to 114.5 |

Output stays between 115.6 and 116.5 from year 30 to year 100 and the price level between 94.2 and 95.8. No city is
below its start in any year checked (years 5, 10, 12, 20, 30, 40, 50, 60, 75, 90, 100), and on the days checked
nobody is without work after year 5. The merchants' books are off by at most 1.9e-13. No run stopped. What the firms
met at their plans (section 8) was not counted again. The output lies in the project files
(wirtschaft/staedte/befunde/feature9_100_jahre.txt).

### What it does not change

- The rule of the model. The benefit is a number of the calibration; the cities can have it again by one entry.
- The wage in money never changes (section 7), capital does not grow, so output has its ceiling at 117.6 (section
  8).
- England's own table, which never had the benefit.

### Limits

- A person without work has nothing at all in the model and buys nothing. That is not 1356 either: what such a
  person lived on (savings, family, church, guild) is not in the model, which lets households consume from their
  current income only. No source was opened for it.
- That none of these cities paid people without work in 1356 is general knowledge; no source was opened.
- A city can still have a slump of years (Cairo in the test above: 3 % without work for six years). In the runs
  every such city came back; nothing in the model promises that.
- The cities hold without the benefit only with features 7 and 8. With the rule of the paper the slump of section 5
  is back.
- The demand pull has no bound (section 8, limits). That stays; no run of this feature stopped over it.
- The long runs are few: 4 worlds over 30 years in the game, 3 runs over 100 years outside it.
- Nothing here is checked against history.

## 10. The persons of the cities' economies are the persons of the cities

Status: built; in the running world since 16 November 2026 (pull request 44, world server release 15: the world
of 1291 resumed at day 68 with the economies of its 30 cities founded anew on that day). Ramon asked on 16 November 2026 (14:13 UTC) whether
the economy had been fitted to the real persons of the world in size. It had the same size source, but its persons
were persons of the engine alone: nobody in the world had a job or a wage. He answered "das wollen wir mit ecs"
(14:18 UTC). The proposal (Claude Doc "Feature 10: Die Personen der Wirtschaft sind die ECS-Personen") offered two
variants, and he chose "A: Grösse aus den ECS-Personen" (15:57 UTC): the economies take their head count from the
persons of the world, the economies of a running world are founded anew, with tests and numbers from the game;
nothing goes live. Player wiki: docs/wiki/wirtschaft/personen-der-wirtschaft.md.

### What it is

The model of the cities (Poledna et al. 2023, computed by the unchanged port of BeforeIT.jl) has persons: workers,
the owner of every firm, the owner of the bank, and persons who are not active (src/agents.rs of the port, lines 207
to 213; BeforeIT.jl, src/model_init/init_workers.jl, lines 30 to 31, and init_firms.jl, lines 85 to 106). Until now
they were rows of the engine, as many as a share of the city's people. Now each of them is a person of the world:

- **Who works** (`src/sim/systems/work.ts`). A person of a city works from the age of 15, a man with a chance of
  97.1 % and a woman with 43 %: the participation rates the calibration table has always had (Broadberry, Campbell,
  van Leeuwen 2013, pp. 13 to 14), applied to the single person with one draw from the person's own stream of
  random numbers. The table's share of adults (`adult_share` 0.62, an assumption without a source) is no longer
  used for the cities: the world's persons have ages.
- **The parts.** The persons who work are put in an order by a second draw. The first of them own the firms (one
  firm for every four persons of a sector, as before), the next owns the bank, the others are the workers. One
  adult who does not work is the model's person who is not active (the port needs one). That an owner is drawn at
  random is an assumption; no source.
- **The calibration moves into the game** (`src/sim/economy/calibration.ts`, before `tools/sim/`). A city is
  calibrated when its economy is founded: as England in 1356 at the city's share of England's people, with exactly
  as many active persons as the city has persons who work (`labour_force`, apportioned to the sectors by the
  largest remainder). The output of a city does not change by this: it follows from the city's people. Only the
  number of heads that make it changes, and with it the output and the wage of a head.
- **The firms are entities** (`WorldState.firm`: place, owner, sector, employees, output, price, pay).
- **The engine stays the place where the amounts are computed.** `Economy::agents` (economy/src/lib.rs,
  `sce_agents`) gives the port's own lists row by row: for a worker the employer, the wage, the income (A.53), the
  deposits (A.54) and the consumption (A.48); for a firm the sector, the employees (A.24), the output (A.13), the
  price (A.8), the pay, and its owner's income, deposits and consumption; the same three for the owner of the bank
  and the person who is not active. After every day the economy system writes them into the components of the
  persons (`role`, `agent`, `firm`, `wage`, `income`, `spent`, `savings`) and of the firms
  (`writeAgents` in `src/sim/systems/economy.ts`). A component is a copy of the day; no rule reads it yet.
- **The economies are those of the cities where the persons live.** Since pull request 45 the persons of a world
  of 1291 live in the 30 cities of 1291 (`citiesOf(startYear)`). So a world of 1291 has the economies of its own 30
  cities (Bruges, Rouen, Acre and Tunis among them, London not), each as England in 1356 at its share: the tables
  of 1356 stay the placeholder.

No rule of the model changes and no line of the port.

### The numbers

The reference world (start 1356, seed 1356; `public/data/economy_cities.json` is its calibration, which the tests
of the engine read) and a world of 1291 with the seed of the running world:

| | World of 1356 | World of 1291 |
|---|---|---|
| Persons of the cities | 25,722 | 24,828 |
| of them aged 15 or more | 16,968 | 16,483 |
| Persons who work | 11,755 | 11,455 |
| of them workers | 8,801 | 8,577 |
| owners of a firm (= firms) | 2,925 | 2,848 |
| owners of a bank (= cities) | 29 | 30 |
| Persons without a part (children, adults who do not work) | 13,967 | 13,373 |
| Families without a person who works | 690 of 6,568 (806 persons) | 738 of 6,454 (861 persons) |
| Active persons of the engine before feature 10 | 11,257 | 11,257 (the cities of 1356) |

The head count is 4.4 % above the old one in the reference world (Cairo 1,606 instead of 1,527, Paris 1,072
instead of 1,006, London 292 instead of 266), so output and wage per head are that much lower; the output of a
city is the same (all cities £45,055 a year at the start, as before). Another seed draws other persons: the count
of a world differs by some dozens.

What a person has after 30 days in the reference world: a worker with work is paid 2.08 d a day on average (1.48 d
to 3.63 d; the sectors differ), keeps 97.5 % of it after the tax on income and spends about as much. The firms are
of very different sizes, because the model draws their employees from a power law (port src/agents.rs, line 382;
BeforeIT.jl init_firms.jl, line 66): 1,883 of the 2,925 firms have one employee, the largest has 108 (in the world
of 1291 the largest has 483, in Cairo).

### State and upgrade

State version 12 (11 is main's: the persons of the 30 cities of 1291). The upgrade gives the persons their
components and founds the economies anew on the day the world has reached, from the starting position, with the
persons who work on that day: the days and yearly figures of the old economies are gone, as when the cities
replaced England. Who has turned 15 since the start of the world and draws work, works. A world from before the
economy takes the same steps.

The world server reads the table at run time, so its image copies `data/economy/england_1356.json`
(`server/Dockerfile`). Tried with the real server code: a world of 1291 as the running world has it (state version
10, the build of release 13) ran to day 69; the new server, laid out as the image, resumed it at day 69 as version
12, computed on to day 146 and answered `/person/<id>` with the part in the economy.

A day of the world takes 24 ms instead of about 17 ms on the machine of the tests (a world of 1291): writing the
persons and firms costs 6 ms, most of it the engine reading its state once more.

### Tests

`economy/tests/agents.rs` (3 tests, new): every person and firm of the model has a row, and the active persons are
the workers and the owners; on each of 120 days of London the rows add up to the figures of the economy (who has
work firm by firm, persons without work, owners, the savings of all persons against the deposits of the
households to 1e-9), a worker is paid what the firm pays and the income is that after tax to 1e-12 (A.53); the rows
of a saved state are those of the running one.

`tests/economy-persons.test.ts` (16 tests, new): who has a part is a person of a city aged 15 or more; the draw is
at the table's rates within three standard errors, the same for the same seed and another for another; every city
has as many active persons as its calibration, one firm for every four persons of a sector, and every part its
numbers once; every firm is an entity in its city with its own owner; on the day of the founding everybody but one
worker a city has work and nothing is paid yet; on each of 45 days the persons and firms add up to the figures of
every city (employed, without work, owners, savings to 1e-5 because the components hold 32 bits), a worker's firm
is of the worker's own city and pays the worker's wage; the books balance; a saved world goes on as the running
one; a world of version 11 gets the persons and firms by the upgrade and computes on; a world of 1291 has the
economies of its 30 cities; the server gives a person with the part, and the panel shows it.

`tests/economy.test.ts` (51 tests, changed where they read the calibration): the file of the reference world is
what the tool writes; a world of 1291 has 30 economies and London none; an upgraded world has the economies founded
on its day with the persons who work then.

Two tests of the engine have bounds measured with London, which now has 292 active persons instead of 266, so
other random numbers. They were measured again, not loosened:

- `benefit.rs`, a person without work has no income: the seeds are now 1356, 1359 and 1360, with which somebody
  is without work on 245, 272 and 281 of the 730 days (five of the eight seeds 1356 to 1363 have more than 100
  such days).
- `demand_pull.rs`, the demand pull keeps a city in work: with the paper's rule London now shows its slump (more
  than 4 % without work at the end of a year within ten years) in four of twelve seeds tried (1356 to 1367; up to
  12 %), before in four of six (up to 15 %, section 9). Three of the four are computed. With the demand pull the
  twelve seeds have at most 2.1 % at the end of a year and nobody from the seventh year on.

All tests: 1012 of the game (with main of 16 November 2026, 17:30 UTC), 53 of the engine.

### In the game

`npm run economy:check 30 4` and `npm run economy:check 5 8` as in section 9 (worlds of 1356, the seeds 1356 on),
every day computed. Each world now has the head count of its own persons:

| All cities together, year 30 (4 worlds) | Feature 9 | Now | Range of the worlds now |
|---|---|---|---|
| Real output (start = 100) | 116.2 | 116.0 | 115.7 to 116.4 |
| Price level of output (start = 100) | 94.9 | 95.1 | 94.5 to 95.7 |
| Exports = imports, share of output | 2.70 % | 2.67 % | 2.64 % to 2.71 % |
| Without work, mean of all cities and days of the 30 years | 0.07 % | 0.09 % | 0.07 % to 0.10 % |
| Without work, the worst city on its worst day | 3.0 % | 3.4 % | 3.1 % to 4.0 % |
| City with the lowest output (its start = 100) | 111.2 | 109.0 | 108.2 to 110.0 |
| City with the highest output | 117.5 | 117.5 | 117.5 to 117.5 |

| All cities together, year 5 (8 worlds) | Feature 9 | Now | Range of the worlds now |
|---|---|---|---|
| Real output (start = 100) | 108.2 | 108.1 | 106.3 to 109.1 |
| Price level of output (start = 100) | 99.5 | 99.5 | 99.1 to 99.7 |
| Without work, mean of all cities and days | 0.39 % | 0.45 % | 0.35 % to 0.62 % |
| Without work, the worst city on its worst day | 3.0 % | 3.2 % | 2.9 % to 4.0 % |
| City with the lowest output (its start = 100) | 103.2 | 102.6 | 100.9 to 104.5 |
| City with the highest output | 115.5 | 113.9 | 109.0 to 116.4 |

The books are off by at most 2.4e-13 of the amount they are judged by. The outputs lie in the project files
(wirtschaft/staedte/befunde/feature10_check_30_4.txt and feature10_check_5_8.txt).

So the economies stand where they stood: the same rules with other random numbers and 4 % more heads. The
differences (0.2 points of output, 0.02 points without work, the lowest city 2 points lower) are within what
other seeds give or close to it; they were not taken apart further.

In the person panel (a click on a figure) the section "Wirtschaft" shows the part: "Arbeiter" or "Arbeiterin" with
the sector of the firm, its employees, the wage of the day, income, spending and savings, and a button to the
owner of the firm; "führt einen Betrieb"; "führt die Bank der Stadt"; "ohne Arbeit"; "nicht erwerbstätig". A day's
amounts are in pence, savings in pounds, shillings and pence. Pictures in the project files
(wirtschaft/staedte/befunde/feature10_fenster_*.png).

### What it does not change

- The rules of the model, the port, the merchants, the clock, the wage in money, the demand pull.
- The persons: nobody is born, dies, marries or moves yet, so who works stands from the day of the founding.
- The figures of a city in the place panel.

### Limits

- About 14,000 persons have no part: children and adults who do not work. They have no income and no consumption
  of their own. The model lets every active person consume alone; it has no family budget. 690 families (806
  persons, most of them living alone) have nobody who works and so nothing at all.
- Who owns a firm or the bank is drawn at random among those who work: a girl of 15 can own a firm. No source, no
  rule of inheritance or wealth.
- The wage is the firm's, not the person's: all employees of a firm are paid the same, and age, sex and the
  person's traits play no part.
- The amounts are in two places: the engine's lists, where they are computed, and the components, a copy of the
  day in 32 bits. Nothing reads the components back into the engine.
- The port can add and remove persons (src/agents.rs, lines 123 and 144; BeforeIT.jl src/utils/modify.jl), but
  that is not tried here. Birth and death will need it, and the daily clock does not follow a change in the number
  of firms.
- The wage shown is what the port books: the firm's wage in money times the effort of its people, times the change
  of the consumer price level within the day (below 0.1 % on a day after the first, about 1.2 % on the first day, measured with London).
  That last factor has been in the wage in money since feature 7 (the real wage is set from the price level of the
  day before, the income is computed with the price level of the day); the person's row made it visible. It was
  not changed here.
- The participation rates are those of the nineteenth century, carried back by the authors, and are applied to
  every city from Cairo to Paris.
- The founding day decides who works: a person who turns 15 later does not start to work until the economies are
  founded anew.
- In a world of 1291 the cities are those of 1291, but each is still England in 1356 at its share.

## 11. The family is the purse, and a woman without a husband works

Status: built; in the running world since 16 November 2026 (pull request 49, world server release 16: the world
of 1291 resumed at day 83 with the economies of its 30 cities founded anew on that day). After feature 10 Ramon chose the next feature on
16 November 2026: "Haushalt der Familie" (17:50 UTC). The proposal (Claude Doc "Feature 11: Haushalt der Familie")
offered two variants, and he chose "B: Kasse, Frauen ohne Mann arbeiten" (18:01 UTC): the family becomes the
purse, and a woman without a husband works, so that the economies of a running world are founded anew. Player wiki: docs/wiki/wirtschaft/haushalt-der-familie.md.

### What it is

Two things, both outside the engine. The port computes as before.

**The purse** (`src/sim/systems/household.ts`). The model knows single persons: every person spends the share ψ of
the own expected income, C = ψ · Y / (1 + τ_VAT) (port `src/households.rs`, function `budget`, line 83; BeforeIT.jl
`src/agent_actions/households.jl`, lines 96, 115, 134 and 150; appendix A.46), and saves the rest (A.54;
households.rs line 124, households.jl line 182). Its persons who do not work are persons of the model who live on
social benefits of the state (households.rs line 43; households.jl line 45: "Inactive households do not
participate in the labor market and receive social benefits provided by the government", Poledna, Miess and Hommes
2020, section 3, p. 8; in Austria 4.13 of 8.86 million persons, table 1, p. 9). The cities pay no benefits and keep
one such person each, so the children and the adults who do not work, more than half of the persons of a city, had
neither an income nor a consumption (the first limit of section 10).

Now they live on their family, as the history of English working families counts it. Horrell, Humphries and
Weisdorf (2022, "Beyond the male breadwinner: Life-cycle living standards of intact and disrupted English working
families, 1260–1850", Economic History Review 75(2), 530 to 560) add up "family incomes from the contributions of
all family members" (p. 531) and set the family's needs against them: "Adults are each assumed to consume a whole
consumption basket, children just one-half" (p. 540); children "became independent at age 15" (p. 538). The rules:

1. The income, the spending and the savings of a family are the sums over its members of what the economy
   computed for them on the last day.
2. A person aged 15 or more is one basket, a child under 15 half a basket, on the day up to which the economies
   are computed.
3. A person's consumption is the family's spending times the person's baskets over the baskets of the family.

The purse is a booking of the world and no rule of the model: nothing reads it, the engine's state is the same to
the bit with and without it, and nobody goes hungry in a family that spends nothing.

**A woman without a husband works** (`src/sim/systems/work.ts`). The same paper assumes that a wife worked little
"except when the family lacked an income-generating husband when we assume that the wife worked full-time"
(p. 535; "the lack of adult male support dramatically reduces family earnings and forces the mother to work
full-time", p. 548). So the woman at the head of a family that has no man at its head, and a woman who lives on
her own, always works from the age of 15. In the worlds as they are founded these are all women living alone: no
family has a mother without a husband yet, because nobody dies. The other women of the city are drawn at the rate
(0.43 · W − H) / (W − H), W the women of working age of the city and H those without a husband, so that the
table's 43 % of all women is still expected to work. That lower rate is our arithmetic, not a source. The men are
drawn as before.

### Entries of the world

- Family (`FAMILY_SCHEMA`): `persons`, `working`, `baskets`, and of the last day `income`, `spent`, `savings`.
- Person (`PERSON_SCHEMA`): `consumed`, the person's share of the family's spending.
- Written after every day of the economy, with the persons and firms (`writeAgents`), and on the day of the
  founding. A world without economies has no purses: everything is 0.
- The world server gives a person with the `household` of the family (`/person/<id>`, `src/net/people.ts`).

### The numbers

The reference world (start 1356, seed 1356) and a world of 1291 with the seed of the running world, on the day
they are founded, against feature 10:

| | World of 1356, feature 10 | now | World of 1291, feature 10 | now |
|---|---|---|---|---|
| Persons who work | 11,755 | 11,725 | 11,455 | 11,454 |
| of them workers | 8,801 | 8,779 | 8,577 | 8,571 |
| owners of a firm (= firms) | 2,925 | 2,917 | 2,848 | 2,853 |
| Women aged 15 or more | 8,746 | 8,746 | 8,477 | 8,477 |
| of them without a husband (all work now) | 1,189 | 1,189 | 1,211 | 1,211 |
| Women who work | 43 % (drawn) | 3,739 = 42.8 % | 43 % (drawn) | 3,680 = 43.4 % |
| Rate at which the other women are drawn | 43 % | 34.0 % (23.9 % to 42.4 % by city) | 43 % | 33.5 % (22.3 % to 43.0 % by city) |
| Families without a person who works | 690 of 6,568 (806 persons) | 53 (199 persons) | 738 of 6,454 (861 persons) | 54 (201 persons) |

The families that still have nobody who works are couples of which neither the man (2.9 % of the men do not work)
nor the wife is drawn, with their children: in the world of 1291 54 men, 61 women and 86 children.

The households of the world of 1291 on day 60: 20,694.5 baskets for 24,828 persons; a family has an income of
1.05 d a day per head and spends 1.24 d per basket (a worker with work is paid 2.07 d). By person, what the family
spends per basket: a tenth of the persons have 0.40 d or less, the median 0.93 d, a tenth 1.91 d or more. 245
persons live in the 67 families that spend nothing that day; with feature 10 it was 881 persons.

### State and upgrade

State version 14 (13 is main's: a world of 1291 has the borders of its setup again). The upgrade gives the families their purse and
the persons their consumption, and it founds the economies anew on the day the world has reached, as the step to
12 did: who works has changed, so the days and the yearly figures of the economies are gone, and the first period
is the next day of the world.

Tried with the real server code, laid out as the image: a world of 1291 of state version 12, as the running world
has it, at day 175 was resumed by the new server at day 175 as version 14, computed on and answered `/person/<id>`
with the household. Writing the purses costs about 2 ms a day on the machine of the tests.

### Tests

`tests/economy-households.test.ts` (20 tests, new): in the worlds of 1356 and of 1291 every woman without a husband
works, every city keeps the table's share of women at work within three standard deviations of the draw (all
cities together within one point of 43 %), fewer than one family in a hundred has nobody who works and no woman on
her own is among them; a man works by his own draw as before; the rate of the other women (also where the women
without a husband are more than the share); the same draw for the same seed. The purse: persons, persons who work
and baskets of every family; income, spending and savings are the sums over the members to the bit; the families of
a city add up to its persons and their savings to the deposits of the households of the city's books; the
consumption of the persons of a family adds up to its spending, two adults consume the same and a child half; the
child with the next fifteenth birthday is a whole basket from that day and does not start to work; the engine
computes the same 20 days to the byte without the world; everything is 0 in a world without economies. The state:
a saved world goes on as the running one; a world of version 13 gets purses and consumption by the upgrade, with
the economies founded anew and every woman without a husband at work, and computes on. The server gives a person
with the household, and the panel shows it.

`tests/economy-persons.test.ts` (16 tests): the test of the upgrade from version 11 now follows the men, because
the rate of the women of a city moves with its women of working age.

`public/data/economy_cities.json` is written anew (the reference world has 11,725 persons who work). London, the
city the tests of the engine compute, still has 292, so they pass unchanged, the measured bounds of `benefit.rs`
and `demand_pull.rs` included.

All tests: 1027 of the game (with main of 16 November 2026, 18:02 UTC), 53 of the engine.

### In the game

`npm run economy:check 30 4` and `npm run economy:check 5 8` as in section 10 (worlds of 1356, the seeds 1356 on),
every day computed:

| All cities together, year 30 (4 worlds) | Feature 10 | Now | Range of the worlds now |
|---|---|---|---|
| Real output (start = 100) | 116.0 | 116.3 | 115.9 to 116.7 |
| Price level of output (start = 100) | 95.1 | 95.2 | 94.4 to 95.8 |
| Exports, share of output | 2.67 % | 2.65 % | 2.63 % to 2.67 % |
| Imports, share of output | 2.67 % | 2.66 % | 2.64 % to 2.67 % |
| Without work, mean of all cities and days of the 30 years | 0.09 % | 0.07 % | 0.07 % to 0.08 % |
| Without work, the worst city on its worst day | 3.4 % | 3.2 % | 2.9 % to 3.7 % |
| City with the lowest output (its start = 100) | 109.0 | 111.8 | 108.6 to 115.2 |
| City with the highest output | 117.5 | 117.5 | 117.4 to 117.5 |

| All cities together, year 5 (8 worlds) | Feature 10 | Now | Range of the worlds now |
|---|---|---|---|
| Real output (start = 100) | 108.1 | 108.2 | 107.1 to 109.3 |
| Price level of output (start = 100) | 99.5 | 99.7 | 99.0 to 100.0 |
| Without work, mean of all cities and days | 0.45 % | 0.41 % | 0.31 % to 0.46 % |
| Without work, the worst city on its worst day | 3.2 % | 3.1 % | 2.6 % to 3.7 % |
| City with the lowest output (its start = 100) | 102.6 | 103.0 | 102.4 to 103.6 |
| City with the highest output | 113.9 | 113.5 | 111.6 to 115.9 |

The books are off by at most 2.0e-13 of the amount they are judged by. The outputs lie in the project files
(wirtschaft/staedte/befunde/feature11_check_30_4.txt and feature11_check_5_8.txt).

So the economies stand where they stood. The purse changes nothing in them; the new draw of the women gives the
cities other persons who work and so other random numbers, and the differences are within what other seeds give
(output 0.3 points, without work 0.02 points). They were not taken apart further.

In the person panel the section "Haushalt" shows, for every person of a city: the persons of the family, those of
them who work, the income and the spending of the family on the day, the person's own consumption and the savings
of the family. Pictures in the project files (wirtschaft/staedte/befunde/feature11_fenster_*.png).

### What it does not change

- The rules of the model, the port, the merchants, the clock, the wage in money, the demand pull.
- The men who work, the owners' draw, one firm for every four persons of a sector.
- The persons: nobody is born, dies, marries or moves.

### Limits

- The purse is a booking. No rule of the model reads it: a person still spends the share ψ of the own income, the
  family does not decide together, and nobody starves when the purse is empty.
- The weights of the baskets (1 and ½) are the paper's assumption for English working families on the land, and
  are applied to every city. The paper also lets children work from the age of six; here nobody under 15 works.
- A family is the couple and its unmarried children. No servants, no kin outside the family, no payments between
  families (the paper rules out transfers between generations too, p. 538).
- The savings of a family are a sum: in the engine every person who works still saves alone.
- 54 families (201 persons) of the world of 1291 still have nobody who works.
- That a woman without a husband works is the paper's assumption; the lower rate of the other women is our
  arithmetic. It differs from city to city (22 % to 43 %), because the share of women living alone does.
- All women without a husband are women living alone, about one woman in seven: the people of the start have no
  widows with children, because nobody has died.
- The 43 % stay the rate of the nineteenth century (section 10).
- Not read: the online appendix of Horrell, Humphries and Weisdorf (tables S2 and S4) and the last 18,000 of the
  118,613 characters of the paper's file; the journal version of Poledna et al. (the working paper of 2020 was
  read, the equations are cited from the code).
- Considered and left out: the dependants as persons of the engine, paid by their family in place of the state.
  It would double the engine's persons, need rules of our own beside the port and a new founding, and because the
  model's consumption is linear in income with one ψ for all, the cities' figures would stay the same (reasoned
  from the code, not measured). And the modified OECD scale (1.0 / 0.5 / 0.3): it compares households of today.

## 12. The harvest feeds the cities: a city buys the food its harvest lacks

> **Taken back on 17 Nov 2026.** The code of this feature is no longer in the game (state version 20 again). The
> section stays as the record of what was built and measured. Why it was taken back: section 14.

Status: built; not yet in the running world. Ramon chose the feature on 17 November 2026 ("Ernte speist die Städte",
15:49 UTC) and variant A of the proposal (Claude Doc "Feature 12: Ernte speist die Städte",
https://claude.ai/artifact/8GGxSGubnLXmtTqh9HrUng): the factor of the harvest of a city's own place, Egypt for the
time being as England ("A, Ägypten vorerst wie England", 15:54 UTC). The way proposed there, the port's productivity
shock on agriculture alone, did not hold (below), and neither did the factor in the calibration alone; he chose that
a city with a weak harvest buys its food from the merchants ("Getreide über die Händler kaufen", 16:03 UTC) and agreed
the rule as proposed ("Ja, so bauen", 16:16 UTC). Player wiki: docs/wiki/wirtschaft/getreide-ueber-die-haendler.md.

### What it is

Every city is founded with the factor of its harvest (`harvestFactors`, src/sim/systems/economy.ts):

    f_c = (Y_c / L_c) / (Y_E / L_E)

Y_c is the harvest of the city's place (feature 1, with the arable of feature 2), L_c the persons of its hamlets, who
live from agriculture; Y_E / L_E is the harvest per farmer of England in 1300–09, the case the harvest is calibrated
on (1,678 kcal per farmer and day). London has 1.04, Ghent 1.04.

The value added of the city's agriculture per person who works there is England's times f_c; industry and services
keep theirs, and the persons of every sector stay as they are (`withAgriculture`, src/sim/economy/calibration.ts). So
everything the port's calibration derives from the value added of agriculture follows it: output and inputs, the
output per employee (the port's labour productivity `alpha_s`, times f_c exactly), the wage and the capital.

The households of the city buy as much of the goods of agriculture as England's at the same scale. What the city's
agriculture lacks for that, d, the merchants bring (`tradeFood`):

    d = H_agr(England) − H_agr(what is left);  M_agr += d;  X_g += d · H_g / (H_ind + H_serv);  H_g −= the same

The city pays with as much more exports of industry and services, taken from what its households buy of those, in
proportion. A city with a surplus (d < 0) exports goods of agriculture, and its households get as much more of
industry and services from imports. Trade is balanced at the start, GDP does not change by it, and every other use
of every good stays as it is: supply equals use. The mixes of exports and imports of the city (`c_E_g`, `c_I_g`)
follow; the rules of the merchants (section 5) do not change.

Assumptions, not sources: that every person eats as much as a person in England in 1356; that food is paid for with
industry and services in proportion to what the households buy of them; and that the cities of Egypt, and places
whose harvest is 0 because the index of the soil knows rain-fed farming only (Mecca, Aden, Timbuktu and others in
the world of 1291), keep England's agriculture (f = 1). Egypt is the region of the province of the place (`egypt`),
because the list of the cities of 1291 often names no country.

### What did not hold

1. The proposal: the port's ProductivityShock on the firms of agriculture alone, at the founding. The wage stays
   England's while the output per employee falls, so the cost of a unit rises by 1 / f; the cost push of the clock
   divides by `alpha_bar_i`. In all eight worlds of `npm run economy:check 5 8` Venice (f = 0.21) reached a negative
   price within 4 to 7 months and the economies stopped.
2. The factor in the calibration alone, without trade: in England's table every other use of the goods of agriculture
   is fixed in pounds (inputs to industry and services, wool exports, the crown, investment), so the whole change
   lands on what the households eat: a quarter of England's at f = 0.5, nothing below 0.35 (the calibration stops:
   Venice, Genoa, Paris), two and a half times at 1.86.

### Founding and state

A city's factor needs the harvest, the harvest needs the hamlets, and who lives in a hamlet follows from the firms of
agriculture (src/sim/systems/hamlets.ts). So a world founds its economies, settles the hamlets, counts the people and
brings in the harvest as before, and then founds the economies anew with the factors (`foundWithHarvest`). The factor
changes no count of persons, so who works where, the hamlets and the harvest come out the same (tested: a fixed point).
The factor is set when the economies are founded; it is not set again each year, because the harvest of a place does
not change while nobody is born or dies.

State version 21: the economies carry `harvestFactor`. The upgrade founds the economies anew with the factors on the
day the world has reached, as the upgrade of feature 11 did: the days and the yearly figures of the economies are
gone, and the first period is the next day of the world. A world of 1291 now founds its 550 economies twice when it
is created (about ten seconds on the machine of the tests).

### Tests

`tests/economy-harvest.test.ts` (new): the factor is the harvest per farmer against England's and is what a new world
was founded with; London and Ghent lie near 1, Egypt is 1, also in the world of 1291 where its rows name no country;
a city founded at 0.21, 0.5 and 1.86 has the value added, the output per employee and the wage of agriculture times
the factor and the other sectors as England, households that buy England's food, balanced trade and balanced
accounts; at 1 it is England's city number for number; down to 0.05 it can be founded, 0 and less are refused; the
trade in food by hand in both directions; a new world is a fixed point of `foundWithHarvest`; the cities compute 40
days with the books balanced; a world of version 20 gets the factor by the upgrade.

Changed: `tests/economy.test.ts` (a city's GDP is England's share times the value added with the factor; the test of
the merchants' shares compares the cities whose factor is within 10 % of 1; London's GDP), the upgrade tests of
features 10 and 11 (step 21), `tests/rulers.test.ts` (a timeout of 60 s: the world of 1291 founds its economies twice).
`public/data/economy_cities.json` is written anew with the factors. Engine (`economy/tests`): London of the reference
world changed, so the measured bounds were measured again over twelve seeds: `agents.rs` (the wage paid off the wage
in money up to 0.22 % on a day, bound 0.3 %), `demand_pull.rs` (the seeds with the slump of the paper's rule are now
1357, 1358, 1363, 1365, 1367; with the demand pull up to 4.5 % without work in the first six years, none after; without
the wage in money the level leaves by a quarter in ten of twelve seeds), `benefit.rs` (four cities whose factor is
near 1, Cairo, Ghent, Alexandria and London, in place of Paris and Venice, which now buy their food).

### In the game

`npm run economy:check 30 4` and `npm run economy:check 5 8` (worlds of 1356, seeds 1356 on, every day computed).
Outputs in the project files (wirtschaft/feature12/feature12_check_30_4.txt and feature12_check_5_8.txt).

| All cities together, year 30 (4 worlds) | Feature 11 | Now | Range of the worlds now |
|---|---|---|---|
| Real output (start = 100) | 116.3 | 113.4 | 113.1 to 113.7 |
| Price level of output (start = 100) | 95.2 | 88.9 | 88.4 to 89.2 |
| Exports, share of output | 2.65 % | 16.89 % | 16.45 % to 17.62 % |
| Without work, mean of all cities and days of the 30 years | 0.07 % | 0.26 % | 0.17 % to 0.38 % |
| Without work, the worst city on its worst day | 3.2 % | 12.8 % | 10.2 % to 17.0 % |
| City with the lowest output (its start = 100) | 111.8 | 82.5 | 64.3 to 93.9 |
| City with the highest output | 117.5 | 117.6 | 117.6 to 117.6 |

| City (world 1356) | Factor | Output in year 30 | Price level | Exports | Imports |
|---|---|---|---|---|---|
| London | 1.04 | 117.6 | 98.5 | 12.2 % | 4.1 % |
| Texcoco | 1.86 | 115.3 | 93.6 | 29.8 % | 26.7 % |
| Milan | 0.59 | 113.1 | 86.4 | 15.3 % | 22.8 % |
| Damascus | 0.38 | 111.1 | 64.4 | 20.7 % | 36.9 % |
| Genoa | 0.25 | 105.8 | 67.8 | 36.1 % | 48.2 % |
| Baghdad | 0.37 | 105.2 | 72.5 | 25.7 % | 37.5 % |
| Paris | 0.35 | 102.4 | 77.3 | 28.1 % | 38.6 % |
| Venice | 0.21 | 93.9 | 65.9 | 38.0 % | 51.3 % |

Year 5 (8 worlds): all cities 108.2 (feature 11: 108.2), Venice 83.0, the weakest city 75.4 (58.2 to 83.3). The books
are off by at most 5e-11 of the amount they are judged by. A world of 1291 (550 cities, factors 0.16 to 2.60, mean
1.42) computes a year without stopping: all cities 99.7, the weakest 67.

### Limits

- A city that buys more than it sells pays with money that leaves it: it lies as the merchants' deposits at the
  city's central bank (the port's `D_RoW`). No rule of the model reads it, and it grows without bound: Venice 7 years
  of its GDP after 20 years, Paris 4.4; in cities with a surplus it is negative. Trade does not come back into
  balance, because the merchants order by the fixed import shares of the cities. Where the money comes from, and
  why no rule was built against it, is section 13.
- The cities of 1356 together want more food than the others sell: most have a factor below 1. In the world of 1291
  it is the other way round (mean 1.42).
- The factor is set when the economies are founded and not again: no good or bad years (a candidate for a feature of
  its own: yearly yields).
- Everyone eats as much as an Englishman of 1356, in Cairo as in Paris; nobody starves when the food is dear.
- Egypt and the places without a rain-fed harvest are England by assumption, until a source for irrigated land is
  read.
- The harvest of the city's own place only: Paris, Venice and Genoa have little arable in their place and no
  hinterland (variant B of the proposal, not chosen).
- The kilocalories of the harvest and the pounds of the port are linked by a ratio only: the value of the output of
  agriculture per farmer is taken to rise as its kilocalories do.

## 13. The merchants' money: examined, nothing built

> The numbers of this section were measured with feature 12 in the game. Section 14 shows that the growth of the
> merchants' money came from feature 12 itself; without it the stocks stay near their start.

Feature 12 left a limit: the merchants' deposits in a city that buys more than it sells (`D_RoW`) grow without
bound. Ramon chose to work them down, as near to the papers as possible. No rule was built, because no paper that
was read gives one that fits what was measured. This section records what was read and measured, so that the
question is not asked again from the start.

### What was measured

One world of 1356 (seed 1356), 29 cities, 20 years, at the scale 1:100, in pounds (the figures of every city and
year: `/mnt/project-files/wirtschaft/feature13/bilanz_20_jahre.txt` in the project files, with the trial program).

| City, year 20 | Merchants' deposits | Households' deposits (start) | Firms' deposits | Equity of the bank (start) | GDP a year |
|---|---|---|---|---|---|
| Paris (buys more) | +9302 | 8756 (792) | −2366 | −13326 (50) | 2300 |
| Venice (buys more) | +3111 | 2790 (309) | −821 | −4711 (19) | 549 |
| Cairo (sells more) | −12898 | 12354 (1204) | 297 | 75 (75) | 7162 |

- The counterpart of the merchants' money is the city's bank, not its households. In a city that buys more, prices
  fall (Paris 79, Venice 83), the wage in money stays (feature 7), the firms lose and become insolvent. By the
  port's rule (A.38 to A.40, A.67) the firm is replaced and its bank writes off the debt. The bank's equity falls
  without bound (Paris: minus 5.8 years of GDP), and it is overdrawn at the central bank. No rule of the port stops
  a bank with negative equity; the capital requirement only stops new loans, not overdrafts.
- The households' deposits grow about tenfold in all 29 cities, in Cairo as in Paris: they spend a fixed share of
  their income (A.46) and save the rest for ever.
- The port's own wage (a real wage times the price level) is no way out: with the demand pull of feature 8 the
  cities compute no finite numbers by year 5.

### What was read

Read through a fetching tool that returns the text; quotations are from that text. What was not read is said.

- Godley (1999), "Open Economy Macroeconomics Using Models of Closed Systems", Levy WP 281. Model 1, a fixed rate
  settled in gold: "no mechanism which corrects an emergent deficit in the balance of payments" but the fall of
  output; "there is simply a drop in reserves which continues until they run out". "No vestige of the
  'price-specie-flow' mechanism survives, even when all foreign balances are settled in gold."
- Godley & Lavoie (2003), "Two-Country Stock-Flow-Consistent Macroeconomics Using a Closed Model Within a Dollar
  Exchange Regime", CERF WP 10. Imports in logs, eq. (20), with a price and an output term; no values given. At a
  fixed rate "there is no corrective mechanism in operation"; when gold runs out "the government is forced to act".
- Godley & Lavoie (2007), Monetary Economics, ch. 6, Model REG (two regions, one money): not the book, but two
  reproductions with all equations and values (the R packages sfcr and godley). IM = μ·Y, V = V₋₁ + YD − C,
  C = α1·YD + α2·V₋₁ with α1 = 0.7, α2 = 0.3, μ = 0.15. Here the households of the region that buys more lose
  wealth and spend less. In our cities they do not lose wealth (see above), so this rule would not close the gap.
- Caiani & Catullo (2023), LEM WP 2023/19, a currency union: purchases are paid from deposit to deposit, wages
  follow unemployment (eqs. 1, 15), no rule for the trade balance. Appendix and values not read; Caiani, Catullo &
  Gallegati (2018) was not freely readable.
- Poledna et al. (2023), main text only (the appendix was not reachable; the rules are known from the port's code):
  credit is bound by the capital ratio; nothing on a bank with negative equity or a limit of the central bank's
  advances.
- Hommes et al. (2022), CANVAS, Bank of Canada SWP 2022-51, up to section 3.7: "When bank capital and leverage
  requirements are not met, no lending can take place", and nothing else follows; interest on deposits "generate[s]
  no wealth effects on consumption" (footnote 8); the wage (eq. 21) answers neither unemployment nor prices; the
  rest of the world is closed "via the accounting identity" (eq. 57).
- Wiese et al. (2024), arXiv 2409.18760, and Jaraiz & Pinacho (2024), arXiv 2409.04876: no rule for deposits of
  the rest of the world or for the trade balance.

### Why nothing was built

The family of models the cities stand on has no rule at any of the three places where the gap could close (the
bank, the wage, the households' wealth): it was built to forecast a few years, not thirty. The rules found
elsewhere either miss the counterpart that was measured (consumption out of wealth) or have no values that were
read (a wage that follows unemployment; a price term of imports). A rule of our own would have closed the books
with numbers nobody measured.

### Candidates, each needing a source first

- A wage that follows unemployment, as in Caiani, Catullo & Gallegati (2018): it meets the cause, the firms that
  lose because the wage does not fall. Needs the paper with its equation and values.
- A limit for a bank without equity (no overdraft for its firms): an extension of the rule of CANVAS, and ours.
- A stock of coin for every city that can run out, as the gold of Godley & Lavoie: needs a source for the coin of
  the cities around 1356.

## 14. The check of the model, and feature 12 taken back

Ramon asked on 17 Nov 2026 to check the model cleanly before anything else is built: does everything add up?
The books do. The economy with feature 12 did not, and feature 12 was taken back.

### What adds up

| Check | Result |
|---|---|
| Tests of the game (with feature 12) | 1150 of 1150 pass (40 files) |
| Tests of the engine (`economy/`) | 62 of 62 pass |
| Identities of every city and the merchants' books, 30 years, 4 worlds (with feature 12) | off by at most 9.1e-10 of the amount they are judged by |
| Sum of the merchants' deposits over all cities, 20 years | stays at 6 to 7 pounds: what one city loses another gains |

### What did not add up: the cities' trade together

Feature 12 calibrated every city balanced on its own (exports = imports). Summed over the 29 cities of 1356, pounds
a year at the scale 1:100, at the start:

| | Agriculture | Industry | Services |
|---|---|---|---|
| Exports the cities expect | 2669 | 3601 | 2637 |
| Imports the cities expect | 6522 | 1738 | 646 |

3853 pounds of food a year are missing (about 9.5 % of the GDP of all cities), and as much industry and services
finds no buyer: most cities have a factor below 1, each pays for food with industry and services, and nobody buys
those and sells food. Section 12 named this as a limit; its weight was misjudged. Before feature 12 the trade by
product did not match either (agriculture: exports 1317, imports 443), at a tenth of the size.

What follows from it, one world of 1356, 20 years (`/mnt/project-files/wirtschaft/feature13/` in the project files:
`bilanz_20_jahre.txt` with feature 12, `bilanz_20_jahre_vor_feature12.txt` without):

| After 20 years | Without feature 12 | With feature 12 |
|---|---|---|
| Merchants' deposits of a city, in years of GDP | −0.12 to +0.07 | −1.80 to +7.22 |
| Households' deposits, in years of GDP (start 0.2) | 0.18 to 0.66 | 0.76 to 7.06 |
| Lowest equity of a bank, in years of GDP | −0.20 | −11.97 |
| Cities whose bank has negative equity | 20 of 29 | 19 of 29 |
| Lowest price level of a city (start 1) | 0.90 | 0.64 |
| Real output of all cities (start 100) | 115.9 | 111.2 |

Without feature 12 the stocks stay near their start. With it they run away. The growth of the merchants' money
(section 13) was therefore a fault of the construction of feature 12, not a missing rule of the papers.

### What stays open without feature 12

- 20 of 29 banks have negative equity after 20 years, though little (at most 0.2 years of GDP): firms fail, the
  bank writes off, and no rule of the port stops a bank with negative equity (section 13, what was read).
- The trade by product does not match at the start (England's exports of wool and cloth in every city).

### What was decided

Ramon chose to take feature 12 back (the other ways: food from the countryside around the cities, or a factor
normed to the world). The code, the state (version 20), the calibrations (`public/data/economy_cities.json`) and
the tests are those before feature 12. The trade in food is to be built anew with consumption and hunger: the
food that is missing is the question hunger answers.

**For every later calibration:** check the position of all cities together, product by product, not only each
city on its own.

By Ramon's order the next features are the distance in trade, then consumption and hunger; no yearly yields.

## 15. Households spend out of their savings, and a family has a need of food

### Why

The trials of the distance in trade (17 November 2026, outside the game; the proposal
https://claude.ai/artifact/9Gt22ijoL8Xdqx4cfLM7NV holds them) showed remote cities falling into a slump within 30
years (Sarai: output 69 of 100, 21 % without work). The cause is not the distance. It is in the model as the game
runs it, and shows without any distance, only later (29 cities, world of 1356, sums over all cities and all days of
a year, `economy/examples/longrun.rs`):

| Year | Firms' deposits | Households' deposits | Banks' equity | Consumption wanted | got | Stock built | Losses | Written off by banks |
|---|---|---|---|---|---|---|---|---|
| 1 | 2045 | 8949 | 551 | 40858 | 40725 | 159 | 0 | 0 |
| 10 | 1679 | 10406 | 551 | 45400 | 44912 | 381 | 202 | 0 |
| 20 | −2082 | 20233 | −2398 | 45786 | 44564 | 723 | 666 | 794 |
| 30 | −5540 | 32879 | −13972 | 45675 | 44502 | 727 | 767 | 1345 |

Two things work together:

1. Households do not get everything they want to buy (2.6 % is missing in year 30). What they did not spend stays in
   their deposits for ever, because the budget follows the income only: C = ψ · Y (A.46), and in the calibration
   ψ + ψ_H = 1. The interest on deposits is 0 (`r_bar`), so no interest is behind it (a first guess that was wrong).
   Poledna et al. say so themselves: no wealth effects on consumption. Their model is run for 12 quarters, the game
   for centuries of days.
2. Firms count unsold goods as profit (`firms_profits` of the port: sales plus the change of the stock at the
   price) and pay the whole profit out (θ_DIV = 1 in our calibration, where the whole surplus is the income of the
   owners), while losses stay in the firm. So their deposits drain, they overdraw, become insolvent, and the bank
   writes off (A.38 to A.40). From year 15 on banks have negative equity.

This feature answers the first. The second stays open (below).

### What was read

- Godley, W., Lavoie, M. (2007). Monetary Economics. Model SIM, equation 3.7: C = α1 · YD + α2 · H₋₁, households
  consume out of their disposable income and out of the wealth of the period before; with equation 3.9 (wealth grows by
  what is not consumed) this is a target for wealth relative to income, (1 − α1) / α2. Parameters 0.6 and 0.4. **Read
  in the recomputation of MacroStat** (https://macrostat.readthedocs.io/en/stable/models/GL06/GL06SIM.html and its
  pages of equations and parameters), not in the book; the pages do not name the length of a period.
- Allen, R. C. (2013). The High Wage Economy and the Industrial Revolution: A Restatement. Oxford Discussion Papers
  in Economic and Social History 115. https://www.nuff.ox.ac.uk/Economics/History/Paper115/allen115.pdf Table 2
  (p. 16): the "respectability" and the "bare bones subsistence" basket per person and year, note: "each basket
  provides 2100 calories per day"; on the older basis the baskets held 1,940 calories (p. 4).
- Broadberry et al. (2010), table 19 (p. 56), read again: kilocalories per head and day, animal products and arable
  crops net of seed, losses and fodder: 1300/09 139 + 1,242 = 1,381; 1310/19 1,334; 1380/89 242 + 1,801 = 2,042;
  1420/29 1,760. **The table has no row between 1310/19 and 1380/89.** The same paper sets about 1,500 kcal as what
  agriculture had to give and cites 2,000 kcal as an average intake (Livi-Bacci 1991; p. 29).
- Blanz, A. (2023). Climate-related Agricultural Productivity Losses through a Poverty Lens. arXiv 2310.16490.
  A household must cover a subsistence level of food F before anything else (utility of Stone 1954 and Geary 1950,
  cited there, not read); demand (equations 5 and 6): c = φ(y − pF), f = (1 − φ) y / p + φF. First half read word for
  word. The paper has no rule for a household whose spending is below pF.
- Not used as evidence: Ivanova, Kancs, Thissen (2019, arXiv 1912.07115) use the same form for all goods; the
  appendix with the equation could not be read.

### The rule

**1. The budget (the engine, `economy/src/clock.rs`).** Through the port's own hooks for the budgets of the four
kinds of households (`households_budget_*`), nothing else of the port is touched:

C = ψ · Y + s · (D − n · ψ · Y), never below 0

D are the household's deposits, n the deposits of all households of the city over their budgets in the first period
that is computed (so the households together start at their target and the starting position stays where it was),
s the share of the gap spent per period. The table gives s per year (`cities.savings_spent_per_year` = 0.4, the α2
of Godley and Lavoie, taken per year: an assumption), the engine gets s / 365. With s = 0 the engine computes bit
for bit as before (economy/tests/savings.rs). The market of the port is unchanged: every household still splits what
it buys by the fixed shares b_HH_g (`src/markets.rs` of the port).

**2. The need (the world, `src/sim/systems/household.ts`).** A basket needs 2,100 kcal a day
(`cities.food_need_kcal`). What they cost follows from the model: the households of the table buy from
agriculture per head and day what stands for 2,042 kcal (`inputs.food_kcal_per_head`), so the need of a basket
costs that amount times 2,100 / 2,042 at the prices of the start (`foodNeedCost`: 0.37 d a day), and on a later
day times the price of the city's agriculture (the mean price of its farms, weighted by what they made).

**3. Fed.** A family covers its need first (Stone-Geary), so the part of its need it covered on the last day is
fed = min(1, spent / need). The family has the columns `need` (£ a day) and `fed` (0 to 1); `need` 0 means the place
has no economy. The panel of a person shows both ("Nahrungsbedarf am Tag", "davon gedeckt"). Nothing reads `fed`
yet: what hunger does to a person belongs to the persons of the world (docs/PEOPLE_DESIGN.md).

### The numbers

All cities together over 30 years (29 cities of 1356, `economy/examples/longrun.rs`, results in
`/mnt/project-files/wirtschaft/verbrauch_hunger/`):

| After 30 years | Port's budget (seed 1356) | With the spending out of savings (seeds 1356, 1357, 1358) |
|---|---|---|
| Real output of all cities (start 100) | 115.9 | 116.1, 115.8, 116.1 |
| Weakest city (start 100) | 112.0 | 113.5, 113.4, 110.8 |
| Households' deposits (start 8,949) | 32,879 | 14,578, 13,457, 14,341 |
| Firms' deposits (start 2,045) | −5,540 | −113, −2,173, −770 |
| Equity of all banks (start 551) | −13,972 | −731, −2,348, −816 |
| Banks with negative equity | 26 of 29 | 10, 17, 12 |
| Written off by the banks in year 30 | 1,345 | 71, 126, 56 |
| Consumption got over wanted, year 30 | 97.4 % | 96.1 %, 97.3 %, 96.4 % |
| Merchants' money of a city over its GDP | −0.16 to +0.09 | −0.13 to +0.15, −0.08 to +0.11, −0.34 to +0.23 |

The merchants' books balance in every year (largest check 1e-13).

The need in the game (`fed`, on the day named):

| | World of 1356, day 60 | day 730 | World of 1291, day 60 | day 365 |
|---|---|---|---|---|
| Persons in families of the cities | 25,722 | 25,722 | 102,217 | 102,223 |
| fed = 1 | 92.2 % | 92.0 % | 92.1 % | 91.8 % |
| fed 0.75 to 1 | 4.0 % | 4.2 % | 3.5 % | 3.8 % |
| fed 0.5 to 0.75 | 2.3 % | 2.4 % | 1.8 % | 1.8 % |
| fed above 0, below 0.5 | 0.7 % | 0.6 % | 0.6 % | 0.7 % |
| fed = 0 | 0.9 % | 0.8 % | 2.0 % | 1.9 % |
| Of the persons below 1: the family holds savings of more than 30 days of its need | 88 % | 89 % | 74 % | 75 % |

With the fixed share of the port for every family (35.5 % of what it spends is agriculture) 69 % of the persons
would lie below the need (measured before the build, world of 1356, day 60).

### Deviations and what stays open

- **Short of food with coin in the chest.** About 8 % of the persons live in families that spend less than their
  need, and three quarters or more of them hold savings of more than a month of that need. These are large families
  on one low wage. By the rule they spend ψ of their income and 0.4 / 365 a day of what they hold above the target,
  whatever they need. A budget that covers the need first would be a rule inside the engine that the papers read do
  not give for this model; it is not built. Whoever reads `fed` must know this.
- **fed = 0** are the families nobody of whom has a part in the economy (economy feature 11: 53 families in the
  world of 1356): they have neither income nor deposits in the engine.
- **The day.** `fed` is of the last day, and on a single day a household may not find all goods.
- **2,042 kcal is the decade 1380/89**, not the 1350s: the table has no nearer row.
- **Agriculture is not food only** (wool), and bread and ale are partly industry.
- **0.4 a year** is a textbook value, read as per year by us.
- **The booking and the market differ.** The engine sells agriculture by fixed shares; the family is booked as
  covering its need first. The two are not the same number.
- **Firms pay out profits on unsold goods** (the second cause above): unchanged. Banks still end with negative
  equity, at a tenth to a sixth of the amount.
- **Households want more than they get**: the gap grows to 3 to 4 % of what they want.
- **No famine years.** Without yearly yields and without distance, hunger comes from the lack of work and from
  prices only.

### State and upgrade

State version 21 (20 is main's). The format of the engine's state is 7: the clock holds the share and the target;
states of formats 4 to 6 are read and spend nothing out of savings. The upgrade gives the families the two columns
and founds the economies anew on the day the world has reached, as the steps to 12 and 14 did: the rule changes
what every city computes. **The persons' feature 2 (pull request 69) also uses the state versions 21 and 22: the one
merged second has to take the next numbers.**

## 16. The crown of a city buys with what it took in

### Why

After feature 15 the distance in trade was tried again outside the game (29 cities of 1356, 30 years, four seeds,
goods that travel for days and a stock that answers to the price). The heavy slump was gone, but in one of the four
worlds one city sank steadily: Seville, seed 1356, to 90 of its start with 11.3 % without work. Ramon asked to clear
that before the distance is built.

The first reading, that Seville buys more than it sells, was wrong. In year 30 Seville sells 55 abroad and buys 31,
and the merchants have brought 421 into the city. The money lies with the crown of the city: it holds 457, which is
39 % of the city's output of a year, while the deposits of households and firms fell from 251 to 235.

The cause is the rule of the paper for the government. Its real purchases follow an autoregressive series of their
own (Poledna et al. 2023, appendix A.55 and A.56; `gov_expenditure` of the port): log C_G(t) = α_G · log C_G(t−1) +
β_G + ε. Nothing in it reads what the government takes in. Our values (section 4) are fitted to the revenue of the
English crown 1280 to 1356 (Bank of England workbook, sheet A26): persistence 0.952 and spread 0.168 a year, which
is a long-run spread of 0.168 / √(1 − 0.952²) = 0.55 around the mean and a half-life of 14 years. That is the
revenue of a whole realm at war. In the model every city draws its own path of it, and the revenue of the city's
crown (a tax on incomes) follows the city's economy, not that path. A crown whose path runs low takes in more than
it spends for decades and the money leaves the city's circulation; one whose path runs high owes.

### The trial

Outside the game, with the distance in trade (files in `/mnt/project-files/wirtschaft/entfernung/krone/`), 29
cities, 30 years, seeds 1356 to 1359:

| After 30 years | Series of the paper | Constant purchases | Buys with its revenue |
|---|---|---|---|
| Real output of all cities (start 100) | 112.5 to 113.5 | 112.9 to 113.3 | 113.9 to 114.1 |
| Weakest city (start 100) | 90 to 105 | 108 to 110 | 110 to 111 |
| Highest share without work in the 30 years | 3.6 to 11.3 % | 3.3 to 6.2 % | 2.8 to 5.3 % |
| Equity of all banks (start 551) | −1,451 to −3,594 | −87 to −185 | +395 to +527 |
| Banks with negative equity (of 29) | 8 to 13 | 3 to 6 | 1 to 2 |
| Debt of a city's crown over the city's GDP (negative: hoard) | −0.42 to +0.52 | −0.10 to −0.03 | −0.01 to 0.00 |

Seville, seed 1356: output 90 with the series, 114 with constant purchases, 115 with a crown that buys with its
revenue; nobody without work in year 30 in the last two.

### The rule

With `cities.crown` = `revenue` in the calibration table, the budget of the crown of a city for a day is

    budget(t) = max(0, Y_G(t−1) − other outlays(t−1))

Y_G is the revenue of the paper (A.59, unchanged). The other outlays are what the crown paid besides its purchases
that day, benefits and interest (A.60): the change of its debt plus its revenue less its purchases. In the game both
are next to nothing (benefit 1e-9 of the wage, no interest on the crown's debt). The budget is split among the
crown's buyers as in the port, and the real purchases the crown plans are the budget at the prices it expects. The
series of the paper is still computed and its random number drawn, so that every other draw of the day stays where
it was. On the first day nothing has been taken in yet, and the series stands: that day is bit for bit the day of
the rule before. `series` is the rule of the paper, unchanged.

The rule holds no value and no year. It is `gov_expenditure` and `gov_loans` of the extension in
`economy/src/clock.rs` (`DailyClock::crown_revenue`, `crown_outlays`), `Economy::with_crown_spending_revenue`, and
the last argument of `sce_create`.

**The ground.** No paper was read that gives this rule. It is the assumption of our own calibration (section 3:
"the crown spends its revenue"), kept in every period instead of at the start only; the series the random values
come from is a series of revenue. Kept apart from the paper it is a deviation: A.55 and A.56 drop out.

### The numbers

The state of the game without distance (`economy/examples/longrun.rs`, 29 cities of 1356, results in
`/mnt/project-files/wirtschaft/krone/`):

| After 30 years | Series of the paper (seed 1356) | Buys with its revenue (seeds 1356, 1357, 1358) |
|---|---|---|
| Real output of all cities (start 100) | 116.1 | 115.5, 115.3, 115.3 |
| Weakest city (start 100) | 113.5 | 113.0, 112.5, 112.5 |
| Firms' deposits (start 2,045) | −113 | 1,565, 1,442, 1,468 |
| Equity of all banks (start 551) | −731 | 551, 458, 502 |
| Banks with negative equity | 10 of 29 | 0, 2, 2 |
| Written off by the banks in year 30 | 71 | 0, 23, 0 |
| Consumption got over wanted, year 30 | 96.1 % | 97.7 %, 97.7 %, 97.8 % |
| Merchants' money of a city over its GDP | −0.13 to +0.15 | −0.07 to +0.05, −0.05 to +0.12, −0.06 to +0.13 |
| Debt of a city's crown over its GDP | −0.38 to +0.41 | −0.01 to 0.00, −0.02 to 0.00, −0.02 to 0.00 |

The merchants' books balance in every year (largest check 1e-13).

### Deviations and what stays open

- **Not the paper.** The purchases of the crown no longer follow A.55 and A.56. Output of all cities is 0.6 to 0.8
  points lower after 30 years than with the series in the one seed compared.
- **No years of war.** The spread of the crown's revenue (grants of parliament, wars on credit) is gone: the
  crown's purchases move with the city's economy only. War and credit of a realm are a matter of the game's realms,
  not of a random series per city; nothing of that is built.
- **The crown of a city is still the model's government**, one per city, and no realm of the game.
- **A small hoard remains** (1 to 2 % of a year's output after 30 years): the crown spends the revenue of the day
  before while revenue grows, and it does not always find the goods it wants.
- **The merchants' money still drifts apart.** With the distance in trade and a crown that buys with its revenue,
  the merchants' balances of the cities grow by about the same amount every year (−0.13 to +0.24 of a city's GDP
  after 30 years). No city suffers from it within 30 years (the weakest stands at 110). Over centuries it would go
  on. No rule was read that closes it (section 13); it stays open.
- **Two banks of 29 still end below zero** in two of three seeds; firms still pay out profits on unsold goods
  (section 15).

### State and upgrade

State version 24. The format of the engine's state is 8: the clock holds the rule and the other
outlays of the last day; states of formats 4 to 7 are read and keep the series. The upgrade founds the economies
anew on the day the world has reached, as the step to 21 did: the rule changes what every city computes. **The
persons' feature 2 (pull request 69) also uses the state versions 22 and 23: the one merged second has to take the
next numbers.**

## 17. Distance in trade: goods travel for days, and carrying costs labour

### The thought

Until now every city lay one day from every other and carrying cost nothing. Ramon wants a system that holds over
the centuries, not freight rates of one year. Freight is time times what a day costs: whoever moves goods needs
people and animals for as many days as the way takes. What a day costs the model says itself, in every city and
every year: the wage. Fixed are only technical quantities (how far a cart or a ship gets in a day, how much labour
a tonne-kilometre takes), and they change when the technique changes.

Read for it (notes in `/mnt/project-files/wirtschaft/entfernung/quellen_notizen.md`): in the Price Edict of 301 sea
freight follows the days of travel (Scheidel, Meeks and Weiland 2012, ORBIS v1.0; Scheidel 2013); the costs of
carting in Brabant 1450 to 1650 are fodder (76 %) and labour (24 %) (Ballaux and Blondé 2018). The ratio wagon to
river downstream to sea is 46 : 4.5 : 1 in the Edict of 301 and 44 to 47 : 4.7 : 1 for England in 1680
(Alvarez-Palau et al. 2024): two sources 1,400 years apart with nearly the same ratio.

### The rule

**1. The way** (`src/sim/economy/routes.ts`). Between two cities the way over the net of the world's places
(27,024 places; every edge is land, river, or water: sea, coast, strait) on which carrying a tonne takes the least
labour. The result per pair: days of travel and days of labour a tonne.

| | km a day | days of labour a tonne-kilometre |
|---|---|---|
| Land (ox cart) | 12 | 1.39 |
| River (mean of both directions) | 65 down, 15 up | 0.14 down, 0.27 up |
| Sea | 126 | 0.03 |

The net does not know which way a river flows, so a kilometre of river takes the mean time and the mean labour of
both directions. Days are rounded, at least 1. Examples: Paris to Ghent 14 days and 137 days of labour a tonne;
Venice to Alexandria 19 and 70; Baghdad to Tabriz 52 and 840; Cairo to London 65 and 420. The 756 ways of 1356 take
70 days in the mean, 222 at most.

**1a. Over land on the ways** (state version 27, the road system's first step: `src/sim/roads.ts`,
`docs/wiki/strassen.md`). Where the start year has ways (`public/data/roads_<year>.json`, the latest year at or
before it: 1356 goes on the ways of 1291), a land edge between two places that a way joins is its straight
kilometres times as much as the way winds and climbs: the way's effort (its km weighted by Tobler's hiking function,
the mean of both directions, `slopeTime`) over the straight line between its ends. A land edge without a way is its
straight kilometres, weighted by the time the slope between the two places takes, over 3/5, the speed off a path in
Tobler (1993). Goods take the quicker of the two (`stretchOf`). Days and labour both follow from these kilometres,
as both follow from the time the carriers take (Ballaux and Blondé 2018: the costs of carting are fodder and labour,
by the day). Rivers and the sea are as before. A world without ways goes on the straight line, as before. With the
ways: Paris to Ghent 17 days and 185 days of labour a tonne; Paris to Cologne 35 days (28); Venice to Alexandria 19
and 70 (by sea, unchanged); Baghdad to Tabriz 77 and 1,269. The ways of 1356 take 89 days in the mean (70), 268 at
most (222). Over 30 years (four seeds each, 1356 to 1359, on the state with feature 18; straight line against ways):
real output 114.8 to 115.3 against 114.6 to 115.6; weakest city 111.1 to 112.6 against 111.7 to 113.1; most without
work 0.8 to 2.2 % against 1.2 to 2.4 %; carrying 0.61 to 0.64 % of output against 0.74 to 0.77 %; imports 3.0 %
in both; the merchants' money of a city over its GDP −0.17 to +0.14 against −0.20 to +0.16. The kind of a way
(track, road, highway) changes nothing in trade yet: the kinds follow traffic, not building and upkeep, which come
with the next step of the road system.

**2. The time.** What the merchants buy in a city for another lies at the stall there after the days of the way
(`economy/src/trade.rs`, `Routes`). Goods on the way are the merchants' and count at cost.

**3. Carrying.** A real unit of a product (a pound of the start year) weighs so many tonnes (the table's
`tonnes_per_pound`), and carrying it takes the labour of the way times that weight. The merchants buy this labour
as services in the city of origin on the day they buy the goods, at the price services have there, and lay it on
the cost of the goods. So carrying is income of the people of the city of origin, no money leaves the circulation,
and the price at the stall is purchase plus carrying. For the choice of the origin the merchants reckon a day of
labour at the mean wage of the city of origin.

**4. The choice of the origin** stays the rule of feature 5 (the port's weights of a buyer), with the price of a
city's firms plus carrying. Near cities trade more with each other without a rule that says so.

**5. The stock to keep.** stock to keep = share · output · (price at the stall / price of the city's own
firms)^(−ε), ε = 2. Without it a remote city imports as much as a near one whatever the goods cost there: in the
first trial its deficit grew by 1 to 1.6 % of its GDP a year and it sank (Sarai to 77 in 20 years). The merchants
also order ahead: the stall needs what it sells while an order travels, and goods on the way count as stock.

**6. The start.** The merchants have on the way to every stall what it sells in a day, for every day an order
travels: the position of merchants who ordered day by day before the first day too. Without that the first order
is for all those days at once; in the world of 1291 it bought 22 small cities empty on the first day (their crown
found no goods, and the port's accounts gave no number).

**7. The units of the stalls.** A real unit at a stall is what cost one unit of money at the start, carrying
included. The calibration's price of an imported good is its price at the stall (the import share of the table is
a share of value where the goods are sold), and "real" is at the prices of the starting position everywhere in the
model. So a unit bought in the city of origin lies at the stall as 1 + carrying / price units, with the wage and
the price of the origin at the start (`Routes::unit`), and the stalls begin at the calibration's price. When
wages, prices or the origins change afterwards, the price at the stall moves, and rule 5 answers. The choice of
the origin (rule 4) still compares purchase plus carrying a unit of the origin.

Without this rule (the first build, 18 November 2026) the start was a position of trade without cost. The first
goods to arrive were dearer than the calibration's by their carrying (a third on Cologne's ways), firms that buy
them raised their prices, the price level of the cities rose by 1 % against wages in money, and the cities lost
work in the first years: output of all cities 112.8 to 114.0 after 30 years instead of 115.6, up to 7.4 % without
work, and Cologne (seed 1358) stayed at 99 with 4 to 6 % without work for the 30 years. Counter-runs with that
seed, ten years: ways with days only, without carrying: no city above 2 % without work after the first year;
carrying without rule 5: as bad as with it. The runs are in `/mnt/project-files/wirtschaft/entfernung/pr73/`.

**8. Regions apart.** The regions of the world the table names (`routes.apart`: the Americas, Oceania) have ways
among themselves only. In the net the Americas can be reached along the northern coasts, also within 300 km of a
coast, so no limit of seamanship that the net can express keeps them apart; the trial of the first proposal cut
Texcoco by hand. **Ramon's choice of 18 November 2026: the known world is a datum of the start year;** a discovery
can change it later in the game.

Two orders rules derailed in the trials and are not built: a stock for the days of travel that hangs on sales
(goods on the way grew beyond the yearly output of the world), and a choice of the origin by distance alone.

### The numbers

All 29 cities of 1356 over 30 years with the routes of the world (`economy/examples/distance.rs`, results in
`/mnt/project-files/wirtschaft/entfernung/pr73/einheiten/`), seeds 1356 to 1359, on the state with features 15 and
16 and with the cities as they are since the persons marry and are born (households of 5.8 persons). Without
distance one seed was computed on this state (1356, `economy/examples/longrun.rs`):

| After 30 years | Without distance (seed 1356) | With distance (four seeds) |
|---|---|---|
| Real output of all cities (start 100) | 115.6 | 115.0 to 115.5 |
| Weakest city (start 100) | 111.8 | 111.1 to 112.8 (Isfahan, Paris, Damascus, Tabriz) |
| Highest share without work in the 30 years | | 2.2 to 3.2 %; nobody from the tenth year on |
| Price level of the cities' firms (start 1) | | 0.996 to 0.999 |
| Equity of all banks (start 551) | 482 | 113 to 360 |
| Banks with negative equity | 2 | 5 to 6 |
| Imports over output | | 3.0 % |
| Carrying over output | 0 | 0.7 % |
| Merchants' money of a city over its GDP | −0.06 to +0.11 | −0.10 to +0.22 |

The books of the merchants and of every city balance in every year (largest check 1e-13). Cologne stands at 114
to 117 in the four seeds.

**More banks below zero.** The banks that end below zero do so after the twentieth year, in cities that buy more
from the merchants than they sell to them year after year (seed 1358: Sarai, Tabriz, Baghdad, Niani; the
merchants hold 5 to 19 % of such a city's GDP in money there), and in two cities by the households' hoard alone
(Texcoco, which does not trade, and Cologne). The money the merchants hold in a city is missing with its firms,
which borrow. This is the drift of the merchants' money of section 16, made lasting by ways that are not alike in
both directions; nothing in the model lowers the prices of a city that loses money. It is shown, not closed.

### Deviations and what stays open

- **The weight of the goods is set, not sourced**: 0.25 tonnes a pound of agricultural goods, 0.02 a pound of
  industrial goods, services nothing.
- **ε = 2 is set, not sourced.** It is the value the merchants' choice of a seller already uses for prices.
- **Roman values.** Speeds and labour are of the Roman world. That they hold in 1356 rests on the technique and on
  the cross-check with England in 1680, not on a medieval source. The Roman mile at 1.48 km is not from a source
  read. The speed at sea is the mean of whole summer routes, not the speed of a ship; there are no seasons.
- **Rivers have no direction** in the net.
- **Carrying is services**, bought in the city of origin only; nobody along the way earns from it, and there are no
  tolls.
- **The merchants' money drifts apart** between the cities, wider than without distance (section 16), and banks of
  cities that lose money end below zero after twenty years (above). No rule read closes it.
- **The units of the stalls are fixed at the start** (rule 7). They are a reading of the calibration, not a
  measured quantity: the table has one import share for all cities, whatever their ways.
- **The ways of the 550 cities of 1291 take about six seconds** when the economies are founded; they are kept per
  world.
- **Texcoco alone.** A city without ways keeps the stock the merchants had there at the start until it is sold and
  then has no imports.
- **A person's spending can be −1e-18** on a day (the port's budget less what was left of it, rounded); the family's
  `fed` is cut at 0.

### State and upgrade

State version 27: goods go over land on the ways (rule 1a); the upgrade founds the economies anew, as the step to 26
does. State version 26 (people feature 4 took 25). The format of the cities' state is 2: the routes, the goods on the way (a
ring as long as the longest way), the carrying ordered, and the wages and prices of the start that fix the units
of the stalls; format 1 is read as cities without routes. The upgrade
founds the economies anew on the day the world has reached: routes are given to cities that have not computed a
day. **The persons' feature 2 (pull request 69) uses state versions too: the one merged later takes the next
numbers.**

## 18. A firm and its owner are one household

Ramon's question of 18 November 2026 after feature 17: how are the banks below zero solved "möglichst VWL-tauglich,
paper based"? His choice on the card of that day: "Betrieb und Inhaber ein Haushalt".

### Why

After 30 years with distance 5 to 6 of 29 banks stand below zero (section 17). The flow of funds of the firms shows
where the money goes (29 cities, 30 years, with distance, seed 1358): the firms' money less their loans falls by
5,143, a tenth of a year's output; the households hold 5,272 more; the merchants −26 in sum; the banks lose 438 of
their equity. It happens in every city, also in Texcoco, which does not trade. Two rules of the paper cause it
together with two values of ours:

- **Unsold stock counts as profit and is paid out** (4,124 of the 5,143). The profit of the paper values the stock a
  firm built at its price (A.27), and our owners are paid all of a profit (θ_DIV = 1).
- **A profit is paid out, a loss stays in the firm** (A.33, A.44: `max(0, Π)`). With a day as the period a firm
  has days with a loss, although it earns over the year.

Measured per firm (same run): of 3,078 firms one loses over the last ten years; all others earn 19 to 25 % of their
sales. No firm loses for good. The drain is a matter of single days.

### The rule

With the rule `owner = household` (table `cities.owner`; `paper` is the rule of the paper):

1. **The profit of a firm is what it took in less what it spent on what it made**, without the change of its stock:
   Π = Π_paper − P·ΔS. The form is Caiani and Catullo (2023), LEM Working Paper 2023/19, equations 23 to 25:
   dividends out of the operating cash flow, without inventories. The stock stays in the firm's books in units and
   is profit on the day it is sold. Equity (A.36) still counts the stock.
2. **The owner bears a loss as he holds a profit.** His income from the firm is θ_DIV·(1 − τ_FIRM)·Π of either
   sign (a profit is taxed as before, a loss is not), and the firm gets from him on the same day what he bears.
   Firm and owner are one household: System of National Accounts 2008, chapter 4 (draft of 20 December 2007),
   4.155 and 4.158, an unincorporated enterprise belongs to the household of its owner, who is liable without limit;
   Liebrecht (2012), Max Planck Encyclopedia of European Private Law, on the members of medieval trade associations.
   Caiani and Catullo pay out a positive cash flow only; that the owner bears the loss is ours.
3. **An owner who expects a loss plans to buy nothing out of income**, not less than nothing.

Code: `economy/src/clock.rs` (`firms_profits`, `households_income_firms`, `firms_deposits`,
`households_budget_firms`), `Economy::with_owner_household`, last argument of `sce_create`, `EconomyRules.owner`.

### The numbers

Trial of 18 November 2026 (outputs in the project folder, wirtschaft/betriebsgeld), 29 cities, 30 years, seeds 1356
to 1359:

| | paper (seed 1358) | one household, with distance | one household, without distance |
|---|---|---|---|
| firms' money less loans | −5,143 | 0 to −1 | 0 |
| households' deposits | +5,272 | −142 to −197 | −102 to −123 |
| banks that lose equity | 6 | 0 | 0 |
| real GDP, start = 100 | 115.5 | 114.8 to 115.3 | 115.2 to 115.4 |
| weakest city | 111.1 | 111.1 to 112.6 | 111.4 to 113.1 |
| merchants' money in a city, of its GDP | −0.07 to 0.19 | −0.17 to 0.14 | −0.10 to 0.11 |

Over 100 years (seeds 1356 and 1358, with distance, outputs in wirtschaft/betriebsgeld/hundert):

| after years | 10 | 30 | 50 | 75 | 100 |
|---|---|---|---|---|---|
| real GDP, start = 100 | 113.8 to 114.0 | 114.8 to 115.3 | 114.7 to 115.4 | 114.5 to 115.2 | 114.8 to 115.3 |
| weakest city | 110.3 to 110.6 | 111.1 to 111.3 | 110.3 to 110.7 | 110.7 to 111.4 | 110.6 to 112.2 |
| price level | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| banks' equity (start 551), banks below zero | 551, 0 | 551, 0 | 551, 0 | 551, 0 | 551, 0 |
| firms' loans | 0 | 0 | 0 | 0 to 1 | 2 to 24 |
| the crowns' money | 14 to 17 | 179 to 232 | 357 to 515 | 580 to 874 | 833 to 1,178 |
| merchants' money in a city, of its GDP | −0.07 to 0.05 | −0.17 to 0.13 | −0.22 to 0.20 | −0.26 to 0.26 | −0.32 to 0.37 |

Nobody is without work after the tenth year. The owners' debts were not read out in these two runs.

### Deviations and what stays open

- **A third of the owners end below zero.** The owner plans his spending on the profit of the day before and cannot
  spend less than nothing: after a good day he spends the profit, after a bad day he cannot take the loss back. The
  one-sidedness that drained the firms now sits in the owner's budget, smaller. With distance, seed 1358: 546, 998
  and 1,010 of 3,078 owners are below zero after 10, 20 and 30 years, nearly all of them farms, with −666, −2,086
  and −2,643 in sum (5 % of a year's output; over the four seeds −2,600 to −3,900). It flattens: in the third
  decade the owners of farms spend less than they earn. The worst owner owes ten years of his income; large farms
  with uneven sales spend up to 18 % more than they earn in the first decade. Nothing ends such a debt: the model
  has no insolvency of a household. The owner pays the bank's rate on it.
- **Tried and dropped** (same world): the owner bears a loss only out of what he holds (the firms lose 4,250 to
  5,075, as with the paper's rule); a firm sets a loss off against later profits before it pays out (the money stays
  in the firms, demand falls, 21 to 22 banks lose equity); the owner plans on the mean profit of 30 days. The last was
  measured a second time (seed 1358, outputs in wirtschaft/betriebsgeld/geldmenge): it is no fault of the trial.
  Households spend what they earn (ψ + ψ_H = 1), so a small leak leaves goods unsold (the crown, which spends the
  revenue of the day before, holds 439 after 30 years in that run; that this is the leak is a reading, not measured). The owners' overspending of this feature,
  about 0.17 % of GDP a year, happens to fill that gap: all goods are sold and prices stay within 0.96 to 1.04 of
  their sector. With the mean profit 0.9 % of the goods stay unsold, the price level falls to 0.97, single firms
  stand between 0.4 and 1.5 of their sector's price, and the owners owe 4,948 instead of 2,643; real output is the
  same (52,096 against 51,729 after 30 years). Dropped. Net money stays at 11,000 in both while output grows by
  15 %; with the paper's rule it grows to 14,946 through the firms' loans.
- **The merchants' money per city still spreads**, in a straight line over 100 years (table): to a third of a
  city's GDP on either side. Its other side is now the households, not the banks; the spending out of savings
  (feature 15) does not bound it. Output and work do not suffer in 100 years.
- **The crowns pile up money**: 2 % of a year's output after 100 years, out of the households' deposits (8,816 at
  the start, 7,704 to 8,028 after 100 years).
- **The banker** is paid the bank's profit by the paper's rule as before.

### State and upgrade

State version 26, together with feature 17. Engine format 9: whether the rule holds. The upgrade founds the
economies anew.

## 19. The firms and households keep the working days of their faith

Step 3 of way A of the proposal «Personen: Archiv der Toten und Tagesplan»
(https://claude.ai/artifact/8UqSxP49CfvpPfX1UCDULc), chosen by Ramon on 19 November 2026; with it his order to build
on to the end, merge and deploy ("vorwärts machen alles mergren comitten und feddich", "du darfst deployen"). The
calendars, their sources and their days in 1291 are people feature 8 (docs/PEOPLE_DESIGN.md).

### Why

With a day as the period every day of the port is a working day: a Latin firm works on Easter Sunday as on any
Tuesday. A medieval town did not. The Latin Church kept 52 Sundays and 31 feasts on other days in 1291, and the cloth
towns of Flanders stopped at noon on Saturdays and the eves of feasts; the Jews kept the Sabbath, the Muslims two
festivals (people feature 8).

### The rule

A firm keeps the calendar of its owner's faith, a household that owns no firm the calendar of its own faith. A day of
a calendar is a working day, a half day or a day of rest. On a day with the factor `a`, the share of the day that is
worked (1, ½ or 0) times the days of the year over the days worked in that year (`src/sim/holy_days.ts`,
`dayFactor`), the flows are `a` times those of a mean day: nothing on a day of rest, more on a working day, and over a
year as much as in as many periods of the port. A Latin working day of 1291 has the factor 365 / 250.5 = 1.457.

1. **Production** (A.13) is `min(a Q_s, a N α, a K κ, M β)`: the planned supply, the workers and the capital of the
   day; the stock of materials `M` is what it is and is not scaled.
2. **Materials and investment** (A.18, A.14): a firm buys `a` times the port's, for the day's work. (Since feature 20
   the materials are those of the firm's next working day, bought on a working day: section 20.)
3. **A household that owns no firm** (workers, those without work, the banker) buys `a` times its budget (A.46, A.49,
   with the spending out of savings, feature 15): the market of its faith is closed on its days of rest. In the game
   a family books its food in the same way (`src/sim/systems/household.ts`).
4. **The crown, the merchants and the owners of the firms buy every day.** The owner by his rule of feature 18, on
   the profit of the day before: after a day of rest, a day of wages without sales, he has nothing to spend out of
   income; after a working day more than on a mean day. His family books its food every day. (Since feature 20 the
   owner buys on the working days of his faith, on the mean profit of the year: section 20.)
5. **The spare capacity** in the market, which records the demand a firm cannot serve, is that of the day:
   `a K κ − Y`.
6. **A firm plans on the mean demand per worked day**: the demand since its last plan over the factors of those days
   (`DailyClock::worked`). A firm that has not worked since its last plan keeps its supply and its price until it has.
7. **Wages are paid every day**, worked or not, as the proposal has it: a holy day costs a firm its output, not its
   workers' pay.
8. **The price indices** that weight with what was made, sold or bought, and the mean prices paid, are 0 / 0 on a
   day without any: they keep the value of the day before.

Without a calendar, and with the factor 1 on every day, the economy computes as before, number for number (test
`with_the_factor_1_on_every_day_the_economy_computes_as_without_working_days`).

Code: `economy/src/clock.rs` (`Attendance`, `DailyClock::worked` and the overrides named there),
`Economy::with_working_days`, `working_days` and `sce_working_days` (`economy/src/lib.rs`); in the game
`workingDays` in `src/sim/systems/economy.ts`, which gives the engine the days of a year before it computes the
year's first day.

### The numbers

The world of 1291 (550 cities), its first year computed once with the working days and once without, the owners'
rule of feature 18 in both. Outside the game (native build, `Cities::step`), sums over the cities, with over without:

| | after 90 days | after 180 days | after 360 days |
|---|---|---|---|
| output, summed since the start | +7.3 % | +4.0 % | +4.9 % |
| consumption of the workers, summed | +3.6 % | +0.6 % | +1.9 % |
| consumption of the owners, summed | +20.5 % | +13.8 % | +13.8 % |
| employed, on the day | +1.1 % | +1.3 % | +1.3 % |
| the crowns' purchases, summed | +0.9 % | −1.1 % | +1.5 % |
| price level weighted by output, on the day | 1.020 / 1.011 | 1.022 / 1.012 | 1.011 / 1.003 |

From day 30 to day 360, read every 15 days, the price level weighted by output lies within 1.006 and 1.026 with the
working days and within 0.993 and 1.015 without. The first quarter of a Latin year has more working days than the mean (the mean factor of
its first 90 days is 1.085, of the first 180 days 1.020), which is the most of the output's lead after 90 days.

In the game (`npm run workdays:check -- 3`: the world of 1291 founded, three years computed with the working days and
again with every day a working day, the figures of each year):

| | year 1 | year 2 | year 3 |
|---|---|---|---|
| real GDP | 190,433 / 183,025 (+4.0 %) | 203,713 / 188,506 (+8.1 %) | 206,777 / 192,054 (+7.7 %) |
| consumption | +4.0 % | +8.2 % | +7.8 % |
| investment | +4.1 % | +7.9 % | +7.5 % |
| without work, at the end of the year | 61 / 528 | 6 / 333 | 0 / 193 |
| households' deposits | −1.2 % | −2.8 % | −4.8 % |
| firms' deposits | −0.9 % | −0.9 % | −1.0 % |
| mean price level | 1.012 / 1.003 | 1.003 / 1.001 | 1.003 / 1.001 |
| output of the Latin firms | +4.4 % | +8.5 % | +7.8 % |
| output of the Muslim firms | +3.6 % | +7.6 % | +7.2 % |
| output of the Orthodox firms | +0.9 % | +3.8 % | +5.0 % |

The Latin firms make 6 units of output on all days of rest of the first year together (39,640 without the
working days), the Orthodox none. The lead of the output stops at the work there is: from the second year nearly
everybody works. The households' deposits fall by the owners' overspending (below).

The world of 1356 (30 cities), its first 150 days: the price of food and the price level of Venice, London, Paris
and Cairo lie within 0.96 and 1.05 with the working days (0.95 to 1.03 without), the largest gap 4.8 % (Venice's food
on day 110, 1.048 against 1.010).

### Tried and dropped

Measured in the same way over the first year of 1291 (output and the owners' consumption summed, with over without,
after 360 days; the price level weighted by output, its range from day 30 to 360 read every 15 days, 0.993 to 1.015
without):

| the owner | output | owners' consumption | price level | cities 20 % off in price on one day |
|---|---|---|---|---|
| **on the profit of the day before, every day (built)** | +4.9 % | +13.8 % | 1.006 to 1.026 | 0 |
| on the mean profit of the last 7 days, on his working days | +1.5 % | +1.6 % | 0.910 to 1.064 (to day 270) | 0 |
| on the mean profit of the last 7 days, every day | −2.1 % | −7.0 % | 0.930 to 1.059 | 0 |
| on the mean profit of the last 30 days, on his working days | −0.9 % | −11.0 % | 0.878 to 1.043 | 116 (day 180) |
| on the mean profit of the last 30 days, every day | −4.5 % | −15.2 % | 0.897 to 1.032 | 22 (day 165) |
| on the profit of the day before, the loss of a day carried to the next, every day | −5.9 % | −19.7 % | 0.859 to 1.154 | 174 (day 330) |

On the profit of the day before and on his working days the owner buys `a` times a budget that is itself high after a
working day: in the game the real GDP of 1291 was 8.2 % above the run without working days in the first year and
10.2 % in the second, nobody was without work. Every rule that takes away the one-sidedness of feature 18 (an owner
cannot take back a loss) leaves goods unsold, and the firms of the demand pull cut their prices by the gap: the price
level falls by up to a tenth in the weeks of feasts and comes back. The same was found in feature 18 without working
days ("the owner plans on the mean profit of 30 days", dropped): the owners' overspending fills a leak that is not
found yet. With the working days the leak is larger: on a day of rest of its city what the crown, the merchants and
the households of other faiths want of its firms is not made.

Before, the spare capacity was tried: the port's `K κ − Y` (on a working day a firm could sell more than its day's
capacity; real GDP +3.9 % in the first year of 1291, the price level 1.032 against 1.003) and `max(a, 1) K κ − Y`
(+3.8 %, the price levels of 1356 swung by a fifth around Easter).

### Deviations and what stays open

- **The owners spend more than they earn**, the one-sidedness of feature 18, larger: after a day of rest the profit
  of the day before is a loss, which the owner cannot take back. Their consumption is 13.8 % above the run without
  working days, the output 4.9 %, and fewer are without work. That a rule without the one-sidedness leaves goods
  unsold (table) is measured; that the cause is the demand not served on days of rest is a reading.
- **Rule 1 scales the planned supply, the workers and the capital**, not only the work as the proposal has it
  (`N α a`): with only the work scaled the firms bound by their supply or their capital would make on a working day
  what they make on any day and lose the days of rest.
- **The stock of materials is not scaled.** It holds 1.18 mean days of materials at the start; on the first working
  day after a day of rest the stock binds a firm that needs 1.457 of them; it buys for the day's work and the stock
  follows.
- **The crown and the merchants buy every day**, also on a day on which every firm of a city rests: then they buy
  from the firms' stocks and from the merchants. Neither has a calendar of its own. So the merchants buy more where
  firms work more: in the first year of 1356 the Muslim cities sell 3.1 to 4.4 % of their output to the merchants
  (Tlemcen the most), the Latin cities 1.8 to 2.7 % (Prague the least); without the working days the ports sold the
  most (Venice 3.95 %) and the cities inland the least (Sarai 2.54 %). That the merchants buy on the working days of
  the cities they buy from, and in bulk before a feast, is open.
- **A firm without an owner works every day**, and a firm keeps its owner's calendar for all its workers, whatever
  their faith (people feature 8).
- **No seasons, no hours of the day**: those are steps 5 and 6 of way A.

### State and upgrade

State version 31. Engine format 10: the working days of the run of days the engine was given and per firm the factors
of the days since its last plan (`worked`). A state of the format before is read as one without working days, every
day since the last plan counting as one; the game gives the working days of the year before it computes the next day
(`cities.workingTo`, −1 after the upgrade). The calendars themselves are not saved: they are a function of the faith
and the date.

## 20. The days of rest without a leak

After feature 19 Ramon wrote "naja jetzt sind wir aber nicht fertig" (19 November 2026): the questions of the economy
that feature 19 left open come before steps 4 to 6 of way A. He chose "Zuerst Preisregel der Firmen dämpfen" and
added "wichtig: alles nur literaturkonform wir machen keine deluklul änderungen". The damping that the literature has
(Calvo, below) holds the prices but costs work; on the card that followed he chose "Zuerst Leck an Ruhetagen
schliessen" (19 November 2026): find where the money stays on the days of rest and close it with rules from the
literature.

### Where the money stayed

Feature 19 left two leaks, found in the first year of 1291 outside the game (550 cities, `Cities::step`, with the
working days against without, as in section 19):

1. **Materials for the wrong day.** In the port the materials a firm buys in a period are used in the next: the
   output (A.13) is computed from the stock `M` before the market of the period, and the stock (A.21) gets what was
   bought after it. Feature 19 had a firm buy `a` times the port's materials on day `t` "for the day's work", which
   arrive for day `t + 1`: on a Latin Friday a firm bought for a full working day and worked half a day on the
   Saturday; on the Saturday it bought for half a day and rested on the Sunday; and on the Monday, with 1.457 mean days
   to make, its stock held what the Saturday had bought. The stock bound the firms after every day of rest, and the
   goods they did not make were demand that went unserved.
2. **The owner on the profit of the day before, every day.** After a day of rest, a day of wages without sales, the
   profit of the day before is a loss and the owner has nothing to spend out of income; after a working day he has
   more than on a mean day, and he spent it every day, on days of rest too. As an owner cannot take back a loss
   (feature 18) he spent 13.8 % more than without working days, and the firms of the demand pull raised their prices
   by the gap (section 19: the price level 1.006 to 1.026 against 0.993 to 1.015). Every rule that took the
   one-sidedness away (section 19, "Tried and dropped") left goods unsold, because the first leak was still open.

### What was read

- Poledna, Miess, Hommes, Rabitsch (2023), appendix A, as the port has it: the output from the stock of materials
  before the market (A.13, `firms_production`), the stock after it (A.21, `firms_stocks`:
  `M − Y / β + DM`), the materials wanted for the planned supply (A.18), the expected profit the profit of the period
  before grown by the expected inflation and growth (A.28, `firms_expectations_and_decisions`), the owner's budget out
  of the expected profit (A.46, A.49).
- Gonzalez-Navarro, M., Lee, J., Lee, S. Restricting Large Firms to Protect Small Businesses: Evidence from Retail
  Operating-Day Restrictions. Working paper (card payments in Seoul, 2019; the text has no year, its references were
  read in September 2025). https://sujinhome.github.io/assets/papers/Mandatory_closure.pdf Word for word: "larger
  shares are recouped by restricted chains on other shopping days or diverted to other unrestricted retail formats",
  and "we find no significant differences in total expenditure between non-closure weeks that follow a closure week
  and those that follow another non-closure week": what a closed day takes is bought on the open days, and the week
  spends what it spends. This is the reading under rule 3 of feature 19 (a household buys `a` times its budget on the
  days its market is open), and it holds for the owner as for any household.
- For the damping of the prices (tried, dropped): CANVAS (Bank of Canada staff working paper 2022-51; JEDC 172
  (2025) 104986, equations 3 to 6) has none, the firm closes the whole gap every quarter; the code of BeforeIT.jl
  has `theta_calvo` (`init_CANVAS.jl`, lines 66 to 69), 1 by default, with no value published for it; Dhyne et al.
  (2005, ECB working paper 524): 15.1 % of the consumer prices of the euro area change in a month; Assenza, Delli Gatti
  and Grazzini (2015): ρ = 0.9 and a step of the price drawn from U(0, 0.1).

### The rule

1. **A firm buys on a working day the materials of its next working day**: the port's materials (A.18) times the
   factor of the first day after `t` on which it works (`Attendance::next_working`, within 31 days; 1 outside the
   days the engine was given). On a day of rest, when the market of its faith is closed, it buys none. So on a Latin
   Friday it buys for the half day of Saturday, on the Saturday for the Monday. This is the port's timing (A.13, A.21)
   kept on a calendar; the investment (A.14) stays `a` times the port's.
2. **The owner of a firm buys on the working days of his faith**, `a` times his budget, as every other household
   (rule 3 of feature 19), and his family books its food the same way (`src/sim/systems/household.ts`). The crown and
   the merchants buy every day, as before.
3. **The owner plans on the profit of the year**: in the place of the profit of the period before, the mean profit
   per period of his firm since its twelfth plan before (`OwnerProfit`, `OWNER_PLANS` = 12 plans of 30 days), grown
   as the port grows the profit of the period before (A.28). The rest is the rule of feature 18: the profit without
   the change of the stock, a budget not below 0. The paper's period is a quarter of working days and holidays alike;
   on the daily clock the owner's period is taken to be the window of the expectations, a year, which the clock
   already uses for the expected growth and inflation. **The length of the window is the clock's, not a paper's**: the
   30 days of a plan were measured in feature 19 and left goods unsold (section 19, "Tried and dropped"). In the first
   period with working days the year before is taken to be twelve plans of the profit of the period before, as the
   clock takes the window before the start to be the starting position.

Without a calendar nothing changes. With a calendar of the factor 1 on every day the materials are the port's and
the owner plans on the profit of the year (rule 3 holds with working days, whatever their factors).

Code: `economy/src/clock.rs` (`Attendance::next_working`, `OwnerProfit`, the overrides
`firms_expectations_and_decisions`, `firms_profits`, `households_budget_firms`); tests in
`economy/tests/working_days.rs`.

### The numbers

The first year of 1291 outside the game, as in section 19 (sums over the cities, with over without working days; the
price level weighted by output, its range from day 30 to day 360 read every 15 days):

| | after 90 days | after 180 days | after 360 days |
|---|---|---|---|
| output, summed since the start | +5.3 % | +0.6 % | −0.7 % |
| consumption of the workers, summed | +5.0 % | +0.4 % | −1.0 % |
| consumption of the owners, summed | +3.8 % | −2.6 % | −2.6 % |
| employed, on the day | −0.2 % | −0.7 % | −0.7 % |
| the crowns' purchases, summed | +6.5 % | +4.1 % | +4.6 % |
| price level weighted by output, on the day | 1.001 / 1.011 | 1.003 / 1.012 | 1.006 / 1.003 |

| | feature 19 | feature 20 | without working days |
|---|---|---|---|
| price level from day 30 to 360 | 1.006 to 1.026 | **0.993 to 1.006** | 0.993 to 1.015 |
| output after 360 days | +4.9 % | −0.7 % | |
| owners' consumption after 360 days | +13.8 % | −2.6 % | |

The lead of the first quarter is its working days (the mean factor of its first 90 days is 1.085, section 19). A
mean of exactly 365 days in the place of the twelve plans gave 0.993 to 1.008, output −0.7 %, the owners −2.6 %
(below): the plans are as good as a year of days and keep 26 numbers per firm in place of 365.

In the game (`npm run workdays:check -- 3`: the world of 1291 founded, three years computed with the working days and
again with every day a working day, which the engine is then never given, so that its owners keep the rule of feature
18, on the profit of the day before):

| | year 1 | year 2 | year 3 |
|---|---|---|---|
| real GDP | 180,211 / 183,025 (−1.5 %) | 183,446 / 188,506 (−2.7 %) | 183,665 / 192,054 (−4.4 %) |
| consumption | −1.9 % | −3.3 % | −4.9 % |
| investment | −1.4 % | −2.6 % | −4.3 % |
| without work, at the end of the year | 748 / 528 | 855 / 333 | 875 / 193 |
| households' deposits | −0.5 % | −0.7 % | −0.8 % |
| firms' deposits | −0.3 % | −0.5 % | −0.6 % |
| mean price level | 1.004 / 1.003 | 0.993 / 1.001 | 0.995 / 1.001 |
| output of the Latin firms | −2.0 % | −3.6 % | −5.6 % |
| output of the Muslim firms | −0.4 % | −0.4 % | −1.3 % |

With feature 19 the same check gave a real GDP of +4.0, +8.1 and +7.7 %, hardly anybody without work from the second
year, and the households' deposits −1.2, −2.8 and −4.8 % (section 19): that lead was the owners' overspending. Now
the households keep their deposits and the prices stay where they are, but the economy grows less than the run
without working days, and about 2.4 % of the workers are without work from the second year.

That the days of rest are no longer the cause shows the same economy against a calendar with the factor 1 on every
day, under which the owners plan on the year too (outside the game, as above, two years): output +0.8 %, the owners'
consumption +1.5 %, the employed equal on day 720, the price level 0.990 to 1.006 against 0.996 to 1.000. The gap to
the run without working days is the owners' rule: on the profit of the day before an owner spends more than his firm
earns (feature 18, "Deviations": a third of the owners in the red), and that overspending fills a gap in the demand
that is found in neither feature 18 nor here. Without it the goods stay unsold: the firms' stock grows from 0.65 days
of output on day 360 to 2.46 on day 720, and the price level comes down to 0.990.

In the tests (Austria, the port's data set; eight weeks of five working days, a half day and a day of rest against
every day a working day of the factor 1; seeds 1 to 6) the price level moves by −7.4 to +6.1 %, with the rules of
feature 19 by −13.7 to +13.4 %; the output −1.7 to −3.3 %, with those of feature 19 −0.1 to −1.3 %. On the day after
a day of rest an owner buys what he buys after a working day (−0.8 %), with the profit of the day before less than
half.

### Tried and dropped

The two parts of the rule were measured one by one and the window of the owner at several lengths, in the first year
of 1291 outside the game as above (the price level from day 30 to day 360; output and the owners' consumption summed,
with over without working days, after 360 days):

| materials | the owner | price level | output | owners' consumption |
|---|---|---|---|---|
| for the day (feature 19) | on the profit of the day before, every day (feature 19) | 1.006 to 1.026 | +4.9 % | +13.8 % |
| for the next working day | on the profit of the day before, every day | 0.999 to 1.024 | +3.8 % | +12.4 % |
| for the next working day | on the mean of 7 days, every day | 0.932 to 1.058 | −2.6 % | −7.6 % |
| for the next working day | on the mean of 7 days, on his working days | 0.910 to 1.095 | +0.9 % | +1.5 % |
| for the next working day | on the mean of 30 days, on his working days | 0.884 to 1.047, 95 cities 20 % off | −1.4 % | −10.8 % |
| for the next working day | on the mean of 91 days, on his working days | 0.990 to 1.022 | −0.2 % | −2.4 % |
| for the day (feature 19) | on the mean of 365 days, every day | 0.978 to 1.016 | −2.4 % | −7.2 % |
| for the next working day | on the mean of 365 days, every day | 0.969 to 1.015 | −2.8 % | −7.6 % |
| for the next working day | on the mean of 365 days, on his working days | 0.993 to 1.008 | −0.7 % | −2.6 % |
| **for the next working day** | **on the mean of twelve plans, on his working days (built)** | **0.993 to 1.006** | **−0.7 %** | **−2.6 %** |

Neither part alone is enough: with the materials fixed and the owner of feature 19 the prices stay high, with the
owner on the year and the materials of feature 19 they swing. The shorter the window, the more a week of feasts
weighs in it.

- **Calvo** (each planning firm changes its price with the probability θ, as in the code of BeforeIT.jl): with θ =
  0.151 per plan (Dhyne et al.) the price levels of the 30 cities of 1356 stayed within 0.96 and 1.04 over ten years
  (seeds 1356 to 1359; 0.92 to 1.01 with θ = 1), but work fell: in seed 1356 London had 13.3 % without work in year 10,
  and the most of any city in a year was 14.2 %; with θ = 1 (every firm, as built) at most 1.7 %. A firm that may not
  lower its price sells less and hires fewer. Ramon chose to close the leak first; Calvo is not built.
- **The offered goods as CANVAS has them** (the gap against `Y + S`, the stock counted), with the materials and the
  owner of feature 19: the price level 1.012 to 1.034, no better than feature 19.
- **Materials for the next day, whatever it is** (`a(t + 1)`): on a Saturday a firm bought nothing for the Monday,
  as the Sunday has the factor 0, and the output of day 15 fell by a tenth. Hence the next *working* day.

### Deviations and what stays open

- **The window of the year is ours**, as said under rule 3: no paper gives the period over which an owner on a daily
  clock expects his profit. It is the window the clock uses for every other expectation, and the 30 days of a plan
  were measured and failed.
- **The crown and the merchants still buy every day**, also on a day on which every firm of a city rests (section 19).
  The crowns' purchases are 4.6 % above the run without working days after a year: the crown buys out of its revenue
  (feature 16), and the revenue follows the output of the working days.
- **The Muslim cities still sell more to the merchants than the Latin ones** (section 19): that the merchants buy on
  the working days of the cities they buy from is open.
- **The gap in the demand of feature 18 is open, and now it shows.** Feature 18 measured it without working days:
  with the owner on the mean profit of 30 days 0.9 % of the goods stayed unsold and the price level fell to 0.97;
  the owners' overspending on the profit of the day before filled it. Feature 20 takes that overspending away with
  the days of rest, and the gap is what holds the economy of the game 4.4 % below the run without working days in
  the third year. Where the money of that demand stays is the next question; no rule is built for it here. (Feature
  21 found the cause: no money leaks, the firms expected the recovery after the plague, section 21.)

### State and upgrade

State version 32. Engine format 11: the clock keeps the owners' profits of the last twelve plans and since the last
(`OwnerProfit`: 26 numbers and a count per firm). A state of format 10 is read without them, and they are gathered
from the next day on, the year before taken to be the profit of the day before (test
`a_state_of_format_10_gathers_the_profits_of_the_owners_anew`). The upgrade 31 → 32 changes nothing else: the
economies go on where they are.

## 21. A world knows the history only up to its start

### Why

Feature 20 left the gap in the demand open (section 20, "Deviations"): in the game the world of 1291 with working
days fell 1.5, 2.7 and 4.4 % behind the run without them, and its firms' stock grew year by year. Outside the game
(550 cities of 1291, two years, `Cities::step`) the money did not leak: the deposits hardly changed. The firms made
more than was asked. Under the demand pull of CANVAS (section 8) the supply grows by the expected growth in every
case, and the firms expected about 1 to 3 % a year (γ_e read every 60 days), while the demand hardly grew once the owners
no longer spent beyond their profit. With working days the planned supply stood 0.2 to 0.8 % above the demand from
day 480 on, and the stock grew from 446 on day 60 to 1,729 on day 720. Without working days it stayed near 150:
there the owners, on the profit of the day before, spent 878 more than their firms earned in two years, on credit,
and that made the expected growth come true.

### Where the expected growth came from

The firms expect growth and inflation by an AR(1) on the history of output and prices (A.6, A.7; on the daily clock
on sums of 365 days, section 4), and the calibration hands them the years before the start. The world of 1291 has no
tables of its own: it takes those of 1356 as a placeholder (`src/sim/tables.ts`), and with them the history 1281 to
1356, scaled to 1356. That history has the plague: real GDP £3,879 m in 1345, £2,841 m in 1350, £2,686 m in 1356
(2013 prices; Bank of England workbook, sheet A1, Broadberry et al.). An AR(1) on its logarithms has α = 0.845 and a
long-run mean 27.7 % above the start: it expects 3.86 % growth in the first year, the recovery after the plague. A
world of 1291 knows nothing of the plague, which comes 57 years after its start.

### What was read

- The port, `get_params_and_initial_conditions` (`src/calibration.rs` of the port, `economy/vendor/port-beforeit`):
  every series of the years before the start (real GDP, the deflator, the government's consumption, exports,
  imports) runs from `estimation_date` to `calibration_date` (`range(key, Te, Tx)`) and is scaled to its value at
  `calibration_date`; the AR(1) rules of the government's consumption, of exports and of imports are estimated on
  that window, and `T_prime = Tx − Te + 1`. The port calibrates the model at any quarter of its data (Italy 2010 to
  2016 in its tests), each time with the data up to that quarter: the model of a start knows the years before it and
  none after.
- The history of the table (Bank of England, A millennium of macroeconomic data, sheets A1 and A26) runs from 1280.
  The years 1281 to 1291 are part of it, from the same sources as the rest.

### The rule

A world calibrates its cities on the history up to its own start year (`calibrateEconomy(table, until)`, `until`
the start year; `cityCalibrations` passes the smaller of the start year and the table's year). For a world of 1291 on
the table of 1356: the series of output, inflation, the crown's purchases, exports and imports run from 1281 to 1291
(11 years, `T_prime` = 11), each scaled to 1291, and the rule of exports is estimated on them. The accounts stay the
table's, the placeholder of 1356. On 1281 to 1291 the AR(1) on output has α = 0.195 and a long-run mean 1.3 % above
the start: 1.07 % growth expected in the first year. England's real GDP grew 0.2 % a year from 1281 to 1345 (£3,390 m
to £3,879 m).

A world that starts in the year of its table (1356) is calibrated as before, bit for bit (test: the file of the
reference world).

In the game two of the rules of the rest of the world do not enter: the merchants replace the series of exports and
imports in every city (feature 5, `economy/src/trade.rs`), and since feature 16 the crown buys with what it took in,
so its series sets only its first day. What changes is the history of output and prices, from which the firms form
their expectations.

Code: `src/sim/economy/calibration.ts` (`calibrateEconomy`), `src/sim/systems/economy.ts` (`cityCalibrations`);
tests in `tests/economy.test.ts` (the calibration, the world of 1291, its upgrade) and
`tests/economy-households.test.ts` (the upgrade of a world of 1356).

### The numbers

In the game (`npm run workdays:check -- 3`, as in section 20: the world of 1291 with the working days against every
day a working day):

| | year 1 | year 2 | year 3 |
|---|---|---|---|
| real GDP | 178,367 / 180,955 (−1.4 %) | 180,280 / 182,915 (−1.4 %) | 179,635 / 182,486 (−1.6 %) |
| consumption | −1.7 % | −1.9 % | −1.9 % |
| investment | −1.3 % | −1.4 % | −1.5 % |
| without work, at the end of the year | 944 / 685 | 998 / 693 | 1,036 / 717 |
| households' deposits | −0.5 % | −0.8 % | −0.8 % |
| firms' deposits | −0.3 % | −0.4 % | −0.5 % |
| mean price level | 1.004 / 1.002 | 0.996 / 1.001 | 0.999 / 1.001 |
| output of the Latin firms | −1.9 % | −2.4 % | −2.6 % |
| output of the Muslim firms | −0.1 % | +1.1 % | +1.1 % |

| real GDP | year 1 | year 2 | year 3 |
|---|---|---|---|
| with working days, history to 1356 (section 20) | 180,211 | 183,446 | 183,665 |
| with working days, history to 1291 | 178,367 | 180,280 | 179,635 |
| without working days, history to 1356 (section 20) | 183,025 | 188,506 | 192,054 |
| without working days, history to 1291 | 180,955 | 182,915 | 182,486 |

The run without working days no longer grows 2.4 % a year: it is flat, as England was before the plague, and the gap
between the two runs stays at about 1.5 % instead of widening to 4.4 %.

### The gap: the owners of the run it is measured against

After this feature Ramon chose to clear the gap of about 1.5 % first ("Erst Restlücke 1,5 % klären", card of
20 November 2026). The run without working days is not the same economy without days of rest. It is never given
working days, so its owners keep the rule of feature 18 and plan on the profit of the day before, while with working
days they plan on the profit of the year (feature 20). A third run separates the two: the same world given a calendar
with the factor 1 on every day, which has the rules of feature 20 and no day of rest (`npm run workdays:check -- 3
factor1`):

| | year 1 | year 2 | year 3 |
|---|---|---|---|
| real GDP, the calendars of the faiths | 178,367 | 180,280 | 179,635 |
| real GDP, the factor 1 on every day | 178,258 | 178,655 | 179,521 |
| real GDP, without working days | 180,955 | 182,915 | 182,486 |
| without work at the end of the year (calendars / factor 1 / none) | 2.6 / 3.4 / 1.9 % | 2.7 / 3.3 / 1.9 % | 2.8 / 3.2 / 2.0 % |
| mean price level (calendars / factor 1 / none) | 1.004 / 0.997 / 1.002 | 0.996 / 0.997 / 1.001 | 0.999 / 0.997 / 1.001 |

- **The days of rest cost nothing.** The world with the calendars of the faiths makes 0.1, 0.9 and 0.1 % more than
  the same world without a day of rest, and fewer of its workers are without work.
- **The whole gap is the owner's rule.** The factor 1 on every day and no working days differ only in the profit the
  owner plans on, and they differ by 1.5, 2.3 and 1.6 %, the gap itself.
- **On the profit of the day before the owners take more.** Over the three years their income is 4.3 % above the run
  with the factor 1 while GDP is 1.9 % above: 31.2 % of GDP against 30.5 %. The owner's budget comes out of the
  expected profit and is not below 0 (A.46, A.49 with the rule of feature 18). Cut day by day, a firm that loses on some days gives
  its owner 0 on those days and the full profit on the others, more than the cut of the profit of the year (feature
  18 found a third of the owners in the red on a day). That surplus is demand; the profit of the year (feature 20)
  takes most of it away.

Nothing is built for the gap: the world of the game has the rule of feature 20, and the run it was measured against
has the larger bias. The paper's period over which the owner expects his profit is a quarter (Poledna et al. 2023,
A.28 on quarterly profit), closer to a year than to a day.

### What stays open

- **Who is without work.** About 3 % of the workers in the world with the factor 1 on every day and 2.6 to 2.8 % with
  the calendars, against one person per city at the start: what share of the workers of a medieval town was without
  work is not set by any source used here.
- **The tables of 1291 are still those of 1356.** Only the history is cut at the start; the accounts (people, output,
  coin, the crown's revenue) are post-plague numbers for a pre-plague world (`src/sim/tables.ts`).

### State and upgrade

State version 34. The upgrade 33 → 34 founds the economies of a world that starts before the year of its table anew
on the day the world has reached, as the step to 24: their days and yearly figures are gone, the firms and the parts
of the persons are given out again, and the first period is the next day of the world. The persons stay who they
are. A world that starts in the year of its table goes on where it is: its calibration has not changed.

## 22. The workers who are away

Step 4 of way A of the proposal «Personen: Archiv der Toten und Tagesplan», proposed on 20 November 2026
(https://claude.ai/artifact/QK327U5QQQGWNCnL5JhHV5) and chosen by Ramon the same day («So bauen, Lohn läuft
weiter»). The sicknesses and the childbeds, their sources and how they are drawn are people feature 9
(docs/PEOPLE_DESIGN.md).

### Why

In the port every employee works in every period (A.13: the labour of a firm is `N α`). With a day as the period a
sick worker and a mother a week after a birth are at work like everybody else. The sick club of Morcott counted on
average a new sickness every four to five years for a man of working age, of three to five weeks from 25 on and of
months from 60 on (people feature 9); a mother lay in for a month.

### The rule

1. **Production** (A.13) is `min(a Q_s, a (N − n) α, a K κ, M β)`, with `n` the firm's employees who are away on the
   day and `a` the factor of its day (section 19). The work effort in α (A.25, A.26) stays that of the firm's
   employees. With nobody away it is the rule of section 19, number for number.
2. **The worker keeps the place and the wage.** The firm pays its `N` employees as before (A.26), the worker's
   household has the income it had, and the firm hires nobody for a worker who is away. That is how the wage runs on
   the days of rest of section 19 too. Wages by the day worked are the target income of step 6.
3. **A firm that sold all it had plans as if its workers had been there.** In the paper a firm's supply is the
   demand it met (section 8), and the port measures that demand by what the firm sold of its output and its stock
   (`Q_d_i` in the port's goods market). On a day on which the firm sold all it had, the output that its workers
   who were away would have made counts to the demand of its next plan: its buyers took all there was, and what
   was not made for want of hands is not a smaller demand. On a day on which it did not sell all it had, what it
   sold is the demand, and the absences took nothing from it. The day counts to the days the firm worked as any
   other (section 19, number 6).
4. **A firm does not buy again the materials that its workers who were away left unused.** The port buys the
   materials of the planned supply every period (A.18), since feature 20 those of the next working day, and uses
   `1 / β` of them per unit made (A.13). The materials of the output the firm did not make for want of hands stay in
   its stock, and it buys that much less at its next purchases. Bought again, they would lie in the stock day after
   day and draw goods from the market.

Rules 3 and 4 are ours: the port has no workers who are away. They follow from what the port's rules mean, the
supply of the demand met and the materials of what is made, on days when a firm cannot make what it planned.

### The rules that were measured and not kept

Eight combinations were built and run (`npm run absence:check -- 3`: the world of 1291 against the same world in which
everybody is there, real GDP, and those without work at the end of the third year). G and H were run after F was
built, G for step 6 of the day plan and H to close the drain of the firms' deposits (below):

| | the plan | the wage of a day away | the materials | real GDP, years 1 / 2 / 3 | without work in year 3 |
|---|---|---|---|---|---|
| A | what was sold; a day on which none of the firm's workers is there left out | paid | for the plan | −4.1 / −5.4 % / (not run) | 2,951 against 998 (year 2) |
| B | as if they had been there, if sold out (rule 3) | paid | for the plan | +0.1 / +3.8 / +5.4 % | 145 against 1,036 |
| C | rule 3 | none | for the plan | −1.6 / +1.5 / +3.6 % | 298 against 1,036 |
| D | rule 3 | none | for those who are there | −4.0 / −5.1 / −6.8 % | 2,936 against 1,036 |
| E | rule 3 | paid | for those who are there | −2.2 / −2.4 / −4.1 % | 2,015 against 1,036 |
| **F** | **rule 3** | **paid** | **not bought again (rule 4)** | **−1.9 / −1.9 / −3.4 %** | **2,215 against 1,036** |
| G | rule 3 | none | rule 4 | −3.7 / −4.6 / −6.3 % | 3,274 against 1,036 |
| H | rule 3 | paid | rule 4, and the capital not worn is not replaced | −2.2 / −3.0 / −5.3 % | 3,002 against 1,036 |

- **A**, the first build: a firm short of hands reads the output it could not make as a fall in demand, plans less,
  lets workers go, and does so again at its next plan. It had the rule for the day without anybody because without
  it a firm of one worker who fell sick made nothing and sold nothing for weeks, planned on a demand of 0, the demand
  pull took its supply or its price to 0, and the next day divided by that price (the engine stopped on 2 February
  1291 with "N_d_i: cannot round NaN to an integer"). Rule 3 gives such a firm a plan on what it would have made.
- **B and C** buy the materials of the whole plan every day while making less: the stock of materials grows, the
  firms pay for it and lose money (their deposits 59 % below the comparison in year 3 in C), the money goes to the
  households, who find too few goods and put it on deposit (18 to 27 % more), and the demand of those deposits
  drives a boom.
- **D and E** buy the port's materials times the share of the firm's workers who are there on the day they are
  used. The port's work effort counts the materials (A.25: what supply, capital and materials allow over what the
  employees make), so the effort and the wage (A.26) of those who are there fell with them, and so did the output
  that rule 3 counts: the firms read part of the absences as a fall in demand again. With all its workers away a
  firm bought nothing, and on the next day its effort and its wage were 0 (the tests of the world of 1356: a firm
  paid 0, and the economies stopped on day 120).
  D takes the wage of the days away from the households on top, and the slide is the steepest.
- **F**, the rule built: the effort and the wage stay those of all the firm's employees, the output that rule 3
  counts is what all would have made, and the stock of materials does not grow. GDP falls by 1.9 % in the first two
  years and by 3.4 % in the third, about the share of the days lost (3.6 %), and the price level stays. The firms'
  deposits fall (6, 11 and 16 % below the comparison) and the households' deposits rise by about as much; G shows
  that this is not the wage of the days away. From the second year on the firms take on fewer workers: those
  without work are twice as many in the third year (6.0 % of the workers against 2.8 %).
- **G** is F without the wage of the days away. The firms' deposits fall just as in F (5.9, 11.0 and 15.8 % below
  the comparison) and the households' deposits rise just as much (+1.4, +2.7 and +3.8 %): who pays the worker who
  is away does not move the money between firms and households. GDP falls twice as fast as in F, and three times as
  many are without work in the third year. Our reading, not measured apart: what the firm does not pay is profit,
  the profit goes to its owner, who is a household too (feature 18) and spends on the mean profit of the year
  (feature 20), so the households hold as much but spend it later than the worker would have.
- **H** is F with a fifth rule of the same kind as rule 4, for capital: a firm does not replace the capital that its
  workers who were away did not wear. It closes the drain (below), but the economies shrink further every year; it
  is not built.

### How the world gives it

The world gives the engine, city by city, the runs of days on which a worker is away: the worker (the position in
the port's list of workers, `person.agent`), the first and the last day. It gives them for a month on the first day
of the month, and for the rest of the month when it gives the working days of the year (at the founding of the
economies and after an upgrade). They are the days of people feature 9 of the living workers of the city (the
present persons, people feature 7): the episodes of sickness of the person and the 30 days of childbed from each
birth whose month reaches into the month given, the births already in the world and the next child of a woman
(`person.bears`) if it is due in the month. Runs that meet are one run.

The world computes at most to the end of a month at a time (`computeTo`), so that the days away of the next month
are given before its first day; many days at once give what the same days give one by one (tests in
`tests/absence.test.ts`).

Code: `economy/src/clock.rs` (`Absences`, `firms_production`, `firms_expectations_and_decisions`,
`search_and_matching`), `economy/src/lib.rs` (`absences`,
`sce_absences`), `src/sim/systems/economy.ts` (`absences`, `computeTo`), `src/sim/people/absence.ts`; tests in
`economy/tests/absences.rs` and `tests/absence.test.ts`.

### The numbers

The rule built (F), `npm run absence:check -- 6`, the world of 1291 against the same world in which everybody is
there:

| | year 1 | year 2 | year 3 | year 4 | year 5 | year 6 |
|---|---|---|---|---|---|---|
| days the workers are away (sick or in childbed) | 3.57 % | 3.50 % | 3.59 % | 3.53 % | 3.52 % | 3.57 % |
| real GDP | −1.9 % | −1.9 % | −3.4 % | −3.8 % | −4.0 % | −4.2 % |
| real GDP with the absences | 174,974 | 176,883 | 173,461 | 173,487 | 173,856 | 174,025 |
| consumption | −2.2 % | −2.2 % | −3.6 % | −4.0 % | −4.1 % | −4.3 % |
| investment | +1.6 % | +1.4 % | −0.1 % | −0.6 % | −0.7 % | −0.9 % |
| employees | −0.1 % | −2.0 % | −3.3 % | −3.5 % | −3.8 % | −4.0 % |
| employees with the absences | 35,644 | 34,910 | 34,400 | 34,423 | 34,337 | 34,266 |
| without work at the end of the year | 971 / 944 | 1,705 / 998 | 2,215 / 1,036 | 2,192 / 938 | 2,278 / 913 | 2,349 / 904 |
| households' deposits | +1.3 % | +2.7 % | +3.8 % | +4.9 % | +6.2 % | +7.5 % |
| firms' deposits | −6.1 % | −11.4 % | −16.4 % | −21.2 % | −25.7 % | −30.3 % |
| mean price level | 1.0049 / 1.0042 | 0.9920 / 0.9956 | 0.9983 / 0.9993 | 0.9991 / 0.9986 | 0.9988 / 0.9967 | 1.0015 / 0.9973 |

Output and employment settle after the third year. With the absences the world makes 173,500 to 174,000 a year and
employs 34,300 to 34,400 from year 3 to year 6, while the comparison grows by about 0.4 % a year; the gap, −4.2 % of
real GDP in year 6, is a little more than the 3.6 % of the days away.

The firms' deposits do not settle. They fall by about 400 a year (6,039 against 8,666 in year 6), and the
households' deposits grow by about as much. The transfer does not slow within six years. It is not the wage of the
days away: without that wage (G) the firms' deposits fall just as fast, so a wage by the day worked does not end it.
Where the money goes is the next section.

### Where the firms' money goes

The cash flows of the firms of all cities were added up day by day over two years, in the world with the absences
and in the comparison (a diagnostic of the port's terms of A.33 and A.34 that is not kept in the engine; patch,
probe and outputs in the project files, wirtschaft/leck-der-betriebe/). A firm pays out all its profit: its owner
takes the whole profit and bears the whole loss (feature 18; τ_FIRM is 0 in src/sim/economy/calibration.ts, and
in the measurement the dividends less the losses the owners bore are the profits: 72,594 − 19,677 = 52,917 in year 1).
So its deposits change only by what it spends on stocks: the change of its deposits is its depreciation less its
investment plus the materials it used less those it bought.

| change against the comparison | year 1 | year 2 |
|---|---|---|
| investment above depreciation | −473 | −455 |
| materials bought above those used | −66 | −51 |
| new credit and interest | +10 | +46 |
| the firms' deposits | −529 | −460 |

Nine tenths of the drain is investment. A firm invests what the capital of its planned supply wears (A.14:
δ/κ · min(Q_s, K κ)), and its capital wears with what it makes (A.3: δ/κ · Y). On a day on which workers are away
the firm makes less than it planned, so it replaces capital that was not worn: its capital grows beyond its use, and
the money it pays goes to the firms that make the capital goods and from them to their owners as profit. The money
is not lost: it is in capital that nobody uses, and in the households' deposits.

Rule H closes it the way rule 4 closes the materials: the capital that the workers who were away did not wear
(δ/κ times the output lost) is kept per firm and invested less at the next purchases, an own rule from A.3 and
A.14 as rule 4 is. Measured over six years against F:

| | year 1 | year 2 | year 3 | year 4 | year 5 | year 6 |
|---|---|---|---|---|---|---|
| real GDP, F | −1.9 % | −1.9 % | −3.4 % | −3.8 % | −4.0 % | −4.2 % |
| real GDP, H | −2.2 % | −3.0 % | −5.3 % | −6.5 % | −7.3 % | −8.3 % |
| employees, F | −0.1 % | −2.0 % | −3.3 % | −3.5 % | −3.8 % | −4.0 % |
| employees, H | −0.5 % | −3.3 % | −5.5 % | −6.4 % | −7.5 % | −8.3 % |
| firms' deposits, F | −6.1 % | −11.4 % | −16.4 % | −21.2 % | −25.7 % | −30.3 % |
| firms' deposits, H | −0.9 % | −1.5 % | −2.1 % | −2.7 % | −3.3 % | −3.8 % |

With H the deposits hold, but output and employment fall by about one per cent of the comparison a year and do not
settle within six years (3,866 without work in year 6 against 904). The capital that was not needed was also demand:
in F it keeps the makers of capital goods busy. Without it the owners have less to spend, and the economies shrink.
Neither is right: F builds capital nobody uses out of the firms' deposits, which would be gone in about 15 years at
this pace; H lets the economies shrink without end. In both the firm makes less on a day on which workers are away
and finds nobody to stand in for them.

### Limits

- **Given a month ahead.** The days away of a month follow from the workers at its start. A worker who dies passes
  the place to an heir (people feature 2), and the heir keeps the days away of the dead worker for the rest of the
  month; a worker who joins later in the month has none until the next.
- **No sick pay and no lost wage.** The wage of a worker who is away is paid by the firm as on any day. A club's or
  a guild's sick pay is not booked apart, and a day labourer would have lost the day's wage (step 6). Without the
  wage of the days away (G) the economies slide further.
- **The firms' deposits fall.** F replaces capital the workers who were away did not wear (above); the drain is
  about 5 % of the comparison a year and does not slow within six years.
- **Rules 3 and 4 are ours.** No paper read has workers who are away in a model of this kind; the rules take the
  port's own (the supply of the demand met, the materials of what is made) to the days a firm cannot make what it
  planned, and were chosen among the combinations measured above.
- **The owners are not away.** The owner of a firm is not one of its workers in the model.

### State and upgrade

The engine's state format 12: the clock keeps the absences of the month, a count and per absence the worker and the
first and last period, and then per firm the materials its workers who were away left unused (rule 4), after the
owners' profits of format 11. A state of an earlier format is read as one in which everybody is there. State version 35. The upgrade 34 → 35 changes nothing of the economies but the day to which
they were given working days (`workingTo` = −1): before the next day they are given the working days of the rest of
the year again and the absences of the rest of the month. The persons stay as they are; their days away follow from
them.
