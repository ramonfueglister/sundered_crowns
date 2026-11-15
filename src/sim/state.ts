// The state of a world: everything that changes while it runs. The static map lives in World (src/sim/world.ts).
// Only data here, no behaviour: systems (src/sim/systems) change it, the snapshot (src/sim/snapshot.ts) stores it.
import type { I18n } from './i18n';
import type { Table } from './ecs';

/** 2: places have a harvest. 3: places have arable. 4: England has a national economy. 5: the 30 largest cities have
 *  persons and families. Older snapshots are brought up to date by src/sim/upgrade.ts. */
export const STATE_VERSION = 5;

/** Components of every land place (index = place id, 0 … L − 1). */
export interface Places {
  /** realm that owns the place (−1: nobody) */
  owner: Int16Array;
  culture: Uint16Array;
  faith: Uint8Array;
  /** people living there */
  pop: Float32Array;
  /** the last harvest: kilocalories of food from arable farming in a year (src/sim/systems/harvest.ts) */
  harvest: Float64Array;
  /** cultivated land in hectares: arable including fallow (src/sim/systems/cultivation.ts) */
  arable: Float64Array;
}

export const REALM_SCHEMA = { capital: 'i32', color: 'u32', culture: 'u16', faith: 'u8', rank: 'u8' } as const;
export type RealmSchema = typeof REALM_SCHEMA;

/** Ranks of realms in the start setup (index stored in the rank column). */
export const RANKS = [
  'empire', 'kingdom', 'grand_duchy', 'duchy', 'principality', 'margraviate', 'landgraviate', 'county', 'lordship', 'free_city',
  'republic', 'archbishopric', 'prince_bishopric', 'order', 'despotate', 'sultanate', 'emirate', 'beylik', 'khanate', 'chiefdom', 'tribe',
] as const;

/** A person (src/sim/systems/people.ts). The id is never reused. Age is not stored: it is (day − born) / 365.25. */
export const PERSON_SCHEMA = {
  /** birthday: days since 1 January of the start year (negative: before it) */
  born: 'i32',
  /** 0 female, 1 male */
  sex: 'u8',
  /** person ids of the parents, −1 when not known */
  mother: 'i32', father: 'i32',
  /** the family the person lives in */
  family: 'i32',
  /** IQ points: mean 100, standard deviation 15, normed on the people of the world */
  iq: 'u8',
  /** the Big Five as T-scores (mean 50, standard deviation 10): openness, conscientiousness, extraversion, agreeableness, neuroticism */
  o: 'u8', c: 'u8', e: 'u8', a: 'u8', n: 'u8',
} as const;
export type PersonSchema = typeof PERSON_SCHEMA;
/** A family: a couple and its unmarried children in one place, or a person on their own. The id is never reused. */
export const FAMILY_SCHEMA = {
  place: 'i16',
  /** the couple at its head: person ids, −1 where there is none */
  man: 'i32', woman: 'i32',
} as const;
export type FamilySchema = typeof FAMILY_SCHEMA;

/** Texts of a realm (kept beside the table: strings do not go into typed arrays). */
export interface RealmText { key: string; name: I18n; short: I18n; adjective: I18n }

/** A national economy computed by the economy engine (src/sim/systems/economy.ts). */
export interface NationalEconomy {
  /** the year the figures stand for: the year of the calibration at the start, then the year of the last period */
  year: number;
  /** the state of the model as the engine's bytes (economy/src/state.rs) */
  model: Uint8Array;
  /** the key figures of that year (FIGURE in src/sim/economy/engine.ts) */
  figures: Float64Array;
  /** why the economy stands still, '' while it runs: a period that the engine could not compute stops it for good */
  halted: string;
}

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
  /** the persons of the 30 largest cities (src/sim/systems/people.ts) */
  person: Table<PersonSchema>;
  family: Table<FamilySchema>;
  economy: {
    /** England as one economy; null in a world that does not start in the year of its calibration */
    england: NationalEconomy | null;
  };
}
