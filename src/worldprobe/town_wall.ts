// The wall of a town as the world graphic draws it from the simulation's land register (lots.ts): the pieces of its
// ring (settlement feature 6) in blocks from the town's middle.
import { m } from '../buildings';
import type { Parcels } from './lots';

/** The pieces of a town's wall, [x0, z0, x1, z1, kind] in blocks of a step `wider` finest blocks to its block. */
export const wallOf = (L: Parcels, wider = 1): number[][] =>
  (L.walls ?? []).map(([x0, z0, x1, z1, k]) => [m(x0) / wider, m(z0) / wider, m(x1) / wider, m(z1) / wider, k]);

/** Every block the pieces of a wall run over, the wall's middle at (cx, cz): `at(x, z)` for each, also twice. */
export function onWall(
  pieces: readonly (readonly number[])[],
  cx: number,
  cz: number,
  at: (x: number, z: number) => void,
) {
  for (const [x0, z0, x1, z1] of pieces) {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) * 2);
    for (let k = 0; k <= n; k++)
      at(Math.floor(cx + x0 + ((x1 - x0) * k) / n), Math.floor(cz + z0 + ((z1 - z0) * k) / n));
  }
}
