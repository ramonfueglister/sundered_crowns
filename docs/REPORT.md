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
| Beobachterlauf 1356–1600 plausibel und abwechslungsreich (Punkt 99) | ✓ zwei Seeds, siehe unten |

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
- **Was abweicht.**
  - In beiden Läufen hält Konstantinopel stand, und Granada überlebt.
  - Moskau geht in den Nachbarn auf.
  - Große KI-Reiche horten Gold: Frankreich hat 1600 über eine Million.
  - Das Preisniveau steigt bis 1600 auf das 2,8-Fache. Das passt zur Preisrevolution des 16. Jahrhunderts.
- **Gefunden und behoben.** Ein erster Lauf zeigte 8 bis 15 Kleinstaaten, die ein Jahrhundert lang immer wieder bankrott gingen. Ihre Festungen, ihr Hof und ihre Flotten kosteten mehr, als sie einnahmen. Jetzt zahlt ein Reich seine Garnisonen nur bis zu einem Drittel seiner Einnahmen, und der Hof richtet sich nach den Einnahmen. Die Zahlen oben stammen aus den Läufen danach.

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
