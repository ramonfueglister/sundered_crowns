# The lagoon round Venice's land register

From OpenStreetMap (data © OpenStreetMap contributors, ODbL), fetched 21 November 2026 through the Overpass API for the
box 45.36–45.50 N, 12.24–12.45 E:

- `islands.geojson`: the ways and relations tagged `place=island` or `place=islet`, outer rings joined, islands under
  2 ha dropped, simplified by 0.00015 degrees.
- `shore_land.geojson`: the mainland shore of the lagoon (Mestre, Marghera, Campalto, Tessera): the land left of the
  `natural=coastline` ways, polygonized with the box, less the lagoon (relation 3049430, Laguna di Venezia). The strip
  of the Lido and Cavallino was left out (polygonized against the box it took in the Adriatic); the Lido is an island.

tools/settlement/cadastre_venice.py draws them round the register, less the land made after 1808 (`MADE`).
