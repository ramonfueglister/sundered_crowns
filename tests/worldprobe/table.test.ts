// A far piece drawn from the table of its columns is the piece its build drew.
import { describe, expect, it } from 'vitest';
import type { Batch, RGB } from '../../src/lookprobe/batch';
import { type GroundTraits, Mat, N, SUMMIT, idx, onGrid } from '../../src/lookprobe/layout';
import { FLOOR } from '../../src/lookprobe/terrain_woods';
import { RIM, drawGround, drawTable, keepTables, tableOf, tabled } from '../../src/worldprobe/table';
import { packTable, unpackTable } from '../../src/worldprobe/table_pack';
import { LAND_STEP, SIDE, land, part } from './land';

const lists = (b: Batch | undefined) => ({ pos: b!.pos, nor: b!.nor, col: b!.col });

describe('the table of a far piece', () => {
  it('draws the piece as its build drew it, to the last number', () => {
    onGrid(SIDE, () => {
      const { g, t } = land(),
        built = drawGround(g, t, true, part, true),
        again = drawTable(tableOf(g, t, part), true, LAND_STEP);
      // the land has all its kinds: ground, what it carries, sea, raised water and its falls
      expect(built.ground.triangles).toBeGreaterThan(4000);
      expect(built.carried!.triangles).toBeGreaterThan(500);
      expect(built.water.triangles).toBeGreaterThan(100);
      expect(built.raised.triangles).toBeGreaterThan(20);
      for (const name of ['ground', 'carried', 'water', 'raised'] as const)
        expect(lists(again[name]), name).toEqual(lists(built[name]));
    });
    expect(N).not.toBe(SIDE);
  });

  it('holds the columns of the piece and a rim round them, and nothing of the land beyond', () => {
    onGrid(SIDE, () => {
      const { g, t } = land(),
        table = tableOf(g, t, part);
      expect(part.x0 - RIM).toBeGreaterThan(0);
      for (let z = 0; z < SIDE; z++)
        for (let x = 0; x < SIDE; x++) {
          const i = idx(x, z),
            inside = x >= part.x0 - RIM && x < part.x1 + RIM && z >= part.z0 - RIM && z < part.z1 + RIM;
          expect(table.h[i], `${x}, ${z}`).toBe(inside ? g.h[i] : 0);
        }
    });
  });

  it('is kept while a ground is drawn, where that is asked for', () => {
    onGrid(SIDE, () => {
      const { g, t } = land();
      keepTables(true);
      const built = drawGround(g, t, false, part, true),
        table = tabled();
      keepTables(false);
      expect(table).not.toBeNull();
      expect(lists(drawTable(table!, false, LAND_STEP).ground)).toEqual(lists(built.ground));
      drawGround(g, t, false, part, true);
      expect(tabled()).toBeNull();
    });
  });

  it('packed and unpacked draws the same shapes, with colours within a 200th', () => {
    onGrid(SIDE, () => {
      const { g, t } = land(),
        built = drawGround(g, t, true, part, true),
        run = packTable(tableOf(g, t, part)),
        again = drawTable(unpackTable(run), true, LAND_STEP);
      // (a tenth of the lists it is drawn as)
      expect(run.byteLength).toBeLessThan(SIDE * SIDE * 32);
      for (const name of ['ground', 'carried', 'water', 'raised'] as const) {
        expect(again[name]!.pos, name).toEqual(built[name]!.pos);
        expect(again[name]!.nor, name).toEqual(built[name]!.nor);
        let most = 0;
        for (let k = 0; k < built[name]!.col.length; k++)
          most = Math.max(most, Math.abs(again[name]!.col[k] - built[name]!.col[k]));
        expect(most, name).toBeLessThan(0.005);
      }
    });
  });

  it('keeps a pale rock column pale and a grey one grey when it is packed', () => {
    onGrid(SIDE, () => {
      const { g, t } = land(),
        table = tableOf(g, t, part),
        back = unpackTable(packTable(table));
      let rock = 0;
      for (let i = 0; i < SIDE * SIDE; i++)
        if (table.mat[i] === Mat.Rock && table.h[i]) {
          rock++;
          expect(back.summit[i] > SUMMIT).toBe(table.summit[i] > SUMMIT);
        }
      expect(rock).toBeGreaterThan(50);
    });
  });

  it('keeps a rock column on its side of the threshold where the packed steps would carry it across', () => {
    onGrid(SIDE, () => {
      const { g, t } = land(),
        table = tableOf(g, t, part),
        near = [SUMMIT - 0.003, SUMMIT - 0.001, SUMMIT, SUMMIT + 1e-6, SUMMIT + 0.003];
      for (let i = 0; i < SIDE * SIDE; i++) if (table.mat[i] === Mat.Rock) table.summit[i] = near[i % near.length];
      const back = unpackTable(packTable(table)),
        exact = drawTable(table, true, LAND_STEP),
        again = drawTable(back, true, LAND_STEP);
      for (let i = 0; i < SIDE * SIDE; i++)
        if (table.mat[i] === Mat.Rock)
          expect(back.summit[i] > SUMMIT, `${table.summit[i]}`).toBe(table.summit[i] > SUMMIT);
      // (a column that changed sides would split its walls elsewhere: other shapes)
      expect(again.ground.pos).toEqual(exact.ground.pos);
    });
  });

  it('draws a green field that is no wood in its own colour, not as the floor of a wood, and keeps it so', () => {
    onGrid(SIDE, () => {
      const { g, t } = land();
      // the spring corn of a far step: green and standing on the ground as the woods do, but no trees (world.ts tells
      // them by what far.ts laid: far_fields.ts); without a word of it a green cover counts as trees. (In single
      // floats, as a table keeps its colours.)
      const SPRING: RGB = [Math.fround(0.3), Math.fround(0.55), Math.fround(0.07)],
        sown = new Set<number>();
      for (let z = part.z0; z < part.z1; z++)
        for (let x = part.x0; x < part.x1; x++)
          if (!g.wet[idx(x, z)] && g.mat[idx(x, z)] === Mat.Grass && !t.cover!(x, z)) sown.add(idx(x, z));
      const withCorn = (trees: boolean | undefined): GroundTraits => ({
        ...t,
        cover: (x, z) =>
          sown.has(idx(x, z)) ? { top: SPRING, side: SPRING, rise: 0, share: 1, stands: true, trees } : t.cover!(x, z),
      });
      /** the green of the tops of the sown columns, all summed */
      const green = (b: Batch) => {
        let sum = 0;
        for (let v = 0; v < b.pos.length / 3; v += 3)
          if (b.nor[v * 3 + 1] > 0.99) {
            const x = Math.floor((b.pos[v * 3] + b.pos[v * 3 + 3] + b.pos[v * 3 + 6]) / 3),
              z = Math.floor((b.pos[v * 3 + 2] + b.pos[v * 3 + 5] + b.pos[v * 3 + 8]) / 3);
            if (sown.has(idx(x, z))) for (let c = 0; c < 3; c++) sum += b.col[(v + c) * 3 + 1];
          }
        return sum;
      };
      expect(sown.size).toBeGreaterThan(300);
      const field = drawGround(g, withCorn(false), true, part, true),
        wood = drawGround(g, withCorn(undefined), true, part, true);
      expect(green(wood.carried!) / green(field.carried!)).toBeCloseTo(FLOOR, 2);
      const again = drawTable(tableOf(g, withCorn(false), part), true, LAND_STEP);
      for (const name of ['ground', 'carried'] as const) expect(lists(again[name]), name).toEqual(lists(field[name]));
    });
  });
});
