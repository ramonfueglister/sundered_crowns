# Music

Background music of the game: 64 pieces, 3 h 11 min, taken over unchanged from Ramon's earlier project
[Apoleia](https://github.com/ramonfueglister/apoleia) (commit c30a107, `app/assets/music/`, playlist `app/scripts/soundtrack_playlist.gd`).

## Origin and rights

- All pieces were generated with AI for Apoleia through **sunoapi.org**, a third-party API in front of Suno (model V6 requested),
  on 2026-10-26 (see Apoleia `docs/audio/README.md`). No recordings, melodies or lyrics of other works were uploaded as input;
  the lyrics are Apoleia's own.
- 60 of the pieces were commissioned as counterparts to the published track titles of the EU5 soundtrack (only titles, order and
  lengths were used as a brief). Their own titles and the file names here carry no reference to EU5 or Paradox.
- **Rights are not settled.** Suno grants ownership and commercial use only for songs made while subscribed to a paid Suno plan
  (Pro/Premier); songs from the free plan stay Suno's and may be used non-commercially only
  ([Suno help: Does Suno own the music I make?](https://help.suno.com/en/articles/2416769)). Whether that applies to pieces made
  through sunoapi.org, and on which plan its account generated them, is not documented. Before the game earns money, clear this
  (or regenerate on an own paid Suno account). In some jurisdictions purely AI-generated music may not be protected by copyright at all.
- The settings menu credits the music as AI-made (`music_credit` in `src/ui/i18n.ts`).

## Files

- `public/audio/music/*.mp3`: the files byte for byte (MP3, 48 kHz stereo, about 185 kbit/s, 271 MB). Renamed after their own
  title; `data/audio/music.json` keeps for each the Apoleia path, SHA-256, size, length, provider task and audio id.
- `src/audio/playlist.ts` is generated from that record (file, title, gain). Order as in Apoleia: Mare et Terra II first
  (Ramon's wish in Apoleia), then the album, then the other three earlier pieces; it wraps round.
- Loudness: EBU R128 integrated loudness measured with ffmpeg (`ebur128`): -16.0 to -12.2 LUFS. Each piece is turned down to the
  quietest (-16 LUFS) at playback (`gain_db`), never up, so the files stay unchanged and nothing clips.

## Playback (`src/audio/music.ts`)

- One `<audio>` element, routed through Web Audio: piece gain, then the player's volume. A piece is streamed only when it plays;
  with the music off nothing is fetched.
- Starts when the game view opens. If the browser blocks sound until a gesture, it starts with the next click or key press.
- Settings menu (gear, top right): on/off, volume slider, the piece now playing and the next one. Keys: **M** on/off, **N** next piece.
  Both settings are kept in `localStorage` (`sc.music.muted`, `sc.music.volume`). Default volume 40 = -16 dB (Apoleia played at -17 dB).
- Fade in 1.2 s once a piece really sounds, fade out 0.4 s when turned off. Media Session: the OS media controls show the title and skip.
- A piece that fails to load is skipped; after 64 failures in a row the music stops.

## Checked

- `tests/music.test.ts`: track list against the record, file sizes, hash of the first piece, gains, volume rules.
- Headless Chromium (Playwright): playback starts after sign-in, next piece, M, slider, both settings stored; with the music off no
  MP3 is requested. Not checkable headless: the wait for a gesture (headless Chromium does not enforce the autoplay rule),
  Safari/iOS, and how it sounds.
