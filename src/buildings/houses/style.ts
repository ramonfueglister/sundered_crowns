// What a building tradition says about its houses, and the storey height all houses share.
import type { RGB } from '../../lookprobe/batch';

/**
 * Metres in one block of the diorama, for houses and every ordinary building. Ramon chose it on 2026-11-15 from the
 * scale probe (scale-probe.html): option B, houses at 2 m a block, so that they stand smaller beside the figures of
 * 1.2 blocks than the reference image draws them. Landmarks state their own scale in their measure files.
 */
export const METRES_PER_BLOCK = 2.0;
/** A length in metres, in blocks. */
export const m = (metres: number) => metres / METRES_PER_BLOCK;
/** An area in square metres, in blocks squared. */
export const m2 = (sqm: number) => sqm / (METRES_PER_BLOCK * METRES_PER_BLOCK);
/**
 * Height of one storey: 3 m. Measured on the reference image, where the window rows of the town houses lie 2 to 2.3
 * of its blocks apart; the reference draws 1.43 m a block, and the other measures of the houses were read there too.
 */
export const FLOOR = m(3.0);

/**
 * How the houses of a land are built: their wall and roof colours, how steep the roofs are (rise over half the width,
 * up to `maxRise` blocks, given as m(metres)), and how many of them end in gables instead of hips. `flat` houses
 * have a terrace roof.
 */
export interface HouseStyle { walls: readonly RGB[]; roofs: readonly RGB[]; pitch: readonly [number, number]; maxRise: number; gables: number; flat?: boolean }
