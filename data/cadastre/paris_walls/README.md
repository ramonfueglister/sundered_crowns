# Walls of Paris (308–1790)

The successive enclosures (*enceintes*) of Paris as polygons, vectorised by the
ALPAGE project: "Ancient, Medieval, and Modern Walls, Paris, 308-1970".

| File | Content | Source (Stanford EarthWorks) |
|---|---|---|
| `walls.wgs84.geojson.gz` | 289 polygons of six enclosures | [tm682hx3471](https://earthworks.stanford.edu/catalog/stanford-tm682hx3471) |

| `LIBELLE` | Features | Built (`DD1`–`DF2`) | Author |
|---|---|---|---|
| romaine | 2 | 308–360 | Davide Gherdevich |
| carolingienne | 1 | 850–1000 | Hélène Noizet |
| Philippe-Auguste | 2 | 1190–1215 | Hélène Noizet |
| Charles-V | 10 | 1356–1383 | Nicolas Faucherre, Anne-Laure Bethe |
| Fossés jaunes | 2 | 1523/1563–1566/1647 | Davide Gherdevich |
| Ferm. généraux | 272 | 1784–1790 | Paul Rouet |

Attributes: `ROWID`, `DD1`/`DD2` (earliest/latest start date), `DF1`/`DF2`
(earliest/latest end date), `Num_CNAU`, `DESIGN`, `LIBELLE`, `NOM_COMP`,
`Auteur`, `Date_Idsig`, `bibliograp`, `Shape_Area` (m², source projection).
The layer has no feature later than 1790 (no Thiers wall), despite the
"1970" in its title.

- **Source:** ALPAGE (AnaLyse diachronique de l'espace urbain PArisien:
  approche GEomatique), distributed via Stanford EarthWorks / Stanford Digital
  Repository, druid `tm682hx3471` (https://purl.stanford.edu/tm682hx3471).
- **Licence:** Open Data Commons Open Database License (ODbL) 1.0
  (https://opendatacommons.org/licenses/odbl/1-0/). Copyright resides with the
  originator.
- **Processing:** the shapefile's `.prj` is NTF Lambert I Nord with the Paris
  meridian given in Greenwich degrees (same as Vasserot); converted with
  `ogr2ogr -s_srs EPSG:27561 -t_srs EPSG:4326 -lco RFC7946=YES
  -lco COORDINATE_PRECISION=7`, then compressed with `gzip -9`.

Decompress with `gunzip -k walls.wgs84.geojson.gz`.
