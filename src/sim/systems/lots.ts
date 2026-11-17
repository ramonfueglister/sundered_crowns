// The land register: features 1 and 2 of the settlement (docs/SETTLEMENT_DESIGN.md, where every source is listed).
//
// Every family who lives in a town has a parcel: a piece of the town's ground with a place, a size and a side at the
// street. Every family who lives from agriculture has a farmstead in a hamlet outside the walls of its town
// (`family.hamlet`, src/sim/systems/hamlets.ts). Parcels and farmsteads are entities of their own (LOT_SCHEMA in
// src/sim/state.ts), the hamlets too (HAMLET_SCHEMA), and a family points to its ground (`family.lot`). What a town
// and its hamlets show of their houses is drawn from these tables and from nothing else.
//
// How much ground a town takes follows from the persons who live in it (src/sim/settlement/rule.ts): the settled area
// of the real town they were derived from, a hundredth of it at the scale of the houses. The families share the
// parcels' part of that ground equally, and the parcels lie on a grid of blocks around the centre of the town. The
// farming families of a town make hamlets of ten farmsteads at most, spread evenly over the land between the town
// and the edge of its fields (src/sim/settlement/hamlets.ts).
//
// The register is written once, when the world is founded, and does not change yet: nobody is born, dies, marries or
// moves while the world runs, so no parcel is laid out, split or left. A ruler has no ground (castles and residences
// are not built yet).
import type { WorldState } from '../state';
import { LOT_SCHEMA, LOT_KIND, NO_LOT, HAMLET_SCHEMA, NO_HAMLET } from '../state';
import { createTable, spawn } from '../ecs';
import { citiesOf } from '../content/cities';
import { SCALE } from '../scale';
import { townGround, parcelSize, layParcels, FRONT, type Parcel, type ParcelSize } from '../settlement/rule';
import { FARM, HAMLET_GAP, HAMLET_OFF, METRES_PER_BLOCK, hamletBox, hamletRing, hamletSizes, hamletSpots, layFarms } from '../settlement/hamlets';
import type { Ground } from '../content/ground';

/** The families of each town of the start year, in the order of the towns (src/sim/content/cities.ts): those who
 *  live in it (`families`, lowest id first) with their persons, and those who live from agriculture and live in its
 *  hamlets outside the walls (`farmers`; `family.hamlet`, src/sim/systems/hamlets.ts) with theirs. The people were
 *  founded town by town (src/sim/systems/people.ts), so the persons of a town are the next `round(people / SCALE)`
 *  ids; a family stores only its place, and a place may hold several towns. Holds while nobody has been born or has
 *  moved since the founding. */
export function townFamilies(s: WorldState): { families: number[]; persons: number; farmers: number[]; farmPersons: number }[] {
  const P = s.person.cols, F = s.family.cols, out: { families: number[]; persons: number; farmers: number[]; farmPersons: number }[] = [];
  const order = (set: Set<number>) => [...set].sort((a, b) => a - b);
  let id = 0;
  for (const city of citiesOf(s.startYear)) {
    const n = Math.round(city.people / SCALE), town = new Set<number>(), farm = new Set<number>();
    let persons = 0, farmPersons = 0;
    for (const end = id + n; id < end; id++) {
      const f = P.family[id];
      if (id >= s.person.size || F.place[f] !== city.place) throw new Error(`person ${id} is not of ${city.name}: the persons are no longer those of the founding`);
      if (F.hamlet[f]) { farm.add(f); farmPersons++; } else { town.add(f); persons++; }
    }
    out.push({ families: order(town), persons, farmers: order(farm), farmPersons });
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

/** How far round its spot a hamlet looks for ground that carries its farmhouses, and how far for a spot clear of
 *  the town and the other hamlets when there is none that near, in blocks. PLACEHOLDER. */
const HAMLET_SEARCH = 8, HAMLET_FAR = 64;
/** the blocks round a spot, the nearest first */
const AROUND: readonly (readonly [number, number])[] = (() => {
  const all: [number, number][] = [];
  for (let dz = -HAMLET_SEARCH; dz <= HAMLET_SEARCH; dz++) for (let dx = -HAMLET_SEARCH; dx <= HAMLET_SEARCH; dx++) if (dx * dx + dz * dz <= HAMLET_SEARCH * HAMLET_SEARCH) all.push([dx, dz]);
  return all.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) || a[1] - b[1] || a[0] - b[0]);
})();

interface Box { x: number; z: number; w: number; d: number }
/** whether two pieces of ground (middle, size) lie nearer to each other than `gap` */
const near = (a: Box, b: Box, gap: number) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + gap;

/** What founding the land register found. */
export interface LotsFound {
  /** towns whose surveyed ground does not hold all their families: laid out without regard to the ground */
  tight: number[];
  /** hamlets in which not every farmhouse stands on building ground (of those whose ground was surveyed) */
  rough: number;
  /** hamlets that found no spot clear of their town and of the other hamlets near their own: they lie farther off */
  crowded: number;
}

/**
 * Founds the land register of a world: lays out the parcels of every town of the start year and gives each of the
 * families who live in it one, the family with the lowest id the innermost (PLACEHOLDER: who lives where in a town
 * has no rule yet). With the building ground of the start year (`ground`, src/sim/content/ground.ts) a parcel lies
 * only where its house can stand: not in the water, on rock, on a step or under the church. A town whose ground was
 * not surveyed, or whose surveyed ground does not hold all its families, is laid out without regard to the ground
 * (PLACEHOLDER).
 *
 * Then the hamlets: the farming families of a town make as few hamlets as hold them at HAMLET_FARMS farmsteads
 * each, the family with the lowest id in the first (PLACEHOLDER). The hamlets lie spread evenly between the edge of
 * the town and the edge of its fields: the arable of its place (`place.arable`), of which a town has the share of
 * its farming persons among those of the place. Each takes the spot nearest to its place in the pattern that is
 * clear of the town and of the hamlets before it and, where the ground is surveyed, carries all its farmhouses;
 * where none does, the clear spot that carries the most.
 */
export function foundLots(s: WorldState, ground?: Ground | null): LotsFound {
  const lot = createTable(LOT_SCHEMA, 32768), L = lot.cols, F = s.family.cols, found: LotsFound = { tight: [], rough: 0, crowded: 0 };
  const hamlets = createTable(HAMLET_SCHEMA, 4096), H = hamlets.cols;
  s.lot = lot; s.hamlets = hamlets;
  F.lot.fill(NO_LOT);
  const g = ground && ground.year === s.startYear ? ground : null;
  const cities = citiesOf(s.startYear), towns = cities.length ? townFamilies(s) : [];
  const farmersOfPlace = new Map<number, number>();
  cities.forEach((city, k) => farmersOfPlace.set(city.place, (farmersOfPlace.get(city.place) ?? 0) + towns[k].farmPersons));
  cities.forEach((city, k) => {
    const { families, persons, farmers, farmPersons } = towns[k];
    let half = 0;
    const built: Box[] = [];
    if (families.length) {
      const size = parcelSize(townGround(persons, city.site), families.length);
      let parcels: Parcel[] | null = null;
      if (g?.has(city.site)) {
        parcels = layParcels(families.length, size, (x, z, front) => houseGround(g, city.site, { x, z, front }, size), g.reach(city.site) * g.metresPerBlock);
        if (parcels.length < families.length) { parcels = null; found.tight.push(city.site); }
      }
      parcels ??= layParcels(families.length, size);
      families.forEach((f, i) => {
        const id = spawn(lot), p = parcels![i];
        L.kind[id] = LOT_KIND.parcel; L.place[id] = city.place; L.site[id] = city.site; L.hamlet[id] = NO_HAMLET;
        L.x[id] = p.x; L.z[id] = p.z; L.w[id] = size.w; L.d[id] = size.d; L.front[id] = p.front;
        F.lot[f] = id;
        half = Math.max(half, Math.abs(p.x) + size.w / 2, Math.abs(p.z) + size.d / 2);
        built.push({ x: p.x, z: p.z, w: size.w, d: size.d });
      });
    }
    if (!farmers.length) return;
    const sizes = hamletSizes(farmers.length), hectares = (s.place.arable[city.place] * farmPersons) / farmersOfPlace.get(city.place)!;
    const ring = hamletRing(half, sizes, hectares), spots = hamletSpots(sizes.length, ring.inner, ring.outer);
    const town: Box = { x: 0, z: 0, w: 2 * half, d: 2 * half }, taken: Box[] = [], surveyed = !!g?.has(city.site);
    let next = 0;
    sizes.forEach((farms, h) => {
      const box = hamletBox(farms), lay = layFarms(farms);
      // clear of every parcel of the town (the box round them first: most spots lie outside it) and of the hamlets before
      const clear = (b: Box) => !(near(b, town, HAMLET_OFF) && built.some((t) => near(b, t, HAMLET_OFF))) && !taken.some((t) => near(b, t, HAMLET_GAP));
      const carried = (x: number, z: number) => { let n = 0; for (const p of lay) if (houseGround(g!, city.site, { x: x + p.x, z: z + p.z, front: p.front }, FARM)) n++; return n; };
      let at: { x: number; z: number } | null = null, most = -1;
      for (const [dx, dz] of AROUND) {
        const x = spots[h].x + dx * METRES_PER_BLOCK, z = spots[h].z + dz * METRES_PER_BLOCK;
        if (!clear({ x, z, ...box })) continue;
        const n = surveyed ? carried(x, z) : farms;
        if (n > most) { most = n; at = { x, z }; }
        if (n === farms) break;
      }
      if (!at) { // no clear spot near its own: the nearest clear one farther out, whatever its ground
        found.crowded++;
        for (let ring = HAMLET_SEARCH + 1; !at && ring <= HAMLET_FAR; ring++) {
          let best = Infinity;
          for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring || dx * dx + dz * dz >= best) continue;
            const x = spots[h].x + dx * METRES_PER_BLOCK, z = spots[h].z + dz * METRES_PER_BLOCK;
            if (clear({ x, z, ...box })) { best = dx * dx + dz * dz; at = { x, z }; }
          }
        }
        at ??= spots[h];
        most = surveyed ? carried(at.x, at.z) : farms;
      }
      if (surveyed && most < farms) found.rough++;
      taken.push({ ...at, ...box });
      const hid = spawn(hamlets);
      H.place[hid] = city.place; H.site[hid] = city.site; H.x[hid] = at.x; H.z[hid] = at.z; H.farms[hid] = farms;
      for (const p of lay) {
        const id = spawn(lot);
        L.kind[id] = LOT_KIND.farmstead; L.place[id] = city.place; L.site[id] = city.site; L.hamlet[id] = hid;
        L.x[id] = at.x + p.x; L.z[id] = at.z + p.z; L.w[id] = FARM.w; L.d[id] = FARM.d; L.front[id] = p.front;
        F.lot[farmers[next++]] = id;
      }
    });
  });
  return found;
}
