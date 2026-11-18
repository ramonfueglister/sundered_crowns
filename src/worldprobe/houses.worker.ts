// Builds the near view off the page's own thread: one message asks for the houses of a cell of a piece from their
// fine blocks and for the fine ground under them, the answer carries both as one mesh, as flat lists that are handed
// over, not copied.
import { Batch } from '../lookprobe/batch';
import type { Shape } from '../lookprobe/stage';
import { flat, small } from './small';
import { type Columns, pave } from './nearground';
import { type Lot, raise } from './settle';

export interface HousesJob { id: number; lots: Lot[]; ground?: Columns; /** the houses' lists as small numbers (small.ts), not as floats */ small?: boolean }
export interface HousesDone { id: number; houses?: Shape; error?: string }

self.onmessage = (e: MessageEvent<HousesJob>) => {
  const { id, lots, ground } = e.data;
  try {
    const built = new Batch();
    for (const l of lots) raise(built, l, 1);
    if (ground) pave(built, ground);
    const houses = e.data.small ? small(built) : flat(built);
    (self as unknown as Worker).postMessage({ id, houses } satisfies HousesDone, [houses.pos, houses.nor, houses.col].map((a) => (a as Float32Array).buffer as ArrayBuffer));
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) } satisfies HousesDone);
  }
};
