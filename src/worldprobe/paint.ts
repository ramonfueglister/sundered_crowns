// The realms' map (realms.ts) in the look of a printed atlas: the sea slate blue with a lighter shallow along the
// coasts, land without a realm sand, every realm in a muted colour of its own that deepens towards its borders, thin
// dark lines between realms, and a faint grain of paper over it all. Where the realms' names run is found in
// realm_names.ts.
//
// The look follows the reference of the EU5 atlas (project files karte/referenz-eu5): colours measured there, see
// docs/map/political-map.md. Distances to borders and coasts are exact Euclidean distance transforms (Felzenszwalb &
// Huttenlocher 2012, "Distance Transforms of Sampled Functions") over the dots of a tile and a margin around it, so
// the shading runs on unbroken from one tile to the next.
import type { RGB } from '../lookprobe/batch';

/** The realms on the map: `ids` holds the place of every map pixel, counted from 1 (land places first: `owner` has one entry each, -1 for no realm; then the sea zones). */
export interface Realms {
  ids: Uint16Array;
  w: number;
  h: number;
  owner: ArrayLike<number>;
  /** linear colour of every realm */
  colors: readonly RGB[];
  /** the place that is picked out, counted from 0 (none: -1 or left out) */
  chosen?: number;
  /** map pixels round the globe, after which the map begins again (none: the map ends at its edges) */
  round?: number;
  /** the places of the rest of the globe (public/map/beyond.bin.gz): ids as in `ids`, 0 on the game map, over the
   *  world frame from its north-west corner, `cells` to a map pixel */
  rest?: Rest;
}
export interface Rest {
  ids: Uint16Array;
  w: number;
  h: number;
  cells: number;
}

/** The place at map pixel (mx, my), counted from 0 (land places first, then the sea zones); -1 where there is none (a lake), OUTSIDE off the world. */
export function placeAt(r: Realms, mx: number, my: number): number {
  const wx = r.round ? ((mx % r.round) + r.round) % r.round : mx;
  if (wx >= 0 && my >= 0 && wx < r.w && my < r.h) return r.ids[my * r.w + wx] - 1;
  if (!r.rest || wx < 0 || my < 0) return OUTSIDE;
  const bx = Math.floor(wx * r.rest.cells),
    by = Math.floor(my * r.rest.cells);
  return bx >= r.rest.w || by >= r.rest.h ? OUTSIDE : r.rest.ids[by * r.rest.w + bx] - 1;
}

// ---------------------------------------------------------------- colours (sRGB 0 … 255 as measured, used linear)
// Measured on the EU5 reference (karte/referenz-eu5/eu5-weltkarte-1337.png, medians of open patches): open sea
// 77,94,106; the haze along a coast at most 88,107,121; land without a realm 122,113,107; a realm's border a line of
// its own colour about 12 % darker; inside a realm faint lines between its places; no dark line along the coasts.
/** the sea, and the light haze along the coasts */
const SEA = lin([77, 94, 106]),
  SHALLOW = lin([89, 108, 122]),
  ZONE_LINE = lin([70, 86, 98]);
/** land that no realm holds */
const SAND = lin([122, 113, 107]);
/** the lines: at a realm's edge (its edge colour darkened this far), at the coast of land without a realm, between a realm's own places, between sea zones */
const LINE_DARK = 0.86,
  SAND_COAST = 0.9,
  PLACE_DARK = 0.93,
  SEA_ZONE_LINE = 0.35;
/** a realm's colour on the map: lightness and chroma (OKLCH) are held in the reference's band (L 0.37 … 0.56) */
const L_LOW = 0.36,
  L_HIGH = 0.58,
  C_MOST = 0.1;
/** a realm is flat inside; only a narrow seam along its border is a little darker and fuller in its own hue */
const RIM_DARK = 0.035,
  RIM_CHROMA = 1.15,
  RIM_STRENGTH = 0.45;
/** the place picked out: its colour lightened this far towards white, inside a line of this colour */
const CHOSEN_LIGHT = 0.45,
  CHOSEN_LINE: RGB = [1, 0.86, 0.5];
/** how strongly the map covers the world below it: wholly, flat as the reference's atlas */
const COVER = 1;

// ---------------------------------------------------------------- sizes, in map pixels unless said
/** the shading inside a realm reaches this far from its border; the shallow this far out to sea */
const RIM = 5,
  SHALLOW_REACH = 14;
/** lines are this many dots wide, whatever the scale */
const LINE = 1.1;
/** the paper's grain: its size and strength */
const GRAIN = 2,
  GRAIN_STRENGTH = 0.03;

/** what lies at a dot: a realm (≥ 0), land without a realm, water, or nothing (beyond the map) */
const NONE = -1,
  WATER = -2,
  OUTSIDE = -3;

/**
 * The realms of the tile (tx, ty) of `level` of a map with `cells` finest cells per map pixel, `side` dots wide: per
 * dot the colour times its cover, and the cover (so that the dots blend cleanly), in linear light. Beyond the game map
 * the places of `r.rest` are painted. The tile's margin in map pixels is `marginOf`.
 */
export function paintRealms(
  r: Realms,
  level: number,
  tx: number,
  ty: number,
  side: number,
  cells: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(side * side * 4),
    perDot = 2 ** level / cells,
    lands = r.owner.length,
    chosen = r.chosen ?? -1;
  // a margin of dots around the tile, wide enough for the shading, so that a dot's distances are those of the whole map
  const margin = marginOf(level, cells),
    n = side + 2 * margin;
  // `onMap`: the dot lies on the game map (its places end at the map's edge, which is no line between places on the land)
  const kind = new Int16Array(n * n),
    place = new Int32Array(n * n),
    onMap = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) {
    const my = Math.floor((ty * side + y - margin + 0.5) * perDot);
    for (let x = 0; x < n; x++) {
      const mx = Math.floor((tx * side + x - margin + 0.5) * perDot),
        i = y * n + x;
      const at = placeAt(r, mx, my);
      if (at === OUTSIDE) {
        place[i] = -1;
        kind[i] = OUTSIDE;
        continue;
      }
      place[i] = at;
      const wx = r.round ? ((mx % r.round) + r.round) % r.round : mx;
      onMap[i] = wx < r.w && my >= 0 && my < r.h ? 1 : 0;
      kind[i] = at < 0 || at >= lands ? WATER : r.owner[at] >= 0 ? r.owner[at] : NONE;
    }
  }
  // the dots at a border: land whose neighbour is other land of another holder; at a coast: land or water next to the other
  const border = new Uint8Array(n * n),
    coast = new Uint8Array(n * n),
    zone = new Uint8Array(n * n),
    mine = new Uint8Array(n * n),
    seam = new Uint8Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x,
        k = kind[i];
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
  const toBorder = distance(border, n),
    toCoast = distance(coast, n);
  const toZone = perDot < 2 ? distance(zone, n) : null;

  // every realm's colour on the map, and its colour at the border, once
  const styled = new Map<number, [RGB, RGB]>();
  const styleOf = (k: number) => {
    let s = styled.get(k);
    if (!s) {
      s = mapColours(r.colors[k] ?? [0.5, 0.5, 0.5]);
      styled.set(k, s);
    }
    return s;
  };
  const rim = Math.max(2, RIM / perDot),
    shallow = Math.max(1.5, SHALLOW_REACH / perDot),
    places = perDot <= 2;
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const i = (y + margin) * n + x + margin,
        k = kind[i],
        o = (y * side + x) * 4;
      if (k === OUTSIDE) continue;
      const mx = (tx * side + x + 0.5) * perDot,
        my = (ty * side + y + 0.5) * perDot;
      let c: RGB;
      if (k === WATER) {
        // the shallow along the coast fades into the open sea
        const d = Math.sqrt(toCoast[i]),
          s = Math.exp(-((d / shallow) ** 1.2));
        c = mix(SEA, SHALLOW, s);
        if (toZone) c = mix(c, ZONE_LINE, SEA_ZONE_LINE * line(Math.sqrt(toZone[i]), LINE));
      } else {
        // the edge of a land is its border with another holder or with the sea
        const d = Math.sqrt(Math.min(toBorder[i], toCoast[i]));
        if (k === NONE) c = mix(SAND, scale(SAND, SAND_COAST), line(d, LINE));
        else {
          // flat, with a narrow seam of its own darker colour along the border, and faint lines between its places
          const [fill, edge] = styleOf(k),
            t = smoothstep(0, rim, d);
          c = mix(edge, fill, 1 - RIM_STRENGTH * (1 - t));
          if (places && seam[i]) c = scale(c, PLACE_DARK);
          c = mix(c, scale(edge, LINE_DARK), line(d, LINE));
        }
      }
      if (chosen >= 0 && place[i] === chosen) {
        c = mine[i] || near(mine, i, n) ? CHOSEN_LINE : mix(c, [1, 1, 1], CHOSEN_LIGHT);
      }
      const g = 1 + GRAIN_STRENGTH * grain(mx / GRAIN, my / GRAIN),
        a = COVER;
      out[o] = toByte(Math.min(1, c[0] * g) * a);
      out[o + 1] = toByte(Math.min(1, c[1] * g) * a);
      out[o + 2] = toByte(Math.min(1, c[2] * g) * a);
      out[o + 3] = Math.round(a * 255);
    }
  return out;
}

/** The margin in dots that a tile of `level` is painted with beyond its edges (for the distances to borders and coasts). */
export const marginOf = (level: number, cells: number) =>
  Math.min(96, Math.ceil(Math.max(RIM, SHALLOW_REACH * 3) / (2 ** level / cells)) + 2);

/** whether a dot touches one of the marked ones (so that the line round the picked place is two dots wide) */
const near = (marked: Uint8Array, i: number, n: number) =>
  marked[i - 1] === 1 || marked[i + 1] === 1 || marked[i - n] === 1 || marked[i + n] === 1;

/**
 * A realm's colour on the map, inside and at its border, from the colour it was given (linear): in OKLCH its
 * lightness is held in the atlas' band and its chroma capped (the colours of 1356 are chosen inside it: tools/map/palette.py), so that every realm sits in the same muted key.
 */
export function mapColours(c: RGB): [RGB, RGB] {
  const [L, a, b] = toOklab(c),
    C = Math.hypot(a, b),
    h = Math.atan2(b, a);
  const Lm = Math.max(L_LOW, Math.min(L_HIGH, L)),
    Cm = Math.min(C_MOST, C);
  const inner = fromOklab([Lm, Cm * Math.cos(h), Cm * Math.sin(h)]);
  const Ce = Math.min(C_MOST * 1.2, Cm * RIM_CHROMA),
    edge = fromOklab([Lm - RIM_DARK, Ce * Math.cos(h), Ce * Math.sin(h)]);
  return [inner, edge];
}

// ---------------------------------------------------------------- distance transform
/**
 * The squared Euclidean distance of every dot of an n × rows grid to the nearest marked dot (Felzenszwalb & Huttenlocher):
 * a 1-D lower envelope of parabolas along the rows, then along the columns.
 */
export function distance(marked: Uint8Array, n: number, rows = n): Float32Array {
  const BIG = 1e10,
    most = Math.max(n, rows),
    f = new Float32Array(n * rows),
    line = new Float64Array(most),
    d = new Float64Array(most),
    v = new Int32Array(most),
    z = new Float64Array(most + 1);
  for (let i = 0; i < n * rows; i++) f[i] = marked[i] ? 0 : BIG;
  const pass = (start: number, stride: number, n: number) => {
    for (let q = 0; q < n; q++) line[q] = f[start + q * stride];
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let s = (line[q] + q * q - (line[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (line[q] + q * q - (line[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + line[v[k]];
    }
    for (let q = 0; q < n; q++) f[start + q * stride] = Math.min(BIG, d[q]);
  };
  for (let y = 0; y < rows; y++) pass(y * n, 1, n);
  for (let x = 0; x < n; x++) pass(x, n, rows);
  return f;
}

// ---------------------------------------------------------------- small helpers
function lin(c: readonly [number, number, number]): RGB {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return [f(c[0]), f(c[1]), f(c[2])];
}
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const scale = (a: RGB, s: number): RGB => [a[0] * s, a[1] * s, a[2] * s];
export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** how much of a line `width` dots wide covers a dot at distance d (dots) from its middle, antialiased */
const line = (d: number, width: number) => Math.max(0, Math.min(1, width / 2 + 0.5 - d));
const toByte = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
/** value noise -1 … 1 on the map, smooth between whole coordinates */
function grain(x: number, y: number): number {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    fx = x - xi,
    fy = y - yi,
    sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) => {
    let s = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
    s = Math.imul(s ^ (s >>> 13), 1274126177);
    return ((s ^ (s >>> 16)) >>> 0) / 2147483648 - 1;
  };
  const top = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * sx,
    bottom = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * sx;
  return top + (bottom - top) * sy;
}
/** OKLab (Ottosson 2020) from and to linear sRGB */
function toOklab([r, g, b]: RGB): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function fromOklab([L, a, b]: [number, number, number]): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const c = (v: number) => Math.max(0, Math.min(1, v));
  return [
    c(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    c(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    c(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}
