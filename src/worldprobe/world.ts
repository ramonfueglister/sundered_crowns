// The real landscape in the look of the probe: heights, coast, lakes and rivers of a region become a ground of columns
// on the probe's grid, with rock, meadow and woods chosen from the real heights and the forest cover of 1356.
// On it stand the towns, villages and fields of 1356 (see settle.ts). North is at the top of the picture. No roads yet.
import { Batch, hash2, noise2, rgb, seeded, smooth } from '../lookprobe/batch';
import { ACACIA, CYPRESS, JUNGLE, LEAVES, PALM, acacia, cypress, palm, tree } from '../lookprobe/blocks';
import { type Ground, type GroundTraits, LAND_Y, Mat, N, SEA_Y, SUMMIT, idx, inGrid, measureShore, occlude, rockPillar } from '../lookprobe/layout';
import type { Shape, StageScene } from '../lookprobe/stage';
import { crowd } from '../figures';
import { type Part, buildTerrain, buildWater } from '../lookprobe/terrain';
import { type Climate, FIELDS_KNOWN, KIND, Land, WOODS_KNOWN, climateAt, snowLineAt, treeLineAt } from './climate';
import { BARE, SNOW_LINE, TINT, TREE_LINE, WOODS, blockOfCell, cellOfBlock, lineShift, paleFrom, rockAt, woodsUntil } from './land';
import { type Region, Water, cellOf, latOf, sample, waterAt } from './region';
import { type Cover, type Woods, coverLand } from './far';
import { type Lot, type Monument, type Settled, type Site, raise, settle } from './settle';
import { type Columns, columnsOf } from './nearground';
import { MONUMENTS, modelOf, styleOf } from '../buildings';

/**
 * The world is laid out in blocks: one block is one cell of the game map (about 0.77 km × cos(latitude), so 0.54 km in
 * the Alps), and the block grid is turned against the map so that north is at the top of the picture. A ground is the
 * square of N × N blocks that starts at world block (ox, oz); of it, the columns of `part` become meshes. What is built
 * on a column depends only on the world around it, never on where the ground begins, so that grounds laid side by side
 * fit together.
 */
export interface Piece { ox: number; oz: number; part: Part }
/** the houses that have fine blocks are kept in cells of this many blocks a side */
export const CELL = 25;
/** A cell of a town: its middle on the ground, its houses as the far view shows them and their lots, and the columns of its paved ground. */
export interface Cell<S extends Shape = Batch> { x: number; z: number; far: S; lots: Lot[]; ground?: Columns }
/** A piece of the world for the stage, with the cells of its towns. */
export interface WorldScene<S extends Shape = Batch> extends StageScene<S> { cells: Cell<S>[] }
/** The window of whole-map cells that the ground starting at world block (ox, oz) needs. */
export function windowOf(ox: number, oz: number): { gx0: number; gy0: number; w: number; h: number } {
  const us: number[] = [], vs: number[] = [];
  for (const [x, z] of [[0, 0], [N, 0], [0, N], [N, N]]) { const [u, v] = cellOfBlock(ox + x, oz + z); us.push(u); vs.push(v); }
  const gx0 = Math.floor(Math.min(...us)) - 2, gy0 = Math.floor(Math.min(...vs)) - 2;
  return { gx0, gy0, w: Math.ceil(Math.max(...us)) + 3 - gx0, h: Math.ceil(Math.max(...vs)) + 3 - gy0 };
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
/** the woods and fields of 1356 end with the game map: over this many map pixels before its east edge (some eight degrees) they give way to what the climate grows */
const LAYERS_FADE = 300;
/** what stands above the valley floors of the massifs is raised by this factor */
const PEAK = 1.3;
/** a valley is where this much land drains through (25 km², in the steps of the region's drainage layer); the rock begins this many blocks from it */
const VALLEY_FROM = 75, FOOT = 4;
/** the sides of the steps of overgrown hills */
const SLOPE = rgb(0x86983c);
/** trees stand on a world grid of this pitch, each moved a little off its point */
const TREE_PITCH = 2.4;
const seedOf = (a: number, b: number, salt: number) => Math.floor(hash2(a, b, salt) * 4294967296);

/**
 * `region` must cover `windowOf(piece.ox, piece.oz)`. `step` is the step of the map the region is taken from: at step z
 * a block is 2^z map cells wide (see tools/worldprobe/build_overviews.py). The land is drawn the same way at every
 * step: the valleys are those of rivers 4^z times the size, and the heights are flattened (by 2^(0.6 z), so that
 * ranges still stand out but do not tower). What stands on it is built house by house and tree by tree at step 0
 * only; from step 1 on it is part of the ground (far.ts). `inhabitants` gives the people of the places (by their
 * index in `places`) for which more is known than the gazetteer says; `models` the monument parts loaded from files.
 */
export function buildWorld(region: Region, piece: Piece, places: readonly Place[], landmarks: readonly Landmark[], bakedSky = true, step = 0, climate: Climate | null = null, inhabitants: ReadonlyMap<number, number> = new Map(), models: ReadonlyMap<string, Batch> = new Map()): WorldScene {
  const wider = 2 ** step, flatter = wider ** 0.6, valleyFrom = Math.min(250, VALLEY_FROM + 32 * step), rockFoot = Math.max(1, Math.round(FOOT / Math.sqrt(wider)));
  const { ox, oz, part } = piece, c0x = region.x0 * region.cells, c0y = region.y0 * region.cells;
  /** region cell under a ground point: east is the picture's right, south its near side */
  const toCell = (x: number, z: number): [number, number] => { const [u, v] = cellOfBlock(x + ox, z + oz); return [u - c0x, v - c0y]; };
  /** ground point of a region cell */
  const toGround = (cx: number, cy: number): [number, number] => { const [wx, wz] = blockOfCell(cx + c0x, cy + c0y); return [wx - ox, wz - oz]; };
  const own = (x: number, z: number) => x >= part.x0 && x < part.x1 && z >= part.z0 && z < part.z1;

  // real height, water class and latitude of every column, taken at its centre; the tree line, the snow line and the
  // foot of the rock follow the latitude
  const metres = new Float32Array(N * N), kind = new Uint8Array(N * N), shift = new Float32Array(N * N), lat = new Float32Array(N * N);
  // the height from which the raised rock is pale and the height up to which the woods grow: by the lines of the
  // place's climate, by its latitude without it
  const snow = new Float32Array(N * N), woodsEnd = new Float32Array(N * N);
  // the kind of land of every column, and whether the woods and fields of 1356 are known there; the borders between the kinds are
  // frayed by a few kilometres, the same at every step
  const land = new Uint8Array(N * N).fill(Land.Temperate | WOODS_KNOWN | FIELDS_KNOWN);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const [cx, cy] = toCell(x + 0.5, z + 0.5), i = idx(x, z);
    metres[i] = sample(region, region.shaped, cx, cy); kind[i] = waterAt(region, cx, cy); lat[i] = latOf(region, cy); shift[i] = lineShift(lat[i]);
    const px = region.x0 + cx / region.cells, py = region.y0 + cy / region.cells;
    snow[i] = climate ? paleFrom(snowLineAt(climate, px, py)) : SNOW_LINE + shift[i];
    woodsEnd[i] = climate ? woodsUntil(treeLineAt(climate, px, py)) : TREE_LINE + shift[i];
    if (climate) {
      const wx = (x + ox) * wider, wz = (z + oz) * wider, fray = 12 / region.cells / wider;
      land[i] = climateAt(climate, region.x0 + (cx + (noise2(wx / 9, wz / 9, 61) - 0.5) * fray) / region.cells, region.y0 + (cy + (noise2(wx / 9, wz / 9, 62) - 0.5) * fray) / region.cells);
    }
  }
  const levelOf = (m: number, i: number) => { const treeLine = TREE_LINE + shift[i]; return (Math.max(0, (Math.min(m, treeLine) - PLAIN) / METRES_PER_BLOCK) + Math.max(0, m - treeLine) / METRES_PER_BLOCK_HIGH) / flatter; };
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
  // VALLEY_FROM square kilometres drain. From them the land is walked outwards ring by ring, and each column is held
  // at least as high as the lowest column of the ring before that it touches, so that every massif rises closed from
  // its valley floor to its divide and the gullies finer than the valleys are filled.
  const rise = new Float32Array(metres), foot = new Float32Array(metres), away = new Int16Array(N * N).fill(-1);
  let ring: number[] = [];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const [cx, cy] = toCell(x + 0.5, z + 0.5), i = idx(x, z);
    const cell = Math.max(0, Math.min(region.h - 1, Math.floor(cy))) * region.w + Math.max(0, Math.min(region.w - 1, Math.floor(cx)));
    if (kind[i] !== Water.Land || region.drainage[cell] >= valleyFrom) { away[i] = 0; ring.push(i); }
  }
  for (let step = 1; ring.length; step++) {
    const next: number[] = [];
    for (const i of ring) {
      const x = i % N, z = (i - x) / N;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (inGrid(x + dx, z + dz) && away[idx(x + dx, z + dz)] < 0) { away[idx(x + dx, z + dz)] = step; next.push(idx(x + dx, z + dz)); }
    }
    for (const j of next) {
      const x = j % N, z = (j - x) / N;
      let from = -1;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!inGrid(x + dx, z + dz)) continue;
        const i = idx(x + dx, z + dz);
        if (away[i] === step - 1 && (from < 0 || rise[i] < rise[from] || (rise[i] === rise[from] && foot[i] < foot[from]))) from = i;
      }
      rise[j] = Math.max(rise[j], rise[from]); foot[j] = foot[from];
    }
    ring = next;
  }
  // the valley floor under every massif, blended where massifs of different valleys meet, and the massifs' closed shape
  const base = averaged(averaged(foot, 2), 2), massif = averaged(rise, 2);
  const cellAt = (x: number, z: number) => idx(Math.max(0, Math.min(N - 1, Math.floor(x))), Math.max(0, Math.min(N - 1, Math.floor(z))));
  const at = (field: Float32Array | Int16Array | Uint8Array, x: number, z: number) => field[cellAt(x, z)];
  const metresAt = (x: number, z: number) => at(metres, x, z);
  /**
   * Height of the bundle of four rock pillars a column belongs to, whether that bundle is rock, and the height of the column's own pillar. A massif of the reference is one
   * steep, calm shape: the rock takes the closed shape of whole massifs and raises it over their valley floors,
   * and leaves out what is finer. Rock or meadow is settled per bundle of four pillars, so that the rock comes in
   * whole pieces, and only away from the valley floors, which stay green.
   */
  const pillar = (x: number, z: number): [number, boolean, number] => {
    const [px, pz] = rockPillar(x + ox, z + oz), bx = Math.floor(px / 2) * 2 + 1, cx = bx * 2 - ox, cz = (Math.floor(pz / 2) * 2 + 1) * 2 - bx - oz;
    const raised = (qx: number, qz: number) => at(base, qx, qz) + PEAK * (at(massif, qx, qz) - at(base, qx, qz));
    return [raised(cx, cz), rockAt(at(massif, cx, cz), at(base, cx, cz), at(shift, cx, cz)) && at(away, cx, cz) >= rockFoot, raised((px + 0.5) * 2 - ox, (pz + 0.5) * 2 - px - oz)];
  };

  const g: Ground = { h: new Int16Array(N * N), mat: new Uint8Array(N * N), wet: new Uint8Array(N * N), shore: new Uint8Array(N * N), occ: new Float32Array(N * N), surf: new Float32Array(N * N).fill(SEA_Y), ox, oz };
  /** blocks above the plain of every column's own ground (water: of its surface) */
  const level = new Int16Array(N * N);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = idx(x, z);
    if (kind[i] !== Water.Land) { level[i] = kind[i] === Water.Lake ? Math.round(levelOf(metres[i], i)) : 0; continue; }
    const [m, rock, mine] = pillar(x, z);
    if (!rock) { level[i] = Math.round(levelOf(metres[i], i)); g.mat[i] = Mat.Grass; continue; }
    // the rock stands in walls, as the massifs of the reference do: a bundle of pillars is one block of rock with one
    // height, so that the faces between bundles are large; the pillars of a bundle lean a step with the slope, one here and there stands a step lower, and
    // single columns stand back as the fine grooves of the walls
    const lot = hash2(...rockPillar(x + ox, z + oz), 17), lower = lot < 0.1 ? 1 : 0, lean = Math.max(-1, Math.min(1, Math.round(levelOf(mine, i) - levelOf(m, i))));
    const single = hash2(x + ox, z + oz, 19), groove = single < 0.03 ? 3 : single < 0.08 ? 1 : 0;
    level[i] = Math.max(1, Math.round(levelOf(m, i)) + lean - lower - groove); g.mat[i] = Mat.Rock;
  }

  // rivers: each line is walked from its high end, never rising again, and cut one block into the valley floor
  const river = new Int16Array(N * N).fill(-1);
  for (const r of region.rivers) {
    // a river is as wide as at the finest step, and never narrower than a block
    const half = Math.max(0.6, (r.rank <= 6 ? 1.5 : 1.0) / wider), steps: [number, number, number][] = [];
    for (let k = 0; k + 1 < r.pts.length; k++) {
      const a = toGround(...r.pts[k]), b = toGround(...r.pts[k + 1]), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = 0; t < len; t += 0.5) {
        const x = a[0] + ((b[0] - a[0]) * t) / len, z = a[1] + ((b[1] - a[1]) * t) / len;
        if (!inGrid(Math.floor(x), Math.floor(z))) continue;
        // the valley floor: the lowest ground within a block of the line, which is drawn more coarsely than the heights
        let floor = Infinity;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (inGrid(Math.floor(x) + dx, Math.floor(z) + dz)) floor = Math.min(floor, Math.round(levelOf(metresAt(x + dx, z + dz), cellAt(x + dx, z + dz))));
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
  const things = new Batch(), counts: Record<string, number> = { tree: 0 }, sites: Site[] = [], monuments: Monument[] = [], all: Site[] = [];
  const onGround = (p: readonly [number, number]) => p[0] >= 2 && p[1] >= 2 && p[0] < N - 2 && p[1] < N - 2;
  places.forEach((p, id) => {
    const site: Site = { id, at: toGround(...cellOf(region, p.lon, p.lat)), size: p.size, pop: inhabitants.get(id) ?? p.pop1356, region: p.region, style: styleOf(p.region) };
    all.push(site);
    if (onGround(site.at)) sites.push(site);
  });
  /** how much the game's layers of 1356 count at a cell: towards the east edge of the game map they give way, so that no line shows where they end */
  const reach = (cx: number) => { const px = region.x0 + cx / region.cells; return smooth(region.mapW, region.mapW - LAYERS_FADE, region.worldW ? ((px % region.worldW) + region.worldW) % region.worldW : px); };
  /** the share of its ground that is fields: none where the fields of 1356 are not known (the Americas, which the game map has as one farmland) */
  const cultivated = (x: number, z: number) => { const [cx, cy] = toCell(x, z); return at(land, x, z) & FIELDS_KNOWN ? sample(region, region.crops, cx, cy) / 255 * reach(cx) : 0; };
  const vines = (x: number, z: number) => 0.25 * smooth(52, 47, at(lat, x, z)) * smooth(700, 400, metresAt(x, z));
  /** whether water lies within `reach` columns of a column */
  const byWater = (x: number, z: number, reach: number) => { for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) if (inGrid(x + dx, z + dz) && g.wet[idx(x + dx, z + dz)]) return true; return false; };
  /** palms line the water of the desert and of the hot steppe */
  const oasis = (i: number) => Math.abs(lat[i]) < 37 && metres[i] < 1200 && ((land[i] & KIND) === Land.Desert || (land[i] & KIND) === Land.Steppe);
  /** the share of its ground the woods cover at a ground point: where the forest of 1356 stood, and beyond its reach where the climate grows them */
  const wooded = (x: number, z: number) => {
    const i = idx(Math.floor(x), Math.floor(z)), here = land[i] & KIND, grown = WOODS[here] ?? 0;
    if (BARE.includes(here)) return 0;
    if (!(land[i] & WOODS_KNOWN)) return grown;
    // towards the east edge of the game map its forest gives way to the climate's
    const [cx, cy] = toCell(x, z);
    return grown + (sample(region, region.forest, cx, cy) / 255 - grown) * reach(cx);
  };
  /** how likely a tree away from the heights and the north is a dark conifer */
  const conifers = (i: number) => ((land[i] & KIND) === Land.Boreal ? 0.85 : 0.08 + 0.8 * smooth(500 + shift[i], 1300 + shift[i], metres[i]));
  /** a farm is built as the place nearest to it builds */
  const farm = (x: number, z: number) => { let best = all[0]; for (const s of all) if (Math.hypot(s.at[0] - x, s.at[1] - z) < Math.hypot(best.at[0] - x, best.at[1] - z)) best = s; return best ?? { region: '', style: styleOf('') }; };
  let settled: Settled | undefined, cover: Cover | undefined;
  if (step > 0) {
    // from farther away the towns, the fields and the woods are part of the ground
    cover = coverLand(g, step, things, sites, { cultivated, vines, farm: (x, z) => farm(x, z).style.house, own, woods: (x, z): Woods | null => {
      const i = idx(x, z), here = land[i] & KIND;
      if (metres[i] > woodsEnd[i]) return null;
      if (oasis(i)) return byWater(x, z, Math.max(1, Math.round(3 / wider))) ? { share: 0.8, crowns: PALM, tall: true } : null;
      const share = wooded(x + 0.5, z + 0.5);
      if (!share) return null;
      if (here === Land.Rainforest) return { share, crowns: JUNGLE, tall: true };
      if (here === Land.Savanna) return { share, crowns: ACACIA, tall: false };
      return hash2(x + ox, z + oz, 76) < conifers(i) ? { share, crowns: CYPRESS, tall: true } : { share, crowns: LEAVES, tall: false };
    } });
  } else {
    // the monuments that stood in 1356 and have a model
    landmarks.forEach((l, id) => {
      const here = toGround(...cellOf(region, l.lon, l.lat));
      if (l.built_state !== 'not_yet_built' && onGround(here)) (MONUMENTS[l.id] ?? []).forEach((m, k) => monuments.push({ id: id * 8 + k, at: [here[0] + m.dx, here[1] + m.dz], model: modelOf(m, models) }));
    });
    const built = settled = settle(g, things, sites, monuments, farm, cultivated, vines, counts, own);

    // woods where the forest of 1356 stood, and beyond its reach where the climate grows them, up to the tree line:
    // leafy in the low country, dark conifers towards the heights and in the north, the crowns of the rain forest, flat
    // trees on the savanna, and palms by the water of the hot dry lands
    for (let tz = Math.ceil((oz + 2) / TREE_PITCH); tz * TREE_PITCH < oz + N - 2; tz++) for (let tx = Math.ceil((ox + 2) / TREE_PITCH); tx * TREE_PITCH < ox + N - 2; tx++) {
      const x = tx * TREE_PITCH - ox + (hash2(tx, tz, 71) - 0.5) * 2.4, z = tz * TREE_PITCH - oz + (hash2(tx, tz, 72) - 0.5) * 2.4;
      if (x < 2 || z < 2 || x >= N - 2 || z >= N - 2) continue;
      const i = idx(Math.floor(x), Math.floor(z)), here = land[i] & KIND;
      if (g.wet[i] || g.mat[i] !== Mat.Grass || metres[i] > woodsEnd[i]) continue;
      // a tree stands clear of the water, of what is built and of drops of more than a step
      let fits = true;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const j = idx(Math.floor(x) + dx, Math.floor(z) + dz); if (g.wet[j] || built.used[j] || Math.abs(g.h[j] - g.h[i]) > 1) fits = false; }
      if (!fits) continue;
      // palms line the water of the desert and of the hot steppe, and stand among the trees of the rain forest
      const palms = oasis(i) && byWater(Math.floor(x), Math.floor(z), 3), lot = hash2(tx, tz, 73);
      if (palms ? lot > 0.3 : lot > (BARE.includes(here) ? 0 : 0.04) + 0.7 * wooded(x, z)) continue;
      const mine = own(Math.floor(x), Math.floor(z)), r = seeded(seedOf(tx, tz, 75)), sort = hash2(tx, tz, 74);
      if (palms || (here === Land.Rainforest && sort < 0.1)) { if (mine) palm(things, x, g.h[i], z, r); occlude(g, x - 0.8, z - 0.8, x + 0.8, z + 0.8, g.h[i] + 4.5); }
      else if (here === Land.Savanna) { if (mine) acacia(things, x, g.h[i], z, r); occlude(g, x - 1.1, z - 1.1, x + 1.1, z + 1.1, g.h[i] + 2.4); }
      else if (here === Land.Rainforest) { if (mine) tree(things, x, g.h[i], z, r, r.range(1.1, 1.6), JUNGLE); occlude(g, x - 1.05, z - 1.05, x + 1.05, z + 1.05, g.h[i] + 4); }
      else if (sort < conifers(i)) { if (mine) cypress(things, x, g.h[i], z, r); occlude(g, x - 0.6, z - 0.6, x + 0.6, z + 0.6, g.h[i] + 4.2); }
      else { if (mine) tree(things, x, g.h[i], z, r, wooded(x, z) > 0.5 ? r.range(0.9, 1.4) : r.range(0.85, 1.15)); occlude(g, x - 1.05, z - 1.05, x + 1.05, z + 1.05, g.h[i] + 3.4); }
      if (mine) counts.tree++;
    }
  }

  const traits: GroundTraits = {
    city: (x, z) => at((settled ?? cover!).town, x, z) === 1, plaza: () => Infinity, road: () => Infinity,
    crop: (x, z) => (settled ? ([null, 'wheat', 'vine'] as const)[at(settled.field, x, z)] : null),
    cover: cover && ((x, z) => { const i = idx(x, z); return cover.has[i] ? { top: [cover.top[i * 3], cover.top[i * 3 + 1], cover.top[i * 3 + 2]], side: [cover.side[i * 3], cover.side[i * 3 + 1], cover.side[i * 3 + 2]], rise: cover.rise[i], share: cover.share[i] } : null; }),
    // the low country is sun-bleached, the mountain meadows are green
    bleach: (x, z) => smooth(900, 200, metresAt(x, z)),
    tint: (x, z) => TINT[at(land, x, z) & KIND] ?? null,
    // the snow line stands where the probe's summits begin; bundles of pillars differ a little, so that the line is ragged
    slope: SLOPE,
    summit: (x, z) => { const [px, pz] = rockPillar(x + ox, z + oz); return (pillar(x, z)[0] / at(snow, x, z)) * SUMMIT + (hash2(Math.floor(px / 2), Math.floor(pz / 2), 9) - 0.5) * 0.04; },
  };
  const ground = buildTerrain(g, traits, bakedSky, part), water = buildWater(g, false, part), raised = buildWater(g, true, part);
  // the houses that have fine blocks and the paved ground stand in cells of their own (the part is whole cells), so
  // that the near view can build them again cell by cell
  const cells: Cell[] = [], across = Math.ceil((part.x1 - part.x0) / CELL), down = Math.ceil((part.z1 - part.z0) / CELL), byCell = new Map<number, Lot[]>();
  for (const l of settled?.lots ?? []) {
    const k = Math.floor((l.x + l.w / 2 - part.x0) / CELL) + across * Math.floor((l.z + l.d / 2 - part.z0) / CELL);
    byCell.set(k, [...(byCell.get(k) ?? []), l]);
  }
  if (settled) for (let k = 0; k < across * down; k++) {
    const x0 = part.x0 + (k % across) * CELL, z0 = part.z0 + Math.floor(k / across) * CELL, lots = byCell.get(k) ?? [];
    const ground = columnsOf(g, x0, z0, CELL, farm(x0 + CELL / 2, z0 + CELL / 2).region, settled.lots) ?? undefined;
    if (!lots.length && !ground) continue;
    const far = new Batch();
    for (const l of lots) raise(far, l, 0);
    cells.push({ x: x0 + CELL / 2, z: z0 + CELL / 2, far, lots, ground });
  }
  counts.triangles = ground.triangles + water.triangles + raised.triangles + things.triangles + cells.reduce((n, c) => n + c.far.triangles, 0);
  // the people of the towns, villages and fields; on the coarser steps a block is wider than a person is tall
  const figures = settled ? crowd(g, settled, own) : undefined;
  if (figures) counts.figures = figures.count;
  return { ground, things, water, raised, figures, cells, counts };
}
