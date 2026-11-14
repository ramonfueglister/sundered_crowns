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
| 1 | Grain harvest per place | proposed 14 Nov 2026, awaiting Ramon |

## 1. Grain harvest per place (proposed)

Full proposal for Ramon (German): https://claude.ai/artifact/UfkTR85DULTcDZc52gZjya

**Scope.** Every place brings in one grain harvest per year. Nothing else: no consumption, population change, prices,
trade, taxes, towns, weather or other goods.

**Model.** Malthusian production function (Ashraf and Galor 2011, equation 1):

    Y_i = Z · (A_i · X_i)^α · L_i^(1−α)

| Symbol | Meaning | Value | Source |
|---|---|---|---|
| Y | harvest of the place per year, net of seed | result | – |
| A | land productivity, potential kcal per hectare and year | per place, Caloric Suitability Index, pre-1500 crops, rain-fed, low inputs, 5′ grid | Galor and Özak 2016 |
| X | land area of the place (ha) | map | – |
| L | people living from agriculture | 74 % of the place's population | Allen 2000 (England 74 %, France 73 % around 1500), as cited by Crafts and Harley 2002, p. 2 |
| α | land share | 0.4 | Voigtländer and Voth 2013, table 1 (labour share in agriculture 0.6) |
| Z | one calibration constant for the whole map | calibrated on England around 1300 | Broadberry et al. 2010 |

Constant returns to scale: dividing land and people by 100 divides the harvest by 100, so the 1 : 100 scale leaves all
per-head values unchanged.

**Calibration target, England 1300–1309** (Broadberry, Campbell, Klein, Overton, van Leeuwen 2010): arable 11.52 m acres,
of which 7.40 m sown and 4.13 m fallow (table 1); yields per acre net of seed: wheat 7.99, rye 10.49, barley 9.63,
oats 6.08 bushels (table 2); output net of seed and fodder 51.65 m bushels: wheat 19.39, rye 5.73, barley 11.06,
oats 14.01, pulses 1.46 (table 3); population 4.73 m in 1300 (table 16); 1,242 kcal per head and day from arable
(table 19).

**Check without further tuning.** With the 1356 start population, the harvest per head in the large regions must lie
near subsistence: about 1,500 kcal per head and day as the floor (Broadberry et al. 2010, pp. 28–29) and 170 kg of grain
per person and year in the bare-bones basket (Allen 2013, table 2). Regions far off mean the model or the start
population is wrong; the deviations go to Ramon as a table.

**Known limits.**
- Irrigation is not in the index (Galor and Özak 2015, p. 4, fn. 1): the Nile valley and Mesopotamia are understated and
  need their own source.
- The index uses the FAO's present-day agro-climatic data, not the climate of the fourteenth century.
- 74 % and α = 0.4 come from England, France and a model of early modern Europe and are applied to the whole map.
  Allen's original table was not accessible; only the citation in Crafts and Harley was read.
- English yields are demesne yields, assumed representative; Stone (2006) puts peasant yields about 11 % higher
  (Broadberry et al. 2010).
- One harvest per year; no regional harvest calendars, no second harvests.
- The dataset is hosted on zenodo.org, which the cloud environment's network policy blocks. Access has to be requested
  once Ramon agrees to the feature.

**Sources** (all opened on 14 November 2026)
- Ashraf, Q., Galor, O. (2011). Dynamics and Stagnation in the Malthusian Epoch. American Economic Review 101(5),
  2003–2041. https://www.nber.org/papers/w17037.pdf (production function p. 3; table 5: elasticity of population density
  in 1500 with respect to land productivity 0.584, of income per capita 0.041)
- Galor, O., Özak, Ö. (2016). The Agricultural Origins of Time Preference. American Economic Review 106(10), 3064–3103.
  Data: https://ozak.github.io/Caloric-Suitability-Index/ (CC BY-SA 4.0; recommended raster pre1500MaximumCalories0.tif,
  Zenodo record 14714917)
- Galor, O., Özak, Ö. (2015). Land Productivity and Economic Development: Caloric Suitability vs. Agricultural
  Suitability. https://economics.brown.edu/sites/default/files/papers/2015-5_paper_0.pdf
- Voigtländer, N., Voth, H.-J. (2013). The Three Horsemen of Riches: Plague, War, and Urbanization in Early Modern
  Europe. Review of Economic Studies 80, 774–811. https://www.jvoth.com/Three_Horsemen.pdf
- Broadberry, S., Campbell, B., Klein, A., Overton, M., van Leeuwen, B. (2010). English Economic Growth, 1270–1700.
  CAGE Working Paper 21, University of Warwick.
  https://warwick.ac.uk/fac/soc/economics/research/centres/cage/manage/publications/21.2010_broadberry_complete.pdf
- Allen, R. C. (2000). Economic structure and agricultural productivity in Europe, 1300–1800. European Review of
  Economic History 4(1), 1–25. https://ora.ox.ac.uk/objects/uuid:9ef3c3c6-512f-44b6-b74e-53266cc42ae2
- Crafts, N. F. R., Harley, C. K. (2002). Precocious British Industrialization: A General Equilibrium Perspective.
  LSE Working Paper 67/02. https://www.lse.ac.uk/asset-library/information/wp6702.pdf
- Allen, R. C. (2013). The High Wage Economy and the Industrial Revolution: A Restatement. Oxford Discussion Papers in
  Economic and Social History 115. https://www.nuff.ox.ac.uk/Economics/History/Paper115/allen115.pdf
- Slicher van Bath, B. H. (1963). Yield Ratios, 810–1820. A.A.G. Bijdragen 10, Wageningen.
  https://edepot.wur.nl/296371 (p. 16: 3.0–4.7 grains harvested per grain sown before 1500, which is why the harvest is
  counted net of seed)
