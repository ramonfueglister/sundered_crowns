// The farming families of the towns and the land they till, by the start year of the world: for every town the
// world graphic builds, the persons that live inside it, the persons and families of its hamlets before the walls
// and the land under its plough (public/data/hamletland_<year>.json, tools/worldprobe/build_hamletland.py, from the
// simulation's own persons). The fields reach as far from the town as its arable takes of the open ground there. Where a year has the file, the world shows only what the simulation holds: the towns
// with persons, their hamlets, and the fields round them (world.ts).

/** the file: per town (index of the gazetteer) persons of the world, and km² under the plough */
interface HamletLandJson {
  year: number;
  town: number[];
  inside: number[];
  hamlet: number[];
  families: number[];
  km2: number[];
  reach_km: number[];
}
/** a town's persons inside it, the persons and families of its hamlets, the km² its farmers till and how many km from the town its fields reach */
interface HamletLand {
  inside: number;
  hamlet: number;
  families: number;
  km2: number;
  reachKm: number;
}
export type HamletLands = ReadonlyMap<number, HamletLand>;

/** a hamlet holds about this many families */
export const HAMLET_FAMILIES = 10;
/** the hamlets of a town: as many as hold its farming families */
export const hamletsOf = (families: number) => (families > 0 ? Math.max(1, Math.round(families / HAMLET_FAMILIES)) : 0);
/** the angle between one hamlet and the next round their town: the golden angle, so that they never line up */
export const HAMLET_TURN = Math.PI * (3 - Math.sqrt(5));
/**
 * Where the `k`th of `n` hamlets lies: its distance from the town between `inner` and `outer`, so that every ring
 * of the ground between holds as many hamlets as it has ground.
 */
export const hamletAt = (k: number, n: number, inner: number, outer: number) =>
  Math.sqrt(inner * inner + ((k + 0.5) / n) * (outer * outer - inner * inner));

export const hamletLandsOf = (j: HamletLandJson): Map<number, HamletLand> =>
  new Map(
    j.town.map((t, k) => [
      t,
      { inside: j.inside[k], hamlet: j.hamlet[k], families: j.families[k], km2: j.km2[k], reachKm: j.reach_km[k] },
    ]),
  );

const loaded = new Map<number, Promise<Map<number, HamletLand> | null>>();
/** the hamlets and fields of the towns of a start year (once per year); null where the year has no file */
export function loadHamletLands(base: string, year: number): Promise<Map<number, HamletLand> | null> {
  let p = loaded.get(year);
  if (!p) {
    p = fetch(`${base}data/hamletland_${year}.json`)
      .then(async (r) =>
        r.ok && (r.headers.get('content-type') ?? '').includes('json')
          ? hamletLandsOf((await r.json()) as HamletLandJson)
          : null,
      )
      .catch(() => null);
    loaded.set(year, p);
  }
  return p;
}
