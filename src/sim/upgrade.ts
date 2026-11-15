// Brings the state of a world that was saved by an older build up to this build's STATE_VERSION. The world runs
// without end, so every change to the shape of the state needs its step here.
import type { WorldState } from './state';
import { STATE_VERSION } from './state';
import type { World } from './world';
import { cultivate } from './systems/cultivation';
import { bringInHarvest } from './systems/harvest';
import { foundEconomy, computeYear } from './systems/economy';
import { dayToDate } from './calendar';
import { fitPlacesToCities, foundPeople, giveGenes } from './systems/people';
import { NG } from './people/genes';

/** The fields of a WorldState in the order createWorldState writes them. */
const STATE_FIELDS = ['v', 'seed', 'startYear', 'day', 'rng', 'place', 'realm', 'realmText', 'ruler', 'economy', 'person', 'family'] as const;

export function upgradeState(s: WorldState, w: World): WorldState {
  if (s.v === 1) { // 1 → 2: the harvest of each place (filled by the next step)
    s.place.harvest = new Float64Array(w.L);
    s.v = 2;
  }
  if (s.v === 2) { // 2 → 3: the arable of each place; the harvest counts with it from now on
    s.place.arable = new Float64Array(w.L);
    cultivate(s, w); bringInHarvest(s, w);
    s.v = 3;
  }
  if (s.v === 3) { // 3 → 4: England's economy, with the years the world has already seen (it depends on nothing else
    // in the state, so the result is the economy of a world that had it from its first day)
    foundEconomy(s, w);
    const now = dayToDate(s.day, s.startYear).y;
    for (let y = s.startYear + 1; y <= now; y++) computeYear(s, w, y);
    s.v = 4;
  }
  if (s.v === 4) { // 4 → 5: the persons of the 30 largest cities, as founded on the first day (nobody has been born or
    // died since: the people do not change yet). Places smaller than their cities grow to them; the arable and the
    // harvest follow on the next 1 January, as they do for any change of people.
    if (s.startYear === 1356) fitPlacesToCities(s);
    foundPeople(s);
    s.v = 5;
  }
  if (s.v === 5) { // 5 → 6: the genes of the persons, as the founding of a new world gives them (nobody has changed)
    (s.person.cols as { genes: Uint8Array }).genes = new Uint8Array(s.person.alive.length * 2 * NG);
    giveGenes(s);
    s.v = 6;
  }
  if (s.v !== STATE_VERSION) throw new Error(`state version ${s.v} cannot be upgraded to ${STATE_VERSION}`);
  // the fields in the order of a new world (src/sim/setup.ts), so an upgraded world encodes byte for byte as one
  const o = s as unknown as Record<string, unknown>;
  for (const k of STATE_FIELDS) if (k in o) { const v = o[k]; delete o[k]; o[k] = v; }
  return s;
}
