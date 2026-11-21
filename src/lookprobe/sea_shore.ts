// The foam along the coast, for the sea's colour (sea.ts): lines of foam that come in to the shore, one after the
// other, as the water of the low-poly worlds has them (Ramon, 20 November 2026: "gibt es schöneres wasser auch im poly
// bereich nicht?"). OWN RULE: no published model gives them; their numbers are chosen by eye, the gauntlet's foam
// row (tools/lookprobe/gauntlet_water.py) holds how much of the water by the coast they cover.
//
// How far a point lies from the coast, d in columns: the sea's faces know it at their corners, smoothed
// (sea_corners.ts); the water's lists have it from their corners' colour alone, which terrain.ts (buildWater) mixes
// from WATER_SHALLOW to WATER_DEEP by k = smooth(0.4, 8, d) and sea.ts reads back from their hue (`columnsOf`: d =
// 0.4 + 7.6 x, x the smooth step worked back from k). Where the water is narrower than the lines' path (a canal, a
// river) d stays within a column or two of the coast; and as far from both banks, in its middle, d does not rise: a
// line comes in only where d rises from the coast (by RING_SLOPE), else it would light the canal's whole middle as
// it passes the depth that middle has.
import {
  asin,
  dFdx,
  dFdy,
  dot,
  exp2,
  float,
  fract,
  fwidth,
  length,
  max,
  mix,
  positionLocal,
  sin,
  smoothstep,
  step,
  vec2,
} from 'three/tsl';
import * as THREE from 'three/webgpu';

type Float = THREE.Node<'float'>;
type Vec2 = THREE.Node<'vec2'>;

/**
 * a line comes in from RING_FROM columns out to RING_TO, where the land's edge shows, in RING_PERIOD seconds, and the
 * next half a period later; a line is RING_WIDTH columns wide (at least RING_DOTS dots) and thinner towards the ends
 * of its dashes (down to RING_THIN of that), and the water it has passed (out to sea) is lighter for RING_WASH columns,
 * by up to RING_WASH_SHARE of the foam: the wave's wash. A line does not run level with the coast: it sways by up to
 * RING_SWAY columns over some nine blocks, each of the two lines its own way
 */
const RING_FROM = 4.5,
  RING_TO = 1.9,
  RING_PERIOD = 4.5,
  RING_WIDTH = 0.2,
  RING_THIN = 0.35,
  RING_DOTS = 1.5,
  RING_WASH = 0.8,
  RING_WASH_SHARE = 0.28,
  RING_SWAY = 0.22;
/** along which the two lines sway (in turns of the view's PERIOD: some nine blocks to a wave, sea.ts) */
const SWAYS = [
  [97, 61],
  [-53, 113],
] as const;
/**
 * the lines are broken where the flecks' waves (in spreads) lie below RING_BROKEN, read from their picture over
 * 2^RING_DASH finest blocks, drifting slowly: the foam comes as dashes some blocks long
 */
const RING_BROKEN = -0.4,
  RING_DASH = 8;
/**
 * the lines show where d rises by at least the second of these columns to a column of the water (towards the coast
 * it rises by one, give or take the corners' noise), and not where it rises by less than the first
 */
const RING_SLOPE: readonly [number, number] = [0.3, 0.6];
/**
 * how far the foam reaches, in finest blocks to a dot of the screen (as the swell's reach, sea.ts SURFACE_UNTIL):
 * fully up to the first, gone from the second (in a picture 1672 dots wide: up to some 800 blocks across, gone from
 * 1500)
 */
export const RINGS_UNTIL: readonly [number, number] = [0.5, 0.9];
/**
 * By the shore the bed shows through the water: the colour of wet sand, at the land's edge (RING_TO) by BED_SHARE of
 * it, and by half as much with every BED_HALF columns out to sea, as the light dies in water with its depth
 * (Beer-Lambert) over a bed that falls evenly from the shore. EU5's sand runs on under its water; ours was one
 * colour up to a hard edge. OWN RULE: the colour and the numbers are chosen by eye.
 */
export const BED = new THREE.Color(0xe9dfae);
const BED_SHARE = 0.7,
  BED_HALF = 0.7;
/** the view's place is taken modulo these many finest blocks (sea.ts PERIOD): a wave along the coast fits it whole */
const TURN = (2 * Math.PI) / 1024;

/** The columns to the coast that the corners' mix `k` stands for: the smooth step of terrain.ts worked back. */
export const columnsOf = (k: Float): Float =>
  float(0.5)
    .sub(sin(asin(float(1).sub(k.mul(2)).clamp(-1, 1)).div(3)))
    .mul(7.6)
    .add(0.4);

/** The share of the bed's colour at a point of the water `d` columns from the coast (as far as the foam reaches). */
export function shoreBed(d: Float, acrossScreen: Float): Float {
  const reach = float(1).sub(smoothstep(RINGS_UNTIL[0], RINGS_UNTIL[1], acrossScreen));
  return exp2(d.sub(RING_TO).max(0).div(-BED_HALF)).mul(BED_SHARE).mul(reach);
}

/**
 * the shore of the low-poly look (sea.ts POLY): two bands of flat colour along the coast with hard edges, the bed's
 * out to BANDS[0] columns and the shallows' to BANDS[1], which come in and go out together by BAND_SWAY columns every
 * BAND_PERIOD seconds (a little sooner here and later there); a line of foam BAND_FOAM columns wide at the land's
 * edge, and a thinner one (BAND_LINE) on the bed band's edge
 */
const BANDS: readonly [number, number] = [2.9, 4.5],
  BAND_SWAY = 0.28,
  BAND_PERIOD = 6,
  BAND_FOAM = 0.2,
  BAND_LINE = 0.07;

/** The bands and the foam of the low-poly shore at a point `d` columns from the coast (`p`, `acrossScreen`, `clock` as for `shoreFoam`). */
export function shoreBands(d: Float, p: Vec2, acrossScreen: Float, clock: Float) {
  const along = sin(dot(p, vec2(18, 11).mul(TURN)).add(sin(dot(p, vec2(-7, 23).mul(TURN))))).mul(1.2),
    sway = sin(clock.mul((2 * Math.PI) / BAND_PERIOD).add(along)).mul(BAND_SWAY);
  // (an edge a dot wide)
  const soft = fwidth(d).mul(0.5).max(1e-4),
    within = (to: Float) => float(1).sub(smoothstep(to.sub(soft), to.add(soft), d));
  const bedTo = float(BANDS[0]).add(sway),
    reach = float(1).sub(smoothstep(RINGS_UNTIL[0], RINGS_UNTIL[1], acrossScreen));
  const line = max(float(BAND_LINE), fwidth(d).mul(0.75));
  const foam = max(
    within(float(RING_TO + BAND_FOAM).add(sway.mul(0.5))),
    within(bedTo.add(line)).mul(float(1).sub(within(bedTo.sub(line)))),
  );
  return { bed: within(bedTo), shallows: within(float(BANDS[1]).add(sway)), foam: foam.mul(reach), reach };
}

/**
 * The share of foam at a point of the water: `d` how many columns from the coast it lies, `p` where it lies in finest
 * blocks, `acrossScreen` how many of them a dot of the screen is wide, `clock` the water's clock and
 * `flecksAt` the flecks' waves (sea.ts createWaves).
 */
export function shoreFoam(
  d: Float,
  p: Vec2,
  acrossScreen: Float,
  clock: Float,
  flecksAt: (n: Float, angle?: number, shift?: Vec2, run?: number) => Float,
): Float {
  // (the lines do not come in all at once along the coast: a little sooner here and later there)
  const lag = sin(dot(p, vec2(18, 11).mul(TURN)).add(sin(dot(p, vec2(-7, 23).mul(TURN))))).mul(0.12);
  const kept = smoothstep(RING_BROKEN - 0.3, RING_BROKEN + 0.3, flecksAt(float(RING_DASH), 0.6, vec2(0.17, 0.71), 0.3));
  const wide = max(float(RING_WIDTH).mul(mix(float(RING_THIN), float(1), kept)), fwidth(d).mul(RING_DOTS / 2));
  let foam: Float = float(0);
  for (const [k, after] of [0, 0.5].entries()) {
    const phase = fract(clock.div(RING_PERIOD).add(after).add(lag));
    const sway = sin(dot(p, vec2(SWAYS[k][0], SWAYS[k][1]).mul(TURN)).add(k * 2.1)).mul(RING_SWAY);
    const at = mix(float(RING_FROM), float(RING_TO), phase).add(sway);
    // (a line grows as it comes in, and is gone as it meets the land)
    const strength = smoothstep(0, 0.35, phase).mul(float(1).sub(smoothstep(0.88, 1, phase)));
    const line = float(1).sub(smoothstep(wide, wide.add(fwidth(d)), d.sub(at).abs()));
    const wash = float(1)
      .sub(smoothstep(at, at.add(RING_WASH), d))
      .mul(step(at, d))
      .mul(RING_WASH_SHARE);
    foam = max(foam, max(line, wash).mul(strength));
  }
  // (how much d rises to a column, from the screen's steps: the water's sheet lies in columns of its piece)
  const sx = dFdx(positionLocal.xz),
    sy = dFdy(positionLocal.xz),
    ddx = dFdx(d),
    ddy = dFdy(d);
  const turned = sx.x.mul(sy.y).sub(sy.x.mul(sx.y));
  const rise = length(vec2(ddx.mul(sy.y).sub(ddy.mul(sx.y)), ddy.mul(sx.x).sub(ddx.mul(sy.x)))).div(
    turned.abs().max(1e-9),
  );
  const sloped = smoothstep(RING_SLOPE[0], RING_SLOPE[1], rise);
  const reach = float(1).sub(smoothstep(RINGS_UNTIL[0], RINGS_UNTIL[1], acrossScreen));
  return foam.mul(kept).mul(sloped).mul(reach);
}
