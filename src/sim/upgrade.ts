// Brings the state of a world that was saved by an older build up to this build's STATE_VERSION. The world runs
// without end, so every change to the shape of the state needs its step here.
import type { WorldState } from './state';
import { STATE_VERSION, PERSON_SCHEMA } from './state';
import { type Column, makeColumns } from './ecs';
import type { World } from './world';
import { foundEconomy } from './systems/economy';

/** The fields of a WorldState in the order createWorldState writes them. */
const STATE_FIELDS = ['v', 'seed', 'startYear', 'day', 'rng', 'place', 'realm', 'realmText', 'ruler', 'economy', 'person', 'family', 'firm'] as const;

/**
 * The steps before 11 are gone (2026-11-16): the only world, europa-1291, is at 11 or later, and the worlds before it are
 * deleted. A state older than 11 is refused; to read one, take the build of its time.
 */
export const OLDEST_STATE_VERSION = 11;

export function upgradeState(s: WorldState, w: World): WorldState {
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
  if (s.v !== STATE_VERSION) throw new Error(`state version ${s.v} cannot be upgraded to ${STATE_VERSION}`);
  // the fields in the order of a new world (src/sim/setup.ts), so an upgraded world encodes byte for byte as one
  const o = s as unknown as Record<string, unknown>;
  for (const k of STATE_FIELDS) if (k in o) { const v = o[k]; delete o[k]; o[k] = v; }
  return s;
}
