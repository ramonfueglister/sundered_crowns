# Neue Kartengrafik: Voxel-Welt mit Three.js (Plan)

Stand: 14. November 2026. Status: **Entwurf zur Diskussion, noch nichts gebaut.**
Dieses Dokument plant den neuen Kartenrenderer. Es ersetzt keinen Code. Die grossen Weichen in Abschnitt 2 sind
Vorschläge und werden erst nach Ramons Entscheid festgeschrieben.

Ziel in einem Satz: Die Karte sieht aus wie das Referenzbild (isometrische Voxel-Landschaft mit Stadt, Feldern,
Wäldern, Bergen, Flüssen, Schiffen und leuchtenden Reichsgrenzen), läuft über die ganze Weltkarte flüssig, und das
Gelände lässt sich per Knopfdruck umformen (graben, aufschütten, einebnen), wobei jede Änderung dauerhaft in der
MMO-Welt bleibt.

## 1. Ausgangslage

Was heute da ist (Stand Entwurfs-PR #3, schlankes Fundament):

- **Karte:** Raster mit 6144 × 5296 Kartenpixeln (Mercator, Länge −100° bis 70°). Ein Kartenpixel ist bei 45° Nord
  etwa 2,2 km breit. Dazu ein Höhenraster in Metern, ein Biom-Bild, ein Orts-ID-Raster, Flüsse als Linienzüge und
  15'220 Orte mit Fläche, Höhe, Gelände, Rohstoff und Bevölkerung (`public/map/*`, `public/data/geo.json`).
- **Renderer:** selbst geschriebener WebGPU-Renderer (`src/render/`, rund 3'900 Zeilen): Höhenfeld-Netz mit LOD,
  Figuren und Gebäude als Instanzen aus `public/models/models.bin`, Beschriftung auf einem 2D-Canvas darüber.
- **Welt:** ein Server hält den einzigen wahren Zustand (ECS mit dichten typisierten Arrays). Alles, was die Welt
  ändert, ist ein Befehl im Befehlslog; Snapshot plus Log ergibt den Zustand bitgenau wieder (`docs/ARCHITECTURE.md`).

Die wichtigste Erkenntnis aus den Daten: **Der Massstab passt nicht zusammen.** Der Ort Venedig ist 229 km² gross,
das sind auf der Karte etwa 7 × 7 Pixel. Das Referenzbild zeigt aber einzelne Häuser. Eine Voxel-Welt im echten
Massstab ist ausgeschlossen (die Karte hätte bei 2 m pro Voxel rund 10¹³ Geländesäulen). Die Lösung ist ein
**Spielzeug-Massstab** wie in jedem Strategiespiel: Häuser, Bäume und Schiffe sind Symbole und im Verhältnis zum Land
stark vergrössert. Daraus folgt fast die ganze Architektur unten.

## 2. Offene Grundsatzentscheidungen (bitte entscheiden)

| # | Frage | Empfehlung | Warum |
|---|---|---|---|
| A | Gelände als **Säulen** (pro Bodenfeld eine Höhe) oder **volle 3D-Voxel** (Höhlen, Tunnel, Überhänge)? | Säulen | Die Kamera schaut immer von schräg oben, Überhänge sieht man kaum. Säulen brauchen 10 bis 50 Mal weniger Daten und Rechenzeit. Graben, Kanäle, Burggräben, Dämme, Terrassen und Hügel gehen alle. Brücken, Tore und Tunnelportale sind Modelle, kein Gelände. |
| B | **Wer** darf umformen? | Technik für beides: sofortige Werkzeuge für dich als Spielleiter, dieselben Operationen später als Bauprojekte der Spieler | Die Technik ist dieselbe. Kosten, Dauer und Regeln für Spieler gehören ins Wirtschaftsdesign und werden dort besprochen. |
| C | **Wasser:** fest oder fliessend? | Feste Wasserflächen mit einer Füllregel beim Graben (ein Graben, der an Meer, See oder Fluss anschliesst, läuft bis zu einer Grenze voll) | Eine echte Wassersimulation über eine ganze MMO-Welt ist teuer und schwer deterministisch zu halten. Die Füllregel deckt Kanäle und Burggräben ab. |
| D | **Massstab:** wie viele Voxel pro Kartenpixel? | 64 als Startwert, im Prototyp gegen 32 und 48 prüfen | Bei 64 ist Venedig rund 450 × 450 Säulen gross, das entspricht dem Bildausschnitt der Referenz. |
| E | **Kamera:** echte Parallelprojektion (wie im Bild) oder Perspektive? | Parallelprojektion, frei drehbar in 90°-Schritten, stufenlos zoombar | Mit Parallelprojektion hat der ganze Bildschirm denselben Massstab. Das macht LOD und Schatten viel einfacher (Abschnitt 6). |
| F | **Modelle:** wer baut sie? | Häuser, Bäume, Felder, Schiffe prozedural per Code; Wahrzeichen als `.vox`-Dateien (MagicaVoxel oder KI-Generator mit Nacharbeit) | Prozedural ergibt regionale Stile und Varianten ohne Handarbeit. Wahrzeichen (Campanile, Dogenpalast) müssen erkennbar sein und brauchen Handarbeit. |
| G | **Technik:** Three.js-`WebGPURenderer` mit WebGL-2-Rückfall | ja | Siehe Abschnitt 4. |

**Entschieden am 14. November 2026 (Ramon): A = Säulen.** B bis G sind noch Empfehlungen; der Prototyp kann sie korrigieren.

## 3. Was die Recherche ergeben hat

Kurzfassung der Quellen (Liste in Abschnitt 14):

- **Three.js heute (r187):** `WebGPURenderer` ist der Renderer der nächsten Generation, fällt automatisch auf WebGL 2
  zurück und nutzt TSL (Shader in JavaScript, die nach WGSL oder GLSL übersetzt werden). Das Handbuch nennt ihn
  weiterhin «experimentell»; alte `ShaderMaterial`-Shader und der `EffectComposer` gehen damit nicht, dafür gibt es
  ein eigenes Postprocessing mit GTAO, Tiefenunschärfe und weiteren Effekten [1][2].
- **WebGPU in Browsern:** Chrome und Edge ab 113 (Windows, macOS, ChromeOS, Android ab 12), Firefox ab 141 auf
  Windows und ab 145 auf Apple-Silicon-Macs, Safari ab 26. Linux, Firefox auf Android und Intel-Macs fehlen noch.
  Rund 87 % weltweit [2][3]. Der WebGL-2-Rückfall bleibt also nötig.
- **Blockiges Meshing:** Greedy Meshing fasst gleiche Nachbarflächen zu grossen Rechtecken zusammen. Die schnellste
  bekannte Variante («binary greedy meshing») schafft einen 64³-Chunk in 50 bis 200 Mikrosekunden und braucht 8 Byte
  pro Rechteck [4]. Das zeigt, wie viel Reserve da ist; unsere Säulen sind ein einfacherer Fall.
- **Ambient Occlusion für Blöcke:** pro Ecke aus drei Nachbarn berechnet, vier Stufen, ins Mesh eingebacken. Beim
  Zusammenfassen dürfen nur Flächen mit gleichen AO-Werten verschmelzen, und die Diagonale des Rechtecks wird nach
  den AO-Werten gewählt, sonst entstehen sichtbare Richtungsfehler [5][6].
- **LOD für Blockwelten:** einfaches Herunterrechnen lässt dünne Dinge verschwinden und erzeugt Risse an
  Chunk-Grenzen; bewährt sind weiche Übergänge (Geomorphing) statt Nahtstücke [7]. Distant Horizons für Minecraft
  zeigt das Prinzip für riesige Sichtweiten: in der Ferne vereinfachte Stellvertreter-Meshes mit mehreren
  Detailstufen pro Chunk [8].
- **Raytracing statt Meshes** (Aokana, 2025) rendert zweistellige Milliarden Voxel, kann aber zur Laufzeit keine
  Voxel ändern und keine durchsichtigen Voxel [9]. Für uns ungeeignet.
- **Glatte Verfahren** (Marching Cubes, Surface Nets, Dual Contouring) erzeugen runde Landschaften und passen nicht
  zum Blocklook der Referenz [10]. Verworfen.
- **Persistenz:** Der Standard ist «prozedurale Grundwelt plus nur die geänderten Blöcke speichern» (Godot Voxel
  Tools speichert standardmässig nur geänderte Blöcke, wahlweise in SQLite) [11]. Minecraft komprimiert Abschnitte mit
  Paletten: ein Abschnitt mit nur einem Blocktyp kostet fast nichts [12].
- **Mehrspieler-Bearbeitung im Browser:** Ein aktuelles Three.js-Projekt mit WebGPU hält den Zustand autoritativ auf
  dem Server, speichert pro Chunk einen Binärblock (Zustand statt Verlauf, damit neue Spieler nicht tausende
  Pinselstriche nachspielen müssen) und macht reihenfolgeabhängige Pinsel (Glätten, Einebnen) durch fertige
  Ergebniswerte eindeutig [13]. Voxelize zeigt denselben Aufbau als Bibliothek: TypeScript-Client, Rust-Server,
  Meshing in mehreren Threads [14]. Wir übernehmen die Ideen, nicht die Bibliotheken, weil unser Server bereits eine
  totale Reihenfolge aller Befehle hat.
- **Schatten:** Three.js bringt Kaskadenschatten (`CSMShadowNode`) mit [15]; seit Oktober 2026 gibt es mit Sundial
  eine seitenweise gecachte Schattenkarte für eine Sonne (nur WebGPU, sehr neu) [16].
- **Instanzen:** `InstancedMesh` zeichnet tausende gleiche Objekte in einem Aufruf; `BatchedMesh` fasst
  verschiedene Geometrien zusammen, hat unter WebGPU aber Tücken beim Vergrössern der Puffer (vorab reservieren) [2][17].
- **Vergleichsspiel:** Timberborn hat 2025 von Höhenfeld auf echtes 3D-Gelände mit Tunneln und Überhängen
  umgestellt [18]. Das ist die Luxusvariante von Entscheid A, in einem Spiel mit kleiner Karte.
- **Modelle:** Three.js lädt MagicaVoxel-Dateien (`VOXLoader`) [19]. KI-Generatoren liefern inzwischen `.vox`, die
  Qualität braucht aber Nacharbeit, und die Lizenz ist je Werkzeug zu prüfen [20].

## 4. Technik-Entscheid: Three.js mit `WebGPURenderer`

Vorschlag: `three` (aktuell r187, Version fest gepinnt), Import aus `three/webgpu`, alle Materialien und Effekte in
TSL. Damit läuft derselbe Code auf WebGPU und auf WebGL 2.

Gründe:
- Schatten, Instanzen, Postprocessing, Kamera und Laden von Modellen müssen wir nicht selbst pflegen.
- Der Rückfall auf WebGL 2 erreicht auch Linux und ältere Geräte. Er hilft zudem beim automatischen Testen: im
  Headless-Chromium der Cloud geht das WebGPU-Gerät verloren, mit `forceWebGL` lassen sich trotzdem Bilder prüfen.
- Das Gelände selbst bleibt unsere eigene Geometrie (gepackte `BufferGeometry` pro Kachel). Three.js ist hier nur
  der Zeichner.

Was wir bewusst nicht tun: `BatchedMesh` fürs Gelände (Tücken bei Pufferwechsel [17]), Raytracing, eine fremde
Voxel-Engine einbauen.

Der alte Renderer bleibt, bis der neue alles kann. Der neue entsteht daneben in `src/voxel/` (Daten, Generator,
Bearbeitung; läuft auch auf dem Server) und `src/render3/` (Three.js), umschaltbar per `?renderer=voxel`.

## 5. Weltmodell

### 5.1 Raster und Massstab

- Das Voxelraster hängt fest am Kartenraster: **1 Kartenpixel = K × K Säulen**, K = 64 (Entscheid D).
  Die Welt hat damit 393'216 × 338'944 Säulen. Eine Säule ist bei 45° Nord etwa 34 m breit.
- **Eine Kachel = 64 × 64 Säulen = genau ein Kartenpixel.** Kachelkoordinate und Kartenpixel sind dasselbe. Das
  hält alle Umrechnungen ganzzahlig.
- Höhe in Voxelstufen, überhöht (Startwert etwa 3-fach, also rund 11 m pro Stufe: Hügel 200 m = 18 Stufen,
  Alpengipfel rund 430 Stufen). Im Prototyp einstellen, eventuell mit gestauchter Kurve für Hochgebirge.
- Grössen zur Orientierung: Venedig rund 450 × 450 Säulen, ein mittlerer Ort (1'600 km²) rund 1'200 × 1'200,
  der kleinste Ort rund 100 × 100.

### 5.1a Darstellungsmassstäbe wie im Modellbau (Ramon, 14. November 2026)

Wie bei einem Diorama oder im Tabletop gibt es **zwei Massstäbe**, und Dinge dürfen verkleinert und zusammengefasst
werden:

- **Bodenmassstab:** wie viel Land ein Feld darstellt (K, Entscheid D). Stark gestaucht.
- **Figurenmassstab:** wie gross Häuser, Bäume, Menschen und Schiffe gezeichnet werden. Viel grösser als der
  Bodenmassstab, untereinander stimmig (Mensch 3, Haus 8 bis 12, Baum 6 bis 10, Kirchturm 25 bis 40 Voxel hoch).
- **Die Welt ist das Diorama: auch die Simulation rechnet mit den verkleinerten Mengen** (Ramon, 14. November
  2026, Korrektur eines früheren Entwurfs). Was man sieht, ist das, was simuliert wird. Ein Haus auf der Karte ist
  ein Haushalt der Simulation, ein Feld ist ein bewirtschaftetes Feld, eine Figur ist ein Mensch oder eine feste
  kleine Gruppe.
- **Ein einziger Verkleinerungsfaktor für die ganze Welt** (Vorschlag 1 zu 100, noch zu entscheiden). Linear, damit
  die Verhältnisse zwischen Orten und Reichen stimmen. Die Startdaten haben 150 Millionen Menschen in 15'220 Orten;
  bei 1 zu 100 sind das 1,5 Millionen Menschen in rund 300'000 Haushalten, im Schnitt 20 Häuser pro Ort. Venedig
  (110'000) hat dann 1'100 Einwohner in etwa 220 Häusern, Paris (200'000) 2'000 in etwa 400, ein Dorf mit 500
  Einwohnern ist ein Hof mit 5 Menschen. Jeder bewohnte Ort hat mindestens einen Haushalt.
- Folge für die Technik: **Häuser, Felder und Werkstätten sind Weltzustand**, keine Dekoration. Die Simulation
  legt fest, wo sie stehen (deterministisch, auf dem Server), der Renderer zeichnet sie nur. Rein optisch bleiben
  Bäume, Rauch, Wellen und Kleinkram.
- Folge fürs Wirtschaftsdesign: Einwohner, Haushalte, Felder, Gebäude, Heere und Schiffe werden in diesen kleinen,
  zählbaren Einheiten entworfen. Das gehört in `docs/ECONOMY_DESIGN.md` und wird dort mit Ramon besprochen.

### 5.2 Daten pro Säule (Entscheid A: Säulen)

| Feld | Typ | Bedeutung |
|---|---|---|
| `h` | u16 | Geländehöhe in Stufen (0 = tiefster Meeresboden) |
| `mat` | u8 | Material der Oberfläche (Gras, Erde, Fels, Sand, Schnee, Acker, Pflaster, Schlamm …) |
| `water` | u8 | Wassertiefe über dem Boden in Stufen (0 = trocken) |

4 Byte pro Säule, 16 KB pro Kachel roh. Was unter der Oberfläche liegt, folgt einer festen Regel (Gras, darunter
Erde, ab drei Stufen Fels), damit beim Graben das richtige Material erscheint, ohne dass wir Schichten speichern.

### 5.3 Grundwelt: berechnet, nicht gespeichert

Die unberührte Welt wird aus den vorhandenen Rastern **berechnet**, von Server und Browser mit demselben Code:

1. Höhenraster glatt auf Säulen hochrechnen (Festkomma), plus ganzzahliges Rauschen für Kleinformen.
2. Küste aus der Landmaske mit geglätteter, leicht verrauschter Linie statt 2-km-Treppen.
3. Flüsse aus den Linienzügen als Bett eingraben, Breite nach Rang (etwa 6 bis 30 Säulen), mit Mäandern.
4. Material aus Biom, Höhe, Hangneigung und Klima.
5. Ortszugehörigkeit pro Säule (`placeAt`) aus dem ID-Raster mit geglätteten Grenzen.
6. **Ortsvorlagen:** Für berühmte Orte reicht ein allgemeiner Generator nicht. Die Lagune von Venedig mit ihren
   Inseln, das Goldene Horn oder die Meerenge von Gibraltar werden als handgemachte Geländestempel hinterlegt und in
   die Grundwelt eingerechnet.

Regeln dafür:
- **Nur Ganzzahl-Arithmetik** (`Math.imul`, Verschiebungen, eigene Hash-Funktion). Keine `Math.sin`, `Math.pow`
  usw., deren letzte Stelle zwischen Browsern abweichen kann. Ein Test vergleicht Prüfsummen ausgewählter Kacheln
  zwischen Node und Browser.
- Der Generator hat eine **Versionsnummer, die pro Welt eingefroren ist** (`state.terrain.gen`). Eine laufende Welt
  wechselt den Generator nie stillschweigend.
- Für ferne Detailstufen wird der Generator direkt gröber ausgewertet (weniger Rausch-Oktaven), nicht aus der
  feinsten Stufe heruntergerechnet.

### 5.4 Änderungen: nur bearbeitete Kacheln speichern

- Sobald eine Kachel zum ersten Mal bearbeitet wird, wird sie als Ganzes gespeichert (Kopie der berechneten Kachel
  plus Änderung, absolute Werte). Unbearbeitete Kacheln kosten nichts.
- Ablage: Kachelspeicher in **SQLite** auf dem Datenträger des Weltservers (Node bringt `node:sqlite` mit, keine
  neue Abhängigkeit). Zeile: `(tx, ty, lod, seq, blob)`, Blob mit Deflate komprimiert (geschätzt 1 bis 3 KB).
- Der Kachelspeicher liegt **neben** dem Snapshot, nicht darin, weil er sehr gross werden kann. Der Weltzustand
  enthält nur: Generatorversion, Anzahl bearbeiteter Kacheln und eine **Geländeprüfsumme**, die bei jeder Änderung
  fortgeschrieben wird (XOR der Kachel-Hashes, unabhängig von der Reihenfolge). `verifyReplay` prüft damit auch das
  Gelände.
- Jede geschriebene Kachel trägt die Lognummer `seq` der Änderung. Ein Snapshot merkt sich seine `seq`. Beim Start
  werden Kachelstände nach dem Snapshot verworfen und aus dem Befehlslog neu erzeugt. Alte Stände bleiben für eine
  einstellbare Zeit erhalten: das ergibt ein **Rückgängig pro Gebiet und Zeitraum** für den Spielleiter (Schutz
  gegen Vandalismus).
- Für die Fernsicht hält der Server zu bearbeiteten Gebieten gröbere Kacheln (LOD 1 bis 6) nach, verzögert im
  Hintergrund. Regel beim Vergröbern: Höhe gemittelt, Wasser bleibt ab einem Viertel Wasseranteil, damit Kanäle
  und Flüsse nicht verschwinden [7].

Grössenordnung: 100'000 bearbeitete Kacheln (das sind 100'000 Kartenpixel, etwa die Fläche Frankreichs) wären
1,6 GB roh und geschätzt 200 MB auf der Platte. Im Arbeitsspeicher hält der Server nur einen Cache (4'096 Kacheln =
64 MB) plus das Höhenraster (65 MB).

## 6. Darstellung

### 6.1 Kamera und Detailstufen

Parallelprojektion (Entscheid E), Blick von schräg oben, Drehung in 90°-Schritten, stufenloser Zoom von «einzelne
Häuser» bis «ganze Karte».

Der grosse Vorteil: **Der ganze Bildschirm hat denselben Massstab.** Die Detailstufe hängt nur vom Zoom ab, nicht
von der Entfernung. Es gibt keine Nähte zwischen Detailstufen im Bild.

- Stufe n hat Säulen von 2ⁿ Voxeln Kantenlänge; eine Kachel hat immer 64 × 64 Säulen.
- Gewählt wird die Stufe, bei der eine Säule 2 bis 4 Bildschirmpixel breit ist (am nächsten Zoom bis 8).
- Ab Stufe 6 ist eine Säule ein Kartenpixel: das ist das heutige Höhenraster. Die Fernsicht bis zur ganzen Karte
  (Stufen 6 bis 8) braucht keine neuen Daten.
- Beim Wechsel der Stufe werden alte und neue Stufe kurz überblendet.

### 6.2 Gelände-Mesh

- Pro sichtbarer Kachel ein Mesh: Deckflächen plus Seitenwände dort, wo die Nachbarsäule tiefer liegt. Gleiche
  Deckflächen werden zu Rechtecken zusammengefasst (Greedy Meshing) [4][6].
- Pro Ecke eingebackene Ambient Occlusion aus den Nachbarhöhen, mit der Diagonalen-Regel [5].
- Gepackte Vertices (8 Byte: Position als Ganzzahl, Flächenrichtung, Material, AO). Farbe kommt aus einer
  Materialpalette; eine kleine Hash-Variation pro Block im Shader ergibt die leicht gesprenkelten Flächen der
  Referenz. Keine Texturen, dadurch bleibt alles scharf.
- Berechnung und Meshing laufen in **Web Workern** (2 bis 4), Ergebnisse kommen als übertragbare Puffer zurück.
  Der Hauptthread lädt nur hoch.
- Spätere Optimierung, falls nötig: Flächen als Instanzen mit 8 Byte pro Rechteck (Vertex Pulling) [4][6].

### 6.3 Objekte: Bäume, Felder, Häuser, Schiffe

- **Gebäude und Felder kommen aus dem Weltzustand** (Abschnitt 5.1a): Position, Art und Besitzer stehen in der
  Simulation, der Renderer wählt nur das passende Modell. Rein optische Dekoration (Bäume, Kleinkram) ist eine
  Funktion aus Karte und Gelände, für alle Spieler gleich, und kein Teil des Weltzustands.
- Siedlungen: Strassennetz aus dem Ortskern, ein Haus pro Haushalt, Kirche, Mauer
  und Hafen nach Ortsgrösse und Lage, Wahrzeichen aus `data/content/landmarks.json`.
- Land: Äcker, Weinberge und Weiden nach Rohstoff des Orts, Wald nach Biom.
- Zeichnen mit `InstancedMesh` pro Modelltyp, mit Farbkanal für Dachvarianten und Reichsfarben (das heutige
  Modellformat hat bereits einen `tint`-Kanal).
- **Objekte in der Ferne:** Ab Stufe 2 werden Wald und Häuser nicht mehr einzeln gezeichnet, sondern als farbige
  Aufsätze in die Geländesäulen eingerechnet (Waldkrone als grüne Stufe, Stadt als Dachfarben). Das ist das
  Distant-Horizons-Prinzip [8] und hält die Instanzzahl klein.
- **Menschen und Tiere:** Figuren gehören zum Massstab und werden mit ihm zusammen gewählt (Ramon, 14. November
  2026). Startwert: ein Mensch ist 3 Voxel hoch, ein Haus 8 bis 12, ein Baum 6 bis 10. Figuren sind Symbole (eine
  Figur steht für viele Menschen): Bauern auf Feldern, Leute auf Märkten und Stegen, Fuhrwerke auf Strassen, Herden,
  Heere als Figurengruppen. Sichtbar nur in den zwei nächsten Zoomstufen, gezeichnet als Instanzen, Anzahl nach
  Bevölkerung und Tätigkeit des Orts. Der Prototyp zeigt sie in allen drei Massstäben mit.
- Wird Gelände unter Objekten verändert, legt der Browser die Dekoration der betroffenen Kacheln neu aus (Bäume
  weichen dem Kanal, Häuser stehen nicht im Wasser).

### 6.4 Licht, Wasser, Look

**Leitbild: Diorama** (Ramon, 14. November 2026). Die Karte soll wirken wie eine liebevoll gebaute Miniatur auf
einem Tisch. Daran wird jede Entscheidung zum Look gemessen:
- Parallelprojektion und Tilt-Shift: scharfe Mitte, weiche Unschärfe oben und unten.
- Warmes, tiefes Seitenlicht mit weichen, langen Schatten; kräftige, leicht gesättigte Farben.
- Sichtbare Blockkanten und klare Formen statt feiner Texturen; Figuren und Häuser eher gedrungen und gut lesbar.
- Kleine, ruhige Bewegungen: Rauch, Segel, Wasser, Herden, Leute auf dem Markt.
- Geländeschnitt am Kartenrand und an Gräben: man sieht die Erdschichten wie bei einem Modell.

- **Sonne** warm von der Seite, **eine** Schattenkarte, die genau auf den Bildausschnitt passt. Kaskaden braucht es
  dank Parallelprojektion nicht. Sie wird nur neu gezeichnet, wenn sich Kamera, Gelände oder Objekte ändern.
  Sundial [16] oder Kaskaden [15] sind Ausweichlösungen.
- **AO:** eingebacken im Gelände und in den Modellen; optional GTAO als Nachbearbeitung auf starken Geräten [1].
- **Wasser:** eigene Fläche mit TSL-Material. Farbe nach Wassertiefe aus den Säulendaten (hell am Ufer, dunkel
  im Tiefen), animierte Schaumkante am Ufer, sanfte Wellen als Stufenmuster, Kielwasser hinter Schiffen.
- **Nachbearbeitung:** Tilt-Shift-Unschärfe oben und unten (Miniatur-Wirkung), Farbkorrektur, leichtes Leuchten.
- **Grenzen:** Aus der Ortszugehörigkeit pro Säule und dem Besitzer pro Ort entsteht eine Kantenlinie, die im
  Geländeshader als leuchtendes Band in Reichsfarbe gezeichnet wird, am Voxelraster eingerastet wie im Bild. Sie
  folgt dem Gelände automatisch und ändert sich sofort mit dem Besitz.
- **Leben:** Rauch aus Kaminen, fahrende Schiffe auf Handelsrouten, Herden. Rein optisch, später an die Wirtschaft
  gekoppelt.
- **Beschriftung:** das heutige 2D-Canvas-Overlay (`src/render/overlay.ts`) wird mit der neuen Kamera
  weiterverwendet.
- **Auswahl:** Strahl gegen das Säulenfeld auf der CPU, ergibt Säule und damit Ort.

## 7. Gelände bearbeiten

### 7.1 Werkzeuge

| Werkzeug | Wirkung |
|---|---|
| Graben | senkt die Fläche um n Stufen |
| Aufschütten | hebt die Fläche um n Stufen, mit wählbarem Material |
| Einebnen | setzt die Fläche auf eine Zielhöhe (Plateau, Terrasse) |
| Glätten | gleicht Höhen an die Nachbarn an |
| Rampe | gleichmässiges Gefälle zwischen zwei Punkten |
| Linie | Graben oder Damm entlang einer Linie mit Breite (Kanal, Deich, Burggraben) |
| Material | malt die Oberfläche (Acker, Pflaster …) |
| Wasser | füllt oder leert nach der Füllregel (Entscheid C) |

Formen: Kreis, Rechteck, Linie. Im Browser zeigt ein Vorschaubild die Wirkung, bevor man bestätigt.

### 7.2 Als Befehl im bestehenden System

Bearbeitungen sind gewöhnliche Befehle (`src/sim/commands.ts`): eine Prüfung, die den Ablehnungsgrund nennt, und
eine Wirkung. Sie landen im Befehlslog wie alles andere.

```ts
{ t: 'terrain.edit', realm, op: 'dig' | 'raise' | 'level' | 'smooth' | 'ramp' | 'paint' | 'water',
  shape: { k: 'disc', x, y, r } | { k: 'box', x0, y0, x1, y1 } | { k: 'line', x0, y0, x1, y1, w },
  amount?, target?, mat? }
```

- Der Befehl beschreibt den **Pinselstrich**, nicht die einzelnen Säulen. Er ist etwa 100 Byte gross, egal wie
  viele Säulen er trifft. Das Log bleibt klein.
- Die Wirkung ist eine deterministische Ganzzahl-Funktion. Server und Browser rechnen dasselbe Ergebnis.
- Obergrenze pro Befehl (Startwert 16'384 Säulen, also 128 × 128). Grössere Arbeiten sind mehrere Befehle.
- Prüfungen: Fläche liegt im eigenen Reich (`placeAt` und Besitzer), Höhe im erlaubten Bereich, Mengenbegrenzung
  pro Spieler und Tag. Kosten und Bauzeit kommen aus dem Wirtschaftsdesign (Entscheid B). Der Spielleiter darf
  überall und sofort.
- Spieler-Bauprojekte (später): ein Projekt ist eine Entität, die ein Tagessystem über mehrere Tage abarbeitet und
  dabei dieselben Operationen anwendet.

### 7.3 Was das Spiel davon merkt

Pro Ort werden Kennzahlen mitgeführt und bei jeder Änderung nachgeführt: Anteil Wasser, Anteil flaches Land,
mittlere Höhe, Küsten- und Flusszugang. Daran kann die Wirtschaft später anknüpfen (ein Kanal schafft Wasserzugang,
Terrassen schaffen Ackerland, ein Graben verstärkt eine Burg). Welche Wirkungen es gibt, wird im Wirtschaftsdesign
besprochen, nicht hier.

## 8. Netzwerk

- **Grundwelt:** wird nie übertragen, der Browser berechnet sie selbst.
- **Bearbeitete Kacheln:** Der Browser bekommt beim Anmelden die Liste der bearbeiteten Kacheln mit Versionsnummer
  (8 Byte pro Kachel) und danach die Änderungen. Den Inhalt holt er nur für sichtbare Kacheln per HTTP:
  `GET /terrain/{lod}/{tx}/{ty}?v={version}`. Die Antwort ist unveränderlich und lässt sich beliebig lange cachen.
- **Laufende Änderungen:** Der Browser meldet seinen Bildausschnitt (Kachelrechteck und Stufe). Der Server schickt
  jeden angenommenen Pinselstrich an alle, deren Ausschnitt er berührt, mit den neuen Kachelversionen. Der Browser
  wendet ihn mit derselben Funktion an. Passt die Version nicht (verpasste Nachricht), holt er die Kachel neu.
- **Eigene Eingaben:** sofortige Anzeige beim Bestätigen, Abgleich mit der Serverantwort. Lehnt der Server ab,
  wird die Kachel zurückgesetzt.
- Reihenfolgeprobleme wie in Peer-to-Peer-Editoren [13] gibt es nicht, weil der Server alle Befehle in eine einzige
  Reihenfolge bringt.

## 9. Leistungsbudget

Ziel: 60 Bilder pro Sekunde auf einem Mittelklasse-Rechner (etwa GTX 1660 oder Apple M1) bei 1920 × 1080,
30 auf integrierter Grafik mit reduzierter Qualität. Die Zahlen sind **Rechnung und Schätzung**; der Prototyp misst
sie nach.

| Grösse | Budget | Herleitung |
|---|---|---|
| Sichtbare Säulen | 200'000 bis 850'000 | 1920 × 1080 bei 4 bzw. 2 Pixel pro Säule, schräger Blick |
| Sichtbare Kacheln | 80 bis 300 | 4'096 Säulen pro Kachel plus Rand |
| Geländedreiecke | höchstens 2,5 Millionen, typisch unter 1 Million | 1 bis 3 Dreiecke pro Säule nach Zusammenfassen |
| Zeichenaufrufe Gelände | höchstens 300 | einer pro Kachel |
| Objektinstanzen | höchstens 150'000, typisch 10'000 bis 30'000 | Wald etwa ein Baum pro 9 Säulen, nur Stufen 0 und 1 |
| Schatten | eine Karte 4096², nur bei Änderung neu | Parallelprojektion |
| Nachbearbeitung | höchstens 3 ms | Tilt-Shift bei halber Auflösung |
| Kachel berechnen und meshen | Ziel unter 5 ms im Worker | zu messen; die Referenz in C++ liegt bei 0,05 bis 0,2 ms für 64³ [4] |
| Bearbeiten bis sichtbar | unter 50 ms | nur die berührten Kacheln neu |
| Server pro Pinselstrich | unter 1 ms | höchstens 16'384 Säulen |
| Speicher im Browser | etwa 60 MB für Gelände | 500 Kacheln im Cache |
| Erstes Bild | unter 3 Sekunden nach dem Laden | Fernstufe zuerst, Detail lädt nach |

Qualitätsstufen (niedrig bis ultra, wie heute) drehen an: Pixel pro Säule, Schatten, GTAO, Tilt-Shift, Objektdichte.

## 10. Modelle und Inhalte

- **Prozedurale Generatoren (TypeScript):** Häuser (Grundriss, Stockwerke, Dachform, Palette), Kirchen, Türme,
  Mauern, Stege, Bäume (Laub, Nadel, Zypresse, Palme), Feldfrüchte, Schiffe. Regionale Stile über Parameter nach
  Kulturgruppe: rote Ziegeldächer im Süden, Fachwerk und steile Dächer im Norden, Flachdächer in Nordafrika und im
  Nahen Osten, Jurten in der Steppe.
- **Wahrzeichen als `.vox`:** unter `assets/vox/`, ein Build-Schritt wandelt sie in dasselbe Binärformat wie die
  generierten Modelle (Flächen zusammengefasst, AO eingebacken). Quelle: MagicaVoxel von Hand oder KI-Generator mit
  Nacharbeit [19][20]. Die Lizenz jedes Werkzeugs wird vor dem Einsatz geprüft.
- **Ortsvorlagen:** handgemachte Geländestempel für berühmte Lagen (Abschnitt 5.3). Geschätzt 50 bis 100 für die
  ganze Karte, Venedig zuerst.
- Bedarf für die erste Fassung: etwa 40 bis 60 Modelltypen, davon der grösste Teil generiert.

## 11. Risiken

| Risiko | Gegenmassnahme |
|---|---|
| Massstab fühlt sich falsch an (Orte zu gross oder zu leer) | K im Prototyp mit 32, 48 und 64 vergleichen, bevor irgendetwas gespeichert wird |
| `WebGPURenderer` gilt offiziell noch als experimentell [1] | Version pinnen, nur TSL, WebGL-2-Rückfall bei jedem Schritt mittesten |
| Grundwelt weicht zwischen Server und Browser ab | nur Ganzzahlen, Prüfsummentest Node gegen Browser im Testlauf |
| Generator ändert sich bei laufender Welt | Version pro Welt eingefroren; Änderung nur mit geplanter Umrechnung |
| Vandalismus und unbegrenztes Wachstum der Daten | Besitzprüfung, Mengenbegrenzung, Kosten, Rückgängig pro Gebiet, Aufräumen alter Stände |
| Allgemeiner Generator macht berühmte Orte unkenntlich | Ortsvorlagen |
| Dünne Dinge verschwinden in der Ferne, Stufenwechsel fällt auf | Vergröberungsregel für Wasser, Überblenden [7] |
| Menge an Modellen | prozedural zuerst, Wahrzeichen nach und nach |
| Wasser wirkt unecht, wenn es nicht fliesst | Füllregel; echte Simulation höchstens später lokal |
| Entscheid A (Säulen) erweist sich als zu eng | Tunnel und Brücken als Objekte; ein späterer Umbau auf 3D wäre gross, darum jetzt bewusst entscheiden |
| Schwache Geräte, Handys | Qualitätsstufen; Handy ist kein Ziel der ersten Fassung |
| Automatische Bildtests in der Cloud (WebGPU fällt dort aus) | Tests über den WebGL-2-Pfad |

## 12. Fahrplan

Die Dauern sind grobe Schätzungen und hängen von den Entscheiden ab.

**Phase 0: Entscheide A bis G** (dieses Dokument).

**Phase 1: Prototyp Venedig, ohne Server** (grösster Erkenntnisgewinn)
- Generator für ein Fenster von etwa 16 × 16 Kartenpixeln um Venedig, mit erster Ortsvorlage für die Lagune.
- Kacheln, Meshing mit AO im Worker, Materialpalette, Parallelkamera, Sonne mit Schatten, Wasser, Tilt-Shift.
- Prozedurale Häuser, Bäume, Felder, Stege, ein Platzhalter für den Campanile, Grenzband.
- Lokale Werkzeuge Graben, Aufschütten, Einebnen, Linie mit sofortigem Neuaufbau.
- Fertig, wenn: ein Bildschirmfoto neben der Referenz besteht, 60 Bilder pro Sekunde gemessen sind, eine Bearbeitung
  in unter 50 ms sichtbar ist und K feststeht. Die gemessenen Zahlen ersetzen die Schätzungen in Abschnitt 9.

**Phase 2: Dauerhaft und mehrspielerfähig**
- `terrain.edit` als Befehl, Kachelspeicher in SQLite, Geländeprüfsumme im Zustand, `verifyReplay` mit Gelände.
- Bildausschnitt melden, Pinselstriche verteilen, Kacheln per HTTP, Abgleich eigener Eingaben.
- Tests: Determinismus Node gegen Browser, Neustart aus Snapshot plus Log, zwei Clients sehen dasselbe.

**Phase 3: Ganze Karte**
- Alle Detailstufen bis zur Gesamtansicht, Überblenden, Objekte in der Ferne als Säulenaufsätze.
- Grenzen, Beschriftung, Auswahl, Kartenmodi. Danach löst der neue Renderer den alten ab und `src/render/` entfällt.

**Phase 4: Inhalte**
- Regionale Baustile, Wahrzeichen, Schiffe, Rauch und Herden, weitere Ortsvorlagen.

**Phase 5: Anbindung ans Spiel**
- Kosten, Bauprojekte und Wirkungen von Geländearbeiten, sobald das Wirtschaftsdesign so weit ist.

Phase 1 berührt weder Server noch Produktivseite und lässt sich gefahrlos in einem Entwurfs-PR zeigen.

## 13. Was dieser Plan bewusst offen lässt

- Spielregeln fürs Umformen (Kosten, Dauer, Wirkungen): gehören ins Wirtschaftsdesign.
- Jahreszeiten, Tag und Nacht, Wetter: technisch vorbereitet (Palette und Sonne sind Parameter), nicht geplant.
- Handy-Unterstützung.

## 14. Quellen

1. Three.js-Handbuch, WebGPURenderer: https://threejs.org/manual/en/webgpurenderer
2. Utsubo, «100 Three.js Tips» (Stand r186): https://www.utsubo.com/blog/threejs-best-practices-100-tips
3. web.dev, «WebGPU is now supported in major browsers»: https://web.dev/blog/webgpu-supported-major-browsers
4. cgerikj, Binary Greedy Meshing: https://github.com/cgerikj/binary-greedy-meshing
5. 0fps, «Ambient occlusion for Minecraft-like worlds»: https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/
6. Max Slater, «Voxel Meshing in Exile»: https://thenumb.at/Voxel-Meshing-in-Exile/
7. 0fps, «A level of detail method for blocky voxels»: https://0fps.net/2018/03/03/a-level-of-detail-method-for-blocky-voxels/
8. Distant Horizons, Erklärung der Funktionsweise (Community-Thread): https://lr.in.psf.lt/r/DistantHorizons/comments/1fpg4wv/so_how_does_distant_horizons_actually_work
9. Aokana, GPU-Driven Voxel Rendering Framework (2025): https://arxiv.org/html/2505.02017v1
10. Cinevva, «Terrain sculpting brushes» (Vergleich der Verfahren): https://app.cinevva.com/guides/terrain-sculpting-brushes
11. Godot Voxel Tools, Streams (Speichern geänderter Blöcke): https://voxel-tools.readthedocs.io/en/latest/streams/
12. wiki.vg, Minecraft Chunk Format (Paletten): https://wiki.vg/Chunk_Format
13. Cinevva, «Open world in the browser, part 24: persistence»: https://app.cinevva.com/blog/2026-05-09-open-world-browser-part-24-persistence-and-wind
14. Voxelize, Mehrspieler-Voxel-Bibliothek: https://github.com/QuartzTS/voxelize
15. Three.js-Dokumentation, CSMShadowNode: https://threejs.org/docs/pages/CSMShadowNode.html
16. Sundial, seitenweise Sonnenschatten für WebGPURenderer: https://discourse.threejs.org/t/sundial-paged-virtual-sun-shadows-for-three-js-webgpurenderer-mit-on-npm/94912
17. Three.js-Forum, BatchedMesh unter WebGPU: https://discourse.threejs.org/t/batchedmesh-setmatrixat-delay-with-webgpu/89108
18. Mechanistry, Timberborn Update 7 (3D-Gelände): https://mechanistry.com/press/ziplines-tubeways-timberborn-update-7-adds-3d-terrain-unique-modular-transport-for-each-faction-more
19. Three.js-Dokumentation, VOXLoader: https://threejs.org/docs/pages/VOXLoader.html
20. Rosebud, «AI Tool Stack for Voxel Games 2026»: https://lab.rosebud.ai/blog/ai-tool-stack-voxel-games-2026
