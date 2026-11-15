// The realms' map (realms.ts) in the look of a printed atlas: the sea slate blue with a lighter shallow along the
// coasts, land without a realm sand, every realm in a muted colour of its own that deepens towards its borders, thin
// dark lines between realms, and a faint grain of paper over it all. Every realm's name is written along a curve
// through the largest piece of its land (names.ts writes it).
//
// The look follows the reference of the EU5 atlas (project files karte/referenz-eu5): colours measured there, see
// docs/map/political-map.md. Distances to borders and coasts are exact Euclidean distance transforms (Felzenszwalb &
// Huttenlocher 2012, "Distance Transforms of Sampled Functions") over the dots of a tile and a margin around it, so
// the shading runs on unbroken from one tile to the next.
import type { RGB } from '../lookprobe/batch';

/** The realms on the map: `ids` holds the place of every map pixel, counted from 1 (land places first: `owner` has one entry each, -1 for no realm; then the sea zones). */
export interface Realms { ids: Uint16Array; w: number; h: number; owner: ArrayLike<number>; /** linear colour of every realm */ colors: readonly RGB[]; /** the place that is picked out, counted from 0 (none: -1 or left out) */ chosen?: number }

// ---------------------------------------------------------------- colours (sRGB 0 … 255 as measured, used linear)
/** the sea, and the shallow along the coasts (EU5 atlas: open sea 83,114,135; the shallow ~ 112,140,156) */
const SEA = lin([79, 109, 131]), SHALLOW = lin([116, 145, 161]), ZONE_LINE = lin([66, 92, 112]);
/** land that no realm holds */
const SAND = lin([166, 152, 132]);
/** the lines: between realms (their colour darkened this far), at the coast (land side), between sea zones */
const LINE_DARK = 0.42, COAST_DARK = 0.7, SEA_ZONE_LINE = 0.5;
/** a realm's colour on the map: lightness and chroma (OKLCH) are held in the atlas' muted band */
const L_LOW = 0.42, L_HIGH = 0.7, C_MOST = 0.115;
/** as in the atlas, a realm is paler inside (lighter, less chroma) and its own colour glows strongest along its border */
const INNER_LIGHT = 0.035, INNER_CHROMA = 0.7, RIM_DARK = 0.05, RIM_CHROMA = 1.35;
/** the place picked out: its colour lightened this far towards white, inside a line of this colour */
const CHOSEN_LIGHT = 0.45, CHOSEN_LINE: RGB = [1, 0.86, 0.5];
/** how strongly the map covers the world below it: a trace of the relief shows through */
const COVER = 0.93;

// ---------------------------------------------------------------- sizes, in map pixels unless said
/** the shading inside a realm reaches this far from its border; the shallow this far out to sea */
const RIM = 14, SHALLOW_REACH = 9;
/** lines are this many dots wide, whatever the scale */
const LINE = 1.1;
/** the paper's grain: its size and strength */
const GRAIN = 3, GRAIN_STRENGTH = 0.035;

/** what lies at a dot: a realm (≥ 0), land without a realm, water, or nothing (beyond the map) */
const NONE = -1, WATER = -2, OUTSIDE = -3;

/**
 * The realms of the tile (tx, ty) of `level` of a map with `cells` finest cells per map pixel, `side` dots wide: per
 * dot the colour times its cover, and the cover (so that the dots blend cleanly), in linear light.
 */
export function paintRealms(r: Realms, level: number, tx: number, ty: number, side: number, cells: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(side * side * 4), perDot = 2 ** level / cells, lands = r.owner.length, chosen = r.chosen ?? -1;
  // a margin of dots around the tile, wide enough for the shading, so that a dot's distances are those of the whole map
  const reach = Math.max(RIM, SHALLOW_REACH * 3) / perDot, margin = Math.min(96, Math.ceil(reach) + 2), n = side + 2 * margin;
  const kind = new Int16Array(n * n), place = new Int32Array(n * n);
  for (let y = 0; y < n; y++) {
    const my = Math.floor((ty * side + y - margin + 0.5) * perDot);
    for (let x = 0; x < n; x++) {
      const mx = Math.floor((tx * side + x - margin + 0.5) * perDot), i = y * n + x;
      if (mx < 0 || my < 0 || mx >= r.w || my >= r.h) { kind[i] = OUTSIDE; place[i] = -1; continue; }
      const at = r.ids[my * r.w + mx] - 1;
      place[i] = at;
      kind[i] = at < 0 || at >= lands ? WATER : r.owner[at] >= 0 ? r.owner[at] : NONE;
    }
  }
  // the dots at a border: land whose neighbour is other land of another holder; at a coast: land or water next to the other
  const border = new Uint8Array(n * n), coast = new Uint8Array(n * n), zone = new Uint8Array(n * n), mine = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, k = kind[i];
    if (k === OUTSIDE) continue;
    for (const j of [x > 0 ? i - 1 : -1, x < n - 1 ? i + 1 : -1, y > 0 ? i - n : -1, y < n - 1 ? i + n : -1]) {
      if (j < 0) continue;
      const o = kind[j];
      if (o === OUTSIDE) continue;
      if (k !== WATER && o !== WATER && o !== k) border[i] = 1;
      if ((k === WATER) !== (o === WATER)) coast[i] = 1;
      if (k === WATER && o === WATER && place[j] !== place[i]) zone[i] = 1;
      if (chosen >= 0 && place[i] === chosen && place[j] !== chosen) mine[i] = 1;
    }
  }
  const toBorder = distance(border, n), toCoast = distance(coast, n);
  const toZone = perDot < 2 ? distance(zone, n) : null;

  // every realm's colour on the map, and its colour at the border, once
  const styled = new Map<number, [RGB, RGB]>();
  const styleOf = (k: number) => { let s = styled.get(k); if (!s) { s = mapColours(r.colors[k] ?? [0.5, 0.5, 0.5]); styled.set(k, s); } return s; };
  const rim = Math.max(3, RIM / perDot), shallow = Math.max(1.5, SHALLOW_REACH / perDot);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const i = (y + margin) * n + x + margin, k = kind[i], o = (y * side + x) * 4;
    if (k === OUTSIDE) continue;
    const mx = (tx * side + x + 0.5) * perDot, my = (ty * side + y + 0.5) * perDot;
    let c: RGB;
    if (k === WATER) {
      // the shallow along the coast fades into the open sea
      const d = Math.sqrt(toCoast[i]), s = Math.exp(-((d / shallow) ** 1.5));
      c = mix(SEA, SHALLOW, s);
      if (toZone) c = mix(c, ZONE_LINE, SEA_ZONE_LINE * line(Math.sqrt(toZone[i]), LINE));
    } else {
      const d = Math.sqrt(toBorder[i]), t = Math.min(1, d / rim) ** 0.7;
      if (k === NONE) c = SAND;
      else { const [inner, edge] = styleOf(k); c = mix(edge, inner, t); }
      // the line between holders, and a soft darker coastline on the land's side
      c = mix(c, scale(c, LINE_DARK), line(d, LINE));
      c = mix(c, scale(c, COAST_DARK), 0.6 * line(Math.sqrt(toCoast[i]), LINE));
    }
    if (chosen >= 0 && place[i] === chosen) {
      c = mine[i] || near(mine, i, n) ? CHOSEN_LINE : mix(c, [1, 1, 1], CHOSEN_LIGHT);
    }
    const g = 1 + GRAIN_STRENGTH * grain(mx / GRAIN, my / GRAIN), a = COVER;
    out[o] = toByte(Math.min(1, c[0] * g) * a); out[o + 1] = toByte(Math.min(1, c[1] * g) * a); out[o + 2] = toByte(Math.min(1, c[2] * g) * a); out[o + 3] = Math.round(a * 255);
  }
  return out;
}

/** whether a dot touches one of the marked ones (so that the line round the picked place is two dots wide) */
const near = (marked: Uint8Array, i: number, n: number) => marked[i - 1] === 1 || marked[i + 1] === 1 || marked[i - n] === 1 || marked[i + n] === 1;

/**
 * A realm's colour on the map, inside and at its border, from the colour it was given (linear): in OKLCH its
 * lightness is held in the atlas' band and its chroma capped (the colours of 1356 are chosen inside it: tools/map/palette.py), so that every realm sits in the same muted key.
 */
export function mapColours(c: RGB): [RGB, RGB] {
  const [L, a, b] = toOklab(c), C = Math.hypot(a, b), h = Math.atan2(b, a);
  const Lm = Math.max(L_LOW, Math.min(L_HIGH, L)), Cm = Math.min(C_MOST, C);
  const Ci = Cm * INNER_CHROMA, inner = fromOklab([Lm + INNER_LIGHT, Ci * Math.cos(h), Ci * Math.sin(h)]);
  const Ce = Math.min(C_MOST * 1.3, Cm * RIM_CHROMA), edge = fromOklab([Lm - RIM_DARK, Ce * Math.cos(h), Ce * Math.sin(h)]);
  return [inner, edge];
}

// ---------------------------------------------------------------- distance transform
/**
 * The squared Euclidean distance of every dot of an n × rows grid to the nearest marked dot (Felzenszwalb & Huttenlocher):
 * a 1-D lower envelope of parabolas along the rows, then along the columns.
 */
export function distance(marked: Uint8Array, n: number, rows = n): Float32Array {
  const BIG = 1e10, most = Math.max(n, rows), f = new Float32Array(n * rows), line = new Float64Array(most), d = new Float64Array(most), v = new Int32Array(most), z = new Float64Array(most + 1);
  for (let i = 0; i < n * rows; i++) f[i] = marked[i] ? 0 : BIG;
  const pass = (start: number, stride: number, n: number) => {
    for (let q = 0; q < n; q++) line[q] = f[start + q * stride];
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let s = (line[q] + q * q - (line[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = (line[q] + q * q - (line[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + line[v[k]]; }
    for (let q = 0; q < n; q++) f[start + q * stride] = Math.min(BIG, d[q]);
  };
  for (let y = 0; y < rows; y++) pass(y * n, 1, n);
  for (let x = 0; x < n; x++) pass(x, n, rows);
  return f;
}

// ---------------------------------------------------------------- small helpers
function lin(c: readonly [number, number, number]): RGB { const f = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return [f(c[0]), f(c[1]), f(c[2])]; }
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a: RGB, s: number): RGB => [a[0] * s, a[1] * s, a[2] * s];
const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** how much of a line `width` dots wide covers a dot at distance d (dots) from its middle, antialiased */
const line = (d: number, width: number) => Math.max(0, Math.min(1, width / 2 + 0.5 - d));
const toByte = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
/** value noise -1 … 1 on the map, smooth between whole coordinates */
function grain(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) => { let s = Math.imul(a, 374761393) ^ Math.imul(b, 668265263); s = Math.imul(s ^ (s >>> 13), 1274126177); return ((s ^ (s >>> 16)) >>> 0) / 2147483648 - 1; };
  const top = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * sx, bottom = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * sx;
  return top + (bottom - top) * sy;
}
/** OKLab (Ottosson 2020) from and to linear sRGB */
function toOklab([r, g, b]: RGB): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab([L, a, b]: [number, number, number]): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const c = (v: number) => Math.max(0, Math.min(1, v));
  return [c(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), c(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), c(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}

// ---------------------------------------------------------------- names
/**
 * Where a realm's name is written: along a curve through the largest piece of its land, in map pixels. (x, y) is the
 * middle of the curve, `long` and `broad` the piece's length and breadth, `turn` how its long axis lies (radians, 0:
 * west to east). The curve runs from `from` over `bend` (a quadratic Bézier control point) to `to`, west to east;
 * `size` is the height of the letters the piece has room for along it.
 */
export interface RealmName {
  realm: number; x: number; y: number; long: number; broad: number; turn: number;
  from: [number, number]; bend: [number, number]; to: [number, number]; size: number;
}

/** slices along a piece of land, of which the curve is fitted through the middles */
const SLICES = 24;
/** the letters fill this share of the depth of the land; as names.ts lays them, a name fills this share of its curve, its letters this wide for their height */
const FILL = 0.62, NAME_FILL = 0.84, NAME_ASPECT = 0.5;
/** a name bends no further than this share of its length */
const BEND_MOST = 0.16, TILT_MOST = 0.3;
/** a piece less than this many times as long as broad has its name run level (fully from 0.6 more) */
const ROUND = 1.3;

/** The largest connected piece of every realm, measured on every `every`-th map pixel, and the curve its name runs along. */
export function realmNames(r: Realms, every = 4, lettersOf: (realm: number) => number = () => 8): RealmName[] {
  const w = Math.floor(r.w / every), h = Math.floor(r.h / every), lands = r.owner.length, of = new Int16Array(w * h), piece = new Int32Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const place = r.ids[y * every * r.w + x * every] - 1; of[y * w + x] = place >= 0 && place < lands ? r.owner[place] : -1; }
  const best = new Map<number, { id: number; n: number; sx: number; sy: number; sxx: number; syy: number; sxy: number }>(), stack: number[] = [];
  let pieces = 0;
  for (let start = 0; start < w * h; start++) {
    const o = of[start];
    if (o < 0 || piece[start] >= 0) continue;
    const sum = { id: pieces++, n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0 };
    stack.push(start); piece[start] = sum.id;
    while (stack.length) {
      const i = stack.pop()!, x = i % w, y = (i - x) / w;
      sum.n++; sum.sx += x; sum.sy += y; sum.sxx += x * x; sum.syy += y * y; sum.sxy += x * y;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && piece[j] < 0 && of[j] === o) { piece[j] = sum.id; stack.push(j); }
    }
    if (sum.n > (best.get(o)?.n ?? 0)) best.set(o, sum);
  }
  const named: RealmName[] = [];
  const members = new Map<number, number[]>();
  for (const s of best.values()) members.set(s.id, []);
  for (let i = 0; i < w * h; i++) { const m = members.get(piece[i]); if (m) m.push(i); }
  for (const [realm, s] of best) {
    // the piece as an ellipse of the same spread: its long axis is where the name runs
    const mx = s.sx / s.n, my = s.sy / s.n, a = s.sxx / s.n - mx * mx, b = s.sxy / s.n - mx * my, c = s.syy / s.n - my * my;
    const mid = (a + c) / 2, off = Math.hypot((a - c) / 2, b);
    let turn = 0.5 * Math.atan2(2 * b, a - c);
    // a filled ellipse has a quarter of its half axis squared as its spread
    const long = 4 * Math.sqrt(mid + off), broad = 4 * Math.sqrt(Math.max(0.25, mid - off));
    // names read from west to east; one that would stand on end is turned to read downwards
    if (Math.cos(turn) < -1e-9 || (Math.abs(Math.cos(turn)) < 1e-9 && Math.sin(turn) < 0)) turn += Math.PI;
    if (turn > Math.PI) turn -= 2 * Math.PI;
    // a piece about as broad as long has no way of its own: its name runs level, as is easiest to read
    const lean = smoothstep(ROUND, ROUND + 0.6, long / broad), along = turn * lean;
    const ux = Math.cos(along), uy = Math.sin(along), vx = -uy, vy = ux;
    let span = 1;
    for (const i of members.get(s.id)!) { const x = i % w - mx, y = (i - (i % w)) / w - my; span = Math.max(span, Math.abs(x * ux + y * uy) + 1); }
    // the distance of every point of the piece to its outline (Felzenszwalb & Huttenlocher), on its bounding box
    const cells = members.get(s.id)!;
    let bx0 = w, by0 = h, bx1 = 0, by1 = 0;
    for (const i of cells) { const x = i % w, y = (i - x) / w; bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
    const bw = bx1 - bx0 + 3, bh = by1 - by0 + 3, outside = new Uint8Array(bw * bh).fill(1);
    for (const i of cells) { const x = i % w, y = (i - x) / w; outside[(y - by0 + 1) * bw + x - bx0 + 1] = 0; }
    const inside = distance(outside, bw, bh);
    // slices across the long axis: in each, the point deepest inside the piece (on its ridge, the medial axis) and its depth
    const width = (2 * span) / SLICES, mids = new Array<number>(SLICES).fill(0), thick = new Array<number>(SLICES).fill(0);
    for (const i of cells) {
      const x = i % w, y = (i - x) / w, dx = x - mx, dy = y - my, a = dx * ux + dy * uy;
      const k = Math.max(0, Math.min(SLICES - 1, Math.floor(((a + span) / (2 * span)) * SLICES)));
      const deep = 2 * Math.sqrt(inside[(y - by0 + 1) * bw + x - bx0 + 1]);
      if (deep > thick[k]) { thick[k] = deep; mids[k] = dx * vx + dy * vy; }
    }
    // the stretch of slices where the name can be written largest: as tall as the stretch is deep at its shallowest, and
    // no taller than its length allows for the letters (a name across a narrow neck is moved to the broad part beside it)
    const letters = Math.max(3, lettersOf(realm)), sizeIn = (i: number, j: number) => {
      // the depth of the stretch: mostly its shallowest, partly its mean (letters may reach over a bay or a neck)
      let low = Infinity, sum = 0;
      for (let k = i; k <= j; k++) { low = Math.min(low, thick[k]); sum += thick[k]; }
      return Math.min((0.6 * low + (0.4 * sum) / (j - i + 1)) * FILL, ((j - i + 1) * width * NAME_FILL) / (letters * NAME_ASPECT));
    };
    let first = 0, last = SLICES - 1, bestSize = -1;
    for (let i = 0; i < SLICES; i++) for (let j = i; j < SLICES; j++) {
      // a little in favour of the longer stretch, so that the name is spread as on a map rather than squeezed
      const sz = sizeIn(i, j) * (1 + 0.015 * (j - i));
      if (sz > bestSize) { bestSize = sz; first = i; last = j; }
    }
    // the curve, fitted to the ridge of the stretch; where it would leave the land, the stretch is narrowed round its
    // deepest slice until the name lies on the realm
    /** the name's curve through slices `first` … `last` (straight: no bend), and whether it keeps to the land */
    const curveOf = (first: number, last: number, straight: boolean): { name: RealmName; fits: boolean } => {
      const pts: [number, number, number][] = [];
      for (let k = first; k <= last; k++) if (thick[k] > 0) pts.push([((k + 0.5) / SLICES) * 2 * span - span, mids[k], thick[k]]);
      const t0 = (first / SLICES) * 2 * span - span, t1 = ((last + 1) / SLICES) * 2 * span - span;
      const [q0, q1, q2] = fitQuadratic(pts);
      const len = t1 - t0, tm = (t0 + t1) / 2;
      const f = (t: number) => q0 + q1 * t + q2 * t * t;
      let e0 = f(t0), e1 = f(t1), em = f(tm);
      // it leans off the realm's way by no more than a share of its length, and bends no further than another
      const tilt = Math.max(-TILT_MOST * len, Math.min(TILT_MOST * len, e1 - e0)), mid0 = (e0 + e1) / 2;
      e0 = mid0 - tilt / 2; e1 = mid0 + tilt / 2;
      const sag = straight ? 0 : em - (e0 + e1) / 2, capped = Math.max(-BEND_MOST * len, Math.min(BEND_MOST * len, sag));
      em = (e0 + e1) / 2 + capped;
      // the quadratic Bézier through both ends and the middle has this control point
      const ctrl = 2 * em - (e0 + e1) / 2;
      const at = (t: number, off: number): [number, number] => [(mx + ux * t + vx * off + 0.5) * every, (my + uy * t + vy * off + 0.5) * every];
      let low = Infinity, sum = 0;
      for (let k = first; k <= last; k++) { low = Math.min(low, thick[k]); sum += thick[k]; }
      const room = (0.6 * low + (0.4 * sum) / (last - first + 1)) * every;
      // the middle 80 % of the curve must lie on the piece, a quarter of the letters' height in from its outline
      let fits = true;
      for (let k = 1; k < 10 && fits; k++) {
        const q = 0.1 + (0.8 * k) / 10, t = t0 + (t1 - t0) * q, off = (1 - q) ** 2 * e0 + 2 * (1 - q) * q * ctrl + q * q * e1;
        const x = Math.round(mx + ux * t + vx * off), y = Math.round(my + uy * t + vy * off), gx = x - bx0 + 1, gy = y - by0 + 1;
        const depth = gx < 0 || gy < 0 || gx >= bw || gy >= bh ? 0 : Math.sqrt(inside[gy * bw + gx]);
        if (depth < Math.max(1, (room * FILL) / every / 4)) fits = false;
      }
      return { fits, name: { realm, ...pointOf(at(tm, em)), long: long * every, broad: broad * every, turn: along, from: at(t0, e0), bend: at(tm, ctrl), to: at(t1, e1), size: room * FILL } };
    }
    const deepest = thick.indexOf(Math.max(...thick.slice(first, last + 1)), first);
    for (let tries = 0; ; tries++) {
      const curve = curveOf(first, last, tries > 0 && tries % 2 === 1);
      if (curve.fits || last - first < 2 || tries > 2 * SLICES) { named.push(curve.name); break; }
      if (tries % 2 === 1) { if (deepest - first > last - deepest) first++; else last--; }
    }
  }
  return named;


}
const pointOf = ([x, y]: [number, number]) => ({ x, y });

/** a + b t + c t², fitted by weighted least squares to points (t, value, weight) */
function fitQuadratic(pts: [number, number, number][]): [number, number, number] {
  if (pts.length === 0) return [0, 0, 0];
  if (pts.length < 3) { const m = pts.reduce((s, p) => s + p[1], 0) / pts.length; return [m, 0, 0]; }
  const S = [0, 0, 0, 0, 0], T = [0, 0, 0];
  for (const [t, v, wt] of pts) { let p = wt; for (let k = 0; k < 5; k++) { S[k] += p; if (k < 3) T[k] += p * v; p *= t; } }
  // normal equations, solved by Cramer's rule
  const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]], det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M);
  if (Math.abs(D) < 1e-12) { const m = T[0] / S[0]; return [m, 0, 0]; }
  const col = (k: number) => M.map((row, i) => row.map((v, j) => (j === k ? T[i] : v)));
  return [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D];
}
