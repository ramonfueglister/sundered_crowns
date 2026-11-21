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
import { type Ground, type GroundTraits, Mat, N, idx, onGrid } from '../lookprobe/layout';
import { buildShore } from '../lookprobe/shore';
import { type Part, buildTerrain, buildWater, sideTopAt } from '../lookprobe/terrain';
import { drawnTops } from '../lookprobe/terrain_woods';
import { HOUSE_NUMBERS, drawHouses, housesBatch, housesIn } from './houses';
import { FAR_FROM_ROADS, ROAD_SHOWS, roadOn } from './roads';
import { CROP_NAMES, drawCrops } from './crops';
import { TREE_NUMBERS, crownTallAt, drawTrees } from './trees';

/**
 * The columns round a piece's own that its picture depends on: the sky's share is taken up to 10.5 columns from a
 * corner (terrain_light.ts `skyShare`), the shore's line over three (shore.ts). The table holds the piece's own columns
 * and this many round them; the rest of its ground is left empty.
 */
export const RIM = 16;

/** The columns of a ground, as lists over all of it (side × side, a column at z * side + x). */
export interface Table {
  /** side of the ground the piece was built on, the world block of its first column, and the piece's own columns */
  side: number;
  ox: number;
  oz: number;
  part: Part;
  /** the ground itself (layout.ts `Ground`) */
  h: Int16Array;
  mat: Uint8Array;
  wet: Uint8Array;
  shore: Uint8Array;
  occ: Float32Array;
  surf: Float32Array;
  /** 1: paved town ground */
  town: Uint8Array;
  /** what the column carries (GroundTraits.cover): 0 nothing, 1 something that stands on the ground, 2 the ground's own */
  has: Uint8Array;
  rise: Uint8Array;
  share: Float32Array;
  /** the colours of its top and of its sides: which of `colours` (three numbers each) */
  top: Uint16Array;
  flank: Uint16Array;
  colours: Float32Array;
  /** how sun-bleached the meadow is; how far up its massif a rock column stands (rock only) */
  bleach: Float32Array | Float64Array;
  summit: Float32Array | Float64Array;
  /** the colour the meadow is pulled towards: which of `tints` (one more than its place there, 0: none), each three numbers of colour and how far */
  tint: Uint8Array;
  tints: number[];
  /** the colour of overgrown steps (GroundTraits.slope) */
  slope?: RGB;
  /**
   * What stands on the piece, where it is no more than one mesh (no houses of a cell, no people): the landmarks, the
   * bridges and the ribbons of the nearest far step, which only it shows. Unlike the rest of a table these are drawn
   * triangles, colours and all, so a change of how they look needs the tables of that step built again.
   */
  things?: { pos: Float32Array; nor: Float32Array; col: Float32Array };
  /** the houses drawn as houses whose middle lies in the piece's own columns (houses.ts, HOUSE_NUMBERS numbers each) */
  houses?: Float32Array;
  /** the trees drawn one by one at the piece's own columns (trees.ts, TREE_NUMBERS to a column, side × side columns) */
  trees?: Uint8Array;
  /** the crops of the lots where the finest step's sheaves are drawn one by one (crops.ts, a byte to a column, side × side columns): the piece's own columns and RIM round them */
  crops?: Uint8Array;
  /** beside `crops`, a furlong of the land register on the columns of its lot: its strips and rows (crops.ts `furlongOf`) */
  furlongs?: Uint8Array;
  /** where the figures are drawn (crowd.ts CROWD_AT): what the finest step has on the four blocks of each column (a byte to a column, side × side columns), the piece's own columns and RIM round them */
  quarters?: Uint8Array;
  /** blocks to the edge of the nearest way's band at the corners of the columns ((side + 1)², roads.ts `roadOn`), where ways run over the ground; off the piece's own and its rim as far as where no way is near */
  road?: Float32Array;
}

/**
 * The list of the tables built ahead for a region and a year (public/map/tables/<region>_<year>/index.json; the
 * table of a piece lies beside it as <step>/<px>_<pz>.tab, zipped as `coding` says, or in a pack: see `packs`): the pieces of the steps `steps` that have a table
 * and those that are open sea, each step's as pairs px, pz one after the other.
 */
export interface TablesIndex {
  about: string;
  region: string;
  year: number;
  /** blocks a side of a piece, and of the ground it was built on (the piece lies in its middle) */
  piece: number;
  side: number;
  steps: number[];
  land: Record<string, number[]>;
  sea: Record<string, number[]>;
  /** the files the tables were built from, each with a stamp of its content */
  inputs: Record<string, string>;
  /**
   * The steps whose tables lie in packs, not each in a file of its own (step 1 has some 16 000): the tables of `by` ×
   * `by` pieces one after the other in <step>/<px / by>_<pz / by>.bin (rounded down), each zipped on its own; `at`
   * holds where each of the step's tables in `land` lies in its pack, its first byte and its length, in that order.
   * A table is fetched from its pack by that range.
   */
  packs?: Record<string, { by: number; at: number[] }>;
  /** how each table is zipped: 'br' Brotli (brotli.ts; a table of its own is then <step>/<px>_<pz>.tab), else gzip (<step>/<px>_<pz>.bin.gz) */
  coding?: 'br';
}

/** Where the table of a piece lies, the `k`th of its step in the index's `land`: its file, and the bytes of it that are the table where it lies in a pack. */
export function whereTable(
  index: TablesIndex,
  step: number,
  px: number,
  pz: number,
  k: number,
): { file: string; range?: [number, number] } {
  const packed = index.packs?.[step];
  if (!packed) return { file: `${step}/${px}_${pz}.${index.coding === 'br' ? 'tab' : 'bin.gz'}` };
  return {
    file: `${step}/${Math.floor(px / packed.by)}_${Math.floor(pz / packed.by)}.bin`,
    range: [packed.at[k * 2], packed.at[k * 2 + 1]],
  };
}
/** A table with what stands on its piece (`Table.things`), where anything does. */
export function withThings(
  table: Table,
  things: { pos: ArrayLike<number>; nor: ArrayLike<number>; col: ArrayLike<number>; triangles: number },
): Table {
  return things.triangles
    ? {
        ...table,
        things: {
          pos: Float32Array.from(things.pos),
          nor: Float32Array.from(things.nor),
          col: Float32Array.from(things.col),
        },
      }
    : table;
}
export const keyOfTable = (step: number, px: number, pz: number) => `${step}:${px},${pz}`;

let wanted = false,
  last: Table | null = null;
/** From now on the table of every ground that is drawn is kept until the next (`tabled`); or no longer. */
export function keepTables(on: boolean) {
  wanted = on;
  last = null;
}
/** The table of the ground drawn last, while tables are kept. */
export const tabled = (): Table | null => last;

/**
 * Draws a ground: its land, with what it carries as a mesh of its own where `covered`, the sea and the water above
 * it, and the banks of the water.
 */
export function drawGround(
  g: Ground,
  t: GroundTraits,
  bakedSky: boolean,
  part: Part,
  covered: boolean,
  roads: Float32Array | null = null,
): { ground: Batch; carried?: Batch; water: Batch; raised: Batch; standing?: Batch } {
  if (wanted) last = tableOf(g, t, part, roads);
  const carried = covered ? new Batch() : undefined,
    ground = buildTerrain(g, t, bakedSky, part, carried),
    water = buildWater(g, false, part),
    raised = buildWater(g, true, part);
  buildShore(ground, g, t, bakedSky, part);
  return { ground, carried, water, raised, standing: standingOn(g, t, housesIn(t.houses, part), part) };
}

/**
 * What stands on a ground drawn from numbers: its trees, the sheaves of its fields, then its houses (the glide finds
 * the houses at the end: glide.ts `housesOver`). The houses as a table keeps them, in floats, so that drawn from it
 * they are the same. No sheaf stands on a column a house stands on (a farmhouse at the end of its field).
 */
function standingOn(g: Ground, t: GroundTraits, houses: Float32Array | undefined, part: Part): Batch | undefined {
  const { trees, crops, furlongs } = t;
  if (!trees && !crops && !houses) return undefined;
  const b = new Batch();
  if (trees) drawTrees(b, trees, g.h, g.ox ?? 0, g.oz ?? 0, part);
  if (crops) {
    const housed = new Uint8Array(N * N);
    for (let k = 0; houses && k + HOUSE_NUMBERS <= houses.length; k += HOUSE_NUMBERS)
      for (let z = Math.max(0, Math.floor(houses[k + 1])); z < Math.min(N, Math.ceil(houses[k + 3])); z++)
        for (let x = Math.max(0, Math.floor(houses[k])); x < Math.min(N, Math.ceil(houses[k + 2])); x++)
          housed[idx(x, z)] = 1;
    drawCrops(b, crops, g.h, g.wet, g.ox ?? 0, g.oz ?? 0, part, (x, z) => !housed[idx(x, z)], furlongs);
  }
  if (houses) drawHouses(b, houses, g.h);
  return b.triangles ? b : undefined;
}

/** The table of a ground of a far step: its columns as the ground's traits tell them, the piece's own and RIM round them; `roads`: the ways' edges at the corners, as the traits were given them. */
export function tableOf(g: Ground, t: GroundTraits, part: Part, roads: Float32Array | null = null): Table {
  const n = N * N,
    colours: number[] = [],
    known = new Map<string, number>(),
    tints: number[] = [],
    tinted = new Map<string, number>();
  const table: Table = {
    side: N,
    ox: g.ox ?? 0,
    oz: g.oz ?? 0,
    part: { ...part },
    h: new Int16Array(n),
    mat: new Uint8Array(n),
    wet: new Uint8Array(n),
    shore: new Uint8Array(n),
    occ: new Float32Array(n),
    surf: new Float32Array(n),
    town: new Uint8Array(n),
    has: new Uint8Array(n),
    rise: new Uint8Array(n),
    share: new Float32Array(n),
    top: new Uint16Array(n),
    flank: new Uint16Array(n),
    colours: new Float32Array(0),
    bleach: new Float64Array(n),
    summit: new Float64Array(n),
    tint: new Uint8Array(n),
    tints,
    slope: t.slope && [t.slope[0], t.slope[1], t.slope[2]],
  };
  const colourOf = (c: readonly [number, number, number]) => {
    const key = `${c[0]},${c[1]},${c[2]}`;
    let k = known.get(key);
    if (k === undefined) {
      k = colours.length / 3;
      if (k > 65535) throw new Error('table: more colours than a table holds');
      known.set(key, k);
      colours.push(c[0], c[1], c[2]);
    }
    return k;
  };
  for (let z = Math.max(0, part.z0 - RIM); z < Math.min(N, part.z1 + RIM); z++)
    for (let x = Math.max(0, part.x0 - RIM); x < Math.min(N, part.x1 + RIM); x++) {
      const i = idx(x, z);
      table.h[i] = g.h[i];
      table.mat[i] = g.mat[i];
      table.wet[i] = g.wet[i];
      table.shore[i] = g.shore[i];
      table.occ[i] = g.occ[i];
      table.surf[i] = g.surf[i];
      table.town[i] = t.city(x, z) ? 1 : 0;
      table.bleach[i] = t.bleach(x, z);
      if (g.mat[i] === Mat.Rock) table.summit[i] = t.summit(x, z);
      const tint = t.tint?.(x, z);
      if (tint) {
        const key = `${tint[0][0]},${tint[0][1]},${tint[0][2]},${tint[1]}`;
        let k = tinted.get(key);
        if (k === undefined) {
          k = tints.length / 4 + 1;
          if (k > 255) throw new Error('table: more tints than a table holds');
          tinted.set(key, k);
          tints.push(tint[0][0], tint[0][1], tint[0][2], tint[1]);
        }
        table.tint[i] = k;
      }
      const cover = t.cover?.(x, z);
      if (!cover) continue;
      table.has[i] = cover.stands === false ? 2 : 1;
      table.rise[i] = cover.rise;
      table.share[i] = cover.share ?? 1;
      table.top[i] = colourOf(cover.top);
      table.flank[i] = colourOf(cover.side);
    }
  table.colours = new Float32Array(colours);
  const houses = housesIn(t.houses, part);
  if (houses) table.houses = houses;
  if (t.trees) {
    const trees = new Uint8Array(n * TREE_NUMBERS);
    for (let z = part.z0; z < part.z1; z++)
      for (let x = part.x0; x < part.x1; x++)
        for (let q = 0; q < TREE_NUMBERS; q++)
          trees[idx(x, z) * TREE_NUMBERS + q] = t.trees[idx(x, z) * TREE_NUMBERS + q];
    if (trees.some((v) => v > 0)) table.trees = trees;
  }
  if (t.crops) {
    const crops = new Uint8Array(n),
      furlongs = new Uint8Array(n);
    for (let z = Math.max(0, part.z0 - RIM); z < Math.min(N, part.z1 + RIM); z++)
      for (let x = Math.max(0, part.x0 - RIM); x < Math.min(N, part.x1 + RIM); x++) {
        crops[idx(x, z)] = t.crops[idx(x, z)];
        furlongs[idx(x, z)] = t.furlongs?.[idx(x, z)] ?? 0;
      }
    if (crops.some((v) => v > 0)) table.crops = crops;
    if (furlongs.some((v) => v > 0)) table.furlongs = furlongs;
  }
  if (t.quarters) {
    const quarters = new Uint8Array(n);
    for (let z = Math.max(0, part.z0 - RIM); z < Math.min(N, part.z1 + RIM); z++)
      for (let x = Math.max(0, part.x0 - RIM); x < Math.min(N, part.x1 + RIM); x++)
        quarters[idx(x, z)] = t.quarters[idx(x, z)];
    if (quarters.some((v) => v > 0)) table.quarters = quarters;
  }
  if (roads) {
    const road = new Float32Array((N + 1) * (N + 1)).fill(FAR_FROM_ROADS);
    for (let z = Math.max(0, part.z0 - RIM); z <= Math.min(N, part.z1 + RIM); z++)
      for (let x = Math.max(0, part.x0 - RIM); x <= Math.min(N, part.x1 + RIM); x++)
        road[z * (N + 1) + x] = roads[z * (N + 1) + x];
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
  readonly sideTop: number;
  readonly crownTall: number;
  readonly houses: GroundTraits['houses'];
  readonly trees: GroundTraits['trees'];
  readonly crops: GroundTraits['crops'];
  readonly furlongs: GroundTraits['furlongs'];
  readonly quarters: GroundTraits['quarters'];
  private readonly side: number;
  private readonly last: number;
  private readonly pulls: (readonly [RGB, number])[] = [];
  constructor(
    private readonly table: Table,
    step: number,
  ) {
    this.slope = table.slope;
    this.sideTop = sideTopAt(step);
    this.crownTall = crownTallAt(step);
    this.houses = table.houses;
    this.trees = table.trees;
    this.crops = table.crops;
    this.furlongs = table.furlongs;
    this.quarters = table.quarters;
    this.side = table.side;
    this.last = table.side - 1;
    const tints = table.tints;
    for (let k = 0; k < tints.length; k += 4) this.pulls.push([[tints[k], tints[k + 1], tints[k + 2]], tints[k + 3]]);
  }
  /** the column a point lies in */
  private cell(x: number, z: number) {
    const last = this.last;
    return Math.max(0, Math.min(last, Math.floor(z))) * this.side + Math.max(0, Math.min(last, Math.floor(x)));
  }
  private colour(k: number): RGB {
    const colours = this.table.colours;
    return [colours[k * 3], colours[k * 3 + 1], colours[k * 3 + 2]];
  }
  city(x: number, z: number) {
    return this.table.town[this.cell(x, z)] === 1;
  }
  plaza() {
    return Infinity;
  }
  road(x: number, z: number) {
    const road = this.table.road;
    return road ? roadOn(road, x, z) + ROAD_SHOWS : Infinity;
  }
  crop(x: number, z: number) {
    const crops = this.table.crops;
    return crops ? CROP_NAMES[crops[this.cell(x, z)]] : null;
  }
  bleach(x: number, z: number) {
    return this.table.bleach[this.cell(x, z)];
  }
  summit(x: number, z: number) {
    return this.table.summit[this.cell(x, z)];
  }
  tint(x: number, z: number) {
    return this.pulls[this.table.tint[this.cell(x, z)] - 1] ?? null;
  }
  cover(x: number, z: number) {
    const table = this.table,
      i = z * this.side + x;
    return table.has[i]
      ? {
          top: this.colour(table.top[i]),
          side: this.colour(table.flank[i]),
          rise: table.rise[i],
          share: table.share[i],
          stands: table.has[i] === 1,
        }
      : null;
  }
}
/** `step`: the step of the map the table's piece belongs to (the tables hold nothing of the look, so not that either) */
const traitsOf = (table: Table, step: number): GroundTraits => new TableTraits(table, step);

/**
 * Draws the land of a part of a table's own columns, without water and banks: what the piece shows there on its
 * columns' tops and sides (glide.ts asks the coarser piece for it).
 */
export function drawLand(table: Table, bakedSky: boolean, part: Part, step: number): { ground: Batch; carried: Batch } {
  const g: Ground = {
    h: table.h,
    mat: table.mat,
    wet: table.wet,
    shore: table.shore,
    occ: table.occ,
    surf: table.surf,
    ox: table.ox,
    oz: table.oz,
  };
  return onGrid(table.side, () => {
    const carried = new Batch();
    return { ground: buildTerrain(g, traitsOf(table, step), bakedSky, part, carried), carried };
  });
}

/** The tops of a table's columns as they are drawn: where trees stand, lower than the table has them (terrain_woods.ts `drawnTops`). */
export function drawnHeights(table: Table): ArrayLike<number> {
  const g: Ground = {
    h: table.h,
    mat: table.mat,
    wet: table.wet,
    shore: table.shore,
    occ: table.occ,
    surf: table.surf,
    ox: table.ox,
    oz: table.oz,
  };
  return onGrid(table.side, () => drawnTops(g, traitsOf(table, 0)));
}

/** Draws the banks of the water in a part of a table's own columns, as the piece has them there (glide.ts asks the coarser piece for them). */
export function drawBanks(table: Table, bakedSky: boolean, part: Part): Batch {
  const g: Ground = {
    h: table.h,
    mat: table.mat,
    wet: table.wet,
    shore: table.shore,
    occ: table.occ,
    surf: table.surf,
    ox: table.ox,
    oz: table.oz,
  };
  return onGrid(table.side, () => {
    const banks = new Batch();
    buildShore(banks, g, traitsOf(table, 0), bakedSky, part);
    return banks;
  });
}

/** The houses of a table drawn as its piece draws them, with where each ends among their corners (houses.ts `drawHouses`). */
export function housesOf(table: Table): { batch: Batch; ends: number[] } | undefined {
  return onGrid(table.side, () => housesBatch(table.houses, table.h));
}

/** Draws the piece of a table, as its build drew it. */
export function drawTable(
  table: Table,
  bakedSky: boolean,
  step: number,
): { ground: Batch; carried?: Batch; water: Batch; raised: Batch; standing?: Batch } {
  const g: Ground = {
    h: table.h,
    mat: table.mat,
    wet: table.wet,
    shore: table.shore,
    occ: table.occ,
    surf: table.surf,
    ox: table.ox,
    oz: table.oz,
  };
  const keeping = wanted;
  wanted = false;
  try {
    return onGrid(table.side, () => drawGround(g, traitsOf(table, step), bakedSky, table.part, true));
  } finally {
    wanted = keeping;
  }
}
