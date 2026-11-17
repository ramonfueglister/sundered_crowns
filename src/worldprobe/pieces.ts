// The pieces of the world on the stage. The world is built in pieces of PIECE × PIECE blocks, at the step of the map
// the view calls for (zoom.ts), by workers off the page's thread. So that the picture never shows a hole or changes
// all at once, the pieces form a pyramid: under the pieces of the view's step lie those of the next coarser step, each
// covering four of them, and a piece is shown only once all of its neighbours under the same coarser piece are there.
// Until then the coarser piece stands in, and where that is missing too, finer pieces left from before. Pieces around
// the picture are built ahead of need, and so are those of the step the view is about to change to. Where pieces
// take the place of others, the new ones are dissolved into the picture while the old ones dissolve out of it.
// The houses that have fine blocks and the paved ground lie in cells of their own on their piece: from near, fine.ts
// builds them again.
import type * as THREE from 'three/webgpu';
import { N, NEAR, RIGHT, SEA_Y } from '../lookprobe/layout';
import type { Stage } from '../lookprobe/stage';
import { type HouseCell, createFine } from './fine';
import type { PieceDone, PieceJob } from './piece.worker';
import { cover, keyOf } from './pyramid';
import { CELL } from './world';
import { BLENDS, COARSEST, blendOf, reliefOf, stepOf } from './zoom';

/** side of a piece in blocks; each is built on a ground of N blocks, so that it knows the land around it */
const PIECE = 200, MARGIN = (N - PIECE) / 2;
/** pieces are built ahead of need this far around the picture, as a share of its width */
const AHEAD = 0.3;
/** the pieces of the next finer step are built ahead once the view is within this factor of the width at which that step takes over */
const ZOOM_AHEAD = 1.25;
/** pieces kept on the stage beyond those the view asks for */
const SPARE = 10;
/** pieces that take the place of others dissolve into the picture over this many milliseconds */
const DISSOLVE = 300;
/** the stage counts its blocks from a home near the view; a new home is taken when the view has moved this far from it */
const HOME_REACH = 3000;
/** what stands on a block leans this many blocks into the picture; a house does by this many */
const LEAN = 30, HOUSE_LEAN = 12;

/** The view: the place at the middle of the picture in the finest blocks, how many of them lie across it, the picture's shape and width in pixels, and how far the camera looks down. */
export interface View { x: number; z: number; wide: number; aspect: number; pixels: number; elevation: number }
/** How the stage is laid out for a view: its blocks are `coarse` finest blocks wide and counted from `home`. */
export interface Layout { step: number; coarse: number; homeX: number; homeZ: number }
interface Held {
  group: THREE.Group; step: number; px: number; pz: number;
  /** the cells of its towns, with their middles in finest blocks */
  cells: (Pick<HouseCell, 'key' | 'far' | 'lots' | 'ground'> & { x: number; z: number })[];
  /** the share of the picture's dots it is drawn on, while it dissolves into the picture or out of it */
  dots: [number, number];
  /** the last look that showed or asked for it */
  seen: number;
  /** whether the piece is part of the picture */
  on: boolean;
  /** the share of the picture's dots on which the piece, of the next coarser step, is laid into the picture in place of the view's own step, as the view nears that step (zoom.ts `blendOf`) */
  laid: number;
  /** the piece is dissolving into the picture (`rising`) or out of it since this time */
  fade?: { since: number; rising: boolean };
}
interface Spot { key: string; step: number; px: number; pz: number }

export interface Pieces {
  /** Brings the stage to the view: asks for what is missing, shows what covers the picture best. Returns the layout and how many pieces of the picture are still to come. */
  look(view: View): Layout & { missing: number };
  /** the first error of a worker, if any */
  failed: string;
  /** Stops the workers; the pieces are not used after that. */
  dispose(): void;
}

/**
 * `ahead`: build the coarser step and the surroundings of the picture too (a tool that takes one picture does not
 * need them). `changed` is called whenever a piece has arrived.
 */
export function createPieces(stage: Stage, o: { region: string; base: string; bakedSky: boolean; ahead: boolean; changed(): void; /** the world's start year, whose towns are built */ year?: number; /** false: the far steps as far.ts lays them out, not as the mean of the finer step (mean.ts) */ mean?: boolean }): Pieces {
  const held = new Map<string, Held>(), building = new Set<string>(), jobs = new Map<number, Spot>(), idle: Worker[] = [];
  const workers: Worker[] = [];
  const fine = createFine(stage, { still: !o.ahead, changed: o.changed });
  const pieces: Pieces = { look, failed: '', dispose: () => { for (const w of workers) w.terminate(); fine.dispose(); } };
  let nextId = 1, looks = 0, ticking = false, layout: Layout = { step: -1, coarse: 1, homeX: 0, homeZ: 0 };
  /** when the shares of the pieces laid in were last set */
  let mixed = 0;

  for (let k = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)); k > 0; k--) {
    const worker = new Worker(new URL('./piece.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<PieceDone>) => {
      const spot = jobs.get(e.data.id)!;
      jobs.delete(e.data.id); building.delete(spot.key); idle.push(worker);
      if (e.data.error) pieces.failed ||= e.data.error;
      else if (e.data.scene) {
        const group = stage.add(e.data.scene);
        group.visible = false;
        const cells = e.data.scene.cells.map((c, k) => ({ key: `${spot.key}/${k}`, far: c.far.pos.length ? stage.more(group, c.far) : undefined, lots: c.lots, ground: c.ground, x: spot.px * PIECE - MARGIN + c.x, z: spot.pz * PIECE - MARGIN + c.z }));
        held.set(spot.key, { group, step: spot.step, px: spot.px, pz: spot.pz, cells, dots: [0, 1], seen: looks, on: false, laid: 0 });
        for (const [name, n] of Object.entries(e.data.scene.counts)) stage.probe.counts[name] = (stage.probe.counts[name] ?? 0) + n;
      }
      o.changed();
    };
    worker.onerror = (e) => { pieces.failed ||= e.message; o.changed(); };
    idle.push(worker); workers.push(worker);
  }

  /** how far a square of `side` finest blocks about (cx, cz) lies outside the picture (0: it reaches into it); what stands on it leans `lean` blocks into the picture */
  function beyond(v: View, cx: number, cz: number, side: number, lean: number): number {
    const right = (cx - v.x) * RIGHT[0] + (cz - v.z) * RIGHT[1], near = (cx - v.x) * NEAR[0] + (cz - v.z) * NEAR[1];
    // a square reaches half its diagonal from its middle
    const deep = v.wide / v.aspect / Math.sin((v.elevation * Math.PI) / 180), reach = side * 0.71 + lean;
    return Math.max(0, Math.abs(right) - v.wide / 2 - reach, Math.abs(near) - deep / 2 - reach);
  }
  /** how far a piece lies outside the picture, in finest blocks */
  const outside = (v: View, step: number, px: number, pz: number) => { const side = PIECE * 2 ** step; return beyond(v, (px + 0.5) * side, (pz + 0.5) * side, side, LEAN * 2 ** step); };
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
    const step = stepOf(v.wide), coarse = 2 ** step, stepped = step !== layout.step, blend = blendOf(v.wide);
    // where the zoom has blended two far steps by the time their border is crossed, nothing dissolves there
    const seamless = BLENDS && stepped && Math.min(step, layout.step) > 0;
    if (step !== layout.step || Math.abs(v.x / coarse - layout.homeX) > HOME_REACH || Math.abs(v.z / coarse - layout.homeZ) > HOME_REACH)
      layout = { step, coarse, homeX: Math.floor(v.x / coarse / PIECE) * PIECE, homeZ: Math.floor(v.z / coarse / PIECE) * PIECE };
    looks++;

    // what the view asks for: the coarser step under the picture first, then its own step in the picture, then around it
    const wanted: (Spot & { rank: number })[] = [];
    for (const p of near(v, step, o.ahead ? AHEAD * v.wide : 0)) wanted.push({ ...p, rank: (p.out > 0 ? 2e9 : 1e9) + p.far });
    // a coarser piece is four times the size, so those of the picture reach far enough around it
    const coarser = step < COARSEST && (o.ahead || blend > 0) ? near(v, step + 1, 0) : [];
    for (const p of coarser) wanted.push({ ...p, rank: p.far });
    // the finer step, once the view comes near it: last of all
    if (o.ahead && stepOf(v.wide / ZOOM_AHEAD) < step) for (const p of near(v, step - 1, 0)) wanted.push({ ...p, rank: 3e9 + p.far });
    let missing = 0;
    for (const w of wanted) { const h = held.get(w.key); if (h) h.seen = looks; else if ((w.step === step && w.rank < 2e9) || (!o.ahead && w.step > step)) missing++; }
    const queue = wanted.filter((w) => !held.has(w.key) && !building.has(w.key)).sort((a, b) => b.rank - a.rank);
    while (idle.length && queue.length) {
      const next = queue.pop()!, worker = idle.pop()!, id = nextId++;
      jobs.set(id, next); building.add(next.key);
      worker.postMessage({ id, step: next.step, piece: { ox: next.px * PIECE - MARGIN, oz: next.pz * PIECE - MARGIN, part: { x0: MARGIN, z0: MARGIN, x1: MARGIN + PIECE, z1: MARGIN + PIECE } }, region: o.region, base: o.base, bakedSky: o.bakedSky, year: o.year, mean: o.mean } satisfies PieceJob);
    }

    // what is shown: from the coarsest pieces down, a piece gives way to the four under it once they cover their share
    const top = Math.min(COARSEST, step + 2);
    const shown = cover(step, top, near(v, top, 0).map((p) => [p.px, p.pz] as const), (s, px, pz) => held.get(keyOf(s, px, pz)), (s, px, pz) => outside(v, s, px, pz) <= 0);

    // pieces that take the place of others (they lie over each other in the pyramid) dissolve in while those dissolve
    // out; what only comes into the picture or leaves it does so at once
    const now = performance.now(), coming = [...shown].filter((h) => !h.on), going = [...held.values()].filter((h) => h.on && !shown.has(h));
    // the next coarser step is laid into the picture as the view nears its border, piece by piece as they are
    // there: a piece's share follows the zoom, and where the piece comes late it closes on it over the time of a
    // dissolve. Across a border the picture stays as it is: what was laid in is now the view's own step, or the
    // other way round.
    const lay = new Set(blend > 0 ? coarser.map((p) => held.get(p.key)) : []), by = o.ahead && !stepped && mixed ? Math.min(50, now - mixed) / DISSOLVE : 1;
    mixed = now;
    let fading = false;
    for (const h of held.values()) {
      const goal = lay.has(h) ? blend : 0;
      h.laid = stepped ? goal : goal > h.laid ? Math.min(goal, h.laid + by) : Math.max(goal, h.laid - by);
      fading ||= h.laid !== goal;
    }
    /** the share of a piece's dots that the coarser piece over it has taken */
    const taken = (h: Held) => { const k = 2 ** (step + 1 - h.step); return h.step <= step ? (held.get(keyOf(step + 1, Math.floor(h.px / k), Math.floor(h.pz / k)))?.laid ?? 0) : 0; };
    if (seamless) for (const h of [...coming, ...going]) { h.on = shown.has(h); h.fade = undefined; }
    else {
    const over = (a: Held, b: Held) => { const [fine, wide] = a.step <= b.step ? [a, b] : [b, a], k = 2 ** (wide.step - fine.step); return Math.floor(fine.px / k) === wide.px && Math.floor(fine.pz / k) === wide.pz; };
    for (const h of coming) { h.on = true; h.fade = o.ahead && going.some((g) => over(h, g)) ? { since: now, rising: true } : undefined; }
    for (const h of going) { h.on = false; h.fade = o.ahead && coming.some((c) => over(h, c)) ? { since: now, rising: false } : undefined; }
    }
    for (const h of held.values()) {
      const share = h.fade ? Math.min(1, (now - h.fade.since) / DISSOLVE) : 1;
      if (share >= 1) h.fade = undefined;
      h.group.visible = h.on || !!h.fade || h.laid > 0;
      if (!h.group.visible) continue;
      h.seen = looks; fading ||= !!h.fade;
      h.dots = [h.fade && !h.fade.rising ? share : 0, h.fade?.rising ? share : 1];
      // a piece laid in takes the first of the dots, as many as its share, and the view's own pieces under it the
      // rest (a piece that stands in for missing finer ones keeps all of its dots)
      const under = taken(h);
      // while the finer pieces dissolve into a piece that stood in for them, they take the last of the dots and leave it the first
      if (h.laid > 0 && !h.on) h.dots = [0, h.fade ? 1 - (1 - h.laid) * share : h.laid];
      else if (under > 0) h.dots = h.fade?.rising ? [1 - (1 - under) * share, 1] : [under + (1 - under) * h.dots[0], under + (1 - under) * h.dots[1]];
      stage.dissolve(h.group, ...h.dots);
      // a piece of another step is scaled to the stage's blocks; all sink towards the sea's level as the view widens
      const f = 2 ** (h.step - step), tall = f * reliefOf(v.wide, h.step);
      h.group.scale.set(f, tall, f);
      h.group.position.set((h.px * PIECE - MARGIN) * f - layout.homeX, SEA_Y * (1 - tall), (h.pz * PIECE - MARGIN) * f - layout.homeZ);
    }
    // the houses of the pieces in the picture, from their fine blocks where the view is near
    const cells: HouseCell[] = [];
    for (const h of held.values()) if (h.group.visible) for (const c of h.cells) cells.push({ key: c.key, group: h.group, far: c.far, lots: c.lots, ground: c.ground, dots: h.dots, out: beyond(v, c.x, c.z, CELL, HOUSE_LEAN), away: Math.hypot(c.x - v.x, c.z - v.z) });
    const houses = fine.look(v.wide, cells);
    missing += houses.missing; fading ||= houses.fading; pieces.failed ||= fine.failed;
    // pieces the view no longer asks for leave the stage, those unused the longest first
    const spare = [...held].filter(([, h]) => h.seen !== looks).sort((a, b) => a[1].seen - b[1].seen);
    for (const [key, h] of spare.slice(0, Math.max(0, spare.length - SPARE))) { stage.remove(h.group); held.delete(key); }
    // a dissolve goes on from picture to picture
    if (fading && !ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; o.changed(); }); }
    stage.redraw();
    return { ...layout, missing };
  }
  return pieces;
}
