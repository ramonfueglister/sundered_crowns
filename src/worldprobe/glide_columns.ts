// What becomes of each column of a piece on the glide (glide.ts): the coarser column over it, where its top starts
// and ends, and whether it stays land or water.
import { SEA_Y } from '../lookprobe/layout';
import { FACE_STEPS } from '../lookprobe/faces';
import type { Above } from './glide_above';
import { type Table, drawnHeights } from './table';
import { reliefOf } from './zoom';

/**
 * a block of height of the coarser step stands this many times as tall as one of the finer step, where both are
 * drawn at their border: every step is built flatter and drawn twice as wide (zoom.ts `reliefOf`, pieces.ts)
 */
export const TALLER = (2 * reliefOf(1e4, 5)) / reliefOf(1e4, 4);
const S = FACE_STEPS;

/**
 * what becomes of a column on the way (`Columns.way`): it stays (0, as the list starts out); land that stays land;
 * land that ends under the coarser step's water; water that ends as land
 */
const LAND = 1;
export const SINKS = 2,
  COMES = 3;
/** what is to be out of sight lies this far under the top of the land that hides it, or under the level of the water that does (deeper than a bank's foot: shore.ts) */
export const UNDER_LAND = 0.05,
  UNDER_WATER = 0.3;
/** a height of the coarser piece in this piece's blocks */
export const tall = (y: number) => SEA_Y + (y - SEA_Y) * TALLER;
/** a height of this piece, in 64ths, as the coarser piece counts it */
export const coarse = (y: number) => (SEA_Y + (y / S - SEA_Y) / TALLER) * S;
/**
 * What becomes of each column of a piece, and of one round it: the coarser column over it (`over`, -1: none), where
 * its top starts and where it ends (`from`, `aim`: 64ths of this piece's blocks), what becomes of it (`way`), and the
 * level the water over it ends at (`surface`, blocks; none where the coarser step has land there). And what the
 * piece holds of all that: how many of its own columns glide, whether land and water change places, whether either
 * step has water here, and whether the coarser has.
 *
 * (The parts of the glide are functions of their own that are handed this, not one long function with its helpers
 * inside: so the engine keeps the fast code it makes of each from piece to piece. As one function, each part ran
 * for the first time in a piece while the fast code of the part before it was in use, which threw that code away:
 * a walk over a piece's columns and their neighbours took 30 ms where it now takes a few.)
 */
export interface Columns {
  /** `h`, `theirH`: the tops of the piece's columns and of the coarser piece's as they are drawn, which is lower than their tables have them where trees stand (table.ts `drawnHeights`) */
  n: number;
  fine: Table;
  parent: Table;
  above: Above;
  h: ArrayLike<number>;
  theirH: ArrayLike<number>;
  over: Int32Array;
  from: Int32Array;
  aim: Int32Array;
  way: Uint8Array;
  surface: Float32Array;
  gliding: number;
  coast: boolean;
  water: boolean;
  theirs: boolean;
}
export function columnsOf(fine: Table, parent: Table, above: Above): Columns {
  // (the heights the two pieces draw: where trees stand, those are lower than their tables have them)
  const h = drawnHeights(fine),
    theirH = drawnHeights(parent);
  const n = fine.side,
    pn = parent.side,
    own = fine.part,
    fox = fine.ox,
    foz = fine.oz,
    pox = parent.ox,
    poz = parent.oz;
  const wet = fine.wet,
    surf = fine.surf,
    theirWet = parent.wet,
    theirSurf = parent.surf;
  const over = new Int32Array(n * n).fill(-1),
    from = new Int32Array(n * n),
    aim = new Int32Array(n * n),
    way = new Uint8Array(n * n),
    surface = new Float32Array(n * n).fill(NaN);
  let gliding = 0,
    coast = false,
    water = false,
    theirs = false;
  for (let z = Math.max(0, own.z0 - 1); z < Math.min(n, own.z1 + 1); z++)
    for (let x = Math.max(0, own.x0 - 1); x < Math.min(n, own.x1 + 1); x++) {
      const i = z * n + x,
        px = Math.floor((fox + x) / 2) - pox,
        pz = Math.floor((foz + z) / 2) - poz,
        p = pz * pn + px;
      from[i] = aim[i] = h[i] * S;
      if (px < 0 || pz < 0 || px >= pn || pz >= pn) continue;
      over[i] = p;
      if (theirWet[p]) surface[i] = theirSurf[p] > SEA_Y + 0.01 ? tall(theirSurf[p]) : SEA_Y;
      if (wet[i] || theirWet[p]) water = true;
      if (theirWet[p]) theirs = true;
      aim[i] = Math.round(tall(theirH[p]) * S);
      // (water in both steps: where its level moves, its bed moves too, out of sight, and with it the feet of the
      // sides that stand in it, so that they reach under the water whatever level that ends at; the sea stays the sea)
      if (wet[i] && theirWet[p]) {
        if (surf[i] <= SEA_Y + 0.01) aim[i] = from[i];
        continue;
      }
      way[i] = wet[i] ? COMES : theirWet[p] ? SINKS : LAND;
      if (way[i] !== LAND) coast = true;
      if (x >= own.x0 && x < own.x1 && z >= own.z0 && z < own.z1) gliding++;
    }
  return { n, fine, parent, above, h, theirH, over, from, aim, way, surface, gliding, coast, water, theirs };
}
/** what goes down into a column ends this many 64ths under its top */
export const SUNK = Math.round(UNDER_LAND * S);
/**
 * The column a face lies inside, of a ground `n` columns a side, where it is a face of what stands on the column and
 * none of the column's own: a level face smaller than the column's top, an upright face off the edges of the columns.
 * -1 where it is none, or off the ground.
 */
export function insideOf(
  n: number,
  axis: number,
  level: number,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
): number {
  let x: number, z: number;
  if (axis === 1) {
    if (Math.abs(u1 - u0) === S && Math.abs(v1 - v0) === S && u0 % S === 0 && v0 % S === 0) return -1;
    x = Math.floor(Math.min(u0, u1) / S);
    z = Math.floor(Math.min(v0, v1) / S);
    if (Math.max(u0, u1) > (x + 1) * S || Math.max(v0, v1) > (z + 1) * S) return -1;
  } else {
    if (level % S === 0) return -1;
    const a0 = axis === 0 ? v0 : u0,
      a1 = axis === 0 ? v1 : u1,
      along = Math.floor(Math.min(a0, a1) / S);
    if (Math.max(a0, a1) > (along + 1) * S) return -1;
    x = axis === 0 ? Math.floor(level / S) : along;
    z = axis === 0 ? along : Math.floor(level / S);
  }
  return x < 0 || z < 0 || x >= n || z >= n ? -1 : z * n + x;
}
