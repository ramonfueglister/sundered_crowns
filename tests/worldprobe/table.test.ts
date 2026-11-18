// A far piece drawn from the table of its columns is the piece its build drew.
import { describe, expect, it } from 'vitest';
import { type Batch, hash2, noise2 } from '../../src/lookprobe/batch';
import { type Ground, type GroundTraits, LAND_Y, Mat, N, SEA_Y, SUMMIT, idx, measureShore, onGrid } from '../../src/lookprobe/layout';
import { RIM, drawGround, drawTable, keepTables, packTable, tableOf, tabled, unpackTable } from '../../src/worldprobe/table';

/** a ground of 96 blocks a side whose piece is its middle 48, with more than RIM columns round it */
const SIDE = 96, part = { x0: 24, z0: 24, x1: 72, z1: 72 };

/**
 * Hills with a massif of rock, a lake above the sea's level and the sea along one side; woods, fields and a town as
 * part of the ground. The land differs from column to column everywhere, also beyond the rim.
 */
function land(): { g: Ground; t: GroundTraits } {
  const n = N * N, g: Ground = { h: new Int16Array(n), mat: new Uint8Array(n), wet: new Uint8Array(n), shore: new Uint8Array(n), occ: new Float32Array(n), surf: new Float32Array(n).fill(SEA_Y), ox: 4000, oz: -1200 };
  const has = new Uint8Array(n), rise = new Uint8Array(n), share = new Float32Array(n), town = new Uint8Array(n), top = new Float32Array(n * 3), side = new Float32Array(n * 3);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = idx(x, z), high = noise2(x / 9, z / 9, 1);
    g.h[i] = LAND_Y + Math.floor(high * 5);
    if (high > 0.72) { g.mat[i] = Mat.Rock; g.h[i] += 4 + Math.floor(hash2(x >> 1, z >> 1, 2) * 3); }
    // the sea along the near side, a lake two blocks over it
    if (z > 60 + 6 * noise2(x / 7, 0, 3)) { g.wet[i] = 1; g.mat[i] = Mat.Bed; g.h[i] = 1; }
    else if (Math.hypot(x - 40, z - 38) < 5) { g.wet[i] = 1; g.mat[i] = Mat.Bed; g.surf[i] = SEA_Y + 2; g.h[i] = LAND_Y; }
    if (g.wet[i] || g.mat[i] === Mat.Rock) continue;
    const lot = hash2(x, z, 4), wood = noise2(x / 6, z / 6, 5) > 0.55, field = !wood && noise2(x / 5, z / 5, 6) > 0.6;
    if (Math.abs(x - 58) < 3 && Math.abs(z - 34) < 3) { has[i] = 1; town[i] = 1; rise[i] = 2; share[i] = 1; top.set([0.7, 0.3 + 0.1 * lot, 0.2], i * 3); side.set([0.8, 0.75, 0.7], i * 3); }
    else if (wood) { has[i] = 1; rise[i] = lot < 0.5 ? 2 : 1; share[i] = lot < 0.8 ? 1 : 0.4 + 0.5 * hash2(x, z, 7); top.set([0.08 + 0.04 * lot, 0.2 + 0.1 * lot, 0.05], i * 3); side.set([0.05, 0.12, 0.04], i * 3); }
    else if (field) { has[i] = 2; share[i] = 0.3 + 0.7 * lot; top.set([0.6, 0.5, 0.2 * lot], i * 3); side.set([0.4, 0.3, 0.2], i * 3); }
    if (has[i]) g.h[i] += rise[i];
  }
  measureShore(g);
  for (let i = 0; i < n; i++) g.occ[i] = g.wet[i] ? g.surf[i] : g.h[i];
  const cell = (x: number, z: number) => idx(Math.max(0, Math.min(N - 1, Math.floor(x))), Math.max(0, Math.min(N - 1, Math.floor(z))));
  const dry: readonly [readonly [number, number, number], number] = [[0.8, 0.7, 0.4], 0.5];
  const t: GroundTraits = {
    city: (x, z) => town[cell(x, z)] === 1, plaza: () => Infinity, road: () => Infinity, crop: () => null,
    bleach: (x, z) => noise2(Math.floor(x) / 20, Math.floor(z) / 20, 8), summit: (x, z) => 0.3 + 0.7 * hash2(Math.floor(x) >> 2, Math.floor(z) >> 2, 9),
    tint: (x, z) => (Math.floor(x) < 40 ? dry : null), slope: [0.3, 0.35, 0.1],
    cover: (x, z) => { const i = idx(x, z); return has[i] ? { top: [top[i * 3], top[i * 3 + 1], top[i * 3 + 2]], side: [side[i * 3], side[i * 3 + 1], side[i * 3 + 2]], rise: rise[i], share: share[i], stands: has[i] === 1 } : null; },
  };
  return { g, t };
}
const lists = (b: Batch | undefined) => ({ pos: b!.pos, nor: b!.nor, col: b!.col });

describe('the table of a far piece', () => {
  it('draws the piece as its build drew it, to the last number', () => {
    onGrid(SIDE, () => {
      const { g, t } = land(), built = drawGround(g, t, true, part, true), again = drawTable(tableOf(g, t, part), true);
      // the land has all its kinds: ground, what it carries, sea, raised water and its falls
      expect(built.ground.triangles).toBeGreaterThan(4000);
      expect(built.carried!.triangles).toBeGreaterThan(500);
      expect(built.water.triangles).toBeGreaterThan(100);
      expect(built.raised.triangles).toBeGreaterThan(20);
      for (const name of ['ground', 'carried', 'water', 'raised'] as const) expect(lists(again[name]), name).toEqual(lists(built[name]));
    });
    expect(N).not.toBe(SIDE);
  });

  it('holds the columns of the piece and a rim round them, and nothing of the land beyond', () => {
    onGrid(SIDE, () => {
      const { g, t } = land(), table = tableOf(g, t, part);
      expect(part.x0 - RIM).toBeGreaterThan(0);
      for (let z = 0; z < SIDE; z++) for (let x = 0; x < SIDE; x++) {
        const i = idx(x, z), inside = x >= part.x0 - RIM && x < part.x1 + RIM && z >= part.z0 - RIM && z < part.z1 + RIM;
        expect(table.h[i], `${x}, ${z}`).toBe(inside ? g.h[i] : 0);
      }
    });
  });

  it('is kept while a ground is drawn, where that is asked for', () => {
    onGrid(SIDE, () => {
      const { g, t } = land();
      keepTables(true);
      const built = drawGround(g, t, false, part, true), table = tabled();
      keepTables(false);
      expect(table).not.toBeNull();
      expect(lists(drawTable(table!, false).ground)).toEqual(lists(built.ground));
      drawGround(g, t, false, part, true);
      expect(tabled()).toBeNull();
    });
  });

  it('packed and unpacked draws the same shapes, with colours within a 200th', () => {
    onGrid(SIDE, () => {
      const { g, t } = land(), built = drawGround(g, t, true, part, true), run = packTable(tableOf(g, t, part)), again = drawTable(unpackTable(run), true);
      // (a tenth of the lists it is drawn as)
      expect(run.byteLength).toBeLessThan(SIDE * SIDE * 32);
      for (const name of ['ground', 'carried', 'water', 'raised'] as const) {
        expect(again[name]!.pos, name).toEqual(built[name]!.pos);
        expect(again[name]!.nor, name).toEqual(built[name]!.nor);
        let most = 0;
        for (let k = 0; k < built[name]!.col.length; k++) most = Math.max(most, Math.abs(again[name]!.col[k] - built[name]!.col[k]));
        expect(most, name).toBeLessThan(0.005);
      }
    });
  });

  it('keeps a pale rock column pale and a grey one grey when it is packed', () => {
    onGrid(SIDE, () => {
      const { g, t } = land(), table = tableOf(g, t, part), back = unpackTable(packTable(table));
      let rock = 0;
      for (let i = 0; i < SIDE * SIDE; i++) if (table.mat[i] === Mat.Rock && table.h[i]) { rock++; expect(back.summit[i] > SUMMIT).toBe(table.summit[i] > SUMMIT); }
      expect(rock).toBeGreaterThan(50);
    });
  });

  it('keeps a rock column on its side of the threshold where the packed steps would carry it across', () => {
    onGrid(SIDE, () => {
      const { g, t } = land(), table = tableOf(g, t, part), near = [SUMMIT - 0.003, SUMMIT - 0.001, SUMMIT, SUMMIT + 1e-6, SUMMIT + 0.003];
      for (let i = 0; i < SIDE * SIDE; i++) if (table.mat[i] === Mat.Rock) table.summit[i] = near[i % near.length];
      const back = unpackTable(packTable(table)), exact = drawTable(table, true), again = drawTable(back, true);
      for (let i = 0; i < SIDE * SIDE; i++) if (table.mat[i] === Mat.Rock) expect(back.summit[i] > SUMMIT, `${table.summit[i]}`).toBe(table.summit[i] > SUMMIT);
      // (a column that changed sides would split its walls elsewhere: other shapes)
      expect(again.ground.pos).toEqual(exact.ground.pos);
    });
  });
});
