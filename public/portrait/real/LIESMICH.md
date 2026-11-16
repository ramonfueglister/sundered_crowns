# Echte Porträts: Dateien

Gelesen von sim/portrait/src/real.rs, wenn in den Einstellungen «Echte Porträts» an ist
(app/scripts/ui/portrait_cache.gd). `.gdignore`: Godot importiert den Ordner nicht, das Spiel
liest die Dateien direkt (darum nur beim Start aus den Quellen, nicht in einem Export).

- Frisuren (crop01, roman01, curly01, receding01, bald01, sidepart01, bun01, braid01): Karten
  (`name.txt.zst`: je Ecke drei Kopf-Ecken, Gewichte, Versatz; `name.webp` Farbe mit Alpha,
  `name_n.webp` Normalen), bemalte Kappe (`name_cap.*`), Kopfhaut je Kopf-Ecke (`name_scalp.txt`).
  Im Kleid England 1356 (bob01 bis bob07, plait01): das Kopfhaar besteht aus Strähnen statt Karten (Männer,
  Knaben und Kleinkinder seit Runde 87, Mädchen und junge Frauen seit Runde 88): `<name>_locks.txt.zst`
  (gewölbte Bänder, fest, mit Schatten; alle mit dem einen Bild `hair1356_locks.webp`, dessen unteres Viertel
  die ausgefransten Enden sind), darunter die bemalte Kappe (`<name>_cap.*`). Die Zöpfe der Mädchen sind runde
  Stränge (`plait01_rope.*`). Karten hat im Kleid England 1356 keine Frisur mehr.
- Bärte (beard_stubble, beard_short, beard_full, beard_phil, beard_chin): wie die Frisuren.
  beard_crop (Vollbart im Kleid England 1356): ohne Karten, nur die bemalte Schicht, die von der Haut absteht.
  beard_short1356 (kurzer Bart im Kleid England 1356): Apoleias kurzer Bart mit freiem Mund; die Haare der
  Oberlippe enden über der Mundlinie (bei Apoleias Bart liegen sie auf einem geschlossenen Mund wie Zähne).
  beard_stubble1356 (Stoppeln im Kleid England 1356): Apoleias Stoppeln mit freiem Mund, aus demselben Grund.
- Kleider (cloth_tunic, cloth_toga, cloth_palla, cloth_veil): in Blender drapiert, `_ao.txt`
  Schatten in den Falten.
- Haut (skin_<alter>_<geschlecht>.webp, `_n` Poren), skin_ao.txt, skin_red.txt, uvs.txt; skin_lash.txt (Wimpernrand am
  Lid, nur im Kleid England 1356 gelesen; tools/portrait/pipeline/skin_lash.py); skin_lip.txt (Lippenrot entlang
  des Lippenumrisses und Anteil Oberlippe, aus MakeHumans Hautbild der jungen Frau gelesen, nur im Kleid England
  1356 gelesen; tools/portrait/pipeline/skin_lip.py);
  Augen (eyeball.webp: 4 x 4 Irisfarben), Brauen und Wimpern (eyebrow001, Eyelashes01, MakeHuman CC0).
  eyebrow1356.webp und Eyelashes1356.webp (nur im Kleid England 1356, auf den Karten von eyebrow001 und
  Eyelashes01): die Braue mit den weichen Haaren von MakeHumans Bild (Apoleias eyebrow001.webp hat deren
  Deckung mal 2,5: ein geschlossenes Band mit hartem Rand) und ohne den dünnen Strich am äusseren Ende; die
  Wimpern als weicher Saum statt einzelner Haare (tools/portrait/pipeline/brow_tail.py, lash_soft.py). Die
  Namen müssen mit eyebrow und Eyelashes beginnen: daran erkennt die Bühne Brauen und Wimpern.

Gebaut mit der Realismus-Pipeline (Blender 5.2, Skripte in /mnt/project-files/portraits/realismus-pipeline/),
verkleinert auf höchstens 1024 px, WebP; Textdateien über 64 KB zstd-gepackt.
