# Rulers 1291–1848: raw Wikidata fetch

Raw, unedited extract of position holders from Wikidata, for later cleaning and
matching against the game's realms. Nothing here is curated yet.

- Source: [Wikidata](https://www.wikidata.org), data under CC0 1.0
- Endpoint: https://query.wikidata.org/sparql (Wikidata Query Service)
- Fetched: 2026-11-16
- Queries: `queries/*.rq` (the SPARQL actually sent)

## Scope

Positions are everything that is a subclass of, or an instance of a subclass of,
one of three roots: monarch (Q116), head of state (Q48352), noble title (Q355567).
Holders are the `position held` (P39) statements on people for those positions.
The SPARQL time filter is wider than the game period: a statement is kept when its
start (P580) or end (P582) year lies in 1250–1848, or, when it has neither, when
the person's life (P569/P570) overlaps 1250–1848. Filter to 1291–1848 downstream.

## Files

| File | Rows | Content |
|---|---|---|
| `positions.csv` | 13,346 | Every position found under the three roots, with its jurisdiction |
| `holders.csv` | 16,077 | One row per P39 statement, all regions |
| `holders_EU_NA_NE.csv` | 5,065 | Subset of `holders.csv` with `region = EU_NA_NE`, minus Captains Regent of San Marino (Q258045, ~2,000 rows of six-month terms) |
| `families/persons.csv` | 32,577 | The families of the persons of the chronicle of 1291 (below) |
| `families/report.json` | | What the families fetch counted and dropped |
| `queries/` | | SPARQL queries. `positions*.rq` and `holders_*.rq` produced these CSVs; `persons_*.rq` fetched per-person fields (sex, parents, family); `jurisdictions.rq` fetched jurisdiction coordinates. `p97_*` / `persons_p97_*` belong to a separate noble-title (P97) fetch that is not included here. |

## Columns

`positions.csv`

- `pos`: position QID
- `posLabel`: English label
- `roots`: which of `monarch`, `head_of_state`, `noble_title` it falls under, `|`-separated
- `jurisdiction_qids`: `applies to jurisdiction` (P1001) and `country` (P17) of the position, `|`-separated

`holders.csv` / `holders_EU_NA_NE.csv`

- `person`, `personLabel`: holder QID and English label
- `pos`, `posLabel`, `pos_roots`: position QID, label, roots (as above)
- `jurisdiction`: the position's jurisdiction QIDs, `|`-separated
- `start`, `end`: P580 / P582 qualifiers of the P39 statement
- `replaces`, `replacedBy`: P1365 / P1366 qualifiers (predecessor / successor QID)
- `birth`, `death`: P569 / P570 of the person
- `sex`: P21 QID (Q6581097 male, Q6581072 female)
- `father`, `mother`: P22 / P25 QIDs, `|`-separated if several
- `family`, `familyLabel`: P53 (family / dynasty) QIDs and labels, `|`-separated
- `statement`: Wikidata statement ID; unique per row, use it as the key
- `region`: `EU_NA_NE` if any jurisdiction has a coordinate (P625) inside lon −25…65, lat 10…72 (Europe, North Africa, Near East); `other` if all resolved coordinates fall outside; `no_jurisdiction` if the position has none; `jurisdiction_unresolved` if none of its jurisdictions has a coordinate
- `jurisdictionLabel`: English labels of `jurisdiction`, same order

## Dates

Dates are `YYYY-MM-DD`, cut from the Wikidata timestamp, negative years keep their sign.
Wikidata stores the precision separately and it was not fetched: a date with
precision "year" (or decade/century) is stored as `YYYY-01-01`, so a `-01-01`
date may only mean "some time in that year". `unknown` means Wikidata has an
explicit "unknown value"; empty means no value. About a third of holder rows have
no `start`.

## Families (`families/`)

Fetched 2026-11-22 by `tools/history/rulers/families.py` (on a Mac: the Query Service refuses the cloud) for the
succession of the game (`src/sim/systems/heirs.ts`). It starts from the 3,138 Wikidata persons of
`public/data/rulers_1291.json` and walks father (P22), mother (P25) and child (P40), both ways, up to 4 steps; spouses
(P26) are recorded but not walked. A person born or dead outside 1100–1848 is dropped (1,121), as are items that are
not humans (98). 3,134 of the 3,138 start persons are found.

`families/persons.csv`: `qid`, `label`, `sex` (`m`, `f` or empty), `birth`, `death` (the most precise date Wikidata
gives, the earliest of equals; precision day, month or year is kept as `YYYY-MM-DD`, `YYYY-MM` or `YYYY`, coarser is
dropped), `father`, `mother`, `spouses` (QIDs, `|`-separated if several), `family`, `familyLabel` (P53), `hop` (the
steps from the nearest person of the chronicle). Unlike the files above, the dates here keep their precision.
