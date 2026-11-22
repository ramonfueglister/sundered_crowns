// Where the families of a town settle (src/sim/settlement/streets.ts, step 3 of its rules): one after the other, each
// at a spot drawn from a density that falls exponentially from the market, P(r) ∝ e^(−r / r_c) (Barthelemy & Flammini
// 2008, after Clark 1951).
import { rand, seedRng } from '../rng';

/** the spots of `families` families round a market `half` steps to each side, with the density's characteristic
 *  distance `rc` (steps), the nearest first. A spot is drawn again, up to 64 times, until `open` holds there. */
export function familySpots(
  families: number,
  seed: number,
  half: number,
  rc: number,
  open: (x: number, z: number) => boolean,
): [number, number][] {
  const rng = seedRng(seed);
  const spots: [number, number][] = [];
  for (let f = 0; f < families; f++) {
    let sx = 0,
      sz = 0;
    for (let tries = 0; tries < 64; tries++) {
      const r = half + rc * -Math.log(Math.max(1e-12, rand(rng)) * Math.max(1e-12, rand(rng))),
        a = 2 * Math.PI * rand(rng); // r − half ~ Gamma(2, r_c): density ∝ e^(−r/r_c) on the plane
      sx = Math.round(r * Math.cos(a));
      sz = Math.round(r * Math.sin(a));
      if (open(sx, sz)) break;
    }
    spots.push([sx, sz]);
  }
  spots.sort((p, q) => Math.hypot(p[0], p[1]) - Math.hypot(q[0], q[1]) || p[1] - q[1] || p[0] - q[0]);
  return spots;
}
