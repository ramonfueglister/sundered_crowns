// The fields of the near view as the first far step draws them: the finest step's sheaves of wheat and oats, each
// where it stands on its lot, as tall as it is there and in its colours (blocks.ts `crops`), on the soil of its crop.
// The finest step cuts the world into lots of LOT_W by LOT_D blocks, every other row set off by half a lot, and sows a
// field on its lot but for the balk on two sides (settle.ts); a sheaf stands on every block of it, its height and its
// colour drawn from its row and its place in the row. So the far step can draw the same sheaves from the place of a
// block alone and the crop of its lot, which far.ts lays down on the columns of the lot (`crops`, a byte to a column).
import { type Batch, hash2, shade } from '../lookprobe/batch';
import { HEDGE_GLOW, OATS, OATS_SIDE, WHEAT, WHEAT_GLOW, WHEAT_SIDE } from '../lookprobe/blocks';
import { N } from '../lookprobe/layout';
import type { Part } from '../lookprobe/terrain';

/** the step whose blocks are as wide as two of the finest, the only one that draws its sheaves one by one */
export const CROPS_AT = 1;
const WIDER = 2 ** CROPS_AT;
/** the crop of a column's lot (world.ts CROPS): winter corn, vines, fallow, spring corn; 0 where no field lies */
export const WHEAT_FIELD = 1, VINES = 2, FALLOW_FIELD = 3, OATS_FIELD = 4;
/** the crops by those numbers, as the ground colours its soil by them (GroundTraits.crop) */
export const CROP_NAMES = [null, 'wheat', 'vine', 'fallow', 'oats'] as const;
/** a lot of the finest step: its width and depth in finest blocks (settle.ts) */
const LOT_W = 11, LOT_D = 8;

/** The lot a finest block lies on, and the block's row and place in the row within its field (-1: the balk). */
function lotOf(fx: number, fz: number): { lx: number; lz: number; row: number; k: number } {
  const lz = Math.floor(fz / LOT_D), shift = lz & 1 ? Math.floor(LOT_W / 2) : 0, lx = Math.floor((fx - shift) / LOT_W);
  return { lx, lz, row: fx - shift - lx * LOT_W - 1, k: fz - lz * LOT_D - 1 };
}

/**
 * The sheaves of the columns of `part` (a byte each in `crops`, a ground of N × N whose first column is the world's
 * block ox, oz of the step) on the tops `tops`, where `bare` says nothing else stands on a column (a farmhouse at
 * the end of its field). A column holds two blocks of the finest step each way; a block takes the crop of its own lot,
 * which is that of the column whose middle lies on the lot: its own, or for the last block of a row whose next block
 * is the balk, the column before.
 */
export function drawCrops(b: Batch, crops: ArrayLike<number>, tops: ArrayLike<number>, wet: ArrayLike<number>, ox: number, oz: number, part: Part, bare: (x: number, z: number) => boolean = () => true) {
  const k = 1 / WIDER;
  for (let z = part.z0; z < part.z1; z++) for (let x = part.x0; x < part.x1; x++) {
    const i = z * N + x;
    if (wet[i] || !bare(x, z)) continue;
    const y = tops[i];
    for (let dz = 0; dz < WIDER; dz++) for (let dx = 0; dx < WIDER; dx++) {
      const fx = (x + ox) * WIDER + dx, fz = (z + oz) * WIDER + dz, at = lotOf(fx, fz);
      if (at.row < 0 || at.row >= LOT_W - 1 || at.k < 0 || at.k >= LOT_D - 1) continue;
      // the column whose middle lies on this block's lot
      const own = dx === WIDER - 1 || lotOf(fx + 1, fz).row >= 0 ? x : x - 1;
      if (own < 0) continue;
      const crop = crops[z * N + own];
      if (crop !== WHEAT_FIELD && crop !== OATS_FIELD) continue;
      // blocks.ts `crops`, as the finest step stands a sheaf on the block
      const ripe = crop === WHEAT_FIELD, colours = ripe ? WHEAT : OATS, side = ripe ? WHEAT_SIDE : OATS_SIDE;
      const tall = (ripe ? 1.35 : 0.8) + 0.5 * hash2(at.row, at.k, 51), top = shade(colours[Math.floor(hash2(at.row, at.k, 53) * colours.length)], ripe ? 1.2 : 1.05);
      const cx = (fx + 0.5) * k - ox, cz = (fz + 0.5) * k - oz;
      b.box(cx - 0.4 * k, y, cz - 0.4 * k, cx + 0.4 * k, y + tall * k, cz + 0.4 * k, side, { top, foot: 0.85, away: ripe ? WHEAT_GLOW : HEDGE_GLOW });
    }
  }
}
