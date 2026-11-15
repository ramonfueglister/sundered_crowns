// The pieces of the world on the stage. The world is built in pieces of PIECE × PIECE blocks, at the step of the map
// the view calls for (zoom.ts), by workers off the page's thread. So that the picture never shows a hole or changes
// all at once, the pieces form a pyramid: under the pieces of the view's step lie those of the next coarser step, each
// covering four of them, and a piece is shown only once all of its neighbours under the same coarser piece are there.
// Until then the coarser piece stands in, and where that is missing too, finer pieces left from before. Pieces around
// the picture are built ahead of need.
import type * as THREE from 'three/webgpu';
import { N, NEAR, RIGHT, SEA_Y } from '../lookprobe/layout';
import type { Stage } from '../lookprobe/stage';
import type { PieceDone, PieceJob } from './piece.worker';
import { cover, keyOf } from './pyramid';
import { COARSEST, paperOf, reliefOf, stepOf } from './zoom';

/** side of a piece in blocks; each is built on a ground of N blocks, so that it knows the land around it */
const PIECE = 200, MARGIN = (N - PIECE) / 2;
/** pieces are built ahead of need this far around the picture, as a share of its width */
const AHEAD = 0.3;
/** pieces kept on the stage beyond those the view asks for */
const SPARE = 10;
/** the stage counts its blocks from a home near the view; a new home is taken when the view has moved this far from it */
const HOME_REACH = 3000;

/** The view: the place at the middle of the picture in the finest blocks, how many of them lie across it, the picture's shape and width in pixels, and how far the camera looks down. */
export interface View { x: number; z: number; wide: number; aspect: number; pixels: number; elevation: number }
/** How the stage is laid out for a view: its blocks are `coarse` finest blocks wide and counted from `home`. */
export interface Layout { step: number; coarse: number; homeX: number; homeZ: number }
interface Held { group: THREE.Group; step: number; px: number; pz: number; /** the last look that showed or asked for it */ seen: number }
interface Spot { key: string; step: number; px: number; pz: number }

export interface Pieces {
  /** Brings the stage to the view: asks for what is missing, shows what covers the picture best. Returns the layout and how many pieces of the picture are still to come. */
  look(view: View): Layout & { missing: number };
  /** the first error of a worker, if any */
  failed: string;
}

/**
 * `ahead`: build the coarser step and the surroundings of the picture too (a tool that takes one picture does not
 * need them). `changed` is called whenever a piece has arrived.
 */
export function createPieces(stage: Stage, o: { region: string; base: string; bakedSky: boolean; ahead: boolean; changed(): void }): Pieces {
  const held = new Map<string, Held>(), building = new Set<string>(), jobs = new Map<number, Spot>(), idle: Worker[] = [];
  const pieces: Pieces = { look, failed: '' };
  let nextId = 1, looks = 0, layout: Layout = { step: -1, coarse: 1, homeX: 0, homeZ: 0 };

  for (let k = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)); k > 0; k--) {
    const worker = new Worker(new URL('./piece.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<PieceDone>) => {
      const spot = jobs.get(e.data.id)!;
      jobs.delete(e.data.id); building.delete(spot.key); idle.push(worker);
      if (e.data.error) pieces.failed ||= e.data.error;
      else if (e.data.scene) {
        const group = stage.add(e.data.scene);
        group.visible = false;
        held.set(spot.key, { group, step: spot.step, px: spot.px, pz: spot.pz, seen: looks });
        for (const [name, n] of Object.entries(e.data.scene.counts)) stage.probe.counts[name] = (stage.probe.counts[name] ?? 0) + n;
      }
      o.changed();
    };
    worker.onerror = (e) => { pieces.failed ||= e.message; o.changed(); };
    idle.push(worker);
  }

  /** how far a piece lies outside the picture, in finest blocks (0: it reaches into it) */
  function outside(v: View, step: number, px: number, pz: number): number {
    const side = PIECE * 2 ** step, cx = (px + 0.5) * side - v.x, cz = (pz + 0.5) * side - v.z;
    const right = cx * RIGHT[0] + cz * RIGHT[1], near = cx * NEAR[0] + cz * NEAR[1];
    // a piece reaches half its diagonal from its middle, and what stands on it leans into the picture
    const deep = v.wide / v.aspect / Math.sin((v.elevation * Math.PI) / 180), reach = side * 0.71 + 30 * 2 ** step;
    return Math.max(0, Math.abs(right) - v.wide / 2 - reach, Math.abs(near) - deep / 2 - reach);
  }
  /** the pieces of a step within `around` finest blocks of the picture */
  function near(v: View, step: number, around: number): (Spot & { out: number; far: number })[] {
    const side = PIECE * 2 ** step, px0 = Math.floor(v.x / side), pz0 = Math.floor(v.z / side), list = [];
    const span = Math.ceil((v.wide / Math.sin((v.elevation * Math.PI) / 180) + around) / side) + 2;
    for (let pz = pz0 - span; pz <= pz0 + span; pz++) for (let px = px0 - span; px <= px0 + span; px++) {
      const out = outside(v, step, px, pz);
      if (out <= around) list.push({ key: keyOf(step, px, pz), step, px, pz, out, far: Math.hypot((px + 0.5) * side - v.x, (pz + 0.5) * side - v.z) });
    }
    return list;
  }

  function look(v: View): Layout & { missing: number } {
    const step = stepOf(v.wide), coarse = 2 ** step, blocks = paperOf(v.wide) < 1;
    if (step !== layout.step || Math.abs(v.x / coarse - layout.homeX) > HOME_REACH || Math.abs(v.z / coarse - layout.homeZ) > HOME_REACH)
      layout = { step, coarse, homeX: Math.floor(v.x / coarse / PIECE) * PIECE, homeZ: Math.floor(v.z / coarse / PIECE) * PIECE };
    looks++;

    // what the view asks for: the coarser step under the picture first, then its own step in the picture, then around it
    const wanted: (Spot & { rank: number })[] = [];
    if (blocks) {
      const around = o.ahead ? AHEAD * v.wide : 0;
      for (const p of near(v, step, around)) wanted.push({ ...p, rank: (p.out > 0 ? 2e9 : 1e9) + p.far });
      // a coarser piece is four times the size, so those of the picture reach far enough around it
      if (o.ahead && step < COARSEST) for (const p of near(v, step + 1, 0)) wanted.push({ ...p, rank: p.far });
    }
    let missing = 0;
    for (const w of wanted) { const h = held.get(w.key); if (h) h.seen = looks; else if (w.step === step && w.rank < 2e9) missing++; }
    const queue = wanted.filter((w) => !held.has(w.key) && !building.has(w.key)).sort((a, b) => b.rank - a.rank);
    while (idle.length && queue.length) {
      const next = queue.pop()!, worker = idle.pop()!, id = nextId++;
      jobs.set(id, next); building.add(next.key);
      worker.postMessage({ id, step: next.step, piece: { ox: next.px * PIECE - MARGIN, oz: next.pz * PIECE - MARGIN, part: { x0: MARGIN, z0: MARGIN, x1: MARGIN + PIECE, z1: MARGIN + PIECE } }, region: o.region, base: o.base, bakedSky: o.bakedSky } satisfies PieceJob);
    }

    // what is shown: from the coarsest pieces down, a piece gives way to the four under it once they cover their share
    const top = Math.min(COARSEST, step + 2);
    const shown = blocks ? cover(step, top, near(v, top, 0).map((p) => [p.px, p.pz] as const), (s, px, pz) => held.get(keyOf(s, px, pz)), (s, px, pz) => outside(v, s, px, pz) <= 0) : new Set<Held>();

    for (const h of held.values()) {
      h.group.visible = shown.has(h);
      if (!h.group.visible) continue;
      h.seen = looks;
      // a piece of another step is scaled to the stage's blocks; all sink towards the sea's level as the view widens
      const f = 2 ** (h.step - step), tall = f * reliefOf(v.wide, h.step);
      h.group.scale.set(f, tall, f);
      h.group.position.set((h.px * PIECE - MARGIN) * f - layout.homeX, SEA_Y * (1 - tall), (h.pz * PIECE - MARGIN) * f - layout.homeZ);
    }
    // pieces the view no longer asks for leave the stage, those unused the longest first
    const spare = [...held].filter(([, h]) => h.seen !== looks).sort((a, b) => a[1].seen - b[1].seen);
    for (const [key, h] of spare.slice(0, Math.max(0, spare.length - SPARE))) { stage.remove(h.group); held.delete(key); }
    stage.redraw();
    return { ...layout, missing };
  }
  return pieces;
}
