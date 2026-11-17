// The replay of the borders (Zeitraffer): the chronicle of borders of 1291 to 1848 (public/data/borders_1291.json)
// played on the map in about a minute, as the replay at the end of an EU4/EU5 game. Only a view: the world and its
// clock go on as they are, and the map shows the world again when the replay ends or is stopped.
import { signal } from '@preact/signals';
import type { BordersJson } from '../sim/content/borders';
import { colorOfKey } from '../sim/systems/borders';

interface SetupLite { year: number; owner: (number | null)[]; states: { id: string; color: string; short?: { en: string; de: string }; name: { en: string; de: string } }[] }

export interface ReplayFrame {
  /** the owner of every place on that day, as the world's owners (realm ids) */
  owner: Int16Array;
  /** per realm id: colour and the name on the map */
  colors: number[];
  names: { en: string; de: string }[];
  /** the year shown */
  year: number;
}

export const replay = signal<ReplayFrame | null>(null);

/** years per second of real time, and frames per second (each frame repaints the realms of the map) */
const YEARS_PER_SECOND = 9, FRAMES_PER_SECOND = 4;
let timer: ReturnType<typeof setInterval> | null = null;

export function stopReplay() {
  if (timer) clearInterval(timer);
  timer = null;
  replay.value = null;
}

export async function startReplay(year = 1291) {
  stopReplay();
  const base = import.meta.env.BASE_URL;
  const [setup, borders] = await Promise.all([
    fetch(`${base}data/setup_${year}.json`).then((r) => r.json() as Promise<SetupLite>),
    fetch(`${base}data/borders_${year}.json`).then((r) => r.json() as Promise<BordersJson>),
  ]);
  const id = new Map(setup.states.map((s, k) => [s.id, k]));
  const colors = setup.states.map((s) => parseInt(s.color.slice(1), 16));
  const names = setup.states.map((s) => s.short ?? s.name);
  const info = new Map(borders.realms.map((r) => [r.id, r]));
  const owner = Int16Array.from(setup.owner, (o) => (typeof o === 'number' && o >= 0 ? o : -1));
  const events = borders.events; // in the order of their dates
  const realmOf = (key: string) => {
    let k = id.get(key);
    if (k === undefined) {
      k = colors.length; id.set(key, k);
      const short = info.get(key)?.short ?? info.get(key)?.name ?? key;
      colors.push(colorOfKey(key)); names.push({ en: short, de: short });
    }
    return k;
  };
  let i = 0, y = setup.year;
  const end = Number(borders.until.slice(0, 4)), t0 = performance.now();
  const frame = () => { // by the clock: where a slow map keeps up less often, the years go on and frames are skipped
    y = Math.min(end, setup.year + ((performance.now() - t0) / 1000) * YEARS_PER_SECOND);
    const until = `${String(Math.floor(y)).padStart(4, '0')}-12-31`;
    for (; i < events.length && events[i].date <= until; i++) {
      const e = events[i];
      if (e.kind === 'name') { const k = realmOf(e.realm); names[k] = { en: e.short, de: e.short }; continue; }
      const k = realmOf(e.to);
      for (const p of e.places) if (p < owner.length) owner[p] = k;
    }
    replay.value = { owner: owner.slice(), colors: colors.slice(), names: names.slice(), year: Math.floor(y) };
    if (y >= end && timer) { clearInterval(timer); timer = null; } // the last frame stays until the replay is closed
  };
  replay.value = { owner: owner.slice(), colors: colors.slice(), names: names.slice(), year: setup.year };
  timer = setInterval(frame, 1000 / FRAMES_PER_SECOND);
}
