// The lists of a piece on the glide (glide.ts), which are no faces: each corner gets the height it ends up at. The
// banks of the water, the piece's own and the coarser piece's, water above the sea's level, the water that is to
// stand where land sinks, and what stands on the ground as a thing of its own.
import { type Ground, SEA_Y, onGrid } from '../lookprobe/layout';
import { FACE_STEPS } from '../lookprobe/faces';
import type { Shape } from '../lookprobe/shape';
import { buildWater } from '../lookprobe/terrain';
import { COMES, type Columns, SINKS, UNDER_LAND, UNDER_WATER, tall } from './glide_columns';
import { join, reach, wider } from './glide_shape';
import { HOUSE_NUMBERS } from './houses';
import { small } from './small';
import { housesOf } from './table';

const S = FACE_STEPS;

/** The column a triangle of a list lies on: that of its middle; `back`: taken a little against its direction (a sheet of falling water stands on its column's edge). */
function columnOf(n: number, pos: ArrayLike<number>, nor: ArrayLike<number>, t: number, back: number) {
  const o = t * 9,
    q = t * 12;
  const x = Math.floor((pos[o] + pos[o + 3] + pos[o + 6]) / 3 - back * Math.sign(nor[q])),
    z = Math.floor((pos[o + 2] + pos[o + 5] + pos[o + 8]) / 3 - back * Math.sign(nor[q + 2]));
  return Math.max(0, Math.min(n - 1, z)) * n + Math.max(0, Math.min(n - 1, x));
}
/** The level the water of a column of this piece ends at: the coarser step's where both have water above the sea, its own else. */
const endsAt = (surf: Float32Array, surface: Float32Array, i: number) =>
  surf[i] > SEA_Y + 0.01 && !Number.isNaN(surface[i]) ? surface[i] : surf[i];

/**
 * The ground's lists are the banks of its water, which lie in the water's columns: each sinks out of sight, under
 * the land that comes there or under the water (what else is a list moves with its column).
 */
export function ownBanks(c: Columns, land: Shape) {
  const n = c.n,
    from = c.from,
    aim = c.aim,
    way = c.way,
    surface = c.surface,
    wet = c.fine.wet,
    surf = c.fine.surf,
    pos = land.pos,
    nor = land.nor,
    banks = new Float32Array(pos.length / 3);
  for (let t = 0; t < banks.length / 3; t++) {
    const i = columnOf(n, pos, nor, t, 0),
      hide = way[i] === COMES ? aim[i] / S - UNDER_LAND : wet[i] ? endsAt(surf, surface, i) - UNDER_WATER : NaN;
    for (let q = 0; q < 3; q++) {
      const y = pos[(t * 3 + q) * 3 + 1];
      banks[t * 3 + q] = Number.isNaN(hide) ? y + (aim[i] - from[i]) / S : Math.min(y, hide);
    }
  }
  if (banks.length) {
    land.sink = banks;
    wider(land, reach(pos, banks));
  }
}
/**
 * The coarser piece's banks over this piece (`banked`, as that piece has them) come up to where that piece has
 * them: from under the land or the water that lies there now.
 */
export function theirBanks(c: Columns, land: Shape, banked: Shape) {
  const n = c.n,
    fine = c.fine,
    parent = c.parent,
    h = c.h,
    wet = fine.wet,
    surf = fine.surf,
    pos = banked.pos as Float32Array,
    to = new Float32Array(pos.length / 3);
  for (let t = 0; t < to.length / 3; t++) {
    const o = t * 9;
    for (let q = 0; q < 3; q++) {
      pos[o + q * 3] = (pos[o + q * 3] + parent.ox) * 2 - fine.ox;
      pos[o + q * 3 + 2] = (pos[o + q * 3 + 2] + parent.oz) * 2 - fine.oz;
      to[t * 3 + q] = tall(pos[o + q * 3 + 1]);
    }
    // (the whole triangle under what lies there now: under the lowest of the columns it reaches over)
    let under = Infinity;
    const x0 = Math.floor(Math.min(pos[o], pos[o + 3], pos[o + 6]) + 1e-3),
      x1 = Math.floor(Math.max(pos[o], pos[o + 3], pos[o + 6]) - 1e-3),
      z0 = Math.floor(Math.min(pos[o + 2], pos[o + 5], pos[o + 8]) + 1e-3),
      z1 = Math.floor(Math.max(pos[o + 2], pos[o + 5], pos[o + 8]) - 1e-3);
    for (let z = Math.max(0, z0); z <= Math.min(n - 1, z1); z++)
      for (let x = Math.max(0, x0); x <= Math.min(n - 1, x1); x++) {
        const i = z * n + x;
        under = Math.min(under, wet[i] ? surf[i] - UNDER_WATER : h[i] - UNDER_LAND);
      }
    for (let q = 0; q < 3; q++) pos[o + q * 3 + 1] = Math.min(to[t * 3 + q], under);
  }
  if (to.length) join(land, banked, to);
}
/** Water above the sea's level: to the level the coarser step has it at, or out of sight under the land that comes. */
export function raisedWater(c: Columns, raised: Shape) {
  const n = c.n,
    aim = c.aim,
    way = c.way,
    surface = c.surface,
    wet = c.fine.wet,
    surf = c.fine.surf,
    pos = raised.pos,
    nor = raised.nor,
    sink = new Float32Array(pos.length / 3);
  for (let t = 0; t < sink.length / 3; t++) {
    const i = columnOf(n, pos, nor, t, 0.25),
      by = wet[i] && !way[i] ? endsAt(surf, surface, i) - surf[i] : 0,
      hide = way[i] === COMES ? aim[i] / S - UNDER_LAND : Infinity;
    for (let q = 0; q < 3; q++) sink[t * 3 + q] = Math.min(pos[(t * 3 + q) * 3 + 1] + by, hide);
  }
  raised.sink = sink;
  wider(raised, reach(pos, sink));
}
/**
 * The water that is to stand where land sinks: the sea lies under the land from the start; water above the sea
 * lies under the land's top and comes to its level.
 */
export function sinkingWater(c: Columns, sea: Shape, raised: Shape) {
  const n = c.n,
    fine = c.fine,
    own = fine.part,
    way = c.way,
    surface = c.surface,
    wet = Uint8Array.from(fine.wet),
    surf = Float32Array.from(fine.surf);
  // (the water is worked out for the stretch of the piece that holds such land, no more)
  const where = { x0: n, z0: n, x1: 0, z1: 0 };
  for (let z = own.z0; z < own.z1; z++)
    for (let x = own.x0; x < own.x1; x++) {
      const i = z * n + x;
      if (way[i] !== SINKS) continue;
      wet[i] = 1;
      surf[i] = surface[i];
      where.x0 = Math.min(where.x0, x);
      where.z0 = Math.min(where.z0, z);
      where.x1 = Math.max(where.x1, x + 1);
      where.z1 = Math.max(where.z1, z + 1);
    }
  if (where.x1 <= where.x0) return;
  const g: Ground = { h: fine.h, mat: fine.mat, wet, shore: fine.shore, occ: fine.occ, surf, ox: fine.ox, oz: fine.oz };
  for (const [shape, high] of [
    [sea, false],
    [raised, true],
  ] as const) {
    const all = onGrid(n, () => buildWater(g, high, where)),
      { pos: at, nor: turned, col: tints } = all,
      picked = { pos: [] as number[], nor: [] as number[], col: [] as number[] };
    for (let o = 0; o < at.length; o += 9) {
      if (turned[o + 1] !== 1) continue;
      const i =
        Math.floor((at[o + 2] + at[o + 5] + at[o + 8]) / 3) * n + Math.floor((at[o] + at[o + 3] + at[o + 6]) / 3);
      if (way[i] !== SINKS) continue;
      for (let k = 0; k < 9; k++) {
        picked.pos.push(at[o + k]);
        picked.nor.push(turned[o + k]);
        picked.col.push(tints[o + k]);
      }
    }
    if (!picked.pos.length) continue;
    const sheets = small(picked);
    if (!high) {
      join(shape, sheets);
      continue;
    }
    const pos = sheets.pos as Float32Array,
      to = new Float32Array(pos.length / 3);
    for (let t = 0; t < to.length / 3; t++) {
      const o = t * 9,
        i =
          Math.floor((pos[o + 2] + pos[o + 5] + pos[o + 8]) / 3) * n +
          Math.floor((pos[o] + pos[o + 3] + pos[o + 6]) / 3);
      for (let q = 0; q < 3; q++) {
        to[t * 3 + q] = pos[o + q * 3 + 1];
        pos[o + q * 3 + 1] = Math.min(pos[o + q * 3 + 1], c.h[i] - UNDER_LAND);
      }
    }
    join(shape, sheets, to);
  }
}
/**
 * What stands on the ground as a thing of its own goes with the top of its column and loses its height on the way:
 * the coarser step has no such things. A house drawn as a house that the coarser step draws too ends where that step
 * has it, corner by corner: houses.ts draws the same house with the same corners at every step, the coarser ones
 * half as wide in their own blocks, and the worker adds the houses to the things last.
 */
export function thingsDown(c: Columns, things: Shape) {
  const n = c.n,
    aim = c.aim,
    way = c.way,
    pos = things.pos,
    sink = new Float32Array(pos.length / 3);
  for (let v = 0; v < sink.length; v++) {
    const x = Math.max(0, Math.min(n - 1, Math.floor(pos[v * 3]))),
      z = Math.max(0, Math.min(n - 1, Math.floor(pos[v * 3 + 2])));
    sink[v] = way[z * n + x] ? aim[z * n + x] / S - UNDER_LAND : pos[v * 3 + 1];
  }
  housesOver(c, pos, sink);
  things.sink = sink;
  wider(things, reach(pos, sink));
}
/** The heights the corners of the piece's houses end at where the coarser piece has the same houses (see `thingsDown`). */
function housesOver(c: Columns, pos: ArrayLike<number>, sink: Float32Array) {
  const own = c.fine.houses,
    theirs = c.parent.houses;
  if (!own || !theirs) return;
  const mine = housesOf(c.fine)!,
    there = housesOf(c.parent)!,
    from = sink.length - mine.batch.pos.length / 3,
    drawn = mine.batch.pos;
  // (the houses are the last of the things, drawn as the table draws them, or they are not glided)
  if (
    from < 0 ||
    !mine.ends.length ||
    Math.abs(pos[from * 3] - drawn[0]) > 1e-3 ||
    Math.abs(pos[from * 3 + 1] - drawn[1]) > 1e-3 ||
    Math.abs(pos[from * 3 + 2] - drawn[2]) > 1e-3
  )
    return;
  // a house of the coarser piece by its corner in this piece's step, counted from the world's first block
  const at = new Map<string, number>();
  for (let k = 0, j = 0; k < theirs.length; k += HOUSE_NUMBERS, j++)
    at.set(`${2 * (theirs[k] + c.parent.ox)},${2 * (theirs[k + 1] + c.parent.oz)}`, j);
  const theirPos = there.batch.pos;
  for (let k = 0, j = 0; k < own.length; k += HOUSE_NUMBERS, j++) {
    const q = at.get(`${own[k] + c.fine.ox},${own[k + 1] + c.fine.oz}`);
    if (q === undefined) continue;
    const v0 = j ? mine.ends[j - 1] : 0,
      v1 = mine.ends[j],
      w0 = q ? there.ends[q - 1] : 0,
      w1 = there.ends[q];
    if (v1 - v0 !== w1 - w0) continue;
    for (let v = 0; v < v1 - v0; v++) sink[from + v0 + v] = tall(theirPos[(w0 + v) * 3 + 1]);
  }
}
