// A coarser step of the map as the mean of the finer one. The far steps used to lay out towns, woods and fields by
// rules of their own (far.ts), so the same place showed another picture at every step, and a zoom across a step's
// border swapped one for the other. Here the finer step is built first, and every block of the coarser step shows
// what the finer blocks under it show to the camera, as a texture's coarser level is the mean of the finer one
// (Williams 1983, "Pyramidal parametrics") and a voxel pyramid's parent that of its children (Laine and Karras 2010,
// "Efficient sparse voxel octrees"). So a house stays where it is, a wood keeps its edge and a field its crop,
// whatever is built at the finer step, now and later.
//
// The camera looks at the land from low down (layout.ts VIEW.elevation), so of what stands on it the sides are seen
// more than the tops, and what stands in front hides what lies behind. The mean is therefore taken of what is seen:
// the finer step is drawn once as the far camera sees it (mean_look.ts `look`), every face as brightly as the stage's
// lights light it (lookprobe/light.ts), and every finer block gets the mean of the dots of that picture that show it.
import { NEAR } from '../lookprobe/layout';
import { SUN, sunlit } from '../lookprobe/light';
import type { Cover } from './far';
import { type Above, LIT_SIDE, LIT_UP, look } from './mean_look';

/** the sides of what stands out are this much darker than its top where the finer step shows no side of its own there */
const SIDE = 0.78;

/** numbers a coarser block has in a summary: of the dots that show tops (colour summed, and how many), of those that show sides, the tops' own colours summed, how many finer blocks it has, and their heights above the ground summed */
const SUMMED = 13;

/**
 * The finer step's blocks, four to a coarser block: what the camera sees of each four (`look`), their own tops and
 * their heights, summed. A piece of the finer step is summed up once and kept, so that the coarser piece over it
 * need not build it again.
 */
export function summary(a: Above): Float32Array {
  const w = a.w >> 1,
    d = a.d >> 1,
    seen = look(a),
    sum = new Float32Array(w * d * SUMMED);
  for (let z = 0; z < d; z++)
    for (let x = 0; x < w; x++)
      for (let q = 0; q < 4; q++) {
        const i = x * 2 + (q & 1) + (z * 2 + (q >> 1)) * a.w,
          j = (x + z * w) * SUMMED;
        if (a.high[i] === -Infinity) continue;
        for (let k = 0; k < 8; k++) sum[j + k] += seen[i * 8 + k];
        for (let k = 0; k < 3; k++) sum[j + 8 + k] += a.top[i * 3 + k];
        sum[j + 11]++;
        sum[j + 12] += a.ground[i] === -Infinity ? 0 : a.high[i] - a.ground[i];
      }
  return sum;
}

/**
 * The cover of a coarser piece's ground of `n` blocks a side from the summaries of the four finer pieces under its
 * own part (each `half` coarser blocks a side, null where there is only sea), whose first block lies at (x0, z0).
 * A coarser block stands out of the ground as high as its four finer ones do in the mean, if that is a block of
 * its own or more. Its colours are those the camera sees of the four, given so that the block's own faces, lit as
 * they are, show them: its sides what is seen of their sides, its top what is seen of their tops, and with them as
 * much of their sides as the block's own sides will not show, because the blocks in front of it stand as high (the
 * inside of a wood shows its tops only, a house on a meadow its walls). Where the camera sees none of the four,
 * the mean of their tops. Blocks outside the part take the nearest inside it.
 */
export function meanCover(
  quarters: readonly (Float32Array | null)[],
  half: number,
  n: number,
  x0: number,
  z0: number,
): Cover {
  const c: Cover = {
    has: new Uint8Array(n * n),
    rise: new Uint8Array(n * n),
    top: new Float32Array(n * n * 3),
    side: new Float32Array(n * n * 3),
    town: new Uint8Array(n * n),
    share: new Float32Array(n * n).fill(1),
    whole: new Float32Array(n * n * 3),
  };
  /** the summed numbers of the finer blocks under a block, or null */
  const under = (x: number, z: number) => {
    const cx = Math.max(0, Math.min(2 * half - 1, x - x0)),
      cz = Math.max(0, Math.min(2 * half - 1, z - z0)),
      of = quarters[(cx >= half ? 1 : 0) + (cz >= half ? 2 : 0)];
    if (!of) return null;
    const j = ((cx % half) + (cz % half) * half) * SUMMED;
    return of[j + 11] > 0 ? of.subarray(j, j + SUMMED) : null;
  };
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const s = under(x, z),
        j = x + z * n;
      if (!s) continue;
      c.has[j] = 1;
      // as high as the four in the mean, in its own blocks (two of theirs), if that is a block or more
      c.rise[j] = s[12] / s[11] >= 2 ? Math.round(s[12] / s[11] / 2) : 0;
    }
  const sx = Math.sign(NEAR[0]),
    sz = Math.sign(NEAR[1]),
    riseAt = (x: number, z: number) => (x < 0 || z < 0 || x >= n || z >= n ? 0 : c.rise[x + z * n]);
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const s = under(x, z),
        j = x + z * n;
      if (!s) continue;
      // how much of the block's two sides towards the camera stands clear of the blocks in front of them
      const rise = c.rise[j],
        clear = rise ? (Math.max(0, rise - riseAt(x + sx, z)) + Math.max(0, rise - riseAt(x, z + sz))) / (2 * rise) : 0;
      const dots = s[3] + (1 - clear) * s[7];
      for (let k = 0; k < 3; k++) {
        c.top[j * 3 + k] = dots > 0 ? (s[k] + (1 - clear) * s[4 + k]) / dots / LIT_UP : s[8 + k] / s[11];
        c.side[j * 3 + k] = s[7] > 0 ? s[4 + k] / s[7] / LIT_SIDE : c.top[j * 3 + k] * SIDE;
        c.whole![j * 3 + k] = s[3] + s[7] > 0 ? (s[k] + s[4 + k]) / (s[3] + s[7]) / LIT_UP : c.top[j * 3 + k];
      }
    }
  return c;
}

/**
 * The coarser step casts shadows of its own: a block behind a raised one lies in its shadow on the stage, and what
 * the camera sees of the finer blocks under it is dark with the finer step's shadow already. So that the shadow is
 * not laid on twice, a block's top colour is given as much brighter as the stage's sun will fall short on it: by
 * the share of its top that the heights `h` of the coarser step's own ground (n blocks a side, with what stands
 * out) hide from the sun.
 */
export function unshade(c: Cover, n: number, h: ArrayLike<number>) {
  let highest = -Infinity;
  for (let i = 0; i < n * n; i++) highest = Math.max(highest, h[i]);
  const flat = Math.hypot(SUN[0], SUN[2]),
    sx = SUN[0] / flat,
    sz = SUN[2] / flat,
    climb = SUN[1] / flat,
    sun = sunlit([0, 1, 0]);
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const j = x + z * n;
      if (!c.has[j]) continue;
      let hidden = 0;
      for (let q = 0; q < 4; q++) {
        const px = x + 0.25 + 0.5 * (q & 1),
          pz = z + 0.25 + 0.5 * (q >> 1);
        for (let t = 0.25; h[j] + t * climb < highest; t += 0.5) {
          const bx = Math.floor(px + t * sx),
            bz = Math.floor(pz + t * sz);
          if (bx < 0 || bz < 0 || bx >= n || bz >= n) break;
          if ((bx !== x || bz !== z) && h[bx + bz * n] > h[j] + t * climb) {
            hidden++;
            break;
          }
        }
      }
      if (!hidden) continue;
      const brighter = LIT_UP / (LIT_UP - (sun * hidden) / 4);
      for (let k = 0; k < 3; k++) c.top[j * 3 + k] *= brighter;
    }
}
