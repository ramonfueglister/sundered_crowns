// How far the corners of the sea's faces lie from the coast, smoothed, for the foam along the coast (sea_shore.ts).
//
// The distance is in the colours of the water's corners (terrain.ts buildWater mixes them from WATER_SHALLOW to WATER_DEEP by
// k = smooth(0.4, 8, d), d the columns to the nearest dry one with a little noise), and the stage has those colours as
// bytes (worldprobe/small.ts): the two colours differ so little in hue that the bytes tell some seven steps of k apart,
// a corner's d to a quarter of a column on the mean. A line of foam drawn by such a d is a zigzag from corner to
// corner (round 5).
// So the d of each corner is taken from the corners around it: the plane that fits the d of all corners of the sea
// within COAST_AROUND columns best (least squares), read at the corner itself. A plane, not a mean, since a piece of
// the world knows the corners of its own sea alone: at its edge the mean of what is there lies to one side of the
// corner, and the lines of two pieces would not meet.
import { smooth } from './batch';
import { FACE_COL, FACE_GEO, FACE_STEPS, FLIPPED, type Faces } from './faces';
import { WATER_DEEP, WATER_SHALLOW } from './terrain';

/** the corners within this many columns of a corner, along either axis, give its distance (OWN RULE: the fewest by which a line of foam ran smoothly) */
const COAST_AROUND = 3;
/** a byte's steps to a column of the distance: a byte tells up to 255 / COAST_STEPS = 9.1 columns, more than the corners' mix reaches (8) */
export const COAST_STEPS = 28;
const COAST_MOST = 255 / COAST_STEPS;
/** corners farther from the coast than this many columns, by their own colour, are not smoothed: the foam comes within 5.5 (sea_shore.ts RING_FROM, and its sway and wash) */
const COAST_FAR = 6.5;

const [, gs, bs] = WATER_SHALLOW,
  [, gd, bd] = WATER_DEEP;
/** the columns to the coast that a corner's colour stands for (as sea.ts works the mix k back from its green and blue, and the smooth step back from k) */
function columnsOf(green: number, blue: number) {
  const q = green / Math.max(blue, 1),
    k = Math.min(1, Math.max(0, (gs - q * bs) / Math.max(q * (bd - bs) - (gd - gs), 1e-4)));
  return 0.4 + 7.6 * (0.5 - Math.sin(Math.asin(1 - 2 * k) / 3));
}

/** whether a face lies level (it faces up or down: faces.ts) */
const level = (f: Faces, k: number) => f.geo[k * FACE_GEO] % FLIPPED === 1;

/** the green to the blue of a corner COAST_FAR columns from the coast */
const GREEN_FAR = (() => {
  const k = smooth(0.4, 8, COAST_FAR);
  return (gs + k * (gd - gs)) / (bs + k * (bd - bs));
})();

/**
 * The smoothed distance to the coast at the four corners of each of the sea's faces, in the faces' order of corners:
 * four bytes to a face, COAST_STEPS to a column.
 */
export function coastOf(f: Faces): Uint8Array {
  const n = f.geo.length / FACE_GEO,
    out = new Uint8Array(n * 4);
  // the corners' grid: the columns the faces span
  let x0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    z1 = -Infinity;
  for (let k = 0; k < n; k++) {
    const g = k * FACE_GEO;
    if (!level(f, k)) continue;
    x0 = Math.min(x0, f.geo[g + 2], f.geo[g + 3]);
    x1 = Math.max(x1, f.geo[g + 2], f.geo[g + 3]);
    z0 = Math.min(z0, f.geo[g + 4], f.geo[g + 5]);
    z1 = Math.max(z1, f.geo[g + 4], f.geo[g + 5]);
  }
  if (x1 < x0) return out.fill(255);
  const wide = Math.round((x1 - x0) / FACE_STEPS) + 1,
    deep = Math.round((z1 - z0) / FACE_STEPS) + 1;
  const known = new Uint8Array(wide * deep),
    greens = new Uint8Array(wide * deep),
    blues = new Uint8Array(wide * deep);
  // the grid's place of each face's corners: its second and third lie at the far end of u, its third and fourth of v
  const where = new Int32Array(n * 4).fill(-1);
  let near = false;
  for (let k = 0; k < n; k++) {
    if (!level(f, k)) continue;
    const g = k * FACE_GEO;
    for (let c = 0; c < 4; c++) {
      const u = f.geo[g + (c === 1 || c === 2 ? 3 : 2)],
        v = f.geo[g + (c >= 2 ? 5 : 4)],
        i = Math.round((v - z0) / FACE_STEPS) * wide + Math.round((u - x0) / FACE_STEPS);
      where[k * 4 + c] = i;
      if (known[i]) continue;
      const o = k * FACE_COL + c * 4;
      known[i] = 1;
      greens[i] = f.col[o + 1];
      blues[i] = f.col[o + 2];
      // (the nearer the coast, the more green to the blue)
      if (greens[i] > GREEN_FAR * blues[i]) near = true;
    }
  }
  // (a face that is not level is no sea, and a piece of open sea has no coast: as far from it as can be told)
  if (!near) return out.fill(255);
  const columns = new Float32Array(wide * deep);
  for (let i = 0; i < columns.length; i++) if (known[i]) columns[i] = columnsOf(greens[i], blues[i]);
  const smoothed = fitted(known, columns, wide, deep);
  for (let i = 0; i < n * 4; i++) out[i] = where[i] < 0 ? 255 : Math.round(smoothed[where[i]] * COAST_STEPS);
  return out;
}

/**
 * At each known place of a grid the value of the plane that fits the known values within COAST_AROUND of it best. The
 * sums a fit needs are read from tables of the sums above and to the left of each place, so a grid of any size takes
 * a few passes over it.
 */
function fitted(known: Uint8Array, value: Float32Array, wide: number, deep: number): Float32Array {
  // the sums of 1, x, z, x², xz, z², v, xv and zv over the known places, from the grid's first place to each
  const SUMS = 9,
    across = wide + 1,
    sums = new Float64Array(SUMS * across * (deep + 1));
  for (let z = 0; z < deep; z++) {
    // (the sums of this row alone up to x, added to the sums down to the row above)
    let r0 = 0,
      r1 = 0,
      r2 = 0,
      r3 = 0,
      r4 = 0,
      r5 = 0,
      r6 = 0,
      r7 = 0,
      r8 = 0;
    for (let x = 0; x < wide; x++) {
      const i = z * wide + x;
      if (known[i]) {
        const v = value[i];
        r0 += 1;
        r1 += x;
        r2 += z;
        r3 += x * x;
        r4 += x * z;
        r5 += z * z;
        r6 += v;
        r7 += v * x;
        r8 += v * z;
      }
      const here = ((z + 1) * across + x + 1) * SUMS,
        up = (z * across + x + 1) * SUMS;
      sums[here] = r0 + sums[up];
      sums[here + 1] = r1 + sums[up + 1];
      sums[here + 2] = r2 + sums[up + 2];
      sums[here + 3] = r3 + sums[up + 3];
      sums[here + 4] = r4 + sums[up + 4];
      sums[here + 5] = r5 + sums[up + 5];
      sums[here + 6] = r6 + sums[up + 6];
      sums[here + 7] = r7 + sums[up + 7];
      sums[here + 8] = r8 + sums[up + 8];
    }
  }
  const out = new Float32Array(wide * deep),
    S = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let z = 0; z < deep; z++)
    for (let x = 0; x < wide; x++) {
      const i = z * wide + x;
      if (!known[i]) continue;
      // (far out no foam comes, and the corner's own distance will do)
      if (value[i] >= COAST_FAR + 1) {
        out[i] = Math.min(COAST_MOST, value[i]);
        continue;
      }
      const xa = Math.max(0, x - COAST_AROUND),
        xb = Math.min(wide, x + COAST_AROUND + 1),
        za = Math.max(0, z - COAST_AROUND),
        zb = Math.min(deep, z + COAST_AROUND + 1);
      const a = (za * across + xa) * SUMS,
        b = (za * across + xb) * SUMS,
        c = (zb * across + xa) * SUMS,
        d = (zb * across + xb) * SUMS;
      for (let s = 0; s < SUMS; s++) S[s] = sums[d + s] - sums[b + s] - sums[c + s] + sums[a + s];
      // about the corner itself: the sums of dx, dz, dx², dx dz, dz², v, dx v, dz v (dx = x' − x)
      const count = S[0],
        sx = S[1] - x * count,
        sz = S[2] - z * count,
        sxx = S[3] - 2 * x * S[1] + x * x * count,
        sxz = S[4] - x * S[2] - z * S[1] + x * z * count,
        szz = S[5] - 2 * z * S[2] + z * z * count,
        sv = S[6],
        sxv = S[7] - x * sv,
        szv = S[8] - z * sv;
      // the plane v = p + q dx + r dz of least squares: p by Cramer's rule; where the places lie on one line (or are
      // too few), their mean
      const det = count * (sxx * szz - sxz * sxz) - sx * (sx * szz - sxz * sz) + sz * (sx * sxz - sxx * sz);
      const top = sv * (sxx * szz - sxz * sxz) - sx * (sxv * szz - sxz * szv) + sz * (sxv * sxz - sxx * szv);
      const plane = count >= 6 && det > 1e-3 * count * sxx * szz ? top / det : sv / count;
      out[i] = Math.min(COAST_MOST, Math.max(0, plane));
    }
  return out;
}
