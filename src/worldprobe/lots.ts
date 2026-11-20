// The parcels of the towns, by the start year of the world: what the simulation's land register holds for every
// town in a new world of the year (public/data/lots_<year>.json, tools/sim/write_lots.ts). Where a year has the
// file, the houses of a town stand on the parcels of its families (settle.ts); without it they are packed as before.
// Since settlement feature 4 the file also holds the furlongs of the hamlets' fields: the fields round the towns are
// those of the register (settle.ts, far.ts), with the crop each course carries in the year.
import type { Parcels } from './settle';
import type { AloneRow, LandmarkRow } from './landmarks';
import { CROP, GEWANN, cropOf, lotAt, type Crop } from '../sim/settlement/fields';

/** a hamlet of a town in the register: its middle east and south of the town's centre (metres at the scale of the houses), the parcels of its farmsteads round that middle, and its farmsteads in the order of their strips from the west */
export interface HamletParcels extends Parcels { east: number; south: number; persons?: readonly number[]; strips?: readonly number[] }
/** the furlongs of a town's fields: per furlong its hamlet (index in `hamlets`), its middle and its depth (metres from the town's centre, at the scale of the houses), its course, and the farmstead that holds it whole (index among its hamlet's farmsteads, −1 in the open field) */
export interface TownFields { hamlet: readonly number[]; x: readonly number[]; z: readonly number[]; d: readonly number[]; zelge: readonly number[]; farm: readonly number[] }
/** the parcels of a town, those of its hamlets where the register holds them, and the furlongs of their fields (`fieldW` metres wide, tilled in `courses` courses) */
export interface PlaceParcels extends Parcels { hamlets?: readonly HamletParcels[]; fields?: TownFields; fieldW?: number; courses?: number; /** the world block (finest step) of the town's centre the furlongs lie from, as the register's survey had it */ at?: readonly [number, number]; /** its landmarks (settlement feature 5; landmarks.ts LandmarkRow); none in a file from before them */ landmarks?: readonly LandmarkRow[]; /** the start year of the register */ year?: number }

/** the file: per town its site (index of the gazetteer) and its parcels */
export interface LotsJson { year: number; towns: ({ site: number } & PlaceParcels)[]; alone?: AloneRow[] }
export type TownParcels = ReadonlyMap<number, PlaceParcels> & { year?: number; /** the landmarks that stand alone */ alone?: readonly AloneRow[] };

export const parcelsOf = (j: LotsJson): Map<number, PlaceParcels> & { year?: number; alone?: readonly AloneRow[] } => Object.assign(new Map(j.towns.map((t) => [t.site, { w: t.w, d: t.d, x: t.x, z: t.z, front: t.front, streets: t.streets, street: t.street, hamlets: t.hamlets, fields: t.fields, fieldW: t.fieldW, courses: t.courses, at: t.at, ground: t.ground, landmarks: t.landmarks, year: j.year }])), { year: j.year, alone: j.alone });

const loaded = new Map<number, Promise<(Map<number, PlaceParcels> & { year?: number; alone?: readonly AloneRow[] }) | null>>();
/** the parcels of the towns of a start year (once per year); null where the year has no file */
export function loadParcels(base: string, year: number): Promise<(Map<number, PlaceParcels> & { year?: number; alone?: readonly AloneRow[] }) | null> {
  let p = loaded.get(year);
  if (!p) {
    p = fetch(`${base}data/lots_${year}.json`).then(async (r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? parcelsOf(await r.json() as LotsJson) : null)).catch(() => null);
    loaded.set(year, p);
  }
  return p;
}

/** A furlong of the register as the world graphic shows it: what it carries this year, how many rows of blocks deep it
 *  is from its north edge (a shortened furlong is shorter at the south), and in how many strips it is shared. */
export interface FieldShown { crop: Crop; rows: number; strips: number }
/** the key of a field lot of the world graphic's grid */
export const lotKey = (lx: number, lz: number) => (lx + 32768) * 65536 + lz + 32768;

/**
 * The furlongs of the register by the field lot of the world graphic's grid they lie on (lotKey). `centre` gives the
 * world block (finest step) of a town's centre, null for a town that is not near: the furlongs of the register lie
 * from it as its parcels do (metres at the scale of the houses, a block is 2 m); where the file names the block the
 * register's survey had (`at`), from that one. `year`: the year whose crops show.
 */
export function fieldsByLot(parcels: TownParcels, year: number, centre: (site: number) => [number, number] | null): Map<number, FieldShown> {
  const out = new Map<number, FieldShown>();
  for (const [site, t] of parcels) {
    const f = t.fields;
    if (!f?.x.length) continue;
    const near = centre(site);
    if (!near) continue;
    const c = t.at ?? near;
    const w = t.fieldW ?? GEWANN.w * 2;
    for (let k = 0; k < f.x.length; k++) {
      const x0 = c[0] + Math.round((f.x[k] - w / 2) / 2), z0 = c[1] + Math.round((f.z[k] - f.d[k] / 2) / 2), lot = lotAt(x0, z0);
      if (!lot) continue;
      const strips = f.farm[k] < 0 ? Math.max(1, t.hamlets?.[f.hamlet[k]]?.x.length ?? 1) : 1;
      out.set(lotKey(...lot), { crop: cropOf(f.zelge[k], t.courses ?? 3, year), rows: Math.max(1, Math.min(GEWANN.d, Math.round(f.d[k] / 2))), strips });
    }
  }
  return out;
}
export { CROP };
