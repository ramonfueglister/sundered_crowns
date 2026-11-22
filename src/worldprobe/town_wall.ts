// The wall and the bridges of a town as the world graphic draws them from the simulation's land register (lots.ts):
// the pieces of its ring (settlement feature 6) and its bridges (feature 7) in blocks from the town's middle.
import { m, ringWall, townBridge } from '../buildings';
import type * as THREE from 'three';
import type { Batch } from '../lookprobe/batch';
import type { Parcels } from './lots';

/** The pieces of a town's wall, [x0, z0, x1, z1, kind] in blocks of a step `wider` finest blocks to its block. */
const wallOf = (L: Parcels, wider = 1): number[][] =>
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

/**
 * Adds the wall and the bridges of a town to `things`, set by `at` at the town's middle: in blocks of a step `wider`
 * finest blocks to its block, from the town's middle, `up` upright; gives the pieces of its wall. `height(x, z)` is the ground there or null outside this ground, `mine(x, z)`
 * whether this piece of the world draws what stands there, `dry(x, z)` whether the ground there is not water: the wall
 * stands on what of its ring this piece owns on dry ground, a bridge where its middle lies on it.
 */
export function townWorks(
  things: Batch,
  at: THREE.Matrix4,
  L: Parcels,
  wider: number,
  up: number,
  height: (x: number, z: number) => number | null,
  mine: (x: number, z: number) => boolean,
  dry: (x: number, z: number) => boolean,
): number[][] {
  const pieces = wallOf(L, wider);
  if (pieces.length)
    things.append(
      ringWall(pieces, (x, z) => (mine(x, z) && dry(x, z) ? height(x, z) : null), 1 / wider, up),
      at,
    );
  const rows = (L.bridges ?? []).map(([x0, z0, x1, z1, k, h]) => [
    m(x0) / wider,
    m(z0) / wider,
    m(x1) / wider,
    m(z1) / wider,
    k,
    h,
  ]);
  if (rows.length) things.append(townBridge(rows, m(L.street ?? 0) / wider, height, mine, 1 / wider, up), at);
  return pieces;
}
