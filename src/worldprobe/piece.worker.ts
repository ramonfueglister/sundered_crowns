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
import { loadModels } from './models';
import { FINER_STEPS } from './land';
import { Water, loadWindow } from './region';
import { type Piece, type WorldScene, buildWorld, windowOf } from './world';
import type { Cover } from './far';
import { above, lay, meanCover } from './mean';
import { N } from '../lookprobe/layout';
import { loadTownPeople } from '../figures';
import { loadInhabitants } from './towns';

export interface PieceJob { id: number; piece: Piece; region: string; /** step of the map: blocks 2^step cells wide */ step: number; base: string; bakedSky: boolean; /** the world's start year, whose towns are built, whose forest stands and whose people live on the land (default 1356) */ year?: number; /** false: a far step as far.ts lays it out, not as the mean of the finer step */ mean?: boolean }
export interface PieceDone { id: number; scene?: WorldScene<Shape>; error?: string }

const flat = (b: Batch): Shape => ({ pos: new Float32Array(b.pos), nor: new Float32Array(b.nor), col: new Float32Array(b.col) });
const nothing: Shape = { pos: new Float32Array(0), nor: new Float32Array(0), col: new Float32Array(0) };

/** Builds a piece of a step; null where it is open sea. `mean`: the cover of its ground from the finer step. */
async function build(job: PieceJob, step: number, piece: Piece, mean: Cover | null = null): Promise<WorldScene | null> {
  const { region: name, base, bakedSky, year } = job;
  // the step's blocks are cells of the data's step `data`, or drawn finer than its finest cells (land.ts)
  const data = Math.max(0, step - FINER_STEPS), w = windowOf(piece.ox, piece.oz);
  const region = await loadWindow(data ? `${name}/z${data}` : name, w.gx0, w.gy0, w.w, w.h, base, 2 ** Math.max(0, FINER_STEPS - step));
  if (region.water.every((k) => k === Water.Sea)) return null;
  if (step === 0) await loadTownPeople(undefined, year); // the persons of the 30 cities walk in their towns (src/figures/people.ts)
  return buildWorld(region, piece, gazetteer.places, landmarks.landmarks, bakedSky, step, await loadClimate(base, region.worldW ?? region.mapW, region.worldH ?? region.mapH), await loadInhabitants(base, year), await loadModels(base), await loadForest(base, year, region.worldW ?? region.mapW, region.worldH ?? region.mapH), await loadRural(base, year, region.mapW, region.mapH), await loadArable(base, year, region.mapW, region.mapH), await loadHamletLands(base, year ?? 1356), mean);
}

/**
 * The cover of a piece of the first far step: the four pieces of the finest step under it are built and looked at
 * from straight above (mean.ts).
 */
async function meanOf(job: PieceJob): Promise<Cover> {
  const { ox, oz, part } = job.piece, side = part.x1 - part.x0, view = above(side * 2, (part.z1 - part.z0) * 2);
  // the finest block under the piece's first own block, and the finest pieces that hold it and the rest
  const fx = (ox + part.x0) * 2, fz = (oz + part.z0) * 2;
  for (let q = 0; q < 4; q++) {
    const piece: Piece = { ox: fx + (q & 1) * side - part.x0, oz: fz + (q >> 1) * side - part.z0, part };
    const fine = await build(job, 0, piece);
    if (!fine) continue;
    const dx = piece.ox - fx, dz = piece.oz - fz;
    lay(view, fine.ground, dx, dz, true);
    for (const mesh of [fine.water, fine.raised, fine.things, ...fine.cells.map((c) => c.far)]) if (mesh) lay(view, mesh, dx, dz);
  }
  return meanCover(view, N, part.x0, part.z0);
}

self.onmessage = async (e: MessageEvent<PieceJob>) => {
  const { id, piece, step } = e.data;
  try {
    const began = performance.now(), mean = step === 1 && e.data.mean !== false ? await meanOf(e.data) : null, meant = performance.now();
    const built = await build(e.data, step, piece, mean);
    // how long the piece took to build, and of that the finer step under it (a tool reads the sums)
    if (built) { built.counts[`ms step ${step}`] = Math.round(performance.now() - began); built.counts[`pieces step ${step}`] = 1; if (mean) built.counts['ms mean'] = Math.round(meant - began); }
    const scene: WorldScene<Shape> = built ? { ground: flat(built.ground), things: flat(built.things), water: flat(built.water), raised: flat(built.raised!), figures: built.figures, cells: built.cells.map((c) => ({ ...c, far: flat(c.far) })), counts: built.counts }
      : { ground: nothing, things: nothing, water: flat(buildOpenSea(piece.ox, piece.oz, piece.part)), cells: [], counts: {} };
    const lists = [scene.ground, scene.things, scene.water, scene.raised ?? nothing, ...scene.cells.map((c) => c.far)].flatMap((s) => [s.pos, s.nor, s.col]).concat(scene.figures ? [scene.figures.a, scene.figures.b, scene.figures.c, scene.figures.d, scene.figures.e] : []).map((a) => (a as Float32Array).buffer).filter((buf) => buf.byteLength > 0);
    (self as unknown as Worker).postMessage({ id, scene } satisfies PieceDone, lists);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) } satisfies PieceDone);
  }
};
