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
| 1b | 1291: persons in every town of the world graphic inside the world frame (558 towns, ~102,000 persons; state 15) | agreed by Ramon 16 Nov 2026 (world of towns); tools/history/1291/towns.py writes src/sim/content/cities_1291.json |
| 2 | The persons live: a list of events, death, birth, marriage (part 1: the list of events and death) | part 1 built as a draft, 17 Nov 2026 (Ramon: all persons, event-driven, demography first; only the list of events and death until the sources for fertility are clear). Not for a running world before births are in: it would shrink |

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

## Feature 2: the persons live (part 1: the list of events and death)

Ramon, 17 November 2026: all persons are to be simulated, a person is computed only when something is due
(event-driven), and what a person does is to depend on IQ, the Big Five and the town; demography comes first. The
research behind it (agent papers of 2025/26, Dwarf Fortress, Songs of Syx and other games, day planners such as
MATSim, demographic microsimulation, personality and life outcomes) and the order of the steps are in the proposals
(German): https://claude.ai/artifact/HvQdfFSJ1Mb35L4vZXRbQf and https://claude.ai/artifact/CSHcS21ac1gcX31d12bMFV.

Ramon also decided that day: there are only the persons of the simulation, in the ECS and on the map, so nobody
comes in from outside; and a world that shrinks as a whole is wrong for 1291. Births, marriage and remarriage are
therefore part of this feature, and part 1 alone must not reach a running world.

Code: `src/sim/systems/deaths.ts`, the column `person.dies` (state 21). Check: `npm run deaths:check`.

### Model

The day of death is drawn once, when a person comes into the world (at the founding for everybody), from the life
table of feature 1 (Coale-Demeny West level 3), given the age reached: l(t*) = (1 − u) · l(a), with l the
survivorship of the person's sex and u a draw of the person's own stream (`hash01(seed, id, 40)`). Within a year of
age the force of mortality is constant, as `survivorship` takes it. This is the next-event method of demographic
microsimulation (Modgen/DYNAMIS-POP, MicSim): a waiting time is drawn instead of a daily throw, and the earliest
event is the next. Death depends on age and sex only; IQ and the Big Five do not move it yet (step 3 of the plan).

The list of events is a heap over the column `person.dies`, built when a state is first seen: it is no state of its
own, so a snapshot stays its arrays. The system `deaths` runs before the economy every day and lets everybody die
whose day has come: about 12 persons a day in the world of 1291.

A death writes `person.died`, and the family loses its head if the dead person was one. A ruler dies on the day of
the chronicle as before.

**Succession in the economy (assumption, no source).** The engine computes a fixed list of persons for every town
and cannot add or remove one. A dead person's part (worker, owner of a firm, owner of the bank, the person who does
not work) goes to a living person of the town of 15 or older who has none: first of the dead person's family, then
a child, then anybody of the town, in the order of `work.ts`; with the place in the engine's list go the employer,
the firm and the money. Where nobody is free the part stays with the dead (an estate) and is looked at again on the
first day of each month. So the number of persons in a town's economy does not change with the town.

### Measured (`npm run deaths:check`, world of 1291, seed 1291, only the deaths run)

| Figure | Model | Life table |
|---|---|---|
| Persons at the founding | 102,042 in 550 places | |
| Dead within 10 years, aged under 1 at the founding | 37.7 % | 39.3 % |
| aged 1 to 4 | 18.9 % | 19.0 % |
| aged 20 to 29 | 17.4 % | 17.6 % |
| aged 40 to 49 | 29.6 % | 29.1 % |
| aged 60 to 69 | 66.2 % | 66.3 % |
| Deaths in year 1 / 2 / 10 / 30 | 3,473 / 2,724 / 2,144 / 1,588 | |
| Living after 30 years without births | 39,804 | |
| Parts of the economy held by the dead after 5 / 20 / 30 years | 3 / 264 / 7,794 of 47,332 | |

The draw itself is tested against the table for 200,000 even draws per sex (`tests/deaths.test.ts`): survival to
every tested age to three decimals. Without births the deaths per 1,000 fall from 34 to 25 in five years (the
infants, who die most, are not replaced) and the estates pile up after year 15: both end with part 2.

### What makes the closed world stable (probe, not built)

A closed population of 20,000 persons run for 300 years with the marriage rule of the founding (growth of the last
200 years; `tools/sim/closed_population_probe.ts`). Fertility is the natural schedule
of Coale and Trussell, r(a) = M · n(a) (n = 0.460, 0.431, 0.395, 0.322, 0.167, 0.024 for 20–24 … 45–49; single
years 15–19: 0.325, 0.375, 0.421, 0.460, 0.475).

| West level (e0 women) | Marriage age f / m | M | Remarriage | Growth a year | Married of women 15–49 |
|---|---|---|---|---|---|
| 3 (25.0) | 24 / 27 | 1.0 | no | −0.65 % | 46 % |
| 3 (25.0) | 24 / 27 | 1.0 | yes | −0.06 % | 65 % |
| 3 (25.0) | 24 / 27 | 0.9 | yes | −0.27 % | 63 % |
| 3 (25.0) | 24 / 27 | 0.75 | yes | −0.66 % | 66 % |
| 3 (25.0) | 24 / 27, 10 % never marry | 1.0 | yes | −0.33 % | 59 % |
| 3 (25.0) | 20 / 23 | 0.75 | yes | +0.03 % | 77 % |
| 3 (25.0) | 18 / 21 | 0.75 | yes | +0.38 % | 84 % |
| 5 (30.0) | 24 / 27 | 0.75 | yes | −0.07 % | 68 % |
| 7 (35.0) | 24 / 27 | 0.75 | yes | +0.46 % | 68 % |
| 7 (35.0) | 24 / 27 | 0.75 | no | −0.14 % | 57 % |

Nothing is stable without remarriage. M = 0.75 is our arithmetic from the English family reconstitutions of
1540–1850 (total marital fertility 6.7 to 6.8 against 9.0 of the standard; Alter, Newton & Oeppen 2020); no value
for 1300 was found. La Poutré & Paping 2025 give men 25 years of life left at marriage at 27: level 3 gives 25.3.
Open before part 2: the level of fertility around 1300, how often the widowed married again, the share who never
married (Ramon, 17 November 2026: clear the source first).

### Limits

- One life table for everybody; no plague, no famine, no death in childbed.
- Who works is not drawn anew: the shares of men and women who work drift with the successions, and a woman who
  loses her husband does not start to work (economy feature 11 drew that at the founding).
- A family keeps its ground and its hamlet whoever of it works now; the farmers of a place (the harvest) are
  counted from the families that were settled at the founding.
- Orphans stay a family without a head.

### Sources

- Modgen / DYNAMIS-POP, methods: https://dynamis.ihsn.org/guide/Report/10_Methods.html
- Zinn, S. (2024): MicSim (slides, IMA 2024). https://ima-2024.wifo.ac.at/_downloads/034811e70c6ee9068b5214e504efaab3/zinn.pdf
- Coale, A. J., Trussell, T. J. (1974): Model fertility schedules. Population Index 40(2), 185–258 (values read in https://journal.ipb.ac.id/index.php/jmap/article/download/20244/13979 and https://journals.utm.my/jurnalteknologi/article/download/457/447/454).
- Alter, G., Newton, G., Oeppen, J. (2020), on the Cambridge Group reconstitutions. https://pmc.ncbi.nlm.nih.gov/articles/PMC10923557
