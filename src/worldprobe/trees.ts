// The trees of the near view as the first far step draws them: each where the finest step has it, as wide as it is
// there, as tall as the land is built (zoom.ts `uprightOf`) and in its colours, with what is smaller than a dot of the far picture left out (the tiers and lumps of a
// crown: lookprobe/blocks.ts draws those). The finest step puts a tree on a place every TREE_PITCH blocks, set off by
// chance, if its number is drawn against the woods' share there, and draws the tree from a random source of its own
// (world.ts); so the far step can draw the same tree from the place alone, with the woods' share and kind at the
// column it stands in, which far.ts lays down and a table keeps (`TREE_NUMBERS` to a column).
import { type Batch, type RGB, type Rnd, hash2, mix, seeded, shade } from '../lookprobe/batch';
import {
  ACACIA,
  CYPRESS,
  FLANK,
  FLANK_AWAY,
  FLANK_AWAY_WARM,
  JUNGLE,
  LEAVES,
  PALM,
  TREE_TALL,
  TRUNK,
} from '../lookprobe/blocks';
import { N } from '../lookprobe/layout';
import type { Part } from '../lookprobe/terrain';
import { uprightOf } from './zoom';

/** the finest step's places for a tree lie this many finest blocks apart (world.ts TREE_PITCH) */
export const TREE_PITCH = 2.4;
/** where no woods stand a tree still stands on this share of the places, and inside a wood this share of them carries one (world.ts STRAY_TREES, CLOSED) */
export const STRAY = 0.01,
  TREES_CLOSED = 0.88;
/** the step whose blocks are as wide as two of the finest, the only one that draws its trees one by one */
export const TREES_AT = 1;
const WIDER = 2 ** TREES_AT;
/** a finest block of height in blocks of that step: its trees are built as tall as its land (zoom.ts `uprightOf`) */
const UP = uprightOf(TREES_AT);
/** a column's trees are two numbers: the woods' share there (1 + 254 × share, 0: no trees) and their kind (KINDS, and for the temperate woods 4 × 63 × the share of conifers on top) */
export const TREE_NUMBERS = 2;
/** the kinds of woods: leafy and conifers mixed, the rain forest, the savanna's flat trees, the palms by the water of the dry lands */
export const TEMPERATE = 0,
  RAINFOREST = 1,
  SAVANNA = 2,
  PALMS = 3;

/** The two numbers of a column with trees (see TREE_NUMBERS). */
export function treesCode(share: number, kind: number, conifers = 0): [number, number] {
  return [
    1 + Math.round(Math.max(0, Math.min(1, share)) * 254),
    kind + (kind === TEMPERATE ? 4 * Math.round(Math.max(0, Math.min(1, conifers)) * 63) : 0),
  ];
}
const shareOf = (code: number) => (code - 1) / 254;

/** the seed of a tree's random source at the finest step (world.ts `seedOf`) */
const seedOf = (a: number, b: number, salt: number) => Math.floor(hash2(a, b, salt) * 4294967296);

/**
 * The trees that stand in a column: `visit` gets each tree's place in finest blocks of the world and its place's
 * numbers. The places of the finest step whose tree lies in the column's square of finest blocks, and of those the
 * ones whose number is drawn against the woods' share.
 */
export function treesIn(
  wx: number,
  wz: number,
  share: number,
  visit: (px: number, pz: number, tx: number, tz: number) => void,
) {
  const fx = wx * WIDER,
    fz = wz * WIDER;
  for (let tz = Math.floor((fz - 1.2) / TREE_PITCH); tz * TREE_PITCH < fz + WIDER + 1.2; tz++)
    for (let tx = Math.floor((fx - 1.2) / TREE_PITCH); tx * TREE_PITCH < fx + WIDER + 1.2; tx++) {
      if (hash2(tx, tz, 73) > STRAY + TREES_CLOSED * share) continue;
      const px = tx * TREE_PITCH + (hash2(tx, tz, 71) - 0.5) * 2.4,
        pz = tz * TREE_PITCH + (hash2(tx, tz, 72) - 0.5) * 2.4;
      if (px >= fx && px < fx + WIDER && pz >= fz && pz < fz + WIDER) visit(px, pz, tx, tz);
    }
}

/** The kind of tree a place carries in woods of `kind` (world.ts): a palm, an acacia, a leafy tree of the rain forest, a conifer or a leafy tree. */
function sortOf(tx: number, tz: number, kind: number): 'palm' | 'acacia' | 'jungle' | 'cypress' | 'tree' {
  const sort = hash2(tx, tz, 74);
  if (kind === PALMS || (kind === RAINFOREST && sort < 0.1)) return 'palm';
  if (kind === SAVANNA) return 'acacia';
  if (kind === RAINFOREST) return 'jungle';
  return sort < (kind >> 2) / 63 ? 'cypress' : 'tree';
}

/**
 * The colours of a crown of `crowns` (blocks.ts) on top and on its sides, as the finest step's trees show them
 * (blocks.ts `tree`, `cypress`, `acacia`, `palm`): the coarser far steps draw the trees of a column as one crown in
 * them (terrain_woods.ts `woodsOf`), so that the woods keep their colours from step to step.
 */
export function crownColours(g: RGB, crowns: readonly RGB[]): [RGB, RGB] {
  if (crowns === CYPRESS) return [shade(g, 1.25), g];
  if (crowns === ACACIA) return [g, shade(g, 0.68)];
  if (crowns === PALM) return [g, shade(g, 0.7)];
  return [g, mix(shade(g, 0.74), FLANK, 0.85)];
}

/** a far tree: boxes from the ground, in finest blocks round its trunk: half their width, their foot and top, their sides, top and the sides turned from the sun */
type Tier = [number, number, number, RGB, RGB, RGB];

/**
 * A tree of the finest step as the far step shows it, from the same random source drawn in the same order
 * (blocks.ts `tree`, `cypress`, `acacia`, `palm`): its trunk where it shows, and its crown as one block of its width
 * and height in its colours.
 */
function tiersOf(sort: ReturnType<typeof sortOf>, r: Rnd, closed: boolean): Tier[] {
  if (sort === 'cypress') {
    const g = r.pick(CYPRESS),
      s = r.range(0.85, 1.15) * TREE_TALL,
      away = mix(g, FLANK_AWAY, 0.5);
    return [
      [0.78, 0, 3.0 * s, g, shade(g, 1.25), away],
      [0.54, 3.0 * s, 5.0 * s, shade(g, 1.05), shade(g, 1.3), away],
    ];
  }
  if (sort === 'acacia') {
    const g = r.pick(ACACIA),
      s = r.range(0.85, 1.2),
      y0 = 1.5 * s,
      w = 1.15 * s,
      flank = shade(g, 0.68);
    return [
      [0.2, 0, y0 + 0.1, TRUNK, TRUNK, TRUNK],
      [w, y0, y0 + 0.8 * s, flank, g, flank],
    ];
  }
  if (sort === 'palm') {
    const g = r.pick(PALM),
      top = r.range(3.6, 5) * TREE_TALL,
      reach = r.range(1.0, 1.3),
      under = shade(g, 0.7);
    return [
      [0.15, 0, top, TRUNK, TRUNK, TRUNK],
      [0.75 * reach, top - 0.3, top + 0.33, under, g, under],
    ];
  }
  // a leafy tree: its size is drawn first, as the finest step hands it over (world.ts), then the tree (blocks.ts)
  const size = sort === 'jungle' ? r.range(1.1, 1.6) : closed ? r.range(0.9, 1.4) : r.range(0.85, 1.15);
  const g = r.pick(sort === 'jungle' ? JUNGLE : LEAVES),
    s = r.range(0.85, 1.15) * size,
    v = s * TREE_TALL,
    flank = mix(shade(g, 0.74), FLANK, 0.85),
    away = mix(FLANK_AWAY_WARM, FLANK_AWAY, r.next());
  const w = 0.92 * s,
    y0 = 1.15 * v,
    y2 = y0 + 2.2 * v;
  return [
    [0.24, 0, y0 + 0.2, TRUNK, TRUNK, TRUNK],
    [w, y0, y2 + 0.4 * v, flank, g, away],
  ];
}

/** The trees of the columns of `part` (TREE_NUMBERS each in `trees`, a ground of N × N whose first column is the world's block ox, oz of the step) on the tops `tops`. */
export function drawTrees(
  b: Batch,
  trees: ArrayLike<number>,
  tops: ArrayLike<number>,
  ox: number,
  oz: number,
  part: Part,
) {
  for (let z = part.z0; z < part.z1; z++)
    for (let x = part.x0; x < part.x1; x++) {
      const i = z * N + x,
        code = trees[i * TREE_NUMBERS],
        kind = trees[i * TREE_NUMBERS + 1];
      if (!code) continue;
      const share = shareOf(code),
        y = tops[i];
      treesIn(x + ox, z + oz, share, (px, pz, tx, tz) => {
        const cx = px / WIDER - ox,
          cz = pz / WIDER - oz;
        for (const [half, y0, y1, side, top, away] of tiersOf(
          sortOf(tx, tz, kind),
          seeded(seedOf(tx, tz, 75)),
          share > 0.5,
        )) {
          const h = half / WIDER;
          b.box(cx - h, y + y0 * UP, cz - h, cx + h, y + y1 * UP, cz + h, side, { top, away, foot: 0.84 });
        }
      });
    }
}

/** a tree of the finest step stands this many finest blocks high over its ground in the mean: leafy ones a little less, conifers more (`treeHeight`) */
const TREE_SEEN = 2.3;
/** how many of its blocks high the woods of a step stand as one crown, at least (GroundTraits.crownTall): as tall as the trees of the finest step, built as the land is */
export const crownTallAt = (step: number) => TREE_SEEN * uprightOf(step);
/** The height a tree stands over its ground, as it hides the sky round it (world.ts `occlude`): in finest blocks. */
export function treeHeight(kind: number, tx: number, tz: number): number {
  const sort = sortOf(tx, tz, kind);
  return sort === 'palm'
    ? 4.5 * TREE_TALL
    : sort === 'acacia'
      ? 2.4
      : sort === 'jungle'
        ? 4 * TREE_TALL
        : sort === 'cypress'
          ? 4.2 * TREE_TALL
          : 3.4 * TREE_TALL;
}
/** how far a tree hides the sky round its trunk, in finest blocks (world.ts `occlude`) */
export const TREE_REACH = 1.05;
