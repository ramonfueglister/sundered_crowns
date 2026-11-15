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
import { type SetupState, addRealms, setPlaces } from './setup';

/** The fields of a WorldState in the order createWorldState writes them. */
const STATE_FIELDS = ['v', 'seed', 'startYear', 'day', 'rng', 'place', 'realm', 'realmText', 'ruler', 'economy', 'person', 'family'] as const;

/**
 * `setup`: the setup of the world's start year (public/data/setup_<year>.json), for the places and realms a newer map
 * adds (only read when the state has fewer places than the map).
 */
export function upgradeState(s: WorldState, w: World, setup?: () => SetupState): WorldState {
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
  if (s.v === 6) { // 6 → 7: the places of the rest of the globe follow those of the game map, and their realms those
    // of the game map (tools/geo/merge_beyond.py). A new place is as the start year sets it up, with the arable and the
    // harvest its people work now; a place of the game map no realm held, which a new realm holds in the setup, goes to it.
    const L0 = s.place.owner.length;
    if (L0 < w.L) {
      if (!setup) throw new Error(`the state has ${L0} places, the map ${w.L}: the upgrade needs the setup`);
      const st = setup(), R0 = s.realm.size;
      addRealms(s, st, R0, w.L);
      const old = s.place, place = {
        owner: new Int16Array(w.L).fill(-1), culture: new Uint16Array(w.L), faith: new Uint8Array(w.L), pop: new Float32Array(w.L),
        harvest: new Float64Array(w.L), arable: new Float64Array(w.L),
      };
      for (const k of Object.keys(place) as (keyof typeof place)[]) place[k].set(old[k] as never);
      s.place = place;
      setPlaces(s, st, L0, w.L);
      for (let i = 0; i < L0; i++) { const o = st.owner[i]; if (place.owner[i] < 0 && Number.isInteger(o) && o >= R0 && o < s.realm.size) place.owner[i] = o; }
      // the arable and the harvest of the new places alone (those of the game map stay as the year left them)
      const keep = [place.arable.slice(0, L0), place.harvest.slice(0, L0)];
      cultivate(s, w); bringInHarvest(s, w);
      place.arable.set(keep[0]); place.harvest.set(keep[1]);
      for (let r = R0; r < s.realm.size; r++) { const c = s.realm.cols.capital[r]; if (c >= 0 && place.owner[c] !== r) s.realm.cols.capital[r] = -1; }
    }
    s.v = 7;
  }
  if (s.v !== STATE_VERSION) throw new Error(`state version ${s.v} cannot be upgraded to ${STATE_VERSION}`);
  // the fields in the order of a new world (src/sim/setup.ts), so an upgraded world encodes byte for byte as one
  const o = s as unknown as Record<string, unknown>;
  for (const k of STATE_FIELDS) if (k in o) { const v = o[k]; delete o[k]; o[k] = v; }
  return s;
}
