// Where the pieces of the world lie for a view, for pieces.ts: how far a piece lies outside the picture, the pieces
// of a step about it, what a view asks for and in which order, and what is built ahead into the store while it rests.
import { NEAR, RIGHT } from '../lookprobe/layout';
import { keyOf } from './pyramid';
import { COARSEST, FARTHEST, NEAREST, elevationOf, stepOf } from './zoom';

/** side of a piece in blocks; each is built on a ground of N blocks, so that it knows the land around it */
export const PIECE = 200;
/** what stands on a block leans this many blocks into the picture */
const LEAN = 30;
/** pieces are built ahead of need this far around the picture, as a share of its width */
const AHEAD = 0.3;
/** the pieces of the next finer step are built ahead once the view is within this factor of the width at which that step takes over */
const ZOOM_AHEAD = 1.25;
/** before the pieces of a picture, those of this many steps coarser under it are built: 16 times the ground each, so one to four of them */
const STAND_IN = 2;
/** the widest view of each step: what a leap out to that step may show */
const WIDEST = Array.from({ length: COARSEST + 1 }, (_, s) => {
  let w = NEAREST;
  while (w < FARTHEST && stepOf(w * 1.02) <= s) w *= 1.02;
  return Math.min(FARTHEST, w);
});

/**
 * What a view asks for comes in kinds, in this order: the pieces STAND_IN steps coarser under the picture the view
 * will come to rest at, that picture's own pieces, the view's own step in the picture, the coarser step under it, the
 * view's own step around the picture, the finer step, and the pieces of every coarser step. A piece's rank is its
 * kind's base plus its distance from the middle of the view; a kind spans RANK_KIND (pieces.ts takes back a job that
 * waits behind one of a more urgent kind).
 */
export const RANK = {
  standIn: -1e9,
  rest: 0,
  own: 1e9,
  coarser: 1.5e9,
  around: 2e9,
  finer: 3e9,
  under: 4e9,
} as const;
export const RANK_KIND = 5e8;

/** The view: the place at the middle of the picture in the finest blocks, how many of them lie across it, the picture's shape and width in pixels, and how far the camera looks down. */
export interface View {
  x: number;
  z: number;
  wide: number;
  aspect: number;
  pixels: number;
  elevation: number;
  /** the view a motion under way will come to rest at */
  to?: {
    x: number;
    z: number;
    wide: number;
    elevation: number;
  };
}
/** a piece of the world: its step and where it lies on that step's grid of pieces */
export interface Spot {
  key: string;
  step: number;
  px: number;
  pz: number;
  /** built ahead into the store: it goes on the stage only if the view has come to ask for it */
  spare?: boolean;
}
/** a piece a view asks for, with its rank (RANK) */
export interface Wanted extends Spot {
  rank: number;
}

/** how far a square of `side` finest blocks about (cx, cz) lies outside the picture (0: it reaches into it); what stands on it leans `lean` blocks into the picture */
export function beyond(v: View, cx: number, cz: number, side: number, lean: number): number {
  const right = (cx - v.x) * RIGHT[0] + (cz - v.z) * RIGHT[1],
    near = (cx - v.x) * NEAR[0] + (cz - v.z) * NEAR[1];
  // a square reaches half its diagonal from its middle
  const deep = v.wide / v.aspect / Math.sin((v.elevation * Math.PI) / 180),
    reach = side * 0.71 + lean;
  return Math.max(0, Math.abs(right) - v.wide / 2 - reach, Math.abs(near) - deep / 2 - reach);
}

/** how far a piece lies outside the picture, in finest blocks */
export function outside(v: View, step: number, px: number, pz: number): number {
  const side = PIECE * 2 ** step;
  return beyond(v, (px + 0.5) * side, (pz + 0.5) * side, side, LEAN * 2 ** step);
}

/** the pieces of a step within `around` finest blocks of the picture */
export function near(v: View, step: number, around: number): (Spot & { out: number; far: number })[] {
  const side = PIECE * 2 ** step,
    px0 = Math.floor(v.x / side),
    pz0 = Math.floor(v.z / side),
    list = [];
  const span = Math.ceil((v.wide / Math.sin((v.elevation * Math.PI) / 180) + around) / side) + 2;
  for (let pz = pz0 - span; pz <= pz0 + span; pz++)
    for (let px = px0 - span; px <= px0 + span; px++) {
      const out = outside(v, step, px, pz);
      if (out <= around)
        list.push({
          key: keyOf(step, px, pz),
          step,
          px,
          pz,
          out,
          far: Math.hypot((px + 0.5) * side - v.x, (pz + 0.5) * side - v.z),
        });
    }
  return list;
}

/**
 * What the view `v` of `step` asks for, each piece with its rank, and the pieces of the next coarser step in the
 * picture (`coarser`, laid into the picture as the view nears that step: `blend`, zoom.ts `blendOf`). `rest` is the
 * view a motion under way comes to rest at (`v` itself where there is none), of `restStep`. Without `ahead` (a tool
 * that takes one picture) only what the picture shows is asked for.
 */
export function wantedOf(
  v: View,
  step: number,
  rest: View,
  restStep: number,
  ahead: boolean,
  blend: number,
): { wanted: Wanted[]; coarser: Spot[] } {
  // what the view asks for: its own step in the picture first, then the coarser step under the picture, then around it
  const wanted: Wanted[] = [];
  // first of all the picture the view will come to rest at, from its middle outwards; and before its own pieces the
  // few of STAND_IN steps coarser under it: in the time one piece takes to build, that picture is covered by blocks
  // a few times as wide, where it would else show far coarser ones or none until all of its own are there
  if (ahead && restStep + STAND_IN <= COARSEST)
    for (const p of near(rest, restStep + STAND_IN, 0)) wanted.push({ ...p, rank: RANK.standIn + p.far });
  if (rest !== v) for (const p of near(rest, restStep, 0)) wanted.push({ ...p, rank: RANK.rest + p.far });
  for (const p of near(v, step, ahead ? AHEAD * v.wide : 0))
    wanted.push({ ...p, rank: (p.out > 0 ? RANK.around : RANK.own) + p.far });
  // a coarser piece is four times the size, so those of the picture reach far enough around it
  const coarser = step < COARSEST && (ahead || blend > 0) ? near(v, step + 1, 0) : [];
  // (after the view's own pieces in the picture: a piece of the first far step is made of the finest ones under it, mean.ts)
  for (const p of coarser) wanted.push({ ...p, rank: RANK.coarser + p.far });
  // the finer step, once the view comes near it: last of all
  if (ahead && stepOf(v.wide / ZOOM_AHEAD) < step)
    for (const p of near(v, step - 1, 0)) wanted.push({ ...p, rank: RANK.finer + p.far });
  // and the pieces of every coarser step under the picture, the coarsest first: they are kept, so that a view that
  // widens at once finds the land under it there, however coarse (a piece of the coarsest step covers a picture of
  // every step but its own)
  if (ahead)
    for (let s = COARSEST; s > step + 1; s--)
      for (const p of near(v, s, 0)) wanted.push({ ...p, rank: RANK.under + (COARSEST - s) * 1e7 + p.far });
  return { wanted, coarser };
}

/**
 * What is built into the store while the view `v` of `step` rests with all it asks for, `count` at most of what
 * `lacks` says is missing: the pieces of the coarser steps that a wider view from here would show, the coarsest
 * first; and after them those of the next finer step that a zoom in about the middle of the picture would come to
 * first, from the middle outwards (a zoom in finds them there and reads them, which takes a fraction of building
 * them). In the order the jobs are taken from the end of a queue.
 */
export function aheadOf(v: View, step: number, lacks: (p: Spot) => boolean, count: number): Spot[] {
  const ahead: (Spot & { far: number })[] = [];
  for (let s = COARSEST; s > step; s--)
    for (const p of near({ ...v, wide: WIDEST[s], elevation: elevationOf(WIDEST[s]) }, s, 0))
      if (lacks(p)) ahead.push({ ...p, spare: true });
  if (!ahead.length && step > 0) {
    const wide = Math.min(v.wide, WIDEST[step - 1]);
    for (const p of near({ ...v, wide, elevation: elevationOf(wide) }, step - 1, 0))
      if (lacks(p)) ahead.push({ ...p, spare: true });
  }
  ahead.sort((a, b) => b.step - a.step || a.far - b.far);
  return ahead.slice(0, count).reverse();
}
