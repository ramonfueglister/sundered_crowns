# Gassen und Markt

**Status:** Entwurf · **Bereich:** Siedlung · **Stand:** 2026-11-19

> Jede Stadt hat einen Markt und Gassen, die zu den Parzellen ihrer Familien wachsen. Die Gassen stehen mit Lage, Art und Breite im Grundbuch der Welt.

Ramon hat den Vorschlag am 18. November 2026 angenommen. Gebaut in Zustand 33. Am 19. November hat Ramon «Alte Kataster, Stadt für Stadt» gewählt und mit «ja» bestätigt, dass alle Städte nach dem mittelalterlichen Paris eingestellt werden.

## Das Feature

Bisher lagen die Parzellen einer Stadt in einem Raster aus gleichen Blöcken, ein Platzhalter. Jetzt wächst jede Stadt wie eine gewachsene mittelalterliche Stadt: Vom Markt laufen Strassen hinaus, dorthin, wo die Wege der Welt die Stadt verlassen, und von ihnen wachsen Gassen zu den Familien, die sich ansiedeln. Das Modell stammt aus der Forschung zu Strassennetzen (Barthelemy und Flammini 2008) und ist am mittelalterlichen Paris geprüft: am Anteil der Sackgassen, Einmündungen und Kreuzungen im Vasserot-Kataster innerhalb der Mauer von Philippe Auguste, und an der Grösse der Blöcke (Dresden). Paris selbst legt die Hauptstrassen seines echten Plans an.

Nicht dabei: echte Pläne für andere Städte als Paris (Venedig ist der nächste offene Kataster), Brücken, Mauern und Tore, das Wachsen der Stadt, während die Welt läuft.

## Im Spiel

Jede Parzelle liegt an einer Gasse und zeigt mit der schmalen Seite zu ihr, nach Norden, Osten, Süden oder Westen. Die 3D-Welt stellt die Häuser auf diese Parzellen und pflastert die Gassen und den Markt. Die Weiler liegen neben den Strassen hinaus, nie auf ihnen. Der Weltserver gibt die Gassen und den Markt jeder Stadt aus, die Datei des Grundbuchs für die 3D-Welt enthält sie auch.

## Das Modell

1. **Wege.** Für jede Stadt liest die Simulation aus der Wegkarte von 1291, in welche Richtungen Wege die Stadt verlassen und ob es Pfade, Strassen oder Fernstrassen sind. 538 der 558 Städte haben einen bis fünf Wege, 20 keinen.
2. **Markt.** Ein quadratischer Platz, so tief wie eine Parzelle, mit einer Gasse rundum. In der Stadtmitte steht die Kirche; der Markt liegt auf dem nächsten freien Grund daneben.
3. **Strassen hinaus.** Vom Markt läuft entlang jedes Wegs eine Strasse hinaus, bis Wasser oder Fels sie aufhält. Eine Stadt mit einem oder keinem Weg ist eine einzige Strasse durch die Stadt.
4. **Wo die Familien wohnen wollen.** Jede Familie sucht sich einen Platz. Nahe am Markt ist es dichter, nach aussen nimmt die Dichte ab:

   P(r) ∝ e^(−r / r_c)

   Das ist die Dichte, die Clark 1951 in Städten gemessen hat. Sie entsteht, wenn Haushalte den Weg zum Markt gegen die Miete abwägen, die mit der Dichte steigt (Barthelemy und Flammini 2009). Die Familie mit dem nächsten Platz kommt zuerst.
5. **Gassen wachsen.** Führt keine Gasse nah am Platz einer Familie vorbei, wächst die nächste Gasse dorthin, Meter für Meter in die Richtung, die den Weg am meisten verkürzt. Sie biegt höchstens einmal im rechten Winkel ab. Trifft eine neue Gasse auf eine andere, endet sie dort; würde sie blind enden, läuft sie bis zur nächsten Gasse weiter, wenn eine nahe genug ist. So entstehen Schleifen statt Sackgassen. Haben alle Familien ihre Parzelle, läuft jede übrige Sackgasse ebenso weiter, wo keine Parzelle im Weg steht.
6. **Parzellen.** Jede Familie bekommt die Parzelle, die ihrem Platz am nächsten an einer Gasse liegt, mit ihrem Haus auf Baugrund und auf keiner anderen Parzelle. Sind die Gassen voll, wächst eine neue Gasse ins freie Land.
7. **Weiter hinaus.** Haben nicht alle Familien Platz, ziehen sie weiter hinaus, und die Stadt wird neu angelegt.

Jede Parzelle behält ihre Fläche aus [Jede Familie hat eine Parzelle](parzellen.md).

## Echte Pläne: Paris

Der Plan gibt die Form, nicht die Grösse: wo der Markt liegt und wie die Hauptstrassen laufen.

1. **Der alte Plan.** Die Gassen des Vasserot-Katasters (1810–1836) innerhalb der Mauer von Philippe Auguste (1190–1215). Der Strassenplan überdauert die Häuser (Conzen 1960), darum zeigt der Kataster von 1810 die Gassen der ummauerten Stadt.
2. **Die Hauptstrassen.** Die Gassen, über die am meisten kürzeste Wege zwischen allen Kreuzungen laufen (Betweenness, Porta und andere 2006), ganz und die meistbegangenen zuerst, bis 3'500 m.
3. **Form statt Grösse.** Alle Längen im Radius der ummauerten Stadt (902 m), Mitte vor Notre-Dame, wo die Welt die Kirche hinstellt. Der Markt: die Rue du Marché aux Poirées bei den Halles. Jede Strasse wird vereinfacht und in Stücke von Ost nach West und Nord nach Süd gelegt.
4. **In der Welt.** Der Plan wird so weit angelegt wie die doppelte Ausdehnung der dicht gepackten Stadt, der Markt dort, die Hauptstrassen als Strassen, wo der Boden es zulässt. Von ihnen wachsen die Gassen wie in jeder Stadt.

Paris in der Welt: 161 Gassenstücke, 2'814 m, Markt 231 m nördlich der Mitte. Sackgassen, Einmündungen und Kreuzungen 0,09 / 0,80 / 0,11, im Kataster 0,10 / 0,78 / 0,12.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Breite der Gassen | 6,6 bis 21,1 m, im Mittel 9,3 m | so breit wie die Gassen des bisherigen Rasters, nach dem Anteil der Parzellen in Grenade-sur-Garonne (Boerefijn 2000) |
| Markt | eine Parzelle tief | Platzhalter, kein Mass gelesen |
| Dichte r_c | halber Radius der dicht gepackten Stadt | so eingestellt, dass die Blöcke so verteilt sind wie in Dresden (Lämmer und andere 2006) |
| Schleifen | bis 5 Parzellentiefen | so eingestellt, dass der Anteil der Sackgassen dem des mittelalterlichen Paris nahe kommt |
| Kreuzungen | bis 2 Parzellenbreiten Umweg | so eingestellt, dass der Anteil der Kreuzungen dem des mittelalterlichen Paris nahe kommt |
| Hauptstrassen von Paris | 3'500 m | so eingestellt, dass Paris in der Welt so verzweigt ist wie im Kataster |

## Historische Prüfung

Der Vasserot-Kataster zeigt die Gassen von Paris innerhalb der Mauer von Philippe Auguste: 256 ha, 62 km Gassen. Lämmer und andere (2006) haben die Blöcke von Dresden vermessen: Je grösser ein Block, desto seltener, mit dem Exponenten 1,9. Bis zum 19. November war das Ziel die heutigen Städte (Barthelemy und Boeing 2025: 0,18 / 0,62 / 0,19).

| | Sackgassen | Einmündungen | Kreuzungen | Exponent der Blöcke |
|---|---|---|---|---|
| Paris im Kataster | 0,10 | 0,78 | 0,12 | 1,9 (Dresden) |
| Städte der Welt mit 20 und mehr Gassen | 0,13 | 0,77 | 0,11 | 1,88 |
| vorher, ohne Paris als Ziel | 0,26 | 0,57 | 0,17 | 1,87 |

Kleine Städte sind eine oder zwei Strassen mit ihren Enden; über alle Städte sind es darum 0,32 Sackgassen.

| Stadt | Familien in der Stadt | Wege | Gassen | Länge | Breite | Markt von der Mitte |
|---|---|---|---|---|---|---|
| Limoges | 1 | 3 | 7 | 497 m | 21,1 m | 82 m |
| Bayonne | 7 | 2 | 6 | 252 m | 11,0 m | 48 m |
| Zürich | 7 | 3 | 7 | 395 m | 10,9 m | 39 m |
| Venedig | 48 | 1 | 35 | 1'086 m | 7,4 m | ohne Baugrund angelegt |
| Paris | 102 | echter Plan | 161 | 2'814 m | 9,2 m | 231 m (Halles) |
| Kairo | 148 | 2 | 60 | 1'854 m | 7,4 m | 34 m |

Tests prüfen: Jede Parzelle liegt an einer Gasse, keine auf einer anderen, der Anteil der Sackgassen, Einmündungen und Kreuzungen liegt höchstens 0,05 neben dem des mittelalterlichen Paris, auch für Paris selbst, und der Exponent der Blöcke höchstens 0,15 neben 1,9.

## Massstab 1 : 100

Die Stadt der Welt hat ein Hundertstel des Bodens der echten Stadt, die Häuser und Gassen sind echt gross. Darum hat Paris 57 Gassen und nicht Tausende. Ein echter Plan kann nur die Form geben, wo Markt und Hauptstrassen liegen, nicht die Grösse.

## Grenzen

- Alle Gassen laufen von Ost nach West oder von Nord nach Süd und biegen im rechten Winkel ab, weil die Welt aus Blöcken gebaut ist und ein Haus gerade zu ihnen steht.
- Alle Gassen einer Stadt sind gleich breit, eine Fernstrasse so breit wie eine Gasse. Die Breite folgt der Parzelle: Limoges mit einer einzigen grossen Parzelle hat eine 21 m breite Gasse.
- Es gibt noch keine Brücken. Eine Stadt am Fluss wächst auf der Seite ihres Markts. Venedig (Inseln) und Hormuz (eine zu kleine Insel) haben auf ihrem Baugrund keinen Platz und sind ohne Rücksicht auf ihn angelegt.
- Ohne Quelle: der Markt neben der Kirche und seine Grösse, wo eine Familie wohnen will, welche Familie zuerst kommt (nach Nummer).
- Nur Paris hat einen echten Plan. Die Seine der Welt liegt nicht genau wie die echte, darum enden manche Hauptstrassen an ihr.
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
- Vasserot-Kataster (1810–1836), ALPAGE, über Stanford EarthWorks, ODbL 1.0
- Noizet und Lallau (2013): die Mauern von Paris, ALPAGE, ODbL 1.0
- Porta, Crucitti und Latora (2006): The network analysis of urban streets: a primal approach. Environment and Planning B 33, 705–725
- Conzen (1960): Alnwick, Northumberland: a study in town-plan analysis. Institute of British Geographers 27
