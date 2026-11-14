// The real landscape in the look of the probe: heights, coast, lakes and rivers of a region become a ground of columns
// on the probe's grid, with rock, meadow and woods chosen from the real heights and the forest cover of 1356.
// North is at the top of the picture. No towns, fields or roads yet.
import { Batch, hash2, rgb, seeded, smooth } from '../lookprobe/batch';
import { cypress, tree } from '../lookprobe/blocks';
import { type Ground, type GroundTraits, LAND_Y, Mat, N, NEAR, RIGHT, SEA_Y, SUMMIT, idx, inGrid, measureShore, occlude, rockPillar } from '../lookprobe/layout';
import type { StageScene } from '../lookprobe/stage';
import { buildTerrain, buildWater } from '../lookprobe/terrain';
import { type Region, Water, cellOf, sample, waterAt } from './region';

export interface WorldView {
  /** the place at the middle of the ground, in degrees */
  lon: number; lat: number;
  /** side of one block in kilometres */
  km: number;
  /** heights after river erosion instead of the measured ones */
  shaped: boolean;
}

/**
 * How real heights become blocks. The plains stay level, as in the reference; above them one block stands for
 * `METRES_PER_BLOCK`, and above the tree line for `METRES_PER_BLOCK_HIGH`, so that the peaks stand out of the high
 * country as the massifs of the reference do. The mountains come out several times steeper than they are (a diorama,
 * not a relief map).
 */
const PLAIN = 150, METRES_PER_BLOCK = 165, METRES_PER_BLOCK_HIGH = 100;
/** above this no trees grow and the heights are stretched; above the snow line (of the raised rock) the rock is pale */
const TREE_LINE = 1900, SNOW_LINE = 2650;
/** the massifs are rock from this height upwards; what stands above their valley floors is raised by this factor */
const ROCK_FROM = 1500, PEAK = 1.5;
/** a valley is where this much land drains through (25 km², in the steps of the region's drainage layer); the rock begins this many blocks from it */
const VALLEY_FROM = 75, FOOT = 3;
/** the sides of the steps of overgrown hills */
const SLOPE = rgb(0x86983c);
const levelOf = (metres: number) => Math.max(0, (Math.min(metres, TREE_LINE) - PLAIN) / METRES_PER_BLOCK) + Math.max(0, metres - TREE_LINE) / METRES_PER_BLOCK_HIGH;

export function buildWorld(region: Region, view: WorldView, bakedSky = true): StageScene {
  const C = N / 2, perBlock = view.km / region.kmPerCell, [c0x, c0y] = cellOf(region, view.lon, view.lat);
  /** region cell under a ground point: east is the picture's right, south its near side */
  const toCell = (x: number, z: number): [number, number] => {
    const u = (x - C) * RIGHT[0] + (z - C) * RIGHT[1], v = (x - C) * NEAR[0] + (z - C) * NEAR[1];
    return [c0x + u * perBlock, c0y + v * perBlock];
  };
  /** ground point of a region cell */
  const toGround = (cx: number, cy: number): [number, number] => {
    const u = (cx - c0x) / perBlock, v = (cy - c0y) / perBlock;
    return [C + u * RIGHT[0] + v * NEAR[0], C + u * RIGHT[1] + v * NEAR[1]];
  };

  // real height and water class of every column, taken at its centre
  const metres = new Float32Array(N * N), kind = new Uint8Array(N * N);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const [cx, cy] = toCell(x + 0.5, z + 0.5);
    metres[idx(x, z)] = sample(region, view.shaped ? region.shaped : region.height, cx, cy); kind[idx(x, z)] = waterAt(region, cx, cy);
  }
  /** a field averaged over a square of blocks reaching `reach` to each side */
  const averaged = (field: Float32Array, reach: number) => {
    const out = new Float32Array(N * N);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      let sum = 0, n = 0;
      for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) if (inGrid(x + dx, z + dz)) { sum += field[idx(x + dx, z + dz)]; n++; }
      out[idx(x, z)] = sum / n;
    }
    return out;
  };
  // The massifs are read from the drainage network: the valleys are the water and every column through which at least
  // VALLEY_FROM square kilometres drain. From them the land is walked outwards, and each column is held at least as
  // high as the one it was reached from, so that every massif rises closed from its valley floor to its divide and
  // the gullies finer than the valleys are filled.
  const rise = new Float32Array(metres), foot = new Float32Array(metres), away = new Int16Array(N * N).fill(-1), queue = new Int32Array(N * N);
  let head = 0, tail = 0;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const [cx, cy] = toCell(x + 0.5, z + 0.5), i = idx(x, z);
    const cell = Math.max(0, Math.min(region.h - 1, Math.floor(cy))) * region.w + Math.max(0, Math.min(region.w - 1, Math.floor(cx)));
    if (kind[i] !== Water.Land || region.drainage[cell] >= VALLEY_FROM) { away[i] = 0; queue[tail++] = i; }
  }
  while (head < tail) {
    const i = queue[head++], x = i % N, z = (i - x) / N;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!inGrid(x + dx, z + dz)) continue;
      const j = idx(x + dx, z + dz);
      if (away[j] >= 0) continue;
      away[j] = away[i] + 1; rise[j] = Math.max(rise[j], rise[i]); foot[j] = foot[i]; queue[tail++] = j;
    }
  }
  // the valley floor under every massif, blended where massifs of different valleys meet, and the massifs' closed shape
  const base = averaged(averaged(foot, 2), 2), massif = averaged(rise, 2);
  const at = (field: Float32Array | Int16Array, x: number, z: number) => field[idx(Math.max(0, Math.min(N - 1, Math.floor(x))), Math.max(0, Math.min(N - 1, Math.floor(z))))];
  const metresAt = (x: number, z: number) => at(metres, x, z);
  /**
   * Height of the rock pillar a column belongs to, and whether that pillar is rock. A massif of the reference is one
   * steep, calm shape: the rock takes the closed shape of whole massifs and raises it over their valley floors,
   * and leaves out what is finer. Rock or meadow is settled per bundle of four pillars, so that the rock comes in
   * whole pieces, and only away from the valley floors, which stay green.
   */
  const pillar = (x: number, z: number): [number, boolean] => {
    const [px, pz] = rockPillar(x, z), cx = (px + 0.5) * 2, cz = (pz + 0.5) * 2 - px, bx = Math.floor(px / 2) * 2 + 1;
    return [at(base, cx, cz) + PEAK * (at(massif, cx, cz) - at(base, cx, cz)), at(massif, bx * 2, (Math.floor(pz / 2) * 2 + 1) * 2 - bx) > ROCK_FROM && at(away, bx * 2, (Math.floor(pz / 2) * 2 + 1) * 2 - bx) >= FOOT];
  };

  const g: Ground = { h: new Int16Array(N * N), mat: new Uint8Array(N * N), wet: new Uint8Array(N * N), shore: new Uint8Array(N * N), occ: new Float32Array(N * N), surf: new Float32Array(N * N).fill(SEA_Y) };
  /** blocks above the plain of every column's own ground (water: of its surface) */
  const level = new Int16Array(N * N);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = idx(x, z);
    if (kind[i] !== Water.Land) { level[i] = kind[i] === Water.Lake ? Math.round(levelOf(metres[i])) : 0; continue; }
    const [m, rock] = pillar(x, z);
    if (!rock) { level[i] = Math.round(levelOf(metres[i])); g.mat[i] = Mat.Grass; continue; }
    // the rock rises pillar by pillar, as the massifs of the probe do: bundles of pillars rise and fall together,
    // each pillar a little on its own; the summits step in twos, so that their pillars join into cubes; single
    // columns step down or stand back as dark slots
    const [px, pz] = rockPillar(x, z), bundle = (hash2(Math.floor(px / 2), Math.floor(pz / 2), 11) - 0.5) * 1.6, own = (hash2(px, pz, 17) - 0.5) * 0.9;
    const piece = hash2(x, z, 19), step = piece < 0.02 ? -3 : piece < 0.06 ? -1 : 0;
    level[i] = Math.max(1, (m > SNOW_LINE ? Math.round((levelOf(m) + bundle) / 2) * 2 : Math.round(levelOf(m) + bundle + own)) + step); g.mat[i] = Mat.Rock;
  }

  // rivers: each line is walked from its high end, never rising again, and cut one block into the valley floor
  const river = new Int16Array(N * N).fill(-1);
  for (const r of region.rivers) {
    const half = r.rank <= 6 ? 1.5 : 1.0, steps: [number, number, number][] = [];
    for (let k = 0; k + 1 < r.pts.length; k++) {
      const a = toGround(...r.pts[k]), b = toGround(...r.pts[k + 1]), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = 0; t < len; t += 0.5) {
        const x = a[0] + ((b[0] - a[0]) * t) / len, z = a[1] + ((b[1] - a[1]) * t) / len;
        if (!inGrid(Math.floor(x), Math.floor(z))) continue;
        // the valley floor: the lowest ground within a block of the line, which is drawn more coarsely than the heights
        let floor = Infinity;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (inGrid(Math.floor(x) + dx, Math.floor(z) + dz)) floor = Math.min(floor, Math.round(levelOf(metresAt(x + dx, z + dz))));
        steps.push([x, z, floor]);
      }
    }
    if (steps.length < 2) continue;
    if (steps[0][2] < steps[steps.length - 1][2]) steps.reverse();
    let low = Infinity;
    for (const [x, z, floor] of steps) {
      low = Math.min(low, floor);
      for (let cz = Math.floor(z - half - 1); cz <= z + half + 1; cz++) for (let cx = Math.floor(x - half - 1); cx <= x + half + 1; cx++) {
        if (!inGrid(cx, cz) || kind[idx(cx, cz)] !== Water.Land) continue;
        const i = idx(cx, cz), d = Math.hypot(cx + 0.5 - x, cz + 0.5 - z);
        if (d <= half) river[i] = river[i] < 0 ? low : Math.min(river[i], low);
        // the banks: no ground beside the water stands more than a step above it
        else if (d <= half + 1 && level[i] > low + 1) { level[i] = low + 1; g.mat[i] = Mat.Grass; }
      }
    }
  }
  for (let i = 0; i < N * N; i++) {
    const wet = kind[i] !== Water.Land || river[i] >= 0, lv = river[i] >= 0 ? river[i] : level[i];
    if (!wet) { g.h[i] = LAND_Y + lv; continue; }
    // a river runs just under its banks, so that it shows from the low camera; lakes and the sea lie deeper, as in the probe
    level[i] = lv; g.wet[i] = 1; g.mat[i] = Mat.Bed; g.surf[i] = river[i] >= 0 ? LAND_Y + lv - 0.35 : SEA_Y + lv; g.h[i] = LAND_Y + lv - 2;
  }
  // no dry column lies below the water beside it
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = idx(x, z); if (g.wet[i]) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (!inGrid(x + dx, z + dz)) continue;
      const j = idx(x + dx, z + dz);
      if (g.wet[j] && g.h[i] < LAND_Y + level[j]) g.h[i] = LAND_Y + level[j];
    }
  }
  measureShore(g);
  // the sea bed falls away from the coast, as in the probe
  for (let i = 0; i < N * N; i++) { if (kind[i] === Water.Sea) g.h[i] = Math.max(0, 2 - Math.floor(g.shore[i] / 4)); g.occ[i] = g.wet[i] ? g.surf[i] : g.h[i]; }

  // woods where the forest of 1356 stood, up to the tree line: leafy in the low country, dark conifers towards the heights
  const things = new Batch(), counts: Record<string, number> = { tree: 0 }, r = seeded(41), pitch = 2.4;
  for (let gz = 2; gz < N - 2; gz += pitch) for (let gx = 2; gx < N - 2; gx += pitch) {
    const x = gx + r.range(-1.2, 1.2), z = gz + r.range(-1.2, 1.2), roll = r.next(), conifer = r.next(), i = idx(Math.floor(x), Math.floor(z));
    if (g.wet[i] || g.mat[i] !== Mat.Grass || metres[i] > TREE_LINE) continue;
    const [cx, cy] = toCell(x, z), cover = sample(region, region.forest, cx, cy) / 255;
    if (roll > 0.04 + 0.7 * cover) continue;
    // a tree stands clear of the water and of drops of more than a step
    let fits = true;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const j = idx(Math.floor(x) + dx, Math.floor(z) + dz); if (g.wet[j] || Math.abs(g.h[j] - g.h[i]) > 1) fits = false; }
    if (!fits) continue;
    if (conifer < 0.08 + 0.8 * smooth(500, 1300, metres[i])) { cypress(things, x, g.h[i], z, r); occlude(g, x - 0.6, z - 0.6, x + 0.6, z + 0.6, g.h[i] + 4.2); }
    else { tree(things, x, g.h[i], z, r, cover > 0.5 ? r.range(0.9, 1.4) : r.range(0.85, 1.15)); occlude(g, x - 1.05, z - 1.05, x + 1.05, z + 1.05, g.h[i] + 3.4); }
    counts.tree++;
  }

  const traits: GroundTraits = {
    city: () => false, plaza: () => Infinity, crop: () => null, road: () => Infinity,
    // the low country is sun-bleached, the mountain meadows are green
    bleach: (x, z) => smooth(900, 200, metresAt(x, z)),
    // the snow line stands where the probe's summits begin; bundles of pillars differ a little, so that the line is ragged
    slope: SLOPE,
    summit: (x, z) => { const [px, pz] = rockPillar(x, z); return (pillar(x, z)[0] / SNOW_LINE) * SUMMIT + (hash2(Math.floor(px / 2), Math.floor(pz / 2), 9) - 0.5) * 0.04; },
  };
  const ground = buildTerrain(g, traits, bakedSky), water = buildWater(g), raised = buildWater(g, true);
  counts.triangles = ground.triangles + water.triangles + raised.triangles + things.triangles;
  return { ground, things, water, raised, counts };
}
