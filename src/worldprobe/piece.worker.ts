// Builds pieces of the world off the page's own thread: one message asks for a piece, the answer carries its meshes
// as flat lists that are handed over, not copied. A piece of a coarse step whose table was built ahead is drawn from
// that (table.ts), which takes a third of the time and none of the map's data.
import { Batch } from '../lookprobe/batch';
import type { Shape } from '../lookprobe/stage';
import { buildOpenSea } from '../lookprobe/terrain';
import { GRID, N, onGrid } from '../lookprobe/layout';
import { maybeGunzip } from '../render/assets';
import { buildPiece } from './build';
import { type Cover, KINDS, laidOut } from './far';
import { glide } from './glide';
import { above, lay, meanCover, summary } from './mean';
import { faced, flat as floats, small } from './small';
import { bytesOf, pack, unpack } from './pack';
import { folderOf, kept } from './store';
import { type Table, type TablesIndex, drawTable, keepTables, keyOfTable, tabled, unpackTable } from './table';
import type { Piece, WorldScene } from './world';

export interface PieceJob { id: number; piece: Piece; region: string; /** step of the map: blocks 2^step cells wide */ step: number; base: string; bakedSky: boolean; /** the piece is kept on disk under this name, in the folder of this build (store.ts); `kept`: it is there, or may be (the store has not yet said what it holds), and is read if so, not built */ keep?: { build: string; name: string; kept: boolean }; /** the world's start year, whose towns are built, whose forest stands and whose people live on the land (default 1356) */ year?: number; /** false: a far step as far.ts lays it out, not as the mean of the finer step */ mean?: boolean | 'compare'; /** for a piece of the first far step: the summaries of the four finest pieces under it that the page holds (mean.ts), in rows */ under?: (Float32Array | undefined)[]; /** side of the ground the piece is built on, where it is not the usual one (layout.ts: GRID); the piece's ox, oz and part are given on that ground */ grid?: number; /** the piece's lists as small numbers (small.ts), not as floats */ small?: boolean; /** and of those the rectangles on the grid of blocks as faces (lookprobe/faces.ts) */ faces?: boolean; /** false: the piece is built even where its table was built ahead (table.ts) */ tables?: boolean; /** the piece's land as faces that glide to the shape of the coarser piece over it, where that has a table (glide.ts) */ glide?: boolean }
export interface PieceDone { id: number; scene?: WorldScene<Shape>; /** of a piece of the finest step: what it shows, summed up for the piece of the next step over it (mean.ts) */ summary?: Float32Array; /** the piece packed, to be kept on disk (pack.ts) */ packed?: ArrayBuffer; /** the piece was read from disk */ kept?: boolean; error?: string }
/** what is kept of a piece */
type Kept = Pick<PieceDone, 'scene' | 'summary'>;

const nothing: Shape = { pos: new Float32Array(0), nor: new Float32Array(0), col: new Float32Array(0) };
/** from this step on a piece has no houses of its cells and no figures, which stand as they are: such a piece can glide to the coarser step (glide.ts) */
const GLIDES_FROM = 2;

/** What a piece of the finest step shows, summed up four blocks to one of the next step (mean.ts); null where it is open sea. */
function summed(fine: WorldScene | null, part: Piece['part']): Float32Array | null {
  if (!fine) return null;
  const view = above(part.x1 - part.x0, part.z1 - part.z0);
  lay(view, fine.ground, -part.x0, -part.z0, true);
  for (const mesh of [fine.water, fine.raised, fine.things, ...fine.cells.map((c) => c.far)]) if (mesh) lay(view, mesh, -part.x0, -part.z0);
  return summary(view);
}

/**
 * The cover of a piece of the first far step: from the summaries of the four pieces of the finest step under it,
 * those the page still holds and the rest built here.
 */
async function meanOf(job: PieceJob): Promise<Cover> {
  const { ox, oz, part } = job.piece, side = part.x1 - part.x0, quarters: (Float32Array | null)[] = [];
  // the finest block under the piece's first own block, and the finest pieces that hold it and the rest
  const fx = (ox + part.x0) * 2, fz = (oz + part.z0) * 2;
  for (let q = 0; q < 4; q++) quarters.push(job.under?.[q] ?? summed(await buildPiece(job, 0, { ox: fx + (q & 1) * side - part.x0, oz: fz + (q >> 1) * side - part.z0, part }), part));
  return onGrid(job.grid, () => meanCover(quarters, side / 2, N, part.x0, part.z0));
}

/**
 * Measures what far.ts laid out on a piece against the mean of the finer step there (the counts `cmp <kind> …`,
 * sums over the blocks whose four neighbours are of the same kind, so that a tool can take their means): the
 * colours of the tops and sides and the rise, of far.ts (`far`) and of the mean (`mean`), and the top as the far
 * ground is drawn (`drawn`).
 */
function compare(counts: Record<string, number>, mean: Cover, part: Piece['part'], ground: Batch, carried?: Batch) {
  const far = laidOut();
  if (!far?.kind) return;
  // the side of the ground the piece was built on
  const N = Math.round(Math.sqrt(mean.has.length));
  // the tops of the far ground as they are drawn, with the sky's light baked into them
  const drawn = above(N, N);
  lay(drawn, ground, 0, 0, true);
  if (carried) lay(drawn, carried, 0, 0, true);
  const add = (k: string, v: number) => { counts[k] = (counts[k] ?? 0) + v; };
  for (let z = part.z0; z < part.z1; z++) for (let x = part.x0; x < part.x1; x++) {
    const i = x + z * N, kind = far.kind[i];
    if (!mean.has[i]) continue;
    // all the land of the piece, whatever it carries
    add('cmp all n', 1);
    for (let k = 0; k < 3; k++) { add(`cmp all mean top ${k}`, mean.top[i * 3 + k]); add(`cmp all drawn top ${k}`, drawn.top[i * 3 + k]); add(`cmp all mean whole ${k}`, mean.whole![i * 3 + k]); }
    if ([i - 1, i + 1, i - N, i + N].some((j) => far.kind![j] !== kind)) continue;
    const name = `cmp ${KINDS[kind]}`;
    add(`${name} n`, 1); add(`${name} share`, far.share[i]); add(`${name} far rise`, far.rise[i]); add(`${name} mean rise`, mean.rise[i]); add(`${name} risen ${Math.min(3, mean.rise[i])}`, 1);
    for (let k = 0; k < 3; k++) { add(`${name} far top ${k}`, far.has[i] ? far.top[i * 3 + k] : 0); add(`${name} mean top ${k}`, mean.top[i * 3 + k]); add(`${name} far side ${k}`, far.has[i] ? far.side[i * 3 + k] : 0); add(`${name} mean side ${k}`, mean.side[i * 3 + k]); add(`${name} drawn top ${k}`, drawn.top[i * 3 + k]); add(`${name} mean whole ${k}`, mean.whole![i * 3 + k]); }
  }
}

/** the tables built ahead, by where they lie: which pieces have one and which are open sea; null where there are none */
const indexes = new Map<string, Promise<{ index: TablesIndex; land: Set<string>; sea: Set<string> } | null>>();
/** The tables built ahead for a job's region and year, where its piece is laid out as they were; and the piece's place among them. */
async function tablesOf(job: PieceJob) {
  if (job.tables === false || job.mean) return null;
  const { part, ox, oz } = job.piece, wide = part.x1 - part.x0, dir = `${job.base}map/tables/${job.region}_${job.year ?? 1356}/`;
  if (!indexes.has(dir)) indexes.set(dir, fetch(`${dir}index.json`).then(async (r) => {
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
    const index = await r.json() as TablesIndex, keys = (of: Record<string, number[]>) => new Set(Object.entries(of).flatMap(([step, at]) => Array.from({ length: at.length / 2 }, (_, k) => keyOfTable(+step, at[k * 2], at[k * 2 + 1]))));
    return { index, land: keys(index.land), sea: keys(index.sea) };
  }).catch(() => null));
  const tables = await indexes.get(dir)!;
  // (only a piece laid out as the tables were: the same side of ground, with its own columns at the same place)
  if (!tables || tables.index.side !== (job.grid ?? GRID) || tables.index.piece !== wide || part.x0 !== part.z0 || part.x0 * 2 + wide !== tables.index.side) return null;
  return { ...tables, dir, px: (ox + part.x0) / wide, pz: (oz + part.z0) / wide };
}
/** the last tables read, by their files: the pieces under a coarser piece ask for its table one after the other */
const read = new Map<string, Promise<Table | null>>(), READ = 6;
/** The table of a piece that has one; null where it cannot be read. */
function tableAt(dir: string, step: number, px: number, pz: number): Promise<Table | null> {
  const file = `${dir}${step}/${px}_${pz}.bin.gz`, known = read.get(file);
  if (known) return known;
  const table = fetch(file).then(async (r) => {
    if (!r.ok) return null;
    const raw = await maybeGunzip(new Uint8Array(await r.arrayBuffer()));
    return unpackTable((raw.byteOffset || raw.byteLength !== raw.buffer.byteLength ? raw.slice() : raw).buffer as ArrayBuffer);
  // (a table that cannot be read is no table)
  }).catch(() => null);
  read.set(file, table);
  if (read.size > READ) read.delete(read.keys().next().value!);
  return table;
}
/**
 * The piece of a job drawn from its table, where one was built ahead for it (`scene` null: it is open sea), with
 * that table; null where the piece is to be built.
 */
async function tableOf(job: PieceJob): Promise<{ scene: WorldScene | null; table?: Table } | null> {
  const tables = await tablesOf(job);
  if (!tables) return null;
  const key = keyOfTable(job.step, tables.px, tables.pz);
  if (tables.sea.has(key)) return { scene: null };
  if (!tables.land.has(key)) return null;
  const table = await tableAt(tables.dir, job.step, tables.px, tables.pz);
  if (!table || table.ox !== job.piece.ox || table.oz !== job.piece.oz) return null;
  const drawn = drawTable(table, job.bakedSky);
  return { table, scene: { ...drawn, things: new Batch(), cells: [], counts: { triangles: drawn.ground.triangles + (drawn.carried?.triangles ?? 0) + drawn.water.triangles + drawn.raised.triangles } } };
}
/** The table of the piece of the next coarser step over a job's piece, where one was built ahead. */
async function tableOver(job: PieceJob): Promise<Table | null> {
  const tables = await tablesOf(job);
  if (!tables) return null;
  const px = Math.floor(tables.px / 2), pz = Math.floor(tables.pz / 2);
  return tables.land.has(keyOfTable(job.step + 1, px, pz)) ? tableAt(tables.dir, job.step + 1, px, pz) : null;
}

let folder: Promise<FileSystemDirectoryHandle | null> | undefined;
/** The piece of a job as it is kept on disk, if it is. */
async function keptOf(job: PieceJob): Promise<Kept | null> {
  if (!job.keep?.kept) return null;
  const from = await (folder ??= folderOf(job.keep.build)), run = from && await kept(from, job.keep.name);
  // (a file that was cut short is built again, and written again)
  try { return run ? unpack<Kept>(run) : null; } catch { return null; }
}

self.onmessage = async (e: MessageEvent<PieceJob>) => {
  const { id, piece, step, keep } = e.data;
  try {
    const began = performance.now(), had = await keptOf(e.data);
    if (had?.scene) {
      // the counts tell what the piece took this time
      const counts = had.scene.counts;
      for (const name of Object.keys(counts)) if (name.startsWith('ms ') || name.startsWith('pieces ')) delete counts[name];
      counts[`ms kept step ${step}`] = Math.round(performance.now() - began); counts[`pieces kept step ${step}`] = 1;
      (self as unknown as Worker).postMessage({ id, ...had, kept: true } satisfies PieceDone, bytesOf(had));
      return;
    }
    const mean = step === 1 && e.data.mean ? await meanOf(e.data) : null, meant = performance.now();
    // drawn from its table where that was built ahead, built from the map's data where not
    // (a far piece that is to glide and has no table of its own has its columns told as it is built)
    const glides = !!e.data.glide && !!e.data.small && !!e.data.faces && step >= GLIDES_FROM && !mean;
    const ahead = await tableOf(e.data);
    if (!ahead && glides) keepTables(true);
    const built = ahead ? ahead.scene : await buildPiece(e.data, step, piece, e.data.mean === 'compare' ? null : mean), own = ahead ? ahead.table : glides ? tabled() : null;
    keepTables(false);
    if (built && mean && e.data.mean === 'compare') compare(built.counts, mean, piece.part, built.ground, built.carried);
    // how long the piece took to build, and of that the finer step under it (a tool reads the sums)
    if (built) { built.counts[`ms step ${step}`] = Math.round(performance.now() - began); built.counts[`pieces step ${step}`] = 1; if (mean) built.counts['ms mean'] = Math.round(meant - began); if (ahead) built.counts[`pieces from tables step ${step}`] = 1; }
    // (the sea mirrors, by a material of its own, and the houses of a cell are one mesh that gives way to finer ones: both stay lists;
    // so do the water above the sea and the things of a piece that glides, whose every corner moves to its place in the coarser step)
    const flat = e.data.small ? small : floats, solid = e.data.small && e.data.faces ? faced : flat;
    const scene: WorldScene<Shape> = built ? { ground: solid(built.ground), carried: built.carried && solid(built.carried), things: (glides ? flat : solid)(built.things), water: flat(built.water), raised: (glides ? flat : solid)(built.raised!), figures: built.figures, cells: built.cells.map((c) => ({ ...c, far: flat(c.far) })), counts: built.counts }
      : { ground: nothing, things: nothing, water: flat(buildOpenSea(piece.ox, piece.oz, piece.part)), cells: [], counts: {} };
    // the piece glides to the shape of the coarser piece over it, where that has a table
    if (built && glides && own && !built.cells.length && !built.figures) {
      const before = performance.now(), over = await tableOver(e.data);
      if (over) { built.counts[`pieces gliding step ${step}`] = glide(scene, own, over, e.data.bakedSky) ? 1 : 0; built.counts['ms glide'] = Math.round(performance.now() - before); }
    }
    const lists = [scene.ground, scene.carried ?? nothing, scene.things, scene.water, scene.raised ?? nothing, ...scene.cells.map((c) => c.far)].flatMap((s) => [s.pos, s.nor, s.col, ...(s.sink ? [s.sink] : []), ...(s.faces ? [s.faces.geo, s.faces.col, s.faces.nor, ...(s.faces.aim && s.faces.aimCol ? [s.faces.aim, s.faces.aimCol] : [])] : [])]).concat(scene.figures ? [scene.figures.a, scene.figures.b, scene.figures.c, scene.figures.d, scene.figures.e] : []).map((a) => (a as Float32Array).buffer).filter((buf) => buf.byteLength > 0);
    // (summed before the lists are handed over)
    const sum = step === 0 && e.data.mean === true ? summed(built, piece.part) ?? undefined : undefined;
    // (packed before the lists are handed over, too: a copy, which the page passes on to be zipped and written)
    const packed = keep ? pack({ scene, summary: sum } satisfies Kept) : undefined;
    (self as unknown as Worker).postMessage({ id, scene, summary: sum, packed } satisfies PieceDone, [...lists, ...(sum ? [sum.buffer as ArrayBuffer] : []), ...(packed ? [packed] : [])]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) } satisfies PieceDone);
  }
};
