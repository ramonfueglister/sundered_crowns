# Vasserot cadastre of Paris (1810–1836)

Streets and building blocks of Paris from the Vasserot cadastre (*Atlas
municipal des vingt quartiers de Paris*, 1810–1836), vectorised by the ALPAGE
project.

| File | Content | Source (Stanford EarthWorks) |
|---|---|---|
| `VASSEROT_VOIES.wgs84.geojson.gz` | Streets (voies) | [db591kz1574](https://earthworks.stanford.edu/catalog/stanford-db591kz1574) |
| `Vasserot_Ilots.wgs84.geojson.gz` | Building blocks (îlots) | [bz020fp6123](https://earthworks.stanford.edu/catalog/stanford-bz020fp6123) |

- **Source:** ALPAGE (AnaLyse diachronique de l'espace urbain PArisien:
  approche GEomatique), distributed via Stanford EarthWorks.
- **Licence:** Open Database License (ODbL) 1.0.
- **Processing:** converted from EPSG:27561 (NTF Paris / Lambert Nord France)
  to EPSG:4326 (WGS 84) with `ogr2ogr`, then compressed with `gzip -9`.

Decompress with `gunzip -k <file>.gz`.
