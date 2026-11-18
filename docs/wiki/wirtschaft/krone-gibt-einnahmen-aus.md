# Die Krone gibt aus, was sie einnimmt

**Status:** Gebaut, noch nicht in der laufenden Welt (am 18.11.2026 freigegeben und gebaut) · **Bereich:** Wirtschaft · **Stand:** 2026-11-18

> Die Krone einer Stadt kauft an jedem Tag mit dem ein, was sie am Tag davor eingenommen hat. Vorher folgten ihre Käufe einer eigenen Zufallsreihe, und in einzelnen Städten blieb über Jahrzehnte Geld in ihrer Truhe liegen.

Diese Seite beschreibt Feature 16. Es gehört zur [Wirtschaft der Städte](wirtschaft-der-staedte.md) und folgt auf [Verbrauch und Hunger](verbrauch-und-hunger.md). Alle Zahlen stammen aus dem Spielcode.

## Das Feature

Im Modell von Poledna u. a. (2023) folgen die Käufe des Staates einer eigenen Zufallsreihe. Sie liest nicht, was der Staat einnimmt. Unsere Werte dafür stammen aus den Einnahmen der englischen Krone 1280 bis 1356: Auf lange Sicht streut die Reihe um 55 % um ihren Mittelwert, und eine Abweichung hält sich rund 14 Jahre. Das sind die Einnahmen eines ganzen Reichs im Krieg. Im Spiel zog jede Stadt einzeln eine solche Reihe, während ihre Steuereinnahmen der Wirtschaft der Stadt folgten.

Zog eine Stadt eine tiefe Reihe, nahm ihre Krone über Jahrzehnte mehr ein, als sie ausgab. Das Geld fehlte dann den Haushalten und Betrieben. So sank Sevilla in einem Versuch mit Entfernung im Handel in 30 Jahren auf 90 % seines Starts, mit 11 % ohne Arbeit, obwohl es mehr verkaufte als einkaufte. In der Truhe der Krone lagen 39 % der Jahresproduktion der Stadt.

Jetzt gilt: Das Budget der Krone für einen Tag sind ihre Einnahmen des Vortags.

Nicht dazu gehören: Kriegsjahre mit Ausgaben auf Kredit, Reiche als Träger der Krone, Entfernung im Handel.

## Im Spiel

Es gibt keine neue Anzeige. Die Wirtschaften der Städte werden beim Aufspielen neu gegründet.

## Das Modell

Budget(t) = max(0, Einnahmen(t−1) − übrige Ausgaben(t−1))

- Die Einnahmen sind die des Modells (Steuer auf Einkommen), unverändert.
- Übrige Ausgaben sind Unterstützung und Zinsen der Krone. Im Spiel sind beide praktisch null.
- Am ersten Tag gibt es noch keine Einnahmen. Dieser Tag rechnet Bit für Bit wie vorher.
- Die Zufallszahl der alten Reihe wird weiter gezogen, damit alle anderen Zufallszahlen des Tages an ihrem Platz bleiben.

Die Regel braucht keinen Wert und kein Jahr. Sie gilt so in jedem Jahrhundert.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Regel der Krone | «revenue» | keine gelesene Quelle; die Annahme unserer Eichung («die Krone gibt ihre Einnahmen aus») gilt jetzt an jedem Tag |
| Regel des Papiers | Zufallsreihe der Käufe | Poledna u. a. 2023, Anhang A.55 und A.56; weiter wählbar als «series» |
| Werte der alten Reihe | Beharrung 0,952, Streuung 0,168 im Jahr | Einnahmen der Krone 1280 bis 1356, Bank of England, Blatt A26 |

## Zahlen aus dem Spiel

Alle 29 Städte zusammen nach 30 Jahren (jeder Tag gerechnet, ohne Entfernung):

| | Reihe des Papiers | Krone gibt aus, was sie einnimmt (drei Welten) |
|---|---|---|
| Produktion (Start = 100) | 116,1 | 115,3 bis 115,5 |
| Schwächste Stadt (Start = 100) | 113,5 | 112,5 bis 113,0 |
| Geld der Betriebe (Start 2045) | −113 | 1442 bis 1565 |
| Eigenkapital aller Banken (Start 551) | −731 | 458 bis 551 |
| Banken im Minus | 10 von 29 | 0 bis 2 |
| Truhe (−) oder Schuld (+) der Krone einer Stadt, Anteil an ihrer Jahresproduktion | −0,38 bis +0,41 | −0,02 bis 0 |

Im Versuch mit Entfernung im Handel (vier Welten): schwächste Stadt 110 bis 111 statt 90 bis 105, Banken im Minus 1 bis 2 statt 8 bis 13.

## Grenzen

- Die Regel weicht vom Papier ab: Die Käufe der Krone folgen nicht mehr der Zufallsreihe.
- Es gibt keine Kriegsjahre. Die Käufe der Krone schwanken nur noch mit der Wirtschaft der Stadt.
- Die Krone einer Stadt ist weiter der Staat des Modells, einer je Stadt, und kein Reich des Spiels.
- Eine kleine Truhe bleibt (1 bis 2 % einer Jahresproduktion nach 30 Jahren), weil die Krone die Einnahmen des Vortags ausgibt und nicht immer alle Ware findet.
- Das Geld der Händler wächst zwischen den Städten weiter langsam auseinander. In 30 Jahren schadet das keiner Stadt, über Jahrhunderte würde es weiterwachsen. Dafür gibt es keine gelesene Regel.

## Quellen

- Poledna, S., Miess, M. G., Hommes, C., Rabitsch, K. (2023): Economic forecasting with an agent-based model. European Economic Review 151. Anhang A.55, A.56, A.59, A.60.
- Bank of England: A millennium of macroeconomic data, Blatt A26 (Einnahmen der Krone nach O'Brien und Hunt).
- Entwurf und Messungen: `docs/ECONOMY_DESIGN.md`, Abschnitt 16.
