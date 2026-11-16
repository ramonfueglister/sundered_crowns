# Haushalt der Familie

**Status:** Im Spiel (am 16.11.2026 freigegeben und gebaut; seit dem 16.11.2026 in der laufenden Welt) · **Bereich:** Wirtschaft · **Stand:** 2026-11-16

> Die Familie ist die Kasse. Was ihre Erwerbstätigen verdienen, ist das Einkommen aller, und was sie ausgibt, verbrauchen alle: Erwachsene einen ganzen Korb, Kinder unter 15 einen halben. Eine Frau ohne Mann arbeitet immer.

Diese Seite beschreibt Feature 11. Es baut auf den [Personen der Wirtschaft](personen-der-wirtschaft.md) auf und gehört zur [Wirtschaft der Städte](wirtschaft-der-staedte.md). Alle Zahlen stammen aus dem Spielcode.

## Das Feature

Bisher hatten nur Erwerbstätige ein Einkommen und einen Konsum. Kinder und Erwachsene, die nicht arbeiten, hatten nichts: mehr als die Hälfte der Personen einer Stadt. Jetzt gilt:

- Einkommen, Ausgaben und Erspartes einer Familie sind die Summen über ihre Mitglieder.
- Jede Person verbraucht ihren Anteil an den Ausgaben der Familie, gemessen in Körben: ab 15 Jahren ein Korb, darunter ein halber.
- Eine Frau, die ihrer Familie ohne Mann vorsteht oder allein lebt, arbeitet immer. Die übrigen Frauen der Stadt werden mit einem tieferen Satz gezogen, damit in jeder Stadt weiterhin 43 % der Frauen arbeiten.

Der Motor (der Port des Modells) rechnet unverändert. Die Kasse ist eine Buchung der Welt: Keine Regel des Modells liest sie.

Nicht dazu gehören: Bedarf und Hunger, Geburt, Tod und Heirat, Erbe, Löhne nach Person, neue Regeln des Modells.

## Im Spiel

Ein Klick auf eine Figur öffnet das Personenfenster. Der neue Abschnitt «Haushalt» zeigt für jede Person einer Stadt:

| Zeile | Bedeutung |
|---|---|
| Personen | Personen der Familie |
| davon erwerbstätig | wer von ihnen arbeitet, einen Betrieb führt oder die Bank besitzt |
| Einkommen am Tag | Einkommen aller Mitglieder nach Steuer |
| Ausgaben am Tag | was die Familie für Konsum ausgegeben hat |
| Eigener Verbrauch am Tag | der Anteil dieser Person an den Ausgaben |
| Erspartes | das Ersparte aller Mitglieder |

Ein Kind von sechs Jahren in einer Familie mit fünf Personen und zwei Erwerbstätigen: Einkommen 4,5 d, Ausgaben 4,4 d, eigener Verbrauch 0,6 d am Tag.

## Das Modell

1. **Kasse.** Einkommen, Ausgaben und Erspartes der Familie = Summe der Werte, die der Motor am letzten Tag für ihre Mitglieder gerechnet hat.
2. **Körbe.** Eine Person ab 15 Jahren zählt 1 Korb, ein Kind unter 15 einen halben. Wird ein Kind 15, zählt es ab diesem Tag ganz.
3. **Verbrauch.** Verbrauch einer Person = Ausgaben der Familie × eigene Körbe / Körbe der Familie.
4. **Frauen ohne Mann.** Die Frau an der Spitze einer Familie ohne Mann und jede allein lebende Frau ab 15 arbeitet.
5. **Übrige Frauen.** Sie werden mit dem Satz (0,43 × F − A) / (F − A) gezogen. F sind die Frauen ab 15 der Stadt, A die Frauen ohne Mann. So bleibt der Anteil arbeitender Frauen in jeder Stadt bei 43 %.

Im Modell von Poledna u. a. gibt jede Person einen festen Anteil ihres eigenen Einkommens aus. Wer nicht erwerbstätig ist, lebt dort von Sozialleistungen des Staates. Die Städte zahlen keine, darum trägt hier die Familie.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Korb eines Erwachsenen | 1 | Horrell, Humphries & Weisdorf 2022, S. 540 |
| Korb eines Kindes | ½ | dieselbe Quelle, S. 540 |
| Erwachsen ab | 15 Jahren | dieselbe Quelle, S. 538 («became independent at age 15») |
| Einkommen der Familie | Summe aller Mitglieder | dieselbe Quelle, S. 531 |
| Frau ohne Mann arbeitet | immer | Annahme derselben Quelle, S. 535 |
| Satz der übrigen Frauen | 22 % bis 43 % je Stadt | unsere Rechnung, damit die Stadt bei 43 % bleibt |
| Erwerbsquote der Frauen insgesamt | 43 % | Broadberry, Campbell & van Leeuwen 2013, unverändert |

## Zahlen aus dem Spiel

| | Welt 1356 vorher | jetzt | Welt 1291 vorher | jetzt |
|---|---|---|---|---|
| Erwerbstätige | 11'755 | 11'725 | 11'455 | 11'454 |
| Frauen ab 15 Jahren | 8'746 | 8'746 | 8'477 | 8'477 |
| davon ohne Mann | 1'189 | 1'189 | 1'211 | 1'211 |
| Arbeitende Frauen | 43 % | 42,8 % | 43 % | 43,4 % |
| Satz der übrigen Frauen | 43 % | 34,0 % | 43 % | 33,5 % |
| Familien ohne Erwerbstätige | 690 von 6'568 | 53 | 738 von 6'454 | 54 |
| Personen in diesen Familien | 806 | 199 | 861 | 201 |

Die Haushalte der Welt von 1291 am Tag 60: Eine Familie hat pro Kopf 1,05 d Einkommen am Tag und gibt pro Korb 1,24 d aus. Ein Zehntel der Personen hat 0,40 d pro Korb oder weniger, die Mitte 0,93 d, ein Zehntel 1,91 d oder mehr. 245 Personen leben in Familien, die an diesem Tag nichts ausgeben; vorher waren es 881.

Die Wirtschaft als Ganzes (je 4 Welten über 30 Jahre, jeder Tag gerechnet):

| Alle Städte zusammen, Jahr 30 | Vorher (Feature 10) | Jetzt | Spanne der Welten jetzt |
|---|---|---|---|
| Produktion (Start = 100) | 116,0 | 116,3 | 115,9 bis 116,7 |
| Preisniveau (Start = 100) | 95,1 | 95,2 | 94,4 bis 95,8 |
| Ohne Arbeit, Mittel aller Städte und Tage | 0,09 % | 0,07 % | 0,07 % bis 0,08 % |
| Ohne Arbeit, schlechteste Stadt an ihrem schlechtesten Tag | 3,4 % | 3,2 % | 2,9 % bis 3,7 % |
| Stadt mit der tiefsten Produktion | 109,0 | 111,8 | 108,6 bis 115,2 |
| Stadt mit der höchsten Produktion | 117,5 | 117,5 | 117,4 bis 117,5 |

Die Wirtschaft steht, wo sie stand. Die Kasse ändert an ihr nichts; die neue Ziehung der Frauen gibt den Städten andere Erwerbstätige und damit andere Zufallszahlen. Die Bücher gehen auf: Abweichung höchstens 2,0e-13 des Betrags, an dem sie gemessen werden.

## Massstab 1 : 100

Die Welt hat ein Hundertstel der Menschen der wirklichen. Jede Familie ist eine Familie der Welt, nicht ein Stellvertreter für hundert.

## Laufende Welt

Die laufende Welt (Start 1291) rechnet seit dem 16.11.2026 so: Am Tag 83 bekamen die Familien ihre Kasse, und die Wirtschaften ihrer 30 Städte wurden neu gegründet, weil sich geändert hat, wer arbeitet. Die bisherigen Tage und Jahreszahlen der Wirtschaften gingen dabei verloren.

## Grenzen

- Die Kasse ist eine Buchung. Im Modell gibt weiter jede Person einen Anteil ihres eigenen Einkommens aus; die Familie entscheidet nicht gemeinsam. Niemand hungert, wenn die Kasse leer ist.
- Die Gewichte der Körbe sind die Annahme der Quelle für englische Arbeiterfamilien auf dem Land. Sie gelten hier für jede Stadt. Die Quelle lässt Kinder ab sechs Jahren arbeiten, hier arbeitet niemand unter 15.
- Eine Familie ist das Paar mit seinen unverheirateten Kindern. Es gibt kein Gesinde, keine Verwandten ausserhalb und keine Zahlungen zwischen Familien.
- In der Welt von 1291 haben 54 Familien (201 Personen) weiterhin niemanden, der arbeitet: Paare, bei denen weder der Mann noch die Frau gezogen wurde.
- Alle Frauen ohne Mann leben allein, etwa jede siebte Frau. Witwen mit Kindern gibt es noch nicht, weil niemand stirbt.
- Der Satz der übrigen Frauen ist je Stadt verschieden (22 % bis 43 %), weil der Anteil allein lebender Frauen verschieden ist.
- Die 43 % stammen aus dem 19. Jahrhundert.

## Quellen

- Horrell, Humphries & Weisdorf (2022): Beyond the male breadwinner: Life-cycle living standards of intact and disrupted English working families, 1260–1850. Economic History Review 75(2), 530–560. Der Online-Anhang wurde nicht gelesen.
- Poledna, Miess & Hommes (2020): Economic forecasting with an agent-based model. Arbeitspapier des IIASA. Abschnitt 3 und Tabelle 1.
- BeforeIT.jl (Originalcode des Modells) und sein Rust-Port als Motor des Spiels: `households.jl`, Zeilen 45, 96 bis 150 und 182.
