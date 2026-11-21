// The fields of the first far step: the very sheaves and vines of the finest step, where it has them, as tall as the
// land is built and in their colours, on the soil of their crop, also in the strips of the land register's furlongs;
// laid down by far.ts, kept by a table and drawn from it as they were built.
import { describe, expect, it } from 'vitest';
import { styleOf } from '../../src/buildings';
import { Batch, hash2, seeded } from '../../src/lookprobe/batch';
import { crops } from '../../src/lookprobe/blocks';
import { type Ground, idx, LAND_Y, Mat, N, onGrid, SEA_Y } from '../../src/lookprobe/layout';
import { CROP } from '../../src/sim/settlement/fields';
import {
  CROP_NAMES,
  CROPS_AT,
  drawCrops,
  FALLOW_FIELD,
  OATS_FIELD,
  VINE_FIELD,
  WHEAT_FIELD,
} from '../../src/worldprobe/crops';
import { coverLand } from '../../src/worldprobe/far';
import { drawGround, drawTable, tableOf } from '../../src/worldprobe/table';
import { packTable, unpackTable } from '../../src/worldprobe/table_pack';
import { uprightOf } from '../../src/worldprobe/zoom';
import { LAND_STEP, land, part, SIDE } from './land';

interface Box {
  x: number;
  z: number;
  y0: number;
  y1: number;
  top: number[];
}
/**
 * the boxes of a batch (ten triangles each, twelve with a bottom; each begins with its top): the middle of their top,
 * how tall they stand, the colour of their top
 */
const sheaves = (b: Batch) => {
  const out: Box[] = [],
    starts: number[] = [];
  for (let v = 0; v < b.pos.length / 3; v += 6) if (b.nor[v * 3 + 1] > 0.9) starts.push(v);
  starts.push(b.pos.length / 3);
  for (let n = 0; n + 1 < starts.length; n++) {
    const v0 = starts[n],
      v1 = starts[n + 1];
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    for (let v = v0; v < v1; v++) {
      x0 = Math.min(x0, b.pos[v * 3]);
      x1 = Math.max(x1, b.pos[v * 3]);
      y0 = Math.min(y0, b.pos[v * 3 + 1]);
      y1 = Math.max(y1, b.pos[v * 3 + 1]);
      z0 = Math.min(z0, b.pos[v * 3 + 2]);
      z1 = Math.max(z1, b.pos[v * 3 + 2]);
    }
    const top = [b.col[v0 * 3], b.col[v0 * 3 + 1], b.col[v0 * 3 + 2]];
    out.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, y0, y1, top });
  }
  return out;
};
/**
 * That the boxes of the far step are those of the finest, each half as far from the world's corner and standing as
 * tall over its ground as the far step builds: `base` is the far step's ground, the finest step's is under its lowest.
 */
const alike = (fine: Box[], far: Box[], base: number, what: string) => {
  const up = uprightOf(CROPS_AT),
    ground = Math.min(...fine.map((q) => q.y0)),
    near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  expect(far.length, what).toBe(fine.length);
  for (const s of far) {
    const same = fine.find((q) => near(q.x, 2 * s.x) && near(q.z, 2 * s.z) && near((q.y1 - ground) * up, s.y1 - base));
    expect(same, `${what} at ${2 * s.x}, ${2 * s.z}`).toBeDefined();
    expect(s.y0 - base).toBeCloseTo((same!.y0 - ground) * up, 6);
    expect(s.top).toEqual(same!.top);
  }
};
/** the corner of the field of a lot in finest blocks of the world (settle.ts: every other row set off by half a lot) */
const cornerOf = (lx: number, lz: number) => [lx * 11 + (lz & 1 ? 5 : 0) + 1, lz * 8 + 1] as const;
/** what far.ts asks of the land: all of it under the plough */
const asks = {
  ploughed: () => 1,
  courses: () => 3,
  vines: () => 0,
  farm: () => styleOf('').house,
  own: () => true,
  woods: () => null,
};
const meadow = (): Ground => ({
  h: new Int16Array(N * N).fill(LAND_Y),
  mat: new Uint8Array(N * N).fill(Mat.Grass),
  wet: new Uint8Array(N * N),
  shore: new Uint8Array(N * N),
  occ: new Float32Array(N * N).fill(LAND_Y),
  surf: new Float32Array(N * N).fill(SEA_Y),
  ox: 0,
  oz: 0,
});

describe('the fields of the first far step', () => {
  it("stand the finest step's sheaves on a lot: each where it stands, as tall as the land is built in blocks twice as wide, in the colour of its top", () => {
    onGrid(SIDE, () => {
      for (const [crop, code] of [
        ['wheat', WHEAT_FIELD],
        ['oats', OATS_FIELD],
      ] as const) {
        // the lot 7, 5 (every other row set off by half a lot): its field from 7 · 11 + 5 + 1 = 83, 5 · 8 + 1 = 41,
        // ten blocks by seven
        const fine = new Batch();
        crops(fine, meadow(), [83 + 5, 41 + 3.5], 10, 7, crop, seeded(1));
        // the far step's columns of that lot carry its crop: those whose middle (2x + 1, 2z + 1) lies on the field
        const laid = new Uint8Array(N * N),
          tops = new Float32Array(N * N).fill(4),
          wet = new Uint8Array(N * N);
        for (let z = 0; z < 40; z++)
          for (let x = 0; x < 60; x++)
            if (2 * x + 1 >= 83 && 2 * x + 1 < 93 && 2 * z + 1 >= 41 && 2 * z + 1 < 48) laid[idx(x, z)] = code;
        const far = new Batch();
        drawCrops(far, laid, tops, wet, 0, 0, { x0: 0, z0: 0, x1: 60, z1: 40 });
        const a = sheaves(fine),
          b = sheaves(far);
        expect(b.length, crop).toBe(70);
        expect(a.length).toBe(70);
        for (const s of b) {
          const same = a.find((q) => Math.abs(q.x - 2 * s.x) < 1e-9 && Math.abs(q.z - 2 * s.z) < 1e-9);
          expect(same, `${crop} at ${2 * s.x}, ${2 * s.z}`).toBeDefined();
          expect(s.y1 - s.y0).toBeCloseTo((same!.y1 - same!.y0) * uprightOf(CROPS_AT), 9);
          expect(s.top).toEqual(same!.top);
        }
      }
    });
  });

  it("stand a furlong of the land register as the finest step sows it: in its farmsteads' strips, each a little lighter or darker, as deep as the register has it", () => {
    onGrid(SIDE, () => {
      for (const [crop, name] of [
        [CROP.winter, 'wheat'],
        [CROP.spring, 'oats'],
      ] as const) {
        // the lot 7, 5 in three strips five rows deep (settle.ts)
        const strips = 3,
          rows = 5,
          [fx0, fz0] = cornerOf(7, 5),
          fine = new Batch();
        for (let k = 0; k < strips; k++) {
          const a0 = fx0 + Math.round((k * 10) / strips),
            a1 = fx0 + Math.round(((k + 1) * 10) / strips),
            r = seeded(Math.floor(hash2(7 * 16 + k, 5, 68) * 4294967296)),
            tone = 0.84 + 0.32 * hash2(7 * 16 + k, 5, 69);
          crops(fine, meadow(), [(a0 + a1) / 2, fz0 + rows / 2], a1 - a0, rows, name, r, tone);
        }
        const field = (lx: number, lz: number) => (lx === 7 && lz === 5 ? { crop, rows, strips } : undefined),
          g = meadow(),
          c = coverLand(g, CROPS_AT, new Batch(), [], { ...asks, field }),
          far = new Batch();
        drawCrops(far, c.crops!, g.h, g.wet, 0, 0, { x0: 0, z0: 0, x1: SIDE, z1: SIDE }, () => true, c.furlongs);
        expect(sheaves(fine).length).toBe(50);
        alike(sheaves(fine), sheaves(far), g.h[0], name);
      }
    });
  });

  it("plant the finest step's vines plant by plant, on a grid or in hedges, each strip of a furlong by its own numbers, and draw each plant once however a piece is cut", () => {
    onGrid(SIDE, () => {
      // (lots whose fields lie on the ground of the finest step too, which is as wide as the far step's here)
      const lots = [
        [7, 5],
        [3, 5],
        [5, 4],
        [2, 6],
        [6, 3],
        [1, 8],
      ] as const;
      // (the lots are both: hedges and plants on a grid; a plant of a lot lies on its field and the balks after it)
      const onLot = (dx: number, dz: number) => dx > -0.5 && dx < 11 && dz > -0.5 && dz < 8;
      const hedges = lots.map(([lx, lz]) => hash2(...cornerOf(lx, lz), 55) < 0.5);
      expect(hedges).toContain(true);
      expect(hedges).toContain(false);
      for (const register of [false, true]) {
        const strips = register ? 2 : 1,
          rows = register ? 6 : 7,
          field = register ? () => ({ crop: CROP.winter, rows, strips }) : undefined,
          g = meadow(),
          c = coverLand(g, CROPS_AT, new Batch(), [], { ...asks, courses: () => 1, vines: () => 1, field }),
          far = new Batch();
        expect(c.crops![idx(43, 22)]).toBe(VINE_FIELD);
        // two parts of a piece, the line between them through the fields of the lot 7, 5
        for (const [x0, x1] of [
          [0, 44],
          [44, SIDE],
        ])
          drawCrops(far, c.crops!, g.h, g.wet, 0, 0, { x0, z0: 0, x1, z1: SIDE }, () => true, c.furlongs);
        for (const [lx, lz] of lots) {
          const [fx0, fz0] = cornerOf(lx, lz),
            fine = new Batch();
          for (let k = 0; k < strips; k++) {
            const a0 = fx0 + Math.round((k * 10) / strips),
              a1 = fx0 + Math.round(((k + 1) * 10) / strips),
              r = seeded(Math.floor(hash2(register ? lx * 16 + k : lx, lz, 68) * 4294967296));
            crops(fine, meadow(), [(a0 + a1) / 2, fz0 + rows / 2], a1 - a0, rows, 'vine', r);
          }
          const on = sheaves(far).filter((s) => onLot(2 * s.x - fx0, 2 * s.z - fz0));
          expect(on.length).toBeGreaterThan(20);
          alike(sheaves(fine), on, g.h[0], `vines of ${lx}, ${lz}${register ? ' in strips' : ''}`);
        }
      }
    });
  });

  it('are laid down by far.ts on the columns of the lots that are fields, on their soil, and the fallow bears nothing', () => {
    onGrid(SIDE, () => {
      const g: Ground = meadow(),
        c = coverLand(g, CROPS_AT, new Batch(), [], asks);
      let wheat = 0,
        oats = 0,
        fallow = 0;
      for (let i = 0; i < SIDE * SIDE; i++) {
        const crop = c.crops?.[i] ?? 0;
        if (!crop) continue;
        expect(g.mat[i]).toBe(Mat.Soil);
        expect(c.has[i]).toBe(0);
        if (crop === WHEAT_FIELD) wheat++;
        else if (crop === OATS_FIELD) oats++;
        else if (crop === FALLOW_FIELD) fallow++;
      }
      // three courses: as much winter corn as spring corn and fallow, more or less
      expect(wheat).toBeGreaterThan(SIDE * SIDE * 0.1);
      expect(oats).toBeGreaterThan(SIDE * SIDE * 0.1);
      expect(fallow).toBeGreaterThan(SIDE * SIDE * 0.1);
      const b = new Batch();
      drawCrops(b, c.crops!, g.h, g.wet, 0, 0, { x0: 0, z0: 0, x1: SIDE, z1: SIDE });
      // a sheaf on a block of every column of wheat and oats, about
      expect(b.triangles / 10).toBeGreaterThan((wheat + oats) * 2);
    });
  });

  it('are kept by a table and drawn from it, packed and unpacked, as the build drew them', () => {
    onGrid(SIDE, () => {
      const { g, t } = land(),
        laid = new Uint8Array(N * N);
      for (let z = 0; z < N; z++)
        for (let x = 0; x < N; x++)
          if (g.mat[idx(x, z)] === Mat.Grass && hash2(x >> 2, z >> 2, 7) < 0.4) {
            laid[idx(x, z)] = 1 + Math.floor(hash2(x >> 2, z >> 2, 8) * 4);
            g.mat[idx(x, z)] = Mat.Soil;
          }
      const at = (v: number) => Math.max(0, Math.min(N - 1, Math.floor(v)));
      const traits = { ...t, crops: laid, crop: (x: number, z: number) => CROP_NAMES[laid[idx(at(x), at(z))]] },
        built = drawGround(g, traits, true, part, true),
        table = tableOf(g, traits, part),
        again = drawTable(unpackTable(packTable(table)), true, LAND_STEP);
      expect(built.standing!.triangles).toBeGreaterThan(1000);
      expect(again.standing!.pos).toEqual(built.standing!.pos);
      expect(again.standing!.col).toEqual(built.standing!.col);
      // and the soil under them in the colour of its crop, as the build drew it (from the table as it is: packed, the
      // meadow's bleach is kept in steps)
      const drawn = drawTable(table, true, LAND_STEP).ground.col;
      let most = 0;
      for (let k = 0; k < drawn.length; k++) most = Math.max(most, Math.abs(drawn[k] - built.ground.col[k]));
      expect(drawn.length).toBe(built.ground.col.length);
      expect(most).toBe(0);
    });
  });
});
