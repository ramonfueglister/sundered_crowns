// Scenery of the probes, not of the house kit: trees and cypresses of a few cubes each.
import { type Batch, type RGB, type Rnd, rgb, shade } from './batch';

export const LEAF = rgb(0x6fae3a),
  EARTH = rgb(0x9a7046);
const TRUNK = rgb(0x6b4a2c),
  CYPRESS = rgb(0x2c5a2e);

/** A cypress: a slim column of dark green cubes narrowing to a point (scenery of the coast prototype). */
export function cypress(b: Batch, x: number, y: number, z: number, r: Rnd) {
  const h = r.range(3.4, 4.8),
    w = r.range(0.3, 0.4),
    n = 10;
  b.box(x - 0.08, y, z - 0.08, x + 0.08, y + 0.4, z + 0.08, TRUNK);
  for (let k = 0; k < n; k++) {
    const t = k / n,
      e = w * Math.max(0.15, (1 - t) ** 0.6) * Math.min(1, 0.7 + t * 3);
    b.box(
      x - e,
      y + 0.3 + t * h,
      z - e,
      x + e,
      y + 0.3 + (t + 1 / n) * h + 0.05,
      z + e,
      shade(CYPRESS, r.range(0.85, 1.1)),
      {
        top: shade(CYPRESS, 1.15),
      },
    );
  }
}

/** A tree in blocks: a trunk and a crown of a few leafy cubes, `s` its size, `leaf` its green. */
export function tree(b: Batch, x: number, y: number, z: number, r: Rnd, size?: number, leaf: RGB = LEAF) {
  // drawn in the order the near probe always drew them: the trunk's height, then the size
  const h0 = r.range(1.2, 2.0),
    s = size ?? r.range(0.7, 1.0),
    h = h0 * Math.max(1, s * 0.8);
  b.box(x - 0.15 * s, y, z - 0.15 * s, x + 0.15 * s, y + h, z + 0.15 * s, TRUNK);
  for (let k = 0; k < r.int(3, 5); k++) {
    const dx = r.range(-0.5, 0.5) * s,
      dz = r.range(-0.5, 0.5) * s,
      dy = r.range(-0.3, 0.5) * s,
      e = r.range(0.4, 0.6) * s;
    b.box(
      x + dx - e,
      y + h + dy - e,
      z + dz - e,
      x + dx + e,
      y + h + dy + e,
      z + dz + e,
      shade(leaf, r.range(0.85, 1.15)),
      {
        top: shade(leaf, 1.1),
      },
    );
  }
}
