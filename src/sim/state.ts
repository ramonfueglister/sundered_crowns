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
 *  with what it took in (economy feature 16); the economies are founded anew. 25: the unmarried move to other places and
 *  an heir comes home (src/sim/systems/moves.ts): every person has the place they come from and the day of the next move.
 *  26: there is distance between the cities (economy feature 17) and a firm and its owner are one household (economy
 *  feature 18); the economies are founded anew. 27: goods go over land on the ways of the world (src/sim/roads.ts):
 *  the routes between the cities follow the ways and go slower off them; the economies are founded anew. 28: IQ and
 *  the Big Five shift the rates of death, of a far move and of who is taken at a wedding (people feature 5,
 *  src/sim/people/traits.ts); deaths and moves are drawn anew. 29: a founder draws the genes from the pool of the
 *  culture, not of the place (src/sim/people/pools.ts; portrait round 111), and a person carries 50 genes where there
 *  were 34 (round 112: more of the face); every person's genes are given anew. Snapshots from 11 on are brought up
 *  to date by src/sim/upgrade.ts.
 *  30: the archive of the dead (people feature 7, src/sim/people/archive.ts): every person has a uid that never
 *  changes, the parents are uids, a woman counts the children she has borne, and on the first day of every year the
 *  dead whom nothing in the running world needs leave the table of the persons for the archive; the rows of the
 *  others close up.
 *  31: the firms of the cities work on the working days of their owner's faith (economy feature 19,
 *  src/sim/holy_days.ts): the economies keep the last day of the working days they have.
 *  32: the days of rest without a leak (economy feature 20): a firm buys on a working day the materials of its next
 *  working day, and the owner of a firm buys on the working days of his faith on the mean profit of his firm over a
 *  year; the engine's state keeps those profits (its format 11).
 *  33: the streets and the market of every town (settlement feature 3, src/sim/settlement/streets.ts): the parcels
 *  lie at streets that grew to them, no longer on a grid; every parcel keeps its family and its size.
 *  34: a world knows the history only up to its start (economy feature 21): a world of 1291 on the table of 1356 forms
 *  its expectations from 1281 to 1291, not from the years of the plague; its economies are founded anew.
 *  35: sickness and childbed (people feature 9, economy feature 22, src/sim/people/absence.ts): a worker who is away
 *  takes nothing from the firm's labour on that day; the engine's state keeps the absences of the month (its format
 *  12).
 *  36: service by the year and work by the day (people feature 10, economy feature 23, economy/src/workers.rs): a
 *  worker who heads a family is paid for the days he works, and workers without work stand in for those who are
 *  away; the engine's state keeps the contracts (its format 13).
 *  37: the fields of the farmsteads (settlement feature 4, src/sim/settlement/fields.ts): every hamlet has its furlongs
 *  in courses, shared in strips by its farmsteads.
 *  38: the landmarks (settlement feature 5, src/sim/systems/landmarks.ts): the church of every town's see, the
 *  convents, the rulers' residences and the buildings known by name stand on their ground; the streets grow round them.
 *  39: the family stands in (economy feature 24, src/sim/systems/workers.ts): on a day on which a worker is away, an
 *  adult of his family who does not work takes his place before a worker without work does; the engine's state keeps
 *  per absence whether the family stands in (its format 14).
 *  40: Venice on the land and water of its land register of 1808 (settlement feature 3, real plans,
 *  src/sim/settlement/plan_ground.ts): its parcels, streets and landmarks lie on the register's land.
 *  41: the town walls and their gates (settlement feature 6, src/sim/systems/walls.ts): every town but Venice has a
 *  ring round it, open at the water, with a gate where a street crosses it.
 *  42: the country folk of the towns (src/sim/people/country_folk.ts): a town has its people after Chandler with the
 *  farmers of a town, and the farmers its economy needs live in the hamlets round it. */
export const STATE_VERSION = 42;

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

/** A person (src/sim/systems/people.ts). The id is the row: it holds from one first of January to the next, when the
 *  dead whom nothing needs go to the archive and the rows close up (src/sim/people/archive.ts); the `uid` holds for
 *  ever. Age is not stored: it is (day − born) / 365.25. */
export const PERSON_SCHEMA = {
  /** birthday: days since 1 January of the start year (negative: before it) */
  born: 'i32',
  /** 0 female, 1 male */
  sex: 'u8',
  /** the uids of the parents (not their rows: a parent may be in the archive), −1 when not known */
  mother: 'i32', father: 'i32',
  /** the family the person lives in */
  family: 'i32',
  /** IQ points: mean 100, standard deviation 15, normed on the people of the world */
  iq: 'u8',
  /** the Big Five as T-scores (mean 50, standard deviation 10): openness, conscientiousness, extraversion, agreeableness, neuroticism */
  o: 'u8', c: 'u8', e: 'u8', a: 'u8', n: 'u8',
  /** the genes the portraits draw the face from: 50 genes of two alleles, 100 bytes a person (34 and 68 up to
   *  version 28), the first allele of every gene then the second (src/sim/people/genes.ts, after Apoleia's
   *  portrait/src/dna.rs) */
  genes: ['u8', 100],
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
   *  the person lives. A dead person keeps the row until the archive takes it (src/sim/people/archive.ts) */
  died: 'i32',
  /** the culture and the faith of the person (indices of ALL_CULTURES and FAITHS, src/sim/content/peoples.ts;
   *  src/sim/systems/cultures.ts) */
  culture: 'u16', faith: 'u8',
  /** the day the person will die, drawn from the life table when the person comes into the world
   *  (src/sim/systems/deaths.ts); ALIVE for a ruler, who dies on the day of the chronicle */
  dies: 'i32',
  /** the day a wife bears her next child (src/sim/systems/families.ts), ALIVE while none is due */
  bears: 'i32',
  /** the place the person comes from: where the person was born, or lived when the world was founded; −1 for a ruler
   *  (people feature 4, src/sim/systems/moves.ts) */
  home: 'i32',
  /** the day the person may next move to another place (src/sim/systems/moves.ts), ALIVE while none is due */
  moves: 'i32',
  /** the number of the person that never changes and is never given twice in a world: the persons who came into it
   *  before count 0, 1, 2 …, in the order they came. The rows of the table lie in the order of their uids. All that
   *  keeps a person beyond a day (the parents, the browser, the copy of the rulers, the archive) names the uid, and
   *  the person's own draws of chance are by the uid (people feature 7, src/sim/people/archive.ts) */
  uid: 'i32',
  /** the children a woman has borne (the next birth takes its draw by the number, src/sim/systems/families.ts) */
  children: 'u8',
} as const;
/** `died` of a living person. */
export const ALIVE = 0x7fffffff;
/** `born` of a person whose birthday no source gives. */
export const BORN_UNKNOWN = -0x80000000;
export type PersonSchema = typeof PERSON_SCHEMA;
/** A family: a couple and its unmarried children in one place, or a person on their own. The id is never reused. */
export const FAMILY_SCHEMA = {
  place: 'i16',
  /** the couple at its head: person ids (rows), −1 where there is none */
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
/** The streets and the markets of the towns (settlement feature 3, src/sim/settlement/streets.ts): straight pieces
 *  of street, east-west or north-south, and the square of each town's market. A row is never freed. */
export const STREET_SCHEMA = {
  /** the town (its site, as in the land register) */
  site: 'i16',
  /** the ends of the piece on the street's middle line, or the corners of the market: metres east and south of the
   *  centre of the town, at the scale of the houses */
  x0: 'f32', z0: 'f32', x1: 'f32', z1: 'f32',
  /** what it is (STREET_KIND) */
  kind: 'u8',
  /** metres from side to side */
  width: 'f32',
} as const;
export type StreetSchema = typeof STREET_SCHEMA;
/** What a row of the streets is: a lane grown to the parcels, a street along a way of the world of its kind, the market. */
export const STREET_KIND = { lane: 0, track: 1, road: 2, highway: 3, market: 4 } as const;
/** The fields of the hamlets (settlement feature 4, src/sim/settlement/fields.ts): every furlong (Gewann) of a
 *  hamlet's arable. In the open field a furlong is shared in strips by all the farmsteads of its hamlet, in the
 *  order of their places at the lane (`stripOrder`); where the land is tilled in two courses it belongs whole to one
 *  farmstead. A row is never freed. */
export const FIELD_SCHEMA = {
  /** the place of the map and the town (its site, as in the land register) */
  place: 'i16', site: 'i16',
  /** the hamlet it belongs to (a row of the table of hamlets) */
  hamlet: 'i32',
  /** its middle: metres east and south of the centre of the town, at the scale of the houses (a block of 2 m is shown
   *  as 125 m of land); metres east-west and north-south */
  x: 'f32', z: 'f32', w: 'f32', d: 'f32',
  /** the course it belongs to (0 … courses − 1) and in how many courses its land is tilled: what it carries in a
   *  year is `cropOf(zelge, courses, year)` */
  zelge: 'u8', courses: 'u8',
  /** the farmstead that holds it whole (a row of the land register), NO_LOT for a furlong of the open field */
  farm: 'i32',
} as const;
export type FieldSchema = typeof FIELD_SCHEMA;
/** The landmarks (settlement feature 5, src/sim/settlement/landmarks.ts): the church of every town's see, the convents
 *  of the mendicant orders, the residences of the rulers, the abbeys and the buildings known by name, each on its
 *  ground. A row is never freed. */
export const LANDMARK_SCHEMA = {
  /** what it is (LANDMARK_KIND in src/sim/settlement/landmarks.ts) */
  kind: 'u8',
  /** the place of the map and the town (its site, as in the land register); −1 for one that stands alone */
  place: 'i16', site: 'i16',
  /** its middle: metres east and south of the centre of its town, at the scale of the houses (0 for one alone) */
  x: 'f32', z: 'f32',
  /** its real place, NaN where it has none of its own (it stands where the town has room) */
  lat: 'f32', lon: 'f32',
  /** metres east-west and north-south */
  w: 'f32', d: 'f32',
  /** the years its building began and ended and the year it became a ruin (NO_YEAR where none): how it stands in a
   *  year is `builtIn(start, end, ruined, year)` */
  start: 'i16', end: 'i16', ruined: 'i16',
  /** the building known by name it is (its index in src/sim/content/landmarks_<year>.json `named`), −1 for none */
  named: 'i16',
  /** the mendicant order of a convent (its index in ORDERS), 255 for none */
  order: 'u8',
} as const;
export type LandmarkSchema = typeof LANDMARK_SCHEMA;
/** The walls of the towns (settlement feature 6, src/sim/settlement/walls.ts): straight pieces of each town's ring,
 *  wall, gate or postern, in turn round the ring; where the ring is open (water, rock) there is no piece. A row is
 *  never freed. */
export const WALL_SCHEMA = {
  /** the town (its site, as in the land register) */
  site: 'i16',
  /** the ends of the piece: metres east and south of the centre of the town, at the scale of the houses */
  x0: 'f32', z0: 'f32', x1: 'f32', z1: 'f32',
  /** what it is (WALL_PIECE in src/sim/settlement/walls.ts) */
  kind: 'u8',
} as const;
export type WallSchema = typeof WALL_SCHEMA;
/** A firm of the economy of a city (economy feature 10): an entity for every firm the engine computes. The firms of
 *  a city lie one after the other, in the engine's order (`CityEconomies.firm0`). All but the place and the owner
 *  are written by the economy after every day (src/sim/systems/economy.ts). */
export const FIRM_SCHEMA = {
  place: 'i16',
  /** the person who owns the firm (the row) */
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
  /** the person's row in the person table (a person of history is never archived: the rows close up around it) */
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
  /** the last day of the world up to which the engine has the working days of the firms (economy feature 19,
   *  src/sim/holy_days.ts), −1 before the first: it is given them for the rest of a year before it computes a day
   *  after this one */
  workingTo: number;
}

/** A year of the archive of the dead (src/sim/people/archive.ts): the persons who went to it on the first day of a
 *  year. The persons themselves are not in the state: the world server keeps them on its disk (server/world.ts). */
export interface ArchiveYear {
  /** the day of the world they went to the archive on (the first of January) */
  day: number;
  /** how many went, and the smallest and the greatest uid among them */
  persons: number; first: number; last: number;
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
  /** the uid the next person who comes into the world gets (`PERSON_SCHEMA.uid`) */
  nextUid: number;
  /** the years of the archive of the dead, the earliest first (src/sim/people/archive.ts) */
  archive: ArchiveYear[];
  /** the streets and the markets of the towns (src/sim/systems/lots.ts) */
  street: Table<StreetSchema>;
  /** the furlongs of the hamlets' fields (src/sim/systems/fields.ts) */
  field: Table<FieldSchema>;
  /** the landmarks of the towns and those that stand alone (src/sim/systems/landmarks.ts) */
  landmark: Table<LandmarkSchema>;
  /** the walls and gates of the towns (src/sim/systems/walls.ts) */
  wall: Table<WallSchema>;
  economy: {
    /** the cities as economies that trade; null in a world that does not start in the year of their calibration */
    cities: CityEconomies | null;
  };
}
