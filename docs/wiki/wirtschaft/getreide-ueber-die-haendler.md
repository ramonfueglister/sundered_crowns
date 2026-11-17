# Getreide über die Händler

**Status:** Beschlossen und gebaut (am 17.11.2026 freigegeben), noch nicht in der laufenden Welt · **Bereich:** Wirtschaft · **Stand:** 2026-11-17

> Die Ernte eines Orts bestimmt, wie viel die Landwirtschaft seiner Stadt pro Person erwirtschaftet. Was einer Stadt zum Essen fehlt, kaufen die Händler in anderen Städten ein, bezahlt mit Gewerbe und Diensten.

Diese Seite beschreibt Feature 12. Es verbindet die [Getreideernte pro Ort](getreideernte.md) und die [bestellte Fläche](bestellte-flaeche.md) mit der [Wirtschaft der Städte](wirtschaft-der-staedte.md). Alle Zahlen stammen aus dem Spielcode.

## Das Feature

Bisher war jede Stadt England in der Grösse ihrer Bevölkerung, egal wie gut ihr Boden war. Jetzt gilt:

- Jede Stadt hat einen **Ertragsfaktor**: die Ernte pro Bauer ihres Orts im Vergleich zu England 1300–09. London hat 1,04, Venedig 0,21, Texcoco 1,86.
- Die Landwirtschaft der Stadt erwirtschaftet pro Person das Englische mal diesen Faktor, und so viel zahlt sie auch an Lohn.
- Die Haushalte essen so viel wie in England. Was fehlt, bringen die Händler. Die Stadt bezahlt mit mehr Ausfuhr von Gewerbe und Diensten. Eine Stadt mit Überschuss führt Getreide aus.

Nicht dazu gehören: gute und schlechte Jahre, Hunger, Umland ausserhalb des eigenen Orts, Wege und Frachtkosten.

## Im Spiel

Im Ortsfenster einer Stadt, Abschnitt «Wirtschaft der Stadt»: Städte mit schwacher Ernte führen viel mehr ein und aus (Venedig rund die Hälfte seiner Produktion), ihre Preise fallen, und sie wachsen langsamer.

## Das Modell

1. **Ertragsfaktor.** f = (Ernte des Orts / Bauern des Orts) / (Ernte pro Bauer in England 1300–09). Bauern sind die Personen der Weiler.
2. **Landwirtschaft.** Wertschöpfung, Ertrag pro Beschäftigtem, Lohn und Kapital der Landwirtschaft = England × f. Gewerbe und Dienste bleiben englisch, die Zahl der Personen in jedem Sektor auch.
3. **Getreidekauf.** Fehlbetrag d = Essen der Haushalte in England − was der Stadt bleibt. Die Händler bringen d als Einfuhr. Die Stadt führt d mehr an Gewerbe und Diensten aus, und ihre Haushalte kaufen davon entsprechend weniger. Der Handel ist am Start ausgeglichen.
4. **Ägypten** und Orte ganz ohne Regenfeldbau haben Faktor 1, weil der Bodenindex nur Regenfeldbau kennt und am Nil bewässert wurde.

Der Faktor wird bei der Gründung der Städte gesetzt.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Ernte pro Bauer in England 1300–09 | 1'678 kcal am Tag | Feature 1 (Broadberry u. a. 2010, Tabelle 19; 74 % Bauern nach Allen 2000) |
| Essen der Haushalte | wie in England 1356 | Annahme |
| Bezahlt mit | Gewerbe und Diensten im Verhältnis der Käufe der Haushalte | Annahme |
| Ägypten | Faktor 1 | Annahme, bis eine Quelle für bewässertes Land gelesen ist (Ramon, 17.11.2026) |

## Zahlen aus dem Spiel

Welt 1356, 30 Jahre, 4 Welten:

| | vorher | jetzt |
|---|---|---|
| Reale Produktion aller Städte (Start = 100) | 116,3 | 113,4 |
| Ausfuhr, Anteil an der Produktion | 2,7 % | 16,9 % |
| Ohne Arbeit, Mittel | 0,07 % | 0,26 % |
| Schwächste Stadt | 111,8 | 82,5 |

Venedig fällt in den ersten Jahren auf 83 und steht nach 30 Jahren bei 94, mit Preisen bei 66 % des Starts. London bleibt bei 118.

## Grenzen

- Städte, die mehr einführen als ausführen, bezahlen mit Geld, das abfliesst. Es sammelt sich als Guthaben der Händler und wächst ohne Grenze (Venedig nach 20 Jahren 7 Jahres-BIP). Keine Regel liest es.
- Keine guten und schlechten Jahre: Der Faktor bleibt, wie er bei der Gründung war.
- Alle essen wie Engländer, und niemand hungert, wenn das Essen teuer ist.
- Nur der eigene Ort zählt. Paris, Venedig und Genua haben darin wenig Acker.

## Quellen

- Poledna, Miess, Hommes, Rabitsch (2023): Economic forecasting with an agent-based model. European Economic Review 151.
- Ashraf, Galor (2011): Dynamics and stagnation in the Malthusian epoch. American Economic Review 101(5). Gleichung 1.
- Broadberry, Campbell, Klein, Overton, van Leeuwen (2010): English Medieval Population. Tabelle 19.
- Galor, Özak (2016): The agricultural origins of time preference. American Economic Review 106(10). Caloric Suitability Index.
