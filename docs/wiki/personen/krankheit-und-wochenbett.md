# Krankheit und Wochenbett

**Status:** Gebaut · **Bereich:** Personen · **Stand:** 2026-11-20

> Ab 15 Jahren wird jede Person ab und zu krank, und eine Mutter liegt nach der Geburt einen Monat im Wochenbett. An diesen Tagen fehlt sie bei der Arbeit: Ihr Betrieb arbeitet mit den Leuten, die da sind, und zahlt allen den Lohn weiter.

## Das Feature

Das ist Schritt 4 des Tagesplans (Vorschlag «Personen: Archiv der Toten und Tagesplan»). Ramon hat den Vorschlag am 20.11.2026 gewählt, mit der Entscheidung «Lohn läuft weiter».

Krankheit und Wochenbett sind eine feste Rechnung aus der Person und dem Datum. Gespeichert wird davon nichts. Dieselbe Person hat in jedem Lauf dieselben Krankheiten.

Nicht dazu gehören: Jahreszeiten, Seuchen, Unfälle bei der Arbeit, und ein Zusammenhang zwischen Krankheit und Tod.

## Im Spiel

Eine eigene Anzeige gibt es noch nicht. Zu sehen ist es an der Wirtschaft der Städte: An einem Tag mit Kranken macht ein Betrieb weniger.

## Das Modell

1. **Krank werden.** Eine gesunde Person ab 15 wird mit der Rate ihres Alters krank, nach der Krankenkasse von Morcott (siehe unten). Die 15- bis 19-Jährigen nehmen die Werte der 20- bis 24-Jährigen.
2. **Wie lange.** Eine Krankheit dauert im Mittel so lange, wie die Kasse für das Alter beim Beginn zählte, mindestens 3 Tage (die Kasse zahlte erst ab 3 Tagen). Die Verteilung um das Mittel ist eine Annahme, die Quelle nennt nur das Mittel.
3. **Wieder gesund.** Erst danach kann die Person wieder krank werden.
4. **Wochenbett.** Eine Mutter fehlt 30 Tage ab der Geburt, in jedem Glauben. Die religiösen Fristen (Levitikus 12, die Nifās im Islam) regeln Reinheit und Gebet, keine gelesene Quelle sagt, dass sie von der Arbeit abhielten.
5. **Im Betrieb.** Der Betrieb macht an dem Tag, was die Anwesenden machen können. Er zahlt allen den Lohn (seit [Jahresdienst und Tagelohn](jahresdienst-und-tagelohn.md) nur den Knechten; für Fehlende springen Arbeitslose ein). Hat er alles verkauft, plant er so, als wären die Kranken da gewesen. Das Material, das die Kranken nicht verbraucht haben, kauft er nicht noch einmal.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Neue Krankheiten in fünf Jahren | 0,77 (20–24) bis 3,74 (ab 75) | Riley & Alter 1996, Tabelle 2 |
| Mittlere Dauer | 6 Tage (20–24), 23 bis 45 Tage (25–54), 71 bis 149 Tage (55–74), 509 Tage (ab 75) | Riley & Alter 1996, Tabelle 3 |
| Kürzeste Krankheit | 3 Tage | Riley & Alter 1996, S. 20 |
| Wochenbett | 30 Tage | Astbury 2017 |

## Historische Prüfung

In der Welt von 1291 fehlen die Arbeiter an 3,6 % ihrer Tage, etwa 13 Tage im Jahr. Bis 50 Jahre stimmen die Krankentage mit der Kasse überein. Ab 50 sind die Leute im Spiel öfter krank als in der Kasse, weil die drei Spalten der Quelle für die Alten nicht zusammenpassen.

Die Wirtschaft der Städte macht 1,9 % weniger in den ersten zwei Jahren und 3,4 % weniger im dritten, die Preise bleiben gleich. Die Betriebe tragen den Lohn der Kranken, und ab dem zweiten Jahr stellen sie weniger Leute ein. Nach dem dritten Jahr bleibt das fast stehen: Im sechsten Jahr macht die Wirtschaft 4,2 % weniger und hat 4 % weniger Stellen.

Die Ersparnisse der Betriebe sinken aber jedes Jahr weiter, nach sechs Jahren sind sie 30 % kleiner, und die der Haushalte steigen um gleich viel. Am Lohn der Kranken liegt das nicht: Bekommen die Kranken keinen Lohn, sinken die Ersparnisse der Betriebe genauso schnell, und die Wirtschaft macht im dritten Jahr 6,3 % weniger statt 3,4 %. Der Grund: Ein Betrieb kauft Werkzeug für seinen ganzen Plan, aber Werkzeug nutzt sich nur bei der Arbeit ab, die wirklich getan wird. Fehlen Kranke, kauft er Werkzeug, das niemand braucht, und das Geld geht an die Inhaber der Werkzeugmacher. Eine Gegenregel schliesst das Leck, lässt die Wirtschaft aber jedes Jahr weiter schrumpfen. Darum ist sie nicht gebaut.

## Massstab 1 : 100

Jede Person ist eine Figur, die Raten gelten je Person.

## Grenzen

- Frauen nehmen die Tabelle der Männer. Die Frauenkasse von Ashborne hatte drei- bis viermal so viele Krankentage.
- Morcott ist ein Dorf in England im 18. Jahrhundert, die Welt beginnt 1291.
- Eine arme Frau ging oft vor dem Ende des Monats wieder arbeiten, eine Rate dafür wurde nicht gefunden.
- Die Ersparnisse der Betriebe sinken jedes Jahr um etwa 5 %, und das hört in sechs Jahren nicht auf. Sie stecken in Werkzeug, das niemand braucht. Seit [Jahresdienst und Tagelohn](jahresdienst-und-tagelohn.md) springen Arbeitslose für Fehlende ein, und das Leck ist kleiner (dort die Zahlen).
- Die Fehltage werden der Wirtschaft monatlich gegeben. Stirbt ein Arbeiter, übernimmt der Erbe für den Rest des Monats seine Fehltage.
- Die Regeln, wie ein Betrieb mit Kranken plant und Material kauft, stammen nicht aus einem Paper, sondern sind aus den Regeln des Modells abgeleitet. Acht Varianten wurden gemessen.

## Quellen

- Riley, J. C. & Alter, G. (1996): The sick and the well: adult health in Britain during the health transition. Health Transition Review 6, Supplement, 19–44.
- Owen, Brown & Skinner (2025): Journal of British Studies 64 (über die Krankheiten in den Hofrechnungen von Ramsey im 14. Jahrhundert: Dauern wie in Morcott, keine Rate).
- Astbury, L. (2017): Being Well, Looking Ill: Childbirth and the Return to Health in Seventeenth-Century England. Social History of Medicine 30(3), 500–519.
- Technische Beschreibung: docs/PEOPLE_DESIGN.md, Feature 9, und docs/ECONOMY_DESIGN.md, Abschnitt 22.
