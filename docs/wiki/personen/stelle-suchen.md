# Wer arbeiten will, sucht eine Stelle

**Status:** Gebaut · **Bereich:** Personen · **Stand:** 2026-11-18

> Wer arbeiten will und keine Stelle hat, übernimmt eine freie Stelle im eigenen Ort oder zieht auf eine freie Stelle in einem Ort bis 115 km. Das ist die erste Entscheidung, die eine Person aus einem eigenen Bedürfnis trifft.

## Das Feature

Ramon, 17.11.2026: Alle Personen sollen schlau simuliert werden, mit eigenen Entscheidungen. Nach [Merkmale verschieben die Raten](merkmale-und-raten.md) ist das der nächste Schritt: Bedürfnis, Zufriedenheit und Wahl unter Angeboten. Ramon hat den Vorschlag am 18.11.2026 freigegeben.

Eine Person kann nur unter Dingen wählen, die es in der Welt gibt. Geprüft wurde deshalb zuerst, was die Welt anbietet:

- **Löhne sind kein Signal.** Der Tageslohn liegt in allen Orten zwischen 4,9 und 6,4 Körben. Wer eine Stelle übernimmt, übernimmt den Lohn des Vorgängers.
- **Einen Betrieb gründen geht nicht.** Die Wirtschaft rechnet je Ort eine feste Liste von Stellen und Betrieben, in der Welt von 1291 sind es 49'745. Eine Stelle wird nur frei, wenn jemand stirbt oder wegzieht.
- **Freie Stellen gibt es.** Findet eine Stelle im Ort niemanden, wartet sie. Zugleich gibt es Orte mit Erwachsenen ohne Stelle.

Dabei zeigte sich ein Fehler der früheren Regel. Bei der Gründung haben 97 % der Männer und 43 % der Frauen zwischen 20 und 59 eine Stelle, wie die Quelle es angibt. Die Nachfolge nahm aber irgendeine erwachsene Person ohne Stelle. Nach 25 Jahren hatten 79 % der Männer und 74 % der Frauen eine Stelle, der Unterschied der Quelle war weg.

Nicht dazu gehören: der Wechsel von einer Stelle auf eine bessere, der Umzug ganzer Familien und die Frage, wer nach IQ die bessere Stelle bekommt.

## Im Spiel

Eine eigene Anzeige gibt es noch nicht. Zu sehen ist es an den Lebensläufen: Junge Ledige ziehen in einen anderen Ort, wenn dort eine Stelle wartet, und arbeiten dort.

## Das Modell

1. **Bedürfnis.** Arbeiten will, wer nach der Regel der Gründung arbeitet: ein Mann mit 97,1 %, eine Frau ohne Mann immer, die übrigen Frauen mit dem Satz, bei dem von allen Frauen ihres Ortes 43 % arbeiten. Das wird je Person einmal gezogen und gilt ein Leben lang.
2. **Zufriedenheit.** Wer arbeiten will und eine Stelle hat, tut nichts. Wer arbeiten will und keine hat, sucht.
3. **Angebote im Ort.** Eine Stelle, die frei wird, geht an eine suchende Person des Ortes: zuerst aus der Familie des Vorgängers, dann an dessen Kinder, dann an alle anderen.
4. **Angebote aus anderen Orten.** Am ersten Tag jedes Monats wird eine Stelle, die noch wartet, den Suchenden der Orte bis 115 km angeboten, die umziehen können: 15 bis 59 Jahre alt und weder Mann noch Frau eines Haushalts.
5. **Wahl.** Unter ihnen wird nach Gewicht gezogen:

```
Gewicht = Anteil des Distanzbands / Zahl der Suchenden im Band × Faktor der Person für den weiten Umzug
```

Die Person zieht um, wohnt wie beim [Umzug](umzug.md) bei Verwandten oder als Gesinde in einem Haushalt und übernimmt die Stelle.

Die Umzüge nach den gemessenen Raten bleiben daneben, wie sie sind.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Männer, die arbeiten | 97,1 % | Broadberry, Campbell & van Leeuwen 2013, S. 13–14: Sätze des 19. Jahrhunderts, von den Autoren zurückgetragen (Kalibrierungstabelle der Wirtschaft) |
| Frauen, die arbeiten | 43,0 % | dieselbe Stelle |
| Frau ohne Mann | arbeitet immer | Horrell, Humphries & Weisdorf 2022, S. 535 |
| Arbeitsalter | ab 15 | Kalibrierungstabelle («aged 15 and over») |
| Distanzbänder | 16–32 km, 32–64 km, 64–115 km wie 5 : 4 : 2 | Raven 2024, Tabelle 2, wie beim [Umzug](umzug.md) |
| Faktor der Person | Offenheit 1,29, Verträglichkeit 0,88 pro Standardabweichung | Jokela 2009, wie in [Merkmale verschieben die Raten](merkmale-und-raten.md) |
| Form «zufrieden wiederholt, unzufrieden sucht» | keine Zahl | Jager & Janssen 1999 (Consumat) |

Eigene Festlegungen ohne Quelle:

- Die Nachricht von einer freien Stelle reicht 115 km weit.
- Eine freie Stelle wird sofort genommen, wenn jemand sucht.
- Angebote aus anderen Orten gibt es einmal im Monat.
- Die Reihenfolge der Nachfolge im Ort (Familie, Kinder, alle anderen).
- Wer auf eine Stelle ziehen kann (ledig, 15 bis 59), ist vom Umzug übernommen.

## Historische Prüfung

Welt von 1291, 100 Jahre, nur Tod, Umzug, Heirat und Geburt, je ein Lauf (`npm run families:check`).

| Nach 100 Jahren | Vorher | Mit der Regel |
|---|---|---|
| Männer von 20 bis 59 mit Stelle (Quelle 97,1 %) | 79 % | 94,9 % |
| Frauen von 20 bis 59 mit Stelle (Quelle 43,0 %) | 78 % | 54,1 % |
| Wartende Stellen | 615 (1,2 %) | 896 (1,8 %) in 88 Orten |
| Suchende ohne Stelle | nicht bestimmt | 1'785 |
| Umzüge in einen anderen Ort im Jahr | 135 | 434, davon 313 auf eine Stelle |
| 20- bis 59-Jährige, die nicht am Herkunftsort leben | 4,7 % | 19,0 % |
| Personen | 97'071 | 97'119 |
| Freie Haushalte | 40 | 17 |
| Haushalte, die an einen Erben gingen | 40 % | 35 % |

- Wer umzieht, ist im Mittel 18,1 Jahre alt, 91 % sind 15 bis 29, 36 % sind Frauen.
- Die Steigungen aus [Merkmale verschieben die Raten](merkmale-und-raten.md) gelten weiter.
- Geprüft und zu schwach: nur die Umzüge nach Raten dorthin lenken, wo eine Stelle wartet. Das sind 11 Umzüge im Jahr, es bleiben 2'707 wartende Stellen.

## Massstab 1 : 100

Die Regel gilt je Person und je Stelle und ist vom Massstab unabhängig.

## Grenzen

- **Es leben mehr Personen auswärts, als eine Quelle zeigt.** 19 % der 20- bis 59-Jährigen leben nicht an ihrem Herkunftsort, vorher 4,7 %. In Irland lebten 1841 5 % ausserhalb der Grafschaft ihrer Geburt (Ó Gráda 2018). Die Raten von Dribe & Lundh ergeben in dieser Welt 326 weite Umzüge im Jahr, mit der Regel erreichen 434 Personen im Jahr einen anderen Ort.
- **Der Anteil der Frauen bleibt über der Quelle** (54 % statt 43 %). Eine Witwe will immer arbeiten, und eine Frau, die vor der Heirat eine Stelle hatte, behält sie.
- **Consumat liefert nur die Form.** Die Schwellen bei Jager & Janssen 1999 sind Einstellungen ihrer Versuche, keine gemessenen Werte. Deshalb gibt es hier keine Schwelle. Unsicherheit und Nachahmen kommen nicht vor.
- **Die Quellen zur Arbeit sind englisch**, die zum Umzug schwedisch und englisch, die zur Persönlichkeit aus den USA des 20. Jahrhunderts.
- **Weniger Umzüge nach den Raten.** Wer eine Stelle hat, kann nur wegziehen, wenn jemand Suchendes sie übernimmt. Vorher konnte das jede erwachsene Person des Ortes. Die Umzüge nach den Raten sinken von 135 auf 121 im Jahr, in den ersten Jahren stärker.
- **Eine wartende Stelle zahlt weiter.** Das Geld einer Stelle, die niemand übernommen hat, bleibt bei der Familie des Verstorbenen. Die Arbeit macht niemand.
- **In den ersten Jahren ziehen besonders viele.** Bei der Gründung hat jeder, der arbeiten will, eine Stelle. Wird eine frei, sucht im Ort noch niemand. Mit voller Wirtschaft haben nach einem Jahr 453 Personen eine Stelle in einem anderen Ort als ihrem Herkunftsort, nach zwei Jahren 858.
- **Es bleiben wartende Stellen und Suchende.** Sie liegen ausser Reichweite voneinander, oder die Suchenden sind verheiratet. Ganze Familien ziehen nicht um.
- **Lohn und Merkmale entscheiden nicht, wer welche Stelle bekommt.** Strenze 2007 nennt für IQ und Berufsrang einen Zusammenhang von 0,43, die Tabellen sind aber nur über eine Zusammenfassung gelesen. Zhao & Seibert 2006 vergleichen Gründer mit Managern, nicht mit Arbeitern.
- **Je ein Lauf.** Die Unterschiede sind nicht gegen den Zufall geprüft.

## Quellen

- Broadberry, S., Campbell, B. M. S., van Leeuwen, B. (2013): When did Britain industrialise? The sectoral distribution of the labour force and labour productivity in Britain, 1381–1851. *Explorations in Economic History* 50(1), 16–27. Gelesen für die Kalibrierung der Wirtschaft.
- Horrell, S., Humphries, J., Weisdorf, J. (2022): Beyond the male breadwinner: Life-cycle living standards of intact and disrupted English working families, 1260–1850. *Economic History Review* 75(2), 530–560.
- Jager, W., Janssen, M. A., Vlek, C. A. J. (1999): Consumats in a commons dilemma. COV-Bericht 99-01, Universität Groningen. [PDF](https://marcojanssen.info/wp-content/uploads/2016/09/1999_Consumats_in_a_commons_dilemma.pdf). Gelesen bis Seite 19, der Rest nur als Zusammenfassung.
- Jokela, M. (2009): Personality predicts migration within and between U.S. states. *Journal of Research in Personality* 43(1), 79–83. [PDF](https://midus.wisc.edu/wp-content/uploads/2024/04/724.pdf).
- Raven, Dribe & Lundh, Ó Gráda: siehe [Umzug zwischen Orten](umzug.md).
- Strenze, T. (2007): Intelligence and socioeconomic success. *Intelligence* 35(5), 401–426. Zhao, H., Seibert, S. E. (2006): The Big Five personality dimensions and entrepreneurial status. *Journal of Applied Psychology* 91(2), 259–271. Beide nur teilweise gelesen und nicht verwendet.
- Code: `src/sim/systems/work.ts` (`wantsWork`), `src/sim/systems/deaths.ts` (`seekersIn`), `src/sim/systems/moves.ts` (`offersOn`); Tests: `tests/work-offers.test.ts`; technische Beschreibung: `docs/PEOPLE_DESIGN.md`, Feature 6.
