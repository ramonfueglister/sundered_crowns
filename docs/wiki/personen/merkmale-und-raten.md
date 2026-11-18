# Merkmale verschieben die Raten

**Status:** Gebaut · **Bereich:** Personen · **Stand:** 2026-11-18

> IQ und Big Five einer Person ändern, wie lange sie lebt, ob sie weit wegzieht und ob sie heiratet. Das ist der erste Schritt zu Personen, die selbst entscheiden.

## Das Feature

Ramon, 17.11.2026: Alle Personen sollen schlau simuliert werden, ereignisgesteuert und mit eigenen Entscheidungen nach IQ und Big Five. Der ereignisgesteuerte Teil ist gebaut ([Tod, Heirat und Geburt](tod-heirat-geburt.md), [Erbbrauch je Kultur](erbbrauch.md), [Umzug zwischen Orten](umzug.md)). Diese Seite beschreibt den ersten Teil der Entscheidungen: Die Merkmale verschieben die Raten der Ereignisse, die es schon gibt. Ramon hat den Vorschlag am 18.11.2026 freigegeben («So bauen»), gebaut ist er als Personen-Feature 5 (Spielstand-Version 28).

Jede Person hat seit der Gründung einen IQ (Mittel 100, Standardabweichung 15) und die fünf Merkmale der Big Five (Mittel 50, Standardabweichung 10): Offenheit, Gewissenhaftigkeit, Extraversion, Verträglichkeit, Neurotizismus. Kinder erben sie von den Eltern. Vor diesem Feature hing nichts von ihnen ab.

Nicht dazu gehören: Zufriedenheit, Bedürfnisse und die Wahl unter Angeboten (bleiben, wegziehen, Betrieb gründen). Das ist der nächste Vorschlag. Die Zahl der Personen und der Haushalte ändert sich nicht.

## Im Spiel

Eine eigene Anzeige gibt es noch nicht. Zu sehen ist es an den Lebensläufen: Gewissenhafte und Kluge werden im Mittel älter, Offene ziehen eher fort, Extravertierte heiraten eher. Alte Spielstände ziehen beim Laden die Todestage und die Tage des nächsten Umzugs neu.

## Das Modell

Jede Rate wird mit einem Faktor der Person multipliziert:

```
Rate der Person = Grundrate × exp(b₁ · z₁ + b₂ · z₂) / Norm
```

- z ist ein Merkmal in Standardabweichungen vom Mittel (IQ 115 ist z = 1, Gewissenhaftigkeit 40 ist z = −1).
- b ist der natürliche Logarithmus des Faktors der Quelle pro Standardabweichung.
- Die Norm ist der Mittelwert des Faktors über alle Personen, exp((b₁² + b₂²) / 2). So bleibt die mittlere Rate, wie sie ist.

Das ist die Form, in der die Studien selbst schätzen (proportionale Risiken nach Cox, logistische Regression) und in der die Mikrosimulation der Demografie rechnet (Modgen, MicSim).

1. **Tod, ab 15 Jahren.** Der Todestag wird wie bisher einmal gezogen. Ab dem Alter 15 gilt die Sterbetafel mit dem Faktor der Person: Die Überlebenskurve wird mit dem Faktor potenziert. Es wirken Gewissenhaftigkeit und IQ. Unter 15 gilt die Sterbetafel unverändert: Ein Kind, das vor 15 stirbt, stirbt am selben Tag wie ohne Regel.
2. **Weiter Umzug.** Die Rate der Ledigen für einen weiten Umzug wird mit dem Faktor multipliziert. Es wirken Offenheit und Verträglichkeit. Der Faktor ist bei 4 gedeckelt. Wer umziehen kann, wohin und wie weit, bleibt wie in [Umzug zwischen Orten](umzug.md).
3. **Heirat.** Geheiratet wird wie bisher nur in einen freien Haushalt, es gibt also gleich viele Hochzeiten. Neu ist, wer genommen wird. Vorher nahm der freie Haushalt die ledige Person, deren Alter dem gesuchten am nächsten liegt. Jetzt wird unter den Ledigen des Ortes, die höchstens 2,5 Jahre vom gesuchten Alter entfernt sind, nach Gewicht gezogen. Das Gewicht ist exp(b · z) aus Extraversion und Offenheit, für Männer und Frauen mit eigenen Werten. Ist niemand im Fenster, gilt die alte Regel.
4. **Ohne Wirkung bleiben** die Geburten in der Ehe, die Wiederheirat der Witwen, der Tod unter 15 und alle Merkmale, die oben nicht genannt sind.

## Daten und Parameter

| Ereignis | Merkmal | Faktor pro Standardabweichung | Herkunft |
|---|---|---|---|
| Tod ab 15 | Gewissenhaftigkeit | 0,88 | Jokela et al. 2013: Hazard Ratio 0,88 (95 %-Intervall 0,82 bis 0,94), gegenseitig bereinigt um die anderen vier Merkmale, Geschlecht, Alter und Herkunft |
| Tod ab 15 | IQ | 0,89 | Calvin et al. 2011: 24 % (23 bis 25 %) weniger Sterberisiko, also 0,76. Die Bereinigung um Schulbildung nimmt davon 54 %. Verwendet wird der Rest: 1 − 0,24 × 0,46 = 0,89 |
| Weiter Umzug | Offenheit | 1,29 | Jokela 2009, Tabelle 2: Umzug in einen anderen Staat, Odds Ratio 1,32, mit allen Kontrollgrössen 1,29 |
| Weiter Umzug | Verträglichkeit | 0,88 | Jokela 2009, Tabelle 2: 0,86, mit allen Kontrollgrössen 0,88 |
| Heirat, Männer | Extraversion | 1,53 | Jokela et al. 2011, Tabelle 2: Odds Ratio, je verheiratet zu sein |
| Heirat, Männer | Offenheit | 0,79 | Jokela et al. 2011, Tabelle 2 |
| Heirat, Frauen | Extraversion | 1,22 | Jokela et al. 2011, Tabelle 2 |
| Heirat, Frauen | Offenheit | 0,76 | Jokela et al. 2011, Tabelle 2 |
| Vererbung | IQ 0,66, Big Five 0,4 | | wie bei der Gründung der Personen, `src/sim/systems/people.ts` |

Was die Quellen sonst sagen, und warum der Rest ohne Wirkung bleibt:

- **Tod.** Extraversion, Neurotizismus und Verträglichkeit hängen in Jokela et al. 2013 nicht mehr mit dem Tod zusammen, sobald alle fünf Merkmale im Modell sind. Offenheit: 0,99 (0,93 bis 1,06). Die Wirkung der Gewissenhaftigkeit unterscheidet sich nicht nach Geschlecht, Alter oder Bildung. Das unterste Drittel hat ein 1,37-mal so hohes Risiko wie die beiden oberen (1,18 bis 1,58). Mit Rauchen, Bewegung, Alkohol, Übergewicht, Zivilstand und Bildung im Modell bleibt 0,90.
- **IQ.** Bei Calvin et al. 2011 ist die Wirkung für Männer und Frauen gleich. Die soziale Schicht der Kindheit ändert fast nichts. Der Beruf im Erwachsenenalter nimmt 34 %, die Schulbildung 54 %.
- **Umzug.** Gewissenhaftigkeit und Neurotizismus sagen bei Jokela 2009 keinen Umzug voraus. Für Umzüge innerhalb eines Staates findet er Extraversion 1,12 bis 1,25, Verträglichkeit 0,90 und Offenheit 1,09 bis 1,13. Diese kurzen Umzüge liegen im Spiel innerhalb eines Ortes und werden nicht gerechnet.
- **Kinder.** Jokela et al. 2011 finden für das erste Kind Extraversion 1,28 und Offenheit 0,74. Die Wirkung der Extraversion auf die Kinderzahl ist nach ihrer eigenen Rechnung fast ganz durch den Zeitpunkt von Heirat und erstem Kind erklärt. Im Spiel bekommt nur Kinder, wer verheiratet ist. Die Wirkung läuft deshalb über die Heirat und wird nicht ein zweites Mal gerechnet.

Eigene Festlegungen ohne Quelle:

- **IQ 0,89 statt 0,76.** Die Welt hat keine Schule. Die Regel lässt deshalb den Teil weg, der in der Quelle über die Schulbildung läuft. Das ist eine eigene Rechnung aus zwei Zahlen der Zusammenfassung, nicht ein Wert des Papers.
- **Ab 15.** Die Studien haben nur Erwachsene. Unter 15 wirken die Merkmale nicht.
- **Wie bei der Heirat gezogen wird.** Aus dem Paper stammt nur, wie stark der Zusammenhang am Ende sein muss. Das Losen unter den Ledigen im Altersfenster ist eine eigene Umsetzung. Damit die Steigung der Quelle herauskommt, zählt das Gewicht der Männer 1,45-fach und das der Frauen 1,05-fach. Das Fenster von 2,5 Jahren gilt neu auch für den Bräutigam, wenn jemand darin ist (vorher: der Nächste innerhalb von zehn Jahren).
- **Deckel 4 beim Umzug.** Der Faktor einer Person für den weiten Umzug ist höchstens 4, damit die Rechnung eine feste Obergrenze der Rate hat. Das trifft weniger als eine Person von 100'000.
- **Staat gleich weit.** Jokela 2009 misst keine Distanz. Der Umzug in einen anderen Staat der USA steht hier für den weiten Umzug.
- **Odds Ratio als Faktor der Rate.** Bei seltenen Ereignissen sind beide fast gleich. Beim Umzug (9 % in neun Jahren) ist der Unterschied klein.

## Historische Prüfung

Welt von 1291, 100 Jahre, nur Tod, Umzug, Heirat und Geburt, je ein Lauf mit der gebauten Regel (`npm run traits:check -- 100`) und ohne Regel (Probe vor dem Bau). Die Steigungen sind so geschätzt, wie die Studien sie schätzen: beim Tod nach Cox über Jahr und Alter, beim Umzug aus dem Mittel der Umziehenden, bei der Heirat mit logistischer Regression über die 35- bis 59-Jährigen.

| Steigung pro Standardabweichung | Quelle | Mit Regel | Ohne Regel |
|---|---|---|---|
| Tod, Gewissenhaftigkeit | 0,88 | 0,89 | 1,00 |
| Tod, IQ | 0,89 | 0,90 | 1,00 |
| Tod, Extraversion (soll nicht wirken) | 1,00 | 1,00 | 1,00 |
| Weiter Umzug, Offenheit | 1,29 | 1,32 | 1,00 |
| Weiter Umzug, Verträglichkeit | 0,88 | 0,85 | 0,99 |
| Je verheiratet, Männer, Extraversion | 1,53 | 1,55 | 1,00 |
| Je verheiratet, Männer, Offenheit | 0,79 | 0,77 | 0,99 |
| Je verheiratet, Frauen, Extraversion | 1,22 | 1,19 | 0,97 |
| Je verheiratet, Frauen, Offenheit | 0,76 | 0,79 | 1,02 |

| Was sich sonst ändert | Ohne Regel | Mit Regel |
|---|---|---|
| Personen nach 100 Jahren | 97'067 | 97'071 |
| Haushalte | 17'702 | 17'702 |
| Mittleres Sterbealter derer, die 15 wurden | 49,5 | 49,7 |
| Weite Umzüge im Jahr | 132 | 135 |
| Je verheiratet mit 35 bis 59, Männer / Frauen | 83 % / 74 % | 82 % / 74 % |

- Die Unterschiede bei Personen und Umzügen sind nicht gegen den Zufall geprüft (je ein Lauf).
- **Die Merkmale wandern.** Weil Merkmale vererbt werden und Extravertierte eher heiraten, sind die Neugeborenen der letzten zehn Jahre um 0,07 Standardabweichungen extravertierter und um 0,06 weniger offen, ihr IQ liegt 0,05 Standardabweichungen höher (0,7 Punkte), die Gewissenhaftigkeit 0,01. Ohne Regel bewegt sich kein Merkmal um mehr als 0,01. Über 500 Jahre wären das rund 0,3 Standardabweichungen. Die Streuung bleibt bei 1.

## Massstab 1 : 100

Die Faktoren gelten je Person und sind vom Massstab unabhängig.

## Grenzen

- **Alle Studien sind aus dem 20. und 21. Jahrhundert.** Jokela et al. 2013: USA, Grossbritannien, Deutschland, Australien, Erhebungen 1993 bis 2010. Jokela 2009 und 2011: USA. Calvin et al. 2011: Kohorten mit 17 bis 69 Jahren Beobachtung. Für 1291 gibt es keine Messung von Persönlichkeit. Dass die Zusammenhänge damals galten, ist nicht belegt.
- **Der Weg der Wirkung ist heute ein anderer.** Gewissenhaftigkeit wirkt in den Studien zum Teil über Rauchen, Bewegung und Gewicht (21 % der Wirkung), der IQ über Schule und Beruf.
- **Heirat ist die schwächste Quelle.** Jokela et al. 2011 haben die Merkmale gemessen, als die Leute im Mittel über 50 waren, also nach Heirat und Kindern. Die Autoren nennen das ihre grösste Schwäche: Ehe und Elternschaft können die Persönlichkeit verändert haben.
- **Calvin et al. 2011 ist nur als Zusammenfassung gelesen.** Der Volltext war gesperrt. Die Werte für Männer und Frauen einzeln und die bereinigten Hazard Ratios selbst sind nicht gelesen.
- **Jokela 2009 ist eine einzelne Studie** mit 3'760 Personen, 359 davon zogen in einen anderen Staat. Die Skala für Gewissenhaftigkeit ist dort schwach (Cronbachs Alpha 0,51).
- **Die Merkmale gelten als unabhängig.** In der Welt werden sie unabhängig gezogen. In den Studien hängen sie leicht zusammen, die Faktoren sind aber gegenseitig bereinigt.
- **Jokela et al. 2013 nennt zwei Werte.** Der Text nennt für Gewissenhaftigkeit 0,88, die Tabelle 1 für dasselbe Modell 0,87. Verwendet wird 0,88.

## Quellen

- Jokela, M., Batty, G. D., Nyberg, S. T., Virtanen, M., Nabi, H., Singh-Manoux, A., Kivimäki, M. (2013): Personality and all-cause mortality: individual-participant meta-analysis of 3,947 deaths in 76,150 adults. *American Journal of Epidemiology* 178(5), 667–675. [PDF](https://midus.wisc.edu/wp-content/uploads/2024/04/1316.pdf). Ganz gelesen, ohne die Web-Tabellen und die Abbildungen.
- Calvin, C. M., Deary, I. J., Fenton, C., Roberts, B. A., Der, G., Leckenby, N., Batty, G. D. (2011): Intelligence in youth and all-cause-mortality: systematic review with meta-analysis. *International Journal of Epidemiology* 40(3), 626–644. doi:10.1093/ije/dyq190. [Eintrag](https://eprints.gla.ac.uk/55194). Nur die Zusammenfassung gelesen: 16 Studien, 1'107'022 Personen, 22'453 Tode.
- Jokela, M. (2009): Personality predicts migration within and between U.S. states. *Journal of Research in Personality* 43(1), 79–83. [PDF](https://midus.wisc.edu/wp-content/uploads/2024/04/724.pdf). Ganz gelesen.
- Jokela, M., Alvergne, A., Pollet, T. V., Lummaa, V. (2011): Reproductive behavior and personality traits of the Five Factor Model. *European Journal of Personality* 25(6), 487–500. [PDF](https://midus.wisc.edu/wp-content/uploads/2024/04/1180.pdf). Ganz gelesen, ohne Abbildung 1 (Werte für das zweite bis fünfte Kind) und die Zusatztabellen.
- Zur Form der Rechnung: [Modgen/DYNAMIS-POP](https://dynamis.ihsn.org/guide/Report/10_Methods.html); Zinn, S. (2024): [MicSim](https://ima-2024.wifo.ac.at/_downloads/034811e70c6ee9068b5214e504efaab3/zinn.pdf).
- Code: `src/sim/people/traits.ts`; Messung: `npm run traits:check -- 100`; Tests: `tests/traits.test.ts`; technische Beschreibung: `docs/PEOPLE_DESIGN.md`, Feature 5.
