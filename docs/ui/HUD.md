# Spiel-HUD: Stil und Grundlayout

Stand 15. November 2026. Ramon hat das Bild `referenz.jpg` als Zielbild für das HUD vorgegeben («so sieht es gut aus»). Der Nachbau liegt als eigenständige Seite unter `public/ui/hud/` und ist im Deploy unter `/ui/hud/` erreichbar. Er ist noch nicht in die Spieloberfläche (`src/ui/`) eingebaut.

`vergleich.jpg` zeigt oben die Referenz und unten den Nachbau auf unserem Voxel-Diorama.

## Aufbau

| Element | Lage auf 1670 × 941 | Inhalt |
| --- | --- | --- |
| Werteleiste | oben, 52 px hoch, Goldlinie darunter | Schatz, Handwerk, Getreide, Einwohner, Flotte je mit Änderung, Ansehen, Krone, Datum, Suche, Lesezeichen, Einstellungen |
| Banner | oben links | Wappen des Reichs (Venedig: Markuslöwe) |
| Bereichsleiste | links, 58 × 399 px | Staat, Recht, Bevölkerung, Wirtschaft, Militär, Flotte, Chronik |
| Baupanel | unten Mitte, 840 × 134 px | Tabs Bauen, Wirtschaft, Bevölkerung, Staat, Militär, Diplomatie; Bauknöpfe |
| Kartenwerkzeuge | unten rechts | Ebenen, Ort, Vollbild |

## Farben und Schrift

| Zweck | Wert |
| --- | --- |
| Leiste | `#14324b` bis `#1a3a55` |
| Goldlinie | `#f1dba4`, Rahmen `#c9ad62` |
| Bereichsleiste | `#1d3c52` |
| Panel | `#1e4767` bis `#163752`, Rand `#a6c2d0` |
| Knopf | `#2c5274` bis `#23465f` |
| Text | `#fdfaef` |
| Icons | Verlauf `#f4ecd6` → `#ddd5c1` → `#a5a89f`; Münzen und Getreide golden |
| Plus | `#82d26f` |
| Minus | `#ffb27a` (Orange statt Rot, damit es bei Rot-Grün-Schwäche lesbar bleibt) |

Schrift: Crimson Pro 500/600/700.

Gemessen gegen die Referenz: Flächenfarben pro Bereich höchstens 4,3 ΔE76 daneben, Aussenkanten von Leiste, Banner, Panel und Kartenwerkzeugen 0 bis 3 px daneben.

## Bewusste Abweichungen

- Zahlen im deutschen Format (1 240, 12,4).
- Datum und Bau-Kategorien passend zu 1356: Handwerk, Speicher, Wege statt Industrie und Infrastruktur.
- Minus in Orange.

## Lizenz des Markuslöwen

Der Löwe im Banner ist zugeschnitten und umgefärbt nach «Variant war flag of the Serene Republic of Venice» von Samhanin, Wikimedia Commons, CC BY-SA 3.0. Die Seite nennt die Quelle. Die bearbeitete Fassung steht unter derselben Lizenz; wer sie ins Spiel übernimmt, muss die Namensnennung mitnehmen.

Die Lizenz stammt aus einer Quellenliste eines Drittprojekts, weil Wikimedia aus der Cloud-Umgebung nicht erreichbar war. Vor einer Veröffentlichung im Spiel auf der Commons-Seite bestätigen.
