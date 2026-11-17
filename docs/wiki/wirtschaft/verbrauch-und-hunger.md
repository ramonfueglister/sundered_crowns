# Verbrauch und Hunger

**Status:** Gebaut, noch nicht in der laufenden Welt (am 17.11.2026 freigegeben und gebaut) · **Bereich:** Wirtschaft · **Stand:** 2026-11-17

> Haushalte geben nicht nur aus ihrem Einkommen aus, sondern auch aus dem, was sie über ihrem Ziel gespart haben. Jede Familie hat einen Bedarf an Nahrung, und die Welt bucht, welchen Teil davon sie gedeckt hat.

Diese Seite beschreibt Feature 15. Es baut auf dem [Haushalt der Familie](haushalt-der-familie.md) auf und gehört zur [Wirtschaft der Städte](wirtschaft-der-staedte.md). Alle Zahlen stammen aus dem Spielcode.

## Das Feature

- **Ausgeben aus Erspartem.** Im Modell von Poledna u. a. gibt ein Haushalt einen festen Anteil seines Einkommens aus, sonst nichts. Was liegen bleibt, wird nie mehr ausgegeben. Über Jahrzehnte häuft sich so Geld bei den Haushalten, den Betrieben fehlt es, und die Banken schreiben ab. Jetzt gibt ein Haushalt zusätzlich pro Jahr 40 % dessen aus, was er über seinem Ziel hält. Das Ziel ist das Verhältnis von Erspartem zu Ausgaben am ersten Tag.
- **Bedarf.** Ein Korb braucht 2100 kcal am Tag. Erwachsene sind ein Korb, Kinder unter 15 ein halber.
- **Gedeckter Teil.** Die Familie deckt zuerst ihren Bedarf. Gedeckt ist der Teil des Bedarfs, den ihre Ausgaben des Tages bezahlen, höchstens 100 %.

Der Markt des Motors rechnet wie BeforeIT: Jeder Einkauf wird weiter nach festen Anteilen auf die Sektoren verteilt. Geändert ist nur das Budget der Haushalte. Bedarf und gedeckter Teil sind eine Buchung der Welt.

Nicht dazu gehören: was Hunger mit einer Person macht (Sterblichkeit, Umzug: das gehört zu den Personen), Ernteschwankungen, Entfernung im Handel.

## Im Spiel

Der Abschnitt «Haushalt» im Personenfenster hat zwei neue Zeilen:

| Zeile | Bedeutung |
|---|---|
| Nahrungsbedarf am Tag | was die Nahrung für alle Körbe der Familie an diesem Tag kostet |
| davon gedeckt | Teil des Bedarfs, den die Ausgaben der Familie bezahlen |

## Das Modell

1. **Budget.** C = ψ · Y + s · (D − n · ψ · Y), nie unter 0. Y ist das erwartete Einkommen, D das Ersparte, n das Ziel (Erspartes aller Haushalte der Stadt durch ihre Budgets am ersten Tag), s = 0,4 / 365 pro Tag. Mit s = 0 rechnet der Motor Bit für Bit wie vorher.
2. **Kosten des Bedarfs.** Die Haushalte Englands kaufen pro Kopf und Tag Landwirtschaft, hinter der 2042 kcal stehen. Der Bedarf eines Korbes kostet diesen Betrag mal 2100 / 2042: 0,37 d am Tag zu Preisen des Starts. Später gilt er mal dem Preis der Landwirtschaft der Stadt.
3. **Gedeckt.** gedeckt = min(1, Ausgaben der Familie / Bedarf der Familie).

So gilt die Regel in jedem Jahrhundert: Der Bedarf ist eine körperliche Grösse, sein Preis kommt aus dem Modell.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Form des Budgets | C = α1 · YD + α2 · H | Godley & Lavoie 2007, Modell SIM, Gleichung 3.7 (gelesen in der Nachrechnung von MacroStat, nicht im Buch) |
| Anteil pro Jahr | 0,4 | α2 desselben Modells; Lehrbuchwert, die Länge der Periode ist unsere Annahme |
| Bedarf pro Korb und Tag | 2100 kcal | Allen 2013, Tabelle 2 |
| kcal pro Kopf und Tag hinter der gekauften Landwirtschaft | 2042 | Broadberry u. a. 2010, Tabelle 19, Zeile 1380/89 (für die 1350er gibt es keine Zeile) |
| Bedarf zuerst | Stone-Geary | Blanz 2023, Gleichungen 5 und 6 |

## Zahlen aus dem Spiel

Alle 29 Städte zusammen nach 30 Jahren (jeder Tag gerechnet):

| | Budget wie bisher | Mit Ausgeben aus Erspartem (drei Welten) |
|---|---|---|
| Produktion (Start = 100) | 115,9 | 115,8 bis 116,1 |
| Schwächste Stadt (Start = 100) | 112,0 | 110,8 bis 113,5 |
| Erspartes der Haushalte (Start 8949) | 32'879 | 13'457 bis 14'578 |
| Eigenkapital aller Banken (Start 551) | −13'972 | −731 bis −2348 |
| Banken im Minus | 26 von 29 | 10 bis 17 |
| Abschreibungen der Banken im Jahr 30 | 1345 | 56 bis 126 |

Gedeckter Bedarf:

| | Welt 1356, Tag 60 | Welt 1291, Tag 60 |
|---|---|---|
| Personen in Familien der Städte | 25'722 | 102'217 |
| Bedarf ganz gedeckt | 92,2 % | 92,1 % |
| 75 bis 100 % gedeckt | 4,0 % | 3,5 % |
| 50 bis 75 % gedeckt | 2,3 % | 1,8 % |
| unter 50 % gedeckt | 0,7 % | 0,6 % |
| nichts gedeckt | 0,9 % | 2,0 % |

## Grenzen

- **Zu wenig Nahrung trotz Erspartem.** Rund 8 % der Personen leben in Familien, die weniger ausgeben als ihren Bedarf. Drei Viertel oder mehr von ihnen haben Erspartes für mehr als einen Monat Nahrung. Es sind grosse Familien mit einem tiefen Lohn. Nach der Regel geben sie ihren Anteil am Einkommen aus und nur 0,4 / 365 am Tag vom Ersparten über dem Ziel. Eine Regel «Bedarf zuerst» im Budget des Motors steht in keinem gelesenen Paper für dieses Modell und ist nicht gebaut.
- «Nichts gedeckt» sind die Familien, in denen niemand an der Wirtschaft teilnimmt.
- Der Wert gilt für den letzten Tag. An einem einzelnen Tag findet ein Haushalt nicht immer alle Ware.
- 2042 kcal gelten für 1380/89, nicht für die 1350er.
- Landwirtschaft ist nicht nur Nahrung (Wolle), und Brot und Bier sind zum Teil Gewerbe.
- Der Motor verkauft Landwirtschaft nach festen Anteilen, die Familie wird mit «Bedarf zuerst» gebucht. Die beiden Zahlen sind nicht dieselben.
- Betriebe schütten weiter Gewinn auf unverkaufte Ware aus. Darum enden Banken weiter im Minus, mit einem Zehntel bis einem Sechstel des Betrags.
- Ohne Ernteschwankungen und Entfernung gibt es keine Hungerjahre.

## Quellen

- Godley & Lavoie (2007): Monetary Economics. Modell SIM, Gleichungen 3.7 und 3.9, gelesen bei MacroStat (macrostat.readthedocs.io).
- Allen (2013): The High Wage Economy and the Industrial Revolution: A Restatement. Oxford Discussion Papers in Economic and Social History 115, Tabelle 2.
- Broadberry, Campbell, Klein, Overton & van Leeuwen (2010): English Economic Growth, 1270–1700. CAGE Working Paper 21, Tabelle 19.
- Blanz (2023): Climate-related Agricultural Productivity Losses through a Poverty Lens. arXiv 2310.16490.
- Poledna u. a. (2023): Economic forecasting with an agent-based model. Anhang A.46.
- Entwurf und Messungen: `docs/ECONOMY_DESIGN.md`, Abschnitt 15.
