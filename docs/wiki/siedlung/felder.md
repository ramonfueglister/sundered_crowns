# Felder je Hof

**Status:** Entwurf · **Bereich:** Siedlung · **Stand:** 2026-11-19

> Jeder Hof eines Weilers hat seine eigenen Äcker. Die Fläche kommt aus der Wirtschaft, Lage und Form aus der Flurverfassung um 1291. Die Gewanne stehen mit Lage, Grösse und Zelge im Grundbuch der Welt.

Ramon hat den Vorschlag am 19. November 2026 angenommen. Gebaut in Zustand 36.

## Das Feature

Bisher kannte die Simulation je Ort nur die Hektaren unter dem Pflug. Die 3D-Welt würfelte die Felder um die Städte und auch, welches brach lag. Jetzt legt die Simulation beim Gründen der Welt die Flur jedes Weilers an: Gewanne in drei Zelgen, in jedem Gewann ein Streifen je Hof. Die 3D-Welt zeichnet nur noch diese Felder, mit der Frucht ihrer Zelge im laufenden Jahr.

Nicht dabei: ungleiche Höfe (ganze und halbe Hufen, Tauner ohne Land), Weide, Allmend, Wiesen und Weinberge, Bewässerung und Terrassen, Wege zu den Feldern, das Ändern der Flur über die Jahre.

## Im Spiel

Um die Städte stehen die Gewanne aus dem Grundbuch. Jedes ist in die Streifen der Höfe seines Weilers geteilt und trägt die Frucht seiner Zelge: Winterkorn, Sommerkorn oder Brache. Jedes Jahr rückt die Frucht eine Zelge weiter. Im Familienfenster einer Bauernfamilie steht unter «Hof», wie sie ihr Land bewirtschaftet, wie viele Streifen und Äcker sie hat, wie viel Hektaren und welche Ernte im Jahr.

## Das Modell

1. **Land je Hof.** Das Ackerland des Orts aus der Wirtschaft wird gleich auf seine Höfe verteilt. Keine neue Zahl.
2. **Boden.** Die 3D-Welt vermisst um jede Stadt, wo ein Gewann liegen kann: trocken, kein Fels, nichts gebaut, eben, kein Wald, nicht in der Stadt und nicht im Weiler.
3. **Flur des Weilers.** Die Weiler einer Stadt nehmen abwechselnd den nächsten freien Boden, bis jeder das Land seiner Höfe hat. Ein Gewann ist 10 × 7 Blöcke gross, 109 ha.
4. **Zelgen.** Die Gewanne eines Weilers teilen sich nach ihrer Richtung vom Weiler aus, von Norden über Osten, in drei gleich grosse Zelgen: Winterkorn, Sommerkorn, Brache. Der letzte Gewann jeder Zelge ist so viel kürzer, dass die Fläche genau aufgeht.
5. **Streifen im Gemenge.** Jeder Gewann ist in so viele gleich breite Streifen geteilt, wie der Weiler Höfe hat, in der Reihenfolge der Höfe von Westen, die nördliche Reihe zuerst (Sonnenteilung). So hat jeder Hof in jeder Zelge gleich viel und gleich guten Boden.
6. **Mittelmeer.** Wo die Karte Mittelmeerboden hat, gibt es zwei Zelgen, Korn und Brache, und keine gemeinsame Flur: jeder Gewann gehört ganz einem Hof.
7. **Ernte des Hofs.** Die Ernte des Orts bleibt, wie die Wirtschaft sie rechnet. Jeder Hof bekommt seinen Anteil nach seiner Fläche.

Welche Zelge was trägt, folgt aus dem Jahr:

   Frucht = (Zelge + Jahr) mod Zahl der Zelgen

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Gewann | 10 × 7 Blöcke, 109 ha | das Feld der 3D-Welt ohne Rain; ein Gewann der Welt steht für die von 100 Familien |
| Zelgen | 3, im Mittelmeerraum 2 | Historisches Lexikon der Schweiz; die Grenze nach dem Boden der Karte ist eigene Regel |
| Land je Hof | Ackerland des Orts / Höfe des Orts | Wirtschaft Feature 2 |
| Vermessung | bis 2,5 Flurradien hinter den fernsten Weiler, höchstens 700 Blöcke | Platzhalter |

## Was die Welt von 1291 bekommt

107'447 Gewanne in 1'762 Weilern. 97,3 % des Ackerlands liegen auf dem Boden. Im Mittel 63 Gewanne je Weiler, neun von zehn höchstens 96, am meisten 162. 460 Weiler haben zwei Zelgen.

32 Städte haben zu wenig Boden, weil Berge, Meer oder Wald sie umgeben: Trabzon 9 %, Messina 17 %, Trento 32 %, Palermo 34 %, Granada 49 % und andere.

## Historische Prüfung

Ein Hof der Welt steht für 100 echte Familien. Sein Land durch 100 ist das Ackerland einer echten Bauernfamilie. Nichts ist darauf eingestellt.

| | Ackerland je Bauernfamilie |
|---|---|
| Welt 1291, Median der 545 Städte mit Ackerland | 9,9 ha (jede zehnte unter 4,2 ha, jede zehnte über 13,2 ha) |
| Hufe, gewöhnlich (Lexikon der Geographie) | 7,5 bis 15 ha |
| Virgate von Alwalton, Hundred Rolls 1279 | 25 acres = 10,1 ha |
| Virgate in Kent (Witney) | 30 acres = 12,1 ha |
| Zürich / Bayonne / Limoges | 12,0 / 9,2 / 7,0 ha |
| London / Barcelona / Florenz / Paris / Venedig | 5,0 / 5,5 / 1,7 / 1,5 / 0,6 ha |

Die mittlere Stadt liegt mitten in der Spanne von Hufe und Virgate. Die grossen Städte liegen weit darunter, weil ihr Ort an der Landgrenze ist (Wirtschaft Feature 2).

## Eigene Regeln ohne Quelle

- Gleiche Fläche für jeden Hof und gleiche Zelgen. Das Historische Lexikon der Schweiz nennt das Ideal, sagt aber, dass beträchtliche Unterschiede früh üblich waren.
- Die Zelgen als drei Sektoren um den Weiler; die abwechselnde Wahl der Weiler; der nächste Boden zuerst.
- Die Sonnenteilung ist für Skandinavien und das Danelaw belegt, nicht für ganz Europa.
- Ein Streifen der Welt (bis 125 × 875 m) steht für die Streifen von 100 Familien; echte waren etwa 200 m lang und 5 bis 20 m breit. Darum liegt ein Gewann im Mittel 8,4 km vom Weiler.
- Die Felder benachbarter Städte werden nicht auseinandergehalten.

## Quellen

- Schnyder und Ineichen (2010): Dreifelderwirtschaft. Historisches Lexikon der Schweiz. https://hls-dhs-dss.ch/de/articles/027644
- Zelgensysteme. Historisches Lexikon der Schweiz, Artikel 013702 (2014). https://hls-dhs-dss.ch/de/articles/013702
- Hufe. Lexikon der Geographie, Spektrum 2001. https://www.spektrum.de/lexikon/geographie/hufe
- Hundred Rolls 1279, Manor Alwalton (Huntingdonshire).
- Witney: Kentish land measurements of the thirteenth century. Archaeologia Cantiana 109, S. 29–39.
- Chouquer (2023): Qu'est-ce qu'un « partage selon le soleil » (solskifte) en Scandinavie ? Académie d'Agriculture de France.
- McCloskey (1991): The Prudent Peasant. Journal of Economic History 51(2), 343–355.
- Bolòs (2026): Understanding the Formation of a Mediterranean Landscape. Land 15(2), 225.
- Hall (2014): The Open Fields of England. Oxford.

Technisch: docs/SETTLEMENT_DESIGN.md, Feature 4.
