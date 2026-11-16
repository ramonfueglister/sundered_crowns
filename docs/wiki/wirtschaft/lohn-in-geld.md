# Lohn in Geld

**Status:** Beschlossen (am 16.11.2026 freigegeben und gebaut; noch nicht in der laufenden Welt) · **Bereich:** Wirtschaft · **Stand:** 2026-11-16

> Jeder Betrieb einer Stadt zahlt einen Lohn in Geld, der sich nicht ändert. Vorher folgte der Lohn den Preisen eins zu eins, und nichts hielt das Preisniveau. Mit dem Lohn in Geld bleibt es über Jahrzehnte bei seinem Start.

Diese Seite beschreibt Feature 7. Es gehört zur [Wirtschaft der Städte](wirtschaft-der-staedte.md). Die Preisregel des Modells und das [Arbeitslosengeld der Städte](arbeitslosengeld-der-staedte.md) bleiben, wie sie sind. Alle Zahlen stammen aus dem Spielcode.

## Das Feature

Im Modell von Poledna u. a. (2023) hat jeder Betrieb einen Reallohn, der sich nie ändert. Ausgezahlt wird dieser Reallohn mal das Preisniveau der Konsumgüter. Steigen die Preise, steigt der Lohn im gleichen Mass, und umgekehrt. Deshalb hält im Modell nichts die Höhe der Preise fest.

In den Städten des Spiels hat jeder Betrieb jetzt einen Lohn in Geld, der sich nicht ändert. Das ist der feste Geldlohn aus dem Modell von Assenza, Delli Gatti und Grazzini (2015). Er ist der Anker, an dem die Preise hängen.

Nicht dazu gehören: eine neue Preisregel, ein Lohn, der auf den Arbeitsmarkt reagiert, das Ende des Arbeitslosengelds und eine Aussage über die Löhne von 1356.

## Im Spiel

Es gibt keine eigene Anzeige. Die Wirkung steht im Abschnitt «Wirtschaft der Stadt» des Ortsfensters in der Zeile «Preisniveau heute (Start = 100)»: Sie bleibt nahe bei ihrem Start, statt über die Jahre zu steigen.

## Das Modell

Was ein Betrieb für eine Einheit Arbeit zahlt:

    vorher:  Lohn = fester Reallohn · Preisniveau der Konsumgüter
    jetzt:   Lohn = fester Lohn in Geld

Der Motor des Modells bleibt unverändert und rechnet weiter «Reallohn mal Preisniveau». Darum setzt das Spiel jeden Tag, bevor die Betriebe entscheiden, den Reallohn jedes Betriebs auf seinen Lohn in Geld geteilt durch das Preisniveau.

Der Preis eines Betriebs ändert sich an seinem Plantag um den Kostendruck und die erwartete Teuerung (Anhang des Papiers, A.8 und A.9). Im Kostendruck steht der Preis der Arbeit. Im Papier ist das das Preisniveau der Konsumgüter, weil der Lohn ihm folgt. Jetzt ist es der Lohn in Geld, der bei seinem Start bleibt:

    Kostendruck der Arbeit = (1 + Sozialabgabe) · Reallohn am Start / Produktivität · (Preis der Arbeit / eigener Preis − 1)

Liegt der Preis eines Betriebs über seinem Start, ist Arbeit gemessen an seinem Preis billig, und er senkt den Preis. Liegt er darunter, hebt er ihn. So kommen die Preise zum Lohn zurück. Die Teile des Kostendrucks für Vorleistungen und Kapital sind die des Papiers.

Der feste Geldlohn steht bei Assenza u. a. Wie er in das Modell von Poledna u. a. eingeht (der Reallohn jeden Tag neu, der Lohn in Geld im Kostendruck), ist unsere Übertragung und steht in keinem Papier.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Art des Lohns in den Städten | Lohn in Geld | Annahme, in der Eichtabelle so markiert. Fester Geldlohn nach Assenza, Delli Gatti, Grazzini (2015), Tabelle 2. Für 1356 gibt es keine Quelle |
| Lohn in Geld je Betrieb | der Lohn des Betriebs am Start | aus der Eichung der Stadt; am Start ist das Preisniveau 1 |
| Preisregel | unverändert | Poledna u. a. (2023), A.8 und A.9 |
| Arbeitslosengeld | unverändert, 55 % des Lohns nach Steuern | Feature 6 |

An der Eichung keiner Stadt ändert sich eine Zahl.

## Historische Prüfung

Keine. Ein Lohn in Geld, der sich über Jahrzehnte nicht ändert, ist keine Aussage über 1356. Die Verordnung über die Arbeiter von 1349 legte die Löhne in England auf den Stand vor der Pest fest, als Obergrenze; für dieses Feature wurde keine Quelle zur Eichung benutzt.

### Probeläufe vor dem Bau

Drei Probeläufe ausserhalb des Spiels (29 verbundene Städte, 30 Jahre):

- Jede Preisregel aus der Literatur, die auf den Absatz eines Betriebs reagiert, lief davon, solange der Lohn den Preisen folgte: die Regel von CANVAS (Preise nach 7 bis 11 Jahren bei null), der Aufschlag des K+S-Modells (Preise 353 und schneller steigend), die Regel von CATS (Preise mal 129'000).
- Mit dem festen Lohn in Geld blieb das Preisniveau mit der Preisregel des Papiers 100 Jahre lang bei 100,0.
- Lohnregeln, die am Arbeitsmarkt hängen, hielten in den Städten nicht: Die Lohngleichung des K+S-Modells teilt durch eine Arbeitslosenquote, die hier nahe null liegt, und brach 6 von 12 Läufen ab. Die Regel von Lengnick (2013) trieb die Preise von Kairo in 30 Jahren auf das 12,8-Fache.

### Probelauf im Spiel

Vier Welten des Spiels über 30 Jahre, Tag für Tag gerechnet (`npm run economy:check 30 4`), dieselben Welten mit Feature 6 allein und jetzt:

| Alle Städte zusammen, Jahr 30 | Feature 6 allein | Jetzt | Spanne der Welten jetzt |
|---|---|---|---|
| Preisniveau (Start = 100) | 123,6 | 100,0 | 100,0 bis 100,1 |
| Preisniveau einer einzelnen Stadt am letzten Tag | | 99,5 bis 100,5 | 99,5 bis 100,6 |
| Reale Produktion (Start = 100) | 107,2 | 104,1 | 103,2 bis 104,8 |
| Ausfuhr = Einfuhr, Anteil an der Produktion | 2,25 % | 2,00 % | 1,97 % bis 2,03 % |
| Ohne Arbeit, Mittel aller Städte und Tage der 30 Jahre | 0,70 % | 1,14 % | 0,77 % bis 1,34 % |
| Ohne Arbeit, schlechteste Stadt an ihrem schlechtesten Tag | 4,9 % | 6,2 % | 5,8 % bis 7,3 % |
| Stadt mit der tiefsten Produktion (ihr Start = 100) | 101,3 | 98,5 | 97,5 bis 99,4 |
| Stadt mit der höchsten Produktion | 113,9 | 114,1 | 113,6 bis 114,7 |

| Reale Produktion aller Städte (Start = 100) | Jahr 5 | Jahr 10 | Jahr 12 | Jahr 20 | Jahr 30 |
|---|---|---|---|---|---|
| Jetzt, Mittel der Welten | 106,1 | 106,6 | 107,4 | 105,5 | 104,1 |
| Feature 6 allein, Mittel der Welten | 105,1 | 107,0 | | 108,0 | 107,2 |

Acht Welten über 5 Jahre (`npm run economy:check 5 8`): Produktion 106,9 (Feature 6 allein: 105,0), Preisniveau 100,1 (103,7), ohne Arbeit 0,35 % (0,51 %), tiefste Stadt 102,6 (100,8).

Das Preisniveau hält. Die Produktion ist in den ersten Jahren höher als mit Feature 6 allein und später tiefer: Sie erreicht im Jahr 12 mit 107,4 ihren höchsten Stand und sinkt danach langsam. In der Welt mit dem Startwert 1356 stehen nach 30 Jahren zwei von 29 Städten unter ihrem Start (Isfahan 98,6 und Aleppo 99,0); mit Feature 6 allein war es keine. Die Bücher weichen höchstens um 2,0 · 10⁻¹³ ihres Betrags ab.

Ausserhalb des Spiels liefen dieselben 29 verbundenen Städte in drei Läufen 100 Jahre (Startwerte 1356 bis 1358, jeder Tag gerechnet). Die Produktion sinkt nicht immer weiter: Sie schwankt das ganze Jahrhundert zwischen 102 und 108 und endet bei 102,3, 106,6 und 104,3. Das Preisniveau aller Städte bleibt in jedem geprüften Jahr zwischen 99,9 und 100,2, keine Stadt weiter als 1,0 von 100 entfernt. Zu einem Zeitpunkt stehen 0 bis 9 der 29 Städte unter ihrem Start, die tiefste bei 95,1.

| Jahr (3 Läufe ausserhalb des Spiels) | 10 | 30 | 50 | 75 | 100 |
|---|---|---|---|---|---|
| Reale Produktion aller Städte (Start = 100) | 105,1 bis 105,7 | 103,2 bis 106,6 | 103,2 bis 104,4 | 103,6 bis 104,6 | 102,3 bis 106,6 |
| Preisniveau aller Städte (Start = 100) | 99,9 bis 100,0 | 100,0 bis 100,1 | 100,0 bis 100,1 | 100,0 bis 100,1 | 100,0 bis 100,1 |
| Tiefste Stadt (ihr Start = 100) | 98,8 bis 100,2 | 97,1 bis 101,1 | 97,2 bis 98,3 | 95,1 bis 98,3 | 98,0 bis 100,4 |
| Städte unter ihrem Start | 0 bis 1 | 0 bis 7 | 4 bis 6 | 3 bis 8 | 0 bis 9 |

## Massstab 1 : 100

Der Lohn in Geld ist der Lohn der Eichung und wie alle Beträge der Städte im Massstab 1 : 100.

## Grenzen

- Ein Lohn, der sich nie ändert, kann auch nicht sinken und nicht steigen. Er ist der Anker, den eine Lohn- oder Preisregel braucht, die reagiert, und noch nicht diese Regel.
- Der Lohn ist je Betrieb auf dem Wert des Starts fest. Nichts bindet ihn an den Arbeitsmarkt, an die Leistung je Kopf oder an das Münzgeld der Stadt.
- Wie der feste Lohn in den Kostendruck eingeht, ist unsere Lesart der Formel A.9 und steht in keinem Papier.
- Die Preisregel ist die des Papiers: Preise folgen den Kosten und der erwarteten Teuerung, nicht dem Absatz eines Betriebs. Die Regel von CANVAS auf dem Lohn in Geld wurde ausserhalb des Spiels geprobt (Produktion 116, niemand ohne Arbeit, mit und ohne Arbeitslosengeld); sie ist nicht gebaut und wäre ein eigenes Feature.
- Das Arbeitslosengeld bleibt und ist weiter vorläufig.
- Der Motor rechnet den Lohn mit dem Preisniveau vom Ende des Tages; der ausgezahlte Lohn weicht darum um die Preisänderung eines Tages vom Lohn in Geld ab.
- Der Handel sinkt weiter, auf 2,00 % der Produktion im Jahr 30.
- Die langen Läufe sind wenige: vier Welten über 30 Jahre im Spiel, drei Läufe über 100 Jahre ausserhalb.
- An der Geschichte ist nichts davon geprüft.

## Quellen

- Assenza, Delli Gatti, Grazzini (2015): Emergent Dynamics of a Macroeconomic Agent Based Model with Capital and Credit. CESifo Working Paper 4765, Tabelle 2 (fester Geldlohn w = 1). Geöffnet am 16.11.2026.
- Poledna, Miess, Hommes, Rabitsch (2023): Economic forecasting with an agent-based model. European Economic Review 151, 104306. Anhang A.8, A.9 (Preis und Kostendruck), A.26 (Lohn), gelesen im Port.
- BeforeIT.jl (Banca d'Italia): `src/agent_actions/firms.jl`, Zeilen 120 bis 127 und 221 (Lohn = Reallohn mal Preisniveau). Port: https://github.com/ramonfueglister/port-beforeit
- Für die Probeläufe: Hommes u. a. (2022), Bank of Canada Staff Working Paper 2022-51 (CANVAS); Dosi, Fagiolo, Roventini (2010) und Dosi u. a. (2015), OFCE Working Paper 2014-05 (K+S); Lengnick (2013), Journal of Economic Behavior & Organization 86; Dawid, Delli Gatti, Fierro, Poledna (2024), CESifo Working Paper 11411.
