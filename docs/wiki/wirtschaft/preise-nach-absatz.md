# Preise nach Absatz

**Status:** Im Spiel (am 16.11.2026 freigegeben und gebaut; seit dem 16.11.2026 in der laufenden Welt) · **Bereich:** Wirtschaft · **Stand:** 2026-11-16

> Ein Betrieb, der mehr Nachfrage hatte als geplant, hebt seinen Preis oder seine Menge. Ein Betrieb, der zu wenig verkauft hat, senkt seinen Preis oder seine Menge. Vorher folgte der Preis nur den Kosten. Mit dieser Regel hat in den Städten fast niemand mehr keine Arbeit.

Diese Seite beschreibt Feature 8. Es gehört zur [Wirtschaft der Städte](wirtschaft-der-staedte.md) und baut auf dem [Lohn in Geld](lohn-in-geld.md) auf. Das [Arbeitslosengeld der Städte](arbeitslosengeld-der-staedte.md) bleibt, wie es ist. Alle Zahlen stammen aus dem Spielcode.

## Das Feature

Im Modell von Poledna u. a. (2023) plant ein Betrieb so viel, wie zuletzt nachgefragt wurde, und sein Preis ändert sich nur mit seinen Kosten und der erwarteten Teuerung. Was er verkauft, kommt im Preis nie an.

CANVAS, das Modell der Bank of Canada, das auf dem von Poledna u. a. aufbaut, hat dafür eine Regel (Hommes u. a. 2022). Die Städte des Spiels rechnen jetzt mit ihr: Ein Betrieb vergleicht an seinem Plantag, was nachgefragt wurde, mit dem, was er geplant hatte, und ändert um diese Lücke entweder seine Menge oder seinen Preis.

Nicht dazu gehören: das Ende des Arbeitslosengelds, ein Lohn, der sich bewegt, und die Zentralbank von CANVAS, die ihre Zinsregel lernt.

## Im Spiel

Es gibt keine eigene Anzeige. Die Wirkung steht im Abschnitt «Wirtschaft der Stadt» des Ortsfensters: Die Zeile «Ohne Arbeit» steht fast immer bei null, der «Stand (Start = 100)» steigt in den ersten 20 Jahren auf rund 116, und das «Preisniveau heute (Start = 100)» liegt je nach Stadt zwischen 89 und 102.

## Das Modell

An seinem Plantag, alle 30 Tage, kennt ein Betrieb das Angebot pro Tag, das er beim letzten Plan festgelegt hat, und die mittlere Nachfrage pro Tag seither.

    Lücke = Nachfrage / Angebot − 1

Er ändert um die Lücke entweder die Menge oder den Preis, nie beides:

| | Sein Preis liegt nicht unter dem seiner Branche | Sein Preis liegt darunter |
|---|---|---|
| Ausverkauft (Nachfrage mindestens so gross wie das Angebot) | Menge steigt um die Lücke | Preis steigt um die Lücke |
| Nicht ausverkauft | Preis sinkt um die Lücke | Menge sinkt um die Lücke |

    Angebot = altes Angebot · erwartetes Wachstum · (1 + Lücke oder 0)
    Preis   = alter Preis · Kostendruck · erwartete Teuerung · (1 + Lücke oder 0)

Kostendruck und Erwartungen sind die des Papiers; im Kostendruck steht der [Lohn in Geld](lohn-in-geld.md).

Warum es den Lohn in Geld braucht: Solange der Lohn den Preisen folgte, war das Preisniveau die Summe aller Lücken, und nichts holte es zurück. Im Probelauf fielen die Preise der Städte so in 7 bis 11 Jahren auf null. Mit dem festen Lohn in Geld wird Arbeit für einen Betrieb teuer, dessen Preis gefallen ist, und der Kostendruck hebt den Preis wieder.

Unsere Übertragung: CANVAS wendet die Regel jedes Quartal an, das Spiel am Plantag jedes Betriebs mit der mittleren Nachfrage pro Tag. Mit einem Plan in jeder Periode rechnet der Motor Zahl für Zahl dasselbe wie das CANVAS-Modell des Ports; ein Test prüft das.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Art, wie Betriebe Menge und Preis planen | nach der Lücke zwischen Nachfrage und Angebot | Annahme, in der Eichtabelle so markiert. Regel von CANVAS: Hommes u. a. (2022), Abschnitt 3.2.4, Gleichungen 34 bis 37. Für 1356 gibt es keine Quelle |
| Anteil der Betriebe, die anpassen | jeder Betrieb an seinem Plantag | Voreinstellung des Originalcodes (`theta_calvo` = 1) |
| Angebot am Start | die Nachfrage am Start | wie im Originalcode, damit die erste Lücke null ist |
| Lohn | fester Lohn in Geld | Feature 7 |
| Arbeitslosengeld | unverändert, 55 % des Lohns nach Steuern | Feature 6 |

An der Eichung keiner Stadt ändert sich eine Zahl.

## Historische Prüfung

Keine. Die Regel stammt aus einem Modell für eine heutige Volkswirtschaft; für 1356 wurde keine Quelle benutzt.

### Probelauf im Spiel

Vier Welten des Spiels über 30 Jahre, Tag für Tag gerechnet (`npm run economy:check 30 4`), dieselben Welten mit den Features davor und jetzt:

| Alle Städte zusammen, Jahr 30 | Feature 6 allein | Mit Feature 7 | Jetzt | Spanne der Welten jetzt |
|---|---|---|---|---|
| Reale Produktion (Start = 100) | 107,2 | 104,1 | 116,4 | 116,1 bis 116,6 |
| Preisniveau (Start = 100) | 123,6 | 100,0 | 94,8 | 94,1 bis 95,3 |
| Preisniveau einer einzelnen Stadt am letzten Tag | | 99,5 bis 100,5 | 90,0 bis 100,7 | 88,8 bis 101,9 |
| Ausfuhr = Einfuhr, Anteil an der Produktion | 2,25 % | 2,00 % | 2,68 % | 2,64 % bis 2,69 % |
| Ohne Arbeit, Mittel aller Städte und Tage der 30 Jahre | 0,70 % | 1,14 % | 0,05 % | 0,04 % bis 0,06 % |
| Ohne Arbeit, schlechteste Stadt an ihrem schlechtesten Tag | 4,9 % | 6,2 % | 2,4 % | 2,3 % bis 2,5 % |
| Stadt mit der tiefsten Produktion (ihr Start = 100) | 101,3 | 98,5 | 111,4 | 109,8 bis 113,3 |
| Stadt mit der höchsten Produktion | 113,9 | 114,1 | 117,5 | 117,4 bis 117,5 |

| Reale Produktion aller Städte (Start = 100) | Jahr 5 | Jahr 10 | Jahr 20 | Jahr 30 |
|---|---|---|---|---|
| Jetzt, Mittel der Welten | 107,9 | 113,2 | 115,9 | 116,4 |
| Mit Feature 7, Mittel der Welten | 106,1 | 106,6 | 105,5 | 104,1 |

Acht Welten über 5 Jahre (`npm run economy:check 5 8`): Produktion 107,8, Preisniveau 99,7, ohne Arbeit 0,29 %, tiefste Stadt 103,2. Die Bücher weichen höchstens um 1,2 · 10⁻¹³ ihres Betrags ab.

Die Produktion steigt rund 20 Jahre und bleibt dann bei 116. Das ist die Grenze des Kapitals: Die Eichung lässt jeden Betrieb am Start mit 85 % dessen arbeiten, was sein Kapital hergibt, und im Modell ersetzen Investitionen nur, was sich abnutzt. Höher als 100 / 0,85 = 117,6 kann keine Stadt kommen.

### 100 Jahre ausserhalb des Spiels

Dieselben 29 verbundenen Städte in drei Läufen über 100 Jahre (Startwerte 1356 bis 1358, jeder Tag gerechnet):

| Jahr (3 Läufe) | 10 | 30 | 50 | 75 | 100 |
|---|---|---|---|---|---|
| Reale Produktion aller Städte (Start = 100) | 113,3 bis 114,5 | 115,8 bis 116,3 | 116,0 bis 116,3 | 115,5 bis 116,0 | 115,8 bis 116,0 |
| Preisniveau aller Städte (Start = 100) | 96,7 bis 97,7 | 95,2 bis 95,5 | 94,6 bis 95,4 | 94,6 bis 95,6 | 94,9 bis 95,7 |
| Tiefste Stadt (ihr Start = 100) | 104,9 bis 109,3 | 110,8 bis 112,5 | 110,4 bis 113,1 | 112,0 bis 114,9 | 111,6 bis 113,7 |

In keinem geprüften Jahr steht eine Stadt unter ihrem Start, und nach dem Jahr 5 ist an den geprüften Tagen niemand ohne Arbeit. In einem Lauf planten die Betriebe 3,4 Millionen Mal: Die Nachfrage lag zwischen dem 0,14-Fachen und dem 2,2-Fachen des geplanten Angebots, 1,1 % der Pläne lagen ausserhalb von der Hälfte bis zum Doppelten. 64,5 % der Pläne änderten den Preis, die übrigen die Menge.

### Ohne Arbeitslosengeld

Mit diesem Feature behielt das Spiel das Arbeitslosengeld. Ausserhalb des Spiels liefen dieselben Städte drei Mal 30 Jahre ohne es: Produktion 115,8 bis 116,1, tiefste Stadt 109,4 bis 111,9, keine Stadt unter ihrem Start, ab dem Jahr 10 an den geprüften Tagen niemand ohne Arbeit, Preisniveau 95,1 bis 95,8. Mit dem Lohn in Geld allein und ohne Arbeitslosengeld stand die Produktion im Probelauf bei 89,8 und die tiefste Stadt bei 65,4.

## Massstab 1 : 100

Die Regel rechnet mit Verhältnissen und hängt nicht vom Massstab ab.

## Grenzen

- Die Regel hat keine Schranke. Ein Betrieb ganz ohne Nachfrage seit seinem letzten Plan würde seinen Preis oder seine Menge auf null setzen, und ein Betrieb ohne Angebot teilt beim nächsten Plan durch null. Der Originalcode hat dieselbe Eigenschaft. Die Wirtschaft der Welt bliebe dann mit dem Grund stehen. In 3,4 Millionen Plänen über 100 Jahre lag die kleinste Nachfrage beim 0,14-Fachen des Angebots; vorgekommen ist es in keinem Lauf. Dagegen eingebaut ist nichts.
- Das Preisniveau pendelt sich bei rund 95 ein und nicht bei 100, einzelne Städte zwischen 89 und 102. Warum bei 95, ist nicht untersucht.
- Die Preise einzelner Betriebe laufen weit auseinander: in 100 Jahren vom 0,14-Fachen bis zum 1,87-Fachen ihres Starts.
- Die Städte laufen an der Grenze ihres Kapitals, und niemand ist ohne Arbeit. Das Modell kennt keine Regel, nach der Kapital über den Ersatz hinaus wächst.
- Der Lohn bewegt sich weiterhin nicht. Preise sinken und steigen jetzt mit dem Absatz, Löhne nicht.
- Die Regel am Plantag mit der mittleren Nachfrage pro Tag anzuwenden, ist unsere Übertragung; CANVAS rechnet in Quartalen.
- Das Arbeitslosengeld blieb mit diesem Feature. Seit Feature 9 ist es wieder ausgeschaltet (siehe [Ohne Arbeitslosengeld](ohne-arbeitslosengeld.md)); die Zahlen dieser Seite sind mit Arbeitslosengeld gerechnet.
- Der Handel sinkt weiter, von 3,3 % der Produktion am Start auf 2,68 % im Jahr 30.
- Die langen Läufe sind wenige: vier Welten über 30 Jahre im Spiel, drei Läufe über 100 Jahre ausserhalb.
- An der Geschichte ist nichts davon geprüft.

## Quellen

- Hommes, He, Poledna, Siqueira, Zhang (2022): CANVAS: A Canadian Behavioral Agent-Based Model. Bank of Canada Staff Working Paper 2022-51, Abschnitt 3.2.4, Gleichungen 34 bis 37. Geöffnet am 15.11.2026.
- BeforeIT.jl (Banca d'Italia): `src/model_extensions/init_CANVAS.jl`, Zeilen 45 bis 75 (die Regel) und 146 (Angebot am Start); `src/model_init/init_properties.jl`, Zeile 85 (`theta_calvo`). Port: `src/model_extensions/canvas.rs`, https://github.com/ramonfueglister/port-beforeit
- Poledna, Miess, Hommes, Rabitsch (2023): Economic forecasting with an agent-based model. European Economic Review 151, 104306. Anhang A.5, A.8, A.9 (Menge, Preis, Kostendruck), A.13, A.14 (Produktion, Investition), gelesen im Port.
