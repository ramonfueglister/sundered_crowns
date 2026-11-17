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
// the finer step is drawn once as the far camera sees it (`look`), every face as brightly as the stage's lights
// light it (lookprobe/light.ts), and every finer block gets the mean of the dots of that picture that show it.
import type { Batch } from '../lookprobe/batch';
import { NEAR, RIGHT, VIEW } from '../lookprobe/layout';
import { litness } from '../lookprobe/light';
import type { Cover } from './far';

/** the sides of what stands out are this much darker than its top where the finer step shows no side of its own there */
const SIDE = 0.78;
const ELEV = (VIEW.elevation * Math.PI) / 180;
/** the picture of the finer step, in dots: to the right, upwards, and towards the camera (what is nearer hides what is farther) */
const ACROSS = [RIGHT[0], 0, RIGHT[1]], UPWARDS = [-NEAR[0] * Math.sin(ELEV), Math.cos(ELEV), -NEAR[1] * Math.sin(ELEV)], NEARER = [NEAR[0] * Math.cos(ELEV), Math.sin(ELEV), NEAR[1] * Math.cos(ELEV)] as const;
/** dots of that picture to a finer block's width: enough that the small parts of a field or a crown are seen */
const DOTS = 4;
/** how brightly a top is lit, and the two sides of a block towards the camera in the mean of what is seen of each */
const LIT_UP = litness([0, 1, 0]), LIT_SIDE = (litness([Math.sign(NEAR[0]), 0, 0]) * Math.abs(NEAR[0]) + litness([0, 0, Math.sign(NEAR[1])]) * Math.abs(NEAR[1])) / (Math.abs(NEAR[0]) + Math.abs(NEAR[1]));

/**
 * The finer step as its blocks: at the middle of every finer block the colour of what is highest there, its height
 * and that of the ground.
 */
export interface Above { w: number; d: number; top: Float32Array; high: Float32Array; ground: Float32Array; /** the meshes laid in, for the picture of them */ meshes: { mesh: Pick<Batch, 'pos' | 'nor' | 'col'>; dx: number; dz: number }[] }

export const above = (w: number, d: number): Above => ({ w, d, top: new Float32Array(w * d * 3), high: new Float32Array(w * d).fill(-Infinity), ground: new Float32Array(w * d).fill(-Infinity), meshes: [] });

/**
 * Lays a mesh into the blocks, moved by (dx, dz) blocks: its faces that look up give the heights. `ground`: the mesh is the ground itself, above which the heights of the rest are measured.
 */
export function lay(a: Above, mesh: Pick<Batch, 'pos' | 'nor' | 'col'>, dx: number, dz: number, ground = false) {
  const { pos, nor, col } = mesh;
  a.meshes.push({ mesh, dx, dz });
  for (let t = 0; t < pos.length; t += 9) {
    const x0 = pos[t] + dx, z0 = pos[t + 2] + dz, x1 = pos[t + 3] + dx, z1 = pos[t + 5] + dz, x2 = pos[t + 6] + dx, z2 = pos[t + 8] + dz;
    if (nor[t + 1] <= 0.05) continue;
    const area = (x1 - x0) * (z2 - z0) - (x2 - x0) * (z1 - z0);
    if (Math.abs(area) < 1e-9) continue;
    const fromX = Math.max(0, Math.ceil(Math.min(x0, x1, x2) - 0.5)), untilX = Math.min(a.w - 1, Math.floor(Math.max(x0, x1, x2) - 0.5));
    const fromZ = Math.max(0, Math.ceil(Math.min(z0, z1, z2) - 0.5)), untilZ = Math.min(a.d - 1, Math.floor(Math.max(z0, z1, z2) - 0.5));
    for (let z = fromZ; z <= untilZ; z++) for (let x = fromX; x <= untilX; x++) {
      // the block's middle in the triangle, by its three shares
      const px = x + 0.5, pz = z + 0.5;
      const s1 = ((px - x0) * (z2 - z0) - (x2 - x0) * (pz - z0)) / area, s2 = ((x1 - x0) * (pz - z0) - (px - x0) * (z1 - z0)) / area, s0 = 1 - s1 - s2;
      if (s0 < -1e-6 || s1 < -1e-6 || s2 < -1e-6) continue;
      const y = s0 * pos[t + 1] + s1 * pos[t + 4] + s2 * pos[t + 7], i = x + z * a.w;
      if (ground && y > a.ground[i]) a.ground[i] = y;
      if (y <= a.high[i]) continue;
      a.high[i] = y;
      for (let k = 0; k < 3; k++) a.top[i * 3 + k] = s0 * col[t + k] + s1 * col[t + 3 + k] + s2 * col[t + 6 + k];
    }
  }
}

/**
 * What the far camera sees of every finer block: the meshes are drawn as a picture from where the camera stands
 * (from afar, so that every line of sight runs the same way), each face in its colour as brightly as the lights
 * light it, the nearer before the farther. Returns for every block the sum of the colours of the dots that show a
 * point of it, and their number: first of the dots that show a face looking up, then of those that show a side
 * (eight numbers a block).
 */
export function look(a: Above): Float32Array {
  // the picture's frame: the ground's corners at the lowest and the highest height
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < a.w * a.d; i++) if (a.high[i] !== -Infinity) { low = Math.min(low, a.ground[i] === -Infinity ? a.high[i] : a.ground[i]); high = Math.max(high, a.high[i]); }
  const seen = new Float32Array(a.w * a.d * 8);
  if (low === Infinity) return seen;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const x of [0, a.w]) for (const z of [0, a.d]) for (const y of [low - 1, high + 1]) {
    const u = x * ACROSS[0] + z * ACROSS[2], v = x * UPWARDS[0] + y * UPWARDS[1] + z * UPWARDS[2];
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const W = Math.ceil((u1 - u0) * DOTS) + 1, H = Math.ceil((v1 - v0) * DOTS) + 1;
  const depth = new Float32Array(W * H).fill(-Infinity), block = new Int32Array(W * H).fill(-1), colour = new Float32Array(W * H * 3), upward = new Uint8Array(W * H);
  for (const { mesh: { pos, nor, col }, dx, dz } of a.meshes) for (let t = 0; t < pos.length; t += 9) {
    const n: [number, number, number] = [nor[t], nor[t + 1], nor[t + 2]];
    // faces turned away from the camera are not seen
    if (n[0] * NEARER[0] + n[1] * NEARER[1] + n[2] * NEARER[2] <= 0) continue;
    const X = [pos[t] + dx, pos[t + 3] + dx, pos[t + 6] + dx], Y = [pos[t + 1], pos[t + 4], pos[t + 7]], Z = [pos[t + 2] + dz, pos[t + 5] + dz, pos[t + 8] + dz];
    const U = [0, 0, 0], V = [0, 0, 0], D = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      U[k] = (X[k] * ACROSS[0] + Z[k] * ACROSS[2] - u0) * DOTS; V[k] = (X[k] * UPWARDS[0] + Y[k] * UPWARDS[1] + Z[k] * UPWARDS[2] - v0) * DOTS;
      D[k] = X[k] * NEARER[0] + Y[k] * NEARER[1] + Z[k] * NEARER[2];
    }
    const area = (U[1] - U[0]) * (V[2] - V[0]) - (U[2] - U[0]) * (V[1] - V[0]);
    if (Math.abs(area) < 1e-9) continue;
    const lit = litness(n), r = (lit * (col[t] + col[t + 3] + col[t + 6])) / 3, g = (lit * (col[t + 1] + col[t + 4] + col[t + 7])) / 3, b = (lit * (col[t + 2] + col[t + 5] + col[t + 8])) / 3;
    const fromU = Math.max(0, Math.ceil(Math.min(U[0], U[1], U[2]) - 0.5)), untilU = Math.min(W - 1, Math.floor(Math.max(U[0], U[1], U[2]) - 0.5));
    const fromV = Math.max(0, Math.ceil(Math.min(V[0], V[1], V[2]) - 0.5)), untilV = Math.min(H - 1, Math.floor(Math.max(V[0], V[1], V[2]) - 0.5));
    for (let v = fromV; v <= untilV; v++) for (let u = fromU; u <= untilU; u++) {
      const pu = u + 0.5, pv = v + 0.5;
      const s1 = ((pu - U[0]) * (V[2] - V[0]) - (U[2] - U[0]) * (pv - V[0])) / area, s2 = ((U[1] - U[0]) * (pv - V[0]) - (pu - U[0]) * (V[1] - V[0])) / area, s0 = 1 - s1 - s2;
      if (s0 < -1e-6 || s1 < -1e-6 || s2 < -1e-6) continue;
      const near = s0 * D[0] + s1 * D[1] + s2 * D[2], i = u + v * W;
      if (near <= depth[i]) continue;
      depth[i] = near;
      // the block under the point that is seen, a hair inside the face
      const x = Math.floor(s0 * X[0] + s1 * X[1] + s2 * X[2] - n[0] * 0.01), z = Math.floor(s0 * Z[0] + s1 * Z[1] + s2 * Z[2] - n[2] * 0.01);
      block[i] = x >= 0 && z >= 0 && x < a.w && z < a.d ? x + z * a.w : -1;
      colour[i * 3] = r; colour[i * 3 + 1] = g; colour[i * 3 + 2] = b; upward[i] = n[1] > 0.5 ? 1 : 0;
    }
  }
  for (let i = 0; i < W * H; i++) if (block[i] >= 0) { const j = block[i] * 8 + (upward[i] ? 0 : 4); seen[j] += colour[i * 3]; seen[j + 1] += colour[i * 3 + 1]; seen[j + 2] += colour[i * 3 + 2]; seen[j + 3]++; }
  return seen;
}

/**
 * The cover of a coarser piece's ground of `n` blocks a side from the finer step's blocks, whose first lies under
 * the coarser block (x0, z0). Each coarser block takes the four finer ones under it. It stands out of the ground as
 * high as the four do in the mean, if that is a block of its own or more. Its colours are those the camera sees of
 * the four (`look`), given so that the block's own faces, lit as they are, show them: its sides what is seen of
 * their sides, its top what is seen of their tops, and with them as much of their sides as the block's own sides
 * will not show, because the blocks in front of it stand as high (the inside of a wood shows its tops only, a
 * house on a meadow its walls). Where the camera sees none of the four, the mean of their tops. Blocks outside the
 * finer step's blocks take the nearest inside them.
 */
export function meanCover(a: Above, n: number, x0: number, z0: number): Cover {
  const c: Cover = { has: new Uint8Array(n * n), rise: new Uint8Array(n * n), top: new Float32Array(n * n * 3), side: new Float32Array(n * n * 3), town: new Uint8Array(n * n), share: new Float32Array(n * n).fill(1) };
  const w = a.w >> 1, d = a.d >> 1, seen = look(a), ups = new Float32Array(n * n * 4), sides = new Float32Array(n * n * 4), tops = new Float32Array(n * n * 3);
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const cx = Math.max(0, Math.min(w - 1, x - x0)), cz = Math.max(0, Math.min(d - 1, z - z0)), j = x + z * n;
    let all = 0, tall = 0;
    for (let q = 0; q < 4; q++) {
      const i = cx * 2 + (q & 1) + (cz * 2 + (q >> 1)) * a.w;
      if (a.high[i] === -Infinity) continue;
      all++;
      tall += a.ground[i] === -Infinity ? 0 : a.high[i] - a.ground[i];
      for (let k = 0; k < 4; k++) { ups[j * 4 + k] += seen[i * 8 + k]; sides[j * 4 + k] += seen[i * 8 + 4 + k]; }
      for (let k = 0; k < 3; k++) tops[j * 3 + k] += a.top[i * 3 + k];
    }
    if (!all) continue;
    c.has[j] = 1;
    // as high as the four in the mean, in its own blocks (two of theirs), if that is a block or more
    c.rise[j] = tall / all >= 2 ? Math.round(tall / all / 2) : 0;
    for (let k = 0; k < 3; k++) tops[j * 3 + k] /= all;
  }
  const sx = Math.sign(NEAR[0]), sz = Math.sign(NEAR[1]), riseAt = (x: number, z: number) => (x < 0 || z < 0 || x >= n || z >= n ? 0 : c.rise[x + z * n]);
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const j = x + z * n;
    if (!c.has[j]) continue;
    // how much of the block's two sides towards the camera stands clear of the blocks in front of them
    const rise = c.rise[j], clear = rise ? (Math.max(0, rise - riseAt(x + sx, z)) + Math.max(0, rise - riseAt(x, z + sz))) / (2 * rise) : 0;
    const dots = ups[j * 4 + 3] + (1 - clear) * sides[j * 4 + 3];
    for (let k = 0; k < 3; k++) {
      c.top[j * 3 + k] = dots > 0 ? (ups[j * 4 + k] + (1 - clear) * sides[j * 4 + k]) / dots / LIT_UP : tops[j * 3 + k];
      c.side[j * 3 + k] = sides[j * 4 + 3] > 0 ? sides[j * 4 + k] / sides[j * 4 + 3] / LIT_SIDE : c.top[j * 3 + k] * SIDE;
    }
  }
  return c;
}
