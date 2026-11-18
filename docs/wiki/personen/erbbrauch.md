# Erbbrauch je Kultur

**Status:** Gebaut · **Bereich:** Personen · **Stand:** 2026-11-18

> Stirbt die Hausfrau eines Haushalts, übernimmt ihn ein Kind des Hauses. Welches, bestimmt der Brauch der Kultur. Besitz bleibt so in der Familie, und es gibt Erben und Nichterben.

## Das Feature

Ramon, 17.11.2026: Wer einen Haushalt übernimmt, soll dem Brauch der Kultur folgen und nicht überall dem englischen. Am 18.11.2026 hat er entschieden: Gebaut wird nur, wofür eine gelesene Quelle spricht. Das sind 83 % der Personen von 1291. Die übrigen Kulturen behalten die alte Regel, bis eine Quelle da ist: Ein Paar des Ortes übernimmt den Haushalt.

Ein Haushalt wird nie geteilt. Die Zahl der Haushalte eines Ortes ist fest (siehe [Tod, Heirat und Geburt](tod-heirat-geburt.md)). Wo die Quellen das Land unter mehreren Kindern teilen, bestimmt der Brauch hier nur, welches Kind den Haushalt mit Haus und Grundstück übernimmt. Das ist die grösste Vereinfachung dieses Features.

Nicht dazu gehören: Mitgift, Abgaben an den Grundherrn beim Erbfall, ein Vormund für minderjährige Erben und das Teilen des Ersparten nach dem Brauch.

## Im Spiel

Noch nichts Eigenes zu sehen. Man merkt es an den Familien: Der Sohn oder die Tochter des Hauses wohnt nach der Heirat im Haus der Eltern weiter, der Witwer und die Geschwister bleiben dort wohnen.

## Das Modell

Am ersten Tag jedes Monats, vor den übrigen Hochzeiten, für jeden Haushalt ohne Hausfrau:

1. **Kinder des Hauses** sind die lebenden Personen des Ortes, deren Mutter oder Vater zur Familie gehörte, egal wo sie heute wohnen.
2. **Der Brauch** ist der Brauch der Kultur des Vaters. Ist der Vater Muslim, gilt das Recht des Glaubens.
3. **Der Erbe** ist das Kind, das der Brauch nennt und das frei ist: erwachsen (Sohn ab 18, Tochter von 16 bis 44) und ohne eigenen Haushalt. Ist das erstgenannte Kind nicht frei, rückt das nächste nach.
4. **Die Heirat.** Ein Sohn bekommt eine Braut aus dem Ort nach der bisherigen Alterskurve. Eine Tochter bekommt einen Mann aus dem Ort, der ihrem Alter plus 3 Jahre am nächsten ist. Das Paar übernimmt Sitz, Haus und Grundstück.
5. **Sonst** gilt die alte Regel: Der Witwer heiratet wieder, oder ein Paar des Ortes übernimmt. Das gilt, wenn der Brauch niemanden nennt, wenn die Kultur keinen Brauch hat oder wenn der Erbe in diesem Monat niemanden zum Heiraten findet.

Niemand heiratet Bruder, Schwester, Vater, Mutter oder Kind.

| Brauch | Wer den Haushalt übernimmt | Wenn kein Sohn lebt |
|---|---|---|
| Ältester Sohn | Der älteste Sohn. | Die älteste Tochter. |
| Jüngster Sohn | Die Söhne teilen das Gut, das Haus bleibt ungeteilt beim jüngsten Sohn. | Das Gut fällt an den Herrn. Ein Paar des Ortes übernimmt. |
| Söhne gleich | Einer der Söhne, jeder mit gleicher Chance. Töchter sind mit der Mitgift abgefunden. | Eine der Töchter. |
| Kinder gleich | Eines der Kinder, Söhne und Töchter mit gleicher Chance. | Eine der Töchter. |
| Söhne doppelt | Eines der Kinder, ein Sohn mit der doppelten Chance einer Tochter. | Eine der Töchter. |

## Daten und Parameter

Stufe 1 heisst: Ein Gesetz oder eine Studie zum 13. oder 14. Jahrhundert wurde gelesen. Stufe 2 heisst: gelesen, aber aus späterer Zeit, oder aus Todds Karte der Familientypen. Die Karte reicht laut Duranton u. a. 2008 «mindestens ins Mittelalter» zurück, ist aber nur von einem Kartenbild abgelesen.

| Wer | Personen 1291 | Brauch | Stufe | Herkunft |
|---|---|---|---|---|
| Muslime aller Kulturen | 26'260 | Söhne doppelt | 1 | Koran 4:11: Ein Sohn erbt doppelt so viel wie eine Tochter. |
| Lombardisch, toskanisch, venezianisch, ligurisch | 11'098 | Söhne gleich | 1 | Stadtrecht von Turin 1360: Eine verheiratete Tochter mit Brüdern kann nichts fordern. Laut Gravela 2018 «in allen italienischen Stadtstaaten üblich». |
| Englisch | 4'183 | Ältester Sohn | 1 | Common Law; Gates 1996; Smith 1986. |
| Katalanisch | 1'557 | Ältester Sohn | 1 | To i Figueras; Ferrer Alòs 2005. |
| Nowgoroder, russisch, ruthenisch | 1'362 | Jüngster Sohn | 1 | Erweiterte Russkaja Prawda, Art. 90, 92, 95 und 100 (Kaiser 1992). |
| Dänisch, schwedisch, norwegisch | 621 | Söhne doppelt | 1 | Tveit 2020: Eine Tochter erbt ein halbes Los ihres Bruders. |
| Deutsche Kulturen | 13'139 | Ältester Sohn | 2 | Todds Karte; Huning & Wahl 2021. |
| Okzitanisch, baskisch, aragonesisch, galicisch, schottisch | 6'142 | Ältester Sohn | 2 | Lamaison 1988; Fauve-Chamoux; Todds Karte. |
| Französisch, pikardisch, burgundisch, bretonisch | 16'466 | Kinder gleich | 2 | Lamaison 1988; Brauch der Bretagne von 1539; Todds Karte. |
| Kastilisch | 3'181 | Kinder gleich | 2 | Westgotisches Recht; Leyes de Toro 1505. |
| Tschechisch | 1'099 | Jüngster Sohn | 2 | Velková 2023: Böhmen 1691 bis 1787. |
| Ohne Brauch | 17'248 | alte Regel | | Flämisch, holländisch, griechisch, portugiesisch, Süditalien, ungarisch, die übrigen Slawen, nubisch, Westafrika mit altem Glauben, baltisch, georgisch, armenisch, jüdisch. |

Eigene Festlegungen ohne Quelle: ab welchem Alter ein Erbe erwachsen ist, dass das nächste Kind nachrückt, und dass eine Erbin ab 45 den Haushalt nicht übernimmt.

## Historische Prüfung

Welt von 1291, 100 Jahre, nur Tod, Heirat und Geburt (`npm run families:check`).

| Grösse | Gründung | Jahr 100 | Ohne Erbbrauch, Jahr 100 |
|---|---|---|---|
| Personen | 102'042 | 97'223 | 97'823 |
| Haushalte | 17'702 | 17'702 | 17'702 |
| Personen je Haushalt | 5,76 | 5,49 | 5,53 |
| Alter der Bräute | | 24,0 | 23,8 |

In den Jahren 41 bis 100 gehen 37'347 Haushalte an ein neues Paar, 41 % davon an ein Kind des Hauses. Nach Brauch, für Häuser mit einem lebenden Kind:

| Brauch | Ein Kind des Hauses übernimmt | Söhne / Töchter |
|---|---|---|
| Ältester Sohn | 52 % | 3'556 / 676 |
| Jüngster Sohn | 47 % | 362 / 17 |
| Söhne gleich | 48 % | 1'526 / 272 |
| Kinder gleich | 60 % | 1'914 / 1'868 |
| Söhne doppelt | 59 % | 2'961 / 2'200 |
| Ohne Brauch | 6 % (Zufall der Hochzeiten im Ort) | 185 / 173 |

Smith 1986 rechnet für England, dass rund 20 % der Familien beim Tod des Vaters nur Töchter haben. In unserer Welt sind es 15 %.

**Warum nicht mehr.** Wird ein Haushalt frei, lebt in neun von zehn Fällen ein Kind des letzten Paares. Erwachsen und frei ist aber nur in gut der Hälfte der Fälle eines. Die übrigen sind zu jung oder haben schon einen Haushalt.

**Warten auf einen zu jungen Erben** wurde in einer Probe gemessen und nicht gebaut: Dann übernehmen Erben 78 bis 81 % der Haushalte, aber 1'200 bis 1'700 Haushalte stehen dauernd ohne Hausfrau da, und die Welt ist nach 100 Jahren 5 bis 9 % kleiner.

## Massstab 1 : 100

Eine Person steht für hundert Menschen, ein Haushalt für hundert Haushalte. Die Anteile der Erben gelten unabhängig vom Massstab. In sehr kleinen Orten gibt es aber nur wenige mögliche Bräute und Männer, die nicht Geschwister sind. Orte mit weniger als 60 Personen schrumpfen in 100 Jahren um 9,6 %.

## Grenzen

- Der Haushalt wird nie geteilt. Es gibt also keine kleiner werdenden Höfe und keine neuen Haushalte durch Teilung.
- Ein Brauch je Kultur. In Wirklichkeit wechselte er oft von Dorf zu Dorf: In Baden-Württemberg vererbten 38 % der 3'382 Gemeinden an einen Erben, 31 % teilten (Röhm 1953, nach Huning & Wahl 2021). Okzitanisch steht hier für einen Erben, obwohl die Provence unter den Söhnen teilte.
- Für Frankreich, Deutschland und Kastilien wurden nur Belege aus späterer Zeit gelesen.
- Islamisches Ackerland gehörte der Staatskasse, die Bauern hatten das Nutzungsrecht (Abbas Hamid 2002). Wer es um 1300 übernahm, wurde nicht gefunden. Es wird wie Eigentum behandelt.
- Ein zu junger Erbe verliert den Haushalt an ein Paar des Ortes. Historisch hielt ein Vormund den Hof.
- Die Witwe behält den Haushalt überall, wie im englischen Recht. Andere Rechte der Witwe sind gelesen, aber nicht gebaut.
- Nicht lesbar waren Yver 1966 (Frankreich), Godding 1987 (Flandern), Laiou 1977 (Byzanz) und der Fuero Real (Kastilien).

## Quellen

- Duranton, G., Rodríguez-Pose, A., Sandall, R. (2008): Family types and the persistence of regional disparities in Europe. SERC Discussion Paper 9. https://eprints.lse.ac.uk/33152/1/sercdp0009.pdf
- Huning, T. R., Wahl, F. (2021): The origins of agricultural inheritance traditions. Journal of Comparative Economics, 660–674. https://eprints.whiterose.ac.uk/183709/1/origins_complete_jce.pdf
- Fauve-Chamoux, A.: Inheritance and Property. Encyclopedia of Children and Childhood in History and Society. https://www.encyclopedia.com/children/encyclopedias-almanacs-transcripts-and-maps/inheritance-and-property
- Lamaison, P. (1988): La diversité des modes de transmission. Études rurales 110–112, 119–175 (Zusammenfassung).
- Gravela, M. (2018): Against the tide. Mélanges de l'École française de Rome, Moyen Âge 130-1, 151–165.
- To i Figueras, L.: Els hereus i el dret de primogenitura. Enciclopèdia.cat. https://www.enciclopedia.cat/historia.-politica-societat-i-cultura-dels-paisos-catalans/els-hereus-i-el-dret-de-primogenitura
- Ferrer Alòs, L. (2005): When there was no male heir. Continuity and Change 20(1), 27–52 (Zusammenfassung).
- Bartolomé Bartolomé, J. M. (2009): Norba 22, 159–176.
- Tveit, M. (2020): Backwards inheritance in medieval Scandinavian law. In: Nordic Inheritance Law Through the Ages, Brill, 71–91. https://core.ac.uk/download/388989464.pdf
- Kaiser, D. H. (1992): The Laws of Rus', 20–34. https://web.grinnell.edu/individuals/kaiser/exrp.html
- Velková, A. (2023): Historická demografie 47(1), 1–27.
- Abbas Hamid, R. (2002): Why study ownership? In: Hanna, N. (Hg.), Money, Land and Trade. Cuno, K. M. (1999): Proceedings of the British Academy 96, 301–329. al-Marakeby, M. (2023): Could women own agricultural land? Die Welt des Islams (Zusammenfassung).
- Gates, L. A. (1996): Albion 28(1), 19–35 (Zusammenfassung). Smith, R. M. (1986): Transactions of the Royal Historical Society 36, 165–194 (Zusammenfassung).
- Technische Fassung mit allen Messungen: `docs/PEOPLE_DESIGN.md`, Feature 3. Die Bräuche mit Quelle je Zeile: `src/sim/people/inheritance.ts`.
