// A building as the settlement code places it: how to build it, and the ground and height it takes.
import type { Batch, Rnd } from '../lookprobe/batch';

/** A building with the ground it needs (along x and z) and its height, in blocks. */
export interface Model { build(r: Rnd): Batch; w: number; d: number; height: number }
