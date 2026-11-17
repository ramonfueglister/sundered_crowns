// Builds pieces of the world off the page's own thread: one message asks for a piece, the answer carries its meshes
// as flat lists that are handed over, not copied.
import gazetteer from '../../data/content/gazetteer.json';
import landmarks from '../../data/content/landmarks.json';
import type { Batch } from '../lookprobe/batch';
import type { Shape } from '../lookprobe/stage';
import { buildOpenSea } from '../lookprobe/terrain';
import { loadClimate } from './climate';
import { loadForest } from './forest';
import { loadRural } from './rural';
import { loadArable } from './arable';
import { loadHamletLands } from './hamlets';
import { loadParcels } from './lots';
import { loadModels } from './models';
import { FINER_STEPS } from './land';
import { Water, loadWindow } from './region';
import { type Piece, type WorldScene, buildWorld, windowOf } from './world';
import { type Cover, KINDS, laidOut, loadPlan, usePlan } from './far';
import { above, lay, meanCover, summary } from './mean';
import { N } from '../lookprobe/layout';
import { ballOf } from './ball';
import { bytesOf, pack, unpack } from './pack';
import { folderOf, kept } from './store';
import { loadTownPeople } from '../figures';
import { loadInhabitants } from './towns';

export interface PieceJob { id: number; piece: Piece; region: string; /** step of the map: blocks 2^step cells wide */ step: number; base: string; bakedSky: boolean; /** the piece is kept on disk under this name, in the folder of this build (store.ts); `kept`: it is there, and is read, not built */ keep?: { build: string; name: string; kept: boolean }; /** the world's start year, whose towns are built, whose forest stands and whose people live on the land (default 1356) */ year?: number; /** false: a far step as far.ts lays it out, not as the mean of the finer step */ mean?: boolean | 'compare'; /** for a piece of the first far step: the summaries of the four finest pieces under it that the page holds (mean.ts), in rows */ under?: (Float32Array | undefined)[] }
export interface PieceDone { id: number; scene?: WorldScene<Shape>; /** of a piece of the finest step: what it shows, summed up for the piece of the next step over it (mean.ts) */ summary?: Float32Array; /** the piece packed, to be kept on disk (pack.ts) */ packed?: ArrayBuffer; /** the piece was read from disk */ kept?: boolean; error?: string }
/** what is kept of a piece */
type Kept = Pick<PieceDone, 'scene' | 'summary'>;

const flat = (b: Batch): Shape => { const pos = new Float32Array(b.pos); return { pos, nor: new Float32Array(b.nor), col: new Float32Array(b.col), ball: ballOf(pos) }; };
const nothing: Shape = { pos: new Float32Array(0), nor: new Float32Array(0), col: new Float32Array(0) };

/** Builds a piece of a step; null where it is open sea. `mean`: the cover of its ground from the finer step. */
async function build(job: PieceJob, step: number, piece: Piece, mean: Cover | null = null): Promise<WorldScene | null> {
  const { region: name, base, bakedSky, year } = job;
  // the step's blocks are cells of the data's step `data`, or drawn finer than its finest cells (land.ts)
  const data = Math.max(0, step - FINER_STEPS), w = windowOf(piece.ox, piece.oz);
  const region = await loadWindow(data ? `${name}/z${data}` : name, w.gx0, w.gy0, w.w, w.h, base, 2 ** Math.max(0, FINER_STEPS - step));
  if (region.water.every((k) => k === Water.Sea)) return null;
  // a far step lays out its places by the plan of the finest step, where there is one (far.ts)
  if (step > 0) usePlan(await loadPlan(base, year ?? 1356));
  if (step === 0) await loadTownPeople(undefined, year); // the persons of the 30 cities walk in their towns (src/figures/people.ts)
  return buildWorld(region, piece, gazetteer.places, landmarks.landmarks, bakedSky, step, await loadClimate(base, region.worldW ?? region.mapW, region.worldH ?? region.mapH), await loadInhabitants(base, year), await loadModels(base), await loadForest(base, year, region.worldW ?? region.mapW, region.worldH ?? region.mapH), await loadRural(base, year, region.mapW, region.mapH), await loadArable(base, year, region.mapW, region.mapH), await loadHamletLands(base, year ?? 1356), await loadParcels(base, year ?? 1356), undefined, mean);
}

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
  for (let q = 0; q < 4; q++) quarters.push(job.under?.[q] ?? summed(await build(job, 0, { ox: fx + (q & 1) * side - part.x0, oz: fz + (q >> 1) * side - part.z0, part }), part));
  return meanCover(quarters, side / 2, N, part.x0, part.z0);
}

/**
 * Measures what far.ts laid out on a piece against the mean of the finer step there (the counts `cmp <kind> …`,
 * sums over the blocks whose four neighbours are of the same kind, so that a tool can take their means): the
 * colours of the tops and sides and the rise, of far.ts (`far`) and of the mean (`mean`), and the top as the far
 * ground is drawn (`drawn`).
 */
function compare(counts: Record<string, number>, mean: Cover, part: Piece['part'], ground: Batch) {
  const far = laidOut();
  if (!far?.kind) return;
  // the tops of the far ground as they are drawn, with the sky's light baked into them
  const drawn = above(N, N);
  lay(drawn, ground, 0, 0, true);
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

let folder: Promise<FileSystemDirectoryHandle | null> | undefined;
/** The piece of a job as it is kept on disk, if it is. */
async function read(job: PieceJob): Promise<Kept | null> {
  if (!job.keep?.kept) return null;
  const from = await (folder ??= folderOf(job.keep.build)), run = from && await kept(from, job.keep.name);
  // (a file that was cut short is built again, and written again)
  try { return run ? unpack<Kept>(run) : null; } catch { return null; }
}

self.onmessage = async (e: MessageEvent<PieceJob>) => {
  const { id, piece, step, keep } = e.data;
  try {
    const began = performance.now(), had = await read(e.data);
    if (had?.scene) {
      // the counts tell what the piece took this time
      const counts = had.scene.counts;
      for (const name of Object.keys(counts)) if (name.startsWith('ms ') || name.startsWith('pieces ')) delete counts[name];
      counts[`ms kept step ${step}`] = Math.round(performance.now() - began); counts[`pieces kept step ${step}`] = 1;
      (self as unknown as Worker).postMessage({ id, ...had, kept: true } satisfies PieceDone, bytesOf(had));
      return;
    }
    const mean = step === 1 && e.data.mean ? await meanOf(e.data) : null, meant = performance.now();
    const built = await build(e.data, step, piece, e.data.mean === 'compare' ? null : mean);
    if (built && mean && e.data.mean === 'compare') compare(built.counts, mean, piece.part, built.ground);
    // how long the piece took to build, and of that the finer step under it (a tool reads the sums)
    if (built) { built.counts[`ms step ${step}`] = Math.round(performance.now() - began); built.counts[`pieces step ${step}`] = 1; if (mean) built.counts['ms mean'] = Math.round(meant - began); }
    const scene: WorldScene<Shape> = built ? { ground: flat(built.ground), things: flat(built.things), water: flat(built.water), raised: flat(built.raised!), figures: built.figures, cells: built.cells.map((c) => ({ ...c, far: flat(c.far) })), counts: built.counts }
      : { ground: nothing, things: nothing, water: flat(buildOpenSea(piece.ox, piece.oz, piece.part)), cells: [], counts: {} };
    const lists = [scene.ground, scene.things, scene.water, scene.raised ?? nothing, ...scene.cells.map((c) => c.far)].flatMap((s) => [s.pos, s.nor, s.col]).concat(scene.figures ? [scene.figures.a, scene.figures.b, scene.figures.c, scene.figures.d, scene.figures.e] : []).map((a) => (a as Float32Array).buffer).filter((buf) => buf.byteLength > 0);
    // (summed before the lists are handed over)
    const sum = step === 0 && e.data.mean === true ? summed(built, piece.part) ?? undefined : undefined;
    // (packed before the lists are handed over, too: a copy, which the page passes on to be zipped and written)
    const packed = keep ? pack({ scene, summary: sum } satisfies Kept) : undefined;
    (self as unknown as Worker).postMessage({ id, scene, summary: sum, packed } satisfies PieceDone, [...lists, ...(sum ? [sum.buffer as ArrayBuffer] : []), ...(packed ? [packed] : [])]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) } satisfies PieceDone);
  }
};
