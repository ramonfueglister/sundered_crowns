# Stadtmauern und Tore

**Status:** Entwurf · **Bereich:** Siedlung · **Stand:** 2026-11-21

> Jede Stadt hat ihre Mauer: einen Ring um die Stadt, offen, wo Wasser ihn ersetzt, mit einem Tor, wo ein Weg der Welt hinausführt. Wo die Quellen wissen, wie viel der Stadt 1291 in der Mauer lag, hält der Ring diesen Teil, und der Rest ist Vorstadt.

Ramon hat den Vorschlag am 21. November 2026 angenommen («ja alle»). Gebaut in Zustand 41.

## Das Feature

Bisher stellte die 3D-Welt um jede grössere Stadt ein Quadrat, das sie selbst erfand. Jetzt legt die Simulation beim Gründen der Welt die Mauer jeder Stadt ins Grundbuch, Stück für Stück mit ihren Toren und Pforten, und die 3D-Welt zeichnet nur noch diese, in allen Zoomstufen gleich.

## Im Spiel

Um jede Stadt läuft eine Mauer mit Türmen, eine Gasse breit von den äussersten Häusern. Wo ein Fluss oder das Meer an die Stadt stösst, ist sie offen. Wo eine Strasse der Welt die Stadt verlässt, steht ein Torbau, wo eine Gasse hinausführt, eine Pforte. Paris hat die Mauer Philippe Augustes mit 17 Toren, London, Bristol und Avignon haben Vorstädte vor der Mauer. Venedig hat keine Mauer.

## Das Modell

1. **Jede Stadt ist ummauert.** «Even the smallest of towns had walls» (Pounds 2005, S. 29). Nicht Venedig, wo die Lagune die Mauer ersetzte (Gelichi 2016).
2. **Was der Ring hält.** Die meisten Städte füllten ihren Ring (Pounds 2005, S. 27–29): Er hält alle Parzellen und die Bischofskirche. Für 29 Städte kennen Cesaretti et al. (2016, Anhang S2) die ummauerte gegen die bebaute Fläche eines Rings, der 1291 stand. Dort hält der Ring diesen Anteil, die Parzellen nächst dem Markt, und die übrigen sind Vorstadt.
3. **Paris** hat den echten Ring aus dem Stadtplan (ALPAGE), im Massstab des Plans.
4. **Die Form.** Der Ring folgt der Stadt eine Gassenbreite ausserhalb, geglättet über Buchten von drei Gassen, und hält eine Gassenbreite Abstand von den Höfen der Weiler. Eine Stadt auf beiden Ufern hat einen Ring auf jedem.
5. **Nichts wird durchschnitten.** Eine Parzelle der Vorstadt oder ein Wahrzeichen, das der Ring schneiden würde, kommt hinein, wenn seine Mitte drin liegt, sonst biegt der Ring darum herum.
6. **Offen am Wasser**, wo Wasser oder Fels unter dem Ring liegt (Boston: «bounded by walls and river»).
7. **Tore**, wo eine Strasse eines Wegs der Welt den Ring kreuzt, Pforten, wo eine Gasse ihn kreuzt (Tore für Einlass und Zoll, Pounds 2005, S. 50).

## Ergebnis 1291

556 Städte ummauert, 1'196 Tore und 1'053 Pforten, im Median 2 Tore je Stadt. Kein Ring schneidet einen Hof, ausser in Paris keiner eine Parzelle oder ein Wahrzeichen. Der Ring hält meist mehr als den Anteil der Quelle (Bristol 0,60 statt 0,42), weil er keine Vorstadt-Parzelle durchschneidet.

## Eigene Regeln

Abstand, Glättung und Torbreite des Rings, und die Masse der gezeichneten Mauer (4 m hoch, Türme alle 50 m) sind eigene Regeln: Die Quellen sagen, wo einige Ringe liefen, nicht wie nah die Häuser standen. Einzelheiten in [SETTLEMENT_DESIGN.md](../../SETTLEMENT_DESIGN.md#feature-6-the-walls-and-gates-of-every-town).
