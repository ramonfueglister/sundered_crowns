// The real landscape in the look of the probe: heights, coast, lakes and rivers of a region become a ground of columns
// on the probe's grid, with rock, meadow and woods chosen from the real heights and the forest of the world's start
// year (forest.ts; the forest cover of 1356 for a year without one).
// On it stand the towns and villages (see settle.ts) and the fields the simulation has cultivated (arable.ts). North is at the top of the picture. No roads yet.
import { Batch, hash2, noise2, rgb, seeded, shade, smooth } from '../lookprobe/batch';
import { ACACIA, CYPRESS, JUNGLE, LEAVES, PALM, acacia, cypress, palm, tree } from '../lookprobe/blocks';
import { type Ground, type GroundTraits, LAND_Y, Mat, N, SEA_Y, SUMMIT, idx, inGrid, measureShore, occlude, rockPillar } from '../lookprobe/layout';
import type { Shape, StageScene } from '../lookprobe/stage';
import { crowd } from '../figures';
import { type Part, WATER_SHALLOW, buildTerrain, buildWater } from '../lookprobe/terrain';
import { buildShore } from '../lookprobe/shore';
import { type Climate, FIELDS_KNOWN, KIND, Land, WOODS_KNOWN, climateAt, snowLineAt, treeLineAt } from './climate';
import { type Arable, arableAt } from './arable';
import { type Forest, WOOD, conifersAt, forestAt, leanOf, stand, tilth } from './forest';
import { type Rural, ruralAt } from './rural';
import type { TownParcels } from './lots';
import { HAMLET_TURN, type HamletLands, hamletAt, hamletsOf } from './hamlets';
import { BARE, FINER, FINER_STEPS, SNOW_LINE, TINT, TREE_LINE, WOODS, blockOfCell, cellOfBlock, lineShift, paleFrom, rockAt, woodsUntil } from './land';
import { type Region, Water, cellOf, latOf, sample, waterAt } from './region';
import { type Cover, type Woods, coverLand, lotFill } from './far';
import { unshade } from './mean';
import { FARMS, FIELD_GROUND, LOT_BLOCKS, LOT_FILL, type Lot, type Monument, PEOPLE_PER_PERSON, type Settled, type Site, type Survey, type Told, farmsFor, firstHalf, raise, settle } from './settle';
import { type Columns, columnsOf } from './nearground';
import { MONUMENTS, bridge, m, modelOf, styleOf } from '../buildings';
import { ROAD_KINDS, type Road, relaxPoints, roadsIn, wayOnGround } from './roads';
import { Matrix4 } from 'three';

/**
 * The world is laid out in blocks: one block of the finest step is a part of a cell of the game map's data (FINER
 * to a cell, land.ts: about 0.38 km × cos(latitude), so 0.26 km in the Alps), and the block grid is turned against the map so
 * that north is at the top of the picture. A ground is the
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
 * How real heights become blocks as wide as a cell of the data. The plains stay level, as in the reference; above
 * them one block stands for `METRES_PER_BLOCK`, and above the tree line for `METRES_PER_BLOCK_HIGH`, so that the
 * peaks stand out of the high country as the massifs of the reference do. Finer blocks stand for fewer metres (see
 * buildWorld). The mountains come out steeper than they are (a diorama, not a relief map): on the finest blocks
 * about twice as steep.
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
/**
 * half the width of a great river (rank 6 or less) and of the others, in cells of the land's data: some 500 m and
 * 300 m, more than most were, so that they show from the low camera; never less than a block
 */
const RIVER_HALF = 0.5, BROOK_HALF = 0.3;
/**
 * From afar a block is wider than a river. A river narrower than STREAM_BELOW blocks is then no row of water blocks
 * (which made a brook many times its width, until the next step dropped it at once) but colours the blocks it runs
 * through: by its width as a share of the block, STREAM_SEEN times that for the banks that show with it, and never
 * less than STREAM_LEAST, so that its line can be followed. The greatest rivers of a step stay water: by the data's
 * step (1 is the first coarser than the land's cells) those of at most this rank, the rivers that are still there
 * two steps farther out (tools/worldprobe/build_overviews.py RANK).
 */
const STREAM_BELOW = 0.4, STREAM_SEEN = 1.5, STREAM_LEAST = 0.35, STREAM_RANK: Record<number, number> = { 1: 8, 2: 6, 3: 5, 4: 4, 5: 3, 6: 2, 7: 2 };
/** trees stand on a world grid of this pitch, each moved a little off its point */
const TREE_PITCH = 2.4;
/** what far.ts lays on a column (far.ts KINDS) that stands on the ground: houses, walls, great buildings, crops and woods; fallow soil is the ground's own */
const STANDS: ReadonlySet<number> = new Set([1, 2, 3, 5, 6, 7, 8, 9]);
/** of the places for a tree, this share carries one on the open land (single trees), and this much more inside a wood: the woods stand closed, the land between them is clear */
const STRAY_TREES = 0.01, CLOSED = 0.88;
/** the ground takes the colour of a path up to about this many blocks from its line (lookprobe/terrain.ts topColor): a way's band edge is put there */
const ROAD_SHOWS = 1.65;
/** from afar a way's band is at least this many blocks to each side of its line, by kind (track, road, highway) */
const FAR_HALF = [0.35, 0.45, 0.55];
/** from afar the cover of a block is taken off where its middle lies within this many blocks of a way's band (inside it when negative) */
const FAR_CLEAR = 0.2;
/** blocks to a way where none is near (finite, so that the corners can be blended) */
const FAR_FROM_ROADS = 1e4;
/** the surface of a way at the finest step lies this far over the averaged ground, and its verges reach this far down; its colours by kind (track, road, highway): beaten earth, the busier ways paler with gravel */
const RIBBON_LIFT = 0.08, RIBBON_SKIRT = 1.5, RIBBON = [rgb(0x9c7f52), rgb(0xae9266), rgb(0xbca278)] as const;
/** a way's height is the ground's under its line averaged over this many blocks before and after */
const ROAD_EVEN = 6;
/** the path a way finds over the columns is relaxed over this many blocks (roads.ts relaxPoints), so that it bends instead of stepping by 45 degrees */
const WAY_SIGMA = 4;
/** km to a degree of longitude at the equator */
const KM_PER_DEGREE = 111.32;
/** the ids of the hamlets, above those of the gazetteer's places: 256 to a town */
const HAMLET_IDS = 1 << 20;
/**
 * In how many courses the fields are tilled: in three (winter corn, spring corn, fallow), so that one field in
 * three lies fallow in a year, grazed until it is ploughed again; in two (corn, fallow) round the Mediterranean,
 * whose dry summers bear no spring corn (Slicher van Bath 1963, The Agrarian History of Western Europe, on the two-
 * and three-course rotations). A rule: in the north two courses stood beside three in 1291.
 */
const COURSES = 3, COURSES_DRY = 2;
/** of the land the game's layer of 1356 calls cultivated this share is ploughed ground: as much as was drawn of it before the simulation's arable */
const FIELDS_1356 = 0.3;
/** a river's water lies this far under its banks */
const RIVER_UNDER = 0.22;
const seedOf = (a: number, b: number, salt: number) => Math.floor(hash2(a, b, salt) * 4294967296);

/**
 * Makes clean terraces of the overgrown land: heights rounded column by column leave single columns standing a step
 * up or down and fray every edge where the land lies near a step. A step of the grass land stays only where it is
 * three columns wide: first what stands out narrower than that is taken down to the ground round it, then what
 * lies in narrower than that is filled up to it (an opening and a closing of the heights, each over a column and
 * its eight neighbours). The rock and the water keep their heights and count for nothing.
 */
export function terrace(level: Int16Array, mat: Uint8Array) {
  const pass = (from: Int16Array, up: boolean) => {
    const to = new Int16Array(from);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      if (mat[idx(x, z)] !== Mat.Grass) continue;
      let v = from[idx(x, z)];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!inGrid(x + dx, z + dz) || mat[idx(x + dx, z + dz)] !== Mat.Grass) continue;
        const o = from[idx(x + dx, z + dz)];
        if (up ? o > v : o < v) v = o;
      }
      to[idx(x, z)] = v;
    }
    return to;
  };
  level.set(pass(pass(pass(pass(level, false), true), true), false));
}

/**
 * `region` must cover `windowOf(piece.ox, piece.oz)` in the blocks of `step`: at step s a block is 2^s finest blocks
 * wide, and so 2^(s − FINER_STEPS) cells of the land's data (see tools/worldprobe/build_overviews.py; the steps finer
 * than the data are drawn from its finest cells, region.ts). The land is drawn the same way at every step: the valleys
 * are those of rivers 4^z times the size on the data's step z, and the heights are flattened by 2^0.6 for every
 * doubling of a block's width (so that ranges still stand out but do not tower, and stand out the more steeply the
 * finer the blocks). What stands on it is built house by house and tree by tree at step 0
 * only; from step 1 on it is part of the ground (far.ts). `inhabitants` gives the people of the places (by their
 * index in `places`) for which more is known than the gazetteer says; `models` the monument parts loaded from files;
 * `forest` the forest of the world's start year, where one was made for it (forest.ts); `rural` the people on the
 * land of that year (rural.ts). With `hamlets` (hamlets.ts) only what the simulation holds persons for stands in the
 * world: its towns, their hamlets before the walls, and the fields round them. With `parcels` (lots.ts) the houses of
 * a town stand on the parcels of its families. `survey` is asked for the building ground of every town (settle.ts);
 * then nothing is drawn. With `mean` the ground of a coarser step is covered by what the finer step shows there
 * (mean.ts) instead of what far.ts lays out. `roads`: the ways of the world's start year (roads.ts), drawn on the
 * ground.
 */
export function buildWorld(region: Region, piece: Piece, places: readonly Place[], landmarks: readonly Landmark[], bakedSky = true, step = 0, climate: Climate | null = null, inhabitants: ReadonlyMap<number, number> = new Map(), models: ReadonlyMap<string, Batch> = new Map(), forest: Forest | null = null, rural: Rural | null = null, arable: Arable | null = null, hamlets: HamletLands | null = null, parcels: TownParcels | null = null, survey?: Survey, mean: Cover | null = null, told?: Told, roads: readonly Road[] | null = null): WorldScene {
  // a block's width in cells of the data: the rules of the land were made for those cells
  const cell = 2 ** (step - FINER_STEPS), flatter = cell ** 0.6, valleyFrom = Math.min(250, VALLEY_FROM + 32 * Math.max(0, step - FINER_STEPS)), rockFoot = Math.max(1, Math.round(FOOT / Math.sqrt(cell)));
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
  // the share of conifers among the trees of the year's forest, -1 where it is not known
  const dark = forest?.conifers ? new Float32Array(N * N) : null;
  // the kind of land of every column, and whether the woods and fields of 1356 are known there; the borders between the kinds are
  // frayed by a few kilometres, the same at every step
  const land = new Uint8Array(N * N).fill(Land.Temperate | WOODS_KNOWN | FIELDS_KNOWN);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const [cx, cy] = toCell(x + 0.5, z + 0.5), i = idx(x, z);
    metres[i] = sample(region, region.shaped, cx, cy); kind[i] = waterAt(region, cx, cy); lat[i] = latOf(region, cy); shift[i] = lineShift(lat[i]);
    const px = region.x0 + cx / region.cells, py = region.y0 + cy / region.cells;
    snow[i] = climate ? paleFrom(snowLineAt(climate, px, py)) : SNOW_LINE + shift[i];
    if (dark) dark[i] = conifersAt(forest!, px, py) ?? -1;
    woodsEnd[i] = climate ? woodsUntil(treeLineAt(climate, px, py)) : TREE_LINE + shift[i];
    if (climate) {
      // frayed by three blocks, and on the steps finer than the data by three of its cells
      const wx = (x + ox) * cell, wz = (z + oz) * cell, fray = 3 / Math.min(1, cell);
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
  terrace(level, g.mat);

  // rivers: a river's water lies at its bed, which is settled beforehand for the whole river (tools/worldprobe/beds.py):
  // in its valley floor, never rising on its way down. So a river's level depends on the river alone and not on
  // where the ground begins, and the pieces of the world meet at one level.
  const river = new Int16Array(N * N).fill(-1), stream = new Float32Array(N * N);
  for (const r of region.rivers) {
    const wide = (2 * (r.rank <= 6 ? RIVER_HALF : BROOK_HALF)) / cell;
    // a river much narrower than a block, and not one of the step's great ones, is no water of its own: it colours
    // the blocks it runs through as far as it covers them (below, on the cover), and cuts no valley
    if (wide < STREAM_BELOW && r.rank > (STREAM_RANK[step - FINER_STEPS] ?? 0)) {
      const share = Math.min(1, Math.max(STREAM_LEAST, wide * STREAM_SEEN));
      for (let k = 0; k + 1 < r.pts.length; k++) {
        const a = toGround(...r.pts[k]), b = toGround(...r.pts[k + 1]), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let t = 0; t <= len; t += 0.5) {
          const x = Math.floor(a[0] + ((b[0] - a[0]) * t) / Math.max(len, 1e-6)), z = Math.floor(a[1] + ((b[1] - a[1]) * t) / Math.max(len, 1e-6));
          if (inGrid(x, z) && kind[idx(x, z)] === Water.Land) stream[idx(x, z)] = Math.max(stream[idx(x, z)], share);
        }
      }
      continue;
    }
    // a river is as wide as at the finest step, and never narrower than a block
    const half = Math.max(0.6, wide / 2), between = new Map((r.mid ?? []).map((m) => [m[0], m]));
    for (let k = 0; k + 1 < r.pts.length; k++) {
      const a = toGround(...r.pts[k]), b = toGround(...r.pts[k + 1]), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // the bed between the two points: straight from one to the other, or through the heights given between them
      const mid = between.get(k), parts = mid ? mid.length : 1;
      const bedAt = (j: number) => (j <= 0 ? r.bed![k] : j >= parts ? r.bed![k + 1] : mid![j]);
      for (let t = 0; t < len; t += 0.5) {
        const x = a[0] + ((b[0] - a[0]) * t) / len, z = a[1] + ((b[1] - a[1]) * t) / len;
        if (!inGrid(Math.floor(x), Math.floor(z))) continue;
        let low = Infinity;
        if (r.bed) {
          const f = (t / len) * parts, j = Math.min(parts - 1, Math.floor(f));
          low = Math.round(levelOf(bedAt(j) + (bedAt(j + 1) - bedAt(j)) * (f - j), cellAt(x, z)));
        } else {
          // a river without a bed (a region cut for a trial, before its overviews are built) lies on its valley floor:
          // the lowest ground within a block of the line, which is drawn more coarsely than the heights
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (inGrid(Math.floor(x) + dx, Math.floor(z) + dz)) low = Math.min(low, Math.round(levelOf(metresAt(x + dx, z + dz), cellAt(x + dx, z + dz))));
        }
        for (let cz = Math.floor(z - half - 1); cz <= z + half + 1; cz++) for (let cx = Math.floor(x - half - 1); cx <= x + half + 1; cx++) {
          if (!inGrid(cx, cz) || kind[idx(cx, cz)] !== Water.Land) continue;
          const i = idx(cx, cz), d = Math.hypot(cx + 0.5 - x, cz + 0.5 - z);
          if (d <= half) river[i] = river[i] < 0 ? low : Math.min(river[i], low);
          // the banks: no ground beside the water stands more than a step above it
          else if (d <= half + 1 && level[i] > low + 1) { level[i] = low + 1; g.mat[i] = Mat.Grass; }
        }
      }
    }
  }
  // a river is one water: where two of its columns touch only at a corner, the lower of the two columns between them is water too
  for (let z = 0; z + 1 < N; z++) for (let x = 0; x + 1 < N; x++) for (const [a, c, p, q] of [[idx(x, z), idx(x + 1, z + 1), idx(x + 1, z), idx(x, z + 1)], [idx(x + 1, z), idx(x, z + 1), idx(x, z), idx(x + 1, z + 1)]]) {
    if (river[a] < 0 || river[c] < 0 || river[p] >= 0 || river[q] >= 0 || kind[p] !== Water.Land || kind[q] !== Water.Land) continue;
    river[level[p] <= level[q] ? p : q] = Math.max(river[a], river[c]);
  }
  for (let i = 0; i < N * N; i++) {
    const wet = kind[i] !== Water.Land || river[i] >= 0, lv = river[i] >= 0 ? river[i] : level[i];
    if (!wet) { g.h[i] = LAND_Y + lv; continue; }
    // a river runs just under its banks, so that it shows from the low camera; lakes and the sea lie deeper, as in the probe
    level[i] = lv; g.wet[i] = 1; g.mat[i] = Mat.Bed; g.surf[i] = river[i] >= 0 ? LAND_Y + lv - RIVER_UNDER : SEA_Y + lv; g.h[i] = LAND_Y + lv - 2;
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

  // the ways: lines on the ground (roads.ts). At the finest step a band of beaten earth `half` blocks to each side of
  // the line, which the ground's colour takes (terrain.ts `road`), with a bridge where it crosses a river; from afar
  // the same band, never narrower than FAR_HALF blocks, with the woods taken off it.
  const ways: { k: number; pts: [number, number][]; ys?: Float64Array }[] = [];
  if (roads) {
    const px0 = region.x0, py0 = region.y0, pw = region.w / region.cells, ph = region.h / region.cells;
    for (const r of roadsIn(roads, px0 - 1, py0 - 1, px0 + pw + 1, py0 + ph + 1)) {
      if (step > ROAD_KINDS[r.k].until) continue;
      const pts: [number, number][] = [];
      for (let k = 0; k < r.p.length; k += 2) pts.push(toGround((r.p[k] - px0) * region.cells, (r.p[k + 1] - py0) * region.cells));
      ways.push({ k: r.k, pts });
    }
  }
  // at the finest step each way finds its path over the columns between pins of its line (roads.ts wayOnGround)
  if (step === 0 && ways.length) {
    const water = Uint8Array.from(g.wet, (w, i) => (w ? (kind[i] === Water.Land ? 1 : 2) : 0)), rocky = (i: number) => g.mat[i] === Mat.Rock;
    for (const way of ways) way.pts = relaxPoints(wayOnGround(way.pts, ox, oz, N, g.h, rocky, water), WAY_SIGMA, 1);
  }
  /**
   * Blocks to the edge of the nearest way's band (negative inside it) at the corners of the columns, at the finest
   * step, and the height the way has there. A way runs smoothly over the land: its height is that of the ground
   * under its line, averaged over ROAD_EVEN blocks before and after, so that it climbs a hill as a ramp and is cut
   * into the rock of the mountains as a ledge.
   */
  const roadEdge = ways.length && !(step === 1 && mean) ? new Float32Array((N + 1) * (N + 1)).fill(FAR_FROM_ROADS) : null, roadY = roadEdge ? new Float32Array((N + 1) * (N + 1)) : null;
  if (roadEdge && roadY) for (const way of ways) {
    const { k, pts } = way;
    // from afar a way is never narrower than FAR_HALF, so that its line can be followed
    const half = step === 0 ? ROAD_KINDS[k].half : Math.max(ROAD_KINDS[k].half / 2 ** step, FAR_HALF[k]), reach = half + 3;
    // the ground under the line, and the length along it
    const at = new Float64Array(pts.length), along = new Float64Array(pts.length), known = new Uint8Array(pts.length);
    pts.forEach(([x, z], q) => {
      if (q) along[q] = along[q - 1] + Math.hypot(x - pts[q - 1][0], z - pts[q - 1][1]);
      const cx = Math.floor(x), cz = Math.floor(z);
      if (inGrid(cx, cz) && !g.wet[idx(cx, cz)]) { at[q] = g.h[idx(cx, cz)]; known[q] = 1; }
    });
    const even = new Float64Array(pts.length);
    for (let q = 0, lo = 0, hi = 0, sum = 0, n = 0; q < pts.length; q++) {
      while (hi < pts.length && along[hi] - along[q] <= ROAD_EVEN) { if (known[hi]) { sum += at[hi]; n++; } hi++; }
      while (along[q] - along[lo] > ROAD_EVEN) { if (known[lo]) { sum -= at[lo]; n--; } lo++; }
      even[q] = n ? sum / n : at[q];
    }
    way.ys = even;
    for (let s = 0; s + 1 < pts.length; s++) {
      const [ax, az] = pts[s], [bx, bz] = pts[s + 1], dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1e-9;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach)), x1 = Math.min(N, Math.ceil(Math.max(ax, bx) + reach));
      const z0 = Math.max(0, Math.floor(Math.min(az, bz) - reach)), z1 = Math.min(N, Math.ceil(Math.max(az, bz) + reach));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)), d = Math.hypot(x - ax - t * dx, z - az - t * dz) - half, i = z * (N + 1) + x;
        if (d < roadEdge[i]) { roadEdge[i] = d; roadY[i] = even[s] + (even[s + 1] - even[s]) * t; }
      }
    }
  }
  /** blocks to the edge of the nearest way at a ground point (bilinear between the corners) */
  const roadAt = (x: number, z: number) => {
    if (!roadEdge) return Infinity;
    const fx = Math.max(0, Math.min(N - 1e-6, x)), fz = Math.max(0, Math.min(N - 1e-6, z)), x0 = Math.floor(fx), z0 = Math.floor(fz), u = fx - x0, v = fz - z0, i = z0 * (N + 1) + x0;
    return (roadEdge[i] * (1 - u) + roadEdge[i + 1] * u) * (1 - v) + (roadEdge[i + N + 1] * (1 - u) + roadEdge[i + N + 2] * u) * v;
  };
  // a way over the rock is cut into it: the columns under its band are meadow, at the heights of the rock
  if (roadEdge && roadY) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = idx(x, z), c = z * (N + 1) + x;
    if (g.wet[i] || roadAt(x + 0.5, z + 0.5) >= 0) continue;
    if (g.mat[i] === Mat.Rock) g.mat[i] = Mat.Grass;
    if (step > 0) continue;
    // the column takes the way's height: the mean of its corners that lie on the way
    let sum = 0, n = 0;
    for (const j of [c, c + 1, c + N + 1, c + N + 2]) if (roadEdge[j] < 0.5) { sum += roadY[j]; n++; }
    // just under the way's surface (the band below lies on it as a smooth ramp)
    if (n) g.h[i] = g.occ[i] = Math.floor(sum / n + RIBBON_LIFT);
  }
  const bridges: { x: number; z: number; y: number; span: number; turn: number; width: number }[] = [];
  if (step === 0) for (const { k, pts } of ways) {
    // where the line runs over a river (not a lake or the sea), a stone bridge from the last dry point to the next
    let dry: [number, number, number] | null = null, over: [number, number, number] | null = null;
    for (let s = 0; s + 1 < pts.length; s++) {
      const [ax, az] = pts[s], [bx, bz] = pts[s + 1], len = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t < len; t += 0.25) {
        const x = ax + ((bx - ax) * t) / len, z = az + ((bz - az) * t) / len, cx = Math.floor(x), cz = Math.floor(z);
        if (!inGrid(cx, cz)) { dry = over = null; continue; }
        const i = idx(cx, cz);
        if (g.wet[i]) {
          // a lake or the sea ends the crossing: the way waits for a ferry there
          if (kind[i] !== Water.Land) { over = null; dry = null; continue; }
          if (!over && dry) over = dry;
          continue;
        }
        if (over) {
          const span = Math.hypot(x - over[0], z - over[1]);
          if (span < 14) bridges.push({ x: (x + over[0]) / 2, z: (z + over[1]) / 2, y: Math.min(over[2], g.h[i]), span, turn: Math.atan2(-(z - over[1]), x - over[0]), width: 2 * ROAD_KINDS[k].half + 0.6 });
          over = null;
        }
        dry = [x, z, g.h[i]];
      }
    }
  }

  // towns, villages and fields: the places that fall on the ground, and the share of the land under the plough.
  // Vineyards are a quarter of the fields of the warm low country and thin out to none by 52° north (a rule of thumb).
  const things = new Batch(), counts: Record<string, number> = { tree: 0, ways: ways.length }, sites: Site[] = [], monuments: Monument[] = [], all: Site[] = [];
  const onGround = (p: readonly [number, number]) => p[0] >= 2 && p[1] >= 2 && p[0] < N - 2 && p[1] < N - 2;
  /** the fields of the towns: the ground within `r` blocks of a town's middle */
  const fields: { x: number; z: number; r: number }[] = [];
  places.forEach((p, id) => {
    const h = hamlets?.get(id);
    // with the hamlets of the simulation only the places it holds persons for stand in the world
    if (hamlets && !h) return;
    const at = toGround(...cellOf(region, p.lon, p.lat));
    const site: Site = { id, at, size: p.size, pop: h ? h.inside * PEOPLE_PER_PERSON : inhabitants.get(id) ?? p.pop1356, region: p.region, style: styleOf(p.region), lots: step === 0 ? parcels?.get(id) : undefined };
    all.push(site);
    if (onGround(site.at)) sites.push(site);
    if (!h) return;
    // the town's fields lie round it, as far as holds the land its farmers till; its hamlets stand among them
    const east = toGround(...cellOf(region, p.lon + 0.1, p.lat)), perKm = Math.hypot(east[0] - at[0], east[1] - at[1]) / (0.1 * KM_PER_DEGREE * Math.cos((p.lat * Math.PI) / 180));
    const r = h.reachKm * perKm, n = hamletsOf(h.families);
    // what the fields are held against: the blocks of ploughed ground the town's arable is at the finest step
    if (step === 0 && own(Math.floor(at[0]), Math.floor(at[1]))) counts.arable = (counts.arable ?? 0) + h.km2 * perKm * perKm;
    if (r > 0 && at[0] > -1.4 * r && at[1] > -1.4 * r && at[0] < N + 1.4 * r && at[1] < N + 1.4 * r) fields.push({ x: at[0], z: at[1], r });
    // its hamlets stand where the land register has them, each farmstead on its parcel; without a register they are
    // spread over the ground between the walls and the edge of the fields
    const held = parcels?.get(id)?.hamlets;
    if (held) {
      held.forEach((l, k) => {
        const here: [number, number] = [at[0] + m(l.east) / 2 ** step, at[1] + m(l.south) / 2 ** step];
        if (onGround(here)) sites.push({ id: HAMLET_IDS + id * 256 + k, at: here, size: 1, pop: (l.persons ? l.persons.reduce((a, b) => a + b, 0) : h.hamlet / held.length) * PEOPLE_PER_PERSON, region: p.region, style: site.style, hamlet: true, lots: step === 0 ? l : undefined });
      });
      return;
    }
    const inner = (firstHalf(h.inside * PEOPLE_PER_PERSON) + 10) / 2 ** step, outer = Math.max(0.8 * r, inner + (5 * Math.sqrt(n)) / 2 ** step), turn = hash2(id, 3, 91) * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const q = hamletAt(k, n, inner, outer), a = turn + k * HAMLET_TURN, here: [number, number] = [at[0] + Math.cos(a) * q, at[1] + Math.sin(a) * q];
      if (onGround(here)) sites.push({ id: HAMLET_IDS + id * 256 + k, at: here, size: 1, pop: (h.hamlet * PEOPLE_PER_PERSON) / n, region: p.region, style: site.style, hamlet: true });
    }
  });
  /** how much the game's layers of 1356 count at a cell: towards the east edge of the game map they give way, so that no line shows where they end */
  const reach = (cx: number) => { const px = region.x0 + cx / region.cells; return smooth(region.mapW, region.mapW - LAYERS_FADE, region.worldW ? ((px % region.worldW) + region.worldW) % region.worldW : px); };
  /** the pixel of the game map a ground point lies at */
  const mapPixel = (x: number, z: number): [number, number] => { const [cx, cy] = toCell(x, z), px = region.x0 + cx / region.cells; return [region.worldW ? ((px % region.worldW) + region.worldW) % region.worldW : px, region.y0 + cy / region.cells]; };
  /**
   * The share of the land about a ground point that is under the plough, the fallow counted in: what the simulation
   * has cultivated in the place there (arable.ts). Without its layer the game's layer of 1356 stands, a rule of thumb
   * from the people of a place, of which FIELDS_1356 were drawn as fields; none where that is not known (the
   * Americas, which the game map has as one farmland).
   */
  const arableOf = (x: number, z: number) => {
    const [cx, cy] = toCell(x, z);
    if (arable) return (arableAt(arable, ...mapPixel(x, z)) ?? 0) * reach(cx);
    return at(land, x, z) & FIELDS_KNOWN ? (sample(region, region.crops, cx, cy) / 255) * reach(cx) * FIELDS_1356 : 0;
  };
  /**
   * The share of the ground under the plough at a ground point. The fields of the simulation's arable lie together
   * as the woods do, where the woods do not, and leave the open grass between them (forest.ts `tilth`); those of the
   * layer of 1356 lie evenly over the land.
   */
  const ploughed = (x: number, z: number) => {
    if (hamlets) {
      // the fields of a town lie together round it, with a frayed edge, and leave the woods standing
      let d = Infinity;
      for (const f of fields) d = Math.min(d, Math.hypot(x - f.x, z - f.z) / f.r);
      if (d >= 1.2 || !inGrid(Math.floor(x), Math.floor(z))) return 0;
      return d * (0.85 + 0.3 * noise2(((x + ox) * cell) / 14, ((z + oz) * cell) / 14, 93)) < 1 && wooded(x, z) < 0.5 ? FIELD_GROUND : 0;
    }
    const share = arableOf(x, z);
    return arable && share > 0 ? FIELD_GROUND * tilth(Math.min(1, share / FIELD_GROUND), (x + ox) * cell, (z + oz) * cell, woodsShow, lean ? lean[idx(Math.floor(x), Math.floor(z))] : 0) : share;
  };
  /** in how many courses the fields at a ground point are tilled */
  const courses = (x: number, z: number) => ((at(land, x, z) & KIND) === Land.Mediterranean ? COURSES_DRY : COURSES);
  /** km² a field lot of the finest step takes at a latitude: a cell of the data is a quarter of a map pixel wide */
  const lotKm2 = (latitude: number) => LOT_BLOCKS * ((((region.lon1 - region.lon0) / region.mapW / (region.cells * cell)) * KM_PER_DEGREE * Math.cos((latitude * Math.PI) / 180)) / FINER) ** 2;
  /**
   * The farmhouses to a field at a ground point: as many as hold the people the simulation
   * counts on the land of the place there, outside its towns; where it counts none (beyond the game map, a year
   * without the layer) as everywhere before.
   */
  const farms = (x: number, z: number) => {
    if (hamlets) return 0;
    if (!rural) return FARMS;
    const people = ruralAt(rural, ...mapPixel(x, z));
    // of the land's lots as many are fields as hold its ploughed ground
    return people === null ? FARMS : farmsFor(people, lotKm2(at(lat, x, z)), arableOf(x, z) / (step === 0 ? LOT_FILL : lotFill(step)));
  };
  const vines = (x: number, z: number) => 0.25 * smooth(52, 47, at(lat, x, z)) * smooth(700, 400, metresAt(x, z));
  /** whether water lies within `reach` columns of a column */
  const byWater = (x: number, z: number, reach: number) => { for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) if (inGrid(x + dx, z + dz) && g.wet[idx(x + dx, z + dz)]) return true; return false; };
  /** palms line the water of the desert and of the hot steppe */
  const oasis = (i: number) => Math.abs(lat[i]) < 37 && metres[i] < 1200 && ((land[i] & KIND) === Land.Desert || (land[i] & KIND) === Land.Steppe);
  /** how far the single woods of the year's forest and the fields lying together show at this step: no longer where a block is nearly as large as a wood */
  const woodsShow = smooth(WOOD * 0.8, WOOD * 0.4, cell);
  /** where in its landscape, a wood's width to each side, a column is one for woods and not for fields: on the heights, not on the valley floors */
  const lean = (forest || arable) && woodsShow > 0 ? leanOf(metres, Uint8Array.from(kind, (k) => (k === Water.Land ? 1 : 0)), N, Math.max(1, Math.round(WOOD / cell))) : null;
  /** the share of the land under trees at a ground point by the forest of the world's year; null where it has none */
  const forestOf = (x: number, z: number) => { if (!forest) return null; const [cx, cy] = toCell(x, z); return forestAt(forest, region.x0 + cx / region.cells, region.y0 + cy / region.cells); };
  /**
   * How far a ground point is wooded, 0 … 1: by the forest of the world's year, laid out as woods with open land
   * between them; without it where the forest of 1356 stood, and beyond its reach where the climate grows woods.
   */
  const wooded = (x: number, z: number, known = forestOf(x, z)) => {
    const i = idx(Math.floor(x), Math.floor(z)), here = land[i] & KIND, grown = WOODS[here] ?? 0;
    if (BARE.includes(here)) return 0;
    if (known !== null) return stand(known, (x + ox) * cell, (z + oz) * cell, woodsShow, lean ? lean[i] : 0);
    if (!(land[i] & WOODS_KNOWN)) return grown;
    // towards the east edge of the game map its forest gives way to the climate's
    const [cx, cy] = toCell(x, z);
    return grown + (sample(region, region.forest, cx, cy) / 255 - grown) * reach(cx);
  };
  /**
   * How likely a tree is a dark conifer: by the pollen of the year's forest where it reaches, and more of them
   * towards the heights (the pollen is the mean of a degree); without it few in the low country, most on the heights
   * and in the north.
   */
  const conifers = (i: number) => {
    const high = smooth(500 + shift[i], 1300 + shift[i], metres[i]), known = dark ? dark[i] : -1;
    if (known >= 0) return known + Math.max(0, 0.88 - known) * high;
    return (land[i] & KIND) === Land.Boreal ? 0.85 : 0.08 + 0.8 * high;
  };
  /** a farm is built as the place nearest to it builds */
  const farm = (x: number, z: number) => { let best = all[0]; for (const s of all) if (Math.hypot(s.at[0] - x, s.at[1] - z) < Math.hypot(best.at[0] - x, best.at[1] - z)) best = s; return best ?? { region: '', style: styleOf('') }; };
  let settled: Settled | undefined, cover: Cover | undefined;
  if (step > 0 && mean) {
    // the mean of the finer step, seen from above (mean.ts); what stands out of it raises the ground
    cover = mean;
    for (let i = 0; i < N * N; i++) if (mean.rise[i] && !g.wet[i]) { g.h[i] += mean.rise[i]; g.occ[i] = Math.max(g.occ[i], g.h[i]); }
    unshade(mean, N, g.h);
  }
  else if (step > 0) {
    // from farther away the towns, the fields and the woods are part of the ground
    cover = coverLand(g, step, things, sites, { ploughed, laid: arable !== null || hamlets !== null, courses, vines, farm: (x, z) => farm(x, z).style.house, farms, own, clear: (x, z) => stream[idx(x, z)] > 0, woods: (x, z): Woods | null => {
      const i = idx(x, z), here = land[i] & KIND;
      if (metres[i] > woodsEnd[i]) return null;
      if (oasis(i)) return byWater(x, z, Math.max(1, Math.round(0.75 / cell))) ? { share: 0.8, crowns: PALM, tall: true } : null;
      // from the third far step on a block shows as much woods as lie on all of it, not on its middle alone: the mean of its quarters
      const known = forestOf(x + 0.5, z + 0.5), laid = known !== null, share = laid && step > FINER_STEPS && woodsShow > 0 ? (wooded(x + 0.25, z + 0.25) + wooded(x + 0.75, z + 0.25) + wooded(x + 0.25, z + 0.75) + wooded(x + 0.75, z + 0.75)) / 4 : wooded(x + 0.5, z + 0.5, known);
      // without woods a lone tree still stands here and there, as at the finest step, but not on bare land
      if (!share && BARE.includes(here)) return null;
      if (here === Land.Rainforest) return { share, crowns: JUNGLE, tall: true, laid };
      if (here === Land.Savanna) return { share, crowns: ACACIA, tall: false, laid };
      return hash2(x + ox, z + oz, 76) < conifers(i) ? { share, crowns: CYPRESS, tall: true, laid, conifers: conifers(i) } : { share, crowns: LEAVES, tall: false, laid, conifers: conifers(i) };
    } });
  }
  // the rivers narrower than a block lie on what covers the ground: the blocks they run through take the water's colour
  // (no woods stand on them: a stream shows as a line through a wood, as a river does)
  if (cover) for (let i = 0; i < N * N; i++) {
    const wet = stream[i];
    if (!wet || g.wet[i] || g.mat[i] === Mat.Rock || cover.town[i]) continue;
    const was = cover.has[i] ? cover.share[i] * (1 - wet) : 0, all = wet + was;
    for (let k = 0; k < 3; k++) cover.top[i * 3 + k] = (WATER_SHALLOW[k] * wet + cover.top[i * 3 + k] * was) / all;
    if (!cover.has[i]) { cover.has[i] = 1; cover.rise[i] = 0; cover.side.set(WATER_SHALLOW, i * 3); }
    cover.share[i] = all;
  }
  if (step === 0) {
    // the monuments that stood in 1356 and have a model
    landmarks.forEach((l, id) => {
      const here = toGround(...cellOf(region, l.lon, l.lat));
      if (l.built_state !== 'not_yet_built' && onGround(here)) (MONUMENTS[l.id] ?? []).forEach((m, k) => monuments.push({ id: id * 8 + k, at: [here[0] + m.dx, here[1] + m.dz], model: modelOf(m, models) }));
    });
    const built = settled = settle(g, things, sites, monuments, farm, ploughed, vines, counts, own, farms, courses, survey, told);
    // a survey of the building ground needs no more than the towns' ground
    if (survey || told) return { ground: new Batch(), things, water: new Batch(), cells: [], counts };

    // woods where the forest of the world's year stood (`wooded`), up to the tree line:
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
      if (!fits || roadAt(x, z) < 1.3) continue;
      // palms line the water of the desert and of the hot steppe, and stand among the trees of the rain forest
      const palms = oasis(i) && byWater(Math.floor(x), Math.floor(z), 3), lot = hash2(tx, tz, 73);
      if (palms ? lot > 0.3 : lot > (BARE.includes(here) ? 0 : STRAY_TREES) + CLOSED * wooded(x, z)) continue;
      const mine = own(Math.floor(x), Math.floor(z)), r = seeded(seedOf(tx, tz, 75)), sort = hash2(tx, tz, 74);
      if (palms || (here === Land.Rainforest && sort < 0.1)) { if (mine) palm(things, x, g.h[i], z, r); occlude(g, x - 0.8, z - 0.8, x + 0.8, z + 0.8, g.h[i] + 4.5); }
      else if (here === Land.Savanna) { if (mine) acacia(things, x, g.h[i], z, r); occlude(g, x - 1.1, z - 1.1, x + 1.1, z + 1.1, g.h[i] + 2.4); }
      else if (here === Land.Rainforest) { if (mine) tree(things, x, g.h[i], z, r, r.range(1.1, 1.6), JUNGLE); occlude(g, x - 1.05, z - 1.05, x + 1.05, z + 1.05, g.h[i] + 4); }
      else if (sort < conifers(i)) { if (mine) cypress(things, x, g.h[i], z, r); occlude(g, x - 0.6, z - 0.6, x + 0.6, z + 0.6, g.h[i] + 4.2); }
      else { if (mine) tree(things, x, g.h[i], z, r, wooded(x, z) > 0.5 ? r.range(0.9, 1.4) : r.range(0.85, 1.15)); occlude(g, x - 1.05, z - 1.05, x + 1.05, z + 1.05, g.h[i] + 3.4); }
      if (mine) counts.tree++;
    }
  }

  // the bridges of the ways
  const turned = new Matrix4();
  for (const b of bridges) if (own(Math.floor(b.x), Math.floor(b.z))) { things.append(bridge(b.span, b.width), turned.makeRotationY(b.turn).setPosition(b.x, b.y, b.z)); counts.bridge = (counts.bridge ?? 0) + 1; }
  // at the finest step the way is a smooth band laid over the columns, not a colour of their tops: its surface follows
  // its relaxed line and its averaged height, with verges down to the ground on both sides, so that it neither steps
  // in plan nor in height
  if (step === 0) for (const { k, pts, ys } of ways) {
    if (!ys || pts.length < 2) continue;
    const half = ROAD_KINDS[k].half, top = RIBBON[k], verge = shade(top, 0.8);
    const across = (q: number): [number, number] => {
      const a = pts[Math.max(0, q - 1)], b = pts[Math.min(pts.length - 1, q + 1)], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
      return [(-dz / len) * half, (dx / len) * half];
    };
    for (let q = 0; q + 1 < pts.length; q++) {
      const [ax, az] = pts[q], [bx, bz] = pts[q + 1];
      if (!own(Math.floor((ax + bx) / 2), Math.floor((az + bz) / 2)) || !inGrid(Math.floor(ax), Math.floor(az)) || !inGrid(Math.floor(bx), Math.floor(bz))) continue;
      if (g.wet[idx(Math.floor(ax), Math.floor(az))] || g.wet[idx(Math.floor(bx), Math.floor(bz))]) continue;
      const [ux, uz] = across(q), [vx, vz] = across(q + 1), ya = ys[q] + RIBBON_LIFT, yb = ys[q + 1] + RIBBON_LIFT;
      const grain = (x: number, z: number) => shade(top, 0.94 + 0.12 * hash2(Math.round(x * 2), Math.round(z * 2), 31));
      things.quad([ax + ux, ya, az + uz], [bx + vx, yb, bz + vz], [bx - vx, yb, bz - vz], [ax - ux, ya, az - uz], [grain(ax + ux, az + uz), grain(bx + vx, bz + vz), grain(bx - vx, bz - vz), grain(ax - ux, az - uz)], [0, 1, 0]);
      for (const side of [1, -1]) {
        const out: [number, number, number] = [ux * side, 0, uz * side];
        things.quad([ax + ux * side, ya, az + uz * side], [bx + vx * side, yb, bz + vz * side], [bx + vx * side, yb - RIBBON_SKIRT, bz + vz * side], [ax + ux * side, ya - RIBBON_SKIRT, az + uz * side], verge, out);
      }
      counts.ribbon = (counts.ribbon ?? 0) + 1;
    }
  }
  // from afar what stands on a way's blocks (woods, crops) is taken off, so that the ground shows the way's band
  // (terrain.ts colours it from the corners, a soft line rather than a row of blocks); far.ts raised the ground by it
  if (cover && roadEdge && step > 0) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = idx(x, z);
    if (!cover.has[i] || g.wet[i] || cover.town[i] || roadAt(x + 0.5, z + 0.5) >= FAR_CLEAR) continue;
    if (cover.rise[i] > 0) { g.h[i] -= cover.rise[i]; g.occ[i] = g.h[i]; cover.rise[i] = 0; }
    cover.has[i] = 0;
  }
  const traits: GroundTraits = {
    city: (x, z) => at((settled ?? cover!).town, x, z) === 1, plaza: () => Infinity, road: (x, z) => roadAt(x, z) + ROAD_SHOWS,
    crop: (x, z) => (settled ? ([null, 'wheat', 'vine', 'fallow', 'oats'] as const)[at(settled.field, x, z)] : null),
    cover: cover && ((x, z) => { const i = idx(x, z); return cover.has[i] ? { top: [cover.top[i * 3], cover.top[i * 3 + 1], cover.top[i * 3 + 2]], side: [cover.side[i * 3], cover.side[i * 3 + 1], cover.side[i * 3 + 2]], rise: cover.rise[i], share: cover.share[i], stands: !cover.kind || STANDS.has(cover.kind[i]) } : null; }),
    // the low country is sun-bleached, the mountain meadows are green
    bleach: (x, z) => smooth(900, 200, metresAt(x, z)),
    tint: (x, z) => TINT[at(land, x, z) & KIND] ?? null,
    // the snow line stands where the probe's summits begin; bundles of pillars differ a little, so that the line is ragged
    slope: SLOPE,
    summit: (x, z) => { const [px, pz] = rockPillar(x + ox, z + oz); return (pillar(x, z)[0] / at(snow, x, z)) * SUMMIT + (hash2(Math.floor(px / 2), Math.floor(pz / 2), 9) - 0.5) * 0.04; },
  };
  const carried = cover ? new Batch() : undefined, ground = buildTerrain(g, traits, bakedSky, part, carried), water = buildWater(g, false, part), raised = buildWater(g, true, part);
  buildShore(ground, g, traits, bakedSky, part);
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
  counts.triangles = ground.triangles + (carried?.triangles ?? 0) + water.triangles + raised.triangles + things.triangles + cells.reduce((n, c) => n + c.far.triangles, 0);
  // the people of the towns, villages and fields; on the coarser steps a block is wider than a person is tall
  const figures = settled ? crowd(g, settled, own) : undefined;
  if (figures) counts.figures = figures.count;
  return { ground, carried, things, water, raised, figures, cells, counts };
}
