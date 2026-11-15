# Wirtschaft der Städte

**Status:** Beschlossen (am 15.11.2026 entschieden und gebaut; in der laufenden Welt, sobald der Weltserver neu aufgespielt ist) · **Bereich:** Wirtschaft · **Stand:** 2026-11-15

> Jede der grössten Städte der Welt ist eine eigene, vollständige Volkswirtschaft: Personen, Betriebe, eine Bank, eine Krone und ein Ausland, jeder mit eigener Bilanz. Das Ausland einer Stadt sind die anderen Städte: Händler kaufen in einer Stadt und verkaufen am nächsten Tag in einer anderen. Gerechnet wird an jedem Spieltag.

Diese Seite beschreibt Feature 5. Es ersetzt im Spiel die [Volkswirtschaft England](volkswirtschaft-england.md): England rechnet nicht mehr als ein Ganzes. Modell, Tagestakt und Eichtabelle sind dieselben und stehen auf jener Seite. Alle Zahlen hier stammen aus dem Spielcode.

## Das Feature

Das Modell, das bisher ein Land rechnete, rechnet jetzt eine Stadt. Was das Modell «Land» nennt, ist im Spiel eine Stadt vor der Moderne mit ihrem Umland. 29 solche Volkswirtschaften laufen nebeneinander und sind über den Handel verbunden.

Nicht dazu gehören: Entfernungen und Transportkosten, Zölle zwischen Städten, eigene Daten je Stadt, eine Verbindung zu den Personen der Städte, zu Ernte und Acker, zu den Reichen und jeder Eingriff des Spielers. Die Wirtschaft läuft für sich.

## Im Spiel

Im Ortsfenster eines Orts mit einer dieser Städte steht der Abschnitt «Wirtschaft der Stadt». Er zeigt die Summen der letzten 365 Tage bis heute und das Preisniveau von heute, im Massstab 1:100. Ist das Fenster offen, werden die Zahlen an jedem neuen Spieltag neu geholt.

| Zeile | Bedeutung | London am Start |
|---|---|---|
| Reales BIP | Wirtschaftsleistung der letzten 365 Tage in Pfund, zu Preisen des Starts | £ 1'066 |
| Stand (Start = 100) | reales BIP der letzten 365 Tage gegenüber dem Start | 100,0 |
| Preisniveau heute (Start = 100) | Preise aller Betriebe der Stadt von heute, gewichtet mit ihrer Produktion von heute | 100,0 |
| Konsum der Haushalte | letzte 365 Tage | £ 961 |
| Ausgaben der Krone | Käufe der Krone der Stadt, letzte 365 Tage | £ 25 |
| Investitionen | Anlagen der Betriebe und Hausbau, letzte 365 Tage | £ 80 |
| Ausfuhr in andere Städte | was die Händler in der Stadt gekauft haben, letzte 365 Tage | £ 35 |
| Einfuhr aus anderen Städten | was die Händler in der Stadt verkauft haben, letzte 365 Tage | £ 35 |
| Beschäftigte | Angestellte und Inhaber der Betriebe, heute | 265 |
| Ohne Arbeit | Erwerbspersonen ohne Arbeitgeber, heute | 1 |
| Münzgeld der Haushalte | Guthaben aller Haushalte heute | £ 209 |
| Münzgeld der Betriebe | Guthaben der Betriebe heute | £ 52 |

Solange noch keine 365 Tage gerechnet sind, füllt die Startposition den Rest der Summe auf.

Orte ohne eine dieser Städte zeigen den Abschnitt nicht. Das gilt auch für englische Orte wie York, die bisher die Volkswirtschaft England zeigten. Kann der Motor einen Tag nicht rechnen, bleiben alle Städte mit dem Stand des Vortags stehen und der Abschnitt nennt Datum und Grund; die Welt läuft weiter. In keinem Lauf ist das vorgekommen.

In der laufenden Welt beginnen die Städte am Tag der Umstellung mit der Startposition von 1356. Vergangene Tage werden für sie nicht nachgerechnet.

## Die Städte

Es sind die 30 grössten Städte der Welt im Jahr 1356 nach Chandler, dieselben, deren Einwohner als Personen in der Welt leben ([Einwohner der grössten Städte](../personen/einwohner-der-staedte.md)). Texcoco und Tenayuca liegen im selben Ort der Karte und sind eine Volkswirtschaft. Es sind also 29.

Kairo, Paris, Fès, Sarai, Täbris, Bagdad, Venedig, Damiette, Schiras, Konstantinopel, Damaskus, Sevilla, Aleppo, Isfahan, Genua, Texcoco, Granada, London, Prag, Gent, Niani, Alexandria, Caffa, Trapezunt, Mailand, Tlemcen, Köln, Marrakesch, Soltaniyeh.

Zusammen haben sie 2'572'165 Einwohner. Im Massstab 1:100 sind das 11'228 Erwerbspersonen und 2'791 Betriebe mit einem realen BIP von £ 45'055 im Jahr.

## Das Modell

Jede Stadt rechnet das Modell von Poledna u. a. (2023) im Tagestakt, wie auf der Seite [Volkswirtschaft England](volkswirtschaft-england.md) beschrieben. Genau eine Regel ist ersetzt: das Ausland.

Im Modell ist das Ausland zwei Zufallsreihen, eine Nachfrage nach Ausfuhr und ein Angebot an Einfuhr. Nichts verbindet die beiden. Eine Stadt für sich würde an niemanden verkaufen und von nirgendwo kaufen, und ihre Forderungen ans Ausland wüchsen, ohne dass sie jemand schuldet. An die Stelle der Zufallsreihen treten Händler zwischen den Städten.

1. Was die Händler an einem Tag in einer Stadt kaufen, liegt am nächsten Tag an ihren Ständen in den Städten, für die es bestellt war, Gut für Gut.
2. Sie verkaufen zu dem, was die Ware sie gekostet hat. Ihr Vermögen, Geld in allen Städten plus Lager zum Einkaufswert, ändert sich darum nie: Zwischen den Städten entsteht und verschwindet kein Geld.
3. In jeder Stadt wollen sie jeden Morgen so viel anbieten, wie die Eichung der Stadt als Einfuhr vorsieht, als Anteil an der Produktion der Stadt. Eine Bestellung von heute wird morgen gekauft und liegt übermorgen am Stand. Sie bestellen also, was bis dahin fehlen wird.
4. Eine Bestellung wird auf die Herkunftsstädte verteilt, als wählten die Händler unter den Betrieben aller anderen Städte, so wie im Modell jeder Käufer seinen Verkäufer wählt: zur Hälfte nach dem Preis, zur Hälfte nach dem Angebot (Produktion plus Lager). Eine Stadt zählt also mit der Zahl ihrer Betriebe und deren Angebot, nicht mit dem, was sie verkauft.
5. Eine Stadt führt die Güter aus, die bei ihr bestellt werden.

Die Regeln 3 und 5 sind eigene Festlegungen dieses Spiels. Das Modell kennt keine verbundenen Volkswirtschaften, und nach einer Quelle dafür wurde nicht gesucht. Eine Reise dauert zwischen zwei beliebigen Städten einen Tag und kostet nichts.

## Daten und Parameter

Keine Stadt hat eigene Daten. Drei Annahmen, alle in der Eichtabelle (`data/economy/england_1356.json`) als Annahme markiert:

| Annahme | Wert | Was sie bedeutet |
|---|---|---|
| Struktur jeder Stadt | England 1356 | Jede Stadt ist Englands Eichtabelle im Verhältnis ihrer Einwohner zu Englands Einwohnern (2'583'180). Kairo ist England mit mehr Menschen |
| Zoll zwischen Städten | 0 | Englands Wollzoll von 1356 gilt nicht für den Handel zwischen Städten. Die Krone einer Stadt lebt von der direkten Steuer allein. Am Start führt jede Stadt so viel ein wie aus: 3,3 % ihrer Produktion |
| Unterstützung ohne Arbeit | 55 % des Lohns nach Steuern | Wer keine Arbeit hat, bekommt von der Krone der Stadt diesen Teil des letzten Lohns: die Regel des Modells mit dem Wert des Originalcodes. 1356 gab es kein Arbeitslosengeld; der Eintrag ist vorläufig. Siehe [Arbeitslosengeld der Städte](arbeitslosengeld-der-staedte.md) |

Jede Stadt hat einen eigenen Zufallsstartwert aus dem Startwert der Welt und ihrem Ort.

## Probelauf im Spiel

Acht Welten des Spiels über fünf Jahre, Tag für Tag gerechnet (`npm run economy:check 5 8`). In allen acht wurde jeder Tag gerechnet.

| Alle Städte zusammen, Jahr 5 | Mittel der Welten | Spanne der Welten |
|---|---|---|
| Reale Produktion (Start = 100) | 105,0 | 104,3 bis 106,7 |
| Preisniveau (Start = 100) | 103,7 | 102,6 bis 104,5 |
| Ausfuhr = Einfuhr, Anteil an der Produktion | 2,57 % | 2,46 % bis 2,76 % |
| Ohne Arbeit, Mittel aller Städte und Tage | 0,51 % | 0,39 % bis 0,63 % |
| Ohne Arbeit, schlechteste Stadt an ihrem schlechtesten Tag | 2,9 % | 2,6 % bis 3,6 % |
| Stadt mit der tiefsten Produktion (ihr Start = 100) | 100,8 | 99,1 bis 101,8 |
| Stadt mit der höchsten Produktion | 111,2 | 107,8 bis 114,5 |

Die Bücher (die Identitäten jeder Stadt und die Bücher der Händler, einmal im Monat geprüft) weichen höchstens um 1 · 10⁻¹³ ihres Betrags ab.

Was die Tabelle sagt:

- Alle Städte zusammen wachsen leicht, und die Preise steigen um knapp 1 % im Jahr. Ausfuhr und Einfuhr aller Städte sind in jedem Jahr gleich.
- Grosse und kleine Städte stehen nach fünf Jahren nahe beieinander. In einer ersten Fassung der Regel 4 fielen die grossen Städte zurück (Kairo auf 89), weil jede Stadt als ein einziger Verkäufer zählte und Kairo darum nur für 1,7 % seiner Produktion angefragt wurde, die kleinsten Städte für 3,9 %. Das ist korrigiert.
- Der Handel sinkt von 3,3 % auf 2,57 % der Produktion. Der Grund liegt im Gütermarkt des Modells: Der Stand der Händler ist dort ein Verkäufer unter allen Betrieben der Stadt. In Kairo verkauft er 70 bis 80 % seiner Ware, in den kleinsten Städten fast alles.

### Über 30 Jahre

Vier Welten des Spiels über 30 Jahre (`npm run economy:check 30 4`):

| Alle Städte zusammen | Jahr 5 | Jahr 10 | Jahr 20 | Jahr 30 | Spanne der Welten im Jahr 30 |
|---|---|---|---|---|---|
| Reale Produktion (Start = 100), Mittel | 105,1 | 107,0 | 108,0 | 107,2 | 105,3 bis 108,6 |
| Welt mit dem Startwert 1356 | 104,3 | 106,4 | 109,2 | 107,2 | |

Über die 30 Jahre sind im Mittel 0,7 % ohne Arbeit, die schlechteste Stadt an ihrem schlechtesten Tag 4,9 % (bis 5,9 %). Die tiefste Stadt steht im Jahr 30 bei 101 (100 bis 102).

**Ohne die Unterstützung für Menschen ohne Arbeit sanken die verbundenen Städte über Jahrzehnte, eine nach der anderen, und kamen nicht zurück** (Produktion im Jahr 30 im Mittel 97, in einer Welt 75; einzelne Städte bei der Hälfte). In einer gesunkenen Stadt fehlte die Nachfrage, nichts sonst: Wer entlassen war, hatte kein Einkommen und kaufte nichts, die Betriebe verkauften weniger und entliessen weiter. Die Ursache lag in unserer Eichung, die diese Regel des Modells ausgeschaltet hatte. Seit Feature 6 ist sie eingeschaltet: [Arbeitslosengeld der Städte](arbeitslosengeld-der-staedte.md), dort stehen die Zahlen vorher und jetzt.

Geblieben ist: Die Preise steigen um rund 0,7 % im Jahr, weil nichts im Modell das Preisniveau hält, und das Münzgeld aller Städte zusammen ist fest.

Nichts davon ist an der Geschichte geprüft, und die langen Läufe sind wenige (vier Welten).

## Massstab 1 : 100

Jede Stadt rechnet verkleinert. London: 609 statt 60'862 Menschen, davon 266 Erwerbspersonen, 67 Betriebe, ein BIP von £ 1'066. Alle Beträge im Ortsfenster sind in diesem Massstab.

## Grenzen

- Die Unterstützung für Menschen ohne Arbeit gab es 1356 nicht; sie ist vorläufig eingestellt (siehe [Arbeitslosengeld der Städte](arbeitslosengeld-der-staedte.md)). Ohne sie sinken die verbundenen Städte über Jahrzehnte.
- Die Preise steigen dauernd leicht, und das Münzgeld aller Städte zusammen wächst nicht mit.
- Alle Städte haben Englands Struktur und unterscheiden sich nur in Grösse und Zufall.
- Keine Entfernung: Jede Stadt ist von jeder einen Tag entfernt, auch Texcoco in Mexiko und Niani in Mali von Paris. Transport kostet nichts.
- Das Umland steckt in der Volkswirtschaft der Stadt, weil die Eichung die eines ganzen Landes ist. Orte ohne eine dieser Städte haben keine Wirtschaft.
- Die Volkswirtschaften sind nicht mit den Personen der Städte verbunden, nicht mit Ernte und Acker und nicht mit den Reichen. Die Krone einer Stadt ist der Staat des Modells und kein Reich des Spiels.
- Die Regeln der Händler stammen nicht aus einem Papier.
- Das Modell führt die Ausfuhr nicht Gut für Gut. Was die Händler kaufen, gilt als in der Mischung gekauft, in der sie bestellt haben.
- Eine Bestellung wird nur so weit erfüllt, wie die Betriebe der Herkunftsstadt Ware haben.
- Alle Grenzen des Modells von der Seite [Volkswirtschaft England](volkswirtschaft-england.md) gelten für jede Stadt.

## Technik

- Der Zustand aller Städte und der Händler liegt als ein Block im Speicherstand der Welt und in dessen Prüfsumme: 1,85 MB zum Start, rund 6 MB nach dem ersten Jahr, danach 16 Byte mehr pro Stadt und Tag. Speichern, laden und weiterrechnen ergibt dasselbe wie durchrechnen.
- Die WebAssembly-Fassung rechnet Bit für Bit dasselbe wie die native Fassung (Test mit drei Städten).
- Ein Tag aller 29 Städte kostet im Spiel rund 15 Millisekunden Rechenzeit; ein Spieltag dauert 240 Sekunden.
- Eine Welt, die mit der Volkswirtschaft England gespeichert wurde, gründet die Städte beim Laden an ihrem heutigen Tag. Geprobt mit einer Welt von 400 Tagen: geladen in 0,6 Sekunden, 60 Tage weitergerechnet, gespeichert und mit derselben Prüfsumme wieder geladen.

## Quellen

- Poledna, Miess, Hommes, Rabitsch (2023): Economic forecasting with an agent-based model. European Economic Review 151, 104306.
- port-beforeit (Rust-Port von BeforeIT.jl, Apache-2.0): https://github.com/ramonfueglister/port-beforeit
- Stadtgrössen: Reba, Reitsma & Seto 2016 (Chandler 1987), siehe [Einwohner der grössten Städte](../personen/einwohner-der-staedte.md).
- Alle Quellen der Eichtabelle: [Volkswirtschaft England](volkswirtschaft-england.md).
