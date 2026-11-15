// Background music: one streamed <audio> element routed through Web Audio (per-piece loudness gain, then the player's volume).
// Nothing is fetched while the music is off; a piece is streamed only when it plays. Origin of the pieces: docs/audio/MUSIC.md.
import { signal } from '@preact/signals';
import { TRACKS } from './playlist';

const KEY_VOLUME = 'sc.music.volume', KEY_MUTED = 'sc.music.muted';
/** Slider position 0..100 at first start: 40 gives -16 dB, about Apoleia's level (-17 dB) on pieces that are now normalised to -16 LUFS. */
export const DEFAULT_VOLUME = 40;
const FADE_IN = 1.2, FADE_OUT = 0.4;

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

/** A stored volume, or the default when none or a broken one is stored. */
export function parseVolume(s: string | null): number {
  const v = s === null || s.trim() === '' ? NaN : Number(s);
  return Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : DEFAULT_VOLUME;
}
/** Amplitude of a slider position: squared, so equal slider steps sound like roughly equal steps in loudness. */
export const sliderGain = (v: number) => (Math.min(100, Math.max(0, v)) / 100) ** 2;
export const dbGain = (db: number) => 10 ** (db / 20);
/** The piece after i (wraps round). */
export const nextTrack = (i: number, n = TRACKS.length) => (i + 1) % n;

export const musicVolume = signal(parseVolume(read(KEY_VOLUME)));
export const musicMuted = signal(read(KEY_MUTED) === '1');
/** Title of the piece now playing (null: none). */
export const nowPlaying = signal<string | null>(null);
/** The browser waits for a click or key press before it lets sound play. */
export const musicWaiting = signal(false);

let el: HTMLAudioElement | null = null, ctx: AudioContext | null = null, trackGain: GainNode | null = null, master: GainNode | null = null;
let index = -1, failures = 0, started = false, fadePending = false;

function graph(): boolean {
  if (ctx) return true;
  const AC = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  el = new Audio();
  el.preload = 'auto';
  el.addEventListener('ended', () => skip());
  el.addEventListener('error', () => { if (++failures < TRACKS.length) skip(); else { nowPlaying.value = null; } });
  el.addEventListener('playing', () => {
    failures = 0;
    if (!fadePending || !ctx || !master) return;
    fadePending = false; // fade in once the piece really sounds, not while it is still loading
    const g = master.gain, now = ctx.currentTime;
    g.cancelScheduledValues(now); g.setValueAtTime(0, now); g.linearRampToValueAtTime(sliderGain(musicVolume.value), now + FADE_IN);
  });
  const src = ctx.createMediaElementSource(el);
  trackGain = ctx.createGain(); master = ctx.createGain(); master.gain.value = 0;
  src.connect(trackGain).connect(master).connect(ctx.destination);
  return true;
}

/** Loads piece i and fades it in. Must run inside a user gesture the first time on Safari. */
function play(i: number) {
  if (!graph() || !el || !ctx || !trackGain || !master) return;
  index = i;
  const [file, title, gainDb] = TRACKS[i];
  el.src = `/audio/music/${file}`;
  trackGain.gain.value = dbGain(gainDb);
  master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(0, ctx.currentTime);
  fadePending = true;
  nowPlaying.value = title;
  media(title);
  void ctx.resume();
  el.play().then(() => { musicWaiting.value = false; }, (e: DOMException) => { if (e?.name === 'NotAllowedError') waitForGesture(); });
  if (ctx.state !== 'running') waitForGesture();
}

/** Autoplay rules: start again on the next click or key press. */
function waitForGesture() {
  if (musicWaiting.value) return;
  musicWaiting.value = true;
  const go = () => {
    removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true);
    musicWaiting.value = false;
    if (musicMuted.value || !ctx || !el) return;
    void ctx.resume();
    el.play().catch(() => { /* reported by the error event */ });
  };
  addEventListener('pointerdown', go, true); addEventListener('keydown', go, true);
}

function media(title: string) {
  const ms = navigator.mediaSession;
  if (!ms || typeof MediaMetadata === 'undefined') return;
  ms.metadata = new MediaMetadata({ title, artist: 'Sundered Crowns' });
  try { ms.setActionHandler('nexttrack', () => skip()); } catch { /* not supported */ }
}

/** Starts the music when the game view opens (the first piece is always Mare et Terra, as in Apoleia). */
export function startMusic() {
  started = true;
  if (!musicMuted.value && index < 0) play(0);
}

/** Next piece. */
export function skip() { if (!musicMuted.value) play(nextTrack(index)); }

export function setMuted(m: boolean) {
  musicMuted.value = m; write(KEY_MUTED, m ? '1' : '0');
  if (m) {
    if (!ctx || !el || !master) return;
    const g = master.gain, now = ctx.currentTime, a = el;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + FADE_OUT);
    setTimeout(() => { if (musicMuted.value) { a.pause(); nowPlaying.value = null; } }, FADE_OUT * 1000);
  } else if (started) play(Math.max(0, index)); // the piece that was playing starts again
}

export function setVolume(v: number) {
  v = parseVolume(String(v));
  musicVolume.value = v; write(KEY_VOLUME, String(v));
  if (v > 0 && musicMuted.value) { setMuted(false); return; }
  if (ctx && master && !musicMuted.value) master.gain.setTargetAtTime(sliderGain(v), ctx.currentTime, 0.05);
}

/** M: music on/off, N: next piece (not while typing). */
export function musicKey(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return false;
  const k = e.key.toLowerCase();
  if (k === 'm') { setMuted(!musicMuted.value); return true; }
  if (k === 'n') { skip(); return true; }
  return false;
}
