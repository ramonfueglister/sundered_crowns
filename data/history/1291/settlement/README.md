# Settled area of medieval towns

`cesaretti_2016_s1.csv`: dataset S1 of Cesaretti, Lobo, Bettencourt, Ortman & Smith (2016), "Population-Area
Relationship for Medieval European Cities", PLOS ONE 11(10): e0162678, https://doi.org/10.1371/journal.pone.0162678
(CC BY 4.0). 173 towns of England, France and Belgium, northern Italy and Germany around 1300: inhabitants (`Pop`),
settled area in hectares (`Area`: built-up ground including suburbs outside the walls and open land inside them),
a point, and the urban system. Unchanged except for the encoding (Windows-1252 to UTF-8).

`tools/history/1291/settled_area.py` fits the line through it and writes `src/sim/content/settled_area_1300.json`
(settlement feature 1, docs/SETTLEMENT_DESIGN.md).

Known flaw: Bruges (45,000 inhabitants) carries the coordinates of Bruges in the Gironde.

# Bridges of 1291

`bridges_1291.csv`: the bridges of the towns known from the sources (settlement feature 7, docs/SETTLEMENT_DESIGN.md),
gathered on 21 November 2026, one row each with its source. `what` is `named` for a bridge known by name (its town,
its name, `stone` yes where the source says it was of stone in 1291, `houses` yes where houses stood on it) or `ferry`
for a town whose great river was crossed by ferry or on boats in 1291. `tools/settlement/bridges.py` writes
`src/sim/content/bridges_1291.json` from it.
