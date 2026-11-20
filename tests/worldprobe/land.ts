// A small land with all its kinds, for the tests of the tables of far pieces and of their glide.
import { hash2, noise2 } from '../../src/lookprobe/batch';
import { type Ground, type GroundTraits, LAND_Y, Mat, N, SEA_Y, idx, measureShore } from '../../src/lookprobe/layout';
import { sideTopAt } from '../../src/lookprobe/terrain';

/** a ground of 96 blocks a side whose piece is its middle 48, with more than RIM columns round it */
export const SIDE = 96, part = { x0: 24, z0: 24, x1: 72, z1: 72 };

/**
 * Hills with a massif of rock, a lake above the sea's level and the sea along one side; woods, fields and a town as
 * part of the ground. The land differs from column to column everywhere, also beyond the rim. `seed` makes another
 * land of the same kinds; the lake lies at the same columns of the ground in all of them, the sea from row `sea` on.
 * `houses`: houses drawn as houses that stand on it (worldprobe/houses.ts).
 */
/** the step of the map the test land is drawn at: its meadow steps take that step's share of the meadow's colour */
export const LAND_STEP = 2;

export function land(ox = 4000, oz = -1200, seed = 0, sea = 60, houses?: readonly number[]): { g: Ground; t: GroundTraits } {
  const n = N * N, g: Ground = { h: new Int16Array(n), mat: new Uint8Array(n), wet: new Uint8Array(n), shore: new Uint8Array(n), occ: new Float32Array(n), surf: new Float32Array(n).fill(SEA_Y), ox, oz };
  const has = new Uint8Array(n), rise = new Uint8Array(n), share = new Float32Array(n), town = new Uint8Array(n), top = new Float32Array(n * 3), side = new Float32Array(n * 3);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = idx(x, z), high = noise2(x / 9, z / 9, 1 + seed);
    g.h[i] = LAND_Y + Math.floor(high * 5);
    if (high > 0.72) { g.mat[i] = Mat.Rock; g.h[i] += 4 + Math.floor(hash2(x >> 1, z >> 1, 2 + seed) * 3); }
    // the sea along the near side, a lake two blocks over it
    // (their beds differ from column to column, too)
    if (z > sea + 6 * noise2(x / 7, 0, 3 + seed)) { g.wet[i] = 1; g.mat[i] = Mat.Bed; g.h[i] = hash2(x, z, 10 + seed) < 0.3 ? 0 : 1; }
    else if (Math.hypot(x - 40, z - 38) < 5) { g.wet[i] = 1; g.mat[i] = Mat.Bed; g.surf[i] = SEA_Y + 2; g.h[i] = LAND_Y - (hash2(x, z, 11 + seed) < 0.3 ? 1 : 0); }
    if (g.wet[i] || g.mat[i] === Mat.Rock) continue;
    const lot = hash2(x, z, 4 + seed), wood = noise2(x / 6, z / 6, 5 + seed) > 0.55, field = !wood && noise2(x / 5, z / 5, 6 + seed) > 0.6;
    if (Math.abs(x - 58) < 3 && Math.abs(z - 34) < 3) { has[i] = 1; town[i] = 1; rise[i] = 2; share[i] = 1; top.set([0.7, 0.3 + 0.1 * lot, 0.2], i * 3); side.set([0.8, 0.75, 0.7], i * 3); }
    else if (wood) { has[i] = 1; rise[i] = lot < 0.5 ? 2 : 1; share[i] = lot < 0.8 ? 1 : 0.4 + 0.5 * hash2(x, z, 7 + seed); top.set([0.08 + 0.04 * lot, 0.2 + 0.1 * lot, 0.05], i * 3); side.set([0.05, 0.12, 0.04], i * 3); }
    else if (field) { has[i] = 2; share[i] = 0.3 + 0.7 * lot; top.set([0.6, 0.5, 0.2 * lot], i * 3); side.set([0.4, 0.3, 0.2], i * 3); }
    if (has[i]) g.h[i] += rise[i];
  }
  measureShore(g);
  for (let i = 0; i < n; i++) g.occ[i] = g.wet[i] ? g.surf[i] : g.h[i];
  const cell = (x: number, z: number) => idx(Math.max(0, Math.min(N - 1, Math.floor(x))), Math.max(0, Math.min(N - 1, Math.floor(z))));
  const dry: readonly [readonly [number, number, number], number] = [[0.8, 0.7, 0.4], 0.5];
  const t: GroundTraits = {
    city: (x, z) => town[cell(x, z)] === 1, plaza: () => Infinity, road: () => Infinity, crop: () => null,
    bleach: (x, z) => noise2(Math.floor(x) / 20, Math.floor(z) / 20, 8 + seed), summit: (x, z) => 0.3 + 0.7 * hash2(Math.floor(x) >> 2, Math.floor(z) >> 2, 9 + seed),
    tint: (x) => (Math.floor(x) < 40 ? dry : null), slope: [0.3, 0.35, 0.1], sideTop: sideTopAt(LAND_STEP),
    cover: (x, z) => { const i = idx(x, z); return has[i] ? { top: [top[i * 3], top[i * 3 + 1], top[i * 3 + 2]], side: [side[i * 3], side[i * 3 + 1], side[i * 3 + 2]], rise: rise[i], share: share[i], stands: has[i] === 1 } : null; },
    houses,
  };
  return { g, t };
}
