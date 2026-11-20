// Where every realm's name is written on the realms' map (paint.ts paints the map, names.ts lays the letters out): along
// a curve through the largest piece of the realm's land, as in a printed atlas, as large as the land's breadth allows.
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

/** slices along a piece of land, of which the curve is fitted through the middles */
const SLICES = 24;
/** as names.ts lays them, a name fills at most this share of its curve, its letters this wide for their height, standing no further apart than this many times their height */
const NAME_FILL = 0.84,
  NAME_ASPECT = 0.46,
  SPREAD_MOST = 0.9;
/**
 * How far the letters reach from the curve they are centred on, in shares of their size, as measured on EB Garamond 500
 * in the browser: capitals, ascenders and small letters with marks 0.35 above, accented capitals 0.52; the baseline
 * 0.34 below, descenders 0.54. Each with a little room more; the ends are kept this share of the size off.
 */
const ABOVE = 0.38,
  ABOVE_MARKED = 0.56,
  BELOW = 0.37,
  BELOW_DESCENDING = 0.57,
  MARGIN = 0.1;
/** capitals with a mark over them, and letters reaching below the baseline */
const MARKED_CAPITAL = /[\u00C0-\u00DD\u0100-\u017F]/u,
  DESCENDING = /[gjpqyçQŞşŢţȘșȚțąęįųĄĘĮŲ,;ƒ]/u;
/** the letters are tested this many map pixels apart */
const STEP_PX = 1.5;
/** no name is taller than this share of the land's breadth where it runs */
const SIZE_OVER = 0.7;
/** a little in favour of the longer stretch, so that a name is spread as on a map rather than squeezed */
const LONGER = 0.012;
/** besides its own way, a name may run level or this far turned from it (radians), carried that way only if this much larger */
const AXIS_TURN = 0.4,
  OTHER_WAY = 0.92;
/** a steep name reads worse than a level one: it is carried that way only if larger by this share of its steepness (sine squared) */
const STEEP = 0.3;
/** a name bends no further than this share of its length */
const BEND_MOST = 0.16,
  TILT_MOST = 0.3;
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

/**
 * The largest connected piece of every realm, measured on every `every`-th map pixel, and the curve its name runs along.
 * With a `frame` (map pixels, see extent.ts), only the land inside it counts: a realm reaching out of the world the game
 * shows has its name written over the part that is shown.
 */
export function realmNames(
  r: Realms,
  every = 4,
  nameOf: (realm: number) => string = () => 'Xxxxxxxx',
  frame?: { west: number; east: number; north: number; south: number },
  opts: NamesOptions = {},
): RealmName[] {
  // over the game map, or over the whole world frame where the rest of the globe has its places
  const W = r.rest ? Math.round(r.rest.w / r.rest.cells) : r.w,
    H = r.rest ? Math.round(r.rest.h / r.rest.cells) : r.h;
  const w = Math.floor(W / every),
    h = Math.floor(H / every),
    lands = r.owner.length,
    of = new Int16Array(w * h),
    piece = new Int32Array(w * h).fill(-1);
  const shown = (x: number, y: number) =>
    !frame || (x >= frame.west && x < frame.east && y >= frame.north && y < frame.south);
  // the land place under every sample (-1: none) does not change with the realms: sampled once for a cache
  const cache = opts.cache,
    key = `${every}|${w}|${h}|${frame ? `${frame.west},${frame.east},${frame.north},${frame.south}` : ''}`;
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
  const only = opts.only;
  const best = new Map<
      number,
      { id: number; n: number; sx: number; sy: number; sxx: number; syy: number; sxy: number }
    >(),
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
  const named: RealmName[] = [];
  const members = new Map<number, number[]>();
  for (const s of best.values()) members.set(s.id, []);
  for (let i = 0; i < w * h; i++) {
    const m = members.get(piece[i]);
    if (m) m.push(i);
  }
  for (const [realm, s] of best) {
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
    const lean = smoothstep(ROUND, ROUND + 0.6, long / broad),
      prefer = turn * lean;
    // the distance of every point of the piece to its outline (Felzenszwalb & Huttenlocher), on its bounding box
    const cells = members.get(s.id)!;
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
    // the name runs along the piece's own way, or level, or a little turned from its way: whichever carries it largest
    // (another way than its own a little less willingly)
    const axes = [prefer];
    for (const t of [0, prefer - AXIS_TURN, prefer + AXIS_TURN])
      if (Math.abs(t) < 1.4 && axes.every((q) => Math.abs(q - t) > 0.15)) axes.push(t);
    const written = nameOf(realm),
      letters = Math.max(3, [...written].length);
    const above = [...written].some((c) => MARKED_CAPITAL.test(c) && c === c.toUpperCase() && c !== c.toLowerCase())
        ? ABOVE_MARKED
        : ABOVE,
      below = DESCENDING.test(written) ? BELOW_DESCENDING : BELOW;
    const step = STEP_PX / every;
    let pick: RealmName | undefined,
      score = 0;
    for (const along of axes) {
      const ux = Math.cos(along),
        uy = Math.sin(along),
        vx = -uy,
        vy = ux,
        own = (along === prefer ? 1 : OTHER_WAY) * (1 - STEEP * Math.sin(along) ** 2);
      let span = 1;
      for (const i of cells) {
        const x = (i % w) - mx,
          y = (i - (i % w)) / w - my;
        span = Math.max(span, Math.abs(x * ux + y * uy) + 1);
      }
      // slices across the long axis: in each, the point deepest inside the piece (on its ridge, the medial axis) and its depth
      const mids = new Array<number>(SLICES).fill(0),
        thick = new Array<number>(SLICES).fill(0);
      for (const i of cells) {
        const x = i % w,
          y = (i - x) / w,
          dx = x - mx,
          dy = y - my,
          a = dx * ux + dy * uy;
        const k = Math.max(0, Math.min(SLICES - 1, Math.floor(((a + span) / (2 * span)) * SLICES)));
        const deep = 2 * Math.sqrt(inside[(y - by0 + pad) * bw + x - bx0 + pad]);
        if (deep > thick[k]) {
          thick[k] = deep;
          mids[k] = dx * vx + dy * vy;
        }
      }
      // the stretch of slices and the curve through it where the name can be written largest with every letter on the
      // realm: the letters are placed as names.ts places them (spread from the middle of the curve, `NAME_FILL` of it at
      // most, `NAME_ASPECT` wide for their height) and each is tested, across its whole height, against the piece itself
      // tested on the map itself, not on its samples: a point of the realm's own land, or of a hole in it small enough to write over
      const free = (gx: number, gy: number) => {
        const x = Math.round(gx) - bx0 + pad,
          y = Math.round(gy) - by0 + pad;
        if (x < 0 || y < 0 || x >= bw || y >= bh) return false;
        const mx0 = Math.floor((gx + 0.5) * every),
          my0 = Math.floor((gy + 0.5) * every);
        if (!shown(mx0, my0)) return false;
        const place = placeAt(r, mx0, my0),
          own = place >= 0 && place < lands ? r.owner[place] : -1;
        return own === realm ? blocked[y * bw + x] !== 1 && blocked[y * bw + x] !== 3 : blocked[y * bw + x] === 2;
      };
      /** the name's curve through slices `first` … `last` (straight: no bend) and the largest size its letters all keep to the land at */
      const curveOf = (first: number, last: number, straight: boolean, need = 0): { name: RealmName; size: number } => {
        const pts: [number, number, number][] = [];
        for (let k = first; k <= last; k++)
          if (thick[k] > 0) pts.push([((k + 0.5) / SLICES) * 2 * span - span, mids[k], thick[k]]);
        const t0 = (first / SLICES) * 2 * span - span,
          t1 = ((last + 1) / SLICES) * 2 * span - span;
        const [q0, q1, q2] = fitQuadratic(pts);
        const len = t1 - t0,
          tm = (t0 + t1) / 2;
        const f = (t: number) => q0 + q1 * t + q2 * t * t;
        let e0 = f(t0),
          e1 = f(t1),
          em = f(tm);
        // it leans off the realm's way by no more than a share of its length, and bends no further than another
        const tilt = Math.max(-TILT_MOST * len, Math.min(TILT_MOST * len, e1 - e0)),
          mid0 = (e0 + e1) / 2;
        e0 = mid0 - tilt / 2;
        e1 = mid0 + tilt / 2;
        const sag = straight ? 0 : em - (e0 + e1) / 2,
          capped = Math.max(-BEND_MOST * len, Math.min(BEND_MOST * len, sag));
        em = (e0 + e1) / 2 + capped;
        // the quadratic Bézier through both ends and the middle has this control point
        const ctrl = 2 * em - (e0 + e1) / 2;
        const local = (q: number): [number, number] => {
          const t = t0 + (t1 - t0) * q,
            off = (1 - q) ** 2 * e0 + 2 * (1 - q) * q * ctrl + q * q * e1;
          return [mx + ux * t + vx * off, my + uy * t + vy * off];
        };
        const at = (t: number, off: number): [number, number] => [
          (mx + ux * t + vx * off + 0.5) * every,
          (my + uy * t + vy * off + 0.5) * every,
        ];
        const name = {
          realm,
          ...pointOf(at(tm, em)),
          long: long * every,
          broad: broad * every,
          turn: along,
          from: at(t0, e0),
          bend: at(tm, ctrl),
          to: at(t1, e1),
          size: 0,
        };
        // the curve as names.ts measures it (8 chords), and finer for walking along it
        let chord = 0;
        for (let k = 1; k <= 8; k++) {
          const p = local((k - 1) / 8),
            q = local(k / 8);
          chord += Math.hypot(q[0] - p[0], q[1] - p[1]);
        }
        const STEPS = 48,
          walk: [number, number, number][] = [[...local(0), 0]];
        for (let k = 1; k <= STEPS; k++) {
          const p = local(k / STEPS),
            q = walk[k - 1];
          walk.push([p[0], p[1], q[2] + Math.hypot(p[0] - q[0], p[1] - q[1])]);
        }
        const total = walk[STEPS][2];
        const pointAt = (s: number): [number, number, number, number] => {
          s = Math.max(0, Math.min(total, s));
          let k = 1;
          while (k < STEPS && walk[k][2] < s) k++;
          const a = walk[k - 1],
            b = walk[k],
            d = b[2] - a[2] || 1e-9,
            u = (s - a[2]) / d,
            tx = (b[0] - a[0]) / d,
            ty = (b[1] - a[1]) / d;
          return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, -ty, tx];
        };
        const span0 = chord * NAME_FILL,
          most = Math.min(SIZE_OVER * Math.max(...thick.slice(first, last + 1)), span0 / (letters * NAME_ASPECT));
        /** whether every letter at this size lies on the piece, from its top to its lowest reach (towards the curve's right, down the page) */
        const fits = (size: number) => {
          const spread = Math.min(span0, letters * size * (NAME_ASPECT + SPREAD_MOST)),
            from = total / 2 - spread / 2 - size * MARGIN,
            to = total / 2 + spread / 2 + size * MARGIN;
          const top = -size * above - step / 2,
            bottom = size * below + step / 2,
            across = Math.max(2, Math.ceil((bottom - top) / step)),
            along = Math.max(2, Math.ceil((to - from) / step));
          for (let i = 0; i <= along; i++) {
            const [px, py, nx, ny] = pointAt(from + ((to - from) * i) / along);
            for (let j = 0; j <= across; j++) {
              const o = top + ((bottom - top) * j) / across;
              if (!free(px + nx * o, py + ny * o)) return false;
            }
          }
          return true;
        };
        // (a curve that cannot carry the name at `need` is not measured further)
        const least = Math.max(Math.min(most, 0.25), need);
        if (!(most > least) || !fits(least)) return { name, size: 0 };
        let lo = least,
          hi = most;
        if (fits(hi)) lo = hi;
        else
          for (let k = 0; k < 10 && hi - lo > 0.02 * hi; k++) {
            const m = (lo + hi) / 2;
            if (fits(m)) lo = m;
            else hi = m;
          }
        name.size = lo * every;
        return { name, size: lo };
      };
      // every stretch, largest first by what its depth and length would allow; one that cannot beat the best found is skipped
      const width = (2 * span) / SLICES,
        tries: [number, number, number][] = [];
      for (let i = 0; i < SLICES; i++)
        for (let j = i; j < SLICES; j++) {
          let top = 0;
          for (let k = i; k <= j; k++) top = Math.max(top, thick[k]);
          if (top > 0)
            tries.push([
              i,
              j,
              Math.min(SIZE_OVER * top, ((j - i + 1) * width * NAME_FILL * 1.2) / (letters * NAME_ASPECT)) *
                (1 + LONGER * (j - i)),
            ]);
        }
      tries.sort((p, q) => q[2] - p[2]);
      for (const [i, j, bound] of tries) {
        if (bound * own <= score) break;
        for (const straight of [false, true]) {
          const c = curveOf(i, j, straight, score / own / (1 + LONGER * (j - i))),
            sc = c.size * own * (1 + LONGER * (j - i));
          if (sc > score) {
            score = sc;
            pick = c.name;
          }
        }
      }
      // a piece too small for any name: its curve across the middle, at no size (names.ts leaves it out)
      if (!pick && along === prefer) pick = curveOf(0, SLICES - 1, true).name;
    }
    named.push(pick!);
  }
  return named;
}
const pointOf = ([x, y]: [number, number]) => ({ x, y });

/** a + b t + c t², fitted by weighted least squares to points (t, value, weight) */
function fitQuadratic(pts: [number, number, number][]): [number, number, number] {
  if (pts.length === 0) return [0, 0, 0];
  if (pts.length < 3) {
    const m = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return [m, 0, 0];
  }
  const S = [0, 0, 0, 0, 0],
    T = [0, 0, 0];
  for (const [t, v, wt] of pts) {
    let p = wt;
    for (let k = 0; k < 5; k++) {
      S[k] += p;
      if (k < 3) T[k] += p * v;
      p *= t;
    }
  }
  // normal equations, solved by Cramer's rule
  const M = [
      [S[0], S[1], S[2]],
      [S[1], S[2], S[3]],
      [S[2], S[3], S[4]],
    ],
    det = (m: number[][]) =>
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M);
  if (Math.abs(D) < 1e-12) {
    const m = T[0] / S[0];
    return [m, 0, 0];
  }
  const col = (k: number) => M.map((row, i) => row.map((v, j) => (j === k ? T[i] : v)));
  return [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D];
}
