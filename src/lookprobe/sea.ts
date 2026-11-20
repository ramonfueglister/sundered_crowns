// The sea's depth and its surface, for the stage's water (stage/materials.ts). EU5's map is the bar of quality for
// how the water changes with the distance it is seen from (tools/lookprobe/gauntlet_water.py measures both alike);
// its look is that of the rest of the world, a model of bright, clean colours:
//  - its colour comes from the depth: light turquoise over the shallows by the coast, a clear blue over the shelf,
//    deeper blue beyond its edge and dark blue over the deep sea, as full in colour as the land beside it (EU5's
//    water is as full as its land; a muted, greyish sea looked like a photograph laid into the model). The depths
//    are the sea bed of the game map's height data (public/map/height.bin.gz), kept as a small picture
//    (public/map/depth.png, made by tools/worldprobe/build_depth.py) that every step of the view reads alike, so the
//    sea's colour does not change from one step to the next. By the coast the water is lighter still: within a few
//    columns of the land by the colours of the water's own corners (terrain.ts, which this reads back), wider out
//    within some dots of the coast as the depth picture has it (`withCoast`).
//  - its surface changes with the distance, as EU5's does: from near and in the middle distance a calm swell, a few
//    long soft waves in which the sky and what stands by the water are mirrored, and small white flecks where the
//    wind breaks a crest; from farther out (a dot some blocks wide) the sea lies smooth, its colour the depth's alone.
//    The flecks are always a few dots large, so that they read as flecks of paint and never as a fine grey chop.
//    (The first round laid a natural wind sea of fine ripples over the water at every distance: it was measured
//    close to EU5's numbers, but looked like a photograph of the sea and did not belong to the model.)
//    Both come from one picture made once at the start (`waveTexture`): random waves worked out by the inverse
//    Fourier transform, so that it repeats seamlessly, laid over the world at the octave whose texels are a dot or
//    two wide where it is seen.
// The waves lie in the world's blocks, so that they stay where they are when the view moves.
import * as THREE from 'three/webgpu';
import { cameraPosition, clamp, dFdx, dFdy, dot, exp2, float, floor, fract, fwidth, length, log2, materialColor, max, mix, normalize, positionWorld, pow, select, sin, smoothstep, step, texture, transformNormalToView, uniform, vec2, vec3 } from 'three/tsl';
import { SEA_Y } from './layout';
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
/** how much darker the water's colour is in the nearest views, against their brighter light */
const NEAREST_DARKER = 0.74;
/** the sky as the water gives it back where a wave turns towards it (linear light, at the share Fresnel gives) */
const SKY = new THREE.Color(0xd8ecf6);
/** the wave picture: its size in texels, and how many of the picture's dots a texel is laid over (between this and twice it) */
const TEX = 256, DOTS_PER_TEXEL = 1.4;
/** from near the picture spans at least this many finest blocks, so that the flecks are as large as a part of a house, not specks */
const SPAN_LEAST = 32;
/** the swell's waves (2 to SWELL_K across the picture: 18 to 128 texels long) and the flecks' (FLECK_K, 3 to 8 texels) */
const SWELL_K = 14, FLECK_K: readonly [number, number] = [32, 80];
/** the swell's slope, as the root of the mean square of rise over run: from afar, and from nearest (where the view is steeper and sees less of the sky) */
const SWELL = 0.022, SWELL_NEAR = 0.05;
/** the wind's direction in the wave picture (radians from its u axis); the flecks' crests stand across it */
const WIND = 0.55;
/** the waves come in patches (gusts of wind): their strength runs between these shares over two long waves */
const PATCHY: readonly [number, number] = [0.6, 1.3];
/**
 * the flecks: from which height of the flecks' waves (in spreads) a crest breaks white where the wind is at its usual
 * strength, how much lower where it is strongest, and how white they are (a share of FOAM)
 */
const FLECK = 2.35, FLECK_GUST = 0.45, FLECK_WHITE = 0.85;
const FOAM = new THREE.Color(0xf2f8f6);
/**
 * how far the swell and the flecks reach: they show fully up to the first many finest blocks to a dot of the picture
 * and are gone from the second (the sea lies smooth from about 2000 blocks across the picture on)
 */
const SURFACE_UNTIL: readonly [number, number] = [0.5, 1.3];
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
 * spread, about 0.5 level), and the height of the flecks' waves (alpha: in shares of eight times its spread about
 * 0.5). The swell is a height field of random phases whose power falls as the fourth power of the wavenumber, from 2
 * to SWELL_K waves across the picture; the flecks' waves are short (FLECK_K) and run with the wind, so that their
 * crests, where they rise high enough to break, are short strokes across it.
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
  const [fr, fi] = field((kx, ky) => { const k = Math.hypot(kx, ky); return k < FLECK_K[0] || k > FLECK_K[1] ? 0 : along(kx, ky) ** 8 / k ** 2; });
  // the slopes are the transforms of i·k times the heights' (k in radians per texel)
  const slope = (axis: 0 | 1) => {
    const re = new Float64Array(n * n), im = new Float64Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = ((axis === 0 ? (i < n / 2 ? i : i - n) : j < n / 2 ? j : j - n) * 2 * Math.PI) / n, at = j * n + i;
      re[at] = -si[at] * k; im[at] = sr[at] * k;
    }
    return inverse2(re, im);
  };
  const su = slope(0), sv = slope(1), f = inverse2(fr, fi);
  const spread = (v: Float64Array) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
  const s = Math.sqrt((spread(su) ** 2 + spread(sv) ** 2) / 2), fs = spread(f);
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round(127.5 + 127.5 * v)));
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    data[i * 4] = byte(su[i] / (4 * s)); data[i * 4 + 1] = byte(sv[i] / (4 * s)); data[i * 4 + 2] = 128; data[i * 4 + 3] = byte(f[i] / (8 * fs));
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
  /** 1 where the swell and the flecks show, 0 where the sea lies smooth */
  const surface = float(1).sub(smoothstep(SURFACE_UNTIL[0], SURFACE_UNTIL[1], acrossDot));
  const lin = (c: THREE.Color) => vec3(c.r, c.g, c.b);
  const lum = (c: Nd) => dot(c, vec3(0.2126, 0.7152, 0.0722));
  const deep = new THREE.Color(...WATER_DEEP), shallow = new THREE.Color(...WATER_SHALLOW);
  const ratioShallow = (0.2126 * shallow.r + 0.7152 * shallow.g + 0.0722 * shallow.b) / (0.2126 * deep.r + 0.7152 * deep.g + 0.0722 * deep.b);
  /** the colour of the depth's share t, through the stops of RAMP */
  const ramp = (t: Nd) => {
    let c: Nd = lin(new THREE.Color(RAMP[0][1]));
    for (let i = 1; i < RAMP.length; i++) c = mix(c, lin(new THREE.Color(RAMP[i][1])), smoothstep(RAMP[i - 1][0], RAMP[i][0], t));
    return c;
  };
  const colour = (corners: Nd) => {
    // how light the corners are against the open water's colour: up to ratioShallow by the coast (terrain.ts), and
    // a tenth lighter or darker in broad patches everywhere
    const ratio = lum(corners).div(lum(materialColor.rgb.mul(lin(deep))).max(1e-4));
    const corner = smoothstep(1.08, ratioShallow * 0.97, ratio);
    // the sea is lighter, too, within HALO dots of the coast as the depth picture has it (its dots are some 36 finest
    // blocks wide: the corners' band is but a few columns wide, as wide as a sandbank from near and a hair from afar);
    // from near, where a dot of the depth picture is wider than HALO_UNTIL dots of the picture, it would not follow the
    // coast closely enough, and the band is the corners' alone (lakes and rivers lie above the sea)
    const coarse = smoothstep(HALO_UNTIL[0], HALO_UNTIL[1], dotsPerTexel);
    const sea = float(1).sub(smoothstep(SEA_Y + 0.005, SEA_Y + 0.02, positionWorld.y)).mul(known).mul(float(1).sub(coarse));
    const halo = float(1).sub(smoothstep(0, HALO, coastDots.max(0))).mul(sea);
    // (from near the corners' band is the only one, a column or two wide, and shows fully: a light rim along the coast)
    const coast = max(corner.mul(mix(float(0.7), float(1), coarse)), halo.mul(halo).mul(HALO_SHARE));
    const patches = clamp(ratio.div(mix(float(1), float(ratioShallow), corner)), 0.9, 1.1);
    // from near, all the picture lies within a dot or two of the depth picture, which runs down to the coast's depth
    // across them: there the water beyond the corners' band is the shelf's (and the band the shallows')
    const t = mix(share, max(share, float(RAMP[1][0]).mul(float(1).sub(corner))), coarse);
    // (the near view's light is brighter: the water is as dark there as it looks from afar)
    return mix(ramp(t), lin(COAST), coast).mul(materialColor.rgb).mul(patches).mul(mix(float(1), float(NEAREST_DARKER), nearest));
  };
  // the surface: the wave picture at the two octaves whose texels are DOTS_PER_TEXEL to twice that many dots wide here
  // (from near at least SPAN_LEAST blocks across the picture), faded from one to the next; the flecks' at those
  // whose texels are twice as wide again (a fleck is then some 4 to 20 dots long: smaller, a stroke one dot high on
  // the slanted water reads as a grey hatching), from near no more than SPAN_LEAST either
  const fine = log2(acrossDot.mul(TEX * DOTS_PER_TEXEL)), octave = fine.max(Math.log2(SPAN_LEAST)), o0 = floor(octave), f = octave.sub(o0);
  const octaveF = fine.add(1).max(Math.log2(SPAN_LEAST)), oF = floor(octaveF), fF = octaveF.sub(oF);
  const waves = texture(waveTexture());
  // octave n: the picture spans 2^n finest blocks; every other one is turned a quarter round and all are shifted
  // apart, so that the octaves do not lie on each other (both keep the picture repeating every PERIOD blocks)
  const octaveAt = (n: Nd) => {
    const size = exp2(n), odd = fract(n.mul(0.5)).greaterThan(0.25), p = select(size.greaterThan(PERIOD), pCoarse, pFine);
    const turned = (q: Nd) => select(odd, vec2(q.y.negate(), q.x), q);
    const uv = turned(p).div(size).add(vec2(0.37, 0.71).mul(n)), dx = turned(dFdx(pFine)).div(size), dy = turned(dFdy(pFine)).div(size);
    const s = waves.sample(uv).grad(dx, dy);
    // the slope back in the world's axes (a turned picture's u runs along the world's z)
    const su = s.r.mul(2).sub(1).mul(4), sv = s.g.mul(2).sub(1).mul(4);
    return { slope: select(odd, vec2(sv, su.negate()), vec2(su, sv)), fleck: s.a.mul(2).sub(1).mul(8) };
  };
  const a = octaveAt(o0), b = octaveAt(o0.add(1)), w0 = float(1).sub(f), w1 = f, keep = float(1).div(w0.mul(w0).add(w1.mul(w1)).sqrt());
  const p = pFine, gust = mix(float(PATCHY[0]), float(PATCHY[1]), sin(dot(p, vec2(3, 2).mul(TURN)).add(0.7)).mul(sin(dot(p, vec2(-2, 5).mul(TURN)).add(2.1))).mul(0.5).add(0.5));
  const slopeShare = mix(float(SWELL), float(SWELL_NEAR), nearest).mul(surface);
  const slope = a.slope.mul(w0).add(b.slope.mul(w1)).mul(keep).mul(slopeShare).mul(gust);
  const facing = normalize(vec3(slope.x.negate(), 1, slope.y.negate()));
  const eye = normalize(cameraPosition.sub(positionWorld));
  const fresnel = (n: Nd) => float(0.02).add(pow(float(1).sub(max(dot(n, eye), 0)), 5).mul(0.98));
  const level = fresnel(vec3(0, 1, 0)), waved = fresnel(facing);
  // the flecks: where a crest of the flecks' waves rises above the line (lower where the wind is strong), with an
  // edge a dot wide; each octave's own, faded as the octaves are
  const line = float(FLECK).sub(gust.sub(1).mul(FLECK_GUST / (PATCHY[1] - 1)));
  const broken = (h: Nd) => smoothstep(line.sub(fwidth(h)), line.add(fwidth(h)), h);
  const fleck = broken(octaveAt(oF).fleck).mul(float(1).sub(fF)).add(broken(octaveAt(oF.add(1)).fleck).mul(fF)).mul(surface);
  return {
    colour,
    normal: transformNormalToView(facing),
    mirror: mirror.mul(waved.div(level)).add(lin(SKY).mul(waved.sub(level))).add(lin(FOAM).mul(fleck.mul(FLECK_WHITE))),
    place(picture, m, r, b, hx, hz) {
      if (picture && depths.value !== picture) { depths.value = picture; const im = picture.image as { width: number; height: number }; texels.value.set(im.width, im.height); }
      known.value = picture ? 1 : 0;
      toMap.value.set(m[0], m[1], m[2], m[3], m[4], m[5], 0, 0, 1);
      round.value = r; blocks.value = b;
      const wrap = (v: number, period: number) => ((v % period) + period) % period;
      home.value.set(wrap(hx, PERIOD), wrap(hz, PERIOD));
      homeCoarse.value.set(wrap(hx, PERIOD_COARSE), wrap(hz, PERIOD_COARSE));
    },
  };
}
