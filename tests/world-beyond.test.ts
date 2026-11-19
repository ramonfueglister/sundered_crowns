// The rest of the globe (tools/geo/merge_beyond.py): the places beyond the game map follow its 15,220 places, their
// realms follow the realms of the game map, and a running world of the game map alone gets them by the upgrade.
import { describe, it, expect } from 'vitest';
import { newWorldState, loadSetup } from '../tools/sim/load';
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
      const r = realmOf(key),
        cap = s.realm.cols.capital[r];
      expect(cap, key).toBeGreaterThanOrEqual(GAME_MAP);
      expect(s.place.owner[cap], key).toBe(r);
    }
  });
  it('have the cultures and faiths of their lands in the setup', () => {
    const han = 'han',
      maha = 'mahayana';
    const yuan = realmOf('yuan');
    let held = 0,
      hanHeld = 0,
      mahaHeld = 0;
    for (let i = GAME_MAP; i < w.L; i++)
      if (s.place.owner[i] === yuan) {
        held++;
        if (setup.culture[i] === han) hanHeld++;
        if (setup.faith[i] === maha) mahaHeld++;
      }
    expect(held).toBeGreaterThan(500);
    expect(hanHeld / held).toBeGreaterThan(0.4);
    expect(mahaHeld / held).toBeGreaterThan(0.3);
  });
  it('leave land without a realm at -1 in the setup, never null (the map reads null as realm 0)', () => {
    expect(setup.owner.every((o) => Number.isInteger(o) && o >= -1)).toBe(true);
  });
  it('do not change the cultures and faiths of the game map', () => {
    expect(ALL_CULTURES.indexOf('unknown')).toBeLessThan(ALL_CULTURES.indexOf('han'));
    expect(FAITHS.findIndex((f) => f.id === 'anglican_type')).toBeLessThan(
      FAITHS.findIndex((f) => f.id === 'mahayana'),
    );
  });
});
