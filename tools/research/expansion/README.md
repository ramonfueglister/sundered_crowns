# Empire expansion: can a published model predict our borders?

A research study for Sundered Crowns (thread "Besseres Modell für Reichsausdehnung bauen", 19 Nov 2026). Question: does a
model built only from published mechanisms predict which polity holds each place of our map better than "nothing
changes" and better than Bennett (2022)? Plan, amendments and full results (German): Claude Doc "Forschungsplan:
Besseres Modell für Reichsausdehnung". Nothing here is used by the game.

## Data

Cliopatria v0.2.1 (Bennett et al. 2025, *Scientific Data*, doi:10.1038/s41597-025-04516-9, CC BY 4.0), the same file as
`tools/history/borders/cliopatria_places.py` (SHA-256 in `data/history/borders/README.md`), mapped onto the 12,538 land
places of the world frame for every year 900–1848 by `prep_owners.py` (centre of the place inside the polygon; smallest
polity wins; `top` follows MemberOf). `lineage.py` merges labels of one state (names in parentheses; a new name that
takes ≥80 % of a state that vanishes the same year). Splits, fixed before any run: fitting starts 1000–1225 (maps up to
1250), selection 1226–1265 (up to 1290), test 1291–1475 (up to 1500), run once.

## Models

| model | file | what |
|---|---|---|
| M0 | `evaluate.py` | persistence |
| Zufall | `evaluate.py` | control without mechanism: a border place goes to a random neighbour's owner at 1 %/year |
| M1 | `bennett.py` | the agrarian war of Bennett 2022, supplement Eq. 6–8, ported from his code (github.com/jbennettgit/NADSM_PLOSONE v1.0.4, CC BY 4.0); no civil war (needs the elite state, which no map gives) |
| M3 | `transitions.py` | conditional logit per place and 5 years; features from Turchin et al. 2013, Bennett 2022, Fernández-Villaverde et al. 2023, Abramson 2017 |
| M3b | `transitions.py` | M3 + phase of the state (Turchin & Nefedov 2009) |
| M4 | `transitions.py` | M3b + share of the province already held (data, not literature: a measure of what is predictable) |

Turchin et al. 2013 has no port of its own: its equations are images in the paper and its appendix was not readable;
its mechanisms are features of M3.

## Score

From the real map of a start year, 30 runs per model, owner probabilities per place after 10, 25 and 50 years; Brier
score as skill against persistence (main: 25 years, whole frame). Owners that did not exist at the start count as one
class "new". Second source: `euratlas_check.py` compares predicted borders after 100 years with Euratlas 1400 and 1500.

## Results (test, 25 years)

| model | skill | Europe only |
|---|---|---|
| Zufall | +2.7 % | +2.7 % |
| M3 | +1.2 % | +0.9 % |
| M0 | 0 | 0 |
| M4 | −2.5 % | −1.9 % |
| M1 Bennett | −3.4 % | −4.7 % |
| M3b | −4.3 % | −3.5 % |

No model beats the control. On the selection years M3 had +9.3 %. Place-by-place models speckle the map over 100
years (Euratlas border check −282 % to −369 %); Bennett keeps realms whole (+10.6 % / +3.9 %). In Cliopatria 54 % of the
changes go to polities that did not exist at the start and about one in seven is a frontier advance; 40–49 % of the
changed places move with their whole province. Land does tend to go from the new owner's side outward (Spearman ρ of
change year vs steps to the new owner's land: 0.40 in 1000–1225, 0.16 in 1291–1475; `order_check.py`).
Raw numbers: `results/`.

## Round 2 (20 Nov 2026): two levels, new split

Round 1 showed that most changes are events of whole states and that land moves in blocks. Round 2 tests a model on
two levels on a period nobody had looked at. New split: fitting starts 1000–1265 (maps up to 1290), selection
1291–1475 (up to 1500), test 1501–1823 (up to 1848), run once. Scores (`evaluate2.py`): place Brier skill (main, 25
years), Brier skill on land edges (does the map stay in one piece), and Bennett's patterns after 50 years (number of
polities, share of the three largest, KS distance of the size distribution). Second source: borders after 100 years
against Euratlas 1400/1500 (selection) and 1600/1700/1800 (test).

| model | file | what |
|---|---|---|
| M1-P | `bennett_p.py` | Bennett 2022 on provinces (≈ his 25,000 km² regions) with his own 2-year step; s estimated on the fitting years |
| M5 | `m5.py` | per state and 5 years: absorption by a neighbour (conditional logit), break-up into two (logistic; Turchin et al. 2013, Bennett 2022 create_factions), then whole-province transfers with the M3 features |
| M5b | `m5b.py` | M5 after the plan amendment (`diagnose_m5.py`): secession is a state event whose blocks are drawn from the 52 observed secessions; the number of successors of a break-up is drawn from the observed 27 × 1, 4 × 2 (Bennett's faction_odds, estimated) |

Fitting: `fit_round2.py` (M3, M5), `fit_round2b.py` (M5b, s of M1-P) → `coef_round2.json` (hash `64db843c` before the test).

| test 1501–1848 | place 25 y | edges 25 y | polities off, 50 y | KS, 50 y | Euratlas 1600 / 1700 / 1800 |
|---|---|---|---|---|---|
| M0 | 0 | 0 | 6.7 | 0.11 | 0 / 0 / 0 |
| Zufall | **+2.0 %** | −36 % | 6.8 | 0.12 | +4.5 / +3.2 / −0.4 % |
| M1 Bennett | −5.2 % | −76 % | 32.3 | 0.33 | +7.1 / +3.4 / +17.9 % |
| M1-P Bennett, provinces | −303 % | −225 % | 8.1 | 0.30 | +14.3 / −2.9 / +27.6 % |
| M3 | −16.9 % | −762 % | 358 | 0.63 | −361 / −480 / −517 % |
| M5 | −14.8 % | −74 % | 46.1 | 0.32 | −24 / −49 / −56 % |
| M5b | −22.5 % | **−32 %** | 9.1 | 0.16 | −1.8 / −13.2 / −9.0 % |

The round-2 success criterion (M5 beats Zufall on the main score in the test and is closer on the patterns) is not
met. After 1500 every model with a mechanism is worse than on the selection years: the early-modern map is calmer and
rates learnt on the Middle Ages change too much (the risk named in the plan, Gennaioli & Voth 2015). What holds in
both periods: M5b's structure (state events plus whole provinces) keeps the number of polities near the real one and
the map most coherent; Bennett's war (M1, M1-P) is the only mechanism that predicts Euratlas borders after 100 years
better than the start map, i.e. it gets the consolidation of the map, not which state wins. Raw numbers:
`results/round2_*`.

## Run

```
python3 prep_owners.py <cliopatria_polities_only_v021.geojson> <out>   # ~10 s, needs shapely
python3 fit_bennett.py <out>                                            # grid of s and steps per year
python3 fit_transitions.py <out>                                        # writes coef.json
python3 select_models.py <out>                                          # ~15 min on 4 cores
python3 test_models.py <out>                                            # ~1 h on 4 cores
python3 order_check.py <out>
# round 2
python3 fit_round2.py <out> && python3 fit_round2b.py <out>              # writes coef_round2.json
python3 diagnose_m5.py <out>                                            # why M5 makes too many polities
python3 select_round2.py <out> select2                                  # ~50 min on 4 cores (M3 is the slow one)
python3 euratlas_round2.py <out> select2
python3 select_round2.py <out> test2 && python3 euratlas_round2.py <out> test2   # run once, ~1.5 h
```
