// The near view must be one world too (worldprobe/settle.ts, nearground.ts): its houses stand on the same lots on
// every ground that covers them and are the far houses again, and its paved ground comes out the same everywhere.
import { describe, expect, it } from 'vitest';
import { Batch } from '../../src/lookprobe/batch';
import { LAND_Y, Mat, N, SEA_Y } from '../../src/lookprobe/layout';
import { heightOf, styleOf } from '../../src/buildings';
import { columnsOf, pave } from '../../src/worldprobe/nearground';
import { type Lot, type Site, raise, settle } from '../../src/worldprobe/settle';
import { meadow } from './meadow';

describe('the houses of the near view', () => {
  /** a town and a village that build as Venice does, and a town that has no fine blocks yet, where they lie in the world */
  const places: [number, number, number, number | null, string][] = [
    [300, 200, 4, 60000, 'italy'],
    [240, 110, 1, null, 'italy'],
    [330, 300, 3, 20000, ''],
  ];
  const laid = (ox: number) => {
    const things = new Batch(),
      sites: Site[] = places.map(([x, z, size, pop, region], id) => ({
        id,
        at: [x - ox + 0.5, z + 0.5],
        size,
        pop,
        region,
        style: styleOf(region),
      }));
    const { lots } = settle(
      meadow(ox),
      things,
      sites,
      [],
      () => ({ region: '', style: styleOf('') }),
      () => 0,
      () => 0,
      {},
    );
    return { things, lots };
  };
  const key = (l: Lot, ox: number) => [l.x + ox, l.z, l.w, l.d, l.y, l.floors, l.seed, l.front, l.region].join(' ');

  it('stand on the same lots on every ground that covers them', () => {
    const a = laid(0),
      b = laid(200),
      shared = (l: Lot, ox: number) => l.x + ox >= 230 && l.x + ox < 370;
    const here = a.lots
        .filter((l) => shared(l, 0))
        .map((l) => key(l, 0))
        .sort(),
      there = b.lots
        .filter((l) => shared(l, 200))
        .map((l) => key(l, 200))
        .sort();
    expect(here.length).toBeGreaterThan(20);
    expect(here).toEqual(there);
    // only the houses that have fine blocks are kept apart; the others stand among the things
    expect(a.lots.every((l) => l.region === 'italy')).toBe(true);
    expect(a.things.triangles).toBeGreaterThan(0);
  }, 60000);

  it('are the far houses again, from their fine blocks', () => {
    const top = (b: Batch) => {
      let y = -Infinity;
      for (let i = 1; i < b.pos.length; i += 3) y = Math.max(y, b.pos[i]);
      return y;
    };
    for (const l of laid(0).lots.slice(0, 12)) {
      const far = new Batch(),
        near = new Batch();
      raise(far, l, 0);
      raise(near, l, 1);
      expect(near.triangles).toBeGreaterThan(far.triangles * 5);
      // both stay under the height the settlement keeps clear over the lot, and are about as tall
      for (const b of [far, near])
        expect(top(b) - l.y).toBeLessThanOrEqual(heightOf(styleOf(l.region), l.w, l.d, l.floors) + 1e-6);
      expect(Math.abs(top(far) - top(near))).toBeLessThan(1);
    }
  }, 60000);
});

describe('the ground of the near view', () => {
  /** the meadow with its lake (world blocks 250 to 270 by 150 to 170), paved from 230 to 290 by 140 to 180 */
  const town = (ox: number) => {
    const g = meadow(ox);
    for (let z = 140; z < 180; z++)
      for (let x = 0; x < N; x++) if (x + ox >= 230 && x + ox < 290 && !g.wet[z * N + x]) g.mat[z * N + x] = Mat.Paved;
    return g;
  };
  /** the fine ground of the cell at world block (wx, z) of a ground starting at (ox, 0) */
  const cell = (ox: number, wx: number, z: number) => {
    const b = new Batch(),
      columns = columnsOf(town(ox), wx - ox, z, 25, 'italy');
    if (columns) pave(b, columns);
    return b;
  };
  const span = (b: Batch, axis: number) => {
    let lo = Infinity,
      hi = -Infinity;
    for (let i = axis; i < b.pos.length; i += 3) {
      lo = Math.min(lo, b.pos[i]);
      hi = Math.max(hi, b.pos[i]);
    }
    return [lo, hi];
  };

  it('is built only where a cell has paved ground', () => {
    expect(columnsOf(town(0), 100, 300, 25, 'italy')).toBeNull();
    expect(cell(0, 100, 300).triangles).toBe(0);
    expect(cell(0, 250, 150).triangles).toBeGreaterThan(0);
  });

  it('stays within its cell and over the whole blocks it lies on', () => {
    const b = cell(0, 250, 150),
      [x0, x1] = span(b, 0),
      [z0, z1] = span(b, 2);
    expect(x0).toBeGreaterThanOrEqual(250);
    expect(x1).toBeLessThanOrEqual(275);
    expect(z0).toBeGreaterThanOrEqual(150);
    expect(z1).toBeLessThanOrEqual(175);
    // a pane over the paving, a mooring post on it: under a block over the ground
    expect(span(b, 1)[1]).toBeLessThan(LAND_Y + 1);
  });

  it('has a quay wall where the paving meets the water, and none along a meadow', () => {
    // the lake's east shore lies in the cell from 250; the cell from 275 has the paving's edge to the meadow at 290
    expect(span(cell(0, 250, 150), 1)[0]).toBeLessThan(SEA_Y);
    const dry = cell(0, 275, 150);
    expect(dry.triangles).toBeGreaterThan(0);
    expect(span(dry, 1)[0]).toBeGreaterThanOrEqual(LAND_Y);
  });

  it('comes out the same on every ground that covers it', () => {
    const a = cell(0, 250, 150),
      b = cell(200, 250, 150);
    expect(a.triangles).toBe(b.triangles);
    for (let i = 0; i < a.pos.length; i++) expect(a.pos[i] - b.pos[i]).toBeCloseTo(i % 3 === 0 ? 200 : 0, 6);
    expect(a.col).toEqual(b.col);
  });

  it('lays no paving under a house, and costs a cell less than a great house of fine blocks', () => {
    // a cell paved all over is the most ground a cell can have: the near view's budget is counted in houses
    const g = meadow(0);
    for (let i = 0; i < N * N; i++) if (!g.wet[i]) g.mat[i] = Mat.Paved;
    const all = new Batch(),
      built = new Batch();
    pave(all, columnsOf(g, 300, 300, 25, 'italy')!);
    pave(built, columnsOf(g, 300, 300, 25, 'italy', [{ x: 295, z: 305, w: 15, d: 10 }])!);
    expect(all.triangles).toBeLessThan(16000);
    // ten by ten columns of the house lie in the cell
    expect(built.triangles).toBeLessThan(all.triangles * (1 - 90 / 625));
    expect(built.triangles).toBeGreaterThan(all.triangles * (1 - 110 / 625));
  });
});
