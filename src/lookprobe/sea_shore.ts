// The foam along the coast, for the sea's colour (sea.ts): a thin line of foam where the water laps at the land, and
// fainter lines that come in to the shore, one after the other, as the water of the low-poly worlds has them (Ramon,
// 20 November 2026: "gibt es schöneres wasser auch im poly bereich nicht?"). Until round 7 the lines that come in
// were two rows of thick white strokes round every coast, the loudest thing on the water; EU5 has no lines along its
// shores at all (Ramon, 21 November 2026: "das wasser ist das problem"). OWN RULE: no published model gives them;
// their numbers are chosen by eye, the gauntlet's foam row (tools/lookprobe/gauntlet_water.py) holds how much of the
// water by the coast they cover.
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
import type * as THREE from 'three/webgpu';

type Float = THREE.Node<'float'>;
type Vec2 = THREE.Node<'vec2'>;

/**
 * a line comes in from RING_FROM columns out to RING_TO, where the land's edge shows, in RING_PERIOD seconds, and the
 * next half a period later; a line is RING_WIDTH columns wide (at least RING_DOTS dots) and thinner towards the ends
 * of its dashes (down to RING_THIN of that), RING_SHARE of the foam's white, and the water it has passed (out to sea)
 * is lighter for RING_WASH columns, by up to RING_WASH_SHARE of the foam: the wave's wash. A line does not run level
 * with the coast: it sways by up to RING_SWAY columns over some nine blocks, each of the two lines its own way
 */
const RING_FROM = 4.5,
  RING_TO = 1.9,
  RING_PERIOD = 4.5,
  RING_WIDTH = 0.1,
  RING_THIN = 0.35,
  RING_DOTS = 1.2,
  RING_SHARE = 0.3,
  RING_WASH = 0.8,
  RING_WASH_SHARE = 0.1,
  RING_SWAY = 0.22;
/**
 * the line at the water's edge: EDGE_WIDTH columns to either side (at least EDGE_DOTS dots in all), EDGE_SHARE of the
 * foam's white (0.7 of that where the lines are broken), and it laps out from the land's edge by up to EDGE_LAP
 * columns and back in EDGE_PERIOD seconds, a little sooner here and later there
 */
const EDGE_WIDTH = 0.1,
  EDGE_LAP = 0.22,
  EDGE_PERIOD = 3.2,
  EDGE_DOTS = 2,
  EDGE_SHARE = 1;
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
/** the view's place is taken modulo these many finest blocks (sea.ts PERIOD): a wave along the coast fits it whole */
const TURN = (2 * Math.PI) / 1024;

/** The columns to the coast that the corners' mix `k` stands for: the smooth step of terrain.ts worked back. */
export const columnsOf = (k: Float): Float =>
  float(0.5)
    .sub(sin(asin(float(1).sub(k.mul(2)).clamp(-1, 1)).div(3)))
    .mul(7.6)
    .add(0.4);

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
    foam = max(foam, max(line.mul(RING_SHARE), wash).mul(strength));
  }
  // the water's edge: a thin line of foam where the water laps at the land, a little out and back again
  const lap = sin(clock.mul((2 * Math.PI) / EDGE_PERIOD).add(lag.mul(40)))
      .mul(0.5)
      .add(0.5)
      .mul(EDGE_LAP),
    edgeWide = max(float(EDGE_WIDTH), fwidth(d).mul(EDGE_DOTS / 2)),
    edge = float(1)
      .sub(smoothstep(edgeWide, edgeWide.add(fwidth(d)), d.sub(RING_TO).sub(lap).abs()))
      .mul(mix(float(0.7), float(1), kept))
      .mul(EDGE_SHARE);
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
  return max(foam.mul(kept), edge).mul(sloped).mul(reach);
}
