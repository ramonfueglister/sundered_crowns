// What the far camera sees of the finer step, of which mean.ts takes the mean: the finer step as its blocks (`Above`),
// and the picture of them that `look` draws as the far camera sees it, every face as brightly as the stage's lights
// light it (lookprobe/light.ts), with the sun's shadow and the creases the stage darkens.
import type { Batch } from '../lookprobe/batch';
import { NEAR, RIGHT, VIEW } from '../lookprobe/layout';
import { CREASES, SUN, litness, sunlit } from '../lookprobe/light';

const ELEV = (VIEW.elevation * Math.PI) / 180;
/** the picture of the finer step, in dots: to the right, upwards, and towards the camera (what is nearer hides what is farther) */
const ACROSS = [RIGHT[0], 0, RIGHT[1]],
  UPWARDS = [-NEAR[0] * Math.sin(ELEV), Math.cos(ELEV), -NEAR[1] * Math.sin(ELEV)],
  NEARER = [NEAR[0] * Math.cos(ELEV), Math.sin(ELEV), NEAR[1] * Math.cos(ELEV)] as const;
/** dots of that picture to a finer block's width: enough that the small parts of a field or a crown are seen */
const DOTS = 4;
/** how brightly a top is lit, and the two sides of a block towards the camera in the mean of what is seen of each */
export const LIT_UP = litness([0, 1, 0]),
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
