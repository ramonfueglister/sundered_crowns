// Builds the near view off the page's own thread: one message asks for the houses of a cell of a piece from their
// fine blocks and for the fine ground under them, the answer carries both as one mesh, as flat lists that are handed
// over, not copied.
import { Batch } from '../lookprobe/batch';
import type { Shape } from '../lookprobe/shape';
import { faced, flat, small } from './small';
import { type Columns, pave } from './nearground';
import { type Lot, raise } from './settle';

export interface HousesJob {
  id: number;
  lots: Lot[];
  ground?: Columns;
  /** the houses' lists as small numbers (small.ts), not as floats */
  small?: boolean;
  /** and their rectangles as faces of floats (lookprobe/faces.ts `Free`) */
  free?: boolean;
}
export interface HousesDone {
  id: number;
  houses?: Shape;
  error?: string;
}

self.onmessage = (e: MessageEvent<HousesJob>) => {
  const { id, lots, ground } = e.data;
  try {
    const built = new Batch();
    for (const l of lots) raise(built, l, 1);
    if (ground) pave(built, ground);
    // (houses of fine blocks and the fine ground are nothing but upright and level rectangles, on no grid: faces of
    // floats, a third of the lists. The stage draws a cell's houses as one mesh: where a triangle is left over, as lists)
    const loose = e.data.small && e.data.free ? faced(built, 0, 'all') : null,
      houses = loose?.free && !loose.pos.length ? loose : e.data.small ? small(built) : flat(built);
    (self as unknown as Worker).postMessage(
      { id, houses } satisfies HousesDone,
      [houses.pos, houses.nor, houses.col, ...(houses.free ? [houses.free.geo, houses.free.col, houses.free.nor] : [])]
        .map((a) => (a as Float32Array).buffer as ArrayBuffer)
        .filter((buf) => buf.byteLength > 0),
    );
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) } satisfies HousesDone);
  }
};
