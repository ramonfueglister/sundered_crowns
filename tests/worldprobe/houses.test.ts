// The houses of the near view as the far steps draw them: each where it stands, on its ground, under a roof of its
// own; the same house with the same corners at every step; kept by a table and drawn from it as it was built.
import { describe, expect, it } from 'vitest';
import { Batch, rgb, shade } from '../../src/lookprobe/batch';
import { N, idx, onGrid } from '../../src/lookprobe/layout';
import { HOUSE_NUMBERS, drawHouses, housesIn } from '../../src/worldprobe/houses';
import { drawGround, drawTable, packTable, tableOf, unpackTable } from '../../src/worldprobe/table';
import { LAND_STEP, SIDE, land, part } from './land';

const WALL = 0xd8c8a8,
  ROOF = 0xb04a30;
/** a house: its corner, width and depth, eaves and rise, and hips (1) or gables (0) */
const house = (x0: number, z0: number, w: number, d: number, eaves: number, rise: number, hips = 0) => [
  x0,
  z0,
  x0 + w,
  z0 + d,
  eaves,
  rise,
  WALL,
  ROOF,
  hips,
];
/** the corners of a batch as [x, y, z] */
const corners = (b: Batch) =>
  Array.from({ length: b.pos.length / 3 }, (_, v) => [b.pos[v * 3], b.pos[v * 3 + 1], b.pos[v * 3 + 2]]);
const near = (a: readonly number[], b: readonly number[]) => a.every((v, k) => Math.abs(v - b[k]) < 1e-9);

describe('the houses of the far steps', () => {
  it('stand on the highest column under them, their walls down to the lowest, under a roof whose ridge runs along the longer side', () => {
    onGrid(SIDE, () => {
      // the house covers the columns 30 … 31 × 40 … 42, one of which stands two blocks higher
      const tops = new Float32Array(N * N).fill(10),
        b = new Batch();
      tops[idx(31, 41)] = 12;
      const ends = drawHouses(b, house(30.25, 40.5, 1.5, 2, 2.4, 1.1), tops),
        all = corners(b),
        ys = all.map((c) => c[1]);
      expect(ends).toEqual([all.length]);
      expect(Math.min(...ys)).toBe(10);
      const ridge = Math.max(...ys);
      expect(ridge).toBeGreaterThan(12 + 2.4 + 0.9);
      expect(ridge).toBeLessThan(12 + 2.4 + 1.1);
      // the walls end at the eaves, and the roof passes over their top edge: it is as high there as the walls
      const walls = all.filter((c) => c[0] === 30.25 || c[0] === 31.75);
      expect(Math.max(...walls.map((c) => c[1]))).toBeCloseTo(14.4, 9);
      // the ridge runs along z, the longer side, from gable to gable over the overhang
      const top = all.filter((c) => c[1] === ridge);
      for (const c of top) expect(c[0]).toBeCloseTo(31, 9);
      expect(Math.min(...top.map((c) => c[2]))).toBeLessThan(40.5);
      expect(Math.max(...top.map((c) => c[2]))).toBeGreaterThan(42.5);
      // the gables are of the walls' colour, the slopes of the roof's
      const colours = Array.from({ length: b.col.length / 3 }, (_, v) => [
          b.col[v * 3],
          b.col[v * 3 + 1],
          b.col[v * 3 + 2],
        ]),
        roof = rgb(ROOF);
      expect(colours.some((c) => near(c, shade(rgb(WALL), 0.96)))).toBe(true);
      expect(
        colours.some((c) => {
          const k = c[0] / roof[0];
          return k > 0.93 && k < 1.07 && near(c, shade(roof, k));
        }),
      ).toBe(true);
    });
  });

  it('draws a hip roof with its ends sloping in, and a flat roof as a level terrace', () => {
    onGrid(SIDE, () => {
      const tops = new Float32Array(N * N).fill(10),
        hips = new Batch(),
        flat = new Batch();
      drawHouses(hips, house(30, 40, 2, 1.5, 2, 0.8, 1), tops);
      drawHouses(flat, house(30, 40, 2, 1.5, 2, 0), tops);
      const h = corners(hips),
        ridge = Math.max(...h.map((c) => c[1])),
        top = h.filter((c) => c[1] === ridge);
      // the ridge runs along x and stops short of the ends by half the roof's width: no gables
      expect(Math.min(...top.map((c) => c[0]))).toBeGreaterThan(30.5);
      expect(Math.max(...top.map((c) => c[0]))).toBeLessThan(31.5);
      for (let v = 0; v < hips.col.length / 3; v++)
        expect(near([hips.col[v * 3], hips.col[v * 3 + 1], hips.col[v * 3 + 2]], shade(rgb(WALL), 0.96))).toBe(false);
      const f = corners(flat);
      expect(Math.max(...f.map((c) => c[1]))).toBe(12);
      expect(flat.triangles).toBe(10);
    });
  });

  it('draws the same house with the same corners at every step, the coarser half as wide in its own blocks', () => {
    onGrid(SIDE, () => {
      const tops = new Float32Array(N * N).fill(6);
      for (const hips of [0, 1])
        for (const [w, d] of [
          [1.5, 2],
          [2, 2],
          [2.5, 1.5],
        ]) {
          const fine = new Batch(),
            coarse = new Batch();
          drawHouses(fine, house(40.5, 30.25, w, d, 2.4, 1, hips), tops);
          drawHouses(coarse, house(20.25, 15.125, w / 2, d / 2, 1.6, 0.66, hips), tops);
          const a = corners(fine),
            b = corners(coarse);
          expect(a.length, `${w} × ${d}, hips ${hips}`).toBe(b.length);
          a.forEach((c, v) => {
            expect(c[0]).toBeCloseTo(2 * b[v][0], 9);
            expect(c[2]).toBeCloseTo(2 * b[v][2], 9);
          });
        }
    });
  });

  it('keeps in a table the houses whose middle lies in the piece, and draws them from it, packed and unpacked, as the build did', () => {
    onGrid(SIDE, () => {
      // two inside the piece, one across its edge with its middle inside, one with its middle outside
      const houses = [
        ...house(30.25, 40.5, 1.5, 2, 2.4, 1.1),
        ...house(50, 33, 2, 1.5, 2, 0.8, 1),
        ...house(23.5, 50, 1, 1.5, 1.8, 0.7),
        ...house(22.5, 50, 1, 1.5, 1.8, 0.7),
      ];
      const { g, t } = land(4000, -1200, 0, 60, houses),
        built = drawGround(g, t, true, part, true),
        table = tableOf(g, t, part),
        again = drawTable(unpackTable(packTable(table)), true, LAND_STEP);
      expect(table.houses).toEqual(housesIn(houses, part));
      expect(table.houses!.length).toBe(3 * HOUSE_NUMBERS);
      expect(built.standing!.triangles).toBeGreaterThan(3 * 12);
      expect(again.standing!.pos).toEqual(built.standing!.pos);
      expect(again.standing!.col).toEqual(built.standing!.col);
    });
  });
});
