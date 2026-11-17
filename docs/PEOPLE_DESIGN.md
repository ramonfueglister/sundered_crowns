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
| 2 | The persons live: a list of events, death, birth, marriage | built as a draft, 17 Nov 2026 (Ramon: all persons, event-driven, demography first; then, on the proposal of part 2: the mortality of the source and marriage only into a vacant household). It founds the persons anew (state 22) |

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
2. **Age and sex.** Stationary population of the life table of England around 1300 (La Poutré & Janssen 2021, one
   table for both sexes; feature 2): the age density is l(a). 105 boys per 100 girls at birth.
3. **Households.** A woman is a housewife with the share of her age in a population that does not grow: the
   households by the age of the wife as the program of La Poutré 2023 builds them at its start (RR[a] = (1 − q[a]) ·
   RR[a − 1] + the curve of the brides), over the women of that age, with 5.8 persons a household. Her husband is the
   free man of 18 or older nearest to her age + 3, within ten years; a housewife of 45 or older is a widow with the
   chance that a man three years older has died since she was 45. Everybody else joins a housewife of the same city
   who was 15–45 at their birth (uniform among those), as her and her husband's child (in a widow's household
   without known parents). Whoever is left is a family of their own, without a household.
4. **IQ and Big Five.** Persons without known parents: z ~ N(0, 1) for each of the six, independently. Children:
   z = h²·(z_mother + z_father)/2 + ε, ε ~ N(0, 1 − h⁴/2) (infinitesimal model), h² = 0.66 for IQ, 0.40 for each
   Big Five trait. IQ = 100 + 15z, T = 50 + 10z, rounded.

### Parameters

| Parameter | Value | Source |
|---|---|---|
| City sizes | 30 cities, 2,572,165 people | Reba, Reitsma & Seto 2016, Scientific Data 3:160034, chandlerV2.csv (CC BY 4.0), after Chandler 1987 |
| Life table | μ(x) of La Poutré & Janssen 2021 with β = 0.064, θ = −6.3 (e0 35.1) | Genus 77(1):12, eq. 3 and 11, fitted to the English tenants-in-chief born before 1276; the defaults of the program of La Poutré 2023. Until 17 Nov 2026: Coale-Demeny West level 3 (e0 25), which stays in `lifetable.ts` for the probes |
| Growth | 0 (stationary) | assumption |
| Sex ratio at birth | 1.05 | assumption |
| Age of the brides | curve of Coale and McNeil, mean 24, none before 15.5 | La Poutré & Paping 2025; program of La Poutré 2023 |
| Husband | 3 years older, at least 18 | men marry at about 27 (La Poutré & Paping 2025); the youngest is an assumption |
| Persons per household | 5.8 | La Poutré & Paping 2025 |
| Mother's age at birth | 15–45 | program of La Poutré 2023 (no births from 45 on) |
| Heritability IQ | 0.66 | Haworth et al. 2010, Molecular Psychiatry 15:1112–1120, young adults |
| Heritability Big Five | 0.40 | Vukasović & Bratko 2015, meta-analysis of 62 effects, over 100,000 persons |
| Inheritance | infinitesimal model | Barton, Etheridge & Véber 2017, Theoretical Population Biology 118:50–73 |

### Model against history (`npm run people:check -- 20`, 20 worlds)

| Figure | Model | History |
|---|---|---|
| Persons | 25,722 | 2,572,165 / 100 |
| Women of 14 and over with a husband | 43.4 % | about 60 % married, poll tax 1377 (Briggs 2024, CAMPOP): after the plague; around 1300 about 30 % of the women of 40 had never married (La Poutré & Paping 2025) |
| Persons per family | 5.19 (5.51 with a couple) | households c. 1300: 5.8 (La Poutré & Paping 2025) |
| Under 15 / 60 and over | 32.0 % / 4.8 % | (follows from the life table; the paper: at most a third under 14) |
| IQ mean / sd / slope on midparent | 100.05 / 15.03 / 0.661 | 100 / 15 / 0.66 |
| Big Five mean / sd / slope | 50.0 / 10.0 / 0.40 | 50 / 10 / 0.40 |

Not tuned. A family is smaller than a household because the persons who found no household to live in are families
of their own.

### Limits

- The six traits are independent; in reality they correlate (IQ and openness ρ = .20, Anglim et al. 2022; the Big Five
  intercorrelations of van der Linden et al. 2010 are paywalled and not read). Shared environment and assortative
  mating are left out.
- The life table is fitted to adult lords: it has no data below 15, the mortality of children is what its formula
  gives (16 % in the first year, 70 % reach 15). Bailey & Rigby 2012 give a life expectancy of 20 to 25 for the
  Middle Ages, the table 35. The plague of 1348 is not in the age structure. Towns probably had a higher mortality
  than the country, and the paper is about rural England; one table serves both.
- English marriage ages and households for all cities, also Cairo, Fez, Tabriz or Damascus, where people married earlier.
- Chandler's figures are estimates (Certainty 1–3 per city); Mali and Trabzon are 3.
- No servants: an unmarried adult lives in the household of the parents or alone; no estate, culture, genes or names per person yet.
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

## Feature 2: the persons live (the list of events, death, marriage, birth)

Ramon, 17 November 2026: all persons are to be simulated, a person is computed only when something is due
(event-driven), and what a person does is to depend on IQ, the Big Five and the town; demography comes first. The
research behind it (agent papers of 2025/26, Dwarf Fortress, Songs of Syx and other games, day planners such as
MATSim, demographic microsimulation, personality and life outcomes) and the order of the steps are in the proposals
(German): https://claude.ai/artifact/HvQdfFSJ1Mb35L4vZXRbQf and https://claude.ai/artifact/CSHcS21ac1gcX31d12bMFV.

Ramon also decided that day: there are only the persons of the simulation, in the ECS and on the map, so nobody
comes in from outside; and a world that shrinks as a whole is wrong for 1291. After the proposal of part 2 he chose
the mortality of the source (La Poutré & Janssen 2021) with marriage only into a vacant household (La Poutré &
Paping 2025).

Code: `src/sim/systems/deaths.ts`, `src/sim/systems/families.ts`, the rules and their numbers in
`src/sim/people/marriage.ts` and `src/sim/people/lifetable.ts`; the columns `person.dies`, `person.bears` and
`family.seat` (state 22). Check: `npm run families:check`.

### Death

The day of death is drawn once, when a person comes into the world (at the founding for everybody), from the life
table of feature 1 (La Poutré & Janssen 2021), given the age reached: l(t*) = (1 − u) · l(a), with l the
survivorship and u a draw of the person's own stream (`hash01(seed, id, 40)`). Within a year of
age the force of mortality is taken as constant. This is the next-event method of demographic
microsimulation (Modgen/DYNAMIS-POP, MicSim): a waiting time is drawn instead of a daily throw, and the earliest
event is the next. Death depends on age only; IQ and the Big Five do not move it yet (step 3 of the plan).

The list of events is a heap over the column `person.dies`, built when a state is first seen: it is no state of its
own, so a snapshot stays its arrays. The system `deaths` runs before the economy every day and lets everybody die
whose day has come: about 8 persons a day in the world of 1291. The events of a day come in the order of the
persons, however the list was built.

A death writes `person.died`, and the family loses its head if the dead person was one. A ruler dies on the day of
the chronicle as before.

**Succession in the economy (assumption, no source).** The engine computes a fixed list of persons for every town
and cannot add or remove one. A dead person's part (worker, owner of a firm, owner of the bank, the person who does
not work) goes to a living person of the town of 15 or older who has none: first of the dead person's family, then
a child, then anybody of the town, in the order of `work.ts`; with the place in the engine's list go the employer,
the firm and the money. Where nobody is free the part stays with the dead (an estate) and is looked at again on the
first day of each month. So the number of persons in a town's economy does not change with the town.

### Marriage and birth

**The source.** La Poutré & Paping 2025 reconstruct England around 1300 as a population that does not grow because
the number of households is fixed: a wedding needs a vacant household. Read: the paper in full, the program of the
simulation (La Poutré 2023, thesis Groningen, program code) and La Poutré & Janssen 2021. Not read: chapter III,
section 8.6 and appendix B of the thesis (the file opens only to page 44 here), so the rules are those of the
program, not of the thesis' prose.

**Households.** A family with a seat (`family.seat`) is a household of its town, and the woman at its head is its
housewife. The number of seats of a town is that of its founding and does not change. A household whose housewife
has died is vacant.

**Weddings**, on the first day of every month, in every town:

1. Each vacant household looks for a bride: an age is drawn from the curve of Coale and McNeil (mean 24, none before
   15.5: w(x) = exp(−0.174/k · z − exp(−0.288/k · z)), z = x − 15.5 − 6.06k, k = (24 − 15.5)/11.36), and the bride is
   the woman of the town without a household whose age is nearest, within 2.5 years. Her groom is the man of the
   town without a wife, 18 or older, nearest to her age + 3, within ten years. Where he is the widower of a vacant
   household she becomes its housewife; else the couple is a new family that takes the seat of the vacant household
   and its house (parcel or farmstead). Without a bride or a groom the household stays vacant for the month.
2. A widow under 45 who keeps a household takes a husband in the same way.

**Births.** A wife with a living husband bears at the rate f(a) / 2.75 a year, f(a) = 1 − exp(4.6 · ((a − 15)/30 − 1)),
nothing from 45 on (33 months between births at her most fertile). The day of her next birth is drawn when she
marries and after every birth (`person.bears`), at the earliest nine months later, with the rate after that as much
higher; it is void when her husband dies. A child is born into the family of the mother with the sex ratio, the
inheritance of IQ, Big Five and genes of feature 1, the culture and faith of the mother, and its day of death.

| Parameter | Value | Source |
|---|---|---|
| Mortality | β 0.064, θ −6.3, ω 2.7 | La Poutré & Janssen 2021, table 2 and eq. 11; program defaults |
| Number of households | fixed | La Poutré & Paping 2025 (no growth 1290–1315) |
| Brides | Coale-McNeil, mean 24, minimum 15.5 | La Poutré & Paping 2025; program |
| Husband older by | 3 years | men marry at about 27 (La Poutré & Paping 2025) |
| Birth interval, fertility by age, last birth before 45 | 2.75 years, f(a), 45 | program (BpY = 0.33 = (1 − 10 % widows)/2.75; FertilityThreshold) |
| Search windows, youngest groom 18, nine months between births | | assumptions, no source |
| A widow under 45 marries again | | assumption: the program has no widows, the paper counts 10 % of the housewives as widows |

### Measured (`npm run families:check`, world of 1291, seed 1291, deaths, weddings and births over 100 years)

| Figure | Founding | Year 50 | Year 100 | La Poutré & Paping 2025 |
|---|---|---|---|---|
| Persons | 102,042 | 97,050 | 97,823 | no growth |
| Households (vacant) | 17,702 (0) | 17,702 (51) | 17,702 (46) | fixed |
| Persons per household | 5.76 | 5.48 | 5.53 | 5.8 |
| Under 15 | 32 % | 32 % | 32 % | at most a third under 14 |
| Widows among the housewives | 14 % | 15 % | 14 % | 10 % |
| Women of 40 to 44 without a household | 30 % | 26 % | 27 % | about 30 % never married at 40 |
| Deaths / births / weddings in the year | | 2,770 / 2,771 / 862 | 2,832 / 2,834 / 907 | |

Mean age of the brides 23.8 (the paper: 24). The world settles at 5.5 persons a household, 4 % below its founding,
and stays there. By size of the place at the founding, after 100 years: under 60 persons −4.1 % (9 of 58 places
below half, one empty), 60 to 100 −1.3 %, 100 to 200 −1.2 %, 200 to 500 −4.0 %, 500 and more −8.0 %. Parts of the
economy held by the dead: 0 in the first years, about 600 to 750 of 49,745 from year 50 on.
100 years of deaths, weddings and births take 25 s; the persons' table has 378,000 rows then (the dead stay).

The rule alone, in a closed population of 20,000 single persons over 500 years (`tools/sim/positions_probe.ts`):
with the mortality of the source 5.4 persons a household and 25 % never married at 40 where widows stay alone, 6.15
and 34 % where widows under 45 marry again, growth 0.00 % a year in both; with Coale-Demeny West level 3 the rule
is stable too, at 4.0 persons a household and almost nobody unmarried.

### The first probe: marriage by age alone (not built)

Before the paper was read in full: without households, everybody marries at an age of their own.

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
Ramon, 17 November 2026: clear the source first. The source has the answer above: a fixed number of households.

### Limits

- One life table for everybody; no plague, no famine, no death in childbed. IQ and the Big Five move nothing yet.
- Nobody moves between towns: brides and grooms are of the town itself, so a small town can die out (one of 550 in
  100 years) and none can grow past its households. The number of households does not follow the land or the
  economy yet (the program has a rule for it: growth of the households = λ − κ · population).
- A child conceived before its father died is not born. No twins, no births outside marriage.
- The dead keep their rows; the tables grow by about 2,800 persons and 650 families a year in the world of 1291.
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
- La Poutré, H., Paping, R. (2025): English familial demography c. 1300: a reconstruction. Social Science History 49(2), 533–557. Full text: https://pure.rug.nl/ws/portalfiles/portal/1511914604/english-familial-demography-c-1300-a-reconstruction_1_.pdf
- La Poutré, H. (2023): English population 1086–1377: a modelling approach. Thesis, Groningen. Program code of the simulation: https://pure.rug.nl/ws/portalfiles/portal/663712445/simulation_64294d0e31b65.txt
- La Poutré, H., Janssen, F. (2021): A two-parameter hazard function to describe age patterns of mortality in ancient Northwestern Europe. Genus 77(1):12. https://link.springer.com/10.1186/s41118-021-00122-w
