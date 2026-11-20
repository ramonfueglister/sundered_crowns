# Die Höfe in den Weilern

**Status:** Entwurf · **Bereich:** Siedlung · **Stand:** 2026-11-17

> Jede Bauernfamilie hat einen Hof in einem Weiler vor den Mauern ihrer Stadt. Weiler und Höfe stehen mit Ort und Grösse im Grundbuch der Welt.

Der Entwurf ist gebaut und seit dem 17. November 2026 auf main. Die 3D-Welt setzt die Weiler dorthin, wo das Grundbuch sie hat.

## Das Feature

Die Familien, die von der Landwirtschaft leben, wohnen in [Weilern vor den Mauern](../personen/weiler-der-bauern.md). Bisher wusste die Simulation von ihnen nur das. Jetzt legt sie beim Gründen der Welt die Weiler jeder Stadt an und gibt jeder Bauernfamilie einen Hof darin. Die Familie zeigt auf ihren Hof, so wie eine Stadtfamilie auf ihre [Parzelle](parzellen.md).

Nicht dabei: Kirche und Mühle im Weiler, Wege zur Stadt, das Wachsen von Weilern zu Dörfern.

## Im Spiel

Die 3D-Welt liest Weiler und Höfe der Welt von 1291 aus der Datei des Grundbuchs, setzt jeden Weiler an seinen Ort und stellt auf jeden Hof ein Bauernhaus. Der Weltserver gibt sie ebenfalls aus; die 3D-Welt liest sie von dort noch nicht.

## Das Modell

1. **Weiler.** Die Bauernfamilien einer Stadt bilden so wenige Weiler wie möglich, mit höchstens 10 Höfen je Weiler:

   Zahl der Weiler = Bauernfamilien / 10, aufgerundet

   Die Familien verteilen sich gleichmässig auf die Weiler.
2. **Hof.** Jede Familie hat einen Hof von 10 m Breite am Weg und 17,5 m Tiefe.
3. **Im Weiler.** Die Höfe stehen in zwei Reihen an einem Weg, die Front zum Weg. Ein Weiler mit zehn Höfen misst 50 mal 40 m.
4. **Lage.** Die Weiler einer Stadt liegen gleichmässig verteilt zwischen dem Stadtrand und dem Rand ihrer Felder, so dass jeder Weiler gleich viel Land um sich hat. Der Rand der Felder ist der Radius der Kreisfläche, die das Ackerland der Stadt fasst.
5. **Boden.** Ein Weiler rückt bis zu einem Kilometer von seinem Platz ab, wenn dort Wasser, Fels, die Stadt oder ein anderer Weiler im Weg ist. Findet er so keinen freien Platz, liegt er weiter draussen (28 von 2'127 Weilern).

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Höfe je Weiler | höchstens 10 | Schweiz: 3 bis 5 Gehöfte galten schon als Dorf, die meisten Dörfer hatten 10 bis 20 (HLS). Westfalen: Drubbel mit 3 bis 15 Hofstätten (Henkel 2007). Katalonien: Weiler meist unter zehn Häusern (Bolòs 2026) |
| Hof | 10 mal 17,5 m | halbe Seiten des kleinsten vermessenen Hofs: Cottam in Yorkshire, gut 20 m Front und 35 m Tiefe (Historic England). Die Halbierung hat keine Quelle, sie ist ein Entscheid für das Kartenbild |
| Zwei Reihen am Weg | | Cottam: Reihe von vier regelmässigen Höfen. Pfaffenschlag in Südböhmen: sechzehn Häuser am Bach entlang |
| Weg | 5,2 m | derselbe Gassenanteil wie in den Städten (Grenade); für Weiler keine Quelle |

## Historische Prüfung

- **Grösse der Weiler.** Die Welt hat 2'127 Weiler mit 5 bis 10 Höfen, im Mittel 9, und rund 4 Personen je Hof. Das HLS nennt für kleine bis mittlere Dörfer 10 bis 20 Gehöfte mit 50 bis 100 Einwohnern, also 5 je Gehöft.
- **Buchhaltung.** Tests prüfen: Jede der 18'665 Bauernfamilien hat genau einen Hof in einem Weiler ihrer Stadt, kein Weiler liegt auf einem anderen oder auf der Stadt, kein Hof auf einem anderen.

| Stadt | Bauernfamilien | Weiler |
|---|---|---|
| Limoges | 10 | 1 |
| Zürich | 18 | 2 |
| Bayonne | 20 | 2 |
| London | 154 | 16 |
| Paris | 388 | 39 |
| Kairo | 703 | 71 |

Ein Weiler liegt im Mittel 8 km vom Zentrum seiner Stadt, der fernste 22 km (Kairo).

## Massstab 1 : 100

Ein Haus ist so gross gebaut wie ein echtes, steht aber auf der Karte für 125 m Land. Ein echter Hof von 20 mal 35 m wäre auf der Karte 1,25 mal 2,2 km gross, und die Höfe einer mittleren Stadt nähmen 30 % ihres Ackerlands ein. Darum ist der Hof der Welt halb so breit und halb so tief. Mit ihm ist ein Weiler rund 3 km breit, und die Höfe nehmen 7,5 % des Ackerlands.

## Grenzen

- Echte Weiler lagen 0,5 bis 1,5 km auseinander (Bolòs 2026). Die Welt hat ein Hundertstel der Menschen auf dem echten Land und darum ein Hundertstel der Weiler; sie liegen mehrere Kilometer auseinander.
- Die Masse der Höfe stammen von zwei englischen Dörfern und einem westfälischen Einzelhof. Für den Mittelmeerraum und die islamische Welt ist keine Quelle gelesen. Alle Höfe sind gleich gross.
- Die Obergrenze von 10 Höfen gilt für alle Städte, auch für Kairo.
- Ohne Quelle: die gleichmässige Aufteilung, welche Familie in welchem Weiler wohnt, das Muster der Verteilung um die Stadt.
- Ein Weiler, dessen Platz im Wasser oder auf Fels läge, liegt auf dem nächsten trockenen Grund. In 3 von 2'127 Weilern steht trotzdem nicht jedes Bauernhaus trocken: je einer bei Ceuta, Alexandria und Rhodos.
- Bei grossen Städten drängen die Weiler die Felder zurück: Die 39 Weiler von Paris belegen 69 % der Fläche, die Paris als Ackerland hat. Bei einer mittleren Stadt sind es 9 %.
- Dreizehn Städte in Ägypten, Arabien und der Sahara haben kein Ackerland; ihre Weiler liegen dicht um die Stadt.
- Weiler verschiedener Städte können sich in die Quere kommen.
- Solange niemand geboren wird, stirbt oder umzieht, entsteht kein neuer Hof.

## Quellen

- Dubler und Della Casa: Dorf. Historisches Lexikon der Schweiz, Version vom 25.03.2015. https://hls-dhs-dss.ch/de/articles/007947/2015-03-25/
- Henkel (2007): Ländliche Siedlungsformen in Westfalen. https://www.lwl.org/westfalen-regional-download/PDF/S098_Siedlungsformen.pdf
- Bolòs (2026): Land 15(2), 225. https://www.mdpi.com/2073-445X/15/2/225
- Historic England: Cottam medieval settlement, Listeneintrag 1017068. https://historicengland.org.uk/listing/the-list/list-entry/1017068
- Historic England: Medieval settlement of Croxton, Listeneintrag 1016858. https://historicengland.org.uk/listing/the-list/list-entry/1016858
- Pfeffer: Ein hochmittelalterlicher Bauernhof vor den Toren von Dorsten. https://www.lwl-archaeologie.de/media/filer_public/75/22/7522895f-c814-4547-93d5-1b30efade942/ein_hochmittelalterlicher_bauernhof_dorsten_pfeffer.pdf
- Archäologischer Atlas von Böhmen: Wüstung Pfaffenschlag. https://www.archeologickyatlas.cz/en/lokace/slavonice_jh_ves_pfaffenschlag
- Shukurov et al., mit Chisholm (1979, S. 72). https://arxiv.org/pdf/1505.05121
