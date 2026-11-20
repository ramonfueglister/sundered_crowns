// The real plans of the towns whose old plan is open, by the start year (src/sim/content/town_plans_<year>.json,
// written by tools/settlement/cadastre_skeleton.py): the market and the main streets east and south of the town's
// centre, in radii of the real town (the world lays a plan as wide as its own town). Such a town lays these streets
// instead of the ones along the ways of the world (settlement feature 3, src/sim/settlement/streets.ts).
import P1291 from './town_plans_1291.json';
import type { Plan } from '../settlement/streets';

const read = (towns: Record<string, { market: number[]; streets: number[][] }>) =>
  new Map(
    Object.entries(towns).map(([site, t]): [number, Plan] => [
      Number(site),
      { market: [t.market[0], t.market[1]], streets: t.streets },
    ]),
  );
const BY_YEAR: ReadonlyMap<number, ReadonlyMap<number, Plan>> = new Map([[1291, read(P1291.towns)]]);

/** the real plan of the town `site` in the world of `year`, in radii of the real town; none where no old plan of it is read */
export const planOf = (year: number, site: number): Plan | undefined => BY_YEAR.get(year)?.get(site);
