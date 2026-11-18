# Umzug zwischen Orten

**Status:** Gebaut · **Bereich:** Personen · **Stand:** 2026-11-18

> Junge Ledige verlassen das Elternhaus und ziehen in einen anderen Ort, wo sie bei Verwandten oder als Gesinde wohnen und heiraten können. Wird das Elternhaus frei, kehrt der Erbe heim.

## Das Feature

Ramon, 17.11.2026: Das nächste Feature ist der Umzug zwischen Orten. Einen ersten Vorschlag (Ledige ziehen nur auf einen freien Haushalt) hat er verworfen: Das ist weder wirtschaftlich noch historisch richtig. Die Motive sind Arbeit, Hunger und Familie. Am 18.11.2026 hat er entschieden: Gebaut werden die Ledigen nach den gemessenen Raten und die heimkehrenden Erben. Arbeit als Motiv, ganze Familien und die Flucht vor einer Hungersnot folgen später, jedes für sich.

Ein Ort im Spiel ist eine Stadt mit ihrem Umland. Kein Ort liegt näher als 16 km am nächsten, im Mittel sind es 46 km. Die vielen kurzen Umzüge der Quellen finden also innerhalb eines Ortes statt und werden nicht gerechnet. Gerechnet wird nur der weite Teil.

Nicht dazu gehören: Umzug für einen besseren Lohn, Umzug ganzer Familien, Flucht vor Hunger, Wechsel des Haushalts innerhalb eines Ortes und der Einfluss der Persönlichkeit.

## Im Spiel

Noch nichts Eigenes zu sehen. Die Zahl der Personen eines Ortes ändert sich jetzt auch durch Zuzug und Wegzug, und in den Haushalten wohnen Personen, die nicht zur Familie gehören.

## Das Modell

1. **Wer.** Personen von 10 bis 59, die weder Mann noch Frau einer Familie sind. Verheiratete ziehen nicht um, und auch nicht der Witwer, der mit seinen Kindern zurückbleibt.
2. **Wie oft.** Wer noch im Ort lebt, aus dem er kommt, geht mit der Rate, mit der Kinder das Elternhaus verlassen, bis zum Alter von 29. Die Rate hängt ab von Alter, Geschlecht und Stand der Familie: Familien, in denen jemand eine Firma besitzt, und Familien ohne. Ist der Vater tot, steigt sie. Wer schon woanders lebt, wechselt den Ort so oft wie das Gesinde die Stelle, ab 15.
3. **Wie weit.** 9 % dieser Wechsel gehen weiter als 16 km. Für sie wird eine Distanz gezogen: 16 bis 32 km, 32 bis 64 km oder 64 bis 115 km, im Verhältnis 5 : 4 : 2.
4. **Wohin.** Gezogen wird ein Stück Land in dieser Distanz, gemessen entlang der Landwege der Karte. Über eine Meerenge kommt man, über das Meer nicht. Jedes Stück zählt mit seiner Fläche geteilt durch seine Distanz, so als würde die Richtung gezogen. Die Person geht in die Stadt, die diesem Stück am nächsten liegt. Ist das die eigene Stadt, bleibt der Umzug im Ort, und es geschieht nichts.
5. **Wo sie wohnt.** Bei Vater, Mutter, Bruder oder Schwester, wenn dort jemand lebt, sonst als Gesinde in einem Haushalt des Ortes. Sie zählt zur Kasse dieser Familie und kann dort heiraten wie alle Ledigen des Ortes.
6. **Ihre Arbeit.** Einen Platz in der Wirtschaft des alten Ortes gibt sie dort ab wie bei einem Todesfall. Kann ihn niemand übernehmen, bleibt sie. Am neuen Ort bekommt sie erst einen Platz, wenn einer frei wird.
7. **Der Erbe kehrt heim.** Ein lediges Kind eines frei gewordenen Hauses, das auswärts lebt, steht in der Erbfolge wie die anderen (siehe [Erbbrauch je Kultur](erbbrauch.md)). Nennt der Brauch dieses Kind und findet sich im Ort des Hauses eine Braut oder ein Mann, kommt es an diesem Tag heim und übernimmt.

Gerechnet wird wie bei Tod und Geburt: Für jede Person wird der Tag gezogen, an dem sie das nächste Mal weit umziehen könnte. An diesem Tag entscheidet ihre Rate von dann, ob sie wirklich geht. So folgt die Rate dem Alter, dem Tod des Vaters und dem Stand der Familie, ohne dass neu gezogen werden muss.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Auszug im Jahr, Söhne 10 bis 16 | 2,4 % (Familie mit Firma) / 8,2 % (ohne) | Dribe 2002, Tabelle 3: 407 Auszüge in 6'190 Personenjahren, verteilt nach Anteil und relativem Risiko der Stände |
| Töchter 10 bis 16 | 1,0 % / 8,3 % | Dribe 2002, Tabelle 4: 382 in 6'348 |
| Söhne 17 bis 29 | 9,1 % / 13,1 % | Tabelle 3: 327 in 2'874 |
| Töchter 17 bis 29 | 8,8 % / 18,1 % | Tabelle 4: 505 in 3'313 |
| Vater tot | Söhne 17 bis 29 mal 1,28, Töchter mal 1,32, Töchter 10 bis 16 mal 1,55 | Dribe 2002, Tabellen 3 und 4 |
| Mutter tot | Töchter 10 bis 16 mal 1,47 | Dribe 2002, Tabelle 4 |
| Wechsel im Jahr, wer woanders lebt | Männer 0,52 bis 29, danach 0,41. Frauen 0,53, danach 0,27 | Dribe & Lundh 2002, Tabelle 1: 7,8 und 8,0 Wechsel zwischen 15 und 30, 20,0 und 16,0 zwischen 10 und 60 |
| Anteil weiter als 16 km | 9 % | Dribe & Lundh 2002, Tabelle 3 |
| Distanzen | 16 bis 32 km: 5 von 11. 32 bis 64 km: 4 von 11. 64 bis 115 km: 2 von 11 | Raven 2024, Tabelle 2: Hörige aus Great Waltham und High Easter, Essex, 1289 bis 1361 |

Die Raten stammen aus den Kirchenbüchern von vier Gemeinden in Schonen, 1829 bis 1867. Es ist die einzige gelesene Quelle, die den Auszug nach Alter, Geschlecht und Stand der Familie misst.

Eigene Festlegungen ohne Quelle: dass die Richtung gezogen wird, der Haushalt des Gesindes (irgendeiner des Ortes), dass nur ledige Erben heimkehren, und dass bleibt, wessen Platz in der Wirtschaft niemand übernehmen kann.

## Historische Prüfung

Welt von 1291, 100 Jahre, nur Tod, Umzug, Heirat und Geburt (`npm run families:check`, ein Lauf).

| Grösse | Mit Umzug, Jahr 100 | Ohne Umzug, Jahr 100 |
|---|---|---|
| Personen | 97'067 | 97'223 |
| Haushalte ohne Hausfrau | 43 | 67 |
| Personen je Haushalt | 5,48 | 5,49 |
| Haushalte, die an einen Erben gehen | 40 % | 41 % |
| Orte unter 60 Personen (58 Orte) | plus 2,1 %, 6 unter der Hälfte | minus 9,6 %, 10 unter der Hälfte |
| Orte ab 500 Personen (32 Orte) | minus 8,7 % | minus 8,3 % |

- Im Jahr ziehen 132 Personen in einen anderen Ort, das sind 0,14 % der Personen. 106 gehen aus dem Ort, aus dem sie kommen, 25 ziehen weiter. 51 % sind Frauen, 77 % sind zwischen 15 und 29, 6 % gehen zu Verwandten.
- 11 Erben im Jahr kehren heim und übernehmen das Haus.
- Nach 100 Jahren leben 4,7 % der 20- bis 59-Jährigen nicht im Ort, aus dem sie kommen. In Irland lebten 1841, vor der Hungersnot, 5 % ausserhalb der Grafschaft ihrer Geburt (Ó Gráda 2018).
- Alle Wechsel, nah und fern, für die die Raten stehen: 3,9 % der Personen im Jahr, davon über die Grenze einer Kirchgemeinde 2,2 %. Clayworth 1676 bis 1688 und Cogenhoe 1618 bis 1628 verloren 3,9 bis 4,7 % der Einwohner im Jahr. Dort sind Familien und Verheiratete mitgezählt, die hier nicht umziehen.
- 40 % der weiten Umzüge enden in einem anderen Ort. Bei den übrigen gehört das Land in dieser Distanz noch zur eigenen Stadt.
- Volle Welt mit Wirtschaft, zwei Jahre: Keine Stadt bleibt stehen.

**Abweichung vom Vorschlag.** Der Vorschlag nannte 243 Umzüge im Jahr (0,26 %). Die Probe dahinter liess eine Person im selben Monat ein zweites Mal umziehen, wenn der neue Ort in ihrer Liste weiter hinten stand. Die Regel, wie sie beschrieben ist, ergibt 132 im Jahr. Die übrigen Werte der Probe halten.

## Massstab 1 : 100

Eine Person steht für hundert Menschen. Die Raten gelten je Person, die Anteile also unabhängig vom Massstab. 132 Umzüge im Jahr stehen für rund 13'000 Menschen.

## Grenzen

- Arbeit ist kein Motiv. Ein Zuzüger arbeitet erst, wenn am neuen Ort ein Platz frei wird. Dafür muss die Wirtschaft zuerst einen Arbeiter den Ort wechseln lassen.
- Ganze Familien ziehen nicht um (Dribe 2002: 3,3 % im Jahr). Das braucht Haushalte, die an einem Ort neu entstehen können. Geprüft und vorerst verworfen: [Haushalte wachsen mit der Wirtschaft](haushalte-wachsen.md).
- Hunger wirkt nur als Armut: Kinder aus Familien ohne Firma gehen öfter. Für die Flucht vor einer Hungersnot wurde keine Zahl gefunden.
- Die Raten aus Schweden 1829 bis 1867 gelten für jede Zeit und jeden Ort. Geprüft ist nur ihre Summe, an zwei englischen Dörfern des 17. Jahrhunderts.
- Das Ziel wird nach Land gezogen, nicht nach Grösse oder Anziehung einer Stadt. Kleine Orte gewinnen deshalb, grosse verlieren leicht. In den englischen Quellen ging ein Drittel in eine Stadt (Bailey 2022).
- Wer weiter als rund 115 km von jeder anderen Stadt lebt, zieht nie um. Das betrifft 54 der 550 Orte mit 13,5 % der Personen.
- Offenheit und Verträglichkeit verschieben die Rate des weiten Umzugs seit dem Feature [Merkmale verschieben die Raten](merkmale-und-raten.md). Die Messwerte dieser Seite stammen aus der Zeit davor.
- Seit dem Feature [Wer arbeiten will, sucht eine Stelle](stelle-suchen.md) ziehen Ledige zusätzlich auf freie Stellen in anderen Orten. Damit leben 19 % statt 4,7 % der Erwachsenen nicht am Herkunftsort.

## Quellen

- Dribe, M. (2002): Dealing with Economic Stress Through Migration: Lessons from Nineteenth Century Rural Sweden. Lund Papers in Economic History 79 (gedruckt in European Review of Economic History 7, 2003).
- Dribe, M., Lundh, C. (2002): People on the Move: Determinants of Servant Migration in Nineteenth Century Sweden. Lund Papers in Economic History 80.
- Raven, M. (2024): Continuity and Change 39, 101–125.
- Bailey, M. (2022): Servile migration and gender in late-medieval England. Past & Present 261(1), 47–85 (gelesen als Manuskript).
- Schürer, K. (2024): Stuck in the mud! Campop-Blog (nach Laslett & Harrison 1963).
- Ó Gráda, C. (2018): UCD Working Paper 18/21.
- Technische Fassung mit allen Messungen: `docs/PEOPLE_DESIGN.md`, Feature 4. Die Raten mit Tabelle je Zeile: `src/sim/people/moving.ts`.
