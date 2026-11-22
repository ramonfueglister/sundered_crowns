// The figures of the first far step: the finest step's figures (src/figures/crowd.ts) on the blocks of the finest
// step that its columns hold, by the same rules and the same numbers, so that the same figure stands at the same place
// and goes the same way where the far step's ground is the finest step's. They are drawn as large as the houses and
// the trees of the step stand (zoom.ts `uprightOf`).
//
// A column of the first far step holds four blocks of the finest step, its quarters. What the finest step has on
// each of them that the column does not tell, far.ts lays down (`quarters`, a byte to a column): which quarters are
// street, the paving of a town on which nothing stands (settle.ts), which are built on as a house is, and which are
// ground of their own that is no house's. The crop of a quarter is that of its lot (crops.ts), a farmhouse is a
// building like any other. The farmers among the persons of the great cities work the furlongs of their town as at the
// finest step (src/figures/farmers.ts).
import {
  type Figures,
  type Town,
  type Where,
  fieldHands,
  figuresOf,
  gathered,
  loadTownPeople,
  lotOf,
  placeHands,
  placer,
} from '../figures';
import { Mat, N, idx, inGrid, onGrid } from '../lookprobe/layout';
import type { Part } from '../lookprobe/terrain';
import { cropAt } from './crops';
import type { Plan } from './far';
import { loadParcels, lotsOfTowns } from './lots';
import { PIECE } from './piece_sight';
import { RIM, type Table } from './table';
import { onWall } from './town_wall';
import { uprightOf } from './zoom';

/** the step whose columns hold four blocks of the finest step, the only far step that draws figures */
export const CROWD_AT = 1;
/** in a byte of `quarters`: the street bits from 1, the built bits from this one, one for each quarter */
const BUILT = 4;
/**
 * What the finest step has on a quarter, by its two bits (src/figures/crowd.ts `Where`, settle.ts `used`): open ground
 * (0); STREET; built on as a house is (HOUSE: settle.ts `used` 1 off the paving of a town, a house, a great building
 * or a town's wall), where nobody stands and about which people stand; or ground of its own (OWN), where nobody stands
 * or walks and that is no house's: a building on the paving of a town, the ground of a hamlet round its houses (`used`
 * 3), a town's wall on its street.
 */
const STREET = 1,
  HOUSE = 1 << BUILT,
  OWN = STREET | HOUSE;
/** which of a column's quarters a block of the finest step is (a column starts on an even block of the world) */
const quarterOf = (fx: number, fz: number) => (fx & 1) + 2 * (fz & 1);
/** what the finest step has on the quarter q of the column i (STREET, HOUSE, OWN or 0) */
const onQuarter = (quarters: ArrayLike<number> | undefined, i: number, q: number) => ((quarters?.[i] ?? 0) >> q) & OWN;
/** Marks the block fx, fz of the world, on the quarters of a ground whose first column is ox, oz, by `as(was)`. */
function mark(quarters: Uint8Array, ox: number, oz: number, fx: number, fz: number, as: (was: number) => number) {
  const x = (fx >> 1) - ox,
    z = (fz >> 1) - oz;
  if (!inGrid(x, z)) return;
  const i = idx(x, z),
    q = quarterOf(fx, fz);
  quarters[i] |= as(onQuarter(quarters, i, q)) << q;
}

/**
 * Marks the blocks of the finest step from fx0, fz0 to fx1, fz1 (world blocks, the ends not included) as built on,
 * in the quarters of a ground whose first column is the world block ox, oz of the first far step: as a house's, but
 * within the square of a town of `towns`, where the finest step paves round its buildings and does not count them as
 * houses (settle.ts: the town's `town` within its square three blocks round its buildings).
 */
export function builtOn(
  quarters: Uint8Array,
  ox: number,
  oz: number,
  fx0: number,
  fz0: number,
  fx1: number,
  fz1: number,
  towns: readonly Town[] = [],
) {
  const paved = (fx: number, fz: number) =>
    towns.some((t) => fx >= t.cx - t.half && fx < t.cx + t.half && fz >= t.cz - t.half && fz < t.cz + t.half);
  for (let fz = Math.floor(fz0); fz < Math.ceil(fz1); fz++)
    for (let fx = Math.floor(fx0); fx < Math.ceil(fx1); fx++)
      mark(quarters, ox, oz, fx, fz, () => (paved(fx, fz) ? OWN : HOUSE));
}
/**
 * Marks the blocks of the finest step that a town's wall runs over, after the town's street (`streetOn`): `pieces` in
 * blocks of a step `wider` finest blocks to its block from the town's middle cx, cz, a world block of the finest step
 * (town_wall.ts `townWorks`). The finest step lays the ring after all else (settle.ts, `used` 1): on open ground it
 * is a house's, on the street ground of its own, and a building's ground stays as it is.
 */
export function wallOn(
  quarters: Uint8Array,
  ox: number,
  oz: number,
  pieces: readonly (readonly number[])[],
  wider: number,
  cx: number,
  cz: number,
) {
  const fine = pieces.map((p) => p.slice(0, 4).map((v) => v * wider));
  onWall(fine, cx, cz, (fx, fz) =>
    mark(quarters, ox, oz, fx, fz, (was) => (was === 0 ? HOUSE : was === STREET ? OWN : 0)),
  );
}
/**
 * Marks the ground of the hamlets of the plan on the quarters of a ground whose first column is the world block ox, oz
 * of a step `wider` finest blocks to its block, as the finest step lays it (settle.ts, `used` 3): the open blocks one
 * block round their houses, on which nothing stands, grows or walks. After all that is built (`builtOn`, `wallOn`).
 */
export function hamletGroundOn(quarters: Uint8Array, ox: number, oz: number, plan: Plan, wider: number) {
  const hamlet = plan.houseKinds?.indexOf('hamlet') ?? -1,
    fine = (v: number) => Math.floor((v * wider) / plan.pieceBlocks);
  for (let pz = fine(oz); hamlet >= 0 && pz <= fine(oz + N); pz++)
    for (let px = fine(ox); px <= fine(ox + N); px++) {
      const houses = plan.pieces[`${px},${pz}`]?.houses ?? [];
      for (let k = 0; k + 8 < houses.length; k += 9) {
        if (houses[k + 8] !== hamlet) continue;
        const [hx, hz, w, d] = houses.slice(k, k + 4);
        for (let fz = hz - 1; fz <= hz + d; fz++)
          for (let fx = hx - 1; fx <= hx + w; fx++) mark(quarters, ox, oz, fx, fz, (was) => (was === 0 ? OWN : 0));
      }
    }
}
/** Marks the quarters of the column x, z that are street (`street` of their world block) and not built on. */
export function streetOn(
  quarters: Uint8Array,
  x: number,
  z: number,
  ox: number,
  oz: number,
  street: (fx: number, fz: number) => boolean,
) {
  const i = idx(x, z);
  for (let q = 0; q < 4; q++)
    if (!(quarters[i] & (HOUSE << q)) && street((x + ox) * 2 + (q & 1), (z + oz) * 2 + (q >> 1)))
      quarters[i] |= STREET << q;
}

/** What the figures of the first far step stand on: the ground of a piece as its table keeps it (table.ts `Table`). */
export interface CrowdGround {
  h: ArrayLike<number>;
  mat: ArrayLike<number>;
  wet: ArrayLike<number>;
  /** 1 on the paved ground of the towns */
  town: ArrayLike<number>;
  /** what stands on a column as part of it (far.ts `Cover`) */
  has: ArrayLike<number>;
  quarters?: ArrayLike<number>;
  crops?: ArrayLike<number>;
  furlongs?: ArrayLike<number>;
  /** the walled towns about it as the finest step lays them out, in blocks of the finest step (far.ts `Cover`) */
  towns?: readonly Town[];
}

/**
 * The figures of the own columns `part` of a piece of the first far step whose ground starts at the world block ox,
 * oz, or none. Only the columns the table of a piece keeps count (`part` and RIM round it), so that a piece drawn from
 * its table has the figures of the piece built. The figures are given in blocks of the finest step from the piece's
 * first block, and their `scale` makes them the step's. `lots`: the field lots of the furlongs of each town by its
 * site, as the finest step has them (src/figures/crowd.ts `SettledGround`).
 */
export function farCrowd(
  t: CrowdGround,
  ox: number,
  oz: number,
  part: Part,
  lots?: ReadonlyMap<number, readonly number[]>,
): Figures | undefined {
  const up = uprightOf(CROWD_AT),
    { quarters, crops, furlongs } = t,
    hands = fieldHands({ furlongs: lots });
  const x0 = 2 * Math.max(0, part.x0 - RIM),
    z0 = 2 * Math.max(0, part.z0 - RIM),
    x1 = 2 * (part.x1 + RIM),
    z1 = 2 * (part.z1 + RIM);
  const inside = (fx: number, fz: number) => fx >= x0 && fz >= z0 && fx < x1 && fz < z1 && inGrid(fx >> 1, fz >> 1);
  const column = (fx: number, fz: number) => idx(fx >> 1, fz >> 1);
  const field = (fx: number, fz: number) =>
    crops && inside(fx, fz) ? cropAt(crops, fx >> 1, fz >> 1, fx & 1, fx + 2 * ox, fz + 2 * oz, furlongs) : 0;
  const on = (fx: number, fz: number) => onQuarter(quarters, column(fx, fz), quarterOf(fx, fz));
  const w: Where = {
    free(fx, fz, street) {
      if (!inside(fx, fz)) return false;
      const i = column(fx, fz);
      if (t.wet[i]) return false;
      if (street) return on(fx, fz) === STREET;
      return on(fx, fz) === 0 && !t.town[i] && !t.has[i] && t.mat[i] !== Mat.Rock && !field(fx, fz);
    },
    // (a building on the paving of a town is ground of its own, as at the finest step)
    nearHouse(fx, fz) {
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++) if (inside(fx + dx, fz + dz) && on(fx + dx, fz + dz) === HOUSE) return true;
      return false;
    },
    field,
    h: (fx, fz) => t.h[column(fx, fz)] / up,
    tended: (fx, fz) => hands.has(lotOf(fx + 2 * ox, fz + 2 * oz)),
  };
  // the persons of the towns stand where the finest step stands them: a ruler in the piece of the finest step that
  // holds the town's middle (a piece of this step holds four of them whole: piece_sight.ts)
  const own = (x: number, z: number) => x >= 2 * part.x0 && z >= 2 * part.z0 && x < 2 * part.x1 && z < 2 * part.z1,
    piece = (fx: number, fz: number) => `${Math.floor((fx + 2 * ox) / PIECE)},${Math.floor((fz + 2 * oz) / PIECE)}`,
    holds = (fx: number, fz: number, cx: number, cz: number) => own(cx, cz) && piece(fx, fz) === piece(cx, cz),
    at = placer(t.towns ?? [], w, 2 * ox, 2 * oz, holds);
  const out = gathered();
  for (let fz = 2 * part.z0; fz < 2 * part.z1; fz++) for (let fx = 2 * part.x0; fx < 2 * part.x1; fx++) at(out, fx, fz);
  placeHands(out, w, hands, 2 * ox, 2 * oz, own, 2 * N);
  const f = figuresOf(out, 2 * ox, 2 * oz, [1 / 2, up]);
  return f.count ? f : undefined;
}

/**
 * The figures of a piece of the first far step drawn from its table (piece.worker.ts), once the persons of the towns
 * and their towns' furlongs (lots.ts `lotsOfTowns`) are loaded: from the map's data at `base`, of the start year
 * `year`.
 */
export async function tableCrowd(t: Table, base: string, year?: number): Promise<Figures | undefined> {
  const [, parcels] = await Promise.all([loadTownPeople(undefined, year), loadParcels(base, year ?? 1356)]),
    lots = parcels ? lotsOfTowns(parcels) : undefined;
  return onGrid(t.side, () => farCrowd(t, t.ox, t.oz, t.part, lots));
}
