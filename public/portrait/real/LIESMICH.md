# Echte Porträts: Dateien

Gelesen von sim/portrait/src/real.rs, wenn in den Einstellungen «Echte Porträts» an ist
(app/scripts/ui/portrait_cache.gd). `.gdignore`: Godot importiert den Ordner nicht, das Spiel
liest die Dateien direkt (darum nur beim Start aus den Quellen, nicht in einem Export).

- Frisuren (crop01, roman01, curly01, receding01, bald01, sidepart01, bun01, braid01): Karten
  (`name.txt.zst`: je Ecke drei Kopf-Ecken, Gewichte, Versatz; `name.webp` Farbe mit Alpha,
  `name_n.webp` Normalen), bemalte Kappe (`name_cap.*`), Kopfhaut je Kopf-Ecke (`name_scalp.txt`).
- Bärte (beard_stubble, beard_short, beard_full, beard_phil, beard_chin): wie die Frisuren.
- Kleider (cloth_tunic, cloth_toga, cloth_palla, cloth_veil): in Blender drapiert, `_ao.txt`
  Schatten in den Falten.
- Haut (skin_<alter>_<geschlecht>.webp, `_n` Poren), skin_ao.txt, skin_red.txt, uvs.txt;
  Augen (eyeball.webp: 4 x 4 Irisfarben), Brauen und Wimpern (eyebrow001, Eyelashes01, MakeHuman CC0).

Gebaut mit der Realismus-Pipeline (Blender 5.2, Skripte in /mnt/project-files/portraits/realismus-pipeline/),
verkleinert auf höchstens 1024 px, WebP; Textdateien über 64 KB zstd-gepackt.
