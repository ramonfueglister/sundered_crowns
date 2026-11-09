# Abschlussbericht (Punkt 120)

Stand: 9. November 2026, Branch `claude/game-foundation`, Pull Request #1.
Jede der 120 Vorgaben hat ihren Stand in [`SPEC_CHECKLIST.md`](SPEC_CHECKLIST.md): 95 erfüllt, 22 teilweise, 3 zurückgestellt (Ton). Dieser Bericht fasst zusammen.

## Was gebaut wurde

**Sundered Crowns** ist ein eigenständiges Grand-Strategy-Spiel im Browser. Es spielt im historischen Europa
vom 1. Januar 1356 bis zum 31. Dezember 1815, mit einem zweiten Start am 1. Januar 1492.

- **Karte.**
  - Die Karte stammt aus Natural Earth und echten Höhendaten: 15.220 Orte, 1.518 Provinzen und 1.118 Seezonen.
  - Pässe, Meerengen und Flüsse sind Teil des Wegenetzes.
  - Gezeichnet wird mit WebGPU: Relief, Wälder, Schnee nach Monat, animiertes Meer mit Gischt, Grenzen mit Tintenübergang, geschwungene Reichsnamen und zehn Kartenmodi.
  - Unentdeckte Länder und Meere liegen unter Pergament.
  - 22 Wahrzeichen sind auf der Karte zu sehen und lassen sich ausbauen.
- **Welt 1356.**
  - 342 Reiche mit Herrschern, Erben, Hauptstädten, Bündnissen und Kriegen.
  - Kultur, Glaube und Minderheiten je Ort; Bevölkerung in Schichten.
  - Der Start 1492 hat 296 Reiche.
- **Simulation.** Sie ist deterministisch (fester Seed, feste Systemreihenfolge) und läuft im Web Worker.
  - Wirtschaft: Märkte, Preise, Handelsströme, Ernten, Silber.
  - Politik: 30+ Gesetze, Stände und Ämter, 8+ Wertachsen.
  - Herrscher: Erbfolge und Bürgerkrieg.
  - Diplomatie: Bündnisse, Heiraten, Personalunionen, Vasallen, Koalitionen, Reich und Papsttum.
  - Krieg: Armeen, Flotten, Schlachten, Belagerungen, Versorgung, Kriegsziele und Frieden.
  - Gesellschaft: Seuchen, Unruhe, Rebellen, Bekehrung.
  - Fortschritt: Forschung, Erfindungen, Doktrinen.
  - Kolonien: Entdeckung und Kolonisation.
  - Inhalte: Lagen wie die Pest, der Hundertjährige Streit um Frankreich, das Schisma, die Kelchbewegung, Osmanen, Reconquista, Zerfall der Horde, Reformation, Entdeckungen, Konfessionskriege und Revolution; dazu 157 zweisprachige Ereignisse und Entscheidungen.
- **KI.** Sie wählt Ziele nach Macht, Bündnissen und Entfernung, bildet Koalitionen, schließt Frieden nach Kriegsstand, belagert, transportiert über See, verwaltet den Haushalt, baut aus und hat Persönlichkeiten.
- **Oberfläche.**
  - Deutsch und Englisch.
  - Tooltips, die jede Zahl aufschlüsseln.
  - Panels für Wirtschaft, Herrschaft, Diplomatie, Militär, Wissen, Ledger und Chronik.
  - Tutorial, Fotomodus, Zeitraffer mit WebM-Export, Hauptmenü über einer lebenden Karte.
  - Lokale Spielstände in IndexedDB.
- **Online.**
  - Eigener Weltserver mit derselben Simulation. Er führt Befehle an Tagesgrenzen aus, schreibt Snapshots und ein Befehlslog und läuft nach einem Neustart weiter.
  - Pro Tag gehen nur Änderungen an die Clients.
  - Ein Spieler kann einen Sitz übernehmen; ist er weg, gelten seine Daueraufträge.
  - Weiter gibt es Chat, Angebote, Ranglisten, Saisonende mit Ruhmeshalle und Errungenschaften.
  - Supabase liefert Konten, Cloud-Saves und Row Level Security.

## URLs

Es gibt noch keine öffentlichen URLs. Der Deploy auf Vercel, Supabase und Fly.io wartet auf die Zugangsdaten. Sobald
sie da sind, führt [`DEPLOY.md`](DEPLOY.md) Schritt für Schritt durch alles.

## Wie der Weltserver gehostet wird

Der Server ist ein Node-Prozess: `server/main.ts` mit `server/Dockerfile`.

- **Ziel:** Fly.io, konfiguriert in `server/fly.toml`.
  - Eine Maschine und ein Volume pro Welt, `auto_stop_machines = off`, damit die Weltuhr weiterläuft.
  - Snapshots liegen auf dem Volume `/data` und werden zusätzlich nach Supabase Storage hochgeladen.
- **Endpunkte:** `/health`, `/world`, `/leaderboard` und WebSocket auf `/`.
- **Eine Saison** dauert 168.013 Spieltage × 36 s, also 70 Tage oder 10 Wochen.

## Umgebungsvariablen

**Vercel (Browser-Spiel):**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_WORLD_URL`
- optional `VITE_SUPABASE_OAUTH`

**Weltserver:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET` oder `SUPABASE_JWKS_URL`, dazu `SUPABASE_JWT_AUD`
- `PUBLIC_WORLD_URL`
- `ALLOWED_ORIGINS`
- `ADMIN_USERS`
- `WORLD_ID` und `WORLD_NAME`
- `WORLD_DATA_DIR`
- `SECONDS_PER_DAY` (Standard 36)
- `MAX_PLAYERS` (100)
- `SEASON_END_DAY`
- `PORT`
- `MAX_CONN_PER_IP` (12) und `MAX_CONN_PER_USER` (3)

Ohne Supabase läuft der Server im Entwicklungsmodus mit Anmeldung über den Anzeigenamen.

## Abnahmetests

`npx vitest run`: **47 Tests in 7 Dateien, alle grün.**

Eine unabhängige Prüfung der letzten Änderungen fand fünf Fehler, alle behoben:
- Die neuen Khanate starteten mit einem Heer aus lauter Geschützen.
- Die Lage der Horde endete bei einer Spieler-Horde nie.
- Die Horde zerfiel auch mitten im Krieg.
- Online ließen sich Wahrzeichen nicht ausbauen.
- Der Zeitraffer wurde vom laufenden Spiel übermalt.

| Prüfung (Punkt 119) | Ergebnis |
|---|---|
| Kleiner Reichsstand gewinnt einen Krieg und bekommt per Frieden Land | ✓ Test (Brabant gegen Utrecht, nach 301 Spieltagen) |
| Aggressive Ausdehnung führt zu einer Koalition, die Krieg erklärt | ✓ Test |
| Herrscher stirbt, Erbe folgt, umstrittene Erbfolge führt zum Bürgerkrieg | ✓ Test |
| Ereignisse mit Wahlmöglichkeiten verändern den Spielstand | ✓ Test |
| Tiefenziele (10.000+ Orte, 300+ Staaten, 30+ Gesetze, 8+ Werte, Gremien, 6+ Lagen) | ✓ Test |
| Missernte erhöht Preise, senkt Lebensstandard, breitet sich über Handel aus, schürt Unruhe | ✓ Test |
| Amerika per Schiff erreichen und eine wachsende Kolonie gründen | ✓ Test |
| Gleicher Seed und gleiche Befehle ergeben denselben Hash nach 50 Jahren | ✓ `npm run test:accept:slow` (316 s) |
| Manipulierter Client kann nicht für ein anderes Reich handeln | ✓ Test; Befehle werden auf dem Server geprüft |
| Welt läuft ohne Spieler weiter und setzt nach Neustart genau fort | ✓ `tests/world_replay.test.ts` |
| RLS: ein Nutzer kann fremde Spielstände weder lesen noch ändern | ✓ `tests/supabase_rls.test.ts` (alle Migrationen gegen Postgres) |
| Zwei Clients und 100 Bots in einer Welt, Angebot austauschen, Krieg führen | ✓ `npm run smoke:online`, `tools/load_test.ts` |
| Beobachterlauf 1356–1600 plausibel und abwechslungsreich (Punkt 99) | ◐ zwei Seeds; Granada fällt nicht wie erwartet, siehe unten |

**Lasttest mit 100 Bots** (0,5 s pro Spieltag, also 72-fache Geschwindigkeit):
- Alle Bots in 8,5 s gesetzt.
- 3.001 Befehle, keiner abgewiesen.
- Bestätigung im Median nach 21 ms; Ergebnis im Median nach 277 ms, p95 nach 986 ms.
- 30 KB pro Bot und Spieltag.
- Server pro Tag: 6 ms Simulation, 9 ms Versand.
- Das Angebot war in 20 ms beim Empfänger, der Krieg wurde erklärt.
- Rohdaten: `/mnt/project-files/sundered-crowns/loadtest/load_100_bots.txt`.

**Im Browser geprüft** (Playwright, Chromium mit Software-WebGPU; Screenshots im Projektordner unter
`sundered-crowns/screens/`):
- Hauptmenü mit lebender Karte.
- Neues Spiel mit Portugal und Frankreich.
- Unentdeckte Gebiete.
- Wahrzeichen auf der Karte und im Ortsfenster.
- Zeitraffer-Video.
- Ortsnamen.
- Keine Seitenfehler.

**Noch nicht geprüft:**
- 60 fps auf einer echten Grafikkarte; hier gab es nur Software-Rendering.
- Cloud-Saves gegen ein echtes Supabase-Projekt.
- Der Vercel-Deploy.

### Beobachterlauf 1356–1600

Die KI spielt ohne Spieler vom 1. Januar 1356 bis 1600, zweimal mit verschiedenen Seeds (1356 und 7).
Ein Lauf dauert hier rund 40 Minuten. Alle 25 Jahre schreibt `tools/sim/observer.ts` einen Bericht.
Berichte, Besitzkarten und Kartenbilder liegen im Projektordner unter `sundered-crowns/observer/`.

| Prüfung (Punkt 99) | Seed 1356 | Seed 7 |
|---|---|---|
| Größter Anteil an Europa, höchster Wert im Lauf | 7,6 % (Ungarn) | 9,4 % (Ungarn) |
| Staaten im Jahr 1600 (Start: 342) | 206 | 216 |
| Längster laufender Krieg ab 1381 | 4,6 Jahre | 4,7 Jahre |
| Gleichzeitig bankrotte Reiche | 0 bis 3 | 0 bis 4 |
| Kolonien in Übersee um 1500 | 82 | 73 |

- **Abwechslungsreich.** Im Osten gehen die Läufe auseinander.
  - Seed 1356: Die Horde zerfällt früh, und die Steppe bleibt geteilt.
  - Seed 7: Die Horde hält zusammen. Litauen wird groß, und Ungarn wächst auf über 700 Orte.
  - Im Westen sind sich die Läufe ähnlicher: Kastilien eint Iberien, Frankreich und England bleiben Großmächte, das Reich bleibt zersplittert.
- **Geschichte.** Die Lagen spielen sich ab:
  - Pest und Hundertjähriger Streit; Frankreich wird geteilt.
  - Das Schisma endet mit einem Konzil, der Kelchstreit mit einem Vergleich.
  - Die Horde zerbricht.
  - Entdeckungen und Reformation beginnen.
- **Was abweicht.** (Stand dieser ersten Läufe; die Läufe danach stehen im Nachtrag unten.)
  - In beiden Läufen hält Konstantinopel stand, und Granada überlebt.
  - Moskau geht in den Nachbarn auf.
  - Große KI-Reiche horten Gold: Frankreich hat 1600 über eine Million.
  - Das Preisniveau steigt bis 1600 auf das 2,8-Fache. Das passt zur Preisrevolution des 16. Jahrhunderts.
- **Gefunden und behoben.** Ein erster Lauf zeigte 8 bis 15 Kleinstaaten, die ein Jahrhundert lang immer wieder bankrott gingen. Ihre Festungen, ihr Hof und ihre Flotten kosteten mehr, als sie einnahmen. Jetzt zahlt ein Reich seine Garnisonen nur bis zu einem Drittel seiner Einnahmen, und der Hof richtet sich nach den Einnahmen. Die Zahlen oben stammen aus den Läufen danach.

#### Nachtrag: Läufe nach den Änderungen an KI und Geschichte

Nach den Arbeiten an Haushalt, Kriegsführung und Lagen liefen beide Seeds noch einmal bis 1600. Die Berichte unter `observer/` stammen noch aus den ersten Läufen.

| Prüfung (Punkt 99) | Seed 1356 | Seed 7 |
|---|---|---|
| Größter Anteil an Europa, höchster Wert im Lauf | 8,3 % (Ungarn) | 9,2 % (Frankreich) |
| Staaten im Jahr 1600 (Start: 342) | 213 | 193 |
| Längster laufender Krieg ab 1381 | 4,9 Jahre | 6,8 Jahre |
| Gleichzeitig bankrotte Reiche | 0 bis 5 | 0 bis 5 |
| Größte Kasse, gemessen am Jahresertrag | höchstens 2,4 Jahre | höchstens 2,4 Jahre |

- **Gold.** Die KI gibt einen vollen Schatz im Frieden aus: für Tilgung, Stände, Bauten, Wahrzeichen, Flotten und Kolonialunternehmen. Über drei Jahreserträgen liegen nur Kleinstaaten fast ohne Einnahmen und vereinzelt Städte mit bis zu 3,4 Jahren.
- **Konstantinopel.** In Seed 7 nehmen die Osmanen die Stadt zwischen 1406 und 1431. In Seed 1356 nimmt das griechische Haus Kantakuzenos die Stadt 1364. Die Osmanen belagern sie mehrmals, nehmen sie aber bis 1600 nicht.
- **Granada.** In Seed 7 erobert Kastilien das Emirat zwischen 1456 und 1481. In Seed 1356 nehmen die Meriniden die Stadt vor 1381, und Kastilien erobert sie zwischen 1481 und 1506. Die Lage endet 1520 trotzdem mit „Das Emirat besteht fort“: Sie zählt die Orte, die die Meriniden in Iberien noch halten, und das sind mehr als drei.
- **Portugal** überlebt in beiden Läufen. In Seed 7 verliert es um 1430 Lissabon an die Meriniden und schrumpft bis 1600 auf 26 Orte.
- **Die Rus.** In beiden Läufen sammelt Moskau die Rus: 451 bzw. 396 Orte im Jahr 1600.
- **Die Steppe.** Die Goldene Horde schrumpft von 1480 Orten auf 69 bzw. 80.

#### Nachtrag 2: Läufe nach der Durchsicht

Eine Durchsicht fand Abkürzungen in den Lagen: einen Belagerungsbonus für die Osmanen und Kastilien in jeder Belagerung, automatische Breschen nur vor Konstantinopel und Granada, ein Datum für den Fall der Landmauern, ein Kalender für den Niedergang der Steppe und gelöschte Bündnisse des Emirats. Diese Abkürzungen sind ersetzt (siehe unten). Dazu kamen Prüfungen der Kriegsziele, Kriegsmüdigkeit nur noch im Frieden abbauen und Glauben, die im Spiel tatsächlich vorkommen. Danach liefen beide Seeds noch einmal bis 1600.

| Prüfung (Punkt 99) | Seed 1356 | Seed 7 |
|---|---|---|
| Größter Anteil an Europa, höchster Wert im Lauf | 8,2 % (England) | 8,0 % (Schweden) |
| Staaten im Jahr 1600 (Start: 342) | 207 | 220 |
| Längster laufender Krieg ab 1381 | 4,9 Jahre | 5,1 Jahre |
| Gleichzeitig bankrotte Reiche | 0 bis 3 | 0 bis 3 |
| Größte Kasse unter den fünf reichsten, gemessen am Jahresertrag | höchstens 2,3 Jahre | höchstens 2,2 Jahre |
| Konstantinopel | Osmanen, zwischen 1406 und 1431 | Osmanen, zwischen 1431 und 1456 |
| Granada | Kastilien nimmt die Stadt zwischen 1456 und 1481 | fällt nicht |
| Portugal im Jahr 1600 | 105 Orte, mit Lissabon | 63 Orte, Lissabon seit vor 1381 bei den Meriniden |
| Moskau im Jahr 1600 | 393 Orte | 217 Orte |
| Goldene Horde (Start: 1480 Orte) | 57 Orte im Jahr 1600 | 188 Orte im Jahr 1600 |

- **Konstantinopel** fällt jetzt in beiden Läufen an die Osmanen. Entscheidend ist der Belagerungstrain: Die KI stellt für einen Krieg um befestigte Orte genug Artillerie auf, und Großgeschütze schlagen Breschen.
- **Granada** fällt in Seed 7 nicht, und in Seed 1356 endet die Lage 1520 trotzdem mit „Das Emirat besteht fort“: Das Emirat hält nach dem Verlust der Stadt noch mehr als drei Orte in Iberien. Das Ziel „Granada fällt um 1500“ ist damit nicht erreicht.
- **Glauben im Spiel.** Bosnien bleibt in beiden Läufen bis 1600 bei der Bosnischen Kirche. Jüdische Gemeinden wirken in 12 bis 20 Reichen (vorher ab 1362 nur in 3). Ein Tengri-Khanat entsteht in Seed 1356 bis 1456 und in Seed 7 bis 1506. Kein Reich folgt dem samischen oder hinduistischen Glauben.
- **Gold.** Über drei Jahreserträgen liegen nur Kleinstaaten fast ohne Einnahmen (Lanzarote, Makurien) und vereinzelt kleine Reiche wie Dorpat, Dulkadir oder Eichstätt.

#### Nachtrag 3: Polish-Pass (claude/polish-pass), Läufe bis 1500

Der Polish-Pass ändert an der KI nichts. Neu in der Simulation sind die Siegbedingungen (nur aktiv, wenn sie beim Spielstart gewählt werden; der Beobachter spielt mit der Wertung allein), die Heeresstärke und Wertung in den Verlaufsdaten und für abwesende Online-Herrscher eine Frist von 30 Tagen vor der automatischen Entscheidung. Beide Seeds liefen bis 1500 (`tools/sim/observer.ts 1500 <seed> 1356 25`).

| Prüfung (Punkt 99) | Seed 1356 | Seed 7 |
|---|---|---|
| Größter Anteil an Europa, höchster Wert im Lauf | 9,2 % (Schweden, 1431) | 7,4 % (Frankreich, 1500) |
| Staaten im Jahr 1500 (Start: 342) | 239 | 227 |
| Längster laufender Krieg ab 1381 | 4,5 Jahre | 4,5 Jahre |
| Gleichzeitig bankrotte Reiche | 0 bis 3 | 0 bis 1 |
| Laufzeit | 29,6 Minuten | 26,1 Minuten |

Eine Probe mit allen Siegarten (`tools/sim/victory_probe.ts`, Seed 1356 bis 1496) zeigt, dass keine KI eine Bedingung von selbst erreicht: Frankreich hält höchstens 14,9 % der Entwicklung Europas (nötig 25 %), der größte Handelsanteil einer Großmacht liegt bei 9 % (nötig 20 %; kleine Reiche in Übersee kommen kurz auf bis zu 13 %, zählen aber nicht), der lateinische Glaube bei 66 % (nötig 80 %), und beim Wissen führt kein Reich mit dem 1,25-fachen und sechs neuen Wahrzeichenstufen. Die Bedingungen sind Ziele für einen Spieler, der sie verfolgt.

#### Was die Lagen vorgeben

Der größte Teil dieser Geschichte folgt aus allgemeinen Regeln, die für jedes Reich gelten. Einige Lagen geben aber Jahreszahlen oder einen bestimmten Ort vor. Diese Vorgaben sind hier vollständig aufgezählt:

- **Aufstieg des Hauses Osman** (`ottoman_rise` in `src/sim/content/situations.ts`):
  - Die Belagerung der Stadt (Stufe 2) beginnt frühestens 1400, sobald die Osmanen Land im Umkreis von 160 km um Konstantinopel halten.
  - Die Krieger der Grenze kosten 30 % weniger Unterhalt und bringen mehr Wehrkraft.
  - In einem Krieg um die Stadt ruft der Sultan sein ganzes Heer vor ihre Mauern. Dort bringt er gegossene Großgeschütze mit: +2 auf den monatlichen Belagerungswurf, nur mit Artillerie im Lager.
  - Die Landmauern geben dem Besitzer der Stadt +25 % Festungsstärke, bis die Osmanen selbst Großgeschütze gießen (Steinbüchsen übernommen oder Kriegskunst auf Stufe 7).
  - Die Lage endet 1500.
- **Krieg um Granada** (`reconquista`):
  - Der Krieg beginnt 1440, oder früher, wenn der Vorkämpfer sechsmal so stark ist wie das Emirat.
  - Der Vorkämpfer führt einen Glaubenskrieg mit der Stadt Granada als Ziel. Ferne Verbündete des Emirats, solche jenseits der Meerenge und christliche folgen dem Ruf in diesen einen Krieg nicht. Die Bündnisse selbst bleiben bestehen, und Spieler werden wie üblich gerufen.
  - Auch der Vorkämpfer ruft sein Heer vor die Stadt und erhält dort +2, nur mit Artillerie.
  - Die Lage endet 1520.
- **Beide Lagen** dürfen einen Waffenstillstand brechen, der mindestens zwei Jahre alt ist. Das kostet wie sonst auch 30 Eintracht und 20 Ansehen.

Nicht mehr vorgegeben, sondern allgemeine Regel:

- **Großgeschütze** schlagen in jeder Belagerung Breschen. Dafür braucht der Belagerer 250 Mann Artillerie je Festungsstufe, und ein Reich im Lager muss Großgeschütze gießen. Gegen Bastionsfestungen wirkt das nicht. Die KI stellt für Kriege um befestigte Orte einen Belagerungstrain auf.
- **Die Steppe** verblasst, wenn die sesshaften Nachbarn einer Horde Großgeschütze haben und die Ozeanrouten offen sind. Wie weit, steht bei jeder Horde. Ferne Länder einer großen Horde fallen ab, je eher, desto unruhiger sie sind.
- **Der kurze Waffenstillstand** von zwei Jahren gilt für jeden Krieg um eigenes Kernland, unabhängig vom Namen des Krieges.

## Was vereinfacht wurde, und wie

- **Ton.** Ramon hat ihn zurückgestellt: keine Musik, keine Soundeffekte (Punkte 11, 111, 112). `src/ui/audio.ts` bleibt als stumme Schnittstelle für die spätere Musik.
- **Armeen** sind heraldische Zähler mit Symbolen je Truppentyp, keine animierten 3D-Modelle (Punkt 31).
- **Meer.** Wellen, Tiefenfarbe, Gischt und Küstenlinien sind in einem Shader animiert. Es gibt keine FFT-Ozeansimulation (Punkt 32).
- **Gelände.** Das Relief ist aus Höhendaten schattiert, mit Umgebungsverdeckung, Fels und Schnee. Es gibt keine echte Displacement-Geometrie (Punkt 26).
- **Wetter.** Schnee wächst und schmilzt nach Monat und Breite. Herbstfarben, Regen und Nebel fehlen noch (Punkt 33).
- **Provinzen.** Es sind 1.518 statt etwa 1.000, weil die Gruppierung den Daten folgt (Punkt 15).
- **Reichsnamen** liegen entlang der Hauptachse der Fläche, nicht entlang gekrümmter Linien (Punkt 28).
- **Unentdecktes Land** ist nur im Einzelspieler verborgen. Online schickt der Server noch die ganze Karte (Punkt 119, „versteckte Provinzen“).
- **Glaubensmechaniken.** Jeder Glaube hat eine eigene Mechanik, aber noch nicht jede wirkt in der Simulation (Punkt 78).
- **Werkzeuge.** Blender, GDAL und Inkscape sind auf dieser Maschine nicht installiert. Die Kartenpipeline nutzt Python (numpy, scipy, Pillow), ImageMagick und ffmpeg (Punkt 10).
