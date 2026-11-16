# Einwohner der Städte

**Status:** Beschlossen · **Bereich:** Personen · **Stand:** 2026-11-16

> In der Welt von 1291 hat jede Stadt der Karte im Kartenrahmen echte Personen: 558 Städte, rund 102'000 Personen. In der Welt von 1356 sind es die 30 grössten Städte mit 25'722 Personen. Jede Person hat Geburtstag, Geschlecht, Eltern, Familie, IQ und Big Five.

## Welt von 1291: alle Städte der Karte

Ramon, 16.11.2026: In der Welt gibt es nur, was die Simulation rechnet, und alle Personen sollen auf der Karte zu sehen sein. Darum leben die Personen von 1291 in jeder Stadt, die die 3D-Welt im Kartenrahmen baut und für die eine Einwohnerzahl bekannt ist.

- **Welche Städte:** alle Orte des Gazetteers mit Einwohnern in `public/data/towns_1291.json`, die im Kartenrahmen liegen (`data/content/world_extent.json`): 558 Städte in 550 Orten der Karte. Liegen zwei Städte im selben Ort, sind sie eine Wirtschaft.
- **Woher die Zahlen kommen:** 65 Städte nach Chandler für 1291 (Reba, Reitsma & Seto 2016). Für die 493 übrigen gilt die Schätzung des Gazetteers für 1356 mal den Faktor ihrer Region aus `data/history/1291/demography.json`. Annahme: Eine Stadt verlor in der Pest denselben Anteil wie ihr Land. Diese Zahlen sind grob.
- **Reihenfolge:** Zuerst kommen Chandlers Städte, dann die übrigen, jede Gruppe nach Grösse. So behalten die Personen der 30 grössten Städte, die die Welt seit dem 16.11.2026 hatte, ihre Nummern, Familien und Gene. Die neuen Städte kommen dazu.
- **Wirtschaft:** Jeder Ort mit einer Stadt hat eine eigene Wirtschaft (550). Die kleinste Stadt hat 40 Personen. Die Kalibrierung braucht mindestens einen Betrieb und eine beschäftigte Person je Sektor, das reicht in jeder Stadt.
- **Noch nicht dabei:** die 131 Hauptstädte ohne Stadt auf der Karte, die Bauern der Städte in Weilern vor den Mauern, Kultur und Glaube pro Person. Das Land ausserhalb der Städte ist noch eine Zahl pro Ort und soll verschwinden, sobald die Weiler gebaut sind.

Prüfung: In einem Lauf über 30 Jahre mit 4 Seeds blieb keine Wirtschaft stehen. Ohne Arbeit war im Median niemand, in der schlechtesten Stadt höchstens 7 % (das sind Städte mit unter 20 Erwerbstätigen, wo eine Person schon 5 % ist). Die Produktion steigt auf rund 115 % und bleibt dort, wie mit den 30 Städten.

## Das Feature

Beim Gründen einer Welt im Jahr 1356 entstehen die Personen von Kairo, Paris, Fes, Sarai, Täbris, Bagdad, Venedig und 23 weiteren Städten. Jede Person gehört zu einer Familie: einem Paar mit seinen ledigen Kindern, oder sie lebt allein. Alle übrigen Einwohner eines Ortes bleiben eine Zahl.

Noch nicht dabei: Geburt, Tod, Heirat und Umzug während des Spiels (die Personen werden nur älter), Stand, Beruf, Kultur, Gene für die Porträts und Namen.

## Im Spiel

Noch nicht sichtbar. Die Personen stehen im Zustand der Welt; Porträts, Figuren und Häuser lesen sie später.

## Das Modell

1. **Städte.** Einwohner 1356 nach Chandler, zwischen den nächsten Stichjahren interpoliert. Personen = Einwohner / 100. Ist eine Stadt grösser als ihr ganzer Ort auf der Karte, wächst der Ort auf die Grösse der Stadt.
2. **Alter und Geschlecht.** Stationäre Bevölkerung nach der Sterbetafel Coale-Demeny West, Stufe 3: Lebenserwartung bei Geburt 25 Jahre für Frauen, 22,85 für Männer. 105 Knaben auf 100 Mädchen.
3. **Familien.** Frauen heiraten im Mittel mit 24, Männer mit 27. Jede Frau im Heiratsalter bekommt den ledigen Mann, dessen Alter ihrem plus 3 Jahren am nächsten liegt. Kinder kommen zu einer verheirateten Frau, die bei ihrer Geburt 15 bis 49 war.
4. **IQ und Big Five.** Ohne bekannte Eltern normalverteilt. Kinder erben nach dem infinitesimalen Modell:

   z(Kind) = h² · (z(Mutter) + z(Vater)) / 2 + Zufall, mit Varianz 1 − h⁴/2

   So bleibt die Verteilung gleich, und Kinder ähneln dem Mittel ihrer Eltern mit der Steigung h². IQ = 100 + 15·z, Big Five als T-Werte 50 + 10·z.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Stadtgrössen 1356 | 30 Städte, 2'572'165 Einwohner | Reba, Reitsma & Seto 2016 (Chandler 1987), CC BY 4.0 |
| Stadtgrössen 1291 | 558 Städte, 10'198'197 Einwohner; 65 nach Chandler, 493 geschätzt | Chandler wie oben; sonst Gazetteer 1356 mal Faktor der Region (Annahme) |
| Sterbetafel | Coale-Demeny West, Stufe 3 | Coale & Demeny 1983; Stufe nach Bailey & Rigby 2012 und Ohlin 1966 |
| Erstes Heiratsalter | Frauen 24, Männer 27 | La Poutré & Paping 2025, England um 1300 |
| Streuung des Heiratsalters | 4 Jahre, frühestens 15 | Annahme |
| Erblichkeit IQ | 0,66 | Haworth et al. 2010 |
| Erblichkeit Big Five | 0,40 | Vukasović & Bratko 2015 |

## Historische Prüfung

Über 20 Welten: 60,9 % der Frauen ab 14 sind verheiratet, die Kopfsteuer von 1377 zeigt rund 60 % (Briggs 2024). Eine Familie hat im Mittel 3,9 Personen, ein Haushalt um 1300 hatte 5,8; Gesinde und Grossfamilien fehlen im Modell. IQ und Big Five treffen Mittel, Streuung und Erblichkeit.

## Massstab 1 : 100

Die Welt hat ein Hundertstel der Menschen der echten Welt; jede Person ist eine Person. Kairo hat 1356 3'512 Personen, London 609; 1291 hat Kairo 3'820, Paris 2'147.

## Grenzen

- Die sechs Werte sind voneinander unabhängig; in Wirklichkeit hängen sie leicht zusammen.
- Die Pest von 1348 fehlt im Altersaufbau, Stadt und Land haben dieselbe Sterbetafel.
- Das englische Heiratsalter gilt auch für Kairo, Fes oder Täbris, wo früher geheiratet wurde.
- Die Stadtgrössen sind Schätzungen; Chandler gibt pro Stadt eine Sicherheit von 1 bis 3.

## Quellen

- Reba, Reitsma & Seto (2016): Spatializing 6,000 years of global urbanization from 3700 BC to AD 2000. Scientific Data 3, 160034. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4896125/
- Haworth et al. (2010): The heritability of general cognitive ability increases linearly from childhood to young adulthood. Molecular Psychiatry 15.
- Vukasović & Bratko (2015): Heritability of personality: a meta-analysis of behavior genetic studies. https://www.bib.irb.hr/761863
- Barton, Etheridge & Véber (2017): The infinitesimal model. Theoretical Population Biology 118.
- La Poutré & Paping (2025): English familial demography c. 1300: a reconstruction. Social Science History.
- Bailey & Rigby (Hg., 2012): Town and Countryside in the Age of the Black Death.
- Briggs (2024): Marriage in the Middle Ages. https://www.campop.geog.cam.ac.uk/blog/2024/07/25/marriage-in-the-middle-ages/
