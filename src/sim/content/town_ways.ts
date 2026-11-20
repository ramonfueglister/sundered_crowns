// The ways of the world that leave each town, by the start year (src/sim/content/town_ways_<year>.json, written by
// tools/settlement/town_ways.ts from public/data/roads_<year>.json). The first streets of a town run out along them
// (settlement feature 3, src/sim/settlement/streets.ts).
import W1291 from './town_ways_1291.json';
import type { Way } from '../settlement/streets';

const BY_YEAR: ReadonlyMap<number, ReadonlyMap<number, readonly Way[]>> = new Map([[1291, new Map((W1291.towns as { site: number; ways: Way[] }[]).map((t) => [t.site, t.ways]))]]);

/** the ways that leave the town `site` in the world of `year`; none where the year has no ways or the town none */
export const waysOf = (year: number, site: number): readonly Way[] => BY_YEAR.get(year)?.get(site) ?? [];
