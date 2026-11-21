// The ground of a town's streets and market, and where the persons of a town go by their plan of the day (people
// feature 12, src/figures/aims.ts): the town's market and its houses of worship as the land register has them
// (settlement features 3 and 5), in blocks.
import { m } from '../buildings';
import type { Parcels } from './lots';
import type { Mark } from './settle';

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

/** The ground of the town's first market as world blocks (x0, z0, x1, z1, the ends not included), for the town whose
 *  middle is the world block (cx, cz); undefined where the register has none. */
export function marketOf(lots: Parcels, cx: number, cz: number): [number, number, number, number] | undefined {
  const rects = streetsOf(lots),
    k = (lots.streets ?? []).findIndex((s) => s[4] === MARKET);
  if (k < 0) return undefined;
  return [cx + rects[4 * k], cz + rects[4 * k + 1], cx + rects[4 * k + 2], cz + rects[4 * k + 3]];
}

/** The middles of the town's houses of worship as world blocks: its landmarks that are churches, cathedrals, abbeys,
 *  convents or Friday mosques (`WORSHIP`, src/worldprobe/landmarks.ts). */
export const worshipOf = (marks: readonly Mark[] | undefined, cx: number, cz: number): [number, number][] =>
  (marks ?? []).filter((k) => k.worship).map((k) => [cx + Math.round(m(k.x)), cz + Math.round(m(k.z))]);
