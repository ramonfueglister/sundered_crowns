// The woods of a far step (terrain.ts): a wooded column drawn at its ground, with its trees as one crown of their own.
import type { Batch, RGB } from './batch';
import { hash2 } from './batch';
import { type Ground, type GroundTraits, N } from './layout';
import { type Corners, skyLight, skyShare } from './terrain_light';

type Cover = ReturnType<NonNullable<GroundTraits['cover']>>;
/** whether what a column carries is trees: green and standing on the ground (a field is green, but does not rise) */
export const wooded = (cover: Cover) =>
  !!cover && cover.stands !== false && cover.top[1] > cover.top[0] && cover.top[1] > cover.top[2];
/**
 * The trees of a far step. The tables give a wooded column the rise of its trees above its ground (at the first far
 * step two blocks where a tree stands on it and one where a crown reaches over it, farther out one where trees
 * stand). Drawn as columns that tall the woods were a wall over the villages, and drawn as one roof a flat sheet. So
 * a wooded column is drawn at its ground, as the floor of the wood, and on it its trees stand as one crown of their
 * own: a block narrower than the column, set off in it by chance, `CROWN_LOW` of the rise high or as tall as the
 * finest step's trees where that is more (GroundTraits.crownTall: at the second far step, which takes over from
 * the trees of the first without a glide), give or take `CROWN_TALLER`. Where trees cover the column whole the
 * crown is `CROWN_NARROW` of it wide, and the floor between the crowns shows `FLOOR` as light as they are; where
 * they cover part of it, the crown covers as much of it and the floor is the ground's own. Each crown is a touch
 * lighter or darker than the next (`CROWN_LIGHT`). A column whose trees have no rise (a crown that reaches over it
 * from the next) is a floor alone.
 * (The crowns are level and upright rectangles on the 64ths of a block, inside their column: the glide to the coarser
 * step takes them down into it and brings up the coarser step's, worldprobe/glide.ts.)
 */
const CROWN_LOW = 0.5,
  CROWN_TALLER = 0.3,
  CROWN_NARROW = [0.66, 0.92] as const,
  CROWN_LIGHT = 0.12;
export const FLOOR = 0.6;
/** the narrowest a crown of part of a column is, and the widest */
const CROWN_PART = [0.4, 0.86] as const;
/** a crown stands this many 64ths of a block at least inside its column on every side, and is as many high at least */
const CROWN_INSET = 1,
  CROWN_LEAST = 8;
/**
 * the share of a column that its trees cover, as a table keeps it (a byte: worldprobe/table.ts `packTable`), so that a
 * column drawn from its table has the crown it had where it was built
 */
export const coveredBy = (cover: NonNullable<Cover>) =>
  Math.round(Math.max(0, Math.min(1, cover.share ?? 1)) * 255) / 255;
/**
 * Where the columns carry trees: the tops of all columns as drawn (a wooded column's at its ground), its crown
 * (x0, z0, x1, z1 and the height of its top, five numbers to a column; NaN where it has none) and the heights that
 * hide the sky (Ground.occ), with the crowns. Null where no column does.
 */
export function woodsOf(
  g: Ground,
  t: GroundTraits,
): { tops: Float32Array; crowns: Float32Array; occ: Float32Array } | null {
  if (!t.cover) return null;
  const n = N * N,
    ox = g.ox ?? 0,
    oz = g.oz ?? 0,
    S = 64;
  let tops: Float32Array | null = null,
    crowns: Float32Array | null = null,
    occ: Float32Array | null = null;
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      const i = z * N + x,
        cover = g.wet[i] ? null : t.cover(x, z);
      if (!wooded(cover)) continue;
      if (!tops || !crowns || !occ) {
        tops = Float32Array.from(g.h);
        crowns = new Float32Array(n * 5).fill(Number.NaN);
        occ = Float32Array.from(g.occ);
      }
      const rise = cover!.rise,
        ground = g.h[i] - rise,
        wx = x + ox,
        wz = z + oz;
      tops[i] = ground;
      let top = ground;
      if (rise > 0) {
        // (its width and depth, and where it stands, in 64ths of a block)
        const share = coveredBy(cover!),
          wide =
            share < 1
              ? Math.max(CROWN_PART[0], Math.min(CROWN_PART[1], Math.sqrt(share)))
              : CROWN_NARROW[0] + (CROWN_NARROW[1] - CROWN_NARROW[0]) * hash2(wx, wz, 131);
        const most = S - 2 * CROWN_INSET,
          w = Math.min(most, Math.round(wide * (0.94 + 0.12 * hash2(wx, wz, 132)) * S)),
          d = Math.min(most, Math.round(wide * (0.94 + 0.12 * hash2(wx, wz, 133)) * S));
        const x0 = CROWN_INSET + Math.floor(hash2(wx, wz, 134) * (most - w + 1)),
          z0 = CROWN_INSET + Math.floor(hash2(wx, wz, 135) * (most - d + 1));
        top =
          ground +
          Math.max(
            CROWN_LEAST,
            Math.round(
              Math.max(rise * CROWN_LOW, t.crownTall ?? 0) * (1 + CROWN_TALLER * (2 * hash2(wx, wz, 136) - 1)) * S,
            ),
          ) /
            S;
        crowns.set([x + x0 / S, z + z0 / S, x + (x0 + w) / S, z + (z0 + d) / S, top], i * 5);
      }
      occ[i] = occ[i] > g.h[i] ? Math.max(occ[i], top) : top;
    }
  return tops && crowns && occ ? { tops, crowns, occ } : null;
}
/**
 * The tops of a ground's columns as `buildTerrain` draws them: those of `g` but where trees stand, which are drawn
 * at their ground (see `woodsOf`). The glide to the coarser step reads heights from these (worldprobe/glide.ts).
 */
export function drawnTops(g: Ground, t: GroundTraits): ArrayLike<number> {
  return woodsOf(g, t)?.tops ?? g.h;
}
/** the light of a crown: of its top, and of its sides halfway up (1 without the sky's share) */
function crownLight(c: Corners, crowns: Float32Array, i: number, ground: number): [number, number] {
  if (!c.askedAt) return [1, 1];
  const o = i * 5,
    mx = (crowns[o] + crowns[o + 2]) / 2,
    mz = (crowns[o + 1] + crowns[o + 3]) / 2,
    top = crowns[o + 4];
  return [skyLight(skyShare(c.g, mx, mz, top + 0.02)), skyLight(skyShare(c.g, mx, mz, (ground + top) / 2))];
}
/** Draws a column's crown (see `woodsOf`): its top and its four sides down to the floor at `ground`. */
export function drawCrown(
  on: Batch,
  c: Corners,
  crowns: Float32Array,
  i: number,
  ground: number,
  cover: NonNullable<Cover>,
  grain: number,
  wx: number,
  wz: number,
) {
  const o = i * 5,
    x0 = crowns[o],
    z0 = crowns[o + 1],
    x1 = crowns[o + 2],
    z1 = crowns[o + 3],
    top = crowns[o + 4];
  const [lt, ls] = crownLight(c, crowns, i, ground),
    tone = grain * (1 + CROWN_LIGHT * (2 * hash2(wx, wz, 137) - 1));
  const lit = (k: RGB, l: number, by: number): RGB => [k[0] * by * l ** 1.5, k[1] * by * l, k[2] * by * l ** 0.3];
  const up = lit(cover.top, lt, tone),
    high = lit(cover.side, ls, tone),
    low = lit(cover.side, ls, tone * 0.72);
  on.quadAt(x0, top, z0, x0, top, z1, x1, top, z1, x1, top, z0, up, up, up, up, 0, 1, 0);
  // (the two corners of each side at its foot, in the order that keeps it turned outwards: as the columns' sides)
  on.quadAt(x1, ground, z0, x1, ground, z1, x1, top, z1, x1, top, z0, low, low, high, high, 1, 0, 0);
  on.quadAt(x0, ground, z1, x0, ground, z0, x0, top, z0, x0, top, z1, low, low, high, high, -1, 0, 0);
  on.quadAt(x0, ground, z1, x1, ground, z1, x1, top, z1, x0, top, z1, low, low, high, high, 0, 0, 1);
  on.quadAt(x1, ground, z0, x0, ground, z0, x0, top, z0, x1, top, z0, low, low, high, high, 0, 0, -1);
}
