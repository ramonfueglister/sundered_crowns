// Builds pieces of the world off the page's own thread: one message asks for a piece, the answer carries its meshes
// as flat lists that are handed over, not copied.
import gazetteer from '../../data/content/gazetteer.json';
import landmarks from '../../data/content/landmarks.json';
import type { Batch } from '../lookprobe/batch';
import type { Shape, StageScene } from '../lookprobe/stage';
import { buildOpenSea } from '../lookprobe/terrain';
import { Water, loadWindow } from './region';
import { type Piece, buildWorld, windowOf } from './world';

export interface PieceJob { id: number; piece: Piece; region: string; /** step of the map: blocks 2^step cells wide */ step: number; base: string; bakedSky: boolean }
export interface PieceDone { id: number; scene?: StageScene<Shape>; error?: string }

const flat = (b: Batch): Shape => ({ pos: new Float32Array(b.pos), nor: new Float32Array(b.nor), col: new Float32Array(b.col) });
const nothing: Shape = { pos: new Float32Array(0), nor: new Float32Array(0), col: new Float32Array(0) };

self.onmessage = async (e: MessageEvent<PieceJob>) => {
  const { id, piece, region: name, step, base, bakedSky } = e.data;
  try {
    const w = windowOf(piece.ox, piece.oz), region = await loadWindow(step ? `${name}/z${step}` : name, w.gx0, w.gy0, w.w, w.h, base);
    let scene: StageScene<Shape>;
    if (region.water.every((k) => k === Water.Sea)) scene = { ground: nothing, things: nothing, water: flat(buildOpenSea(piece.ox, piece.oz, piece.part)), counts: {} };
    else { const built = buildWorld(region, piece, gazetteer.places, landmarks.landmarks, bakedSky, step); scene = { ground: flat(built.ground), things: flat(built.things), water: flat(built.water), raised: flat(built.raised!), counts: built.counts }; }
    const lists = [scene.ground, scene.things, scene.water, scene.raised ?? nothing].flatMap((s) => [s.pos, s.nor, s.col]).map((a) => (a as Float32Array).buffer).filter((buf) => buf.byteLength > 0);
    (self as unknown as Worker).postMessage({ id, scene } satisfies PieceDone, lists);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) } satisfies PieceDone);
  }
};
