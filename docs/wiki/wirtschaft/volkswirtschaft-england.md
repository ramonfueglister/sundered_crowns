# Volkswirtschaft England

**Status:** Beschlossen und gebaut (freigegeben am 15.11.2026; in der laufenden Welt, sobald der Weltserver neu aufgespielt ist) · **Bereich:** Wirtschaft · **Stand:** 2026-11-15

> England läuft in der Welt als eine ganze Volkswirtschaft: Personen, Betriebe, eine Bank, die Krone und das Ausland, jeder mit eigener Bilanz. Gerechnet wird sie einmal pro Spieljahr von einem wissenschaftlichen Modell, das unverändert übernommen ist.

Das Feature ist so gebaut, wie es vorgeschlagen war. Wo der Bau vom Probelauf des Vorschlags abweicht, steht es unter «Historische Prüfung». Alle Zahlen auf dieser Seite stammen aus dem Spielcode.

## Das Feature

Bisher kannte das Spiel nur Ernte und Acker je Ort. Dieses Feature bringt den Motor des künftigen Wirtschaftssystems in die Welt: ein agentenbasiertes Modell einer ganzen Volkswirtschaft. Es rechnet für England, geeicht auf das Startjahr 1356, am 1. Januar jedes Spieljahrs ein Jahr weiter.

Der Motor ist Ramons Rust-Port von BeforeIT.jl, der Umsetzung des Modells von Poledna, Miess, Hommes und Rabitsch (2023) durch die Banca d'Italia. Der Port ist als feste Abhängigkeit eingebunden. Keine Zeile davon ist kopiert oder geändert, und das Spiel fügt keine eigene Regel hinzu.

Nicht dazu gehören: eine Verbindung zu Ernte, bestellter Fläche oder den Menschen der Orte, ein zweites Land, Handel zwischen Ländern und jeder Eingriff des Spielers. Die Volkswirtschaft läuft für sich.

## Im Spiel

Im Ortsfenster jedes englischen Orts (162 Orte) steht der Abschnitt «Volkswirtschaft England». Er zeigt für ganz England die Zahlen des laufenden Spieljahrs, im Massstab 1:100:

| Zeile | Bedeutung | Start 1356 |
|---|---|---|
| Reales BIP | Wirtschaftsleistung des Jahres in Pfund, zu Preisen von 1356 | £ 45'248 |
| Stand (1356 = 100) | reales BIP gegenüber dem Startjahr | 100,0 |
| Preisniveau (1356 = 100) | Preise aller Güter des BIP gegenüber dem Startjahr | 100,0 |
| Konsum der Haushalte | zu Preisen von 1356 | £ 40'189 |
| Ausgaben der Krone | Käufe der Krone | £ 1'055 |
| Investitionen | Anlagen der Betriebe und Hausbau | £ 3'350 |
| Ausfuhr | Wolle und Tuch, einschliesslich Ausfuhrzoll | £ 2'135 |
| Einfuhr | | £ 1'482 |
| Beschäftigte | Angestellte und Inhaber der Betriebe | 11'220 |
| Ohne Arbeit | Erwerbspersonen ohne Arbeitgeber | 1 |
| Münzgeld der Haushalte | Guthaben aller Haushalte, zu laufenden Preisen | £ 8'853 |
| Münzgeld der Betriebe | Guthaben der Betriebe | £ 2'213 |

In der laufenden Welt (Startwert 1356) folgen darauf zum Beispiel: 1357 reales BIP £ 47'847 (Stand 105,7), Preisniveau 97,6; 1358 £ 51'861 (114,6), Preisniveau 102,3; 1360 £ 53'352 (117,9).

Orte ausserhalb Englands zeigen den Abschnitt nicht. Beeinflussen kann der Spieler nichts davon. Kann der Motor ein Jahr nicht rechnen, bleibt die Volkswirtschaft mit dem Stand des Vorjahrs stehen und der Abschnitt nennt den Grund; die Welt läuft weiter. In keinem Lauf ist das vorgekommen.

## Das Modell

Das Modell beschreibt eine Volkswirtschaft aus einzelnen Handelnden, die jede Periode in fester Reihenfolge entscheiden und auf Märkten zusammentreffen. Jeder Handelnde führt eine Bilanz, und jede Zahlung des einen ist die Einnahme eines anderen (bestands- und stromgrössenkonsistent). Die Regeln sind die Gleichungen A.1 bis A.84 im Anhang des Papiers. Die wichtigsten:

| Wer | Was er jedes Jahr tut |
|---|---|
| Betriebe (2'804, in drei Sektoren) | erwarten Nachfrage und Preise aus der Vergangenheit, setzen Preis und Menge, stellen ein oder entlassen, kaufen Vorleistungen und Anlagen, nehmen Kredit auf. Produktion aus Arbeit, Kapital und Vorleistungen in festem Verhältnis (Leontief) |
| Personen (11'221 Erwerbspersonen) | arbeiten für einen Betrieb oder suchen Arbeit, erhalten Lohn oder Gewinn, konsumieren einen festen Anteil ihres Einkommens, sparen den Rest als Guthaben |
| Bank (eine) | hält die Guthaben, vergibt Kredite an Betriebe nach Eigenkapital- und Beleihungsregeln |
| Krone | nimmt Steuern und Zoll ein, kauft Güter; ihre Ausgaben schwanken nach einer geschätzten Zeitreihe |
| Ausland | kauft Ausfuhrgüter und liefert Einfuhrgüter nach geschätzten Zeitreihen |

Die Märkte für Kredit, Arbeit und Güter sind Suchmärkte: Käufer suchen sich Anbieter, bevorzugt günstige und grosse, und nicht jeder findet, was er sucht. Daraus entstehen Lager, unbesetzte Stellen und Schwankungen, ohne dass ein Gleichgewicht vorgeschrieben wird.

Eine Periode des Modells ist im Spiel ein Jahr. Das Original rechnet in Quartalen; die historischen Reihen für England sind jährlich.

## Daten und Parameter

Das Modell wird aus einer volkswirtschaftlichen Gesamtrechnung geeicht. Die Eichtabelle liegt im Repo (`data/economy/england_1356.json`); ein Skript rechnet daraus die Parameter nach den Formeln des Ports. Beträge für ganz England, vor dem Massstab.

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

Geeicht ist das Modell auf England im Jahr 1356. Geprüft wird es an den 64 Jahren danach, ohne etwas nachzustellen: 20 Welten des Spiels, Tag für Tag von 1356 bis 1420 gerechnet (`npm run economy:check`), gegen das reale BIP und den BIP-Preisindex von Broadberry u. a.

| Reales BIP | Modell (Mittel der Welten) | Spanne der Welten | Geschichte |
|---|---|---|---|
| Wachstum pro Jahr | +0,06 % | −0,36 % bis +0,25 % | −0,14 % |
| Standardabweichung des Jahreswachstums | 5,0 % | 3,5 % bis 6,6 % | 6,7 % |
| Tiefstes Jahr (1356 = 100) | 86 | 73 bis 100 | 77 |
| Höchstes Jahr | 118 | 116 bis 119 | 110 |
| Mittlerer Stand aller Jahre | 106,0 | 95,9 bis 113,7 | 92,8 |
| Stand 1420 | 104 | 80 bis 117 | 91 |

| Preisniveau | Modell (Mittel der Welten) | Spanne der Welten | Geschichte |
|---|---|---|---|
| Stand 1420 (1356 = 100) | 292 (Median 79) | 17 bis 1'410 | 96 |
| Standardabweichung der Jahresteuerung | 9,9 % | 7,8 % bis 11,7 % | 8,4 % |

| Jahr | Geschichte | Modell, Mittel | Modell, laufende Welt |
|---|---|---|---|
| 1356 | 100 | 100 | 100 |
| 1364 | 103 | 106 | 116 |
| 1372 | 85 | 109 | 113 |
| 1380 | 90 | 108 | 116 |
| 1388 | 92 | 108 | 111 |
| 1396 | 94 | 104 | 113 |
| 1404 | 94 | 104 | 110 |
| 1412 | 85 | 105 | 110 |
| 1420 | 91 | 104 | 117 |

Was die Tabellen sagen:

- Das reale BIP bleibt in einem Band wie in der Geschichte, liegt im Mittel aber rund 14 % höher. Die Betriebe starten mit 85 % Auslastung und füllen sie in wenigen Jahren auf; bei etwa 118 ist Schluss.
- Der Rückgang der Geschichte fehlt. Englands Bevölkerung sank nach 1356 weiter; im Modell ist sie fest.
- Das Preisniveau hat keinen Anker. Manche Welten inflationieren, manche deflationieren; das Mittel ist von wenigen Ausreissern bestimmt.

Abweichungen vom Probelauf des Vorschlags: Der Probelauf rechnete bei Ausfuhr und Zins noch mit den Werten von 1381. Gebaut ist durchgehend der Stand 1356 (Ausfuhr 1356–60, Zins 7,5 % statt 5 %), der Tuchwert kam als dreizehnte Annahme dazu, und die Wertschöpfung ist um den Wollzoll bereinigt, damit das Modell genau beim BIP der Quelle startet. Dadurch wurden aus +0,17 % Wachstum, Stand 109,0 und Preisniveau 294 des Vorschlags die Werte oben.

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
- 13 Eingaben haben keine Quelle. Im Probelauf bewegten sie den mittleren Stand des BIP zwischen 104 und 109.
- Clark und Broadberry widersprechen sich in der Höhe des Einkommens; von Clark werden nur Verhältnisse verwendet.

## Technik

- Der Port ist auf einen festen Commit eingebunden (7291531). Eine kleine Hülle in Rust (`economy/`) lädt Parameter, rechnet Perioden, gibt Kennzahlen heraus und speichert und lädt den Zustand. Sie wird zu einer WebAssembly-Datei gebaut, die der Weltserver lädt.
- Der Zustand der Volkswirtschaft (1,7 MB) liegt im Speicherstand der Welt und in dessen Prüfsumme. Speichern, laden und weiterrechnen ergibt dasselbe wie durchrechnen.
- Die WebAssembly-Fassung rechnet Bit für Bit dasselbe wie die native Fassung des Ports.
- Eine Welt, die vor diesem Feature gespeichert wurde, bekommt die Volkswirtschaft beim Laden, mit allen Jahren, die sie schon gesehen hat.

## Quellen

- Poledna, Miess, Hommes, Rabitsch (2023): Economic forecasting with an agent-based model. European Economic Review 151, 104306.
- port-beforeit (Rust-Port von BeforeIT.jl, Apache-2.0): https://github.com/ramonfueglister/port-beforeit
- Broadberry, Campbell, van Leeuwen (2013): When did Britain industrialise? Explorations in Economic History 50(1). https://pureadmin.qub.ac.uk/ws/portalfiles/portal/1640964/EEH_Sectoral_shares_paper.pdf
- Thomas, Dimsdale (2017): A millennium of macroeconomic data for the UK, Version 3.1. Bank of England. https://www.bankofengland.co.uk/statistics/research-datasets
- Clark (2015): National income, prices, wages, land rents, population, England, 1209–1869 (Arbeitsmappe). https://faculty.econ.ucdavis.edu/faculty/gclark/data.html
- Clark: Microbes and markets: was the Black Death an economic revolution? https://scispace.com/pdf/microbes-and-markets-was-the-black-death-an-economic-gecu8oa7fi.pdf
- Munro (2011): Statistical tables on medieval and early-modern textiles. https://www.economics.utoronto.ca/munro5/MedTextileStats.pdf
- Palma (2016): Reconstruction of annual money supply over the long run. EHES Working Paper 94. https://www.ehes.org/wp/EHES_94.pdf
