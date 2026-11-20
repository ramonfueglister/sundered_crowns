// The ground every build stands on: the grid it lies on (`N`, `onGrid`), the camera and frame of Ramon's reference
// image, the kinds of ground, what the mesher asks of a ground (`GroundTraits`), and a few helpers on its columns.
// One ground block is one unit. Where the probe scene's sea, river, roads, mountains, city and fields lie is in
// scene/places.ts.

/** side of the square ground grid, as a rule */
export const GRID = 400;
/**
 * Side of the square ground grid of the build that runs. It is GRID unless a build is run on a smaller ground
 * (`onGrid`): a piece of the world that needs less of the land round it than a ground of GRID blocks holds.
 */
export let N = GRID;
/**
 * Runs `build` on a ground of `side` blocks (GRID where none is given) and gives back what it returns. The side holds
 * only while `build` runs, so `build` must not wait for anything: what it needs is loaded before.
 */
export function onGrid<T>(side: number | undefined, build: () => T): T {
  const before = N;
  N = side ?? GRID;
  try {
    return build();
  } finally {
    N = before;
  }
}
/** the middle of the probe scene's ground, which is always GRID blocks wide */
const C = GRID / 2;
/**
 * The camera of the reference image, measured from the directions of its building edges (they run 18.5° down and 16.5°
 * up to the right): it looks down by 18.7°, and the ground's x axis lies 46.7° from the picture's horizontal.
 */
export const VIEW = { elevation: 18.7, turn: 46.7 } as const;
const TURN = (VIEW.turn * Math.PI) / 180;
/** ground directions (x, z) of the picture's right and of its bottom (towards the camera) */
export const RIGHT: P2 = [Math.cos(TURN), -Math.sin(TURN)],
  NEAR: P2 = [Math.sin(TURN), Math.cos(TURN)];
/** ground units across the picture and from its top to its bottom edge */
export const FRAME_W = 190,
  FRAME_D = (FRAME_W * 941) / 1672 / Math.sin((VIEW.elevation * Math.PI) / 180);
/** height of the water surface; land starts at LAND_Y */
export const SEA_Y = 2.7,
  LAND_Y = 4;

export type P2 = readonly [number, number];
export const toXZ = (s: number, t: number): P2 => {
  const u = (s - 0.5) * FRAME_W,
    v = (t - 0.5) * FRAME_D;
  return [C + u * RIGHT[0] + v * NEAR[0], C + u * RIGHT[1] + v * NEAR[1]];
};
export const toST = (x: number, z: number): P2 => {
  const u = (x - C) * RIGHT[0] + (z - C) * RIGHT[1],
    v = (x - C) * NEAR[0] + (z - C) * NEAR[1];
  return [u / FRAME_W + 0.5, v / FRAME_D + 0.5];
};
/** wheat stands for the winter corn, ripe in the picture's summer; oats for the spring corn, still green then */
export type Crop = 'wheat' | 'oats' | 'vine';
/** what a ploughed column carries: a crop, or nothing this year (the fallow, grazed until it is ploughed again) */
type Tilled = Crop | 'fallow';

export const Mat = { Grass: 0, Paved: 1, Rock: 2, Soil: 3, Bed: 4 } as const;
export interface Ground {
  /** top of each column in blocks */
  h: Int16Array;
  mat: Uint8Array;
  /** 1 where the column lies under water */
  wet: Uint8Array;
  /** blocks to the nearest dry column (0 on land), capped */
  shore: Uint8Array;
  /** height that blocks the sky over each column: ground, later raised by houses and trees */
  occ: Float32Array;
  /** height of the water surface over each wet column */
  surf: Float32Array;
  /** world block of the ground's first column, where the ground is a piece of a larger world (else 0) */
  ox?: number;
  oz?: number;
}
/** What the ground mesher needs to know about a scene beyond heights and materials. Positions are ground coordinates. */
export interface GroundTraits {
  /** paved town ground */
  city(x: number, z: number): boolean;
  /** blocks to the edge of the main square, negative inside it (Infinity where there is none) */
  plaza(x: number, z: number): number;
  crop(x: number, z: number, margin?: number): Tilled | null;
  /** blocks to the nearest path */
  road(x: number, z: number): number;
  /** how sun-bleached the meadow is (0 … 1) */
  bleach(x: number, z: number): number;
  /** how far up its massif a rock column stands (0 … 1); pale summit above `SUMMIT` */
  summit(x: number, z: number): number;
  /** the colour the meadow is pulled towards where the land is not green (sand, dry grass, snow), and how far (0 … 1) */
  tint?(x: number, z: number): readonly [readonly [number, number, number], number] | null;
  /** linear RGB of the sides of meadow steps where hills are overgrown; bare earth if left out */
  slope?: readonly [number, number, number];
  /** how far (0 … 1) the sides of meadow steps take the colour of the meadow above them, and their foot its light: from afar a step is to show as relief, not as a line drawn across the land (0 if left out) */
  sideTop?: number;
  /** how many of its blocks high the trees of a far step stand as one crown, at least (terrain_woods.ts `woodsOf`): as tall as the finest step's trees, where its land is built so much flatter (0 if left out) */
  crownTall?: number;
  /**
   * What stands or grows on a column as part of the ground itself, where the land is seen from so far that a house or
   * a tree is a single block: the colour of its top, and of its sides down to `rise` blocks below the top (a field
   * only colours the top: `rise` 0).
   */
  cover?(
    x: number,
    z: number,
  ): {
    top: readonly [number, number, number];
    side: readonly [number, number, number];
    rise: number;
    /** how much of the top the cover colours, 0 … 1 (all of it if left out) */
    share?: number;
    /** false: the cover is the ground's own, bare soil for one, not something that stands on it (terrain.ts `carried`) */
    stands?: boolean;
  } | null;
  /** the houses that stand on the ground as houses where it is seen from afar (worldprobe/houses.ts, HOUSE_NUMBERS numbers each) */
  readonly houses?: ArrayLike<number>;
  /** the trees of the finest step where the ground draws them one by one (worldprobe/trees.ts, TREE_NUMBERS to a column, N × N columns) */
  readonly trees?: ArrayLike<number>;
  /** the crops of the lots where the ground draws the finest step's sheaves one by one (worldprobe/crops.ts, a byte to a column, N × N columns) */
  readonly crops?: ArrayLike<number>;
  /** where the figures are drawn from afar, what the finest step has on the four blocks of a column (worldprobe/crowd.ts, a byte to a column, N × N columns): kept with the ground, not drawn by it */
  readonly quarters?: ArrayLike<number>;
}
export const idx = (x: number, z: number) => z * N + x;
export const inGrid = (x: number, z: number) => x >= 0 && z >= 0 && x < N && z < N;

/** rock above this share of its massif's height is summit: pale cubes */
export const SUMMIT = 0.66;
/** side of the pillars the rock is stacked from, in columns */
export const ROCK_PILLAR = 2;
/** the pillar of rock a column belongs to; the rows of pillars are shifted against each other like bricks */
export const rockPillar = (x: number, z: number): P2 => {
  const cx = Math.floor(x / ROCK_PILLAR);
  return [cx, Math.floor((z + cx) / ROCK_PILLAR)];
};
/** Fills `shore`: blocks from each wet column to the nearest dry one, by repeated relaxation (two passes are enough for the short range needed). */
export function measureShore(g: Ground) {
  const far = 14;
  for (let i = 0; i < N * N; i++) g.shore[i] = g.wet[i] ? far : 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        const i = idx(x, z);
        if (!g.wet[i]) continue;
        let d = g.shore[i];
        if (x > 0) d = Math.min(d, g.shore[i - 1] + 1);
        if (z > 0) d = Math.min(d, g.shore[i - N] + 1);
        g.shore[i] = d;
      }
    for (let z = N - 1; z >= 0; z--)
      for (let x = N - 1; x >= 0; x--) {
        const i = idx(x, z);
        if (!g.wet[i]) continue;
        let d = g.shore[i];
        if (x < N - 1) d = Math.min(d, g.shore[i + 1] + 1);
        if (z < N - 1) d = Math.min(d, g.shore[i + N] + 1);
        g.shore[i] = d;
      }
  }
}

/** Raises the sky blocker over a ground rectangle (houses, trees). */
export function occlude(g: Ground, x0: number, z0: number, x1: number, z1: number, top: number) {
  for (let z = Math.max(0, Math.floor(z0)); z < Math.min(N, Math.ceil(z1)); z++)
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(N, Math.ceil(x1)); x++) {
      const i = idx(x, z);
      if (g.occ[i] < top) g.occ[i] = top;
    }
}
/** Ground height under a point (the water surface over water). */
export const groundY = (g: Ground, x: number, z: number) => {
  const i = idx(Math.max(0, Math.min(N - 1, Math.floor(x))), Math.max(0, Math.min(N - 1, Math.floor(z))));
  return g.wet[i] ? g.surf[i] : g.h[i];
};
export const isWet = (g: Ground, x: number, z: number) =>
  !inGrid(Math.floor(x), Math.floor(z)) || g.wet[idx(Math.floor(x), Math.floor(z))] === 1;
