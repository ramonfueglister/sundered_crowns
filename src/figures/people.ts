// The persons of the cities of the start year (src/sim/systems/people.ts) as the figures need them: who lives in which
// town of the world graphic, female or male, how old. Runs in the world's web workers: the lists are fetched once per
// worker from the world server (GET /people?places=…, src/net/people.ts), a few hundred places a request, before the
// first piece is built. Without a server
// (a preview, the cloud) nothing is fetched and the towns keep their anonymous figures.
import { hash2 } from '../lookprobe/batch';
import { citiesOf } from '../sim/content/cities';

/** A person as a figure shows them. */
export interface TownPerson { id: number; female: boolean; age: number }
/** What the server sends for a place (src/net/people.ts PlacePeople). */
export interface PlacePeopleList { place: number; day: number; id: number[]; born: number[]; sex: number[] }

/** Places per request: the server's MAX_PLACES_PER_REQUEST (src/net/people.ts, not imported: it would bring the
 *  simulation into the workers; tests/people-net.test.ts checks they agree). */
export const PLACES_PER_REQUEST = 200;

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
  const places = [...new Set(citiesOf(year).map((c) => c.place))], parts: number[][] = [];
  for (let k = 0; k < places.length; k += PLACES_PER_REQUEST) parts.push(places.slice(k, k + PLACES_PER_REQUEST));
  loading ??= Promise.all(parts.map(async (part) => {
    const r = await fetch(`${httpOf(url)}/people?places=${part.join(',')}`);
    if (r.ok) for (const list of (await r.json()) as PlacePeopleList[]) setPlacePeople(list, year);
  })).then(() => undefined, () => undefined);
  return loading;
}
