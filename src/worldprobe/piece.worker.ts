// Builds pieces of the world off the page's own thread: one message asks for a piece, the answer carries its meshes
// as flat lists that are handed over, not copied.
import gazetteer from '../../data/content/gazetteer.json';
import landmarks from '../../data/content/landmarks.json';
import cities from '../sim/content/cities_1356.json';
import type { Batch } from '../lookprobe/batch';
import type { Shape, StageScene } from '../lookprobe/stage';
import { buildOpenSea } from '../lookprobe/terrain';
import { loadClimate } from './climate';
import { loadModels } from './models';
import { Water, loadWindow } from './region';
import { type Piece, buildWorld, windowOf } from './world';
import { loadTownPeople } from '../figures';

export interface PieceJob { id: number; piece: Piece; region: string; /** step of the map: blocks 2^step cells wide */ step: number; base: string; bakedSky: boolean }
export interface PieceDone { id: number; scene?: StageScene<Shape>; error?: string }

/** the people of the great cities, which are known better than the gazetteer says (tools/people/build_cities.py): by the place's index in the gazetteer */
const inhabitants = new Map<number, number>();
for (const c of cities.cities) inhabitants.set(c.site, (inhabitants.get(c.site) ?? 0) + c.people);
const flat = (b: Batch): Shape => ({ pos: new Float32Array(b.pos), nor: new Float32Array(b.nor), col: new Float32Array(b.col) });
const nothing: Shape = { pos: new Float32Array(0), nor: new Float32Array(0), col: new Float32Array(0) };

self.onmessage = async (e: MessageEvent<PieceJob>) => {
  const { id, piece, region: name, step, base, bakedSky } = e.data;
  try {
    const w = windowOf(piece.ox, piece.oz), region = await loadWindow(step ? `${name}/z${step}` : name, w.gx0, w.gy0, w.w, w.h, base);
    let scene: StageScene<Shape>;
    if (region.water.every((k) => k === Water.Sea)) scene = { ground: nothing, things: nothing, water: flat(buildOpenSea(piece.ox, piece.oz, piece.part)), counts: {} };
    else { if (step === 0) await loadTownPeople(); // the persons of the 30 cities walk in their towns (src/figures/people.ts)
      const built = buildWorld(region, piece, gazetteer.places, landmarks.landmarks, bakedSky, step, await loadClimate(base, region.worldW ?? region.mapW, region.worldH ?? region.mapH), inhabitants, await loadModels(base)); scene = { ground: flat(built.ground), things: flat(built.things), water: flat(built.water), raised: flat(built.raised!), figures: built.figures, counts: built.counts }; }
    const lists = [scene.ground, scene.things, scene.water, scene.raised ?? nothing].flatMap((s) => [s.pos, s.nor, s.col]).concat(scene.figures ? [scene.figures.a, scene.figures.b, scene.figures.c, scene.figures.d, scene.figures.e] : []).map((a) => (a as Float32Array).buffer).filter((buf) => buf.byteLength > 0);
    (self as unknown as Worker).postMessage({ id, scene } satisfies PieceDone, lists);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) } satisfies PieceDone);
  }
};
