// A far piece glides to the shape of the coarser piece over it: at the end of the way it shows that piece's land and
// water, column for column, and all the way its land is closed.
import { describe, expect, it } from 'vitest';
import { Batch } from '../../src/lookprobe/batch';
import { FACE_COL, FACE_GEO, FACE_STEPS, FLIPPED, RISES, type Faces, glided } from '../../src/lookprobe/faces';
import { SEA_Y, onGrid } from '../../src/lookprobe/layout';
import { TALLER, glide } from '../../src/worldprobe/glide';
import { BRIGHTEST, faced, small } from '../../src/worldprobe/small';
import { type Table, drawBanks, drawLand, drawTable, drawnHeights, tableOf } from '../../src/worldprobe/table';
import { SIDE, land, part } from './land';

const S = FACE_STEPS;
/** the coarser piece's ground lies so that the quarter of it over the piece is its columns 36 … 60 */
const OVER = { ox: 4000 / 2 - 24, oz: -1200 / 2 - 24 }, QUARTER = { x0: 36, z0: 36, x1: 60, z1: 60 };

/**
 * A piece and the coarser one over it: two lands that have nothing to do with each other, so every case comes up.
 * Both have a lake above the sea's level, which lie partly over each other, and the two coasts cross: so land sinks
 * into the sea and into the lake, sea and lake become land, and water stays water.
 */
function pair(over = OVER): { fine: Table; parent: Table } {
  return onGrid(SIDE, () => {
    const a = land(4000, -1200, 0), b = land(over.ox, over.oz, 21, 53);
    return { fine: tableOf(a.g, a.t, part), parent: tableOf(b.g, b.t, part) };
  });
}
function piece(over = OVER) {
  // (the meshes as the worker hands them over: the sea as faces on a grid lifted to its level, the water above it as lists)
  const { fine, parent } = pair(over), drawn = drawTable(fine, true), ground = faced(drawn.ground), carried = faced(drawn.carried!), water = faced(drawn.water, SEA_Y - Math.floor(SEA_Y * S) / S), raised = small(drawn.raised);
  const before = { faces: ground.faces!.geo.length / FACE_GEO, geo: ground.faces!.geo.slice(), col: ground.faces!.col.slice(), carried: carried.faces!.geo.length / FACE_GEO, banks: ground.pos.length / 9, water: water.pos.length / 9, raised: raised.pos.length / 9 };
  const columns = glide({ ground, carried, water, raised }, fine, parent, true);
  return { fine, parent, shapes: { ground, carried, water, raised }, ground: ground.faces!, carried: carried.faces!, before, columns };
}
/** a height of the coarser piece in the piece's blocks */
const tall = (y: number) => SEA_Y + (y - SEA_Y) * TALLER;
/** the tops of a table's columns as they are drawn (lower than the table has them where trees stand), worked out once a table */
const drawn = new WeakMap<Table, ArrayLike<number>>();
const topsAt = (table: Table) => { let h = drawn.get(table); if (!h) drawn.set(table, h = drawnHeights(table)); return h; };
/**
 * What becomes of a column, from the two tables alone: the coarser column over it, where its top (or its bed) starts
 * and ends in 64ths, whether it is water now and then, and the level the coarser step's water has there.
 */
function fate(fine: Table, parent: Table, x: number, z: number) {
  const i = z * SIDE + x, p = (Math.floor((fine.oz + z) / 2) - parent.oz) * parent.side + Math.floor((fine.ox + x) / 2) - parent.ox, wetNow = fine.wet[i] === 1, wetThen = parent.wet[p] === 1;
  // (the bed of the sea that stays the sea stays where it is)
  const h = topsAt(fine), theirH = topsAt(parent);
  return { i, p, wetNow, wetThen, start: h[i] * S, end: wetNow && wetThen && fine.surf[i] <= SEA_Y + 0.01 ? h[i] * S : Math.round(tall(theirH[p]) * S), level: wetThen ? (parent.surf[p] > SEA_Y + 0.01 ? tall(parent.surf[p]) : SEA_Y) : NaN };
}
/** a face that is the top of a column: the column's x and z; none for any other face */
function topOf(f: Faces, k: number): [number, number] | null {
  const g = k * FACE_GEO;
  if (f.geo[g] % FLIPPED !== 1 || f.nor[k * 4 + 1] <= 0 || Math.abs(f.geo[g + 3] - f.geo[g + 2]) !== S || Math.abs(f.geo[g + 5] - f.geo[g + 4]) !== S) return null;
  return [Math.min(f.geo[g + 2], f.geo[g + 3]) / S, Math.min(f.geo[g + 4], f.geo[g + 5]) / S];
}
const shown = (col: Uint8Array, o: number) => [0, 1, 2].map((m) => (col[o + m] / 255) * (col[o + 3] / 254) * BRIGHTEST);
const inside = (x: number, z: number) => x >= part.x0 && x < part.x1 && z >= part.z0 && z < part.z1;

/** The tops of the coarser piece's columns as it draws them: by column, the two triangles of its top with their colours, and whether the column is what the ground carries. */
function topsOf(parent: Table) {
  const drawn = drawLand(parent, true, QUARTER), tops = new Map<number, { corners: number[][][]; carried: boolean }>();
  for (const [b, carried] of [[drawn.ground, false], [drawn.carried, true]] as [Batch, boolean][]) for (let o = 0; o < b.pos.length; o += 9) {
    const corners = [0, 1, 2].map((c) => [b.pos[o + c * 3], b.pos[o + c * 3 + 2], b.col[o + c * 3], b.col[o + c * 3 + 1], b.col[o + c * 3 + 2]]);
    const x = Math.min(...corners.map((c) => c[0])), z = Math.min(...corners.map((c) => c[1])), p = z * parent.side + x;
    if (![0, 1, 2].every((c) => b.nor[o + c * 3 + 1] === 1 && b.pos[o + c * 3 + 1] === topsAt(parent)[p]) || !Number.isInteger(x) || !Number.isInteger(z)) continue;
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
/** the triangles of a list that lie on a column: their corners' heights now and where they end up */
function sheetsOn(shape: { pos: ArrayLike<number>; sink?: Float32Array }, x: number, z: number, from = 0) {
  const found: { now: number[]; later: number[] }[] = [];
  for (let t = from; t < shape.pos.length / 9; t++) {
    const o = t * 9, mx = (shape.pos[o] + shape.pos[o + 3] + shape.pos[o + 6]) / 3, mz = (shape.pos[o + 2] + shape.pos[o + 5] + shape.pos[o + 8]) / 3;
    if (Math.floor(mx) === x && Math.floor(mz) === z) found.push({ now: [0, 1, 2].map((c) => shape.pos[o + c * 3 + 1]), later: [0, 1, 2].map((c) => (shape.sink ? shape.sink[t * 3 + c] : shape.pos[o + c * 3 + 1])) });
  }
  return found;
}

describe('the glide of a far piece to the coarser one over it', () => {
  it('ends where the coarser piece has its columns: every top at the height of the column over it, land that is water there under that water', () => {
    const { fine, parent, ground, carried, columns } = piece();
    let tops = 0, sink = 0, come = 0;
    for (const f of [ground, carried]) for (let k = 0; k < f.geo.length / FACE_GEO; k++) {
      const at = topOf(f, k);
      if (!at || !inside(at[0], at[1])) continue;
      const c = fate(fine, parent, at[0], at[1]);
      if (c.start !== f.geo[k * FACE_GEO + 1]) continue;
      tops++;
      // water in both steps has no top, now or then
      expect(c.wetNow && c.wetThen).toBe(false);
      expect(glided(f, k, 0)[0]).toBe(c.start);
      expect(glided(f, k, 1)[0], `${at}`).toBe(c.end);
      expect(glided(f, k, 0.5)[0]).toBeCloseTo((c.start + c.end) / 2, 6);
      if (c.wetThen) { sink++; expect(c.end / S).toBeLessThan(c.level - 1); }
      // a top that comes starts under the water that is there now
      if (c.wetNow) { come++; expect(c.start / S).toBeLessThan(fine.surf[c.i] - 0.5); expect(f).toBe(ground); }
    }
    let moving = 0;
    for (let z = part.z0; z < part.z1; z++) for (let x = part.x0; x < part.x1; x++) { const c = fate(fine, parent, x, z); if (!(c.wetNow && c.wetThen)) moving++; }
    expect(tops).toBe(moving);
    expect(columns).toBe(moving);
    expect(columns).toBeGreaterThan(1500);
    expect(sink).toBeGreaterThan(200);
    expect(come).toBeGreaterThan(100);
  });

  it('ends in the colours of the coarser piece: each corner of a top shows what the coarser top shows at that point', () => {
    const { fine, parent, ground, carried, before } = piece(), tops = topsOf(parent);
    let corners = 0, onGround = 0, onCarried = 0, turned = 0, came = 0;
    for (const [f, own] of [[ground, 127], [carried, 0]] as [Faces, number][]) for (let k = 0; k < f.geo.length / FACE_GEO; k++) {
      const at = topOf(f, k);
      if (!at || !inside(at[0], at[1])) continue;
      const c = fate(fine, parent, at[0], at[1]), top = tops.get(c.p), g = k * FACE_GEO;
      if (c.start !== f.geo[g + 1]) continue;
      // (a top that ends under water keeps what it is)
      if (c.wetThen || !top) { expect(f.nor[k * 4 + 3]).toBe(own); expect(f.aimCol!.slice(k * FACE_COL, (k + 1) * FACE_COL)).toEqual(f.col.slice(k * FACE_COL, (k + 1) * FACE_COL)); continue; }
      // ground to the map's paper where the coarser column is ground, whatever the column itself is
      expect(f.nor[k * 4 + 3], `${at}`).toBe(top.carried ? 0 : 127);
      if (top.carried) onCarried++; else onGround++;
      if ((f.nor[k * 4 + 3] === 127) !== (own === 127)) turned++;
      if (f === ground && k >= before.faces) came++;
      for (let n = 0; n < 4; n++) {
        const u = f.geo[g + (n === 1 || n === 2 ? 3 : 2)] / S, v = f.geo[g + (n >= 2 ? 5 : 4)] / S;
        const want = colourAt(top, (fine.ox + u) / 2 - parent.ox, (fine.oz + v) / 2 - parent.oz), has = shown(f.aimCol!, k * FACE_COL + n * 4);
        expect(Math.abs(has[0] - want[0]) + Math.abs(has[1] - want[1]) + Math.abs(has[2] - want[2]), `${at} corner ${n}`).toBeLessThan(0.04);
        corners++;
      }
    }
    expect(corners).toBeGreaterThan(5000);
    expect(onGround).toBeGreaterThan(300);
    expect(onCarried).toBeGreaterThan(100);
    expect(turned).toBeGreaterThan(100);
    expect(came).toBeGreaterThan(100);
  });

  it('keeps the land closed all the way: between two columns stands a side as tall as their tops are apart', () => {
    const { fine, parent, ground, carried } = piece();
    for (const share of [0, 0.25, 0.5, 0.8, 1]) {
      const top = new Float64Array(SIDE * SIDE).fill(NaN), sides = new Map<string, number>();
      for (const f of [ground, carried]) for (let k = 0; k < f.geo.length / FACE_GEO; k++) {
        const g = k * FACE_GEO, axis = f.geo[g] % FLIPPED, way = f.nor[k * 4 + axis], at = topOf(f, k), [end0, end1] = glided(f, k, share);
        if (axis === 1) { if (at) top[at[1] * SIDE + at[0]] = end0; continue; }
        const a = axis === 0 ? 4 : 2, along = Math.floor(Math.min(f.geo[g + a], f.geo[g + a + 1]) / S), across = f.geo[g + 1] / S - (way > 0 ? 1 : 0);
        const key = `${axis === 0 ? across : along},${axis === 0 ? along : across},${axis},${way > 0 ? 1 : -1}`;
        sides.set(key, (sides.get(key) ?? 0) + Math.abs(end1 - end0) * (Math.abs(f.geo[g + a + 1] - f.geo[g + a]) / S));
      }
      let edges = 0, shores = 0;
      for (let z = part.z0; z < part.z1; z++) for (let x = part.x0; x < part.x1; x++) {
        const i = z * SIDE + x;
        // (water that stays water has no top: its bed lies where it lay)
        if (Number.isNaN(top[i])) { const c = fate(fine, parent, x, z); expect(c.wetNow && c.wetThen, `${x}, ${z} has a top`).toBe(true); continue; }
        for (const [dx, dz, axis] of [[1, 0, 0], [-1, 0, 0], [0, 1, 2], [0, -1, 2]] as const) {
          const nx = x + dx, nz = z + dz, j = nz * SIDE + nx;
          if (!inside(nx, nz)) continue;
          edges++;
          if (Number.isNaN(top[j])) shores++;
          // (the ends of a side are whole 64ths at the two ends of the way and anything between: a side may miss its neighbour's top by the rounding;
          // against water that stays water it stands in the bed, which moves too)
          const bed = fate(fine, parent, nx, nz), low = Number.isNaN(top[j]) ? bed.start + (bed.end - bed.start) * share : top[j];
          expect(Math.abs(Math.max(0, top[i] - low) - (sides.get(`${x},${z},${axis},${dx + dz}`) ?? 0)), `share ${share}: ${x}, ${z} towards ${dx}, ${dz}`).toBeLessThanOrEqual(1);
        }
      }
      expect(edges).toBeGreaterThan(5000);
      expect(shores).toBeGreaterThan(20);
    }
  });

  it('adds the faces that are to come: sides with no height until the columns part, tops under the water', () => {
    const { fine, parent, ground, before } = piece(), count = ground.geo.length / FACE_GEO;
    expect(count).toBeGreaterThan(before.faces + 200);
    // the faces the piece had are where they were, in their own colours
    expect(ground.geo.slice(0, before.faces * FACE_GEO)).toEqual(before.geo);
    expect(ground.col.slice(0, before.faces * FACE_COL)).toEqual(before.col);
    for (let k = 0; k < before.faces; k++) expect(ground.geo[k * FACE_GEO]).toBeLessThan(RISES);
    let sides = 0, tops = 0, under = 0, gone = 0;
    for (let k = before.faces; k < count; k++) {
      const g = k * FACE_GEO, kind = ground.geo[g], axis = kind % FLIPPED, way = ground.nor[k * 4 + axis] > 0 ? 1 : -1, a = axis === 0 ? 4 : 2;
      // it shows at once what it will show: a face that comes has no colour of its own to come from
      expect(ground.col.slice(k * FACE_COL, (k + 1) * FACE_COL)).toEqual(ground.aimCol!.slice(k * FACE_COL, (k + 1) * FACE_COL));
      if (axis === 1) { tops++; expect(kind).toBeLessThan(RISES); const at = topOf(ground, k)!, c = fate(fine, parent, at[0], at[1]); expect(c.wetNow && !c.wetThen).toBe(true); continue; }
      sides++;
      expect(kind).toBeGreaterThanOrEqual(RISES);
      const along = Math.floor(Math.min(ground.geo[g + a], ground.geo[g + a + 1]) / S), across = ground.geo[g + 1] / S - (way > 0 ? 1 : 0);
      const x = axis === 0 ? across : along, z = axis === 0 ? along : across, own = fate(fine, parent, x, z), next = fate(fine, parent, axis === 0 ? x + way : x, axis === 0 ? z : z + way);
      const [low0, high0] = glided(ground, k, 0), [low1, high1] = glided(ground, k, 1);
      // a column of land: no side now (it is not above its neighbour), one then
      if (!own.wetNow) { expect(own.start).toBeLessThanOrEqual(next.start); expect(high0 - low0).toBe(0); expect(high1 - low1).toBeGreaterThan(0); }
      // a column of water that ends as land: a side now where its bed lies above its neighbour's, under the water;
      // one then where it ends above its neighbour; and one of the two at least
      else {
        if (high0 > low0) { under++; expect(low0).toBe(next.start); expect(high0).toBe(own.start); expect(high0 / S).toBeLessThan(fine.surf[own.i] - 0.5); if (high1 === low1) gone++; }
        expect(high0 > low0 || high1 > low1).toBe(true);
      }
      // then: from the neighbour's top up to the column's own, where that is above it
      expect(low1).toBe(next.end);
      expect(high1).toBe(Math.max(own.end, next.end));
    }
    expect(sides).toBeGreaterThan(200);
    expect(tops).toBeGreaterThan(100);
    expect(under).toBeGreaterThan(10);
    expect(gone).toBeGreaterThan(3);
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

  it('has the water of the coarser step at the end: under the land that sinks from the start, and water above the sea at its level there', () => {
    const { fine, parent, shapes } = piece();
    let sea = 0, lake = 0, moved = 0, covered = 0;
    for (let z = part.z0; z < part.z1; z++) for (let x = part.x0; x < part.x1; x++) {
      const c = fate(fine, parent, x, z), high = c.level > SEA_Y + 0.01, sheets = [...sheetsOn(shapes.water, x, z), ...sheetsOn(shapes.raised, x, z).filter((s) => Math.abs(s.now[0] - s.now[1]) < 1e-6 && Math.abs(s.now[0] - s.now[2]) < 1e-6)];
      if (!c.wetNow && c.wetThen) {
        // land that sinks: two triangles of water over the column, out of sight under its top now, at the coarser step's level then
        expect(sheets.length, `${x}, ${z}`).toBe(2);
        for (const s of sheets) for (let n = 0; n < 3; n++) { expect(s.now[n]).toBeLessThan(fine.h[c.i]); expect(s.later[n]).toBeCloseTo(c.level, 5); }
        if (high) lake++; else sea++;
      }
      else if (c.wetNow && c.wetThen && fine.surf[c.i] > SEA_Y + 0.01) {
        // water above the sea in both: at its own level now, at the coarser step's then
        expect(sheets.length).toBe(2);
        for (const s of sheets) for (let n = 0; n < 3; n++) { expect(s.now[n]).toBeCloseTo(fine.surf[c.i], 5); expect(s.later[n]).toBeCloseTo(c.level, 5); }
        moved++;
      }
      else if (c.wetNow && !c.wetThen) {
        // water that ends as land: what there is of it ends under the land's top
        for (const s of sheets) for (let n = 0; n < 3; n++) expect(s.later[n]).toBeLessThan(c.end / S + 1e-6);
        covered++;
      }
    }
    expect(sea).toBeGreaterThan(50);
    expect(lake).toBeGreaterThan(100);
    expect(moved).toBeGreaterThan(5);
    expect(covered).toBeGreaterThan(100);
  });

  it('lets the banks of its water sink out of sight and brings up those of the coarser piece', () => {
    const { fine, parent, shapes, before } = piece(), list = shapes.ground, own = before.banks, theirs = small(drawBanks(parent, true, QUARTER));
    expect(own).toBeGreaterThan(300);
    expect(list.sink!.length).toBe(list.pos.length / 3);
    // its own: each triangle lies in a column of water, and ends under that water or under the land that comes there
    for (let t = 0; t < own; t++) {
      const o = t * 9, x = Math.floor((list.pos[o] + list.pos[o + 3] + list.pos[o + 6]) / 3), z = Math.floor((list.pos[o + 2] + list.pos[o + 5] + list.pos[o + 8]) / 3), c = fate(fine, parent, x, z);
      expect(c.wetNow, `${x}, ${z}`).toBe(true);
      const hides = c.wetThen ? (fine.surf[c.i] > SEA_Y + 0.01 ? c.level : fine.surf[c.i]) : c.end / S;
      for (let n = 0; n < 3; n++) { expect(list.sink![t * 3 + n]).toBeLessThan(hides); expect(list.sink![t * 3 + n]).toBeLessThanOrEqual(list.pos[o + n * 3 + 1] + 1e-6); }
    }
    // the coarser piece's: all of them, where that piece has them (in this piece's blocks), and out of sight now
    expect(theirs.pos.length / 9).toBeGreaterThan(100);
    expect(list.pos.length / 9).toBe(own + theirs.pos.length / 9);
    for (let t = 0; t < theirs.pos.length / 9; t++) {
      const o = (own + t) * 9, q = t * 9;
      let under = Infinity;
      for (let n = 0; n < 3; n++) {
        expect(list.pos[o + n * 3]).toBeCloseTo((theirs.pos[q + n * 3] + parent.ox) * 2 - fine.ox, 4);
        expect(list.pos[o + n * 3 + 2]).toBeCloseTo((theirs.pos[q + n * 3 + 2] + parent.oz) * 2 - fine.oz, 4);
        expect(list.sink![(own + t) * 3 + n]).toBeCloseTo(tall(theirs.pos[q + n * 3 + 1]), 4);
        // (under what lies at the triangle's middle now)
        const x = Math.floor((list.pos[o] + list.pos[o + 3] + list.pos[o + 6]) / 3), z = Math.floor((list.pos[o + 2] + list.pos[o + 5] + list.pos[o + 8]) / 3), i = z * SIDE + x;
        under = fine.wet[i] ? fine.surf[i] : fine.h[i];
        expect(list.pos[o + n * 3 + 1]).toBeLessThan(under);
      }
      expect(under).toBeLessThan(Infinity);
    }
    for (let v = 0; v < 12; v++) { expect(list.nor[(own * 3) * 4 + v]).toBe(theirs.nor[v]); expect(list.col[(own * 3) * 4 + v]).toBe(theirs.col[v]); }
  });

  it('takes the crowns of its woods down into their columns and brings up those of the coarser piece, where that piece has them', () => {
    const { fine, parent, carried, before } = piece(), count = carried.geo.length / FACE_GEO;
    /** a face of a crown: the column it stands inside (x, z), of a ground `side` columns a side; none for any other face */
    const crownOf = (f: Faces, k: number, side: number): [number, number] | null => {
      const g = k * FACE_GEO, axis = f.geo[g] % FLIPPED, level = f.geo[g + 1], u = [f.geo[g + 2], f.geo[g + 3]], v = [f.geo[g + 4], f.geo[g + 5]];
      if (axis === 1) {
        if (topOf(f, k)) return null;
        const x = Math.floor(Math.min(...u) / S), z = Math.floor(Math.min(...v) / S);
        return Math.max(...u) <= (x + 1) * S && Math.max(...v) <= (z + 1) * S && x < side && z < side ? [x, z] : null;
      }
      if (level % S) { const a = axis === 0 ? v : u, along = Math.floor(Math.min(...a) / S); return axis === 0 ? [Math.floor(level / S), along] : [along, Math.floor(level / S)]; }
      return null;
    };
    // its own: down into the column, under its top at the end, with no height
    let own = 0;
    for (let k = 0; k < before.carried; k++) {
      const at = crownOf(carried, k, SIDE);
      if (!at || !inside(at[0], at[1])) continue;
      const c = fate(fine, parent, at[0], at[1]), axis = carried.geo[k * FACE_GEO] % FLIPPED, [end0, end1] = glided(carried, k, 1);
      if (c.wetNow && c.wetThen) continue;
      own++;
      expect(end0, `${at}`).toBeLessThan(c.end);
      expect(end0).toBeGreaterThan(c.end - 0.1 * S);
      if (axis !== 1) expect(end1).toBe(end0);
      // (a crown stands on its column's top, now)
      expect(axis === 1 ? glided(carried, k, 0)[0] : Math.min(...glided(carried, k, 0))).toBeGreaterThanOrEqual(c.start);
    }
    expect(own).toBeGreaterThan(500);
    // the coarser piece's: each of its crowns' faces over the piece, under the columns now, where that piece has them then
    const theirs = faced(drawLand(parent, true, QUARTER).carried).faces!, wanted: string[] = [], came: string[] = [];
    for (let k = 0; k < theirs.geo.length / FACE_GEO; k++) {
      const at = crownOf(theirs, k, parent.side);
      if (!at) continue;
      const g = k * FACE_GEO, axis = theirs.geo[g] % FLIPPED, X = (u: number) => 2 * u + (2 * parent.ox - fine.ox) * S, Z = (v: number) => 2 * v + (2 * parent.oz - fine.oz) * S, Y = (y: number) => Math.round(tall(y / S) * S);
      const level = axis === 1 ? Y(theirs.geo[g + 1]) : axis === 0 ? X(theirs.geo[g + 1]) : Z(theirs.geo[g + 1]);
      const u = axis === 0 ? [Y(theirs.geo[g + 2]), Y(theirs.geo[g + 3])] : [X(theirs.geo[g + 2]), X(theirs.geo[g + 3])], v = axis === 2 ? [Y(theirs.geo[g + 4]), Y(theirs.geo[g + 5])] : [Z(theirs.geo[g + 4]), Z(theirs.geo[g + 5])];
      wanted.push([axis, level, ...u, ...v, ...theirs.col.slice(k * FACE_COL, (k + 1) * FACE_COL)].join());
    }
    for (let k = before.carried; k < count; k++) {
      const g = k * FACE_GEO, axis = carried.geo[g] % FLIPPED, [end0, end1] = glided(carried, k, 1), [now0, now1] = glided(carried, k, 0);
      // (where it ends up, as the coarser piece has it)
      const level = axis === 1 ? end0 : carried.geo[g + 1], u = axis === 0 ? [end0, end1] : [carried.geo[g + 2], carried.geo[g + 3]], v = axis === 2 ? [end0, end1] : [carried.geo[g + 4], carried.geo[g + 5]];
      came.push([axis, level, ...u, ...v, ...carried.aimCol!.slice(k * FACE_COL, (k + 1) * FACE_COL)].join());
      expect(carried.col.slice(k * FACE_COL, (k + 1) * FACE_COL)).toEqual(carried.aimCol!.slice(k * FACE_COL, (k + 1) * FACE_COL));
      // now: under the tops of the columns about it, with no height
      if (axis !== 1) expect(now1).toBe(now0);
      const x = Math.floor((axis === 0 ? carried.geo[g + 1] : Math.min(carried.geo[g + 2], carried.geo[g + 3])) / S), z = Math.floor((axis === 2 ? carried.geo[g + 1] : Math.min(carried.geo[g + 4], carried.geo[g + 5])) / S);
      expect(now0, `${x}, ${z}`).toBeLessThan(topsAt(fine)[z * SIDE + x] * S);
    }
    expect(wanted.length).toBeGreaterThan(300);
    expect(came.sort()).toEqual(wanted.sort());
  });

  it('takes what stands on the ground down into its column: at the end it lies under the top there, with no height', () => {
    const { fine, parent } = pair(), drawn = drawTable(fine, true), stands = new Batch();
    // a wall two blocks tall on every third column, on its top or on its water
    for (let z = part.z0; z < part.z1; z += 3) for (let x = part.x0; x < part.x1; x += 3) {
      const i = z * SIDE + x, y = fine.wet[i] ? fine.surf[i] : fine.h[i];
      stands.quad([x + 0.2, y, z + 0.5], [x + 0.8, y, z + 0.5], [x + 0.8, y + 2, z + 0.5], [x + 0.2, y + 2, z + 0.5], [0.5, 0.4, 0.3], [0, 0, 1]);
    }
    const things = small(stands), was = Float32Array.from(things.pos);
    glide({ ground: faced(drawn.ground), carried: faced(drawn.carried!), things, water: small(drawn.water), raised: small(drawn.raised) }, fine, parent, true);
    expect(things.pos).toEqual(was);
    let down = 0, stay = 0;
    for (let v = 0; v < things.pos.length / 3; v++) {
      const c = fate(fine, parent, Math.floor(things.pos[v * 3]), Math.floor(things.pos[v * 3 + 2]));
      // (on water that stays water it stays)
      if (c.wetNow && c.wetThen) { stay++; expect(things.sink![v]).toBe(things.pos[v * 3 + 1]); continue; }
      down++;
      expect(things.sink![v]).toBeLessThan(c.end / S);
      expect(things.sink![v]).toBeGreaterThan(c.end / S - 0.1);
    }
    expect(down).toBeGreaterThan(600);
    expect(stay).toBeGreaterThan(100);
  });

  it('keeps every mesh within the ball round it, in which the stage looks whether to draw it: where it lies and where it ends up', () => {
    const { shapes } = piece();
    let corners = 0;
    for (const [name, shape] of Object.entries(shapes)) {
      const [cx, cy, cz, r] = shape.ball!;
      let out = 0;
      const lies = (x: number, y: number, z: number) => { out = Math.max(out, Math.hypot(x - cx, y - cy, z - cz) - r); corners++; };
      for (let v = 0; v < shape.pos.length / 3; v++) {
        lies(shape.pos[v * 3], shape.pos[v * 3 + 1], shape.pos[v * 3 + 2]);
        if (shape.sink) lies(shape.pos[v * 3], shape.sink[v], shape.pos[v * 3 + 2]);
      }
      const f = shape.faces;
      if (f) for (let k = 0; k < f.geo.length / FACE_GEO; k++) for (const share of [0, 1]) {
        const g = k * FACE_GEO, axis = f.geo[g] % FLIPPED, [end0, end1] = glided(f, k, share), lift = f.lift ?? 0;
        for (const a of [0, 1]) for (const b of [0, 1]) {
          if (axis === 1) lies(f.geo[g + 2 + a] / S, end0 / S + lift, f.geo[g + 4 + b] / S);
          else if (axis === 0) lies(f.geo[g + 1] / S, (a ? end1 : end0) / S + lift, f.geo[g + 4 + b] / S);
          else lies(f.geo[g + 2 + a] / S, (b ? end1 : end0) / S + lift, f.geo[g + 1] / S);
        }
      }
      expect(out, name).toBeLessThanOrEqual(1e-3);
    }
    expect(corners).toBeGreaterThan(50000);
  });

  it('sets nothing where the coarser piece does not lie over the piece', () => {
    const { ground, carried, shapes, before, columns } = piece({ ox: OVER.ox + 40, oz: OVER.oz });
    expect(columns).toBe(0);
    expect(ground.aim).toBeUndefined();
    expect(carried.aim).toBeUndefined();
    expect(ground.geo.length / FACE_GEO).toBe(before.faces);
    expect(shapes.ground.sink).toBeUndefined();
    expect(shapes.raised.sink).toBeUndefined();
    expect(shapes.water.pos.length / 9).toBe(before.water);
    // such faces are drawn where they are, whatever the share
    expect(glided(ground, 0, 0.6)).toEqual(glided(ground, 0, 0));
  });
});
