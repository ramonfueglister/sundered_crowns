// The bridges of the start year known from the sources (src/sim/content/bridges_<year>.json, written by
// tools/settlement/bridges.py from data/history/<year>/settlement/bridges_<year>.csv): the bridges known by name, with
// what they were built of, and the towns whose great river was crossed by ferry or on boats. Settlement feature 7
// (src/sim/systems/bridges.ts).
import B1291 from './bridges_1291.json';

/** a bridge known by name in its town */
export interface Named {
  site: number;
  name: string;
  /** built of stone in the year (else of timber) */
  stone: boolean;
  /** houses stood on it */
  houses: boolean;
}

const BY_YEAR: ReadonlyMap<number, { named: readonly Named[]; ferry: ReadonlySet<number> }> = new Map([
  // (the file's rows as written by tools/settlement/bridges.py: an empty list types as never[])
  [1291, { named: B1291.named as Named[], ferry: new Set((B1291.ferry as { site: number }[]).map((t) => t.site)) }],
]);

/** the bridges known by name in the year, in the order of the file (their row is a bridge's `named`) */
export const namedBridges = (year: number): readonly Named[] => BY_YEAR.get(year)?.named ?? [];
/** whether the great river of a town of `year` was crossed by ferry or on boats, not on a bridge */
export const ferried = (year: number, site: number): boolean => BY_YEAR.get(year)?.ferry.has(site) ?? false;
