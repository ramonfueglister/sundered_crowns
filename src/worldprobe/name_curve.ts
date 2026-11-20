// The curve a realm's name runs along through the largest piece of its land (realm_names.ts finds the piece), and the
// largest size at which every letter, laid out as names.ts lays it, stays on the realm.
import { placeAt } from './paint';
import type { Piece, RealmName, Room, Samples } from './realm_names';

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

/** A way through a piece (`along`, radians; u along it, v across it) and in SLICES slices across it the point deepest
 *  inside the piece, on its ridge (the medial axis): how far off the way in `mids`, how deep in `thick`. `span` is how far
 *  the piece reaches along the way from its middle. */
interface Way {
  along: number;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
  span: number;
  mids: number[];
  thick: number[];
}
/** how many letters a name has (3 at least) and how far they reach above and below its curve, in shares of their size */
interface Letters {
  count: number;
  above: number;
  below: number;
}
/** what the search for a name's curve along one way works on */
interface Search {
  g: Samples;
  p: Piece;
  way: Way;
  letters: Letters;
  /** whether a point (in samples) may carry a letter */
  free: (gx: number, gy: number) => boolean;
}
/** the curve found so far and its score (its size, weighed by its way and length) */
interface Best {
  name: RealmName | undefined;
  score: number;
}

/** The curve along which the realm's name `written` is carried largest through its piece (at size 0 when the piece is
 *  too small for any name: names.ts leaves it out). */
export function nameCurve(g: Samples, p: Piece, room: Room, written: string): RealmName {
  // the name runs along the piece's own way, or level, or a little turned from its way: whichever carries it largest
  // (another way than its own a little less willingly)
  const axes = [p.prefer];
  for (const t of [0, p.prefer - AXIS_TURN, p.prefer + AXIS_TURN])
    if (Math.abs(t) < 1.4 && axes.every((q) => Math.abs(q - t) > 0.15)) axes.push(t);
  const letters = lettersOf(written),
    free = freeFor(g, p.realm, room);
  let best: Best = { name: undefined, score: 0 };
  for (const along of axes) {
    const search: Search = { g, p, way: wayThrough(g, p, room, along), letters, free },
      own = (along === p.prefer ? 1 : OTHER_WAY) * (1 - STEEP * Math.sin(along) ** 2);
    best = bestOnWay(search, own, best);
    // a piece too small for any name: its curve across the middle, at no size (names.ts leaves it out)
    if (!best.name && along === p.prefer) best = { name: curveOf(search, 0, SLICES - 1, true).name, score: best.score };
  }
  return best.name!;
}

function wayThrough(g: Samples, p: Piece, room: Room, along: number): Way {
  const { w } = g,
    { cells, mx, my } = p,
    { bx0, by0, bw, pad, inside } = room;
  const ux = Math.cos(along),
    uy = Math.sin(along),
    vx = -uy,
    vy = ux;
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
  return { along, ux, uy, vx, vy, span, mids, thick };
}

function lettersOf(written: string): Letters {
  return {
    count: Math.max(3, [...written].length),
    above: [...written].some((c) => MARKED_CAPITAL.test(c) && c === c.toUpperCase() && c !== c.toLowerCase())
      ? ABOVE_MARKED
      : ABOVE,
    below: DESCENDING.test(written) ? BELOW_DESCENDING : BELOW,
  };
}

/** whether a point (in samples) may carry a letter of the realm's name; tested on the map itself, not on its samples:
 *  a point of the realm's own land, or of a hole in it small enough to write over */
function freeFor(g: Samples, realm: number, room: Room): (gx: number, gy: number) => boolean {
  const { r, every, shown } = g,
    { bx0, by0, bw, bh, pad, blocked } = room,
    lands = r.owner.length;
  return (gx: number, gy: number) => {
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
}

/**
 * The stretch of slices on a way and the curve through it where the name can be written largest with every letter on
 * the realm, if it beats `best`: the letters are placed as names.ts places them (spread from the middle of the curve,
 * `NAME_FILL` of it at most, `NAME_ASPECT` wide for their height) and each is tested, across its whole height, against
 * the piece itself. `own` weighs the way.
 */
function bestOnWay(search: Search, own: number, best: Best): Best {
  const { span, thick } = search.way,
    letters = search.letters.count;
  let pick = best.name,
    score = best.score;
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
      const c = curveOf(search, i, j, straight, score / own / (1 + LONGER * (j - i))),
        sc = c.size * own * (1 + LONGER * (j - i));
      if (sc > score) {
        score = sc;
        pick = c.name;
      }
    }
  }
  return { name: pick, score };
}

/** the name's curve through slices `first` … `last` (straight: no bend) and the largest size its letters all keep to the land at */
function curveOf(
  search: Search,
  first: number,
  last: number,
  straight: boolean,
  need = 0,
): { name: RealmName; size: number } {
  const { every } = search.g,
    { realm, mx, my, long, broad } = search.p,
    { along, ux, uy, vx, vy, span, mids, thick } = search.way,
    { count: letters, above, below } = search.letters,
    free = search.free,
    step = STEP_PX / every;
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
