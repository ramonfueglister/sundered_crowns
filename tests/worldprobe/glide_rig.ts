// A far piece and the coarser one over it, glided as the worker glides them, and what the tests of the glide
// (glide.test.ts, glide_lists.test.ts) read from them.
import type { Batch } from '../../src/lookprobe/batch';
import { FACE_GEO, FACE_STEPS, FLIPPED, type Faces } from '../../src/lookprobe/faces';
import { SEA_Y, onGrid } from '../../src/lookprobe/layout';
import { glide } from '../../src/worldprobe/glide';
import { TALLER } from '../../src/worldprobe/glide_columns';
import { BRIGHTEST, faced, small } from '../../src/worldprobe/small';
import { type Table, drawLand, drawTable, drawnHeights, tableOf } from '../../src/worldprobe/table';
import { LAND_STEP, SIDE, land, part } from './land';

export const S = FACE_STEPS;
/** the coarser piece's ground lies so that the quarter of it over the piece is its columns 36 … 60 */
export const OVER = { ox: 4000 / 2 - 24, oz: -1200 / 2 - 24 },
  QUARTER = { x0: 36, z0: 36, x1: 60, z1: 60 };

/**
 * A piece and the coarser one over it: two lands that have nothing to do with each other, so every case comes up.
 * Both have a lake above the sea's level, which lie partly over each other, and the two coasts cross: so land sinks
 * into the sea and into the lake, sea and lake become land, and water stays water.
 */
export function pair(over = OVER): { fine: Table; parent: Table } {
  return onGrid(SIDE, () => {
    const a = land(4000, -1200, 0),
      b = land(over.ox, over.oz, 21, 53);
    return { fine: tableOf(a.g, a.t, part), parent: tableOf(b.g, b.t, part) };
  });
}
export function piece(over = OVER) {
  // (the meshes as the worker hands them over: the sea as faces on a grid lifted to its level, the water above it as lists)
  const { fine, parent } = pair(over),
    drawn = drawTable(fine, true, LAND_STEP),
    ground = faced(drawn.ground),
    carried = faced(drawn.carried!),
    water = faced(drawn.water, SEA_Y - Math.floor(SEA_Y * S) / S),
    raised = small(drawn.raised);
  const before = {
    faces: ground.faces!.geo.length / FACE_GEO,
    geo: ground.faces!.geo.slice(),
    col: ground.faces!.col.slice(),
    carried: carried.faces!.geo.length / FACE_GEO,
    banks: ground.pos.length / 9,
    water: water.pos.length / 9,
    raised: raised.pos.length / 9,
  };
  const columns = glide({ ground, carried, water, raised }, fine, parent, true, LAND_STEP);
  return {
    fine,
    parent,
    shapes: { ground, carried, water, raised },
    ground: ground.faces!,
    carried: carried.faces!,
    before,
    columns,
  };
}
/** a height of the coarser piece in the piece's blocks */
export const tall = (y: number) => SEA_Y + (y - SEA_Y) * TALLER;
/** the tops of a table's columns as they are drawn (lower than the table has them where trees stand), worked out once a table */
const drawn = new WeakMap<Table, ArrayLike<number>>();
export const topsAt = (table: Table) => {
  let h = drawn.get(table);
  if (!h) {
    h = drawnHeights(table);
    drawn.set(table, h);
  }
  return h;
};
/**
 * What becomes of a column, from the two tables alone: the coarser column over it, where its top (or its bed) starts
 * and ends in 64ths, whether it is water now and then, and the level the coarser step's water has there.
 */
export function fate(fine: Table, parent: Table, x: number, z: number) {
  const i = z * SIDE + x,
    p = (Math.floor((fine.oz + z) / 2) - parent.oz) * parent.side + Math.floor((fine.ox + x) / 2) - parent.ox,
    wetNow = fine.wet[i] === 1,
    wetThen = parent.wet[p] === 1;
  // (the bed of the sea that stays the sea stays where it is)
  const h = topsAt(fine),
    theirH = topsAt(parent);
  return {
    i,
    p,
    wetNow,
    wetThen,
    start: h[i] * S,
    end: wetNow && wetThen && fine.surf[i] <= SEA_Y + 0.01 ? h[i] * S : Math.round(tall(theirH[p]) * S),
    level: wetThen ? (parent.surf[p] > SEA_Y + 0.01 ? tall(parent.surf[p]) : SEA_Y) : NaN,
  };
}
/** a face that is the top of a column: the column's x and z; none for any other face */
export function topOf(f: Faces, k: number): [number, number] | null {
  const g = k * FACE_GEO;
  if (
    f.geo[g] % FLIPPED !== 1 ||
    f.nor[k * 4 + 1] <= 0 ||
    Math.abs(f.geo[g + 3] - f.geo[g + 2]) !== S ||
    Math.abs(f.geo[g + 5] - f.geo[g + 4]) !== S
  )
    return null;
  return [Math.min(f.geo[g + 2], f.geo[g + 3]) / S, Math.min(f.geo[g + 4], f.geo[g + 5]) / S];
}
export const shown = (col: Uint8Array, o: number) =>
  [0, 1, 2].map((m) => (col[o + m] / 255) * (col[o + 3] / 254) * BRIGHTEST);
export const inside = (x: number, z: number) => x >= part.x0 && x < part.x1 && z >= part.z0 && z < part.z1;

/** The tops of the coarser piece's columns as it draws them: by column, the two triangles of its top with their colours, and whether the column is what the ground carries. */
export function topsOf(parent: Table) {
  const drawn = drawLand(parent, true, QUARTER, LAND_STEP + 1),
    tops = new Map<number, { corners: number[][][]; carried: boolean }>();
  for (const [b, carried] of [
    [drawn.ground, false],
    [drawn.carried, true],
  ] as [Batch, boolean][])
    for (let o = 0; o < b.pos.length; o += 9) {
      const corners = [0, 1, 2].map((c) => [
        b.pos[o + c * 3],
        b.pos[o + c * 3 + 2],
        b.col[o + c * 3],
        b.col[o + c * 3 + 1],
        b.col[o + c * 3 + 2],
      ]);
      const x = Math.min(...corners.map((c) => c[0])),
        z = Math.min(...corners.map((c) => c[1])),
        p = z * parent.side + x;
      if (
        ![0, 1, 2].every((c) => b.nor[o + c * 3 + 1] === 1 && b.pos[o + c * 3 + 1] === topsAt(parent)[p]) ||
        !Number.isInteger(x) ||
        !Number.isInteger(z)
      )
        continue;
      if (Math.max(...corners.map((c) => c[0])) !== x + 1 || Math.max(...corners.map((c) => c[1])) !== z + 1) continue;
      const top = tops.get(p) ?? { corners: [], carried };
      top.corners.push(corners);
      tops.set(p, top);
    }
  for (const [p, top] of tops) if (top.corners.length !== 2) tops.delete(p);
  return tops;
}
/** the colour a top shows at a point of it: that of the triangle the point lies in */
export function colourAt(top: { corners: number[][][] }, x: number, z: number): number[] {
  for (const [a, b, c] of top.corners) {
    const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]),
      u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / det,
      v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / det,
      w = 1 - u - v;
    if (u >= -1e-9 && v >= -1e-9 && w >= -1e-9) return [2, 3, 4].map((m) => u * a[m] + v * b[m] + w * c[m]);
  }
  throw new Error('a point off its top');
}
/** the triangles of a list that lie on a column: their corners' heights now and where they end up */
export function sheetsOn(shape: { pos: ArrayLike<number>; sink?: Float32Array }, x: number, z: number, from = 0) {
  const found: { now: number[]; later: number[] }[] = [];
  for (let t = from; t < shape.pos.length / 9; t++) {
    const o = t * 9,
      mx = (shape.pos[o] + shape.pos[o + 3] + shape.pos[o + 6]) / 3,
      mz = (shape.pos[o + 2] + shape.pos[o + 5] + shape.pos[o + 8]) / 3;
    if (Math.floor(mx) === x && Math.floor(mz) === z)
      found.push({
        now: [0, 1, 2].map((c) => shape.pos[o + c * 3 + 1]),
        later: [0, 1, 2].map((c) => (shape.sink ? shape.sink[t * 3 + c] : shape.pos[o + c * 3 + 1])),
      });
  }
  return found;
}
