// The sea's surface as flat facets, as the water of the low-poly worlds is made (Ramon, 20 November 2026: "gibt es
// schöneres wasser auch im poly bereich nicht?"): a grid of corners that rise and fall, two triangles to a cell,
// each lit by its own tilt, with hard edges between them, as the land's blocks have. Nothing of the mesh moves: the
// facet a point lies in, and its tilt, are worked out where the water is drawn.
import { dot, exp2, float, floor, fract, log2, mix, select, sin, smoothstep, vec2 } from 'three/tsl';
import type * as THREE from 'three/webgpu';

type Float = THREE.Node<'float'>;
type Vec2 = THREE.Node<'vec2'>;

/**
 * a facet's edge is a power of two of finest blocks, between half this many dots of the picture and this many (OWN
 * RULE: as large as a tree's crown from near); over the last FACET_FADE of that range the facets twice as large fade
 * in, so that the facets do not jump as the view moves away
 */
const FACET_DOTS = 30,
  FACET_FADE = 0.25;
/** how steeply the facets tilt: the rise of a corner against its neighbour, over the facet's edge, at a wave's steepest */
const FACET_RISE = 0.14;
/** the view's place is taken modulo these many finest blocks (sea.ts PERIOD): the waves fit it whole */
const PERIOD = 1024,
  TURN = (2 * Math.PI) / PERIOD;
/**
 * the corners rise and fall with two waves that cross (their turns of PERIOD at a facet one block wide, so that a
 * wave is some nine facets long at every size; seconds to a wave), and each a little on its own (BOB of a wave, every
 * BOB_PERIOD seconds, each corner at its own time)
 */
const WAVES = [
  [96, 64, 3.1],
  [-48, 112, 4.3],
] as const;
const BOB = 0.5,
  BOB_PERIOD = 5.2;

/**
 * The slope of the facet at `p` (finest blocks; `acrossDot` of them to a dot of the picture) at the water's `clock`:
 * its rise over run along x and z.
 */
export function facetSlope(p: Vec2, acrossDot: Float, clock: Float, square = false): Vec2 {
  const octave = log2(acrossDot.mul(FACET_DOTS)),
    first = floor(octave);
  return mix(
    facetsOf(p, exp2(first), clock, square),
    facetsOf(p, exp2(first.add(1)), clock, square),
    smoothstep(1 - FACET_FADE, 1, octave.sub(first)),
  );
}

/** The slope of the facet at `p` where the facets' edges are `size` finest blocks long. */
function facetsOf(p: Vec2, size: Float, clock: Float, square: boolean): Vec2 {
  const g = p.div(size),
    cell = floor(g),
    f = g.sub(cell);
  const cells = float(PERIOD).div(size);
  /** the height of the corner `v` (in cells), in facet edges */
  const height = (v: Vec2): Float => {
    // (a corner's own number, the same wherever the view's place is taken modulo PERIOD)
    const id = v.sub(floor(v.div(cells)).mul(cells)),
      own = fract(sin(dot(id, vec2(127.1, 311.7))).mul(43758.5453));
    let h: Float = sin(clock.mul((2 * Math.PI) / BOB_PERIOD).add(own.mul(2 * Math.PI))).mul(BOB);
    for (const [a, b, seconds] of WAVES)
      h = h.add(sin(dot(v, vec2(a, b).mul(TURN)).sub(clock.mul((2 * Math.PI) / seconds))));
    return h.mul(FACET_RISE);
  };
  const h00 = height(cell),
    h10 = height(cell.add(vec2(1, 0))),
    h01 = height(cell.add(vec2(0, 1))),
    h11 = height(cell.add(vec2(1, 1)));
  // (as square tiles, a cell is one facet: its mean tilt)
  if (square) return vec2(h10.add(h11).sub(h00).sub(h01), h01.add(h11).sub(h00).sub(h10)).mul(0.5);
  // the cell's two triangles, cut along one diagonal in every other cell and along the other in the rest (cut all
  // alike, the facets lay in rows across the picture): by the first and the last corner, or by the two between
  const last = f.x.add(f.y).greaterThan(1),
    upper = f.y.greaterThan(f.x),
    other = fract(cell.x.add(cell.y).mul(0.5)).greaterThan(0.25);
  return vec2(
    select(other, select(upper, h11.sub(h01), h10.sub(h00)), select(last, h11.sub(h01), h10.sub(h00))),
    select(other, select(upper, h01.sub(h00), h11.sub(h10)), select(last, h11.sub(h10), h01.sub(h00))),
  );
}
