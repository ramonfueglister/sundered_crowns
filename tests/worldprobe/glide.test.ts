// A far piece glides to the shape of the coarser piece over it: at the end of the way it shows that piece's land,
// column for column, and all the way its land is closed.
import { describe, expect, it } from 'vitest';
import type { Batch } from '../../src/lookprobe/batch';
import { FACE_COL, FACE_GEO, FACE_STEPS, FLIPPED, RISES, type Faces, glided } from '../../src/lookprobe/faces';
import { SEA_Y, onGrid } from '../../src/lookprobe/layout';
import { TALLER, glide } from '../../src/worldprobe/glide';
import { BRIGHTEST, faced } from '../../src/worldprobe/small';
import { type Table, drawLand, drawTable, tableOf } from '../../src/worldprobe/table';
import { SIDE, land, part } from './land';

const S = FACE_STEPS;
/** the coarser piece's ground lies so that the quarter of it over the piece is its columns 36 … 60 */
const OVER = { ox: 4000 / 2 - 24, oz: -1200 / 2 - 24 }, QUARTER = { x0: 36, z0: 36, x1: 60, z1: 60 };

/** A piece and the coarser one over it: two lands that have nothing to do with each other, so every case comes up. */
function pair(over = OVER): { fine: Table; parent: Table } {
  return onGrid(SIDE, () => {
    const a = land(4000, -1200, 0), b = land(over.ox, over.oz, 20);
    return { fine: tableOf(a.g, a.t, part), parent: tableOf(b.g, b.t, part) };
  });
}
function piece(over = OVER) {
  const { fine, parent } = pair(over), drawn = drawTable(fine, true), ground = faced(drawn.ground), carried = faced(drawn.carried!), before = ground.faces!.geo.length / FACE_GEO;
  const untouched = { geo: ground.faces!.geo.slice(), col: ground.faces!.col.slice() };
  const columns = glide({ ground, carried }, fine, parent, true);
  return { fine, parent, ground: ground.faces!, carried: carried.faces!, before, untouched, columns };
}
/** the column of the coarser ground over a column of the piece */
const over = (fine: Table, parent: Table, x: number, z: number) => (Math.floor((fine.oz + z) / 2) - parent.oz) * parent.side + Math.floor((fine.ox + x) / 2) - parent.ox;
/** the height a column of the coarser piece has in the piece's blocks, in 64ths */
const heightOf = (parent: Table, p: number) => Math.round((SEA_Y + (parent.h[p] - SEA_Y) * TALLER) * S);
/** a face that is the top of a column: the column's x and z; none for any other face */
function topOf(f: Faces, k: number): [number, number] | null {
  const g = k * FACE_GEO;
  if (f.geo[g] % FLIPPED !== 1 || f.nor[k * 4 + 1] <= 0 || Math.abs(f.geo[g + 3] - f.geo[g + 2]) !== S || Math.abs(f.geo[g + 5] - f.geo[g + 4]) !== S) return null;
  return [Math.min(f.geo[g + 2], f.geo[g + 3]) / S, Math.min(f.geo[g + 4], f.geo[g + 5]) / S];
}
const shown = (col: Uint8Array, o: number) => [0, 1, 2].map((m) => (col[o + m] / 255) * (col[o + 3] / 254) * BRIGHTEST);

/** The tops of the coarser piece's columns as it draws them: by column, the two triangles of its top with their colours, and whether the column is what the ground carries. */
function topsOf(parent: Table) {
  const drawn = drawLand(parent, true, QUARTER), tops = new Map<number, { corners: number[][][]; carried: boolean }>();
  for (const [b, carried] of [[drawn.ground, false], [drawn.carried, true]] as [Batch, boolean][]) for (let o = 0; o < b.pos.length; o += 9) {
    const corners = [0, 1, 2].map((c) => [b.pos[o + c * 3], b.pos[o + c * 3 + 2], b.col[o + c * 3], b.col[o + c * 3 + 1], b.col[o + c * 3 + 2]]);
    const x = Math.min(...corners.map((c) => c[0])), z = Math.min(...corners.map((c) => c[1])), p = z * parent.side + x;
    if (![0, 1, 2].every((c) => b.nor[o + c * 3 + 1] === 1 && b.pos[o + c * 3 + 1] === parent.h[p]) || !Number.isInteger(x) || !Number.isInteger(z)) continue;
    if (Math.max(...corners.map((c) => c[0])) !== x + 1 || Math.max(...corners.map((c) => c[1])) !== z + 1) continue;
    const top = tops.get(p) ?? { corners: [], carried };
    top.corners.push(corners); tops.set(p, top);
  }
  for (const [p, top] of tops) if (top.corners.length !== 2) tops.delete(p);
  return tops;
}
/** the colour a top shows at a point of it: that of the triangle the point lies in */
function colourAt(top: { corners: number[][][] }, x: number, z: number): number[] {
  for (const [a, b, c] of top.corners) {
    const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]), u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / det, v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / det, w = 1 - u - v;
    if (u >= -1e-9 && v >= -1e-9 && w >= -1e-9) return [2, 3, 4].map((m) => u * a[m] + v * b[m] + w * c[m]);
  }
  throw new Error('a point off its top');
}

describe('the glide of a far piece to the coarser one over it', () => {
  it('ends where the coarser piece has its columns: every top at the height of the column over it', () => {
    const { fine, parent, ground, carried, columns } = piece();
    let tops = 0, stay = 0;
    for (const f of [ground, carried]) for (let k = 0; k < f.geo.length / FACE_GEO; k++) {
      const at = topOf(f, k);
      if (!at || fine.h[at[1] * SIDE + at[0]] * S !== f.geo[k * FACE_GEO + 1]) continue;
      const i = at[1] * SIDE + at[0], p = over(fine, parent, at[0], at[1]);
      // a column that is water in either step stays where it is
      if (fine.wet[i] || parent.wet[p]) { stay++; expect(glided(f, k, 1)[0]).toBe(fine.h[i] * S); continue; }
      tops++;
      expect(glided(f, k, 1)[0], `${at}`).toBe(heightOf(parent, p));
      expect(glided(f, k, 0)[0]).toBe(fine.h[i] * S);
      expect(glided(f, k, 0.5)[0]).toBeCloseTo((fine.h[i] * S + heightOf(parent, p)) / 2, 6);
    }
    // nearly all the piece's land glides; the land under the coarser piece's lake stays
    expect(tops).toBe(columns);
    expect(columns).toBeGreaterThan(1500);
    expect(stay).toBeGreaterThan(20);
  });

  it('ends in the colours of the coarser piece: each corner of a top shows what the coarser top shows at that point', () => {
    const { fine, parent, ground, carried } = piece(), tops = topsOf(parent);
    let corners = 0, onGround = 0, onCarried = 0, turned = 0;
    for (const [f, own] of [[ground, 127], [carried, 0]] as [Faces, number][]) for (let k = 0; k < f.geo.length / FACE_GEO; k++) {
      const at = topOf(f, k);
      if (!at || fine.h[at[1] * SIDE + at[0]] * S !== f.geo[k * FACE_GEO + 1]) continue;
      const i = at[1] * SIDE + at[0], p = over(fine, parent, at[0], at[1]), top = tops.get(p), g = k * FACE_GEO;
      if (fine.wet[i] || parent.wet[p] || !top) { expect(f.nor[k * 4 + 3]).toBe(own); continue; }
      // ground to the map's paper where the coarser column is ground, whatever the column itself is
      expect(f.nor[k * 4 + 3], `${at}`).toBe(top.carried ? 0 : 127);
      if (top.carried) onCarried++; else onGround++;
      if ((f.nor[k * 4 + 3] === 127) !== (own === 127)) turned++;
      for (let c = 0; c < 4; c++) {
        const u = f.geo[g + (c === 1 || c === 2 ? 3 : 2)] / S, v = f.geo[g + (c >= 2 ? 5 : 4)] / S;
        const want = colourAt(top, (fine.ox + u) / 2 - parent.ox, (fine.oz + v) / 2 - parent.oz), has = shown(f.aimCol!, k * FACE_COL + c * 4);
        for (let m = 0; m < 3; m++) expect(has[m], `${at} corner ${c}`).toBeCloseTo(want[m], 1);
        expect(Math.abs(has[0] - want[0]) + Math.abs(has[1] - want[1]) + Math.abs(has[2] - want[2])).toBeLessThan(0.04);
        corners++;
      }
    }
    expect(corners).toBeGreaterThan(5000);
    expect(onGround).toBeGreaterThan(300);
    expect(onCarried).toBeGreaterThan(100);
    expect(turned).toBeGreaterThan(100);
  });

  it('keeps the land closed all the way: between two columns stands a side as tall as their tops are apart', () => {
    const { fine, ground, carried } = piece();
    for (const share of [0, 0.25, 0.5, 0.8, 1]) {
      const top = new Float64Array(SIDE * SIDE).fill(NaN), sides = new Map<string, number>();
      for (const f of [ground, carried]) for (let k = 0; k < f.geo.length / FACE_GEO; k++) {
        const g = k * FACE_GEO, axis = f.geo[g] % FLIPPED, way = f.nor[k * 4 + axis], at = topOf(f, k), [end0, end1] = glided(f, k, share);
        if (axis === 1) { if (at) top[at[1] * SIDE + at[0]] = end0; continue; }
        const a = axis === 0 ? 4 : 2, along = Math.floor(Math.min(f.geo[g + a], f.geo[g + a + 1]) / S), across = f.geo[g + 1] / S - (way > 0 ? 1 : 0);
        const key = `${axis === 0 ? across : along},${axis === 0 ? along : across},${axis},${way > 0 ? 1 : -1}`;
        sides.set(key, (sides.get(key) ?? 0) + Math.abs(end1 - end0) * (Math.abs(f.geo[g + a + 1] - f.geo[g + a]) / S));
      }
      let edges = 0;
      for (let z = part.z0; z < part.z1; z++) for (let x = part.x0; x < part.x1; x++) {
        const i = z * SIDE + x;
        if (fine.wet[i] || Number.isNaN(top[i])) continue;
        for (const [dx, dz, axis] of [[1, 0, 0], [-1, 0, 0], [0, 1, 2], [0, -1, 2]] as const) {
          const nx = x + dx, nz = z + dz, j = nz * SIDE + nx;
          if (nx < part.x0 || nz < part.z0 || nx >= part.x1 || nz >= part.z1 || fine.wet[j] || Number.isNaN(top[j])) continue;
          edges++;
          // (the ends of a side are whole 64ths at the two ends of the way and anything between: a side may miss its neighbour's top by the rounding)
          expect(Math.abs(Math.max(0, top[i] - top[j]) - (sides.get(`${x},${z},${axis},${dx + dz}`) ?? 0)), `share ${share}: ${x}, ${z} towards ${dx}, ${dz}`).toBeLessThanOrEqual(1);
        }
      }
      expect(edges).toBeGreaterThan(5000);
    }
  });

  it('adds the sides that are to come, with no height until the columns part', () => {
    const { fine, parent, ground, before, untouched } = piece(), count = ground.geo.length / FACE_GEO;
    expect(count).toBeGreaterThan(before + 200);
    // the faces the piece had are where they were, in their own colours
    expect(ground.geo.slice(0, before * FACE_GEO)).toEqual(untouched.geo);
    expect(ground.col.slice(0, before * FACE_COL)).toEqual(untouched.col);
    for (let k = 0; k < before; k++) expect(ground.geo[k * FACE_GEO]).toBeLessThan(RISES);
    for (let k = before; k < count; k++) {
      const g = k * FACE_GEO, kind = ground.geo[g], axis = kind % FLIPPED, way = ground.nor[k * 4 + axis] > 0 ? 1 : -1, a = axis === 0 ? 4 : 2;
      expect(kind).toBeGreaterThanOrEqual(RISES);
      expect(axis).not.toBe(1);
      const along = Math.floor(Math.min(ground.geo[g + a], ground.geo[g + a + 1]) / S), across = ground.geo[g + 1] / S - (way > 0 ? 1 : 0);
      const x = axis === 0 ? across : along, z = axis === 0 ? along : across, nx = axis === 0 ? x + way : x, nz = axis === 0 ? z : z + way;
      // the column behind it is not above its neighbour now, and is at the end
      expect(fine.h[z * SIDE + x]).toBeLessThanOrEqual(fine.h[nz * SIDE + nx]);
      const [low0, high0] = glided(ground, k, 0), [low1, high1] = glided(ground, k, 1);
      expect(high0 - low0).toBe(0);
      expect(high1 - low1).toBeGreaterThan(0);
      const top = parent.wet[over(fine, parent, x, z)] || fine.wet[z * SIDE + x] ? fine.h[z * SIDE + x] * S : heightOf(parent, over(fine, parent, x, z));
      expect(high1).toBe(top);
      // it shows at once what it will show: a face of no height has no colour of its own to come from
      expect(ground.col.slice(k * FACE_COL, (k + 1) * FACE_COL)).toEqual(ground.aimCol!.slice(k * FACE_COL, (k + 1) * FACE_COL));
    }
  });

  it('never turns a side over: where the coarser step has the columns the other way round, the side is gone', () => {
    const { ground, carried } = piece();
    let gone = 0;
    for (const f of [ground, carried]) for (let k = 0; k < f.geo.length / FACE_GEO; k++) {
      const g = k * FACE_GEO, kind = f.geo[g], axis = kind % FLIPPED;
      if (axis === 1) continue;
      const lo = axis === 0 ? 2 : 4, up = kind >= RISES || f.geo[g + lo + 1] >= f.geo[g + lo] ? 1 : -1;
      for (const share of [0, 0.3, 0.7, 1]) { const [end0, end1] = glided(f, k, share); expect((end1 - end0) * up).toBeGreaterThanOrEqual(0); }
      if (kind < RISES && f.geo[g + lo + 1] !== f.geo[g + lo] && glided(f, k, 1)[0] === glided(f, k, 1)[1]) gone++;
    }
    expect(gone).toBeGreaterThan(200);
  });

  it('sets nothing where the coarser piece does not lie over the piece', () => {
    const { ground, carried, before, columns } = piece({ ox: OVER.ox + 40, oz: OVER.oz });
    expect(columns).toBe(0);
    expect(ground.aim).toBeUndefined();
    expect(carried.aim).toBeUndefined();
    expect(ground.geo.length / FACE_GEO).toBe(before);
    // such faces are drawn where they are, whatever the share
    expect(glided(ground, 0, 0.6)).toEqual(glided(ground, 0, 0));
  });
});
