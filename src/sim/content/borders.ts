// The chronicle of borders: which places went from which realm to which on which day, from the start year to 1848
// (public/data/borders_<year>.json, written by tools/history/borders/build.py from Cliopatria, the Wikipedia timelines
// of geopolitical changes and the ruler lists). Static data: the world plays it day by day (src/sim/systems/borders.ts).
// Ramon, 16 November 2026: real history as a replay ("dieses schöne gefühl von eu4 eu5 wenn man vor dem replay sitzt
// und es verändert sich die karte"); a model of border change from papers comes later and is checked against it.
import { dayOf } from './chronicle';

export interface BordersJson {
  year: number;
  until: string;
  /** realms that are not in the setup of the start year: they come into the world with their first places */
  realms: { id: string; name: string; wikidata: string; wikipedia: string; first: number }[];
  /** in the order of their dates; `places` are place ids of the map */
  events: {
    date: string;
    /** day, month or year: the date as a source gives it; window: no source gives it, the date is the middle of the
     *  years `window` in which the maps show the change */
    precision: 'day' | 'month' | 'year' | 'window';
    window?: [string, string];
    from: string | null;
    to: string;
    places: number[];
    kind: 'transfer' | 'merge';
    source: string;
  }[];
}

export interface BorderEvent { day: number; to: string; places: Int32Array }

export interface Borders {
  year: number;
  /** the realms that come in on the way: key → name and Wikidata id */
  realms: ReadonlyMap<string, { name: string; wikidata: string }>;
  /** sorted by day; on one day in the order of the file */
  events: readonly BorderEvent[];
}

/** Turns the chronicle of borders into the days on which places change hands. A date without a day is the middle of
 *  its month or year, as for the rulers (dayOf). */
export function compileBorders(j: BordersJson): Borders {
  const events = j.events.map((e, i) => ({ i, day: dayOf(e.date, j.year)!, to: e.to, places: Int32Array.from(e.places) }));
  events.sort((a, b) => a.day - b.day || a.i - b.i);
  return {
    year: j.year,
    realms: new Map(j.realms.map((r) => [r.id, { name: r.name, wikidata: r.wikidata }])),
    events: events.map(({ day, to, places }) => ({ day, to, places })),
  };
}

/** The index of the first event on or after `day`. */
export function firstBorderEventOn(b: Borders, day: number): number {
  let lo = 0, hi = b.events.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (b.events[m].day < day) lo = m + 1; else hi = m; }
  return lo;
}
