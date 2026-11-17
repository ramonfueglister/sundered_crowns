// The parcels of the towns, by the start year of the world: what the simulation's land register holds for every
// town in a new world of the year (public/data/lots_<year>.json, tools/sim/write_lots.ts). Where a year has the
// file, the houses of a town stand on the parcels of its families (settle.ts); without it they are packed as before.
import type { Parcels } from './settle';

/** the file: per town its site (index of the gazetteer) and its parcels */
export interface LotsJson { year: number; towns: ({ site: number } & Parcels)[] }
export type TownParcels = ReadonlyMap<number, Parcels>;

export const parcelsOf = (j: LotsJson): Map<number, Parcels> => new Map(j.towns.map((t) => [t.site, { w: t.w, d: t.d, x: t.x, z: t.z, front: t.front }]));

const loaded = new Map<number, Promise<Map<number, Parcels> | null>>();
/** the parcels of the towns of a start year (once per year); null where the year has no file */
export function loadParcels(base: string, year: number): Promise<Map<number, Parcels> | null> {
  let p = loaded.get(year);
  if (!p) {
    p = fetch(`${base}data/lots_${year}.json`).then(async (r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? parcelsOf(await r.json() as LotsJson) : null)).catch(() => null);
    loaded.set(year, p);
  }
  return p;
}
