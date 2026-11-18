// Brings the state of a world that was saved by an older build up to this build's STATE_VERSION. The world runs
// without end, so every change to the shape of the state needs its step here.
import type { WorldState } from './state';
import { STATE_VERSION, PERSON_SCHEMA, FAMILY_SCHEMA, REALM_SCHEMA, ALIVE } from './state';
import { foundLots } from './systems/lots';
import { foundRulers, rulerCultures } from './systems/rulers';
import { foundBorders } from './systems/borders';
import { type Column, makeColumns } from './ecs';
import type { World } from './world';
import { foundEconomy } from './systems/economy';
import { writeHouseholds } from './systems/household';
import { fitPlacesToCities, foundPeople } from './systems/people';
import { countPeople, settleHamlets } from './systems/hamlets';
import { cultivate } from './systems/cultivation';
import { bringInHarvest } from './systems/harvest';
import { foundPersonCultures } from './systems/cultures';
import type { SetupState } from './setup';

/** The fields of a WorldState in the order createWorldState writes them. */
const STATE_FIELDS = ['v', 'seed', 'startYear', 'day', 'rng', 'place', 'realm', 'realmText', 'ruler', 'economy', 'person', 'family', 'firm', 'named', 'lot', 'hamlets'] as const;

/**
 * The steps before 11 are gone (2026-11-16): the only world, europa-1291, is at 11 or later, and the worlds before it are
 * deleted. A state older than 11 is refused; to read one, take the build of its time.
 */
export const OLDEST_STATE_VERSION = 11;

/** `setup`: the setup of the world's start year (public/data/setup_<year>.json), read only by the steps that need it. */
export function upgradeState(s: WorldState, w: World, setup?: () => SetupState): WorldState {
  if (s.v < OLDEST_STATE_VERSION) throw new Error(`state version ${s.v} is older than ${OLDEST_STATE_VERSION}, the oldest this build upgrades`);
  if (s.v === 11) { // 11 → 12: the persons of the cities' economies are the persons of the cities, and every firm
    // is an entity (economy feature 10). The persons get their components of the economy, and the economies are
    // founded anew on the day the world has reached, each city from its starting position and with as many active
    // persons as it has persons who work: the economies of a world that had them start again (their days and
    // yearly figures are gone; the days before are not computed, so the first period is the next day of the world),
    // and they are those of the cities of the start year, where the persons live. Nobody has been born or died, so
    // the persons are who they were.
    const cols = s.person.cols as Record<string, Column>, fresh = makeColumns(PERSON_SCHEMA, s.person.alive.length) as Record<string, Column>;
    // in the order of the schema, as a new world has them (the snapshot writes the columns in their order)
    for (const k of Object.keys(fresh)) if (k in cols) fresh[k] = cols[k];
    (s.person as { cols: unknown }).cols = fresh;
    foundEconomy(s, w);
    s.v = 12;
  }
  if (s.v === 12) { // 12 → 13: a world of 1291 has the borders of its setup again: seven places of Murcia that were
    // Aragon's are Castile's (Treaty of Almizra 1244). Nothing has changed a holder since the first day, so the places
    // take the holders of the setup as a new world does; nothing else changes (their people, cultures and faiths stay
    // as the world was founded with them, and the capitals: none of the seven is one).
    if (s.startYear === 1291) {
      if (!setup) throw new Error('the upgrade of a world of 1291 needs its setup');
      const st = setup(), owner = s.place.owner, n = s.realm.size;
      for (let i = 0; i < owner.length; i++) { const o = st.owner[i]; owner[i] = Number.isInteger(o) && o >= 0 && o < n ? o : -1; }
    }
    s.v = 13;
  }
  if (s.v === 13) { // 13 → 14: the family is the purse, and a woman without a husband works (economy feature 11).
    // The families get their purse and the persons their consumption. Who works changes (a woman without a husband
    // always works, the other women of a city at a lower rate, src/sim/systems/work.ts), so the economies are
    // founded anew on the day the world has reached, as in the step to 12: their days and yearly figures are gone,
    // and the first period is the next day of the world. Nobody has been born or died.
    for (const [table, schema] of [[s.person, PERSON_SCHEMA], [s.family, FAMILY_SCHEMA]] as const) {
      const cols = table.cols as Record<string, Column>, fresh = makeColumns(schema, table.alive.length) as Record<string, Column>;
      for (const k of Object.keys(fresh)) if (k in cols) fresh[k] = cols[k]; // in the order of the schema
      (table as { cols: unknown }).cols = fresh;
    }
    foundEconomy(s, w);
    s.v = 14;
  }
  if (s.v === 14) { // 14 → 15: a world of 1291 has persons in every town of the world graphic inside the world frame,
    // not only in the 30 largest (Ramon, 16 November 2026: only what the simulation computes is in the world, and every
    // person lives where the map shows a town). The persons are founded anew as a new world founds them: the towns of
    // Chandler come first in the list (src/sim/content/cities_1291.json), so the persons and families of the 30 cities
    // are founded first and are the same as before, with the same numbers; the others follow. Nobody has been born,
    // died or married since the first day, so nothing a person did is lost. The economies are founded anew on the day
    // the world has reached, one for each place with a town, as in the steps to 12 and 14.
    if (s.startYear === 1291) {
      fitPlacesToCities(s); // no place is smaller than its towns (the setup already holds them: build.py lifts them)
      foundPeople(s);
      delete (s as Partial<WorldState>).named; // the persons of history went with the old table: step 16 founds them again
      foundEconomy(s, w);
    }
    s.v = 15;
  }
  if (s.v === 15) { // 15 → 16: the rulers (src/sim/systems/rulers.ts). Every realm gets a holder and every person the
    // day of death (nobody has died: all live); the rulers of the chronicle come into the world as they would have
    // since the first day, so the holders are those of the day the world has reached. The economies stay as they
    // are: rulers have no part in them.
    const hadDied = 'died' in s.person.cols, hadHolder = 'holder' in s.realm.cols;
    // (the families too: founding a ruler writes the family's column of the parcel, which the step to 20 fills)
    for (const [table, schema] of [[s.realm, REALM_SCHEMA], [s.person, PERSON_SCHEMA], [s.family, FAMILY_SCHEMA]] as const) {
      const cols = table.cols as Record<string, Column>, fresh = makeColumns(schema, table.alive.length) as Record<string, Column>;
      for (const k of Object.keys(fresh)) if (k in cols) fresh[k] = cols[k]; // in the order of the schema
      (table as { cols: unknown }).cols = fresh;
    }
    if (!hadDied) s.person.cols.died.fill(ALIVE);
    if (!hadHolder) s.realm.cols.holder.fill(-1);
    if (!s.named) { s.named = []; foundRulers(s, w); writeHouseholds(s, w); } // their families count in the purses, as in a new world
    s.v = 16;
  }
  if (s.v === 16) { // 16 → 17: the families who live from agriculture live in hamlets outside the walls of their town,
    // and a place has the people who live there, its persons (src/sim/systems/hamlets.ts). The families are settled by
    // the firms their members work for on the day the world has reached; the people of every place are counted, and
    // the arable and the harvest follow them now, as a new world sets them when it is founded (not only on the next
    // first day of a year: the numbers of the places without persons are gone).
    const cols = s.family.cols as Record<string, Column>, fresh = makeColumns(FAMILY_SCHEMA, s.family.alive.length) as Record<string, Column>;
    for (const k of Object.keys(fresh)) if (k in cols) fresh[k] = cols[k]; // in the order of the schema
    (s.family as { cols: unknown }).cols = fresh;
    settleHamlets(s);
    countPeople(s);
    cultivate(s, w); bringInHarvest(s, w);
    s.v = 17;
  }
  if (s.v === 17) { // 17 → 18: the borders (src/sim/systems/borders.ts). The changes of the chronicle of borders up to
    // the day the world has reached, as a world that had them from the first day; the realms that came in on the way
    // get their rows in the same order.
    foundBorders(s, w);
    s.v = 18;
  }
  if (s.v === 18) { // 18 → 19: every person has a culture and a faith, and a place has none of its own (Ramon, 16
    // November 2026: only what the simulation computes is in the world; a town has the culture of its persons, with
    // its minorities). The persons get them as a new world gives them (src/sim/systems/cultures.ts): the culture and
    // faith of the setup for their place, a ruler those of the realm the ruler entered in, and the counted communities of the start year.
    // Nobody has been born, married or moved since the first day, so the persons get what they were founded with. The
    // places' own columns go.
    if (!setup) throw new Error('the upgrade to 19 needs the setup of the start year');
    const cols = s.person.cols as Record<string, Column>, fresh = makeColumns(PERSON_SCHEMA, s.person.alive.length) as Record<string, Column>;
    for (const k of Object.keys(fresh)) if (k in cols) fresh[k] = cols[k]; // in the order of the schema
    (s.person as { cols: unknown }).cols = fresh;
    foundPersonCultures(s, setup()); rulerCultures(s, w);
    const place = s.place as unknown as Record<string, unknown>;
    delete place.culture; delete place.faith;
    s.v = 19;
  }
  if (s.v === 19) { // 19 → 20: the land register (src/sim/systems/lots.ts). The families get the column of their
    // parcel; the parcels of the towns and the hamlets with their farmsteads are laid out as a new world lays them
    // out, for the families as they live on the day the world has reached: nobody has been born, has died or has
    // moved since the first day. The rulers have no ground. Nothing else changes.
    const cols = s.family.cols as Record<string, Column>, fresh = makeColumns(FAMILY_SCHEMA, s.family.alive.length) as Record<string, Column>;
    for (const k of Object.keys(fresh)) if (k in cols) fresh[k] = cols[k]; // in the order of the schema
    (s.family as { cols: unknown }).cols = fresh;
    foundLots(s, w.ground, w.dry);
    s.v = 20;
  }
  if (s.v === 20) { // 20 → 21: households spend out of their savings, and a family has a need of food (economy
    // feature 15). The families get the two columns of the need. The rule of the households changes what every city
    // computes, so the economies are founded anew on the day the world has reached, as in the steps to 12 and 14:
    // their days and yearly figures are gone, and the first period is the next day of the world. Nobody has been
    // born or has died.
    const cols = s.family.cols as Record<string, Column>, fresh = makeColumns(FAMILY_SCHEMA, s.family.alive.length) as Record<string, Column>;
    for (const k of Object.keys(fresh)) if (k in cols) fresh[k] = cols[k]; // in the order of the schema
    (s.family as { cols: unknown }).cols = fresh;
    foundEconomy(s, w);
    s.v = 21;
  }
  if (s.v === 21) { // 21 → 22: the crown of a city buys with what it took in (economy feature 16). The rule changes
    // what every city computes, so the economies are founded anew on the day the world has reached, as in the step
    // before: their days and yearly figures are gone, and the first period is the next day of the world. Nobody has
    // been born or has died.
    foundEconomy(s, w);
    s.v = 22;
  }
  if (s.v !== STATE_VERSION) throw new Error(`state version ${s.v} cannot be upgraded to ${STATE_VERSION}`);
  // the fields in the order of a new world (src/sim/setup.ts), so an upgraded world encodes byte for byte as one
  const o = s as unknown as Record<string, unknown>;
  for (const k of STATE_FIELDS) if (k in o) { const v = o[k]; delete o[k]; o[k] = v; }
  return s;
}
