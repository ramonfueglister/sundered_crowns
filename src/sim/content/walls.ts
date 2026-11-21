// The town walls of the start year (src/sim/content/walls_<year>.json, written by tools/settlement/walls.py): the
// towns whose walled area of that year is known, against their settled area (Cesaretti et al. 2016, appendix S2), and
// the towns that had no wall. Settlement feature 6 (src/sim/systems/walls.ts).
import W1291 from './walls_1291.json';

interface Walled {
  /** hectares inside the wall */
  walled: number;
  /** hectares settled, the suburbs with them (the area of src/sim/content/settled_area_1300.json) */
  settled: number;
}

const BY_YEAR: ReadonlyMap<number, { walled: ReadonlyMap<number, Walled>; unwalled: ReadonlySet<number> }> = new Map([
  [
    1291,
    {
      walled: new Map(W1291.towns.map((t) => [t.site, { walled: t.walled_ha, settled: t.settled_ha }])),
      unwalled: new Set(W1291.unwalled.map((t) => t.site)),
    },
  ],
]);

/** the walled and the settled area of a town of `year`, where the sources know its wall of that year */
export const walledOf = (year: number, site: number): Walled | undefined => BY_YEAR.get(year)?.walled.get(site);
/** whether a town of `year` had no wall */
export const unwalled = (year: number, site: number): boolean => BY_YEAR.get(year)?.unwalled.has(site) ?? false;
