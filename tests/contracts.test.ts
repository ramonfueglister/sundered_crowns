// People feature 10 (src/sim/systems/workers.ts `contracts`): a worker who heads a family works by the day, every
// other worker serves by the year, and the world gives the economy the contracts with the absences (economy feature
// 23). On a day on which workers are away, workers without work stand in for them. The engine's side has its own
// tests in economy/tests/contracts.rs.
import { beforeAll, describe, expect, it } from 'vitest';
import { advanceDay } from '../src/sim/engine';
import { createWorldState } from '../src/sim/setup';
import { decodeState, encodeState } from '../src/sim/snapshot';
import { ALIVE, STATE_VERSION, type WorldState } from '../src/sim/state';
import { computeTo } from '../src/sim/systems/economy';
import { contracts } from '../src/sim/systems/workers';
import { ROLE } from '../src/sim/systems/work';
import { presentPersons } from '../src/sim/people/living';
import { upgradeState } from '../src/sim/upgrade';
import type { World } from '../src/sim/world';
import { loadSetup, loadWorld } from '../tools/sim/load';

describe('service by the year and work by the day (people feature 10, economy feature 23)', () => {
  let w: World, s: WorldState;
  beforeAll(() => {
    w = loadWorld();
    s = createWorldState(w, loadSetup(1291), 1291);
  }, 120_000);

  it('puts every living worker who heads a family to work by the day, by the place the worker holds', () => {
    const e = s.economy.cities!,
      list = contracts(s, e);
    expect(list.length).toBe(e.places.length);
    const P = s.person.cols,
      F = s.family.cols;
    const heads = Array.from(e.places, () => new Set<number>());
    let workers = 0;
    for (const id of presentPersons(s)) {
      if (P.role[id] !== ROLE.worker || P.died[id] !== ALIVE) continue;
      const f = P.family[id],
        k = e.places.indexOf(F.place[f]);
      if (k < 0) continue;
      workers++;
      if (F.man[f] === id || F.woman[f] === id) heads[k].add(P.agent[id]);
    }
    for (let k = 0; k < list.length; k++) expect(new Set(list[k])).toEqual(heads[k]);
    // in the world of 1291 somewhat more than half serve by the year (54 %; the sources have 40 to 46 %)
    const byTheDay = list.reduce((n, c) => n + c.length, 0);
    expect(1 - byTheDay / workers).toBeGreaterThan(0.45);
    expect(1 - byTheDay / workers).toBeLessThan(0.65);
  });

  it('lets workers without work stand in for those who are away, and the cities make more than without contracts', () => {
    const a = decodeState(encodeState(s)),
      b = decodeState(encodeState(s));
    // b: the economy is never given contracts, as before economy feature 23
    const none: World['economyEngine'] = {
      ...w.economyEngine,
      contracts: (state) => (state instanceof Uint8Array ? state : state.bytes()),
    };
    // a copy of the world with that engine: Object.create gives `any`, the cast names what the copy is
    const wb = Object.assign(Object.create(Object.getPrototypeOf(w)), w, { economyEngine: none }) as World;
    let away = 0,
      stood = 0;
    for (let d = 0; d < 20; d++) {
      advanceDay(a, w);
      const n = w.economyEngine.standIns();
      for (let k = 0; k < n.length; k += 3) {
        away += n[k];
        stood += n[k + 1] + n[k + 2];
      }
      advanceDay(b, wb);
    }
    expect(a.economy.cities!.halted).toBe('');
    expect(stood).toBeGreaterThan(0);
    expect(stood).toBeLessThanOrEqual(away);
    const output = (x: WorldState) => x.firm.cols.output.reduce((n, y) => n + y, 0);
    expect(output(a)).toBeGreaterThan(output(b));
  }, 300_000);

  it('come to a world of state 35 with the next day it computes', () => {
    const old = decodeState(encodeState(s));
    old.v = 35;
    old.economy.cities!.workingTo = 400;
    const up = upgradeState(old, w);
    expect(up.v).toBe(STATE_VERSION);
    expect(up.economy.cities!.workingTo).toBe(-1);
    computeTo(up, w, 1);
    expect(up.economy.cities!.halted).toBe('');
    expect(up.economy.cities!.workingTo).toBeGreaterThan(0);
  }, 120_000);
});
