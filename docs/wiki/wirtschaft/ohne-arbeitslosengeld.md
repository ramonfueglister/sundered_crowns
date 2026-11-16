# Ohne Arbeitslosengeld

**Status:** Beschlossen (am 16.11.2026 freigegeben und gebaut; noch nicht in der laufenden Welt) · **Bereich:** Wirtschaft · **Stand:** 2026-11-16

> In den Städten bekommt niemand mehr Geld dafür, dass er keine Arbeit hat. Wer entlassen wird, hat kein Einkommen und kauft nichts. Die Städte bleiben trotzdem stehen, weil ein Betrieb, der zu wenig verkauft, jetzt seinen Preis oder seine Menge senkt.

Diese Seite beschreibt Feature 9. Es gehört zur [Wirtschaft der Städte](wirtschaft-der-staedte.md), nimmt das [Arbeitslosengeld der Städte](arbeitslosengeld-der-staedte.md) (Feature 6) wieder heraus und stützt sich auf den [Lohn in Geld](lohn-in-geld.md) und die [Preise nach Absatz](preise-nach-absatz.md). Alle Zahlen stammen aus dem Spielcode.

## Das Feature

Das Arbeitslosengeld war eine vorläufige Lösung. Im Jahr 1356 gab es keines. Es wurde eingestellt, weil die verbundenen Städte ohne es über Jahrzehnte absanken: Wer entlassen war, kaufte nichts, die Betriebe verkauften weniger und entliessen weiter.

Seit die Betriebe einen festen Lohn in Geld zahlen und Menge und Preis nach ihrem Absatz richten, tragen sich die Städte ohne diese Stütze. Darum ist sie wieder ausgeschaltet. Geändert hat sich ein einziger Eintrag der Eichtabelle, von 55 % auf 0.

Nicht dazu gehören: eine neue Regel, eine Änderung am Motor, und eine Antwort darauf, wovon Menschen ohne Lohnarbeit im Jahr 1356 wirklich lebten. Im Modell haben sie nichts.

## Im Spiel

Es gibt keine eigene Anzeige. Die Wirkung steht im Abschnitt «Wirtschaft der Stadt» des Ortsfensters, in den Zeilen «Ohne Arbeit» und «Konsum der Haushalte». Die Zeile «Ohne Arbeit» steht weiter fast immer bei null. In einer Stadt mit einem Abschwung kann sie über Jahre bei rund 3 % liegen.

## Das Modell

Die Regel des Modells von Poledna u. a. (2023) bleibt, wie sie ist (Anhang A.44 und A.53):

    Einkommen ohne Arbeit = θ · letzter Lohn · Preisniveau

Der Satz θ ist jetzt ausgeschaltet. Er steht nicht auf null, sondern auf einem Milliardstel, weil der Motor den Lohn des Starts durch diesen Satz teilt. Eine Person ohne Arbeitgeber hat damit kein Einkommen, kauft nichts, und die Krone der Stadt zahlt ihr nichts.

Warum die Städte ohne Stütze stehen bleiben, ist unsere Lesart der Läufe, nicht weiter zerlegt: Nach der Regel des Papiers plant ein Betrieb, der weniger verkauft, weniger und entlässt. Nach der Regel von CANVAS senkt er um die Lücke seinen Preis oder seine Menge, und weil der Lohn in Geld fest ist, kaufen die Beschäftigten bei tieferen Preisen mehr. Gemessen ist der Unterschied: London allein und ohne Arbeitslosengeld hat mit der Regel des Papiers innert zehn Jahren in vier von sechs Läufen mehr als 4 % ohne Arbeit, bis 15 %. Mit der Regel von CANVAS sind es in den ersten sechs Jahren höchstens 3,4 % am Ende eines Jahres und ab dem siebten Jahr niemand.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Anteil am Lohn nach Steuern, den eine Person ohne Arbeit bekommt | 0 (vorher 55 %) | Annahme, in der Eichtabelle so markiert. Dass 1356 keine dieser Städte so etwas zahlte, ist Allgemeinwissen; eine Quelle wurde dafür nicht geöffnet |
| Satz θ in jeder Stadt | ein Milliardstel (vorher 0,536) | steht für null; der Motor teilt durch den Satz |
| Unterstützung am Start | keine (vorher in London £ 1,77 im Jahr) | folgt aus dem Satz |
| Konsumanteil der Haushalte | in London 0,18 % höher, in Kairo 0,03 % | Das Einkommen, aus dem die Haushalte am Start ausgeben, enthält die Unterstützung der einen Person ohne Arbeit nicht mehr. So stimmen die Bücher ab dem ersten Tag |
| Lohn, Menge und Preis | unverändert | Features 7 und 8 |

Sonst ändert sich an der Eichung keiner Stadt etwas. Ein Test vergleicht jeden Parameter jeder Stadt mit derselben Stadt mit Unterstützung.

## Historische Prüfung

Keine. Dass niemand Arbeitslosengeld bekommt, passt zu 1356. Dass ein Mensch ohne Lohnarbeit gar nichts hat und nichts kauft, passt nicht: Erspartes, Familie, Kirche und Zunft kennt das Modell nicht, weil Haushalte dort nur aus dem laufenden Einkommen kaufen. Dazu wurde keine Quelle geöffnet.

### Probelauf im Spiel

Vier Welten des Spiels über 30 Jahre, Tag für Tag gerechnet (`npm run economy:check 30 4`), dieselben Welten mit Arbeitslosengeld und jetzt:

| Alle Städte zusammen, Jahr 30 | Mit Arbeitslosengeld | Jetzt | Spanne der Welten jetzt |
|---|---|---|---|
| Reale Produktion (Start = 100) | 116,4 | 116,2 | 115,9 bis 116,7 |
| Preisniveau (Start = 100) | 94,8 | 94,9 | 94,1 bis 95,5 |
| Ausfuhr = Einfuhr, Anteil an der Produktion | 2,68 % | 2,70 % | 2,65 % bis 2,74 % |
| Ohne Arbeit, Mittel aller Städte und Tage der 30 Jahre | 0,05 % | 0,07 % | 0,05 % bis 0,09 % |
| Ohne Arbeit, schlechteste Stadt an ihrem schlechtesten Tag | 2,4 % | 3,0 % | 2,3 % bis 3,4 % |
| Stadt mit der tiefsten Produktion (ihr Start = 100) | 111,4 | 111,2 | 108,6 bis 113,7 |
| Stadt mit der höchsten Produktion | 117,5 | 117,5 | 117,5 bis 117,6 |

| Reale Produktion aller Städte (Start = 100) | Jahr 5 | Jahr 10 | Jahr 20 | Jahr 30 |
|---|---|---|---|---|
| Jetzt, Mittel der Welten | 108,6 | 113,6 | 115,9 | 116,2 |
| Mit Arbeitslosengeld, Mittel der Welten | 107,9 | 113,2 | 115,9 | 116,4 |

Acht Welten über 5 Jahre (`npm run economy:check 5 8`): Produktion 108,2 (mit Arbeitslosengeld 107,8), Preisniveau 99,5, ohne Arbeit 0,39 % (0,29 %), schlechteste Stadt an ihrem schlechtesten Tag 3,0 % (2,4 %), tiefste Stadt 103,2 (103,2). Die Bücher weichen höchstens um 1,7 · 10⁻¹³ ihres Betrags ab.

Die Städte stehen also dort, wo sie mit Arbeitslosengeld standen. Etwas mehr Menschen sind ohne Arbeit, und keine Stadt sinkt ab.

### 100 Jahre ausserhalb des Spiels

Dieselben 29 verbundenen Städte in drei Läufen über 100 Jahre (Startwerte 1356 bis 1358, jeder Tag gerechnet):

| Jahr (3 Läufe) | 5 | 10 | 30 | 50 | 75 | 100 |
|---|---|---|---|---|---|---|
| Reale Produktion aller Städte (Start = 100) | 108,3 bis 109,1 | 113,8 bis 113,9 | 115,8 bis 116,1 | 116,2 bis 116,5 | 116,0 bis 116,4 | 115,9 bis 116,4 |
| Preisniveau aller Städte (Start = 100) | 98,8 bis 99,8 | 97,4 bis 98,0 | 95,1 bis 95,8 | 94,4 bis 95,2 | 94,6 bis 95,3 | 94,7 bis 95,5 |
| Tiefste Stadt (ihr Start = 100) | 102,5 bis 103,9 | 108,5 bis 108,8 | 109,4 bis 111,9 | 113,3 bis 114,6 | 112,2 bis 113,7 | 111,9 bis 114,5 |

In keinem geprüften Jahr steht eine Stadt unter ihrem Start, und nach dem Jahr 5 ist an den geprüften Tagen niemand ohne Arbeit. Kein Lauf blieb stehen.

## Massstab 1 : 100

Die Regel rechnet mit einem Anteil am Lohn und hängt nicht vom Massstab ab.

## Grenzen

- Wer keine Arbeit hat, hat im Modell gar nichts. Wovon solche Menschen 1356 lebten, ist nicht im Modell.
- Eine Stadt kann weiterhin über Jahre einen Abschwung haben. In einem Test mit vier verbundenen Städten hat Kairo sechs Jahre lang 3 % ohne Arbeit und 98 % seiner Produktion vom Start, bevor es zurückkommt. In allen Läufen kam jede Stadt zurück; versprochen ist das im Modell nicht.
- Die Städte tragen sich nur mit dem [Lohn in Geld](lohn-in-geld.md) und den [Preisen nach Absatz](preise-nach-absatz.md). Mit der Preisregel des Papiers ist der Abschwung ohne Arbeitslosengeld wieder da.
- Die Regel für Menge und Preis hat weiterhin keine Schranke (siehe [Preise nach Absatz](preise-nach-absatz.md)).
- Der Lohn bewegt sich nicht, und das Kapital wächst nicht: Die Produktion endet bei rund 116.
- Die langen Läufe sind wenige: vier Welten über 30 Jahre im Spiel, drei Läufe über 100 Jahre ausserhalb.
- An der Geschichte ist nichts davon geprüft.

## Quellen

- Poledna, Miess, Hommes, Rabitsch (2023): Economic forecasting with an agent-based model. European Economic Review 151, 104306. Anhang A.44, A.53 (Einkommen ohne Arbeit), A.60, A.61 (Defizit und Schulden des Staats), gelesen im Port.
- BeforeIT.jl (Banca d'Italia): `src/agent_actions/households.jl`, Zeilen 22 bis 26 (Einkommen mit und ohne Arbeit); `src/agent_actions/government.jl`, Zeilen 95 bis 102 (was der Staat zahlt und schuldet); `src/model_init/init_workers.jl`, Zeile 36 (der Lohn des Starts wird durch den Satz geteilt); Eichung `src/utils/calibration.jl`, Zeile 549 (der Satz von 55 %, den die Städte von Feature 6 bis Feature 8 hatten). Port: `src/agents.rs`, Zeile 222, https://github.com/ramonfueglister/port-beforeit
- Für Lohn und Preisregel siehe die Seiten [Lohn in Geld](lohn-in-geld.md) und [Preise nach Absatz](preise-nach-absatz.md).
