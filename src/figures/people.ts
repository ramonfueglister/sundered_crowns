// The persons of the 30 great cities (src/sim/systems/people.ts) as the figures need them: who lives in which town of
// the world graphic, female or male, how old. Runs in the world's web workers: the list is fetched once per worker
// from the world server (GET /people/<place>, src/net/people.ts) before the first piece is built. Without a server
// (a preview, the cloud) nothing is fetched and the towns keep their anonymous figures.
import { hash2 } from '../lookprobe/batch';
import { citiesOf } from '../sim/content/cities';

/** A person as a figure shows them. */
export interface TownPerson { id: number; female: boolean; age: number }
/** What the server sends for a place (src/net/people.ts PlacePeople). */
export interface PlacePeopleList { place: number; day: number; id: number[]; born: number[]; sex: number[] }

/** Persons are drawn from this age on: the kit has no children yet (figures thread, 15 November 2026). */
export const FIGURE_FROM_AGE = 14;

const towns = new Map<number, TownPerson[]>();
let loading: Promise<void> | null = null;

/** The world server's http(s) address from its WebSocket address (the game's VITE_WORLD_URL). */
export const httpOf = (url: string) => url.replace(/^ws(s?):/, 'http$1:').replace(/\/+$/, '');

/** The persons who walk in a town of the world graphic (by gazetteer index), or none. */
export const townPeople = (site: number): readonly TownPerson[] | undefined => towns.get(site);

/**
 * Takes the persons of a place. Where several cities lie in one place (Texcoco and Tenayuca), each person walks in
 * one of their towns, drawn by a hash of the id in proportion to the cities' people.
 */
export function setPlacePeople(list: PlacePeopleList, year = 1356): void {
  const here = citiesOf(year).filter((c) => c.place === list.place);
  if (!here.length) return;
  const total = here.reduce((t, c) => t + c.people, 0);
  for (const c of here) towns.set(c.site, []);
  list.id.forEach((id, k) => {
    const age = (list.day - list.born[k]) / 365.25;
    if (age < FIGURE_FROM_AGE) return;
    let u = hash2(id, list.place, 911) * total, c = here[0];
    for (const h of here) { c = h; u -= h.people; if (u < 0) break; }
    towns.get(c.site)!.push({ id, female: list.sex[k] === 0, age });
  });
}

/** Fetches the persons of every city of the world's start year (src/sim/content/cities.ts) once; resolves when done or
 *  when there is no server to ask. */
export function loadTownPeople(url: string | undefined = (import.meta as { env?: Record<string, string> }).env?.VITE_WORLD_URL, year = 1356): Promise<void> {
  if (!url) return Promise.resolve();
  loading ??= Promise.all([...new Set(citiesOf(year).map((c) => c.place))].map(async (place) => {
    const r = await fetch(`${httpOf(url)}/people/${place}`);
    if (r.ok) setPlacePeople(await r.json(), year);
  })).then(() => undefined, () => undefined);
  return loading;
}
