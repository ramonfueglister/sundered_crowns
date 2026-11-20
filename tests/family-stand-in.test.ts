// Economy feature 24 (src/sim/systems/workers.ts `absences`): on a day on which a worker is away, an adult of his
// family who does not work and is not away himself stands in for him, before a worker without work does. The engine's
// side has its own tests in economy/tests/contracts.rs.
import { beforeAll, describe, expect, it } from 'vitest';
import { advanceDay } from '../src/sim/engine';
import { createWorldState } from '../src/sim/setup';
import { decodeState, encodeState } from '../src/sim/snapshot';
import { ALIVE, STATE_VERSION, type WorldState } from '../src/sim/state';
import { computeTo } from '../src/sim/systems/economy';
import { absences } from '../src/sim/systems/workers';
import { ROLE, WORKING_AGE } from '../src/sim/systems/work';
import { ageOn } from '../src/sim/systems/people';
import { presentPersons } from '../src/sim/people/living';
import { CHILDBED_DAYS, awayDays, sickness } from '../src/sim/people/absence';
import { upgradeState } from '../src/sim/upgrade';
import type { World } from '../src/sim/world';
import { loadSetup, loadWorld } from '../tools/sim/load';

describe('the family stands in (economy feature 24)', () => {
  let w: World, s: WorldState;
  beforeAll(() => {
    w = loadWorld();
    s = createWorldState(w, loadSetup(1291), 1291);
  }, 120_000);

  it('keeps every day away, and the family stands in only with as many adults at home as workers away', () => {
    const e = s.economy.cities!,
      from = e.day + 1,
      to = e.day + 30,
      list = absences(s, e, to);
    const P = s.person.cols,
      F = s.family.cols,
      seed = s.seed >>> 0;
    const byAgent = Array.from(e.places, () => new Map<number, number>());
    const home = new Map<number, number[]>(); // the adults of a family who do not work
    for (const id of presentPersons(s)) {
      if (P.died[id] !== ALIVE) continue;
      const k = e.places.indexOf(F.place[P.family[id]]);
      if (P.role[id] === ROLE.worker && k >= 0) byAgent[k].set(P.agent[id], id);
      if ((P.role[id] === ROLE.none || P.role[id] === ROLE.idle) && ageOn(P.born[id], to) >= WORKING_AGE)
        home.set(P.family[id], [...(home.get(P.family[id]) ?? []), id]);
    }
    // per worker the days away as the absences give them, against his days away without the family
    const days = new Map<number, number>(),
      covered = new Map<string, number>(); // family and day → workers for whom the family stands in
    let all = 0,
      family = 0;
    list.forEach((c, k) => {
      expect(c.family.length).toBe(c.worker.length);
      for (let r = 0; r < c.worker.length; r++) {
        const id = byAgent[k].get(c.worker[r])!,
          n = c.last[r] - c.first[r] + 1;
        days.set(id, (days.get(id) ?? 0) + n);
        all += n;
        if (!c.family[r]) continue;
        family += n;
        for (let d = c.first[r]; d <= c.last[r]; d++) {
          const key = `${P.family[id]} ${d}`;
          covered.set(key, (covered.get(key) ?? 0) + 1);
        }
      }
    });
    for (const [id, n] of days) {
      const own = awayDays(sickness(seed, P.uid[id], P.born[id], to + 1), [], from, to);
      let m = 0;
      for (let r = 0; r < own.length; r += 2) m += own[r + 1] - own[r] + 1;
      // a mother's childbed adds days to those of her sickness
      if (P.sex[id] === 0) expect(n).toBeGreaterThanOrEqual(m);
      else expect(n).toBe(m);
      expect(n).toBeLessThanOrEqual(m + CHILDBED_DAYS);
    }
    for (const [key, n] of covered) expect(n).toBeLessThanOrEqual(home.get(Number(key.split(' ')[0]))?.length ?? 0);
    // in the world of 1291 the family stands in on many of the days away, but not on all
    expect(family).toBeGreaterThan(0.2 * all);
    expect(family).toBeLessThan(all);
  });

  it('fills places in the cities on its days, and the workers without work stand in for fewer', () => {
    const a = decodeState(encodeState(s));
    let away = 0,
      family = 0,
      stood = 0;
    for (let d = 0; d < 10; d++) {
      advanceDay(a, w);
      const n = w.economyEngine.standIns();
      for (let k = 0; k < n.length; k += 3) {
        away += n[k];
        family += n[k + 1];
        stood += n[k + 2];
      }
    }
    expect(a.economy.cities!.halted).toBe('');
    expect(family).toBeGreaterThan(0);
    expect(family + stood).toBeLessThanOrEqual(away);
  }, 300_000);

  it('comes to a world of state 37 with the next day it computes', () => {
    const old = decodeState(encodeState(s));
    old.v = 37;
    old.economy.cities!.workingTo = 400;
    const up = upgradeState(old, w);
    expect(up.v).toBe(STATE_VERSION);
    expect(up.economy.cities!.workingTo).toBe(-1);
    computeTo(up, w, 1);
    expect(up.economy.cities!.halted).toBe('');
    expect(up.economy.cities!.workingTo).toBeGreaterThan(0);
  }, 120_000);
});
