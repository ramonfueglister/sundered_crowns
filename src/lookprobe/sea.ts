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
//    picture has it (`withCoast`, sea_coast.ts). From near the bed shows through the shallows in place of that band
//    (sea_bed.ts): sand at the water's edge, turquoise over it, and the sea's own blue where the bed has fallen
//    away, which darkens out to the offing; from near its colours are greener, a teal, and lie in lighter and
//    darker patches over the bed's banks and hollows. Lakes and rivers above the sea have the same colour and
//    surface (stage/materials.ts), as deep in colour as they lie from their banks, without the surf and without
//    the mirror's picture.
//  - its surface changes with the distance: from near a calm swell, a few long soft waves in which the sky and what
//    stands by the water are mirrored, and on it the wind's ripples, strokes of lighter water with darker troughs,
//    small, a little bent, across the wind, in fields with calm water between them and fewer in the lee of the land,
//    the highest of them white flecks where the wind breaks a crest; and along the coast a thin line of foam at the
//    water's edge and fainter ones that come in to the shore (sea_shore.ts).
//    From a thousand blocks across the picture on the sea lies smooth, its colour the depth's alone, and from some
//    1500 the foam is gone too, on every screen alike (Ramon, 20 November 2026: "man sieht extrem weit rausgezoomt
//    immer noch wellen"; as calm as the water of the low-poly worlds, "gibt es schöneres wasser auch im poly
//    bereich nicht?"). The flecks are always a few dots large, so that they read as strokes of paint and never as a
//    fine grey chop or as specks.
//    (The first round laid a natural wind sea of fine ripples over the water at every distance: it was measured
//    close to EU5's numbers, but looked like a photograph of the sea and did not belong to the model. Up to the
//    sixth the near water was one blue up to a hard edge under a swell so strong that it lay in dark and light
//    blotches, with large strokes spread evenly over it and two rows of thick foam round every coast; Ramon, 21
//    November 2026: "das wasser ist das problem nicht die umgebung". EU5's nearest water is a calm body whose
//    colour changes with its depth, rippled all over, with its whitecaps in groups and no lines along its shores.)
//    Both come from one picture made once at the start (`waveTexture`, sea_waves.ts): random waves worked out by the
//    inverse Fourier transform, so that it repeats seamlessly, laid over the world at the octave whose texels are a
//    dot or two wide where it is seen.
// The waves lie in the world's blocks, so that they stay where they are when the view moves.
import * as THREE from 'three/webgpu';
import {
  cameraPosition,
  clamp,
  dFdx,
  dFdy,
  dot,
  float,
  floor,
  fwidth,
  length,
  log2,
  materialColor,
  max,
  min,
  mix,
  normalize,
  positionWorld,
  pow,
  sin,
  smoothstep,
  transformNormalToView,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { SEA_Y } from './layout';
import { BED, bedRelief, bedThrough } from './sea_bed';
import { readDepths } from './sea_depth';
import { PERIOD, SPAN_LEAST, STILL, createWaves } from './sea_drift';
import { RINGS_UNTIL, columnsOf, shoreFoam } from './sea_shore';
import { TEX } from './sea_waves';
import { WATER_DEEP, WATER_SHALLOW } from './terrain';

/**
 * The water's colours (sRGB) by the depth picture's share: at the coast, over the shallows (some 30 m), at the
 * shelf's edge (some 150 m), over the slope (some 700 m) and over the deep sea (some 3000 m). As the stage lights
 * them and mirrors the sky in them, they come out some 7 lighter and a little greener. Each stop's second colour is
 * the water's from near (HALO_UNTIL): greener, a teal that darkens to a slate blue, where the first colours' pure
 * blue read as a swimming pool's beside houses and trees (round 9; EU5's open water from near is Lab 44-56 / -3 to
 * -14 / -14 to -21, ours was 56-59 / -17 to -21 / -21 to -26 with the first colours and is 54-58 / -18 to -22 / -16
 * to -23 with these). OWN RULE: chosen by eye between the first colours and EU5's, which are greyer than the land of
 * this game would bear.
 */
const RAMP: readonly (readonly [number, number, number])[] = [
  [0, 0x22a6bd, 0x3bb0b6],
  [0.18, 0x1a8cc4, 0x2c97b0],
  [0.38, 0x1673b4, 0x25799f],
  [0.62, 0x155d9c, 0x215f88],
  [0.88, 0x124a84, 0x1c4a70],
];
/** the colour the water is drawn towards by the coast (within a few columns of the land, and within HALO dots of it) */
const COAST = new THREE.Color(0x48c3cb);
/**
 * the coast's band from the depth picture: how many of the picture's dots out from the coast it reaches, how strongly
 * it shows (1: as the corners' band at the coast), and from how many dots of the picture a dot of the depth picture is
 * too coarse for it, wholly at the second
 */
const HALO = 40,
  HALO_SHARE = 0.55,
  HALO_UNTIL: readonly [number, number] = [110, 220];
/** the corners' band: how near the coast its colour begins and is full (in shares of the corners' mix: 0 some 8 columns out, 1 at the coast) */
const RIM: readonly [number, number] = [0.1, 0.8];
/**
 * how much of the coast's colour the corners' band takes from near (where it is the only band): 0.7 until round 4, when
 * the light on the bed lit the band too; without it, a little more, so that the shallows stay as light
 */
const NEAR_RIM = 0.85;
/** where the water's edge shows, in columns from the coast as the corners have it (the bank covers the columns before it: shore.ts) */
const WATERLINE = 1.9;
/** how far the bed shows through the shallows, in finest blocks to a dot of the screen: fully up to the first, gone from the second */
const BED_UNTIL: readonly [number, number] = [0.5, 0.9];
/**
 * from near the water is at least as deep in colour as these shares of the depth picture: by the land, and in the
 * offing, OFFING_BLOCKS finest blocks out by the picture's coast (0.1 to 0.34 over 8 to 110 blocks until round 8: a
 * picture a hundred blocks across was one colour beyond its shallows, where EU5's nearest views darken into the
 * deep). OWN RULE: by eye against EU5's nearest views
 */
const OFFING: readonly [number, number] = [0.06, 0.5],
  OFFING_BLOCKS: readonly [number, number] = [4, 80];
/**
 * water above the sea (lakes, rivers) is as deep in colour as these shares of the depth picture: by its banks, and
 * from the second of INLAND_COLUMNS columns out (the corners know the bank's distance up to some 8 columns). OWN
 * RULE: by eye, a lake as deep in colour as the sea over its shelf, and a river, which is all bank, no paler than
 * the land's rivers were before (at 0.12 by the bank the Seine was a pale band beside its fields)
 */
const INLAND: readonly [number, number] = [0.2, 0.34],
  INLAND_COLUMNS: readonly [number, number] = [2.5, 8];
/**
 * from near the water is this much deeper or shallower in colour, in shares of the depth picture, over the bed's
 * hollows and banks (sea_bed.ts `bedRelief`): the open water lies in darker and lighter patches some 15 to 20 blocks
 * across and not as one sheet (the lightness of the water in a near picture, blurred over 25 dots, between its 5th
 * and 95th hundredth: 11-21 in EU5's nearest views, 7-8 in round 8, 9-13 with this and OFFING). OWN RULE: by eye
 */
const RELIEF = 0.09;
/** how much darker the water's colour is in the nearest views, against their brighter light */
const NEAREST_DARKER = 0.74;
/** the sky as the water gives it back where a wave turns towards it (linear light, at the share Fresnel gives) */
const SKY = new THREE.Color(0xd8ecf6);
/** how many dots of the picture a texel of the wave picture is laid over (between this and twice it) */
const DOTS_PER_TEXEL = 1.4;
/**
 * the swell's slope, as the root of the mean square of rise over run: from afar, and from nearest (where the view is
 * steeper and sees less of the sky). Two and a half times as much until round 7: the water lay in dark and light
 * blotches, where EU5's is one calm body
 */
const SWELL = 0.011,
  SWELL_NEAR = 0.02;
/** the waves come in patches (gusts of wind): their strength runs between these shares over two long waves */
const PATCHY: readonly [number, number] = [0.6, 1.3];
/**
 * the flecks: from which height of the flecks' waves (in spreads) a crest breaks white where the wind is at its usual
 * strength and the swell level, how much lower where the wind is strongest, how much lower for each spread of the
 * swell's height (on its crests) and of the height of waves four times as long (up to FLECK_GROUP_MOST spreads: the
 * flecks come in groups as wide as a few of the swell's waves, as EU5's whitecaps do), and how white they are (a
 * share of FOAM)
 */
const FLECK = 3.35,
  FLECK_GUST = 0.45,
  FLECK_CREST = 0.5,
  FLECK_GROUPS = 1,
  FLECK_GROUP_MOST = 1.3,
  FLECK_WHITE = 0.95;
/**
 * the ripples: the flecks' waves show from RIPPLE_BELOW spreads under the flecks' line as strokes of lighter water
 * (towards RIPPLE, by RIPPLE_SHARE), and their troughs as far below the mean as water darker by TROUGH: a fleck is
 * the white top of a wave among others, and the water between the flecks no smooth sheet (EU5's nearest water is
 * rippled all over, its whitecaps the tops of its ripples; ours was white strokes on a sheet of one blue). OWN RULE:
 * the numbers by eye against EU5's nearest pictures
 */
const RIPPLE = new THREE.Color(0xbfeef0),
  RIPPLE_BELOW = 1.8,
  RIPPLE_SHARE = 0.3,
  TROUGH = 0.08;
/**
 * the flecks' groups drift at this share of the pace of a swell as long as they are: from near, half as fast as the
 * flecks' own waves, as a group of waves on deep water runs half as fast as the waves in it (the group velocity:
 * Lamb, Hydrodynamics, 6th edition 1932, art. 236). At the swell's pace the groups ran through the picture, and the
 * flecks with them, five times as fast as their waves
 */
const GROUP_RUN = 0.1;
/** in the lee of the land the line lies FLECK_LEE spreads higher: fully within the first of these finest blocks of the depth picture's coast, not at all from the second */
const FLECK_LEE = 0.45,
  FLECK_FETCH: readonly [number, number] = [20, 150];
/** the flecks keep off the shore: none within the first of these columns from the coast, all from the second */
const FLECK_OFF: readonly [number, number] = [2.5, 7];
/** a fleck lives some FLECK_LIFE seconds: its line rises and falls by up to FLECK_SWAY spreads, at another time in each patch of the swell */
const FLECK_LIFE = 3.5,
  FLECK_SWAY = 1.1;
/** the glitter: points where two of the flecks' pictures one octave finer, drifting apart, both rise above SPARKLE spreads; brighter at a slant (SPARKLE_SLANT) */
const SPARKLE = 2.0,
  SPARKLE_SLANT = 2.2;
/**
 * the stage draws every picture while a dot in the middle of the picture is up to MOVING_SLACK times as wide as where
 * the swell or the foam along the coast ends (SURFACE_UNTIL, RINGS_UNTIL; the nearer bottom of the picture shows them
 * farther); beyond, the sea lies still and nothing needs drawing
 */
const MOVING_SLACK = 1.5;
/**
 * how many dots of the screen a dot of the picture is wide (as the stage sets it: stage/index.ts, setPixelRatio), so
 * that the swell reaches as far on a screen of fine dots as on any other
 */
const RATIO = STILL ? 1 : Math.min(globalThis.devicePixelRatio ?? 1, 2);
const FOAM = new THREE.Color(0xf2f8f6);
/**
 * how far the swell reaches, in finest blocks to a dot of the screen (RATIO): it shows fully up to the first and is
 * gone from the second (in a picture 1672 dots wide: fully up to some 400 blocks across, smooth from 1000 on); and the
 * flecks and the glitter, less far (up to 300, gone from 700), and the ripples, less far still (up to 170, gone from
 * 500: from farther their strokes were as long as a wood and lay over the sea like the grain of marble). OWN RULE,
 * after Ramon's word that the waves must not show far out (20 November 2026); the swell reached three times as far
 * before, as far as EU5's nearest view
 */
const SURFACE_UNTIL: readonly [number, number] = [0.25, 0.6],
  FLECKS_UNTIL: readonly [number, number] = [0.18, 0.42],
  RIPPLES_UNTIL: readonly [number, number] = [0.1, 0.3];
/** TSL's nodes of one number, a pair and a colour (or a direction) */
type Float = THREE.Node<'float'>;
type Vec2 = THREE.Node<'vec2'>;
type Vec3 = THREE.Node<'vec3'>;
/** the view's place on the world is taken modulo PERIOD finest blocks (sea_drift.ts), and for the waves wider than that modulo these */
const PERIOD_COARSE = 65536,
  TURN = (2 * Math.PI) / PERIOD;

export interface Sea {
  /**
   * the water's colour from its corners' colour (which carries the material's colour); `coast`: how many columns from
   * the coast the place lies, where the mesh knows it better than its corners' colour tells (the sea's faces:
   * sea_corners.ts)
   */
  colour(corners: Vec3, coast?: Float): Vec3;
  /** the surface's direction, in the view's frame */
  normal: Vec3;
  /** what the water gives back: the mirror image (`mirror`) broken by the swell, the sky in the swell, and the glitter */
  mirror: Vec3;
  /** the same for water that gives `level` back where it lies level (water above the sea, which the mirror's picture does not show) */
  giving(level: Vec3): Vec3;
  /**
   * Tells where the stage lies on the world: the depth picture (null: no depths, the water's own colours), how a
   * point (x, z) of the stage lies on it (u = a·x + b·z + c, v = d·x + e·z + f, in shares of the picture), after how
   * many shares the picture's u comes round again (0: never; beyond 1 lies sea of no known depth), how many finest
   * blocks a block of the stage is, and the stage's (0, 0) in finest blocks.
   */
  place(
    depths: THREE.Texture | null,
    toMap: readonly number[],
    round: number,
    blocks: number,
    homeX: number,
    homeZ: number,
  ): void;
  /** whether the water moves in a picture `across` blocks of the stage and `dots` dots wide (then every picture is to be drawn) */
  moving(across: number, dots: number): boolean;
}

/** The sea's nodes; `mirror` is what the water gives back where it lies level (the stage's tinted mirror image). */
export function createSea(mirror: Vec3): Sea {
  const blocks = uniform(1),
    home = uniform(new THREE.Vector2()),
    homeCoarse = uniform(new THREE.Vector2());
  const seen = whereSeen(blocks, home, homeCoarse),
    depth = readDepths(seen.pFine),
    s = surfaceOf(seen, depth.coastBlocks);
  const giving = (level: Vec3) =>
    level
      .mul(s.waved.div(s.level))
      .add(lin(SKY).mul(s.waved.sub(s.level)))
      .add(vec3(1, 1, 1).mul(s.sparkle));
  return {
    colour: (corners, coast) => waterColour(corners, coast, depth, seen, s),
    normal: transformNormalToView(s.facing),
    mirror: giving(mirror),
    giving,
    place(picture, m, r, b, hx, hz) {
      if (picture && depth.depths.value !== picture) {
        depth.depths.value = picture;
        // (three types a texture's image as unknown: the depth picture is an image or a canvas)
        const im = picture.image as { width: number; height: number };
        depth.texels.value.set(im.width, im.height);
      }
      depth.known.value = picture ? 1 : 0;
      depth.placed(m, b);
      depth.round.value = r;
      blocks.value = b;
      const wrap = (v: number, period: number) => ((v % period) + period) % period;
      home.value.set(wrap(hx, PERIOD), wrap(hz, PERIOD));
      homeCoarse.value.set(wrap(hx, PERIOD_COARSE), wrap(hz, PERIOD_COARSE));
    },
    moving: (across, dots) =>
      !STILL && (across * blocks.value * RATIO) / dots < Math.max(SURFACE_UNTIL[1], RINGS_UNTIL[1]) * MOVING_SLACK,
  };
}

/** The water as the picture sees it (`blocks`, `home`, `homeCoarse`: the uniforms `place` sets). */
function whereSeen(blocks: Float, home: Vec2, homeCoarse: Vec2) {
  // where the water lies in finest blocks, and how many of them a dot of the picture is wide there (by the geometric
  // mean of a dot's width and height on the water: seen at a slant, a dot reaches farther up the water than across it)
  const world = positionWorld.xz.mul(blocks);
  const pFine = world.add(home),
    pCoarse = world.add(homeCoarse);
  const acrossDot = length(dFdx(pFine))
    .mul(length(dFdy(pFine)))
    .sqrt();
  // (and of a dot of the screen: how far the swell and the foam reach goes by it, the octaves by the picture's dots)
  const acrossScreen = acrossDot.mul(RATIO);
  /** 1 in the nearest views (a street of houses across the picture), 0 from a few hundred blocks across (by a dot's width alone) */
  const nearest = float(1).sub(smoothstep(0.04, 0.12, length(dFdx(pFine)).mul(RATIO)));
  /** 1 where the swell shows, 0 where the sea lies smooth; and where the flecks and the glitter do */
  const surface = float(1).sub(smoothstep(SURFACE_UNTIL[0], SURFACE_UNTIL[1], acrossScreen)),
    flecked = float(1).sub(smoothstep(FLECKS_UNTIL[0], FLECKS_UNTIL[1], acrossScreen)),
    rippled = float(1).sub(smoothstep(RIPPLES_UNTIL[0], RIPPLES_UNTIL[1], acrossScreen));
  return { pFine, pCoarse, acrossDot, acrossScreen, nearest, surface, flecked, rippled, blocks };
}

/** a colour as a node (three keeps a Color's components in linear light) */
const lin = (c: THREE.Color) => vec3(c.r, c.g, c.b);
/** the green and blue of the water's corners at the coast and some 8 columns out (terrain.ts) */
const [, gs, bs] = WATER_SHALLOW,
  [, gd, bd] = WATER_DEEP;
/** the colour of the depth's share t, through the stops of RAMP: their first colours, or (`near` 1) their second */
const ramp = (t: Float, near: Float) => {
  const at = (i: number) => mix(lin(new THREE.Color(RAMP[i][1])), lin(new THREE.Color(RAMP[i][2])), near);
  let c: Vec3 = at(0);
  for (let i = 1; i < RAMP.length; i++) c = mix(c, at(i), smoothstep(RAMP[i - 1][0], RAMP[i][0], t));
  return c;
};

/** The water's colour from its corners' colour (Sea.colour), by the depth picture, and the foam along the coast. */
function waterColour(
  corners: Vec3,
  coastAway: Float | undefined,
  depth: ReturnType<typeof readDepths>,
  seen: ReturnType<typeof whereSeen>,
  { clock, flecksAt, fleck, ripple, trough }: ReturnType<typeof surfaceOf>,
): Vec3 {
  const { share, shareSmooth, known, coastDots, coastBlocks, dotsPerTexel } = depth;
  // how far from the coast the corners are, as their colour has it (terrain.ts: WATER_SHALLOW at the coast, mixed
  // towards WATER_DEEP by k = 0 … 1 within some 8 columns, and the mix a tenth lighter or darker in broad patches
  // everywhere): by the ratio of their green to their blue, which the patches leave as it is (k worked back from
  // the ratio q of the mix: q = (gs + k (gd - gs)) / (bs + k (bd - bs))). By the corners' lightness the band was
  // as uneven as the patches; and their shade, again, from their blue against the mix's
  const tone = corners.div(materialColor.rgb.max(1e-4)),
    q = tone.g.div(tone.b.max(1e-4));
  const k = clamp(
    float(gs)
      .sub(q.mul(bs))
      .div(
        q
          .mul(bd - bs)
          .sub(gd - gs)
          .max(1e-4),
      ),
    0,
    1,
  );
  const shade = tone.b.div(mix(float(bs), float(bd), k));
  const corner = smoothstep(RIM[0], RIM[1], k.oneMinus());
  // the sea is lighter, too, within HALO dots of the coast as the depth picture has it (its dots are some 36 finest
  // blocks wide: the corners' band is but a few columns wide, as wide as a sandbank from near and a hair from afar);
  // from near, where a dot of the depth picture is wider than HALO_UNTIL dots of the picture, it would not follow the
  // coast closely enough, and the band is the corners' alone (lakes and rivers lie above the sea)
  const coarse = smoothstep(HALO_UNTIL[0], HALO_UNTIL[1], dotsPerTexel);
  const above = smoothstep(SEA_Y + 0.005, SEA_Y + 0.02, positionWorld.y),
    sea = above.oneMinus().mul(known);
  const halo = float(1)
    .sub(smoothstep(0, HALO, coastDots.max(0)))
    .mul(sea)
    .mul(float(1).sub(coarse));
  // the bed shows through the shallows (sea_bed.ts): how far the water lies from its edge, in finest blocks, by its
  // corners up to some columns out and beyond them by the depth picture's coast (coarse, but smooth); the sea's bed
  // falls as the picture's depth has it there, the beds of rivers and lakes steeply
  const d = coastAway ?? columnsOf(k),
    out = d.sub(WATERLINE).max(0).mul(seen.blocks);
  const bedded = float(1).sub(smoothstep(BED_UNTIL[0], BED_UNTIL[1], seen.acrossScreen)),
    through = bedThrough(out, coastBlocks, seen.pFine, shareSmooth, sea.oneMinus(), above).mul(bedded);
  // (where the bed shows, the corners' band of lighter water gives way to it; from afar the band is the coast's)
  const coast = max(
    corner.mul(mix(float(NEAR_RIM), float(1), coarse)).mul(bedded.oneMinus()),
    halo.mul(halo).mul(HALO_SHARE),
  );
  const patches = clamp(shade, 0.9, 1.1);
  // from near, all the picture lies within a dot or two of the depth picture: there the depth is the picture's
  // smoothed over its dots, and the sea darkens out to the offing as it lies farther from the land (rivers and lakes
  // are the shelf's colour beyond their banks)
  const offing = mix(float(OFFING[0]), float(OFFING[1]), smoothstep(OFFING_BLOCKS[0], OFFING_BLOCKS[1], coastBlocks)),
    ofSea = mix(share, max(shareSmooth, mix(float(RAMP[1][0]), offing, sea)), coarse);
  // (a lake or a river lies on the land of the depth picture, which knows no depth there: its depth goes by how far
  // the water lies from its banks, at every distance alike)
  const inland = mix(float(INLAND[0]), float(INLAND[1]), smoothstep(INLAND_COLUMNS[0], INLAND_COLUMNS[1], d)),
    t = mix(ofSea, inland, above).add(bedRelief(seen.pFine).mul(RELIEF).mul(coarse));
  // (the near view's light is brighter: the water is as dark there as it looks from afar; the foam is white in it)
  const darker = mix(float(1), float(NEAREST_DARKER), seen.nearest);
  const body = mix(ramp(t, coarse), lin(COAST), coast).mul(through.z.oneMinus()).add(lin(BED).mul(through));
  // the wind's ripples and flecks leave the shallows by the shore calm
  const offShore = smoothstep(FLECK_OFF[0], FLECK_OFF[1], d),
    water = mix(body, lin(RIPPLE), ripple.mul(offShore).mul(RIPPLE_SHARE)).mul(
      float(1).sub(trough.mul(offShore).mul(TROUGH)),
    );
  // the foam along the coast (the sea's alone: no surf runs up a river's bank or a lake's), and the flecks
  const surf = shoreFoam(d, seen.pFine, seen.acrossScreen, clock, flecksAt).mul(above.oneMinus()),
    foam = max(surf, fleck.mul(FLECK_WHITE).mul(offShore));
  // (the foam is lit as the water is)
  return mix(water.mul(patches).mul(darker), lin(FOAM), foam).mul(materialColor.rgb);
}

/** The surface: the swell's slope, the sky it gives back, the flecks and the glitter (and the waves' clock and flecks, for the foam). */
function surfaceOf(
  { pFine, pCoarse, acrossDot, nearest, surface, flecked, rippled }: ReturnType<typeof whereSeen>,
  coastBlocks: Float,
) {
  // the surface: the wave picture at the two octaves whose texels are DOTS_PER_TEXEL to twice that many dots wide here
  // (from near at least SPAN_LEAST blocks across the picture), faded from one to the next; the flecks' at the same
  // octaves (a fleck is then some 2 to 10 dots long; twice as long until round 7, as large as a part of a house,
  // where EU5's whitecaps are small against its houses), from near down to half of SPAN_LEAST
  const fine = log2(acrossDot.mul(TEX * DOTS_PER_TEXEL)),
    octave = fine.max(Math.log2(SPAN_LEAST)),
    o0 = floor(octave),
    f = octave.sub(o0);
  const octaveF = fine.max(Math.log2(SPAN_LEAST) - 1),
    oF = floor(octaveF),
    fF = octaveF.sub(oF);
  const { clock, octaveAt, flecksAt } = createWaves(pFine, pCoarse);
  const a = octaveAt(o0),
    b = octaveAt(o0.add(1)),
    w0 = float(1).sub(f),
    w1 = f,
    keep = float(1).div(w0.mul(w0).add(w1.mul(w1)).sqrt());
  const p = pFine,
    gust = mix(
      float(PATCHY[0]),
      float(PATCHY[1]),
      sin(dot(p, vec2(3, 2).mul(TURN)).add(0.7))
        .mul(sin(dot(p, vec2(-2, 5).mul(TURN)).add(2.1)))
        .mul(0.5)
        .add(0.5),
    );
  const slopeShare = mix(float(SWELL), float(SWELL_NEAR), nearest).mul(surface);
  const slope = a.slope.mul(w0).add(b.slope.mul(w1)).mul(keep).mul(slopeShare).mul(gust);
  const facing = normalize(vec3(slope.x.negate(), 1, slope.y.negate()));
  const eye = normalize(cameraPosition.sub(positionWorld));
  const fresnel = (n: Vec3) => float(0.02).add(pow(float(1).sub(max(dot(n, eye), 0)), 5).mul(0.98));
  const level = fresnel(vec3(0, 1, 0)),
    waved = fresnel(facing);
  // the flecks: where a crest of the flecks' waves rises above the line (lower where the wind is strong, and on the
  // swell's crests, so that they come in groups along them and the troughs between lie calm), with an edge a dot
  // wide; each octave's own, faded as the octaves are. The line rises and falls with the time, in each patch of
  // the swell at its own time (by the swell's second picture), so that the flecks come and go in groups
  const swell = a.height.mul(w0).add(b.height.mul(w1)).mul(keep),
    patch = a.second.mul(w0).add(b.second.mul(w1)).mul(keep);
  const sway = sin(clock.mul((2 * Math.PI) / FLECK_LIFE).add(patch.mul(2.4))).mul(FLECK_SWAY);
  // (the groups: the swell's picture two octaves up, whose waves are four times as long)
  const groups = octaveAt(o0.add(2), GROUP_RUN).height;
  const line = float(FLECK)
    .sub(gust.sub(1).mul(FLECK_GUST / (PATCHY[1] - 1)))
    .sub(swell.mul(FLECK_CREST))
    .sub(groups.min(FLECK_GROUP_MOST).mul(FLECK_GROUPS))
    .add(float(FLECK_LEE).mul(float(1).sub(smoothstep(FLECK_FETCH[0], FLECK_FETCH[1], coastBlocks))));
  // (the two octaves' waves are added before the line is drawn, not their flecks after: a fleck of an octave half
  // faded in was a grey smudge)
  const crests = flecksAt(oF)
    .mul(float(1).sub(fF))
    .add(flecksAt(oF.add(1)).mul(fF))
    .div(float(1).sub(fF).mul(float(1).sub(fF)).add(fF.mul(fF)).sqrt());
  const edge = fwidth(crests),
    above = (l: Float, h: Float) => smoothstep(l.sub(edge), l.add(edge), h);
  // (the flecks' line rises and falls; the ripples' is steady, so that the waves run on while their tops break)
  const fleck = above(line.add(sway), crests).mul(flecked),
    ripple = above(line.sub(RIPPLE_BELOW), crests).mul(rippled),
    trough = above(line.sub(RIPPLE_BELOW), crests.negate()).mul(rippled);
  // the glitter: where two pictures of the flecks' waves an octave finer than the swell's, turned apart and drifting
  // against each other, both peak (they meet and part again: the points twinkle), more at a slant to the water
  const glint = (h: Float, k: Float) => smoothstep(SPARKLE, SPARKLE + 0.6, min(h, k));
  const sparkle = glint(
    flecksAt(o0.sub(1), 1.9, vec2(0.21, 0.83), 1.1),
    flecksAt(o0.sub(1), -1.3, vec2(0.77, 0.41), -0.8),
  )
    .mul(clamp(pow(float(1).sub(eye.y), SPARKLE_SLANT).mul(3), 0, 1))
    .mul(flecked);
  return { facing, waved, level, fleck, ripple, trough, sparkle, clock, flecksAt };
}
