# Personen der Wirtschaft

**Status:** Im Spiel (am 16.11.2026 freigegeben und gebaut; seit dem 16.11.2026 in der laufenden Welt) · **Bereich:** Wirtschaft · **Stand:** 2026-11-16

> Wer in der Wirtschaft einer Stadt arbeitet, einen Betrieb führt oder die Bank besitzt, ist jetzt eine Person der Welt: dieselbe, die als Figur durch die Stadt geht. Im Personenfenster steht, bei wem sie arbeitet, was sie am Tag verdient, ausgibt und gespart hat.

Diese Seite beschreibt Feature 10. Es gehört zur [Wirtschaft der Städte](wirtschaft-der-staedte.md) und zu den [Einwohnern der grössten Städte](../personen/einwohner-der-staedte.md). Alle Zahlen stammen aus dem Spielcode.

## Das Feature

Bisher hatte die Wirtschaft einer Stadt eigene Personen: Zeilen im Motor, so viele, wie ein fester Anteil der Einwohner ergab. Die Personen der Welt hatten keine Arbeit und keinen Lohn. Jetzt ist es eine Bevölkerung:

- Wer arbeitet, folgt aus der Person: ihrem Alter und ihrem Geschlecht.
- Die Wirtschaft einer Stadt hat genau so viele Erwerbstätige, wie in der Stadt Personen arbeiten.
- Jeder Betrieb ist ein eigener Eintrag der Welt mit Ort, Inhaber, Sektor, Beschäftigten, Produktion, Preis und Lohn.
- Gerechnet wird weiter vom unveränderten Port des Modells. Nach jedem Tag schreibt das Spiel, was der Motor für jede Person und jeden Betrieb gerechnet hat, in deren Einträge.

Nicht dazu gehören: Geburt, Tod, Heirat, ein Haushaltsbudget der Familie, Löhne nach Person, neue Regeln des Modells.

## Im Spiel

Ein Klick auf eine Figur öffnet das Personenfenster. Der neue Abschnitt «Wirtschaft» zeigt:

| Person | Zeilen |
|---|---|
| Arbeiterin oder Arbeiter mit Arbeit | Erwerb, Betrieb (Sektor), Beschäftigte im Betrieb, Lohn am Tag, Einkommen am Tag, Ausgaben am Tag, Erspartes, und ein Knopf zum Inhaber des Betriebs |
| Ohne Arbeit | Erwerb «ohne Arbeit», Einkommen, Ausgaben, Erspartes |
| Inhaberin oder Inhaber eines Betriebs | «führt einen Betrieb», Betrieb, Beschäftigte, Einkommen, Ausgaben, Erspartes |
| Inhaberin oder Inhaber der Bank | «führt die Bank der Stadt», Einkommen, Ausgaben, Erspartes |
| Kinder und Erwachsene, die nicht arbeiten | «nicht erwerbstätig» |

Beträge eines Tages stehen in Pence (d), das Ersparte in Pfund, Schilling und Pence.

## Das Modell

Das Modell von Poledna u. a. (2023) kennt Arbeiter, je einen Inhaber pro Betrieb, einen Inhaber der Bank und Personen, die nicht erwerbstätig sind. Diese Rollen werden so verteilt:

1. **Wer arbeitet.** Eine Person einer Stadt arbeitet ab 15 Jahren, ein Mann mit 97,1 % Wahrscheinlichkeit, eine Frau mit 43 %. Das sind die Erwerbsquoten, die die Eichtabelle schon immer hatte. Jede Person wird einmal gezogen; die Ziehung hängt nur an der Person und am Startwert der Welt.
2. **Betriebe.** Auf vier Erwerbstätige eines Sektors kommt ein Betrieb, wie bisher.
3. **Rollen.** Eine zweite Ziehung reiht die Erwerbstätigen. Die ersten führen die Betriebe, die nächste Person besitzt die Bank, alle anderen sind Arbeiter. Ein Erwachsener, der nicht arbeitet, ist die nicht erwerbstätige Person, die das Modell braucht.
4. **Eichung im Spiel.** Jede Stadt wird beim Gründen ihrer Wirtschaft geeicht: wie England 1356 im Anteil der Stadt an Englands Bevölkerung, mit genau so vielen Erwerbstätigen, wie in ihr arbeiten. Die Produktion einer Stadt ändert sich dadurch nicht, nur die Zahl der Köpfe, die sie erbringen.
5. **Tageswerte.** Lohn, Einkommen (Lohn nach Steuer, Anhang A.53), Ausgaben für Konsum (A.48) und Erspartes (A.54) einer Person sowie Beschäftigte (A.24), Produktion (A.13) und Preis (A.8) eines Betriebs kommen aus den Listen des Motors.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Arbeitsalter | ab 15 Jahren | Eichtabelle («aged 15 and over») |
| Erwerbsquote Männer | 97,1 % | Broadberry, Campbell & van Leeuwen 2013, S. 13 bis 14 |
| Erwerbsquote Frauen | 43 % | dieselbe Quelle |
| Erwerbstätige pro Betrieb | 4, der Inhaber eingerechnet | Annahme der Eichtabelle, unverändert |
| Wer Inhaber wird | Zufall unter den Erwerbstätigen | Annahme, keine Quelle |
| Grösse der Betriebe | Potenzgesetz | Regel des Modells (BeforeIT.jl, init_firms.jl, Zeile 66) |

## Zahlen aus dem Spiel

| | Welt 1356 | Welt 1291 |
|---|---|---|
| Personen der Städte | 25'722 | 24'828 |
| davon ab 15 Jahren | 16'968 | 16'483 |
| Erwerbstätige | 11'755 | 11'455 |
| davon Arbeiter | 8'801 | 8'577 |
| Inhaber eines Betriebs (= Betriebe) | 2'925 | 2'848 |
| Inhaber einer Bank (= Städte) | 29 | 30 |
| Erwerbstätige des Motors vor diesem Feature | 11'257 | 11'257 |

In der Welt von 1356 sind es 4,4 % mehr Köpfe als bisher (Kairo 1'606 statt 1'527, London 292 statt 266). Die Produktion der Städte ist dieselbe, pro Kopf also entsprechend tiefer.

Nach 30 Tagen bekommt eine Person mit Arbeit im Mittel 2,08 d am Tag (1,48 d bis 3,63 d, je nach Sektor und Betrieb) und behält nach der Steuer 97,5 % davon. 1'883 der 2'925 Betriebe haben eine beschäftigte Person, der grösste hat 108.

Die Wirtschaft als Ganzes steht, wo sie stand (je 4 Welten über 30 Jahre, jeder Tag gerechnet):

| Alle Städte zusammen, Jahr 30 | Vorher (Feature 9) | Jetzt | Spanne der Welten jetzt |
|---|---|---|---|
| Produktion (Start = 100) | 116,2 | 116,0 | 115,7 bis 116,4 |
| Preisniveau (Start = 100) | 94,9 | 95,1 | 94,5 bis 95,7 |
| Ohne Arbeit, Mittel aller Städte und Tage | 0,07 % | 0,09 % | 0,07 % bis 0,10 % |
| Ohne Arbeit, schlechteste Stadt an ihrem schlechtesten Tag | 3,0 % | 3,4 % | 3,1 % bis 4,0 % |
| Stadt mit der tiefsten Produktion | 111,2 | 109,0 | 108,2 bis 110,0 |
| Stadt mit der höchsten Produktion | 117,5 | 117,5 | 117,5 bis 117,5 |

Die Bücher gehen auf: Abweichung höchstens 2,4e-13 des Betrags, an dem sie gemessen werden.

## Massstab 1 : 100

Die Welt hat ein Hundertstel der Menschen der wirklichen. Jede Person der Wirtschaft ist eine Person der Welt, nicht ein Stellvertreter für hundert.

## Laufende Welt

Die laufende Welt (Start 1291) rechnet seit dem 16.11.2026 so: Am Tag 68 wurden die Wirtschaften ihrer 30 Städte neu gegründet.

Beim Aufspielen bekommt eine laufende Welt die neuen Einträge, und die Wirtschaften der Städte werden am erreichten Tag neu gegründet: aus der Startlage, mit den Personen, die an diesem Tag arbeiten. Die bisherigen Tage und Jahreszahlen der Wirtschaften gehen dabei verloren.

Die Wirtschaften sind die der Städte, in denen die Personen leben. Die Welt von 1291 hat darum die Wirtschaften ihrer eigenen 30 Städte (darunter Brügge, Rouen, Akkon und Tunis; London ist 1291 nicht unter den 30 grössten und hat keine). Gerechnet wird jede weiter wie England 1356 im Anteil der Stadt.

## Grenzen

- Rund 14'000 Personen haben keine Rolle: Kinder und Erwachsene, die nicht arbeiten. Sie haben kein eigenes Einkommen und keinen eigenen Konsum. Das Modell kennt kein Haushaltsbudget; 690 Familien (806 Personen, meist Alleinstehende) haben niemanden, der arbeitet, und damit nichts. Seit dem [Haushalt der Familie](haushalt-der-familie.md) leben sie von der Kasse ihrer Familie, und Frauen ohne Mann arbeiten; noch 54 Familien der Welt von 1291 haben niemanden, der arbeitet.
- Wer einen Betrieb oder die Bank führt, ist ausgelost. Auch eine Fünfzehnjährige kann einen Betrieb führen.
- Der Lohn hängt am Betrieb, nicht an der Person: Alle Beschäftigten eines Betriebs bekommen dasselbe; Alter, Geschlecht und Eigenschaften spielen keine Rolle.
- Die Werte stehen an zwei Orten: in den Listen des Motors, wo sie gerechnet werden, und als Kopie des Tages bei Person und Betrieb.
- Wer nach der Gründung 15 wird, beginnt erst zu arbeiten, wenn die Wirtschaften neu gegründet werden. Geburt und Tod gibt es noch nicht.
- Der gezeigte Lohn ist, was der Motor bucht: der feste Lohn in Geld mal der Einsatz der Belegschaft, mal die Änderung des Preisniveaus am selben Tag (unter 0,1 % an einem gewöhnlichen Tag). Dieser letzte Faktor steckt seit dem [Lohn in Geld](lohn-in-geld.md) im Motor und ist erst jetzt pro Person sichtbar.
- Die Erwerbsquoten stammen aus dem 19. Jahrhundert und gelten für jede Stadt von Kairo bis Paris.

## Quellen

- Poledna, Miess, Hommes & Rabitsch (2023): Economic forecasting with an agent-based model. European Economic Review 151, 104306. Anhang A.
- Broadberry, Campbell & van Leeuwen (2013): When did Britain industrialise? The sectoral distribution of the labour force and labour productivity in Britain, 1381–1851. Explorations in Economic History 50(1).
- BeforeIT.jl (Originalcode des Modells) und sein Rust-Port als Motor des Spiels.
