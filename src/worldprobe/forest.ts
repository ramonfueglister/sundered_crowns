// The forest of a start year, from what was measured and written down (tools/worldprobe/build_forest1291.py: pollen,
// land use and the records): the share of each place's land under trees, and the share of conifers among them. Both
// lie on the grid of the climate layer, one byte per two by two map pixels (about 6 km), 0 … 250 for 0 … 1 and 255
// where nothing is known (the sea, the land outside the world's frame, for the conifers the land the pollen maps do
// not reach). A share that coarse says how much of a landscape is wooded, not where its woods stand: `stand` lays
// them out as woods with open land between, so that the share holds over the landscape.
import { maybeGunzip } from './gunzip';
import { noise2, smooth } from '../lookprobe/batch';

export interface Forest { w: number; h: number; /** share of the land under trees */ share: Uint8Array; /** share of conifers among the trees */ conifers: Uint8Array | null }
/** a byte of the layers: 0 … FULL is a share of 0 … 1, UNKNOWN no value */
const FULL = 250, UNKNOWN = 255;
/** the start years a forest was made for */
const YEARS: ReadonlySet<number> = new Set([1291]);

const loaded = new Map<number, Promise<Forest | null>>();
/** The forest of a start year on a map of mapW × mapH pixels (of the world), once per year; null for a year without one: the woods then stand as the game's layer of 1356 has them. */
export function loadForest(base: string, year: number | undefined, mapW: number, mapH: number): Promise<Forest | null> {
  if (year === undefined || !YEARS.has(year)) return Promise.resolve(null);
  let p = loaded.get(year);
  if (!p) {
    const w = mapW >> 1, h = mapH >> 1;
    const layer = async (name: string) => {
      const r = await fetch(`${base}map/${name}${year}.bin.gz`);
      if (!r.ok) throw new Error(`${name}${year}.bin.gz: HTTP ${r.status}`);
      const bytes = await maybeGunzip(new Uint8Array(await r.arrayBuffer()));
      if (bytes.length !== w * h) throw new Error(`${name}${year}.bin: expected ${w * h} bytes, got ${bytes.length}`);
      return bytes;
    };
    p = Promise.all([layer('forest'), layer('conifer')]).then(([share, conifers]) => ({ w, h, share, conifers }));
    loaded.set(year, p);
  }
  return p;
}

/** A layer's share at map pixel (px, py), between the cells that hold one; null where none of the four round it does. */
function shareAt(f: Forest, layer: Uint8Array, px: number, py: number): number | null {
  const fx = px / 2 - 0.5, fy = Math.max(0, Math.min(f.h - 1, py / 2 - 0.5)), x0 = Math.floor(fx), y0 = Math.min(f.h - 2, Math.floor(fy)), tx = fx - x0, ty = fy - y0;
  let sum = 0, weight = 0;
  for (let k = 0; k < 4; k++) {
    const v = layer[(y0 + (k >> 1)) * f.w + ((((x0 + (k & 1)) % f.w) + f.w) % f.w)], part = (k & 1 ? tx : 1 - tx) * (k >> 1 ? ty : 1 - ty);
    if (v !== UNKNOWN) { sum += v * part; weight += part; }
  }
  return weight > 0 ? sum / weight / FULL : null;
}
/** The share of the land under trees at map pixel (px, py), 0 … 1; null where the forest of the year is not known. */
export const forestAt = (f: Forest, px: number, py: number) => shareAt(f, f.share, px, py);
/** The share of conifers among the trees at map pixel (px, py), 0 … 1; null where it is not known. */
export const conifersAt = (f: Forest, px: number, py: number) => (f.conifers ? shareAt(f, f.conifers, px, py) : null);

/**
 * Woods and the open land between them are about this many data cells across: some 8 km, the fineness of what the
 * layer knows (its land use lies on cells of 9 km). Their edges are frayed, with copses and glades beside them.
 */
export const WOOD = 10;
/** the edge of a wood is this wide, as a share of the smaller of woods and open land */
const EDGE = 0.15;
/** where the woods lie: a field that is the same at every step, 0 … 1 */
const lie = (wx: number, wz: number) => (noise2(wx / WOOD, wz / WOOD, 81) * 4 + noise2(wx / WOOD * 2.3, wz / WOOD * 2.3, 82) * 2 + noise2(wx / WOOD * 5.1, wz / WOOD * 5.1, 83) * 0.5) / 6.5;
/** the share of the land on which `lie` is below k / RANKS: makes of it a rank spread evenly over 0 … 1 */
const RANKS = 512;
let ranks: Float32Array | undefined;
function rankOf(v: number): number {
  if (!ranks) {
    const seen = new Uint32Array(RANKS + 1), side = 400;
    for (let z = 0; z < side; z++) for (let x = 0; x < side; x++) seen[Math.min(RANKS, Math.ceil(lie(x * 0.731 * WOOD, z * 0.731 * WOOD) * RANKS))]++;
    ranks = new Float32Array(RANKS + 1);
    for (let k = 1, below = 0; k <= RANKS; k++) { below += seen[k]; ranks[k] = below / (side * side); }
  }
  const at = Math.max(0, Math.min(1, v)) * RANKS, k = Math.min(RANKS - 1, Math.floor(at));
  return ranks[k] + (ranks[k + 1] - ranks[k]) * (at - k);
}
/** how far the lie of the land moves the woods: on its heights up to this much more of the land is wooded than the share, on its floors as much less (as a share of the smaller of woods and open land) */
const LEAN = 0.7;
/**
 * How far the ground at (wx, wz), counted in data cells, is wooded, 0 … 1, where `share` of the landscape is: 1 inside
 * a wood, 0 on the open land, and between them at a wood's edge. Over a landscape the mean is `share`. `fine` is how
 * far the single woods show, 1 … 0: where a block is as large as a wood, every block carries the share itself.
 * `lean` (-1 … 1, see `leanOf`) is how much more than the land round it the place is one for woods.
 */
export function stand(share: number, wx: number, wz: number, fine = 1, lean = 0): number {
  return laid(share, rankOf(lie(wx, wz)), fine, lean);
}
/**
 * How far the ground at (wx, wz), counted in data cells, is ploughed land, 0 … 1, where `share` of the landscape is:
 * 1 among the fields, 0 off them. The fields lie together as the woods do, and where the woods do not: at the other
 * end of the same lie of the land and on its floors and plains, so that the open grass, the pastures and meadows, is
 * left between the two. Over a landscape the mean is `share`; `fine` and `lean` as for `stand`.
 */
export function tilth(share: number, wx: number, wz: number, fine = 1, lean = 0): number {
  return laid(share, 1 - rankOf(lie(wx, wz)), fine, -lean);
}
/** `share` of the land laid out where its rank is lowest, with a frayed edge */
function laid(share: number, rank: number, fine: number, lean: number): number {
  if (fine <= 0 || share <= 0 || share >= 1) return Math.max(0, Math.min(1, share));
  const here = share + LEAN * lean * Math.min(share, 1 - share), edge = EDGE * Math.min(here, 1 - here);
  return share + (smooth(here + edge, here - edge, rank) - share) * fine;
}

/** heights of a landscape that differ by less than this many metres are a plain: there the lie of the land says little */
const PLAIN = 25;
/**
 * Where in a landscape the woods were left: -1 … 1 for every column of a ground of n × n, from its height against
 * the land within `reach` columns of it. The valley floors and the plains were cleared first and the heights kept
 * their woods (the fine pattern below the layer's cells, which its sources leave open): a column leans to woods the
 * more it stands over the mean of the land round it, measured by how much that land's heights differ. `land` is 1
 * where a column is land; water counts for nothing. Over a landscape the leans even out.
 */
export function leanOf(heights: Float32Array, land: Uint8Array, n: number, reach: number): Float32Array {
  // sums over the rectangle from the corner: of the land's columns, of their heights and of the heights' squares
  const m = n + 1, count = new Float64Array(m * m), sum = new Float64Array(m * m), squares = new Float64Array(m * m);
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const i = z * n + x, k = (z + 1) * m + x + 1, on = land[i] ? 1 : 0, h = on ? heights[i] : 0;
    count[k] = on + count[k - 1] + count[k - m] - count[k - m - 1];
    sum[k] = h + sum[k - 1] + sum[k - m] - sum[k - m - 1];
    squares[k] = h * h + squares[k - 1] + squares[k - m] - squares[k - m - 1];
  }
  const lean = new Float32Array(n * n);
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    if (!land[z * n + x]) continue;
    const x0 = Math.max(0, x - reach), z0 = Math.max(0, z - reach), x1 = Math.min(n, x + reach + 1), z1 = Math.min(n, z + reach + 1);
    const over = (of: Float64Array) => of[z1 * m + x1] - of[z1 * m + x0] - of[z0 * m + x1] + of[z0 * m + x0];
    const c = over(count), mean = over(sum) / c, spread = Math.sqrt(Math.max(0, over(squares) / c - mean * mean));
    lean[z * n + x] = Math.tanh((heights[z * n + x] - mean) / (spread + PLAIN));
  }
  return lean;
}
