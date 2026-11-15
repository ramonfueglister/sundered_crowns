// How the world changes with the distance it is looked at from, as in a map that is a model up close: near, a
// diorama seen from the side; farther out the relief sinks, the camera rises, and woods and towns become patches of
// colour; from the width of a few countries on, the flat world gives way to the painted map with its realms.
// Every rule is a smooth function of `wide`, the finest blocks across the picture, so that nothing jumps while zooming.
import { smooth } from '../lookprobe/batch';
import { VIEW } from '../lookprobe/layout';

/** finest blocks across the picture: from a town filling it to the whole map */
export const NEAREST = 90, FARTHEST = 32000;
/** a step of the map takes over from the finer one when this many of its blocks lie across the picture */
const STEP_FROM = 150;
/** the coarsest step drawn in blocks: beyond it only the painted map shows */
export const COARSEST = 5;
/** where the painted map begins to show through the blocks, and from where it stands alone */
const PAPER_FROM = 3200, PAPER_ALONE = 6400;
/** the camera looks down as in the reference from near, and straight down where the painted map begins */
const TILT_FROM = 400, TILT_UNTIL = 4500, STRAIGHT_DOWN = 89.5;
/** the relief keeps its strength up to here and is all but flat where the camera looks straight down */
const RELIEF_FROM = 500, RELIEF_LEAST = 0.06;
/** the realms colour the painted map from here, fully from there */
const REALMS_FROM = 4000, REALMS_FULL = 9000;
/** blocks across the picture at the middle of the finest step: there a step's heights are drawn as they were built */
const MIDDLE = STEP_FROM * Math.SQRT2;
/** a step's blocks stand for heights flattened by this power of their width (see buildWorld) */
const FLATTER = 0.6;

const over = (from: number, until: number, wide: number) => smooth(Math.log2(from), Math.log2(until), Math.log2(wide));

/** The step of the map a view is drawn in: its blocks are 2^step finest blocks wide. */
export const stepOf = (wide: number) => Math.max(0, Math.min(COARSEST, Math.floor(Math.log2(wide / STEP_FROM))));
/** How far the camera looks down, in degrees. */
export const elevationOf = (wide: number) => VIEW.elevation + (STRAIGHT_DOWN - VIEW.elevation) * over(TILT_FROM, TILT_UNTIL, wide);
/** How strongly the painted map covers the blocks, 0 … 1. */
export const paperOf = (wide: number) => over(PAPER_FROM, PAPER_ALONE, wide);
/** How strongly the realms colour the painted map, 0 … 1. */
export const realmsOf = (wide: number) => over(REALMS_FROM, REALMS_FULL, wide);
/**
 * How tall a piece of `step` is drawn, as a share of how it was built. From far away the land keeps the height it has
 * between the steps (each coarser step is built flatter), then sinks towards the flat map.
 */
export function reliefOf(wide: number, step: number): number {
  const kept = (Math.max(wide, MIDDLE) / MIDDLE) ** (1 - FLATTER) / 2 ** ((1 - FLATTER) * step);
  return kept * (1 - (1 - RELIEF_LEAST) * over(RELIEF_FROM, TILT_UNTIL, wide));
}
