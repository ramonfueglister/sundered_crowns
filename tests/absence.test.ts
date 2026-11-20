// People feature 9 (src/sim/people/absence.ts): sickness by the sick club of Morcott (Riley & Alter 1996) and the
// month of childbed (Astbury 2017), and how the world gives the economy the workers who are away (economy feature 22,
// src/sim/systems/workers.ts). The engine's side has its own tests in economy/tests/absences.rs.
import { describe, it, expect, beforeAll } from 'vitest';
import { CHILDBED_DAYS, MORCOTT, SHORTEST, SICK_FROM, ageGroup, awayDays, sickness } from '../src/sim/people/absence';
import { computeTo } from '../src/sim/systems/economy';
import { absences } from '../src/sim/systems/workers';
import { ROLE } from '../src/sim/systems/work';
import { presentPersons } from '../src/sim/people/living';
import { advanceDay } from '../src/sim/engine';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { ALIVE, type WorldState } from '../src/sim/state';
import { createWorldState } from '../src/sim/setup';
import { loadSetup, loadWorld } from '../tools/sim/load';
import type { World } from '../src/sim/world';

const YEAR = 365.25;

describe('sickness (Morcott 1725–1799)', () => {
  // 4000 persons born on day 0, followed to 85: the episodes that begin in each group of age
  const persons = 4000,
    until = 85 * YEAR;
  const all = Array.from({ length: persons }, (_, uid) => sickness(1291, uid, 0, until));
  it('is the same for the same person and another for another seed', () => {
    expect(sickness(1291, 7, 0, until)).toEqual(all[7]);
    expect(sickness(1292, 7, 0, until)).not.toEqual(all[7]);
    // the episodes up to a day are the first of the episodes up to a later day
    const early = sickness(1291, 7, 0, 50 * YEAR);
    expect(all[7].slice(0, early.length)).toEqual(early);
  });
  it('begins at 15, lasts at least three days, and a new episode begins only after the last one has ended', () => {
    for (const e of all) {
      if (e.length) expect(e[0]).toBeGreaterThanOrEqual(Math.floor(SICK_FROM * YEAR));
      for (let k = 0; k < e.length; k += 2) {
        expect(e[k + 1] - e[k] + 1).toBeGreaterThanOrEqual(SHORTEST);
        if (k > 0) expect(e[k]).toBeGreaterThan(e[k - 1]);
      }
    }
  });
  it("has the club's new episodes per year of life and mean lengths in every group of age", () => {
    const groups = MORCOTT.events.length,
      onsets = new Array(groups).fill(0),
      length = new Array(groups).fill(0);
    const lived = new Array(groups).fill(0); // the years of the persons in each group, from 20 on
    for (const e of all) {
      for (let k = 0; k < e.length; k += 2) {
        const age = e[k] / YEAR;
        if (age < 20) continue;
        const g = ageGroup(age);
        onsets[g]++;
        length[g] += e[k + 1] - e[k] + 1;
      }
    }
    for (let g = 0; g < groups; g++) lived[g] = persons * (g === groups - 1 ? 85 - 75 : 5);
    for (let g = 0; g < groups; g++) {
      // a rate of a few thousand events is known to some percent. From 75 on a person is sick two thirds of the time
      // (episodes of 509 days), more than the club's survivors were (54 %), and falls sick anew less often a year
      if (g < groups - 1) {
        expect(onsets[g] / lived[g]).toBeGreaterThan(0.9 * (MORCOTT.events[g] / 5));
        expect(onsets[g] / lived[g]).toBeLessThan(1.1 * (MORCOTT.events[g] / 5));
      }
      expect(length[g] / onsets[g]).toBeGreaterThan(0.9 * MORCOTT.length[g]);
      expect(length[g] / onsets[g]).toBeLessThan(1.1 * MORCOTT.length[g]);
    }
  });
});

describe('the days away', () => {
  it('join sickness and childbed where they meet and keep to the days asked for', () => {
    // sick on days 10 to 14 and 50 to 60, a birth on day 12 (childbed 12 to 41), asked for days 0 to 55
    expect(awayDays([10, 14, 50, 60], [12], 0, 55)).toEqual([10, 41, 50, 55]);
    // a birth before the days whose childbed reaches into them, a sickness after them
    expect(awayDays([100, 110], [-5], 0, 30)).toEqual([0, -5 + CHILDBED_DAYS - 1]);
    expect(awayDays([], [], 0, 30)).toEqual([]);
  });
});

describe('the workers who are away in the world (economy feature 22)', () => {
  let w: World, s: WorldState;
  beforeAll(() => {
    w = loadWorld();
    s = createWorldState(w, loadSetup(1291), 1291);
  }, 120_000);
  it('are the living workers, each on the days of the sickness and the childbed of the person who holds the place', () => {
    const e = s.economy.cities!,
      to = e.day + 30,
      list = absences(s, e, to);
    expect(list.length).toBe(e.places.length);
    const P = s.person.cols,
      workers = Array.from(e.places, () => new Map<number, number>());
    for (const id of presentPersons(s)) {
      if (P.role[id] !== ROLE.worker || P.died[id] !== ALIVE) continue;
      const k = e.places.indexOf(s.family.cols.place[P.family[id]]);
      workers[k].set(P.agent[id], id);
    }
    let away = 0,
      childbed = 0;
    list.forEach((c, k) => {
      for (let r = 0; r < c.worker.length; r++) {
        const id = workers[k].get(c.worker[r])!;
        expect(id).toBeDefined();
        expect(c.first[r]).toBeLessThanOrEqual(c.last[r]);
        expect(c.last[r]).toBeLessThanOrEqual(to - e.day - 1);
        away += c.last[r] - c.first[r] + 1;
        if (P.sex[id] === 0 && P.bears[id] !== ALIVE && P.bears[id] <= to) childbed++;
      }
    });
    // in a month some percent of the days of all workers are days away
    const total = workers.reduce((n, m) => n + m.size, 0) * 30;
    expect(away / total).toBeGreaterThan(0.005);
    expect(away / total).toBeLessThan(0.1);
    expect(childbed).toBeGreaterThan(0);
  });
  it('are given a month at a time: many days at once give what the same days give one by one, and a saved world goes on the same', () => {
    const a = decodeState(encodeState(s)),
      b = decodeState(encodeState(s));
    // across the end of a month: from day 0 to day 40
    computeTo(a, w, 40);
    for (let d = 1; d <= 40; d++) computeTo(b, w, d);
    expect(a.economy.cities!.halted).toBe('');
    expect(hashState(a)).toBe(hashState(b));
    const c = decodeState(encodeState(b));
    computeTo(b, w, 45);
    computeTo(c, w, 45);
    expect(hashState(c)).toBe(hashState(b));
  }, 300_000);
  it('take labour from the firms: the output of the cities falls against a world in which everybody is there', () => {
    const a = decodeState(encodeState(s)),
      b = decodeState(encodeState(s));
    const there: World['economyEngine'] = {
      ...w.economyEngine,
      absences: (state) => (state instanceof Uint8Array ? state : state.bytes()),
    };
    const wb = Object.assign(Object.create(Object.getPrototypeOf(w)), w, { economyEngine: there }) as World;
    for (let d = 0; d < 20; d++) {
      advanceDay(a, w);
      advanceDay(b, wb);
    }
    const output = (x: WorldState) => x.firm.cols.output.reduce((n, y) => n + y, 0);
    expect(output(a)).toBeLessThan(output(b));
  }, 300_000);
});
