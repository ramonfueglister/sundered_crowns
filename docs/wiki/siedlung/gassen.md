# Gassen und Markt

**Status:** Entwurf · **Bereich:** Siedlung · **Stand:** 2026-11-18

> Jede Stadt hat einen Markt und Gassen, die zu den Parzellen ihrer Familien wachsen. Die Gassen stehen mit Lage, Art und Breite im Grundbuch der Welt.

Ramon hat den Vorschlag am 18. November 2026 angenommen. Gebaut in Zustand 30.

## Das Feature

Bisher lagen die Parzellen einer Stadt in einem Raster aus gleichen Blöcken, ein Platzhalter. Jetzt wächst jede Stadt wie eine gewachsene mittelalterliche Stadt: Vom Markt laufen Strassen hinaus, dorthin, wo die Wege der Welt die Stadt verlassen, und von ihnen wachsen Gassen zu den Familien, die sich ansiedeln. Das Modell stammt aus der Forschung zu Strassennetzen (Barthelemy und Flammini 2008) und ist an echten Städten geprüft: am Anteil der Sackgassen, Einmündungen und Kreuzungen und an der Grösse der Blöcke.

Nicht dabei: echte Stadtpläne für die grossen Städte (die Kartendaten von OpenStreetMap sind aus der Cloud nicht erreichbar), Brücken, Mauern und Tore, das Wachsen der Stadt, während die Welt läuft.

## Im Spiel

Jede Parzelle liegt an einer Gasse und zeigt mit der schmalen Seite zu ihr, nach Norden, Osten, Süden oder Westen. Die 3D-Welt stellt die Häuser auf diese Parzellen; die Gassen selbst zeichnet sie noch nicht. Der Weltserver gibt die Gassen und den Markt jeder Stadt aus, die Datei des Grundbuchs für die 3D-Welt enthält sie auch.

## Das Modell

1. **Wege.** Für jede Stadt liest die Simulation aus der Wegkarte von 1291, in welche Richtungen Wege die Stadt verlassen und ob es Pfade, Strassen oder Fernstrassen sind. 538 der 558 Städte haben einen bis fünf Wege, 20 keinen.
2. **Markt.** Ein quadratischer Platz, so tief wie eine Parzelle, mit einer Gasse rundum. In der Stadtmitte steht die Kirche; der Markt liegt auf dem nächsten freien Grund daneben.
3. **Strassen hinaus.** Vom Markt läuft entlang jedes Wegs eine Strasse hinaus, bis Wasser oder Fels sie aufhält. Eine Stadt mit einem oder keinem Weg ist eine einzige Strasse durch die Stadt.
4. **Wo die Familien wohnen wollen.** Jede Familie sucht sich einen Platz. Nahe am Markt ist es dichter, nach aussen nimmt die Dichte ab:

   P(r) ∝ e^(−r / r_c)

   Das ist die Dichte, die Clark 1951 in Städten gemessen hat. Sie entsteht, wenn Haushalte den Weg zum Markt gegen die Miete abwägen, die mit der Dichte steigt (Barthelemy und Flammini 2009). Die Familie mit dem nächsten Platz kommt zuerst.
5. **Gassen wachsen.** Führt keine Gasse nah am Platz einer Familie vorbei, wächst die nächste Gasse dorthin, Meter für Meter in die Richtung, die den Weg am meisten verkürzt. Sie biegt höchstens einmal im rechten Winkel ab. Trifft eine neue Gasse auf eine andere, endet sie dort; würde sie blind enden, läuft sie bis zur nächsten Gasse weiter, wenn eine nahe genug ist. So entstehen Schleifen statt Sackgassen.
6. **Parzellen.** Jede Familie bekommt die Parzelle, die ihrem Platz am nächsten an einer Gasse liegt, mit ihrem Haus auf Baugrund und auf keiner anderen Parzelle. Sind die Gassen voll, wächst eine neue Gasse ins freie Land.
7. **Weiter hinaus.** Haben nicht alle Familien Platz, ziehen sie weiter hinaus, und die Stadt wird neu angelegt.

Jede Parzelle behält ihre Fläche aus [Jede Familie hat eine Parzelle](parzellen.md).

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Breite der Gassen | 6,6 bis 21,1 m, im Mittel 9,3 m | so breit wie die Gassen des bisherigen Rasters, nach dem Anteil der Parzellen in Grenade-sur-Garonne (Boerefijn 2000) |
| Markt | eine Parzelle tief | Platzhalter, kein Mass gelesen |
| Dichte r_c | halber Radius der dicht gepackten Stadt | so eingestellt, dass die Blöcke so verteilt sind wie in Dresden (Lämmer und andere 2006) |
| Schleifen | bis 5 Parzellentiefen | so eingestellt, dass der Anteil der Sackgassen dem echter Städte nahe kommt |
| Kreuzungen | bis 2 Parzellenbreiten Umweg | so eingestellt, dass der Anteil der Kreuzungen dem echter Städte nahe kommt |

## Historische Prüfung

Barthelemy und Boeing (2025) haben die Strassennetze von 8'910 Städten aus OpenStreetMap ausgezählt. Lämmer und andere (2006) haben die Blöcke von Dresden vermessen: Je grösser ein Block, desto seltener, mit dem Exponenten 1,9.

| | Sackgassen | Einmündungen | Kreuzungen | Exponent der Blöcke |
|---|---|---|---|---|
| Echte Städte | 0,18 | 0,62 | 0,19 | 1,9 |
| Städte der Welt mit 20 und mehr Gassen | 0,26 | 0,57 | 0,17 | 1,87 |

Die Welt hat mehr Sackgassen als die heutigen Städte. Für mittelalterliche Strassennetze ist kein Mass gelesen. Kleine Städte sind eine oder zwei Strassen mit ihren Enden; über alle Städte sind es darum 0,41 Sackgassen.

| Stadt | Familien in der Stadt | Wege | Gassen | Länge | Breite | Markt von der Mitte |
|---|---|---|---|---|---|---|
| Limoges | 1 | 3 | 7 | 497 m | 21,1 m | 82 m |
| Bayonne | 7 | 2 | 6 | 252 m | 11,0 m | 48 m |
| Zürich | 7 | 3 | 7 | 395 m | 10,9 m | 39 m |
| Venedig | 48 | 1 | 35 | 1'086 m | 7,4 m | ohne Baugrund angelegt |
| Paris | 102 | 3 | 57 | 1'441 m | 9,2 m | 0 m |
| Kairo | 148 | 2 | 60 | 1'854 m | 7,4 m | 34 m |

Tests prüfen: Jede Parzelle liegt an einer Gasse, keine auf einer anderen, der Anteil der Sackgassen, Einmündungen und Kreuzungen liegt höchstens 0,1 neben dem echter Städte und der Exponent der Blöcke höchstens 0,15 neben 1,9.

## Massstab 1 : 100

Die Stadt der Welt hat ein Hundertstel des Bodens der echten Stadt, die Häuser und Gassen sind echt gross. Darum hat Paris 57 Gassen und nicht Tausende. Ein echter Plan kann nur die Form geben, wo Markt und Hauptstrassen liegen, nicht die Grösse.

## Grenzen

- Alle Gassen laufen von Ost nach West oder von Nord nach Süd und biegen im rechten Winkel ab, weil die Welt aus Blöcken gebaut ist und ein Haus gerade zu ihnen steht.
- Alle Gassen einer Stadt sind gleich breit, eine Fernstrasse so breit wie eine Gasse. Die Breite folgt der Parzelle: Limoges mit einer einzigen grossen Parzelle hat eine 21 m breite Gasse.
- Es gibt noch keine Brücken. Eine Stadt am Fluss wächst auf der Seite ihres Markts. Venedig (Inseln) und Hormuz (eine zu kleine Insel) haben auf ihrem Baugrund keinen Platz und sind ohne Rücksicht auf ihn angelegt.
- Ohne Quelle: der Markt neben der Kirche und seine Grösse, wo eine Familie wohnen will, welche Familie zuerst kommt (nach Nummer).
- Echte Pläne für die grossen Städte fehlen, bis die Cloud OpenStreetMap erreicht.
- Solange die Welt läuft, wächst keine Gasse.

## Quellen

- Barthelemy und Flammini (2008): Modeling urban street patterns. Physical Review Letters 100, 138702. https://arxiv.org/abs/0708.4360
- Barthelemy und Flammini (2009): Co-evolution of density and topology in a simple model of city formation. https://arxiv.org/abs/0810.1376
- Clark (1951): Urban population densities. Journal of the Royal Statistical Society A 114(4), 490–496 (nach Barthelemy und Flammini)
- Emilien und andere (2012): Procedural generation of villages on arbitrary terrains. The Visual Computer 28, 809–818. https://doi.org/10.1007/s00371-012-0699-7
- Strano und andere (2012): Elementary processes governing the evolution of road networks. Scientific Reports 2, 296. https://arxiv.org/abs/1203.0300
- Barthelemy und Boeing (2025): A universal model of urban street networks. https://arxiv.org/abs/2509.21931
- Lämmer, Gehlsen und Helbing (2006): Scaling laws in the spatial structure of urban road networks. Physica A 363, 89–95 (nach Barthelemy und Flammini 2008)
- Pounds (2005): The Medieval City, S. 12, 23–26
