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
