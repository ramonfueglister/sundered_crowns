// Builds the near view off the page's own thread: one message asks for the houses of a cell of a piece from their
// fine blocks and for the fine ground under them, the answer carries both as one mesh, as flat lists that are handed
// over, not copied.
import { Batch } from '../lookprobe/batch';
import type { Shape } from '../lookprobe/stage';
import { ballOf } from './ball';
import { type Columns, pave } from './nearground';
import { type Lot, raise } from './settle';

export interface HousesJob { id: number; lots: Lot[]; ground?: Columns }
export interface HousesDone { id: number; houses?: Shape; error?: string }

self.onmessage = (e: MessageEvent<HousesJob>) => {
  const { id, lots, ground } = e.data;
  try {
    const built = new Batch();
    for (const l of lots) raise(built, l, 1);
    if (ground) pave(built, ground);
    const pos = new Float32Array(built.pos), houses = { pos, nor: new Float32Array(built.nor), col: new Float32Array(built.col), ball: ballOf(pos) };
    (self as unknown as Worker).postMessage({ id, houses } satisfies HousesDone, [houses.pos.buffer, houses.nor.buffer, houses.col.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) } satisfies HousesDone);
  }
};
