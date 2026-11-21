# Venice 1808 land register — parcel geometry

Vectorised parcels of the Napoleonic cadastre of Venice (1808, the "Sommarioni").

- **Source:** "Venice 1808 Land Registers", version 1.1 (2026-06-16), by Isabella Di Lenardo, Cédric Viaccoz, Paul Guhennec, Carlo Musso and Frédéric Kaplan (EPFL DHLAB)
- **DOI:** [10.5281/zenodo.20715172](https://doi.org/10.5281/zenodo.20715172)
- **Licence:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit the authors when using or redistributing this data.
- **Data paper:** Heritage 8(2):75, [doi:10.3390/heritage8020075](https://doi.org/10.3390/heritage8020075)

`venice_1808_landregister_geometries.geojson.gz` is the record's `venice_1808_landregister_geometries.geojson`, unchanged except for gzip -9 compression (12.9 MB uncompressed).
The textual register entries, owners and aggregated data are in the Zenodo record and are not included here.

## Format

GeoJSON FeatureCollection, CRS84 (WGS84 lon/lat), bbox 12.3065, 45.4242 to 12.3698, 45.4522.
24,430 `Polygon` features; 574 polygons have holes.

## Properties

| field | meaning |
|---|---|
| `id` | `way/N` or `relation/N`; several polygons may share one id (e.g. a building and its courtyard) |
| `geometry_type` | `building`, `courtyard`, `sottoportico`, `street`, `water` (2 features null). The upstream README calls this `parcel_type`. |
| `parcel_number` | map number ("Numero della Mappa"), nullable |
| `geometry_id` | join key to the register's textual entries; null for objects with no register entry (mostly streets and canals) |
| `parish_standardised` | one of 73 parishes, derived from the boundaries in the 1740 Catastico; nullable |
| `area` | area in m² |

## geometry_type counts

| value | features | area |
|---|---|---|
| building | 15,246 | 441.9 ha |
| courtyard | 7,887 | 224.2 ha |
| sottoportico | 704 | 3.7 ha |
| street | 327 | 142.1 ha |
| water | 264 | 2,254.7 ha |

Streets and water are not split into calli, campi or canals and carry no names.
Most of the street area is one connected polygon of about 79 ha; most of the water is one lagoon polygon of about 2,190 ha.
