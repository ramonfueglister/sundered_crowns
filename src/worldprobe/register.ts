// What the world graphic draws of a town from the simulation's land register (lots.ts) besides its houses: the ground
// of its streets and market, and the pieces of its wall (settlement feature 6), in blocks from the town's middle.
import { m } from '../buildings';
import type { Parcels } from './lots';

/** the kind of the market among a town's streets (STREET_KIND in src/sim/state.ts) */
const MARKET = 4;

/**
 * The ground of a town's streets and market as blocks from its middle, four numbers to a piece (x0, z0, x1, z1, the
 * ends not included): a street as wide as the register makes it about its middle line, the market as its corners.
 * The edges round to blocks as those of the parcels do, so that a street reaches the houses at its side.
 */
export function streetsOf(L: Parcels): number[] {
  const half = (L.street ?? 0) / 2,
    out: number[] = [];
  for (const [x0, z0, x1, z1, k] of L.streets ?? []) {
    const pad = k === MARKET ? 0 : half;
    const a0 = Math.round(m(Math.min(x0, x1) - pad)),
      a1 = Math.max(a0 + 1, Math.round(m(Math.max(x0, x1) + pad)));
    const b0 = Math.round(m(Math.min(z0, z1) - pad)),
      b1 = Math.max(b0 + 1, Math.round(m(Math.max(z0, z1) + pad)));
    out.push(a0, b0, a1, b1);
  }
  return out;
}

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
