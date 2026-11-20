// The fields of the first far step: the very sheaves of the finest step, where it has them, as tall and in its
// colours, on the soil of their crop; laid down by far.ts, kept by a table and drawn from it as they were built.
import { describe, expect, it } from 'vitest';
import { Batch, hash2, seeded } from '../../src/lookprobe/batch';
import { crops } from '../../src/lookprobe/blocks';
import { LAND_Y, Mat, N, SEA_Y, type Ground, idx, onGrid } from '../../src/lookprobe/layout';
import { styleOf } from '../../src/buildings';
import { CROPS_AT, CROP_NAMES, FALLOW_FIELD, OATS_FIELD, WHEAT_FIELD, drawCrops } from '../../src/worldprobe/crops';
import { coverLand } from '../../src/worldprobe/far';
import { drawGround, drawTable, packTable, tableOf, unpackTable } from '../../src/worldprobe/table';
import { LAND_STEP, SIDE, land, part } from './land';

/** the boxes of a batch (ten triangles each): the middle of their top, how tall they stand and the colour of their top */
const sheaves = (b: Batch) => {
  const out: { x: number; z: number; y0: number; y1: number; top: number[] }[] = [];
  for (let v0 = 0; v0 < b.pos.length / 3; v0 += 30) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let v = v0; v < v0 + 30; v++) { x0 = Math.min(x0, b.pos[v * 3]); x1 = Math.max(x1, b.pos[v * 3]); y0 = Math.min(y0, b.pos[v * 3 + 1]); y1 = Math.max(y1, b.pos[v * 3 + 1]); z0 = Math.min(z0, b.pos[v * 3 + 2]); z1 = Math.max(z1, b.pos[v * 3 + 2]); }
    let top: number[] = [];
    for (let v = v0; v < v0 + 30; v++) if (b.pos[v * 3 + 1] === y1 && b.nor[v * 3 + 1] > 0.9) top = [b.col[v * 3], b.col[v * 3 + 1], b.col[v * 3 + 2]];
    out.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, y0, y1, top });
  }
  return out;
};
const meadow = (): Ground => ({ h: new Int16Array(N * N).fill(LAND_Y), mat: new Uint8Array(N * N).fill(Mat.Grass), wet: new Uint8Array(N * N), shore: new Uint8Array(N * N), occ: new Float32Array(N * N).fill(LAND_Y), surf: new Float32Array(N * N).fill(SEA_Y), ox: 0, oz: 0 });

describe('the fields of the first far step', () => {
  it('stand the finest step\'s sheaves on a lot: each where it stands, half as tall in blocks twice as wide, in the colour of its top', () => {
    onGrid(SIDE, () => {
      for (const [crop, code] of [['wheat', WHEAT_FIELD], ['oats', OATS_FIELD]] as const) {
        // the lot 7, 5 (every other row set off by half a lot): its field from 7 · 11 + 5 + 1 = 83, 5 · 8 + 1 = 41, ten blocks by seven
        const fine = new Batch();
        crops(fine, meadow(), [83 + 5, 41 + 3.5], 10, 7, crop, seeded(1));
        // the far step's columns of that lot carry its crop: those whose middle (2x + 1, 2z + 1) lies on the field
        const laid = new Uint8Array(N * N), tops = new Float32Array(N * N).fill(4), wet = new Uint8Array(N * N);
        for (let z = 0; z < 40; z++) for (let x = 0; x < 60; x++) if (2 * x + 1 >= 83 && 2 * x + 1 < 93 && 2 * z + 1 >= 41 && 2 * z + 1 < 48) laid[idx(x, z)] = code;
        const far = new Batch();
        drawCrops(far, laid, tops, wet, 0, 0, { x0: 0, z0: 0, x1: 60, z1: 40 });
        const a = sheaves(fine), b = sheaves(far);
        expect(b.length, crop).toBe(70);
        expect(a.length).toBe(70);
        for (const s of b) {
          const same = a.find((q) => Math.abs(q.x - 2 * s.x) < 1e-9 && Math.abs(q.z - 2 * s.z) < 1e-9);
          expect(same, `${crop} at ${2 * s.x}, ${2 * s.z}`).toBeDefined();
          expect(s.y1 - s.y0).toBeCloseTo((same!.y1 - same!.y0) / 2, 9);
          expect(s.top).toEqual(same!.top);
        }
      }
    });
  });

  it('are laid down by far.ts on the columns of the lots that are fields, on their soil, and the fallow bears nothing', () => {
    onGrid(SIDE, () => {
      const g: Ground = meadow(), c = coverLand(g, CROPS_AT, new Batch(), [], { ploughed: () => 1, courses: () => 3, vines: () => 0, farm: () => styleOf('').house, own: () => true, woods: () => null });
      let wheat = 0, oats = 0, fallow = 0;
      for (let i = 0; i < SIDE * SIDE; i++) {
        const crop = c.crops?.[i] ?? 0;
        if (!crop) continue;
        expect(g.mat[i]).toBe(Mat.Soil);
        expect(c.has[i]).toBe(0);
        if (crop === WHEAT_FIELD) wheat++; else if (crop === OATS_FIELD) oats++; else if (crop === FALLOW_FIELD) fallow++;
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
      const { g, t } = land(), laid = new Uint8Array(N * N);
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (g.mat[idx(x, z)] === Mat.Grass && hash2(x >> 2, z >> 2, 7) < 0.4) { laid[idx(x, z)] = 1 + Math.floor(hash2(x >> 2, z >> 2, 8) * 4); g.mat[idx(x, z)] = Mat.Soil; }
      const traits = { ...t, crops: laid, crop: (x: number, z: number) => CROP_NAMES[laid[idx(Math.max(0, Math.min(N - 1, Math.floor(x))), Math.max(0, Math.min(N - 1, Math.floor(z))))]] }, built = drawGround(g, traits, true, part, true), table = tableOf(g, traits, part), again = drawTable(unpackTable(packTable(table)), true, LAND_STEP);
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
