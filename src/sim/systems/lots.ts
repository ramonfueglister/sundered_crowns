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
import { LOT_SCHEMA, LOT_KIND, NO_LOT, HAMLET_SCHEMA, NO_HAMLET, STREET_SCHEMA, STREET_KIND } from '../state';
import { createTable, spawn } from '../ecs';
import { citiesOf } from '../content/cities';
import { SCALE } from '../scale';
import { townGround, parcelSize, footprint, FRONT, type Parcel, type ParcelSize } from '../settlement/rule';
import { layTown, planDraw, streetReach, type Tuning } from '../settlement/streets';
import type { Street, Town } from '../settlement/town_layout';
import { GROUND, groundBlocks } from '../settlement/plan_ground';
import { waysOf } from '../content/town_ways';
import { planOf } from '../content/town_plans';
import { FARM, HAMLET_GAP, HAMLET_OFF, METRES_PER_BLOCK, hamletBox, hamletRing, hamletSizes, hamletSpots, layFarms } from '../settlement/hamlets';
import { widened, type Ground } from '../content/ground';
import { LANDMARK_GAP, aloneLandmarks, coreLandmarks, edgeLandmarks, latinAt, newLandmarks, residenceAt, writeLandmarks, type Laid, type LandmarkGround } from './landmarks';
import { LANDMARK_KIND, URBAN } from '../settlement/landmarks';
import { namedOf } from '../content/landmarks';

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

/** The strip of a parcel its house stands on: as wide as the parcel and HOUSE_DEEP blocks deep at its street (on
 *  the side `front`), as blocks [x0, z0, x1, z1) of `m` metres from the centre of the town. The edges round to blocks
 *  as the world graphic rounds them. */
function houseStrip(m: number, p: Parcel, size: ParcelSize): [number, number, number, number] {
  const f = footprint(p, size);
  const a0 = Math.round((p.x - f.w / 2) / m), a1 = Math.max(a0 + 2, Math.round((p.x + f.w / 2) / m));
  const b0 = Math.round((p.z - f.d / 2) / m), b1 = Math.max(b0 + 2, Math.round((p.z + f.d / 2) / m));
  if (p.front === FRONT.north || p.front === FRONT.south) {
    const deep = Math.min(b1 - b0, HOUSE_DEEP), b = p.front === FRONT.north ? b0 : b1 - deep;
    return [a0, b, a1, b + deep];
  }
  const deep = Math.min(a1 - a0, HOUSE_DEEP), a = p.front === FRONT.west ? a0 : a1 - deep;
  return [a, b0, a + deep, b1];
}

/** Whether the house of a parcel can stand: every block of its strip (houseStrip) is building ground. */
export function houseGround(g: Ground, site: number, p: Parcel, size: ParcelSize): boolean {
  const [x0, z0, x1, z1] = houseStrip(g.metresPerBlock, p, size);
  for (let bz = z0; bz < z1; bz++) for (let bx = x0; bx < x1; bx++) if (!g.free(site, bx, bz)) return false;
  return true;
}

/** The ground of a town summed up, to ask in one step whether every block of a piece [x0, z0, x1, z1) of it is free:
 *  the same answer as asking `g.free` block by block, for the many spots a hamlet tries far from its own. */
function allFree(g: Ground, site: number): (x0: number, z0: number, x1: number, z1: number) => boolean {
  const r = g.reach(site), n = 2 * r + 2, taken = new Int32Array(n * n);
  for (let z = 1; z < n; z++) for (let x = 1, row = 0; x < n; x++) {
    if (!g.free(site, x - 1 - r, z - 1 - r)) row++;
    taken[z * n + x] = taken[(z - 1) * n + x] + row;
  }
  return (x0, z0, x1, z1) => {
    if (x0 < -r || z0 < -r || x1 > r + 1 || z1 > r + 1) return false;
    const a = x0 + r, b = z0 + r, c = x1 + r, d = z1 + r;
    return taken[d * n + c] - taken[b * n + c] - taken[d * n + a] + taken[b * n + a] === 0;
  };
}

/** How far round its spot a hamlet looks for ground that carries its farmhouses, and how far for a spot clear of
 *  the town and the other hamlets when there is none that near, in blocks. PLACEHOLDER. */
const HAMLET_SEARCH = 8, HAMLET_FAR = 128;
/** the blocks round a spot, the nearest first */
const AROUND: readonly (readonly [number, number])[] = (() => {
  const all: [number, number][] = [];
  for (let dz = -HAMLET_SEARCH; dz <= HAMLET_SEARCH; dz++) for (let dx = -HAMLET_SEARCH; dx <= HAMLET_SEARCH; dx++) if (dx * dx + dz * dz <= HAMLET_SEARCH * HAMLET_SEARCH) all.push([dx, dz]);
  return all.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) || a[1] - b[1] || a[0] - b[0]);
})();

interface Box { x: number; z: number; w: number; d: number }
/** the side of the cells the parcels of a town are sorted into, to find those near a hamlet, in metres */
const CELL = 32;
/** whether two pieces of ground (middle, size) lie nearer to each other than `gap` */
const near = (a: Box, b: Box, gap: number) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + gap;

/** the steps a town is laid in: `u` metres, about one, so that a parcel is a whole number of steps wide and deep
 *  and keeps its exact ground (feature 1); `cells`: the parcel in steps */
const stepsOf = (size: ParcelSize) => {
  const W = Math.max(1, Math.round(size.w)), u = size.w / W;
  return { u, cells: { w: W, d: Math.max(1, Math.round(size.d / u)) } };
};

/** Where a town of `count` families with parcels of `size` is laid on a real plan that draws its ground
 *  (src/sim/settlement/plan_ground.ts): the metres of a radius of the plan in the world, and how far the town's
 *  streets reach from their middle lines, in metres; null for every other town. The world graphic draws the plan's
 *  ground at the same size (src/net/lots.ts tells it). */
export function planGroundOf(year: number, site: number, count: number, size: ParcelSize): { radius: number; half: number } | null {
  const plan = planOf(year, site);
  if (!plan?.ground || !count) return null;
  const { u, cells } = stepsOf(size);
  return { radius: planDraw(count, size, 1), half: streetReach(cells) * u };
}

/** The building ground of the towns, with the ground of a town laid on a real plan that draws its land and water
 *  taken from the plan where it draws it (the world graphic draws it there instead of the map's), from the survey
 *  elsewhere. */
function onPlan(g: Ground | null, year: number, site: number, count: number, size: ParcelSize): Ground | null {
  const plan = planOf(year, site), at = planGroundOf(year, site, count, size);
  if (!g?.has(site) || !plan?.ground || !plan.radius || !at) return g;
  const blocks = groundBlocks(plan, plan.ground, plan.radius, at.radius, at.half, g.metresPerBlock), far = Math.max(g.reach(site), blocks.reach);
  return {
    year: g.year, metresPerBlock: g.metresPerBlock, has: (s) => g.has(s),
    reach: (s) => (s === site ? far : g.reach(s)),
    free: (s, bx, bz) => {
      if (s !== site) return g.free(s, bx, bz);
      const k = blocks.at(bx, bz);
      return k === GROUND.open ? g.free(s, bx, bz) : k === GROUND.land;
    },
  };
}

/** The parcels of a town in the register and their size (all of a town are alike): none for a town without parcels. */
function parcelsOf(s: WorldState, site: number): { rows: number[]; size: ParcelSize } | null {
  const L = s.lot.cols, rows: number[] = [];
  for (let i = 0; i < s.lot.size; i++) if (s.lot.alive[i] && L.kind[i] === LOT_KIND.parcel && L.site[i] === site) rows.push(i);
  return rows.length ? { rows, size: { w: L.w[rows[0]], d: L.d[rows[0]] } } : null;
}

/** The building ground of a town of the register as its parcels were laid on it (`onPlan`). */
export function registerGround(s: WorldState, g: Ground | null, site: number): Ground | null {
  const p = parcelsOf(s, site);
  return p ? onPlan(g, s.startYear, site, p.rows.length, p.size) : g;
}

/** What founding the land register found. */
export interface LotsFound {
  /** towns whose surveyed ground does not hold all their families: laid out without regard to the ground */
  tight: number[];
  /** hamlets in which not every farmhouse stands on building ground (of those whose ground was surveyed) */
  rough: number;
  /** hamlets that found no spot clear of their town and of the other hamlets near their own: they lie farther off */
  crowded: number;
  /** the streets, the market and what the network of each town looks like (settlement feature 3), by its site */
  streets: Map<number, { streets: Street[]; market: { x: number; z: number; half: number }; nodes: { ends: number; bends: number; tees: number; crosses: number }; blocks: number[] }>;
}

/**
 * The streets, the market and the parcels of a town of `count` families with parcels of `size` (settlement feature
 * 3, src/sim/settlement/streets.ts), written into the table of streets; the parcels are returned for the register.
 * With the building ground of the start year a parcel and a street lie only where a house can stand; a town whose
 * surveyed ground does not hold all its families is laid out without regard to the ground (PLACEHOLDER, as in
 * feature 1), and counted in `found.tight`.
 */
function layStreets(s: WorldState, site: number, count: number, size: ParcelSize, g: Ground | null, found: LotsFound, tune?: Tuning, blocked: readonly Box[] = []): Town {
  const ways = waysOf(s.startYear, site), seed = (s.seed ^ Math.imul(site + 1, 0x9e3779b1)) >>> 0;
  // the plan of the town is laid in steps of `u` metres, about one, so that a parcel is a whole number of steps wide
  // and deep and keeps its exact ground (feature 1)
  const { u, cells } = stepsOf(size);
  const plan = planOf(s.startYear, site); // a real plan, where an old plan of the town is read
  let town: Town | null = null;
  // the landmarks laid before the streets (src/sim/systems/landmarks.ts): no street on them, and no parcel nearer than
  // LANDMARK_GAP; a street may run in that gap, round the landmark, as a street runs round a church (OWN RULE)
  const onLandmark = (x: number, z: number) => blocked.some((b) => Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2);
  const clearOf = (p: Parcel) => { if (!blocked.length) return true; const f = footprint(p, size), b = { x: p.x, z: p.z, w: f.w, d: f.d }; return !blocked.some((q) => near(b, q, LANDMARK_GAP)); };
  if (g?.has(site)) {
    const m = g.metresPerBlock, r = g.reach(site), n = 2 * r + 1, known = new Uint8Array(n * n);
    // each block of the ground asked once, for the many steps of the plan on it and every try
    const block = (bx: number, bz: number) => {
      if (bx < -r || bx > r || bz < -r || bz > r) return false;
      const i = (bz + r) * n + bx + r;
      if (!known[i]) known[i] = g.free(site, bx, bz) && !onLandmark(bx * m, bz * m) ? 1 : 2;
      return known[i] === 1;
    };
    town = layTown(count, cells, ways, seed, {
      free: (x, z) => block(Math.round((x * u) / m), Math.round((z * u) / m)),
      stands: (p) => { const q = { x: p.x * u, z: p.z * u, front: p.front }; return houseGround(g, site, q, size) && clearOf(q); },
      reach: (g.reach(site) * m) / u,
    }, tune, plan);
    if (town.parcels.length < count) { town = null; found.tight.push(site); }
  }
  if (!town && blocked.length) { // without ground, or where it does not hold the town: clear of the landmarks at least
    town = layTown(count, cells, ways, seed, { free: (x, z) => !onLandmark(x * u, z * u), stands: (p) => clearOf({ x: p.x * u, z: p.z * u, front: p.front }), reach: Infinity }, tune, plan);
    if (town.parcels.length < count) town = null;
  }
  town ??= layTown(count, cells, ways, seed, undefined, tune, plan);
  if (town.parcels.length < count) throw new Error(`the streets of town ${site} hold ${town.parcels.length} of its ${count} families`);
  // into metres
  const at = (v: number) => v * u;
  town = {
    ...town,
    parcels: town.parcels.map((p) => ({ x: at(p.x), z: at(p.z), front: p.front })),
    streets: town.streets.map((q) => ({ x0: at(q.x0), z0: at(q.z0), x1: at(q.x1), z1: at(q.z1), kind: q.kind })),
    market: { x: at(town.market.x), z: at(town.market.z), half: at(town.market.half) },
    blocks: town.blocks.map((a) => a * u * u),
    width: at(town.width),
  };
  const S = s.street.cols;
  const put = (x0: number, z0: number, x1: number, z1: number, kind: number, wide: number) => {
    const id = spawn(s.street);
    S.site[id] = site; S.x0[id] = x0; S.z0[id] = z0; S.x1[id] = x1; S.z1[id] = z1; S.kind[id] = kind; S.width[id] = wide;
  };
  const mk = town.market;
  put(mk.x - mk.half, mk.z - mk.half, mk.x + mk.half, mk.z + mk.half, STREET_KIND.market, 0);
  for (const q of town.streets) put(q.x0, q.z0, q.x1, q.z1, q.kind, town.width);
  found.streets.set(site, town);
  return town;
}

/** how a town's landmarks are drawn together: as its real plan, where an old plan of it is read, else by URBAN */
const drawOf = (year: number, site: number, count: number, size: ParcelSize): number => {
  const plan = planOf(year, site);
  return plan?.radius ? planDraw(count, size, plan.radius) : URBAN;
};

/** the ground of a town for its landmarks, where it was surveyed */
const landmarkGround = (g: Ground | null, site: number): LandmarkGround | null => (g?.has(site) ? { free: (bx, bz) => g.free(site, bx, bz), m: g.metresPerBlock } : null);

/** everything of a town in the register that a landmark at its edge keeps clear of: its parcels, its streets and
 *  market, its landmarks and its hamlets */
function takenOf(s: WorldState, site: number): Box[] {
  const L = s.lot.cols, S = s.street.cols, H = s.hamlets.cols, M = s.landmark.cols, out: Box[] = [];
  for (let i = 0; i < s.lot.size; i++) if (s.lot.alive[i] && L.site[i] === site && L.kind[i] === LOT_KIND.parcel) { const f = footprint({ front: L.front[i] }, { w: L.w[i], d: L.d[i] }); out.push({ x: L.x[i], z: L.z[i], w: f.w, d: f.d }); }
  for (let k = 0; k < s.street.size; k++) if (s.street.alive[k] && S.site[k] === site) {
    const wide = S.kind[k] === STREET_KIND.market ? 0 : S.width[k];
    out.push({ x: (S.x0[k] + S.x1[k]) / 2, z: (S.z0[k] + S.z1[k]) / 2, w: Math.abs(S.x1[k] - S.x0[k]) + wide, d: Math.abs(S.z1[k] - S.z0[k]) + wide });
  }
  for (let h = 0; h < s.hamlets.size; h++) if (s.hamlets.alive[h] && H.site[h] === site) out.push({ x: H.x[h], z: H.z[h], ...hamletBox(H.farms[h]) });
  for (let i = 0; i < s.landmark.size; i++) if (s.landmark.alive[i] && M.site[i] === site) out.push({ x: M.x[i], z: M.z[i], w: M.w[i], d: M.d[i] });
  return out;
}

/** the town of each place that holds its ruler's residence: the one with the most people */
function seatTowns(year: number): Set<number> {
  const best = new Map<number, { site: number; people: number }>();
  for (const c of citiesOf(year)) { const b = best.get(c.place); if (!b || c.people > b.people) best.set(c.place, { site: c.site, people: c.people }); }
  return new Set([...best.values()].map((b) => b.site));
}

/** the landmarks at the edge of a town, laid after its parcels and hamlets (src/sim/systems/landmarks.ts) */
function layEdge(s: WorldState, city: { place: number; site: number; people: number }, g: Ground | null, seats: Set<number>): void {
  const known = namedOf(s.startYear).some((n) => n.site === city.site && (n.kind === LANDMARK_KIND.castle || n.kind === LANDMARK_KIND.palace || n.seat));
  const residence = seats.has(city.site) && !known ? residenceAt(s, city.place) : null;
  writeLandmarks(s, city.place, city.site, edgeLandmarks(latinAt(s, city.place), city.people, residence, takenOf(s, city.site), landmarkGround(registerGround(s, g, city.site), city.site), !!planOf(s.startYear, city.site)?.around));
}

/**
 * Lays the towns of a running world out anew along their streets (the upgrade 32 → 33): each town keeps its parcels,
 * their families and their size; the parcels move to the streets that grow to them, the lowest id
 * the first, as a new world lays them. The hamlets stay where they are.
 */
export function relayTowns(s: WorldState, ground?: Ground | null, dry?: Ground | null): LotsFound {
  const L = s.lot.cols, found: LotsFound = { tight: [], rough: 0, crowded: 0, streets: new Map() };
  const g = widened(ground && ground.year === s.startYear ? ground : null, dry ?? null);
  s.street = createTable(STREET_SCHEMA, 16384);
  newLandmarks(s);
  const cities = citiesOf(s.startYear), core = new Map<number, Laid[]>();
  const bySite = new Map<number, number[]>();
  for (let i = 0; i < s.lot.size; i++) if (s.lot.alive[i] && L.kind[i] === LOT_KIND.parcel) { const a = bySite.get(L.site[i]); if (a) a.push(i); else bySite.set(L.site[i], [i]); }
  for (const c of cities) {
    const rows = bySite.get(c.site), size = rows && { w: L.w[rows[0]], d: L.d[rows[0]] }, draw = rows ? drawOf(s.startYear, c.site, rows.length, size!) : URBAN;
    core.set(c.site, coreLandmarks(s.startYear, c.site, c.people, landmarkGround(rows ? onPlan(g, s.startYear, c.site, rows.length, size!) : g, c.site), draw));
  }
  // in the order the towns were founded (their first parcel), so that the streets lie in the register as a new world lays them
  for (const [site, rows] of [...bySite].sort((a, b) => a[1][0] - b[1][0])) {
    const size = { w: L.w[rows[0]], d: L.d[rows[0]] };
    const town = layStreets(s, site, rows.length, size, onPlan(g, s.startYear, site, rows.length, size), found, undefined, core.get(site) ?? []);
    rows.forEach((id, k) => { const p = town.parcels[k]; L.x[id] = p.x; L.z[id] = p.z; L.w[id] = size.w; L.d[id] = size.d; L.front[id] = p.front; });
  }
  // the landmarks in the order of the towns, as a new world lays them; the hamlets stay where they are
  const seats = seatTowns(s.startYear);
  for (const c of cities) { writeLandmarks(s, c.place, c.site, core.get(c.site) ?? []); layEdge(s, c, g, seats); }
  writeLandmarks(s, -1, -1, aloneLandmarks(s.startYear));
  return found;
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
 * where none near does, the nearest farther out that does; where none does at all, the clear spot near its own that
 * carries the most. The ground of a hamlet is the dry ground round the town (`dry`: no water, no rock; the world
 * graphic levels the ground of a hamlet, so steps do not count there), and without it the building ground.
 */
export function foundLots(s: WorldState, ground?: Ground | null, dry?: Ground | null, tune?: Tuning): LotsFound {
  const lot = createTable(LOT_SCHEMA, 32768), L = lot.cols, F = s.family.cols, found: LotsFound = { tight: [], rough: 0, crowded: 0, streets: new Map() };
  const hamlets = createTable(HAMLET_SCHEMA, 4096), H = hamlets.cols;
  s.lot = lot; s.hamlets = hamlets; s.street = createTable(STREET_SCHEMA, 16384);
  newLandmarks(s);
  F.lot.fill(NO_LOT);
  const wide = dry && dry.year === s.startYear ? dry : null;
  // the town's own ground, beyond its survey the dry ground: the landmarks take some of it
  const g = widened(ground && ground.year === s.startYear ? ground : null, wide);
  const cities = citiesOf(s.startYear), towns = cities.length ? townFamilies(s) : [];
  const farmersOfPlace = new Map<number, number>();
  cities.forEach((city, k) => {
    farmersOfPlace.set(city.place, (farmersOfPlace.get(city.place) ?? 0) + towns[k].farmPersons);
  });
  const seats = seatTowns(s.startYear);
  cities.forEach((city, k) => {
    const { families, persons, farmers, farmPersons } = towns[k];
    // the church of its see and its buildings known by name first: the streets grow round them
    // the size of its parcels as the register keeps it (f32), so that a town laid out anew from the register
    // (relayTowns, the upgrade to the landmarks) gets the same streets and parcels
    const exact = families.length ? parcelSize(townGround(persons, city.site), families.length) : null;
    const kept = exact && { w: Math.fround(exact.w), d: Math.fround(exact.d) };
    const core = coreLandmarks(s.startYear, city.site, city.people, landmarkGround(kept ? onPlan(g, s.startYear, city.site, families.length, kept) : g, city.site), kept ? drawOf(s.startYear, city.site, families.length, kept) : URBAN);
    writeLandmarks(s, city.place, city.site, core);
    let half = Math.max(0, ...core.map((b) => Math.max(Math.abs(b.x) + b.w / 2, Math.abs(b.z) + b.d / 2))), reach = 0; // how far the parcels and landmarks reach from the centre, and the streets
    const built = new Map<number, Box[]>(), paved = new Map<number, Box[]>(); // the parcels and the streets of the town by the cells of CELL metres they touch
    const enter = (b: Box) => {
      for (let cz = Math.floor((b.z - b.d / 2) / CELL); cz <= Math.floor((b.z + b.d / 2) / CELL); cz++) for (let cx = Math.floor((b.x - b.w / 2) / CELL); cx <= Math.floor((b.x + b.w / 2) / CELL); cx++) {
        const key = cz * 4096 + cx, list = built.get(key);
        if (list) list.push(b); else built.set(key, [b]);
      }
    };
    core.forEach(enter); // and its landmarks
    if (families.length) {
      const size = kept!;
      const town = layStreets(s, city.site, families.length, size, onPlan(g, s.startYear, city.site, families.length, size), found, tune, core);
      const parcels: Parcel[] = town.parcels;
      const keep = (b: Box, into = built) => {
        for (let cz = Math.floor((b.z - b.d / 2) / CELL); cz <= Math.floor((b.z + b.d / 2) / CELL); cz++) for (let cx = Math.floor((b.x - b.w / 2) / CELL); cx <= Math.floor((b.x + b.w / 2) / CELL); cx++) {
          const key = cz * 4096 + cx, list = into.get(key);
          if (list) list.push(b); else into.set(key, [b]);
        }
      };
      // the streets and the market: a hamlet may lie beside them, as beside a way of the world, but not on them (the
      // hamlets' ring still starts at the parcels)
      const mk = town.market;
      keep({ x: mk.x, z: mk.z, w: 2 * mk.half, d: 2 * mk.half }, paved);
      for (const q of town.streets) {
        const b: Box = { x: (q.x0 + q.x1) / 2, z: (q.z0 + q.z1) / 2, w: Math.abs(q.x1 - q.x0) + town.width, d: Math.abs(q.z1 - q.z0) + town.width };
        reach = Math.max(reach, Math.abs(b.x) + b.w / 2, Math.abs(b.z) + b.d / 2);
        keep(b, paved);
      }
      families.forEach((f, i) => {
        const id = spawn(lot), p = parcels![i];
        L.kind[id] = LOT_KIND.parcel; L.place[id] = city.place; L.site[id] = city.site; L.hamlet[id] = NO_HAMLET;
        L.x[id] = p.x; L.z[id] = p.z; L.w[id] = size.w; L.d[id] = size.d; L.front[id] = p.front;
        F.lot[f] = id;
        const fp = footprint(p, size);
        half = Math.max(half, Math.abs(p.x) + fp.w / 2, Math.abs(p.z) + fp.d / 2);
        keep({ x: p.x, z: p.z, w: fp.w, d: fp.d });
      });
    }
    if (!farmers.length) { layEdge(s, city, g, seats); return; }
    const sizes = hamletSizes(farmers.length), hectares = (s.place.arable[city.place] * farmPersons) / farmersOfPlace.get(city.place)!;
    const ring = hamletRing(half, sizes, hectares), spots = hamletSpots(sizes.length, ring.inner, ring.outer);
    const town: Box = { x: 0, z: 0, w: 2 * Math.max(half, reach), d: 2 * Math.max(half, reach) }, taken: Box[] = [];
    const size = families.length ? parcelSize(townGround(persons, city.site), families.length) : null;
    const on = (q: Ground | null) => (size ? onPlan(q, s.startYear, city.site, families.length, size) : q);
    const hg = wide?.has(city.site) ? on(wide) : g?.has(city.site) ? on(g) : null, surveyed = !!hg, lagoon = !!planOf(s.startYear, city.site)?.around;
    let next = 0, free: ReturnType<typeof allFree> | null = null;
    sizes.forEach((farms, h) => {
      const box = hamletBox(farms), lay = layFarms(farms);
      // clear of every parcel of the town (the box round them first: most spots lie outside it) and of the hamlets before
      const nearTown = (b: Box) => {
        for (let cz = Math.floor((b.z - b.d / 2 - HAMLET_OFF) / CELL); cz <= Math.floor((b.z + b.d / 2 + HAMLET_OFF) / CELL); cz++) for (let cx = Math.floor((b.x - b.w / 2 - HAMLET_OFF) / CELL); cx <= Math.floor((b.x + b.w / 2 + HAMLET_OFF) / CELL); cx++) {
          if (built.get(cz * 4096 + cx)?.some((t) => near(b, t, HAMLET_OFF))) return true;
          if (paved.get(cz * 4096 + cx)?.some((t) => near(b, t, 0))) return true;
        }
        return false;
      };
      const clear = (b: Box) => !(near(b, town, HAMLET_OFF) && nearTown(b)) && !taken.some((t) => near(b, t, HAMLET_GAP));
      const carries = (x: number, z: number, p: Parcel) => houseGround(hg!, city.site, { x: x + p.x, z: z + p.z, front: p.front }, FARM);
      const carried = (x: number, z: number) => { let n = 0; for (const p of lay) if (carries(x, z, p)) n++; return n; };
      let at: { x: number; z: number } | null = null, most = -1;
      for (const [dx, dz] of AROUND) {
        const x = spots[h].x + dx * METRES_PER_BLOCK, z = spots[h].z + dz * METRES_PER_BLOCK;
        if (!clear({ x, z, ...box })) continue;
        const n = surveyed ? carried(x, z) : farms;
        if (n > most) { most = n; at = { x, z }; }
        if (n === farms) break;
      }
      // the nearest clear spot farther out (`whole`: one that carries all the farmhouses)
      const farther = (whole: boolean, far = HAMLET_FAR) => {
        if (whole) free ??= allFree(hg!, city.site);
        // a hamlet lies on whole blocks, so the strips of its farmhouses keep their place in it wherever it lies
        const strips = whole ? lay.map((p) => houseStrip(hg!.metresPerBlock, p, FARM)) : [];
        const bx = Math.round(spots[h].x / METRES_PER_BLOCK), bz = Math.round(spots[h].z / METRES_PER_BLOCK);
        let best = Infinity, hit: { x: number; z: number } | null = null;
        for (let ring = HAMLET_SEARCH + 1; ring <= far && ring * ring < best; ring++) {
          for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx += Math.abs(dz) === ring ? 1 : 2 * ring) { // the blocks of the ring only
            if (dx * dx + dz * dz >= best) continue;
            const x = spots[h].x + dx * METRES_PER_BLOCK, z = spots[h].z + dz * METRES_PER_BLOCK;
            if ((!whole || strips.every((q) => free!(bx + dx + q[0], bz + dz + q[1], bx + dx + q[2], bz + dz + q[3]))) && clear({ x, z, ...box })) { best = dx * dx + dz * dz; hit = { x, z }; }
          }
        }
        return hit;
      };
      if (at && surveyed && most < farms) { // near its own spot the ground does not carry every farmhouse
        const dryer = farther(true) ?? (most || !lagoon ? null : farther(true, hg!.reach(city.site)));
        if (dryer) { at = dryer; most = farms; }
      }
      if (!at) { // no clear spot near its own: the nearest clear one farther out, on ground that carries it if there is
        found.crowded++;
        // (a town in a lagoon: the nearest island or shore that carries it, as far as its ground is known)
        at = (surveyed ? (farther(true) ?? (lagoon ? farther(true, hg!.reach(city.site)) : null)) : null) ?? farther(false) ?? spots[h];
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
    layEdge(s, city, g, seats);
  });
  writeLandmarks(s, -1, -1, aloneLandmarks(s.startYear));
  return found;
}
