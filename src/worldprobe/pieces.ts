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
// are sent: stage/api.ts `staged`, which says why that is not the rule.)
// The houses that have fine blocks and the paved ground lie in cells of their own on their piece: from near, fine.ts
// builds them again.
// A piece that has been built is kept on disk as well (store.ts): the next time it is asked for, in this visit or a
// later one, it is read, in a few hundredths of a second where building it takes most of one. While the view rests
// and all it asks for is there, the pieces of the coarser steps that a wider view from here would show are built
// into that store, the coarsest first: a leap out to them then finds them there.
//
// The parts: where the pieces lie for a view and what it asks for (piece_sight.ts), the store on disk
// (piece_store.ts), the workers and their jobs (piece_builders.ts), the pieces that arrive going on the stage
// (piece_arrival.ts), and how the pieces on it show (piece_show.ts). Here a look of the view brings them together.
import type { PlacePeopleList } from '../figures';
import { type Figures, figuresIn } from '../figures/stage';
import type { Stage } from '../lookprobe/stage';
import { N } from '../lookprobe/layout';
import { type HouseCell, createFine } from './fine';
import type { PieceDone, PieceJob } from './piece.worker';
import { type Held, createArrival } from './piece_arrival';
import { type Job, type Queued, createBuilders } from './piece_builders';
import { createShow } from './piece_show';
import { PIECE, RANK, type Spot, type View, aheadOf, beyond, near, outside, wantedOf } from './piece_sight';
import { type PieceStore, openStore } from './piece_store';
import { cover, keyOf } from './pyramid';
import { CELL } from './world';
import { BLENDS, COARSEST, blendOf, stepOf } from './zoom';

export type { View };

/** blocks of land around a piece on the ground of N blocks it is built on */
const MARGIN = (N - PIECE) / 2;
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
const NARROW_FROM = 1,
  NARROW = 32;
/**
 * Once the view (or the view it comes to rest at) is at this step or a finer one, the workers load the map's data
 * of the finest step, whose pieces are the only ones still built from it (the others are drawn from their tables):
 * a zoom in to the towns then finds them ready, and its first pieces do not wait half a second for it in every worker.
 */
const WARM_FROM = 2;
/** pieces kept on the stage beyond those the view asks for */
const SPARE = 10;
/** summaries of finest pieces kept for the pieces over them (half a megabyte each) */
const KEPT_SUMS = 96;
/** workers that build ahead into the store while the view rests: the others stay free for what the view asks for next */
const SPARE_WORKERS = 2;
/** the stage counts its blocks from a home near the view; a new home is taken when the view has moved this far from it */
const HOME_REACH = 3000;
/** a house leans this many blocks into the picture */
const HOUSE_LEAN = 12;

/** How the stage is laid out for a view: its blocks are `coarse` finest blocks wide and counted from `home`. */
export interface Layout {
  step: number;
  coarse: number;
  homeX: number;
  homeZ: number;
}

interface Pieces {
  /** Brings the stage to the view: asks for what is missing, shows what covers the picture best. Returns the layout and how many pieces of the picture are still to come. */
  look(view: View): Layout & { missing: number };
  /** Hands the workers newer lists of persons (src/people/town_rolls.ts). */
  tellPersons(lists: readonly PlacePeopleList[]): void;
  /**
   * Builds again, from the lists the workers hold, the figures of the finest pieces on the stage that `stale` finds
   * built with persons who have changed since; each piece once for each `version` of the lists. The land of the piece
   * stays as it is, and the piece is kept on disk anew.
   */
  renewFigures(stale: (f: Figures) => boolean, version: number): void;
  /** the first error of a worker, if any */
  failed: string;
  /** Stops the workers; the pieces are not used after that. */
  dispose(): void;
}

/**
 * `ahead`: build the coarser step and the surroundings of the picture too (a tool that takes one picture does not
 * need them). `changed` is called whenever a piece has arrived.
 */
interface PiecesOptions {
  region: string;
  base: string;
  bakedSky: boolean;
  ahead: boolean;
  changed(): void;
  /** how many workers build the pieces (default: up to 6 where the machine has ten cores or more, else up to 4 and one core left) */
  workers?: number;
  /** the world's start year, whose towns are built */
  year?: number;
  /** blocks of land around a piece of the far steps, for measuring (default NARROW; 100 is the wide margin of the finest step) */
  margin?: number;
  /** keeps the pieces on disk, under this name of the game's build (store.ts): pieces of another build are not read */
  keep?: string;
  /** the pieces' directions and colours as bytes, 20 bytes to a corner (small.ts), not as floats of 36 */
  small?: boolean;
  /** and their rectangles on the grid of blocks as faces, 32 bytes to a rectangle (lookprobe/faces.ts) */
  faces?: boolean;
  /** false: the rectangles on no grid of what stands on a piece stay triangles, not faces of floats (faces.ts `Free`) */
  free?: boolean;
  /** false: every piece is built from the map's data, also where its table was built ahead (table.ts) */
  tables?: boolean;
  /** false: the far steps change at their borders as they are, their land does not glide to the coarser step's shape (glide.ts) */
  glide?: boolean;
  /** false: the level tops of a piece's columns stay a face to each column (tops.ts) */
  tops?: boolean;
  /** true: the first far step as the mean of the finest step (mean.ts: exact, but it builds four finest pieces for each far piece); 'compare': as far.ts lays it out, and measured against that mean (the counts `cmp …`); else as far.ts lays it out */
  mean?: boolean | 'compare';
}

/** The pieces of the world on `stage`, as the views given to `look` ask for them. */
export function createPieces(stage: Stage, o: PiecesOptions): Pieces {
  /** the pieces on the stage, and those being built or waiting to go on it, by their keys */
  const held = new Map<string, Held>(),
    building = new Set<string>();
  const fine = createFine(stage, {
    still: !o.ahead,
    changed: o.changed,
    small: o.small,
    free: !!o.small && !!o.faces && o.free !== false,
  });
  /** the finest pieces on the stage whose figures are to be built again, and the version of the lists of the persons
   *  each was last found out of date with */
  const renewals = new Set<string>(),
    renewed = new Map<string, number>();
  const pieces: Pieces = {
    look,
    tellPersons: (lists) => builders.tell({ persons: lists, year: o.year }),
    renewFigures(stale, version) {
      let more = false;
      for (const [key, h] of held) {
        if (h.step !== 0 || renewed.get(key) === version) continue;
        const f = figuresIn(h.group)?.f;
        if (!f || !stale(f)) continue;
        renewed.set(key, version);
        renewals.add(key);
        more = true;
      }
      if (more) o.changed();
    },
    failed: '',
    dispose: () => {
      builders.dispose();
      store?.dispose();
      fine.dispose();
    },
  };
  let looks = 0,
    ticking = false,
    layout: Layout = { step: -1, coarse: 1, homeX: 0, homeZ: 0 };
  /** blocks of land around a piece of a step on the ground it is built on */
  const marginOf = (step: number) =>
    step >= (o.mean ? NARROW_FROM + 1 : NARROW_FROM) ? Math.min(MARGIN, o.margin ?? NARROW) : MARGIN;
  /**
   * what the pieces of the finest step show, summed up for the pieces of the next step over them (mean.ts), the
   * last KEPT_SUMS of them: a piece of the first far step is the mean of the four finest under it, and need not
   * build those the page has built already
   */
  const sums = new Map<string, Float32Array>();
  /** the pieces the last look asked for */
  const asked = new Set<string>();
  // (the pieces a tool measures against the mean are not what the view shows)
  let store: PieceStore | null =
    o.keep && o.mean !== 'compare'
      ? openStore(stage, o.keep, o.changed, () => {
          store = null;
        })
      : null;
  /** the name of a piece's file: all that the piece depends on, beside the build */
  const fileOf = (p: Spot) =>
    `${o.region}_${o.year ?? 0}_${p.step}_${p.px}_${p.pz}_${o.bakedSky ? 1 : 0}${o.mean ? 1 : 0}_${marginOf(p.step)}${o.small ? (o.faces ? (o.free === false ? '_f' : '_e') : '_s') : ''}${o.tables === false ? '_b' : ''}${o.glide === false || !o.small || !o.faces ? '' : '_g'}${o.tops === false ? '_t' : ''}`;
  const arrival = createArrival(stage, o, held, building, asked, () => looks, marginOf);
  const show = createShow(stage, held, o.ahead, marginOf);
  const builders = createBuilders(o.workers, answered, (message) => {
    pieces.failed ||= message;
    o.changed();
  });

  /** what a worker answered for a job */
  function answered(spot: Job, d: PieceDone) {
    // (a job taken back before the worker began it: the view gives it out again if it still asks for it)
    if (d.cancelled) {
      building.delete(spot.key);
      stage.probe.counts['jobs taken back'] = (stage.probe.counts['jobs taken back'] ?? 0) + 1;
      o.changed();
      return;
    }
    if (d.summary) {
      sums.delete(spot.key);
      sums.set(spot.key, d.summary);
      if (sums.size > KEPT_SUMS) sums.delete(sums.keys().next().value!);
    }
    if (store && d.kept) store.used(fileOf(spot));
    if (store && d.packed) store.put(fileOf(spot), d.packed);
    // a piece built again for its figures keeps its land on the stage and takes only the new figures
    if (spot.renew) {
      building.delete(spot.key);
      const h = held.get(spot.key);
      if (d.error) pieces.failed ||= d.error;
      else if (d.scene) {
        renewals.delete(spot.key);
        if (h) stage.swapFigures(h.group, d.scene.figures);
        stage.probe.counts['pieces renewed'] = (stage.probe.counts['pieces renewed'] ?? 0) + 1;
      }
      o.changed();
      return;
    }
    // a piece goes on the stage only if the view asks for it: one built ahead into the store only if the view has
    // come to ask for it meanwhile, and one the view has moved away from while it was built not at all (it is kept
    // on disk all the same; sent to the graphics card it would only have cost a picture its time)
    const unasked = !asked.has(spot.key);
    if (unasked && spot.spare)
      for (const [name, n] of Object.entries(d.scene?.counts ?? {}))
        if (name.startsWith('ms ') || name.startsWith('pieces '))
          stage.probe.counts[`${name} ahead`] = (stage.probe.counts[`${name} ahead`] ?? 0) + n;
    if (unasked && !spot.spare && d.scene)
      stage.probe.counts['pieces no longer asked'] = (stage.probe.counts['pieces no longer asked'] ?? 0) + 1;
    // (a piece counts as being built until it is on the stage, so that it is not asked for again)
    if (d.scene && !d.error && !unasked) arrival.take(spot, d.scene);
    else building.delete(spot.key);
    if (d.error) pieces.failed ||= d.error;
    arrival.schedule();
  }

  /** the job of building a piece */
  function jobOf(next: Spot, id: number): PieceJob {
    const margin = marginOf(next.step);
    return {
      id,
      step: next.step,
      small: o.small,
      faces: o.faces,
      free: o.free,
      tables: o.tables,
      glide: o.glide !== false,
      tops: o.tops,
      grid: margin === MARGIN ? undefined : PIECE + 2 * margin,
      keep: store
        ? { build: store.build, name: fileOf(next), kept: !next.renew && (!store.listed || store.kept(fileOf(next))) }
        : undefined,
      piece: {
        ox: next.px * PIECE - margin,
        oz: next.pz * PIECE - margin,
        part: { x0: margin, z0: margin, x1: margin + PIECE, z1: margin + PIECE },
      },
      region: o.region,
      base: o.base,
      bakedSky: o.bakedSky,
      year: o.year,
      mean: o.mean,
      under:
        next.step === 1
          ? [0, 1, 2, 3].map((q) => sums.get(keyOf(0, next.px * 2 + (q & 1), next.pz * 2 + (q >> 1))))
          : undefined,
    };
  }

  function look(v: View): Layout & { missing: number } {
    const step = stepOf(v.wide),
      stepped = step !== layout.step,
      blend = blendOf(v.wide);
    // where the zoom has blended two far steps by the time their border is crossed, nothing dissolves there
    const seamless = BLENDS && stepped && Math.min(step, layout.step) > 0;
    layout = layoutFor(layout, v, step);
    looks++;
    const rest = o.ahead && v.to ? { ...v, ...v.to } : v,
      restStep = stepOf(rest.wide);
    const { missing, coarser } = ask(v, step, rest, restStep, blend);
    const { showing, fading } = show.show(
      { v, rest, step, stepped, seamless, blend, coarser, homeX: layout.homeX, homeZ: layout.homeZ, looks },
      shownOf(v, step),
    );
    // the houses of the pieces in the picture, from their fine blocks where the view is near
    const houses = fine.look(v.wide, cellsOf(showing, v));
    pieces.failed ||= fine.failed;
    letGo();
    // a dissolve goes on from picture to picture
    if ((fading || houses.fading) && !ticking) {
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        o.changed();
      });
    }
    stage.redraw();
    return { ...layout, missing: missing + houses.missing };
  }

  /**
   * Asks for the pieces the view `v` of `step` needs (`rest` of `restStep`: the view a motion under way comes to rest
   * at) and gives them out to the workers; returns how many of the picture's own are still to come, and the pieces of
   * the coarser step in the picture.
   */
  function ask(
    v: View,
    step: number,
    rest: View,
    restStep: number,
    blend: number,
  ): { missing: number; coarser: readonly Spot[] } {
    if (o.ahead && Math.min(step, restStep) <= WARM_FROM)
      builders.warm({ warm: true, region: o.region, base: o.base, year: o.year });
    const { wanted, coarser } = wantedOf(v, step, rest, restStep, o.ahead, blend);
    let missing = 0;
    for (const w of wanted) {
      const h = held.get(w.key);
      if (h) h.seen = looks;
      else if ((w.step === step && w.rank >= RANK.own && w.rank < RANK.around) || (!o.ahead && w.step > step))
        missing++;
    }
    // (a piece asked for twice is built once, as early as its first asking)
    asked.clear();
    for (const w of wanted) asked.add(w.key);
    const once = new Set<string>(),
      queue: Queued[] = wanted
        .filter((w) => !held.has(w.key) && !building.has(w.key))
        .sort((a, b) => a.rank - b.rank)
        .filter((w) => !once.has(w.key) && once.add(w.key))
        .reverse();
    // the pieces whose figures are built again come after all the view is missing
    for (const key of renewals) {
      const h = held.get(key);
      if (!h) renewals.delete(key);
      else if (!building.has(key)) queue.unshift({ key, step: 0, px: h.px, pz: h.pz, renew: true });
    }
    // while the view rests with all it asks for, pieces a zoom from here would come to are built into the store by
    // some of the workers (not for a page nobody looks at)
    const sparing = [...builders.jobs.values()].filter((j) => j.spare).length;
    if (
      store?.listed &&
      o.ahead &&
      !v.to &&
      !document.hidden &&
      !queue.length &&
      building.size === sparing &&
      sparing < SPARE_WORKERS
    ) {
      const kept = store,
        lacks = (p: Spot) =>
          !held.has(p.key) && !building.has(p.key) && !kept.kept(fileOf(p)) && !kept.sending(fileOf(p));
      queue.push(...aheadOf(v, step, lacks, SPARE_WORKERS - sparing));
    }
    builders.give(queue, (next) => building.add(next.key), jobOf);
    builders.takeBack(wanted, queue);
    // the store zips what it has written once the workers are through with what the picture is missing
    store?.busy([...builders.jobs.values()].some((j) => !j.spare) || queue.length > 0);
    return { missing, coarser };
  }

  /** what is shown: from the coarsest pieces down, a piece gives way to the four under it once they cover their share
   *  (from the coarsest step of all: after a leap of the zoom the pieces of the view before are all there is) */
  function shownOf(v: View, step: number): Set<Held> {
    return cover(
      step,
      COARSEST,
      near(v, COARSEST, 0).map((p) => [p.px, p.pz] as const),
      (s, px, pz) => held.get(keyOf(s, px, pz)),
      (s, px, pz) => outside(v, s, px, pz) <= 0,
    );
  }

  /** pieces the view no longer asks for leave the stage, those unused the longest first */
  function letGo() {
    const spare = [...held].filter(([, h]) => h.seen !== looks).sort((a, b) => a[1].seen - b[1].seen);
    for (const [key, h] of spare.slice(0, Math.max(0, spare.length - SPARE))) {
      stage.remove(h.group);
      held.delete(key);
      renewals.delete(key);
      renewed.delete(key);
    }
  }
  return pieces;
}

/** How the stage is laid out for the view `v` of `step`: as it was, unless the step changed or the view moved
 *  HOME_REACH from its home. */
function layoutFor(was: Layout, v: View, step: number): Layout {
  const coarse = 2 ** step;
  if (
    step !== was.step ||
    Math.abs(v.x / coarse - was.homeX) > HOME_REACH ||
    Math.abs(v.z / coarse - was.homeZ) > HOME_REACH
  )
    return {
      step,
      coarse,
      homeX: Math.floor(v.x / coarse / PIECE) * PIECE,
      homeZ: Math.floor(v.z / coarse / PIECE) * PIECE,
    };
  return was;
}

/** the cells of the towns of the pieces in the picture, for the fine houses (fine.ts) */
function cellsOf(showing: ReadonlySet<Held>, v: View): HouseCell[] {
  const cells: HouseCell[] = [];
  for (const h of showing)
    for (const c of h.cells)
      cells.push({
        key: c.key,
        group: h.group,
        far: c.far,
        lots: c.lots,
        ground: c.ground,
        dots: h.dots,
        out: beyond(v, c.x, c.z, CELL, HOUSE_LEAN),
        away: Math.hypot(c.x - v.x, c.z - v.z),
      });
  return cells;
}
