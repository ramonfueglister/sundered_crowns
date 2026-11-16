// Brings the state of a world that was saved by an older build up to this build's STATE_VERSION. The world runs
// without end, so every change to the shape of the state needs its step here.
import type { WorldState } from './state';
import { STATE_VERSION, PERSON_SCHEMA, FAMILY_SCHEMA } from './state';
import { type Column, makeColumns } from './ecs';
import type { World } from './world';
import { foundEconomy } from './systems/economy';
import { fitPlacesToCities, foundPeople } from './systems/people';
import type { SetupState } from './setup';

/** The fields of a WorldState in the order createWorldState writes them. */
const STATE_FIELDS = ['v', 'seed', 'startYear', 'day', 'rng', 'place', 'realm', 'realmText', 'ruler', 'economy', 'person', 'family', 'firm'] as const;

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
      foundEconomy(s, w);
    }
    s.v = 15;
  }
  if (s.v !== STATE_VERSION) throw new Error(`state version ${s.v} cannot be upgraded to ${STATE_VERSION}`);
  // the fields in the order of a new world (src/sim/setup.ts), so an upgraded world encodes byte for byte as one
  const o = s as unknown as Record<string, unknown>;
  for (const k of STATE_FIELDS) if (k in o) { const v = o[k]; delete o[k]; o[k] = v; }
  return s;
}
