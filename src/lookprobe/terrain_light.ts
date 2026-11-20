// The light on the ground (terrain.ts): how much of the sky a point sees, the relief of the land by the sun, and what
// `buildTerrain` keeps for the corners of the grid while it runs.
import type { RGB } from './batch';
import { type Ground, type GroundTraits, N } from './layout';
import { SUN } from './light';

/** a diagonal's share along each axis, to three places as the sky's share has always been worked out with */
// biome-ignore lint/suspicious/noApproximativeNumericConstant: Math.SQRT1_2 would change the light of every piece
const DIAGONAL = 0.707;
/** Share of the sky seen from a point: eight directions, the steepest blocker in each (light step 2 of the plan). */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [DIAGONAL, DIAGONAL],
  [0, 1],
  [-DIAGONAL, DIAGONAL],
  [-1, 0],
  [-DIAGONAL, -DIAGONAL],
  [0, -1],
  [DIAGONAL, -DIAGONAL],
];
const REACH = [0.75, 1.6, 2.8, 4.5, 7, 10.5];
/** the columns a corner of the grid looks at, as steps from it: the reaches of each direction, two numbers each */
const LOOKS = Int32Array.from(
  DIRS.flatMap(([dx, dz]) => REACH.flatMap((r) => [Math.floor(dx * r), Math.floor(dz * r)])),
);
export function skyShare(g: Ground, x: number, z: number, y: number): number {
  // (the numbers are those of the plain rule: what does not stand above the point has a rise of nought or less and
  // is never the steepest, so it is not divided; a direction with nothing above takes nothing, so no root is drawn;
  // and from a corner of the grid the columns looked at are the same steps away wherever it lies. A sixth of what
  // a worker takes for a far piece went into this.)
  const occ = g.occ,
    dirs = DIRS.length,
    reaches = REACH.length;
  let blocked = 0;
  if (Number.isInteger(x) && Number.isInteger(z)) {
    for (let d = 0, o = 0; d < dirs; d++) {
      let steepest = 0;
      for (let k = 0; k < reaches; k++, o += 2) {
        const sx = x + LOOKS[o],
          sz = z + LOOKS[o + 1];
        if (sx < 0 || sz < 0 || sx >= N || sz >= N) continue;
        const over = occ[sz * N + sx] - y;
        if (over <= 0) continue;
        const rise = over / REACH[k];
        if (rise > steepest) steepest = rise;
      }
      if (steepest > 0) blocked += steepest / Math.sqrt(1 + steepest * steepest);
    }
    return 1 - blocked / dirs;
  }
  for (let d = 0; d < dirs; d++) {
    const dx = DIRS[d][0],
      dz = DIRS[d][1];
    let steepest = 0;
    for (let k = 0; k < reaches; k++) {
      const r = REACH[k],
        sx = Math.floor(x + dx * r),
        sz = Math.floor(z + dz * r);
      if (sx < 0 || sz < 0 || sx >= N || sz >= N) continue;
      const over = occ[sz * N + sx] - y;
      if (over <= 0) continue;
      const rise = over / r;
      if (rise > steepest) steepest = rise;
    }
    if (steepest > 0) blocked += steepest / Math.sqrt(1 + steepest * steepest);
  }
  return 1 - blocked / dirs;
}
/** Brightness factor from the sky share: open ground stays at 1, deep corners fall to about a half. */
export const skyLight = (share: number) => 0.42 + 0.58 * Math.min(1, share * 1.08);

/**
 * The relief of the land shown by its colour: the tops of the land are a touch lighter where the ground, averaged
 * over RELIEF_REACH columns to each side, rises towards the sun, and a touch darker where it falls away from it. The
 * steps of the land are wide and few (world.ts `terrace`), so a hill would read only at its few edges: this lets its
 * slopes read as well, as a shaded relief map does. RELIEF_MOST: the most a top is lightened or darkened; at a rise
 * of RELIEF_FULL blocks to a column towards the sun it is reached.
 */
const RELIEF_REACH = 4,
  RELIEF_MOST = 0.12,
  RELIEF_FULL = 0.12;
const SUN_FLAT = Math.hypot(SUN[0], SUN[2]),
  SUN_X = SUN[0] / SUN_FLAT,
  SUN_Z = SUN[2] / SUN_FLAT;
/**
 * the brightness of every corner of the grid by the relief of the tops as drawn (`drawnTops`; (N + 1)² numbers, about
 * 1), see RELIEF_MOST
 */
export function reliefOf(g: Ground, tops: ArrayLike<number>): Float32Array {
  const n = N,
    side = n + 1,
    ground = new Float32Array(n * n),
    dry = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++)
    if (!g.wet[i]) {
      ground[i] = tops[i];
      dry[i] = 1;
    }
  // the dry ground averaged over a square (in two runs, along the rows and then the columns); water counts for nothing
  const rowSum = new Float32Array(n * n),
    rowCount = new Uint16Array(n * n),
    mean = new Float32Array(n * n),
    r = RELIEF_REACH;
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      let sum = 0,
        count = 0;
      for (let u = Math.max(0, x - r), end = Math.min(n - 1, x + r); u <= end; u++) {
        const j = z * n + u;
        if (dry[j]) {
          sum += ground[j];
          count++;
        }
      }
      rowSum[z * n + x] = sum;
      rowCount[z * n + x] = count;
    }
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      let sum = 0,
        count = 0;
      for (let v = Math.max(0, z - r), end = Math.min(n - 1, z + r); v <= end; v++) {
        sum += rowSum[v * n + x];
        count += rowCount[v * n + x];
      }
      mean[z * n + x] = count ? sum / count : 0;
    }
  // at a corner of the grid the slope of the averaged ground over the four columns round it
  const out = new Float32Array(side * side).fill(1),
    at = (x: number, z: number) => mean[Math.max(0, Math.min(n - 1, z)) * n + Math.max(0, Math.min(n - 1, x))];
  for (let z = 0; z <= n; z++)
    for (let x = 0; x <= n; x++) {
      const east = (at(x, z - 1) + at(x, z) - at(x - 1, z - 1) - at(x - 1, z)) / 2,
        south = (at(x - 1, z) + at(x, z) - at(x - 1, z - 1) - at(x, z - 1)) / 2;
      const towards = east * SUN_X + south * SUN_Z;
      out[z * side + x] = 1 + RELIEF_MOST * Math.max(-1, Math.min(1, towards / RELIEF_FULL));
    }
  return out;
}

// The helpers of `buildTerrain` stand out here, with what they share handed to them: a helper made inside the builder
// is a new one for every piece, and the engine's fast code for it is lost when the piece is done.
/** what `buildTerrain` keeps for the corners of the grid while it runs (see there) */
export interface Corners {
  g: Ground;
  t: GroundTraits;
  ox: number;
  oz: number;
  side: number;
  askedAt: Float64Array | null;
  answer: Float64Array | null;
  groundAt: RGB[];
  kindAt: Int8Array;
}
/**
 * the sky's light at a point of the ground at height `y`; at a corner of the grid the answer given before, where the
 * height is the same
 */
export function lightAt(c: Corners, x: number, z: number, y: number) {
  const { askedAt, answer } = c;
  if (!askedAt || !answer) return 1;
  const k = z * c.side + x;
  // (the sides of a column ask beside the grid's corners: those are worked out each time)
  if (!Number.isInteger(k) || x < 0 || x > N) return skyLight(skyShare(c.g, x, z, y));
  if (askedAt[k] !== y) {
    askedAt[k] = y;
    answer[k] = skyLight(skyShare(c.g, x, z, y));
  }
  return answer[k];
}
