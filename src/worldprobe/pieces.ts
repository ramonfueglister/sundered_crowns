// The pieces of the world on the stage. The world is built in pieces of PIECE × PIECE blocks, at the step of the map
// the view calls for (zoom.ts), by workers off the page's thread. So that the picture never shows a hole or changes
// all at once, the pieces form a pyramid: under the pieces of the view's step lie those of the next coarser step, each
// covering four of them, and a piece is shown only once all of its neighbours under the same coarser piece are there.
// Until then the coarser piece stands in, and where that is missing too, finer pieces left from before. Pieces around
// the picture are built ahead of need, and so are those of the step the view is about to change to. Where pieces
// take the place of others, the new ones are dissolved into the picture while the old ones dissolve out of it.
// The pieces of every coarser step under the picture are kept as well, so that a leap of the zoom never shows the
// sea's colour where there is land.
// While the view is in motion, the pieces of the view it will come to rest at are built first: a zoom or a flight is
// over sooner than a piece is built, so what the pictures on the way would ask for comes too late to be seen
// (Cesium loads the destination of a flight ahead in the same way). A piece that has arrived is put on the stage
// in a picture of its own and, once it lies in the picture or in the one the view comes to rest at, drawn there
// once without showing, so that its lists reach the graphics card one piece to a picture, not all the pieces of a
// step in the picture that first shows them. (With `?send=1` the stage
// sends the lists itself, a few megabytes to a picture, and a piece joins the pieces the view can show once they
// are sent: stage.ts `staged`, which says why that is not the rule.)
// The houses that have fine blocks and the paved ground lie in cells of their own on their piece: from near, fine.ts
// builds them again.
// A piece that has been built is kept on disk as well (store.ts): the next time it is asked for, in this visit or a
// later one, it is read, in a few hundredths of a second where building it takes most of one. While the view rests
// and all it asks for is there, the pieces of the coarser steps that a wider view from here would show are built
// into that store, the coarsest first: a leap out to them then finds them there.
import type * as THREE from 'three/webgpu';
import { N, NEAR, RIGHT, SEA_Y } from '../lookprobe/layout';
import type { Stage } from '../lookprobe/stage';
import { type HouseCell, createFine } from './fine';
import type { PieceDone, PieceJob, WarmJob } from './piece.worker';
import { cover, keyOf } from './pyramid';
import type { StoreAsk, StoreSays } from './store.worker';
import { CELL } from './world';
import { BLENDS, COARSEST, FARTHEST, NEAREST, blendOf, elevationOf, reliefOf, stepOf } from './zoom';

/** side of a piece in blocks; each is built on a ground of N blocks, so that it knows the land around it */
const PIECE = 200, MARGIN = (N - PIECE) / 2;
/**
 * From this step on a piece is built on a smaller ground, with NARROW blocks of land around it: a town of the finest
 * step is laid out from its middle and needs the wide margin. From the first far step on the land a piece shows
 * depends on no more than 17 to 28 blocks around it (the sky's share, the shore, the smoothing of rock, the mean of
 * the forest), and a ground of 264 blocks has 2.3 times fewer of them to work out than one of 400. Only a river's
 * level depends on more, on where its walk begins: that walk still covers what the wide ground holds (build.ts,
 * world.ts `Piece.beyond`). Measured by building pieces on both grounds and comparing all their triangles: of 56
 * pieces of step 1 at 14 places (Paris, Alps, coasts, Nile, Norway, desert) 52 are the same triangle for triangle,
 * and four in Norway's wide massifs differ in the colour of 1 to 40 rock faces by at most 0.03; the columns at 48
 * borders between pieces are the same on both sides. Where step 1 is the mean of the finest step (`mean`), it
 * keeps the wide ground.
 */
const NARROW_FROM = 1, NARROW = 32;
/**
 * Once the view (or the view it comes to rest at) is at this step or a finer one, the workers load the map's data
 * of the finest step, whose pieces are the only ones still built from it (the others are drawn from their tables):
 * a zoom in to the towns then finds them ready, and its first pieces do not wait half a second for it in every worker.
 */
const WARM_FROM = 2;
/** pieces are built ahead of need this far around the picture, as a share of its width */
const AHEAD = 0.3;
/** the pieces of the next finer step are built ahead once the view is within this factor of the width at which that step takes over */
const ZOOM_AHEAD = 1.25;
/** before the pieces of a picture, those of this many steps coarser under it are built: 16 times the ground each, so one to four of them */
const STAND_IN = 2;
/** pieces kept on the stage beyond those the view asks for */
const SPARE = 10;
/** a picture every this many milliseconds is what the stage aims for: a piece that has arrived is put on it in a picture of its own */
const PICTURE = 1000 / 60;
/** where pictures take longer than this many milliseconds, they cannot be what holds the arrived pieces back */
const SLOW = 250;
/** pieces that take the place of others dissolve into the picture over this many milliseconds */
const DISSOLVE = 300;
/** summaries of finest pieces kept for the pieces over them (half a megabyte each) */
const KEPT_SUMS = 96;
/** megabytes of pieces kept on disk (3 to 4 MB each); beyond that the ones unused the longest are let go of */
const ROOM = 1000;
/** megabytes of pieces that may wait to be written to disk (10 to 30 MB each; they are written as they come and zipped later); one that comes on top is not kept */
const WAITING = 600;
/** workers that build ahead into the store while the view rests: the others stay free for what the view asks for next */
const SPARE_WORKERS = 2;
/** the widest view of each step: what a leap out to that step may show */
const WIDEST = Array.from({ length: COARSEST + 1 }, (_, s) => { let w = NEAREST; while (w < FARTHEST && stepOf(w * 1.02) <= s) w *= 1.02; return Math.min(FARTHEST, w); });
/** the width at which each step gives way to the next coarser one */
const BORDER = Array.from({ length: COARSEST }, (_, s) => { let low = NEAREST, high = FARTHEST * 2; for (let k = 0; k < 60; k++) { const mid = Math.sqrt(low * high); if (stepOf(mid) > s) high = mid; else low = mid; } return high; });
/**
 * The land of a far step glides to the shape of the next coarser step over the last stretch before their border,
 * from the border's width divided by this (glide.ts): so the border changes nothing on the land. A view at rest in
 * that stretch shows its one step, part of the way.
 */
const GLIDE = 1.6;
/** How far a piece of a step has glided to the shape of the coarser step in a view this wide, 0 … 1. */
export function glideOf(wide: number, step: number): number {
  if (step >= COARSEST) return 0;
  const t = Math.max(0, Math.min(1, 1 - Math.log(BORDER[step] / wide) / Math.log(GLIDE)));
  return t * t * (3 - 2 * t);
}
/** a piece that took the place of a coarser one comes from that step's shape to its own over this many milliseconds, once it has dissolved into the picture */
const SETTLE = 600;
/**
 * How far a piece has glided that took the place of a coarser one `since` milliseconds ago, when it was `by` short
 * of that step's shape: it begins as the coarser step has the land, stays so while it dissolves into the picture,
 * and then comes to `share`, which is what a view of its width asks for. Undefined once it is there.
 */
export function settleOf(share: number, by: number, since: number): number | undefined {
  const t = (since - DISSOLVE) / SETTLE;
  if (t >= 1) return undefined;
  const u = Math.max(0, t);
  return Math.min(1, share + by * (1 - u * u * (3 - 2 * u)));
}
/** the stage counts its blocks from a home near the view; a new home is taken when the view has moved this far from it */
const HOME_REACH = 3000;
/** what stands on a block leans this many blocks into the picture; a house does by this many */
const LEAN = 30, HOUSE_LEAN = 12;

/** The view: the place at the middle of the picture in the finest blocks, how many of them lie across it, the picture's shape and width in pixels, and how far the camera looks down. */
export interface View { x: number; z: number; wide: number; aspect: number; pixels: number; elevation: number; /** the view a motion under way will come to rest at */ to?: { x: number; z: number; wide: number; elevation: number } }
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
  /** the piece glides to the shape of the next coarser step (glide.ts) */
  glides: boolean;
  /**
   * the piece took the place of a coarser one that stood in for it, at this time and `by` short of that step's
   * shape: it shows first as that step has the land and comes to its own shape from there (`settleOf`), so that the
   * land grows finer where it stood and does not change at once
   */
  settle?: { since: number; by: number };
  /**
   * the piece is still to be drawn once without showing, so that its lists are on the graphics card before it
   * shows: -1 until a look puts it into the picture to come, then the number of pictures the stage had drawn by
   * then, and none once the stage has drawn that picture
   */
  warm?: number;
}
interface Spot { key: string; step: number; px: number; pz: number; /** built ahead into the store: it goes on the stage only if the view has come to ask for it */ spare?: boolean }

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
export function createPieces(stage: Stage, o: { region: string; base: string; bakedSky: boolean; ahead: boolean; changed(): void; /** how many workers build the pieces (default: up to 6 where the machine has ten cores or more, else up to 4 and one core left) */ workers?: number; /** the world's start year, whose towns are built */ year?: number; /** blocks of land around a piece of the far steps, for measuring (default NARROW; 100 is the wide margin of the finest step) */ margin?: number; /** keeps the pieces on disk, under this name of the game's build (store.ts): pieces of another build are not read */ keep?: string; /** the pieces' directions and colours as bytes, 20 bytes to a corner (small.ts), not as floats of 36 */ small?: boolean; /** and their rectangles on the grid of blocks as faces, 32 bytes to a rectangle (lookprobe/faces.ts) */ faces?: boolean; /** false: the rectangles on no grid of what stands on a piece stay triangles, not faces of floats (faces.ts `Free`) */ free?: boolean; /** false: every piece is built from the map's data, also where its table was built ahead (table.ts) */ tables?: boolean; /** false: the far steps change at their borders as they are, their land does not glide to the coarser step's shape (glide.ts) */ glide?: boolean; /** true: the first far step as the mean of the finest step (mean.ts: exact, but it builds four finest pieces for each far piece); 'compare': as far.ts lays it out, and measured against that mean (the counts `cmp …`); else as far.ts lays it out */ mean?: boolean | 'compare' }): Pieces {
  const held = new Map<string, Held>(), building = new Set<string>(), jobs = new Map<number, Spot>(), idle: Worker[] = [];
  const workers: Worker[] = [];
  const fine = createFine(stage, { still: !o.ahead, changed: o.changed, small: o.small, free: !!o.small && !!o.faces && o.free !== false });
  const pieces: Pieces = { look, failed: '', dispose: () => { for (const w of workers) w.terminate(); store?.terminate(); fine.dispose(); } };
  let nextId = 1, looks = 0, ticking = false, layout: Layout = { step: -1, coarse: 1, homeX: 0, homeZ: 0 };
  /** whether the workers were told to load the map's data of the finest step (WARM_FROM) */
  let warmed = false;
  /** blocks of land around a piece of a step on the ground it is built on */
  const marginOf = (step: number) => (step >= (o.mean ? NARROW_FROM + 1 : NARROW_FROM) ? Math.min(MARGIN, o.margin ?? NARROW) : MARGIN);
  /**
   * what the pieces of the finest step show, summed up for the pieces of the next step over them (mean.ts), the
   * last KEPT_SUMS of them: a piece of the first far step is the mean of the four finest under it, and need not
   * build those the page has built already
   */
  const sums = new Map<string, Float32Array>();
  /** when the shares of the pieces laid in were last set */
  let mixed = 0;
  /** pieces that have arrived and wait to go on the stage; and those on it whose lists are on their way to the graphics card, in the order they were put there */
  const arrived: { spot: Spot; scene: NonNullable<PieceDone['scene']> }[] = [], sending: { spot: Spot; h: Held }[] = [];
  let admitting = false, admitted = 0, followed = false;
  /**
   * the pieces kept on disk, by the names of their files, once the store has told them; how many are waiting to be
   * written; and the pieces the last look asked for
   */
  const kept = new Set<string>(), asked = new Set<string>();
  let store: Worker | null = null, listed = false, waiting = 0, busy = false;
  /** the bytes of the pieces sent to be written, until the store has answered */
  const sent = new Map<string, number>();
  // (the pieces a tool measures against the mean are not what the view shows)
  if (o.keep && o.mean !== 'compare' && typeof navigator !== 'undefined' && 'storage' in navigator && 'getDirectory' in navigator.storage) {
    store = new Worker(new URL('./store.worker.ts', import.meta.url), { type: 'module' });
    store.onmessage = (e: MessageEvent<StoreSays>) => {
      if (e.data.have) { for (const name of e.data.have) kept.add(name); listed = true; o.changed(); }
      if (e.data.put) { waiting -= sent.get(e.data.put) ?? 0; sent.delete(e.data.put); if (!e.data.failed) kept.add(e.data.put); }
      for (const name of e.data.gone ?? []) kept.delete(name);
      if (e.data.holds !== undefined) stage.probe.counts['MB kept'] = e.data.holds;
    };
    // (a browser that does not run the store keeps nothing: the pieces are built as before)
    store.onerror = () => { store?.terminate(); store = null; };
    store.postMessage({ build: o.keep, room: ROOM } satisfies StoreAsk);
  }
  /** the name of a piece's file: all that the piece depends on, beside the build */
  const fileOf = (p: Spot) => `${o.region}_${o.year ?? 0}_${p.step}_${p.px}_${p.pz}_${o.bakedSky ? 1 : 0}${o.mean ? 1 : 0}_${marginOf(p.step)}${o.small ? (o.faces ? (o.free === false ? '_f' : '_e') : '_s') : ''}${o.tables === false ? '_b' : ''}${o.glide === false || !o.small || !o.faces ? '' : '_g'}`;
  const put = ({ spot, scene }: (typeof arrived)[number]) => {
    const group = stage.add(scene);
    group.visible = false;
    const cells = scene.cells.map((c, k) => ({ key: `${spot.key}/${k}`, far: c.far.pos.length ? stage.more(group, c.far) : undefined, lots: c.lots, ground: c.ground, x: spot.px * PIECE - marginOf(spot.step) + c.x, z: spot.pz * PIECE - marginOf(spot.step) + c.z }));
    const h: Held = { group, step: spot.step, px: spot.px, pz: spot.pz, cells, dots: [0, 1], seen: looks, on: false, laid: 0, glides: !!scene.ground.faces?.aim, warm: o.ahead && !stage.staged ? -1 : undefined };
    if (stage.staged) sending.push({ spot, h }); else { held.set(spot.key, h); building.delete(spot.key); }
    for (const [name, n] of Object.entries(scene.counts)) stage.probe.counts[name] = (stage.probe.counts[name] ?? 0) + n;
  };
  const admit = () => {
    admitting = false;
    if (!stage.staged) {
      // one to a picture, so that no picture has the lists of two to send to the graphics card (measured: where
      // pieces read from disk arrived four at a time and were put on the stage together, pictures took up to 170 ms).
      // Only a machine whose pictures take a quarter of a second and more each puts on as many as would have had a
      // picture of their own in that time; and a tool that takes one picture has no pictures to spread them over.
      const now = performance.now(), took = now - admitted;
      const due = !o.ahead ? arrived.length : followed && took > SLOW ? Math.floor(took / PICTURE) : 1;
      admitted = now;
      for (let k = due; k > 0 && arrived.length; k--) put(arrived.shift()!);
      // (the time since the last piece counts only from one picture to the next, not across a rest)
      followed = arrived.length > 0;
      if (arrived.length) { admitting = true; requestAnimationFrame(admit); }
      o.changed();
      return;
    }
    // the next go on the stage as those before them get through (the others wait, so that the ones the view asks
    // for by then go first)
    const more = () => { while (arrived.length && stage.room()) { const k = arrived.findIndex((a) => asked.has(a.spot.key)); put(arrived.splice(Math.max(0, k), 1)[0]); } };
    more();
    // A piece whose lists are on the graphics card joins those the view can show. Shown before that, its lists
    // would all go in the picture that first draws it (measured: where pieces read from disk came into the picture
    // together, or one piece of a town with its 49 meshes, pictures took 110 to 250 ms).
    let joined = false;
    for (let k = 0; k < sending.length; k++) {
      const { spot, h } = sending[k];
      if (!stage.sent(h.group)) continue;
      sending.splice(k--, 1);
      h.seen = looks; held.set(spot.key, h); building.delete(spot.key); joined = true;
    }
    more();
    if (arrived.length || sending.length) { admitting = true; requestAnimationFrame(admit); }
    if (joined) o.changed();
  };

  // as many workers as leave four of the machine's cores to the page, the graphics and the store, up to six; on a
  // small machine as before, up to four and one core left (each worker holds some 200 MB of the map's data)
  const cores = navigator.hardwareConcurrency || 2;
  for (let k = Math.max(1, o.workers ?? Math.max(Math.min(4, cores - 1), Math.min(6, cores - 4))); k > 0; k--) {
    const worker = new Worker(new URL('./piece.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<PieceDone>) => {
      const spot = jobs.get(e.data.id)!;
      jobs.delete(e.data.id); idle.push(worker);
      if (e.data.summary) {
        sums.delete(spot.key); sums.set(spot.key, e.data.summary);
        if (sums.size > KEPT_SUMS) sums.delete(sums.keys().next().value!);
      }
      if (store && e.data.kept) store.postMessage({ used: fileOf(spot) } satisfies StoreAsk);
      if (store && e.data.packed) {
        const name = fileOf(spot), bytes = e.data.packed.byteLength;
        if (waiting + bytes < WAITING * 1e6 && !sent.has(name)) { waiting += bytes; sent.set(name, bytes); store.postMessage({ put: name, bytes: e.data.packed } satisfies StoreAsk, [e.data.packed]); }
        else stage.probe.counts['pieces not kept'] = (stage.probe.counts['pieces not kept'] ?? 0) + 1;
      }
      // a piece built ahead into the store goes on the stage only if the view has come to ask for it meanwhile
      const spare = spot.spare && !asked.has(spot.key);
      if (spare) for (const [name, n] of Object.entries(e.data.scene?.counts ?? {})) if (name.startsWith('ms ') || name.startsWith('pieces ')) stage.probe.counts[`${name} ahead`] = (stage.probe.counts[`${name} ahead`] ?? 0) + n;
      // (a piece counts as being built until it is on the stage, so that it is not asked for again)
      if (e.data.scene && !e.data.error && !spare) arrived.push({ spot, scene: e.data.scene }); else building.delete(spot.key);
      if (e.data.error) pieces.failed ||= e.data.error;
      if (stage.staged) { if (!admitting && arrived.length) admit(); o.changed(); }
      else if (!o.ahead) admit(); else { if (!admitting && arrived.length) { admitting = true; requestAnimationFrame(admit); } o.changed(); }
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

    // what the view asks for: its own step in the picture first, then the coarser step under the picture, then around it
    const wanted: (Spot & { rank: number })[] = [];
    // first of all the picture the view will come to rest at, from its middle outwards; and before its own pieces the
    // few of STAND_IN steps coarser under it: in the time one piece takes to build, that picture is covered by blocks
    // a few times as wide, where it would else show far coarser ones or none until all of its own are there
    const rest = o.ahead && v.to ? { ...v, ...v.to } : v, restStep = stepOf(rest.wide);
    if (o.ahead && !warmed && Math.min(step, restStep) <= WARM_FROM) { warmed = true; for (const w of workers) w.postMessage({ warm: true, region: o.region, base: o.base, year: o.year } satisfies WarmJob); }
    if (o.ahead && restStep + STAND_IN <= COARSEST) for (const p of near(rest, restStep + STAND_IN, 0)) wanted.push({ ...p, rank: -1e9 + p.far });
    if (rest !== v) for (const p of near(rest, restStep, 0)) wanted.push({ ...p, rank: p.far });
    for (const p of near(v, step, o.ahead ? AHEAD * v.wide : 0)) wanted.push({ ...p, rank: (p.out > 0 ? 2e9 : 1e9) + p.far });
    // a coarser piece is four times the size, so those of the picture reach far enough around it
    const coarser = step < COARSEST && (o.ahead || blend > 0) ? near(v, step + 1, 0) : [];
    // (after the view's own pieces in the picture: a piece of the first far step is made of the finest ones under it, mean.ts)
    for (const p of coarser) wanted.push({ ...p, rank: 1.5e9 + p.far });
    // the finer step, once the view comes near it: last of all
    if (o.ahead && stepOf(v.wide / ZOOM_AHEAD) < step) for (const p of near(v, step - 1, 0)) wanted.push({ ...p, rank: 3e9 + p.far });
    // and the pieces of every coarser step under the picture, the coarsest first: they are kept, so that a view that
    // widens at once finds the land under it there, however coarse (a piece of the coarsest step covers a picture of
    // every step but its own)
    if (o.ahead) for (let s = COARSEST; s > step + 1; s--) for (const p of near(v, s, 0)) wanted.push({ ...p, rank: 4e9 + (COARSEST - s) * 1e7 + p.far });
    let missing = 0;
    for (const w of wanted) { const h = held.get(w.key); if (h) h.seen = looks; else if ((w.step === step && w.rank >= 1e9 && w.rank < 2e9) || (!o.ahead && w.step > step)) missing++; }
    // (a piece asked for twice is built once, as early as its first asking)
    asked.clear();
    for (const w of wanted) asked.add(w.key);
    const once = new Set<string>(), queue: Spot[] = wanted.filter((w) => !held.has(w.key) && !building.has(w.key)).sort((a, b) => a.rank - b.rank).filter((w) => !once.has(w.key) && once.add(w.key)).reverse();
    // while the view rests with all it asks for, the pieces of the coarser steps that a wider view from here would
    // show are built into the store, the coarsest first, by some of the workers (not for a page nobody looks at);
    // and after them those of the next finer step that a zoom in about the middle of the picture would come to
    // first, from the middle outwards: a zoom in finds them there and reads them, which takes a fraction of
    // building them
    const sparing = [...jobs.values()].filter((j) => j.spare).length;
    if (store && listed && o.ahead && !v.to && !document.hidden && !queue.length && building.size === sparing && sparing < SPARE_WORKERS) {
      const ahead: (Spot & { far: number })[] = [], lacks = (p: Spot) => !held.has(p.key) && !building.has(p.key) && !kept.has(fileOf(p)) && !sent.has(fileOf(p));
      for (let s = COARSEST; s > step; s--) for (const p of near({ ...v, wide: WIDEST[s], elevation: elevationOf(WIDEST[s]) }, s, 0)) if (lacks(p)) ahead.push({ ...p, spare: true });
      if (!ahead.length && step > 0) { const wide = Math.min(v.wide, WIDEST[step - 1]); for (const p of near({ ...v, wide, elevation: elevationOf(wide) }, step - 1, 0)) if (lacks(p)) ahead.push({ ...p, spare: true }); }
      ahead.sort((a, b) => b.step - a.step || a.far - b.far);
      queue.push(...ahead.slice(0, SPARE_WORKERS - sparing).reverse());
    }
    while (idle.length && queue.length) {
      const next = queue.pop()!, worker = idle.pop()!, id = nextId++, margin = marginOf(next.step);
      jobs.set(id, next); building.add(next.key);
      worker.postMessage({ id, step: next.step, small: o.small, faces: o.faces, free: o.free, tables: o.tables, glide: o.glide !== false, grid: margin === MARGIN ? undefined : PIECE + 2 * margin, keep: store ? { build: o.keep!, name: fileOf(next), kept: !listed || kept.has(fileOf(next)) } : undefined, piece: { ox: next.px * PIECE - margin, oz: next.pz * PIECE - margin, part: { x0: margin, z0: margin, x1: margin + PIECE, z1: margin + PIECE } }, region: o.region, base: o.base, bakedSky: o.bakedSky, year: o.year, mean: o.mean, under: next.step === 1 ? [0, 1, 2, 3].map((q) => sums.get(keyOf(0, next.px * 2 + (q & 1), next.pz * 2 + (q >> 1)))) : undefined } satisfies PieceJob);
    }

    // the store zips what it has written once the workers are through with what the picture is missing
    const pressed = [...jobs.values()].some((j) => !j.spare) || queue.length > 0;
    if (store && pressed !== busy) { busy = pressed; store.postMessage({ busy } satisfies StoreAsk); }

    // what is shown: from the coarsest pieces down, a piece gives way to the four under it once they cover their share
    // (from the coarsest step of all: after a leap of the zoom the pieces of the view before are all there is)
    const top = COARSEST;
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
    for (const h of coming) {
      const stood = o.ahead ? going.filter((g) => over(h, g)) : [];
      h.on = true; h.fade = stood.length ? { since: now, rising: true } : undefined;
      // (where the view has just crossed the border the piece is at that step's shape as it is, and nothing is to settle)
      const short = h.glides && stood.some((g) => g.step > h.step) ? 1 - glideOf(v.wide, h.step) : 0;
      h.settle = short > 0.02 ? { since: now, by: short } : undefined;
      if (h.settle) stage.probe.counts['pieces settled'] = (stage.probe.counts['pieces settled'] ?? 0) + 1;
    }
    for (const h of going) { h.on = false; h.fade = o.ahead && coming.some((c) => over(h, c)) ? { since: now, rising: false } : undefined; }
    }
    // A piece that has not been shown yet is drawn once on none of the picture's dots, so that its lists are on
    // the graphics card before it shows: one piece to a picture, and only a piece that lies in the picture or in the
    // one the view will come to rest at (a piece around the picture waits until the view comes to it: sent at once,
    // twice the megabytes went to the card in a zoom and back, half of them never to be seen). It stays so until
    // the stage has drawn a picture: a look is not a picture, pieces arrive and the view moves between two
    // pictures, and each brings a look. (Where the look after hid the piece again, it was never drawn, and all the
    // pieces of a step sent their lists in the picture that first showed them: measured on a Mac, 26 to 78 lists
    // and 100 to 170 ms in one picture, wherever pieces came fast, as they do from disk.)
    let warming = false, queued = false;
    for (const h of held.values()) if (h.warm !== undefined && h.warm >= 0) { if (stage.pictures() > h.warm) { h.warm = undefined; stage.whole(h.group, false); } else warming = true; }
    for (const h of held.values()) {
      if (h.warm !== -1 || h.on || h.fade || h.laid > 0 || (outside(v, h.step, h.px, h.pz) > 0 && outside(rest, h.step, h.px, h.pz) > 0)) continue;
      if (warming) { queued = true; break; }
      // (drawn whether it lies in the picture or not: the picture the view comes to rest at may reach beyond this one)
      h.warm = stage.pictures(); stage.whole(h.group, true); warming = true;
    }
    const showing = new Set<Held>();
    for (const h of held.values()) {
      const share = h.fade ? Math.min(1, (now - h.fade.since) / DISSOLVE) : 1;
      if (share >= 1) h.fade = undefined;
      const shows = h.on || !!h.fade || h.laid > 0;
      if (shows && h.warm !== undefined) { h.warm = undefined; stage.whole(h.group, false); }
      h.group.visible = shows || (h.warm ?? -1) >= 0;
      if (!h.group.visible) continue;
      if (shows) showing.add(h);
      else {
        // drawn on none of the picture's dots, where it will lie
        stage.dissolve(h.group, 0, 0);
        const f = 2 ** (h.step - step), tall = f * reliefOf(v.wide, h.step);
        h.group.scale.set(f, tall, f);
        h.group.position.set((h.px * PIECE - marginOf(h.step)) * f - layout.homeX, SEA_Y * (1 - tall), (h.pz * PIECE - marginOf(h.step)) * f - layout.homeZ);
        continue;
      }
      h.seen = looks; fading ||= !!h.fade;
      // (a piece glides by the view's width: one that stands in for finer ones has not begun, one that the coarser
      // step is taking the place of has arrived; and one that came late for a coarser one comes from that one's shape)
      const settled = h.settle && settleOf(glideOf(v.wide, h.step), h.settle.by, now - h.settle.since);
      if (settled === undefined) h.settle = undefined; else fading = true;
      stage.glide(h.group, settled ?? glideOf(v.wide, h.step));
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
      h.group.position.set((h.px * PIECE - marginOf(h.step)) * f - layout.homeX, SEA_Y * (1 - tall), (h.pz * PIECE - marginOf(h.step)) * f - layout.homeZ);
    }
    // (the pictures go on while pieces are drawn so, or wait for it)
    fading ||= warming || queued;
    // the houses of the pieces in the picture, from their fine blocks where the view is near
    const cells: HouseCell[] = [];
    for (const h of showing) for (const c of h.cells) cells.push({ key: c.key, group: h.group, far: c.far, lots: c.lots, ground: c.ground, dots: h.dots, out: beyond(v, c.x, c.z, CELL, HOUSE_LEAN), away: Math.hypot(c.x - v.x, c.z - v.z) });
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
