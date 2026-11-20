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
import { CREASES, SUN, litness, sunlit } from '../lookprobe/light';
import type { Cover } from './far';

/** the sides of what stands out are this much darker than its top where the finer step shows no side of its own there */
const SIDE = 0.78;
const ELEV = (VIEW.elevation * Math.PI) / 180;
/** the picture of the finer step, in dots: to the right, upwards, and towards the camera (what is nearer hides what is farther) */
const ACROSS = [RIGHT[0], 0, RIGHT[1]],
  UPWARDS = [-NEAR[0] * Math.sin(ELEV), Math.cos(ELEV), -NEAR[1] * Math.sin(ELEV)],
  NEARER = [NEAR[0] * Math.cos(ELEV), Math.sin(ELEV), NEAR[1] * Math.cos(ELEV)] as const;
/** dots of that picture to a finer block's width: enough that the small parts of a field or a crown are seen */
const DOTS = 4;
/** how brightly a top is lit, and the two sides of a block towards the camera in the mean of what is seen of each */
const LIT_UP = litness([0, 1, 0]),
  LIT_SIDE =
    (litness([Math.sign(NEAR[0]), 0, 0]) * Math.abs(NEAR[0]) +
      litness([0, 0, Math.sign(NEAR[1])]) * Math.abs(NEAR[1])) /
    (Math.abs(NEAR[0]) + Math.abs(NEAR[1]));

/**
 * The finer step as its blocks: at the middle of every finer block the colour of what is highest there, its height
 * and that of the ground.
 */
export interface Above {
  w: number;
  d: number;
  top: Float32Array;
  high: Float32Array;
  ground: Float32Array;
  /** the meshes laid in, for the picture of them */
  meshes: {
    mesh: Pick<Batch, 'pos' | 'nor' | 'col'>;
    dx: number;
    dz: number;
  }[];
}

export const above = (w: number, d: number): Above => ({
  w,
  d,
  top: new Float32Array(w * d * 3),
  high: new Float32Array(w * d).fill(-Infinity),
  ground: new Float32Array(w * d).fill(-Infinity),
  meshes: [],
});

/**
 * Lays a mesh into the blocks, moved by (dx, dz) blocks: its faces that look up give the heights. `ground`: the mesh is the ground itself, above which the heights of the rest are measured.
 */
export function lay(a: Above, mesh: Pick<Batch, 'pos' | 'nor' | 'col'>, dx: number, dz: number, ground = false) {
  const { pos, nor, col } = mesh;
  a.meshes.push({ mesh, dx, dz });
  for (let t = 0; t < pos.length; t += 9) {
    const x0 = pos[t] + dx,
      z0 = pos[t + 2] + dz,
      x1 = pos[t + 3] + dx,
      z1 = pos[t + 5] + dz,
      x2 = pos[t + 6] + dx,
      z2 = pos[t + 8] + dz;
    if (nor[t + 1] <= 0.05) continue;
    const area = (x1 - x0) * (z2 - z0) - (x2 - x0) * (z1 - z0);
    if (Math.abs(area) < 1e-9) continue;
    const fromX = Math.max(0, Math.ceil(Math.min(x0, x1, x2) - 0.5)),
      untilX = Math.min(a.w - 1, Math.floor(Math.max(x0, x1, x2) - 0.5));
    const fromZ = Math.max(0, Math.ceil(Math.min(z0, z1, z2) - 0.5)),
      untilZ = Math.min(a.d - 1, Math.floor(Math.max(z0, z1, z2) - 0.5));
    for (let z = fromZ; z <= untilZ; z++)
      for (let x = fromX; x <= untilX; x++) {
        // the block's middle in the triangle, by its three shares
        const px = x + 0.5,
          pz = z + 0.5;
        const s1 = ((px - x0) * (z2 - z0) - (x2 - x0) * (pz - z0)) / area,
          s2 = ((x1 - x0) * (pz - z0) - (px - x0) * (z1 - z0)) / area,
          s0 = 1 - s1 - s2;
        if (s0 < -1e-6 || s1 < -1e-6 || s2 < -1e-6) continue;
        const y = s0 * pos[t + 1] + s1 * pos[t + 4] + s2 * pos[t + 7],
          i = x + z * a.w;
        if (ground && y > a.ground[i]) a.ground[i] = y;
        if (y <= a.high[i]) continue;
        a.high[i] = y;
        for (let k = 0; k < 3; k++) a.top[i * 3 + k] = s0 * col[t + k] + s1 * col[t + 3 + k] + s2 * col[t + 6 + k];
      }
  }
}

/** the sun's view of the land: to its right and upwards in its picture */
const SUN_LEN = Math.hypot(SUN[0], SUN[2]),
  SUN_A = [SUN[2] / SUN_LEN, 0, -SUN[0] / SUN_LEN],
  SUN_B = [SUN[1] * SUN_A[2], SUN[2] * SUN_A[0] - SUN[0] * SUN_A[2], -SUN[1] * SUN_A[0]];
/** how far a point is lifted off its face before the sun's view is asked whether something lies before it, in blocks */
const BIAS = 0.03;
/** dots of the sun's view to a finer block's width */
const SUN_DOTS = 4;

/** Calls `each` for every dot of a picture of W by H dots whose middle lies in the triangle with corners (U, V), with the dot's number and the shares of the three corners at its middle. */
function dots(
  U: readonly number[],
  V: readonly number[],
  W: number,
  H: number,
  each: (i: number, s0: number, s1: number, s2: number) => void,
) {
  const area = (U[1] - U[0]) * (V[2] - V[0]) - (U[2] - U[0]) * (V[1] - V[0]);
  if (Math.abs(area) < 1e-9) return;
  const fromU = Math.max(0, Math.ceil(Math.min(U[0], U[1], U[2]) - 0.5)),
    untilU = Math.min(W - 1, Math.floor(Math.max(U[0], U[1], U[2]) - 0.5));
  const fromV = Math.max(0, Math.ceil(Math.min(V[0], V[1], V[2]) - 0.5)),
    untilV = Math.min(H - 1, Math.floor(Math.max(V[0], V[1], V[2]) - 0.5));
  for (let v = fromV; v <= untilV; v++)
    for (let u = fromU; u <= untilU; u++) {
      const pu = u + 0.5,
        pv = v + 0.5;
      const s1 = ((pu - U[0]) * (V[2] - V[0]) - (U[2] - U[0]) * (pv - V[0])) / area,
        s2 = ((U[1] - U[0]) * (pv - V[0]) - (pu - U[0]) * (V[1] - V[0])) / area,
        s0 = 1 - s1 - s2;
      if (s0 < -1e-6 || s1 < -1e-6 || s2 < -1e-6) continue;
      each(u + v * W, s0, s1, s2);
    }
}

/** the colour the deepest crease keeps, in linear light */
const DEEP = [16, 8, 0].map((shift) => (((CREASES.colour >> shift) & 255) / 255) ** 2.2);
/** directions a dot's surroundings are searched in, and steps along each (the stage's pass turns three directions by chance from dot to dot and takes eight steps) */
const SLICES = 6,
  STEPS = 8;

/**
 * How open every dot of the camera's picture lies, 0 … 1: the stage darkens creases and corners by three's
 * GTAONode (Jimenez et al. 2016, "Practical real-time strategies for accurate indirect occlusion"), and this is
 * the same reckoning on the picture's own depths: in every direction across the picture the highest thing within
 * reach on either side bounds the sky a point sees, and the light of the sky left between the two bounds, weighted
 * by how it falls on the face, is what the point keeps. `depth`: how near every dot's point is to the camera, in
 * blocks; `turned`: the way its face looks.
 */
function creases(depth: Float32Array, turned: Float32Array, W: number, H: number): Float32Array {
  const open = new Float32Array(W * H).fill(1),
    R = CREASES.reach;
  const acos = (v: number) => Math.acos(Math.max(-1, Math.min(1, v)));
  for (let v = 0; v < H; v++)
    for (let u = 0; u < W; u++) {
      const i = u + v * W;
      if (depth[i] === -Infinity) continue;
      // the face's direction in the picture's own axes: to the right, upwards, towards the camera
      const wx = turned[i * 3],
        wy = turned[i * 3 + 1],
        wz = turned[i * 3 + 2];
      const nx = wx * ACROSS[0] + wz * ACROSS[2],
        ny = wx * UPWARDS[0] + wy * UPWARDS[1] + wz * UPWARDS[2],
        nz = wx * NEARER[0] + wy * NEARER[1] + wz * NEARER[2];
      let sum = 0;
      for (let d = 0; d < SLICES; d++) {
        const angle = ((d + 0.5) / SLICES) * Math.PI,
          c = Math.cos(angle),
          s = Math.sin(angle);
        // the slice's plane holds the line of sight and the direction (c, s); across it lies (s, -c), along it (-c, -s)
        const across = nx * s - ny * c,
          px = nx - s * across,
          py = ny + c * across,
          len = Math.hypot(px, py, nz);
        if (len < 1e-4) continue;
        const qx = px / len,
          qy = py / len,
          qz = nz / len,
          nSin = -(qx * c + qy * s),
          nCos = Math.max(0, Math.min(1, qz)),
          tilt = (nSin >= 0 ? 1 : -1) * Math.acos(nCos);
        const start = -qx * c - qy * s;
        let far = start,
          near = -start;
        for (let j = 0; j < STEPS; j++) {
          // the stage sets its steps off by a chance between 0 and 2, here by their mean
          const t = (j + 2) / STEPS,
            reach = t * t * R * DOTS;
          for (const side of [1, -1]) {
            const su = Math.round(u + side * c * reach),
              sv = Math.round(v + side * s * reach);
            if (su < 0 || sv < 0 || su >= W || sv >= H || (su === u && sv === v)) continue;
            const k = su + sv * W;
            if (depth[k] === -Infinity) continue;
            const dz = depth[k] - depth[i];
            if (Math.abs(dz) >= CREASES.thickness) continue;
            // a point of the face's own plane bounds nothing (the dots' grid would else count the plane a hair against itself)
            if (nz > 0.05 && dz <= -(nx * (su - u) + ny * (sv - v)) / DOTS / nz + 0.02) continue;
            const dist = Math.hypot((su - u) / DOTS, (sv - v) / DOTS, dz),
              high = dz / Math.max(dist, 1e-4),
              fade = Math.min(dist / R, 1) ** 2;
            if (side === 1) far = Math.max(far, high) * (1 - fade) + far * fade;
            else near = Math.max(near, high) * (1 - fade) + near * fade;
          }
        }
        const hPos = acos(near),
          hNeg = -acos(far);
        sum +=
          len *
          0.25 *
          (-Math.cos(2 * hPos - tilt) + nCos + 2 * hPos * nSin - Math.cos(2 * hNeg - tilt) + nCos + 2 * hNeg * nSin);
      }
      open[i] = Math.max(0, Math.min(1, sum / SLICES)) ** CREASES.depth;
    }
  return open;
}

/**
 * What the far camera sees of every finer block: the meshes are drawn as a picture from where the camera stands
 * (from afar, so that every line of sight runs the same way), each face in its colour as brightly as the lights
 * light it, the nearer before the farther, and without the sun's light where something stands between it and the sun, and darkened in creases and corners as the stage darkens them. Returns for every block the sum of the colours of the dots that show a
 * point of it, and their number: first of the dots that show a face looking up, then of those that show a side
 * (eight numbers a block).
 */
export function look(a: Above): Float32Array {
  // the picture's frame: the ground's corners at the lowest and the highest height
  let low = Infinity,
    high = -Infinity;
  for (let i = 0; i < a.w * a.d; i++)
    if (a.high[i] !== -Infinity) {
      low = Math.min(low, a.ground[i] === -Infinity ? a.high[i] : a.ground[i]);
      high = Math.max(high, a.high[i]);
    }
  const seen = new Float32Array(a.w * a.d * 8);
  if (low === Infinity) return seen;
  let u0 = Infinity,
    u1 = -Infinity,
    v0 = Infinity,
    v1 = -Infinity;
  for (const x of [0, a.w])
    for (const z of [0, a.d])
      for (const y of [low - 1, high + 1]) {
        const u = x * ACROSS[0] + z * ACROSS[2],
          v = x * UPWARDS[0] + y * UPWARDS[1] + z * UPWARDS[2];
        u0 = Math.min(u0, u);
        u1 = Math.max(u1, u);
        v0 = Math.min(v0, v);
        v1 = Math.max(v1, v);
      }
  // what lies in the sun's shadow: the same meshes as the sun sees them, the nearest to it at every dot
  let a0 = Infinity,
    a1 = -Infinity,
    b0 = Infinity,
    b1 = -Infinity;
  for (const x of [0, a.w])
    for (const z of [0, a.d])
      for (const y of [low - 1, high + 1]) {
        const sa = x * SUN_A[0] + z * SUN_A[2],
          sb = x * SUN_B[0] + y * SUN_B[1] + z * SUN_B[2];
        a0 = Math.min(a0, sa);
        a1 = Math.max(a1, sa);
        b0 = Math.min(b0, sb);
        b1 = Math.max(b1, sb);
      }
  // of every dot of the sun's view: how near the face it shows is to the sun at the dot's middle, and how that changes across the dot (so that a point of the same face is never taken to lie behind it)
  const SW = Math.ceil((a1 - a0) * SUN_DOTS) + 1,
    SH = Math.ceil((b1 - b0) * SUN_DOTS) + 1,
    sunward = new Float32Array(SW * SH).fill(-Infinity),
    slope = new Float32Array(SW * SH * 2);
  const U = [0, 0, 0],
    V = [0, 0, 0],
    D = [0, 0, 0];
  for (const {
    mesh: { pos, nor },
    dx,
    dz,
  } of a.meshes)
    for (let t = 0; t < pos.length; t += 9) {
      if (nor[t] * SUN[0] + nor[t + 1] * SUN[1] + nor[t + 2] * SUN[2] <= 0) continue;
      for (let k = 0; k < 3; k++) {
        const x = pos[t + k * 3] + dx,
          y = pos[t + k * 3 + 1],
          z = pos[t + k * 3 + 2] + dz;
        U[k] = (x * SUN_A[0] + z * SUN_A[2] - a0) * SUN_DOTS;
        V[k] = (x * SUN_B[0] + y * SUN_B[1] + z * SUN_B[2] - b0) * SUN_DOTS;
        D[k] = x * SUN[0] + y * SUN[1] + z * SUN[2];
      }
      const area = (U[1] - U[0]) * (V[2] - V[0]) - (U[2] - U[0]) * (V[1] - V[0]);
      if (Math.abs(area) < 1e-9) continue;
      const across = ((D[1] - D[0]) * (V[2] - V[0]) - (D[2] - D[0]) * (V[1] - V[0])) / area,
        upwards = ((D[2] - D[0]) * (U[1] - U[0]) - (D[1] - D[0]) * (U[2] - U[0])) / area;
      dots(U, V, SW, SH, (i, s0, s1, s2) => {
        const near = s0 * D[0] + s1 * D[1] + s2 * D[2];
        if (near > sunward[i]) {
          sunward[i] = near;
          slope[i * 2] = across;
          slope[i * 2 + 1] = upwards;
        }
      });
    }
  const W = Math.ceil((u1 - u0) * DOTS) + 1,
    H = Math.ceil((v1 - v0) * DOTS) + 1;
  // of every dot of the picture: how near what it shows is, the block under it, its colour as the lights without the sun light it, and as the sun does where it reaches it
  const depth = new Float32Array(W * H).fill(-Infinity),
    block = new Int32Array(W * H).fill(-1),
    colour = new Float32Array(W * H * 3),
    sunny = new Float32Array(W * H * 3),
    upward = new Uint8Array(W * H),
    spot = new Float32Array(W * H * 3),
    turned = new Float32Array(W * H * 3);
  const X = [0, 0, 0],
    Y = [0, 0, 0],
    Z = [0, 0, 0];
  for (const {
    mesh: { pos, nor, col },
    dx,
    dz,
  } of a.meshes)
    for (let t = 0; t < pos.length; t += 9) {
      const n: [number, number, number] = [nor[t], nor[t + 1], nor[t + 2]];
      // faces turned away from the camera are not seen
      if (n[0] * NEARER[0] + n[1] * NEARER[1] + n[2] * NEARER[2] <= 0) continue;
      for (let k = 0; k < 3; k++) {
        X[k] = pos[t + k * 3] + dx;
        Y[k] = pos[t + k * 3 + 1];
        Z[k] = pos[t + k * 3 + 2] + dz;
        U[k] = (X[k] * ACROSS[0] + Z[k] * ACROSS[2] - u0) * DOTS;
        V[k] = (X[k] * UPWARDS[0] + Y[k] * UPWARDS[1] + Z[k] * UPWARDS[2] - v0) * DOTS;
        D[k] = X[k] * NEARER[0] + Y[k] * NEARER[1] + Z[k] * NEARER[2];
      }
      const sun = sunlit(n),
        rest = litness(n) - sun,
        r = (col[t] + col[t + 3] + col[t + 6]) / 3,
        g = (col[t + 1] + col[t + 4] + col[t + 7]) / 3,
        b = (col[t + 2] + col[t + 5] + col[t + 8]) / 3,
        up = n[1] > 0.5 ? 1 : 0;
      dots(U, V, W, H, (i, s0, s1, s2) => {
        const near = s0 * D[0] + s1 * D[1] + s2 * D[2];
        if (near <= depth[i]) return;
        depth[i] = near;
        // the point that is seen, a hair inside the face for the block under it, a hair outside it for the sun's view of it
        const px = s0 * X[0] + s1 * X[1] + s2 * X[2],
          py = s0 * Y[0] + s1 * Y[1] + s2 * Y[2],
          pz = s0 * Z[0] + s1 * Z[1] + s2 * Z[2];
        const x = Math.floor(px - n[0] * 0.01),
          z = Math.floor(pz - n[2] * 0.01);
        block[i] = x >= 0 && z >= 0 && x < a.w && z < a.d ? x + z * a.w : -1;
        turned[i * 3] = n[0];
        turned[i * 3 + 1] = n[1];
        turned[i * 3 + 2] = n[2];
        colour[i * 3] = r * rest;
        colour[i * 3 + 1] = g * rest;
        colour[i * 3 + 2] = b * rest;
        sunny[i * 3] = r * sun;
        sunny[i * 3 + 1] = g * sun;
        sunny[i * 3 + 2] = b * sun;
        upward[i] = up;
        const qx = px + n[0] * BIAS,
          qy = py + n[1] * BIAS,
          qz = pz + n[2] * BIAS;
        spot[i * 3] = (qx * SUN_A[0] + qz * SUN_A[2] - a0) * SUN_DOTS;
        spot[i * 3 + 1] = (qx * SUN_B[0] + qy * SUN_B[1] + qz * SUN_B[2] - b0) * SUN_DOTS;
        spot[i * 3 + 2] = qx * SUN[0] + qy * SUN[1] + qz * SUN[2];
      });
    }
  // the sun reaches a dot's point if nothing lies nearer to the sun there
  for (let i = 0; i < W * H; i++)
    if (block[i] >= 0 && sunny[i * 3] + sunny[i * 3 + 1] + sunny[i * 3 + 2] > 0) {
      const su = Math.floor(spot[i * 3]),
        sv = Math.floor(spot[i * 3 + 1]),
        at = su + sv * SW;
      if (
        su >= 0 &&
        sv >= 0 &&
        su < SW &&
        sv < SH &&
        sunward[at] + slope[at * 2] * (spot[i * 3] - su - 0.5) + slope[at * 2 + 1] * (spot[i * 3 + 1] - sv - 0.5) >
          spot[i * 3 + 2] + BIAS
      )
        continue;
      colour[i * 3] += sunny[i * 3];
      colour[i * 3 + 1] += sunny[i * 3 + 1];
      colour[i * 3 + 2] += sunny[i * 3 + 2];
    }
  // creases and corners: every dot keeps as much of its light as the stage's own pass leaves it
  const open = creases(depth, turned, W, H);
  for (let i = 0; i < W * H; i++)
    if (block[i] >= 0) for (let k = 0; k < 3; k++) colour[i * 3 + k] *= DEEP[k] + (1 - DEEP[k]) * open[i];
  for (let i = 0; i < W * H; i++)
    if (block[i] >= 0) {
      const j = block[i] * 8 + (upward[i] ? 0 : 4);
      seen[j] += colour[i * 3];
      seen[j + 1] += colour[i * 3 + 1];
      seen[j + 2] += colour[i * 3 + 2];
      seen[j + 3]++;
    }
  return seen;
}

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
