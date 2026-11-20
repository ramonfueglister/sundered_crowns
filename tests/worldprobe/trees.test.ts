// The trees of the first far step: the very trees of the finest step, where it has them, as large and in its colours;
// kept by a table and drawn from it as they were built.
import { describe, expect, it } from 'vitest';
import { Batch, hash2, seeded } from '../../src/lookprobe/batch';
import { LEAVES, tree } from '../../src/lookprobe/blocks';
import { N, idx, onGrid } from '../../src/lookprobe/layout';
import { drawGround, drawTable, packTable, tableOf, unpackTable } from '../../src/worldprobe/table';
import {
  STRAY,
  TEMPERATE,
  TREE_NUMBERS,
  TREE_PITCH,
  TREES_CLOSED,
  drawTrees,
  treesCode,
  treesIn,
} from '../../src/worldprobe/trees';
import { LAND_STEP, SIDE, land, part } from './land';

const seedOf = (a: number, b: number, salt: number) => Math.floor(hash2(a, b, salt) * 4294967296);

describe('the trees of the first far step', () => {
  it('stand at the places of the finest step whose number is drawn against the woods there, each in the column it lies in', () => {
    const seen = new Set<string>();
    let trees = 0;
    for (let z = 100; z < 140; z++)
      for (let x = 300; x < 340; x++)
        treesIn(x, z, 0.7, (px, pz, tx, tz) => {
          expect(Math.floor(px / 2)).toBe(x);
          expect(Math.floor(pz / 2)).toBe(z);
          expect(hash2(tx, tz, 73)).toBeLessThanOrEqual(STRAY + TREES_CLOSED * 0.7);
          expect(seen.has(`${tx},${tz}`)).toBe(false);
          seen.add(`${tx},${tz}`);
          trees++;
        });
    // as many as the places of the square carry
    const places = (80 / TREE_PITCH) ** 2;
    expect(trees).toBeGreaterThan(places * (STRAY + TREES_CLOSED * 0.7) * 0.85);
    expect(trees).toBeLessThan(places * (STRAY + TREES_CLOSED * 0.7) * 1.15);
  });

  it('draws a leafy tree as wide as its crown at the finest step, in the colour of its top there', () => {
    onGrid(SIDE, () => {
      const trees = new Uint8Array(N * N * TREE_NUMBERS),
        tops = new Float32Array(N * N).fill(8),
        ox = 500,
        oz = 200;
      // a column of open land with leafy trees only
      const [code, kind] = treesCode(0.3, TEMPERATE, 0),
        x = 40,
        z = 40;
      trees[idx(x, z) * 2] = code;
      trees[idx(x, z) * 2 + 1] = kind;
      const places: [number, number, number, number][] = [];
      for (let k = 0; places.length === 0; k++) {
        trees.fill(0);
        trees[idx(x + k, z) * 2] = code;
        trees[idx(x + k, z) * 2 + 1] = kind;
        treesIn(x + k + ox, z + oz, (code - 1) / 254, (px, pz, tx, tz) => places.push([px, pz, tx, tz]));
      }
      const b = new Batch();
      drawTrees(b, trees, tops, ox, oz, { x0: 0, z0: 0, x1: N, z1: N });
      // a trunk and a crown to each tree
      expect(b.triangles).toBe(places.length * 20);
      // the finest step's tree draws its size, then its colour, then the size of its crown from its own source (world.ts, blocks.ts)
      const [px, , tx, tz] = places[0],
        r = seeded(seedOf(tx, tz, 75)),
        size = r.range(0.85, 1.15),
        g = r.pick(LEAVES),
        s = r.range(0.85, 1.15) * size;
      // the first tree's crown follows its trunk: ten triangles each, the top first, in the colour of the tree's top
      expect([b.col[30 * 3], b.col[30 * 3 + 1], b.col[30 * 3 + 2]]).toEqual([...g]);
      // as wide as its broad middle, 0.92 × its size to each side of the trunk, in blocks of the step
      let most = 0;
      for (let v = 30; v < 60; v++) most = Math.max(most, Math.abs(b.pos[v * 3] - (px / 2 - ox)));
      expect(most).toBeCloseTo((0.92 * s) / 2, 9);
      // and so is the finest step's
      const near = new Batch(),
        again = seeded(seedOf(tx, tz, 75));
      tree(near, 0, 0, 0, again, again.range(0.85, 1.15));
      let wide = 0;
      for (let v = 0; v < near.pos.length / 3; v++)
        if (near.pos[v * 3 + 1] > 1.5 && near.pos[v * 3 + 1] < 2) wide = Math.max(wide, Math.abs(near.pos[v * 3]));
      expect(wide).toBeGreaterThanOrEqual(0.92 * s - 1e-9);
    });
  });

  it('are kept by a table and drawn from it, packed and unpacked, as the build drew them', () => {
    onGrid(SIDE, () => {
      const { g, t } = land(),
        trees = new Uint8Array(N * N * TREE_NUMBERS);
      for (let z = 0; z < N; z++)
        for (let x = 0; x < N; x++)
          if ((x + z) % 3 === 0) {
            const [code, kind] = treesCode(0.2 + 0.6 * hash2(x, z, 5), TEMPERATE, hash2(x, z, 6));
            trees[idx(x, z) * 2] = code;
            trees[idx(x, z) * 2 + 1] = kind;
          }
      const traits = { ...t, trees },
        built = drawGround(g, traits, true, part, true),
        table = tableOf(g, traits, part),
        again = drawTable(unpackTable(packTable(table)), true, LAND_STEP);
      expect(built.standing!.triangles).toBeGreaterThan(1000);
      expect(again.standing!.pos).toEqual(built.standing!.pos);
      expect(again.standing!.col).toEqual(built.standing!.col);
      // only the piece's own columns
      for (let z = 0; z < N; z++)
        for (let x = 0; x < N; x++) {
          const inside = x >= part.x0 && x < part.x1 && z >= part.z0 && z < part.z1;
          expect(table.trees![idx(x, z) * 2]).toBe(inside ? trees[idx(x, z) * 2] : 0);
        }
    });
  });
});
