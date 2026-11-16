// The rest of the globe (tools/geo/merge_beyond.py): the places beyond the game map follow its 15,220 places, their
// realms follow the realms of the game map, and a running world of the game map alone gets them by the upgrade.
import { describe, it, expect } from 'vitest';
import { newWorldState, loadSetup } from '../tools/sim/load';
import { encodeState, decodeState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { STATE_VERSION } from '../src/sim/state';
import { ALL_CULTURES, FAITHS } from '../src/sim/content/peoples';

const GAME_MAP = 15220;
const { s, w } = newWorldState();
const setup = loadSetup(1356);
const R0 = setup.states.findIndex((st) => st.id === 'yuan');
const realmOf = (key: string) => s.realmText.findIndex((t) => t.key === key);

describe('the realms of the rest of the globe', () => {
  it('follow those of the game map, which keep their numbers', () => {
    expect(w.L).toBeGreaterThan(GAME_MAP);
    expect(R0).toBeGreaterThan(0);
    expect(setup.states[0].id).toBe(s.realmText[0].key);
  });
  it('hold their capitals', () => {
    for (const key of ['yuan', 'delhi', 'ashikaga', 'goryeo', 'majapahit', 'vijayanagara']) {
      const r = realmOf(key), cap = s.realm.cols.capital[r];
      expect(cap, key).toBeGreaterThanOrEqual(GAME_MAP);
      expect(s.place.owner[cap], key).toBe(r);
    }
  });
  it('have the cultures and faiths of their lands', () => {
    const han = ALL_CULTURES.indexOf('han'), maha = FAITHS.findIndex((f) => f.id === 'mahayana');
    const yuan = realmOf('yuan');
    let held = 0, hanHeld = 0, mahaHeld = 0;
    for (let i = GAME_MAP; i < w.L; i++) if (s.place.owner[i] === yuan) { held++; if (s.place.culture[i] === han) hanHeld++; if (s.place.faith[i] === maha) mahaHeld++; }
    expect(held).toBeGreaterThan(500);
    expect(hanHeld / held).toBeGreaterThan(0.4);
    expect(mahaHeld / held).toBeGreaterThan(0.3);
  });
  it('leave land without a realm at -1 in the setup, never null (the map reads null as realm 0)', () => {
    expect(setup.owner.every((o) => Number.isInteger(o) && o >= -1)).toBe(true);
  });
  it('do not change the cultures and faiths of the game map', () => {
    expect(ALL_CULTURES.indexOf('unknown')).toBeLessThan(ALL_CULTURES.indexOf('han'));
    expect(FAITHS.findIndex((f) => f.id === 'anglican_type')).toBeLessThan(FAITHS.findIndex((f) => f.id === 'mahayana'));
  });
});

describe('a running world of the game map alone', () => {
  it('gets the places and realms of the rest of the globe by the upgrade, as the setup has them', () => {
    const old = decodeState(encodeState(s)) as any;
    for (const k of Object.keys(old.place)) old.place[k] = old.place[k].slice(0, GAME_MAP);
    // the places of the game map no realm held before
    for (let i = 0; i < GAME_MAP; i++) if (old.place.owner[i] >= R0) old.place.owner[i] = -1;
    old.realm.size = R0; old.realm.alive.fill(0, R0); old.realmText = old.realmText.slice(0, R0); old.ruler = old.ruler.slice(0, R0);
    old.v = 6;
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(1356));
    expect(up.v).toBe(STATE_VERSION);
    expect(up.realm.size).toBe(s.realm.size);
    expect(up.realmText.map((t) => t.key)).toEqual(s.realmText.map((t) => t.key));
    expect(up.ruler.length).toBe(s.ruler.length);
    for (const k of ['owner', 'culture', 'faith', 'pop', 'arable', 'harvest'] as const) expect(Array.from(up.place[k]), k).toEqual(Array.from(s.place[k]));
    expect(Array.from(up.realm.cols.capital.slice(0, s.realm.size))).toEqual(Array.from(s.realm.cols.capital.slice(0, s.realm.size)));
  });
  it('takes the colours of the map of 1356 by the upgrade', () => {
    const old = decodeState(encodeState(s)) as any;
    old.realm.cols.color.fill(0x123456); old.v = 6;
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(1356));
    expect(Array.from(up.realm.cols.color.slice(0, s.realm.size))).toEqual(Array.from(s.realm.cols.color.slice(0, s.realm.size)));
  });
  it('cannot be upgraded without the setup', () => {
    const old = decodeState(encodeState(s)) as any;
    for (const k of Object.keys(old.place)) old.place[k] = old.place[k].slice(0, GAME_MAP);
    old.v = 6;
    expect(() => upgradeState(decodeState(encodeState(old)), w)).toThrow(/setup/);
  });
});
