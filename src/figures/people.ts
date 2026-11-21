// The persons of the cities of the start year (src/sim/systems/people.ts) as the figures need them: who lives in which
// town of the world graphic, female or male, how old. Runs in the world's web workers: the lists are fetched once per
// worker from the world server (GET /people?places=…, src/net/people.ts), a few hundred places a request, before the
// first piece is built. Without a server
// (a preview, the cloud) nothing is fetched and the towns keep their anonymous figures.
import { hash2 } from '../lookprobe/batch';
import { citiesOf } from '../sim/content/cities';

/** A person as a figure shows them. */
export interface TownPerson {
  id: number;
  female: boolean;
  age: number;
  /** a ruler: the colour of the first realm they hold (0xRRGGBB); they always stand in the street of their town */
  ruler?: number;
  /** what the plan of the day needs (people feature 12, src/sim/people/day_plan.ts): the day of birth, the place, and
   *  the part and the calendar of the days of work (absent from an older server: the figure walks at every hour) */
  born: number;
  place: number;
  who?: number;
  calendar?: number;
  /** a mother in childbed on the day of the list: the day her child was born (src/sim/people/absence.ts) */
  child?: number;
}
/** What the server sends for a place (src/net/people.ts PlacePeople). */
export interface PlacePeopleList {
  place: number;
  day: number;
  id: number[];
  born: number[];
  sex: number[];
  rulers?: { uid: number; color: number }[];
  who?: number[];
  calendar?: number[];
  seed?: number;
  childbed?: { uid: number; born: number }[];
}

/** Places per request: the server's MAX_PLACES_PER_REQUEST (src/net/people.ts, not imported: it would bring the
 *  simulation into the workers; tests/people-net.test.ts checks they agree). */
export const PLACES_PER_REQUEST = 200;

/** Persons are drawn from this age on: the kit has no children yet (figures thread, 15 November 2026). */
export const FIGURE_FROM_AGE = 14;

const towns = new Map<number, TownPerson[]>();
/** the world's seed, which the days of sickness are drawn from (src/sim/people/absence.ts); 0 before a list came */
let seed = 0;
/** The world's seed as the lists of the persons gave it. */
export const peopleSeed = () => seed;
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
  const crowned = new Map((list.rulers ?? []).map((r) => [r.uid, r.color]));
  const childbed = new Map((list.childbed ?? []).map((c) => [c.uid, c.born]));
  seed = list.seed ?? seed;
  list.id.forEach((id, k) => {
    const age = (list.day - list.born[k]) / 365.25,
      ruler = crowned.get(id),
      child = childbed.get(id);
    // a ruler is shown at any age (a child king too)
    if (age < FIGURE_FROM_AGE && ruler === undefined) return;
    let u = hash2(id, list.place, 911) * total,
      c = here[0];
    for (const h of here) {
      c = h;
      u -= h.people;
      if (u < 0) break;
    }
    towns.get(c.site)!.push({
      id,
      female: list.sex[k] === 0,
      age,
      born: list.born[k],
      place: list.place,
      ...(ruler === undefined ? {} : { ruler }),
      ...(list.who && list.calendar ? { who: list.who[k], calendar: list.calendar[k] } : {}),
      ...(child === undefined ? {} : { child }),
    });
  });
}

/** Fetches the persons of every city of the world's start year (src/sim/content/cities.ts) once; resolves when done or
 *  when there is no server to ask. */
export function loadTownPeople(
  url: string | undefined = (import.meta as { env?: Record<string, string> }).env?.VITE_WORLD_URL,
  year = 1356,
): Promise<void> {
  if (!url) return Promise.resolve();
  const places = [...new Set(citiesOf(year).map((c) => c.place))],
    parts: number[][] = [];
  for (let k = 0; k < places.length; k += PLACES_PER_REQUEST) parts.push(places.slice(k, k + PLACES_PER_REQUEST));
  loading ??= Promise.all(
    parts.map(async (part) => {
      const r = await fetch(`${httpOf(url)}/people?places=${part.join(',')}`);
      if (r.ok) for (const list of (await r.json()) as PlacePeopleList[]) setPlacePeople(list, year);
    }),
  ).then(
    () => undefined,
    () => undefined,
  );
  return loading;
}
