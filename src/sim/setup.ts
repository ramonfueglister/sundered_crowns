// Builds the first state of a world from the baked map and the researched historical setup (public/data/setup_*.json):
// who owns which place, the realms with their capitals, colours, cultures and faiths, and how many people live where.
import type { World } from './world';
import type { WorldState, RealmText } from './state';
import { STATE_VERSION, REALM_SCHEMA, RANKS, PERSON_SCHEMA, FAMILY_SCHEMA, FIRM_SCHEMA, LOT_SCHEMA, HAMLET_SCHEMA } from './state';
import { createTable, spawn } from './ecs';
import { seedRng } from './rng';
import { cultureIndex, faithIndex, foundPersonCultures } from './systems/cultures';
import type { I18n } from './i18n';
import { cultivate } from './systems/cultivation';
import { bringInHarvest } from './systems/harvest';
import { foundEconomy } from './systems/economy';
import { foundPeople } from './systems/people';
import { countPeople, settleHamlets } from './systems/hamlets';
import { foundRulers } from './systems/rulers';
import { foundBorders } from './systems/borders';
import { foundLots } from './systems/lots';
import { foundDeaths } from './systems/deaths';
import { foundBirths } from './systems/families';
import { foundMoves } from './systems/moves';
import { toHeads } from './scale';

export interface SetupRealm {
  id: string; name: I18n; short?: I18n; adjective?: I18n; rank?: string; culture?: string; faith?: string; color?: string; capital_loc?: number;
}
export interface SetupState {
  year: number;
  states: SetupRealm[];
  /** per place: index into states, −1 for none */
  owner: number[]; culture: (string | null)[]; faith: (string | null)[]; pop: (number | null)[];
}

export { cultureIndex, faithIndex } from './systems/cultures';

/** '#rrggbb' → 0xrrggbb (grey when malformed) */
export function parseColor(h: string | undefined): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
  return m ? parseInt(m[1], 16) : 0x808080;
}

export function createWorldState(w: World, setup: SetupState, seed: number): WorldState {
  const L = w.L;
  const realm = createTable(REALM_SCHEMA, setup.states.length);
  const place = {
    owner: new Int16Array(L).fill(-1), pop: new Float32Array(L),
    harvest: new Float64Array(L), arable: new Float64Array(L), // in the order the columns were added (src/sim/upgrade.ts)
  };
  const s: WorldState = {
    v: STATE_VERSION, seed, startYear: setup.year, day: 0, rng: seedRng(seed),
    place, realm, realmText: [], ruler: [],
    economy: { cities: null }, person: createTable(PERSON_SCHEMA), family: createTable(FAMILY_SCHEMA), firm: createTable(FIRM_SCHEMA), named: [], lot: createTable(LOT_SCHEMA), hamlets: createTable(HAMLET_SCHEMA), // in the order
    // the fields were added (src/sim/upgrade.ts), so an upgraded world encodes as a new one
  };
  addRealms(s, setup, 0, L);
  setPlaces(s, setup, 0, L);
  // a capital the realm does not hold is no capital
  for (let r = 0; r < realm.size; r++) { const c = realm.cols.capital[r]; if (c >= 0 && place.owner[c] !== r) realm.cols.capital[r] = -1; }
  foundPeople(s);
  foundPersonCultures(s, setup); // every person's culture and faith, the counted minorities among them, before the
  // realms the borders bring in take theirs from their capitals
  foundBorders(s, w); // the borders of the day the world starts on (src/sim/systems/borders.ts), before the rulers' seats
  foundRulers(s, w); // before the economy, which leaves them out (src/sim/systems/work.ts) but keeps their purse
  foundDeaths(s); // the day of death of every person of the towns (src/sim/systems/deaths.ts)
  foundBirths(s); // the day of the next birth of every wife (src/sim/systems/families.ts)
  foundMoves(s); // where every person comes from, and the day of the next move (src/sim/systems/moves.ts)
  foundEconomy(s, w);
  settleHamlets(s); // the families who live from agriculture, by the firms of the economy
  countPeople(s); // the people of a place are its persons (the setup's numbers are only the start of the persons)
  cultivate(s, w); bringInHarvest(s, w); // the arable and the harvest of the year before the start
  foundLots(s, w.ground, w.dry); // the parcels of the families who live in the towns (after the hamlets: their families have none)
  return s;
}

/** Adds the realms of the setup from number `from` on, with their capitals among the `L` places. */
export function addRealms(s: WorldState, setup: SetupState, from: number, L: number): void {
  const realm = s.realm;
  for (const st of setup.states.slice(from)) {
    const id = spawn(realm), c = realm.cols;
    const cap = (st.capital_loc ?? 0) - 1;
    c.capital[id] = cap >= 0 && cap < L ? cap : -1;
    c.holder[id] = -1;
    c.color[id] = parseColor(st.color);
    c.culture[id] = cultureIndex(st.culture);
    c.faith[id] = faithIndex(st.faith);
    c.rank[id] = Math.max(0, RANKS.indexOf((st.rank ?? 'duchy') as any));
    const name = st.name, short = st.short ?? name;
    s.realmText.push({ key: st.id, name, short, adjective: st.adjective ?? short });
    s.ruler.push('');
  }
}

/** Sets the places `from` … `to` − 1 as the setup has them: holder and people (a place's culture and faith are those of
 *  its persons, src/sim/systems/cultures.ts). */
export function setPlaces(s: WorldState, setup: SetupState, from: number, to: number): void {
  const place = s.place, n = s.realm.size;
  for (let i = from; i < to; i++) {
    const o = setup.owner[i];
    place.owner[i] = Number.isInteger(o) && o >= 0 && o < n ? o : -1;
    place.pop[i] = toHeads(Math.max(0, setup.pop[i] ?? 0)); // the setup counts the real people of the time, the world a hundredth of them
  }
}
