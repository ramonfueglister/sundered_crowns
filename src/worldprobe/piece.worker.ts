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
import { loadModels } from './models';
import { FINER_STEPS } from './land';
import { Water, loadWindow } from './region';
import { type Piece, type WorldScene, buildWorld, windowOf } from './world';
import { loadTownPeople } from '../figures';
import { loadInhabitants } from './towns';

export interface PieceJob { id: number; piece: Piece; region: string; /** step of the map: blocks 2^step cells wide */ step: number; base: string; bakedSky: boolean; /** the world's start year, whose towns are built, whose forest stands and whose people live on the land (default 1356) */ year?: number }
export interface PieceDone { id: number; scene?: WorldScene<Shape>; error?: string }

const flat = (b: Batch): Shape => ({ pos: new Float32Array(b.pos), nor: new Float32Array(b.nor), col: new Float32Array(b.col) });
const nothing: Shape = { pos: new Float32Array(0), nor: new Float32Array(0), col: new Float32Array(0) };

self.onmessage = async (e: MessageEvent<PieceJob>) => {
  const { id, piece, region: name, step, base, bakedSky, year } = e.data;
  try {
    // the step's blocks are cells of the data's step `data`, or drawn finer than its finest cells (land.ts)
    const data = Math.max(0, step - FINER_STEPS), w = windowOf(piece.ox, piece.oz);
    const region = await loadWindow(data ? `${name}/z${data}` : name, w.gx0, w.gy0, w.w, w.h, base, 2 ** Math.max(0, FINER_STEPS - step));
    let scene: WorldScene<Shape>;
    if (region.water.every((k) => k === Water.Sea)) scene = { ground: nothing, things: nothing, water: flat(buildOpenSea(piece.ox, piece.oz, piece.part)), cells: [], counts: {} };
    else { if (step === 0) await loadTownPeople(undefined, year); // the persons of the 30 cities walk in their towns (src/figures/people.ts)
      const built = buildWorld(region, piece, gazetteer.places, landmarks.landmarks, bakedSky, step, await loadClimate(base, region.worldW ?? region.mapW, region.worldH ?? region.mapH), await loadInhabitants(base, year), await loadModels(base), await loadForest(base, year, region.worldW ?? region.mapW, region.worldH ?? region.mapH), await loadRural(base, year, region.mapW, region.mapH), await loadArable(base, year, region.mapW, region.mapH)); scene = { ground: flat(built.ground), things: flat(built.things), water: flat(built.water), raised: flat(built.raised!), figures: built.figures, cells: built.cells.map((c) => ({ ...c, far: flat(c.far) })), counts: built.counts }; }
    const lists = [scene.ground, scene.things, scene.water, scene.raised ?? nothing, ...scene.cells.map((c) => c.far)].flatMap((s) => [s.pos, s.nor, s.col]).concat(scene.figures ? [scene.figures.a, scene.figures.b, scene.figures.c, scene.figures.d, scene.figures.e] : []).map((a) => (a as Float32Array).buffer).filter((buf) => buf.byteLength > 0);
    (self as unknown as Worker).postMessage({ id, scene } satisfies PieceDone, lists);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) } satisfies PieceDone);
  }
};
