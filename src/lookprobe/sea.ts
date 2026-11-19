// The sea's depth and its surface, for the stage's water (stage/materials.ts), with EU5's map as the bar of quality
// (tools/lookprobe/gauntlet_water.py measures both alike):
//  - its colour: a muted blue, lighter and greener by the coast, darker over the open ocean. The coast's band comes
//    from the colours of the water's own corners (terrain.ts, lighter within a few columns of the land), which this
//    reads back and draws in its own colours; the open ocean from the measured depths, the sea bed of the game map's
//    height data (public/map/height.bin.gz), kept as a small picture (public/map/depth.png, made by
//    tools/worldprobe/build_depth.py) that every step of the view reads alike, so the sea's colour does not change
//    from one step to the next.
//  - its surface: a wind sea as directions only (the water's corners stay where they are: the glide and the shores
//    reckon with fixed heights). The waves are a picture made once at the start (`waveTexture`): a height field of a
//    natural spectrum (every octave of wavelengths holds the same share of the slopes), worked out by the inverse
//    Fourier transform, so that it repeats seamlessly. It is laid over the world at the two octaves whose waves are a
//    few of the picture's dots long where it is seen, faded from one to the next as the view widens: the sea is
//    rippled alike from near and from afar, as EU5's is, and a wave never gets narrower than a dot and flickers.
//    (The six long-crested sine waves this had before stood in rows and showed as stripes from near.)
//    Seen as flat as the view sees it, the sky's share in what water gives back rises steeply with how far a wave
//    turns it from the eye (Fresnel, Schlick's form), so the waves show as soft lighter and darker patches, and the
//    mirror image of what stands by the water breaks with them. From near, the sun glints on the steepest waves and
//    their crests break white where the wind is strong.
// The waves lie in the world's blocks, so that they stay where they are when the view moves.
import * as THREE from 'three/webgpu';
import { asin, cameraPosition, cos, clamp, dFdx, dFdy, dot, exp2, float, floor, fract, fwidth, length, log2, materialColor, max, mix, normalize, positionWorld, pow, select, sin, smoothstep, step, texture, transformNormalToView, uniform, vec2, vec3 } from 'three/tsl';
import { SEA_Y } from './layout';
import { WATER_DEEP, WATER_SHALLOW } from './terrain';

/** how the depth picture holds the depth: byte = 255 · ln(1 + d / DEPTH_D0) / ln(1 + DEPTH_MOST / DEPTH_D0), in metres (as build_depth.py) */
export const DEPTH_D0 = 20, DEPTH_MOST = 6000;
/** the depth picture's share for the sea beyond the game map, of which no depths are known: open ocean (about 3000 m) */
const BEYOND = 0.88;
/**
 * The water's colours (sRGB, as lit by the stage's light they come out near EU5's: open water L 44 to 46, a -7 to
 * -10, b -16; by the coast some 5 lighter and greener): the water a few columns out from the coast and farther, the
 * water at the coast, the open ocean (from about 130 m deep) and the deep sea (from about 2000 m).
 */
const OPEN = new THREE.Color(0x42607a), COAST = new THREE.Color(0x5a9eaa), OCEAN = new THREE.Color(0x3d5878), ABYSS = new THREE.Color(0x30496a);
/**
 * the coast's band from the depth picture: how many of the picture's dots out from the coast it reaches, how strongly
 * it shows (1: as the corners' band at the coast), and from how many dots of the picture a dot of the depth picture is
 * too coarse for it, wholly at the second
 */
const HALO = 46, HALO_SHARE = 0.8, HALO_UNTIL: readonly [number, number] = [110, 220];
/** how much darker the water's colour is in the nearest views, against their brighter light */
const NEAREST_DARKER = 0.72;
/** the sky as the water gives it back where a wave turns towards it (linear light, at the share Fresnel gives) */
const SKY = new THREE.Color(0xcfe0f2);
/** the wave picture: its size in texels, and how many of the picture's dots a texel is laid over (between this and twice it) */
const TEX = 256, DOTS_PER_TEXEL = 1.4;
/**
 * the waves' slope, as the root of the mean square of rise over run: from afar, and from nearest (where the view is
 * steeper and the eye sees less of the sky in a wave)
 */
const SLOPE = 0.021, SLOPE_NEAR = 0.08;
/** the wind's direction in the wave picture (radians from its u axis), and the share of the waves that runs in all directions alike */
const WIND = 0.55, ROUND = 0.8;
/** the waves come in patches (gusts of wind): their strength runs between these shares over two long waves */
const PATCHY: readonly [number, number] = [0.55, 1.25];
/** the sun's glints and the white crests show fully where a dot is up to the first many finest blocks wide, and not from the second */
const NEAR: readonly [number, number] = [0.25, 0.6];
/**
 * the glints: how sharply the light is mirrored, how bright (the sun's glare, linear light), and how far above the
 * eye's own height the light stands that they answer, in spreads of the waves' slope (the steeper waves glint;
 * from afar and from nearest, where the waves are calmer)
 */
const GLINT_SHARP = 4000, GLINT = 2, GLINT_SPREADS: readonly [number, number] = [3.0, 2.3];
/** the white crests: from which height of the waves (in shares of their spread) they show, fully at the second */
const CREST: readonly [number, number] = [1.6, 2.6];
/** and from which steepness (in spreads of the slope) they show, fully at the second */
const STEEP: readonly [number, number] = [1.8, 2.6];
const FOAM = new THREE.Color(0xe8f0f0);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TSL's node types do not carry through sums and mixes
type Nd = any;
/** the view's place on the world is taken modulo these many finest blocks: the fine waves', and the coarse ones' (beyond FINE_MOST) */
const PERIOD = 1024, PERIOD_COARSE = 65536, TURN = (2 * Math.PI) / PERIOD;
/** how strongly the bands of sky show (1: as Fresnel gives them) */
const BANDS = 1;

export interface Sea {
  /** the water's colour from its corners' colour (which carries the material's colour) */
  colour(corners: Nd): Nd;
  /** the surface's direction, in the view's frame */
  normal: Nd;
  /** what the water gives back: the mirror image (`mirror`) broken by the waves, the sky's bands, the glints and the crests */
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
 * The wave picture: the slopes along u and v (red, green: rise over run in shares of four times their spread, about
 * 0.5 level) and the height (blue: in shares of eight times its spread about 0.5). A height field of random phases
 * whose power falls as the fourth power of the wavenumber (so that its slopes hold the same share in every octave),
 * mostly running with the wind, from 2 to 90 waves across the picture.
 */
export function waveTexture(): THREE.DataTexture {
  const n = TEX, random = seeded(1291), hr = new Float64Array(n * n), hi = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const kx = i < n / 2 ? i : i - n, ky = j < n / 2 ? j : j - n, k = Math.hypot(kx, ky);
    if (k < 2 || k > 90) continue;
    const along = Math.cos(Math.atan2(ky, kx) - WIND), power = (ROUND + (1 - ROUND) * along * along) * Math.exp(-((k / 70) ** 2)) / k ** 4;
    // a Gaussian number of each part (Box and Muller)
    const r = Math.sqrt(-2 * Math.log(1 - random())) * Math.sqrt(power), a = 2 * Math.PI * random();
    hr[j * n + i] = r * Math.cos(a); hi[j * n + i] = r * Math.sin(a);
  }
  // the slopes are the transforms of i·k times the heights' (k in radians per texel)
  const slope = (axis: 0 | 1) => {
    const re = new Float64Array(n * n), im = new Float64Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = ((axis === 0 ? (i < n / 2 ? i : i - n) : j < n / 2 ? j : j - n) * 2 * Math.PI) / n, at = j * n + i;
      re[at] = -hi[at] * k; im[at] = hr[at] * k;
    }
    return inverse2(re, im);
  };
  const su = slope(0), sv = slope(1), h = inverse2(hr.slice(), hi.slice());
  const spread = (v: Float64Array) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
  const s = Math.sqrt((spread(su) ** 2 + spread(sv) ** 2) / 2), hs = spread(h);
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round(127.5 + 127.5 * v)));
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    data[i * 4] = byte(su[i] / (4 * s)); data[i * 4 + 1] = byte(sv[i] / (4 * s)); data[i * 4 + 2] = byte(h[i] / (8 * hs)); data[i * 4 + 3] = 255;
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
  // as the coast; no depths: 0) and the coast's distance in dots of the picture
  const at = toMap.mul(vec3(positionWorld.x, positionWorld.z, 1)), u = select(round.greaterThan(0), fract(at.x.div(round)).mul(round), at.x), v = at.y;
  const onMap = step(0, u).mul(step(u, 1)).mul(step(0, v)).mul(step(v, 1)), seen = depths.sample(vec2(u, v.oneMinus()));
  const share = mix(float(BEYOND), seen.r, onMap).mul(known);
  const coastTexels = mix(float(COAST_REACH), seen.g.mul(255).sub(128).mul(COAST_REACH / 128), onMap);
  // (the depth picture's size in dots, from the depth picture itself)
  const texels = uniform(new THREE.Vector2(1, 1)), dotsPerTexel = float(1).div(length(fwidth(vec2(at.x, at.y).mul(texels))).max(1e-6));
  const coastDots = coastTexels.mul(dotsPerTexel);
  // where the water lies in finest blocks, and how many of them a dot of the picture is wide there
  const world = positionWorld.xz.mul(blocks);
  const pFine = world.add(home), pCoarse = world.add(homeCoarse);
  const across = length(fwidth(pFine));
  /** 1 in the nearest views (a street of houses across the picture), 0 from a few hundred blocks across (by a dot's width alone) */
  const nearest = float(1).sub(smoothstep(0.04, 0.12, length(dFdx(pFine))));
  const lin = (c: THREE.Color) => vec3(c.r, c.g, c.b);
  const lum = (c: Nd) => dot(c, vec3(0.2126, 0.7152, 0.0722));
  const deep = new THREE.Color(...WATER_DEEP), shallow = new THREE.Color(...WATER_SHALLOW);
  const ratioShallow = (0.2126 * shallow.r + 0.7152 * shallow.g + 0.0722 * shallow.b) / (0.2126 * deep.r + 0.7152 * deep.g + 0.0722 * deep.b);
  const colour = (corners: Nd) => {
    const t = share;
    // how light the corners are against the open water's colour: up to ratioShallow by the coast (terrain.ts), and
    // a tenth lighter or darker in broad patches everywhere
    const ratio = lum(corners).div(lum(materialColor.rgb.mul(lin(deep))).max(1e-4));
    const corner = smoothstep(1.06, ratioShallow * 0.96, ratio);
    // the sea is lighter, too, within HALO dots of the coast as the depth picture has it (its dots are some 8 finest
    // blocks wide: the corners' band is but a column or two wide, as wide as a sandbank from near and a hair from
    // afar); from near, where a dot of the depth picture is wider than HALO_UNTIL dots of the picture, it would not
    // follow the coast closely enough, and the band is the corners' alone (lakes and rivers lie above the sea)
    const sea = float(1).sub(smoothstep(SEA_Y + 0.005, SEA_Y + 0.02, positionWorld.y)).mul(known).mul(float(1).sub(smoothstep(HALO_UNTIL[0], HALO_UNTIL[1], dotsPerTexel)));
    const halo = float(1).sub(smoothstep(0, HALO, coastDots.max(0))).mul(sea);
    // (from nearest the corners' band is a fifth of the picture wide, and shows at half its strength)
    const coast = max(corner.mul(mix(float(1), float(0.5), nearest)), halo.mul(halo).mul(HALO_SHARE));
    const patches = clamp(ratio.div(mix(float(1), float(ratioShallow), coast)), 0.85, 1.15);
    // (the near view's light is brighter: the water is as dark there as it looks from afar)
    const near = mix(lin(OPEN), lin(COAST), coast).mul(materialColor.rgb).mul(patches).mul(mix(float(1), float(NEAREST_DARKER), nearest));
    // beyond the shelves (from about 130 m to 2000 m) the water turns to the ocean's darker blue
    const open = smoothstep(0.32, 0.8, t);
    const blue = mix(lin(OCEAN), lin(ABYSS), smoothstep(0.75, 0.95, t)).mul(materialColor.rgb).mul(patches);
    return mix(near, blue, open.mul(float(1).sub(coast.mul(0.6))));
  };
  // the surface: the wave picture at the two octaves whose texels are DOTS_PER_TEXEL to twice that many dots wide here
  // (by the geometric mean of a dot's width and height on the water: seen at a slant, a dot reaches farther up the
  // water than across it, and by its larger side the waves would be stretched across the picture into streaks)
  const acrossWaves = length(dFdx(pFine)).mul(length(dFdy(pFine))).sqrt();
  const octave = log2(acrossWaves.mul(TEX * DOTS_PER_TEXEL)).max(0), o0 = floor(octave), f = octave.sub(o0);
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
    return { slope: select(odd, vec2(sv, su.negate()), vec2(su, sv)), height: s.b.mul(2).sub(1).mul(8) };
  };
  const a = octaveAt(o0), b = octaveAt(o0.add(1)), w0 = float(1).sub(f), w1 = f, keep = float(1).div(w0.mul(w0).add(w1.mul(w1)).sqrt());
  const p = pFine, gust = mix(float(PATCHY[0]), float(PATCHY[1]), sin(dot(p, vec2(3, 2).mul(TURN)).add(0.7)).mul(sin(dot(p, vec2(-2, 5).mul(TURN)).add(2.1))).mul(0.5).add(0.5));
  const slopeShare = mix(float(SLOPE), float(SLOPE_NEAR), nearest);
  const slope = a.slope.mul(w0).add(b.slope.mul(w1)).mul(keep).mul(slopeShare).mul(gust);
  const height = a.height.mul(w0).add(b.height.mul(w1)).mul(keep).mul(gust);
  const facing = normalize(vec3(slope.x.negate(), 1, slope.y.negate()));
  const eye = normalize(cameraPosition.sub(positionWorld));
  const fresnel = (n: Nd) => float(0.02).add(pow(float(1).sub(max(dot(n, eye), 0)), 5).mul(0.98));
  const level = fresnel(vec3(0, 1, 0)), waved = fresnel(facing);
  // the glints: the sun as the water gives it back, from near only (a wave is then many dots long, and the sun's
  // mirror image on it a speck); the light the glints answer stands across the water from the eye, at the sun's height
  const nearShare = float(1).sub(smoothstep(NEAR[0], NEAR[1], across));
  const lift = asin(eye.y.clamp(0, 1)).add(slopeShare.mul(mix(float(2 * GLINT_SPREADS[0]), float(2 * GLINT_SPREADS[1]), nearest))).min(1.4), over = normalize(vec2(eye.x, eye.z).negate());
  const light = vec3(over.x.mul(cos(lift)), sin(lift), over.y.mul(cos(lift)));
  const glint = pow(max(dot(facing, normalize(light.add(eye))), 0), GLINT_SHARP).mul(GLINT).mul(nearShare);
  // (a crest breaks where the wave is high and steep: specks, not the broad tops of the longest waves)
  const crest = smoothstep(CREST[0], CREST[1], height).mul(smoothstep(STEEP[0], STEEP[1], length(slope).div(slopeShare))).mul(nearShare).mul(smoothstep(0.9, 1.2, gust));
  const sky = SKY.clone();
  return {
    colour,
    normal: transformNormalToView(facing),
    mirror: mirror.mul(waved.div(level)).add(lin(sky).mul(waved.sub(level).mul(BANDS))).add(glint).add(lin(FOAM).mul(crest.mul(0.38))),
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
