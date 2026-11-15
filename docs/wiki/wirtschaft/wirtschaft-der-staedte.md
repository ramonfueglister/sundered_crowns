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

Keine Stadt hat eigene Daten. Zwei Annahmen, beide in der Eichtabelle (`data/economy/england_1356.json`) als Annahme markiert:

| Annahme | Wert | Was sie bedeutet |
|---|---|---|
| Struktur jeder Stadt | England 1356 | Jede Stadt ist Englands Eichtabelle im Verhältnis ihrer Einwohner zu Englands Einwohnern (2'583'180). Kairo ist England mit mehr Menschen |
| Zoll zwischen Städten | 0 | Englands Wollzoll von 1356 gilt nicht für den Handel zwischen Städten. Die Krone einer Stadt lebt von der direkten Steuer allein. Am Start führt jede Stadt so viel ein wie aus: 3,3 % ihrer Produktion |

Jede Stadt hat einen eigenen Zufallsstartwert aus dem Startwert der Welt und ihrem Ort.

## Probelauf im Spiel

Acht Welten des Spiels über fünf Jahre, Tag für Tag gerechnet (`npm run economy:check 5 8`). In allen acht wurde jeder Tag gerechnet.

| Alle Städte zusammen, Jahr 5 | Mittel der Welten | Spanne der Welten |
|---|---|---|
| Reale Produktion (Start = 100) | 104,3 | 100,2 bis 107,7 |
| Preisniveau (Start = 100) | 104,3 | 103,6 bis 105,5 |
| Ausfuhr = Einfuhr, Anteil an der Produktion | 2,55 % | 2,25 % bis 2,86 % |
| Ohne Arbeit, Mittel aller Städte und Tage | 0,91 % | 0,33 % bis 1,73 % |
| Ohne Arbeit, schlechteste Stadt an ihrem schlechtesten Tag | 5,6 % | 2,2 % bis 10,0 % |
| Stadt mit der tiefsten Produktion (ihr Start = 100) | 97,8 | 91,7 bis 103,5 |
| Stadt mit der höchsten Produktion | 111,9 | 106,1 bis 114,4 |

Die Bücher (die Identitäten jeder Stadt und die Bücher der Händler, einmal im Monat geprüft) weichen höchstens um 1 · 10⁻¹³ ihres Betrags ab.

Was die Tabelle sagt:

- Alle Städte zusammen wachsen leicht, und die Preise steigen um knapp 1 % im Jahr. Ausfuhr und Einfuhr aller Städte sind in jedem Jahr gleich.
- Grosse und kleine Städte stehen nach fünf Jahren nahe beieinander: Kairo bei 105, die kleinsten bei 102 bis 103. In einer ersten Fassung der Regel 4 fielen die grossen Städte zurück (Kairo auf 89), weil jede Stadt als ein einziger Verkäufer zählte und Kairo darum nur für 1,7 % seiner Produktion angefragt wurde, die kleinsten Städte für 3,9 %. Das ist korrigiert.
- Der Handel sinkt von 3,3 % auf 2,55 % der Produktion. Der Grund liegt im Gütermarkt des Modells: Der Stand der Händler ist dort ein Verkäufer unter allen Betrieben der Stadt. In Kairo verkauft er 70 bis 80 % seiner Ware, in den kleinsten Städten fast alles.

### Über 30 Jahre: offener Befund

Vier Welten des Spiels über 30 Jahre (`npm run economy:check 30 4`):

| Alle Städte zusammen | Jahr 5 | Jahr 10 | Jahr 20 | Jahr 30 | Spanne der Welten im Jahr 30 |
|---|---|---|---|---|---|
| Reale Produktion (Start = 100), Mittel | 102,8 | 101,9 | 100,1 | 97,1 | 74,8 bis 110,6 |
| Welt mit dem Startwert 1356 | 100,2 | 97,0 | 90,0 | 74,8 | |

Über die 30 Jahre sind im Mittel 4,9 % ohne Arbeit (1,4 % bis 10,6 % je Welt), die schlechteste Stadt an ihrem schlechtesten Tag 23,8 % (bis 39,5 %). Die tiefste Stadt steht im Jahr 30 bei 78 (46 bis 101).

**Über Jahrzehnte sinken die verbundenen Städte, eine nach der anderen, und kommen nicht zurück.** Städte, die für sich allein rechnen, tun das nicht (nach 30 Jahren 107 bis 109, 2,5 % ohne Arbeit). In einer gesunkenen Stadt fehlt die Nachfrage, nichts sonst: Die Bank könnte leihen, das Kapital ist da. Die Betriebe verkaufen weniger, planen weniger, entlassen; wer keine Arbeit hat, hat in dieser Eichung kein Einkommen und kauft nichts; und die Preise steigen trotzdem weiter.

Der Grund liegt im geschlossenen Kreislauf. Die Preise steigen im Modell um etwa 0,75 % im Jahr, weil nichts das Preisniveau hält. Eine Stadt für sich verkauft dem Ausland des Modells jedes Jahr mehr, als sie dort kauft, und bekommt dafür Münzgeld, das aus dem Nichts kommt; ihr Geld hält mit den Preisen Schritt. Die Händler haben dieses Loch geschlossen. Jetzt ist das Münzgeld aller Städte fest, die Preise steigen weiter, und nach 30 Jahren kauft das Geld ein Viertel weniger. Die Haushalte behalten ihr Geld, die Betriebe verlieren ihres.

Das lässt sich nicht an den Regeln der Händler beheben. Es braucht ein eigenes Feature: etwas, das die Preise hält oder das Geld wachsen oder ausgeben lässt. Ein Spieljahr dauert einen echten Tag; in der laufenden Welt würde sich der Befund also nach einigen Wochen zeigen.

Nichts davon ist an der Geschichte geprüft, und die langen Läufe sind wenige (zwei bis vier Welten).

## Massstab 1 : 100

Jede Stadt rechnet verkleinert. London: 609 statt 60'862 Menschen, davon 266 Erwerbspersonen, 67 Betriebe, ein BIP von £ 1'066. Alle Beträge im Ortsfenster sind in diesem Massstab.

## Grenzen

- Über Jahrzehnte sinken die verbundenen Städte (siehe «Über 30 Jahre: offener Befund»). Offen.
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
