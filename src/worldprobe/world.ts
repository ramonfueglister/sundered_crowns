// The real landscape in the look of the probe: heights, coast, lakes and rivers of a region become a ground of columns
// on the probe's grid, with rock, meadow and woods chosen from the real heights and the forest of the world's start
// year (forest.ts; the forest cover of 1356 for a year without one).
// On it stand the towns and villages (see settle.ts) and the fields the simulation has cultivated (arable.ts). North is at the top of the picture. No roads yet.
import { Batch, hash2, noise2, rgb, seeded, smooth } from '../lookprobe/batch';
import { ACACIA, CYPRESS, JUNGLE, LEAVES, PALM, acacia, cypress, palm, tree } from '../lookprobe/blocks';
import { type Ground, type GroundTraits, LAND_Y, Mat, N, SEA_Y, SUMMIT, idx, inGrid, measureShore, occlude, rockPillar } from '../lookprobe/layout';
import type { Shape, StageScene } from '../lookprobe/stage';
import { crowd } from '../figures';
import { type Part, WATER_SHALLOW } from '../lookprobe/terrain';
import { type Climate, FIELDS_KNOWN, KIND, Land, WOODS_KNOWN, climateAt, snowLineAt, treeLineAt } from './climate';
import { type Arable, arableAt } from './arable';
import { type Forest, WOOD, conifersAt, forestAt, leanOf, stand, tilth } from './forest';
import { type Rural, ruralAt } from './rural';
import type { TownParcels } from './lots';
import { HAMLET_TURN, type HamletLands, hamletAt, hamletsOf } from './hamlets';
import { BARE, FINER, FINER_STEPS, SNOW_LINE, TINT, TREE_LINE, WOODS, blockOfCell, cellOfBlock, lineShift, paleFrom, rockAt, woodsUntil } from './land';
import { type Region, Water, cellOf, latOf, sample, waterAt } from './region';
import { type Cover, type Woods, coverLand, lotFill } from './far';
import { drawGround } from './table';
import { unshade } from './mean';
import { FARMS, FIELD_GROUND, LOT_BLOCKS, LOT_FILL, type Lot, type Monument, PEOPLE_PER_PERSON, type Settled, type Site, type Survey, type Told, farmsFor, firstHalf, raise, settle } from './settle';
import { type Columns, columnsOf } from './nearground';
import { MONUMENTS, m, modelOf, styleOf } from '../buildings';

/**
 * The world is laid out in blocks: one block of the finest step is a part of a cell of the game map's data (FINER
 * to a cell, land.ts: about 0.38 km × cos(latitude), so 0.26 km in the Alps), and the block grid is turned against the map so
 * that north is at the top of the picture. A ground is the
 * square of N × N blocks that starts at world block (ox, oz); of it, the columns of `part` become meshes. What is built
 * on a column depends only on the world around it, never on where the ground begins, so that grounds laid side by side
 * fit together.
 */
export interface Piece { ox: number; oz: number; part: Part; /** the rivers are walked this many blocks beyond the ground on every side too (see the rivers in `buildWorld`); the region must cover them: `windowOf(ox, oz, beyond)`. Default 0 */ beyond?: number }
/** the houses that have fine blocks are kept in cells of this many blocks a side */
export const CELL = 25;
/** A cell of a town: its middle on the ground, its houses as the far view shows them and their lots, and the columns of its paved ground. */
export interface Cell<S extends Shape = Batch> { x: number; z: number; far: S; lots: Lot[]; ground?: Columns }
/** A piece of the world for the stage, with the cells of its towns. */
export interface WorldScene<S extends Shape = Batch> extends StageScene<S> { cells: Cell<S>[] }
/** The window of whole-map cells that the ground starting at world block (ox, oz) needs, and `beyond` blocks more on every side. */
export function windowOf(ox: number, oz: number, beyond = 0): { gx0: number; gy0: number; w: number; h: number } {
  const us: number[] = [], vs: number[] = [], lo = -beyond, hi = N + beyond;
  for (const [x, z] of [[lo, lo], [hi, lo], [lo, hi], [hi, hi]]) { const [u, v] = cellOfBlock(ox + x, oz + z); us.push(u); vs.push(v); }
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
  level.set(terracePass(terracePass(terracePass(terracePass(level, mat, false), mat, true), mat, true), mat, false));
}
/** one pass of `terrace`: every column of the grass land takes the lowest (`up`: the highest) of itself and its eight neighbours */
function terracePass(from: Int16Array, mat: Uint8Array, up: boolean) {
  const to = new Int16Array(from);
  // (the neighbours by their places in the lists, in the order of rows and columns: the walk over the eight of them
  // through `inGrid` and `idx` was a twentieth of what a worker takes for a piece of the nearest step)
  const n = N;
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const i = z * n + x;
    if (mat[i] !== Mat.Grass) continue;
    let v = from[i];
    const x0 = x > 0 ? -1 : 0, x1 = x + 1 < n ? 1 : 0;
    for (let dz = z > 0 ? -1 : 0, z1 = z + 1 < n ? 1 : 0; dz <= z1; dz++) for (let j = i + dz * n + x0, end = i + dz * n + x1; j <= end; j++) {
      if (mat[j] !== Mat.Grass) continue;
      const o = from[j];
      if (up ? o > v : o < v) v = o;
    }
    to[i] = v;
  }
  return to;
}

// What follows are parts of `buildWorld` as functions of their own. Inside a function as long as `buildWorld` the
// engine compiles a loop anew in almost every piece and runs it slowly until then, and a helper made inside it
// loses its fast code when the piece is done (the next piece's helper is a new one); a function out here keeps it.

/** the column a ground point lies in; a point off the ground counts to the nearest column of its edge */
const columnAt = (x: number, z: number) => idx(Math.max(0, Math.min(N - 1, Math.floor(x))), Math.max(0, Math.min(N - 1, Math.floor(z))));
const fieldAt = (field: Float32Array | Int16Array | Uint8Array, x: number, z: number) => field[columnAt(x, z)];
/** blocks above the plain of a height in metres, where the lines of the climate are shifted by `by`; `flatter` is the step's */
function levelFor(m: number, by: number, flatter: number) { const treeLine = TREE_LINE + by; return (Math.max(0, (Math.min(m, treeLine) - PLAIN) / METRES_PER_BLOCK) + Math.max(0, m - treeLine) / METRES_PER_BLOCK_HIGH) / flatter; }
/** a field averaged over a square of blocks reaching `reach` to each side */
function averaged(field: Float32Array, reach: number) {
  const out = new Float32Array(N * N);
  for (let z = 0; z < N; z++) {
    const z0 = Math.max(0, z - reach), z1 = Math.min(N - 1, z + reach);
    for (let x = 0; x < N; x++) {
      const x0 = Math.max(0, x - reach), x1 = Math.min(N - 1, x + reach);
      let sum = 0;
      for (let v = z0; v <= z1; v++) for (let u = v * N + x0, end = v * N + x1; u <= end; u++) sum += field[u];
      out[z * N + x] = sum / ((z1 - z0 + 1) * (x1 - x0 + 1));
    }
  }
  return out;
}

/** what `buildWorld` reads of the map for every column */
interface Reading { metres: Float32Array; kind: Uint8Array; shift: Float32Array; lat: Float32Array; snow: Float32Array; woodsEnd: Float32Array; dark: Float32Array | null; land: Uint8Array }
/** Fills `c`: real height, water class and latitude of every column, taken at its centre, and the lines and the kind of land of its climate (see `buildWorld`). */
function readColumns(region: Region, climate: Climate | null, forest: Forest | null, ox: number, oz: number, cell: number, c: Reading) {
  const { metres, kind, shift, lat, snow, woodsEnd, dark, land } = c, c0x = region.x0 * region.cells, c0y = region.y0 * region.cells;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    // (the region cell under the column's middle, as `toCell` gives it)
    const [u, v] = cellOfBlock(x + 0.5 + ox, z + 0.5 + oz), cx = u - c0x, cy = v - c0y, i = idx(x, z);
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
}

/**
 * The massifs, read from the drainage network: the valleys are the water and every column through which at least
 * `valleyFrom` square kilometres drain. From them the land is walked outwards ring by ring, and each column is held
 * at least as high as the lowest column of the ring before that it touches, so that every massif rises closed from
 * its valley floor to its divide and the gullies finer than the valleys are filled. `away`: the ring of a column.
 */
function massifsOf(region: Region, metres: Float32Array, kind: Uint8Array, ox: number, oz: number, valleyFrom: number) {
  const rise = new Float32Array(metres), foot = new Float32Array(metres), away = new Int16Array(N * N).fill(-1), c0x = region.x0 * region.cells, c0y = region.y0 * region.cells;
  let ring: number[] = [];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const [u, v] = cellOfBlock(x + 0.5 + ox, z + 0.5 + oz), cx = u - c0x, cy = v - c0y, i = idx(x, z);
    const cell = Math.max(0, Math.min(region.h - 1, Math.floor(cy))) * region.w + Math.max(0, Math.min(region.w - 1, Math.floor(cx)));
    if (kind[i] !== Water.Land || region.drainage[cell] >= valleyFrom) { away[i] = 0; ring.push(i); }
  }
  for (let step = 1; ring.length; step++) {
    const next: number[] = [];
    // (a column's neighbours by their places in the lists, in the order of rows and columns)
    for (let k = 0; k < ring.length; k++) {
      const i = ring[k], x = i % N, z = (i - x) / N, x0 = x > 0 ? -1 : 0, x1 = x + 1 < N ? 1 : 0;
      for (let dz = z > 0 ? -1 : 0, z1 = z + 1 < N ? 1 : 0; dz <= z1; dz++) for (let j = i + dz * N + x0, end = i + dz * N + x1; j <= end; j++) if (away[j] < 0) { away[j] = step; next.push(j); }
    }
    for (let k = 0; k < next.length; k++) {
      const j = next[k], x = j % N, z = (j - x) / N, x0 = x > 0 ? -1 : 0, x1 = x + 1 < N ? 1 : 0;
      let from = -1;
      for (let dz = z > 0 ? -1 : 0, z1 = z + 1 < N ? 1 : 0; dz <= z1; dz++) for (let i = j + dz * N + x0, end = j + dz * N + x1; i <= end; i++) {
        if (away[i] === step - 1 && (from < 0 || rise[i] < rise[from] || (rise[i] === rise[from] && foot[i] < foot[from]))) from = i;
      }
      rise[j] = Math.max(rise[j], rise[from]); foot[j] = foot[from];
    }
    ring = next;
  }
  return { rise, foot, away };
}

/** the massifs as the rock reads them: the valley floors, the massifs' closed shape, the shift of the climate's lines, the rings and the ring from which rock stands */
interface Massifs { base: Float32Array; massif: Float32Array; shift: Float32Array; away: Int16Array; rockFoot: number; ox: number; oz: number }
const raisedAt = (m: Massifs, qx: number, qz: number) => fieldAt(m.base, qx, qz) + PEAK * (fieldAt(m.massif, qx, qz) - fieldAt(m.base, qx, qz));
/**
 * Height of the bundle of four rock pillars a column belongs to, whether that bundle is rock, and the height of the column's own pillar. A massif of the reference is one
 * steep, calm shape: the rock takes the closed shape of whole massifs and raises it over their valley floors,
 * and leaves out what is finer. Rock or meadow is settled per bundle of four pillars, so that the rock comes in
 * whole pieces, and only away from the valley floors, which stay green.
 */
function pillarOf(m: Massifs, x: number, z: number): [number, boolean, number] {
  const [px, pz] = rockPillar(x + m.ox, z + m.oz), bx = Math.floor(px / 2) * 2 + 1, cx = bx * 2 - m.ox, cz = (Math.floor(pz / 2) * 2 + 1) * 2 - bx - m.oz;
  return [raisedAt(m, cx, cz), rockAt(fieldAt(m.massif, cx, cz), fieldAt(m.base, cx, cz), fieldAt(m.shift, cx, cz)) && fieldAt(m.away, cx, cz) >= m.rockFoot, raisedAt(m, (px + 0.5) * 2 - m.ox, (pz + 0.5) * 2 - px - m.oz)];
}
/** Fills `level`, the blocks above the plain of every column's own ground (water: of its surface), and the rock and the grass of `mat`. */
function levels(m: Massifs, metres: Float32Array, kind: Uint8Array, flatter: number, level: Int16Array, mat: Uint8Array) {
  const { shift, ox, oz } = m;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = idx(x, z);
    if (kind[i] !== Water.Land) { level[i] = kind[i] === Water.Lake ? Math.round(levelFor(metres[i], shift[i], flatter)) : 0; continue; }
    const [high, rock, mine] = pillarOf(m, x, z);
    if (!rock) { level[i] = Math.round(levelFor(metres[i], shift[i], flatter)); mat[i] = Mat.Grass; continue; }
    // the rock stands in walls, as the massifs of the reference do: a bundle of pillars is one block of rock with one
    // height, so that the faces between bundles are large; the pillars of a bundle lean a step with the slope, one here and there stands a step lower, and
    // single columns stand back as the fine grooves of the walls
    const [rx, rz] = rockPillar(x + ox, z + oz), lot = hash2(rx, rz, 17), lower = lot < 0.1 ? 1 : 0, lean = Math.max(-1, Math.min(1, Math.round(levelFor(mine, shift[i], flatter) - levelFor(high, shift[i], flatter))));
    const single = hash2(x + ox, z + oz, 19), groove = single < 0.03 ? 3 : single < 0.08 ? 1 : 0;
    level[i] = Math.max(1, Math.round(levelFor(high, shift[i], flatter)) + lean - lower - groove); mat[i] = Mat.Rock;
  }
}

/** the crop of a field's column, by what `Settled.field` holds */
const CROPS = [null, 'wheat', 'vine', 'fallow', 'oats'] as const;
/**
 * What the ground mesher asks about the world's ground (`GroundTraits`). A class, so that the answers are the same
 * functions for every piece (see above): as functions made for each piece they lost their fast code with the piece,
 * and so did `topColor`, which calls them at every corner. `town`: the paved ground; `field`: the fields of the
 * finest step; `mean`: what covers the ground of the coarser steps.
 */
class WorldTraits implements GroundTraits {
  readonly slope = SLOPE;
  constructor(private readonly town: Uint8Array, private readonly field: Uint8Array | null, private readonly mean: Cover | undefined, private readonly land: Uint8Array, private readonly metres: Float32Array, private readonly snow: Float32Array, private readonly massifs: Massifs) {}
  city(x: number, z: number) { return fieldAt(this.town, x, z) === 1; }
  plaza() { return Infinity; }
  road() { return Infinity; }
  crop(x: number, z: number) { return this.field ? CROPS[fieldAt(this.field, x, z)] : null; }
  cover(x: number, z: number) {
    const cover = this.mean;
    if (!cover) return null;
    const i = idx(x, z);
    return cover.has[i] ? { top: [cover.top[i * 3], cover.top[i * 3 + 1], cover.top[i * 3 + 2]] as const, side: [cover.side[i * 3], cover.side[i * 3 + 1], cover.side[i * 3 + 2]] as const, rise: cover.rise[i], share: cover.share[i], stands: !cover.kind || STANDS.has(cover.kind[i]) } : null;
  }
  /** the low country is sun-bleached, the mountain meadows are green */
  bleach(x: number, z: number) { return smooth(900, 200, fieldAt(this.metres, x, z)); }
  tint(x: number, z: number) { return TINT[fieldAt(this.land, x, z) & KIND] ?? null; }
  /** the snow line stands where the probe's summits begin; bundles of pillars differ a little, so that the line is ragged */
  summit(x: number, z: number) {
    const m = this.massifs, [px, pz] = rockPillar(x + m.ox, z + m.oz);
    return (pillarOf(m, x, z)[0] / fieldAt(this.snow, x, z)) * SUMMIT + (hash2(Math.floor(px / 2), Math.floor(pz / 2), 9) - 0.5) * 0.04;
  }
}

/**
 * `region` must cover `windowOf(piece.ox, piece.oz, piece.beyond)` in the blocks of `step`: at step s a block is 2^s finest blocks
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
 * (mean.ts) instead of what far.ts lays out.
 */
export function buildWorld(region: Region, piece: Piece, places: readonly Place[], landmarks: readonly Landmark[], bakedSky = true, step = 0, climate: Climate | null = null, inhabitants: ReadonlyMap<number, number> = new Map(), models: ReadonlyMap<string, Batch> = new Map(), forest: Forest | null = null, rural: Rural | null = null, arable: Arable | null = null, hamlets: HamletLands | null = null, parcels: TownParcels | null = null, survey?: Survey, mean: Cover | null = null, told?: Told): WorldScene {
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
  readColumns(region, climate, forest, ox, oz, cell, { metres, kind, shift, lat, snow, woodsEnd, dark, land });
  const levelBy = (m: number, by: number) => levelFor(m, by, flatter);
  const levelOf = (m: number, i: number) => levelBy(m, shift[i]);
  // the massifs, read from the drainage network (`massifsOf`)
  const { rise, foot, away } = massifsOf(region, metres, kind, ox, oz, valleyFrom);
  // the valley floor under every massif, blended where massifs of different valleys meet, and the massifs' closed shape
  const base = averaged(averaged(foot, 2), 2), massif = averaged(rise, 2);
  const cellAt = columnAt, at = fieldAt;
  const metresAt = (x: number, z: number) => at(metres, x, z);
  const massifs: Massifs = { base, massif, shift, away, rockFoot, ox, oz };
  /** see `pillarOf` */
  const pillar = (x: number, z: number) => pillarOf(massifs, x, z);

  const g: Ground = { h: new Int16Array(N * N), mat: new Uint8Array(N * N), wet: new Uint8Array(N * N), shore: new Uint8Array(N * N), occ: new Float32Array(N * N), surf: new Float32Array(N * N).fill(SEA_Y), ox, oz };
  /** blocks above the plain of every column's own ground (water: of its surface) */
  const level = new Int16Array(N * N);
  levels(massifs, metres, kind, flatter, level, g.mat);
  terrace(level, g.mat);

  // rivers: each line is walked from its high end, never rising again, and cut one block into the valley floor. A
  // river's level is thus the lowest floor it has passed, and depends on where the walk begins: the walk goes on
  // `piece.beyond` blocks off the ground, so that a piece built on a narrow ground gives a river the level a wide
  // ground gives it, and the pieces beside it. Off the ground a column's floor is read from the region as on it.
  const beyond = piece.beyond ?? 0, walked = (x: number, z: number) => x >= -beyond && z >= -beyond && x < N + beyond && z < N + beyond;
  const floorOf = (x: number, z: number) => {
    if (inGrid(x, z)) return Math.round(levelOf(metres[idx(x, z)], idx(x, z)));
    const [cx, cy] = toCell(x + 0.5, z + 0.5);
    return Math.round(levelBy(Math.fround(sample(region, region.shaped, cx, cy)), Math.fround(lineShift(Math.fround(latOf(region, cy))))));
  };
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
    const half = Math.max(0.6, wide / 2), steps: [number, number, number][] = [];
    for (let k = 0; k + 1 < r.pts.length; k++) {
      const a = toGround(...r.pts[k]), b = toGround(...r.pts[k + 1]), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = 0; t < len; t += 0.5) {
        const x = a[0] + ((b[0] - a[0]) * t) / len, z = a[1] + ((b[1] - a[1]) * t) / len;
        if (!walked(Math.floor(x), Math.floor(z))) continue;
        // the valley floor: the lowest ground within a block of the line, which is drawn more coarsely than the heights
        let floor = Infinity;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (walked(Math.floor(x) + dx, Math.floor(z) + dz)) floor = Math.min(floor, floorOf(Math.floor(x) + dx, Math.floor(z) + dz));
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
  // a river is one water: where two of its columns touch only at a corner, the lower of the two columns between them is water too
  // (the two diagonals of every square of four columns, one after the other, without a list of the four made for each)
  const joined = (a: number, c: number, p: number, q: number) => {
    if (river[a] < 0 || river[c] < 0 || river[p] >= 0 || river[q] >= 0 || kind[p] !== Water.Land || kind[q] !== Water.Land) return;
    river[level[p] <= level[q] ? p : q] = Math.max(river[a], river[c]);
  };
  for (let z = 0; z + 1 < N; z++) for (let x = 0; x + 1 < N; x++) {
    const i = z * N + x;
    joined(i, i + N + 1, i + 1, i + N);
    joined(i + 1, i + N, i, i + N + 1);
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
    // (east, west, south, north, as before, each by its place in the lists)
    if (x + 1 < N && g.wet[i + 1] && g.h[i] < LAND_Y + level[i + 1]) g.h[i] = LAND_Y + level[i + 1];
    if (x > 0 && g.wet[i - 1] && g.h[i] < LAND_Y + level[i - 1]) g.h[i] = LAND_Y + level[i - 1];
    if (z + 1 < N && g.wet[i + N] && g.h[i] < LAND_Y + level[i + N]) g.h[i] = LAND_Y + level[i + N];
    if (z > 0 && g.wet[i - N] && g.h[i] < LAND_Y + level[i - N]) g.h[i] = LAND_Y + level[i - N];
  }
  measureShore(g);
  // the sea bed falls away from the coast, as in the probe
  for (let i = 0; i < N * N; i++) { if (kind[i] === Water.Sea) g.h[i] = Math.max(0, 2 - Math.floor(g.shore[i] / 4)); g.occ[i] = g.wet[i] ? g.surf[i] : g.h[i]; }

  // towns, villages and fields: the places that fall on the ground, and the share of the land under the plough.
  // Vineyards are a quarter of the fields of the warm low country and thin out to none by 52° north (a rule of thumb).
  const things = new Batch(), counts: Record<string, number> = { tree: 0 }, sites: Site[] = [], monuments: Monument[] = [], all: Site[] = [];
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
  const lean = (forest || arable) && woodsShow > 0 ? leanOf(metres, kind.map((k) => (k === Water.Land ? 1 : 0)), N, Math.max(1, Math.round(WOOD / cell))) : null;
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
      if (!fits) continue;
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

  const traits = new WorldTraits((settled ?? cover!).town, settled ? settled.field : null, cover, land, metres, snow, massifs);
  // (drawn by table.ts, which can keep the table of the columns: a far piece is drawn again from that alone)
  const { ground, carried, water, raised } = drawGround(g, traits, bakedSky, part, !!cover);
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
