# Jede Familie hat eine Parzelle

**Status:** Entwurf · **Bereich:** Siedlung · **Stand:** 2026-11-16

> Jede Familie einer Stadt hat im Grundbuch der Welt eine Parzelle mit festem Platz, Breite und Tiefe. Die Fläche der Stadt folgt der Zahl ihrer Bewohner nach einem Gesetz, das an 173 Städten um 1300 gemessen ist.

Der Entwurf ist gebaut, aber nicht im Spiel: Die Simulation führt das Grundbuch, die 3D-Welt zeichnet ihre Häuser noch nicht daraus.

## Das Feature

Beim Gründen der Welt bekommt jede Stadt ihren Baugrund und jede ihrer Familien eine Parzelle darauf. Die Parzellen sind eigene Einträge der Simulation, die Familie zeigt auf ihre Parzelle. Was eine Stadt an Häusern zeigt, soll nur noch aus diesem Grundbuch kommen.

Das Grundbuch ändert sich noch nicht, solange niemand geboren wird, stirbt oder umzieht.

Nicht dabei: wo ein neues Haus entsteht, wie Gassen wachsen, Mauern, Tore, Brücken und Wahrzeichen (das Grundbuch hat Platz für sie), die Weiler der Bauern, das Bauen durch Spieler. Herrscher haben keine Parzelle, Burgen und Residenzen folgen später.

## Im Spiel

Noch nicht sichtbar. Der Weltserver gibt die Parzellen einer Stadt aus; die 3D-Welt stellt später auf jede Parzelle ein Haus an die Gassenseite.

## Das Modell

1. **Fläche der Stadt.** Die besiedelte Fläche einer echten Stadt mit N Einwohnern ist

   A = a · N^β, mit a = 0,1194 ha und β = 0,714

   Weil β kleiner als 1 ist, steht eine grosse Stadt dichter als eine kleine. Die 156 Städte der Welt, die im Datensatz vermessen sind, behalten ihren Abstand zur Formel: Sie bekommen ihre gemessene Fläche, mit dem Exponenten umgerechnet auf die Einwohnerzahl der Welt.
2. **Massstab.** Die Welt hat ein Hundertstel der Menschen, ein Haus ist so gross wie ein echtes. Die Stadt bekommt darum ein Hundertstel der echten Fläche. So hat eine Familie so viel Boden wie in der echten Stadt.
3. **Parzelle.** 76 % des Baugrunds sind Parzellen, der Rest Gassen. Die Familien der Stadt teilen die Parzellenfläche gleichmässig. Eine Parzelle ist dreimal so tief wie breit:

   Breite = √(0,76 · Baugrund / Familien / 3), Tiefe = 3 · Breite
4. **Lage.** Die Parzellen liegen in quadratischen Blöcken aus zwei Reihen zu sechs Parzellen, Rücken an Rücken, mit der Front zur Gasse im Norden oder Süden. Die Stadt füllt sich von der Mitte nach aussen als Quadrat. Dieses Raster ist ein Platzhalter.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| a und β | 0,1194 ha und 0,714 | eigene Ausgleichsgerade durch die 173 Städte des Datensatzes S1 von Cesaretti et al. (2016); Standardfehler von β 0,026, R² 0,81. Der Aufsatz und Lobo et al. (2020), Tabelle 2, nennen denselben Exponenten |
| Vermessene Städte | 156 von 558 | derselbe Datensatz, zum Beispiel Paris 800 ha bei 200'000 Einwohnern, Zürich 70 ha bei 9'500 |
| Anteil der Parzellen | 76 % | Grenade-sur-Garonne, gegründet 1290: 3'000 Hausplätze auf 75,76 ha, mit Kirche, Gassen und Platz knapp 100 ha (Boerefijn 2000, Anm. 37) |
| Tiefe zu Breite | 3 | Grenade: Hausplätze von 5 mal 15 Klaftern, 9,2 mal 27,5 m (Boerefijn 2000, S. 53 bis 54) |
| Parzellen je Reihe | 6 | Grenade: Blöcke von 55 m, sechs Hausplätze breit |
| Schmalste belegte Parzelle | etwa 4,1 m | drei Viertel der Edinburgher Einheit von 5,5 m (Stell und Tait 2016); die 4,1 m sind eine eigene Rechnung aus zwei Angaben |

## Historische Prüfung

- **Bodenfläche je Familie.** Das Gesetz gibt einer Familie in einer Stadt von 11'000 Einwohnern 325 m² Stadtfläche. Grenade war mit 333 m² je Hausplatz geplant. Die beiden Quellen sind voneinander unabhängig. Anteil und Seitenverhältnis der Parzelle stammen dagegen von Grenade selbst.
- **Platz für ein Haus je Familie.** Die schmalste Parzelle der Welt ist 5,4 m breit, belegt sind Parzellen ab etwa 4,1 m.
- **Buchhaltung.** Tests prüfen für alle 558 Städte: Jede Familie hat genau eine Parzelle, keine Parzelle hat zwei Familien, die Parzellen einer Stadt überlappen nicht und ergeben zusammen 76 % ihres Baugrunds.

Was die Welt von 1291 bekommt: 26'815 Parzellen in 558 Städten.

| Stadt | Einwohner der Zeit | Familien | Parzelle | Breite der Stadt |
|---|---|---|---|---|
| Limoges (kleinste Stadt, vermessen) | 4'000 | 13 | 12,1 mal 36,3 m | 6,0 km |
| Bayonne (mittlere Stadt, nach Formel) | 11'000 | 32 | 8,5 mal 25,6 m | 7,3 km |
| Zürich (vermessen) | 11'550 | 27 | 8,7 mal 26,1 m | 7,5 km |
| Venedig (vermessen) | 106'400 | 267 | 5,5 mal 16,4 m | 11,5 km |
| Paris (vermessen) | 214'667 | 570 | 6,1 mal 18,4 m | 18,1 km |
| Kairo (nach Formel) | 382'000 | 983 | 5,5 mal 16,4 m | 22,1 km |

Die Breite gilt bei halber Hausgrösse (ein Hausblock von 2 m steht für 125 m Land; diese Grösse ist selbst noch ein Entwurf). Über alle Städte ist die mittlere Breite 7,7 km. Zwei Städtepaare würden sich berühren: Kairo und Fustat, Rabat und Salé.

## Massstab 1 : 100

Die Stadt hat ein Hundertstel der Menschen auf einem Hundertstel der Fläche. Die Dichte, die Grösse der Parzelle und die Grösse des Hauses sind die echten. Auf dem Land der Karte, das nicht verkleinert ist, wirkt die Stadt deshalb gross: Ein Hausblock steht für 125 m Land.

## Grenzen

- Das Gesetz ist an Städten Westeuropas mit 1'000 bis 200'000 Einwohnern gemessen. Für Kairo und für Städte ausserhalb Westeuropas ist es eine Übertragung.
- Anteil und Form der Parzelle kommen von einer einzigen Planstadt in Südfrankreich. Freiburg im Breisgau hatte Hofstätten von 16,2 mal 32,4 m im Verhältnis 1 zu 2 (Löbbecke).
- Eigene Festlegungen ohne Quelle: Alle Parzellen einer Stadt sind gleich gross. Wer in der Mitte wohnt, folgt der Nummer der Familie. Eine Familie je Parzelle (zu Familien je Haus ist keine Quelle gelesen). Die Umrechnung der vermessenen Städte auf die Einwohnerzahl der Welt.
- Das Raster ist ein Platzhalter ohne Platz, Kirche und Mauer. Gewachsene Städte hatten kein Raster.
- Die Simulation kennt den Boden noch nicht: Parzellen können im Wasser oder auf Fels liegen, bis die Baugrund-Schicht der Landschaft da ist.
- Kleine Städte sind breiter, als ihre Fläche erwarten lässt, weil der äusserste Ring der Blöcke nur teilweise gefüllt ist.
- Sobald die Bauernfamilien in Weilern vor der Stadt wohnen, zählen für die Stadtfläche nur noch die Familien in der Stadt. Die Städte werden dann deutlich kleiner.

## Quellen

- Cesaretti, Lobo, Bettencourt, Ortman und Smith (2016): Population-Area Relationship for Medieval European Cities. PLOS ONE 11(10): e0162678. https://doi.org/10.1371/journal.pone.0162678
- Lobo et al. (2020), Tabelle 2. https://www.colorado.edu/socialreactors/sites/default/files/attached-files/lobo_et_al._2019_published_urban_studies.pdf
- Boerefijn (2000): Urban Morphology 4(2), S. 53 bis 54 und Anm. 37. https://journal.urbanform.org/index.php/jum/article/download/3871/3200/13152
- Löbbecke: Schau-ins-Land 126, S. 7 bis 18. https://regionalia.blb-karlsruhe.de/files/17820/BLB_Loebbecke_Parzellenstruktur_Freiburg.pdf
- Stell und Tait (2016): Framework and form: burgage plots, street lines and domestic architecture in early urban Scotland. Urban History 43(1)
