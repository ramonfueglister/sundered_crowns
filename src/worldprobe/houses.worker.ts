// Builds the houses of the near view off the page's own thread: one message asks for the houses of a cell of a piece
// from their fine blocks, the answer carries them as one mesh, as flat lists that are handed over, not copied.
import { Batch } from '../lookprobe/batch';
import type { Shape } from '../lookprobe/stage';
import { type Lot, raise } from './settle';

export interface HousesJob { id: number; lots: Lot[] }
export interface HousesDone { id: number; houses?: Shape; error?: string }

self.onmessage = (e: MessageEvent<HousesJob>) => {
  const { id, lots } = e.data;
  try {
    const built = new Batch();
    for (const l of lots) raise(built, l, 1);
    const houses = { pos: new Float32Array(built.pos), nor: new Float32Array(built.nor), col: new Float32Array(built.col) };
    (self as unknown as Worker).postMessage({ id, houses } satisfies HousesDone, [houses.pos.buffer, houses.nor.buffer, houses.col.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) } satisfies HousesDone);
  }
};
