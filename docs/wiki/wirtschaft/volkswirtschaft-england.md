# Volkswirtschaft England

**Status:** Im Spiel als Jahresmodell (seit 15.11.2026 in der laufenden Welt). Der Tagestakt ist am 15.11.2026 freigegeben und gebaut; in der laufenden Welt, sobald der Weltserver neu aufgespielt ist · **Bereich:** Wirtschaft · **Stand:** 2026-11-15

> England läuft in der Welt als eine ganze Volkswirtschaft: Personen, Betriebe, eine Bank, die Krone und das Ausland, jeder mit eigener Bilanz. Gerechnet wird sie an jedem Spieltag von einem wissenschaftlichen Modell, dessen Regeln unverändert übernommen sind. Jeder Betrieb legt alle 30 Tage an seinem eigenen Plantag Menge und Preis neu fest.

Die Seite beschreibt zwei Features: die Volkswirtschaft selbst (Feature 3) und ihren Tagestakt (Feature 4). Beide sind so gebaut, wie sie vorgeschlagen waren. Wo der Bau vom Probelauf eines Vorschlags abweicht, steht es unter «Historische Prüfung». Alle Zahlen auf dieser Seite stammen aus dem Spielcode, ausser wo «Probelauf» dabeisteht.

## Das Feature

Bisher kannte das Spiel nur Ernte und Acker je Ort. Dieses Feature bringt den Motor des künftigen Wirtschaftssystems in die Welt: ein agentenbasiertes Modell einer ganzen Volkswirtschaft. Es rechnet für England, geeicht auf das Startjahr 1356, an jedem Spieltag einen Tag weiter: Jeden Tag wird produziert, gekauft, Lohn gezahlt und abgerechnet.

Der Motor ist Ramons Rust-Port von BeforeIT.jl, der Umsetzung des Modells von Poledna, Miess, Hommes und Rabitsch (2023) durch die Banca d'Italia. Der Port ist als feste Abhängigkeit eingebunden. Keine Zeile davon ist kopiert oder geändert. Für den Tagestakt ersetzt das Spiel genau zwei Regeln über den Erweiterungsmechanismus, den der Port dafür vorsieht (siehe «Der Tagestakt»).

Nicht dazu gehören: Jahreszeiten, eine Verbindung zu Ernte, bestellter Fläche oder den Menschen der Orte, ein zweites Land, Handel zwischen Ländern und jeder Eingriff des Spielers. Die Volkswirtschaft läuft für sich.

## Im Spiel

Im Ortsfenster jedes englischen Orts (162 Orte) steht der Abschnitt «Volkswirtschaft England». Er zeigt für ganz England die Summen der letzten 365 Tage bis heute und das Preisniveau von heute, im Massstab 1:100. Ist das Fenster offen, werden die Zahlen an jedem neuen Spieltag neu geholt.

| Zeile | Bedeutung | Start 1356 |
|---|---|---|
| Reales BIP | Wirtschaftsleistung der letzten 365 Tage in Pfund, zu Preisen von 1356 | £ 45'248 |
| Stand (1356 = 100) | reales BIP der letzten 365 Tage gegenüber dem Startjahr | 100,0 |
| Preisniveau heute (1356 = 100) | Preise aller Betriebe von heute, gewichtet mit ihrer Produktion von heute | 100,0 |
| Konsum der Haushalte | letzte 365 Tage, zu Preisen von 1356 | £ 40'189 |
| Ausgaben der Krone | Käufe der Krone, letzte 365 Tage | £ 1'055 |
| Investitionen | Anlagen der Betriebe und Hausbau, letzte 365 Tage | £ 3'350 |
| Ausfuhr | Wolle und Tuch, einschliesslich Ausfuhrzoll, letzte 365 Tage | £ 2'135 |
| Einfuhr | letzte 365 Tage | £ 1'482 |
| Beschäftigte | Angestellte und Inhaber der Betriebe, heute | 11'220 |
| Ohne Arbeit | Erwerbspersonen ohne Arbeitgeber, heute | 1 |
| Münzgeld der Haushalte | Guthaben aller Haushalte heute, zu laufenden Preisen | £ 8'853 |
| Münzgeld der Betriebe | Guthaben der Betriebe heute | £ 2'213 |

Solange noch keine 365 Tage gerechnet sind, füllt die Startposition den Rest der Summe auf. In einer Welt mit dem Startwert der laufenden Welt (1356) steht zum Beispiel am 4. September 1363: reales BIP £ 53'121 (Stand 117,4), Preisniveau heute 109,9, niemand ohne Arbeit. Zwei Tage später sind es £ 53'119 und 109,8.

Orte ausserhalb Englands zeigen den Abschnitt nicht. Beeinflussen kann der Spieler nichts davon. Kann der Motor einen Tag nicht rechnen, bleibt die Volkswirtschaft mit dem Stand des Vortags stehen und der Abschnitt nennt Datum und Grund; die Welt läuft weiter. In keinem Lauf ist das vorgekommen.

Mit der Umstellung auf den Tagestakt rechnet England in der laufenden Welt noch einmal ab 1356 bis zum heutigen Welttag. Die Jahreszahlen, die das Fenster vorher zeigte, gelten danach nicht mehr.

## Das Modell

Das Modell beschreibt eine Volkswirtschaft aus einzelnen Handelnden, die jeden Tag in fester Reihenfolge entscheiden und auf Märkten zusammentreffen. Jeder Handelnde führt eine Bilanz, und jede Zahlung des einen ist die Einnahme eines anderen (bestands- und stromgrössenkonsistent). Die Regeln sind die Gleichungen A.1 bis A.84 im Anhang des Papiers. Die wichtigsten:

| Wer | Was er tut |
|---|---|
| Betriebe (2'804, in drei Sektoren) | setzen an ihrem Plantag, alle 30 Tage, Preis und Menge aus der Nachfrage seit dem letzten Plantag und aus erwartetem Wachstum und erwarteter Teuerung. Jeden Tag stellen sie ein oder entlassen, kaufen Vorleistungen und Anlagen und nehmen Kredit auf. Produktion aus Arbeit, Kapital und Vorleistungen in festem Verhältnis (Leontief) |
| Personen (11'221 Erwerbspersonen) | arbeiten jeden Tag für einen Betrieb oder suchen Arbeit, erhalten Lohn oder Gewinn, konsumieren einen festen Anteil ihres Einkommens, sparen den Rest als Guthaben |
| Bank (eine) | hält die Guthaben, vergibt Kredite an Betriebe nach Eigenkapital- und Beleihungsregeln |
| Krone | nimmt Steuern und Zoll ein, kauft Güter; ihre Ausgaben schwanken nach einer geschätzten Zeitreihe |
| Ausland | kauft Ausfuhrgüter und liefert Einfuhrgüter nach geschätzten Zeitreihen |

Die Märkte für Kredit, Arbeit und Güter sind Suchmärkte: Käufer suchen sich Anbieter, bevorzugt günstige und grosse, und nicht jeder findet, was er sucht. Daraus entstehen Lager, unbesetzte Stellen und Schwankungen, ohne dass ein Gleichgewicht vorgeschrieben wird.

Eine Periode des Modells ist im Spiel ein Tag. Das Original rechnet in Quartalen; die historischen Reihen für England sind jährlich.

## Der Tagestakt

Die Regeln des Ports kennen keine Länge der Periode. Die Periode ist aber auch eine Verhaltensgeschwindigkeit: Jeder Betrieb setzt in jeder Periode sein Angebot auf die Nachfrage der Periode davor und entlässt sofort. Rechnet man den Port unverändert mit Tagen, schwankt die Wirtschaft 2,5-mal stärker als im Jahresmodell (Probelauf, Tabelle unten). Der Tagestakt braucht deshalb eine Aussage darüber, wie oft ein Betrieb entscheidet. Genau zwei Regeln sind dafür ersetzt, alle anderen gelten unverändert mit Tageswerten.

**1. Plantag.** Jeder Betrieb hat einen eigenen Plantag; die Betriebe sind gleichmässig über 30 Tage verteilt, an jedem Tag planen also 93 oder 94 Betriebe. Nur an seinem Plantag legt ein Betrieb Angebot und Preis neu fest, nach der Regel des Ports:

> Angebot = mittlere Tagesnachfrage seit dem letzten Plantag × (1 + erwartetes Wachstum pro Tag)^30
>
> Preis = alter Preis × (1 + Kostendruck) × (1 + erwartete Teuerung pro Tag)^30

An den anderen 29 Tagen behält er beides. Beschäftigung, Vorleistungen und Investitionen folgen wie im Port aus dem Angebot. Am ersten Tag der Welt planen alle Betriebe.

**2. Erwartungen.** Wachstum und Teuerung werden wie im Port mit einer AR(1)-Schätzung und einem Zufallsanteil vorausgesagt, aber auf Jahressummen, die heute enden: die letzten 365 Tage, die 365 Tage davor und so weiter. Das Ergebnis wird auf den Tag umgerechnet.

Herkunft: Die Zeitstruktur stammt aus Eurace@Unibi (Dawid u. a. 2011). Dort ist der Takt der Tag, und jeder Betrieb handelt an seinem eigenen Tag des Monats («updated monthly on the ideosyncratic day of the month to act», «Firms perform the following activities on a monthly base»). Ein Monat ist hier mit 30 Tagen angesetzt. Die Regeln selbst sind die des Ports. Bei der Recherche für dieses Feature fand sich kein Papier, das das Modell von Poledna u. a. täglich rechnet: Die Verbindung der beiden ist eine eigene Festlegung dieses Spiels. Die Erwartungen bleiben auf Jahressummen, weil die Quellen von 1356 Jahreswerte sind; mit Fenstern von 30 oder 90 Tagen brachen im Probelauf alle Welten ab (die Preise explodierten).

Mit Plan und Fenster von je einem Tag sind beide Regeln wieder die des Ports: Der Motor rechnet dann Bit für Bit dessen Zahlen (Test).

### Umrechnung vom Jahr auf den Tag

Die Eichtabelle bleibt dieselbe. Ein Skript rechnet die Jahreswerte auf den Tag um.

| Grösse | Jahr | Tag | Regel | Herkunft |
|---|---|---|---|---|
| Flüsse: Produktion je Beschäftigten, Kapitalproduktivität, Abschreibung, Lohn | Jahreswert | Jahreswert / 365 | Flüsse mal Zeitskala | Port, `src/calibration.rs` |
| Zins | 7,5 % | 0,0198 % | (1 + Zins)^(1/365) − 1 | Port, `src/calibration.rs` (dort Jahr auf Quartal) |
| Tilgungsanteil der Kredite | 0,05 | 0,000137 | Anteil / 365 | Form wie Pichler u. a., Fussnote 15 |
| Käufe der Krone, AR(1) | Trägheit 0,952, Streuung 0,168 | 0,999866 und 0,00902 | gleicher Mittelwert und gleiche Streuung des Niveaus | eigene Umrechnung |
| Ausfuhr, AR(1) | Trägheit 0,371, Streuung 0,331 | 0,997287 und 0,0262 | wie oben | eigene Umrechnung |
| Geschichte vor 1356 | 76 Jahreswerte | jeder Jahreswert steht für 365 Tage | Tag = Jahreswert / 365 | eigene Festlegung |
| Planperiode der Betriebe | gab es nicht | 30 Tage | eigener Tag je Betrieb, Monatsrhythmus | Eurace@Unibi, Handbuch 2011 |

Anteile und Bestände bleiben unverändert: Konsumneigung, Steuersätze, Ausschüttungsanteil, Eigenmittelvorgaben, Guthaben, Kapital, Personen. Das Jahr des Modells hat 365 gleiche Tage; ein Schalttag des Kalenders wird wie jeder andere Tag gerechnet.

### Probeläufe des Vorschlags

Je 5 Welten über 30 Spieljahre, ausserhalb des Spiels gerechnet. Wachstum, Streuung und Mittel sind Durchschnitte über die Welten, der höchste Stand stammt aus der schlechtesten Welt, das Preisniveau ist die Spanne der Welten.

| Variante | Wachstum pro Jahr | Streuung des Jahreswachstums | Ohne Arbeit im Mittel | Ohne Arbeit, höchster Stand | Preisniveau im Jahr 30 (Start 100) |
|---|---|---|---|---|---|
| Jahresmodell (Feature 3) | +0,28 % | 4,0 % | 0,48 % | 8,8 % | 23 bis 594 |
| Port unverändert, Periode Quartal | −0,03 % | 3,0 % | 2,33 % | 15,4 % | 35 bis 500 |
| Port unverändert, Periode Monat | −0,47 % | 5,1 % | 8,05 % | 27,3 % | 3 bis 353 |
| Port unverändert, Periode Tag | +0,10 % | 10,0 % | 3,70 % | 30,5 % | 54 bis 256 |
| **Tagestakt, Plan alle 30 Tage (gebaut)** | +0,43 % | 2,1 % | 0,02 % | 2,1 % | 124 bis 143 |
| Tagestakt, Plan alle 90 Tage | +0,43 % | 1,3 % | 0,00 % | 1,2 % | 115 bis 180 |
| Tagestakt, Plan alle 365 Tage | +0,23 % | 0,8 % | 0,23 % | 5,6 % | 121 bis 241 |

## Daten und Parameter

Das Modell wird aus einer volkswirtschaftlichen Gesamtrechnung geeicht. Die Eichtabelle liegt im Repo (`data/economy/england_1356.json`); ein Skript rechnet daraus die Parameter nach den Formeln des Ports, zuerst für das Jahr und dann für den Tag. Beträge für ganz England und für ein Jahr, vor dem Massstab.

| Grösse | Wert 1356 | Herkunft |
|---|---|---|
| BIP in laufenden Preisen | £ 4,52 Mio. | Bank of England, Millennium-Datensatz 3.1, Blatt A1 (Broadberry u. a.) |
| Bevölkerung | 2,583 Mio. | ebd. |
| Wertschöpfung Landwirtschaft / Gewerbe / Dienste | 45,5 / 28,8 / 25,7 % | Broadberry, Campbell, van Leeuwen 2013, Tab. 7A (1381) |
| Erwerbstätige Landwirtschaft / Gewerbe / Dienste | 57,2 / 19,2 / 23,6 % | ebd., Tab. 7B (1381) |
| Erwerbsquote Männer / Frauen | 97,1 / 43,0 % | ebd., S. 13–14 |
| Einkommensanteile Löhne / Bodenrente / übriges Kapital / Hausmieten | 61,0 / 16,5 / 21,6 / 0,9 % | Clark, Arbeitsmappe 2015, Jahrzehnt 1350–59 |
| Zins | 7,5 % | Clark, Microbes and Markets, Tab. 7 (1340er, ein Geschäft; für die 1350er gibt es keine Beobachtung) |
| Einnahmen der Krone | £ 105'544 | Bank of England, Blatt A26 (O'Brien und Hunt) |
| Münzgeld im Umlauf | £ 1,107 Mio. | Bank of England, Blatt A22 (Palma) |
| Wollausfuhr | 32'666 Sack zu £ 4,05, Zoll 40 s je Sack | Munro 2011, Tab. 1 und 14 (1356–60) |
| Tuchausfuhr | 9'061 Tuche | Munro 2011, Tab. 1 (1356–60) |
| Reales BIP, Preisniveau, Kroneinnahmen, Ausfuhrmenge der Jahre davor | 1280 bis 1356 | Bank of England, Blätter A1 und A26 |

Daraus abgeleitet: Wertschöpfung gleich BIP minus Wollzoll, Kapitalstock gleich Kapitaleinkommen geteilt durch Zins (2,8 Jahres-BIP), die Krone gibt aus, was sie einnimmt, direkte Steuer gleich Einnahmen minus Zoll, Konsum der Haushalte als Rest. Die Bodenrente hat im Modell keinen eigenen Platz und läuft als Gewinn der Betriebe.

### Annahmen ohne Quelle

Diese Eingaben braucht das Modell, und es gibt dafür keine gelesene Quelle. Sie sind Platzhalter und keine Aussage über die Geschichte.

| Eingabe | Wert | Was es an Quellen gäbe |
|---|---|---|
| Verhältnis Produktion zu Vorleistungen je Sektor | 4 / 2,5 / 5 | früheste Tabelle 1841 (Horrell, Humphries, Weale 1994), Bezahlschranke |
| Wer wem liefert (3×3) | gesetzt | ebd. |
| Personen je Betrieb | 4 | Sozialtabelle um 1290 (Campbell 2008), Bezahlschranke |
| Anteil der über 15-Jährigen | 62 % | Kopfsteuer 1377, nicht gelesen |
| Arbeitslose zum Start | 1 Person | keine |
| Abschreibung | 2,5 % im Jahr | keine |
| Einfuhr | so hoch wie die Ausfuhr, 30 / 70 / 0 | Einfuhrreihe erst ab 1560 |
| Was die Krone kauft | 20 / 30 / 50 | keine |
| Was investiert wird | 30 / 60 / 10, Hausbau 0 / 100 / 0 | keine |
| Münzgeld bei Haushalten / Betrieben | 80 / 20 | keine |
| Eigenkapital der Bank | 5 % des Münzgelds | keine |
| Ausland | konstant | keine |
| Verhaltensparameter (Tilgung 5 %, Bankregeln, Auslastung 85 %, Betriebsgrössen) | Werte des Originals | keine für das 14. Jahrhundert |
| Wert eines Tuchs 1356–60 | £ 1,751 | Munros Tabelle 8 beginnt 1371; Wert für 1371–75 |

Einrichtungen, die England 1356 nicht hatte, sind über Parameter stillgelegt: Mehrwertsteuer, Sozialversicherung, Gewinnsteuer, Arbeitslosengeld, Renten, Zinsregel der Zentralbank.

## Historische Prüfung

Geeicht ist das Modell auf England im Jahr 1356. Geprüft wird es an den 64 Jahren danach, ohne etwas nachzustellen: 20 Welten des Spiels, Tag für Tag gerechnet (`npm run economy:check`), gegen das reale BIP und den BIP-Preisindex von Broadberry u. a. Ein Jahr des Modells ist die Summe der 365 Tage bis zum 31. Dezember. Die Startposition steht für 1356; das Modell nach t Jahren wird also mit der Geschichte des Jahres 1356 + t verglichen. In allen 20 Welten wurde jeder Tag gerechnet.

| Reales BIP | Tagestakt (Mittel der Welten) | Spanne der Welten | Jahresmodell (Feature 3) | Geschichte |
|---|---|---|---|---|
| Wachstum pro Jahr | +0,17 % | −0,03 % bis +0,25 % | +0,06 % | −0,14 % |
| Standardabweichung des Jahreswachstums | 2,1 % | 1,0 % bis 2,7 % | 5,0 % | 6,7 % |
| Tiefstes Jahr (Start = 100) | 100 | 96 bis 100 | 86 | 77 |
| Höchstes Jahr | 118 | 116 bis 119 | 118 | 110 |
| Mittlerer Stand aller Jahre | 113,6 | 110,3 bis 115,5 | 106,0 | 92,8 |
| Stand nach 64 Jahren | 112 | 98 bis 117 | 104 | 91 |

| Preisniveau des BIP | Tagestakt (Mittel der Welten) | Spanne der Welten | Jahresmodell (Feature 3) | Geschichte |
|---|---|---|---|---|
| Stand nach 64 Jahren (Start = 100) | 171 (Median 163) | 113 bis 252 | 292 (Median 79), Spanne 17 bis 1'410 | 96 |
| Standardabweichung der Jahresteuerung | 0,9 % | 0,6 % bis 1,4 % | 9,9 % | 8,4 % |

| Die Tage | Mittel der Welten | Spanne der Welten |
|---|---|---|
| Tage, an denen sich das Preisniveau des Tages bewegt | 100,0 % | 100,0 % bis 100,0 % |
| Preisniveau am letzten Tag (Start = 100) | 172 (Median 164) | 114 bis 256 |
| Ohne Arbeit, Mittel aller Tage (Anteil der Erwerbspersonen) | 0,03 % | 0,00 % bis 0,28 % |
| Ohne Arbeit, schlechtester Tag | 1,3 % | 0,0 % bis 7,0 % |

| Jahre nach dem Start | Geschichte (1356 = 100) | Tagestakt, Mittel | Tagestakt, Startwert der laufenden Welt |
|---|---|---|---|
| 0 (1356) | 100 | 100 | 100 |
| 8 (1364) | 103 | 114 | 117 |
| 16 (1372) | 85 | 115 | 118 |
| 24 (1380) | 90 | 115 | 114 |
| 32 (1388) | 92 | 114 | 118 |
| 40 (1396) | 94 | 114 | 117 |
| 48 (1404) | 94 | 114 | 117 |
| 56 (1412) | 85 | 113 | 118 |
| 64 (1420) | 91 | 112 | 114 |

Was die Tabellen sagen:

- Das reale BIP steigt wie im Jahresmodell in wenigen Jahren auf die Grenze von etwa 118 und bleibt dann nahe daran. Der mittlere Stand ist 113,6 (Jahresmodell 106,0, Geschichte 92,8). Der Tagestakt liegt also weiter über der Geschichte als das Jahresmodell, weil er fast keine Abschwünge hat.
- Die Wirtschaft ist viel ruhiger als die Geschichte: Das Jahreswachstum streut um 2,1 % (Geschichte 6,7 %), die Jahresteuerung um 0,9 % (Geschichte 8,4 %).
- Der Rückgang der Geschichte fehlt weiterhin. Englands Bevölkerung sank nach 1356; im Modell ist sie fest.
- Das Preisniveau hat weiterhin keinen Anker, läuft aber nicht mehr davon: Nach 64 Jahren steht es in den 20 Welten bei 113 bis 252 (Jahresmodell 17 bis 1'410). Es steigt in jeder Welt.
- Fast niemand ist ohne Arbeit. Der schlechteste Tag der schlechtesten Welt hatte 7,0 % ohne Arbeit.
- Das Preisniveau des Tages bewegte sich an jedem Tag jeder Welt. Es ist mit der Tagesproduktion gewichtet und bewegt sich darum auch, wenn sich nur die Mengen ändern; neue Preise setzen pro Tag rund 93 Betriebe.
- Die Einfuhr sinkt von 3,3 % auf 2,0 % des realen BIP (Jahresmodell 2,9 %). Warum sie stärker sinkt als im Jahresmodell, ist nicht geklärt.

Abweichungen vom Probelauf des Vorschlags zum Tagestakt: Im Spiel ist der Plantag eines Betriebs seine Stelle in der Reihenfolge der Betriebe (statt eines Streuwerts daraus), und die Geschichte vor 1356 bleibt als 76 Jahreswerte gespeichert, die je für 365 Tage stehen. Mit denselben Plantagen eingestellt, lieferte das Probeprogramm über 401 Tage dieselben Beschäftigten, Arbeitslosen und Guthaben wie der Motor des Spiels. Die Zahlen oben sind im Spiel neu gemessen: 20 Welten über 64 Jahre statt 5 Welten über 30 Jahre. Dadurch wurden aus +0,43 % Wachstum, 0,02 % ohne Arbeit (höchster Stand 2,1 %) und einem Preisniveau von 124 bis 143 nach 30 Jahren die Werte oben; die Streuung des Jahreswachstums ist mit 2,1 % gleich.

Abweichungen vom Probelauf des Vorschlags zu Feature 3: Der Probelauf rechnete bei Ausfuhr und Zins noch mit den Werten von 1381. Gebaut ist durchgehend der Stand 1356 (Ausfuhr 1356–60, Zins 7,5 % statt 5 %), der Tuchwert kam als dreizehnte Annahme dazu, und die Wertschöpfung ist um den Wollzoll bereinigt, damit das Modell genau beim BIP der Quelle startet.

## Massstab 1 : 100

Das Modell rechnet die verkleinerte Volkswirtschaft: 25'832 statt 2,58 Millionen Menschen, davon 11'221 Erwerbspersonen, 2'804 Betriebe, ein BIP von £ 45'248 statt £ 4,52 Millionen. Alle Beträge im Ortsfenster sind in diesem Massstab.

## Grenzen

Der Motor ist ein Modell für eine heutige Volkswirtschaft. Unverändert eingesetzt heisst: Alles Folgende bleibt so, bis ein späteres Feature es ändert.

- Kein Boden und keine Ernte. Betriebe produzieren aus Arbeit, Kapital und Vorleistungen. Ernte und bestellte Fläche sind nicht verbunden.
- Personen ohne Familie. Wer im Modell nicht arbeitet, lebt von Geld des Staates. Darum bildet das Spiel die Erwerbspersonen ab; Kinder und Alte stecken in deren Konsum. Diese Zuordnung stammt nicht aus einem Papier.
- Eine Bank. Das Münzgeld erscheint als Guthaben bei ihr. Wie viel Kredit es damals gab, ist nicht messbar (Palma 2016, S. 22).
- Ein Land, ein Markt, kein Raum. Das Ausland ist eine Zahlenreihe.
- Feste Bevölkerung, Betriebe wie heute (ein Inhaber plus mindestens ein Angestellter), Verhaltensregeln heutiger Banken und Betriebe.
- Das Preisniveau hat keinen Anker.
- Die Verbindung der Regeln des Ports mit einem Tagestakt stammt nicht aus einem Papier.
- Keine Jahreszeiten: Jeder Tag ist gleich.
- Der Zufallsanteil der Erwartungen wird jeden Tag neu gezogen und trifft nur die Betriebe, die an diesem Tag planen.
- Die Jahressummen von Ausfuhr und Käufen der Krone schwanken etwas weniger als im Jahresmodell, weil die Umrechnung nur das Tagesniveau trifft.
- 13 Eingaben haben keine Quelle. Im Probelauf bewegten sie den mittleren Stand des BIP zwischen 104 und 109.
- Clark und Broadberry widersprechen sich in der Höhe des Einkommens; von Clark werden nur Verhältnisse verwendet.

## Technik

- Der Port ist auf einen festen Commit eingebunden (7291531). Eine kleine Hülle in Rust (`economy/`) lädt Parameter, rechnet Tage, gibt Kennzahlen heraus und speichert und lädt den Zustand. Sie enthält auch den Modelltyp «Tagestakt» mit den zwei ersetzten Regeln (`economy/src/clock.rs`). Sie wird zu einer WebAssembly-Datei gebaut, die der Weltserver lädt.
- Der Zustand der Volkswirtschaft (1,7 MB zum Start) liegt im Speicherstand der Welt und in dessen Prüfsumme. Speichern mitten im Monat, laden und weiterrechnen ergibt dasselbe wie durchrechnen.
- Die Tageszeilen der Gesamtrechnung bleiben nur für die letzten 365 Tage im Zustand. Die Zahlen jedes abgeschlossenen Kalenderjahrs bleiben als eine Zeile erhalten. Weiter wachsen nur die Reihen von BIP und Teuerung, um 16 Byte pro Tag.
- Die WebAssembly-Fassung rechnet Bit für Bit dasselbe wie die native Fassung.
- Ein Tag kostet im Spiel rund 10 Millisekunden Rechenzeit; ein Spieltag dauert 240 Sekunden.
- Eine Welt, die vor dem Tagestakt gespeichert wurde, rechnet England beim Laden ab 1356 neu bis zu ihrem heutigen Tag. Geprobt mit einer Welt von 2'800 Tagen: 19,5 Sekunden, und die Welt hat danach dieselbe Prüfsumme wie eine, die den Tagestakt vom ersten Tag an hatte.

## Quellen

- Poledna, Miess, Hommes, Rabitsch (2023): Economic forecasting with an agent-based model. European Economic Review 151, 104306.
- port-beforeit (Rust-Port von BeforeIT.jl, Apache-2.0): https://github.com/ramonfueglister/port-beforeit
- Dawid, Gemkow, Harting, van der Hoog, Neugart (2011): The Eurace@Unibi Model, Model v1.0 User Manual. https://core.ac.uk/download/16690523.pdf (Zeitstruktur des Tagestakts)
- Pichler, Pangallo, del Rio-Chanona, Lafond, Farmer: In and out of lockdown: Propagation of supply and demand shocks in a dynamic input-output model. arXiv 2102.09608 (Fussnote 15: Umrechnung auf den Tag)
- Wiese u. a. (2024): arXiv 2409.18760, Abschnitt 3.4 (die Periode folgt der Häufigkeit der Datenquellen)
- Broadberry, Campbell, van Leeuwen (2013): When did Britain industrialise? Explorations in Economic History 50(1). https://pureadmin.qub.ac.uk/ws/portalfiles/portal/1640964/EEH_Sectoral_shares_paper.pdf
- Thomas, Dimsdale (2017): A millennium of macroeconomic data for the UK, Version 3.1. Bank of England. https://www.bankofengland.co.uk/statistics/research-datasets
- Clark (2015): National income, prices, wages, land rents, population, England, 1209–1869 (Arbeitsmappe). https://faculty.econ.ucdavis.edu/faculty/gclark/data.html
- Clark: Microbes and markets: was the Black Death an economic revolution? https://scispace.com/pdf/microbes-and-markets-was-the-black-death-an-economic-gecu8oa7fi.pdf
- Munro (2011): Statistical tables on medieval and early-modern textiles. https://www.economics.utoronto.ca/munro5/MedTextileStats.pdf
- Palma (2016): Reconstruction of annual money supply over the long run. EHES Working Paper 94. https://www.ehes.org/wp/EHES_94.pdf
