# Wahrzeichen mit Blender

Die 29 Wahrzeichen aus `data/content/landmarks.json` bekommen je ein eigenes Modell. Es entsteht nicht von Hand in
der Blender-Oberfläche, sondern aus einem Python-Skript im Repository, das Blender ohne Oberfläche ausführt. So ist
jedes Modell nachvollziehbar, änderbar und auf andere Bauzustände umstellbar, und jede Zahl hat eine Quelle.

## Ablauf pro Wahrzeichen

1. **Massdatei** `landmarks/<id>_<jahr>.json`: jedes Mass mit Wert, Einheit und Quelle. Was nicht belegt ist, steht
   als `Annahme` da. Dazu der Bauzustand im Spieljahr, was deshalb nicht gebaut wird, und was offen bleibt.
2. **Skript** `landmarks/<id>.py`: setzt die Masse zu Körpern zusammen (`lib/diorama.py`: Kästen mit
   Fuss-Schattierung wie in `batch.ts`, Pyramiden, flache Fenster und Bögen auf Wänden, Bogenhallen mit echten
   Öffnungen und Laibungen, Farben aus der Palette des Spiels). Das Skript enthält keine eigenen Zahlen.
3. **Ausgabe:** `python3 tools/blender/landmarks/<id>.py --preview bild.png` schreibt
   `public/models/landmarks/<id>_<jahr>.glb` (binäres glTF: Positionen, flache Normalen, Farbe je Ecke, Y nach
   oben, keine Materialien) und ein Vorschaubild aus der Kamera der Look-Probe (18,7° über dem Boden, Boden um
   46,7° gedreht, Sonne von rechts hinten).
4. **Prüfung:** `npx vitest run tests/buildings/glb.test.ts` liest die Datei mit dem Leser des Spiels
   (`src/buildings/landmarks/glb.ts`) und prüft Dreiecke, Höhe, Grundfläche, Palette und Normalen. Beurteilt wird
   das Modell im Spiel-Renderer, nicht im Vorschaubild: `look-probe.html?campanile=glb` stellt die Datei an die
   Stelle des handgebauten Campanile, `node tools/lookprobe/shot.mjs bild.png campanile=glb` macht das Bild dazu,
   und `python3 tools/lookprobe/gauntlet_campanile.py referenz.png bild.png` misst den Turm gegen Ramons
   Referenzbild (Bandhöhen, Farben der Sonnenseite, Bogenanteile, Streifen, Breite). Der Gauntlet-Loop läuft, bis
   die Messungen bestehen; dann Ramons Urteil. Was am Bau nicht vermessen ist, folgt dem Referenzbild und steht so
   in der Massdatei.
5. **Im Spiel:** `glbToBatch()` macht aus der Datei einen `Batch`, den `settle()` wie jedes handgebaute Modell
   stellt. Das läuft in den Web-Workern der Welt, ohne DOM und ohne Renderer.

## Werkzeug

Blender als Python-Modul, ohne Bildschirm: `pip install bpy` (Blender 5.3, rund 430 MB). Das Vorschaubild rendert
Cycles auf dem Prozessor (10 s für den Campanile), weil die Workbench-Engine einen Bildschirm braucht. Alternativ
läuft jedes Skript auch in einem installierten Blender: `blender -b --python tools/blender/landmarks/<id>.py -- …`.

## Massstab

Die Massdatei nennt Meter pro Block. Für den Campanile sind es 3,65 m, damit der Turm die 27 Blöcke der Look-Probe
behält. Die Häuser der Look-Probe nutzen einen grösseren Massstab (Geschoss 2,1 Blöcke für rund 3 m). Diese
Verzerrung stammt aus dem Referenzbild und ist noch nicht entschieden.

## Farben

`lib/diorama.py` führt die Palette von `src/buildings/palette.ts` als sRGB-Hex und rechnet sie wie `batch.ts` nach
Linear um. Ein Modell aus Blender hat deshalb genau die Farben der handgebauten Gebäude daneben.

## Noch nicht hier

`tools/models/` mit `public/models/models.{json,bin}` ist die ältere Blender-Pipeline der 2D-Karte
(`src/render/props.ts`) mit eigenem Binärformat. Sie bleibt, bis die 2D-Karte entschieden ist; neue Modelle gehen
über glTF.
