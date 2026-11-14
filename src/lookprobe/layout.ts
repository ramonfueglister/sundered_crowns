// The fixed probe scene, laid out after Ramon's reference image: mountains and forest at the top left, a river, fields and
// small towns, a large harbour city in the middle right, sea with islets and ships at the bottom right, two realm borders.
// Positions are given in frame coordinates (s to the right, t downwards, 0 … 1 across the picture) and turned into ground
// cells here. One ground block is one unit.
import { fbm2, hash2, noise2 } from './batch';

/** side of the square ground grid */
export const N = 400;
const C = N / 2;
/**
 * The camera of the reference image, measured from the directions of its building edges (they run 18.5° down and 16.5°
 * up to the right): it looks down by 18.7°, and the ground's x axis lies 46.7° from the picture's horizontal.
 */
export const VIEW = { elevation: 18.7, turn: 46.7 } as const;
const TURN = (VIEW.turn * Math.PI) / 180;
/** ground directions (x, z) of the picture's right and of its bottom (towards the camera) */
export const RIGHT: P2 = [Math.cos(TURN), -Math.sin(TURN)], NEAR: P2 = [Math.sin(TURN), Math.cos(TURN)];
/** ground units across the picture and from its top to its bottom edge */
export const FRAME_W = 190, FRAME_D = (FRAME_W * 941) / 1672 / Math.sin((VIEW.elevation * Math.PI) / 180);
/** height of the water surface; land starts at LAND_Y */
export const SEA_Y = 2.7, LAND_Y = 4;

export type P2 = readonly [number, number];
export const toXZ = (s: number, t: number): P2 => {
  const u = (s - 0.5) * FRAME_W, v = (t - 0.5) * FRAME_D;
  return [C + u * RIGHT[0] + v * NEAR[0], C + u * RIGHT[1] + v * NEAR[1]];
};
export const toST = (x: number, z: number): P2 => {
  const u = (x - C) * RIGHT[0] + (z - C) * RIGHT[1], v = (x - C) * NEAR[0] + (z - C) * NEAR[1];
  return [u / FRAME_W + 0.5, v / FRAME_D + 0.5];
};
const line = (pts: readonly P2[]) => pts.map(([s, t]) => toXZ(s, t));

function distToSegments(x: number, z: number, pts: readonly P2[], closed = false): number {
  let best = Infinity;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - a[0] - k * dx, z - a[1] - k * dz));
  }
  return best;
}
function inPolygon(x: number, z: number, pts: readonly P2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

// ---- the scene -----------------------------------------------------------------------------------------------------

const SEA = line([[0.34, 1.08], [0.38, 0.93], [0.44, 0.86], [0.5, 0.8], [0.57, 0.76], [0.63, 0.71], [0.7, 0.68], [0.78, 0.66],
  [0.85, 0.62], [0.875, 0.55], [0.86, 0.47], [0.8, 0.42], [0.83, 0.38], [0.9, 0.355], [1.1, 0.33], [1.1, 1.08]]);
export const ISLANDS: readonly { at: P2; rx: number; rz: number; kind: 'village' | 'tower' | 'houses' }[] = [
  { at: toXZ(0.885, 0.435), rx: 10.5, rz: 6.5, kind: 'village' },
  { at: toXZ(0.925, 0.7), rx: 7, rz: 7, kind: 'houses' },
  { at: toXZ(0.875, 0.865), rx: 7.5, rz: 7, kind: 'houses' },
  { at: toXZ(0.725, 0.935), rx: 6, rz: 6, kind: 'tower' },
];
export const RIVER = line([[0.47, 0.08], [0.43, 0.17], [0.36, 0.22], [0.3, 0.27], [0.31, 0.33], [0.36, 0.37], [0.4, 0.43],
  [0.405, 0.52], [0.39, 0.62], [0.4, 0.74], [0.42, 0.84], [0.445, 0.875]]);
const RIVER_HALF = 1.5;
export const ROADS: readonly (readonly P2[])[] = [
  line([[-0.05, 0.63], [0.15, 0.56], [0.3, 0.5], [0.42, 0.475], [0.5, 0.5]]),
  line([[0.3, 0.5], [0.25, 0.4], [0.17, 0.37], [0.05, 0.36]]),
  line([[0.6, 0.4], [0.62, 0.28], [0.75, 0.2], [0.9, 0.14]]),
  line([[0.08, 0.78], [0.25, 0.69], [0.43, 0.7]]),
  line([[0.25, 0.4], [0.33, 0.31], [0.37, 0.245], [0.5, 0.18], [0.62, 0.28]]),
];
/** peaks: foot centre, radii on the ground, height in blocks */
const MOUNTAINS: readonly { at: P2; rx: number; rz: number; top: number }[] = [
  { at: toXZ(0.07, 0.11), rx: 15, rz: 11, top: 19 },
  { at: toXZ(0.16, 0.15), rx: 14, rz: 11, top: 22 },
  { at: toXZ(0.235, 0.19), rx: 14, rz: 10, top: 21 },
  { at: toXZ(0.315, 0.19), rx: 12, rz: 10, top: 19 },
  { at: toXZ(0.415, 0.14), rx: 13, rz: 9, top: 17 },
  { at: toXZ(0.0, 0.04), rx: 16, rz: 12, top: 20 },
];
export const CASTLE_AT = toXZ(0.92, 0.125);
/** the built-up ground of the city: the main part east of the river and the quarters on the other bank */
export const CITY: readonly (readonly P2[])[] = [
  line([[0.44, 0.5], [0.52, 0.42], [0.66, 0.38], [0.8, 0.42], [0.86, 0.48], [0.875, 0.55], [0.85, 0.62],
    [0.78, 0.66], [0.7, 0.68], [0.63, 0.71], [0.57, 0.76], [0.5, 0.8], [0.44, 0.86], [0.415, 0.8], [0.425, 0.62]]),
  line([[0.25, 0.6], [0.3, 0.52], [0.38, 0.5], [0.435, 0.52], [0.42, 0.62], [0.4, 0.74], [0.4, 0.86], [0.37, 0.95], [0.33, 1.06], [0.2, 1.06],
    [0.26, 0.88], [0.3, 0.78], [0.27, 0.68]]),
];
export const TOWNS: readonly { at: P2; r: number; houses: number; towers: number }[] = [
  { at: toXZ(0.145, 0.365), r: 17, houses: 16, towers: 2 },
  { at: toXZ(0.345, 0.31), r: 8, houses: 5, towers: 0 },
  { at: toXZ(0.07, 0.62), r: 10, houses: 7, towers: 0 },
  { at: toXZ(0.2, 0.86), r: 13, houses: 10, towers: 1 },
  { at: toXZ(0.52, 0.27), r: 7, houses: 4, towers: 0 },
  { at: toXZ(0.86, 0.19), r: 7, houses: 5, towers: 0 },
];
export type Crop = 'wheat' | 'vine';
/** fields as ground rectangles: centre, size along x and z, crop */
export const FIELDS: readonly { at: P2; w: number; d: number; crop: Crop }[] = [
  { at: toXZ(0.035, 0.3), w: 20, d: 14, crop: 'vine' },
  { at: toXZ(0.655, 0.255), w: 19, d: 12, crop: 'vine' },
  { at: toXZ(0.7, 0.3), w: 15, d: 10, crop: 'wheat' },
  { at: toXZ(0.365, 0.435), w: 19, d: 12, crop: 'vine' },
  { at: toXZ(0.155, 0.49), w: 18, d: 12, crop: 'vine' },
  { at: toXZ(0.205, 0.525), w: 16, d: 10, crop: 'wheat' },
  { at: toXZ(0.07, 0.545), w: 19, d: 11, crop: 'vine' },
  { at: toXZ(0.2, 0.635), w: 16, d: 9, crop: 'wheat' },
  { at: toXZ(0.21, 0.755), w: 20, d: 14, crop: 'vine' },
  { at: toXZ(0.52, 0.335), w: 16, d: 11, crop: 'wheat' },
];
export const BORDERS: readonly { pts: readonly P2[]; color: number }[] = [
  { pts: line([[0.33, 1.02], [0.36, 0.9], [0.3, 0.83], [0.345, 0.72], [0.42, 0.7], [0.44, 0.56], [0.52, 0.47], [0.6, 0.41], [0.72, 0.385], [0.83, 0.375]]), color: 0xd2453a },
  { pts: line([[0.67, -0.02], [0.69, 0.1], [0.74, 0.16], [0.72, 0.22], [0.83, 0.27], [0.94, 0.25], [1.03, 0.26]]), color: 0x9a55c8 },
  { pts: line([[-0.02, 0.9], [0.06, 0.93], [0.1, 1.02]]), color: 0x9a55c8 },
];
export const SHIPS: readonly { at: P2; heading: number }[] = [
  { at: toXZ(0.935, 0.56), heading: 0 }, { at: toXZ(0.755, 0.76), heading: 0 }, { at: toXZ(0.6, 0.885), heading: 0 },
];
/** landmark sites of the city: centre and footprint (along x and z) */
export const SITES = {
  palace: { at: toXZ(0.735, 0.585), w: 9, d: 20 },
  campanile: { at: toXZ(0.742, 0.5), w: 4, d: 4 },
  basilica: { at: toXZ(0.64, 0.5), w: 13, d: 11 },
  plaza: { at: toXZ(0.8, 0.615), w: 14, d: 12 },
  westTower: { at: toXZ(0.355, 0.57), w: 2.4, d: 2.4 },
  eastTower: { at: toXZ(0.56, 0.6), w: 2.4, d: 2.4 },
} as const;

// ---- ground fields -------------------------------------------------------------------------------------------------

export const Mat = { Grass: 0, Paved: 1, Rock: 2, Soil: 3, Bed: 4 } as const;
export interface Ground {
  /** top of each column in blocks */
  h: Int16Array;
  mat: Uint8Array;
  /** 1 where the column lies under water */
  wet: Uint8Array;
  /** blocks to the nearest dry column (0 on land), capped */
  shore: Uint8Array;
  /** height that blocks the sky over each column: ground, later raised by houses and trees */
  occ: Float32Array;
}
export const idx = (x: number, z: number) => z * N + x;
export const inGrid = (x: number, z: number) => x >= 0 && z >= 0 && x < N && z < N;

export const inCity = (x: number, z: number) => CITY.some((part) => inPolygon(x, z, part));
export const riverDist = (x: number, z: number) => distToSegments(x, z, RIVER);
export const roadDist = (x: number, z: number) => { let d = Infinity; for (const r of ROADS) d = Math.min(d, distToSegments(x, z, r)); return d; };
export function fieldAt(x: number, z: number, margin = 0): Crop | null {
  for (const f of FIELDS) if (Math.abs(x - f.at[0]) <= f.w / 2 + margin && Math.abs(z - f.at[1]) <= f.d / 2 + margin) return f.crop;
  return null;
}
function islandAt(x: number, z: number): number {
  for (const i of ISLANDS) {
    const k = ((x - i.at[0]) / i.rx) ** 2 + ((z - i.at[1]) / i.rz) ** 2 + (noise2(x * 0.5, z * 0.5, 3) - 0.5) * 0.35;
    if (k < 1) return 1 - k;
  }
  return 0;
}
/** Height of the mountains over a point in blocks, before it is cut into cubes; below 0 outside (by the distance). */
export function mountainAt(x: number, z: number): number {
  let m = -Infinity;
  // steep flanks under a broad top: the cone is cut off at four fifths of its height
  for (const k of MOUNTAINS) m = Math.max(m, k.top * Math.min(0.8, 1.5 * (1 - Math.hypot((x - k.at[0]) / k.rx, (z - k.at[1]) / k.rz))));
  return m <= 0 ? m : m + (fbm2(x / 9, z / 9, 5) - 0.5) * 5 * Math.min(1, m / 4);
}
/** Rock comes as stacked cubes: blocks three columns wide in steps of two set the cliffs, a few single columns step off them. */
function rockHeight(x: number, z: number): number {
  const m = mountainAt(x + 0.5, z + 0.5);
  if (m < 0.6) return 0;
  const slab = (hash2(Math.floor(x / 3), Math.floor((z + Math.floor(x / 3)) / 3), 11) - 0.5) * 5, big = (hash2(Math.floor(x / 7), Math.floor(z / 7), 13) - 0.5) * 4;
  const piece = hash2(x, z, 19), step = piece < 0.05 ? -1 : piece > 0.96 ? 1 : 0;
  return Math.max(1, Math.round((m + (slab + big) * Math.min(1, m / 5)) / 2) * 2 + step);
}

export function buildGround(): Ground {
  const g: Ground = { h: new Int16Array(N * N), mat: new Uint8Array(N * N), wet: new Uint8Array(N * N), shore: new Uint8Array(N * N), occ: new Float32Array(N * N) };
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const px = x + 0.5, pz = z + 0.5, i = idx(x, z);
    const island = islandAt(px, pz);
    const sea = inPolygon(px, pz, SEA) && island === 0;
    const river = riverDist(px, pz) < RIVER_HALF + (noise2(px * 0.3, pz * 0.3, 2) - 0.5) * 0.8;
    if (sea || river) {
      const coast = sea ? distToSegments(px, pz, SEA, true) : 0;
      g.h[i] = sea ? Math.max(0, 2 - Math.floor(coast / 4)) : 2; g.mat[i] = Mat.Bed; g.wet[i] = 1;
      continue;
    }
    const rock = rockHeight(x, z);
    const city = inCity(px, pz);
    let h = LAND_Y;
    if (rock > 0) { h += rock; g.mat[i] = Mat.Rock; }
    // islets are green inside a ring of stone
    else if (city || (island > 0 && island < 0.3)) g.mat[i] = Mat.Paved;
    else {
      // the land is level, as in the reference; only the castle stands on a low stepped hill
      const castle = Math.hypot(px - CASTLE_AT[0], pz - CASTLE_AT[1]);
      if (castle < 12) h = LAND_Y + 1 + (castle < 9 ? 1 : 0) + (castle < 6.5 ? 1 : 0);
      g.mat[i] = fieldAt(px, pz) ? Mat.Soil : Mat.Grass;
    }
    g.h[i] = h;
  }
  // stone blocks at the waterline of quays and islets: most sea cells that touch paved ground become a low step
  const rim: number[] = [];
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
    const i = idx(x, z), paved = (j: number) => g.wet[j] === 0 && g.mat[j] === Mat.Paved;
    if (g.wet[i] && (paved(i - 1) || paved(i + 1) || paved(i - N) || paved(i + N)) && riverDist(x + 0.5, z + 0.5) > 4 && hash2(x, z, 29) < 0.8) rim.push(i);
  }
  for (const i of rim) { g.wet[i] = 0; g.h[i] = LAND_Y - 1; g.mat[i] = Mat.Paved; }
  // distance to the shore, by repeated relaxation (two passes are enough for the short range needed)
  const far = 14;
  for (let i = 0; i < N * N; i++) g.shore[i] = g.wet[i] ? far : 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = idx(x, z); if (!g.wet[i]) continue;
      let d = g.shore[i];
      if (x > 0) d = Math.min(d, g.shore[i - 1] + 1); if (z > 0) d = Math.min(d, g.shore[i - N] + 1);
      g.shore[i] = d;
    }
    for (let z = N - 1; z >= 0; z--) for (let x = N - 1; x >= 0; x--) {
      const i = idx(x, z); if (!g.wet[i]) continue;
      let d = g.shore[i];
      if (x < N - 1) d = Math.min(d, g.shore[i + 1] + 1); if (z < N - 1) d = Math.min(d, g.shore[i + N] + 1);
      g.shore[i] = d;
    }
  }
  for (let i = 0; i < N * N; i++) g.occ[i] = g.wet[i] ? SEA_Y : g.h[i];
  return g;
}

/** Raises the sky blocker over a ground rectangle (houses, trees). */
export function occlude(g: Ground, x0: number, z0: number, x1: number, z1: number, top: number) {
  for (let z = Math.max(0, Math.floor(z0)); z < Math.min(N, Math.ceil(z1)); z++)
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(N, Math.ceil(x1)); x++) { const i = idx(x, z); if (g.occ[i] < top) g.occ[i] = top; }
}
/** Ground height under a point (the water surface over water). */
export const groundY = (g: Ground, x: number, z: number) => {
  const i = idx(Math.max(0, Math.min(N - 1, Math.floor(x))), Math.max(0, Math.min(N - 1, Math.floor(z))));
  return g.wet[i] ? SEA_Y : g.h[i];
};
export const isWet = (g: Ground, x: number, z: number) => !inGrid(Math.floor(x), Math.floor(z)) || g.wet[idx(Math.floor(x), Math.floor(z))] === 1;
