// The streets and the market of a town: feature 3 of the settlement (docs/SETTLEMENT_DESIGN.md, where every source is
// listed; proposal agreed by Ramon on 18 November 2026). Only arithmetic here, no state: src/sim/systems/lots.ts
// writes the land register with it.
//
// A town grows parcel by parcel, as Barthelemy & Flammini (2008) let a street network grow towards new centres:
// 1. The market lies where the ways of the world meet in the town (Pounds 2005, pp. 12, 23–24).
// 2. From it a street runs out along each way that leaves the town (Pounds, pp. 23–26: the streets of an unplanned
//    town grew from the paths by which people approached its nucleus; at Winchester they ran to the gates). A town
//    with one way is one street through the town, the smallest form (Pounds, p. 23).
// 3. The families come one after the other, each to a spot drawn from a density that falls exponentially from the
//    market: P(r) ∝ e^(−r / r_c) (Barthelemy & Flammini 2008, after Clark 1951). Barthelemy & Flammini (2009) derive
//    this profile from households weighing the way to the centre against a rent that rises with density; r_c is the
//    balance of the two (calibrated, see R_C).
// 4. A family's parcel lies at the street nearest its spot. Where no street passes near, the nearest street grows
//    towards it, a block at a time, each step in the direction that shortens the way to the spot most: MM′ ∝ u_A
//    (Barthelemy & Flammini 2008, Eq. 2, for one centre at a time). A new street that runs on towards another ends
//    on it (Emilien et al. 2012, Sec. 4.3, the cycles; Strano et al. 2012, densification).
// 5. A parcel fronts its street with its narrow side (feature 1: w × 3w), on building ground only.
// The market lies on open ground nearest the centre, where the world graphic sets the church (OWN RULE, marketAt).
// A town on islands has no bridges yet: where its ground does not hold its families, src/sim/systems/lots.ts lays it
// out without regard to the ground (Venice and Hormuz in 1291).
//
// OWN RULE: the world is built of blocks and a house stands square to them (src/worldprobe/settle.ts), so a street
// runs east-west or north-south and turns at right angles; a way that leaves the town at a slant leaves by the
// nearest of the four directions.
import type { Parcel, ParcelSize } from './rule';
import { FRONT, PARCEL_SHARE, PARCELS_PER_ROW } from './rule';
import { seedRng, rand } from '../rng';

/** a way of the world that leaves the town: its direction (radians, east 0, south positive) and its kind (0 track, 1 road, 2 highway) */
export interface Way { a: number; k: number }

/** the kinds of street: a lane grown to the parcels, and the streets that run out along the ways */
export const STREET = { lane: 0, track: 1, road: 2, highway: 3 } as const;

/** a straight piece of street, east-west or north-south: its ends (metres east and south of the town's centre, on the street's middle line) and its kind (STREET) */
export interface Street { x0: number; z0: number; x1: number; z1: number; kind: number }

/** the real plan of a town where an old plan of it is open (src/sim/content/town_plans_<year>.json): its market and
 *  the pieces of its main streets [x0, z0, x1, z1], east-west or north-south, east and south of the centre in radii
 *  of the real town. It gives the form, not the size: layTown lays it as wide as the town it lays. */
export interface Plan { market: readonly [number, number]; streets: readonly (readonly number[])[] }

export interface Town {
  parcels: Parcel[];
  streets: Street[];
  /** the market: its middle (x, z), `half` metres to each side */
  market: { x: number; z: number; half: number };
  /** the street network's junctions by the number of streets that meet in them: ends, T-junctions, crossings (and the bends, where two meet) */
  nodes: { ends: number; bends: number; tees: number; crosses: number };
  /** the areas of the blocks the streets enclose (m²): the ground between the streets not open to the land round the town */
  blocks: number[];
  /** how often the families had to spread wider before all had a parcel (0: at the density of R_C) */
  spread?: number;
  /** how wide every street is drawn (metres of the plan): its middle line and `hw` to either side */
  width: number;
}

/** The width of a street in metres: the share of Grenade's ground that is not parcels, around a block of two rows of
 *  PARCELS_PER_ROW parcels (feature 1, Boerefijn 2000): as wide as the grid of feature 1 made its streets. */
export const streetWidth = (p: ParcelSize) => PARCELS_PER_ROW * p.w * (1 / Math.sqrt(PARCEL_SHARE) - 1);

/** The side of the market square in metres: as deep as a parcel. PLACEHOLDER: no measure of a market read. */
export const marketSide = (p: ParcelSize) => p.d;

/** The characteristic distance of the density, as a share of the radius the parcels would take packed round the
 *  market (with their streets). Calibrated (tools/settlement/streets_probe.ts): the blocks of the world of 1291 fall
 *  off as A^−1.87 above 200 m², where Dresden's fall off as A^−1.9 (Lämmer et al. 2006). */
export const R_C = 0.5;

/** a family's parcel lies at a street if one passes within this many parcel depths of its spot; else a street grows to it */
const NEAR_DEEP = 1;
/** a new street, and at the end every dead end, runs on to another that lies ahead of it or to either side within this
 *  many parcel depths. Calibrated against medieval Paris (the Vasserot cadastre inside the wall of Philippe Auguste,
 *  tools/settlement/cadastre_paris.py: dead ends 0.10, T-junctions 0.78, crossings 0.12): the towns of 20 streets and
 *  more get 0.13, 0.77, 0.11; more than 5 changes nothing */
const JOIN_DEEP = 5;
/** a lane leaves from a T-junction facing its spot rather than from the nearest point if that costs at most this many
 *  parcel widths more. Calibrated against the share of crossings of medieval Paris (0.12): 1 makes 0.07, 2.5 makes
 *  0.15 (and 0.73 T-junctions) */
const CROSS = 2;

const EMPTY = 0, BLOCKED = 1, ROAD = 2, PARCEL = 3, MARKET = 4, UNKNOWN = 5;

/** the calibrated values (R_C, JOIN_DEEP, CROSS); the calibration tries others (tools/settlement/streets_probe.ts) */
export const DEFAULT_TUNING: Tuning = { rc: R_C, join: JOIN_DEEP, cross: CROSS };
export interface Tuning { rc: number; join: number; cross: number; /** false: the dead ends left after the parcels stay (the calibration) */ ends?: boolean; /** count the junctions and the blocks (the calibration and the tests; the register does not need them) */ measure?: boolean }

/** the ground a town is laid on: whether a street or a parcel can lie on the metre at (x, z) (metres east and south
 *  of the centre), whether a parcel's house can stand (`stands`, optional), and the metres beyond which nothing is free */
export interface TownGround { free: (x: number, z: number) => boolean; stands?: (p: Parcel) => boolean; reach: number }

/** how far from the centre the market looks for open ground, in parcel depths. PLACEHOLDER */
const MARKET_SEARCH = 3;

/** the offsets of a square of 2q + 1 by 2q + 1, the nearest first (ties: north before south, west before east) */
const offsets = new Map<number, Int16Array>();
const offsetsOf = (q: number) => {
  let o = offsets.get(q);
  if (!o) {
    const all: [number, number][] = [];
    for (let z = -q; z <= q; z++) for (let x = -q; x <= q; x++) if (x * x + z * z <= q * q) all.push([x, z]);
    all.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) || a[1] - b[1] || a[0] - b[0]);
    o = Int16Array.from(all.flat()); offsets.set(q, o);
  }
  return o;
};

/** Where the market of a town lies: the middle nearest the centre whose square and the street round it lie on
 *  open ground. In the world graphic the church stands at the centre (src/worldprobe/settle.ts), and the market lies
 *  beside it, as the market of many a medieval town lay at the church (OWN RULE). Without such ground within
 *  MARKET_SEARCH parcel depths, within four times as far (a town whose landmarks take the open ground at its centre,
 *  feature 5), and without it at all at the centre. */
function marketAt(size: ParcelSize, free: (x: number, z: number) => boolean): [number, number] {
  // first near (most churches are small), then as far as the search goes: the same answer, the nearest first
  return marketWithin(size, free, Math.round(size.d)) ?? marketWithin(size, free, Math.round(MARKET_SEARCH * size.d)) ?? marketWithin(size, free, Math.round(4 * MARKET_SEARCH * size.d)) ?? [0, 0];
}
function marketWithin(size: ParcelSize, free: (x: number, z: number) => boolean, q: number): [number, number] | null {
  const { hw, half } = dims(size), k = half + 2 * hw, S = q + k, n = 2 * S + 2;
  // the blocked metres summed over the square of the search, to test a market's square in one step
  const taken = new Int32Array(n * n);
  for (let z = 1; z < n; z++) for (let x = 1, row = 0; x < n; x++) {
    if (!free(x - 1 - S, z - 1 - S)) row++;
    taken[z * n + x] = taken[(z - 1) * n + x] + row;
  }
  const o = offsetsOf(q);
  for (let j = 0; j < o.length; j += 2) {
    const a = o[j] - k + S, b = o[j + 1] - k + S, c = o[j] + k + S + 1, d = o[j + 1] + k + S + 1;
    if (taken[d * n + c] - taken[b * n + c] - taken[d * n + a] + taken[b * n + a] === 0) return [o[j], o[j + 1]];
  }
  return null;
}

/** the radius the parcels of a town take packed round its market, their streets with them, in its steps */
const packedRadius = (families: number, size: ParcelSize) =>
  Math.sqrt((families * Math.max(1, Math.round(size.w)) * Math.max(1, Math.round(size.d))) / PARCEL_SHARE / Math.PI) + dims(size).half;

/** a town's street half-width and market half-side, in its own steps */
const dims = (size: ParcelSize) => {
  const hw = Math.max(1, Math.round(streetWidth(size) / 2));
  return { hw, half: Math.max(hw, Math.round(marketSide(size) / 2)) };
};

/**
 * The streets, the market and the parcels of a town of `families` families with parcels of `size` (whole steps of
 * the plan: src/sim/systems/lots.ts lays a town in steps of about a metre that its parcel fills exactly). `ways`: the
 * ways of the world that leave it (src/sim/content/town_ways_<year>.json). `ground` (optional): where the town can
 * build (TownGround). `seed`: the town's own draw. Every coordinate is in steps east and south of the town's centre.
 */
export function layTown(families: number, size: ParcelSize, ways: readonly Way[], seed: number, ground?: TownGround, tune: Tuning = DEFAULT_TUNING, plan?: Plan): Town {
  // the plan is laid round the market, and moved to where it lies; where the ground round it does not hold every
  // family (a river between it and the rest of the ground: there are no bridges yet), round the centre. A town with
  // a real plan has its market where the plan has it.
  // a real plan in steps: the walled town's radius becomes twice the radius of the town packed round its market, about
  // where the density of the families falls to a tenth (r − half ~ Gamma(2, r_c), r_c = R_C × packed: 90 % lie
  // within 3.9 r_c ≈ 2 packed). OWN RULE: the wall held the town.
  const r = 2 * packedRadius(families, size);
  const real = plan && { market: [plan.market[0] * r, plan.market[1] * r] as const, streets: plan.streets.map((q) => q.map((v) => v * r)) };
  const [ox, oz] = real ? [Math.round(real.market[0]), Math.round(real.market[1])] : ground ? marketAt(size, ground.free) : [0, 0];
  const t = layAround(families, size, ways, seed, ground, tune, ox, oz, real);
  if (t.parcels.length >= families || (!ox && !oz)) return t;
  const c = layAround(families, size, ways, seed, ground, tune, 0, 0, real);
  return c.parcels.length > t.parcels.length ? c : t;
}

function layAround(families: number, size: ParcelSize, ways: readonly Way[], seed: number, ground: TownGround | undefined, tune: Tuning, ox: number, oz: number, plan?: Plan): Town {
  // the pieces of the real plan, round the market as the town is laid
  const main = plan?.streets.map((q) => [Math.round(q[0]) - ox, Math.round(q[1]) - oz, Math.round(q[2]) - ox, Math.round(q[3]) - oz] as const);
  const g: TownGround | undefined = ground && (ox || oz) ? {
    free: (x, z) => ground.free(x + ox, z + oz),
    stands: ground.stands && ((p) => ground.stands!({ x: p.x + ox, z: p.z + oz, front: p.front })),
    reach: ground.reach + Math.hypot(ox, oz),
  } : ground;
  // where the streets close in before every family has a parcel, the families spread wider: the density's r_c grows
  // by half until they all have one (OWN RULE; counted in `spread`)
  let best: Town | null = null;
  for (let k = 0; k < 8; k++) {
    const t = layOnce(families, size, ways, seed, g?.free, g?.stands, g?.reach ?? Infinity, tune.rc * Math.pow(1.5, k), tune, main);
    t.spread = k;
    if (!best || t.parcels.length > best.parcels.length) best = t;
    if (t.parcels.length >= families) break;
  }
  const t = best!;
  if (!ox && !oz) return t;
  return {
    ...t,
    parcels: t.parcels.map((p) => ({ x: p.x + ox, z: p.z + oz, front: p.front })),
    streets: t.streets.map((q) => ({ x0: q.x0 + ox, z0: q.z0 + oz, x1: q.x1 + ox, z1: q.z1 + oz, kind: q.kind })),
    market: { x: ox, z: oz, half: t.market.half },
  };
}

// the grids of one town, kept between towns (a town is laid at a time) and cleared for each: allocating them anew
// for every town cost more than laying its streets
const grids8: Uint8Array[] = [], grids32: Int32Array[] = [];
const scratch8 = (k: number, n: number) => { if (!grids8[k] || grids8[k].length < n) grids8[k] = new Uint8Array(n); const a = grids8[k].subarray(0, n); a.fill(0); return a; };
const scratch32 = (k: number, n: number) => { if (!grids32[k] || grids32[k].length < n) grids32[k] = new Int32Array(n); const a = grids32[k].subarray(0, n); a.fill(0); return a; };

function layOnce(families: number, size: ParcelSize, ways: readonly Way[], seed: number, free: ((x: number, z: number) => boolean) | undefined, stands: ((p: Parcel) => boolean) | undefined, reach: number, share: number, tune: Tuning, main?: readonly (readonly number[])[]): Town {
  const JOIN = tune.join, CROSSING = tune.cross;
  const w = Math.max(1, Math.round(size.w)), d = Math.max(1, Math.round(size.d));
  const { hw, half } = dims(size);
  const packed = packedRadius(families, size);
  const R = Math.ceil(Math.min(reach, Math.max(2 * packed, 3 * d) * Math.max(1, share / tune.rc) + 2 * d + 4 * hw)), N = 2 * R + 1;
  const cell = scratch8(0, N * N), line = scratch8(1, N * N), kind = scratch8(2, N * N);
  const at = (x: number, z: number) => (z + R) * N + (x + R);
  const inside = (x: number, z: number) => x >= -R && x <= R && z >= -R && z <= R;
  // the ground is asked only where the town looks (UNKNOWN until then)
  if (free) cell.fill(UNKNOWN);
  const st = (i: number) => { const v = cell[i]; if (v !== UNKNOWN) return v; const r = free!((i % N) - R, Math.floor(i / N) - R) ? EMPTY : BLOCKED; cell[i] = r; return r; };

  // 1. the market: open ground round the centre, its edge a street that parcels front
  for (let z = -half; z <= half; z++) for (let x = -half; x <= half; x++) cell[at(x, z)] = MARKET;
  const owner = scratch32(0, N * N); let laneNo = 1;
  /** the cells of the middle lines, in the order laid; and per cell the sides on which no parcel can lie any more
   *  (the ground beside a street only fills up, so a side that failed stays failed) */
  const all: number[] = [], dead = scratch8(3, N * N), xdead = scratch8(4, N * N), order = scratch32(1, N * N);
  // the middle-line cells sorted into buckets of BUCKET metres, to look for parcels round a spot from near to far
  const BUCKET = 16, NB = Math.ceil(N / BUCKET), lineBuckets: number[][] = Array.from({ length: NB * NB }, () => []);
  // the parcels a street cell could front, one per side (key: cell × 4 + side), in buckets of CB metres by the
  // middle the parcel would have (CX, CZ from the cell); the parcel lies 0 north, 1 east, 2 south, 3 west of it
  const CB = 8, NC = Math.ceil(N / CB), cbuckets: number[][] = Array.from({ length: NC * NC }, () => []);
  const off = hw + 1 + (d - 1) / 2, along = -Math.floor(w / 2) + (w - 1) / 2;
  const CX = [along, off, along, -off], CZ = [-off, along, off, along];
  const lay = (x: number, z: number, k: number) => {
    if (!line[at(x, z)]) {
      const i = at(x, z);
      owner[i] = laneNo; order[i] = all.length; all.push(i);
      lineBuckets[Math.floor((z + R) / BUCKET) * NB + Math.floor((x + R) / BUCKET)].push(i);
      for (let side = 0; side < 4; side++) {
        const cx = Math.max(-R, Math.min(R, Math.floor(x + CX[side]))), cz = Math.max(-R, Math.min(R, Math.floor(z + CZ[side])));
        cbuckets[Math.floor((cz + R) / CB) * NC + Math.floor((cx + R) / CB)].push(i * 4 + side);
      }
    }
    else { kind[at(x, z)] = Math.max(kind[at(x, z)], k); return; } // its width is road already (a road stays road)
    line[at(x, z)] = 1; kind[at(x, z)] = k;
    const xa = Math.max(-R, x - hw), xb = Math.min(R, x + hw);
    for (let qz = Math.max(-R, z - hw); qz <= Math.min(R, z + hw); qz++) for (let i = at(xa, qz), e = i + xb - xa; i <= e; i++) if (cell[i] !== MARKET) cell[i] = ROAD;
  };
  /** a street can pass a spot: its width there is on the grid and holds no parcel, no blocked ground */
  const passable = (x: number, z: number) => {
    if (x - hw < -R || x + hw > R || z - hw < -R || z + hw > R) return false;
    for (let qz = z - hw; qz <= z + hw; qz++) for (let i = at(x - hw, qz), e = i + 2 * hw; i <= e; i++) {
      const c = cell[i] === UNKNOWN ? st(i) : cell[i];
      if (c === PARCEL || c === BLOCKED) return false;
    }
    return true;
  };
  const ring = half + hw;
  for (let k = -ring; k <= ring; k++) { lay(k, -ring, STREET.lane); lay(k, ring, STREET.lane); lay(-ring, k, STREET.lane); lay(ring, k, STREET.lane); }

  const isLine = (x: number, z: number) => inside(x, z) && line[at(x, z)] === 1;
  const STEP = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  /** every dead end runs on to the nearest street ahead of it or to either side within JOIN parcel depths, straight
   *  over ground without parcels, as a lane does when it is grown (4b below): a loop instead of a dead end (Emilien
   *  et al. 2012, Sec. 4.3) */
  const joinEnds = () => {
    for (const i of all.slice()) {
      const x = (i % N) - R, z = Math.floor(i / N) - R, nb = STEP.filter(([dx, dz]) => isLine(x + dx, z + dz));
      if (nb.length !== 1) continue;
      const last = STEP.findIndex(([dx, dz]) => dx === -nb[0][0] && dz === -nb[0][1]);
      let best: [number, number][] | null = null;
      for (const q of [last, (last + 1) % 4, (last + 3) % 4]) {
        const [dx, dz] = STEP[q], path: [number, number][] = [];
        let px = x, pz = z;
        for (let n = 0; n < JOIN * d + 2 * hw + 2 && (!best || path.length < best.length); n++) {
          px += dx; pz += dz;
          if (n > hw && isLine(px, pz)) { best = path.slice(); break; }
          if (!passable(px, pz)) break;
          path.push([px, pz]);
        }
      }
      if (best) for (const [qx, qz] of best) lay(qx, qz, STREET.lane);
    }
  };
  // 2. a town with a real plan: its main streets, where their ground lets a street pass (water, rock, the edge of the
  // town's ground: the piece goes on beyond it, as a bridge or a street round it is not laid). They are the old roads
  // through the town (Conzen 1960: the plan of the streets outlives the houses), so they are laid as roads.
  if (main) {
    for (const [x0, z0, x1, z1] of main) {
      const n = Math.abs(x1 - x0) + Math.abs(z1 - z0), sx = Math.sign(x1 - x0), sz = Math.sign(z1 - z0);
      for (let k = 0; k <= n; k++) { const x = x0 + k * sx, z = z0 + k * sz; if (passable(x, z)) lay(x, z, STREET.road); }
    }
    // a main street that ends short of another (its real course went on in a street the plan does not keep, or over
    // water) runs on to the nearest street, as a dead end does at the end (joinEnds)
    joinEnds();
  }
  // otherwise a street out along each way, by the nearest of the four directions; a town with one way or none is one street through it
  else {
    const dirs = new Map<number, number>(); // 0 east, 1 south, 2 west, 3 north -> the street's kind
    for (const wy of ways) { const q = ((Math.round(wy.a / (Math.PI / 2)) % 4) + 4) % 4; dirs.set(q, Math.max(dirs.get(q) ?? -1, wy.k + 1)); }
    if (dirs.size === 0) dirs.set(0, STREET.track);
    if (dirs.size === 1) { const [q, k] = [...dirs][0]; dirs.set((q + 2) % 4, k); }
    const armLength = Math.max(packed, 2 * d) + d;
    for (const [q, k] of dirs) {
      const [sx, sz] = STEP[q];
      let x = sx * ring, z = sz * ring;
      for (let n = 0; n < armLength && inside(x + sx * (hw + 1), z + sz * (hw + 1)); n++) {
        x += sx; z += sz;
        if (!passable(x, z)) break; // the way meets water or rock: the street ends there
        lay(x, z, k);
      }
    }
  }

  // 3. the spots of the families, drawn from the exponential density round the market, the nearest first
  const rng = seedRng(seed);
  const rc = share * packed, spots: [number, number][] = [];
  for (let f = 0; f < families; f++) {
    let sx = 0, sz = 0;
    for (let tries = 0; tries < 64; tries++) {
      const r = half + rc * -Math.log(Math.max(1e-12, rand(rng)) * Math.max(1e-12, rand(rng))), a = 2 * Math.PI * rand(rng); // r − half ~ Gamma(2, r_c): density ∝ e^(−r/r_c) on the plane
      sx = Math.round(r * Math.cos(a)); sz = Math.round(r * Math.sin(a));
      if (inside(sx, sz) && st(at(sx, sz)) === EMPTY) break;
    }
    spots.push([sx, sz]);
  }
  spots.sort((p, q) => Math.hypot(p[0], p[1]) - Math.hypot(q[0], q[1]) || p[1] - q[1] || p[0] - q[0]);

  // a parcel at the street through (x, z), on the side `side` of it; null where it cannot lie
  const slot = (x: number, z: number, side: number): (Parcel & { cx: number; cz: number }) | null => {
    // side: the parcel lies 0 north, 1 east, 2 south, 3 west of the street; it fronts the street on the opposite side
    const across = side === 0 || side === 2, sign = side === 0 || side === 3 ? -1 : 1;
    const a0 = (across ? x : z) - Math.floor(w / 2), b0 = (across ? z : x) + sign * (hw + 1);
    let lo = Infinity, hi = -Infinity;
    for (let b = 0; b < d; b++) for (let a = 0; a < w; a++) {
      const px = across ? a0 + a : b0 + sign * b, pz = across ? b0 + sign * b : a0 + a;
      if (!inside(px, pz) || st(at(px, pz)) !== EMPTY) return null;
      lo = Math.min(lo, across ? pz : px); hi = Math.max(hi, across ? pz : px);
    }
    const along = a0 + (w - 1) / 2, into = (lo + hi) / 2;
    const cx = across ? along : into, cz = across ? into : along;
    const p = { x: cx, z: cz, front: (side + 2) % 4 === 0 ? FRONT.north : side === 3 ? FRONT.east : side === 0 ? FRONT.south : FRONT.west, cx, cz };
    return !stands || stands(p) ? p : null; // (the ground does not change: a parcel that cannot stand there never can)
  };
  const take = (p: Parcel) => {
    const across = p.front === FRONT.north || p.front === FRONT.south;
    const ww = across ? w : d, dd = across ? d : w, x0 = Math.round(p.x - (ww - 1) / 2), z0 = Math.round(p.z - (dd - 1) / 2);
    for (let z = z0; z < z0 + dd; z++) for (let x = x0; x < x0 + ww; x++) cell[at(x, z)] = PARCEL;
  };
  /** the best parcel within `range` metres of a spot: at a street, nearest the spot (ties: the cell, then the side) */
  const nearest = (sx: number, sz: number, range: number) => {
    // the candidates sit in buckets by the middle their parcel would have: ring of buckets by ring round the spot,
    // tested from the nearest middle on, as soon as no ring farther out can hold a nearer one
    const bx = Math.floor((Math.max(-R, Math.min(R, sx)) + R) / CB), bz = Math.floor((Math.max(-R, Math.min(R, sz)) + R) / CB);
    const pd: number[] = [], pk: number[] = [];
    let idx: number[] = [];
    const visit = (qx: number, qz: number) => {
      const list = cbuckets[qz * NC + qx];
      let keep = 0;
      for (const key of list) {
        const i = key >> 2, side = key & 3;
        if (dead[i] & (1 << side)) continue; // its parcel could not lie there: the ground only fills up
        list[keep++] = key;
        // a parcel fronts a street that runs along its front (the middle lines keep off the edge of the box)
        if (side === 0 || side === 2 ? !(line[i - 1] || line[i + 1]) : !(line[i - N] || line[i + N])) continue;
        const dist = Math.hypot((i % N) - R + CX[side] - sx, Math.floor(i / N) - R + CZ[side] - sz);
        if (dist <= range) { idx.push(pd.length); pd.push(dist); pk.push(key); }
      }
      list.length = keep;
    };
    for (let ring = 0; ring < NC; ring++) {
      for (let qz = Math.max(0, bz - ring); qz <= Math.min(NC - 1, bz + ring); qz++) {
        if (qz === bz - ring || qz === bz + ring) { for (let qx = Math.max(0, bx - ring); qx <= Math.min(NC - 1, bx + ring); qx++) visit(qx, qz); continue; }
        if (bx - ring >= 0) visit(bx - ring, qz);
        if (bx + ring < NC) visit(bx + ring, qz);
      }
      const bound = ring + 1 < NC ? ring * CB : Infinity; // a middle in a farther ring lies farther than this
      idx.sort((a, b) => pd[a] - pd[b] || pk[a] - pk[b]);
      let k = 0;
      for (; k < idx.length && pd[idx[k]] <= bound; k++) {
        const key = pk[idx[k]], i = key >> 2, side = key & 3, s = slot((i % N) - R, Math.floor(i / N) - R, side);
        if (s) return { x: s.x, z: s.z, front: s.front } as Parcel;
        dead[i] |= 1 << side;
      }
      idx = idx.slice(k);
    }
    return null;
  };
  /** the point of the street network nearest a spot */
  const nearestLine = (sx: number, sz: number): [number, number] | null => {
    let hit: [number, number] | null = null, hd = Infinity;
    const bx = Math.floor((Math.max(-R, Math.min(R, sx)) + R) / BUCKET), bz = Math.floor((Math.max(-R, Math.min(R, sz)) + R) / BUCKET);
    for (let ring = 0; ring < NB && (ring - 1) * BUCKET <= hd; ring++) {
      for (let qz = bz - ring; qz <= bz + ring; qz++) for (let qx = bx - ring; qx <= bx + ring; qx++) {
        if (Math.max(Math.abs(qx - bx), Math.abs(qz - bz)) !== ring || qx < 0 || qz < 0 || qx >= NB || qz >= NB) continue;
        for (const i of lineBuckets[qz * NB + qx]) {
          const x = (i % N) - R, z = Math.floor(i / N) - R, dd = Math.hypot(x - sx, z - sz);
          if (dd < hd || (dd === hd && (z < hit![1] || (z === hit![1] && x < hit![0])))) { hd = dd; hit = [x, z]; }
        }
      }
    }
    return hit;
  };
  /** whether the street width at (x, z) belongs to a street that lies ahead in the direction (dx, dz), within hw + 1 */
  const nearLine = (x: number, z: number, dx: number, dz: number) => { for (let k = 1; k <= hw + 1; k++) if (isLine(x + k * dx, z + k * dz)) return true; return false; };
  /** where a lane to a spot leaves the network: the point nearest the spot, or, within a parcel's width farther, a
   *  T-junction whose open side faces the spot, so that the lane crosses the street there instead of meeting it
   *  beside the other lane (OWN RULE, calibrated against the share of crossings, CROSS) */
  const startOf = (sx: number, sz: number): [number, number] | null => {
    const m = nearestLine(sx, sz);
    if (!m) return null;
    const r0 = Math.hypot(m[0] - sx, m[1] - sz), r1 = Math.ceil(r0 + CROSSING * w);
    let best = m, score = r0, bestOrder = -1;
    const x0 = Math.floor((Math.max(-R, sx - r1) + R) / BUCKET), x1 = Math.floor((Math.min(R, sx + r1) + R) / BUCKET);
    const z0 = Math.floor((Math.max(-R, sz - r1) + R) / BUCKET), z1 = Math.floor((Math.min(R, sz + r1) + R) / BUCKET);
    for (let qz = z0; qz <= z1; qz++) for (let qx = x0; qx <= x1; qx++) for (const i of lineBuckets[qz * NB + qx]) {
      const x = (i % N) - R, z = Math.floor(i / N) - R;
      if (Math.abs(x - sx) > r1 || Math.abs(z - sz) > r1) continue;
      let open = 0, ox = 0, oz = 0;
      for (const [dx, dz] of STEP) if (!isLine(x + dx, z + dz)) { open++; ox = dx; oz = dz; }
      if (open !== 1) continue;
      const dist = Math.hypot(x - sx, z - sz), sc = dist - CROSSING * w;
      if (ox * (sx - x) + oz * (sz - z) <= 0 || sc > score || (sc === score && (bestOrder < 0 || order[i] > bestOrder))) continue;
      best = [x, z]; score = sc; bestOrder = order[i];
    }
    return best;
  };
  /** a lane grows from the network towards a spot: from the nearest point, a block at a time along the axis that shortens the way most (MM′ ∝ u_A), until the spot lies beside it */
  /** another lane's middle line within two street half-widths of (x, z): 0 none, k > 0 the steps to it straight
   *  ahead in the direction (dx, dz), −1 one beside */
  const foreign = (x: number, z: number, dx: number, dz: number): number => {
    for (let k = 0; k <= 2 * hw; k++) if (isLine(x + k * dx, z + k * dz) && owner[at(x + k * dx, z + k * dz)] !== laneNo) return k + 1;
    const xa = Math.max(-R, x - 2 * hw), xb = Math.min(R, x + 2 * hw);
    for (let qz = Math.max(-R, z - 2 * hw); qz <= Math.min(R, z + 2 * hw); qz++) for (let qx = xa, i = at(xa, qz); qx <= xb; qx++, i++) {
      if (!line[i] || owner[i] === laneNo) continue;
      const ex = qx - x, ez = qz - z;
      // behind the lane's head (the street it leaves, or its own turn) does not count
      if (ex * dx + ez * dz < 0) continue;
      return -1;
    }
    return 0;
  };
  const grow = (sx: number, sz: number) => {
    laneNo++;
    const m = startOf(sx, sz);
    if (!m) return;
    let [x, z] = m, last = -1, axis = -1; // axis 0 east-west, 1 north-south
    const reachSide = hw + 1 + d / 2;
    // the lane leaves its street square to it, and keeps off the width of the other streets (it would run in them)
    const ew = isLine(x - 1, z) || isLine(x + 1, z), ns = isLine(x, z - 1) || isLine(x, z + 1);
    if (ew !== ns) axis = ew ? 1 : 0;
    const open = STEP.filter(([dx, dz]) => !isLine(x + dx, z + dz));
    if (open.length === 1) axis = open[0][0] !== 0 ? 0 : 1; // from a T-junction, out of its open side: a crossing
    const out = hw + 1;
    for (let n = 0; n < 4 * R; n++) {
      const ux = sx - x, uz = sz - z;
      // beside the spot: the spot lies within half a parcel's depth beyond the street's edge, across the street
      if ((Math.abs(ux) <= w / 2 && Math.abs(uz) <= reachSide) || (Math.abs(uz) <= w / 2 && Math.abs(ux) <= reachSide)) break;
      // the axis with the larger part of the direction to the spot (MM′ ∝ u_A on the blocks); a lane keeps its axis
      // until the spot lies beside it, so that it turns once at a right angle instead of stepping
      const left = (a: number) => (a === 0 ? Math.abs(ux) > w / 2 : Math.abs(uz) > reachSide);
      if (n >= out && (axis < 0 || !left(axis))) axis = Math.abs(ux) >= Math.abs(uz) ? 0 : 1;
      let moved = false, joined = false;
      for (let t = 0; t < (n < out && axis >= 0 ? 1 : 2); t++) {
        const a = t === 0 ? axis : 1 - axis;
        const dx = a === 0 ? Math.sign(ux) : 0, dz = a === 1 ? Math.sign(uz) : 0;
        if ((dx === 0 && dz === 0) || !passable(x + dx, z + dz)) continue;
        const i = at(x + dx, z + dz);
        if (n >= out && line[i]) { joined = true; break; } // it meets another street: the lane ends on it
        const meet = n >= out ? foreign(x + dx, z + dz, dx, dz) : 0;
        if (meet < 0) continue; // it would run beside another street, their widths one over the other
        if (meet > 0) { for (let k = 1; k < meet; k++) lay(x + k * dx, z + k * dz, STREET.lane); joined = true; break; } // another street lies just ahead: the lane runs on to it and ends there
        x += dx; z += dz; lay(x, z, STREET.lane); moved = true; axis = a; last = dx !== 0 ? (dx > 0 ? 0 : 2) : dz > 0 ? 1 : 3;
        break;
      }
      if (joined) return;
      if (!moved) break;
    }
    // 4b. a lane that would end blind runs on to the nearest street ahead of it or to either side, if one lies within
    // JOIN_DEEP parcel depths: a loop instead of a dead end (Emilien et al. 2012, Sec. 4.3, the closest road node in a
    // cone round the road's direction)
    if (last < 0) return;
    let best: [number, number][] | null = null;
    for (const q of [last, (last + 1) % 4, (last + 3) % 4]) {
      const [dx, dz] = STEP[q], path: [number, number][] = [];
      let px = x, pz = z;
      for (let n = 0; n < JOIN * d + 2 * hw + 2 && (!best || path.length < best.length); n++) {
        px += dx; pz += dz;
        if (!inside(px, pz)) break;
        if (n > hw && isLine(px, pz)) { best = path.slice(); break; }
        if (!passable(px, pz) || (n > hw && cell[at(px, pz)] === ROAD && !nearLine(px, pz, dx, dz))) break;
        path.push([px, pz]);
      }
    }
    if (best) for (const [qx, qz] of best) lay(qx, qz, STREET.lane);
  };

  /** a lane two parcels deep into open ground, square from the street point nearest the spot that has such ground beside it; false where there is none */
  const explore = (sx: number, sz: number): boolean => {
    laneNo++;
    const len = hw + 1 + 2 * d;
    // the street points from the nearest on, ring of buckets by ring (ties in the order laid)
    const bx = Math.floor((Math.max(-R, Math.min(R, sx)) + R) / BUCKET), bz = Math.floor((Math.max(-R, Math.min(R, sz)) + R) / BUCKET);
    let pending: [number, number, number, number][] = [];
    for (let ring = 0; ring < NB; ring++) {
      for (let qz = bz - ring; qz <= bz + ring; qz++) for (let qx = bx - ring; qx <= bx + ring; qx++) {
        if (Math.max(Math.abs(qx - bx), Math.abs(qz - bz)) !== ring || qx < 0 || qz < 0 || qx >= NB || qz >= NB) continue;
        for (const i of lineBuckets[qz * NB + qx]) { if (xdead[i] === 15) continue; const x = (i % N) - R, z = Math.floor(i / N) - R; pending.push([x, z, Math.hypot(x - sx, z - sz), order[i]]); }
      }
      const bound = ring + 1 < NB ? ring * BUCKET : Infinity; // no point of a farther ring lies nearer
      pending.sort((a, b) => a[2] - b[2] || a[3] - b[3]);
      let k = 0;
      for (; k < pending.length && pending[k][2] < bound; k++) {
        const [x, z] = pending[k];
        if (tryFrom(x, z)) return true;
      }
      pending = pending.slice(k);
    }
    return false;
  };
  const tryFrom = (x: number, z: number): boolean => {
    const len = hw + 1 + 2 * d;
    {
      const ew = isLine(x - 1, z) || isLine(x + 1, z), ns = isLine(x, z - 1) || isLine(x, z + 1);
      let deg = 0; for (const [dx, dz] of STEP) if (isLine(x + dx, z + dz)) deg++;
      const c = at(x, z);
      for (let q = 0; q < 4; q++) {
        if (xdead[c] & (1 << q)) continue;
        const [bx, bz] = STEP[(q + 2) % 4];
        const onward = deg === 1 && isLine(x + bx, z + bz); // a dead end runs on
        if (!onward && ((q === 0 || q === 2) ? !ns || ew : !ew || ns)) continue; // else square from a straight piece of street
        const [dx, dz] = STEP[q];
        let ok = true;
        for (let k = 1; k <= len && ok; k++) {
          const px = x + k * dx, pz = z + k * dz;
          // the ground only fills up: a way that is shut stays shut (unless only a dead end's onward rule shut it)
          if (!passable(px, pz)) { ok = false; xdead[c] |= 1 << q; }
          else if ((onward || k > hw) && (line[at(px, pz)] || cell[at(px, pz)] === MARKET || (k > hw && st(at(px, pz)) !== EMPTY))) { ok = false; if (k > hw) xdead[c] |= 1 << q; }
        }
        if (!ok) continue;
        for (let k = 1; k <= len; k++) lay(x + k * dx, z + k * dz, STREET.lane);
        return true;
      }
    }
    return false;
  };

  // 4. the families, the nearest spot first. First the lanes: a spot no street passes near makes the nearest street
  // grow to it (all centres are there before the parcels are cut, as in Barthelemy & Flammini 2008, where the roads
  // grow to the centres); then the parcels, each at the street nearest its spot
  const served = (sx: number, sz: number) => { const m = nearestLine(sx, sz); return !!m && Math.hypot(m[0] - sx, m[1] - sz) <= hw + 1 + NEAR_DEEP * d; };
  for (const [sx, sz] of spots) if (inside(sx, sz) && st(at(sx, sz)) === EMPTY && !served(sx, sz)) grow(sx, sz);
  const parcels: Parcel[] = [];
  for (const [sx, sz] of spots) {
    let p: Parcel | null = null;
    // the nearest parcel at a street, looking ever farther where the ground near the spot is taken
    p = nearest(sx, sz, Infinity);
    // the streets are full: a lane to the spot through the open ground, else a new lane into the open ground
    // nearest the spot, square from a street (exploration, Strano et al. 2012)
    if (!p) { grow(sx, sz); p = nearest(sx, sz, Infinity); }
    for (let tries = 0; !p && tries < 8 && explore(sx, sz); tries++) p = nearest(sx, sz, Infinity);
    if (!p) break; // no ground left within the reach
    take(p); parcels.push(p);
  }
  // 5. the dead ends that are left run on to the nearest street where no parcel stands in the way
  if (tune.ends !== false) joinEnds();

  // the streets as straight pieces, and what the network looks like
  const streets: Street[] = [];
  const sorted = all.slice().sort((a, b) => a - b); // north to south, west to east
  for (const i of sorted) {
    const x = (i % N) - R, z = Math.floor(i / N) - R;
    // a piece runs over the cells of one kind, and on into the street of another kind it meets, so that they join
    const k = kind[at(x, z)];
    if (isLine(x + 1, z) && (!isLine(x - 1, z) || kind[at(x - 1, z)] !== k)) {
      let e = x; while (isLine(e + 1, z) && kind[at(e + 1, z)] === k) e++;
      if (e > x) streets.push({ x0: isLine(x - 1, z) ? x - 1 : x, z0: z, x1: isLine(e + 1, z) ? e + 1 : e, z1: z, kind: k });
    }
    if (isLine(x, z + 1) && (!isLine(x, z - 1) || kind[at(x, z - 1)] !== k)) {
      let e = z; while (isLine(x, e + 1) && kind[at(x, e + 1)] === k) e++;
      if (e > z) streets.push({ x0: x, z0: isLine(x, z - 1) ? z - 1 : z, x1: x, z1: isLine(x, e + 1) ? e + 1 : e, kind: k });
    }
  }
  const nodes = { ends: 0, bends: 0, tees: 0, crosses: 0 };
  if (tune.measure) for (const i of all) {
    const x = (i % N) - R, z = Math.floor(i / N) - R;
    const e = +isLine(x + 1, z), wv = +isLine(x - 1, z), s = +isLine(x, z + 1), n = +isLine(x, z - 1), deg = e + wv + s + n;
    if (deg === 1) nodes.ends++;
    else if (deg === 2 && e + wv === 1) nodes.bends++;
    else if (deg === 3) nodes.tees++;
    else if (deg === 4) nodes.crosses++;
  }
  // the blocks: ground the street lines enclose, found as the pieces of the plane between the lines that do not reach the edge of the town's box
  const box = (() => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const i of all) { const x = (i % N) - R, z = Math.floor(i / N) - R; x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    return { x0, z0, x1, z1 };
  })();
  const blocks: number[] = [];
  if (tune.measure && box.x0 <= box.x1) {
    const seen = new Uint8Array(N * N), stack: number[] = [];
    for (let z = box.z0; z <= box.z1; z++) for (let x = box.x0; x <= box.x1; x++) {
      const i0 = at(x, z);
      if (seen[i0] || line[i0] || cell[i0] === MARKET) continue;
      let area = 0, open = false;
      stack.push(i0); seen[i0] = 1;
      while (stack.length) {
        const i = stack.pop()!, cx = (i % N) - R, cz = Math.floor(i / N) - R;
        area++;
        for (const [dx, dz] of STEP) {
          const nx = cx + dx, nz = cz + dz;
          if (nx < box.x0 || nx > box.x1 || nz < box.z0 || nz > box.z1) { open = true; continue; }
          const j = at(nx, nz);
          if (seen[j] || line[j] || cell[j] === MARKET) continue;
          seen[j] = 1; stack.push(j);
        }
      }
      if (!open) blocks.push(area);
    }
  }
  return { parcels, streets, market: { x: 0, z: 0, half }, nodes, blocks, width: 2 * hw + 1 };
}
