# Betrieb und Inhaber sind ein Haushalt

**Status:** Gebaut, noch nicht in der laufenden Welt (am 18.11.2026 gebaut) · **Bereich:** Wirtschaft · **Stand:** 2026-11-18

> Der Inhaber bekommt, was sein Betrieb an Geld einnimmt, und trägt, was er verliert. Vorher wurde auch unverkauftes Lager als Gewinn ausgezahlt, und Verluste blieben im Betrieb: Die Betriebe verloren über Jahrzehnte Geld, und Banken fielen unter null.

Diese Seite beschreibt Feature 18. Es gehört zur [Wirtschaft der Städte](wirtschaft-der-staedte.md) und folgt auf [Entfernung im Handel](entfernung-im-handel.md). Alle Zahlen stammen aus Versuchen mit dem Spielcode.

## Das Feature

Im Modell von Poledna u. a. (2023) zählt Ware, die ein Betrieb auf Lager legt, zum Gewinn. Der Gewinn wird ausgezahlt, ein Verlust bleibt im Betrieb. Bei uns bekommt der Inhaber den ganzen Gewinn, und gerechnet wird jeden Tag. So verloren die Betriebe der 29 Städte in 30 Jahren ein Zehntel einer Jahresleistung an die Haushalte, und 5 bis 6 Banken standen unter null.

Gemessen je Betrieb: Von 3'078 Betrieben verliert über die Jahre einer. Alle andern verdienen 19 bis 25 % vom Umsatz. Das Geld geht an einzelnen Tagen verloren, nicht an schlechten Betrieben.

Nicht dazu gehören: Konkurs eines Haushalts, das Geld der Händler, Gesellschaften mit beschränkter Haftung.

## Im Spiel

Es gibt keine neue Anzeige. Die Wirtschaften der Städte werden beim Aufspielen neu gegründet.

## Das Modell

- Gewinn des Betriebs = Gewinn des Papers − Preis × Lageraufbau. Lager wird erst Gewinn, wenn es verkauft ist.
- Einkommen des Inhabers aus dem Betrieb = dieser Gewinn, auch wenn er negativ ist. Was der Inhaber trägt, bekommt der Betrieb am selben Tag.
- Erwartet der Inhaber einen Verlust, plant er aus Einkommen keinen Kauf.

## Zahlen

29 Städte, 30 Jahre, vier Startwerte, mit Entfernung:

| | vorher | jetzt |
|---|---|---|
| Geld der Betriebe abzüglich Kredite | −5'143 | 0 |
| Banken, die Eigenkapital verlieren | 6 | 0 |
| Wirtschaftsleistung (Start = 100) | 115,5 | 114,8 bis 115,3 |
| Schwächste Stadt | 111,1 | 111,1 bis 112,6 |

## Abweichungen

- **Ein Drittel der Inhaber steht im Minus.** Der Inhaber plant mit dem Gewinn von gestern. Nach einem guten Tag gibt er ihn aus, nach einem schlechten kann er nicht weniger als nichts ausgeben. Nach 30 Jahren sind rund 1'000 Inhaber im Minus, fast alles Höfe, zusammen mit 2'600 bis 3'900 (rund 5 % einer Jahresleistung). Es flacht ab. Einzelne schulden zehn Jahreseinkommen. Das Modell kennt keinen Konkurs von Haushalten.
- Drei andere Regeln wurden gemessen und verworfen: Haftung nur mit dem Guthaben, Verlustvortrag im Betrieb, Planen mit dem mittleren Gewinn von 30 Tagen. Die letzte bleibt als eigenes Feature offen.

## Quellen

- Caiani und Catullo (2023), LEM Working Paper 2023/19, Gleichungen 23 bis 25: Ausschüttung aus dem Geldfluss ohne Lager.
- System of National Accounts 2008, Kapitel 4 (Entwurf vom 20.12.2007), 4.155 und 4.158: Ein Betrieb ohne eigene Rechtsform gehört zum Haushalt des Inhabers, der unbeschränkt haftet.
- Liebrecht (2012), Max Planck Encyclopedia of European Private Law: Haftung in mittelalterlichen Handelsgesellschaften.
- Regel und Messung im Einzelnen: docs/ECONOMY_DESIGN.md, Abschnitt 18.
