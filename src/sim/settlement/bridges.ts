// The bridges of a town (settlement feature 7, docs/SETTLEMENT_DESIGN.md, where every source is listed): where a
// street along a way of the world ends at a river, a bridge takes it over to the other bank. Only geometry here, no
// state: src/sim/systems/bridges.ts writes the bridges of the towns with it.
//
// "Where a major road met a river there was a bridge", and the major bridges stood "either in towns or between two
// towns" (Harrison 2010, pp. 33, 36). A lake or the sea is crossed by ferry, as the ways of the world graphic wait for
// one there (src/worldprobe/world.ts).
import type { Crossing } from './walls';

/** what a bridge is built of */
export const BRIDGE_KIND = { timber: 0, stone: 1 } as const;

/** a bridge from bank to bank, on the middle line of its street: its ends (metres east and south of the town's centre)
 *  and how wide the water is under it */
export interface Span {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** metres from bank to bank */
  span: number;
}

/** How far beyond the end of its street a river may begin and the street still cross it, in widths of the street.
 *  OWN RULE: a street ends a block before the water it meets (src/sim/settlement/streets.ts), its ground half a street
 *  wide round its middle line. */
export const MEETS = 1.5;

/**
 * The bridges of a town: from the end of each street along a way (`kind` above a lane) that goes on from no other way
 * and meets a river (`river`) within MEETS widths of the street (`width` metres), over the river to the first ground
 * that is dry (`dry`), asked every `step` metres up to `reach`. Where the water ends on anything else (a lake, the
 * sea, rock) or reaches farther, the street ends at the water. Two streets that meet over one river (a plan's main
 * street cut by it) share one bridge.
 */
export function bridgesOf(
  streets: readonly Crossing[],
  river: (x: number, z: number) => boolean,
  dry: (x: number, z: number) => boolean,
  width: number,
  step: number,
  reach: number,
): Span[] {
  const ways = streets.filter((q) => q.kind > 0),
    out: Span[] = [];
  const near = (a: number, b: number, x: number, z: number) => Math.abs(a - x) < 0.5 && Math.abs(b - z) < 0.5;
  const goesOn = (x: number, z: number, self: Crossing) =>
    ways.some((q) => q !== self && (near(q.x0, q.z0, x, z) || near(q.x1, q.z1, x, z)));
  for (const q of ways)
    for (const [x, z, fx, fz] of [
      [q.x1, q.z1, q.x0, q.z0],
      [q.x0, q.z0, q.x1, q.z1],
    ]) {
      const len = Math.hypot(x - fx, z - fz);
      if (len < 1e-6 || goesOn(x, z, q)) continue;
      const ux = (x - fx) / len,
        uz = (z - fz) / len,
        at = (t: number): [number, number] => [x + ux * t, z + uz * t];
      let from = -1;
      for (let t = step; t <= MEETS * width + step && from < 0; t += step) if (river(...at(t))) from = t;
      if (from < 0) continue;
      let to = -1;
      for (let t = from; t <= reach; t += step) {
        if (river(...at(t))) continue;
        if (dry(...at(t))) to = t;
        break;
      }
      if (to < 0) continue;
      const [x1, z1] = at(to),
        mx = (x + x1) / 2,
        mz = (z + z1) / 2;
      // the other bank's street meets the same river: one bridge for both
      if (
        out.some((b) => offLine(b, mx, mz) < width && Math.hypot(mx - (b.x0 + b.x1) / 2, mz - (b.z0 + b.z1) / 2) < to)
      )
        continue;
      out.push({ x0: x, z0: z, x1, z1, span: to - from });
    }
  return out;
}

/** how far a point lies off the line of a bridge, in metres */
function offLine(b: Span, x: number, z: number): number {
  const dx = b.x1 - b.x0,
    dz = b.z1 - b.z0,
    len = Math.hypot(dx, dz);
  return len < 1e-9 ? Math.hypot(x - b.x0, z - b.z0) : Math.abs(dx * (b.z0 - z) - (b.x0 - x) * dz) / len;
}
