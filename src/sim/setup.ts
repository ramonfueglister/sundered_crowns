// Builds the first state of a world from the baked map and the researched historical setup (public/data/setup_*.json):
// who owns which place, the realms with their capitals, colours, cultures and faiths, and how many people live where.
import type { World } from './world';
import type { WorldState, RealmText } from './state';
import { STATE_VERSION, REALM_SCHEMA, RANKS } from './state';
import { createTable, spawn } from './ecs';
import { seedRng } from './rng';
import { ALL_CULTURES, FAITH_INDEX } from './content/peoples';
import type { I18n } from './i18n';

export interface SetupRealm {
  id: string; name: I18n; short?: I18n; adjective?: I18n; rank?: string; culture?: string; faith?: string; color?: string; capital_loc?: number;
}
export interface SetupState {
  year: number;
  states: SetupRealm[];
  /** per place: index into states, −1 for none */
  owner: number[]; culture: (string | null)[]; faith: (string | null)[]; pop: (number | null)[];
}

export function cultureIndex(c: string | null | undefined): number {
  const i = ALL_CULTURES.indexOf(c || 'unknown');
  return i < 0 ? ALL_CULTURES.indexOf('unknown') : i;
}
export const faithIndex = (f: string | null | undefined): number => FAITH_INDEX[f || 'latin'] ?? 0;

/** '#rrggbb' → 0xrrggbb (grey when malformed) */
export function parseColor(h: string | undefined): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
  return m ? parseInt(m[1], 16) : 0x808080;
}

export function createWorldState(w: World, setup: SetupState, seed: number): WorldState {
  const L = w.L;
  const realm = createTable(REALM_SCHEMA, setup.states.length);
  const realmText: RealmText[] = [];
  for (const st of setup.states) {
    const id = spawn(realm), c = realm.cols;
    const cap = (st.capital_loc ?? 0) - 1;
    c.capital[id] = cap >= 0 && cap < L ? cap : -1;
    c.color[id] = parseColor(st.color);
    c.culture[id] = cultureIndex(st.culture);
    c.faith[id] = faithIndex(st.faith);
    c.rank[id] = Math.max(0, RANKS.indexOf((st.rank ?? 'duchy') as any));
    const name = st.name, short = st.short ?? name;
    realmText.push({ key: st.id, name, short, adjective: st.adjective ?? short });
  }
  const place = {
    owner: new Int16Array(L).fill(-1), culture: new Uint16Array(L), faith: new Uint8Array(L), pop: new Float32Array(L),
  };
  for (let i = 0; i < L; i++) {
    const o = setup.owner[i];
    place.owner[i] = Number.isInteger(o) && o >= 0 && o < realm.size ? o : -1;
    place.culture[i] = cultureIndex(setup.culture[i]);
    place.faith[i] = faithIndex(setup.faith[i]);
    place.pop[i] = Math.max(0, setup.pop[i] ?? 0);
  }
  // a capital the realm does not hold is no capital
  for (let r = 0; r < realm.size; r++) { const c = realm.cols.capital[r]; if (c >= 0 && place.owner[c] !== r) realm.cols.capital[r] = -1; }
  return {
    v: STATE_VERSION, seed, startYear: setup.year, day: 0, rng: seedRng(seed),
    place, realm, realmText, ruler: new Array(realm.size).fill(''),
  };
}
