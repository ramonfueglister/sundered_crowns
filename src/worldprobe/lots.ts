// The parcels of the towns, by the start year of the world: what the simulation's land register holds for every
// town in a new world of the year (public/data/lots_<year>.json, tools/sim/write_lots.ts). Where a year has the
// file, the houses of a town stand on the parcels of its families (settle.ts); without it they are packed as before.
// Since settlement feature 4 the file also holds the furlongs of the hamlets' fields: the fields round the towns are
// those of the register (settle.ts, far.ts), with the crop each course carries in the year.
import type { AloneRow, LandmarkRow } from './landmarks';
import { CROP, GEWANN, cropOf, lotAt, type Crop } from '../sim/settlement/fields';
import { GROUND, type GroundBlocks, groundBlocks } from '../sim/settlement/plan_ground';
import { planOf } from '../sim/content/town_plans';
import { N, idx } from '../lookprobe/layout';
import { Water } from './region';

/**
 * The parcels of a town as the simulation's land register holds them (src/sim/systems/lots.ts): all `w` metres along
 * the street and `d` metres deep, their middles `x` metres east and `z` metres south of the town's centre, the
 * street on the side `front` (0 north, 1 east, 2 south, 3 west). Metres at the scale of the houses.
 */
export interface Parcels { w: number; d: number; x: readonly number[]; z: readonly number[]; front: readonly number[]; /** the streets of the town (settlement feature 3): straight pieces [x0, z0, x1, z1, kind] on their middle line, the market (kind 4) as its corners; metres as the parcels */ streets?: readonly (readonly number[])[]; /** how wide every street is, metres */ street?: number; /** a town on a real plan that draws its ground: the metres of a radius of the plan and how far its streets reach from their middle lines (src/net/lots.ts) */ ground?: { radius: number; half: number }; /** the pieces of its wall (settlement feature 6): [x0, z0, x1, z1, kind], kind 0 wall, 1 gate, 2 postern (src/sim/settlement/walls.ts WALL_PIECE); none in a file from before them or for a town without a wall */ walls?: readonly (readonly number[])[]; /** its bridges (settlement feature 7): [x0, z0, x1, z1, kind, houses], kind 0 timber, 1 stone (src/sim/settlement/bridges.ts BRIDGE_KIND), houses 1 where a source puts houses on it; none in a file from before them */ bridges?: readonly (readonly number[])[]; }
/** a hamlet of a town in the register: its middle east and south of the town's centre (metres at the scale of the houses), the parcels of its farmsteads round that middle, and its farmsteads in the order of their strips from the west */
export interface HamletParcels extends Parcels { east: number; south: number; persons?: readonly number[]; strips?: readonly number[] }
/** the furlongs of a town's fields: per furlong its hamlet (index in `hamlets`), its middle and its depth (metres from the town's centre, at the scale of the houses), its course, and the farmstead that holds it whole (index among its hamlet's farmsteads, −1 in the open field) */
export interface TownFields { hamlet: readonly number[]; x: readonly number[]; z: readonly number[]; d: readonly number[]; zelge: readonly number[]; farm: readonly number[] }
/** the parcels of a town, those of its hamlets where the register holds them, and the furlongs of their fields (`fieldW` metres wide, tilled in `courses` courses) */
export interface PlaceParcels extends Parcels { hamlets?: readonly HamletParcels[]; fields?: TownFields; fieldW?: number; courses?: number; /** the world block (finest step) of the town's centre the furlongs lie from, as the register's survey had it */ at?: readonly [number, number]; /** its landmarks (settlement feature 5; landmarks.ts LandmarkRow); none in a file from before them */ landmarks?: readonly LandmarkRow[]; /** the start year of the register */ year?: number }

/** the file: per town its site (index of the gazetteer) and its parcels */
export interface LotsJson { year: number; towns: ({ site: number } & PlaceParcels)[]; alone?: AloneRow[] }
export type TownParcels = ReadonlyMap<number, PlaceParcels> & { year?: number; /** the landmarks that stand alone */ alone?: readonly AloneRow[] };

export const parcelsOf = (j: LotsJson): Map<number, PlaceParcels> & { year?: number; alone?: readonly AloneRow[] } => Object.assign(new Map(j.towns.map((t) => [t.site, { w: t.w, d: t.d, x: t.x, z: t.z, front: t.front, streets: t.streets, street: t.street, hamlets: t.hamlets, fields: t.fields, fieldW: t.fieldW, courses: t.courses, at: t.at, ground: t.ground, landmarks: t.landmarks, walls: t.walls, bridges: t.bridges, year: j.year }])), { year: j.year, alone: j.alone });

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
export interface FieldShown { crop: Crop; rows: number; strips: number; /** the town the furlong belongs to (gazetteer index) */ site: number; /** in how many courses its town tills its fields */ courses: number }
/** the key of a field lot of the world graphic's grid */
export const lotKey = (lx: number, lz: number) => (lx + 32768) * 65536 + lz + 32768;

/**
 * The furlongs of the register by the field lot of the world graphic's grid they lie on (lotKey). `centre` gives the
 * world block (finest step) of a town's centre, null for a town that is not near: the furlongs of the register lie
 * from it as its parcels do (metres at the scale of the houses, a block is 2 m); where the file names the block the
 * register's survey had (`at`), from that one. `year`: the year whose crops show. With them, by town, the field lots
 * of its furlongs as pairs (lx, lz) in the register's order: the same on every piece the town is near, so that the
 * farmers of the town are given the same furlongs everywhere (src/figures/farmers.ts).
 */
export function fieldsByLot(parcels: TownParcels, year: number, centre: (site: number) => [number, number] | null): Map<number, FieldShown> & { towns: Map<number, number[]> } {
  const out = Object.assign(new Map<number, FieldShown>(), { towns: new Map<number, number[]>() });
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
      out.set(lotKey(...lot), { crop: cropOf(f.zelge[k], t.courses ?? 3, year), rows: Math.max(1, Math.min(GEWANN.d, Math.round(f.d[k] / 2))), strips, site, courses: t.courses ?? 3 });
      if (!out.towns.has(site)) out.towns.set(site, []);
      out.towns.get(site)!.push(...lot);
    }
  }
  return out;
}
// The ground of the towns laid on a real plan that draws its land and water (Venice, from the land register of 1808):
// in the square the plan draws, the world takes land and water from the plan instead of from the map, at the size the
// simulation laid the town (src/sim/settlement/plan_ground.ts, src/net/lots.ts), so that its houses, streets and
// bridges stand on the plan's land. The town is laid round its site's block, as the simulation's centre.
/** metres a block of the finest step stands for at the scale of the houses (src/worldprobe/settle.ts, m) */
const FINEST_METRES = 2;
/** the blocks of each such town on each step, kept for the pieces that follow */
const kept = new Map<string, GroundBlocks>();

/**
 * Lays the plan's ground on the columns of a piece of `step`: `kind` and `metres` as readColumns filled them;
 * `siteBlock` gives the block of the piece a town's site lies on. Water lies at the sea's height; land keeps the
 * map's height where the map has land there, and the sea's where it has water (a lagoon town stands at the sea).
 */
export function layPlanGrounds(
  parcels: TownParcels,
  step: number,
  siteBlock: (site: number) => readonly [number, number] | null,
  kind: Uint8Array,
  metres: Float32Array,
) {
  const year = parcels.year ?? 1291,
    size = FINEST_METRES * 2 ** step;
  for (const [site, t] of parcels) {
    const plan = t.ground && planOf(year, site);
    if (!t.ground || !plan?.ground || !plan.radius) continue;
    const at = siteBlock(site);
    if (!at) continue;
    const key = `${year} ${site} ${step} ${t.ground.radius} ${t.ground.half}`;
    let blocks = kept.get(key);
    if (!blocks) {
      blocks = groundBlocks(plan, plan.ground, plan.radius, t.ground.radius, t.ground.half, size);
      kept.set(key, blocks);
    }
    const ax = Math.floor(at[0]),
      az = Math.floor(at[1]),
      r = blocks.reach;
    for (let z = Math.max(0, az - r); z <= Math.min(N - 1, az + r); z++)
      for (let x = Math.max(0, ax - r); x <= Math.min(N - 1, ax + r); x++) {
        const k = blocks.at(x - ax, z - az),
          i = idx(x, z);
        if (k === GROUND.open) continue;
        if (k === GROUND.water) {
          kind[i] = Water.Sea;
          metres[i] = 0;
        } else {
          if (kind[i] !== Water.Land) metres[i] = 0;
          kind[i] = Water.Land;
        }
      }
  }
}

export { CROP };
