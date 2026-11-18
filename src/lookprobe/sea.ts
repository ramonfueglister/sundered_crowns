// The sea's depth and its surface, for the stage's water (stage.ts). Two things make open water read as water from
// afar and near alike, as the sea of EU5's map does:
//  - its depth: the sea over the shelves is light, the open ocean dark. The depths are measured ones, the sea bed of
//    the game map's height data (public/map/height.bin.gz), kept as a small picture (public/map/depth.png, made by
//    tools/worldprobe/build_depth.py) that every step of the view reads alike, so the sea's colour does not change
//    from one step to the next; the colours of the water's own corners (terrain.ts, light by the coast) stay under it.
//  - its surface: a wind sea of a few long-crested waves, as directions only (the water's corners stay where they
//    are: the glide and the shores reckon with fixed heights). Seen as flat as the view sees it, the sky's share in
//    what water gives back rises steeply with how far a wave turns it from the eye (Fresnel, Schlick's form), so the
//    waves show as soft lighter and darker bands, and the mirror image of what stands by the water breaks with them.
//    A wave is drawn where it is wider than a few of the picture's dots, and fades out before it would flicker.
// The waves lie in the world's finest blocks, as true to scale as the land: they do not grow as the view widens.
import * as THREE from 'three/webgpu';
import { Fn, cameraPosition, clamp, cos, dot, float, fract, fwidth, length, materialColor, max, mix, normalize, positionWorld, pow, select, sin, smoothstep, step, texture, transformNormalToView, uniform, vec2, vec3 } from 'three/tsl';
import { WATER_DEEP } from './terrain';

/** how the depth picture holds the depth: byte = 255 · ln(1 + d / DEPTH_D0) / ln(1 + DEPTH_MOST / DEPTH_D0), in metres (as build_depth.py) */
export const DEPTH_D0 = 20, DEPTH_MOST = 6000;
/** the depth picture's share for the sea beyond the game map, of which no depths are known: open ocean (about 3000 m) */
const BEYOND = 0.88;
/** the open ocean and the deep sea (sRGB): a dark blue that the coast's turquoise passes into */
const OCEAN = new THREE.Color(0x1b5a7a), ABYSS = new THREE.Color(0x143f5f);
/** the sky as the water gives it back where a wave turns towards it (linear light, at the share Fresnel gives) */
const SKY = new THREE.Color(0xcfe0f2);
/**
 * The waves: each a direction of whole turns over 1024 finest blocks (so that the pattern repeats over 1024 blocks
 * and the view's own place can be taken modulo that), and its steepness (rise over run). A finest block is about
 * 0.3 km: what shows is the short wind sea seen from high above, wavelengths 1024 / |n| of about 1.3 to 5.6 blocks,
 * running within some 40 degrees of the wind. From farther away they are narrower than the picture's dots and the
 * sea is smooth, as it is seen from that far.
 */
const WAVES: readonly { n: readonly [number, number]; slope: number; turn: number }[] = [
  { n: [150, 105], slope: 0.03, turn: 0.3 },
  { n: [205, 238], slope: 0.035, turn: 1.7 },
  { n: [470, 130], slope: 0.04, turn: 4.1 },
  { n: [330, 470], slope: 0.035, turn: 2.6 },
  { n: [770, 170], slope: 0.04, turn: 5.3 },
  { n: [560, 650], slope: 0.035, turn: 0.9 },
];
/** a wave shows where it is this many of the picture's dots long or more, and fades out down to the first number */
const SEEN_FROM: readonly [number, number] = [5, 11];
/** the waves come in patches (gusts of wind): their strength runs between these shares over two long waves */
const PATCHY: readonly [number, number] = [0.45, 1.25];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TSL's node types do not carry through sums and mixes
type Nd = any;
const PERIOD = 1024, TURN = (2 * Math.PI) / PERIOD;
/** how strongly the bands of sky show (1: as Fresnel gives them) */
const BANDS = 1;

export interface Sea {
  /** the water's colour from its corners' colour (which carries the material's colour) */
  colour(corners: Nd): Nd;
  /** the surface's direction, in the view's frame */
  normal: Nd;
  /** what the water gives back: the mirror image (`mirror`) broken by the waves, and the sky's bands */
  mirror: Nd;
  /**
   * Tells where the stage lies on the world: the depth picture (null: no depths, the water's own colours), how a
   * point (x, z) of the stage lies on it (u = a·x + b·z + c, v = d·x + e·z + f, in shares of the picture), after how
   * many shares the picture's u comes round again (0: never; beyond 1 lies sea of no known depth), how many finest
   * blocks a block of the stage is, and the stage's (0, 0) in finest blocks.
   */
  place(depths: THREE.Texture | null, toMap: readonly number[], round: number, blocks: number, homeX: number, homeZ: number): void;
}

/** The sea's nodes; `mirror` is what the water gives back where it lies level (the stage's tinted mirror image). */
export function createSea(mirror: Nd): Sea {
  const none = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  none.needsUpdate = true;
  const depths = texture(none), known = uniform(0), toMap = uniform(new THREE.Matrix3()), round = uniform(0);
  const blocks = uniform(1), home = uniform(new THREE.Vector2());
  // the depth picture's share where this point of the water lies (0: as shallow as the coast; no depths: 0)
  const share = Fn(() => {
    const at = toMap.mul(vec3(positionWorld.x, positionWorld.z, 1)), u = select(round.greaterThan(0), fract(at.x.div(round)).mul(round), at.x), v = at.y;
    const onMap = step(0, u).mul(step(u, 1)).mul(step(0, v)).mul(step(v, 1));
    return mix(float(BEYOND), depths.sample(vec2(u, v.oneMinus())).r, onMap).mul(known);
  })();
  const deep = new THREE.Color(...WATER_DEEP), ocean = OCEAN.clone(), abyss = ABYSS.clone();
  const colour = (corners: Nd) => {
    const t = share;
    // over the shelves (up to about 100 m) the water is a lighter turquoise; beyond (from about 130 m to 2000 m) it turns to the ocean's blue
    const shelf = float(1).sub(smoothstep(0.1, 0.3, t)), open = smoothstep(0.32, 0.8, t);
    const lighter = mix(corners, corners.mul(vec3(1.03, 1.1, 1.06)), shelf.mul(0.4));
    // the ocean keeps the light and dark patches of the corners' colour
    const patches = clamp(dot(corners, vec3(0.2126, 0.7152, 0.0722)).div(dot(materialColor.rgb, vec3(deep.r, deep.g, deep.b).mul(vec3(0.2126, 0.7152, 0.0722))).max(1e-4)), 0.7, 1.3);
    const blue = mix(vec3(ocean.r, ocean.g, ocean.b), vec3(abyss.r, abyss.g, abyss.b), smoothstep(0.75, 0.95, t)).mul(materialColor.rgb).mul(patches);
    return mix(lighter, blue, open.mul(0.92));
  };
  // the surface: the slope of the sum of the waves, each faded out where it is narrower than a few dots
  const p = positionWorld.xz.mul(blocks).add(home), across = length(fwidth(p));
  const gust = mix(float(PATCHY[0]), float(PATCHY[1]), sin(dot(p, vec2(3, 2).mul(TURN)).add(0.7)).mul(sin(dot(p, vec2(-2, 5).mul(TURN)).add(2.1))).mul(0.5).add(0.5));
  let slope: Nd = vec2(0, 0);
  for (const w of WAVES) {
    const k = vec2(w.n[0] * TURN, w.n[1] * TURN), length_ = PERIOD / Math.hypot(w.n[0], w.n[1]);
    const seen = smoothstep(SEEN_FROM[0], SEEN_FROM[1], float(length_).div(across));
    slope = slope.add(k.normalize().mul(cos(dot(k, p).add(w.turn)).mul(w.slope).mul(seen)));
  }
  slope = slope.mul(gust);
  const facing = normalize(vec3(slope.x.negate(), 1, slope.y.negate()));
  const eye = normalize(cameraPosition.sub(positionWorld));
  const fresnel = (n: Nd) => float(0.02).add(pow(float(1).sub(max(dot(n, eye), 0)), 5).mul(0.98));
  const level = fresnel(vec3(0, 1, 0)), waved = fresnel(facing);
  const sky = SKY.clone();
  return {
    colour,
    normal: transformNormalToView(facing),
    mirror: mirror.mul(waved.div(level)).add(vec3(sky.r, sky.g, sky.b).mul(waved.sub(level).mul(BANDS))),
    place(picture, m, r, b, hx, hz) {
      if (picture && depths.value !== picture) depths.value = picture;
      known.value = picture ? 1 : 0;
      toMap.value.set(m[0], m[1], m[2], m[3], m[4], m[5], 0, 0, 1);
      round.value = r; blocks.value = b;
      home.value.set(((hx % PERIOD) + PERIOD) % PERIOD, ((hz % PERIOD) + PERIOD) % PERIOD);
    },
  };
}
