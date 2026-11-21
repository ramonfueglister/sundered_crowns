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
| 2 | The persons live: a list of events, death, birth, marriage | built as a draft, 17 Nov 2026 (Ramon: all persons, event-driven, demography first; then, on the proposal of part 2: the mortality of the source and marriage only into a vacant household). It founds the persons anew (state 23) |
| 3 | A household passes to an heir by the custom of the culture | built 18 Nov 2026 (Ramon, 17 Nov: a custom for every culture; 18 Nov: only what a source that was read supports, 83 % of the persons). No new state |
| 4 | The unmarried move to other places, and an heir comes home | built 18 Nov 2026 (Ramon, 18 Nov: the young unmarried move by the measured rates, heirs come home; work, whole families and the flight from a famine follow later, one by one). State 25 |
| 5 | IQ and the Big Five shift the rates of death, of a far move and of who marries | built 18 Nov 2026 (Ramon, 18 Nov: «So bauen» on the proposal, with the factor 0.89 for the IQ). State 28 |
| 6 | Who wants work looks for a part in the economy, in the own town and within 115 km | built 18 Nov 2026 (Ramon, 18 Nov: «weiter» on the proposal, read as «So bauen»). No new state |
| 7 | The living and the dead: the systems go over the living, the dead go to an archive (step 1: the list of the living; step 2: the archive, with a uid for every person) | built 19 Nov 2026 (Ramon, 19 Nov: «weiter» on the proposal of the archive and the day plan, read as «So bauen» for way A: the archive first, then the day plan). Step 1 no new state, step 2 state 30 |
| 8 | The calendar of the town: the firms work on the working days of their owner's faith (step 3 of the day plan) | built 19 Nov 2026 (Ramon, 19 Nov: way A of the proposal, after the archive the day plan; «vorwärts machen alles mergen comitten und feddich»). Economy feature 19. State 31 |
| 9 | Sickness and childbed keep a worker from work (step 4 of the day plan) | built 20 Nov 2026 (Ramon, 20 Nov: «So bauen, Lohn läuft weiter» on the proposal https://claude.ai/artifact/QK327U5QQQGWNCnL5JhHV5). Economy feature 22. State 35 |
| 10 | Service by the year and work by the day: a worker who heads a family works by the day, every other worker serves by the year (step 6 of the day plan) | built 20 Nov 2026 (Ramon, 20 Nov: «Phase A bauen und messen» on the proposal https://claude.ai/artifact/Wyqd64rfmZgJnz9GZ7Wof9). Economy feature 23. State 36. Since economy feature 24 (State 39) the family stands in first |
| 11 | History where the world is still history: the shadow world, the parents of the persons of history, and the divergence | built 20 Nov 2026 (Ramon, 20 Nov: «ok» on the recommendation to build the shadow world and the graph of persons first, then the death of a ruler as luck). No new state |

## Feature 1: persons of the 30 largest cities

Code: `src/sim/systems/people.ts`, `src/sim/people/lifetable.ts`, state in `src/sim/state.ts` (`person`, `family`),
cities in `src/sim/content/cities_1356.json` (written by `tools/people/build_cities.py`). Check: `npm run people:check`.

Built once when a world starting in 1356 is founded (or by the upgrade 4 → 5 of an older one). Nothing changes while
the world runs yet: no births, deaths, marriages or moves. Age = (day − born) / 365.25 and is never stored. No row of
either table is ever freed, so ids are never reused (parents, families and the portraits' seed stay valid).
All randomness comes from a stream of its own, `hash01(seed, person id, draw)`, never from `s.rng`. (Since feature 7,
step 2, the dead go to an archive on the first of January and the rows of the persons close up: the parents, the
draws and the portraits' seed are by the `uid`, which never changes.)

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
`family.seat` (state 23). Check: `npm run families:check`.

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
the chronicle, or, where the chronicle gives no day, on a day drawn from the same life table (feature 11).

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

Nobody marries a brother, a sister, a parent or a child (added with feature 3; before it 4 % of the weddings of a
run of 100 years were between siblings, who are the nearest in age in a small town).

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

As measured before feature 3; with the heirs and without the weddings between siblings the figures are in feature 3.

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

## Feature 3: a household passes to an heir (the custom of the culture)

Ramon, 17 November 2026: who takes over a household is to follow the custom of the culture, not English custom
everywhere; 18 November, on the proposal: only the cultures a source that was read speaks for get a custom, the
others keep the rule of feature 2 until a source is there. The proposal with all that was read and what could not
be opened (German): https://claude.ai/artifact/CSHcS21ac1gcX31d12bMFV, section «Vorschlag: Erbbrauch je Kultur».

Code: `src/sim/people/inheritance.ts` (the customs, the cultures of each with the source, `heirOf`), the rule in
`weddingsOn` of `src/sim/systems/families.ts`. No new state: the children of a house are found from the columns
`person.mother`, `person.father` and `person.family`. Check: `npm run families:check`; `tests/inheritance.test.ts`.
Since feature 4 a child of the house who lives in another place and has not married there stands in the line too,
and comes home for the house.

### The rule

When the housewife of a household has died (the household is vacant), on the first day of the month and before the
weddings of feature 2:

1. The children of the house are the living persons of the town whose mother or father was of the family, wherever
   they live now. The custom is that of their father's culture, for a Muslim father that of the faith (of the mother
   where no father is known).
2. The custom names the heir among the children who are free: grown (a son of 18 or older, a daughter of 16 to 44)
   and not at the head of a household. Where the child it names first is not free, the next one stands in.
3. An heir who is a son takes a bride of the town by the curve of feature 2; an heiress takes a groom of the town
   nearest to her age + 3, within ten years. The couple is a new family with the seat and the house (parcel or
   farmstead). The widower and the other children stay a family and stay in the house.
4. Where the custom names nobody, the culture has no custom, or the heir finds no spouse that month, the weddings of
   feature 2 follow as they are: the widower marries again, or a couple of the town takes the household.

A household is never divided, because the number of households of a town is fixed (La Poutré & Paping 2025). Where
the sources divide the land among several children, the custom only decides which one of them takes the household.
The firm and the savings of the dead go as in feature 2 (to the family first).

| Custom | Who takes the household | Without a living son |
|---|---|---|
| eldest son | the eldest son | the eldest daughter |
| youngest son | the sons share, the house stays undivided with the youngest son | the estate falls to the lord: a couple of the town |
| sons | one of the sons by lot; a daughter is paid off with her dowry | one of the daughters by lot |
| children | one of the children by lot | (a daughter, by the same lot) |
| sons double | one of the children by lot, a son with twice a daughter's chance | (a daughter, by the same lot) |

### The cultures (persons of the founding of 1291 with its 314 rulers; grade 1: a law or a study of the 13th or 14th century read; grade 2: read, but later, or from Todd's map)

| Who | Persons | Custom | Grade | Read |
|---|---|---|---|---|
| Muslims of every culture | 26,260 | sons double | 1 | Qur'an 4:11: a son twice a daughter's share, the parents a sixth each, a bequest a third at most. The law of property (house, garden). Farmland was the treasury's and the peasants held its use (Abbas Hamid 2002); who took that over around 1300 was not found; later the sons (Cuno 1999 for the 1840s, al-Marakeby 2023 for the Ottoman time) |
| Lombard, Tuscan, Venetian, Ligurian | 11,098 | sons | 1 | Statutes of Turin 1360: a married daughter with brothers can claim nothing; "common in all Italian city-states" (Gravela 2018); without sons the daughters succeed. Venice shared the mother's goods among sons and daughters alike |
| English | 4,183 | eldest son | 1 | Common law; Gates 1996; Smith 1986 |
| Catalan | 1,557 | eldest son | 1 | To i Figueras: one heir, preferably the firstborn, among the peasants of the masos from the 11th century, general from the later 12th; around 1200 a large part of the families still shared alike. Ferrer Alòs 2005: the eldest son, else the eldest daughter |
| Novgorodian, Russian, Ruthenian | 1,362 | youngest son | 1 | Expanded Russkaya Pravda (early 13th century, Kaiser 1992): arts. 90, 92, 95, 100. Art. 90 (a peasant's estate escheats to the prince) does not name the sons; read here as the case without sons, since arts. 92 and 100 let sons inherit |
| Danish, Swedish, Norwegian | 621 | sons double | 1 | Tveit 2020: a daughter half a brother's lot in the Danish provincial laws, in Norway (1274) and most Swedish laws from the later 13th century. Ancestral land did not go to women (not built) |
| German cultures (seven) | 13,139 | eldest son | 2 | Todd's map (Duranton et al. 2008): house and land to the son who stays; Huning & Wahl 2021: the heir "usually the oldest but sometimes the youngest". Against it: 31 % of the municipalities of Baden-Württemberg divided |
| Occitan, Basque, Aragonese, Galician, Scottish | 6,142 | eldest son | 2 | Lamaison 1988 (notaries, 1980); Fauve-Chamoux (Basque country, Pyrenees); Todd's map. Against it: the statutes of Provence, sons in equal shares |
| French, Picard, Burgundian, Breton | 16,466 | children | 2 | Lamaison 1988; the custom of Brittany of 1539 (Fauve-Chamoux); Todd's map. Yver 1966 could not be opened |
| Castilian | 3,181 | children | 2 | Visigothic law (To i Figueras); Leyes de Toro 1505 (Bartolomé Bartolomé 2009). The Fuero Real of 1255 was not read |
| Czech | 1,099 | youngest son | 2 | Velková 2023: Bohemia 1691–1787, the youngest son in 73 % of cases |
| No custom (the rule of feature 2) | 17,248 | | | Flemish, Hollandic, Greek, Portuguese; Roman, Neapolitan, Sicilian, Sardinian, Hungarian; Polish and the other Slavs; Nubian, West African with the old faiths, Baltic, Georgian, Armenian, Jewish: nothing was read that states their rule |

### Measured (`npm run families:check`, world of 1291, seed 1291, 100 years)

| Figure | Founding | Year 50 | Year 100 | Feature 2 alone, year 100 |
|---|---|---|---|---|
| Persons | 102,042 | 96,122 | 97,223 | 97,823 |
| Households (vacant) | 17,702 (0) | 17,702 (38) | 17,702 (67) | 17,702 (46) |
| Persons per household | 5.76 | 5.43 | 5.49 | 5.53 |
| Widows among the housewives | 14 % | 15 % | 15 % | 14 % |
| Women of 40 to 44 without a household | 30 % | 25 % | 27 % | 27 % |
| Deaths / births / weddings in the year | | 2,874 / 2,813 / 858 | 2,704 / 2,728 / 877 | 2,832 / 2,834 / 907 |

Mean age of the brides 24.0. In the years 41 to 100, 37,347 households passed to a new couple, 41 % of them to an
heir of the house (10,315 sons, 4,846 daughters). By the custom of the house (a house with a living child):

| Custom | Households passed on | A child of the house took it | Sons / daughters |
|---|---|---|---|
| eldest son | 8,117 | 52 % | 3,556 / 676 |
| youngest son | 802 | 47 % | 362 / 17 |
| sons | 3,743 | 48 % | 1,526 / 272 |
| children | 6,346 | 60 % | 1,914 / 1,868 |
| sons double | 8,746 | 59 % | 2,961 / 2,200 |
| none | 5,916 | 6 % (by the chance of the town's weddings) | 185 / 173 |
| no living child | 3,677 | | |

Places founded with under 60 persons: −9.6 % after 100 years (10 of 58 below half, one empty; feature 2 alone −4.1 %
and 9): without the weddings between siblings a very small town finds fewer couples.

The probe before the build (each custom for the whole world, heirs' weddings before the others): 44 % of the
households to an heir where sons inherit, 53 % where all children do, the world within 2 % of feature 2. A
household that waits for an heir under age: 78 to 81 % to heirs, but 1,200 to 1,700 households vacant and 89,345
(eldest son) or 93,144 persons (children) after 100 years. So nothing waits.

### Limits

- A household is never divided: no smaller holdings, no growth of the number of households by partition.
- One custom for a culture: none from village to village, for town against country, for the free against the
  unfree. Occitan stands for one heir although Provence shared among the sons.
- An heir under age loses the household to a couple of the town; a guardian is not built.
- Islamic farmland is treated as property.
- The widow keeps the household everywhere as in feature 2 (the English free bench). Read but not built: in the Rus
  a widow has a portion and may stay in the house (arts. 93, 102), in Scandinavia the common property is divided
  and the ancestral land is not (Tveit 2020).
- No dowry, no payment to the lord at a death, no share of the savings by custom.
- Assumptions without a source: the ages from which an heir is grown; that the next child stands in for one who is
  not free; that an heiress of 45 or older does not take the household.

### Sources

- Duranton, G., Rodríguez-Pose, A., Sandall, R. (2008): Family types and the persistence of regional disparities in Europe. SERC Discussion Paper 9. https://eprints.lse.ac.uk/33152/1/sercdp0009.pdf
- Huning, T. R., Wahl, F. (2021): The origins of agricultural inheritance traditions. Journal of Comparative Economics, 660–674. https://eprints.whiterose.ac.uk/183709/1/origins_complete_jce.pdf
- Fauve-Chamoux, A.: Inheritance and Property. Encyclopedia of Children and Childhood in History and Society. https://www.encyclopedia.com/children/encyclopedias-almanacs-transcripts-and-maps/inheritance-and-property
- Lamaison, P. (1988): La diversité des modes de transmission: une géographie tenace. Études rurales 110–112, 119–175 (abstract).
- Gravela, M. (2018): Against the tide. Female property and political shift in late medieval Turin. Mélanges de l'École française de Rome, Moyen Âge 130-1, 151–165.
- To i Figueras, L.: Els hereus i el dret de primogenitura. Enciclopèdia.cat. https://www.enciclopedia.cat/historia.-politica-societat-i-cultura-dels-paisos-catalans/els-hereus-i-el-dret-de-primogenitura
- Ferrer Alòs, L. (2005): When there was no male heir: the pubilla. Continuity and Change 20(1), 27–52 (abstract).
- Bartolomé Bartolomé, J. M. (2009): Disposiciones hereditarias … el ejemplo leonés (1700–1850). Norba 22, 159–176.
- Tveit, M. (2020): Backwards inheritance in medieval Scandinavian law. In: Nordic Inheritance Law Through the Ages, Brill, 71–91. https://core.ac.uk/download/388989464.pdf
- Kaiser, D. H. (1992): The Laws of Rus', 20–34 (Expanded Pravda). https://web.grinnell.edu/individuals/kaiser/exrp.html
- Velková, A. (2023): Historická demografie 47(1), 1–27.
- Abbas Hamid, R. (2002): Why study ownership? In: Hanna, N. (ed.), Money, Land and Trade. Cuno, K. M. (1999) and Frantz-Murphy, G. (1999): Proceedings of the British Academy 96. al-Marakeby, M. (2023): Could women own agricultural land? Die Welt des Islams (abstract).
- England: see the proposal (Mapping the Medieval Countryside, King's College London 2014; Gates 1996; Smith 1986).

## Feature 4: the unmarried move to other places, and an heir comes home

Ramon, 17 November 2026: the next feature is moving between places. He rejected a first proposal (the unmarried
move only to fill a vacant household: neither economic nor historical; the motives are work, hunger and family). On
18 November, on the second proposal, he chose: the young unmarried move by the measured rates and heirs come home;
work as a motive, whole families and the flight from a famine follow later, each on its own. The proposal with all
that was read (German): https://claude.ai/artifact/CSHcS21ac1gcX31d12bMFV, section «Vorschlag: Umzug zwischen Orten
(zweiter Anlauf)».

Code: `src/sim/people/moving.ts` (the rates, the distances, each with its table of the source),
`src/sim/systems/moves.ts` (the day of the next move, where a move ends, the move), `changeFamily` in
`src/sim/systems/deaths.ts` (the part in the economy goes to a successor), the heir who comes home in `weddingsOn`
of `src/sim/systems/families.ts`. Two columns of the persons (state 25): `person.home`, the place a person comes
from (−1 for a ruler), and `person.moves`, the day of the next move the person may make. Check:
`npm run families:check` (`-- 100 stay` for the same world without moves); `tests/moves.test.ts`.

### The rule

A place of the world is a town with its land, and no two towns lie nearer than 16 km (median to the nearest: 46 km).
The many short moves of the sources happen inside a place and are not computed. Only the far part is.

1. **Who.** A person of 10 to 59 who is neither the man nor the woman of a family: not married, and not the widower
   at the head of what is left of a household.
2. **How often.** Who lives in the place he or she comes from leaves it at the rate of a child who leaves the home
   of the parents, to the age of 29 (Dribe 2002), by age, sex and the standing of the family: a family in which
   somebody owns a firm stands for Dribe's freeholders and crown tenants, a family without for his landless. A dead
   father raises the rate, for a girl under 17 a dead mother too. Who lives elsewhere changes places as a servant
   changes the master, from 15 on (Dribe & Lundh 2002).
3. **How far.** 9 % of these changes go further than 16 km (Dribe & Lundh 2002, table 3). For one of them a band
   of distance is drawn: 16 to 32 km, 32 to 64 km or 64 to 115 km, as 5 : 4 : 2 (Raven 2024, table 2).
4. **Where to.** A piece of land that far away along the land of the map (over a strait, not over the sea) is
   drawn, each piece of the band with its area over its distance, as if the direction were drawn. The person goes
   to the town that lies nearest to that piece along the land. Where that is the person's own town, or the band
   holds no land, the move stays inside the place and nothing happens.
5. **Where the person lives.** With a parent, a brother or a sister who lives there, else as a servant in one of
   the households of the place. The person belongs to the purse of that family and marries as the unmarried of
   the place do.
6. **The part in the economy.** A part in the economy of the old place goes to a successor there, as on a death
   (the engine computes a fixed list of persons for every town). Where nobody is free to take it, the person stays.
   In the new place the person has no part until one falls free.
7. **An heir comes home.** A child of a vacant house who lives in another place and has not married there stands
   in the line of feature 3 with the others. Where the custom names him or her and a spouse is found in the town of
   the house, the heir comes home on that day and takes the house.

It runs as the deaths and the births do (the next-event method): for every person the day of the next far move the
person may make is drawn at a rate that no person exceeds (0.55 changes a year × 9 %), and on that day the person
moves with the share that his or her own rate on that day has of it (thinning, Lewis & Shedler 1979). So the rate
follows the age, the death of the father and the standing of the family without a new draw.

### Parameters

| Parameter | Value | Source |
|---|---|---|
| Leaves home a year, sons of 10 to 16 | 2.4 % (family with a firm) / 8.2 % (without) | Dribe 2002, table 3: 407 events in 6,190 person-years, split by the shares and relative risks of the standings (semi-landless 18 %, ×4.64; landless 44 %, ×3.43; tenants of nobles 17 %, ×1.07) |
| daughters of 10 to 16 | 1.0 % / 8.3 % | table 4: 382 in 6,348; 17 %, ×9.17; 48 %, ×8.46; 17 %, ×1.81 |
| sons of 17 to 29 | 9.1 % / 13.1 % | table 3: 327 in 2,874; 15 %, ×1.45; 35 %, ×1.43; 19 %, ×1.15 |
| daughters of 17 to 29 | 8.8 % / 18.1 % | table 4: 505 in 3,313; 18 %, ×2.49; 42 %, ×2.06; 16 %, ×1.11 |
| Father dead | sons 17 to 29 ×1.28, daughters ×1.32, daughters 10 to 16 ×1.55 | Dribe 2002, tables 3 and 4, model I |
| Mother dead | daughters 10 to 16 ×1.47 | the same (elsewhere the tables show no clear effect: ×1) |
| Changes of place of who lives elsewhere | men 0.52 a year to 29, 0.41 after; women 0.53 and 0.27 | Dribe & Lundh 2002, table 1: 7.8 (men) and 8.0 (women) changes between 15 and 30, 20.0 and 16.0 between 10 and 60 |
| Share that goes further than 16 km | 9 % | Dribe & Lundh 2002, table 3: 9.1 % of the men's and 8.1 % of the women's changes with a known destination |
| Distances | 16–32 km 5/11, 32–64 km 4/11, 64–115 km 2/11 | Raven 2024, table 2: of the 11 serfs of Great Waltham and High Easter (1289–1361) who went further than ten miles, 5 at 10 to 19, 4 at 20 to 39, 2 beyond (the furthest about 70 miles) |
| Ages | 10 to 59; a child at home to 29; a servant from 15 | the ages of the tables |

### Measured (`npm run families:check`, world of 1291, seed 1291, deaths, moves, weddings and births over 100 years; one run)

| Figure | Year 50 | Year 100 | Without moves, year 100 |
|---|---|---|---|
| Persons | 96,340 | 97,067 | 97,223 |
| Households (vacant) | 17,702 (33) | 17,702 (43) | 17,702 (67) |
| Persons per household | 5.44 | 5.48 | 5.49 |
| Widows among the housewives | 15 % | 14 % | 15 % |
| Women of 40 to 44 without a household | 25 % | 26 % | 27 % |
| Deaths / births / weddings in the year | 2,826 / 2,701 / 843 | 2,694 / 2,760 / 879 | 2,704 / 2,728 / 877 |
| Households that passed to an heir (years 41 to 100) | | 40 % | 41 % |

- 132 persons a year go to another place, 0.14 % of the persons: 106 from the place they come from, 25 from a
  place they had moved to. 51 % are women, 77 % are 15 to 29, the mean age is 21.3; 6 % go to kin.
- 326 far moves a year are drawn. 40 % of them end in another town, 58 % stay inside the place (the land that far
  away belongs to the person's own town), 1.3 % are held by a part in the economy that nobody can take.
- 11 heirs a year come home for the house (653 in the years 41 to 100).
- After 100 years, 4.7 % of the persons of 20 to 59 live in another place than they come from. Ireland 1841, before
  the famine: 5 % lived outside the county of their birth (Ó Gráda 2018).
- At the end 29,394 persons can leave home (10.8 % of them a year do, near or far) and 1,375 live elsewhere and
  can move on (0.43 changes a year). All changes of place the rates stand for, near and far: 3.9 % of the persons a
  year; over the border of a parish (57 % of the changes, Dribe & Lundh 2002, table 3): 2.2 %. Clayworth 1676–88
  and Cogenhoe 1618–28: 3.9 to 4.7 % of the inhabitants left in a year (Laslett & Harrison 1963, after Schürer
  2024), families and the married among them, who do not move here.
- The towns by their size at the founding, persons after 100 years against the founding (without moves in
  brackets): under 60 persons +2.1 % (−9.6 %), 6 of 58 below half (10); 60 to 100: +1.2 % (−1.4 %), 1 of 197 below
  half (5); 100 to 200: −3.3 % (−2.5 %); 200 to 500: −6.1 % (−4.2 %); 500 and more: −8.7 % (−8.3 %).
- The map: 40 % of the far moves end in another town (16–32 km: 21 %, 32–64 km: 49 %, 64–115 km: 69 %, weighted by
  the persons). Nobody can leave 54 of the 550 towns, with 13.5 % of the persons: every piece of land within 115 km
  of them is their own (the nearest town is across the sea, or 173 km away or more).
- The full world with the economy, two years: no city halts; 200 persons live away from where they come from, 13 of
  them have taken a part in the economy of the new place.

### What differs from the proposal

- The proposal counted 243 movers a year (0.26 % of the persons), 135 of them servants. The probe behind it moved a
  person again in the same month when the new place came later in its list. The rule as it is written gives 132 a
  year (0.14 %), 25 of them servants. The other figures of the probe hold: the persons of the world, the share who
  live away (4.7 % against 4.9 %), the heirs who come home (11 a year against 10).
- The sum over the border of a parish is 2.2 %, not 3.4 %: the 3.4 % of the proposal held the whole families at
  Dribe's rates, who are not built.
- Sons of 10 to 16 of a family without a firm: 8.2 % a year (the proposal rounded to 8.3 %). Women who live
  elsewhere change places 0.27 times a year after 30 (table 1 of Dribe & Lundh; the proposal wrote 0.41 for both).
- The distance runs along the land of the map and not as the crow flies, so nobody walks over the sea.
- The widower at the head of what is left of a household does not move (he would leave his children behind).

### Limits

- Motives that are not built (Ramon, 18 November 2026: each later, on its own): work (a newcomer has a part in the
  economy only when one falls free; a move for a wage needs a worker who can change the town in the engine), whole
  families (Dribe 2002: 3.3 % a year; they need households that can grow), the flight from a famine (no number was
  found). Poverty moves through the standing of the family only.
- The rates are Sweden's of 1829 to 1867 for every time and place; only their sum was checked, against two English
  villages of the 17th century. The share of far moves is Sweden's, their distances are England's.
- "Landless" is a family in which nobody owns a firm (54 % of the households; 52 % in Dribe's parishes).
- The destination is drawn by land, not by the size or the pull of a town. So the small towns gain and the large
  ones lose a little; in the sources a third of the destinations were towns (Bailey 2022, table 5).
- A town further than about 115 km from every other loses and gains nobody (54 of 550).
- The short moves inside a place are not seen; a servant does not change the household inside a place.
- IQ and the Big Five do not move anybody yet (Jokela 2009 has the numbers: step B of the overview).
- Assumptions without a source: that the direction is drawn; the household of a servant (any of the place); that a
  person with a part nobody can take stays; that only an heir who has not married comes home; that the years after
  30 of a servant take the whole difference of the two counts of table 1.

### Sources

- Dribe, M. (2002): Dealing with Economic Stress Through Migration: Lessons from Nineteenth Century Rural Sweden. Lund Papers in Economic History 79 (printed in the European Review of Economic History 7, 2003).
- Dribe, M., Lundh, C. (2002): People on the Move: Determinants of Servant Migration in Nineteenth Century Sweden. Lund Papers in Economic History 80.
- Raven, M. (2024): Continuity and Change 39, 101–125 (Great Waltham and High Easter, Essex, 1289–1361).
- Bailey, M. (2022): Servile migration and gender in late-medieval England. Past & Present 261(1), 47–85 (read as the manuscript in the archive of the University of East Anglia).
- Schürer, K. (2024): Stuck in the mud! Campop blog (Laslett & Harrison 1963 on Clayworth and Cogenhoe).
- Ó Gráda, C. (2018): UCD Working Paper 18/21.
- Lewis, P. A. W., Shedler, G. S. (1979): Simulation of nonhomogeneous Poisson processes by thinning. Naval Research Logistics Quarterly 26(3), 403–413.
- Not readable: Rogers & Castro 1981 (the age profile of migration), Poos 1986 and 1991 (Essex).

## Feature 5: the traits shift the rates

Ramon, 17 November 2026: all persons are to be simulated smartly, event-driven and with decisions of their own by
IQ and the Big Five. On 18 November he chose «So bauen» on the proposal (German):
https://claude.ai/artifact/CSHcS21ac1gcX31d12bMFV, section «Vorschlag: Merkmale verschieben die Raten». It is the
first step: the traits shift the rates of the events that exist. Needs, satisfaction and the choice among offers
are the next proposal.

Code: `src/sim/people/traits.ts` (the factors, each with its source), `drawDeath` in `src/sim/systems/deaths.ts`,
`rateOf` and `redrawMoves` in `src/sim/systems/moves.ts`, `take` in `weddingsOn` of `src/sim/systems/families.ts`.
No new column. State 28: the upgrade draws the days of death and of the next move anew (`foundDeaths`,
`redrawMoves`). Check: `npm run traits:check` (`-- 100` for 100 years); `tests/traits.test.ts`.

### The rule

The rate of a person = the rate × exp(Σ b · z) / exp(Σ b² / 2). z is a trait in standard deviations from the mean
(IQ: 100 and 15; the Big Five: 50 and 10), b the natural logarithm of the factor of the source for one standard
deviation. The divisor is the mean of the factor over independent normal traits, so the mean rate stays. This is
the form in which the studies estimate (proportional hazards, logistic regression).

1. **Death, from 15.** The day of death is drawn once, as before. From the age of 15 the survival curve of the
   life table is raised to the power of the person's factor (conscientiousness and IQ). Below 15 the table holds
   as it is; a child who would die before 15 dies on the same day as without the rule.
2. **Far move.** The rate of feature 4 times the factor (openness and agreeableness), capped at 4. The rate that
   no person exceeds (thinning) is 0.55 × 4 changes a year × 9 %.
3. **Wedding.** As many weddings as before (only into a vacant household). Among the unmarried of the town within
   2.5 years of the age that is looked for, one is drawn by weight (Gumbel-max: the largest of weight − ln(−ln u)),
   the weight being 1.45 (men) or 1.05 (women) × (b_e · z_e + b_o · z_o). Where nobody is in that window, the
   nearest in age is taken as before.
4. **No effect** on births in marriage, the remarriage of widows, deaths under 15, and from every trait not named.

### Parameters

| Event | Trait | Factor for one standard deviation | Source |
|---|---|---|---|
| Death from 15 | conscientiousness | 0.88 | Jokela et al. 2013: hazard ratio 0.88 (0.82–0.94), adjusted for the other four traits, sex, age; 76,150 adults, 3,947 deaths |
| Death from 15 | IQ | 0.89 | Calvin et al. 2011: 24 % lower risk (0.76); education takes 54 % of it; used: 1 − 0.24 × 0.46 (our own arithmetic, the world has no school) |
| Far move | openness | 1.29 | Jokela 2009, table 2: move to another state, odds ratio with all covariates |
| Far move | agreeableness | 0.88 | the same |
| Ever marrying, men | extraversion 1.53, openness 0.79 | | Jokela et al. 2011, table 2 |
| Ever marrying, women | extraversion 1.22, openness 0.76 | | the same |

Our own settings without a source: the IQ factor less the part of education; traits count from 15; how the
spouse is drawn (window of 2.5 years, the weights 1.45 and 1.05, set so that the odds ratios of the source come
out); a move between states of the USA stands for the far move; an odds ratio is used as a factor of the rate; the
cap of 4 on the factor of a move.

### Measured (`npm run traits:check -- 100`, world of 1291, seed 1291, 100 years; one run)

Slopes estimated as the studies do: death by Cox over year and age, moves from the means of the movers, marriage
by logistic regression over the persons of 35 to 59.

| Slope for one standard deviation | Source | With the rule | Without |
|---|---|---|---|
| Death, conscientiousness | 0.88 | 0.89 | 1.00 |
| Death, IQ | 0.89 | 0.90 | 1.00 |
| Death, extraversion (no effect) | 1.00 | 1.00 | 1.00 |
| Far move, openness | 1.29 | 1.32 | 1.00 |
| Far move, agreeableness | 0.88 | 0.85 | 0.99 |
| Ever married, men, extraversion | 1.53 | 1.55 | 1.00 |
| Ever married, men, openness | 0.79 | 0.77 | 0.99 |
| Ever married, women, extraversion | 1.22 | 1.19 | 0.97 |
| Ever married, women, openness | 0.76 | 0.79 | 1.02 |

- Persons after 100 years 97,071 (without the rule 97,067), households 17,702 (40 vacant), mean age at death of
  those who reached 15: 49.7 (49.5), far moves a year 135 (132), ever married at 35 to 59: men 82 %, women 74 %
  (83 %, 74 %).
- The traits drift, because they are inherited and the extraverted marry more: the newborn of the last ten years
  lie at extraversion +0.07 standard deviations, openness −0.06, IQ +0.05 (0.7 points), conscientiousness +0.01.
  Without the rule no trait moves by more than 0.01.

### Limits

- All studies are of rich countries of the 20th and 21st century. That the relations held in 1291 is not shown.
- Marriage is the weakest source: Jokela et al. 2011 measured the traits after marriage and births.
- Calvin et al. 2011 was read as an abstract only. Jokela 2009 is one study (3,760 persons, 359 moved between
  states).
- The traits are drawn independently; in the studies they correlate slightly (the factors are mutually adjusted).
- One run; the differences in persons and moves are not tested against chance.

Sources with what was read of each: `docs/wiki/personen/merkmale-und-raten.md`.

## Feature 6: who wants work looks for a part

Ramon, 18 November 2026: «weiter» on the proposal (German): https://claude.ai/artifact/CSHcS21ac1gcX31d12bMFV,
section «Vorschlag: Wer arbeiten will, sucht eine Stelle». Step 4 of the overview (need, satisfaction, choice among
offers), limited to what the world offers a person today: wages are no signal (4.9 to 6.4 baskets a day in every
town, and a successor takes the wage of the predecessor), no firm can be founded (the engine computes a fixed list of
parts for every town), but parts wait where a town has nobody to take them.

Code: `wantsWork` and `participation` in `src/sim/systems/work.ts`, `seekersIn`, `successor`, `estatesOf`,
`takeEstate` in `src/sim/systems/deaths.ts`, `offersOn` in `src/sim/systems/moves.ts` (the system `moves`, on the
first day of a month). No new column and no new state: a saved world goes on by the new rule. Check:
`npm run families:check` (last line); `tests/work-offers.test.ts`.

### What was wrong before

At the founding 97 % of the men and 43 % of the women of 20 to 59 hold a part (the participation rates of the
calibration table, Broadberry, Campbell and van Leeuwen 2013). The succession of feature 2 took any adult of the town
without a part. After 25 years 79 % of the men and 74 % of the women held one, after 100 years 79 % and 78 %: the
difference of the source was gone. 615 parts (1.2 %) waited for a successor, nearly all in small towns.

### The rule

1. **Need.** A person of 15 or older wants a part by the rule of the founding (`src/sim/systems/work.ts`): a man at
   the rate of men (0.971), a woman without a husband always (Horrell, Humphries and Weisdorf 2022), another woman at
   the rate that makes the women of her town work at the rate of women (0.430) on that day. The draw is the person's
   own and the same for life.
2. **Satisfaction.** Who wants a part and has one does nothing. Who wants one and has none looks (the form of the
   consumat of Jager and Janssen 1999: the satisfied repeat, the dissatisfied deliberate; no threshold of the paper
   is used, see the limits).
3. **Offers in the town.** A part that falls free (a death, a move) goes to a person of the town who looks: first of
   the family of the predecessor, then a child, then anybody, as before.
4. **Offers from other towns.** On the first day of a month a part that still waits is offered to the persons who
   look in the towns that have land within 115 km (the bands of feature 4) and who can move: 15 to 59, neither the
   man nor the woman of a family.
5. **Choice.** One of them is drawn (Gumbel-max) with the weight: share of the band of distance (5 : 4 : 2, Raven
   2024) over the persons of that band, times the person's factor of a far move (openness 1.29, agreeableness 0.88,
   Jokela 2009; feature 5). The person moves, lives there as a newcomer of feature 4 does (with kin, else as a servant
   of a household) and takes the part.

The moves by the measured rates (feature 4) stay beside it.

### Measured (`npm run families:check`, world of 1291, seed 1291, 100 years, without the economy; one run)

| After 100 years | Before | With the rule |
|---|---|---|
| Parts that wait | 615 (1.2 %) | 896 (1.8 %) in 88 towns |
| Persons who want a part and have none | not defined | 1,785 |
| Men of 20 to 59 with a part | 79 % | 94.9 % |
| Women of 20 to 59 with a part | 78 % | 54.1 % |
| Moves to another town a year | 135 | 434: 121 by the rates, 313 onto a part |
| Persons of 20 to 59 who live away from where they come from | 4.7 % | 19.0 % |
| Persons | 97,071 | 97,119 |
| Households (vacant) | 17,702 (40) | 17,702 (17) |
| Households that passed to an heir (years 41 to 100) | 40 % | 35 % |

- Who moves onto a part or by the rates: 36 % women, 91 % of 15 to 29, mean age 18.1.
- Heirs who come home for the house: 1,209 in the years 41 to 100 (653 before), because more children live away.
- Towns by their size at the founding, persons after 100 years: under 60 −5.9 % (before +2.1 %), 60 to 100 −1.5 %,
  100 to 200 −2.3 %, 200 to 500 −4.7 %, 500 and more −8.6 % (before −8.7 %).
- The slopes of feature 5 hold with the rule (`npm run traits:check -- 100`): death 0.885 and 0.897, ever married
  men 1.55 and 0.80, women 1.21 and 0.76.
- Two years with the full economy (world of 1291): no town halts, a state saved on day 400 goes on the same. In
  the first years many parts are taken from other towns, because at the founding nobody who wants a part is without
  one: 453 persons hold a part in another town than they come from after one year, 858 after two.
- Tried and too weak: only to direct the far moves of feature 4 to a town where a part waits (11 moves a year,
  2,707 parts still wait).

### Limits

- **More people live away than a source shows.** 19 % of the persons of 20 to 59 live in another town than they come
  from (4.7 % before; Ireland 1841: 5 % outside the county of birth, Ó Gráda 2018). The rates of Dribe and Lundh give
  326 far moves a year in this world; with the rule 434 persons a year reach another town.
- **Our own settings without a source:** that the news of a free part reaches 115 km, that it is taken at once, the
  month, the order of succession in the town.
- **The women's share stays above the table** (54 % against 43 %): a widow always wants a part, and a woman who took
  one before her wedding keeps it.
- **Consumat gives the form, no number.** The thresholds of Jager and Janssen 1999 are settings of their experiments.
  Read to page 19.
- **Wages and traits do not decide who gets which part.** Strenze 2007 (IQ and occupational status, ρ 0.43) was read
  only through a summary of its tables; Zhao and Seibert 2006 compare founders with managers.
- **Fewer moves by the rates.** Who holds a part leaves only where somebody who wants one takes it; before, any
  adult of the town could. The moves of feature 4 fall from 135 to 121 a year, and more in the first years.
- **A part that waits still pays.** The money of a dead person whose part nobody has taken stays with the family
  (`src/sim/systems/household.ts`), as before; nobody does the work.
- 896 parts wait and 1,785 persons look at the end: they are out of each other's reach, or the persons are married
  (whole families do not move).

## Feature 7: the living and the dead

Ramon, 19 November 2026: «weiter» on the proposal (German): https://claude.ai/artifact/8UqSxP49CfvpPfX1UCDULc
(«Personen: Archiv der Toten und Tagesplan»), after the research behind it (German, in the project files:
recherche/tagesplaner/). Read as «So bauen» for way A: first the archive of the dead (steps 1 and 2), then the day
plan of every person (steps 3 to 6); while the day plan is new, the wages go on on days nobody works.

The world is to run for centuries. The table of the persons keeps the dead, because an id is never reused, so a loop
over its rows grows with the history of the world, not with its people: 102,042 rows at the founding of 1291,
374,667 after 100 years, 919,687 after 300, while the living stay near 98,000 (deaths, moves, weddings and births
only, seed 1291). The economy went over all rows twice a day (`writeAgents`, `writeHouseholds`), the weddings once a
month.

### Step 1: the list of the living

`presentPersons` (`src/sim/people/living.ts`) gives the living persons and the dead who still hold a part in the
economy (an estate, feature 2), in the order of their ids. The list is derived from the columns: built when a table
of persons is first seen, the persons who came into the world since it was last read are added (rows are only ever
added), and the dead without a part drop out when it is next read. A dead person never comes back onto it. No new
column and no new state: a snapshot does not change.

The systems that run every day, month or year go over the list: `writeAgents` (`src/sim/systems/economy.ts`),
`writeHouseholds` (`src/sim/systems/household.ts`), the children away from a vacant house in `weddingsOn`
(`src/sim/systems/families.ts`), `residents` and `farmersOf` (`src/sim/systems/hamlets.ts`), `placeCultures`
(`src/sim/systems/cultures.ts`), `personsIn` (`src/sim/systems/people.ts`), and the views of the world server
(`src/net/people.ts`, `src/net/lots.ts`, `src/net/views.ts`). What runs once, when a world is founded or a list is
built, still goes over the rows.

A dead person without a part has no money (the part's money goes to the successor with the part), so the purses of
the families are the same without them.

### Measured

| | Rows of the persons | On the list | A pass over the rows | A pass over the list |
|---|---|---|---|---|
| Founding of 1291 | 102,042 | 102,042 | 2.4 ms | 2.3 ms |
| After 100 years | 374,667 | 97,840 | 7.4 ms | 1.5 ms |
| After 200 years | 647,011 | 97,281 | 12.0 ms | 1.5 ms |
| After 300 years | 919,687 | 97,881 | 17.4 ms | 1.2 ms |

A pass is the bare loop (deaths, moves, weddings and births only, seed 1291, one run in the cloud); the day ran three
of them in the economy. The world of 1291 with all its systems has the same hash after two years with the list as
without it (`npm run years:check -- 2`: f9165182), at about 175 ms a day in the cloud.

### Limits of step 1

- The rows themselves stay: the memory, the snapshot and the loops that run once still grow with the dead. Step 2
  (the archive) moves the dead out of the table.
- The families are never freed either (21,754 rows at the founding, 22,972 after two years): `writeHouseholds` still
  goes over all of them every day. Step 2 leaves them where they are (below).

### Step 2: the archive of the dead

`src/sim/people/archive.ts`; state version 30.

**Two numbers.** A person has a row and a `uid`. The row is the id every system reads the columns by; it holds from
one first of January to the next. The `uid` never changes and is never given twice in a world: the founders count
0, 1, 2 … in the order they came, every newcomer (a birth, a ruler entering the world) gets the next one
(`spawnPerson`, `WorldState.nextUid`). The rows lie in the order of the uids, so the row of a uid is found by halving
(`rowOf`). Everything that keeps a person beyond the day names the uid:

- the parents (`mother`, `father` are uids: a parent may be in the archive), compared as uids where kin is asked for
  (the weddings, the heir who comes home, the successor of an estate);
- the person's own draws of chance (`hash01(seed, uid, draw)`: the birth, the traits, the genes, the day of death,
  the moves, the wish to work, the lot of a wedding), so a person draws the same with the archive and without it;
- the browser (`GET /people/<place>` lists uids, `GET /person/<uid>`, the portrait's seed);
- the copy of the rulers in Supabase (`world_persons.person`, `world_reigns.person`);
- the archive.

The count of the children a woman has borne is a column of its own (`children`): the draw of her next birth is by
it, and it no longer comes from counting the rows that name her as mother.

**On the first of January** the archive runs first, before the deaths of the day. The dead whom nothing needs leave
the table, the rows of the others close up in their order, and everything that names a row names the new one: the
heads of the families (`family.man`, `family.woman`), the owners of the firms, the holders of the crowns and the
persons of history (`named`). The table is a new one, so what the systems derive from it (the lists of the events of
deaths, births and moves, the persons of each place, the list of the living, the index of the rulers, the persons by
place of the views) is kept by table and built anew, as for a loaded state.

The dead who stay in the table:

- a dead person who still holds a part in the economy (an estate, feature 2);
- a person of history: the crowns and the copy of the rulers name them, and they are few;
- the dead parents of a living person whose mother or father belongs to a household with a seat. When the
  household is vacant, the weddings look for its heir among the children by the family of their parents and take
  the custom of the heir's father. A family that has no seat never gets one again (a household passes to a new
  family), so a parent who went to the archive is never looked for.

Nothing else reads a dead person: a parent who is not in the table has died (the orphan's rate of moving, feature 4).

**The archive** keeps of a dead person who the person was, about 140 bytes: uid, birth, death, sex, the parents, the
family and its place, where the person came from, culture, faith, IQ, the Big Five and the genes. The archived
persons leave the state: it keeps for every year only how many went and their smallest and greatest uid
(`WorldState.archive`). The persons are handed to whoever runs the world (`takeArchived`). The world server writes
each year once to its disk (`archive/dead-<day>.bin`, gzip, in the encoding of the snapshot) and to Supabase Storage
(`world-snapshots/<world>/persistent/archive/dead-<day>.bin`, never removed). A world restored on an empty disk
fetches the years its snapshot names; a replay archives the same persons on the same day and writes the same bytes
again. `GET /person/<uid>` reads a dead person of the archive from the year that holds them (the server keeps the
eight years read last), with what the archive keeps and no economy or household.

A year a file rather than a decade: nothing of the archive is kept in the state, and a year is a few hundred KB.

**The upgrade 29 → 30** gives every person the row as uid (up to 29 the row was the person for ever, so the parents
are uids as they are) and every woman the count of the children who name her as mother. Nobody goes to the archive
until the next first of January. A replay from the genesis snapshot of a world that ran under 29 no longer gives
the hash of the live world (it archives on first days of January the live world did not), as after the upgrades
28 and 29; a replay from any snapshot of 29 or later does.

### Measured: the same world, and the table stays

`npm run archive:check [-- years] [-- --bare]` runs a world of 1291 twice, with the archive and without it, and
compares them every year over a hash in which every person is named by the uid (`tools/sim/living_hash.ts`): the
living and the estates with all their columns, the families, the firms, the crowns, the persons of history, the
economies and the people of every place.

| Run (seed 1291, cloud) | Years | Hash with and without the archive | Rows of the persons (with / without) | Snapshot, gzip (with / without) |
|---|---|---|---|---|
| All systems | 4 | the same every year (year 4: 7e2fc945) | 105,223 / 112,325 | 54.5 / 55.4 MB |
| People only (deaths, moves, weddings, births) | 100 | the same every year (year 100: 579ae68b) | 106,746 / 374,832 | 39.2 / 70.9 MB |

The world without the archive is the world of main: over three years of the people its hash is the same on main
(88dadb32, 82f3835d, 666528ac), and so it is after a year with all systems (f5474dfc).

The table of the persons holds the living, the dead of the running year and those that stay:

| People only | Living | Dead in the table at the end of the year | Of them estates | Archived so far | Rows without the archive |
|---|---|---|---|---|---|
| Year 1 | 101,688 | 661 | 150 | 2,264 | 104,613 |
| Year 10 | 100,336 | 6,191 | 153 | 22,156 | 128,683 |
| Year 30 | 98,209 | 9,177 | 402 | 75,759 | 183,145 |
| Year 50 | 96,495 | 10,074 | 871 | 131,035 | 237,604 |
| Year 70 | 96,356 | 10,147 | 1,091 | 186,107 | 292,610 |
| Year 100 | 96,941 | 9,805 | 987 | 268,086 | 374,832 |

The dead in the table level off near 10,000: about 2,800 who died in the running year, the estates, and the dead
parents of the households. A day costs the same with the archive as without it (all systems, year 4: 218 / 217 ms in
the cloud); the first of January costs 55 to 90 ms more (the years 1 to 3, the cloud under load). A year of the archive is about
2,400 persons, 270 KB gzip. The snapshot at the founding is 37.7 MB with the two new columns (37.4 MB before).

### Limits of step 2

- The families are not archived: their table keeps every family that ever was (21,754 at the founding, about 600 more
  a year), and `writeHouseholds` goes over all of them every day. A family is small (13 columns) and the weddings draw
  by its id, so it would need an id of its own like the uid; left for when it costs.
- The dead parents of the households stay in the table (about 6,000 after some decades): an exact rule, not the
  smallest one.
- `giveGenes` (the upgrade 28 → 29) gives a child the genes of its parents only where both are in the table; it is
  not called on a world that has an archive.
- The archive is read by the world server only; the browser asks for one dead person at a time.

## Feature 8: the calendar of the town

Step 3 of way A of the proposal «Personen: Archiv der Toten und Tagesplan» (feature 7): every faith has its days of
rest, the firms of the cities work on the working days of their owner's faith, and a household buys on the working
days of its own faith (the owner of a firm too since economy feature 20). The calendars are a pure function
of the faith and the date (`src/sim/holy_days.ts`): nothing of them is saved, the same year always gives the same
days. The economy reads them (economy feature 19, docs/ECONOMY_DESIGN.md, section 19); the persons' own day follows:
step 4, sickness and childbed, is feature 9; the contracts of step 6 (phase A) are feature 10; the day plan from
templates (step 5) is feature 12; a target income (phase B of step 6) is open.

### The calendars

A day is a working day, a half day or a day of rest; a half day counts as half a day of work.

| calendar | faiths | days of rest | half days | source |
|---|---|---|---|---|
| Latin | Latin Church | the Sundays and the feasts of the canon law in force in 1291: Christmas, St Stephen, St John, the Innocents, St Silvester, 1 January, the Epiphany, the Purification, the week of Easter, the three Rogation days, the Ascension, Pentecost, the Nativity of St John the Baptist, the twelve apostles, St Lawrence, the Assumption, the Nativity of Mary, St Michael, All Saints, St Martin | Saturdays and the eves of the feasts | Gratian, Decretum, De consecratione D.3 c.1; work stopped at noon on Saturdays and eves in the cloth towns of Flanders and Artois (Stabel 2014, TSEG 11(4), pp. 36–38: Douai c. 1250, Arras before 1236) |
| Orthodox | Orthodox Church | the Sundays and 25 holy days of the Greek church, on the days of the Julian calendar | none | Holweck, «Ecclesiastical Feasts», Catholic Encyclopedia (1909); the Book of the Eparch (ch. XIII §3) forbids selling on Sundays and feasts |
| Sunday | the other churches (Coptic, Armenian, Syriac, of the East, Ethiopian, Bosnian, Hussite, of the Reformation) | the Sundays | none | their feasts were not read |
| Muslim | Sunni, Shia, Ibadi Islam | 1 Shawwāl and 10 Dhū l-Ḥijja, by the tabular calendar (civil epoch, 16 July 622) | none | Friday «is not at all a day of rest, but one of obligatory public worship, held at noon» (Goitein 1959, The Muslim World 49, 183–195) |
| Jewish | Judaism | the Sabbath and the seven days of Leviticus 23 on which no servile work is done (15 and 21 Nisan, Shavuot, 1, 10, 15 and 22 Tishri), by the fixed Hebrew calendar | none | Leviticus 23; Dershowitz and Reingold, Calendrical Calculations |
| none | the other faiths | none | none | no day of rest was read |

The world's calendar (`src/sim/calendar.ts`) is Julian before 1583 and has the Gregorian leap years after, without
dropping ten days. The Latin feasts lie on the world's dates, Easter by the Gregorian computus from 1583; the
Orthodox, Muslim and Jewish days lie on the day the sun and the moon give, through the Julian day number.

### 1291 (`tests/holy_days.test.ts`)

| calendar | working days | half days | days of rest | worked, a half day as half |
|---|---|---|---|---|
| Latin | 219 | 63 | 83 (52 Sundays, 31 feasts on other days) | 250.5 |
| Orthodox | 292 | 0 | 73 | 292 |
| Sunday | 313 | 0 | 52 | 313 |
| Muslim | 363 | 0 | 2 | 363 |
| Jewish | 307 | 0 | 58 | 307 |

Dates of 1291 checked against the computations of elsewhere: Easter 22 April (Julian); Ramaḍān 690 from 28 August
to 26 September, 1 Shawwāl 27 September, 10 Dhū l-Ḥijja 4 December; 15 Nisan 17 March, Shavuot 6 May, Rosh
Hashanah 27 August, Yom Kippur 5 September, Sukkot 10 September. The day numbers are tested against known dates of
today (1 Ramaḍān 1445 = 11 March 2024, Rosh Hashanah 5784 and 5785, Easter 2024 and 2025).

### Against the sources

- **Latin: 282 days with work, 250.5 counted whole.** The English lists of the 13th century ask for 52 to 54 feasts
  besides the Sundays (Exeter 1287: 54; Harvey 1972), which leaves 259 to 261 days; Walter of Henley reckons with
  44 working weeks, 264 days of six. Our 282 days with work lie above, because the Decretum has fewer feasts than the
  English dioceses and the patron and the dedication of the church, which the canon leaves to the bishop, have no
  day; our 250.5 lie below, because the Saturdays and eves of the Flemish cloth towns are half days everywhere.
  The days a day labourer was actually employed, 150 to 200 in the wage histories (the research of feature 7,
  recherche/tagesplaner/ in the project files),
  are a target for phase B of step 6 (a target income), not for the calendar.
- **Orthodox: 292.** The constitution of Manuel Komnenos of 1166 had 66 whole and 27 half holy days besides the
  Sundays (Holweck, same article), about 233 days; their names were not found, so the list of 1909 stands in.
- **Muslim: 363.** How many days the two festivals lasted, and how much less was worked by day in Ramaḍān, were
  not found (Lane's description of Cairo could not be read in full; Eychenne's study of Damascus was not reachable).
  The tabular calendar may differ by a day or two from the sighting of the moon.
- **Jewish:** the second days of the diaspora and the eve of the Sabbath are not counted.

### Limits

- A firm keeps the calendar of its owner's faith; its workers rest with it, whatever their own faith. A household
  buys on the working days of its own faith (the market of its faith is closed on its days of rest), the family
  purse of a person with the calendar of that person's faith: in a mixed city a Jewish family buys on a Sunday
  from the firms that work then or hold stock.
- A firm without an owner works every day; a household of a faith without days of rest buys every day.
- No seasons and no hours of the day here: those are the templates of step 5 (feature 12).

## Feature 9: sickness and childbed

Step 4 of way A of the proposal «Personen: Archiv der Toten und Tagesplan» (feature 7), after the proposal of
20 November 2026 (https://claude.ai/artifact/QK327U5QQQGWNCnL5JhHV5), which Ramon chose the same day («So bauen,
Lohn läuft weiter»). A worker who is sick, or a mother in the month after a birth, is away from work. The firm works
with the workers who are there and pays everybody (economy feature 22, docs/ECONOMY_DESIGN.md, section 22). Both are
a pure function of the person and the date (`src/sim/people/absence.ts`), as the calendars of feature 8 are: nothing
of them is saved, and the same person always has the same days.

### Sickness: the sick club of Morcott

The oldest source read that counts how often a person fell sick in a year is the friendly society of Morcott,
Rutland, 1725 to 1799: men, 2,808 sickness events and 222 deaths (Riley & Alter 1996, "The sick and the well: adult
health in Britain during the health transition", Health Transition Review 6, supplement, 19–44, tables 2 and 3). The
manor accounts of Ramsey in the 14th century give lengths of the same size ("three or four weeks" most often; Owen,
Brown & Skinner 2025, Journal of British Studies 64) but no rate: they count the cases, not the persons at risk.

| Age | New events in five years (table 2, net incidence) | Sick time (table 2) | Mean length in days by the age at onset (table 3) |
|---|---|---|---|
| 20–24 | 0.77 | 0.25 % | 6.00 |
| 25–29 | 1.33 | 1.72 % | 23.36 |
| 30–34 | 0.96 | 1.46 % | 27.56 |
| 35–39 | 1.31 | 2.01 % | 33.71 |
| 40–44 | 0.97 | 1.76 % | 27.32 |
| 45–49 | 1.16 | 1.58 % | 24.81 |
| 50–54 | 1.50 | 3.12 % | 44.82 |
| 55–59 | 1.43 | 3.57 % | 71.36 |
| 60–64 | 1.90 | 7.45 % | 134.20 |
| 65–69 | 2.22 | 15.14 % | 148.58 |
| 70–74 | 2.77 | 24.59 % | 140.96 |
| 75+ | 3.74 | 53.91 % | 508.77 |

The rule:

- A person of 15 or more who is well falls sick at the rate of the age: the club's new events per year of survival
  over the share of the year its members were well, `(events / 5) / (1 − sick) / 365.25` a day, since a member who
  is sick cannot fall sick anew. The persons of 15 to 19 take the values of 20 to 24: the table has no younger.
- An episode lasts `3 + Exp(mean − 3)` days, rounded, with the mean of table 3 for the age at its onset. The club
  paid only for bouts of three days and more (p. 20), so the table's mean is that of the bouts of three days and
  more, and a shorter sickness does not keep a person away here either. The exponential is an assumption: the
  source gives only the mean.
- The next onset is drawn from the day after the episode ends.
- The draws come from a stream of their own, by the person's uid (feature 7): the same person has the same
  sicknesses in every run, whatever else happens in the world.
- Women take the same table. The women's club of Ashborne in the same paper had three to four times the sick time
  of the men, and the paper does not say whether its sickness holds the lying-in; a woman's month of childbed comes
  on top (below).

### Childbed

A mother is away for 30 days from the day of the birth, the month of lying-in of 17th-century England (Astbury
2017, "Being Well, Looking Ill: Childbirth and the Return to Health in Seventeenth-Century England", Social History
of Medicine 30(3), 500–519), whatever her faith. The periods of the faiths, the 33 and 66 days of Leviticus 12 and
the nifās of Islam (at most 40 days), rule purity, prayer and fasting; no source read says that they kept a woman
from work. The world knows the day of a woman's next child in advance (`person.bears`, feature 2), so the childbed
of a birth in the coming month is known when the month is given to the economy.

### The persons against the table

20,000 persons born on one day and followed to 85, without death (`tests/absence.test.ts` checks 4,000 of them: the
rates below 75 and all lengths within 10 % of the table):

| Age | New events a year (model / table) | Mean length (model / table) | Sick time (model / table) |
|---|---|---|---|
| 15–19 | 0.152 / – | 6.0 / – | 0.25 % / – |
| 20–24 | 0.153 / 0.154 | 6.0 / 6.0 | 0.25 / 0.25 % |
| 25–29 | 0.266 / 0.266 | 23.5 / 23.4 | 1.69 / 1.72 % |
| 30–34 | 0.190 / 0.192 | 27.4 / 27.6 | 1.42 / 1.46 % |
| 35–39 | 0.262 / 0.262 | 33.7 / 33.7 | 2.40 / 2.01 % |
| 40–44 | 0.195 / 0.194 | 27.0 / 27.3 | 1.47 / 1.76 % |
| 45–49 | 0.233 / 0.232 | 25.0 / 24.8 | 1.59 / 1.58 % |
| 50–54 | 0.299 / 0.300 | 45.0 / 44.8 | 3.63 / 3.12 % |
| 55–59 | 0.280 / 0.286 | 71.4 / 71.4 | 5.36 / 3.57 % |
| 60–64 | 0.359 / 0.380 | 135.5 / 134.2 | 12.58 / 7.45 % |
| 65–69 | 0.437 / 0.444 | 149.3 / 148.6 | 17.41 / 15.14 % |
| 70–74 | 0.573 / 0.554 | 141.1 / 141.0 | 21.88 / 24.59 % |
| 75+ (to 85) | 0.542 / 0.748 | 510.8 / 508.8 | 66.79 / 53.91 % |

The rates and the lengths are the club's. Below 50 the sick time is too, within the noise of a few percent of the
episodes. From 50 on the three columns of the source do not fit together: at 60 to 64 its rate times its length
gives 51 days a year, 14 % of the time, against the 7.45 % of its own column. The table counts the length by the
age at the onset and the sick time by the age on the day, and a few very long sicknesses carry the mean of the old
(the club's sick of 75 and more were sick 54 % of their years). The rule keeps the rate and the length, so the old
are sick more often than in the club's sick time: 12.6 against 7.5 % at 60 to 64, 67 against 54 % from 75 on, where
being sick two thirds of the time also leaves fewer new events (0.54 against 0.75 a year).

### Measured in the game (`npm run absence:check -- 3`, world of 1291, seed 1291)

The workers of the world's cities in the first year: days sick a year per worker, by age, against the club's sick
time (table 2 times 365):

| Age | Women | Men | Morcott (men) | Worker-years (women / men) |
|---|---|---|---|---|
| 15–19 | 1.0 | 0.9 | – | 1,253 / 3,459 |
| 20–24 | 0.9 | 0.9 | 0.9 | 1,283 / 3,542 |
| 25–29 | 6.6 | 6.4 | 6.3 | 1,178 / 3,378 |
| 30–34 | 5.1 | 5.1 | 5.3 | 1,120 / 3,057 |
| 35–39 | 9.4 | 8.9 | 7.3 | 972 / 2,741 |
| 40–44 | 5.1 | 5.6 | 6.4 | 973 / 2,510 |
| 45–49 | 6.4 | 5.8 | 5.8 | 929 / 2,054 |
| 50–54 | 13.7 | 13.0 | 11.4 | 922 / 1,677 |
| 55–59 | 18.6 | 20.8 | 13.0 | 827 / 1,282 |
| 60–64 | 50.7 | 44.2 | 27.2 | 656 / 873 |
| 65–69 | 65.9 | 53.4 | 55.3 | 487 / 502 |
| 70–74 | 87.2 | 67.7 | 89.8 | 252 / 250 |
| 75+ | 224.6 | 253.2 | 196.8 | 177 / 159 |

| | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Days the workers are sick | 3.42 % (12.5 a year) | 3.36 % (12.3) | 3.43 % (12.5) |
| Days they are away, sick or in childbed | 3.57 % | 3.50 % | 3.59 % |
| Days of childbed a year per woman who works | 1.8 | 1.7 | 2.0 |
| New sicknesses of the persons of 20 or more per death of one of them | 7.3 | 7.3 | 7.4 |

A worker of the world is away about 13 days a year. The women who work are mostly women without a husband (economy
feature 11), so few of them bear children: 2 days of childbed a year each. The world has 7.3 sicknesses per death
against the club's 12.6 and Ramsey's 17.5: its persons fall sick at the club's rate, but die at the rate of the
English tenants-in-chief of the 13th century (feature 1, e0 35), and the club's members were men who were admitted in
health and of the 18th century. What the days away do to the economies of the cities is economy feature 22.

### Limits

- **No seasons and no epidemics.** The club's rate is a mean over 75 years; the sicknesses of winter, the summer
  fluxes and the years of plague or famine are not in it. The day plan (feature 12) gives the work its seasons, not
  the sickness; a later feature of epidemics would add them.
- **Sickness and death are apart.** The day of death is drawn by feature 2, the sicknesses by this feature; a person
  who dies need not have been sick, and a long sickness does not raise the risk of death. The club had 12.6 sicknesses per
  death, Ramsey 17.5 (5.7 % of its cases fatal).
- **One table for all.** Women take the men's table (Ashborne had three to four times the sick time); the traits
  (feature 5), the trade, the place and the region do not shift it; accidents at work are not apart; Morcott is a
  village of the 18th century, our world is Europe and the lands around it from 1291.
- **Childbed is the same for every mother.** The month of lying-in is that of the English middling and better sort
  in Astbury's sources; a poor woman will often have gone back to work sooner, and no rate of that was found.
- **The economy is given a month at a time.** The days away of a month are given on its first day (economy feature
  22). A worker who dies passes the place to an heir (feature 2), and the heir keeps the days away of the dead
  worker for the rest of the month; a worker who comes later in the month has none until the next.
- **Only the workers are away.** The owners of the firms and of the bank are not workers of the model, so their
  sicknesses and childbeds keep nothing from work; their firm works with its workers.
- **The wage runs on for a servant.** A worker who serves by the year keeps the place and the wage on the days away
  (Ramon's choice); no sick pay of a guild or club is booked apart. Since feature 10 a worker who works by the day
  loses the day's wage, and a worker without work of the city stands in. Without the wage of the days away for
  everybody the economies of the cities slid further in the measurement (economy feature 22, variants D and G).

## Feature 10: service by the year and work by the day

Step 6 of way A of the proposal «Personen: Archiv der Toten und Tagesplan» (feature 7), after the proposal of
20 November 2026 (https://claude.ai/artifact/Wyqd64rfmZgJnz9GZ7Wof9), of which Ramon chose phase A the same day
(«Phase A bauen und messen»). Every worker has one of two contracts: service by the year, as the famuli, servants and
maids of the manors, or work by the day. A servant is paid every day, as every worker was before; a day labourer is
paid for the days he works, and nothing on a day he is away. On a day on which workers are away, workers without work
of the city stand in for them, and since economy feature 24 first an adult of the worker's family who does not work.
The rules of the economy, the sources and the numbers are economy features 23 and 24 (docs/ECONOMY_DESIGN.md,
sections 23 and 24).

### Who has which contract

The contract follows the household. A worker who heads a family, as its man or its woman, works by the day; every
other worker, a son, a daughter, a brother or a parent who lives in the family of another, serves by the year. Day
labourers were often "smallholding tenants who used temporary employment to supplement the incomes" of their land,
while the famuli were hired "most commonly for the whole agricultural year" (Claridge, Delabastita & Gibbs 2024,
(In-kind) Wages and labour relations in the Middle Ages, working paper, p. 13); unmarried women served by the year,
married women worked by the day (Humphries & Weisdorf 2015, The wages of women in England, 1260–1850, Journal of
Economic History 75). The contract is a function of the person's place in the family on the day it is given
(`contracts` in `src/sim/systems/workers.ts`): nothing of it is saved.

The workers of the world of 1291 at its founding (seed 1291):

| Age | Men by the year | Women by the year | Men (by the year / by the day) | Women (by the year / by the day) |
|---|---|---|---|---|
| 15–19 | 99.2 % | 96.2 % | 3,553 / 27 | 1,231 / 48 |
| 20–24 | 86.4 % | 70.9 % | 3,076 / 484 | 908 / 373 |
| 25–29 | 55.5 % | 43.7 % | 1,853 / 1,483 | 512 / 659 |
| 30–39 | 35.8 % | 34.3 % | 2,079 / 3,726 | 706 / 1,352 |
| 40–49 | 31.0 % | 30.6 % | 1,416 / 3,159 | 576 / 1,309 |
| 50–59 | 46.8 % | 31.1 % | 1,380 / 1,570 | 546 / 1,212 |
| 60+ | 74.2 % | 34.9 % | 1,323 / 459 | 556 / 1,039 |
| all | 57.4 % | 45.7 % | 14,680 / 10,908 | 5,035 / 5,992 |

Of all workers 53.8 % serve by the year, against about 40 % of the labour force in annual service and 46 % in the
late 13th century in Humphries & Weisdorf (2019, Unreal wages?, Economic Journal 129, p. 22 of the manuscript, after
Campbell 2016), and a third to a half of the labour of the demesnes done by famuli (Claridge & Langdon 2015, cited by
Claridge, Delabastita & Gibbs 2024, p. 13). The gap is not tuned. The young serve by the year, as the life-cycle
servants of the sources did. The old men who serve by the year are, in our reading (not counted apart), fathers who
passed the household to an heir (feature 3) and work on in the heir's family. The women who work are mostly women without a husband (economy
feature 11), and a widow who heads her family works by the day.

### Limits

- **54 % instead of 40 to 46 %.** An age limit for service, or a share of the children who stay at home, would need a
  source; none was read.
- **One contract a person, given a month at a time.** A worker who marries or takes over a household in the month
  keeps the contract until the next month, and an heir keeps the contract of the one before for the rest of it.
- **No servant leaves at Michaelmas.** The famuli were hired mostly for the year, but at Meopham ploughmen were
  dismissed in the year (Goose, Archaeologia Cantiana 92, p. 207); the firms hire and dismiss by the port's rule, the
  same for both contracts.
- **The family stands in first** (economy feature 24, Ramon's choice of 20 November 2026). A sick tenant found "a
  family member or even a hired laborer" (Owen, Brown & Skinner 2025, Journal of British Studies 64, e92, p. 5): an
  adult of the family who does not work and is not away himself takes the place for the day. For a day labourer the
  pay of the day goes to his household; for a servant, whose wage goes on, the firm pays nothing more (Ramon's choice
  of 21 November 2026, «Ohne Zusatzlohn für Knechte»). Where nobody of the family is at home and no worker without
  work is left, the place stays empty for the day.
- **The day labourer's days are not his own.** He works every day his firm works and he is there; how many days a day
  labourer wanted and found work (a target income) is phase B of the proposal, a choice of its own.

## Feature 11: history where the world is still history

Ramon, 20 November 2026: historical events should happen where the ruler still exists, and not where the simulation
has discarded them. Step 1 of the recommendation: the world is compared with its shadow, and the chronicle of rulers
knows who is whose child.

### The rule

- **The shadow** is what the setup and the chronicles of borders and of rulers have on a day (`src/sim/divergence.ts`).
  It is computed, not kept, so it is no part of the state. The divergence counts the places whose holder differs, the
  crowns not with a person history has reigning, the persons of history alive in one and dead in the other, and the
  persons history has born whom the world could not bear. A difference counts only where history knows the answer.
  The world server gives it at `GET /divergence`.
- **Parents.** The chronicle carries the father and the mother of a person where Wikidata names them (P22, P25 in
  `data/history/rulers/wikidata/holders.csv`) and they are persons of the chronicle too: 892 fathers and 44 mothers in
  the chronicle of 1291 (`tools/history/rulers/build.ts`).
- **Who is not born.** A person of history does not enter the world when the father died before the conception or the
  mother before the birth (Parfit 1984, Reasons and Persons, ch. 16, the non-identity problem). The conception lies
  268 days before the birth, the median of Jukic et al. 2013 (Human Reproduction 28(10), 2848–2855). A parent the world
  never let be born counts as gone, up to 40 generations.
- **Death where the chronicle gives none.** A person of history with a known birth and no known death dies on a day of
  the life table of feature 2 (`drawDeath`), drawn after the last day the chronicle sees them alive: the end of the
  last reign, the conception of a child as father, the birth of a child as mother. 114 persons of 1291. A person whose
  birth is unknown leaves at the end of the last reign as before (OWN RULE: no age to draw from).
- **The crown of a reign dated before the birth** is given on entering, and a reign that ends on or before its first
  day gives no day to reign (OWN RULE: the sources give only a year for both). Before, 157 such reigns left a crown
  with nobody to end it, and four accessions dated before the birth (Mary I of Scotland among them) were lost.

The death of a ruler is not drawn instead of the chronicle's day. Pearl's counterfactual (Pearl 2009, Causality,
ch. 7) keeps the luck of history and lets only causes change the outcome; nothing in the world changes a ruler's
mortality yet, so the abducted day is the day of the chronicle.

### Measured (`tests/divergence.test.ts`)

The world of 1291 that nothing touches is history every week from 1291 to 1848: no place, crown, life or birth
differs (the test samples every 91 days). In a world where a king of the fixture dies in 1295, his son and grandson
are not born, the crown stays with nobody, and the divergence names the king, the son and the realm.

### Limits

- **Nobody takes a crown that history gave to an unborn person.** A succession of the world's own is the next step.
- **Few mothers, no spouses.** The children of a queen who dies early stay unborn only where the chronicle knows her
  as their mother (44 persons); weddings are not in the chronicle.
- **Wikidata could not be read from the cloud** (query.wikidata.org refuses it); the parents are those of the
  holders.csv already in the repository.

## Feature 12: the day plan

Step 5 of way A of the proposal «Personen: Archiv der Toten und Tagesplan» (feature 7), after the proposal of
20 November 2026 («Vorschlag: Tagesplan der Personen und Reisen der Herrscher»,
https://claude.ai/artifact/Bi91xAnUNQtxCw3hkKKuks), to which Ramon said yes the same day («5. gut aber später») and
which he set going on 21 November («ok»). The travels of the rulers of the same proposal are in the itineraries
(`src/sim/content/itineraries.ts`, `src/sim/content/travel.ts`). On the map a ruler between two places of the way
rides it as a horseman, at every distance (step C of 21 November, «wir starten mit a dann b und c»: `src/figures/
horse.ts`, `src/worldprobe/view_riders.ts`); where the ruler stays, the dot of the ruler stands at the place, and near
the ruler's figure stands in the town the ruler stays in (GET /people lists a person of history there).

Every person has a plan of the day: what the person does at which hour, and where. The plan is a pure function of
the person's part in the world, the calendar of the person's days of work, the place and the day
(`src/sim/people/day_plan.ts`), as the calendars of feature 8 and the days away of feature 9 are: nothing of it is
saved, it draws nothing, and the economy does not read it. The world server adds today's plan to a living person
(`GET /person/<uid>`, `src/net/plan.ts`), and the card of a figure shows the kind of day and what the person does at
the world's hour (`src/people/plan_lines.ts`; the hour runs from the world's day message and its pace,
`worldHour` in `src/net/client.ts`).

### Templates

Large simulations give every person the typical day of the person's role: FRED a list of places for the day by
weekday for each profile (Grefenstette et al. 2013, BMC Public Health 13, 940), JUNE the same for the 53 million
persons of England (Aylett-Bullock et al. 2021); in Belgian time use seven patterns cover 81.4 % of the working days
(Aerts et al.). Here the template is chosen by the person's part, the kind of the day and the season. No source gives
the shares of several templates within one part, so there is one template a part and no draw.

| Part (`WHO`) | Who | A working day |
|---|---|---|
| child | under 15, the working age of the economy | at home |
| home | an adult who does not work | at home |
| farm | a worker of a firm of agriculture, or its owner | the work of the farming year, sunrise to sunset |
| craft | of a firm of industry | in the workshop, sunrise to sunset |
| trade | of a firm of the services | at work, sunrise to sunset; on the market day at the market to noon |
| bank | the owner of the city's bank | in the bank, sunrise to sunset |
| seeking | a worker without work | at the hiring place, the market, for the hour after sunrise, then at home |
| ruler | holds a crown | holds court where staying; rides from sunrise to sunset when on the way |

| Rule | Source |
|---|---|
| The kind of the day is the calendar's (feature 8): a worker keeps the days of the firm's owner's faith, everybody else those of the own faith | as in the economy (economy feature 19) |
| Work from sunrise to sunset; sunrise and sunset by latitude and day (`src/sim/people/sun.ts`, the approximate solar coordinates of the U.S. Naval Observatory, from the Julian day number) | Nieuwpoort weavers between Easter and St Michael, not before sunrise at Saint-Omer (Stabel 2014, TSEG 11(4), pp. 38–41); no night work, "the light at night does not suffice" (Millett 1915 on the Livre des métiers) |
| The midday meal at noon, an hour and a half | work stopped at noon, «entre deux cloques du mengier» (Douai 1287, Stabel 2014, p. 38); the length is the Artificers and Labourers Act of 1514 as Wikipedia gives it, without a source there: out of period, the only length read |
| A half day (Saturdays and the eves of the Latin feasts): work to noon | Stabel 2014, pp. 36–38 |
| A day of rest: the parish church at terce, for one of the twelve unequal hours | going to the parish church: the decretals of Gregory IX, X 3.29.2 (Kirkland 2021); unequal hours: Riis. OWN RULE: the hour of the mass is not in a source read |
| The market once a week, on a set day | Letters, Gazetteer of Markets and Fairs in England and Wales to 1516. OWN RULE: the day of each place drawn from Monday to Saturday (Sunday markets were displaced in the early 13th century, same source). OWN RULE: the services at the market from sunrise to noon |
| The worker without work at the hiring place for the hour after the bell | the corn market of Douai, within the hour after the bell (1403, Stabel 2014, pp. 47–48); hiring "in a common place" of the market towns (Statute of Labourers 1351) |
| Sick or in childbed: at home all day | feature 9, the same days the economy has |
| Sleep from 21 o'clock, or from sunset where it is later, to sunrise | OWN RULE after Ekirch 2024 (Medical History 68): to bed between 21 and 22, from early modern sources, disputed |

The farming year (`src/sim/people/farm_year.ts`), on the days of the Julian calendar the sources give:

| From | Work | Source |
|---|---|---|
| 1 December | threshing in the barn | through the winter, oats not before Christmas (Grosseteste, Rules, c. 1240) |
| 1 February | spring corn and dung | February and March (the research of feature 7, chapter 5) |
| 1 April | ploughing the fallow | "April is a good time for fallowing" (Walter of Henley, 1270s) |
| 1 June | hay | June (the research of feature 7) |
| 24 June | weeding, the second ploughing of the fallow | after St John's Day (Walter of Henley) |
| 1 August | the harvest | "five weeks in August and early September" (Ramsey: Owen, Brown & Skinner 2025); reaping paid from the first week of August (Statute of Labourers 1351) |
| 5 September | ploughing and sowing the winter corn | the seed changed at Michaelmas (Walter of Henley); the winter corn in the autumn (research of feature 7) |

Which farming year a place follows goes by its land, not by the faith of its people (step D of 21 November, after
the proposal «Vorschlag: Bauernjahr für Süden und Islam», https://claude.ai/artifact/T8KjRYpoP6BCsN8wtTCGC6, in the
variant Ramon chose, «Mittelmeer und Irak», merged and deployed on his word «mergen deployen»): the
Muslim almanacs, too, set the field work by the months of the sun (the calendar of Córdoba by the months January to
December, Ibn Mammātī by the Coptic months; filaha.org), and the lunar year of the hijra goes round all seasons in
some 33 years. The farming year of each land place is worked out from the region of its province (data/geo.json) and
its climate (`public/data/place_climate.json`, written by `tools/worldprobe/build_place_climate.ts` from the world
graphic's climate layer, the Köppen-Geiger zones), by the world loader (`World.farmYear`) and on the main thread
(`src/figures/plan_places.ts`) alike:

| Farming year | Places | Source |
|---|---|---|
| Mediterranean | the Mediterranean climate (Köppen-Geiger Cs) in Iberia, France, Italy, Greece, the Balkans, Anatolia, the Levant and the Maghreb; OWN RULE: in Iberia, the Maghreb and the Levant also the steppe and the desert (the same winter rains; Toledo and Zaragoza lay in al-Andalus) | the calendar of Córdoba, 961 |
| Mesopotamia | the region of Mesopotamia | Handbook of Mesopotamia, vol. I (Naval Staff, 1918), pp. 176–177: not medieval |
| North | everywhere else, also Egypt, Persia, the steppe, Arabia and the Sahel, for which no source with months could be read (Ibn Mammātī's calendar, ed. Pellat 1986; Rabie 1981; Rashīd al-Dīn's *Āthār wa aḥyāʾ*; Lambton 1977 are not online) | above |

The calendar of Córdoba (ʿArīb ibn Saʿd; English extracts by John Brogden after Dozy's edition of 1873, filaha.org)
names months only; OWN RULE: each work begins on the first of its month, and where a month names the corn and other
work, the corn's goes first:

| From | Work | The calendar |
|---|---|---|
| 1 January | pruning and setting the vines | January "the vines … are pruned", February "the vine shoots transplanted" |
| 1 March | planting in the gardens and watered fields | March "Sugar cane is planted", April "rice and beans are sown" |
| 1 May | the harvest | May "farīk is gathered" (the green early wheat), June "the grain on the threshing floor is weighed" |
| 1 July | threshing out of doors, on the threshing floor | July "grain is harvested and barley is threshed" |
| 1 August | planting in the gardens | "autumn beans, sky-blue stock, turnips, carrots, chards" |
| 1 September | ploughing and sowing | September "ploughed and sown in the mountains", November "sowing activities reach their peak" (the olive picking that "commences" in October gives way) |
| 1 December | planting in the gardens | "White poppy is sown, and also garlic" |

Mesopotamia, after the handbook: from 1 September sowing (wheat and barley "Sep–Oct or Nov–end Jan", the spring crops
to March), from 1 April the harvest ("The harvest begins in April"), from 1 June threshing on the floor (OWN RULE: the
handbook says only "after drying", here the two months after the harvest), from 1 August the harvest of the summer
crops (rice, millet, sesame, cotton; August to October, before the sowing from September). Threshing on the floor is
field work: the figure stays at the furlong (`src/figures/schedule.ts`), the card says «auf der Tenne».

### The fields by the season

The fields of the world graphic show the world's day: the corn ploughed, sown, young and green, grown tall, turning
gold, reaped, the stubble, and the vines bare, in leaf and turned, on every step of the zoom; and they go round their
rotation year by year (Ramon, 21 November 2026, «Felder nach Jahreszeit», in the variant «Voll, mit Fruchtfolge»).
What a field shows on a day is a pure function of its farming year, its course in the year the pieces are built for,
its courses, its own number and the day (`src/worldprobe/field_season.ts`):

- Each field is ploughed and sown on a day of the sowing weeks of its farming year, and reaped on a day of the harvest
  weeks (the weeks above), spread over them by the field's own number.
- Between sowing and reaping the corn goes by the phases of wheat in the benchmark season of the AHDB Wheat growth
  guide, counted back from the day it is harvest ripe: first node 120 days before, flowering 59, the canopy
  senescing 50, all green lost 11. The harvest of the north begins about 7 August of the Julian calendar (Pribyl,
  Cornes & Pfister 2012, Table 2).
- Of three courses the winter corn comes on last year's fallow, the spring corn on last year's winter corn, the
  fallow follows the spring corn; of two, corn and fallow take turns (Slicher van Bath 1963).
- OWN RULES, where the sources give no number: the corn comes up two weeks after it is sown and stands at a sixth of
  its height until it shoots; a ploughed fallow shows its earth for four weeks; the vines' leaves come out over a
  month and turn and fall over the month after the vintage; the colours of bare wood and turned leaves are by eye.

The pieces are built in the high summer of the year they are built for, as before, and carry a season map: the code
and own number of each field column (`src/worldprobe/season_codes.ts`). The stage reads the world's day and turns
the fields' colours and heights from there (`src/lookprobe/stage/season_look.ts`, `seasons.ts`). The farming year of a
field is that of its nearest place's region and its own land, as for the places above. The pieces' key changed with
it: the world is downloaded once more, and the tables of steps 1 to 7 were built again.

### Measured (`npm run dayplan:check -- 3`, world of 1291, seed 1291, all systems)

Days at work a year by the plan, a half day as half (the day labourers by the calendar of their firm; in brackets the
day labourers of that calendar):

| | Year 1 (1291) | Year 2 (1292) | Year 3 (1293) |
|---|---|---|---|
| Day labourers, all | 272.8 | 278.5 | 273.1 |
| of a firm of the Latin calendar | 241.1 (11,051) | 249.4 (11,211) | 241.7 (11,315) |
| Orthodox | 282.4 (967) | 284.8 (974) | 281.7 (979) |
| Sunday (the other churches) | 299.1 (103) | 301.0 (101) | 297.2 (105) |
| Muslim | 349.8 (4,272) | 349.5 (4,337) | 349.8 (4,368) |
| Servants by the year, all | 274.7 | 280.7 | 275.0 |
| Needed by a day labourer before 1348 (Humphries & Weisdorf 2019) | 175–200 | | |

Hours at work on a working day, workers of London, by month (year 3; sunrise to sunset less the meal, and the services'
mornings at the market): 6.8, 8.3, 10.1, 12.3, 13.9, 14.4, 13.5, 12.0, 10.1, 8.4, 6.7, 6.0. Paris had "from 14 hours
in summer to 8 in winter" (Millett 1915).

After a restart from the snapshot of the last day, all 101,286 living persons have the same plan as before (the plan
reads the state only, and keeps nothing of its own). Two runs of the same code gave the same numbers.

### The figures of the towns

The figures of the persons in the 30 great cities (src/figures) follow the plan at the world's hour. Each person may
have four figures, each in the piece of the world that owns its column (src/figures/aims.ts): the one in the
street of the town that it always had, one at the market (a column of the market of the land register, for those
whom the plan takes there: the services on the market day and those who look for work at the hiring place) and
one at a house of worship (a column within 12 blocks of the middle of one of the town's landmarks that are
cathedrals, churches, abbeys, convents or Friday mosques; OWN RULE, a drawing value: the great churches of the
register are 35 to 70 blocks long, and those who find no street there are inside), and for a worker in agriculture
one at a furlong of the town (src/figures/farmers.ts): a furlong of the land register's fields round the town,
drawn from the person's id, at a free block of its balk, facing it, bent over the hoe (tending the vines standing).
In the furlongs of a town whose persons are known no anonymous farmer works. A person's figures wear the same,
drawn from the person's id; in the field a farmer wears the farm estate. Once a second the browser works out which of them is on the stage
(src/figures/schedule.ts, the plan as the world server has it for the card of the person):

| The plan has the person | The figure on the stage |
|---|---|
| at the market, at the hiring place | at the market |
| at the mass | at the house of worship |
| at work in the services | in the street (OWN RULE, a drawing rule: they sell, carry and serve in the town) |
| at the work of the farming year | at the furlong; none while threshing in the barn (farm_year.ts) |
| at work in a workshop, in the bank | none |
| at home or at the meal, between sunrise and sunset | in the street (OWN RULE, a drawing rule: the houses have no inside to show) |
| at home after sunset, asleep, sick, in childbed | none |
| a ruler | in the street at every hour, where the map mode of the rulers finds them |

At the speeds at which an hour of the world lasts less than a second (a day under 24 seconds), every day is shown in
the middle of the hour of the mass, three and a half unequal hours after sunrise (OWN RULE, a drawing rule): on a
day of rest at the house of worship, on the market day at the market, on the others at work. The figures stand
still at the market and at the house of worship; they walk only in the street.

The figures show the persons as they are on the world's day (src/people/town_rolls.ts). A piece's figures are built
with the lists of the persons the world server gave when the piece was built, which is long ago for a piece kept on
disk: a day of the world passes in four minutes, a year in a day. Once a day of the world, and at most once a minute
(OWN RULE, a drawing value: at the highest speeds the pieces of the towns would be built again every second), the
browser asks for the lists of the places whose figures are on the stage again:

- who is no longer listed at the place (dead, or moved away) leaves the stage at once, and the part, the calendar and
  a birth are those of the new list: a mother in childbed stays at home (src/figures/schedule.ts);
- each town has a number drawn from who its persons are (people.ts `rollOf`), which the figures keep from the lists
  they were built with (`Figures.rolls`). Where a town's persons have changed (the dead, the young who come to the
  age of 14 from which the figures are drawn, a ruler who arrives or leaves), the workers take the new lists and
  build the figures of its pieces again; the land of a piece stays on the stage as it is and only its figures change
  (src/worldprobe/pieces.ts `renewFigures`), and the piece is kept on disk anew. A change of work or a birth changes
  no figure that is built and is followed on the stage alone.

### Limits

- **The day labourer works too many days.** By his plan a day labourer works on every working day of his firm on
  which he is not away, as in the economy (feature 10): 241 to 249 days a year in a firm of the Latin calendar and
  273 to 279 over all calendars, against the 175 to 200 days a day labourer needed before 1348 for the income of a
  year (Humphries & Weisdorf 2019). That number is computed from wages, not counted, and is a check, not a parameter;
  how many days a day labourer wanted and found work is phase B of step 6 (a target income), a choice of its own.
  The templates do not close the gap and are not set to.
- **One template a part.** The servants by the year and the day labourers have the same day; the owner works as his
  workers do; nobody of a family goes to the market to buy (the households buy every working day in the economy, and
  no source read says how often a family went to the market); the women of the farmsteads do not go into the field in
  the harvest; children are at home.
- **England's year everywhere.** The farming year is that of the English treatises; the Italian cycles of the months
  set the field work a month earlier, and the Mediterranean and the lands of Islam have years of their own. The
  hours are of local solar time and follow the sun alone: Douai's seasons of the bells (All Saints, the first Sunday
  of Lent, Stabel 2014, p. 37) and the closing bell of winter are not apart.
- **No inn, no lodging.** A ruler on the way sleeps from sunset; where, the itinerary does not say.
- **The figures of the towns follow the plan as far as the town shows it** (above): the workshop, the bank and the
  barn have no figures of the persons. A farmer works the same furlong every day, one drawn by the id and not that of
  the person's own farmstead, and at the same pose whatever the work of the farming year (the hoe: no plough, scythe or
  sickle in the kit).
- **The figures know the persons as on the last day their list was fetched** (above): up to a day of the world, and
  at least a minute, late. A person whose part changes keeps the figures of the part the piece was built with until
  the persons of the town change: a farmer who loses his work is not at the hiring place, and one who finds work in
  the fields is not at the furlong, meanwhile.
