// The fields of the near view as the first far step draws them: the finest step's sheaves of wheat and oats and its
// vines, each where it stands on its lot, as tall as the land is built (zoom.ts `uprightOf`) and in its colours
// (blocks.ts `crops`), on the soil of its crop.
// The finest step cuts the world into lots of LOT_W by LOT_D blocks, every other row set off by half a lot, and sows a
// field on its lot but for the balk on two sides (settle.ts); a sheaf stands on every block of it, its height and its
// colour drawn from its row and its place in the row. With the land register a field is a furlong, sown in strips by
// its farmsteads and as deep as the register has it, and the rows are counted in each strip. So the far step can draw
// the same sheaves from the place of a block alone and the crop of its lot, which far.ts lays down on the columns of
// the lot (`crops`, a byte to a column), with the furlong's strips and rows beside it (`furlongs`).
import { type Batch, hash2, seeded, shade } from '../lookprobe/batch';
import {
  HEDGE_GLOW,
  OATS,
  OATS_SIDE,
  OATS_TALL,
  OATS_TOP,
  SHEAF_TALLER,
  WHEAT,
  WHEAT_GLOW,
  WHEAT_SIDE,
  WHEAT_TALL,
  WHEAT_TOP,
  vines,
} from '../lookprobe/blocks';
import { N, inGrid } from '../lookprobe/layout';
import type { Part } from '../lookprobe/terrain';
import { uprightOf } from './zoom';

/** the step whose blocks are as wide as two of the finest, the only one that draws its sheaves one by one */
export const CROPS_AT = 1;
const WIDER = 2 ** CROPS_AT,
  UP = uprightOf(CROPS_AT);
/** the crop of a column's lot (world.ts CROPS): winter corn, vines, fallow, spring corn; 0 where no field lies */
export const WHEAT_FIELD = 1,
  VINE_FIELD = 2,
  FALLOW_FIELD = 3,
  OATS_FIELD = 4;
/** the crops by those numbers, as the ground colours its soil by them (GroundTraits.crop) */
export const CROP_NAMES = [null, 'wheat', 'vine', 'fallow', 'oats'] as const;
/** a lot of the finest step: its width and depth in finest blocks (settle.ts) */
const LOT_W = 11,
  LOT_D = 8;
/**
 * A furlong of the land register as a byte (`furlongs`): in how many strips its farmsteads sow it (at most ten,
 * lots.ts) and how many rows of the lot it is deep (settle.ts); 0 on a field without the register, which is one strip
 * all the lot deep.
 */
export const furlongOf = (strips: number, rows: number) => strips | (rows << 4);

/** The lot a finest block lies on, and the block's row and place in the row within its field (-1: the balk). */
function lotOf(fx: number, fz: number): { lx: number; lz: number; row: number; k: number } {
  const lz = Math.floor(fz / LOT_D),
    shift = lz & 1 ? Math.floor(LOT_W / 2) : 0,
    lx = Math.floor((fx - shift) / LOT_W);
  return { lx, lz, row: fx - shift - lx * LOT_W - 1, k: fz - lz * LOT_D - 1 };
}
/** the first row of the strip `s` of a field sown in `strips` (settle.ts) */
const stripStart = (s: number, strips: number) => Math.round((s * (LOT_W - 1)) / strips);
/** the strip of a field sown in `strips` that its row `row` lies in */
function stripOf(row: number, strips: number): number {
  let s = strips - 1;
  while (s > 0 && stripStart(s, strips) > row) s--;
  return s;
}
/**
 * The column whose crop a block of the finest step (fx, fz in the world) `dx` blocks into the column x takes: the
 * column whose middle lies on its lot, its own, or for the last block of a row whose next block is the balk, the
 * column before.
 */
const ownOf = (x: number, dx: number, fx: number, fz: number) =>
  dx === WIDER - 1 || lotOf(fx + 1, fz).row >= 0 ? x : x - 1;

/**
 * The crop on a block of the finest step (fx, fz in the world) that lies `dx` blocks into the column x, z: that of
 * its lot (`ownOf`); 0 on the balk, beyond the rows of a furlong, or where no field lies.
 */
export function cropAt(
  crops: ArrayLike<number>,
  x: number,
  z: number,
  dx: number,
  fx: number,
  fz: number,
  furlongs?: ArrayLike<number>,
): number {
  const at = lotOf(fx, fz);
  if (at.row < 0 || at.row >= LOT_W - 1 || at.k < 0 || at.k >= LOT_D - 1) return 0;
  const own = ownOf(x, dx, fx, fz);
  if (own < 0) return 0;
  const rows = (furlongs?.[z * N + own] ?? 0) >> 4;
  return rows && at.k >= rows ? 0 : crops[z * N + own];
}

/**
 * The sheaves and vines of the columns of `part` (a byte each in `crops` and `furlongs`, a ground of N × N whose first
 * column is the world's block ox, oz of the step) on the tops `tops`, where `bare` says nothing else stands on a column
 * (a farmhouse at the end of its field). A column holds two blocks of the finest step each way; a block takes the crop
 * of its own lot (`cropAt`). The vines of a strip are planted as at the finest step, all of them in turn, and those on
 * the columns of `part` drawn.
 */
export function drawCrops(
  b: Batch,
  crops: ArrayLike<number>,
  tops: ArrayLike<number>,
  wet: ArrayLike<number>,
  ox: number,
  oz: number,
  part: Part,
  bare: (x: number, z: number) => boolean = () => true,
  furlongs?: ArrayLike<number>,
) {
  const k = 1 / WIDER,
    planted = new Set<number>();
  // the column of a point of the piece, and the finest block it lies on (a plant on the edge of two blocks, three
  // blocks into its field, on the block before it: the finest step plants from the corner of the field)
  const blockOf = (x: number, z: number) => {
    const fx = Math.floor((x + ox) * WIDER - 1e-6),
      fz = Math.floor((z + oz) * WIDER - 1e-6);
    return { fx, fz, x: Math.floor(fx / WIDER) - ox, z: Math.floor(fz / WIDER) - oz };
  };
  // blocks.ts `vines`: the vines of a strip from its corner, by the numbers of the strip's farmstead (settle.ts)
  const plant = (lx: number, lz: number, s: number, furlong: number) => {
    const strips = furlong & 15 || 1,
      fx0 = lx * LOT_W + (lz & 1 ? Math.floor(LOT_W / 2) : 0) + 1 + stripStart(s, strips),
      fz0 = lz * LOT_D + 1,
      w = stripStart(s + 1, strips) - stripStart(s, strips),
      d = furlong >> 4 || LOT_D - 1;
    const r = seeded(Math.floor(hash2(furlong ? lx * 16 + s : lx, lz, 68) * 4294967296));
    const ground = (x: number, z: number) => {
      const at = blockOf(x, z);
      return inGrid(at.x, at.z) && !wet[at.z * N + at.x] ? tops[at.z * N + at.x] : null;
    };
    const drawn = (x: number, z: number) => {
      const at = blockOf(x, z);
      if (at.x < part.x0 || at.x >= part.x1 || at.z < part.z0 || at.z >= part.z1 || !bare(at.x, at.z)) return false;
      return cropAt(crops, at.x, at.z, at.fx - (at.x + ox) * WIDER, at.fx, at.fz, furlongs) === VINE_FIELD;
    };
    vines(b, fx0 * k - ox, fz0 * k - oz, w, d, hash2(fx0, fz0, 55) < 0.5, r, ground, drawn, k, UP);
  };
  for (let z = part.z0; z < part.z1; z++)
    for (let x = part.x0; x < part.x1; x++) {
      const i = z * N + x;
      if (wet[i] || !bare(x, z)) continue;
      const y = tops[i];
      for (let dz = 0; dz < WIDER; dz++)
        for (let dx = 0; dx < WIDER; dx++) {
          const fx = (x + ox) * WIDER + dx,
            fz = (z + oz) * WIDER + dz,
            crop = cropAt(crops, x, z, dx, fx, fz, furlongs);
          if (crop !== WHEAT_FIELD && crop !== OATS_FIELD && crop !== FALLOW_FIELD && crop !== VINE_FIELD) continue;
          const at = lotOf(fx, fz),
            furlong = furlongs?.[z * N + ownOf(x, dx, fx, fz)] ?? 0,
            strips = furlong & 15 || 1,
            s = stripOf(at.row, strips);
          if (crop === VINE_FIELD) {
            const key = (at.lz * 1048576 + at.lx) * 16 + s;
            if (!planted.has(key)) {
              planted.add(key);
              plant(at.lx, at.lz, s, furlong);
            }
            continue;
          }
          // blocks.ts `crops`, as the finest step stands a sheaf on the block: by its row in its strip, and each strip
          // a little lighter or darker than its neighbours' (settle.ts); the fallow's are the winter corn's, as there:
          // the stage keeps them down while it lies fallow (season_codes.ts)
          const row = at.row - stripStart(s, strips),
            tone = strips > 1 ? 0.84 + 0.32 * hash2(at.lx * 16 + s, at.lz, 69) : 1;
          const ripe = crop !== OATS_FIELD,
            colours = ripe ? WHEAT : OATS,
            side = ripe ? WHEAT_SIDE : OATS_SIDE;
          const tall = (ripe ? WHEAT_TALL : OATS_TALL) + SHEAF_TALLER * hash2(row, at.k, 51),
            top = shade(
              colours[Math.floor(hash2(row, at.k, 53) * colours.length)],
              (ripe ? WHEAT_TOP : OATS_TOP) * tone,
            );
          const cx = (fx + 0.5) * k - ox,
            cz = (fz + 0.5) * k - oz;
          b.box(cx - 0.4 * k, y, cz - 0.4 * k, cx + 0.4 * k, y + tall * UP, cz + 0.4 * k, side, {
            top,
            foot: 0.85,
            away: ripe ? WHEAT_GLOW : HEDGE_GLOW,
          });
        }
    }
}
