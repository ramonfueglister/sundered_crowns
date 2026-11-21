// The sea's wave picture (sea_waves.ts) laid over the water and drifting with the wind, for the sea's surface (sea.ts).
import type * as THREE from 'three/webgpu';
import { dFdx, dFdy, exp2, float, fract, select, texture, time, uniform, vec2 } from 'three/tsl';
import { WIND, waveTexture } from './sea_waves';
import { number, q } from './stage/address';

type Float = THREE.Node<'float'>;
type Vec2 = THREE.Node<'vec2'>;

/** from near the wave picture spans at least this many finest blocks (the flecks' half of it), so that the swell's waves are longer than a house and the flecks no specks */
export const SPAN_LEAST = 32;
/** how far every other octave of the flecks is turned (radians) */
const FLECK_TURN = 0.45;
/**
 * The water moves (the waves' pictures drift with the wind; nothing of the mesh moves): how many of its own spans an
 * octave of the swell drifts a second at SPAN_LEAST blocks across (a wider octave drifts fewer of its spans, by the
 * fourth root of its span: longer waves run faster, though on the sea by the square root, which from EU5's nearest
 * distance looked all but still), the second picture of each octave (turned by SWELL_TURN, so that the two cross and
 * the swell changes as it runs) at SWELL_SECOND of that, and the flecks' waves at FLECK_RUN of it. (Until round 7 the
 * swell ran at 0.035 and the flecks at 1.6 of it: the swell is fainter now and must run faster to be seen to move.)
 */
const SWELL_RUN = 0.055,
  SWELL_SECOND = 0.65,
  SWELL_TURN = 0.8,
  FLECK_RUN = 1;
/** a still of fixed size (a tool's picture, ?w=) shows the water as it is at ?seatime= seconds (0), so that the same picture comes each time */
export const STILL = q.has('w');
/** the view's place on the world is taken modulo these many finest blocks, for the waves narrower than that */
export const PERIOD = 1024;

/** The wave picture laid over the water at `pFine` (and `pCoarse`, where its octave is wider than PERIOD), drifting
 *  with the water's clock: the swell's octaves and the flecks'. */
export function createWaves(pFine: Vec2, pCoarse: Vec2) {
  const waves = texture(waveTexture());
  /** the water's clock in seconds (a still's is fixed) */
  const clock = STILL ? uniform(number('seatime', 0)) : time;
  // (a tool that takes a row of stills of the moving water sets the clock here, tools/lookprobe/water_frames.mjs:
  // through globalThis, whose type has no such field)
  if (STILL) (globalThis as { __seaClock?: unknown }).__seaClock = clock;
  /** how far a picture of octave n has drifted along the wind (in its own frame), at `run` of the swell's pace */
  const drift = (n: Float, run: number) =>
    vec2(Math.cos(WIND), Math.sin(WIND)).mul(
      fract(clock.mul(SWELL_RUN * run * SPAN_LEAST ** 0.25).mul(exp2(n.mul(-0.25)))),
    );
  // octave n: the picture spans 2^n finest blocks; every other one is turned a quarter round and all are shifted
  // apart, so that the octaves do not lie on each other (both keep the picture repeating every PERIOD blocks); each
  // is read twice, the second time turned by SWELL_TURN and drifting more slowly, and the two are added
  const octaveAt = (n: Float, run = 1) => {
    const size = exp2(n),
      odd = fract(n.mul(0.5)).greaterThan(0.25),
      p = select(size.greaterThan(PERIOD), pCoarse, pFine);
    const read = (angle: number, shift: Vec2, run: number) => {
      // the picture's frame: a quarter round for odd octaves, and `angle` more
      const c = select(odd, float(-Math.sin(angle)), float(Math.cos(angle))),
        s = select(odd, float(Math.cos(angle)), float(Math.sin(angle)));
      const uv = turn(p, c, s).div(size).add(shift).add(drift(n, run)),
        dx = turn(dFdx(pFine), c, s).div(size),
        dy = turn(dFdy(pFine), c, s).div(size);
      const t = waves.sample(uv).grad(dx, dy);
      // the slope back in the world's axes
      const su = t.r.mul(2).sub(1).mul(4),
        sv = t.g.mul(2).sub(1).mul(4);
      return { slope: turn(vec2(su, sv), c, s.negate()), height: t.b.mul(2).sub(1).mul(4) };
    };
    const one = read(0, vec2(0.37, 0.71).mul(n), run),
      two = read(SWELL_TURN, vec2(0.61, 0.13).mul(n), SWELL_SECOND * run);
    return {
      slope: one.slope.add(two.slope).mul(Math.SQRT1_2),
      height: one.height.add(two.height).mul(Math.SQRT1_2),
      second: two.height,
    };
  };
  // the flecks' octave n likewise, but every other one turned by FLECK_TURN alone: their strokes stand across the
  // wind in every octave (turned a quarter round, two octaves faded into each other cross), and not all alike
  const flecksAt = (n: Float, angle = 0, shift: Vec2 = vec2(0.53, 0.29), run = FLECK_RUN) => {
    const size = exp2(n),
      p = select(size.greaterThan(PERIOD), pCoarse, pFine),
      odd = fract(n.mul(0.5)).greaterThan(0.25);
    const c = select(odd, float(Math.cos(FLECK_TURN + angle)), float(Math.cos(angle))),
      s = select(odd, float(Math.sin(FLECK_TURN + angle)), float(Math.sin(angle)));
    const uv = turn(p, c, s).div(size).add(shift.mul(n)).add(drift(n, run)),
      dx = turn(dFdx(pFine), c, s).div(size),
      dy = turn(dFdy(pFine), c, s).div(size);
    return waves.sample(uv).grad(dx, dy).a.mul(2).sub(1).mul(8);
  };
  return { clock, octaveAt, flecksAt };
}

/** a point of the world (finest blocks) and its dot's extent turned by (c, s) */
function turn(q: Vec2, c: Float, s: Float) {
  return vec2(q.x.mul(c).sub(q.y.mul(s)), q.x.mul(s).add(q.y.mul(c)));
}
