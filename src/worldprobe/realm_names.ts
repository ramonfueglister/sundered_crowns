// Where every realm's name is written on the realms' map (paint.ts paints the map, names.ts lays the letters out): along
// a curve through the largest piece of the realm's land, as in a printed atlas, as large as the land's breadth allows.
// Here the piece is found and what round it the name may cross; name_curve.ts finds the curve.
import { nameCurve } from './name_curve';
import { type Realms, distance, placeAt, smoothstep } from './paint';

/**
 * Where a realm's name is written: along a curve through the largest piece of its land, in map pixels. (x, y) is the
 * middle of the curve, `long` and `broad` the piece's length and breadth, `turn` how its long axis lies (radians, 0:
 * west to east). The curve runs from `from` over `bend` (a quadratic Bézier control point) to `to`, west to east;
 * `size` is the height of the letters the piece has room for along it.
 */
export interface RealmName {
  realm: number;
  x: number;
  y: number;
  long: number;
  broad: number;
  turn: number;
  from: [number, number];
  bend: [number, number];
  to: [number, number];
  size: number;
}

/** the bounding box of a piece is padded by this many sampled pixels */
const PAD = 2;
/** an enclave of another realm of no more than this many sampled pixels does not stop a name */
const ENCLAVE = 0;
/** nor does a lake or land without a realm inside it of no more than this many */
const LAKE = 0;
/** a piece less than this many times as long as broad has its name run level (fully from 0.6 more) */
const ROUND = 1.3;

/** `only`: name these realms alone (the others as they were); `cache`: keeps what does not change with the realms
 *  (the place under every sample) from one call to the next. */
export interface NamesOptions {
  only?: ReadonlySet<number>;
  cache?: { key?: string; places?: Int32Array };
}

/** the world's frame in map pixels (extent.ts) */
type Frame = { west: number; east: number; north: number; south: number };

/** The map sampled on every `every`-th map pixel: `w` × `h` samples and the realm under each (`of`, -1: none). */
export interface Samples {
  r: Realms;
  every: number;
  w: number;
  h: number;
  /** whether map pixel (x, y) lies inside the frame (always, without one) */
  shown: (x: number, y: number) => boolean;
  of: Int16Array;
}
/** sums over the samples of a piece of land, for its middle and spread */
interface Spread {
  id: number;
  n: number;
  sx: number;
  sy: number;
  sxx: number;
  syy: number;
  sxy: number;
}
/** The largest piece of a realm's land, in samples: its samples, its middle, its length and breadth as an ellipse of the
 *  same spread, and the way its name would rather run (its long axis, turned level when it is about as broad as long). */
export interface Piece {
  realm: number;
  cells: number[];
  mx: number;
  my: number;
  long: number;
  broad: number;
  prefer: number;
}
/** What of the map round a piece its name may be written over, on the piece's bounding box padded by `pad` samples:
 *  `blocked` is 0 on the piece, 1 outside it, 2 in a hole of it small enough to write over, 3 in a larger hole; `inside`
 *  the squared distance of every point to the nearest point the name may not cross. */
export interface Room {
  bx0: number;
  by0: number;
  bw: number;
  bh: number;
  pad: number;
  blocked: Uint8Array;
  inside: Float32Array;
}

/**
 * The largest connected piece of every realm, measured on every `every`-th map pixel, and the curve its name runs along.
 * With a `frame` (map pixels, see extent.ts), only the land inside it counts: a realm reaching out of the world the game
 * shows has its name written over the part that is shown.
 */
export function realmNames(
  r: Realms,
  every = 4,
  nameOf: (realm: number) => string = () => 'Xxxxxxxx',
  frame?: Frame,
  opts: NamesOptions = {},
): RealmName[] {
  const g = sample(r, every, frame, opts.cache),
    named: RealmName[] = [];
  for (const [realm, { s, cells }] of largestPieces(g, opts.only))
    named.push(nameCurve(g, pieceOf(realm, s, cells), roomOf(g, cells), nameOf(realm)));
  return named;
}

/** The map sampled for the names; the land place under every sample does not change with the realms and is kept in `cache`. */
function sample(r: Realms, every: number, frame: Frame | undefined, cache: NamesOptions['cache']): Samples {
  // over the game map, or over the whole world frame where the rest of the globe has its places
  const W = r.rest ? Math.round(r.rest.w / r.rest.cells) : r.w,
    H = r.rest ? Math.round(r.rest.h / r.rest.cells) : r.h;
  const w = Math.floor(W / every),
    h = Math.floor(H / every),
    lands = r.owner.length,
    of = new Int16Array(w * h);
  const shown = (x: number, y: number) =>
    !frame || (x >= frame.west && x < frame.east && y >= frame.north && y < frame.south);
  // the land place under every sample (-1: none) does not change with the realms: sampled once for a cache
  const key = `${every}|${w}|${h}|${frame ? `${frame.west},${frame.east},${frame.north},${frame.south}` : ''}`;
  let places = cache?.key === key ? cache.places : undefined;
  if (!places) {
    places = new Int32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const place = shown(x * every, y * every) ? placeAt(r, x * every, y * every) : -1;
        places[y * w + x] = place >= 0 && place < lands ? place : -1;
      }
    if (cache) {
      cache.key = key;
      cache.places = places;
    }
  }
  for (let i = 0; i < w * h; i++) {
    const place = places[i];
    of[i] = place >= 0 ? r.owner[place] : -1;
  }
  return { r, every, w, h, shown, of };
}

/** The largest connected piece of every realm (of those in `only`, if given) and its samples, in the order of the map. */
function largestPieces(g: Samples, only: ReadonlySet<number> | undefined): Map<number, { s: Spread; cells: number[] }> {
  const { w, h, of } = g,
    piece = new Int32Array(w * h).fill(-1),
    best = new Map<number, Spread>(),
    stack: number[] = [];
  let pieces = 0;
  for (let start = 0; start < w * h; start++) {
    const o = of[start];
    if (o < 0 || piece[start] >= 0 || (only && !only.has(o))) continue;
    const sum = { id: pieces++, n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0 };
    stack.push(start);
    piece[start] = sum.id;
    while (stack.length) {
      const i = stack.pop()!,
        x = i % w,
        y = (i - x) / w;
      sum.n++;
      sum.sx += x;
      sum.sy += y;
      sum.sxx += x * x;
      sum.syy += y * y;
      sum.sxy += x * y;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
        if (j >= 0 && piece[j] < 0 && of[j] === o) {
          piece[j] = sum.id;
          stack.push(j);
        }
    }
    if (sum.n > (best.get(o)?.n ?? 0)) best.set(o, sum);
  }
  const members = new Map<number, number[]>();
  for (const s of best.values()) members.set(s.id, []);
  for (let i = 0; i < w * h; i++) {
    const m = members.get(piece[i]);
    if (m) m.push(i);
  }
  return new Map([...best].map(([realm, s]) => [realm, { s, cells: members.get(s.id)! }]));
}

function pieceOf(realm: number, s: Spread, cells: number[]): Piece {
  // the piece as an ellipse of the same spread: its long axis is where the name runs
  const mx = s.sx / s.n,
    my = s.sy / s.n,
    a = s.sxx / s.n - mx * mx,
    b = s.sxy / s.n - mx * my,
    c = s.syy / s.n - my * my;
  const mid = (a + c) / 2,
    off = Math.hypot((a - c) / 2, b);
  let turn = 0.5 * Math.atan2(2 * b, a - c);
  // a filled ellipse has a quarter of its half axis squared as its spread
  const long = 4 * Math.sqrt(mid + off),
    broad = 4 * Math.sqrt(Math.max(0.25, mid - off));
  // names read from west to east; one that would stand on end is turned to read downwards
  if (Math.cos(turn) < -1e-9 || (Math.abs(Math.cos(turn)) < 1e-9 && Math.sin(turn) < 0)) turn += Math.PI;
  if (turn > Math.PI) turn -= 2 * Math.PI;
  // a piece about as broad as long has no way of its own: its name runs level, as is easiest to read
  const lean = smoothstep(ROUND, ROUND + 0.6, long / broad);
  return { realm, cells, mx, my, long, broad, prefer: turn * lean };
}

function roomOf(g: Samples, cells: number[]): Room {
  const { w, h, of } = g;
  // the distance of every point of the piece to its outline (Felzenszwalb & Huttenlocher), on its bounding box
  let bx0 = w,
    by0 = h,
    bx1 = 0,
    by1 = 0;
  for (const i of cells) {
    const x = i % w,
      y = (i - x) / w;
    bx0 = Math.min(bx0, x);
    by0 = Math.min(by0, y);
    bx1 = Math.max(bx1, x);
    by1 = Math.max(by1, y);
  }
  const pad = PAD,
    bw = bx1 - bx0 + 1 + 2 * pad,
    bh = by1 - by0 + 1 + 2 * pad,
    outside = new Uint8Array(bw * bh).fill(1);
  for (const i of cells) {
    const x = i % w,
      y = (i - x) / w;
    outside[(y - by0 + pad) * bw + x - bx0 + pad] = 0;
  }
  // lands of others that the piece encloses (enclaves, lakes) do not stop its name: only what reaches its outline does
  const open = new Uint8Array(bw * bh),
    flood: number[] = [];
  for (let x = 0; x < bw; x++) {
    flood.push(x, (bh - 1) * bw + x);
  }
  for (let y = 0; y < bh; y++) {
    flood.push(y * bw, y * bw + bw - 1);
  }
  while (flood.length) {
    const i = flood.pop()!;
    if (open[i] || !outside[i]) continue;
    open[i] = 1;
    const x = i % bw;
    if (x > 0) flood.push(i - 1);
    if (x < bw - 1) flood.push(i + 1);
    if (i >= bw) flood.push(i - bw);
    if (i < (bh - 1) * bw) flood.push(i + bw);
  }
  // what the name may not be written over: everything outside the piece but its lakes, land without a realm that it
  // encloses, and enclaves of others too small to read (a few sampled pixels)
  const blocked = Uint8Array.from(open),
    hole: number[] = [];
  for (let start = 0; start < bw * bh; start++) {
    if (!outside[start] || open[start] || blocked[start] === 2) continue;
    let others = false;
    hole.length = 0;
    hole.push(start);
    blocked[start] = 2;
    for (let k = 0; k < hole.length; k++) {
      const i = hole[k],
        x = i % bw,
        gx = x + bx0 - pad,
        gy = (i - x) / bw + by0 - pad;
      if (gx >= 0 && gy >= 0 && gx < w && gy < h && of[gy * w + gx] >= 0) others = true;
      for (const j of [
        x > 0 ? i - 1 : -1,
        x < bw - 1 ? i + 1 : -1,
        i >= bw ? i - bw : -1,
        i < (bh - 1) * bw ? i + bw : -1,
      ])
        if (j >= 0 && outside[j] && !open[j] && blocked[j] !== 2) {
          blocked[j] = 2;
          hole.push(j);
        }
    }
    if (hole.length > (others ? ENCLAVE : LAKE)) for (const i of hole) blocked[i] = 3;
  }
  const inside = distance(
    Uint8Array.from(blocked, (v) => (v === 1 || v === 3 ? 1 : 0)),
    bw,
    bh,
  );
  return { bx0, by0, bw, bh, pad, blocked, inside };
}
