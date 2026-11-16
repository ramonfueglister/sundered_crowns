// How the world changes with the distance it is looked at from, as in a map that is a model up close. Near, it is a
// diorama seen from the side; from very near, a street of houses, the camera looks down a little more steeply, the
// light is softer, and the houses that have fine blocks are built from them (fine.ts). Farther out the same world is
// simply seen from farther away: it is drawn in coarser steps of the map, in which houses and trees become single
// blocks and then colours of the ground (far.ts), the relief sinks and the camera rises. Only in the last stretch,
// when the world lies flat under a camera that looks straight down, the realms colour it and their names are written
// across it: the 2D map.
// Every rule but the step is a smooth function of `wide`, the finest blocks across the picture.
import { smooth } from '../lookprobe/batch';
import { VIEW } from '../lookprobe/layout';
import { FINER, FINER_STEPS } from './land';

/** finest blocks across the picture: from a street of houses to the whole width of the world (data/content/world_extent.json) */
export const NEAREST = 30, FARTHEST = 14000 * FINER;
/**
 * the near view: from NEAR_FROM inwards the camera rises to the angle and the light softens to that of the near
 * view's reference, fully at FINE_UNTIL; from there inwards the houses in the picture are built from their fine
 * blocks. A fine block is then four dots wide in a picture of 1600, and a town fills the picture with some three
 * million triangles; wider, it would be many more (a fine house has 12,000 to 40,000).
 */
const NEAR_FROM = 160, NEAR_ELEVATION = 30;
export const FINE_UNTIL = 70;
/** up to this width the world is built house by house and tree by tree (step 0) */
const DETAIL_UNTIL = 400;
/** a coarser step takes over from the finer one when this many of its blocks lie across the picture */
const STEP_FROM = 300;
/** the coarsest step: its blocks are 2^7 finest blocks wide, 2^5 cells of the land's data */
export const COARSEST = 5 + FINER_STEPS;
/** the coarsest level of the realms' map: there a tile is 2^8 times 512 finest blocks wide */
export const PAPER_COARSEST = 6 + FINER_STEPS;
/**
 * The rules of the land's look are reckoned in cells of the land's data, of which FINER finest blocks make one
 * (land.ts). The camera looks down as in the reference from near, and straight down where the realms begin to show.
 */
const TILT_FROM = 500 * FINER, TILT_UNTIL = 5500 * FINER, STRAIGHT_DOWN = 89.5;
/** the relief keeps its strength up to here and is all but flat where the camera looks straight down */
const RELIEF_FROM = 500 * FINER, RELIEF_LEAST = 0.06;
/**
 * the realms colour the flat world from here, fully from there: a short way, well after the world lies flat, so that
 * the map comes in one move of the wheel and the world is not seen half under it for long
 */
const REALMS_FROM = 7500 * FINER, REALMS_FULL = 8750 * FINER;
/** blocks across the picture at the middle of a step: there its heights are drawn as they were built */
const MIDDLE = STEP_FROM * Math.SQRT2;
/** a step's blocks stand for heights flattened by this power of their width (see buildWorld) */
const FLATTER = 0.6;

const over = (from: number, until: number, wide: number) => smooth(Math.log2(from), Math.log2(until), Math.log2(wide));

/** How much of the near view a view has, 0 … 1: its camera angle and its light. */
export const nearOf = (wide: number) => 1 - over(FINE_UNTIL, NEAR_FROM, wide);
/** The step of the map a view is drawn in: its blocks are 2^step finest blocks wide. */
export const stepOf = (wide: number) => (wide < DETAIL_UNTIL ? 0 : Math.max(1, Math.min(COARSEST, Math.floor(Math.log2(wide / STEP_FROM)))));
/** How far the camera looks down, in degrees. */
export const elevationOf = (wide: number) => VIEW.elevation + (NEAR_ELEVATION - VIEW.elevation) * nearOf(wide) + (STRAIGHT_DOWN - VIEW.elevation) * over(TILT_FROM, TILT_UNTIL, wide);
/**
 * a coarser step does not take over all at once: over the last stretch before its border, from the border's width
 * divided by this, it is laid into the picture of the finer step dot by dot, more and more as the view widens, so
 * that the change follows the zoom and has happened when the border is reached
 */
const BLEND = 1.6;
/**
 * the same for the step built house by house: its picture and that of the first far step differ too much to lie
 * over each other for long (a town of sharp houses turns to haze), so the way is short there
 */
const BLEND_DETAIL = 1.2;
/** How much of the next coarser step a view already shows in place of its own, 0 … 1 (1 only at the step's border). */
export function blendOf(wide: number): number {
  const step = stepOf(wide);
  if (step >= COARSEST) return 0;
  const border = step === 0 ? DETAIL_UNTIL : STEP_FROM * 2 ** (step + 1);
  return over(border / (step === 0 ? BLEND_DETAIL : BLEND), border, wide);
}
/** The level of the realms' map a view is drawn from: its dots are 2^level finest cells wide, about one to a pixel of a picture `pixels` wide. */
export const paperLevelOf = (wide: number, pixels: number) => Math.max(0, Math.min(PAPER_COARSEST, Math.ceil(Math.log2((0.7 * wide) / pixels))));
/** How deep the creases and corners of the blocks are drawn, 1 … 0: they go as the relief goes. */
export const creasesOf = (wide: number) => 1 - over(RELIEF_FROM, TILT_UNTIL, wide);
/**
 * How far the creases reach, in finest blocks, as a share of the look's own reach. The stage draws them in its own
 * blocks, which double in width at every step of the map; so that the picture does not darken at a step's border,
 * their reach grows evenly with the view instead: as that of the steps does in the mean (a step's blocks are 1/300
 * to 1/600 of the picture wide, 1/424 at the middle), and never below that of the finest step.
 */
export const creaseReachOf = (wide: number) => Math.max(1, wide / MIDDLE);
/**
 * How far away the camera stands, in finest blocks, as a share of the look's own distance. The stage keeps it at a
 * fixed count of its own blocks, so at every step of the map the camera would leap to twice as far and the far side
 * of the picture be drawn wider at once; it moves away evenly with the view instead, as the creases' reach does.
 */
export const awayOf = creaseReachOf;
/** How strongly the realms colour the world, 0 … 1. */
export const realmsOf = (wide: number) => over(REALMS_FROM, REALMS_FULL, wide);
/**
 * the political map mode lies on the land this strongly where the world is still a diorama: the land's light and
 * shade show through, as in EU5's political map close up; the names of the realms come in from NAMES_FROM, fully at
 * NAMES_FULL, where a realm is small enough in the picture for its name to be read
 */
const POLITICAL_NEAR = 0.75, NAMES_FROM = 900 * FINER, NAMES_FULL = 2200 * FINER;
/**
 * How the realms' map lies on a view: `strength` how much it covers the land, `flat` how much it is a printed map
 * (the land's light hidden, the sea painted too), `names` how strongly the realms' names are written; all 0 … 1.
 * The political map mode lays it on the land at every distance, the terrain mode nowhere; `far` (the world probe's
 * own page and the tools that take pictures of it) only where the world lies flat, as the 2D map.
 */
export function paperOf(wide: number, mode: 'political' | 'terrain' | 'far'): { strength: number; flat: number; names: number } {
  const flat = realmsOf(wide);
  if (mode === 'terrain') return { strength: 0, flat: 0, names: 0 };
  if (mode === 'far') return { strength: flat, flat, names: flat };
  return { strength: POLITICAL_NEAR + (1 - POLITICAL_NEAR) * flat, flat, names: Math.max(flat, over(NAMES_FROM, NAMES_FULL, wide)) };
}
/** Whether a view shows the realms rather than the land: there a click means the place, nearer it means what stands on the ground. */
export const realmsShown = (wide: number) => realmsOf(wide) >= 0.5;
/**
 * How tall a piece of `step` is drawn, as a share of how it was built. From far away the land keeps the height it has
 * between the steps (each coarser step is built flatter), then sinks towards the flat map.
 */
export function reliefOf(wide: number, step: number): number {
  const kept = (Math.max(wide, MIDDLE) / MIDDLE) ** (1 - FLATTER) / 2 ** ((1 - FLATTER) * step);
  return kept * (1 - (1 - RELIEF_LEAST) * over(RELIEF_FROM, TILT_UNTIL, wide));
}
