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
import { FRONT, PARCEL_SHARE, PARCELS_PER_ROW, type Parcel, type ParcelSize } from './rule';
import type { Plan } from './plan_ground';
import { familySpots } from './family_spots';
import { marketAt } from './market';
import { blockAreas, junctions, streetPieces } from './street_network';
import { STREET, type Town, type Way } from './town_layout';

/** The width of a street in metres: the share of Grenade's ground that is not parcels, around a block of two rows of
 *  PARCELS_PER_ROW parcels (feature 1, Boerefijn 2000): as wide as the grid of feature 1 made its streets. */
export const streetWidth = (p: ParcelSize) => PARCELS_PER_ROW * p.w * (1 / Math.sqrt(PARCEL_SHARE) - 1);

/** The side of the market square in metres: as deep as a parcel. PLACEHOLDER: no measure of a market read. */
export const marketSide = (p: ParcelSize) => p.d;

/** The characteristic distance of the density, as a share of the radius the parcels would take packed round the
 *  market (with their streets). Calibrated (tools/settlement/streets_probe.ts): the blocks of the world of 1291 fall
 *  off as A^−1.89 above 200 m², where Dresden's fall off as A^−1.9 (Lämmer et al. 2006). Recalibrated with JOIN_DEEP
 *  and CROSS when the towns got their townsfolk (settlement feature 7, 22 November 2026): 0.5 made 1.76 and left Paris
 *  0.04 dead ends; on the grid 0.3 to 0.8 this value and the two below meet all six shares of Paris best. */
export const R_C = 0.35;

/** a family's parcel lies at a street if one passes within this many parcel depths of its spot; else a street grows to it */
const NEAR_DEEP = 1;
/** a new street, and at the end every dead end, runs on to another that lies ahead of it or to either side within this
 *  many parcel depths. Calibrated against medieval Paris (the Vasserot cadastre inside the wall of Philippe Auguste,
 *  tools/settlement/cadastre_paris.py: dead ends 0.10, T-junctions 0.78, crossings 0.12), recalibrated with the
 *  landmarks laid before the streets (feature 5), and again with the townsfolk of feature 7 (R_C 0.35, CROSS 2): the
 *  towns of 20 streets and more get 0.14, 0.74, 0.13 and Paris 0.09, 0.82, 0.09; 3 (the value before) gives them
 *  0.14, 0.67, 0.19 and Paris 0.04 dead ends, 2 Paris 0.10 but the towns 0.15 */
const JOIN_DEEP = 2.25;
/** a lane leaves from a T-junction facing its spot rather than from the nearest point if that costs at most this many
 *  parcel widths more. Calibrated against the share of crossings of medieval Paris (0.12), with the landmarks laid
 *  before the streets (feature 5): 2 made 0.09 (and 0.14 dead ends), 2.5 made 0.12; with the townsfolk of feature 7
 *  2.5 makes 0.18 in the towns of 20 streets and more, 2 makes 0.13, 2.25 makes 0.16 */
const CROSS = 2;

const EMPTY = 0, BLOCKED = 1, ROAD = 2, PARCEL = 3, MARKET = 4, UNKNOWN = 5;

/** the calibrated values (R_C, JOIN_DEEP, CROSS); the calibration tries others (tools/settlement/streets_probe.ts) */
export const DEFAULT_TUNING: Tuning = { rc: R_C, join: JOIN_DEEP, cross: CROSS };
export interface Tuning { rc: number; join: number; cross: number; /** false: the dead ends left after the parcels stay (the calibration) */ ends?: boolean; /** count the junctions and the blocks (the calibration and the tests; the register does not need them) */ measure?: boolean }

/** the ground a town is laid on: whether a street or a parcel can lie on the metre at (x, z) (metres east and south
 *  of the centre), whether a parcel's house can stand (`stands`, optional), and the metres beyond which nothing is free */
export interface TownGround { free: (x: number, z: number) => boolean; stands?: (p: Parcel) => boolean; reach: number }

/** the radius the parcels of a town take packed round its market, their streets with them, in its steps */
const packedRadius = (families: number, size: ParcelSize) =>
  Math.sqrt((families * Math.max(1, Math.round(size.w)) * Math.max(1, Math.round(size.d))) / PARCEL_SHARE / Math.PI) + dims(size).half;

/** how far a town's streets reach from their middle lines, in its steps: `hw` and the middle line's own half step */
export const streetReach = (size: ParcelSize) => dims(size).hw + 0.5;

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
/** the metres of the world per real metre of a town laid by its real plan: its walled town as wide as twice the town
 *  packed round its market (layTown) */
export function planDraw(families: number, size: ParcelSize, radius: number): number {
  const W = Math.max(1, Math.round(size.w)), u = size.w / W, cells = { w: W, d: Math.max(1, Math.round(size.d / u)) };
  return (2 * packedRadius(families, cells) * u) / radius;
}

export function layTown(families: number, size: ParcelSize, ways: readonly Way[], seed: number, ground?: TownGround, tune: Tuning = DEFAULT_TUNING, plan?: Plan): Town {
  // the plan is laid round the market, and moved to where it lies; where the ground round it does not hold every
  // family (a river between it and the rest of the ground: there are no bridges yet), round the centre. A town with
  // a real plan has its market where the plan has it.
  // a real plan in steps: the walled town's radius becomes twice the radius of the town packed round its market, about
  // where the density of the families falls to a tenth (r − half ~ Gamma(2, r_c), r_c = R_C × packed: 90 % lie
  // within 3.9 r_c ≈ 2 packed). OWN RULE: the wall held the town.
  const r = 2 * packedRadius(families, size);
  const real = plan && { market: [plan.market[0] * r, plan.market[1] * r] as const, streets: plan.streets.map((q) => q.map((v) => v * r)) };
  const [ox, oz] = real ? [Math.round(real.market[0]), Math.round(real.market[1])] : ground ? marketAt(size, ground.free, dims(size)) : [0, 0];
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
    const t = layOnce(families, size, ways, seed, g?.free, g?.stands, g?.reach ?? Infinity, tune.rc * 1.5 ** k, tune, main);
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
  // the lane round the market, where its ground lets it pass (a town laid round its centre may find a landmark there)
  const ringLane = (x: number, z: number) => { if (passable(x, z)) lay(x, z, STREET.lane); };
  for (let k = -ring; k <= ring; k++) { ringLane(k, -ring); ringLane(k, ring); ringLane(-ring, k); ringLane(ring, k); }

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
  const spots = familySpots(families, seed, half, share * packed, (x, z) => inside(x, z) && st(at(x, z)) === EMPTY);

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

  // what the network looks like: its straight pieces, and for the calibration its junctions and blocks
  const grid = { all, line, kind, N, R };
  const streets = streetPieces(grid);
  const nodes = tune.measure ? junctions(grid) : { ends: 0, bends: 0, tees: 0, crosses: 0 };
  const blocks = tune.measure ? blockAreas(grid, (i) => cell[i] === MARKET) : [];
  return { parcels, streets, market: { x: 0, z: 0, half }, nodes, blocks, width: 2 * hw + 1 };
}
