// The rules of the land: how the blocks lie on the map (world.ts and the realms laid over them, realms.ts), where
// the trees end and the snow begins, and what grows in which kind of land.
import { type RGB, rgb } from '../lookprobe/batch';
import { NEAR, RIGHT } from '../lookprobe/layout';
import { Land } from './climate';

/**
 * The finest blocks are drawn this many steps finer than the cells of the land's data: a cell of the data is about
 * 0.77 km × cos(latitude) wide, a finest block a quarter of that (some 130 m in middle Europe). Houses, trees and
 * people are as large in blocks as they would be on the data's own cells, so that the land is less far too small for
 * them: Paris (200,000 people at one person to a hundred) would take 30 km of the data's cells and takes about 8 km;
 * at one step finer it took 16 km, and houses and trees read as too large for the land. Step 0 of the map is drawn
 * from the data's finest cells (region.ts), step 2 is drawn from them as they are, and each coarser step from the
 * data's next coarser one.
 */
export const FINER_STEPS = 2;
/** finest blocks along a cell of the data */
export const FINER = 2 ** FINER_STEPS;

/** Whole-map cell of a world block: the cells counted on the map are as large as the finest blocks, only turned against them. */
export const cellOfBlock = (wx: number, wz: number): [number, number] => [
  wx * RIGHT[0] + wz * RIGHT[1],
  wx * NEAR[0] + wz * NEAR[1],
];
/** World block of a whole-map cell. */
export const blockOfCell = (u: number, v: number): [number, number] => [
  u * RIGHT[0] + v * NEAR[0],
  u * RIGHT[1] + v * NEAR[1],
];

/**
 * above this no trees grow and the heights are stretched; above the snow line (of the raised rock) the rock is pale.
 * Where the climate of a place is known, the trees end and the rock is pale by its own lines (woodsUntil, paleFrom);
 * these stand in elsewhere, and the heights are stretched by them everywhere.
 */
export const TREE_LINE = 1900,
  SNOW_LINE = 2530;
/**
 * These heights hold in the Alps, at 46° north. Towards the pole the tree line sinks by about 60 m a degree (some
 * 1000 m in southern Norway, 500 m in the far north), towards the equator it rises to about 3900 m; the snow line
 * goes with it, and so does the foot of the rock as far as the Mediterranean (ROCK_SHIFT_MOST): farther south the
 * mountains are bare long before the trees end. A rule of thumb for the mainland: on the ocean's edge (Scotland,
 * Iceland) the real tree line lies lower still.
 */
export const lineShift = (lat: number) => Math.min(2000, Math.max(-1500, (46 - Math.abs(lat)) * 60));
const ROCK_SHIFT_MOST = 400;
/** the massifs are rock from this height upwards */
const ROCK_FROM = 1500;
/**
 * and only where they stand this far over their valley floors: a high plateau is not rock because it is high. Tibet
 * and the Altiplano are grass and steppe at 4000 to 5000 m, and only the ranges that rise from them are rock.
 */
const ROCK_RISE = 400;
/** Whether a massif of this height (m) is rock, over a valley floor of that height and with the lines shifted by `shift` for its latitude. */
export const rockAt = (massif: number, floor: number, shift: number) =>
  massif > Math.max(300, ROCK_FROM + Math.min(ROCK_SHIFT_MOST, shift), floor + ROCK_RISE);
/**
 * Where the snow line of the place is known (climate.ts), the summits are pale from some way below it: as in the
 * Alps, where the snow line lies at 3090 m and the look draws the raised rock pale from SNOW_LINE. Never more than a
 * fifth of the line's own height, though: at the ocean's edge (Norway's coast, Iceland, Scotland) the snow line lies
 * so low that the Alps' margin would whiten hills.
 */
const SNOW_BELOW = 3090 - SNOW_LINE,
  BELOW_MOST = 0.2;
/** The height from which the raised rock is pale, for the snow line of a place. */
export const paleFrom = (snowLine: number) => snowLine - Math.min(SNOW_BELOW, BELOW_MOST * snowLine);
/**
 * The woods of the look end some way below the height up to which the climate lets a tree grow: as in the Alps, where
 * the last trees stand at 2220 m and the closed forest ends near TREE_LINE. Again by no more than a fifth of the
 * line: in Scotland the last tree stands at 770 m and the forest ends near 620 m, in Iceland at 420 m and 330 m.
 */
const TREES_BELOW = 2220 - TREE_LINE;
/** The height up to which the woods grow, for the tree line of a place. */
export const woodsUntil = (treeLine: number) => treeLine - Math.min(TREES_BELOW, BELOW_MOST * treeLine);
/** the ground of the lands that are not green: the colour the meadow is pulled towards, and how far */
export const TINT: Record<number, readonly [RGB, number]> = {
  [Land.Mediterranean]: [rgb(0xd2c444), 0.2],
  [Land.Steppe]: [rgb(0xd0c264), 0.7],
  [Land.Desert]: [rgb(0xe8d096), 1],
  [Land.Savanna]: [rgb(0xc6bc52), 0.55],
  [Land.Rainforest]: [rgb(0x74a630), 0.6],
  [Land.Boreal]: [rgb(0x90aa3a), 0.35],
  [Land.Tundra]: [rgb(0xaaa87c), 0.8],
  [Land.Ice]: [rgb(0xf4f6f8), 1],
  // prairie, pampas and the grass of the high plateaus: green, but drier than the meadows between the woods
  [Land.Grassland]: [rgb(0xc4c458), 0.4],
};
/** the share of woods the climate grows where the forest layer of 1356 does not reach (estimates) */
export const WOODS: Record<number, number> = {
  [Land.Temperate]: 0.6,
  [Land.Mediterranean]: 0.3,
  [Land.Steppe]: 0.02,
  [Land.Savanna]: 0.1,
  [Land.Rainforest]: 0.95,
  [Land.Boreal]: 0.7,
  [Land.Grassland]: 0.05,
};
/** lands without a single tree away from the water */
export const BARE: readonly number[] = [Land.Desert, Land.Tundra, Land.Ice];
