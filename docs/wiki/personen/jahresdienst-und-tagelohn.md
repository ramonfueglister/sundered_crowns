# Jahresdienst und Tagelohn

**Status:** Gebaut · **Bereich:** Personen · **Stand:** 2026-11-20

> Jeder Arbeiter hat einen von zwei Verträgen: Jahresdienst wie die Knechte und Mägde der Gutshöfe, oder Tagelohn. Ein Knecht bekommt den Lohn jeden Tag, ein Tagelöhner nur für die Tage, an denen er arbeitet. Fehlt jemand, springt ein Arbeitsloser der Stadt für den Tag ein.

## Das Feature

Das ist Schritt 6 des Tagesplans. Nach Schritt 4 (Krankheit und Wochenbett) verloren die Betriebe Geld, wenn Leute fehlten. Ramon hat am 20.11.2026 entschieden, das in Schritt 6 zu lösen («So lassen, in Schritt 6 lösen»), und aus dem Vorschlag «Schritt 6, Jahresdienst und Tagelohn» die Phase A gewählt («Phase A bauen und messen»).

Nicht dazu gehört Phase B: wie viele Tage ein Tagelöhner arbeiten will und Arbeit findet (Zieleinkommen). Das ist eine eigene, spätere Wahl.

## Im Spiel

Eine eigene Anzeige gibt es noch nicht. Zu sehen ist es an der Wirtschaft der Städte: An einem Tag mit Kranken arbeiten Arbeitslose an ihrer Stelle, und der Betrieb macht fast so viel wie mit allen Leuten.

## Das Modell

1. **Vertrag nach dem Haushalt.** Wer einer eigenen Familie vorsteht, als Mann oder Frau der Familie, arbeitet im Tagelohn. Wer in der Familie eines anderen lebt (Sohn, Tochter, Bruder, alter Vater), dient für das Jahr.
2. **Knecht.** Er bekommt den Lohn seines Betriebs an jedem Tag, auch an Ruhetagen und wenn er krank ist, wie bisher alle.
3. **Tagelöhner.** Er bekommt den Lohn mal den Faktor des Tages: an einem Arbeitstag mehr, an einem Ruhetag nichts, an einem Fehltag nichts. Über ein Jahr ohne Fehltage verdient er gleich viel wie ein Knecht.
4. **Ersatz.** Fehlen an einem Arbeitstag Leute eines Betriebs, nimmt der Betrieb für jeden einen Arbeitslosen seiner Stadt, der nicht selbst krank ist, für diesen Tag und zahlt ihn als Tagelöhner. Gibt es nicht genug Arbeitslose, bleiben Stellen für den Tag leer.
5. **Wer ausgewählt wird.** Wie bei offenen Stellen im Modell: die Arbeitslosen in zufälliger Reihenfolge, die Betriebe auch.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Anteil im Jahresdienst | 54 % der Arbeiter (Welt von 1291) | aus dem Haushalt, nicht eingestellt; Quellen 40 bis 46 % (Humphries & Weisdorf 2019), ein Drittel bis die Hälfte der Arbeit (Claridge & Langdon 2015) |
| Lohn eines Tagelöhners | Lohn des Betriebs mal Faktor des Tages | Humphries & Weisdorf 2019, S. 6 |
| Ersatz für Kranke | ein Arbeitsloser je Fehlendem, solange es Arbeitslose gibt | Owen, Brown & Skinner 2025, S. 5 und 7 (eigene Regel für die Häufigkeit) |

## Historische Prüfung

In der Welt von 1291 dienen bei der Gründung 54 % der Arbeiter für das Jahr. Die Quellen nennen etwa 40 % der Arbeitskräfte im Jahresdienst, im späten 13. Jahrhundert 46 %, und auf den Gutshöfen leisteten die Knechte ein Drittel bis die Hälfte der Arbeit. Die Jungen dienen fast alle für das Jahr, von 30 bis 50 Jahren etwa ein Drittel. Nach sechs Jahren sind es noch 49,5 %, weil mehr Arbeiter eine eigene Familie haben.

Gemessen über sechs Jahre, die Welt mit Kranken gegen dieselbe Welt, in der alle da sind, und gegen den Stand vor diesem Feature (F):

| | Jahr 1 | Jahr 3 | Jahr 6 |
|---|---|---|---|
| Fehltage, an denen ein Arbeitsloser einsprang | 55 % | 74 % | 79 % |
| reales BIP | −1,0 % | −1,5 % | −2,1 % |
| reales BIP, F | −1,9 % | −3,4 % | −4,2 % |
| Stellen | −0,5 % | −2,3 % | −2,5 % |
| Ersparnisse der Betriebe | −2,9 % | −6,1 % | −9,1 % |
| Ersparnisse der Betriebe, F | −6,1 % | −16,4 % | −30,3 % |

Die Wirtschaft verliert nur noch halb so viel wie vorher und bleibt ab dem vierten Jahr etwa 2 % unter dem Vergleich. Etwa 900 Leute mehr sind ohne Stelle als im Vergleich, und sie springen an vier von fünf Fehltagen ein: Es bildet sich eine Reserve von Tagelöhnern für die Kranken.

Das Leck der Betriebe ist viermal langsamer, hört aber nicht ganz auf: An den Tagen, an denen niemand einspringt, kauft der Betrieb weiter Werkzeug, das sich nicht abnutzt. Die Preise bleiben gleich. Nur die Verträge allein, ohne Kranke, ändern fast nichts (BIP −0,2 % im ersten Jahr, +0,1 % im sechsten).

## Massstab 1 : 100

Jede Person ist eine Figur, der Vertrag gilt je Person.

## Grenzen

- Im Spiel dienen 54 % für das Jahr, in den Quellen 40 bis 46 %. Eine Altersgrenze für Knechte bräuchte eine Quelle.
- Der Vertrag wird monatlich bestimmt. Wer im Monat heiratet oder einen Haushalt übernimmt, behält bis zum nächsten Monat den alten Vertrag.
- Knechte werden nicht nur an Michaeli entlassen: Die Betriebe stellen ein und entlassen wie im Modell, für beide Verträge gleich. Die Quellen widersprechen sich hier.
- Die Ersparnisse der Betriebe sinken weiter, um etwa 1 % im Jahr, an den Tagen, an denen niemand einspringt.
- Ersatz kommt nur von den Arbeitslosen der Stadt. In den Quellen sprang auch ein Familienmitglied ein, aber Familienmitglieder ohne Arbeit sind keine Haushalte der Wirtschaft.
- Dass jede fehlende Stelle besetzt wird, solange es Arbeitslose gibt, ist eine eigene Regel. Die Quellen zeigen, dass es vorkam, aber nicht wie oft.
- Was ein kranker Knecht im Mittelalter bekam, sagt keine gelesene Quelle. Er behält den Lohn, nach Ramons Wahl zu Schritt 4.

## Quellen

- Owen, G., Brown, A. T. & Skinner, T. (2025): Sick Leave of Customary Tenants in Late Medieval England. Journal of British Studies 64, e92 (Battle Abbey 1420/21: für einen Pflüger, der 84 Tage krank war, wurde ein Mann angeheuert).
- Claridge, J., Delabastita, V. & Gibbs, S. (2024): (In-kind) Wages and labour relations in the Middle Ages. Working Paper (famuli für das ganze Jahr, Tagelöhner oft Kleinbauern; zitiert Claridge & Langdon 2015).
- Goose, N. R.: Wage Labour on a Kentish Manor: Meopham 1307–75. Archaeologia Cantiana 92, 203–223.
- Humphries, J. & Weisdorf, J. (2019): Unreal Wages? Real Income and Economic Growth in England, 1260–1850. Economic Journal 129, 2867–2887.
- Humphries, J. & Weisdorf, J. (2015): The Wages of Women in England, 1260–1850. Journal of Economic History 75.
- Technische Beschreibung: docs/PEOPLE_DESIGN.md, Feature 10, und docs/ECONOMY_DESIGN.md, Abschnitt 23.
