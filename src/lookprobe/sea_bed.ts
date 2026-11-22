// The sea's bed by the shore, seen through the water, for the sea's colour (sea.ts).
//
// EU5's sand runs on under its water: by a beach the sea is pale and sandy, then turquoise, then blue, in a band
// that is wide over a flat bed and narrow where the coast falls steeply (Ramon, 21 November 2026, on the water that
// was one colour up to a hard edge: "das wasser ist das problem"). So the water lets the bed show where it is
// shallow: light dies in water with the way it goes through it (Beer-Lambert), red first, then green, blue last, so
// that sand under more and more water turns from its own colour to turquoise and then is lost in the sea's blue.
// The bed is not built (terrain.ts builds no ground under the water): its depth is reckoned from how far the water
// lies from its edge, over a bed that falls evenly, flatter or steeper from place to place and by the depth of the
// sea there (public/map/depth.png). OWN RULE: the bed's fall, colour and the numbers of the light are chosen by eye
// against EU5's pictures of its nearest view (wasser/referenz_eu5 in the project's files).
import * as THREE from 'three/webgpu';
import { dot, exp2, float, mix, pow, sin, smoothstep, vec2, vec3 } from 'three/tsl';

type Float = THREE.Node<'float'>;
type Vec2 = THREE.Node<'vec2'>;
type Vec3 = THREE.Node<'vec3'>;

/** the bed's colour: wet sand in the sun */
export const BED = new THREE.Color(0xeadfb2);
/** how many blocks the bed falls to a block out to sea: over a flat bed (a lagoon, a bank) and a steep one */
const BED_FALL: readonly [number, number] = [0.1, 0.45];
/** the depth picture's shares between which the bed goes from flat to steep (some 5 m and 60 m of sea) */
const BED_DEEP: readonly [number, number] = [0.05, 0.25];
/** from place to place the bed falls up to 2^BED_UNEVEN times as flatly or as steeply, in banks some 30 to 50 blocks long */
const BED_UNEVEN = 1.1;
/** the blocks of water under which half of the blue light is left; red and green are left as that share to these powers */
const BED_HALF = 0.55,
  BED_RED = 3.5,
  BED_GREEN = 1.35;
/**
 * the sea is as deep as the depth picture says (20 · (301^share - 1) metres: tools/worldprobe/build_depth.py), at
 * BED_METRES to a block, and at least BED_LEAST blocks away from its edge: a lagoon stays turquoise from shore to shore
 */
const BED_METRES = 8,
  BED_LEAST = 0.9;
/** at the water's edge the bed lies under this much water already (the bank's foot) */
const BED_FOOT = 0.25;
/**
 * a river's or a lake's bed (water above the sea) falls this many blocks to a block from its bank, from a foot this
 * deep: a river three columns wide is the water's colour in its middle and but a little lighter by its banks, where
 * the sea's shelving bed made all of it a pale band
 */
const BED_INLAND_FALL = 1.2,
  BED_INLAND_FOOT = 1;
/** from this many finest blocks out by the depth picture's coast the bed falls on, by this much to a block where the sea is deep */
const BED_OFFING = 12,
  BED_OFFING_FALL = 0.2;
/** the view's place is taken modulo these many finest blocks (sea.ts PERIOD): the banks fit it whole */
const TURN = (2 * Math.PI) / 1024;

/**
 * The bed's banks and hollows at a place `p` in finest blocks: -1 … 1, in patches some 15 to 20 blocks across (two
 * wound waves 40 and 32 blocks long, which fit the view's period whole).
 */
export function bedRelief(p: Vec2): Float {
  return sin(dot(p, vec2(23, 11).mul(TURN)).add(sin(dot(p, vec2(-9, 17).mul(TURN))).mul(1.3)))
    .add(sin(dot(p, vec2(13, -29).mul(TURN)).add(sin(dot(p, vec2(31, 7).mul(TURN))).mul(1.7))))
    .mul(0.5);
}

/**
 * How much of the bed's red, green and blue shows through the water at a place `out` finest blocks from the water's
 * edge: `p` where it lies in finest blocks, `share` the depth picture's share there (smoothed), `steep` 1 for water
 * that has no bed in the picture (its bed falls steeply), `inland` 1 for water above the sea (a river, a lake).
 */
export function bedThrough(out: Float, offing: Float, p: Vec2, share: Float, steep: Float, inland: Float): Vec3 {
  const banks = bedRelief(p);
  const fall = mix(
    mix(float(BED_FALL[0]), float(BED_FALL[1]), smoothstep(BED_DEEP[0], BED_DEEP[1], share)).mul(
      exp2(banks.mul(BED_UNEVEN)),
    ),
    mix(float(BED_FALL[1]), float(BED_INLAND_FALL), inland),
    steep,
  );
  // (the bed falls no deeper than the sea is there, and lies under BED_LEAST blocks of water at the least)
  const most = exp2(share.mul(Math.log2(301)))
    .sub(1)
    .mul(20 / BED_METRES)
    .max(BED_LEAST);
  const deep = smoothstep(BED_DEEP[0], BED_DEEP[1], share);
  const beyond = offing.sub(BED_OFFING).max(0).mul(deep).mul(BED_OFFING_FALL).mul(steep.oneMinus());
  const left = exp2(
    out
      .mul(fall)
      .min(mix(most, float(1e3), steep))
      .add(beyond)
      .add(mix(float(BED_FOOT), float(BED_INLAND_FOOT), inland))
      .div(-BED_HALF),
  );
  return vec3(pow(left, BED_RED), pow(left, BED_GREEN), left);
}
