# Strassen

**Status:** Gebaut (Schritt 1: Netz und Bild) · **Bereich:** Welt · **Stand:** 2026-11-18

> Zwischen den Städten der Welt laufen Wege, wie ein Strassenbauer sie über das Land legt: dem Gelände entlang, über wenige Flussübergänge und über die Pässe. Die 3D-Welt zeigt sie, und die Simulation weiss, wie viele Tage ein Karren, ein Saumtier oder ein Reiter auf jedem Weg braucht.

## Das Feature

Beim Bau der Daten wird ein Wegnetz über die Karte gelegt: zwischen den 558 Städten, die die Welt von 1291 zeigt, und von jedem Ort der Karte in ihrer Nähe zum nächsten Weg. Jeder Weg hat eine Art: Pfad, Landstrasse oder Hauptstrasse. Die Simulation erhält für jedes Paar benachbarter Orte die Länge des Wegs, seine Mühe (Länge gewichtet nach Steigung und Flüssen) und seine Art.

Noch nicht dabei: die Römerstrassen und die Gough-Karte als Quelle (die Daten sind aus der Cloud gesperrt), Zerfall, Unterhalt und Bau über die Zeit, und der Handel rechnet noch mit seiner festen Geschwindigkeit (Entfernung im Handel ist ein eigener Pull Request).

## Im Spiel

- **Nah:** ein Band aus gestampfter Erde, das dem Gelände folgt. In den Bergen sucht jeder Weg seinen Pfad durchs Tal und ist als Absatz in den Fels geschnitten. Wälder sind entlang des Wegs offen, über Flüsse führen steinerne Brücken.
- **Fern:** die Wege färben die Blöcke, durch die sie laufen. Pfade verschwinden zuerst, Hauptstrassen bleiben am längsten.

## Das Modell

1. **Kosten eines Schritts** über die Karte (ein Kartenpixel, in Mitteleuropa etwa 2 km): seine Länge mal 1 + (Steigung / 5 %)², höchstens das Zwölffache. Ein Fluss kostet beim Überqueren so viel wie ein Umweg vom Hundertfachen seiner Breite. Die Breite folgt aus der hydraulischen Geometrie: Breite ≈ 1,1 m · √(Einzugsgebiet in km²). Wo schon ein Weg liegt, kostet ein Schritt 55 %.
2. **Netz.** Jede Stadt wird mit ihren sechs nächsten Nachbarn und mit allen Städten des Gabriel-Graphen verbunden (zwei Städte, zwischen denen keine dritte liegt). Die Paare werden in der Reihenfolge ihrer Bedeutung gelegt, Einwohner mal Einwohner durch Entfernung², jedes auf dem günstigsten Weg.
3. **Verkehr und Art.** Auf dem fertigen Netz schickt jedes Paar von Städten Einwohner × Einwohner / Kosten² über seinen günstigsten Weg. Die 15 % der Weglänge mit dem meisten Verkehr sind Hauptstrassen, die nächsten 40 % Landstrassen, der Rest Pfade. So trägt der Weg über den Gotthard den Verkehr zwischen der Lombardei und Schwaben und wird Hauptstrasse, obwohl er zwei kleine Orte verbindet.
4. **Nah.** Der Weg wird alle 24 Blöcke an seine Linie geheftet und sucht dazwischen den günstigsten Pfad über die Säulen: Länge, dazu 3 × (gekletterte Blöcke)², 2,5 mehr im Fels, 6 für eine Brücke. Seine Höhe ist die des Bodens unter ihm, gemittelt über 6 Blöcke.
5. **Reisezeit.** Tage = Mühe / Tagesleistung. Tagesleistungen aus ORBIS: Ochsenkarren 12 km, schwer beladenes Maultier 20, Fussgänger 30, Reiter 56, schneller Wagen der Post 67. Auf einem Pfad gehen Waren mit Saumtieren statt mit Karren. Im Winter schaffen Pfade 60 %, Landstrassen 70 % und Hauptstrassen 80 % der Sommerleistung.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| Steigung, die einen Schritt verdoppelt | 5 % | Annahme nach Galin et al. 2010 (Karren nehmen etwa 5 % ohne Mühe) |
| Flussbreite | 1,1 m · √km² | Leopold und Maddock 1953 (Breite ∝ Abfluss^0,5); geeicht am Rhein bei Köln, 144'000 km², etwa 400 m |
| Umweg je Meter Flussbreite | 100 m | Annahme |
| Wiederverwendung | 55 % | Annahme nach Galin et al. 2011 |
| Anteile der Arten | 15 % / 40 % / 45 % | Annahme, bis Itiner-e und Gough-Karte eingelegt sind |
| Tagesleistungen | 12 / 20 / 30 / 56 / 67 km | ORBIS, Scheidel, Meeks und Weiland 2012, S. 20 |
| Winter | 0,6 / 0,7 / 0,8 | Annahme (ORBIS sperrt Karren im Winter über die Pässe, S. 21) |

## Historische Prüfung

Ohne dass das Modell davon weiss, legt es die Hauptstrasse über die Alpen bei 8,57° Ost und 46,56° Nord, dort, wo der Gotthardpass liegt. Das Netz ist 177'000 km lang: 13'000 km Hauptstrassen, 36'000 km Landstrassen und 128'000 km Pfade.

## Massstab 1 : 100

Ein Weg wird in der nahen Ansicht 1 bis 2 Blöcke breit gezeichnet, also über 100 m. Er ist so viel zu breit wie die Flüsse und die Häuser, damit man ihn aus der Kamera sieht.

## Grenzen

- Das Netz ist aus Gelände und Städten gerechnet, nicht aus Quellen. Die Römerstrassen (Itiner-e) und die Gough-Karte sollen es ersetzen, wo sie es kennen.
- Die Arten folgen aus dem Verkehr, nicht aus Bauarten. Zustand, Zerfall und Unterhalt kommen im nächsten Schritt.
- Die Länge und Mühe eines Wegs zwischen zwei Orten ist für 3'539 von 5'271 Paaren gerechnet; für die übrigen läuft der Weg durch einen dritten Ort.

## Quellen

- Galin, Peytavie, Maréchal und Guérin (2010): Procedural generation of roads. Computer Graphics Forum 29(2).
- Galin, Peytavie, Guérin und Beneš (2011): Authoring hierarchical road networks. Computer Graphics Forum 30(7).
- Leopold und Maddock (1953): The hydraulic geometry of stream channels and some physiographic implications. USGS Professional Paper 252.
- Scheidel, Meeks und Weiland (2012): ORBIS, The Stanford Geospatial Network Model of the Roman World.
- Bogart, Rosevear und Shaw-Taylor (2026): A better ride. Explorations in Economic History.
- Chaikin (1974): An algorithm for high speed curve generation. Computer Graphics and Image Processing 3.
