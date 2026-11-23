// Economy feature 11 (docs/ECONOMY_DESIGN.md): the purses of the families in the state, and the upgrade of the worlds
// saved before them (src/sim/upgrade.ts).
import { describe, it, expect } from 'vitest';
import { foundDeaths } from '../src/sim/systems/deaths';
import { newWorldState, loadSetup } from '../tools/sim/load';
import { advanceDay } from '../src/sim/engine';
import { FIGURE, FIGURES } from '../src/sim/economy/engine';
import { foundEconomy } from '../src/sim/systems/economy';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { STATE_VERSION, FAMILY_SCHEMA, PERSON_SCHEMA } from '../src/sim/state';
import { foundMoves } from '../src/sim/systems/moves';
import { adult, members, withoutHusband, works } from './setup/households';

const { s, w } = newWorldState();
for (let d = 0; d < 20; d++) advanceDay(s, w); // the families have spent and saved for 20 days

describe('the state', () => {
  it('holds the purses: a saved world goes on as the running one', () => {
    const a = decodeState(encodeState(s)),
      b = decodeState(encodeState(s));
    expect(a.v).toBe(STATE_VERSION);
    expect(hashState(a)).toBe(hashState(s));
    expect(Object.keys(a.family.cols)).toEqual(Object.keys(FAMILY_SCHEMA));
    for (let d = 0; d < 3; d++) {
      advanceDay(a, w);
      advanceDay(b, w);
    }
    expect(hashState(decodeState(encodeState(a)))).toBe(hashState(b));
  });
  it('of a world that starts in the year of its table goes on where it is through the steps to 34 and 35 (economy features 21 and 22)', () => {
    // biome-ignore lint/suspicious/noExplicitAny: a state of an older version, which no type of today describes
    const old = decodeState(encodeState(s)) as any;
    old.v = 33;
    const up = upgradeState(old, w);
    expect(up.v).toBe(STATE_VERSION);
    // the step to 35 only has the engine given the working days and the absences again before the next day
    const same = decodeState(encodeState(s));
    same.economy.cities!.workingTo = -1;
    expect(up.economy.cities!.workingTo).toBe(-1);
    expect(hashState(up)).toBe(hashState(same));
  });
  it('of a world from before feature 11 gets them by the upgrade: the economies are founded anew with the women without a husband at work', () => {
    // version 13: no purse, no consumption (who works there was drawn by the rule before; the upgrade draws again)
    // biome-ignore lint/suspicious/noExplicitAny: a state of an older version, which no type of today describes
    const old = decodeState(encodeState(s)) as any;
    for (const k of ['persons', 'working', 'baskets', 'income', 'spent', 'savings']) delete old.family.cols[k];
    delete old.person.cols.consumed;
    old.v = 13;
    old.person.cols.role.fill(0); // whatever the parts were: they are given out again
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(1356));
    expect(up.v).toBe(STATE_VERSION);
    expect(Object.keys(up.person.cols)).toEqual(Object.keys(PERSON_SCHEMA));
    expect(Object.keys(up.family.cols)).toEqual(Object.keys(FAMILY_SCHEMA));
    // step 23 founds the persons anew on the day reached, and everything that hangs on them: as it does for the world that ran
    const founded = decodeState(encodeState(s));
    founded.v = 22;
    upgradeState(founded, w, () => loadSetup(1356));
    expect(hashState(up)).toBe(hashState(founded));
    const c = up.economy.cities!;
    expect(c.day).toBe(s.day);
    expect(c.years.length).toBe(0);
    expect(c.halted).toBe('');
    for (let k = 0; k < c.places.length; k++) expect(c.figures[k * FIGURES + FIGURE.periods]).toBe(0);
    const m = members(up);
    for (let id = 0; id < up.person.size; id++)
      if (adult(up, id) && withoutHusband(up, m, id)) expect(works(up, id)).toBe(true);
    m.forEach((ids, f) => {
      expect(up.family.cols.persons[f]).toBe(ids.length);
      expect(up.family.cols.working[f]).toBe(ids.filter((id) => works(up, id)).length);
    });
    advanceDay(up, w);
    advanceDay(up, w);
    expect(up.economy.cities!.figures[FIGURE.periods]).toBe(2);
    expect(up.economy.cities!.halted).toBe('');
    expect(up.family.cols.income.some((v) => v > 0)).toBe(true);
  }, 150_000);
  it('of a world from before feature 15 gets the need by the upgrade: the economies are founded anew with households that spend out of savings', () => {
    // biome-ignore lint/suspicious/noExplicitAny: a state of an older version, which no type of today describes
    const old = decodeState(encodeState(s)) as any;
    delete old.family.cols.need;
    delete old.family.cols.fed;
    old.v = 20;
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(1356));
    expect(up.v).toBe(STATE_VERSION);
    expect(Object.keys(up.family.cols)).toEqual(Object.keys(FAMILY_SCHEMA));
    // step 23 then founds the persons anew, and the economies with them: as it does for the world that ran
    const founded = decodeState(encodeState(s));
    founded.v = 22;
    upgradeState(founded, w, () => loadSetup(1356));
    expect(hashState(up)).toBe(hashState(founded));
    const c = up.economy.cities!;
    expect(c.day).toBe(s.day);
    expect(c.years.length).toBe(0);
    for (let k = 0; k < c.places.length; k++) expect(c.figures[k * FIGURES + FIGURE.periods]).toBe(0);
    advanceDay(up, w);
    advanceDay(up, w);
    expect(up.economy.cities!.halted).toBe('');
    expect(up.family.cols.fed.some((v) => v === 1)).toBe(true);
  }, 150_000);
  it('of a world from before features 16 and 17 is founded anew by the upgrade, with a crown that buys with what it took in and with distance between the cities', () => {
    // biome-ignore lint/suspicious/noExplicitAny: a state of an older version, which no type of today describes
    const old = decodeState(encodeState(s)) as any;
    old.v = 23;
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(1356));
    expect(up.v).toBe(STATE_VERSION);
    const founded = decodeState(encodeState(s));
    foundEconomy(founded, w);
    foundDeaths(founded);
    foundMoves(founded); // (the steps to 25 and 27 draw the days of the moves and of death on the day reached)
    expect(hashState(up)).toBe(hashState(founded));
    const c = up.economy.cities!;
    expect(c.day).toBe(s.day);
    expect(c.years.length).toBe(0);
    advanceDay(up, w);
    advanceDay(up, w);
    expect(up.economy.cities!.halted).toBe('');
  }, 150_000);
});
