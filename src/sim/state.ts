// The state of a world: everything that changes while it runs. The static map lives in World (src/sim/world.ts).
// Only data here, no behaviour: systems (src/sim/systems) change it, the snapshot (src/sim/snapshot.ts) stores it.
import type { I18n } from './i18n';
import type { Table } from './ecs';

/** 2: places have a harvest. 3: places have arable. 4: England has a national economy. 5: the 30 largest cities have
 *  persons and families. 6: persons have genes. 7: the places and realms of the rest of the globe.
 *  8: a world of 1291 has the people of 1291 (before the Black Death).
 *  9: people and harvest counted in heads at 1:100 (src/sim/scale.ts).
 *  10: the cities have economies of their own that trade with each other and compute one period a day; England's
 *  economy is gone. 11: a world of 1291 has the persons of its own 30 cities of 1291. 12: the persons of the cities'
 *  economies are the persons of the cities, and every firm is an entity (economy feature 10); the economies are
 *  those of the cities of the start year and are founded anew. 13: a world of 1291 has the borders of its setup
 *  again (Murcia to Castile). 14: the family is the purse and a woman without a husband works (economy feature
 *  11); the economies are founded anew. 15: a world of 1291 has persons in every town of the world graphic inside
 *  the world frame (558 towns in 550 places), and an economy in each of those places. 16: the rulers of the
 *  chronicle (src/sim/systems/rulers.ts): every realm has a holder, every person a day of death, and the persons of
 *  history are named. 17: the families who live from agriculture live in hamlets outside the walls of their town, and
 *  every place has the people who live there: its persons, counted (src/sim/systems/hamlets.ts). 18: the borders of the chronicle of borders
 *  (src/sim/systems/borders.ts): places change hands on their days, realms come in with their first places. 19: every
 *  person has a culture and a faith, the counted minorities of the towns among them; a place has none of its own: it
 *  has those of its persons (src/sim/systems/cultures.ts). 20: the land register (src/sim/systems/lots.ts): every family that
 *  lives in a town has a parcel, and every family of the hamlets a farmstead in a hamlet. 21: households spend out of
 *  their savings and a family has a need of food (economy feature 15); the economies are founded anew. 22: the persons of the towns die
 *  (src/sim/systems/deaths.ts): every person has the day of death that was drawn from the life table. 23: the persons marry and are born
 *  (src/sim/systems/families.ts), after England around 1300: the life table of La Poutré & Janssen 2021, a fixed number of
 *  households in every town, a wedding only into a vacant one; the persons are founded anew. 24: the crown of a city buys
 *  with what it took in (economy feature 16); the economies are founded anew. 25: there is distance
 *  between the cities (economy feature 17); the economies are founded anew. Snapshots from 11 on are brought up to date by src/sim/upgrade.ts. */
export const STATE_VERSION = 25;

/** Components of every land place (index = place id, 0 … L − 1). */
export interface Places {
  /** realm that owns the place (−1: nobody) */
  owner: Int16Array;
  /** people living there: its living persons, counted once a year (src/sim/systems/hamlets.ts) */
  pop: Float32Array;
  /** the last harvest: kilocalories of food from arable farming in a year (src/sim/systems/harvest.ts) */
  harvest: Float64Array;
  /** cultivated land in hectares: arable including fallow (src/sim/systems/cultivation.ts) */
  arable: Float64Array;
}

/** holder: the person who holds the realm's crown (src/sim/systems/rulers.ts), −1 when nobody does */
export const REALM_SCHEMA = { capital: 'i32', color: 'u32', culture: 'u16', faith: 'u8', rank: 'u8', holder: 'i32' } as const;
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
  /** the genes the portraits draw the face from: 34 genes of two alleles, 68 bytes a person, the first allele of
   *  every gene then the second (src/sim/people/genes.ts, after Apoleia's portrait/src/dna.rs) */
  genes: ['u8', 68],
  /** the part of the person in the economy of the city (ROLE in src/sim/systems/work.ts; 0: none), and the person's
   *  position in the engine's list of that part (economy feature 10) */
  role: 'u8', agent: 'i32',
  /** the firm of the person: the employer of a worker (−1 without work), the own firm of an owner; −1 for everybody
   *  else */
  firm: 'i32',
  /** money of the person as the economy of the city computed it for the last day, in £ at the scale of the world:
   *  the wage before tax, the disposable income and what was spent on consumption, each of that day; and the savings
   *  (the deposits at the bank) */
  wage: 'f32', income: 'f32', spent: 'f32', savings: 'f32',
  /** what the person consumed on the last day, in £ at the scale of the world: the person's share by baskets of what
   *  the family spent (economy feature 11, src/sim/systems/household.ts) */
  consumed: 'f32',
  /** the day the person died (the persons of the cities do not die yet; a ruler dies on the real day), ALIVE while
   *  the person lives. A dead person keeps the row: ids are never reused */
  died: 'i32',
  /** the culture and the faith of the person (indices of ALL_CULTURES and FAITHS, src/sim/content/peoples.ts;
   *  src/sim/systems/cultures.ts) */
  culture: 'u16', faith: 'u8',
  /** the day the person will die, drawn from the life table when the person comes into the world
   *  (src/sim/systems/deaths.ts); ALIVE for a ruler, who dies on the day of the chronicle */
  dies: 'i32',
  /** the day a wife bears her next child (src/sim/systems/families.ts), ALIVE while none is due */
  bears: 'i32',
} as const;
/** `died` of a living person. */
export const ALIVE = 0x7fffffff;
/** `born` of a person whose birthday no source gives. */
export const BORN_UNKNOWN = -0x80000000;
export type PersonSchema = typeof PERSON_SCHEMA;
/** A family: a couple and its unmarried children in one place, or a person on their own. The id is never reused. */
export const FAMILY_SCHEMA = {
  place: 'i16',
  /** the couple at its head: person ids, −1 where there is none */
  man: 'i32', woman: 'i32',
  /** the purse of the family (economy feature 11, src/sim/systems/household.ts), written after every day of the
   *  economy: its persons, those of them who work, and the baskets they consume (an adult one, a child under 15 half) */
  persons: 'u16', working: 'u16', baskets: 'f32',
  /** of the last day, in £ at the scale of the world: the disposable income and the spending of all its members;
   *  and their savings */
  income: 'f32', spent: 'f32', savings: 'f32',
  /** what the food the family needs costs on that day, in £ (economy feature 15: 2,100 kcal per basket at the price
   *  of the city's agriculture), and the part of it the family covered with what it spent, 0 to 1. `need` 0: the
   *  family's place has no economy and `fed` says nothing */
  need: 'f32', fed: 'f32',
  /** 1: the family lives from agriculture and lives in a hamlet outside the walls of its town (src/sim/systems/hamlets.ts) */
  hamlet: 'u8',
  /** the parcel or the farmstead the family lives on (the land register below, src/sim/systems/lots.ts), NO_LOT
   *  when it has none. Several families may share one; at the founding each has its own */
  lot: 'i32',
  /** 1: the family is a household of its town, with the woman at its head as its housewife. The towns have a fixed
   *  number of them; a household whose housewife has died is vacant until a wedding fills it or takes its seat
   *  (src/sim/systems/families.ts) */
  seat: 'u8',
} as const;
export type FamilySchema = typeof FAMILY_SCHEMA;
/** `lot` of a family without a parcel. */
export const NO_LOT = -1;
/** The land register (settlement features 1 and 2, src/sim/systems/lots.ts): every piece of ground of a town and
 *  of its hamlets that somebody or something holds. A row is never freed, so the id of a parcel stays the parcel. */
export const LOT_SCHEMA = {
  /** what stands on the ground (LOT_KIND) */
  kind: 'u8',
  /** the place of the map the ground lies in, and the town it belongs to: its index into data/content/gazetteer.json
   *  (the `site` of src/sim/content/cities.ts; a place may hold several towns) */
  place: 'i16', site: 'i16',
  /** the middle of the ground: metres east and south of the centre of the town, at the scale of the houses */
  x: 'f32', z: 'f32',
  /** metres along the street and metres deep */
  w: 'f32', d: 'f32',
  /** the side the street lies on (FRONT in src/sim/settlement/rule.ts: 0 north, 1 east, 2 south, 3 west) */
  front: 'u8',
  /** the hamlet a farmstead lies in (a row of the table of hamlets), NO_HAMLET for the ground of the town itself */
  hamlet: 'i32',
} as const;
export type LotSchema = typeof LOT_SCHEMA;
/** `hamlet` of a piece of ground in the town itself. */
export const NO_HAMLET = -1;
/** The hamlets of the towns (settlement feature 2, src/sim/systems/lots.ts): where the families who live from
 *  agriculture have their farmsteads, outside the walls of their town. A row is never freed. */
export const HAMLET_SCHEMA = {
  /** the place of the map the hamlet lies in, and the town it belongs to (its site, as in the land register) */
  place: 'i16', site: 'i16',
  /** its middle: metres east and south of the centre of its town, at the scale of the houses, as the ground of the
   *  town itself (a block of the houses is 2 m and is shown as about 125 m of land) */
  x: 'f32', z: 'f32',
  /** the farmsteads laid out in it */
  farms: 'u16',
} as const;
export type HamletSchema = typeof HAMLET_SCHEMA;
/** What a row of the land register is: the parcel of a family in a town, or the farmstead of a family in a hamlet.
 *  Walls, gates, bridges, streets, squares and landmarks get their numbers when their features are built. */
export const LOT_KIND = { parcel: 0, farmstead: 1 } as const;
/** A firm of the economy of a city (economy feature 10): an entity for every firm the engine computes. The firms of
 *  a city lie one after the other, in the engine's order (`CityEconomies.firm0`). All but the place and the owner
 *  are written by the economy after every day (src/sim/systems/economy.ts). */
export const FIRM_SCHEMA = {
  place: 'i16',
  /** the person who owns the firm */
  owner: 'i32',
  /** the sector: its number in the calibration table (agriculture, industry, services) */
  sector: 'u8',
  /** the persons it employs (the owner is not one of them) */
  employees: 'i32',
  /** of the last day: the goods made (at the prices of the start), the price (1 at the start) and the wage in money
   *  it pays a person before tax, in £ at the scale of the world */
  output: 'f32', price: 'f32', pay: 'f32',
} as const;
export type FirmSchema = typeof FIRM_SCHEMA;

/** A person of history (a ruler): who the person is in the sources. Kept beside the person table (strings do not go
 *  into typed arrays), in the order the persons came into the world. */
export interface NamedPerson {
  /** the person's row in the person table */
  person: number;
  /** the key of the person in the chronicle of rulers (public/data/rulers_<year>.json) */
  key: string;
  name: string;
  /** the house (dynasty), '' when the source names none */
  house: string;
  /** the Wikidata id, '' when not known */
  qid: string;
}

/** Texts of a realm (kept beside the table: strings do not go into typed arrays). */
export interface RealmText { key: string; name: I18n; short: I18n; adjective: I18n }

/** The economies of the cities, computed by the economy engine (src/sim/systems/economy.ts). The cities are the
 *  `places`, in the engine's order. */
export interface CityEconomies {
  /** the day of the world up to which the economies are computed: the day they were founded on, then the day of the
   *  last period */
  day: number;
  /** the state of all cities and of the merchants between them as the engine's bytes (economy/src/state.rs) */
  model: Uint8Array;
  /** the key figures of every city on that day (FIGURES numbers a city, FIGURE in src/sim/economy/engine.ts): flows
   *  are sums over the last 365 days */
  figures: Float64Array;
  /** the yearly accounts: for each year that has ended, the year and the key figures of every city at its end
   *  (`yearRow` numbers a year, src/sim/systems/economy.ts) */
  years: Float64Array;
  /** why the economies stand still, '' while they run: a day that the engine could not compute stops them for good */
  halted: string;
  /** the place of every city, in the engine's order: the places of the cities of the start year */
  places: Int32Array;
  /** per city the id of its first firm (`WorldState.firm`), and after the last city the number of all firms */
  firm0: Int32Array;
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
  /** the persons of the cities of the start year (src/sim/content/cities.ts, src/sim/systems/people.ts) */
  person: Table<PersonSchema>;
  family: Table<FamilySchema>;
  /** the firms of the cities' economies (src/sim/systems/economy.ts) */
  firm: Table<FirmSchema>;
  /** the persons of history (the rulers), src/sim/systems/rulers.ts */
  named: NamedPerson[];
  /** the land register: the parcels of the towns and the farmsteads of their hamlets (src/sim/systems/lots.ts) */
  lot: Table<LotSchema>;
  /** the hamlets of the towns (src/sim/systems/lots.ts) */
  hamlets: Table<HamletSchema>;
  economy: {
    /** the cities as economies that trade; null in a world that does not start in the year of their calibration */
    cities: CityEconomies | null;
  };
}
