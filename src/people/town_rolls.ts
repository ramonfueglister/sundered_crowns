// The persons of the great cities as they are today (people feature 12). A piece's figures show the persons of their
// towns as the world server listed them when the piece was built (src/figures/people.ts), which is long ago where the
// piece was kept on disk: a day of the world passes in four minutes, a year in a day. Once a day of the world the
// lists of the places whose figures are on the stage are asked for again. Who is no longer listed (dead, or moved
// away) leaves the stage at once, and a mother in childbed stays at home (src/figures/schedule.ts); the pieces whose
// towns gained or lost persons (the young who come to the age the figures are drawn from, the dead, a ruler who
// arrives or leaves) build their figures again from the new lists (src/worldprobe/pieces.ts). Main thread only.
import {
  PLACES_PER_REQUEST,
  type PlacePeopleList,
  httpOf,
  listsVersion,
  rollsHold,
  setPlacePeople,
} from '../figures/people';
import { placesOnStage } from '../figures/stage';
import { world } from '../net/client';
import type { WorldView } from '../worldprobe/view';

/** The pieces on the stage are looked at this often, in milliseconds. */
const EVERY = 1000;
/**
 * OWN RULE, a drawing value: the lists are asked for at most once a minute (in milliseconds), so that a world whose
 * days pass in a fraction of a second (SECONDS_PER_DAY=0.05, server/main.ts) does not have the pieces of its towns
 * built again every second.
 */
const LEAST = 60_000;

/** Asks the world server at `url` for the persons of `places` (GET /people, src/net/people.ts), takes their lists
 *  for the towns of the start year `year`, and returns them. */
export async function askPersons(url: string, places: readonly number[], year: number): Promise<PlacePeopleList[]> {
  const parts: number[][] = [];
  for (let k = 0; k < places.length; k += PLACES_PER_REQUEST) parts.push(places.slice(k, k + PLACES_PER_REQUEST));
  const lists = await Promise.all(
    parts.map(async (part) => {
      const r = await fetch(`${httpOf(url)}/people?places=${part.join(',')}`);
      return r.ok ? ((await r.json()) as PlacePeopleList[]) : [];
    }),
  );
  for (const list of lists.flat()) setPlacePeople(list, year);
  return lists.flat();
}

/** Keeps the figures on the stage of `view` showing the persons of their towns as the world server at `url` lists
 *  them on the world's day (nothing without a server). Returns the way to stop. */
export function followTownRolls(
  view: Pick<WorldView, 'tellPersons' | 'renewFigures'>,
  url: string | undefined,
): () => void {
  if (!url) return () => {};
  let day = Number.NaN,
    at = Number.NEGATIVE_INFINITY,
    asking = false;
  const timer = setInterval(() => {
    const w = world.value;
    if (w && !asking && w.day !== day && performance.now() - at >= LEAST) {
      const places = placesOnStage();
      if (places.length) {
        day = w.day;
        at = performance.now();
        asking = true;
        // (the workers have the lists before they are asked to build with them)
        askPersons(url, places, w.startYear)
          .then(
            (lists) => view.tellPersons(lists),
            () => undefined,
          )
          .finally(() => {
            asking = false;
          });
      }
    }
    // (also the pieces that came from disk since, built with the persons of long ago)
    view.renewFigures((f) => !rollsHold(f.rolls), listsVersion());
  }, EVERY);
  return () => clearInterval(timer);
}
