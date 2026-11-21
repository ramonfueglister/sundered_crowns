import { describe, expect, it } from 'vitest';
import { Batch, type RGB, mix, shade, smooth } from '../../src/lookprobe/batch';
import { FACE_GEO, FACE_STEPS, type Faces } from '../../src/lookprobe/faces';
import { COAST_STEPS, coastOf } from '../../src/lookprobe/sea_corners';
import { WATER_DEEP, WATER_SHALLOW } from '../../src/lookprobe/terrain';
import { faced } from '../../src/worldprobe/small';

/** a sea of level faces over the columns x0 … x1, 0 … 39, its corners coloured as terrain.ts colours the water's by `away`, the columns to the coast, in patches of light and shade */
function sea(away: (x: number, z: number) => number, x0 = 0, x1 = 40): Faces {
  const b = new Batch();
  const tone = (x: number, z: number): RGB =>
    shade(
      mix(WATER_SHALLOW, WATER_DEEP, smooth(0.4, 8, away(x, z))),
      0.93 + 0.12 * Math.abs(Math.sin(x * 0.7 + z * 1.3)),
    );
  for (let z = 0; z < 40; z++)
    for (let x = x0; x < x1; x++)
      b.quadAt(
        x,
        2,
        z,
        x,
        2,
        z + 1,
        x + 1,
        2,
        z + 1,
        x + 1,
        2,
        z,
        tone(x, z),
        tone(x, z + 1),
        tone(x + 1, z + 1),
        tone(x + 1, z),
        0,
        1,
        0,
      );
  return faced(b).faces!;
}
/** the distance `coastOf` gives each corner of the faces, by the corner's place */
function distances(f: Faces) {
  const told = coastOf(f),
    at = new Map<string, number>();
  for (let k = 0; k < f.geo.length / FACE_GEO; k++)
    for (let c = 0; c < 4; c++) {
      const x = f.geo[k * FACE_GEO + (c === 1 || c === 2 ? 3 : 2)] / FACE_STEPS,
        z = f.geo[k * FACE_GEO + (c >= 2 ? 5 : 4)] / FACE_STEPS;
      at.set(`${x},${z}`, told[k * 4 + c] / COAST_STEPS);
    }
  return at;
}
/** a coast that runs askew and bends: the columns from it */
const askew = (x: number, z: number) => 0.55 * x + 0.3 * z - 4 + 0.8 * Math.sin(z / 6);

/** the columns to the coast a corner's own bytes tell (as sea.ts reads them from the colour) */
function own(f: Faces) {
  const [, gs, bs] = WATER_SHALLOW,
    [, gd, bd] = WATER_DEEP,
    at = new Map<string, number>();
  for (let k = 0; k < f.geo.length / FACE_GEO; k++)
    for (let c = 0; c < 4; c++) {
      const x = f.geo[k * FACE_GEO + (c === 1 || c === 2 ? 3 : 2)] / FACE_STEPS,
        z = f.geo[k * FACE_GEO + (c >= 2 ? 5 : 4)] / FACE_STEPS,
        q = f.col[k * 16 + c * 4 + 1] / f.col[k * 16 + c * 4 + 2],
        mixed = Math.min(1, Math.max(0, (gs - q * bs) / (q * (bd - bs) - (gd - gs))));
      at.set(`${x},${z}`, 0.4 + 7.6 * (0.5 - Math.sin(Math.asin(1 - 2 * mixed) / 3)));
    }
  return at;
}
/** how far the distances are off those of `away` on the mean, where the foam comes (1.5 to 5.5 columns out) */
function off(at: Map<string, number>, away: (x: number, z: number) => number) {
  let sum = 0,
    n = 0;
  for (const [where, d] of at) {
    const [x, z] = where.split(',').map(Number),
      real = away(x, z);
    if (real < 1.5 || real > 5.5) continue;
    sum += Math.abs(d - real);
    n++;
  }
  return { mean: sum / n, n };
}

describe('the corners of the sea', () => {
  it('tell their distance from the coast to a tenth of a column, thrice as well as their own bytes', () => {
    const f = sea(askew),
      smoothed = off(distances(f), askew),
      raw = off(own(f), askew);
    expect(smoothed.n).toBeGreaterThan(200);
    expect(smoothed.mean).toBeLessThan(0.1);
    expect(smoothed.mean).toBeLessThan(raw.mean / 3);
  });
  it('tell the same at the edge of two pieces, to a tenth of a column', () => {
    // (a coast that crosses the edge between the pieces, at x = 20)
    const across = (x: number, z: number) => askew(z, x);
    const left = distances(sea(across, 0, 20)),
      right = distances(sea(across, 20, 40));
    let apart = 0,
      n = 0;
    for (let z = 0; z <= 40; z++) {
      const real = across(20, z);
      if (real < 1.5 || real > 5.5) continue;
      apart += Math.abs(left.get(`20,${z}`)! - right.get(`20,${z}`)!);
      n++;
    }
    expect(n).toBeGreaterThan(5);
    expect(apart / n).toBeLessThan(0.1);
  });
});
