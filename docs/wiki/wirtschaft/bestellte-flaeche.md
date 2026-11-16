# Bestellte Fläche

**Status:** Im Spiel (freigegeben am 14.11.2026; seit dem 15.11.2026 in der laufenden Welt) · **Bereich:** Wirtschaft · **Stand:** 2026-11-14

> Ein Ort bestellt nur so viel Acker, wie seine Menschen bearbeiten können, und nie mehr als einen festen Anteil seines Landes. Die Getreideernte rechnet mit dieser Fläche statt mit dem ganzen Land des Ortes.

Das Feature ist genau so gebaut, wie es vorgeschlagen war. Alle Zahlen auf dieser Seite stammen aus dem Spielcode und stimmen mit der Vorrechnung des Vorschlags überein.

## Das Feature

Die [Getreideernte](getreideernte.md) rechnete für sich allein, als wäre jeder Hektar eines Ortes Acker. In dünn besiedelten Regionen kam die Ernte pro Kopf deshalb ein Mehrfaches zu hoch heraus. Dieses Feature bestimmt einmal im Jahr, vor der Ernte, die bestellte Fläche jedes Ortes. Die Ernte rechnet dann nur mit ihr.

Nicht dazu gehören Weide, Wald und Vieh, Bewässerung, Handel und jede Verzögerung beim Roden oder Aufgeben von Land.

## Im Spiel

Im Ortsfenster stehen unter «Getreideernte» drei neue Zeilen:

- **Bestellte Fläche**: der Acker des Ortes in Hektar und in Prozent seines Landes.
- **Lage**: «freies Land», solange die Menschen des Ortes mehr Land bestellen könnten, als sie brauchen; «an der Landgrenze», sobald mehr Menschen kein zusätzliches Land mehr bekommen; «kein Land mit Ertrag», wenn der Boden des Ortes nichts hergibt.
- **Ertragskraft des bestellten Bodens**: der Mittelwert über den Acker. Er liegt über dem Mittel des ganzen Ortes, weil das beste Land zuerst bestellt wird.

Beispiele zum Start 1356: Norwich bestellt 42'087 ha (39,2 % seines Landes) und steht an der Landgrenze, die Ernte ergibt 1265 kcal pro Kopf und Tag. Krakau bestellt 35'556 ha (38,1 %), hat noch freies Land und kommt auf 2144 kcal. Kairo hat kein Land mit Ertrag.

## Das Modell

Ein Ort bestellt so viel Acker, wie seine Menschen bearbeiten können, aber nie mehr als die Landgrenze. Bestellt wird das beste Land zuerst.

$$
X_i = \min\left(c \cdot P_i,\;\; s \cdot F_i,\;\; F_i^{+}\right)
$$

| Zeichen | Bedeutung |
|---|---|
| *X* | bestellte Fläche des Ortes in Hektar: Ackerland samt Brache |
| *P* | Menschen des Ortes: seit dem 16.11.2026 seine Personen ([Weiler der Bauern](../personen/weiler-der-bauern.md)) |
| *c* | Ackerland pro Kopf, solange Land frei ist |
| *F* | Landfläche des Ortes |
| *s* | Landgrenze: der grösste Anteil der Ortsfläche, der Acker werden kann |
| *F⁺* | Land des Ortes, dessen Ertragskraft über null liegt |

Die Ernte folgt weiter der Gleichung der Getreideernte. Neu zählt darin nur die bestellte Fläche mit ihrer Ertragskraft *A*:

$$
Y_i = Z \cdot \Big(\sum_{\text{bestellt}} A \cdot x\Big)^{\alpha} \cdot L_i^{\,1-\alpha}
$$

### Was das für dich bedeutet

**Freies Land.** Solange ein Ort mehr Land hat, als seine Menschen bestellen können, wächst und schrumpft der Acker mit ihnen. Die Ernte pro Kopf hängt dann fast nur von der Bodengüte ab, nicht mehr von der Grösse des Ortes.

**An der Landgrenze.** Ist die Landgrenze erreicht, bekommen mehr Menschen kein zusätzliches Land. Die Ernte pro Kopf sinkt mit jedem weiteren Kopf.

**Nach einer Seuche.** Schrumpft die Bevölkerung, fällt zuerst das schlechteste Land brach.

### Woher die Regel kommt

Die Regel ist die Rechenweise der veröffentlichten Rekonstruktionen der Landnutzung, auf den einzelnen Ort angewandt.

| Baustein | Quelle |
|---|---|
| Ackerfläche = Fläche pro Kopf mal Bevölkerung | [Klein Goldewijk et al. 2017](https://essd.copernicus.org/articles/9/927/2017/essd-9-927-2017.pdf) (HYDE 3.2), Abschnitt 2.3.1; [Pongratz et al. 2008](https://pure.mpg.de/pubman/item/item_994221_6/component/file_1786333/gbc1508.pdf), Abs. 12 und 14: vor 1700 bleibt die Fläche pro Kopf fest |
| Höchstfläche | Klein Goldewijk et al. 2017, Gleichung 1: jede Rasterzelle hat eine Höchstfläche für Acker |
| Sättigung und «bestes Land zuerst» | [Kaplan et al. 2009](https://doi.org/10.1016/j.quascirev.2009.09.028): die Rodung sättigt mit der Bevölkerungsdichte auf dem nutzbaren Land; «the highest quality land for crops is cleared first» |

Das HYDE-Raster wird nicht direkt eingelesen. HYDE ist selbst gerechnet, mit einer eigenen Bevölkerung. Ein Raster für ein Jahr ist starr, im Spiel muss die Fläche den Menschen folgen. Und HYDE nennt für die Zeit vor 1500 selbst grosse Unsicherheit: eine Spanne von 50 % um das Jahr 850 und von 25 % um 1700 (Abschnitt 5).

## Daten und Parameter

Geeicht wird an einem Fall, England, zu zwei Zeitpunkten: 1300 auf dem Höchststand der Bevölkerung und 1380 nach der Pest.

| Grösse | Wert | Herkunft |
|---|---|---|
| *s*, Landgrenze | 39,2 % der Ortsfläche | So bestimmt, dass Englands 162 Orte bei 4,72 Mio. Menschen zusammen 11,52 Mio. acres Acker ergeben. [Broadberry et al. 2010](https://warwick.ac.uk/fac/soc/economics/research/centres/cage/manage/publications/21.2010_broadberry_complete.pdf), Tabelle 1 (Jahr 1300) und Tabelle 19 (1300/09). Die Quelle setzt die Ackerfläche von 1300 als mittelalterlichen Höchststand an (S. 5 bis 6) |
| *c*, Ackerland pro Kopf bei freiem Land | 1,76 ha (4,35 acres) | So bestimmt, dass dieselben Orte bei 2,36 Mio. Menschen zusammen 8,73 Mio. acres ergeben. Tabelle 1 (Jahr 1380) und Tabelle 19 (1380/89) |
| *Z*, Eichkonstante der Ernte | neu bestimmt | England 1300/09 mit 1242 kcal pro Kopf und Tag aus dem Ackerbau (Tabelle 19), jetzt mit der bestellten statt der ganzen Fläche |
| *α*, *L*, *A* | unverändert | [Getreideernte](getreideernte.md) |

Die beiden Werte sind nicht eingetippt: Ein Werkzeug löst sie mit den Funktionen des Spiels auf der Karte, und ein Test schlägt an, wenn die gespeicherten Werte nicht mehr aus der Karte folgen.

Direkt aus der Quelle geteilt hatte England 1300 pro Kopf 2,44 acres Acker, 1380 dann 3,70, 1420 dann 3,82 und 1450 dann 3,96. Der Wert *c* liegt mit 4,35 darüber, weil auf der Karte auch 1380 noch 57 der 162 englischen Orte an der Landgrenze stehen.

## Historische Prüfung

Geeicht sind Englands Ackerfläche 1300 und 1380 und Englands Ernte 1300. Alles andere ist ungetunt.

### England im Lauf der Zeit

Die Menschen jedes englischen Ortes sind für jedes Jahrzehnt im gleichen Verhältnis hoch- oder heruntergerechnet. Fläche in Mio. acres, Ernte in kcal pro Kopf und Tag aus dem Ackerbau, Geschichte nach Broadberry et al. 2010, Tabellen 1 und 19:

| Jahrzehnt | Menschen (Mio.) | Acker Geschichte | Acker Modell | Abweichung | Ernte Geschichte | Getreideernte allein | Abweichung | mit bestellter Fläche | Abweichung |
|---|---|---|---|---|---|---|---|---|---|
| 1270/79 | 4,40 | 11,52 | 11,28 | −2 % | 1415 | 1305 | −8 % | 1289 | −9 % |
| 1300/09 | 4,72 | 11,52 | 11,52 | geeicht | 1242 | 1242 | geeicht | 1242 | geeicht |
| 1310/19 | 4,63 | keine Angabe | 11,46 | | 1199 | 1259 | +5 % | 1255 | +5 % |
| 1380/89 | 2,36 | 8,73 | 8,73 | geeicht | 1801 | 2018 | +12 % | 1709 | −5 % |
| 1420/29 | 2,03 | 7,76 | 8,05 | +4 % | 1468 | 2242 | +53 % | 1802 | +23 % |
| 1450/59 | 1,93 | 7,64 | 7,82 | +2 % | 1512 | 2323 | +54 % | 1832 | +21 % |
| 1600/09 | 4,27 | 8,87 | 11,16 | +26 % | 1664 | 1332 | −20 % | 1309 | −21 % |
| 1691/1700 | 5,14 | 9,70 | 11,72 | +21 % | 1678 | 1170 | −30 % | 1181 | −30 % |

- **Fläche im Mittelalter.** 1270, 1420 und 1450 trifft das Modell auf −2 bis +4 %.
- **Ernte nach der Pest.** 1380 liegt sie bei −5 % statt +12 %. Im 15. Jahrhundert bleibt sie 21 bis 23 % zu hoch. Die Quelle zeigt dort weniger Ernte pro Kopf als 1380, obwohl pro Kopf mehr Acker da war. Das bildet die Regel nicht ab.
- **Nach 1600.** Die Fläche ist 21 bis 26 % zu gross, die Ernte 21 bis 30 % zu klein. Englands Landwirtschaft wurde produktiver, im Modell bleibt die Technik fest.

### England auf der Karte, Start 1356

Mit 2,58 Mio. Menschen bestellen Englands Orte 9,15 Mio. acres, 61 von 162 Orten stehen an der Landgrenze, die Ernte ergibt 1653 kcal pro Kopf und Tag. Die Quelle nennt für 1380/89 bei 2,36 Mio. Menschen 8,73 Mio. acres und 1801 kcal. Die Getreideernte allein kam hier auf 1856 kcal.

### Regionen der Karte, Start 1356

Ernte in kcal pro Kopf und Tag. Für die Regionen ausserhalb Englands gibt es bisher keine dokumentierte Vergleichszahl der Ernte.

| Region | Menschen (Mio.) | Acker (Mio. ha) | Anteil am Land | ha pro Kopf | Menschen an der Landgrenze | Getreideernte allein | mit bestellter Fläche |
|---|---|---|---|---|---|---|---|
| Arabien | 1,61 | 0,21 | 0,1 % | 0,13 | 93 % | 148 | 47 |
| Ägypten und Nubien | 4,98 | 3,47 | 0,9 % | 0,70 | 64 % | 3791 | 699 |
| Persien | 5,25 | 8,14 | 2,2 % | 1,55 | 13 % | 4880 | 1071 |
| Atlantikinseln | 0,03 | 0,03 | 1,7 % | 1,09 | 38 % | 4433 | 1088 |
| Mesopotamien | 1,28 | 2,05 | 3,5 % | 1,60 | 13 % | 3761 | 1161 |
| Maghreb | 3,62 | 5,22 | 1,2 % | 1,44 | 23 % | 3038 | 1262 |
| Levante | 0,96 | 1,45 | 4,9 % | 1,51 | 20 % | 3129 | 1355 |
| Niederlande | 2,65 | 2,76 | 30,7 % | 1,04 | 87 % | 1493 | 1385 |
| Steppe | 1,74 | 3,04 | 0,9 % | 1,75 | 3 % | 14'878 | 1463 |
| Skandinavien | 1,84 | 2,96 | 1,1 % | 1,61 | 10 % | 4241 | 1559 |
| Italien | 5,62 | 7,23 | 23,6 % | 1,29 | 55 % | 1905 | 1584 |
| Britische Inseln | 3,48 | 5,26 | 16,2 % | 1,51 | 44 % | 2252 | 1617 |
| Griechenland | 1,31 | 1,87 | 11,2 % | 1,43 | 31 % | 3484 | 1681 |
| Sahel | 8,20 | 14,02 | 2,2 % | 1,71 | 3 % | 6427 | 1699 |
| Frankreich | 10,80 | 14,95 | 30,7 % | 1,39 | 58 % | 1855 | 1722 |
| Iberien | 4,40 | 7,36 | 12,3 % | 1,67 | 9 % | 3703 | 1850 |
| Rus | 2,14 | 3,72 | 1,3 % | 1,74 | 1 % | 12'739 | 1857 |
| Ostafrika | 25,10 | 43,71 | 4,5 % | 1,74 | 1 % | 6188 | 1972 |
| Anatolien | 2,44 | 4,21 | 6,3 % | 1,73 | 6 % | 6108 | 1989 |
| Deutschland | 7,24 | 11,96 | 20,4 % | 1,65 | 23 % | 2731 | 2016 |
| Böhmen | 1,09 | 1,83 | 16,1 % | 1,67 | 9 % | 3437 | 2027 |
| Baltikum | 0,93 | 1,63 | 3,5 % | 1,76 | 1 % | 10'155 | 2043 |
| Kaukasus | 0,89 | 1,57 | 4,1 % | 1,76 | 0 % | 8289 | 2109 |
| Westafrika | 16,46 | 28,91 | 5,1 % | 1,76 | 0 % | 7080 | 2114 |
| Polen | 1,08 | 1,90 | 6,1 % | 1,76 | 0 % | 7355 | 2179 |
| Amerika | 31,32 | 52,83 | 2,0 % | 1,69 | 4 % | 12'531 | 2216 |
| Balkan | 1,77 | 3,11 | 5,9 % | 1,76 | 0 % | 7483 | 2253 |
| Ungarn | 1,60 | 2,81 | 8,8 % | 1,76 | 1 % | 5810 | 2257 |
| **ganze Karte** | 149,81 | 238,22 | 3,0 % | 1,59 | 16 % | 6613 | 1843 |

- **Europa rückt zusammen.** Alle Regionen Europas liegen zwischen 1385 und 2257 kcal. Mit der Getreideernte allein reichte die Spanne von 1493 bis 12'739.
- **Trockene Regionen fallen unter das Existenzminimum.** Ägypten kommt auf 699 kcal. Der Bodenindex kennt nur Regenfeldbau, bewässertes Land hat darin keinen Ertrag. Bisher hat die riesige Fläche das verdeckt.

### Ackerfläche gegen HYDE

Ackerfläche in Mio. ha. HYDE-Werte für das Jahr 1400 aus Klein Goldewijk et al. 2017, Tabelle 2. Die Arbeit sagt nicht, welche Länder zu welcher Region zählen; die Zuordnung der Kartenregionen ist eine eigene. HYDE rechnet mit einer anderen Bevölkerung.

| Gruppe | Modell 1356 | HYDE 3.2, 1400 | Modell durch HYDE | HYDE-Raster auf der Karte, 1400 |
|---|---|---|---|---|
| Europa ohne frühere Sowjetunion | 64,0 | 50,2 | 1,28 | 50,5 |
| Nordafrika und Naher Osten | 24,8 | 18,0 | 1,38 | 22,6 |
| Afrika südlich der Sahara | 86,6 | 27,1 | 3,20 | 24,5 |
| Amerika | 52,8 | 20,6 | 2,56 | 16,0 |
| Frühere Sowjetunion (die Karte deckt nur den Westen) | 10,0 | 12,0 | nicht vergleichbar | 10,0 |

- **Europa.** Das Modell liegt 28 % über HYDE, in der Grössenordnung von HYDEs eigener Spanne. Der Vergleich der Vorgängerversion HYDE 3.1 mit Pollendaten findet in Europa vor der Industrialisierung rund 25 % zu wenig offenes Land ([Kaplan et al. 2017](https://doi.org/10.3390/land6040091)).
- **Ausserhalb Europas.** Das Modell liegt 2,6- bis 3,2-mal über HYDE. Englands Fläche pro Kopf lässt sich auf Afrika und Amerika nicht übertragen.

### Jede Region gegen das HYDE-Raster

Nach dem Bau ist das Raster von HYDE 3.2.1 für die Jahre 1300 und 1400 über die Karte gelegt und je Region zusammengezählt worden: Ackerfläche und Menschen jeder Rasterzelle. Für Europa ergibt das Raster 1400 zusammen 50,5 Mio. ha, die gedruckte Tabelle nennt 50,2. Die neuere Fassung HYDE 3.3 liess sich nicht abrufen, ihr Datenserver verlangt eine Bot-Prüfung. Acker in Mio. ha, Menschen in Mio.:

| Region | Menschen Karte 1356 | Menschen HYDE 1300 | HYDE 1400 | Acker Modell 1356 | HYDE 1300 | HYDE 1400 | Modell durch HYDE 1300 | Modell durch HYDE 1400 | ha pro Kopf Modell | HYDE 1300 | HYDE 1400 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Amerika | 31,32 | 39,32 | 42,92 | 52,83 | 14,92 | 15,98 | 3,54 | 3,31 | 1,69 | 0,38 | 0,37 |
| Ostafrika | 25,10 | 13,28 | 14,90 | 43,71 | 6,34 | 7,08 | 6,89 | 6,17 | 1,74 | 0,48 | 0,48 |
| Westafrika | 16,46 | 15,86 | 18,00 | 28,91 | 9,01 | 10,21 | 3,21 | 2,83 | 1,76 | 0,57 | 0,57 |
| Frankreich | 10,80 | 13,53 | 9,37 | 14,95 | 15,59 | 10,41 | 0,96 | 1,44 | 1,39 | 1,15 | 1,11 |
| Sahel | 8,20 | 8,81 | 9,84 | 14,02 | 6,41 | 7,18 | 2,19 | 1,95 | 1,71 | 0,73 | 0,73 |
| Deutschland | 7,24 | 13,75 | 9,87 | 11,96 | 16,97 | 9,83 | 0,70 | 1,22 | 1,65 | 1,23 | 1,00 |
| Italien | 5,62 | 12,19 | 7,81 | 7,23 | 11,54 | 7,11 | 0,63 | 1,02 | 1,29 | 0,95 | 0,91 |
| Persien | 5,25 | 7,97 | 8,62 | 8,14 | 5,75 | 5,96 | 1,42 | 1,36 | 1,55 | 0,72 | 0,69 |
| Ägypten und Nubien | 4,98 | 7,75 | 7,37 | 3,47 | 3,65 | 3,58 | 0,95 | 0,97 | 0,70 | 0,47 | 0,48 |
| Iberien | 4,40 | 8,69 | 6,38 | 7,36 | 5,56 | 6,24 | 1,32 | 1,18 | 1,67 | 0,64 | 0,98 |
| Maghreb | 3,62 | 4,74 | 4,21 | 5,22 | 4,32 | 3,82 | 1,21 | 1,37 | 1,44 | 0,91 | 0,91 |
| Britische Inseln | 3,48 | 7,13 | 3,50 | 5,26 | 5,55 | 2,54 | 0,95 | 2,08 | 1,51 | 0,78 | 0,72 |
| Niederlande | 2,65 | 3,17 | 2,18 | 2,76 | 2,03 | 1,26 | 1,36 | 2,19 | 1,04 | 0,64 | 0,58 |
| Anatolien | 2,44 | 5,77 | 4,65 | 4,21 | 7,57 | 5,95 | 0,56 | 0,71 | 1,73 | 1,31 | 1,28 |
| Rus | 2,14 | 3,74 | 3,74 | 3,72 | 2,45 | 2,47 | 1,52 | 1,51 | 1,74 | 0,65 | 0,66 |
| Skandinavien | 1,84 | 2,35 | 1,25 | 2,96 | 3,57 | 1,98 | 0,83 | 1,49 | 1,61 | 1,52 | 1,59 |
| Balkan | 1,77 | 3,79 | 3,08 | 3,11 | 4,36 | 3,41 | 0,71 | 0,91 | 1,76 | 1,15 | 1,11 |
| Steppe | 1,74 | 2,87 | 2,92 | 3,04 | 3,69 | 3,71 | 0,82 | 0,82 | 1,75 | 1,29 | 1,27 |
| Arabien | 1,61 | 4,88 | 4,48 | 0,21 | 0,11 | 0,08 | 1,93 | 2,66 | 0,13 | 0,02 | 0,02 |
| Ungarn | 1,60 | 3,52 | 2,93 | 2,81 | 3,66 | 2,93 | 0,77 | 0,96 | 1,76 | 1,04 | 1,00 |
| Griechenland | 1,31 | 1,98 | 1,48 | 1,87 | 1,06 | 0,78 | 1,76 | 2,39 | 1,43 | 0,54 | 0,53 |
| Mesopotamien | 1,28 | 1,52 | 1,47 | 2,05 | 1,41 | 1,33 | 1,45 | 1,53 | 1,60 | 0,93 | 0,91 |
| Böhmen | 1,09 | 2,74 | 2,35 | 1,83 | 2,08 | 1,65 | 0,88 | 1,11 | 1,67 | 0,76 | 0,70 |
| Polen | 1,08 | 2,64 | 2,64 | 1,90 | 2,37 | 2,32 | 0,80 | 0,82 | 1,76 | 0,90 | 0,88 |
| Levante | 0,96 | 2,34 | 1,87 | 1,45 | 2,41 | 1,91 | 0,60 | 0,76 | 1,51 | 1,03 | 1,02 |
| Baltikum | 0,93 | 1,13 | 1,14 | 1,63 | 1,85 | 1,79 | 0,88 | 0,91 | 1,76 | 1,64 | 1,57 |
| Kaukasus | 0,89 | 1,88 | 1,56 | 1,57 | 2,47 | 2,03 | 0,64 | 0,77 | 1,76 | 1,31 | 1,30 |
| Atlantikinseln | 0,03 | 0,19 | 0,14 | 0,03 | 0,01 | 0,01 | 4,28 | 3,63 | 1,09 | 0,04 | 0,07 |
| **ganze Karte** | 149,81 | 197,56 | 180,66 | 238,22 | 146,68 | 123,56 | 1,62 | 1,93 | 1,59 | 0,74 | 0,68 |
| England (162 Orte) | 2,58 | 4,72 | 2,13 | 3,70 | 4,09 | 1,75 | 0,90 | 2,11 | 1,43 | 0,87 | 0,82 |

- **Fläche.** In Frankreich, Deutschland, Italien, auf den Britischen Inseln, in Skandinavien und in Böhmen liegt die Ackerfläche des Modells für 1356 zwischen den HYDE-Werten für 1300 und 1400. In den Niederlanden, in Griechenland und in Iberien liegt sie über beiden, in Anatolien, auf dem Balkan, in Ungarn, Polen, im Baltikum, in der Levante, im Kaukasus und in der Steppe unter beiden.
- **Pro Kopf.** Das Modell bestellt in jeder Region mehr Land pro Kopf als HYDE: in Europa das 1,0- bis 2,7-Fache des HYDE-Werts von 1400 (ohne die Atlantikinseln), in Afrika südlich der Sahara und in Amerika das 2,3- bis 4,5-Fache. Die Flächen liegen in Europa nur deshalb näher beieinander, weil auf der Karte 1356 weniger Menschen leben als bei HYDE.
- **Woher der Unterschied kommt.** Für Englands Orte hat HYDE 1300 4,72 Mio. Menschen und 10,12 Mio. acres Acker, Broadberry et al. nennen 11,52 Mio. acres. Für 1400 hat HYDE 2,13 Mio. Menschen und nur 4,33 Mio. acres, Broadberry et al. nennen 8,73 Mio. für 1380 und 7,76 Mio. für 1420. HYDE lässt den Acker fast im Gleichschritt mit den Menschen schrumpfen, Broadberry et al. finden nach der Pest deutlich mehr Acker pro Kopf. Das Modell ist an Broadberry et al. geeicht. Die beiden Quellen widersprechen sich hier; am Modell ist deswegen nichts geändert.
- **Die Menschen der Karte sind nicht die von HYDE.** Auf der Karte leben 1356 149,8 Mio. Menschen, bei HYDE im selben Ausschnitt 197,6 Mio. (1300) und 180,7 Mio. (1400), mit grossen Unterschieden je Region. Die Startbevölkerung gehört nicht zu diesem Feature.

## Massstab 1 : 100

Die Regel rechnet mit Fläche pro Kopf und mit einem Anteil am Land. Der [Massstab 1 : 100](../welt.md#massstab-1--100) ändert deshalb nichts, solange Menschen und Fläche im selben Massstab gerechnet werden.

## Grenzen

- **Beide Zahlen stammen aus England.** Dass 39,2 % und 1,76 ha auch für Flandern, die Poebene oder Polen gelten, ist eine Annahme ohne Quelle. In Europa passt die Ackerfläche in der Grössenordnung zu HYDE, pro Kopf liegt sie aber darüber. Ausserhalb Europas spricht der Vergleich gegen die beiden Zahlen.
- **Afrika südlich der Sahara und Amerika.** Die Ackerfläche ist dort rund dreimal so gross wie bei HYDE. Belegte Werte für die Fläche pro Kopf fehlen für diese Regionen.
- **Die Verteilung der Menschen.** Die Eichung nimmt an, dass sich die Menschen 1300 und 1380 so auf Englands Orte verteilen wie auf der Karte 1356. Dafür gibt es keine Quelle.
- ***c* ist nur grob bestimmt.** Mit *c* = 1,5 ha und einer Landgrenze von 42,6 % käme England 1380 auf 8,28 Mio. acres, 5 % unter der Quelle.
- **Die Quelle schätzt selbst.** Ausgangspunkt ist bei Broadberry et al. eine Schätzung für 1300. Die Werte von 1270 bis 1500 sind von dort aus mit den Trends der Gutshöfe und der Zehnten fortgeschrieben, der Wert für 1600 läuft mit der Bevölkerung zurück (S. 5 bis 6).
- **Bewässerung fehlt.** Ägypten, Mesopotamien, Persien und Arabien ernten zu wenig, Kairo nichts.
- **Städte.** Ein Ort bestellt nur sein eigenes Land und handelt nicht. Paris kommt auf 418 kcal pro Kopf und Tag.
- **Die Regel knickt.** Ein Ort hat entweder freies Land oder steht an der Grenze. Kaplan et al. 2009 beschreiben den Übergang als glatte Kurve.
- **Keine Verzögerung.** Die Fläche folgt den Menschen im selben Jahr. In England stieg der Acker pro Kopf von 1380 bis 1450 noch von 3,70 auf 3,96 acres.
- **Brache.** Die bestellte Fläche enthält die Brache, ihr Anteil ist nicht modelliert. In der Quelle lag er 1300 bei 36 %, 1380 bei 40 % und 1700 bei 20 %.
- **«Bestes Land zuerst» ist an England nicht prüfbar.** Ohne diese Annahme ändern sich Englands Zahlen um höchstens 3 kcal, die der Regionen um bis zu 13 %, am stärksten Persien, Skandinavien und die Levante. Der Bodenindex hat zudem nur ein Raster von 5 Bogenminuten.
- **Übriges Land.** Was nicht Acker ist, hat noch keine Nutzung.
- **Pro Kopf mehr Acker als bei HYDE.** Siehe oben. Englands Wert nach der Pest stammt aus Broadberry et al.; HYDE setzt für dieselbe Zeit etwa die Hälfte an.
- **Nicht geöffnet.** Das Raster von HYDE 3.3 und die Länderwerte, die Flächen pro Kopf je Land (Klein Goldewijk et al. 2017 im Journal of Land Use Science) und die Raster von Kaplan et al. 2009 und Pongratz et al. 2008 waren nicht zugänglich. Verglichen ist mit der gedruckten Tabelle 2 von HYDE 3.2 und mit dem Raster von HYDE 3.2.1 für 1300 und 1400.

## Quellen

- Broadberry, S., Campbell, B., Klein, A., Overton, M. und van Leeuwen, B. (2010): English Economic Growth, 1270–1700. CAGE Working Paper 21, University of Warwick. [PDF](https://warwick.ac.uk/fac/soc/economics/research/centres/cage/manage/publications/21.2010_broadberry_complete.pdf). Tabelle 1 (Ackerfläche), Tabelle 19 (Bevölkerung und Ernte), S. 5 bis 6 (Methode)
- Klein Goldewijk, K., Beusen, A., Doelman, J. und Stehfest, E. (2017): Anthropogenic land use estimates for the Holocene – HYDE 3.2. *Earth System Science Data* 9, 927–953. [PDF](https://essd.copernicus.org/articles/9/927/2017/essd-9-927-2017.pdf)
- Pongratz, J., Reick, C., Raddatz, T. und Claussen, M. (2008): A reconstruction of global agricultural areas and land cover for the last millennium. *Global Biogeochemical Cycles* 22, GB3018. [PDF](https://pure.mpg.de/pubman/item/item_994221_6/component/file_1786333/gbc1508.pdf)
- Kaplan, J. O., Krumhardt, K. M. und Zimmermann, N. (2009): The prehistoric and preindustrial deforestation of Europe. *Quaternary Science Reviews* 28, 3016–3034. [DOI](https://doi.org/10.1016/j.quascirev.2009.09.028)
- Kaplan, J. O. et al. (2017): Constraining the deforestation history of Europe. *Land* 6(4), 91. [DOI](https://doi.org/10.3390/land6040091)
- Klein Goldewijk, K. (2017): Anthropogenic land-use estimates for the Holocene; HYDE 3.2, Datensatz (Fassung 3.2.1), Archiv DANS. [DOI](https://doi.org/10.17026/dans-25g-gez3). Verwendet sind Ackerfläche und Bevölkerung des Basisszenarios für 1300 und 1400.
- Klein Goldewijk, K. (2023): HYDE 3.3, Datensatz der Universität Utrecht. [DOI](https://doi.org/10.24416/UU01-67UHB4). Gesehen ist davon nur die Katalogseite.
