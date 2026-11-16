// The people of the towns the world graphic builds, by the start year of the world. For a year with its own towns
// (public/data/towns_<year>.json, tools/history/1291/towns.py) they come from that file, the same numbers the
// simulation's places hold (src/sim/scale.ts: both count at 1:100); for 1356 from the 30 cities after Chandler
// (tools/people/build_cities.py), and the gazetteer's pop1356 for the rest. settle.ts divides by PEOPLE_PER_PERSON.
import cities from '../sim/content/cities_1356.json';

/** a towns file: people of the time per place of the gazetteer (null: unknown, the town builds as its size says) */
export interface TownsJson { year: number; people: (number | null)[]; place: number[] }

/** the people of the great cities of 1356, by the place's index in the gazetteer */
export function inhabitants1356(): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of cities.cities) m.set(c.site, (m.get(c.site) ?? 0) + c.people);
  return m;
}

/** the people of the towns of a towns file, by the place's index in the gazetteer; the unknown ones are left out */
export function inhabitantsOf(towns: TownsJson): Map<number, number> {
  const m = new Map<number, number>();
  towns.people.forEach((n, k) => { if (n !== null && n > 0) m.set(k, n); });
  return m;
}

const loaded = new Map<number, Promise<Map<number, number>>>();
/** the people of the towns of a start year (once per year): its towns file, or those of 1356 where it has none */
export function loadInhabitants(base: string, year = 1356): Promise<Map<number, number>> {
  let p = loaded.get(year);
  if (!p) {
    p = year === 1356 ? Promise.resolve(inhabitants1356()) : fetch(`${base}data/towns_${year}.json`).then(async (r) => {
      if (!r.ok) { console.warn(`towns of ${year}: HTTP ${r.status}, the towns of 1356 stand in`); return inhabitants1356(); }
      return inhabitantsOf(await r.json() as TownsJson);
    });
    loaded.set(year, p);
  }
  return p;
}
