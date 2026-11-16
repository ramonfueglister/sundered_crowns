# Arbeitslosengeld der Städte

**Status:** Abgelöst (am 15.11.2026 vorläufig freigegeben und gebaut; am 16.11.2026 durch Feature 9 wieder herausgenommen, bevor es in der laufenden Welt war) · **Bereich:** Wirtschaft · **Stand:** 2026-11-16

> Wer in einer Stadt keine Arbeit hat, bekommt von der Krone der Stadt gut die Hälfte seines letzten Lohns und kauft damit weiter ein. Ohne diese Regel des Modells sanken die verbundenen Städte über Jahrzehnte eine nach der anderen ab; mit ihr bleiben sie stehen.

Diese Seite beschreibt Feature 6. Es gehört zur [Wirtschaft der Städte](wirtschaft-der-staedte.md) und ändert nur einen Eintrag in deren Eichung. Alle Zahlen stammen aus dem Spielcode.

**Seit Feature 9 zahlen die Städte kein Arbeitslosengeld mehr:** Mit dem [Lohn in Geld](lohn-in-geld.md) und den [Preisen nach Absatz](preise-nach-absatz.md) tragen sie sich ohne es. Siehe [Ohne Arbeitslosengeld](ohne-arbeitslosengeld.md). Diese Seite bleibt als Beleg stehen, warum es die Stütze eine Zeit lang brauchte. Die Zahlen unten sind die von damals, mit der Preisregel des Papiers.

## Das Feature

Im Modell von Poledna u. a. (2023) bekommt eine Person ohne Arbeitgeber einen Teil ihres letzten Lohns. Der Staat zahlt ihn und schreibt, was ihm dafür fehlt, zu seinen Schulden. Für England im Jahr 1356 war diese Regel ausgeschaltet, weil es damals kein Arbeitslosengeld gab. In den Städten des Spiels ist sie jetzt eingeschaltet, mit dem Wert des Originalcodes.

Nicht dazu gehören: eine neue Regel im Spiel, eine Änderung am Motor, eine Dauer oder Bedingung für den Bezug, und eine Antwort darauf, wovon Menschen ohne Lohnarbeit im Jahr 1356 wirklich lebten.

## Im Spiel

Es gibt keine eigene Anzeige. Die Wirkung steht im Abschnitt «Wirtschaft der Stadt» des Ortsfensters: in den Zeilen «Ohne Arbeit», «Konsum der Haushalte» und «Stand (Start = 100)». Eine Stadt, in der Betriebe entlassen, verliert nicht mehr die ganze Kaufkraft der Entlassenen.

## Das Modell

Einkommen einer Person ohne Arbeitgeber an einem Tag (Anhang des Papiers, A.44 und A.53):

    Einkommen = θ · letzter Lohn · Preisniveau

mit dem Satz θ, wie ihn der Originalcode (BeforeIT.jl) festlegt:

    θ = 0,55 · (1 − Einkommenssteuer) · (1 − Sozialabgabe)

Das sind 55 % dessen, was derselbe Lohn nach Steuern einbrächte. Von ihrem Einkommen gibt die Person wie alle Haushalte den geeichten Anteil für Konsum aus. Die Krone der Stadt zahlt das Geld; reichen ihre Einnahmen nicht, wachsen ihre Schulden (A.60, A.61).

Warum es das braucht: Ohne Einkommen kauft eine entlassene Person nichts. Die Betriebe verkaufen dann weniger, planen weniger und entlassen weiter. In einer Stadt für sich fiel das nicht auf, weil ihr das Ausland des Modells Münzgeld aus dem Nichts zahlte. Seit die Städte über Händler verbunden sind, ist dieses Loch zu, und der Abschwung einer Stadt nährte sich selbst.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Anteil am Lohn nach Steuern | 55 % | Konstante in der Eichung des Originalcodes (BeforeIT.jl). Für 1356 eine Annahme, in der Eichtabelle so markiert |
| Satz θ in jeder Stadt | 0,536 | 0,55 · (1 − 2,51 % direkte Steuer); Sozialabgaben gibt es nicht |
| Unterstützung am Start | London £ 1,77 im Jahr (mittlerer Lohn £ 3,30) | Unterstützung auf den mittleren Lohn eines Angestellten der Stadt. Das Original nimmt sie aus Daten; hier gibt es keine, die Wahl ist unsere |
| Konsumanteil der Haushalte | in London 0,18 % tiefer, in Kairo 0,03 % | Wie im Original zählt die Unterstützung der einen Person ohne Arbeit zum Einkommen, aus dem die Haushalte ausgeben. So stimmen die Bücher ab dem ersten Tag |
| Englands eigene Eichtabelle | 0 | England hatte 1356 kein Arbeitslosengeld; dort bleibt die Regel aus |

Sonst ändert sich an der Eichung keiner Stadt etwas. Ein Test vergleicht jeden Parameter jeder Stadt mit derselben Stadt ohne Unterstützung.

## Historische Prüfung

Keine. Im Jahr 1356 gab es kein Arbeitslosengeld. Der Eintrag steht dafür, dass ein Mensch ohne Lohnarbeit weiter isst: Das Modell kennt keinen Haushalt, der sich selbst versorgt, keine Familie, die jemanden mitträgt, und keine Almosen. Wovon solche Menschen in einer Stadt von 1356 lebten, wurde für dieses Feature in keiner Quelle nachgeschlagen. Zwei Dinge sind klar nicht von 1356: dass die Krone zahlt, und der Wert von 55 %, der für eine heutige Volkswirtschaft gemacht ist.

Das Feature ist vorläufig. Eine Lösung näher an 1356, etwa ein Haushalt, der von der Ernte seines Orts lebt, wäre eine eigene Verbindung zwischen dem Modell und dem Rest des Spiels und stünde nicht mehr im Papier. Darüber ist nicht entschieden.

### Probelauf im Spiel

Vier Welten des Spiels über 30 Jahre, Tag für Tag gerechnet (`npm run economy:check 30 4`), dieselben Welten vorher und jetzt:

| Alle Städte zusammen, Jahr 30 | Vorher | Jetzt | Spanne der Welten jetzt |
|---|---|---|---|
| Reale Produktion (Start = 100) | 97,1 | 107,2 | 105,3 bis 108,6 (vorher 74,8 bis 110,6) |
| Preisniveau (Start = 100) | 126,6 | 123,6 | 119,1 bis 127,1 |
| Ausfuhr = Einfuhr, Anteil an der Produktion | 2,19 % | 2,25 % | 2,06 % bis 2,43 % |
| Ohne Arbeit, Mittel aller Städte und Tage der 30 Jahre | 4,86 % | 0,70 % | 0,62 % bis 0,81 % (vorher 1,40 % bis 10,60 %) |
| Ohne Arbeit, schlechteste Stadt an ihrem schlechtesten Tag | 23,8 % | 4,9 % | 4,3 % bis 5,9 % (vorher bis 39,5 %) |
| Stadt mit der tiefsten Produktion (ihr Start = 100) | 78,2 | 101,3 | 100,2 bis 102,2 (vorher 46,0 bis 100,9) |
| Stadt mit der höchsten Produktion | 112,5 | 113,9 | 112,0 bis 115,3 |

| Reale Produktion aller Städte (Start = 100) | Jahr 5 | Jahr 10 | Jahr 20 | Jahr 30 |
|---|---|---|---|---|
| Jetzt, Mittel der Welten | 105,1 | 107,0 | 108,0 | 107,2 |
| Vorher, Mittel der Welten | 102,8 | 101,9 | 100,1 | 97,1 |
| Jetzt, Welt mit dem Startwert 1356 | 104,3 | 106,4 | 109,2 | 107,2 |
| Vorher, Welt mit dem Startwert 1356 | 100,2 | 97,0 | 90,0 | 74,8 |

In keiner der vier Welten steht nach 30 Jahren eine Stadt unter ihrem Start. Die Bücher weichen höchstens um 1,4 · 10⁻¹³ ihres Betrags ab.

Vor dem Bau wurde dasselbe ausserhalb des Spiels geprobt, auch über 100 Jahre (zwei Läufe): Produktion 102 und 108, ohne Arbeit 2,2 % und 0,6 %, tiefste Stadt 98 und 101.

## Massstab 1 : 100

Die Unterstützung ist ein Anteil am Lohn und hängt nicht vom Massstab ab. Die Beträge in Pfund sind wie alle Beträge der Städte im Massstab 1 : 100.

## Grenzen

- Kein Arbeitslosengeld im Jahr 1356: Der Eintrag ist eine Annahme und vorläufig.
- Jede Person ohne Arbeitgeber bekommt die Unterstützung, solange sie ohne Arbeit ist. Niemand ist ausgeschlossen.
- Die Preise steigen weiter um rund 0,7 % im Jahr; nichts im Modell hält das Preisniveau, und das Münzgeld aller Städte zusammen ist fest. Seit Feature 7 hält der [Lohn in Geld](lohn-in-geld.md) das Preisniveau.
- Der Handel sinkt weiter, von 3,3 % der Produktion am Start auf 2,25 % im Jahr 30.
- Im Probelauf ausserhalb des Spiels floss das Münzgeld der Betriebe weiter langsam ab, und die Kronen machten Überschüsse. Im Spiel ist das nicht gemessen.
- Die langen Läufe sind wenige: vier Welten über 30 Jahre im Spiel, zwei Läufe über 100 Jahre ausserhalb. Ein Spieljahr dauert einen echten Tag.
- An der Geschichte ist nichts davon geprüft.

## Quellen

- Poledna, Miess, Hommes, Rabitsch (2023): Economic forecasting with an agent-based model. European Economic Review 151, 104306. Anhang A.44, A.53 (Einkommen ohne Arbeit), A.60, A.61 (Defizit und Schulden des Staats), gelesen im Port.
- BeforeIT.jl (Banca d'Italia), Eichung: θ = 0,55 · (1 − τ_INC) · (1 − τ_SIW); im Port `src/calibration.rs`, Zeile 1287. https://github.com/ramonfueglister/port-beforeit
