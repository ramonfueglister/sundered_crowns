// The parcels of the towns, by the start year of the world: what the simulation's land register holds for every
// town in a new world of the year (public/data/lots_<year>.json, tools/sim/write_lots.ts). Where a year has the
// file, the houses of a town stand on the parcels of its families (settle.ts); without it they are packed as before.
import type { Parcels } from './settle';

/** a hamlet of a town in the register: its middle east and south of the town's centre (metres at the scale of the houses), and the parcels of its farmsteads round that middle */
export interface HamletParcels extends Parcels { east: number; south: number; persons?: readonly number[] }
/** the parcels of a town, and those of its hamlets where the register holds them */
export interface PlaceParcels extends Parcels { hamlets?: readonly HamletParcels[] }

/** the file: per town its site (index of the gazetteer) and its parcels */
export interface LotsJson { year: number; towns: ({ site: number } & PlaceParcels)[] }
export type TownParcels = ReadonlyMap<number, PlaceParcels>;

export const parcelsOf = (j: LotsJson): Map<number, PlaceParcels> => new Map(j.towns.map((t) => [t.site, { w: t.w, d: t.d, x: t.x, z: t.z, front: t.front, hamlets: t.hamlets }]));

const loaded = new Map<number, Promise<Map<number, PlaceParcels> | null>>();
/** the parcels of the towns of a start year (once per year); null where the year has no file */
export function loadParcels(base: string, year: number): Promise<Map<number, PlaceParcels> | null> {
  let p = loaded.get(year);
  if (!p) {
    p = fetch(`${base}data/lots_${year}.json`).then(async (r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? parcelsOf(await r.json() as LotsJson) : null)).catch(() => null);
    loaded.set(year, p);
  }
  return p;
}
