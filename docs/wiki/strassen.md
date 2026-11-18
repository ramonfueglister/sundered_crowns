# Strassen

**Status:** Gebaut (Schritt 1: Netz, Bild und Handel) · **Bereich:** Welt · **Stand:** 2026-11-18

> Zwischen den Städten der Welt laufen Wege, wie ein Strassenbauer sie über das Land legt: dem Gelände entlang, über wenige Flussübergänge und über die Pässe. Die 3D-Welt zeigt sie, und die Simulation weiss, wie viele Tage ein Karren, ein Saumtier oder ein Reiter auf jedem Weg braucht.

## Das Feature

Beim Bau der Daten wird ein Wegnetz über die Karte gelegt: zwischen den 558 Städten, die die Welt von 1291 zeigt, und von jedem Ort der Karte in ihrer Nähe zum nächsten Weg. Jeder Weg hat eine Art: Pfad, Landstrasse oder Hauptstrasse. Die Simulation erhält für jedes Paar benachbarter Orte die Länge des Wegs, seine Mühe (Länge gewichtet mit der Zeit, die seine Steigungen brauchen), die Luftlinie zwischen seinen Enden und seine Art. Der [Handel](wirtschaft/entfernung-im-handel.md) fährt über Land auf diesen Wegen, abseits davon langsamer.

Noch nicht dabei: die Römerstrassen und die Gough-Karte als Quelle (die Daten sind aus der Cloud gesperrt) und Zerfall, Unterhalt und Bau über die Zeit.

## Im Spiel

- **Nah:** ein glattes Band aus gestampfter Erde, das in Kurven dem Gelände folgt, ohne Treppen im Grundriss und in der Höhe. In den Bergen sucht jeder Weg seinen Pfad durchs Tal und ist als Absatz in den Fels geschnitten. Wälder sind entlang des Wegs offen, über Flüsse führen steinerne Brücken.
- **Fern:** die Wege färben den Boden als weiche Linie, die Wälder sind von ihnen genommen. Pfade verschwinden zuerst, Hauptstrassen bleiben am längsten.

## Das Modell

1. **Kosten eines Schritts** über die Karte (ein Kartenpixel, in Mitteleuropa etwa 2 km): seine Länge mal 1 + (Steigung / 5 %)², höchstens das Zwölffache. Ein Fluss kostet beim Überqueren so viel wie ein Umweg vom Hundertfachen seiner Breite. Die Breite folgt aus der hydraulischen Geometrie: Breite ≈ 1,1 m · √(Einzugsgebiet in km²). Wo schon ein Weg liegt, kostet ein Schritt 55 %.
2. **Netz.** Jede Stadt wird mit ihren sechs nächsten Nachbarn und mit allen Städten des Gabriel-Graphen verbunden (zwei Städte, zwischen denen keine dritte liegt). Die Paare werden in der Reihenfolge ihrer Bedeutung gelegt, Einwohner mal Einwohner durch Entfernung², jedes auf dem günstigsten Weg.
3. **Verkehr und Art.** Auf dem fertigen Netz schickt jedes Paar von Städten Einwohner × Einwohner / Kosten² über seinen günstigsten Weg. Die 15 % der Weglänge mit dem meisten Verkehr sind Hauptstrassen, die nächsten 40 % Landstrassen, der Rest Pfade. So trägt der Weg über den Gotthard den Verkehr zwischen der Lombardei und Schwaben und wird Hauptstrasse, obwohl er zwei kleine Orte verbindet.
4. **Nah.** Der Weg wird alle 24 Blöcke an seine Linie geheftet und sucht dazwischen den günstigsten Pfad über die Säulen: Länge, dazu 3 × (gekletterte Blöcke)², 2,5 mehr im Fels, 6 für eine Brücke. Der Pfad wird danach entspannt (jeder Punkt geht zum gaussisch gewichteten Mittel seiner Nachbarn, σ = 4 Blöcke), so dass er sich biegt statt in Schritten von 45 Grad zu laufen. Seine Höhe ist die des Bodens unter ihm, gemittelt über 6 Blöcke. Gezeichnet wird er als eigene Fläche über den Säulen, mit Böschungen zum Boden hin; die Säulen unter ihm liegen knapp darunter.
5. **Reisezeit.** Die Mühe eines Wegs ist seine Länge, jeder Schritt gewichtet mit der Zeit, die seine Steigung braucht: Toblers Wanderfunktion, 6 · e^(−3,5 · |Steigung + 0,05|) km/h, im Mittel beider Richtungen (die Wege haben keine Richtung). Tage = Mühe / Tagesleistung. Tagesleistungen aus ORBIS: Ochsenkarren 12 km, schwer beladenes Maultier 20, Fussgänger 30, Reiter 56, schneller Wagen der Post 67. Auf einem Pfad gehen Waren mit Saumtieren statt mit Karren. Im Winter schaffen Pfade 60 %, Landstrassen 70 % und Hauptstrassen 80 % der Sommerleistung.

6. **Handel.** Ein Stück zwischen zwei benachbarten Orten, die ein Weg verbindet, ist für die Ware die Luftlinie mal so viel, wie der Weg sich windet und steigt (Mühe durch die Luftlinie zwischen seinen Enden). Ohne Weg geht es querfeldein, mit der Zeit der Steigung und bei 3/5 der Geschwindigkeit auf einem Weg (Tobler 1993). Die Ware nimmt das Schnellere. Eine Welt ohne Wege rechnet mit der Luftlinie; die Welt von 1356 fährt auf den Wegen von 1291.

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
| Zeit einer Steigung | Toblers Wanderfunktion | Tobler 1993, an Fussgängern gemessen |
| Abseits der Wege | 3/5 der Geschwindigkeit | Tobler 1993 |

## Historische Prüfung

Ohne dass das Modell davon weiss, legt es die Hauptstrasse über die Alpen bei 8,57° Ost und 46,56° Nord, dort, wo der Gotthardpass liegt. Das Netz ist 177'000 km lang: 13'000 km Hauptstrassen, 36'000 km Landstrassen und 128'000 km Pfade.

## Massstab 1 : 100

Ein Weg wird in der nahen Ansicht 1 bis 2 Blöcke breit gezeichnet, also über 100 m. Er ist so viel zu breit wie die Flüsse und die Häuser, damit man ihn aus der Kamera sieht.

## Grenzen

- Das Netz ist aus Gelände und Städten gerechnet, nicht aus Quellen. Die Römerstrassen (Itiner-e) und die Gough-Karte sollen es ersetzen, wo sie es kennen.
- Die Arten folgen aus dem Verkehr, nicht aus Bauarten. Zustand, Zerfall und Unterhalt kommen im nächsten Schritt.
- Die Länge und Mühe eines Wegs zwischen zwei Orten ist für 5'241 von 5'271 Paaren gerechnet; wo der Weg dazwischen einen dritten Ort berührt, über diesen.
- Auf Kartenpixeln (etwa 2 km) sind die Steigungen sanft: Die Mühe eines Wegs liegt kaum über seiner Länge (höchstens 19 %). Ein Weg ist im Mittel 1,36-mal so lang wie die Luftlinie zwischen seinen Enden, auch weil er auf einem Gitter aus Pixeln liegt.
- Nur 8 % der Landkanten zwischen Orten haben einen Weg: Wo die Weltgrafik keine Städte hat, gibt es keine Wege, und der Handel geht dort querfeldein.

## Quellen

- Galin, Peytavie, Maréchal und Guérin (2010): Procedural generation of roads. Computer Graphics Forum 29(2).
- Galin, Peytavie, Guérin und Beneš (2011): Authoring hierarchical road networks. Computer Graphics Forum 30(7).
- Leopold und Maddock (1953): The hydraulic geometry of stream channels and some physiographic implications. USGS Professional Paper 252.
- Scheidel, Meeks und Weiland (2012): ORBIS, The Stanford Geospatial Network Model of the Roman World.
- Bogart, Rosevear und Shaw-Taylor (2026): A better ride. Explorations in Economic History.
- Tobler (1993): Three presentations on geographical analysis and modeling. NCGIA Technical Report 93-1.
