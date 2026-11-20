// The replay of the borders (Zeitraffer): the borders of this world as it ran, from its first day to today, played on
// the map as the replay at the end of an EU4/EU5 game plays the game that was played. The history comes from the
// world server (server/history.ts, GET /history): the real simulation, not a chronicle beside it (Ramon,
// 19 November 2026). Only a view: the world and its clock go on, and the map shows the world again when the replay
// is closed.
//
// The replay has its own clock: play and pause, five speeds and a timeline to drag along (the bar at the bottom,
// ReplayBar.tsx). The map is given new owners only when places changed, and then at most MAP_HZ times a second, so that
// the map's painter (worldprobe/realms.ts) keeps up and every frame shows whole borders; the date runs smoothly
// between.
import { signal } from '@preact/signals';
import type { I18n } from '../sim/i18n';
import type { History, HistoryLine } from '../net/protocol';
import { httpOf } from '../figures/people';
import { worldUrl } from '../net/client';

/** What the map shows of the replay: changes only when the owners or the realms change. */
export interface ReplayFrame {
  /** the owner of every place on that day, as the world's owners (realm ids) */
  owner: Int16Array;
  /** per realm id: colour and the name on the map */
  colors: number[];
  names: I18n[];
}
/** The replay's clock, for the bar at the bottom. */
export interface ReplayClock {
  /** the day shown (fractional while playing), the first and last day of the history, the world's start year */
  day: number;
  from: number;
  to: number;
  startYear: number;
  playing: boolean;
  /** 1 … REPLAY_SPEEDS.length */
  speed: number;
}

/** the map of the replay; null: the map shows the world */
export const replay = signal<ReplayFrame | null>(null);
export const replayClock = signal<ReplayClock | null>(null);
/** while the history is fetched, and why it could not be */
export const replayLoading = signal(false);
export const replayError = signal<string | null>(null);

/** the speeds as factors of the base pace, at which the whole history plays in BASE_SECONDS */
export const REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 4] as const;
const BASE_SECONDS = 40,
  DEFAULT_SPEED = 3;
/** however short the history, the base pace is at least this many days a second */
const LEAST_DAYS_PER_SECOND = 30;
/** the map gets new owners at most this often a second */
const MAP_HZ = 12;

interface Played {
  lines: HistoryLine[];
  startYear: number;
  /** the next line to apply, and the owners and realms after the lines before it */
  next: number;
  owner: Int16Array;
  colors: number[];
  names: I18n[];
  /** places or realms changed since the map was last given them */
  dirty: boolean;
  lastMap: number;
  raf: number;
  lastT: number;
}
let p: Played | null = null;

/** Back to the beginning of the history: the owners and realms of its first line. */
function rewind(x: Played) {
  const first = x.lines[0];
  x.owner = Int16Array.from(first.owner ?? []);
  x.colors = [];
  x.names = [];
  for (const r of first.r ?? []) {
    x.colors[r.id] = r.color;
    x.names[r.id] = r.short;
  }
  x.next = 1;
  x.dirty = true;
}
/** Applies the lines up to and including `day` (from the beginning when the day lies before what is applied). */
function seekTo(x: Played, day: number) {
  if (x.next > 1 && x.lines[x.next - 1].d > day) rewind(x);
  for (; x.next < x.lines.length && x.lines[x.next].d <= day; x.next++) {
    const l = x.lines[x.next];
    for (const [i, o] of l.c ?? []) if (i < x.owner.length) x.owner[i] = o;
    for (const r of l.r ?? []) {
      x.colors[r.id] = r.color;
      x.names[r.id] = r.short;
    }
    x.dirty = true;
  }
}
/** Gives the map the owners and realms when they changed (`now`: whatever the time since the last). */
function toMap(x: Played, now = false) {
  const t = performance.now();
  if (!x.dirty || (!now && t - x.lastMap < 1000 / MAP_HZ)) return;
  x.dirty = false;
  x.lastMap = t;
  replay.value = { owner: x.owner.slice(), colors: x.colors.slice(), names: x.names.slice() };
}
const daysPerSecond = (c: ReplayClock) =>
  Math.max(LEAST_DAYS_PER_SECOND, (c.to - c.from) / BASE_SECONDS) * REPLAY_SPEEDS[c.speed - 1];

function frame(t: number) {
  const x = p,
    c = replayClock.value;
  if (!x || !c) return;
  x.raf = 0;
  if (!c.playing) return;
  const dt = Math.min(0.25, (t - x.lastT) / 1000);
  x.lastT = t;
  const day = Math.min(c.to, c.day + dt * daysPerSecond(c));
  seekTo(x, Math.floor(day));
  const end = day >= c.to;
  toMap(x, end);
  // the last day stays until the replay is closed or played again
  replayClock.value = { ...c, day, playing: !end };
  if (!end) x.raf = requestAnimationFrame(frame);
}
function run() {
  if (!p || p.raf) return;
  p.lastT = performance.now();
  p.raf = requestAnimationFrame(frame);
}

/** Fetches the history of the world from the server and plays it from its first day. */
export async function startReplay() {
  stopReplay();
  replayLoading.value = true;
  replayError.value = null;
  try {
    const r = await fetch(`${httpOf(worldUrl)}/history`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const h = (await r.json()) as History;
    if (!h.lines?.length || !h.lines[0].owner) throw new Error('no history');
    const x: Played = {
      lines: h.lines,
      startYear: h.startYear,
      next: 1,
      owner: new Int16Array(0),
      colors: [],
      names: [],
      dirty: true,
      lastMap: 0,
      raf: 0,
      lastT: 0,
    };
    rewind(x);
    p = x;
    const from = h.lines[0].d,
      to = Math.max(from + 1, h.lines[h.lines.length - 1].d);
    replayClock.value = { day: from, from, to, startYear: h.startYear, playing: true, speed: DEFAULT_SPEED };
    toMap(x, true);
    run();
  } catch (e) {
    console.error(e);
    replayError.value = String((e as Error)?.message ?? e);
    stopReplay(false);
  } finally {
    replayLoading.value = false;
  }
}

export function stopReplay(clearError = true) {
  if (p?.raf) cancelAnimationFrame(p.raf);
  p = null;
  replay.value = null;
  replayClock.value = null;
  if (clearError) replayError.value = null;
}

/** Plays or pauses the replay; played at its end, it begins again. */
export function toggleReplay() {
  const c = replayClock.value;
  if (!p || !c) return;
  if (c.playing) {
    replayClock.value = { ...c, playing: false };
    toMap(p, true);
    return;
  }
  if (c.day >= c.to) {
    seekTo(p, c.from);
    replayClock.value = { ...c, day: c.from, playing: true };
    toMap(p, true);
  } else replayClock.value = { ...c, playing: true };
  run();
}

/** Goes to a day of the history (the timeline). */
export function seekReplay(day: number) {
  const c = replayClock.value;
  if (!p || !c) return;
  const d = Math.max(c.from, Math.min(c.to, day));
  seekTo(p, Math.floor(d));
  replayClock.value = { ...c, day: d };
  toMap(p, true);
}

/** Sets the speed of the replay (1 … REPLAY_SPEEDS.length). */
export function replaySpeed(speed: number) {
  const c = replayClock.value;
  if (!c) return;
  replayClock.value = { ...c, speed: Math.max(1, Math.min(REPLAY_SPEEDS.length, speed)) };
}
