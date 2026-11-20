# Wahrzeichen

**Status:** Entwurf · **Bereich:** Siedlung · **Stand:** 2026-11-19

> Jede Stadt hat ihre grossen Bauten von 1291: die Kirche ihres Bischofssitzes, die Bauwerke, die man beim Namen kennt, die Konvente der Bettelorden und die Residenz ihres Herrschers. Sie stehen mit Lage, Grösse und Baujahren im Grundbuch der Welt, in echter Grösse und, wo bekannt, an ihrem echten Ort.

Ramon hat den Vorschlag am 19. November 2026 angenommen («Ja, alles wie vorgeschlagen»). Gebaut in Zustand 35.

## Das Feature

Bisher stellte die 3D-Welt in jede grössere Stadt eine Kirche, die sie selbst erfand, und ein paar berühmte Bauwerke aus einer Liste, die zum Teil erst nach 1291 gebaut wurden. Jetzt legt die Simulation beim Gründen der Welt die Wahrzeichen jeder Stadt ins Grundbuch, und die 3D-Welt zeichnet nur noch diese.

Nicht dabei: Pfarrkirchen, Spitäler, Rathäuser, Zunfthäuser, Synagogen, Brücken und Mauern. Es wird noch nichts gebaut, während die Welt läuft. Die Liste gilt für 1291.

## Im Spiel

In der Mitte jeder Bischofsstadt steht ihre Kathedrale, in einer muslimischen Stadt ihre Freitagsmoschee. Notre-Dame steht 1291 auf der Île de la Cité und ist noch im Bau, der Kölner Dom ist erst ein Chor, der Leuchtturm von Alexandria steht noch und ist ab 1303 eine Ruine. Am Rand der lateinischen Städte stehen die Konvente der Franziskaner, Dominikaner, Augustiner-Eremiten und Karmeliter, in der Hauptstadt eines Reichs die Burg oder der Palast seines Herrschers. Die grossen Abteien wie Cluny, Cîteaux, Einsiedeln oder Monte Cassino stehen allein an ihrem Ort.

## Das Modell

1. **Kirche des Bischofssitzes.** Jede Stadt, die 1291 Sitz eines Erzbischofs oder Bischofs war, hat ihre Kathedrale, ein orthodoxer Sitz seine orthodoxe Kathedrale, eine muslimische Stadt ihre Freitagsmoschee. Ohne Namen steht sie in der Mitte der Stadt.
2. **Bauwerke mit Namen.** Sie stehen an ihrem echten Ort: ihre echten Meter vom Stadtpunkt mal 0,1. Eine Stadt der Welt hat ein Hundertstel der Leute bei gleicher Dichte der Häuser, ist also ein Zehntel so breit; ein Bau behält seine echte Grösse. Ist der Ort schon belegt oder kein Baugrund, rückt der Bau auf den nächsten freien Platz.
3. **Gassen darum herum.** Diese Wahrzeichen liegen vor den Gassen. Keine Gasse läuft über sie, keine Parzelle liegt näher als 4 m; eine Gasse darf um die Kirche herum laufen.
4. **Konvente am Rand.** Eine lateinische Stadt hat einen Konvent jedes Bettelordens, für den sie 1291 gross genug war: Franziskaner ab 2'000 Leuten der Zeit, Dominikaner ab 4'000, Augustiner-Eremiten ab 10'000, Karmeliter ab 15'000. Sie stehen am Rand der Stadt, wo die Brüder Boden fanden.
5. **Residenz.** Die grösste Stadt des Orts mit der Hauptstadt eines Reichs bekommt die Residenz des Herrschers: einen Palast, wo das Reich muslimisch ist, sonst eine Burg. Nicht, wo eine mit Namen bekannt ist oder die Kirche sie enthält (der Dogenpalast bei San Marco).
6. **Allein.** Abteien und Burgen ausserhalb der Städte stehen an ihrem echten Ort.
7. **Gebaut im Jahr.** Aus den Baujahren folgt: noch nicht begonnen, im Bau, fertig, Ruine. Die 3D-Welt zeichnet einen Bau im Bau als den Teil, der schon steht, vom Ostende her (eine Kirche wurde vom Chor her gebaut), eine Ruine niedrig.

Die 3D-Welt nimmt das Modell der Art im Baustil der Stadt oder das eigene Modell des Bauwerks, dreht es mit der langen Seite wie den Bau und bringt die lange Seite auf die echte Länge. Eine Burg ist höchstens 30 m hoch.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Bischofssitze 1291 | 48 Erzbischöfe, 182 Bischöfe, 19 orthodoxe, 75 Freitagsmoscheen | Eubel (1913), 18 davon nachgeprüft |
| Bauwerke mit Namen | 64, davon 27 Abteien; 24 stehen allein | Wikipedia-Artikel der Bauwerke |
| Massstab der Lage | 0,1 = √(1/100) | eigene Regel, aus dem Massstab |
| Grösse ohne Angabe | Kathedrale 90 × 32 m, Erzbischofskirche 130 × 45 m, Konvent 60 × 36 m, Burg 60 × 50 m … | Platzhalter: die Mitte der bekannten Masse |
| Bettelorden | ab 2'000 / 4'000 / 10'000 / 15'000 Leuten der Zeit | Platzhalter; Reihenfolge nach Le Goff (1968) |

## Was die Welt von 1291 bekommt

1'766 Wahrzeichen: 230 Kathedralen, 19 orthodoxe Kathedralen, 75 Freitagsmoscheen, 1'247 Konvente, 27 Abteien, 141 Burgen, 22 Paläste, 2 Kirchen, 3 Monumente. Paris hat sieben: Notre-Dame, den Palais de la Cité, die Burg Louvre und vier Konvente. London hat acht.

17 der 40 Bauwerke mit Namen in den Städten stehen genau an ihrem Ort, die anderen im Mittel 40 m daneben, wo Wasser oder ein anderer Bau den Platz nahm.

Sechs Städte haben auf ihrem Baugrund zu wenig Platz und werden ohne Rücksicht auf den Boden angelegt, aber neben ihren Wahrzeichen: Venedig, Aberdeen, Bagdad, Dax, Sevilla und Strassburg.

## Lücken

- Die Bischofssitze sind aus dem Wissen zusammengestellt und an 18 Orten nachgeprüft; Eubel selbst war nicht lesbar.
- Die Schwellen der Bettelorden, die Grössen ohne Angabe und die Lage am Rand sind Platzhalter.
- Die Modelle sind die der 3D-Welt, gleichmässig vergrössert; nur einige Bauwerke haben ein eigenes.

## Quellen

- Eubel (1913): Hierarchia catholica medii aevi, Band 1.
- Le Goff (1968): Apostolat mendiant et fait urbain dans la France médiévale. Annales ESC 23(2), 335–352.
- Emery (1962): The Friars in Medieval France (nicht gelesen).
- Darrouzès (1981): Notitiae episcopatuum Ecclesiae Constantinopolitanae (nicht gelesen).
- Die Wikipedia-Artikel der Bauwerke.

Mehr in [docs/SETTLEMENT_DESIGN.md](../../SETTLEMENT_DESIGN.md), Feature 5.
