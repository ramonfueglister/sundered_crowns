# Borders from real data

## cliopatria_places.json

Which place of the map lies in which Cliopatria polity, row by row (1291–1848, world frame).
Written by `tools/history/borders/cliopatria_places.py`.

**Source:** Cliopatria v0.2.1, Seshat Global History Databank.
Bennett, J. S. et al. (2025). *Cliopatria – A geospatial database of world-wide political entities from 3400 BCE to 2024 CE.* Scientific Data. doi:[10.1038/s41597-025-04516-9](https://doi.org/10.1038/s41597-025-04516-9).
Release v0.2.1 (2026-10-03): <https://github.com/Seshat-Global-History-Databank/cliopatria>, Zenodo record [23128623](https://zenodo.org/records/23128623) (concept record 13363120).

**License:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution to the authors and the source is required.
Changes: only polities (Type POLITY) overlapping 1291–1848 are kept, and the polygons are replaced by the ids of the map places whose centre lies inside them.

**Retrieved:** 2026-11-16, `cliopatria.geojson.zip` from the repository at tag v0.2.1
(SHA-256 `e10a4e429fca708788ff9e7572a95fce801fae55852d217cffabc1c59cd4eed4`).

**Input file:** `cliopatria_polities_only_v021.geojson` (172'854'269 bytes),
SHA-256 `fc6f0d1e4cc42f45da83522b3696db6f2cc85ec0d12259a85c89b31347b8fc0a`.

**Output of the run:**

```
3864 rows, 399 polities, 1073586 place-rows, 12538 places in the frame; skipped {'type': 385, 'years': 7916, 'frame': 1632}
```

## wikipedia_timeline.json

The dated events of the English Wikipedia timelines of geopolitical changes, 1291–1848, one row per table row.
Written by `tools/history/borders/wp_timeline.py` from the MediaWiki API (the raw wikitext stays local).

**Source:** English Wikipedia, at fixed revisions:
- "Timeline of geopolitical changes (before 1500)", revision [1382963230](https://en.wikipedia.org/w/index.php?oldid=1382963230) (2026-10-31)
- "Timeline of geopolitical changes (1500–1899)", revision [1383299739](https://en.wikipedia.org/w/index.php?oldid=1383299739) (2026-11-02)

**License:** [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), authors: the Wikipedia contributors (see the page histories). This file is an adaptation and stays under CC BY-SA 4.0.
Changes: the table rows from 1291 to 1848 are turned into plain text; each row gets the linked article titles with their Wikidata item and coordinates (MediaWiki API, pageprops and coordinates, after redirects) and a flag `in_frame`.

**Retrieved:** 2026-11-16.

**Fields per row:** page, revid, year, date (YYYY, YYYY-MM or YYYY-MM-DD as the source gives it; null when the year is approximate or a range, e.g. "c. 1430"), year_text and date_text (original text), text, links (title, target after a redirect, qid, lon, lat), in_frame (a linked article has coordinates inside the world frame; null when no linked article has any — a generous rule: "colonies on the coast of Angola" counts because of Portugal).

**Output of the run:**

```
876 rows (420 in frame, 298 outside, 158 unknown), dates {'year': 486, 'day': 365, 'month': 22, 'none': 3}, 2774 links, 2770 with QID (99.9%), 1442 distinct titles
```

## euratlas/euratlas_<year>_places.json and _states.tsv

Who holds each place of the map in Euratlas Periodis, for 1400, 1500, 1600, 1700 and 1800, in the format of
`data/history/1291/ref/euratlas_1300_*` (see the README there for the columns and arrays). Derived facts only: no
Euratlas images or HTML are stored in this repository.

**Source:** Euratlas Periodis (Christos Nüssli), Europe in <year>, as shown on euratlas.net: the four quarter maps
(`<year>_Northwest/Northeast/Southwest/Southeast`) and the per-entity maps. Retrieved 2026-11-16. The images stay
local; © Euratlas.

**Script:** `tools/history/borders/euratlas_places.py <year> <folder>`, the 1300 reading made into one script.
The entity frame is the same in every year (median image of 1800 vs 1300: best shift 0 px), so the 1300 fit is reused:
55 cities measured as dots on the 1300 quarter maps (62 points), 3rd-order polynomial in lon/lat, 0.74 px rms,
0.97 px leave-one-out. The control points are in the script. Per year the JSON reports under `residuals_px` how well
the quarter crops match and how far each predicted control city lies from the nearest city dot on that year's
quarter (not every 1300 city has a dot in later years). Regional maps are not used. Run on the 1300 images, the
script reproduces the committed 1300 labels for 98.7 % of the labelled places (most differences: "Small States"
against Bavaria or Guelders).

| year | entities | entities holding places | labelled places (share of entity frame) | dots near control cities, rms px (NW / NE / SW / SE) |
|---|---|---|---|---|
| 1800 | 143 | 69 | 7823 (97.6 %) | 7 of 13, 1.21 / 3 of 6, 0.94 / 16 of 20, 1.56 / 9 of 23, 2.08 |
| 1500 | 194 | 132 | 7712 (95.3 %) | 7 of 13, 0.97 / 3 of 6, 0.82 / 17 of 20, 1.52 / 12 of 23, 1.95 |
| 1700 | 196 | 92 | 7895 (98.0 %) | 6 of 13, 1.09 / 3 of 6, 0.82 / 16 of 20, 1.52 / 9 of 23, 0.88 |
| 1600 | 236 | 107 | 7780 (96.7 %) | 7 of 13, 1.18 / 3 of 6, 0.93 / 17 of 20, 1.49 / 10 of 23, 0.85 |
| 1400 | 200 | 131 | 8112 (97.2 %) | 12 of 13, 1.12 / 4 of 6, 1.1 / 17 of 20, 1.08 / 16 of 23, 1.78 |
