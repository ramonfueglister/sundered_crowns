// Ground and water of the probe scene as meshes. The ground is made of columns (one height per cell), as the real
// renderer will be: level neighbours form one smooth surface, steps show only where heights differ.
import { Batch, type RGB, fbm2, hash2, mix, noise2, rgb, shade, smooth } from './batch';
import { type Ground, type GroundTraits, Mat, N, SEA_Y, SUMMIT, idx, rockPillar } from './layout';
import { SUN, litness } from './light';

export const GRASS_A = rgb(0xb0c83c),
  GRASS_B = rgb(0xbcca3e),
  GRASS_DRY = rgb(0xd2c444),
  GRASS_DEEP = rgb(0x98b638);
const MEADOW_MID = rgb(0x9abf3d),
  MEADOW_DEEP = rgb(0x82ac37),
  TUFT = rgb(0x5f9030);
const ROAD = rgb(0xe0c6a4),
  PAVED = rgb(0xe4c6b4),
  PLAZA = rgb(0xecd6c6),
  ISLE_STONE = rgb(0xf0d6bc);
/** how much the single stones of a cliff differ in brightness, and how much darker its notches are */
const ROCK_GRAIN = 0.3,
  ROCK_NOTCH = 0.3;
export const ROCK_TOP_LOW = rgb(0xb4aaa6),
  ROCK_TOP_HIGH = rgb(0xfdfaf8);
const ROCK_SIDE_LOW = rgb(0xa09a9e),
  ROCK_SIDE = rgb(0xc4ac9e),
  ROCK_SIDE_COOL = rgb(0xa8b4c0),
  ROCK_SIDE_HIGH = rgb(0xfff5ed),
  ROCK_SIDE_HIGH_COOL = rgb(0xd0dae6);
export const SOIL_WHEAT = rgb(0xc4aa4c),
  SOIL_OATS = rgb(0x6c9634),
  SOIL_VINE = rgb(0x587a2a);
/** the fallow: stubble and weeds, grazed, shows through the grass this far */
export const SOIL_FALLOW = rgb(0xb0a060),
  FALLOW_SHOWS = 0.65;
export const SHADED_SOIL = rgb(0x6a705c);
const DIRT = rgb(0xa88a52),
  QUAY = rgb(0xdcc4b4),
  EARTH = rgb(0x9a8450);
export const WATER_SHALLOW = rgb(0x349aa4),
  WATER_DEEP = rgb(0x2b818c),
  FALLS = rgb(0x9fd6d8);

/** Share of the sky seen from a point: eight directions, the steepest blocker in each. This is light step 2 of the plan. */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0.707, 0.707],
  [0, 1],
  [-0.707, 0.707],
  [-1, 0],
  [-0.707, -0.707],
  [0, -1],
  [0.707, -0.707],
];
const REACH = [0.75, 1.6, 2.8, 4.5, 7, 10.5];
/** the columns a corner of the grid looks at, as steps from it: the reaches of each direction, two numbers each */
const LOOKS = Int32Array.from(
  DIRS.flatMap(([dx, dz]) => REACH.flatMap((r) => [Math.floor(dx * r), Math.floor(dz * r)])),
);
export function skyShare(g: Ground, x: number, z: number, y: number): number {
  // (the numbers are those of the plain rule: what does not stand above the point has a rise of nought or less and
  // is never the steepest, so it is not divided; a direction with nothing above takes nothing, so no root is drawn;
  // and from a corner of the grid the columns looked at are the same steps away wherever it lies. A sixth of what
  // a worker takes for a far piece went into this.)
  const occ = g.occ,
    dirs = DIRS.length,
    reaches = REACH.length;
  let blocked = 0;
  if (Number.isInteger(x) && Number.isInteger(z)) {
    for (let d = 0, o = 0; d < dirs; d++) {
      let steepest = 0;
      for (let k = 0; k < reaches; k++, o += 2) {
        const sx = x + LOOKS[o],
          sz = z + LOOKS[o + 1];
        if (sx < 0 || sz < 0 || sx >= N || sz >= N) continue;
        const over = occ[sz * N + sx] - y;
        if (over <= 0) continue;
        const rise = over / REACH[k];
        if (rise > steepest) steepest = rise;
      }
      if (steepest > 0) blocked += steepest / Math.sqrt(1 + steepest * steepest);
    }
    return 1 - blocked / dirs;
  }
  for (let d = 0; d < dirs; d++) {
    const dx = DIRS[d][0],
      dz = DIRS[d][1];
    let steepest = 0;
    for (let k = 0; k < reaches; k++) {
      const r = REACH[k],
        sx = Math.floor(x + dx * r),
        sz = Math.floor(z + dz * r);
      if (sx < 0 || sz < 0 || sx >= N || sz >= N) continue;
      const over = occ[sz * N + sx] - y;
      if (over <= 0) continue;
      const rise = over / r;
      if (rise > steepest) steepest = rise;
    }
    if (steepest > 0) blocked += steepest / Math.sqrt(1 + steepest * steepest);
  }
  return 1 - blocked / dirs;
}
/** Brightness factor from the sky share: open ground stays at 1, deep corners fall to about a half. */
export const skyLight = (share: number) => 0.42 + 0.58 * Math.min(1, share * 1.08);

/**
 * The meadows of the reference are tiled, not washed: flat patches of a few cells, each a step greener, darker or
 * drier than the next, and single dark tufts. Gives the colour a cell is pulled towards and how far, or null.
 */
function meadowPatch(x: number, z: number): readonly [RGB, number] | null {
  if (hash2(x, z, 87) < 0.008) return [TUFT, 0.6];
  // slabs of three by two cells, every other column of slabs shifted; dry patches of two by two between them
  const col = Math.floor(x / 3),
    lot = hash2(col, Math.floor((z + col) / 2), 83);
  if (lot < 0.22) return [MEADOW_MID, 0.4];
  if (lot > 0.93) return [MEADOW_DEEP, 0.4];
  return hash2(Math.floor(x / 2), Math.floor((z + Math.floor(x / 2)) / 2), 85) < 0.2 ? [GRASS_DRY, 0.22] : null;
}

/** `wx`, `wz`: the point in world blocks, which the patterns of the ground are laid out in. */
export function topColor(t: GroundTraits, x: number, z: number, mat: number, wx = x, wz = z): RGB {
  if (mat === Mat.Rock) return t.summit(x, z) > SUMMIT ? ROCK_TOP_HIGH : ROCK_TOP_LOW;
  if (mat === Mat.Paved && !t.city(x, z)) return shade(ISLE_STONE, 0.94 + 0.1 * noise2(wx / 1.7, wz / 1.7, 6));
  if (mat === Mat.Paved)
    return shade(mix(PLAZA, PAVED, smooth(-1, 3, t.plaza(x, z))), 0.93 + 0.12 * noise2(wx / 2.3, wz / 2.3, 4));
  if (mat === Mat.Bed) return QUAY;
  const crop = mat === Mat.Soil ? t.crop(x, z, 0.6) : null;
  let c = mix(GRASS_A, GRASS_B, fbm2(wx / 11, wz / 11, 21));
  // sun-bleached blades between the green ones, changing from cell to cell: the lit meadows of the reference are
  // speckled yellow-green
  c = mix(c, GRASS_DRY, hash2(Math.round(wx), Math.round(wz), 23) * (0.12 + 0.2 * t.bleach(x, z)));
  c = mix(c, GRASS_DEEP, smooth(0.45, 0.75, fbm2(wx / 13, wz / 13, 25)) * 0.6);
  const tint = t.tint?.(x, z);
  if (tint) c = mix(c, shade(tint[0], 0.96 + 0.08 * hash2(Math.round(wx), Math.round(wz), 24)), tint[1]);
  if (crop)
    c =
      crop === 'fallow'
        ? mix(c, SOIL_FALLOW, FALLOW_SHOWS)
        : mix(c, crop === 'wheat' ? SOIL_WHEAT : crop === 'oats' ? SOIL_OATS : SOIL_VINE, 0.85);
  // paths: soft edges, because the colour is taken at the corners and blended across each block
  const near = t.road(x, z),
    road = 1 - smooth(1.3, 2.0, near + (noise2(wx / 2, wz / 2, 27) - 0.5) * 0.9);
  // bare earth shows through in patches, mostly beside the paths
  const bare = smooth(0.6, 0.72, fbm2(wx / 6, wz / 6, 29) + 0.12 * smooth(7, 2, near));
  c = mix(c, DIRT, bare * 0.7);
  return t.city(x, z) ? PAVED : mix(c, ROAD, road * 0.92);
}

/** A rectangle of columns of the ground: x0 ≤ x < x1, z0 ≤ z < z1. */
export interface Part {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
const whole = (): Part => ({ x0: 0, z0: 0, x1: N, z1: N });

/** a column is what it carries, and not ground, from this share of cover on (GroundTraits.cover) */
const CARRIED_FROM = 0.5;
// The helpers of `buildTerrain` stand out here, with what they share handed to them: a helper made inside the builder
// is a new one for every piece, and the engine's fast code for it is lost when the piece is done.
/** what `buildTerrain` keeps for the corners of the grid while it runs (see there) */
interface Corners {
  g: Ground;
  t: GroundTraits;
  ox: number;
  oz: number;
  side: number;
  askedAt: Float64Array | null;
  answer: Float64Array | null;
  groundAt: RGB[];
  kindAt: Int8Array;
}
/** the sky's light at a point of the ground at height `y`; at a corner of the grid the answer given before, where the height is the same */
function lightAt(c: Corners, x: number, z: number, y: number) {
  const { askedAt, answer } = c;
  if (!askedAt || !answer) return 1;
  const k = z * c.side + x;
  // (the sides of a column ask beside the grid's corners: those are worked out each time)
  if (!Number.isInteger(k) || x < 0 || x > N) return skyLight(skyShare(c.g, x, z, y));
  if (askedAt[k] !== y) {
    askedAt[k] = y;
    answer[k] = skyLight(skyShare(c.g, x, z, y));
  }
  return answer[k];
}
/** the colour of the ground at a corner of the grid; the answer given before, where the kind of ground is the same */
function groundColour(c: Corners, cx: number, cz: number, mat: number): RGB {
  const k = cz * c.side + cx;
  if (c.kindAt[k] !== mat) {
    c.kindAt[k] = mat;
    c.groundAt[k] = topColor(c.t, cx, cz, mat, cx + c.ox, cz + c.oz);
  }
  return c.groundAt[k];
}
/** the colour of a column's top at one of its four corners: the column's height, kind of ground, grain, cover, rock top and meadow patch are the column's own */
function cornerColour(
  c: Corners,
  cx: number,
  cz: number,
  h: number,
  mat: number,
  grain: number,
  cover: ReturnType<NonNullable<GroundTraits['cover']>>,
  rockTop: RGB | null,
  patch: ReturnType<typeof meadowPatch>,
): RGB {
  // where less of the sky is seen the ground turns not only darker but cooler: red falls off faster than blue
  const l = lightAt(c, cx, cz, h + 0.02);
  if (cover && !(cover.share! < 1))
    return [cover.top[0] * grain * l ** 1.5, cover.top[1] * grain * l, cover.top[2] * grain * l ** 0.3];
  const smoothBase = rockTop ?? groundColour(c, cx, cz, mat),
    own = patch ? mix(smoothBase, patch[0], patch[1]) : smoothBase,
    base = cover ? mix(own, cover.top, cover.share!) : own;
  // under trees and between houses the grass gives way to dull, dark soil
  const tone = mat === Mat.Grass ? mix(base, SHADED_SOIL, Math.min(1, (1 - l) * 1.3)) : base;
  return [tone[0] * grain * l ** 1.5, tone[1] * grain * l, tone[2] * grain * l ** 0.3];
}
type Cover = ReturnType<NonNullable<GroundTraits['cover']>>;
/** whether what a column carries is trees: green and standing on the ground (a field is green too, but does not rise) */
const wooded = (cover: Cover) =>
  !!cover && cover.stands !== false && cover.top[1] > cover.top[0] && cover.top[1] > cover.top[2];
/**
 * The trees of a far step. The tables give a wooded column the rise of its trees above its ground (at the first far
 * step two blocks where a tree stands on it and one where a crown reaches over it, farther out one where trees
 * stand). Drawn as columns that tall the woods were a wall over the villages, and drawn as one roof a flat sheet. So
 * a wooded column is drawn at its ground, as the floor of the wood, and on it its trees stand as one crown of their
 * own: a block narrower than the column, set off in it by chance, `CROWN_LOW` of the rise high or as tall as the
 * finest step's trees where that is more (GroundTraits.crownTall: at the second far step, which takes over from
 * the trees of the first without a glide), give or take `CROWN_TALLER`. Where trees cover the column whole the crown is `CROWN_NARROW` of it wide, and the floor between
 * the crowns shows `FLOOR` as light as they are; where they cover part of it, the crown covers as much of it and the
 * floor is the ground's own. Each crown is a touch lighter or darker than the next (`CROWN_LIGHT`). A column whose
 * trees have no rise (a crown that reaches over it from the next) is a floor alone.
 * (The crowns are level and upright rectangles on the 64ths of a block, inside their column: the glide to the coarser
 * step takes them down into it and brings up the coarser step's, worldprobe/glide.ts.)
 */
const CROWN_LOW = 0.5,
  CROWN_TALLER = 0.3,
  CROWN_NARROW = [0.66, 0.92] as const,
  FLOOR = 0.6,
  CROWN_LIGHT = 0.12;
/** the narrowest a crown of part of a column is, and the widest */
const CROWN_PART = [0.4, 0.86] as const;
/** a crown stands this many 64ths of a block at least inside its column on every side, and is this many high at least */
const CROWN_INSET = 1,
  CROWN_LEAST = 8;
/** the share of a column that its trees cover, as a table keeps it (a byte: worldprobe/table.ts `packTable`), so that a column drawn from its table has the crown it had where it was built */
const coveredBy = (cover: NonNullable<Cover>) => Math.round(Math.max(0, Math.min(1, cover.share ?? 1)) * 255) / 255;
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
function drawCrown(
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
/**
 * How far the sides of meadow steps take the colour of the meadow above them at each step of the map
 * (GroundTraits.sideTop), lifted so that a side would be as bright as the meadow above it (`LIFT`): less at the
 * finest step, where a step is a bank one sees up close, and more the farther out, where the sides drew a dark line
 * along every step across the land.
 */
const SIDE_TOP = [0.45, 0.6, 0.7, 0.8, 0.85, 0.9, 0.9, 0.9];
/**
 * A side lies in less light than a top: the colour that makes a side facing each way (east, west, south, north) as
 * bright as the top above it under the stage's lights, as a factor of the top's colour (no more than SIDE_MOST allows).
 */
const LIFT = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
].map((n) => litness([0, 1, 0]) / litness(n as [number, number, number]));
/** the brightest a side's colour may become (below worldprobe/small.ts BRIGHTEST, 2) */
const SIDE_MOST = 1.9;
export const sideTopAt = (step: number) => SIDE_TOP[Math.max(0, Math.min(SIDE_TOP.length - 1, step))];
/**
 * The relief of the land shown by its colour: the tops of the land are a touch lighter where the ground, averaged
 * over RELIEF_REACH columns to each side, rises towards the sun, and a touch darker where it falls away from it. The
 * steps of the land are wide and few (world.ts `terrace`), so a hill would read only at its few edges: this lets its
 * slopes read as well, as a shaded relief map does. RELIEF_MOST: the most a top is lightened or darkened; at a rise
 * of RELIEF_FULL blocks to a column towards the sun it is reached.
 */
const RELIEF_REACH = 4,
  RELIEF_MOST = 0.12,
  RELIEF_FULL = 0.12;
const SUN_FLAT = Math.hypot(SUN[0], SUN[2]),
  SUN_X = SUN[0] / SUN_FLAT,
  SUN_Z = SUN[2] / SUN_FLAT;
/** the brightness of every corner of the grid by the relief of the tops as drawn (`drawnTops`; (N + 1)² numbers, about 1), see RELIEF_MOST */
function reliefOf(g: Ground, tops: ArrayLike<number>): Float32Array {
  const n = N,
    side = n + 1,
    ground = new Float32Array(n * n),
    dry = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++)
    if (!g.wet[i]) {
      ground[i] = tops[i];
      dry[i] = 1;
    }
  // the dry ground averaged over a square (in two runs, along the rows and then the columns); water counts for nothing
  const rowSum = new Float32Array(n * n),
    rowCount = new Uint16Array(n * n),
    mean = new Float32Array(n * n),
    r = RELIEF_REACH;
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      let sum = 0,
        count = 0;
      for (let u = Math.max(0, x - r), end = Math.min(n - 1, x + r); u <= end; u++) {
        const j = z * n + u;
        if (dry[j]) {
          sum += ground[j];
          count++;
        }
      }
      rowSum[z * n + x] = sum;
      rowCount[z * n + x] = count;
    }
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      let sum = 0,
        count = 0;
      for (let v = Math.max(0, z - r), end = Math.min(n - 1, z + r); v <= end; v++) {
        sum += rowSum[v * n + x];
        count += rowCount[v * n + x];
      }
      mean[z * n + x] = count ? sum / count : 0;
    }
  // at a corner of the grid the slope of the averaged ground over the four columns round it
  const out = new Float32Array(side * side).fill(1),
    at = (x: number, z: number) => mean[Math.max(0, Math.min(n - 1, z)) * n + Math.max(0, Math.min(n - 1, x))];
  for (let z = 0; z <= n; z++)
    for (let x = 0; x <= n; x++) {
      const east = (at(x, z - 1) + at(x, z) - at(x - 1, z - 1) - at(x - 1, z)) / 2,
        south = (at(x - 1, z) + at(x, z) - at(x - 1, z - 1) - at(x, z - 1)) / 2;
      const towards = east * SUN_X + south * SUN_Z;
      out[z * side + x] = 1 + RELIEF_MOST * Math.max(-1, Math.min(1, towards / RELIEF_FULL));
    }
  return out;
}

/** the four columns beside a column: east, west, south, north */
const NB_X = [1, -1, 0, 0],
  NB_Z = [0, 0, 1, -1];
/**
 * `baked` switches the sky share on (light step 2); without it the ground has only the live sun and sky of step 1.
 * `part` limits the mesh to a rectangle of columns, for a ground that is one piece of a larger world.
 * With `carried` the tops and sides of what the columns carry as part of themselves (houses, trees and fields of a
 * far step, `cover`) are put there instead of into the ground: a mesh of its own, which the stage treats as what
 * stands on the ground (Stage.lay).
 */
export function buildTerrain(g: Ground, t: GroundTraits, baked = true, part: Part = whole(), carried?: Batch): Batch {
  const ox = g.ox ?? 0,
    oz = g.oz ?? 0;
  const b = new Batch();
  // (a top to each column and, on land that is not level, about as much again in sides)
  b.reserve((part.x1 - part.x0) * (part.z1 - part.z0) * 4);
  // A corner of the grid is asked for its light by each of the four columns around it, at that column's height:
  // where they are level, as most land is, the answer is the one given before (a seventh of a piece's building
  // time went into working it out four times).
  // So with the colour of the ground at a corner of the grid: the four columns around it ask for it, and where they
  // are of one kind of ground the answer is the same (a ninth of a near piece's building time went into it).
  const side = N + 1,
    woods = woodsOf(g, t),
    tops = woods ? woods.tops : g.h;
  const c: Corners = {
    g: woods ? { ...g, occ: woods.occ } : g,
    t,
    ox,
    oz,
    side,
    askedAt: baked ? new Float64Array(side * side).fill(NaN) : null,
    answer: baked ? new Float64Array(side * side) : null,
    groundAt: new Array(side * side),
    kindAt: new Int8Array(side * side).fill(-1),
  };
  const relief = reliefOf(g, tops),
    towardsTop = t.sideTop ?? 0;
  for (let z = part.z0; z < part.z1; z++)
    for (let x = part.x0; x < part.x1; x++) {
      const i = idx(x, z),
        h = tops[i],
        mat = g.mat[i],
        wx = x + ox,
        wz = z + oz;
      // every cell is a touch lighter or darker than its neighbours: the fine grain of the reference's ground
      // paving lies in slabs of two by two cells, every other row shifted by one
      const col = Math.floor(wx / 2),
        slab = hash2(col, Math.floor((wz + (col % 2)) / 2), 47) - 0.5;
      const grain =
        mat === Mat.Rock
          ? 1
          : mat === Mat.Paved
            ? (1.03 + slab * 0.22 + (hash2(wx, wz, 45) - 0.5) * 0.1) *
              (hash2(wx, wz, 46) < 0.06 ? 0.8 : hash2(wx, wz, 46) > 0.95 ? 1.1 : 1)
            : 1 + (hash2(wx, wz, 45) - 0.5) * (t.road(x + 0.5, z + 0.5) < 1.7 ? 0.16 : 0.1);
      // a rock column has one colour over its whole top, so that the cubes stay crisp
      const rockTop = mat === Mat.Rock ? topColor(t, x, z, mat, wx, wz) : null,
        pale = mat === Mat.Rock && t.summit(x, z) > SUMMIT;
      const tint = mat === Mat.Grass || mat === Mat.Soil ? (t.tint?.(x + 0.5, z + 0.5) ?? null) : null;
      // a column that carries a house, a tree or a field as part of itself has their colour over its whole top; the
      // floor of a wood is darker than its crowns, and where its trees cover part of the column the ground's own
      const carries = g.wet[i] ? null : (t.cover?.(x, z) ?? null),
        crowned = !!woods && !Number.isNaN(woods.crowns[i * 5]);
      const part = !!carries && coveredBy(carries) < 1,
        cover =
          !woods || !wooded(carries) || (!crowned && part)
            ? carries
            : crowned && part
              ? null
              : { ...carries!, top: shade(carries!.top, FLOOR) };
      // the tiled meadow belongs to green land
      const patch =
        !cover &&
        mat === Mat.Grass &&
        t.road(x + 0.5, z + 0.5) > 2.2 &&
        !t.city(x + 0.5, z + 0.5) &&
        !(tint && tint[1] > 0.4)
          ? meadowPatch(wx, wz)
          : null;
      const r00 = cornerColour(c, x, z, h, mat, grain, cover, rockTop, patch),
        r10 = cornerColour(c, x + 1, z, h, mat, grain, cover, rockTop, patch);
      const r11 = cornerColour(c, x + 1, z + 1, h, mat, grain, cover, rockTop, patch),
        r01 = cornerColour(c, x, z + 1, h, mat, grain, cover, rockTop, patch);
      // (the relief lightens or darkens the tops alone: the sides keep the light of their own direction)
      const q = z * side + x,
        c00 = shade(r00, relief[q]),
        c10 = shade(r10, relief[q + 1]),
        c11 = shade(r11, relief[q + side + 1]),
        c01 = shade(r01, relief[q + side]);
      const on = carried && cover && cover.stands !== false && !(cover.share! < CARRIED_FROM) ? carried : b;
      // (a wooded column is drawn at its ground: what it carries has no sides of its own but its crown's)
      const rise = woods && wooded(carries) ? 0 : cover ? cover.rise : 0;
      if (!g.wet[i]) on.quadAt(x, h, z, x, h, z + 1, x + 1, h, z + 1, x + 1, h, z, c00, c01, c11, c10, 0, 1, 0);
      if (g.wet[i]) continue;
      if (crowned) drawCrown(carried ?? b, c, woods!.crowns, i, h, carries!, grain, wx, wz);
      for (let k = 0; k < 4; k++) {
        const dx = NB_X[k],
          dz = NB_Z[k],
          nx = x + dx,
          nz = z + dz;
        const out = nx < 0 || nz < 0 || nx >= N || nz >= N;
        const nh = out ? 0 : tops[idx(nx, nz)];
        if (nh >= h) continue;
        const wetSide = !out && g.wet[idx(nx, nz)] === 1;
        let side: RGB;
        // rock: on the faces towards the sun grey stone that turns warm and light towards the summits, slate blue on those
        // turned away, each pillar lighter or darker than the next and a third of the slate ones dark
        if (mat === Mat.Rock) {
          const [rx, rz] = rockPillar(wx, wz),
            lot = hash2(rx, rz, 35);
          side =
            dx === 1
              ? shade(mix(ROCK_SIDE_LOW, ROCK_SIDE, smooth(0.2, SUMMIT, t.summit(x, z))), 0.86 + 0.24 * lot)
              : shade(ROCK_SIDE_COOL, lot < 0.35 ? 0.42 + 0.3 * lot : 0.6 + 0.4 * lot);
        } else if (mat === Mat.Paved && !t.city(x + 0.5, z + 0.5))
          side = shade(ISLE_STONE, 0.9 + 0.12 * hash2(Math.floor(wx / 2), Math.floor(wz / 2), 37));
        else if (wetSide || mat === Mat.Paved) side = shade(QUAY, 0.9 + 0.2 * hash2(wx, wz, 37));
        else side = t.slope ? shade(t.slope, 0.9 + 0.2 * hash2(wx, wz, 37)) : EARTH;
        // from afar a meadow step takes the colour of the meadow above it (GroundTraits.sideTop)
        const meadowSide = towardsTop > 0 && !wetSide && (mat === Mat.Grass || mat === Mat.Soil);
        if (meadowSide) {
          // (no brighter than a corner's colour can be told: worldprobe/small.ts BRIGHTEST)
          const r = r00[0] + r10[0] + r11[0] + r01[0],
            gr = r00[1] + r10[1] + r11[1] + r01[1],
            bl = r00[2] + r10[2] + r11[2] + r01[2];
          const lift = Math.min(LIFT[k], (4 * SIDE_MOST) / Math.max(r, gr, bl, 1e-6)) / 4;
          side = mix(side, [r * lift, gr * lift, bl * lift], towardsTop);
        }
        if (tint && !wetSide) side = mix(side, shade(tint[0], 0.8), tint[1]);
        // the two top corners of this side, in the order that keeps the face turned outwards
        const ax = dx === 1 ? x + 1 : dx === -1 ? x : dz === 1 ? x : x + 1,
          az = dz === 1 ? z + 1 : dz === -1 ? z : dx === 1 ? z : z + 1;
        const bx = dx === 1 ? x + 1 : dx === -1 ? x : dz === 1 ? x + 1 : x,
          bz = dz === 1 ? z + 1 : dz === -1 ? z : dx === 1 ? z + 1 : z;
        let la = lightAt(c, ax + dx * 0.3, az + dz * 0.3, h - 0.2),
          lb = lightAt(c, bx + dx * 0.3, bz + dz * 0.3, h - 0.2);
        // (and where it takes the meadow's colour, the sky's light of the meadow too: in the corner under a step the sky's share was what drew the line)
        if (meadowSide) {
          la += (1 - la) * towardsTop;
          lb += (1 - lb) * towardsTop;
        }
        const foot = meadowSide ? 0.7 + 0.3 * towardsTop : 0.7;
        if (mat === Mat.Rock) {
          // cliffs: flat faces without a gradient, pale for the upper two or four blocks of a pale pillar, grey below
          const [sx, sz] = rockPillar(wx, wz),
            split = pale ? Math.max(nh, h - 2 - 2 * Math.floor(hash2(sx, sz, 38) * 2)) : h,
            la2 = 0.5 + 0.5 * la,
            lb2 = 0.5 + 0.5 * lb;
          // the wall is built of stones half a block wide and one to three high, each a touch lighter or darker than
          // the next and a few of them dark, as notches: the fine drawing of the reference's cliffs
          const mx = (ax + bx) / 2,
            mz = (az + bz) / 2,
            lm2 = (la2 + lb2) / 2;
          for (let half = 0; half < 2; half++)
            for (let y = nh; y < h; ) {
              const key = wx * 4 + dx + half,
                lot = hash2(key, wz * 4 + dz, 100 + y),
                top = Math.min(y < split ? split : h, y + 1 + Math.floor(lot * 3));
              const tone =
                1 +
                (y < split ? 1 : 0.4) *
                  ((hash2(key, wz * 4 + dz, 300 + y) - 0.5) * ROCK_GRAIN - (lot > 0.9 ? ROCK_NOTCH : 0));
              const base = y < split ? side : dx === 1 ? ROCK_SIDE_HIGH : ROCK_SIDE_HIGH_COOL;
              const px = half ? mx : ax,
                pz = half ? mz : az,
                qx = half ? bx : mx,
                qz = half ? bz : mz,
                lp = y < split ? (half ? lm2 : la2) : 1,
                lq = y < split ? (half ? lb2 : lm2) : 1;
              b.quadAt(
                px,
                y,
                pz,
                qx,
                y,
                qz,
                qx,
                top,
                qz,
                px,
                top,
                pz,
                shade(base, lp * tone),
                shade(base, lq * tone),
                shade(base, lq * tone),
                shade(base, lp * tone),
                dx,
                0,
                dz,
              );
              y = top;
            }
          continue;
        }
        // what the column carries shows its own sides, down to the ground it stands on
        const ground = cover ? Math.max(nh, h - rise) : h;
        if (ground < h)
          on.quadAt(
            ax,
            ground,
            az,
            bx,
            ground,
            bz,
            bx,
            h,
            bz,
            ax,
            h,
            az,
            shade(cover!.side, la * 0.85),
            shade(cover!.side, lb * 0.85),
            shade(cover!.side, lb),
            shade(cover!.side, la),
            dx,
            0,
            dz,
          );
        if (nh < ground)
          b.quadAt(
            ax,
            nh,
            az,
            bx,
            nh,
            bz,
            bx,
            ground,
            bz,
            ax,
            ground,
            az,
            shade(side, la * foot),
            shade(side, lb * foot),
            shade(side, lb),
            shade(side, la),
            dx,
            0,
            dz,
          );
      }
    }
  return b;
}

/**
 * the colour of open water as the picture shows it (the blue of the sea's shelf in sea.ts, as lit); the picture uses
 * it as its backdrop so that mirrored sky leaves the water as it is, and beyond the farthest pieces the backdrop does
 * not stand out against the sea
 */
export const OPEN_WATER = rgb(0x006c96);

/** The water as level sheets. `raised` picks the water above sea level (lakes, rivers) instead of the sea. */
export function buildWater(g: Ground, raised = false, part: Part = whole()): Batch {
  const b = new Batch(),
    ox = g.ox ?? 0,
    oz = g.oz ?? 0;
  const depthAt = (cx: number, cz: number) => {
    let sum = 0,
      n = 0;
    for (let dz = -1; dz <= 0; dz++)
      for (let dx = -1; dx <= 0; dx++) {
        const x = cx + dx,
          z = cz + dz;
        if (x < 0 || z < 0 || x >= N || z >= N) continue;
        sum += g.shore[idx(x, z)];
        n++;
      }
    return n ? sum / n : 14;
  };
  // (a corner of the grid is asked for by the four columns of water around it: its colour is worked out once)
  const shades: RGB[] = new Array((N + 1) * (N + 1));
  const corner = (cx: number, cz: number): RGB => {
    const at = cz * (N + 1) + cx,
      known = shades[at];
    if (known) return known;
    const k = smooth(0.4, 8, depthAt(cx, cz) + (noise2((cx + ox) / 5, (cz + oz) / 5, 41) - 0.5) * 2);
    // the open water is calm: broad, soft patches a little lighter or darker, no strokes
    return (shades[at] = shade(
      mix(WATER_SHALLOW, WATER_DEEP, k),
      0.91 + 0.14 * fbm2((cx + ox) / 14, (cz + oz) / 14, 43) + 0.05 * hash2(cx + ox, cz + oz, 44),
    ));
  };
  for (let z = part.z0; z < part.z1; z++)
    for (let x = part.x0; x < part.x1; x++) {
      const i = idx(x, z),
        y = g.surf[i];
      if (!g.wet[i] || y > SEA_Y + 0.01 !== raised) continue;
      b.quadAt(
        x,
        y,
        z,
        x,
        y,
        z + 1,
        x + 1,
        y,
        z + 1,
        x + 1,
        y,
        z,
        corner(x, z),
        corner(x, z + 1),
        corner(x + 1, z + 1),
        corner(x + 1, z),
        0,
        1,
        0,
      );
      // where raised water meets lower water it falls: a pale sheet down to the lower surface
      if (raised)
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx,
            nz = z + dz,
            low = nx >= 0 && nz >= 0 && nx < N && nz < N && g.wet[idx(nx, nz)] ? g.surf[idx(nx, nz)] : y;
          if (low > y - 0.01) continue;
          const ax = dx === 1 ? x + 1 : x,
            az = dz === 1 ? z + 1 : z,
            bx = dx === -1 ? x : x + 1,
            bz = dz === -1 ? z : z + 1;
          b.quadAt(ax, low, az, bx, low, bz, bx, y, bz, ax, y, az, FALLS, FALLS, FALLS, FALLS, dx, 0, dz);
        }
    }
  return b;
}

/**
 * Open sea far from any coast, for a piece of the world without land: the same water in sheets `step` columns wide.
 * (ox, oz) is the world block of the ground's first column.
 */
export function buildOpenSea(ox: number, oz: number, part: Part, step = 8): Batch {
  const b = new Batch(),
    corner = (x: number, z: number): RGB =>
      shade(WATER_DEEP, 0.91 + 0.14 * fbm2((x + ox) / 14, (z + oz) / 14, 43) + 0.025);
  for (let z = part.z0; z < part.z1; z += step)
    for (let x = part.x0; x < part.x1; x += step) {
      const x1 = Math.min(part.x1, x + step),
        z1 = Math.min(part.z1, z + step);
      b.quadAt(
        x,
        SEA_Y,
        z,
        x,
        SEA_Y,
        z1,
        x1,
        SEA_Y,
        z1,
        x1,
        SEA_Y,
        z,
        corner(x, z),
        corner(x, z1),
        corner(x1, z1),
        corner(x1, z),
        0,
        1,
        0,
      );
    }
  return b;
}
