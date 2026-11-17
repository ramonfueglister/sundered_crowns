# Kultur und Glaube

**Status:** Beschlossen · **Bereich:** Personen · **Stand:** 2026-11-16

> Jede Person hat eine eigene Kultur und einen eigenen Glauben. Eine Stadt hat die Kultur ihrer Personen, mit den Minderheiten, die eine Quelle für genau diese Stadt zählt.

## Das Feature

Ramon, 16.11.2026: In der Welt gibt es nur, was die Simulation rechnet. Eine Stadt hat eine Kultur, auch mit Minderheiten, aber gezogene Anteile sind keine Arbeit der Simulation. Darum gilt:

- **Personen der Städte** bekommen beim Gründen Kultur und Glauben, die das Setup für den Ort ihrer Stadt nennt. Für 1291 sind das die 13 Regeln mit Quellen in `data/history/1291/peoples.json`, sonst die Einordnung von 1356.
- **Herrscher** bekommen Kultur und Glauben des Reiches, in dem sie in die Welt kommen.
- **Reiche, die mit den Grenzen dazukommen**, bekommen Kultur und Glauben der meisten Personen ihrer Hauptstadt.
- **Minderheiten** kommen nur in die Welt, wo eine Quelle sie für diese eine Stadt zählt (`src/sim/content/communities_1291.json`). Aus *n* gezählten Menschen werden bei 1:100 round(*n* / 100) Personen. Genommen werden ganze Familien der Stadt, in einer festen Reihenfolge (Hash aus Seed und Familie). Eine Familie, die die Gemeinde grösser machen würde als gezählt, wird übersprungen. Herrscherfamilien werden nie genommen.
- **Der Ort** hat keine eigene Kultur mehr. Die Ortsansicht zählt Kultur und Glauben seiner Personen. Ein Ort ohne Personen hat keine.
- Niemand wechselt bisher Kultur oder Glauben. Wanderung, Heirat zwischen Gruppen und Bekehrung sind eigene Features.

## Im Spiel

Im Ortsfenster steht bei einer Stadt mit Minderheit jede Gruppe mit ihrem Anteil, zum Beispiel Nürnberg «Fränkisch, Lateinische Kirche 98 % · Aschkenasisch, Judentum 2 %». Das Porträt kleidet eine Person nach ihrer eigenen Kultur.

## Die gezählten Gemeinden von 1291

| Stadt | Zahl der Quelle | Jahr | Quelle | Personen bei 1:100 |
|---|---|---|---|---|
| Paris | mindestens 100 Familienhäupter | 1292 | Steuerrollen (taille) 1292 und 1296, nach Encyclopaedia Judaica, Artikel Paris (Blumenkranz) | 1 Familie |
| Würzburg | 810 mit Namen, dazu 100 Fremde | 1298 | Salfeld 1898, S. 192 bis 199 | 8 |
| Nürnberg | 628 (704 Namen gezählt) | 1298 | Salfeld 1898, S. 179 | 6 |
| Rothenburg ob der Tauber | etwa 53 und annähernd 450 | 1298 | Salfeld 1898, S. 185 bis 192 | 5 |
| Heilbronn | 200 nach dem Sontheimer Memorbuch (105 Namen) | 1298 | Salfeld 1898, S. 214 | 2 |
| Bamberg | 124 Namen | 1298 | Salfeld 1898, S. 201 bis 203 | 1 |
| Amberg | 14 Namen | 1298 | Salfeld 1898, S. 182 | 0 |
| Nördlingen | 8 Namen | 1298 | Salfeld 1898, S. 181 | 0 |

Regel: Es gilt die Zahl, die die Quelle selbst nennt. Wo sie keine nennt, gelten die gezählten Namen der Opferliste; das ist eine Untergrenze. Salfeld druckt Namen, keine Summen. Die Namen wurden aus dem Scan gezählt: 41 Listen mit 3'307 Menschen. Gruppen ohne Zahl wie «seine Kinder» sind nicht mitgezählt.

## Grenzen

- Die Zahlen von 1298 zählen die Getöteten der Rintfleisch-Verfolgung, sieben Jahre nach 1291, und darunter auch Geflüchtete aus dem Umland. Sie messen die Gemeinde von 1291 nur ungefähr.
- Für alle anderen Minderheiten hat die Suche keine Zahl pro Stadt um 1291 gefunden. Dazu gehören die Juden der übrigen Städte Frankreichs, die Kopten Kairos, die Schiiten von Damaskus, die Deutschen in Prag und Breslau und die Mudéjares in Valencia. Diese Städte sind darum vorerst einheitlich. Das Setup kennt für sie nur runde Anteile, und die kommen nicht in die Welt.
- Die Juden Englands wurden 1290 vertrieben; 1291 gibt es dort keine.
- In Paris trifft die feste Reihenfolge eine Familie aus einer einzigen Person. Die Quelle zählt Haushalte, nicht Menschen.

## Quellen

- Salfeld, Siegmund (1898): Das Martyrologium des Nürnberger Memorbuches. Berlin: Simion. Digitalisat der UB Frankfurt: https://sammlungen.ub.uni-frankfurt.de/urn/urn:nbn:de:hebis:30-180010766035
- Blumenkranz, Bernhard: Paris. In: Encyclopaedia Judaica. https://www.jewishvirtuallibrary.org/paris
- Regeln der Kulturen und Glauben von 1291: `data/history/1291/peoples.json` (jede Regel mit ihren Quellen)
