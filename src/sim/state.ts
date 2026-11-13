// The state of a world: everything that changes while it runs. The static map lives in World (src/sim/world.ts).
// Only data here, no behaviour: systems (src/sim/systems) change it, the snapshot (src/sim/snapshot.ts) stores it.
import type { I18n } from './i18n';
import type { Table } from './ecs';

export const STATE_VERSION = 1;

/** Components of every land place (index = place id, 0 … L − 1). */
export interface Places {
  /** realm that owns the place (−1: nobody) */
  owner: Int16Array;
  culture: Uint16Array;
  faith: Uint8Array;
  /** people living there */
  pop: Float32Array;
}

export const REALM_SCHEMA = { capital: 'i32', color: 'u32', culture: 'u16', faith: 'u8', rank: 'u8' } as const;
export type RealmSchema = typeof REALM_SCHEMA;

/** Ranks of realms in the start setup (index stored in the rank column). */
export const RANKS = [
  'empire', 'kingdom', 'grand_duchy', 'duchy', 'principality', 'margraviate', 'landgraviate', 'county', 'lordship', 'free_city',
  'republic', 'archbishopric', 'prince_bishopric', 'order', 'despotate', 'sultanate', 'emirate', 'beylik', 'khanate', 'chiefdom', 'tribe',
] as const;

/** Texts of a realm (kept beside the table: strings do not go into typed arrays). */
export interface RealmText { key: string; name: I18n; short: I18n; adjective: I18n }

export interface WorldState {
  v: number;
  seed: number;
  startYear: number;
  /** days since 1 January of the start year */
  day: number;
  /** xoshiro128** state (src/sim/rng.ts) */
  rng: number[];
  place: Places;
  realm: Table<RealmSchema>;
  realmText: RealmText[];
  /** the player who rules each realm (account id), '' when nobody does */
  ruler: string[];
}
