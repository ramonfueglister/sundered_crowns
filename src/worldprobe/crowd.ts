// The figures of the first far step: the finest step's figures (src/figures/crowd.ts) on the blocks of the finest
// step that its columns hold, by the same rules and the same numbers, so that the same figure stands at the same place
// and goes the same way where the far step's ground is the finest step's. They are drawn as large as the houses and
// the trees of the step stand (zoom.ts `uprightOf`).
//
// A column of the first far step holds four blocks of the finest step, its quarters. What the finest step has on
// each of them that the column does not tell, far.ts lays down (`quarters`, a byte to a column): which quarters are
// street, the paving of a town on which nothing stands (settle.ts), and which a building stands on. The crop of a
// quarter is that of its lot (crops.ts), a farmhouse is a building like any other.
import { type Figures, type Where, figuresOf, gathered, place } from '../figures';
import { Mat, idx, inGrid } from '../lookprobe/layout';
import type { Part } from '../lookprobe/terrain';
import { cropAt } from './crops';
import { RIM } from './table';
import { uprightOf } from './zoom';

/** the step whose columns hold four blocks of the finest step, the only far step that draws figures */
export const CROWD_AT = 1;
/** in a byte of `quarters`: the street bits from 1, the built bits from this one, one for each quarter */
const BUILT = 4;
/** which of a column's quarters a block of the finest step is (a column starts on an even block of the world) */
const quarterOf = (fx: number, fz: number) => (fx & 1) + 2 * (fz & 1);

/**
 * Marks the blocks of the finest step from fx0, fz0 to fx1, fz1 (world blocks, the ends not included) as built on,
 * in the quarters of a ground whose first column is the world block ox, oz of the first far step.
 */
export function builtOn(
  quarters: Uint8Array,
  ox: number,
  oz: number,
  fx0: number,
  fz0: number,
  fx1: number,
  fz1: number,
) {
  for (let fz = Math.floor(fz0); fz < Math.ceil(fz1); fz++)
    for (let fx = Math.floor(fx0); fx < Math.ceil(fx1); fx++) {
      const x = (fx >> 1) - ox,
        z = (fz >> 1) - oz;
      if (inGrid(x, z)) quarters[idx(x, z)] |= 1 << (BUILT + quarterOf(fx, fz));
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
    if (!(quarters[i] & (1 << (BUILT + q))) && street((x + ox) * 2 + (q & 1), (z + oz) * 2 + (q >> 1)))
      quarters[i] |= 1 << q;
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
}

/**
 * The figures of the own columns `part` of a piece of the first far step whose ground starts at the world block ox,
 * oz, or none. Only the columns the table of a piece keeps count (`part` and RIM round it), so that a piece drawn from
 * its table has the figures of the piece built. The figures are given in blocks of the finest step from the piece's
 * first block, and their `scale` makes them the step's.
 */
export function farCrowd(t: CrowdGround, ox: number, oz: number, part: Part): Figures | undefined {
  const up = uprightOf(CROWD_AT),
    { quarters, crops } = t;
  const x0 = 2 * Math.max(0, part.x0 - RIM),
    z0 = 2 * Math.max(0, part.z0 - RIM),
    x1 = 2 * (part.x1 + RIM),
    z1 = 2 * (part.z1 + RIM);
  const inside = (fx: number, fz: number) => fx >= x0 && fz >= z0 && fx < x1 && fz < z1 && inGrid(fx >> 1, fz >> 1);
  const column = (fx: number, fz: number) => idx(fx >> 1, fz >> 1);
  const field = (fx: number, fz: number) =>
    crops && inside(fx, fz) ? cropAt(crops, fx >> 1, fz >> 1, fx & 1, fx + 2 * ox, fz + 2 * oz) : 0;
  const built = (fx: number, fz: number) => ((quarters?.[column(fx, fz)] ?? 0) >> (BUILT + quarterOf(fx, fz))) & 1;
  const w: Where = {
    free(fx, fz, street) {
      if (!inside(fx, fz)) return false;
      const i = column(fx, fz);
      if (t.wet[i]) return false;
      if (street) return (((quarters?.[i] ?? 0) >> quarterOf(fx, fz)) & 1) === 1;
      return !built(fx, fz) && !t.town[i] && !t.has[i] && t.mat[i] !== Mat.Rock && !field(fx, fz);
    },
    // (a building on the paving of a town does not count, as at the finest step)
    nearHouse(fx, fz) {
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          const x = fx + dx,
            z = fz + dz;
          if (inside(x, z) && built(x, z) && !t.town[column(x, z)]) return true;
        }
      return false;
    },
    field,
    h: (fx, fz) => t.h[column(fx, fz)] / up,
  };
  const out = gathered();
  for (let fz = 2 * part.z0; fz < 2 * part.z1; fz++)
    for (let fx = 2 * part.x0; fx < 2 * part.x1; fx++) place(out, w, fx, fz, fx + 2 * ox, fz + 2 * oz);
  const f = figuresOf(out, 2 * ox, 2 * oz, [1 / 2, up]);
  return f.count ? f : undefined;
}
