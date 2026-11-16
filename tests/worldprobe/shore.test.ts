// The banks of the water: land laid into the water's own columns along the smoothed line of the shore, so that a
// slanted coast is a slanted line and not a stair. Narrow water stays open, a quay stays straight.
import { describe, expect, it } from 'vitest';
import { Batch } from '../../src/lookprobe/batch';
import { type Ground, type GroundTraits, LAND_Y, Mat, N, SEA_Y } from '../../src/lookprobe/layout';
import { buildShore, shoreField } from '../../src/lookprobe/shore';

const L = 2 * N + 1;
/** a ground whose columns are water where `wet` says so, land a block above the sea elsewhere; (ox, oz) shifts what `wet` sees */
function ground(wet: (x: number, z: number) => boolean, mat: (x: number, z: number) => number = () => Mat.Grass, ox = 0, oz = 0): Ground {
  const g: Ground = { h: new Int16Array(N * N), mat: new Uint8Array(N * N), wet: new Uint8Array(N * N), shore: new Uint8Array(N * N), occ: new Float32Array(N * N), surf: new Float32Array(N * N).fill(SEA_Y), ox, oz };
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = z * N + x, w = wet(x + ox, z + oz);
    g.wet[i] = w ? 1 : 0; g.mat[i] = w ? Mat.Bed : mat(x + ox, z + oz); g.h[i] = w ? 1 : LAND_Y; g.occ[i] = w ? SEA_Y : LAND_Y;
  }
  return g;
}
/** the field at a point given in columns (halves only) */
const at = (f: Float32Array, x: number, z: number) => f[Math.round(z * 2) * L + Math.round(x * 2)];
const TRAITS: GroundTraits = { city: () => false, plaza: () => Infinity, crop: () => null, road: () => Infinity, bleach: () => 0, summit: () => 0 };

describe('the banks of the water', () => {
  it('fill the notches of a slanted coast up to the line through its corners', () => {
    // land where x + z < 400: a stair of one column a step
    const f = shoreField(ground((x, z) => x + z >= 400))!;
    for (let x = 150; x < 250; x++) {
      const z = 400 - x;
      // the notch between two corners of the stair (the first wet column) is land to its middle, the next column is water
      expect(at(f, x + 0.5, z + 0.5), `notch at ${x}`).toBeGreaterThan(0);
      expect(at(f, x + 1.5, z + 0.5), `beyond at ${x}`).toBeLessThan(0);
    }
  });

  it('stand out a part of a column before a straight coast', () => {
    const f = shoreField(ground((x) => x >= 200))!;
    for (let z = 150; z < 250; z++) {
      expect(at(f, 200, z + 0.5)).toBeGreaterThan(0);
      expect(at(f, 201, z + 0.5)).toBeLessThan(0);
    }
  });

  it('leave narrow water open: a river of one column, straight, slanted and round a bend, and a sound of two', () => {
    const river = (x: number, z: number) => (z === 100 && x < 200) || (x === 200 && z >= 100 && z < 150) || (x >= 200 && x < 300 && (z === x - 50 || z === x - 51)) || ((x === 320 || x === 321) && z > 20);
    const f = shoreField(ground(river))!;
    let checked = 0;
    for (let z = 30; z < 370; z++) for (let x = 30; x < 370; x++) {
      if (!river(x, z)) continue;
      // the middle of every column of it is water, and so is the middle of every edge to the next column of it
      expect(at(f, x + 0.5, z + 0.5), `middle of ${x}, ${z}`).toBeLessThan(0);
      if (river(x + 1, z)) expect(at(f, x + 1, z + 0.5), `edge east of ${x}, ${z}`).toBeLessThan(0);
      if (river(x, z + 1)) expect(at(f, x + 0.5, z + 1), `edge south of ${x}, ${z}`).toBeLessThan(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('leave a quay straight', () => {
    const f = shoreField(ground((x) => x >= 200, () => Mat.Paved))!;
    for (let z = 150; z < 250; z++) for (const x of [200, 200.5, 201]) expect(at(f, x, z + 0.5)).toBeLessThanOrEqual(0);
  });

  it('are the same on every ground that covers them', () => {
    const coast = (x: number, z: number) => x + 2 * z >= 700 + 6 * Math.sin(x / 7) || (z === 150 && x < 400);
    const a = shoreField(ground(coast))!, b = shoreField(ground(coast, undefined, 100, 0))!;
    for (let z = 20; z < 380; z += 0.5) for (let x = 120; x < 380; x += 0.5) expect(at(a, x, z), `at ${x}, ${z}`).toBeCloseTo(at(b, x - 100, z), 5);
  });

  it('lie in the water\'s columns only and no higher than the land', () => {
    const wet = (x: number, z: number) => x + z >= 400, g = ground(wet), b = new Batch();
    buildShore(b, g, TRAITS, false, { x0: 100, z0: 100, x1: 300, z1: 300 });
    expect(b.triangles).toBeGreaterThan(400);
    for (let k = 0; k < b.pos.length; k += 9) {
      const cx = (b.pos[k] + b.pos[k + 3] + b.pos[k + 6]) / 3, cz = (b.pos[k + 2] + b.pos[k + 5] + b.pos[k + 8]) / 3;
      expect(wet(Math.floor(cx), Math.floor(cz))).toBe(true);
      expect(cx >= 100 && cx < 300 && cz >= 100 && cz < 300).toBe(true);
      for (const y of [b.pos[k + 1], b.pos[k + 4], b.pos[k + 7]]) expect(y).toBeLessThanOrEqual(LAND_Y + 1e-6);
    }
    // nothing where there is no water
    expect(shoreField(ground(() => false))).toBeNull();
  });
});
