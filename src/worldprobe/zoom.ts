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

/** finest blocks across the picture: from a street of houses to half the globe */
export const NEAREST = 30, FARTHEST = 26000;
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
/** the coarsest step: its blocks are 2^6 cells wide */
export const COARSEST = 6;
/** the coarsest level of the realms' map: there a tile is 2^6 times 512 cells wide */
export const PAPER_COARSEST = 6;
/** the camera looks down as in the reference from near, and straight down where the realms begin to show */
const TILT_FROM = 500, TILT_UNTIL = 11000, STRAIGHT_DOWN = 89.5;
/** the relief keeps its strength up to here and is all but flat where the camera looks straight down */
const RELIEF_FROM = 500, RELIEF_LEAST = 0.06;
/**
 * the realms colour the flat world from here, fully from there: a short way, well after the world lies flat, so that
 * the map comes in one move of the wheel and the world is not seen half under it for long
 */
const REALMS_FROM = 15000, REALMS_FULL = 17500;
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
/** The level of the realms' map a view is drawn from: its dots are 2^level finest cells wide, about one to a pixel of a picture `pixels` wide. */
export const paperLevelOf = (wide: number, pixels: number) => Math.max(0, Math.min(PAPER_COARSEST, Math.ceil(Math.log2((0.7 * wide) / pixels))));
/** How deep the creases and corners of the blocks are drawn, 1 … 0: they go as the relief goes. */
export const creasesOf = (wide: number) => 1 - over(RELIEF_FROM, TILT_UNTIL, wide);
/** How strongly the realms colour the world, 0 … 1. */
export const realmsOf = (wide: number) => over(REALMS_FROM, REALMS_FULL, wide);
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
