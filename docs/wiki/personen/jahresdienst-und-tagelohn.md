# Jahresdienst und Tagelohn

**Status:** Gebaut · **Bereich:** Personen · **Stand:** 2026-11-21

> Jeder Arbeiter hat einen von zwei Verträgen: Jahresdienst wie die Knechte und Mägde der Gutshöfe, oder Tagelohn. Ein Knecht bekommt den Lohn jeden Tag, ein Tagelöhner nur für die Tage, an denen er arbeitet. Fehlt jemand, springt zuerst ein Erwachsener aus seiner Familie ein, sonst ein Arbeitsloser der Stadt.

## Das Feature

Das ist Schritt 6 des Tagesplans. Nach Schritt 4 (Krankheit und Wochenbett) verloren die Betriebe Geld, wenn Leute fehlten. Ramon hat am 20.11.2026 entschieden, das in Schritt 6 zu lösen («So lassen, in Schritt 6 lösen»), und aus dem Vorschlag «Schritt 6, Jahresdienst und Tagelohn» die Phase A gewählt («Phase A bauen und messen»).

Am selben Tag kam der Ersatz aus der Familie dazu: Aus dem Vorschlag «Schritt 6, Phase B und das Rest-Leck» hat Ramon «Familie springt ein» gewählt.

Am 21.11.2026 hat Ramon auf die Frage «Wie soll die Familie bezahlt werden, die für einen kranken Knecht einspringt?» «Ohne Zusatzlohn für Knechte» gewählt. Vorher zahlte der Betrieb an einem solchen Tag doppelt: den Lohn des Knechts und den Lohn des Ersatzes.

Nicht dazu gehört Phase B: wie viele Tage ein Tagelöhner arbeiten will und Arbeit findet (Zieleinkommen). Die Quelle dafür beschreibt die Zeit nach der Pest (1349 bis 1520), die es im Spiel noch nicht gibt. Phase B wartet darum auf die Pest.

## Im Spiel

Eine eigene Anzeige gibt es noch nicht. Zu sehen ist es an der Wirtschaft der Städte: An einem Tag mit Kranken arbeiten Familienmitglieder oder Arbeitslose an ihrer Stelle, und der Betrieb macht fast so viel wie mit allen Leuten.

## Das Modell

1. **Vertrag nach dem Haushalt.** Wer einer eigenen Familie vorsteht, als Mann oder Frau der Familie, arbeitet im Tagelohn. Wer in der Familie eines anderen lebt (Sohn, Tochter, Bruder, alter Vater), dient für das Jahr.
2. **Knecht.** Er bekommt den Lohn seines Betriebs an jedem Tag, auch an Ruhetagen und wenn er krank ist, wie bisher alle.
3. **Tagelöhner.** Er bekommt den Lohn mal den Faktor des Tages: an einem Arbeitstag mehr, an einem Ruhetag nichts, an einem Fehltag nichts. Über ein Jahr ohne Fehltage verdient er gleich viel wie ein Knecht.
4. **Ersatz aus der Familie.** Fehlt ein Arbeiter, springt zuerst ein Erwachsener aus seiner Familie ein (ab 15), der selbst nicht arbeitet, lebt, an dem Tag nicht selbst krank ist und nicht schon für einen anderen einspringt. Springt er für einen Tagelöhner ein, zahlt ihm der Betrieb den Tageslohn, und der Lohn geht in die Kasse der Familie. Für einen Knecht zahlt der Betrieb nichts dazu: Dessen Lohn läuft weiter, und die Familie leistet dafür die geschuldete Arbeit. Sind mehrere da, entscheidet ein fester Zufall je Person.
5. **Ersatz durch Arbeitslose.** Für die übrigen Fehlenden nimmt der Betrieb je einen Arbeitslosen seiner Stadt, der nicht selbst krank ist, für diesen Tag und zahlt ihn als Tagelöhner. Gibt es nicht genug Arbeitslose, bleiben Stellen für den Tag leer.
6. **Wer ausgewählt wird.** Wie bei offenen Stellen im Modell: die Arbeitslosen in zufälliger Reihenfolge, die Betriebe auch.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Anteil im Jahresdienst | 54 % der Arbeiter (Welt von 1291) | aus dem Haushalt, nicht eingestellt; Quellen 40 bis 46 % (Humphries & Weisdorf 2019), ein Drittel bis die Hälfte der Arbeit (Claridge & Langdon 2015) |
| Lohn eines Tagelöhners | Lohn des Betriebs mal Faktor des Tages | Humphries & Weisdorf 2019, S. 6 |
| Ersatz für Kranke | zuerst ein Erwachsener der Familie, sonst ein Arbeitsloser je Fehlendem | Owen, Brown & Skinner 2025, S. 5 und 7 (eigene Regeln für die Reihenfolge, die Häufigkeit und den Lohn des Ersatzes für einen Knecht) |

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

Mit dem Ersatz aus der Familie (Wirtschaft Abschnitt 24), gleich gemessen, und zum Vergleich die erste Regel, die den Ersatz auch für Knechte bezahlte (E):

| | Jahr 1 | Jahr 3 | Jahr 6 |
|---|---|---|---|
| Fehltage, an denen jemand einsprang | 87 % | 95 % | 90 % |
| davon die Familie | 49 % | 49 % | 49 % |
| reales BIP | −0,4 % | −1,6 % | −1,2 % |
| reales BIP, E | −0,5 % | −2,4 % | −0,7 % |
| Preise | −0,2 % | −0,6 % | −0,7 % |
| Preise, E | −0,3 % | −1,2 % | −1,4 % |
| Ersparnisse der Betriebe | −0,8 % | −1,6 % | −2,9 % |

Die Familie springt an etwa der Hälfte der Fehltage ein. Das Leck der Betriebe ist nach sechs Jahren noch ein Drittel davon ohne Familie (−2,9 statt −9,1 %). Das BIP liegt etwa gleich hoch oder höher als ohne Familie, am tiefsten im vierten Jahr mit −2,0 %.

Die erste Regel zahlte an einem Tag, an dem die Familie für einen Knecht einsprang, doppelt: den Lohn des Knechts und den Lohn des Ersatzes. Das Geld fehlte den Inhabern, die es ausgeben, und landete auf den Ersparnissen der Familien, die nur langsam ausgegeben werden. Darum lag das BIP im zweiten bis vierten Jahr tiefer, und die Preise sanken doppelt so stark. Ohne diesen Zusatzlohn ist die Delle weg; nur im sechsten Jahr liegt das BIP unter dem der ersten Regel (−1,2 statt −0,7 %), warum, ist nicht getrennt gemessen.

## Massstab 1 : 100

Jede Person ist eine Figur, der Vertrag gilt je Person.

## Grenzen

- Im Spiel dienen 54 % für das Jahr, in den Quellen 40 bis 46 %. Eine Altersgrenze für Knechte bräuchte eine Quelle.
- Der Vertrag wird monatlich bestimmt. Wer im Monat heiratet oder einen Haushalt übernimmt, behält bis zum nächsten Monat den alten Vertrag.
- Knechte werden nicht nur an Michaeli entlassen: Die Betriebe stellen ein und entlassen wie im Modell, für beide Verträge gleich. Die Quellen widersprechen sich hier.
- Die Ersparnisse der Betriebe sinken weiter an den Tagen, an denen niemand einspringt (3 bis 13 % der Fehltage), im fünften und sechsten Jahr um 0,5 bis 0,7 Prozentpunkte im Jahr.
- Die Preise sinken noch um 0,7 % gegenüber dem Vergleich, ohne Familie blieben sie gleich. Das ist nicht getrennt gemessen; die sechs Jahre sind eine Welt mit einem Seed.
- Dass der Ersatz aus der Familie für einen Knecht keinen Lohn bekommt, ist eine eigene Regel: Der kranke Pächter stellte das Familienmitglied selbst, den Mann für den kranken Pflüger heuerte die Abtei an. Was ein kranker Knecht bekam, sagt die Quelle nicht.
- Dass zuerst die Familie einspringt, ist eine eigene Regel: Die Quelle nennt die Familie zuerst und den Angeheuerten mit «or even», eine Reihenfolge schreibt sie nicht vor.
- Wer in der Familie einspringt, wird nicht nach Rolle gewählt. Eine Mutter kleiner Kinder springt ein wie jeder andere Erwachsene; keine gelesene Quelle sagt, wer ging.
- Dass jede fehlende Stelle besetzt wird, solange jemand da ist, ist eine eigene Regel. Die Quellen zeigen, dass es vorkam, aber nicht wie oft.
- Was ein kranker Knecht im Mittelalter bekam, sagt keine gelesene Quelle. Er behält den Lohn, nach Ramons Wahl zu Schritt 4.

## Quellen

- Owen, G., Brown, A. T. & Skinner, T. (2025): Sick Leave of Customary Tenants in Late Medieval England. Journal of British Studies 64, e92 (S. 5: kranke Pächter fanden «a family member or even a hired laborer»; S. 7, Battle Abbey 1420/21: für einen Pflüger, der 84 Tage krank war, wurde ein Mann angeheuert).
- Claridge, J., Delabastita, V. & Gibbs, S. (2024): (In-kind) Wages and labour relations in the Middle Ages. Working Paper (famuli für das ganze Jahr, Tagelöhner oft Kleinbauern; zitiert Claridge & Langdon 2015).
- Goose, N. R.: Wage Labour on a Kentish Manor: Meopham 1307–75. Archaeologia Cantiana 92, 203–223.
- Humphries, J. & Weisdorf, J. (2019): Unreal Wages? Real Income and Economic Growth in England, 1260–1850. Economic Journal 129, 2867–2887.
- Humphries, J. & Weisdorf, J. (2015): The Wages of Women in England, 1260–1850. Journal of Economic History 75.
- Allen, R. C. & Weisdorf, J. L. (2010): Was there an ‹industrious revolution› before the industrial revolution? Discussion Paper 10-14, Universität Kopenhagen (S. 9, mit Dyer 1989, S. 224: Zieleinkommen 1349 bis 1520).
- Technische Beschreibung: docs/PEOPLE_DESIGN.md, Feature 10, und docs/ECONOMY_DESIGN.md, Abschnitte 23 und 24.
