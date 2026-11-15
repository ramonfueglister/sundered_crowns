// The rules of the land: how the blocks lie on the map (world.ts and the realms laid over them, realms.ts), where
// the trees end and the snow begins, and what grows in which kind of land.
import { type RGB, rgb } from '../lookprobe/batch';
import { NEAR, RIGHT } from '../lookprobe/layout';
import { Land } from './climate';

/** Whole-map cell of a world block. */
export const cellOfBlock = (wx: number, wz: number): [number, number] => [wx * RIGHT[0] + wz * RIGHT[1], wx * NEAR[0] + wz * NEAR[1]];
/** World block of a whole-map cell. */
export const blockOfCell = (u: number, v: number): [number, number] => [u * RIGHT[0] + v * NEAR[0], u * RIGHT[1] + v * NEAR[1]];

/** above this no trees grow and the heights are stretched; above the snow line (of the raised rock) the rock is pale */
export const TREE_LINE = 1900, SNOW_LINE = 2530;
/**
 * These heights hold in the Alps, at 46° north. Towards the pole the tree line sinks by about 60 m a degree (some
 * 1000 m in southern Norway, 500 m in the far north), towards the equator it rises to about 3900 m; the snow line
 * goes with it, and so does the foot of the rock as far as the Mediterranean (ROCK_SHIFT_MOST): farther south the
 * mountains are bare long before the trees end. A rule of thumb for the mainland: on the ocean's edge (Scotland,
 * Iceland) the real tree line lies lower still.
 */
export const lineShift = (lat: number) => Math.min(2000, Math.max(-1500, (46 - Math.abs(lat)) * 60));
export const ROCK_SHIFT_MOST = 400;
/** the massifs are rock from this height upwards */
export const ROCK_FROM = 1500;
/** the ground of the lands that are not green: the colour the meadow is pulled towards, and how far */
export const TINT: Record<number, readonly [RGB, number]> = {
  [Land.Mediterranean]: [rgb(0xd2c444), 0.2], [Land.Steppe]: [rgb(0xd0c264), 0.7], [Land.Desert]: [rgb(0xe8d096), 1], [Land.Savanna]: [rgb(0xc6bc52), 0.55],
  [Land.Rainforest]: [rgb(0x74a630), 0.6], [Land.Boreal]: [rgb(0x90aa3a), 0.35], [Land.Tundra]: [rgb(0xaaa87c), 0.8], [Land.Ice]: [rgb(0xf4f6f8), 1],
  // prairie, pampas and the grass of the high plateaus: green, but drier than the meadows between the woods
  [Land.Grassland]: [rgb(0xc4c458), 0.4],
};
/** the share of woods the climate grows where the forest layer of 1356 does not reach (estimates) */
export const WOODS: Record<number, number> = { [Land.Temperate]: 0.6, [Land.Mediterranean]: 0.3, [Land.Steppe]: 0.02, [Land.Savanna]: 0.1, [Land.Rainforest]: 0.95, [Land.Boreal]: 0.7, [Land.Grassland]: 0.05 };
/** lands without a single tree away from the water */
export const BARE: readonly number[] = [Land.Desert, Land.Tundra, Land.Ice];
