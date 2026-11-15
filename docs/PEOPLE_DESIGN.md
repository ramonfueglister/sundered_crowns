# People design

Same working rules as the economy (docs/ECONOMY_DESIGN.md): one feature at a time, every number with its source,
nothing built before Ramon agrees. Proposal with sources (German): https://claude.ai/artifact/6bznnutwdzaWoR1qTRat3e

## Decisions (Ramon, 15 November 2026)

- Not every inhabitant is a person. About 20,000 persons in a selection of the most important cities across the map;
  the rest of every place stays a number (`place.pop`).
- The 30 largest cities, at the scale of the whole world, 1 : 100.
- City sizes after Chandler (below), and places that are smaller than their city grow to it.
- Every person: birthday, age (derived), sex, parents, family, IQ and the Big Five, normally distributed. Minimal.

## Features

| # | Feature | Status |
|---|---|---|
| 1 | Persons of the 30 largest cities in 1356 | agreed by Ramon 15 Nov 2026 and built; in the running world once the world server is redeployed |

## Feature 1: persons of the 30 largest cities

Code: `src/sim/systems/people.ts`, `src/sim/people/lifetable.ts`, state in `src/sim/state.ts` (`person`, `family`),
cities in `src/sim/content/cities_1356.json` (written by `tools/people/build_cities.py`). Check: `npm run people:check`.

Built once when a world starting in 1356 is founded (or by the upgrade 4 → 5 of an older one). Nothing changes while
the world runs yet: no births, deaths, marriages or moves. Age = (day − born) / 365.25 and is never stored. No row of
either table is ever freed, so ids are never reused (parents, families and the portraits' seed stay valid).
All randomness comes from a stream of its own, `hash01(seed, person id, draw)`, never from `s.rng`.

| Table | Column | Type | Meaning |
|---|---|---|---|
| person | born | i32 | days since 1 January 1356, negative before |
| person | sex | u8 | 0 female, 1 male |
| person | mother, father | i32 | person ids, −1 unknown |
| person | family | i32 | the family the person lives in |
| person | iq | u8 | IQ points, mean 100, sd 15, normed on the world's people |
| person | o, c, e, a, n | u8 | Big Five as T-scores, mean 50, sd 10 |
| family | place | i16 | place of the map |
| family | man, woman | i32 | the couple at the head, −1 where there is none |

### Steps

1. **Cities.** Chandler's population of 1356, interpolated linearly between the nearest years before and after (each
   at most 60 years away), the 30 largest inside the map, each in the nearest land place (Sarai corrected to our place
   Sarai: the data set puts it near Tambov). Persons = people / 100, rounded. Places smaller than their cities grow to
   them (+385,000 people in 17 places, 0.26 % of the world).
2. **Age and sex.** Stationary population of Coale-Demeny West level 3 (e0 women 25.00, men 22.85 in our
   implementation): the age density is l(a). 105 boys per 100 girls at birth.
3. **Families.** Personal age at first marriage ~ N(24, 4) for women, N(27, 4) for men, at least 15. Women of
   marrying age, oldest first, take the unmarried man of marrying age nearest to their age + 3. Everybody below their
   marriage age joins a wife of the same city who was 15–49 at their birth (uniform among those), with her husband as
   father. Whoever is left is a family of their own.
4. **IQ and Big Five.** Persons without known parents: z ~ N(0, 1) for each of the six, independently. Children:
   z = h²·(z_mother + z_father)/2 + ε, ε ~ N(0, 1 − h⁴/2) (infinitesimal model), h² = 0.66 for IQ, 0.40 for each
   Big Five trait. IQ = 100 + 15z, T = 50 + 10z, rounded.

### Parameters

| Parameter | Value | Source |
|---|---|---|
| City sizes | 30 cities, 2,572,165 people | Reba, Reitsma & Seto 2016, Scientific Data 3:160034, chandlerV2.csv (CC BY 4.0), after Chandler 1987 |
| Life table | Coale-Demeny West level 3 | Coale & Demeny 1983 tables, method and coefficients as in demogR `cdmltw` (Oeppen 2018 corrections); level from Bailey & Rigby 2012 (e0 20–25 in the Middle Ages) and Ohlin 1966 (about 25, nobility c. 1300) |
| Growth | 0 (stationary) | assumption |
| Sex ratio at birth | 1.05 | assumption |
| Mean age at first marriage | women 24, men 27 | La Poutré & Paping 2025, Social Science History, England c. 1300 (abstract) |
| Spread of marriage age | sd 4 years, minimum 15 | assumption |
| Mother's age at birth | 15–49 | assumption (the usual reproductive span) |
| Heritability IQ | 0.66 | Haworth et al. 2010, Molecular Psychiatry 15:1112–1120, young adults |
| Heritability Big Five | 0.40 | Vukasović & Bratko 2015, meta-analysis of 62 effects, over 100,000 persons |
| Inheritance | infinitesimal model | Barton, Etheridge & Véber 2017, Theoretical Population Biology 118:50–73 |

### Model against history (`npm run people:check -- 20`, 20 worlds)

| Figure | Model | History |
|---|---|---|
| Persons | 25,722 | 2,572,165 / 100 |
| Married women of 14 and over | 60.9 % | about 60 %, poll tax 1377 (Briggs 2024, CAMPOP) |
| Persons per family | 3.92 (4.52 with a couple) | households c. 1300: 5.8 (La Poutré & Paping 2025; whether servants count is not read) |
| Under 15 / 60 and over | 34.1 % / 6.0 % | (follows from the life table) |
| IQ mean / sd / slope on midparent | 100.07 / 15.02 / 0.662 | 100 / 15 / 0.66 |
| Big Five mean / sd / slope | 50.0 / 10.0 / 0.397–0.406 | 50 / 10 / 0.40 |

Not tuned: the married share was not calibrated. The family is smaller than the household of c. 1300 because servants,
lodgers and three-generation households are not modelled.

### Limits

- The six traits are independent; in reality they correlate (IQ and openness ρ = .20, Anglim et al. 2022; the Big Five
  intercorrelations of van der Linden et al. 2010 are paywalled and not read). Shared environment and assortative
  mating are left out.
- The medieval life tables themselves (Hatcher 1986, Harvey 1993, Razi 1980) were not opened. The plague of 1348 is
  not in the age structure. Towns probably had a higher mortality than the country; one table serves both.
- English marriage ages for all 30 cities, also Cairo, Fez, Tabriz or Damascus, where people married earlier.
- Chandler's figures are estimates (Certainty 1–3 per city); Mali and Trabzon are 3.
- No servants, no three-generation households; no estate, culture, genes or names per person yet.
- Upgraded worlds: places grow to their cities at once; arable and harvest follow on the next 1 January.

### Sources

- Reba, M., Reitsma, F., Seto, K. C. (2016): Spatializing 6,000 years of global urbanization from 3700 BC to AD 2000. Scientific Data 3, 160034. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4896125/
- Haworth, C. M. A. et al. (2010): The heritability of general cognitive ability increases linearly from childhood to young adulthood. Molecular Psychiatry 15, 1112–1120.
- Vukasović, T., Bratko, D. (2015): Heritability of personality: a meta-analysis of behavior genetic studies. https://www.bib.irb.hr/761863
- Barton, N. H., Etheridge, A. M., Véber, A. (2017): The infinitesimal model: definition, derivation, and implications. Theoretical Population Biology 118, 50–73.
- La Poutré, H., Paping, R. (2025): English familial demography c. 1300: a reconstruction. Social Science History.
- Bailey, M., Rigby, S. (eds., 2012): Town and Countryside in the Age of the Black Death. Brepols (introduction).
- Briggs, C. (2024): Marriage in the Middle Ages. CAMPOP blog. https://www.campop.geog.cam.ac.uk/blog/2024/07/25/marriage-in-the-middle-ages/
- Anglim, J. et al. (2022): Personality and intelligence: a meta-analysis. Psychological Bulletin 148, 301–336.
- demogR, `cdmltw`: https://raw.githubusercontent.com/hanase/demogR/master/R/cdmltw.R
