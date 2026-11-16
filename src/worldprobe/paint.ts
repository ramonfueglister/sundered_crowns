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
export interface Realms {
  ids: Uint16Array; w: number; h: number; owner: ArrayLike<number>; /** linear colour of every realm */ colors: readonly RGB[]; /** the place that is picked out, counted from 0 (none: -1 or left out) */ chosen?: number;
  /** map pixels round the globe, after which the map begins again (none: the map ends at its edges) */
  round?: number;
  /** the places of the rest of the globe (public/map/beyond.bin.gz): ids as in `ids`, 0 on the game map, over the
   *  world frame from its north-west corner, `cells` to a map pixel */
  rest?: Rest;
}
export interface Rest { ids: Uint16Array; w: number; h: number; cells: number }

/** The place at map pixel (mx, my), counted from 0 (land places first, then the sea zones); -1 where there is none (a lake), OUTSIDE off the world. */
export function placeAt(r: Realms, mx: number, my: number): number {
  const wx = r.round ? ((mx % r.round) + r.round) % r.round : mx;
  if (wx >= 0 && my >= 0 && wx < r.w && my < r.h) return r.ids[my * r.w + wx] - 1;
  if (!r.rest || wx < 0 || my < 0) return OUTSIDE;
  const bx = Math.floor(wx * r.rest.cells), by = Math.floor(my * r.rest.cells);
  return bx >= r.rest.w || by >= r.rest.h ? OUTSIDE : r.rest.ids[by * r.rest.w + bx] - 1;
}

// ---------------------------------------------------------------- colours (sRGB 0 … 255 as measured, used linear)
// Measured on the EU5 reference (karte/referenz-eu5/eu5-weltkarte-1337.png, medians of open patches): open sea
// 77,94,106; the haze along a coast at most 88,107,121; land without a realm 122,113,107; a realm's border a line of
// its own colour about 12 % darker; inside a realm faint lines between its places; no dark line along the coasts.
/** the sea, and the light haze along the coasts */
const SEA = lin([77, 94, 106]), SHALLOW = lin([89, 108, 122]), ZONE_LINE = lin([70, 86, 98]);
/** land that no realm holds */
const SAND = lin([122, 113, 107]);
/** the lines: at a realm's edge (its edge colour darkened this far), at the coast of land without a realm, between a realm's own places, between sea zones */
const LINE_DARK = 0.86, SAND_COAST = 0.9, PLACE_DARK = 0.93, SEA_ZONE_LINE = 0.35;
/** a realm's colour on the map: lightness and chroma (OKLCH) are held in the reference's band (L 0.37 … 0.56) */
const L_LOW = 0.36, L_HIGH = 0.58, C_MOST = 0.1;
/** a realm is flat inside; only a narrow seam along its border is a little darker and fuller in its own hue */
const RIM_DARK = 0.035, RIM_CHROMA = 1.15, RIM_STRENGTH = 0.45;
/** the place picked out: its colour lightened this far towards white, inside a line of this colour */
const CHOSEN_LIGHT = 0.45, CHOSEN_LINE: RGB = [1, 0.86, 0.5];
/** how strongly the map covers the world below it: wholly, flat as the reference's atlas */
const COVER = 1;

// ---------------------------------------------------------------- sizes, in map pixels unless said
/** the shading inside a realm reaches this far from its border; the shallow this far out to sea */
const RIM = 5, SHALLOW_REACH = 14;
/** lines are this many dots wide, whatever the scale */
const LINE = 1.1;
/** the paper's grain: its size and strength */
const GRAIN = 2, GRAIN_STRENGTH = 0.03;

/** what lies at a dot: a realm (≥ 0), land without a realm, water, or nothing (beyond the map) */
const NONE = -1, WATER = -2, OUTSIDE = -3;

/**
 * The realms of the tile (tx, ty) of `level` of a map with `cells` finest cells per map pixel, `side` dots wide: per
 * dot the colour times its cover, and the cover (so that the dots blend cleanly), in linear light. Beyond the game map
 * the places of `r.rest` are painted. The tile's margin in map pixels is `marginOf`.
 */
export function paintRealms(r: Realms, level: number, tx: number, ty: number, side: number, cells: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(side * side * 4), perDot = 2 ** level / cells, lands = r.owner.length, chosen = r.chosen ?? -1;
  // a margin of dots around the tile, wide enough for the shading, so that a dot's distances are those of the whole map
  const margin = marginOf(level, cells), n = side + 2 * margin;
  // `onMap`: the dot lies on the game map (its places end at the map's edge, which is no line between places on the land)
  const kind = new Int16Array(n * n), place = new Int32Array(n * n), onMap = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) {
    const my = Math.floor((ty * side + y - margin + 0.5) * perDot);
    for (let x = 0; x < n; x++) {
      const mx = Math.floor((tx * side + x - margin + 0.5) * perDot), i = y * n + x;
      const at = placeAt(r, mx, my);
      if (at === OUTSIDE) { place[i] = -1; kind[i] = OUTSIDE; continue; }
      place[i] = at;
      const wx = r.round ? ((mx % r.round) + r.round) % r.round : mx;
      onMap[i] = wx < r.w && my >= 0 && my < r.h ? 1 : 0;
      kind[i] = at < 0 || at >= lands ? WATER : r.owner[at] >= 0 ? r.owner[at] : NONE;
    }
  }
  // the dots at a border: land whose neighbour is other land of another holder; at a coast: land or water next to the other
  const border = new Uint8Array(n * n), coast = new Uint8Array(n * n), zone = new Uint8Array(n * n), mine = new Uint8Array(n * n), seam = new Uint8Array(n * n);
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
      if (k >= 0 && o === k && place[j] !== place[i] && j > i && onMap[i] === onMap[j]) seam[i] = 1;
      if (chosen >= 0 && place[i] === chosen && place[j] !== chosen) mine[i] = 1;
    }
  }
  const toBorder = distance(border, n), toCoast = distance(coast, n);
  const toZone = perDot < 2 ? distance(zone, n) : null;

  // every realm's colour on the map, and its colour at the border, once
  const styled = new Map<number, [RGB, RGB]>();
  const styleOf = (k: number) => { let s = styled.get(k); if (!s) { s = mapColours(r.colors[k] ?? [0.5, 0.5, 0.5]); styled.set(k, s); } return s; };
  const rim = Math.max(2, RIM / perDot), shallow = Math.max(1.5, SHALLOW_REACH / perDot), places = perDot <= 2;
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const i = (y + margin) * n + x + margin, k = kind[i], o = (y * side + x) * 4;
    if (k === OUTSIDE) continue;
    const mx = (tx * side + x + 0.5) * perDot, my = (ty * side + y + 0.5) * perDot;
    let c: RGB;
    if (k === WATER) {
      // the shallow along the coast fades into the open sea
      const d = Math.sqrt(toCoast[i]), s = Math.exp(-((d / shallow) ** 1.2));
      c = mix(SEA, SHALLOW, s);
      if (toZone) c = mix(c, ZONE_LINE, SEA_ZONE_LINE * line(Math.sqrt(toZone[i]), LINE));
    } else {
      // the edge of a land is its border with another holder or with the sea
      const d = Math.sqrt(Math.min(toBorder[i], toCoast[i]));
      if (k === NONE) c = mix(SAND, scale(SAND, SAND_COAST), line(d, LINE));
      else {
        // flat, with a narrow seam of its own darker colour along the border, and faint lines between its places
        const [fill, edge] = styleOf(k), t = smoothstep(0, rim, d);
        c = mix(edge, fill, 1 - RIM_STRENGTH * (1 - t));
        if (places && seam[i]) c = scale(c, PLACE_DARK);
        c = mix(c, scale(edge, LINE_DARK), line(d, LINE));
      }
    }
    if (chosen >= 0 && place[i] === chosen) {
      c = mine[i] || near(mine, i, n) ? CHOSEN_LINE : mix(c, [1, 1, 1], CHOSEN_LIGHT);
    }
    const g = 1 + GRAIN_STRENGTH * grain(mx / GRAIN, my / GRAIN), a = COVER;
    out[o] = toByte(Math.min(1, c[0] * g) * a); out[o + 1] = toByte(Math.min(1, c[1] * g) * a); out[o + 2] = toByte(Math.min(1, c[2] * g) * a); out[o + 3] = Math.round(a * 255);
  }
  return out;
}

/** The margin in dots that a tile of `level` is painted with beyond its edges (for the distances to borders and coasts). */
export const marginOf = (level: number, cells: number) => Math.min(96, Math.ceil(Math.max(RIM, SHALLOW_REACH * 3) / (2 ** level / cells)) + 2);

/** whether a dot touches one of the marked ones (so that the line round the picked place is two dots wide) */
const near = (marked: Uint8Array, i: number, n: number) => marked[i - 1] === 1 || marked[i + 1] === 1 || marked[i - n] === 1 || marked[i + n] === 1;

/**
 * A realm's colour on the map, inside and at its border, from the colour it was given (linear): in OKLCH its
 * lightness is held in the atlas' band and its chroma capped (the colours of 1356 are chosen inside it: tools/map/palette.py), so that every realm sits in the same muted key.
 */
export function mapColours(c: RGB): [RGB, RGB] {
  const [L, a, b] = toOklab(c), C = Math.hypot(a, b), h = Math.atan2(b, a);
  const Lm = Math.max(L_LOW, Math.min(L_HIGH, L)), Cm = Math.min(C_MOST, C);
  const inner = fromOklab([Lm, Cm * Math.cos(h), Cm * Math.sin(h)]);
  const Ce = Math.min(C_MOST * 1.2, Cm * RIM_CHROMA), edge = fromOklab([Lm - RIM_DARK, Ce * Math.cos(h), Ce * Math.sin(h)]);
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
/** as names.ts lays them, a name fills at most this share of its curve, its letters this wide for their height, standing no further apart than this many times their height */
const NAME_FILL = 0.84, NAME_ASPECT = 0.46, SPREAD_MOST = 0.9;
/** a letter reaches this share of its height to either side of the curve (EB Garamond, mixed case, centred on it), and is kept this share of its height off the ends */
const HALF_HEIGHT = 0.4, MARGIN = 0.1;
/** no name is taller than this share of the land's breadth where it runs */
const SIZE_OVER = 0.7;
/** a little in favour of the longer stretch, so that a name is spread as on a map rather than squeezed */
const LONGER = 0.012;
/** a name bends no further than this share of its length */
const BEND_MOST = 0.16, TILT_MOST = 0.3;
/** the bounding box of a piece is padded by this many sampled pixels */
const PAD = 2;
/** an enclave of another realm of no more than this many sampled pixels does not stop a name */
const ENCLAVE = 6;
/** a piece less than this many times as long as broad has its name run level (fully from 0.6 more) */
const ROUND = 1.3;

/** The largest connected piece of every realm, measured on every `every`-th map pixel, and the curve its name runs along. */
export function realmNames(r: Realms, every = 4, lettersOf: (realm: number) => number = () => 8): RealmName[] {
  // over the game map, or over the whole world frame where the rest of the globe has its places
  const W = r.rest ? Math.round(r.rest.w / r.rest.cells) : r.w, H = r.rest ? Math.round(r.rest.h / r.rest.cells) : r.h;
  const w = Math.floor(W / every), h = Math.floor(H / every), lands = r.owner.length, of = new Int16Array(w * h), piece = new Int32Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const place = placeAt(r, x * every, y * every); of[y * w + x] = place >= 0 && place < lands ? r.owner[place] : -1; }
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
    const pad = PAD, bw = bx1 - bx0 + 1 + 2 * pad, bh = by1 - by0 + 1 + 2 * pad, outside = new Uint8Array(bw * bh).fill(1);
    for (const i of cells) { const x = i % w, y = (i - x) / w; outside[(y - by0 + pad) * bw + x - bx0 + pad] = 0; }
    // lands of others that the piece encloses (enclaves, lakes) do not stop its name: only what reaches its outline does
    const open = new Uint8Array(bw * bh), flood: number[] = [];
    for (let x = 0; x < bw; x++) { flood.push(x, (bh - 1) * bw + x); }
    for (let y = 0; y < bh; y++) { flood.push(y * bw, y * bw + bw - 1); }
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
    const blocked = Uint8Array.from(open), hole: number[] = [];
    for (let start = 0; start < bw * bh; start++) {
      if (!outside[start] || open[start] || blocked[start] === 2) continue;
      let others = false;
      hole.length = 0; hole.push(start); blocked[start] = 2;
      for (let k = 0; k < hole.length; k++) {
        const i = hole[k], x = i % bw, gx = x + bx0 - pad, gy = (i - x) / bw + by0 - pad;
        if (gx >= 0 && gy >= 0 && gx < w && gy < h && of[gy * w + gx] >= 0) others = true;
        for (const j of [x > 0 ? i - 1 : -1, x < bw - 1 ? i + 1 : -1, i >= bw ? i - bw : -1, i < (bh - 1) * bw ? i + bw : -1]) if (j >= 0 && outside[j] && !open[j] && blocked[j] !== 2) { blocked[j] = 2; hole.push(j); }
      }
      if (others && hole.length > ENCLAVE) for (const i of hole) blocked[i] = 3;
    }
    const inside = distance(Uint8Array.from(blocked, (v) => (v === 1 || v === 3 ? 1 : 0)), bw, bh);
    // slices across the long axis: in each, the point deepest inside the piece (on its ridge, the medial axis) and its depth
    const mids = new Array<number>(SLICES).fill(0), thick = new Array<number>(SLICES).fill(0);
    for (const i of cells) {
      const x = i % w, y = (i - x) / w, dx = x - mx, dy = y - my, a = dx * ux + dy * uy;
      const k = Math.max(0, Math.min(SLICES - 1, Math.floor(((a + span) / (2 * span)) * SLICES)));
      const deep = 2 * Math.sqrt(inside[(y - by0 + pad) * bw + x - bx0 + pad]);
      if (deep > thick[k]) { thick[k] = deep; mids[k] = dx * vx + dy * vy; }
    }
    // the stretch of slices and the curve through it where the name can be written largest with every letter on the
    // realm: the letters are placed as names.ts places them (spread from the middle of the curve, `NAME_FILL` of it at
    // most, `NAME_ASPECT` wide for their height) and each is tested, across its whole height, against the piece itself
    const letters = Math.max(3, lettersOf(realm));
    const free = (gx: number, gy: number) => { const x = Math.round(gx) - bx0 + pad, y = Math.round(gy) - by0 + pad; return x >= 0 && y >= 0 && x < bw && y < bh && (blocked[y * bw + x] === 0 || blocked[y * bw + x] === 2); };
    /** the name's curve through slices `first` … `last` (straight: no bend) and the largest size its letters all keep to the land at */
    const curveOf = (first: number, last: number, straight: boolean, need = 0): { name: RealmName; size: number } => {
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
      const local = (q: number): [number, number] => { const t = t0 + (t1 - t0) * q, off = (1 - q) ** 2 * e0 + 2 * (1 - q) * q * ctrl + q * q * e1; return [mx + ux * t + vx * off, my + uy * t + vy * off]; };
      const at = (t: number, off: number): [number, number] => [(mx + ux * t + vx * off + 0.5) * every, (my + uy * t + vy * off + 0.5) * every];
      const name = { realm, ...pointOf(at(tm, em)), long: long * every, broad: broad * every, turn: along, from: at(t0, e0), bend: at(tm, ctrl), to: at(t1, e1), size: 0 };
      // the curve as names.ts measures it (8 chords), and finer for walking along it
      let chord = 0;
      for (let k = 1; k <= 8; k++) { const p = local((k - 1) / 8), q = local(k / 8); chord += Math.hypot(q[0] - p[0], q[1] - p[1]); }
      const STEPS = 48, walk: [number, number, number][] = [[...local(0), 0]];
      for (let k = 1; k <= STEPS; k++) { const p = local(k / STEPS), q = walk[k - 1]; walk.push([p[0], p[1], q[2] + Math.hypot(p[0] - q[0], p[1] - q[1])]); }
      const total = walk[STEPS][2];
      const pointAt = (s: number): [number, number, number, number] => {
        s = Math.max(0, Math.min(total, s));
        let k = 1;
        while (k < STEPS && walk[k][2] < s) k++;
        const a = walk[k - 1], b = walk[k], d = b[2] - a[2] || 1e-9, u = (s - a[2]) / d, tx = (b[0] - a[0]) / d, ty = (b[1] - a[1]) / d;
        return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, -ty, tx];
      };
      const span0 = chord * NAME_FILL, most = Math.min(SIZE_OVER * Math.max(...thick.slice(first, last + 1)), span0 / (letters * NAME_ASPECT));
      /** whether every letter at this size lies on the piece: sampled at most half a sampled pixel apart */
      const fits = (size: number) => {
        const spread = Math.min(span0, letters * size * (NAME_ASPECT + SPREAD_MOST)), from = total / 2 - spread / 2 - size * MARGIN, to = total / 2 + spread / 2 + size * MARGIN;
        const half = size * HALF_HEIGHT, across = Math.max(2, Math.ceil((2 * half) / 0.5)), along = Math.max(2, Math.ceil((to - from) / 0.5));
        for (let i = 0; i <= along; i++) {
          const [px, py, nx, ny] = pointAt(from + ((to - from) * i) / along);
          for (let j = 0; j <= across; j++) { const o = -half + (2 * half * j) / across; if (!free(px + nx * o, py + ny * o)) return false; }
        }
        return true;
      };
      // (a curve that cannot carry the name at `need` is not measured further)
      const least = Math.max(Math.min(most, 0.25), need);
      if (!(most > least) || !fits(least)) return { name, size: 0 };
      let lo = least, hi = most;
      if (fits(hi)) lo = hi;
      else for (let k = 0; k < 10 && hi - lo > 0.02 * hi; k++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
      name.size = lo * every;
      return { name, size: lo };
    };
    // every stretch, largest first by what its depth and length would allow; one that cannot beat the best found is skipped
    const width = (2 * span) / SLICES, tries: [number, number, number][] = [];
    for (let i = 0; i < SLICES; i++) for (let j = i; j < SLICES; j++) {
      let top = 0;
      for (let k = i; k <= j; k++) top = Math.max(top, thick[k]);
      if (top > 0) tries.push([i, j, Math.min(SIZE_OVER * top, ((j - i + 1) * width * NAME_FILL * 1.2) / (letters * NAME_ASPECT)) * (1 + LONGER * (j - i))]);
    }
    tries.sort((p, q) => q[2] - p[2]);
    let pick: RealmName | undefined, score = 0;
    for (const [i, j, bound] of tries) {
      if (bound <= score) break;
      for (const straight of [false, true]) {
        const c = curveOf(i, j, straight, score / (1 + LONGER * (j - i))), sc = c.size * (1 + LONGER * (j - i));
        if (sc > score) { score = sc; pick = c.name; }
      }
    }
    // a piece too small for any name: its curve across the middle, at no size (names.ts leaves it out)
    named.push(pick ?? curveOf(0, SLICES - 1, true).name);
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
