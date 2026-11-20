// The sea's depth and its surface, for the stage's water (stage/materials.ts). EU5's map is the bar of quality for
// how the water changes with the distance it is seen from (tools/lookprobe/gauntlet_water.py measures both alike);
// its look is that of the rest of the world, a model of bright, clean colours:
//  - its colour comes from the depth: light turquoise over the shallows by the coast, a clear blue over the shelf,
//    deeper blue beyond its edge and dark blue over the deep sea, as full in colour as the land beside it (EU5's
//    water is as full as its land; a muted, greyish sea looked like a photograph laid into the model). The depths
//    are the sea bed of the game map's height data (public/map/height.bin.gz), kept as a small picture
//    (public/map/depth.png, made by tools/worldprobe/build_depth.py) that every step of the view reads alike, so the
//    sea's colour does not change from one step to the next. By the coast the water is lighter still: within a few
//    columns of the land by the colours of the water's own corners (terrain.ts, which this reads back by their hue,
//    which their patches of light and shade leave alone), wider out within some dots of the coast as the depth
//    picture has it (`withCoast`).
//  - its surface changes with the distance, as EU5's does: from near and in the middle distance a calm swell, a few
//    long soft waves in which the sky and what stands by the water are mirrored, and white strokes where the wind
//    breaks a crest, short and a little bent, across the wind and in groups; from farther out (a dot some blocks
//    wide) the sea lies smooth, its colour the depth's alone. The strokes are always some dots large, so that they
//    read as strokes of paint and never as a fine grey chop or as specks.
//    (The first round laid a natural wind sea of fine ripples over the water at every distance: it was measured
//    close to EU5's numbers, but looked like a photograph of the sea and did not belong to the model.)
//    Both come from one picture made once at the start (`waveTexture`): random waves worked out by the inverse
//    Fourier transform, so that it repeats seamlessly, laid over the world at the octave whose texels are a dot or
//    two wide where it is seen.
// The waves lie in the world's blocks, so that they stay where they are when the view moves.
import * as THREE from 'three/webgpu';
import { abs, cameraPosition, clamp, dFdx, dFdy, dot, exp2, float, floor, fract, fwidth, length, log2, materialColor, max, min, mix, normalize, positionWorld, pow, select, sin, smoothstep, step, texture, time, transformNormalToView, uniform, vec2, vec3 } from 'three/tsl';
import { SEA_Y } from './layout';
import { number, q } from './stage/address';
import { WATER_DEEP, WATER_SHALLOW } from './terrain';

/** how the depth picture holds the depth: byte = 255 · ln(1 + d / DEPTH_D0) / ln(1 + DEPTH_MOST / DEPTH_D0), in metres (as build_depth.py) */
export const DEPTH_D0 = 20, DEPTH_MOST = 6000;
/** the depth picture's share for the sea beyond the game map, of which no depths are known: open ocean (about 3000 m) */
const BEYOND = 0.88;
/** the depth's share where no depths are known (a stage without the world's map): water over the shelf */
const UNKNOWN = 0.2;
/**
 * The water's colours (sRGB) by the depth picture's share: at the coast, over the shallows (some 30 m), at the
 * shelf's edge (some 150 m), over the slope (some 700 m) and over the deep sea (some 3000 m). As the stage lights
 * them and mirrors the sky in them, they come out some 7 lighter and a little greener.
 */
const RAMP: readonly (readonly [number, number])[] = [[0, 0x22a6bd], [0.18, 0x1a8cc4], [0.38, 0x1673b4], [0.62, 0x155d9c], [0.88, 0x124a84]];
/** the colour the water is drawn towards by the coast (within a few columns of the land, and within HALO dots of it) */
const COAST = new THREE.Color(0x48c3cb);
/**
 * the coast's band from the depth picture: how many of the picture's dots out from the coast it reaches, how strongly
 * it shows (1: as the corners' band at the coast), and from how many dots of the picture a dot of the depth picture is
 * too coarse for it, wholly at the second
 */
const HALO = 40, HALO_SHARE = 0.55, HALO_UNTIL: readonly [number, number] = [110, 220];
/** the corners' band: how near the coast its colour begins and is full (in shares of the corners' mix: 0 some 8 columns out, 1 at the coast) */
const RIM: readonly [number, number] = [0.1, 0.8];
/** how much darker the water's colour is in the nearest views, against their brighter light */
const NEAREST_DARKER = 0.74;
/** the sky as the water gives it back where a wave turns towards it (linear light, at the share Fresnel gives) */
const SKY = new THREE.Color(0xd8ecf6);
/** the wave picture: its size in texels, and how many of the picture's dots a texel is laid over (between this and twice it) */
const TEX = 256, DOTS_PER_TEXEL = 1.4;
/** from near the picture spans at least this many finest blocks, so that the flecks are as large as a part of a house, not specks */
const SPAN_LEAST = 32;
/**
 * the swell's waves (2 to SWELL_K across the picture: 18 to 128 texels long) and the flecks' (FLECK_K, 4 to 11 texels,
 * within FLECK_SPREAD of the wind's direction as the power of the cosine: their crests are long and narrow), and how
 * the flecks' picture is bent (by up to BEND texels, in waves BEND_K across the picture: the strokes curve)
 */
const SWELL_K = 14, FLECK_K: readonly [number, number] = [24, 64], FLECK_SPREAD = 12, BEND = 2.5, BEND_K: readonly [number, number] = [5, 12];
/** the swell's slope, as the root of the mean square of rise over run: from afar, and from nearest (where the view is steeper and sees less of the sky) */
const SWELL = 0.028, SWELL_NEAR = 0.05;
/** the wind's direction in the wave picture (radians from its u axis); the flecks' crests stand across it */
const WIND = 0.55;
/** the waves come in patches (gusts of wind): their strength runs between these shares over two long waves */
const PATCHY: readonly [number, number] = [0.6, 1.3];
/**
 * the flecks: from which height of the flecks' waves (in spreads) a crest breaks white where the wind is at its usual
 * strength and the swell level, how much lower where the wind is strongest, how much lower for each spread of the
 * swell's height (on its crests), and how white they are (a share of FOAM)
 */
const FLECK = 2.9, FLECK_GUST = 0.45, FLECK_CREST = 0.5, FLECK_WHITE = 0.8;
/** how far every other octave of the flecks is turned (radians) */
const FLECK_TURN = 0.45;
/**
 * The water moves (the waves' pictures drift with the wind; nothing of the mesh moves): how many of its own spans an
 * octave of the swell drifts a second at SPAN_LEAST blocks across (a wider octave drifts fewer of its spans, by the
 * fourth root of its span: longer waves run faster, though on the sea by the square root, which from EU5's nearest
 * distance looked all but still), the second picture of each octave (turned by
 * SWELL_TURN, so that the two cross and the swell changes as it runs) at SWELL_SECOND of that, and the flecks' waves
 * at FLECK_RUN of it. A fleck lives some FLECK_LIFE seconds: its line rises and falls by up to FLECK_SWAY spreads,
 * at another time in each patch of the swell.
 */
const SWELL_RUN = 0.035, SWELL_SECOND = 0.65, SWELL_TURN = 0.8, FLECK_RUN = 1.6, FLECK_LIFE = 3.5, FLECK_SWAY = 1.1;
/**
 * the light the shallows' waves gather on the sea bed, nearest only and within the rim along the coast: thin lines
 * where either of two drifting pictures of the swell, half its span, crosses its middle (CAUSTIC_RUN of the swell's
 * drift), as wide as CAUSTIC_WIDTH dots, at CAUSTIC_SHARE of CAUSTIC_LIGHT
 */
const CAUSTIC_RUN = 1.3, CAUSTIC_WIDTH = 1.8, CAUSTIC_SHARE = 0.45;
const CAUSTIC_LIGHT = new THREE.Color(0xc8fbf4);
/** the glitter: points where two of the flecks' pictures one octave finer, drifting apart, both rise above SPARKLE spreads; brighter at a slant (SPARKLE_SLANT) */
const SPARKLE = 2.0, SPARKLE_SLANT = 2.2;
/**
 * the stage draws every picture while a dot in the middle of the picture is up to MOVING_SLACK times as wide as where
 * the swell ends (SURFACE_UNTIL; the nearer bottom of the picture shows it farther); beyond, it lies smooth and
 * nothing needs drawing
 */
const MOVING_SLACK = 1.5;
/** a still of fixed size (a tool's picture, ?w=) shows the water as it is at ?seatime= seconds (0), so that the same picture comes each time */
const STILL = q.has('w');
const FOAM = new THREE.Color(0xf2f8f6);
/**
 * how far the swell reaches: it shows fully up to the first many finest blocks to a dot of the picture and is gone
 * from the second (in a picture 1672 dots wide the sea lies smooth from some 3000 blocks across on); and the flecks and the
 * glitter, a little less far (from farther the flecks of a picture would be more than EU5's nearest view shows)
 */
const SURFACE_UNTIL: readonly [number, number] = [0.8, 1.8], FLECKS_UNTIL: readonly [number, number] = [0.5, 1.3];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TSL's node types do not carry through sums and mixes
type Nd = any;
/** the view's place on the world is taken modulo these many finest blocks: the fine waves', and the coarse ones' */
const PERIOD = 1024, PERIOD_COARSE = 65536, TURN = (2 * Math.PI) / PERIOD;

export interface Sea {
  /** the water's colour from its corners' colour (which carries the material's colour) */
  colour(corners: Nd): Nd;
  /** the surface's direction, in the view's frame */
  normal: Nd;
  /** what the water gives back: the mirror image (`mirror`) broken by the swell, the sky in the swell, and the flecks */
  mirror: Nd;
  /**
   * Tells where the stage lies on the world: the depth picture (null: no depths, the water's own colours), how a
   * point (x, z) of the stage lies on it (u = a·x + b·z + c, v = d·x + e·z + f, in shares of the picture), after how
   * many shares the picture's u comes round again (0: never; beyond 1 lies sea of no known depth), how many finest
   * blocks a block of the stage is, and the stage's (0, 0) in finest blocks.
   */
  place(depths: THREE.Texture | null, toMap: readonly number[], round: number, blocks: number, homeX: number, homeZ: number): void;
  /** whether the water moves in a picture `across` blocks of the stage and `dots` dots wide (then every picture is to be drawn) */
  moving(across: number, dots: number): boolean;
}

/** A small random number source of its own, so that the waves are the same at every start. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The Fourier transform of `n` complex numbers in place (n a power of two); `back`: the inverse, without the 1/n. */
function fft(re: Float64Array, im: Float64Array, back: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = ((back ? 2 : -2) * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** The inverse transform of a square of TEX × TEX complex numbers, rows then columns; the real part. */
function inverse2(re: Float64Array, im: Float64Array): Float64Array {
  const n = TEX, rr = new Float64Array(n), ri = new Float64Array(n);
  for (let pass = 0; pass < 2; pass++) for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) { const i = pass ? b * n + a : a * n + b; rr[b] = re[i]; ri[b] = im[i]; }
    fft(rr, ri, true);
    for (let b = 0; b < n; b++) { const i = pass ? b * n + a : a * n + b; re[i] = rr[b]; im[i] = ri[b]; }
  }
  return re;
}

/**
 * The wave picture: the swell's slopes along u and v (red, green: rise over run in shares of four times their
 * spread, about 0.5 level), the swell's height (blue: in shares of four times its spread about 0.5) and the height
 * of the flecks' waves (alpha: in shares of eight times its spread about 0.5). The swell is a height field of
 * random phases whose power falls as the fourth power of the wavenumber, from 2 to SWELL_K waves across the
 * picture; the flecks' waves are short (FLECK_K) and run with the wind, so that their crests, where they rise high
 * enough to break, are short strokes across it, and the picture of them is bent (`curved`), so that the strokes
 * curve a little.
 */
export function waveTexture(): THREE.DataTexture {
  const n = TEX, random = seeded(1291);
  /** a height field of random phases with the given power at each wavenumber (kx, ky): its real and imaginary parts */
  const field = (power: (kx: number, ky: number) => number) => {
    const hr = new Float64Array(n * n), hi = new Float64Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const kx = i < n / 2 ? i : i - n, ky = j < n / 2 ? j : j - n, p = power(kx, ky);
      // a Gaussian number of each part (Box and Muller), drawn for every wavenumber so that each field keeps its own
      const r = Math.sqrt(-2 * Math.log(1 - random())) * Math.sqrt(p), a = 2 * Math.PI * random();
      if (p > 0) { hr[j * n + i] = r * Math.cos(a); hi[j * n + i] = r * Math.sin(a); }
    }
    return [hr, hi] as const;
  };
  const along = (kx: number, ky: number) => Math.cos(Math.atan2(ky, kx) - WIND);
  const [sr, si] = field((kx, ky) => { const k = Math.hypot(kx, ky); return k < 2 || k > SWELL_K ? 0 : (0.6 + 0.4 * along(kx, ky) ** 2) / k ** 4; });
  const [fr, fi] = field((kx, ky) => { const k = Math.hypot(kx, ky); return k < FLECK_K[0] || k > FLECK_K[1] ? 0 : along(kx, ky) ** FLECK_SPREAD / k ** 2; });
  const bent = (k: number) => (k < BEND_K[0] || k > BEND_K[1] ? 0 : 1 / k ** 2);
  const [br, bi] = field((kx, ky) => bent(Math.hypot(kx, ky))), [cr, ci] = field((kx, ky) => bent(Math.hypot(kx, ky)));
  // the slopes are the transforms of i·k times the heights' (k in radians per texel)
  const slope = (axis: 0 | 1) => {
    const re = new Float64Array(n * n), im = new Float64Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = ((axis === 0 ? (i < n / 2 ? i : i - n) : j < n / 2 ? j : j - n) * 2 * Math.PI) / n, at = j * n + i;
      re[at] = -si[at] * k; im[at] = sr[at] * k;
    }
    return inverse2(re, im);
  };
  const spread = (v: Float64Array) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
  const su = slope(0), sv = slope(1), h = inverse2(sr.slice(), si.slice()), f = curved(inverse2(fr, fi), inverse2(br, bi), inverse2(cr, ci));
  /** the flecks' picture read (between its texels, repeating) at each texel moved by `bu`, `bv` (BEND texels a spread) */
  function curved(straight: Float64Array, bu: Float64Array, bv: Float64Array) {
    const out = new Float64Array(n * n), ku = BEND / spread(bu), kv = BEND / spread(bv), wrap = (i: number) => ((i % n) + n) % n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const u = i + bu[j * n + i] * ku, v = j + bv[j * n + i] * kv, u0 = Math.floor(u), v0 = Math.floor(v), fu = u - u0, fv = v - v0;
      const at = (x: number, y: number) => straight[wrap(y) * n + wrap(x)];
      out[j * n + i] = (at(u0, v0) * (1 - fu) + at(u0 + 1, v0) * fu) * (1 - fv) + (at(u0, v0 + 1) * (1 - fu) + at(u0 + 1, v0 + 1) * fu) * fv;
    }
    return out;
  }
  const s = Math.sqrt((spread(su) ** 2 + spread(sv) ** 2) / 2), hs = spread(h), fs = spread(f);
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round(127.5 + 127.5 * v)));
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    data[i * 4] = byte(su[i] / (4 * s)); data[i * 4 + 1] = byte(sv[i] / (4 * s)); data[i * 4 + 2] = byte(h[i] / (4 * hs)); data[i * 4 + 3] = byte(f[i] / (8 * fs));
  }
  const t = new THREE.DataTexture(data, n, n);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** The squared distance of each point of a row to the nearest of `on` (Felzenszwalb and Huttenlocher), in place. */
function distance1(f: Float64Array, n: number, v: Int32Array, z: Float64Array, d: Float64Array) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
  for (let q = 0; q < n; q++) f[q] = d[q];
}

/** The distance of every dot of a picture of w × h to the nearest dot that is `inside`, in dots (0 on those). */
function distances(inside: Uint8Array, w: number, h: number): Float64Array {
  const big = 1e12, g = new Float64Array(w * h), n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let i = 0; i < w * h; i++) g[i] = inside[i] ? 0 : big;
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = g[y * w + x]; distance1(f, h, v, z, d); for (let y = 0; y < h; y++) g[y * w + x] = f[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = g[y * w + x]; distance1(f, w, v, z, d); for (let x = 0; x < w; x++) g[y * w + x] = Math.sqrt(f[x]); }
  return g;
}

/** how many dots of the depth picture the coast's distance reaches on either side (it is kept in a byte, COAST_REACH / 128 dots a step) */
const COAST_REACH = 8;

/**
 * The depth picture with the coast's distance beside the depth: red the depth (as the picture has it, 0 on land),
 * green the distance from the coast in dots of the picture, 128 at the coast, more over the sea, less on the land
 * (so that the coast lies where it crosses 128 between the dots, and not on their edges). The rows run from the
 * bottom up, as a picture loaded by three's loader lies.
 */
export function withCoast(image: CanvasImageSource & { width: number; height: number }): THREE.DataTexture {
  const w = image.width, h = image.height, canvas = new OffscreenCanvas(w, h), c = canvas.getContext('2d')!;
  c.drawImage(image, 0, 0);
  const px = c.getImageData(0, 0, w, h).data, land = new Uint8Array(w * h), sea = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { land[i] = px[i * 4] === 0 ? 1 : 0; sea[i] = 1 - land[i]; }
  const toLand = distances(land, w, h), toSea = distances(sea, w, h), data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = ((h - 1 - y) * w + x) * 4, signed = land[i] ? -(toSea[i] - 0.5) : toLand[i] - 0.5;
    data[o] = px[i * 4]; data[o + 1] = Math.max(0, Math.min(255, Math.round(128 + (signed * 128) / COAST_REACH))); data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, w, h);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** The sea's nodes; `mirror` is what the water gives back where it lies level (the stage's tinted mirror image). */
export function createSea(mirror: Nd): Sea {
  const none = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  none.needsUpdate = true;
  const depths = texture(none), known = uniform(0), toMap = uniform(new THREE.Matrix3()), round = uniform(0);
  const blocks = uniform(1), home = uniform(new THREE.Vector2()), homeCoarse = uniform(new THREE.Vector2());
  // where this point of the water lies on the depth picture, and the picture there: the depth's share (0: as shallow
  // as the coast) and the coast's distance in dots of the picture
  const at = toMap.mul(vec3(positionWorld.x, positionWorld.z, 1)), u = select(round.greaterThan(0), fract(at.x.div(round)).mul(round), at.x), v = at.y;
  const onMap = step(0, u).mul(step(u, 1)).mul(step(0, v)).mul(step(v, 1)), seen = depths.sample(vec2(u, v.oneMinus()));
  const share = mix(float(UNKNOWN), mix(float(BEYOND), seen.r, onMap), known);
  const coastTexels = mix(float(COAST_REACH), seen.g.mul(255).sub(128).mul(COAST_REACH / 128), onMap);
  // (the depth picture's size in dots, from the depth picture itself)
  const texels = uniform(new THREE.Vector2(1, 1)), dotsPerTexel = float(1).div(length(fwidth(vec2(at.x, at.y).mul(texels))).max(1e-6));
  const coastDots = coastTexels.mul(dotsPerTexel);
  // where the water lies in finest blocks, and how many of them a dot of the picture is wide there (by the geometric
  // mean of a dot's width and height on the water: seen at a slant, a dot reaches farther up the water than across it)
  const world = positionWorld.xz.mul(blocks);
  const pFine = world.add(home), pCoarse = world.add(homeCoarse);
  const acrossDot = length(dFdx(pFine)).mul(length(dFdy(pFine))).sqrt();
  /** 1 in the nearest views (a street of houses across the picture), 0 from a few hundred blocks across (by a dot's width alone) */
  const nearest = float(1).sub(smoothstep(0.04, 0.12, length(dFdx(pFine))));
  /** 1 where the swell shows, 0 where the sea lies smooth; and where the flecks and the glitter do */
  const surface = float(1).sub(smoothstep(SURFACE_UNTIL[0], SURFACE_UNTIL[1], acrossDot)), flecked = float(1).sub(smoothstep(FLECKS_UNTIL[0], FLECKS_UNTIL[1], acrossDot));
  const lin = (c: THREE.Color) => vec3(c.r, c.g, c.b);
  const [, gs, bs] = WATER_SHALLOW, [, gd, bd] = WATER_DEEP;
  /** the colour of the depth's share t, through the stops of RAMP */
  const ramp = (t: Nd) => {
    let c: Nd = lin(new THREE.Color(RAMP[0][1]));
    for (let i = 1; i < RAMP.length; i++) c = mix(c, lin(new THREE.Color(RAMP[i][1])), smoothstep(RAMP[i - 1][0], RAMP[i][0], t));
    return c;
  };
  const colour = (corners: Nd) => {
    // how far from the coast the corners are, as their colour has it (terrain.ts: WATER_SHALLOW at the coast, mixed
    // towards WATER_DEEP by k = 0 … 1 within some 8 columns, and the mix a tenth lighter or darker in broad patches
    // everywhere): by the ratio of their green to their blue, which the patches leave as it is (k worked back from
    // the ratio q of the mix: q = (gs + k (gd - gs)) / (bs + k (bd - bs))). By the corners' lightness the band was
    // as uneven as the patches; and their shade, again, from their blue against the mix's
    const tone = corners.div(materialColor.rgb.max(1e-4)), q = tone.g.div(tone.b.max(1e-4));
    const k = clamp(float(gs).sub(q.mul(bs)).div(q.mul(bd - bs).sub(gd - gs).max(1e-4)), 0, 1);
    const shade = tone.b.div(mix(float(bs), float(bd), k));
    const corner = smoothstep(RIM[0], RIM[1], k.oneMinus());
    // the sea is lighter, too, within HALO dots of the coast as the depth picture has it (its dots are some 36 finest
    // blocks wide: the corners' band is but a few columns wide, as wide as a sandbank from near and a hair from afar);
    // from near, where a dot of the depth picture is wider than HALO_UNTIL dots of the picture, it would not follow the
    // coast closely enough, and the band is the corners' alone (lakes and rivers lie above the sea)
    const coarse = smoothstep(HALO_UNTIL[0], HALO_UNTIL[1], dotsPerTexel);
    const sea = float(1).sub(smoothstep(SEA_Y + 0.005, SEA_Y + 0.02, positionWorld.y)).mul(known).mul(float(1).sub(coarse));
    const halo = float(1).sub(smoothstep(0, HALO, coastDots.max(0))).mul(sea);
    // (from near the corners' band is the only one, a column or two wide, and shows fully: a light rim along the coast)
    const coast = max(corner.mul(mix(float(0.7), float(1), coarse)), halo.mul(halo).mul(HALO_SHARE));
    const patches = clamp(shade, 0.9, 1.1);
    // from near, all the picture lies within a dot or two of the depth picture, which runs down to the coast's depth
    // across them: there the water beyond the corners' band is the shelf's (and the band the shallows')
    const t = mix(share, max(share, float(RAMP[1][0]).mul(float(1).sub(corner))), coarse);
    // (the near view's light is brighter: the water is as dark there as it looks from afar)
    // (and in the shallows, nearest, the light the waves gather on the bed)
    return mix(mix(ramp(t), lin(COAST), coast), lin(CAUSTIC_LIGHT), caustic.mul(corner).mul(CAUSTIC_SHARE)).mul(materialColor.rgb).mul(patches).mul(mix(float(1), float(NEAREST_DARKER), nearest));
  };
  // the surface: the wave picture at the two octaves whose texels are DOTS_PER_TEXEL to twice that many dots wide here
  // (from near at least SPAN_LEAST blocks across the picture), faded from one to the next; the flecks' at those
  // whose texels are twice as wide again (a fleck is then some 4 to 20 dots long: smaller, a stroke one dot high on
  // the slanted water reads as a grey hatching), from near no more than SPAN_LEAST either
  const fine = log2(acrossDot.mul(TEX * DOTS_PER_TEXEL)), octave = fine.max(Math.log2(SPAN_LEAST)), o0 = floor(octave), f = octave.sub(o0);
  const octaveF = fine.add(1).max(Math.log2(SPAN_LEAST)), oF = floor(octaveF), fF = octaveF.sub(oF);
  const waves = texture(waveTexture());
  /** the water's clock in seconds (a still's is fixed) */
  const clock = STILL ? uniform(number('seatime', 0)) : time;
  // (a tool that takes a row of stills of the moving water sets the clock here: tools/lookprobe/water_frames.mjs)
  if (STILL) (globalThis as { __seaClock?: unknown }).__seaClock = clock;
  /** how far a picture of octave n has drifted along the wind (in its own frame), at `run` of the swell's pace */
  const drift = (n: Nd, run: number) => vec2(Math.cos(WIND), Math.sin(WIND)).mul(fract(clock.mul(SWELL_RUN * run * SPAN_LEAST ** 0.25).mul(exp2(n.mul(-0.25)))));
  /** a point of the world (finest blocks) and its dot's extent turned by (c, s) */
  const turn = (q: Nd, c: Nd, s: Nd) => vec2(q.x.mul(c).sub(q.y.mul(s)), q.x.mul(s).add(q.y.mul(c)));
  // octave n: the picture spans 2^n finest blocks; every other one is turned a quarter round and all are shifted
  // apart, so that the octaves do not lie on each other (both keep the picture repeating every PERIOD blocks); each
  // is read twice, the second time turned by SWELL_TURN and drifting more slowly, and the two are added
  const octaveAt = (n: Nd) => {
    const size = exp2(n), odd = fract(n.mul(0.5)).greaterThan(0.25), p = select(size.greaterThan(PERIOD), pCoarse, pFine);
    const read = (angle: number, shift: Nd, run: number) => {
      // the picture's frame: a quarter round for odd octaves, and `angle` more
      const c = select(odd, float(-Math.sin(angle)), float(Math.cos(angle))), s = select(odd, float(Math.cos(angle)), float(Math.sin(angle)));
      const uv = turn(p, c, s).div(size).add(shift).add(drift(n, run)), dx = turn(dFdx(pFine), c, s).div(size), dy = turn(dFdy(pFine), c, s).div(size);
      const t = waves.sample(uv).grad(dx, dy);
      // the slope back in the world's axes
      const su = t.r.mul(2).sub(1).mul(4), sv = t.g.mul(2).sub(1).mul(4);
      return { slope: turn(vec2(su, sv), c, s.negate()), height: t.b.mul(2).sub(1).mul(4) };
    };
    const one = read(0, vec2(0.37, 0.71).mul(n), 1), two = read(SWELL_TURN, vec2(0.61, 0.13).mul(n), SWELL_SECOND);
    return { slope: one.slope.add(two.slope).mul(Math.SQRT1_2), height: one.height.add(two.height).mul(Math.SQRT1_2), second: two.height };
  };
  // the flecks' octave n likewise, but every other one turned by FLECK_TURN alone: their strokes stand across the
  // wind in every octave (turned a quarter round, two octaves faded into each other cross), and not all alike
  const flecksAt = (n: Nd, angle = 0, shift: Nd = vec2(0.53, 0.29), run = FLECK_RUN) => {
    const size = exp2(n), p = select(size.greaterThan(PERIOD), pCoarse, pFine), odd = fract(n.mul(0.5)).greaterThan(0.25);
    const c = select(odd, float(Math.cos(FLECK_TURN + angle)), float(Math.cos(angle))), s = select(odd, float(Math.sin(FLECK_TURN + angle)), float(Math.sin(angle)));
    const uv = turn(p, c, s).div(size).add(shift.mul(n)).add(drift(n, run)), dx = turn(dFdx(pFine), c, s).div(size), dy = turn(dFdy(pFine), c, s).div(size);
    return waves.sample(uv).grad(dx, dy).a.mul(2).sub(1).mul(8);
  };
  const a = octaveAt(o0), b = octaveAt(o0.add(1)), w0 = float(1).sub(f), w1 = f, keep = float(1).div(w0.mul(w0).add(w1.mul(w1)).sqrt());
  const p = pFine, gust = mix(float(PATCHY[0]), float(PATCHY[1]), sin(dot(p, vec2(3, 2).mul(TURN)).add(0.7)).mul(sin(dot(p, vec2(-2, 5).mul(TURN)).add(2.1))).mul(0.5).add(0.5));
  const slopeShare = mix(float(SWELL), float(SWELL_NEAR), nearest).mul(surface);
  const slope = a.slope.mul(w0).add(b.slope.mul(w1)).mul(keep).mul(slopeShare).mul(gust);
  const facing = normalize(vec3(slope.x.negate(), 1, slope.y.negate()));
  const eye = normalize(cameraPosition.sub(positionWorld));
  const fresnel = (n: Nd) => float(0.02).add(pow(float(1).sub(max(dot(n, eye), 0)), 5).mul(0.98));
  const level = fresnel(vec3(0, 1, 0)), waved = fresnel(facing);
  // the flecks: where a crest of the flecks' waves rises above the line (lower where the wind is strong, and on the
  // swell's crests, so that they come in groups along them and the troughs between lie calm), with an edge a dot
  // wide; each octave's own, faded as the octaves are. The line rises and falls with the time, in each patch of
  // the swell at its own time (by the swell's second picture), so that the flecks come and go in groups
  const swell = a.height.mul(w0).add(b.height.mul(w1)).mul(keep), patch = a.second.mul(w0).add(b.second.mul(w1)).mul(keep);
  const sway = sin(clock.mul((2 * Math.PI) / FLECK_LIFE).add(patch.mul(2.4))).mul(FLECK_SWAY);
  const line = float(FLECK).sub(gust.sub(1).mul(FLECK_GUST / (PATCHY[1] - 1))).sub(swell.mul(FLECK_CREST)).add(sway);
  const broken = (h: Nd) => smoothstep(line.sub(fwidth(h)), line.add(fwidth(h)), h);
  const fleck = broken(flecksAt(oF)).mul(float(1).sub(fF)).add(broken(flecksAt(oF.add(1))).mul(fF)).mul(flecked);
  // the glitter: where two pictures of the flecks' waves an octave finer than the swell's, turned apart and drifting
  // against each other, both peak (they meet and part again: the points twinkle), more at a slant to the water
  const glint = (h: Nd, k: Nd) => smoothstep(SPARKLE, SPARKLE + 0.6, min(h, k));
  const sparkle = glint(flecksAt(o0.sub(1), 1.9, vec2(0.21, 0.83), 1.1), flecksAt(o0.sub(1), -1.3, vec2(0.77, 0.41), -0.8))
    .mul(clamp(pow(float(1).sub(eye.y), SPARKLE_SLANT).mul(3), 0, 1)).mul(flecked);
  // the light on the bed of the shallows: the swell's height at half its span, twice, drifting apart; a line where
  // either crosses its middle
  const bed = (angle: number, shift: Nd, run: number) => {
    const n = o0.sub(1), size = exp2(n), c = Math.cos(angle), s = Math.sin(angle);
    const uv = turn(pFine, float(c), float(s)).div(size).add(shift).add(drift(n, run)), dx = turn(dFdx(pFine), float(c), float(s)).div(size), dy = turn(dFdy(pFine), float(c), float(s)).div(size);
    const h = waves.sample(uv).grad(dx, dy).b.mul(2).sub(1).mul(4);
    return float(1).sub(smoothstep(0, fwidth(h).mul(CAUSTIC_WIDTH), abs(h)));
  };
  const caustic = max(bed(0.3, vec2(0.11, 0.57), CAUSTIC_RUN), bed(2.2, vec2(0.83, 0.29), -CAUSTIC_RUN * 0.8)).mul(nearest).mul(surface);
  return {
    colour,
    normal: transformNormalToView(facing),
    mirror: mirror.mul(waved.div(level)).add(lin(SKY).mul(waved.sub(level))).add(lin(FOAM).mul(fleck.mul(FLECK_WHITE))).add(vec3(1, 1, 1).mul(sparkle)),
    place(picture, m, r, b, hx, hz) {
      if (picture && depths.value !== picture) { depths.value = picture; const im = picture.image as { width: number; height: number }; texels.value.set(im.width, im.height); }
      known.value = picture ? 1 : 0;
      toMap.value.set(m[0], m[1], m[2], m[3], m[4], m[5], 0, 0, 1);
      round.value = r; blocks.value = b;
      const wrap = (v: number, period: number) => ((v % period) + period) % period;
      home.value.set(wrap(hx, PERIOD), wrap(hz, PERIOD));
      homeCoarse.value.set(wrap(hx, PERIOD_COARSE), wrap(hz, PERIOD_COARSE));
    },
    moving: (across, dots) => !STILL && (across * blocks.value) / dots < SURFACE_UNTIL[1] * MOVING_SLACK,
  };
}
