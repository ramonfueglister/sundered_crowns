// Ground and water of the probe scene as meshes. The ground is made of columns (one height per cell), as the real
// renderer will be: level neighbours form one smooth surface, steps show only where heights differ.
import { Batch, type RGB, fbm2, hash2, mix, noise2, rgb, shade, smooth } from './batch';
import { type Ground, type GroundTraits, Mat, N, SEA_Y, SUMMIT, idx, rockPillar } from './layout';

const GRASS_A = rgb(0xb0c83c), GRASS_B = rgb(0xbcca3e), GRASS_DRY = rgb(0xd2c444), GRASS_DEEP = rgb(0x98b638);
const MEADOW_MID = rgb(0x9abf3d), MEADOW_DEEP = rgb(0x82ac37), TUFT = rgb(0x5f9030);
const ROAD = rgb(0xe0c6a4), PAVED = rgb(0xe4c6b4), PLAZA = rgb(0xecd6c6), ISLE_STONE = rgb(0xf0d6bc);
const ROCK_TOP_LOW = rgb(0xb4aaa6), ROCK_TOP_HIGH = rgb(0xfdfaf8), ROCK_SIDE_LOW = rgb(0xa09a9e), ROCK_SIDE = rgb(0xc4ac9e), ROCK_SIDE_COOL = rgb(0xa8b4c0), ROCK_SIDE_HIGH = rgb(0xfff5ed), ROCK_SIDE_HIGH_COOL = rgb(0xd0dae6);
const SOIL_WHEAT = rgb(0xc09a3c), SOIL_VINE = rgb(0x587a2a);
const DIRT = rgb(0xa88a52), SHADED_SOIL = rgb(0x6a705c), QUAY = rgb(0xdcc4b4), EARTH = rgb(0x9a8450);
const WATER_SHALLOW = rgb(0x349aa4), WATER_DEEP = rgb(0x2b818c), FALLS = rgb(0x9fd6d8);

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

/**
 * The meadows of the reference are tiled, not washed: flat patches of a few cells, each a step greener, darker or
 * drier than the next, and single dark tufts. Gives the colour a cell is pulled towards and how far, or null.
 */
function meadowPatch(x: number, z: number): readonly [RGB, number] | null {
  if (hash2(x, z, 87) < 0.02) return [TUFT, 0.8];
  // slabs of three by two cells, every other column of slabs shifted; dry patches of two by two between them
  const col = Math.floor(x / 3), lot = hash2(col, Math.floor((z + col) / 2), 83);
  if (lot < 0.22) return [MEADOW_MID, 0.7];
  if (lot > 0.93) return [MEADOW_DEEP, 0.7];
  return hash2(Math.floor(x / 2), Math.floor((z + Math.floor(x / 2)) / 2), 85) < 0.2 ? [GRASS_DRY, 0.42] : null;
}

function topColor(t: GroundTraits, x: number, z: number, mat: number): RGB {
  if (mat === Mat.Rock) return t.summit(x, z) > SUMMIT ? ROCK_TOP_HIGH : ROCK_TOP_LOW;
  if (mat === Mat.Paved && !t.city(x, z)) return shade(ISLE_STONE, 0.94 + 0.1 * noise2(x / 1.7, z / 1.7, 6));
  if (mat === Mat.Paved) return shade(mix(PLAZA, PAVED, smooth(-1, 3, t.plaza(x, z))), 0.93 + 0.12 * noise2(x / 2.3, z / 2.3, 4));
  if (mat === Mat.Bed) return QUAY;
  const crop = mat === Mat.Soil ? t.crop(x, z, 0.6) : null;
  let c = mix(GRASS_A, GRASS_B, fbm2(x / 11, z / 11, 21));
  // sun-bleached blades between the green ones, changing from cell to cell: the lit meadows of the reference are
  // speckled yellow-green
  c = mix(c, GRASS_DRY, hash2(Math.round(x), Math.round(z), 23) * (0.25 + 0.3 * t.bleach(x, z)));
  c = mix(c, GRASS_DEEP, smooth(0.45, 0.75, fbm2(x / 13, z / 13, 25)) * 0.6);
  if (crop) c = mix(c, crop === 'wheat' ? SOIL_WHEAT : SOIL_VINE, 0.85);
  // paths: soft edges, because the colour is taken at the corners and blended across each block
  const near = t.road(x, z), road = 1 - smooth(1.3, 2.0, near + (noise2(x / 2, z / 2, 27) - 0.5) * 0.9);
  // bare earth shows through in patches, mostly beside the paths
  const bare = smooth(0.6, 0.72, fbm2(x / 6, z / 6, 29) + 0.12 * smooth(7, 2, near));
  c = mix(c, DIRT, bare * 0.7);
  return t.city(x, z) ? PAVED : mix(c, ROAD, road * 0.92);
}

/** `baked` switches the sky share on (light step 2); without it the ground has only the live sun and sky of step 1. */
export function buildTerrain(g: Ground, t: GroundTraits, baked = true): Batch {
  const b = new Batch(), light = (x: number, z: number, y: number) => (baked ? skyLight(skyShare(g, x, z, y)) : 1);
  const NB: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = idx(x, z), h = g.h[i], mat = g.mat[i];
    // every cell is a touch lighter or darker than its neighbours: the fine grain of the reference's ground
    // paving lies in slabs of two by two cells, every other row shifted by one
    const col = Math.floor(x / 2), slab = hash2(col, Math.floor((z + (col % 2)) / 2), 47) - 0.5;
    const grain = mat === Mat.Rock ? 1 : mat === Mat.Paved ? (1.03 + slab * 0.22 + (hash2(x, z, 45) - 0.5) * 0.1) * (hash2(x, z, 46) < 0.06 ? 0.8 : hash2(x, z, 46) > 0.95 ? 1.1 : 1) : 1 + (hash2(x, z, 45) - 0.5) * (t.road(x + 0.5, z + 0.5) < 1.7 ? 0.16 : 0.1);
    // a rock column has one colour over its whole top, so that the cubes stay crisp
    const rockTop = mat === Mat.Rock ? topColor(t, x, z, mat) : null, pale = mat === Mat.Rock && t.summit(x, z) > SUMMIT;
    const patch = mat === Mat.Grass && t.road(x + 0.5, z + 0.5) > 2.2 && !t.city(x + 0.5, z + 0.5) ? meadowPatch(x, z) : null;
    // where less of the sky is seen the ground turns not only darker but cooler: red falls off faster than blue
    const corner = (cx: number, cz: number): RGB => {
      const l = light(cx, cz, h + 0.02), smoothBase = rockTop ?? topColor(t, cx, cz, mat), base = patch ? mix(smoothBase, patch[0], patch[1]) : smoothBase;
      // under trees and between houses the grass gives way to dull, dark soil
      const c = mat === Mat.Grass ? mix(base, SHADED_SOIL, Math.min(1, (1 - l) * 1.3)) : base;
      return [c[0] * grain * l ** 1.5, c[1] * grain * l, c[2] * grain * l ** 0.3];
    };
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
      // rock: on the faces towards the sun grey stone that turns warm and light towards the summits, slate blue on those
      // turned away, each pillar lighter or darker than the next and a third of the slate ones dark
      if (mat === Mat.Rock) {
        const lot = hash2(...rockPillar(x, z), 35);
        side = dx === 1 ? shade(mix(ROCK_SIDE_LOW, ROCK_SIDE, smooth(0.2, SUMMIT, t.summit(x, z))), 0.86 + 0.24 * lot) : shade(ROCK_SIDE_COOL, lot < 0.35 ? 0.42 + 0.3 * lot : 0.6 + 0.4 * lot);
      }
      else if (mat === Mat.Paved && !t.city(x + 0.5, z + 0.5)) side = shade(ISLE_STONE, 0.9 + 0.12 * hash2(Math.floor(x / 2), Math.floor(z / 2), 37));
      else if (wetSide || mat === Mat.Paved) side = shade(QUAY, 0.9 + 0.2 * hash2(x, z, 37));
      else side = t.slope ? shade(t.slope, 0.9 + 0.2 * hash2(x, z, 37)) : EARTH;
      // the two top corners of this side, in the order that keeps the face turned outwards
      const ax = dx === 1 ? x + 1 : dx === -1 ? x : dz === 1 ? x : x + 1, az = dz === 1 ? z + 1 : dz === -1 ? z : dx === 1 ? z : z + 1;
      const bx = dx === 1 ? x + 1 : dx === -1 ? x : dz === 1 ? x + 1 : x, bz = dz === 1 ? z + 1 : dz === -1 ? z : dx === 1 ? z + 1 : z;
      const la = light(ax + dx * 0.3, az + dz * 0.3, h - 0.2), lb = light(bx + dx * 0.3, bz + dz * 0.3, h - 0.2);
      const foot = 0.7;
      if (mat === Mat.Rock) {
        // cliffs: flat faces without a gradient, pale for the upper two or four blocks of a pale pillar, grey below
        const split = pale ? Math.max(nh, h - 2 - 2 * Math.floor(hash2(...rockPillar(x, z), 38) * 2)) : h, la2 = 0.5 + 0.5 * la, lb2 = 0.5 + 0.5 * lb;
        if (split > nh) b.quad([ax, nh, az], [bx, nh, bz], [bx, split, bz], [ax, split, az], [shade(side, la2), shade(side, lb2), shade(side, lb2), shade(side, la2)], [dx, 0, dz]);
        if (split < h) { const hi = dx === 1 ? ROCK_SIDE_HIGH : ROCK_SIDE_HIGH_COOL; b.quad([ax, split, az], [bx, split, bz], [bx, h, bz], [ax, h, az], hi, [dx, 0, dz]); }
        continue;
      }
      b.quad([ax, nh, az], [bx, nh, bz], [bx, h, bz], [ax, h, az], [shade(side, la * foot), shade(side, lb * foot), shade(side, lb), shade(side, la)], [dx, 0, dz]);
    }
  }
  return b;
}

/** the colour of open water; the picture uses it as its backdrop so that mirrored sky leaves the water as it is */
export const OPEN_WATER = WATER_DEEP;

/** The water as level sheets. `raised` picks the water above sea level (lakes, rivers) instead of the sea. */
export function buildWater(g: Ground, raised = false): Batch {
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
    // the open water is calm: broad, soft patches a little lighter or darker, no strokes
    return shade(mix(WATER_SHALLOW, WATER_DEEP, k), 0.91 + 0.14 * fbm2(cx / 14, cz / 14, 43) + 0.05 * hash2(cx, cz, 44));
  };
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = idx(x, z), y = g.surf[i];
    if (!g.wet[i] || (y > SEA_Y + 0.01) !== raised) continue;
    b.quad([x, y, z], [x, y, z + 1], [x + 1, y, z + 1], [x + 1, y, z], [corner(x, z), corner(x, z + 1), corner(x + 1, z + 1), corner(x + 1, z)], [0, 1, 0]);
    // where raised water meets lower water it falls: a pale sheet down to the lower surface
    if (raised) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, nz = z + dz, low = nx >= 0 && nz >= 0 && nx < N && nz < N && g.wet[idx(nx, nz)] ? g.surf[idx(nx, nz)] : y;
      if (low > y - 0.01) continue;
      const ax = dx === 1 ? x + 1 : x, az = dz === 1 ? z + 1 : z, bx = dx === -1 ? x : x + 1, bz = dz === -1 ? z : z + 1;
      b.quad([ax, low, az], [bx, low, bz], [bx, y, bz], [ax, y, az], FALLS, [dx, 0, dz]);
    }
  }
  return b;
}
