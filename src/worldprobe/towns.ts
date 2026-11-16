// The people of the towns and villages the world graphic builds, by the start year of the world. For a year with its own towns
// (public/data/towns_<year>.json, tools/history/1291/towns.py) they come from that file, the same numbers the
// simulation's places hold (src/sim/scale.ts: both count at 1:100), and the people the simulation counts on the land
// outside the towns live in the villages and small towns (public/data/villages_<year>.json,
// tools/worldprobe/build_villages.py); for 1356 from the 30 cities after Chandler
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

/** a villages file: the people of the time on the land that live in each place of the gazetteer (0: none do) */
export interface VillagesJson { year: number; people: number[] }

/**
 * The people of the places of a towns file, by the place's index in the gazetteer, with the people of the land who
 * live there where a villages file is given; the places neither knows are left out.
 */
export function inhabitantsOf(towns: TownsJson, villages?: VillagesJson): Map<number, number> {
  const m = new Map<number, number>();
  towns.people.forEach((n, k) => { const all = (n ?? 0) + (villages?.people[k] ?? 0); if (all > 0) m.set(k, all); });
  return m;
}

const loaded = new Map<number, Promise<Map<number, number>>>();
/** the people of the towns and villages of a start year (once per year): its towns and villages files, or the towns of 1356 where it has none */
export function loadInhabitants(base: string, year = 1356): Promise<Map<number, number>> {
  let p = loaded.get(year);
  if (!p) {
    p = year === 1356 ? Promise.resolve(inhabitants1356()) : Promise.all([fetch(`${base}data/towns_${year}.json`), fetch(`${base}data/villages_${year}.json`)]).then(async ([towns, villages]) => {
      if (!towns.ok) { console.warn(`towns of ${year}: HTTP ${towns.status}, the towns of 1356 stand in`); return inhabitants1356(); }
      if (!villages.ok) console.warn(`villages of ${year}: HTTP ${villages.status}, the villages are built as their size says`);
      return inhabitantsOf(await towns.json() as TownsJson, villages.ok ? await villages.json() as VillagesJson : undefined);
    });
    loaded.set(year, p);
  }
  return p;
}
