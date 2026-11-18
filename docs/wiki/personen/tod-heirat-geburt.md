# Tod, Heirat und Geburt

**Status:** Gebaut · **Bereich:** Personen · **Stand:** 2026-11-18

> Die Personen der Städte sterben, heiraten und bekommen Kinder. Die Welt ist geschlossen: Es gibt nur die Personen der Simulation, und ihre Zahl bleibt über hundert Jahre etwa gleich.

## Das Feature

Ramon, 17.11.2026: Alle Personen werden simuliert, und eine Person wird nur gerechnet, wenn bei ihr etwas fällig ist. Von aussen kommt niemand in die Welt. Eine Welt, die als Ganzes schrumpft, wäre für 1291 falsch.

Vorlage ist England um 1300 nach La Poutré & Paping 2025: Die Bevölkerung wächst nicht, weil die Zahl der Haushalte fest ist. Geheiratet wird nur, wenn ein Haushalt frei wird.

Nicht dazu gehören: Umzug zwischen Orten (ein eigenes Feature: [Umzug zwischen Orten](umzug.md)), Seuchen, Hunger, Tod im Kindbett und Haushalte, die mit der Wirtschaft mehr werden.

## Im Spiel

Im Ortsfenster ändert sich die Zahl der Personen. Die Liste der Personen eines Ortes zeigt nur die Lebenden.

## Das Modell

**Tod.** Der Todestag wird einmal gezogen, wenn eine Person in die Welt kommt, aus der Sterbetafel und dem erreichten Alter. Die Kraft der Sterblichkeit im Alter *x* ist

μ(x) = (x + 1,5)^(−ω) + e^θ · [1 + e^(x−16) / (1 + e^(x−16))] + e^(β(x−100)) / (1 + e^(β(x−100)))

Der erste Teil ist die Kindersterblichkeit, der zweite ein Grundrisiko, das ab 16 steigt, der dritte das Alter.

**Haushalte.** Jeder Ort hat so viele Haushalte wie bei der Gründung. An der Spitze steht die Hausfrau. Stirbt sie, ist der Haushalt frei.

**Heirat**, am ersten Tag jedes Monats: Jeder freie Haushalt sucht eine Braut. Ihr Alter wird aus der Kurve von Coale und McNeil gezogen, genommen wird die ledige Frau des Ortes, die diesem Alter am nächsten ist. Ihr Mann ist der ledige Mann des Ortes ab 18, der ihrem Alter plus 3 Jahre am nächsten ist. Eine Witwe unter 45 heiratet wieder. Wer den Haushalt übernimmt, regelt der [Erbbrauch](erbbrauch.md). Seit dem Feature [Merkmale verschieben die Raten](merkmale-und-raten.md) wird unter den Ledigen, die höchstens 2,5 Jahre vom gesuchten Alter entfernt sind, nach Extraversion und Offenheit gelost, und Gewissenhaftigkeit und IQ verschieben ab 15 den Todestag.

**Geburt.** Eine Ehefrau mit lebendem Mann bekommt bis 45 Kinder, im fruchtbarsten Alter alle 33 Monate, mit dem Alter seltener: f(a) = 1 − exp(4,6 · ((a − 15)/30 − 1)). Ein Kind erbt IQ, Persönlichkeit und Gene der Eltern und Kultur und Glauben der Mutter.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Sterbetafel | β 0,064, θ −6,3, ω 2,7 | La Poutré & Janssen 2021 |
| Lebenserwartung bei Geburt, mit 27 | 35,1 Jahre, 25,8 Jahre | aus der Sterbetafel gerechnet |
| Zahl der Haushalte | fest | La Poutré & Paping 2025 |
| Alter der Bräute | im Mittel 24, keine unter 15,5 | La Poutré & Paping 2025 |
| Mann älter um | 3 Jahre | Männer heiraten mit etwa 27 (La Poutré & Paping 2025) |
| Abstand der Geburten | 2,75 Jahre | Programm zur Dissertation La Poutré 2023 |
| Suchfenster, jüngster Bräutigam 18, Witwen unter 45 heiraten wieder, neun Monate zwischen Geburten | | eigene Festlegungen ohne Quelle |

## Historische Prüfung

Welt von 1291, 100 Jahre (`npm run families:check`), vor dem Erbbrauch gemessen.

| Grösse | Gründung | Jahr 100 | La Poutré & Paping 2025 |
|---|---|---|---|
| Personen | 102'042 | 97'823 | kein Wachstum |
| Personen je Haushalt | 5,76 | 5,53 | 5,8 |
| Frauen von 40 bis 44 ohne Haushalt | 30 % | 27 % | etwa 30 % mit 40 nie verheiratet |
| Witwen unter den Hausfrauen | 14 % | 14 % | 10 % |
| Alter der Bräute | | 23,8 | 24 |

## Massstab 1 : 100

Eine Person steht für hundert Menschen. Ein Ort mit 60 Personen hat nur etwa zehn Haushalte, und der Zufall wiegt dort schwer: Einer von 550 Orten stirbt in 100 Jahren aus.

## Grenzen

- Die Sterbetafel stützt sich auf erwachsene Grundherren. Die Werte unter 15 Jahren sind hochgerechnet.
- Die Regeln stammen aus dem Programm zur Dissertation. Deren Kapitel III liess sich nicht öffnen.
- Die Vorlage beschreibt das ländliche England. Sie gilt hier für alle Orte der Karte.
- Ein Ort kann nicht über seine Haushalte hinaus wachsen. Seit dem Feature [Umzug zwischen Orten](umzug.md) ziehen Ledige zu und weg, die Zahl der Haushalte bleibt aber fest.

## Quellen

- La Poutré, H., Paping, R. (2025): English familial demography c. 1300: a reconstruction. Social Science History 49(2), 533–557. https://pure.rug.nl/ws/portalfiles/portal/1511914604/english-familial-demography-c-1300-a-reconstruction_1_.pdf
- La Poutré, H. (2023): English population 1086–1377. Dissertation, Groningen. Programm: https://pure.rug.nl/ws/portalfiles/portal/663712445/simulation_64294d0e31b65.txt
- La Poutré, H., Janssen, F. (2021): A two-parameter hazard function to describe age patterns of mortality in ancient Northwestern Europe. Genus 77(1):12. https://link.springer.com/10.1186/s41118-021-00122-w
- Technische Fassung: `docs/PEOPLE_DESIGN.md`, Feature 2.
