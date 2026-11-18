// The table of a far piece: what its columns are, and nothing of how they are drawn. A piece of a far step shows its
// ground and what the ground carries; all of it is drawn from a dozen numbers to a column: how high it stands, what
// it is made of, the water over it, what blocks its sky, and the colour, rise and share of what it carries. The
// table holds those, and `drawTable` makes of them the very meshes the world's own build makes (which draws through
// `drawGround` here, so the two cannot differ).
//
// A piece takes most of a second to build because its land has to be read, shaped and covered first; drawn from its
// table it takes a third of that, and the table is a tenth of the drawn piece on disk (measured on pieces round
// Paris: 79 to 119 KB zipped, where the piece's triangles are 1.1 to 1.25 MB). So the tables of the coarse steps are
// built ahead (tools/worldprobe/build_tables.ts) and fetched; the rest of the world is built as before.
//
// What a table does not hold is how the land looks: the colours of grass, rock and shore, their grain and the light
// are worked out when it is drawn (lookprobe/terrain.ts, shore.ts). A change of the look needs no new tables; a
// change of the land's shape, its cover or its ways does (world.ts, far.ts, roads.ts and the map's data).
import { Batch, type RGB } from '../lookprobe/batch';
import { type Ground, type GroundTraits, Mat, N, SUMMIT, idx, onGrid } from '../lookprobe/layout';
import { buildShore } from '../lookprobe/shore';
import { type Part, buildTerrain, buildWater } from '../lookprobe/terrain';
import { pack, unpack } from './pack';
import { FAR_FROM_ROADS, ROAD_SHOWS, roadOn } from './roads';

/**
 * The columns round a piece's own that its picture depends on: the sky's share is taken up to 10.5 columns from a
 * corner (terrain.ts `skyShare`), the shore's line over three (shore.ts). The table holds the piece's own columns
 * and this many round them; the rest of its ground is left empty.
 */
export const RIM = 16;

/** The columns of a ground, as lists over all of it (side × side, a column at z * side + x). */
export interface Table {
  /** side of the ground the piece was built on, the world block of its first column, and the piece's own columns */
  side: number; ox: number; oz: number; part: Part;
  /** the ground itself (layout.ts `Ground`) */
  h: Int16Array; mat: Uint8Array; wet: Uint8Array; shore: Uint8Array; occ: Float32Array; surf: Float32Array;
  /** 1: paved town ground */
  town: Uint8Array;
  /** what the column carries (GroundTraits.cover): 0 nothing, 1 something that stands on the ground, 2 the ground's own */
  has: Uint8Array;
  rise: Uint8Array; share: Float32Array;
  /** the colours of its top and of its sides: which of `colours` (three numbers each) */
  top: Uint16Array; flank: Uint16Array; colours: Float32Array;
  /** how sun-bleached the meadow is; how far up its massif a rock column stands (rock only) */
  bleach: Float32Array | Float64Array; summit: Float32Array | Float64Array;
  /** the colour the meadow is pulled towards: which of `tints` (one more than its place there, 0: none), each three numbers of colour and how far */
  tint: Uint8Array; tints: number[];
  /** the colour of overgrown steps (GroundTraits.slope) */
  slope?: RGB;
  /** blocks to the edge of the nearest way's band at the corners of the columns ((side + 1)², roads.ts `roadOn`), where ways run over the ground; off the piece's own and its rim as far as where no way is near */
  road?: Float32Array;
}

/**
 * The list of the tables built ahead for a region and a year (public/map/tables/<region>_<year>/index.json; the
 * table of a piece lies beside it as <step>/<px>_<pz>.bin.gz): the pieces of the steps `steps` that have a table
 * and those that are open sea, each step's as pairs px, pz one after the other.
 */
export interface TablesIndex {
  about: string; region: string; year: number;
  /** blocks a side of a piece, and of the ground it was built on (the piece lies in its middle) */
  piece: number; side: number;
  steps: number[]; land: Record<string, number[]>; sea: Record<string, number[]>;
  /** the files the tables were built from, each with a stamp of its content */
  inputs: Record<string, string>;
}
export const keyOfTable = (step: number, px: number, pz: number) => `${step}:${px},${pz}`;

let wanted = false, last: Table | null = null;
/** From now on the table of every ground that is drawn is kept until the next (`tabled`); or no longer. */
export function keepTables(on: boolean) { wanted = on; last = null; }
/** The table of the ground drawn last, while tables are kept. */
export const tabled = (): Table | null => last;

/**
 * Draws a ground: its land, with what it carries as a mesh of its own where `covered`, the sea and the water above
 * it, and the banks of the water.
 */
export function drawGround(g: Ground, t: GroundTraits, bakedSky: boolean, part: Part, covered: boolean, roads: Float32Array | null = null): { ground: Batch; carried?: Batch; water: Batch; raised: Batch } {
  if (wanted) last = tableOf(g, t, part, roads);
  const carried = covered ? new Batch() : undefined, ground = buildTerrain(g, t, bakedSky, part, carried), water = buildWater(g, false, part), raised = buildWater(g, true, part);
  buildShore(ground, g, t, bakedSky, part);
  return { ground, carried, water, raised };
}

/** The table of a ground of a far step: its columns as the ground's traits tell them, the piece's own and RIM round them; `roads`: the ways' edges at the corners, as the traits were given them. */
export function tableOf(g: Ground, t: GroundTraits, part: Part, roads: Float32Array | null = null): Table {
  const n = N * N, colours: number[] = [], known = new Map<string, number>(), tints: number[] = [], tinted = new Map<string, number>();
  const table: Table = {
    side: N, ox: g.ox ?? 0, oz: g.oz ?? 0, part: { ...part },
    h: new Int16Array(n), mat: new Uint8Array(n), wet: new Uint8Array(n), shore: new Uint8Array(n), occ: new Float32Array(n), surf: new Float32Array(n),
    town: new Uint8Array(n), has: new Uint8Array(n), rise: new Uint8Array(n), share: new Float32Array(n), top: new Uint16Array(n), flank: new Uint16Array(n), colours: new Float32Array(0),
    bleach: new Float64Array(n), summit: new Float64Array(n), tint: new Uint8Array(n), tints, slope: t.slope && [t.slope[0], t.slope[1], t.slope[2]],
  };
  const colourOf = (c: readonly [number, number, number]) => {
    const key = `${c[0]},${c[1]},${c[2]}`;
    let k = known.get(key);
    if (k === undefined) { k = colours.length / 3; if (k > 65535) throw new Error('table: more colours than a table holds'); known.set(key, k); colours.push(c[0], c[1], c[2]); }
    return k;
  };
  for (let z = Math.max(0, part.z0 - RIM); z < Math.min(N, part.z1 + RIM); z++) for (let x = Math.max(0, part.x0 - RIM); x < Math.min(N, part.x1 + RIM); x++) {
    const i = idx(x, z);
    table.h[i] = g.h[i]; table.mat[i] = g.mat[i]; table.wet[i] = g.wet[i]; table.shore[i] = g.shore[i]; table.occ[i] = g.occ[i]; table.surf[i] = g.surf[i];
    table.town[i] = t.city(x, z) ? 1 : 0;
    table.bleach[i] = t.bleach(x, z);
    if (g.mat[i] === Mat.Rock) table.summit[i] = t.summit(x, z);
    const tint = t.tint?.(x, z);
    if (tint) {
      const key = `${tint[0][0]},${tint[0][1]},${tint[0][2]},${tint[1]}`;
      let k = tinted.get(key);
      if (k === undefined) { k = tints.length / 4 + 1; if (k > 255) throw new Error('table: more tints than a table holds'); tinted.set(key, k); tints.push(tint[0][0], tint[0][1], tint[0][2], tint[1]); }
      table.tint[i] = k;
    }
    const cover = t.cover?.(x, z);
    if (!cover) continue;
    table.has[i] = cover.stands === false ? 2 : 1; table.rise[i] = cover.rise; table.share[i] = cover.share ?? 1;
    table.top[i] = colourOf(cover.top); table.flank[i] = colourOf(cover.side);
  }
  table.colours = new Float32Array(colours);
  if (roads) {
    const road = new Float32Array((N + 1) * (N + 1)).fill(FAR_FROM_ROADS);
    for (let z = Math.max(0, part.z0 - RIM); z <= Math.min(N, part.z1 + RIM); z++) for (let x = Math.max(0, part.x0 - RIM); x <= Math.min(N, part.x1 + RIM); x++) road[z * (N + 1) + x] = roads[z * (N + 1) + x];
    table.road = road;
  }
  return table;
}

/**
 * The traits of a table's ground, as its build had them: each asks the column a point lies in. A class, so that the
 * answers are the same functions for every table: as functions made for each table they lost their fast code with it.
 */
class TableTraits implements GroundTraits {
  readonly slope: GroundTraits['slope'];
  private readonly side: number;
  private readonly last: number;
  private readonly pulls: (readonly [RGB, number])[] = [];
  constructor(private readonly table: Table) {
    this.slope = table.slope; this.side = table.side; this.last = table.side - 1;
    const tints = table.tints;
    for (let k = 0; k < tints.length; k += 4) this.pulls.push([[tints[k], tints[k + 1], tints[k + 2]], tints[k + 3]]);
  }
  /** the column a point lies in */
  private cell(x: number, z: number) { const last = this.last; return Math.max(0, Math.min(last, Math.floor(z))) * this.side + Math.max(0, Math.min(last, Math.floor(x))); }
  private colour(k: number): RGB { const colours = this.table.colours; return [colours[k * 3], colours[k * 3 + 1], colours[k * 3 + 2]]; }
  city(x: number, z: number) { return this.table.town[this.cell(x, z)] === 1; }
  plaza() { return Infinity; }
  road(x: number, z: number) { const road = this.table.road; return road ? roadOn(road, x, z) + ROAD_SHOWS : Infinity; }
  crop() { return null; }
  bleach(x: number, z: number) { return this.table.bleach[this.cell(x, z)]; }
  summit(x: number, z: number) { return this.table.summit[this.cell(x, z)]; }
  tint(x: number, z: number) { return this.pulls[this.table.tint[this.cell(x, z)] - 1] ?? null; }
  cover(x: number, z: number) {
    const table = this.table, i = z * this.side + x;
    return table.has[i] ? { top: this.colour(table.top[i]), side: this.colour(table.flank[i]), rise: table.rise[i], share: table.share[i], stands: table.has[i] === 1 } : null;
  }
}
const traitsOf = (table: Table): GroundTraits => new TableTraits(table);

/**
 * Draws the land of a part of a table's own columns, without water and banks: what the piece shows there on its
 * columns' tops and sides (glide.ts asks the coarser piece for it).
 */
export function drawLand(table: Table, bakedSky: boolean, part: Part): { ground: Batch; carried: Batch } {
  const g: Ground = { h: table.h, mat: table.mat, wet: table.wet, shore: table.shore, occ: table.occ, surf: table.surf, ox: table.ox, oz: table.oz };
  return onGrid(table.side, () => { const carried = new Batch(); return { ground: buildTerrain(g, traitsOf(table), bakedSky, part, carried), carried }; });
}

/** Draws the banks of the water in a part of a table's own columns, as the piece has them there (glide.ts asks the coarser piece for them). */
export function drawBanks(table: Table, bakedSky: boolean, part: Part): Batch {
  const g: Ground = { h: table.h, mat: table.mat, wet: table.wet, shore: table.shore, occ: table.occ, surf: table.surf, ox: table.ox, oz: table.oz };
  return onGrid(table.side, () => { const banks = new Batch(); buildShore(banks, g, traitsOf(table), bakedSky, part); return banks; });
}

/** Draws the piece of a table, as its build drew it. */
export function drawTable(table: Table, bakedSky: boolean): { ground: Batch; carried?: Batch; water: Batch; raised: Batch } {
  const g: Ground = { h: table.h, mat: table.mat, wet: table.wet, shore: table.shore, occ: table.occ, surf: table.surf, ox: table.ox, oz: table.oz };
  const keeping = wanted;
  wanted = false;
  try { return onGrid(table.side, () => drawGround(g, traitsOf(table), bakedSky, table.part, true)); } finally { wanted = keeping; }
}

/** what a packed table holds: the table's lists in fewer bytes (see `packTable`) */
interface Packed extends Omit<Table, 'occ' | 'share' | 'top' | 'flank' | 'bleach' | 'summit'> {
  /** marks the way a table is packed: a run of another way is not read */
  packed: typeof PACKED;
  lift: Float32Array; share: Uint8Array; pair: Uint16Array; pairs: Uint16Array; bleach: Uint8Array; summit: Uint8Array; pale: Uint8Array;
}
const PACKED = 1;
/** the steps a packed table keeps of the meadow's bleach (0 … 1) and of a rock column's height on its massif (0 … 2) */
const BLEACH_STEPS = 32, SUMMIT_STEPS = 127;

/**
 * A table as a run of bytes (pack.ts), to be zipped and kept. The lists are packed so that they zip well, and what
 * is lost is far less than a colour's own step of a 255th:
 *  - what blocks the sky as its height over the column (nought nearly everywhere), to the last bit;
 *  - the two colours of what a column carries as one number for the pair;
 *  - the share of the cover as a byte: full stays full, and it stays on its side of a half (terrain.ts CARRIED_FROM);
 *  - the meadow's bleach in 32 steps (it moves a colour by a 30th of that at most), and only where a top or a bank
 *    asks for it: within a column of open or half covered green land or of water;
 *  - a rock column's height on its massif in steps of a 127th, and whether it is pale, which is kept as it was.
 */
export function packTable(table: Table): ArrayBuffer {
  const { side, occ, share, top, flank, bleach, summit, ...rest } = table, n = side * side;
  const lift = new Float32Array(n), pair = new Uint16Array(n), pairs: number[] = [], known = new Map<number, number>(), asked = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    lift[i] = occ[i] - table.h[i];
    if (Math.fround(table.h[i] + lift[i]) !== occ[i]) throw new Error('table: a height that cannot be packed');
    if (!table.has[i]) continue;
    const key = top[i] * 65536 + flank[i];
    let k = known.get(key);
    if (k === undefined) { k = pairs.length / 2; if (k > 65535) throw new Error('table: more pairs of colours than a table holds'); known.set(key, k); pairs.push(top[i], flank[i]); }
    pair[i] = k;
  }
  // the bleach is asked for at the corners of grass and soil that are not wholly covered, and along the water's banks
  for (let z = 0; z < side; z++) for (let x = 0; x < side; x++) {
    const i = z * side + x, green = table.mat[i] === Mat.Grass || table.mat[i] === Mat.Soil;
    if (!table.wet[i] && !(green && !(table.has[i] && !(share[i] < 1)))) continue;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && z + dz >= 0 && x + dx < side && z + dz < side) asked[i + dz * side + dx] = 1;
  }
  return pack({
    ...rest, packed: PACKED, side, lift, pair, pairs: Uint16Array.from(pairs),
    share: Uint8Array.from(share, (v) => Math.round(Math.max(0, Math.min(1, v)) * 255)),
    bleach: Uint8Array.from(bleach, (v, i) => (asked[i] ? Math.round(Math.max(0, Math.min(1, v)) * BLEACH_STEPS) : 0)),
    summit: Uint8Array.from(summit, (v) => Math.round(Math.max(0, Math.min(2, v)) * SUMMIT_STEPS)), pale: Uint8Array.from(summit, (v) => (v > SUMMIT ? 1 : 0)),
  } satisfies Packed);
}
export function unpackTable(run: ArrayBuffer): Table {
  const { packed, lift, pair, pairs, share, bleach, summit, pale, ...rest } = unpack<Packed>(run), n = rest.side * rest.side;
  if (packed !== PACKED) throw new Error('table: packed another way');
  const occ = new Float32Array(n), top = new Uint16Array(n), flank = new Uint16Array(n), high = new Float32Array(n);
  const shared = new Float32Array(share.length), bleached = new Float32Array(bleach.length);
  for (let i = 0; i < shared.length; i++) shared[i] = share[i] / 255;
  for (let i = 0; i < bleached.length; i++) bleached[i] = bleach[i] / BLEACH_STEPS;
  for (let i = 0; i < n; i++) {
    occ[i] = rest.h[i] + lift[i];
    if (rest.has[i]) { top[i] = pairs[pair[i] * 2]; flank[i] = pairs[pair[i] * 2 + 1]; }
    // (a pale column stays pale and a grey one grey, whatever the steps make of its height: the list holds single
    // floats, and the threshold itself as a single float lies above the threshold, so both keep clear of it)
    const s = summit[i] / SUMMIT_STEPS;
    high[i] = pale[i] ? Math.max(s, SUMMIT * 1.001) : Math.min(s, SUMMIT * 0.999);
  }
  return { ...rest, occ, top, flank, share: shared, bleach: bleached, summit: high };
}
