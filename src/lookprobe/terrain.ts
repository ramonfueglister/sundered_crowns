// Ground and water of the probe scene as meshes. The ground is made of columns (one height per cell), as the real
// renderer will be: level neighbours form one smooth surface, steps show only where heights differ.
import { Batch, type RGB, fbm2, hash2, mix, noise2, rgb, shade, smooth } from './batch';
import { type Ground, LAND_Y, Mat, N, SEA_Y, SITES, fieldAt, idx, inCity, roadDist } from './layout';

const GRASS_A = rgb(0x8ea838), GRASS_B = rgb(0xa8b23a), GRASS_DRY = rgb(0xc4b842), GRASS_DEEP = rgb(0x749a32);
const ROAD = rgb(0xcbb894), PAVED = rgb(0xc9b0a2), PLAZA = rgb(0xd6beb0);
const ROCK_TOP_LOW = rgb(0xeee2da), ROCK_TOP_HIGH = rgb(0xfff6ee), ROCK_SIDE = rgb(0x9c9498), ROCK_SIDE_WARM = rgb(0xaea39c);
const SOIL_WHEAT = rgb(0xb89a3c), SOIL_VINE = rgb(0x7a9a34);
const QUAY = rgb(0xc8b8ac), EARTH = rgb(0x9a8450);
const WATER_SHALLOW = rgb(0x409ea6), WATER_DEEP = rgb(0x2b818c);

/** Share of the sky seen from a point: eight directions, the steepest blocker in each. This is light step 2 of the plan. */
const DIRS: readonly (readonly [number, number])[] = [[1, 0], [0.707, 0.707], [0, 1], [-0.707, 0.707], [-1, 0], [-0.707, -0.707], [0, -1], [0.707, -0.707]];
const REACH = [0.75, 1.6, 2.8, 4.5, 7, 10.5];
export function skyShare(g: Ground, x: number, z: number, y: number): number {
  let blocked = 0;
  for (const [dx, dz] of DIRS) {
    let steepest = 0;
    for (const r of REACH) {
      const sx = Math.floor(x + dx * r), sz = Math.floor(z + dz * r);
      if (sx < 0 || sz < 0 || sx >= N || sz >= N) continue;
      const rise = (g.occ[idx(sx, sz)] - y) / r;
      if (rise > steepest) steepest = rise;
    }
    blocked += steepest / Math.sqrt(1 + steepest * steepest);
  }
  return 1 - blocked / DIRS.length;
}
/** Brightness factor from the sky share: open ground stays at 1, deep corners fall to about a half. */
export const skyLight = (share: number) => 0.42 + 0.58 * Math.min(1, share * 1.08);

function topColor(g: Ground, x: number, z: number, mat: number, h: number): RGB {
  if (mat === Mat.Rock) return mix(ROCK_TOP_LOW, ROCK_TOP_HIGH, smooth(2, 9, h - LAND_Y) * (0.85 + 0.15 * noise2(x / 3, z / 3, 9)));
  if (mat === Mat.Paved) {
    const p = SITES.plaza, plaza = Math.max(Math.abs(x - p.at[0]) - p.w / 2, Math.abs(z - p.at[1]) - p.d / 2);
    return shade(mix(PLAZA, PAVED, smooth(-1, 3, plaza)), 0.93 + 0.12 * noise2(x / 2.3, z / 2.3, 4));
  }
  if (mat === Mat.Bed) return QUAY;
  const crop = mat === Mat.Soil ? fieldAt(x, z, 0.6) : null;
  let c = mix(GRASS_A, GRASS_B, fbm2(x / 11, z / 11, 21));
  c = mix(c, GRASS_DRY, smooth(0.5, 0.8, noise2(x / 7, z / 7, 23)) * 0.6);
  c = mix(c, GRASS_DEEP, smooth(0.6, 0.85, noise2(x / 17, z / 17, 25)) * 0.5);
  if (crop) c = mix(c, crop === 'wheat' ? SOIL_WHEAT : SOIL_VINE, 0.85);
  // paths: soft edges, because the colour is taken at the corners and blended across each block
  const road = 1 - smooth(0.7, 2.3, roadDist(x, z) + (noise2(x / 2, z / 2, 27) - 0.5) * 0.9);
  const street = inCity(x, z) ? 1 : 0;
  return mix(c, ROAD, Math.max(road * 0.92, street));
}

/** `baked` switches the sky share on (light step 2); without it the ground has only the live sun and sky of step 1. */
export function buildTerrain(g: Ground, baked = true): Batch {
  const b = new Batch(), light = (x: number, z: number, y: number) => (baked ? skyLight(skyShare(g, x, z, y)) : 1);
  const NB: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = idx(x, z), h = g.h[i], mat = g.mat[i];
    const corner = (cx: number, cz: number): RGB => shade(topColor(g, cx, cz, mat, h), light(cx, cz, h + 0.02));
    const c00 = corner(x, z), c10 = corner(x + 1, z), c11 = corner(x + 1, z + 1), c01 = corner(x, z + 1);
    if (!g.wet[i]) b.quad([x, h, z], [x, h, z + 1], [x + 1, h, z + 1], [x + 1, h, z], [c00, c01, c11, c10], [0, 1, 0]);
    if (g.wet[i]) continue;
    for (const [dx, dz] of NB) {
      const nx = x + dx, nz = z + dz;
      const out = nx < 0 || nz < 0 || nx >= N || nz >= N;
      const nh = out ? 0 : g.h[idx(nx, nz)];
      if (nh >= h) continue;
      const wetSide = !out && g.wet[idx(nx, nz)] === 1;
      let side: RGB;
      if (mat === Mat.Rock) side = shade(mix(ROCK_SIDE, ROCK_SIDE_WARM, hash2(Math.floor(x / 4), Math.floor(z / 4), 33)), 0.92 + 0.16 * hash2(x, z, 35));
      else if (wetSide || mat === Mat.Paved) side = shade(QUAY, 0.9 + 0.2 * hash2(x, z, 37));
      else side = EARTH;
      // the two top corners of this side, in the order that keeps the face turned outwards
      const ax = dx === 1 ? x + 1 : dx === -1 ? x : dz === 1 ? x : x + 1, az = dz === 1 ? z + 1 : dz === -1 ? z : dx === 1 ? z : z + 1;
      const bx = dx === 1 ? x + 1 : dx === -1 ? x : dz === 1 ? x + 1 : x, bz = dz === 1 ? z + 1 : dz === -1 ? z : dx === 1 ? z + 1 : z;
      const la = light(ax + dx * 0.3, az + dz * 0.3, h - 0.2), lb = light(bx + dx * 0.3, bz + dz * 0.3, h - 0.2);
      const foot = 0.7;
      b.quad([ax, nh, az], [bx, nh, bz], [bx, h, bz], [ax, h, az], [shade(side, la * foot), shade(side, lb * foot), shade(side, lb), shade(side, la)], [dx, 0, dz]);
    }
  }
  return b;
}

/** the colour of open water; the picture uses it as its backdrop so that mirrored sky leaves the water as it is */
export const OPEN_WATER = WATER_DEEP;

export function buildWater(g: Ground): Batch {
  const b = new Batch();
  const depthAt = (cx: number, cz: number) => {
    let sum = 0, n = 0;
    for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) {
      const x = cx + dx, z = cz + dz;
      if (x < 0 || z < 0 || x >= N || z >= N) continue;
      sum += g.shore[idx(x, z)]; n++;
    }
    return n ? sum / n : 14;
  };
  const corner = (cx: number, cz: number): RGB => {
    const k = smooth(0.4, 8, depthAt(cx, cz) + (noise2(cx / 5, cz / 5, 41) - 0.5) * 2);
    return shade(mix(WATER_SHALLOW, WATER_DEEP, k), 0.96 + 0.08 * noise2(cx / 9, cz / 9, 43));
  };
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (!g.wet[idx(x, z)]) continue;
    b.quad([x, SEA_Y, z], [x, SEA_Y, z + 1], [x + 1, SEA_Y, z + 1], [x + 1, SEA_Y, z], [corner(x, z), corner(x, z + 1), corner(x + 1, z + 1), corner(x + 1, z)], [0, 1, 0]);
  }
  return b;
}
