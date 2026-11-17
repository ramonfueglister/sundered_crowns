# Weiler der Bauern

**Status:** Beschlossen · **Bereich:** Personen · **Stand:** 2026-11-16

> Die Familien jeder Stadt, die von der Landwirtschaft leben, wohnen in Weilern vor den Mauern. Ein Ort hat nur noch seine Personen: Acker und Ernte kommen von ihnen, das Land ohne Personen bleibt leer.

## Das Feature

Ramon, 16.11.2026: In der Welt gibt es nur die Personen der Simulation, und sie bilden die ganze Wirtschaft. Jede Stadt ist eine eigene Volkswirtschaft. Die Bauern einer Stadt wohnen in Weilern vor den Mauern, und Ernte und Felder kommen von ihnen (Entscheid 18:19 UTC, bestätigt 21:58 UTC).

- **Wer im Weiler wohnt:** eine Familie, von der ein Mitglied in einem Betrieb der Landwirtschaft arbeitet oder einen besitzt. Die Betriebe und ihre Sektoren sind die der Wirtschaft der Stadt.
- **Wann:** Die Familien werden beim Gründen der Welt eingeteilt und bleiben, wo sie sind. Wer später die Stelle wechselt, zieht nicht um. Umzüge sind ein eigenes Feature.
- **Wo:** Der Weiler liegt im Ort seiner Stadt, vor den Mauern. Wo genau, legt die 3D-Welt fest.
- **Die Menschen eines Ortes** sind seine lebenden Personen. Sie werden einmal im Jahr gezählt, am 1. Januar, vor Acker und Ernte. Die Zahl aus dem Setup gibt es in der Welt nicht mehr. Ein Ort ohne Personen hat weder Acker noch Ernte.
- **Herrscher** wohnen in der Stadt, nicht im Weiler.

## Im Spiel

Die Liste der Personen eines Ortes sagt bei jeder Person, ob ihre Familie im Weiler wohnt. Im Ortsfenster stehen unter «Getreideernte» die Personen der Weiler als «Menschen in der Landwirtschaft».

## Das Modell

Die [Getreideernte](../wirtschaft/getreideernte.md) und die [bestellte Fläche](../wirtschaft/bestellte-flaeche.md) rechnen wie bisher, nur mit Personen statt Zahlen:

| Grösse | vorher | jetzt |
|---|---|---|
| *P*, Menschen des Ortes | Zahl aus dem Setup, nie kleiner als die Städte | die lebenden Personen des Ortes |
| *L*, Menschen in der Landwirtschaft | 74 % von *P* | die Personen der Weiler |

Die Wirtschaft jeder Stadt hat die Struktur Englands von 1381: 57,2 % der Erwerbstätigen in der Landwirtschaft (Broadberry, Campbell, van Leeuwen 2013, Tabelle 7B). Ihre Familien sind 74,2 % der Personen. Das passt zufällig zu den 74 %, mit denen die Ernte geeicht ist (Allen 2000). Die Eichung selbst bleibt, wie sie war: Sie verteilt Englands Menschen so, wie das Setup von 1356 sie auf Englands Orte verteilt.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Sektor der Landwirtschaft | Sektor 0 der Wirtschaft der Städte | `data/economy/england_1356.json` |
| Eichung von Acker und Ernte | unverändert | `public/data/cultivation.json`, Menschen nach dem Setup von 1356 |

## Historische Prüfung

Welt 1291 am ersten Tag:
- 102'356 Personen in 661 Orten: die 550 Orte mit Städten und die Hauptstädte, in denen nur Herrscher wohnen.
- 18'665 von 27'129 Familien wohnen im Weiler, das sind 75'918 Personen.
- Ernte pro Kopf und Tag: Median 1830 kcal, 90. Perzentil 2183 kcal. 179 Orte liegen unter 1000 kcal. Das sind Orte, in denen nur ein Herrscher wohnt, Städte an der Landgrenze (180 Orte) und Orte ohne Boden mit Ertrag.

| Stadt | Personen | davon im Weiler | kcal pro Kopf und Tag | Acker |
|---|---|---|---|---|
| Paris | 2'147 | 1'564 | 474 | 446 km² |
| London | 812 | 565 | 1'062 | 600 km² |
| Nürnberg | 290 | 249 | 1'446 | 271 km² |
| Florenz | 990 | 758 | 519 | 239 km² |
| Venedig | 1'071 | 822 | 241 | 90 km² |
| Kairo | 4'121 | 3'100 | 0 | kein Boden mit Ertrag im Ort |

## Massstab 1 : 100

Acker und Ernte werden in Menschen der Zeit gerechnet (Personen mal 100), die Ernte dann wieder durch 100 geteilt. Eine Person bekommt so viele Kilokalorien wie ein Mensch der Zeit.

## Grenzen

- Ein Viertel der Stadtbewohner und drei Viertel Bauern sind eher die Struktur eines Landes als die einer Stadt. Ramon hat entschieden, dass die Wirtschaft so bleibt (16.11.2026, 21:57 UTC).
- Grosse Städte wie Paris, Venedig und Kairo ernähren sich nicht selbst. Den Rest müsste der Handel zwischen den Städten bringen; Hunger gibt es noch nicht.
- Eine Familie mit einer Person in der Landwirtschaft und einer in der Stadt wohnt im Weiler.

## Quellen

- Broadberry, Campbell, van Leeuwen (2013): When did Britain industrialise? Explorations in Economic History 50(1), Tabelle 7B (Erwerbstätige nach Sektor 1381, über die Wirtschaft der Städte). https://pureadmin.qub.ac.uk/ws/portalfiles/portal/1640964/EEH_Sectoral_shares_paper.pdf
- Allen (2000), zitiert nach Crafts und Harley (2002): Anteil der Landwirtschaft 74 % (Eichung der Ernte)
