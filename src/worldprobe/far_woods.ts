// The woods of a far piece (far.ts `coverLand`): the finest step's very trees at the first far step, blocks of woods
// by those trees at the second, and farther out the woods of a landscape drawn together.
import { hash2, noise2 } from '../lookprobe/batch';
import { ACACIA, CYPRESS, JUNGLE, LEAVES, PALM } from '../lookprobe/blocks';
import { Mat, N, idx, inGrid, occlude } from '../lookprobe/layout';
import type { Woods } from './far';
import type { Laying } from './far_lay';
import {
  PALMS,
  RAINFOREST,
  SAVANNA,
  STRAY,
  TEMPERATE,
  TREE_NUMBERS,
  TREE_PITCH,
  TREE_REACH,
  TREES_AT,
  TREES_CLOSED,
  crownColours,
  treeHeight,
  treesCode,
  treesIn,
} from './trees';

/** a tree of the finest step stands about four of its blocks high, two of the first far step's: a far block on which one stands stands out by that, one under crowns only by one */
const TREE_STANDS = 2;
/** from its trunk a leafy crown and a conifer reach this many finest blocks to each side (blocks.ts `tree`, `cypress`) */
const CROWN = 1.2,
  CROWN_TALL = 0.6;
/** of the open land's blocks at the second far step this share carries a tree (a place for one every TREE_PITCH finest blocks, STRAY of them with a tree): as many carry trees farther out */
const LONE = 1 - (1 - STRAY) ** ((4 / TREE_PITCH) ** 2);
/**
 * Where the woods of a landscape lie on blocks that hold more than one wood: a field over the world, spread evenly
 * over 0 … 1, and a block is woods where more of its ground is under trees than the field's value there. Its hills
 * and hollows are some WOODS_ACROSS blocks of the step across, as the single woods are at the second far step, and
 * its wider ones are those of the step before: from step to step the woods of a landscape draw together and stay
 * where they are. (fx, fz) in finest blocks. DRAWN: the woods within this many blocks of a block count for it.
 */
const WOODS_ACROSS = 10,
  LIES = [4, 3, 1] as const,
  DRAWN = 2;
const lie = (fx: number, fz: number, step: number) => {
  let v = 0;
  for (let j = 0; j < LIES.length; j++) {
    const wave = WOODS_ACROSS * 2 ** (step + j);
    v += LIES[j] * noise2(fx / wave, fz / wave, 84 + step + j);
  }
  return v / 8;
};
const RANKS = 512;
let ranks: Float32Array | undefined;
function liesAt(fx: number, fz: number, step: number): number {
  if (!ranks) {
    // the share of the land on which `lie` is below k / RANKS
    const seen = new Uint32Array(RANKS + 1),
      side = 400;
    for (let z = 0; z < side; z++)
      for (let x = 0; x < side; x++) seen[Math.min(RANKS, Math.ceil(lie(x * 7.31, z * 7.31, 0) * RANKS))]++;
    ranks = new Float32Array(RANKS + 1);
    for (let k = 1, below = 0; k <= RANKS; k++) {
      below += seen[k];
      ranks[k] = below / (side * side);
    }
  }
  const at = Math.max(0, Math.min(1, lie(fx, fz, step))) * RANKS,
    k = Math.min(RANKS - 1, Math.floor(at));
  return ranks[k] + (ranks[k + 1] - ranks[k]) * (at - k);
}

/** The woods on a far piece's free ground. */
export function layWoods(l: Laying) {
  const { g, step, o, c, wider, ox, oz, up, raised, free, level, put, pick, stands, walledIn } = l;
  // woods at the first far step: the very trees of the finest step, each where it stands, as large as it is and in
  // its colours (trees.ts draws them from the woods' share and kind at the column, which are laid down here). The
  // ground between them is the ground, which the trees darken round them by hiding its sky, as at the finest step.
  if (step === TREES_AT)
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        if (!free(x, z) || g.mat[idx(x, z)] !== Mat.Grass || walledIn(x, z)) continue;
        const w = o.woods(x, z);
        if (!w) continue;
        const kind =
          w.crowns === JUNGLE ? RAINFOREST : w.crowns === ACACIA ? SAVANNA : w.crowns === PALM ? PALMS : TEMPERATE;
        const [code, sort] = treesCode(w.share, kind, w.conifers ?? (w.tall ? 1 : 0)),
          i = idx(x, z);
        let stand = 0;
        treesIn(x + ox, z + oz, (code - 1) / 254, (px, pz, tx, tz) => {
          const cx = px / wider - ox,
            cz = pz / wider - oz,
            reach = TREE_REACH / wider;
          occlude(
            g,
            cx - reach,
            cz - reach,
            cx + reach,
            cz + reach,
            Math.ceil((g.h[i] + treeHeight(sort, tx, tz) * up) * 64) / 64,
          );
          stand++;
        });
        if (!stand) continue;
        c.trees ??= new Uint8Array(N * N * TREE_NUMBERS);
        const trees = c.trees;
        trees[i * TREE_NUMBERS] = code;
        trees[i * TREE_NUMBERS + 1] = sort;
      }
  // at the second far step: a block is woods by the trees of the finest step that
  // stand on it, in the same colours; a closed wood shows whole
  if (step === 2)
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        if (!free(x, z) || g.mat[idx(x, z)] !== Mat.Grass || walledIn(x, z)) continue;
        const w = o.woods(x, z);
        if (!w) continue;
        const fx = (x + ox) * wider,
          fz = (z + oz) * wider;
        let conifers = 0,
          leafy = 0;
        for (let tz = Math.floor((fz - 1.2) / TREE_PITCH); tz * TREE_PITCH < fz + wider + 1.2; tz++)
          for (let tx = Math.floor((fx - 1.2) / TREE_PITCH); tx * TREE_PITCH < fx + wider + 1.2; tx++) {
            if (hash2(tx, tz, 73) > STRAY + TREES_CLOSED * w.share) continue;
            const px = tx * TREE_PITCH + (hash2(tx, tz, 71) - 0.5) * 2.4,
              pz = tz * TREE_PITCH + (hash2(tx, tz, 72) - 0.5) * 2.4;
            if (px < fx || px >= fx + wider || pz < fz || pz >= fz + wider) continue;
            if (w.conifers === undefined ? w.tall : hash2(tx, tz, 74) < w.conifers) conifers++;
            else leafy++;
          }
        const closed = w.share > 0.5,
          trees = conifers + leafy;
        if (!trees && !closed) continue;
        const tall = w.conifers === undefined ? w.tall : conifers > leafy || (conifers === leafy && w.tall),
          crowns = w.conifers === undefined ? w.crowns : tall ? CYPRESS : LEAVES;
        const crown = pick(crowns, hash2(x + ox, z + oz, 74)),
          rise = trees ? stands(TREE_STANDS * 2) : 0;
        if (rise && !level(x, z)) continue;
        // a closed wood is one roof of blocks here: of the shaded sides between the crowns, which the first far step
        // shows as the sides of its blocks, nothing is seen, so the tops carry them
        put(x, z, 0, ...crownColours(crown, crowns), tall ? 9 : 8);
        // out of the woods a block shows as much of its trees as their crowns cover of it
        c.share[idx(x, z)] = closed
          ? 1
          : Math.min(1, (trees * (2 * (tall ? CROWN_TALL : CROWN)) ** 2) / (wider * wider));
        raised[idx(x, z)] = rise;
      }
  // Farther out a block is larger than a tree, then than a wood. The woods are drawn as at the second far step all
  // the same: dark blocks that stand a block out of the open land, whole woods with clearings between them, some
  // WOODS_ACROSS blocks across. For that the woods of a landscape draw together: a block is woods where more of the
  // ground about it (within DRAWN blocks) lies under trees than `liesAt` asks there. So a landscape keeps as much
  // woodland as it has, lying where most of its woods lie. Here and there a block of the open land carries trees,
  // as often as one of the second far step does.
  if (step > 2) {
    const grows: (Woods | null)[] = new Array(N * N).fill(null),
      under = new Float32Array(N * N);
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        if (g.wet[idx(x, z)] || g.mat[idx(x, z)] !== Mat.Grass) continue;
        const w = o.woods(x, z);
        if (w) {
          grows[idx(x, z)] = w;
          under[idx(x, z)] = w.share;
        }
      }
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        const w = grows[idx(x, z)];
        if (!w || !free(x, z) || !level(x, z) || o.clear?.(x, z) || walledIn(x, z)) continue;
        // where the single woods still show (the share differs from block to block), those about the block count
        let about = w.share;
        if (w.laid) {
          let sum = 0,
            n = 0;
          for (let dz = -DRAWN; dz <= DRAWN; dz++)
            for (let dx = -DRAWN; dx <= DRAWN; dx++)
              if (inGrid(x + dx, z + dz) && grows[idx(x + dx, z + dz)]) {
                sum += under[idx(x + dx, z + dz)];
                n++;
              }
          about = sum / n;
        }
        const wx = x + ox,
          wz = z + oz,
          closed = about > 0 && about >= liesAt((wx + 0.5) * wider, (wz + 0.5) * wider, step);
        if (!closed && hash2(wx, wz, 73 + step) >= LONE) continue;
        const tall = w.conifers === undefined ? w.tall : hash2(wx, wz, 76) < w.conifers,
          crowns = w.conifers === undefined ? w.crowns : tall ? CYPRESS : LEAVES;
        put(x, z, 0, ...crownColours(pick(crowns, hash2(wx, wz, 74)), crowns), tall ? 9 : 8);
        c.share[idx(x, z)] = closed ? 1 : Math.min(1, (2 * (tall ? CROWN_TALL : CROWN)) ** 2 / 16);
        raised[idx(x, z)] = 1;
      }
  }
}
