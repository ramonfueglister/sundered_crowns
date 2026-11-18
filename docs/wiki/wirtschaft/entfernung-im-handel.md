# Entfernung im Handel

**Status:** Gebaut, noch nicht in der laufenden Welt (am 18.11.2026 gebaut) · **Bereich:** Wirtschaft · **Stand:** 2026-11-18

> Ware ist zwischen zwei Städten so viele Tage unterwegs, wie der Weg dauert, und die Fracht kostet Arbeit. Vorher lag jede Stadt einen Tag von jeder anderen, und der Transport kostete nichts.

Diese Seite beschreibt Feature 17. Es gehört zur [Wirtschaft der Städte](wirtschaft-der-staedte.md) und folgt auf [Die Krone gibt aus, was sie einnimmt](krone-gibt-einnahmen-aus.md). Alle Zahlen stammen aus dem Spielcode.

## Das Feature

Fracht ist Zeit mal Tageskosten. Wer Ware bewegt, braucht Leute und Tiere für so viele Tage, wie der Weg dauert. Was ein Tag kostet, sagt das Modell selbst: der Lohn der Stadt, heute wie in 200 Jahren. Fest sind nur technische Grössen, also wie weit ein Karren oder ein Schiff am Tag kommt und wie viel Arbeit ein Tonnenkilometer braucht.

- **Weg.** Zwischen zwei Städten gilt der Weg über das Netz der Orte, auf dem eine Tonne am wenigsten Arbeit braucht.
- **Zeit.** Was die Händler heute in einer Stadt kaufen, liegt nach den Reisetagen am Stand der Zielstadt.
- **Fracht.** Die Händler kaufen die Arbeit für den Transport als Dienste in der Stadt, aus der die Ware kommt. Der Preis am Stand ist Einkauf plus Fracht. Die Fracht ist Einkommen der Leute dort, kein Geld verschwindet.
- **Vorrat.** Ist Ware am Stand teurer als bei den Betrieben der Stadt, halten die Händler weniger davon vor.
- **Getrennte Erdteile.** Amerika und Ozeanien handeln 1356 nicht mit dem Rest der Welt.

Nicht dazu gehören: Zölle unterwegs, Jahreszeiten, die Fliessrichtung der Flüsse, Ernteschwankungen.

## Im Spiel

Es gibt keine neue Anzeige. Die Wirtschaften der Städte werden beim Aufspielen neu gegründet.

## Das Modell

| Verkehrsart | km am Tag | Arbeitstage je Tonnenkilometer |
|---|---|---|
| Land (Ochsenkarren) | 12 | 1,39 |
| Fluss | 65 abwärts, 15 aufwärts | 0,14 abwärts, 0,27 aufwärts |
| See | 126 | 0,03 |

Beispiele: Paris nach Gent 14 Tage und 137 Arbeitstage je Tonne. Venedig nach Alexandria 19 Tage und 70. Bagdad nach Täbris 52 Tage und 840. Die Wege von 1356 dauern im Mittel 70 Tage, höchstens 222.

1. **Fracht einer Ware** = Arbeitstage des Wegs je Tonne × Gewicht der Ware. Die Händler rechnen einen Arbeitstag zum mittleren Lohn der Stadt, aus der die Ware kommt.
2. **Wahl der Herkunft.** Wie bisher kaufen die Händler dort mehr, wo es billiger ist. Jetzt zählt der Preis mit Fracht. Nahe Städte handeln darum mehr miteinander.
3. **Vorrat am Stand** = Anteil × Produktion der Stadt × (Preis am Stand / Preis der eigenen Betriebe)^(−2).
4. **Start.** Zu jedem Stand ist am ersten Tag schon unterwegs, was er an einem Tag verkauft, für jeden Reisetag einer Bestellung.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| km am Tag | 12 / 65 und 15 / 126 | Scheidel, Meeks & Weiland 2012 (ORBIS); See: Mittel ganzer Sommerrouten |
| Arbeitstage je Tonnenkilometer | 1,39 / 0,14 und 0,27 / 0,03 | Preisedikt von 301 (Kropff), Frachtsätze durch Tageslohn |
| Gewicht je Pfund Warenwert | 0,25 t Landwirtschaft, 0,02 t Gewerbe | gesetzt, keine Quelle |
| Elastizität des Vorrats | 2 | gesetzt, keine Quelle |
| Getrennte Erdteile | Amerika, Ozeanien | Angabe des Startjahres |

Gegenprobe: Das Verhältnis Wagen zu Fluss abwärts zu See ist im Edikt von 301 rund 46 : 4,5 : 1, für England 1680 setzen Alvarez-Palau u. a. (2024) 44 bis 47 : 4,7 : 1 an.

## Zahlen aus dem Spiel

Alle 29 Städte zusammen nach 30 Jahren (jeder Tag gerechnet; mit Entfernung vier Welten, ohne eine):

| | Ohne Entfernung | Mit Entfernung |
|---|---|---|
| Produktion (Start = 100) | 115,6 | 112,8 bis 114,0 |
| Schwächste Stadt (Start = 100) | 111,8 | 99,3 bis 112,2 |
| Banken im Minus (von 29) | 2 | 0 bis 2 |
| Fracht, Anteil an der Produktion | 0 | rund 1 % |
| Importe, Anteil an der Produktion | | 2,5 % |

Die Bücher der Händler und der Städte gehen in jedem Jahr auf.

In einer der vier Welten erholt sich eine Stadt nicht: Köln verliert in den ersten drei Jahren 3 % seiner Produktion und bleibt 30 Jahre dort, mit 4 bis 6 % Menschen ohne Arbeit. Die Ursache ist nicht gefunden.

## Grenzen

- Das Gewicht der Waren und die Elastizität 2 sind gesetzt, nicht belegt.
- Geschwindigkeiten und Arbeit sind Werte der römischen Zeit. Für 1356 stützen sie sich auf die Technik und auf die Gegenprobe mit England 1680.
- Das Netz kennt keine Fliessrichtung. Ein Flusskilometer zählt mit dem Mittel beider Richtungen.
- Die Fracht verdienen nur die Leute der Herkunftsstadt, niemand unterwegs.
- Das Geld der Händler läuft zwischen den Städten weiter langsam auseinander, etwas stärker als ohne Entfernung.
- Die Wege der 550 Städte von 1291 zu finden, dauert beim Gründen rund sechs Sekunden.

## Quellen

- Scheidel, W., Meeks, E., Weiland, J. (2012): ORBIS: The Stanford Geospatial Network Model of the Roman World, Version 1.0.
- Preisedikt Diokletians von 301, Übersetzung Kropff.
- Alvarez-Palau, E., Bogart, D., Satchell, M., Shaw-Taylor, L. (2024): Transport and urban growth in the First Industrial Revolution (nur das Verhältnis der Verkehrsarten um 1680).
- Ballaux, B., Blondé, B. (2018): Road transport productivity in the sixteenth-century Low Countries. Economic History Review 71(3).
- Entwurf und Messungen: `docs/ECONOMY_DESIGN.md`, Abschnitt 17.
