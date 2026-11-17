// The land register: feature 1 of the settlement (docs/SETTLEMENT_DESIGN.md, where every source is listed).
//
// Every family who lives in a town has a parcel: a piece of the town's ground with a place, a size and a side at the street.
// The parcels are entities of their own (LOT_SCHEMA in src/sim/state.ts), and a family points to its parcel
// (`family.lot`). What a town shows of its houses is drawn from this table and from nothing else.
//
// How much ground a town takes follows from the persons who live in it (src/sim/settlement/rule.ts): the settled area
// of the real town they were derived from, a hundredth of it at the scale of the houses. The families share the
// parcels' part of that ground equally, and the parcels lie on a grid of blocks around the centre of the town.
//
// The register is written once, when the world is founded, and does not change yet: nobody is born, dies, marries or
// moves while the world runs, so no parcel is laid out, split or left. A ruler has no parcel (castles and residences
// are not built yet), and neither has a family of the hamlets yet (their farmsteads are the next feature).
import type { WorldState } from '../state';
import { LOT_SCHEMA, LOT_KIND, NO_LOT } from '../state';
import { createTable, spawn } from '../ecs';
import { citiesOf } from '../content/cities';
import { SCALE } from '../scale';
import { townGround, parcelSize, layParcels, FRONT, type Parcel, type ParcelSize } from '../settlement/rule';
import type { Ground } from '../content/ground';

/** The families who live in each town of the start year, in the order of the towns (src/sim/content/cities.ts):
 *  their ids, lowest first, and the persons in them. The families who live from agriculture are not among them: they
 *  live in hamlets outside the walls (`family.hamlet`, src/sim/systems/hamlets.ts). The people were founded town by
 *  town (src/sim/systems/people.ts), so the persons of a town are the next `round(people / SCALE)` ids; a family
 *  stores only its place, and a place may hold several towns. Holds while nobody has been born or has moved since
 *  the founding. */
export function townFamilies(s: WorldState): { families: number[]; persons: number }[] {
  const P = s.person.cols, F = s.family.cols, out: { families: number[]; persons: number }[] = [];
  let id = 0;
  for (const city of citiesOf(s.startYear)) {
    const n = Math.round(city.people / SCALE), seen = new Set<number>();
    let persons = 0;
    for (const end = id + n; id < end; id++) {
      const f = P.family[id];
      if (id >= s.person.size || F.place[f] !== city.place) throw new Error(`person ${id} is not of ${city.name}: the persons are no longer those of the founding`);
      if (F.hamlet[f]) continue;
      seen.add(f); persons++;
    }
    out.push({ families: [...seen].sort((a, b) => a - b), persons });
  }
  return out;
}

/** How deep from its street a house may stand on its parcel, in blocks: the deepest the world graphic builds
 *  (src/worldprobe/settle.ts sets a house 3 to 5 blocks deep at the street side, as wide as the parcel). */
export const HOUSE_DEEP = 5;

/** Whether the house of a parcel can stand: every block of the strip at its street, as wide as the parcel and
 *  HOUSE_DEEP blocks deep, is building ground. The edges round to blocks as the world graphic rounds them. */
export function houseGround(g: Ground, site: number, p: Parcel, size: ParcelSize): boolean {
  const m = g.metresPerBlock;
  const a0 = Math.round((p.x - size.w / 2) / m), a1 = Math.max(a0 + 2, Math.round((p.x + size.w / 2) / m));
  const b0 = Math.round((p.z - size.d / 2) / m), b1 = Math.max(b0 + 2, Math.round((p.z + size.d / 2) / m));
  const deep = Math.min(b1 - b0, HOUSE_DEEP), b = p.front === FRONT.north ? b0 : b1 - deep;
  for (let bz = b; bz < b + deep; bz++) for (let bx = a0; bx < a1; bx++) if (!g.free(site, bx, bz)) return false;
  return true;
}

/**
 * Founds the land register of a world: lays out the parcels of every town of the start year and gives each of the
 * families who live in it one, the family with the lowest id the innermost (PLACEHOLDER: who lives where in a town
 * has no rule yet). With the building ground of the start year (`ground`, src/sim/content/ground.ts) a parcel lies
 * only where its house can stand: not in the water, on rock, on a step or under the church. A town whose ground was
 * not surveyed, or whose surveyed ground does not hold all its families, is laid out without regard to the ground
 * (PLACEHOLDER); the sites of the latter are returned.
 */
export function foundLots(s: WorldState, ground?: Ground | null): number[] {
  const lot = createTable(LOT_SCHEMA, 32768), L = lot.cols, F = s.family.cols, tight: number[] = [];
  s.lot = lot;
  F.lot.fill(NO_LOT);
  const g = ground && ground.year === s.startYear ? ground : null;
  const cities = citiesOf(s.startYear), towns = cities.length ? townFamilies(s) : [];
  cities.forEach((city, k) => {
    const { families, persons } = towns[k];
    if (!families.length) return;
    const size = parcelSize(townGround(persons, city.site), families.length);
    let parcels: Parcel[] | null = null;
    if (g?.has(city.site)) {
      parcels = layParcels(families.length, size, (x, z, front) => houseGround(g, city.site, { x, z, front }, size), g.reach(city.site) * g.metresPerBlock);
      if (parcels.length < families.length) { parcels = null; tight.push(city.site); }
    }
    parcels ??= layParcels(families.length, size);
    families.forEach((f, i) => {
      const id = spawn(lot), p = parcels![i];
      L.kind[id] = LOT_KIND.parcel; L.place[id] = city.place; L.site[id] = city.site;
      L.x[id] = p.x; L.z[id] = p.z; L.w[id] = size.w; L.d[id] = size.d; L.front[id] = p.front;
      F.lot[f] = id;
    });
  });
  return tight;
}
