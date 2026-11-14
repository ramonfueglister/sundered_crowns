// The real landscape in the look of the probe: heights, coast, lakes and rivers of a region become a ground of columns
// on the probe's grid, with rock, meadow and woods chosen from the real heights and the forest cover of 1356.
// On it stand the towns, villages and fields of 1356 (see settle.ts). North is at the top of the picture. No roads yet.
import { Batch, hash2, rgb, seeded, smooth } from '../lookprobe/batch';
import { cypress, tree } from '../lookprobe/blocks';
import { type Ground, type GroundTraits, LAND_Y, Mat, N, NEAR, RIGHT, SEA_Y, SUMMIT, idx, inGrid, measureShore, occlude, rockPillar } from '../lookprobe/layout';
import type { StageScene } from '../lookprobe/stage';
import { buildTerrain, buildWater } from '../lookprobe/terrain';
import { type Region, Water, cellOf, sample, waterAt } from './region';
import { type Monument, type Site, settle } from './settle';
import { MONUMENTS, styleOf } from './styles';

export interface WorldView {
  /** the place at the middle of the ground, in degrees */
  lon: number; lat: number;
  /** blocks per cell of the region */
  perCell: number;
}
/** A place of the gazetteer (data/content/gazetteer.json). */
export interface Place { lon: number; lat: number; size: number; pop1356: number | null; region: string }
/** A monument of data/content/landmarks.json. */
export interface Landmark { id: string; lon: number; lat: number; built_state: string }

/**
 * How real heights become blocks. The plains stay level, as in the reference; above them one block stands for
 * `METRES_PER_BLOCK`, and above the tree line for `METRES_PER_BLOCK_HIGH`, so that the peaks stand out of the high
 * country as the massifs of the reference do. The mountains come out several times steeper than they are (a diorama,
 * not a relief map).
 */
const PLAIN = 150, METRES_PER_BLOCK = 165, METRES_PER_BLOCK_HIGH = 100;
/** above this no trees grow and the heights are stretched; above the snow line (of the raised rock) the rock is pale */
const TREE_LINE = 1900, SNOW_LINE = 2530;
/**
 * These heights hold in the Alps, at 46° north. Towards the pole the tree line sinks by about 60 m a degree (some
 * 1000 m in southern Norway, 500 m in the far north), towards the south it rises to about 2300 m; the snow line and
 * the foot of the rock go with it. A rule of thumb for the mainland: on the ocean's edge (Scotland, Iceland) the real
 * tree line lies lower still.
 */
const lineShift = (lat: number) => Math.min(400, Math.max(-1500, (46 - lat) * 60));
/** the massifs are rock from this height upwards; what stands above their valley floors is raised by this factor */
const ROCK_FROM = 1500, PEAK = 1.3;
/** a valley is where this much land drains through (25 km², in the steps of the region's drainage layer); the rock begins this many blocks from it */
const VALLEY_FROM = 75, FOOT = 4;
/** the sides of the steps of overgrown hills */
const SLOPE = rgb(0x86983c);

export function buildWorld(region: Region, view: WorldView, places: readonly Place[], landmarks: readonly Landmark[], bakedSky = true): StageScene {
  const shift = lineShift(view.lat), treeLine = TREE_LINE + shift, snowLine = SNOW_LINE + shift, rockFrom = Math.max(300, ROCK_FROM + shift);
  const levelOf = (metres: number) => Math.max(0, (Math.min(metres, treeLine) - PLAIN) / METRES_PER_BLOCK) + Math.max(0, metres - treeLine) / METRES_PER_BLOCK_HIGH;
  const C = N / 2, perBlock = 1 / view.perCell, [c0x, c0y] = cellOf(region, view.lon, view.lat);
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
    metres[idx(x, z)] = sample(region, region.shaped, cx, cy); kind[idx(x, z)] = waterAt(region, cx, cy);
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
  const at = (field: Float32Array | Int16Array | Uint8Array, x: number, z: number) => field[idx(Math.max(0, Math.min(N - 1, Math.floor(x))), Math.max(0, Math.min(N - 1, Math.floor(z))))];
  const metresAt = (x: number, z: number) => at(metres, x, z);
  /**
   * Height of the bundle of four rock pillars a column belongs to, whether that bundle is rock, and the height of the column's own pillar. A massif of the reference is one
   * steep, calm shape: the rock takes the closed shape of whole massifs and raises it over their valley floors,
   * and leaves out what is finer. Rock or meadow is settled per bundle of four pillars, so that the rock comes in
   * whole pieces, and only away from the valley floors, which stay green.
   */
  const pillar = (x: number, z: number): [number, boolean, number] => {
    const [px, pz] = rockPillar(x, z), bx = Math.floor(px / 2) * 2 + 1, cx = bx * 2, cz = (Math.floor(pz / 2) * 2 + 1) * 2 - bx;
    const raised = (qx: number, qz: number) => at(base, qx, qz) + PEAK * (at(massif, qx, qz) - at(base, qx, qz));
    return [raised(cx, cz), at(massif, cx, cz) > rockFrom && at(away, cx, cz) >= FOOT, raised((px + 0.5) * 2, (pz + 0.5) * 2 - px)];
  };

  const g: Ground = { h: new Int16Array(N * N), mat: new Uint8Array(N * N), wet: new Uint8Array(N * N), shore: new Uint8Array(N * N), occ: new Float32Array(N * N), surf: new Float32Array(N * N).fill(SEA_Y) };
  /** blocks above the plain of every column's own ground (water: of its surface) */
  const level = new Int16Array(N * N);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = idx(x, z);
    if (kind[i] !== Water.Land) { level[i] = kind[i] === Water.Lake ? Math.round(levelOf(metres[i])) : 0; continue; }
    const [m, rock, own] = pillar(x, z);
    if (!rock) { level[i] = Math.round(levelOf(metres[i])); g.mat[i] = Mat.Grass; continue; }
    // the rock stands in walls, as the massifs of the reference do: a bundle of pillars is one block of rock with one
    // height, so that the faces between bundles are large; the pillars of a bundle lean a step with the slope, one here and there stands a step lower, and
    // single columns stand back as the fine grooves of the walls
    const lot = hash2(...rockPillar(x, z), 17), lower = lot < 0.1 ? 1 : 0, lean = Math.max(-1, Math.min(1, Math.round(levelOf(own) - levelOf(m))));
    const piece = hash2(x, z, 19), groove = piece < 0.03 ? 3 : piece < 0.08 ? 1 : 0;
    level[i] = Math.max(1, Math.round(levelOf(m)) + lean - lower - groove); g.mat[i] = Mat.Rock;
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

  // towns, villages and fields: the places that fall on the ground, and the share of the land under the plough.
  // Vineyards are a quarter of the fields of the warm low country and thin out to none by 52° north (a rule of thumb).
  const things = new Batch(), counts: Record<string, number> = { tree: 0 }, sites: Site[] = [], monuments: Monument[] = [];
  const onGround = (p: readonly [number, number]) => p[0] >= 2 && p[1] >= 2 && p[0] < N - 2 && p[1] < N - 2;
  let nearest: Site | null = null;
  for (const p of places) {
    const at = toGround(...cellOf(region, p.lon, p.lat)), site = { at, size: p.size, pop: p.pop1356, style: styleOf(p.region) };
    if (onGround(at)) sites.push(site);
    if (!nearest || Math.hypot(at[0] - C, at[1] - C) < Math.hypot(nearest.at[0] - C, nearest.at[1] - C)) nearest = site;
  }
  // the monuments that stood in 1356 and have a model
  for (const l of landmarks) {
    const at = toGround(...cellOf(region, l.lon, l.lat));
    if (l.built_state !== 'not_yet_built' && onGround(at)) for (const part of MONUMENTS[l.id] ?? []) monuments.push({ at: [at[0] + part.dx, at[1] + part.dz], model: part.model });
  }
  // the farms are built as the place nearest the middle of the ground builds
  const settled = settle(g, things, sites, monuments, (nearest?.style ?? styleOf('')).house, (x, z) => sample(region, region.crops, ...toCell(x, z)) / 255,
    (x, z) => 0.25 * smooth(52, 47, view.lat) * smooth(700, 400, metresAt(x, z)), counts);

  // woods where the forest of 1356 stood, up to the tree line: leafy in the low country, dark conifers towards the heights
  const r = seeded(41), pitch = 2.4;
  for (let gz = 2; gz < N - 2; gz += pitch) for (let gx = 2; gx < N - 2; gx += pitch) {
    const x = gx + r.range(-1.2, 1.2), z = gz + r.range(-1.2, 1.2), roll = r.next(), conifer = r.next(), i = idx(Math.floor(x), Math.floor(z));
    if (g.wet[i] || g.mat[i] !== Mat.Grass || metres[i] > treeLine) continue;
    const [cx, cy] = toCell(x, z), cover = sample(region, region.forest, cx, cy) / 255;
    if (roll > 0.04 + 0.7 * cover) continue;
    // a tree stands clear of the water and of drops of more than a step
    let fits = true;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const j = idx(Math.floor(x) + dx, Math.floor(z) + dz); if (g.wet[j] || settled.used[j] || Math.abs(g.h[j] - g.h[i]) > 1) fits = false; }
    if (!fits) continue;
    if (conifer < 0.08 + 0.8 * smooth(500 + shift, 1300 + shift, metres[i])) { cypress(things, x, g.h[i], z, r); occlude(g, x - 0.6, z - 0.6, x + 0.6, z + 0.6, g.h[i] + 4.2); }
    else { tree(things, x, g.h[i], z, r, cover > 0.5 ? r.range(0.9, 1.4) : r.range(0.85, 1.15)); occlude(g, x - 1.05, z - 1.05, x + 1.05, z + 1.05, g.h[i] + 3.4); }
    counts.tree++;
  }

  const traits: GroundTraits = {
    city: (x, z) => at(settled.town, x, z) === 1, plaza: () => Infinity, road: () => Infinity,
    crop: (x, z) => ([null, 'wheat', 'vine'] as const)[at(settled.field, x, z)],
    // the low country is sun-bleached, the mountain meadows are green
    bleach: (x, z) => smooth(900, 200, metresAt(x, z)),
    // the snow line stands where the probe's summits begin; bundles of pillars differ a little, so that the line is ragged
    slope: SLOPE,
    summit: (x, z) => { const [px, pz] = rockPillar(x, z); return (pillar(x, z)[0] / snowLine) * SUMMIT + (hash2(Math.floor(px / 2), Math.floor(pz / 2), 9) - 0.5) * 0.04; },
  };
  const ground = buildTerrain(g, traits, bakedSky), water = buildWater(g), raised = buildWater(g, true);
  counts.triangles = ground.triangles + water.triangles + raised.triangles + things.triangles;
  return { ground, things, water, raised, counts };
}
