// The ground of the towns laid on a real plan that draws its land and water (Venice, from the land register of 1808):
// in the square the plan draws, the world takes land and water from the plan instead of from the map, at the size the
// simulation laid the town (src/sim/settlement/plan_ground.ts, src/net/lots.ts), so that its houses, streets and
// bridges stand on the plan's land. The town is laid round its site's block, as the simulation's centre.
import { N, idx } from '../lookprobe/layout';
import { GROUND, type GroundBlocks, groundBlocks } from '../sim/settlement/plan_ground';
import { planOf } from '../sim/content/town_plans';
import type { TownParcels } from './lots';
import { Water } from './region';

/** metres a block of the finest step stands for at the scale of the houses (src/worldprobe/settle.ts, m) */
const FINEST_METRES = 2;
/** the blocks of each such town on each step, kept for the pieces that follow */
const kept = new Map<string, GroundBlocks>();

/**
 * Lays the plan's ground on the columns of a piece of `step`: `kind` and `metres` as readColumns filled them;
 * `siteBlock` gives the block of the piece a town's site lies on. Water lies at the sea's height; land keeps the
 * map's height where the map has land there, and the sea's where it has water (a lagoon town stands at the sea).
 */
export function layPlanGrounds(
  parcels: TownParcels,
  step: number,
  siteBlock: (site: number) => readonly [number, number] | null,
  kind: Uint8Array,
  metres: Float32Array,
) {
  const year = parcels.year ?? 1291,
    size = FINEST_METRES * 2 ** step;
  for (const [site, t] of parcels) {
    const plan = t.ground && planOf(year, site);
    if (!t.ground || !plan?.ground || !plan.radius) continue;
    const at = siteBlock(site);
    if (!at) continue;
    const key = `${year} ${site} ${step} ${t.ground.radius} ${t.ground.half}`;
    let blocks = kept.get(key);
    if (!blocks) {
      blocks = groundBlocks(plan, plan.ground, plan.radius, t.ground.radius, t.ground.half, size);
      kept.set(key, blocks);
    }
    const ax = Math.floor(at[0]),
      az = Math.floor(at[1]),
      r = blocks.reach;
    for (let z = Math.max(0, az - r); z <= Math.min(N - 1, az + r); z++)
      for (let x = Math.max(0, ax - r); x <= Math.min(N - 1, ax + r); x++) {
        const k = blocks.at(x - ax, z - az),
          i = idx(x, z);
        if (k === GROUND.open) continue;
        if (k === GROUND.water) {
          kind[i] = Water.Sea;
          metres[i] = 0;
        } else {
          if (kind[i] !== Water.Land) metres[i] = 0;
          kind[i] = Water.Land;
        }
      }
  }
}
