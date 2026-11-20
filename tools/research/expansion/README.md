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

## Run

```
python3 prep_owners.py <cliopatria_polities_only_v021.geojson> <out>   # ~10 s, needs shapely
python3 fit_bennett.py <out>                                            # grid of s and steps per year
python3 fit_transitions.py <out>                                        # writes coef.json
python3 select_models.py <out>                                          # ~15 min on 4 cores
python3 test_models.py <out>                                            # ~1 h on 4 cores
python3 order_check.py <out>
```
