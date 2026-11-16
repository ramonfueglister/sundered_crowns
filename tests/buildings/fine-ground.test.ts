// The fine ground of the near view (src/buildings/ground): a pure function per cell that never builds beyond the
// cell nor above its columns, the same for the same cell, and nothing where there is nothing to build.
import { describe, expect, it } from 'vitest';
import { Batch } from '../../src/lookprobe/batch';
import { type Column, type GroundCell, VENICE, fineGround, waterColourAt, waterFlecks } from '../../src/buildings';

const land: Column = { top: 4, wet: false, paved: true }, grass: Column = { top: 4, wet: false, paved: false }, sea: Column = { top: 2.7, wet: true, paved: false };
/** an island: paved land for x < 12, water beyond, grass in a strip at the back */
const at = (x: number, z: number): Column | null => (x < 0 || z < 0 || x >= 60 || z >= 60 ? null : x < 4 ? grass : x < 12 ? land : sea);
const cell: GroundCell = { x0: 5, z0: 10, size: 25, ox: 1000, oz: 2000, water: 2.7 };

const bounds = (b: Batch) => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < b.pos.length; i += 3) {
    x0 = Math.min(x0, b.pos[i]); x1 = Math.max(x1, b.pos[i]); y0 = Math.min(y0, b.pos[i + 1]); y1 = Math.max(y1, b.pos[i + 1]); z0 = Math.min(z0, b.pos[i + 2]); z1 = Math.max(z1, b.pos[i + 2]);
  }
  return { x0, x1, y0, y1, z0, z1 };
};

describe('fine ground', () => {
  it('is the same for the same cell', () => {
    const a = new Batch(), b = new Batch();
    fineGround(a, cell, at, VENICE.quay); fineGround(b, cell, at, VENICE.quay);
    expect(a.triangles).toBeGreaterThan(100);
    expect(Array.from(a.pos)).toEqual(Array.from(b.pos));
    expect(Array.from(a.col)).toEqual(Array.from(b.col));
  });
  it('stays inside its cell and under the tops of its columns, but for the posts and a hair of paving', () => {
    const b = new Batch();
    fineGround(b, cell, at, VENICE.quay);
    const r = bounds(b), e = 0.01;
    expect(r.x0).toBeGreaterThanOrEqual(cell.x0 - e); expect(r.x1).toBeLessThanOrEqual(cell.x0 + cell.size + e);
    expect(r.z0).toBeGreaterThanOrEqual(cell.z0 - e); expect(r.z1).toBeLessThanOrEqual(cell.z0 + cell.size + e);
    // nothing above the land but the mooring posts (two fine blocks), nothing deeper than half a block under the water
    expect(r.y1).toBeLessThanOrEqual(land.top + 2 * 0.1875 + e); expect(r.y0).toBeGreaterThanOrEqual(cell.water - 0.5 - e);
    // the paving lies a hair over the land, never under it
    let lowestTop = Infinity;
    for (let i = 0; i < b.pos.length; i += 3) if (b.nor[i + 1] > 0.99 && b.pos[i] < 12) lowestTop = Math.min(lowestTop, b.pos[i + 1]);
    expect(lowestTop).toBeGreaterThan(land.top - 0.5 - e);
  });
  it('builds nothing for a cell of open water or of plain grass, and only paving for paved land without a shore', () => {
    const b = new Batch();
    fineGround(b, { ...cell, x0: 30, z0: 30 }, at, VENICE.quay);
    expect(b.triangles).toBe(0);
    fineGround(b, { x0: 0, z0: 0, size: 4, ox: 0, oz: 0, water: 2.7 }, at, VENICE.quay);
    expect(b.triangles).toBe(0);
    fineGround(b, { x0: 5, z0: 30, size: 5, ox: 0, oz: 0, water: 2.7 }, at, VENICE.quay);
    expect(b.triangles).toBeGreaterThan(0);
    for (let i = 0; i < b.nor.length; i += 3) expect(b.nor[i + 1]).toBeGreaterThan(0.99);
  });
  it('agrees across a cell border: the two halves of a quay build the same as the whole', () => {
    const whole = new Batch(), halves = new Batch();
    fineGround(whole, { x0: 5, z0: 10, size: 20, ox: 1000, oz: 2000, water: 2.7 }, at, VENICE.quay);
    fineGround(halves, { x0: 5, z0: 10, size: 10, ox: 1000, oz: 2000, water: 2.7 }, at, VENICE.quay);
    fineGround(halves, { x0: 5, z0: 20, size: 10, ox: 1000, oz: 2000, water: 2.7 }, at, VENICE.quay);
    // the same number of posts and steps along the quay (the parts above the paving)
    const above = (b: Batch) => { let n = 0; for (let i = 1; i < b.pos.length; i += 3) if (b.pos[i] > land.top + 0.05) n++; return n; };
    expect(above(halves)).toBe(above(whole));
    expect(halves.triangles).toBe(whole.triangles);
  });
  it('colours the water in level bands and lays its flecks only on wet columns of the cell', () => {
    const a = waterColourAt(100, 100), b = waterColourAt(100.5, 100.5);
    expect(a.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(waterColourAt(100, 100)).toEqual(a);
    const f = new Batch();
    waterFlecks(f, cell, at);
    const r = bounds(f);
    expect(f.triangles).toBeGreaterThan(0);
    expect(r.x0).toBeGreaterThanOrEqual(12 - 0.01); expect(r.x1).toBeLessThanOrEqual(cell.x0 + cell.size + 0.01);
    expect(r.y0).toBeGreaterThan(cell.water); expect(r.y1).toBeLessThan(cell.water + 0.02);
    expect(b.length).toBe(3);
  });
});

describe('terraces', () => {
  it('builds a stone face where paved ground steps down to paved ground, and nothing where it steps up', () => {
    // the town at 4, a paved rim at 3 along x = 12, water beyond
    const rim: Column = { top: 3, wet: false, paved: true };
    const atRim = (x: number, z: number): Column | null => (x < 0 || z < 0 || x >= 60 || z >= 60 ? null : x < 12 ? land : x < 13 ? rim : sea);
    const b = new Batch();
    fineGround(b, cell, atRim, VENICE.quay);
    // faces with the normal +x lying on x = 12 between 3 and 4: the terrace wall; none with -x on x = 12 (the rim has nothing to show towards the town)
    let terrace = 0, back = 0, quay = 0;
    for (let i = 0; i < b.pos.length; i += 9) {
      const nx = b.nor[i], x = b.pos[i], y0 = Math.min(b.pos[i + 1], b.pos[i + 4], b.pos[i + 7]), y1 = Math.max(b.pos[i + 1], b.pos[i + 4], b.pos[i + 7]);
      if (Math.abs(x - 12) < 0.02 && nx > 0.9 && y0 >= 3 - 0.01 && y1 <= 4 + 0.01) terrace++;
      if (Math.abs(x - 12) < 0.02 && nx < -0.9) back++;
      if (Math.abs(x - 13) < 0.02 && nx > 0.9) quay++;
    }
    expect(terrace).toBeGreaterThan(cell.size * 4);
    expect(back).toBe(0);
    expect(quay).toBeGreaterThan(cell.size * 4);
  });
});
