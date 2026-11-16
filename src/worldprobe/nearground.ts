// The ground of the near view. From afar the paved ground of a town is whole blocks, like all the ground. Once the
// view is so near that fine blocks show, the paving, the quay walls, the water steps and the mooring posts of the
// cells in the picture are built from them (src/buildings/ground) and laid over the whole blocks, together with the
// cell's houses (fine.ts). A piece hands the columns of each such cell to the page, so that the workers of the near
// view can build its ground without the piece's ground.
import type { Batch } from '../lookprobe/batch';
import { type Ground, Mat, N, SEA_Y, idx } from '../lookprobe/layout';
import { type ColumnAt, PLAIN_QUAY, fineGround, styleOf } from '../buildings';
import type { Lot } from './settle';

/** what a column is: under water, paved town ground, town ground under a house, or beyond the piece's ground */
const WET = 1, PAVED = 2, HOUSE = 3, BEYOND = 4;

/**
 * The columns of a cell of a piece and of one block around it: the corner and side of the cell in the piece's blocks,
 * the piece's place in the world, the level of the cell's water, the region whose quays are built, and row by row the
 * top and the kind of every column.
 */
export interface Columns { x0: number; z0: number; size: number; ox: number; oz: number; water: number; region: string; tops: Int16Array; kinds: Uint8Array }

/**
 * The columns of the cell at (x0, z0) of a ground, or null where the cell has no paved ground to build finely.
 * `lots` are the houses that stand on the ground: no paving is laid under them.
 */
export function columnsOf(g: Ground, x0: number, z0: number, size: number, region: string, lots: readonly Pick<Lot, 'x' | 'z' | 'w' | 'd'>[] = []): Columns | null {
  const side = size + 2, tops = new Int16Array(side * side), kinds = new Uint8Array(side * side);
  let paved = false, water = Infinity;
  for (let dz = 0; dz < side; dz++) for (let dx = 0; dx < side; dx++) {
    const x = x0 - 1 + dx, z = z0 - 1 + dz, k = dz * side + dx;
    if (x < 0 || z < 0 || x >= N || z >= N) { kinds[k] = BEYOND; continue; }
    const i = idx(x, z);
    tops[k] = g.h[i];
    if (g.wet[i]) { kinds[k] = WET; water = Math.min(water, g.surf[i]); }
    else if (g.mat[i] === Mat.Paved) { kinds[k] = PAVED; paved ||= dx > 0 && dz > 0 && dx <= size && dz <= size; }
  }
  if (!paved) return null;
  for (const l of lots) for (let z = Math.max(z0 - 1, Math.ceil(l.z)); z + 1 <= Math.min(z0 + size + 1, l.z + l.d); z++) for (let x = Math.max(x0 - 1, Math.ceil(l.x)); x + 1 <= Math.min(x0 + size + 1, l.x + l.w); x++) {
    const k = (z - z0 + 1) * side + x - x0 + 1;
    if (kinds[k] === PAVED) kinds[k] = HOUSE;
  }
  return { x0, z0, size, ox: g.ox ?? 0, oz: g.oz ?? 0, water: Number.isFinite(water) ? water : SEA_Y, region, tops, kinds };
}

/**
 * Builds the fine ground of a cell from its columns. Only the town's own ground and the water count: a meadow beside
 * the paving is no quay.
 */
export function pave(into: Batch, c: Columns) {
  const side = c.size + 2;
  const at: ColumnAt = (x, z) => {
    const dx = x - c.x0 + 1, dz = z - c.z0 + 1;
    if (dx < 0 || dz < 0 || dx >= side || dz >= side) return null;
    const kind = c.kinds[dz * side + dx];
    return kind === WET || kind === PAVED || kind === HOUSE ? { top: c.tops[dz * side + dx], wet: kind === WET, paved: kind === PAVED } : null;
  };
  fineGround(into, { x0: c.x0, z0: c.z0, size: c.size, ox: c.ox, oz: c.oz, water: c.water }, at, styleOf(c.region).tradition?.quay ?? PLAIN_QUAY);
}
