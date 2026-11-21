// The real plans of the towns whose old plan is open, by the start year (src/sim/content/town_plans_<year>.json,
// written by tools/settlement/cadastre_skeleton.py and cadastre_venice.py): the market and the main streets east and
// south of the town's centre, in radii of the real town (the world lays a plan as wide as its own town), and where the
// plan draws them its land and water (src/sim/settlement/plan_ground.ts). Such a town lays these streets instead of
// the ones along the ways of the world (settlement feature 3, src/sim/settlement/streets.ts).
import P1291 from './town_plans_1291.json';
import type { Plan, PlanGround } from '../settlement/plan_ground';

interface GroundJson {
  x0: number;
  z0: number;
  cell: number;
  w: number;
  h: number;
  water: string;
}
interface TownJson {
  market: number[];
  streets: number[][];
  radius: number;
  ground?: GroundJson;
  wall?: number[][];
}

/** the shares of water, two cells to a byte, the lower half first (cadastre_venice.py) */
const groundOf = (g: GroundJson): PlanGround => {
  const bytes = Uint8Array.from(atob(g.water), (c) => c.charCodeAt(0)),
    water = new Uint8Array(g.w * g.h);
  for (let k = 0; k < water.length; k++) water[k] = (bytes[k >> 1] >> ((k & 1) * 4)) & 15;
  return { x0: g.x0, z0: g.z0, cell: g.cell, w: g.w, h: g.h, water };
};
const read = (towns: Record<string, TownJson>) =>
  new Map(
    Object.entries(towns).map(([site, t]): [number, Plan] => [
      Number(site),
      {
        market: [t.market[0], t.market[1]],
        streets: t.streets,
        radius: t.radius,
        ground: t.ground && groundOf(t.ground),
        wall: t.wall,
      },
    ]),
  );
// (as: the type TypeScript reads off the file knows only the towns it holds, and some have no ground)
const BY_YEAR: ReadonlyMap<number, ReadonlyMap<number, Plan>> = new Map([
  [1291, read(P1291.towns as Record<string, TownJson>)],
]);

/** the real plan of the town `site` in the world of `year`, in radii of the real town; none where no old plan of it is read */
export const planOf = (year: number, site: number): Plan | undefined => BY_YEAR.get(year)?.get(site);
