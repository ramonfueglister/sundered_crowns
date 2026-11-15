// What a building tradition says about its houses, and the storey height all houses share.
import type { RGB } from '../../lookprobe/batch';

/** Height of one storey in blocks. Measured on the reference image, where the window rows of the town houses lie 2 to 2.3 blocks apart. */
export const FLOOR = 2.1;

/**
 * How the houses of a land are built: their wall and roof colours, how steep the roofs are (rise over half the width,
 * up to `maxRise` blocks), and how many of them end in gables instead of hips. `flat` houses have a terrace roof.
 */
export interface HouseStyle { walls: readonly RGB[]; roofs: readonly RGB[]; pitch: readonly [number, number]; maxRise: number; gables: number; flat?: boolean }
