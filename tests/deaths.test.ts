// People feature 2, first part (docs/PEOPLE_DESIGN.md): the persons of the towns die. The day of death drawn from
// the life table, the list of events, what a death changes, the succession in the economy, the state and the upgrade.
import { describe, it, expect } from 'vitest';
import { newWorldState, loadSetup } from '../tools/sim/load';
import { advanceDay } from '../src/sim/engine';
import { ageAtDeath, drawDeath, deathsTo, foundDeaths } from '../src/sim/systems/deaths';
import { lifeTable, survival, yearsLeft } from '../src/sim/people/lifetable';
import { ageOn } from '../src/sim/systems/people';
import { namedPersons } from '../src/sim/systems/rulers';
import { ROLE, WORKING_AGE } from '../src/sim/systems/work';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { ALIVE, STATE_VERSION, type WorldState } from '../src/sim/state';

const living = (x: WorldState, id: number) => x.person.alive[id] === 1 && x.person.cols.died[id] === ALIVE;

describe('the life table of England around 1300 (La Poutré & Janssen 2021)', () => {
  it('has the values of its formula: 16 % die in the first year, 70 % reach 15, 25.8 years are left at 27', () => {
    expect(1 - survival(1)).toBeCloseTo(0.16, 3);
    expect(survival(15)).toBeCloseTo(0.698, 3);
    expect(survival(27)).toBeCloseTo(0.617, 3);
    expect(yearsLeft(0)).toBeCloseTo(35.1, 1);
    expect(yearsLeft(27)).toBeCloseTo(25.8, 1);
    const l = lifeTable();
    expect(l[0]).toBe(1);
    for (let a = 1; a < l.length; a++) expect(l[a]).toBeLessThanOrEqual(l[a - 1]);
    expect(l[120]).toBe(0);
  });
});

describe('the day of death is drawn from the life table', () => {
  const N = 200000,
    u = (k: number) => (k + 0.5) / N,
    l = lifeTable();
  it('a newborn survives as the table says', () => {
    const ages = Array.from({ length: N }, (_, k) => ageAtDeath(0, u(k)));
    for (const x of [1, 5, 15, 30, 50, 70, 90]) expect(ages.filter((a) => a > x).length / N).toBeCloseTo(l[x], 3);
    // the mean age at death is the life expectancy at birth (the draw takes the force of a year as constant, the
    // table integrates the formula: in the first year the draw lives a little longer)
    const mean = ages.reduce((a, b) => a + b, 0) / N;
    expect(Math.abs(mean - yearsLeft(0))).toBeLessThan(0.15);
  });
  it('a person who has reached an age survives from there', () => {
    const from = 32.4,
      ages = Array.from({ length: N }, (_, k) => ageAtDeath(from, u(k)));
    const at = (x: number) => {
      const y = Math.floor(x);
      return l[y] * (l[y + 1] / l[y]) ** (x - y);
    };
    expect(ages.reduce((a, b) => Math.min(a, b), Infinity)).toBeGreaterThanOrEqual(from);
    for (const x of [35, 40, 55, 75]) expect(ages.filter((a) => a > x).length / N).toBeCloseTo(l[x] / at(from), 3);
  });
  it('nobody lives past 120, and a later draw is a later death', () => {
    expect(ageAtDeath(0, 1 - 1e-12)).toBeLessThanOrEqual(120);
    expect(ageAtDeath(119.5, 0.999999)).toBeLessThanOrEqual(120);
    let last = 0;
    for (let k = 0; k < 1000; k++) {
      const a = ageAtDeath(10, k / 1000);
      expect(a).toBeGreaterThanOrEqual(last);
      last = a;
    }
  });
});

describe('a world whose persons die', () => {
  const { s, w } = newWorldState();
  const P = s.person.cols,
    named = namedPersons(s);

  it('every person of the towns has a day of death after the first day, a ruler none', () => {
    for (let id = 0; id < s.person.size; id++) {
      if (named.has(id)) expect(P.dies[id]).toBe(ALIVE);
      else {
        expect(P.dies[id]).toBeGreaterThan(0);
        expect(P.dies[id]).toBeLessThan(ALIVE);
        expect(P.dies[id]).toBe(drawDeath(s, id, 0));
      }
    }
  });

  it('after some days exactly those whose day has come are dead, on their day', () => {
    const parts = () => {
      const n = [0, 0, 0, 0, 0];
      for (let id = 0; id < s.person.size; id++) n[P.role[id]]++;
      return n.slice(1);
    };
    const before = parts(),
      firms = s.firm.size;
    for (let d = 0; d < 40; d++) advanceDay(s, w);
    expect(s.economy.cities!.halted).toBe('');
    let dead = 0;
    for (let id = 0; id < s.person.size; id++) {
      if (named.has(id) || P.born[id] > 0) continue; // (a child born since is src/sim/systems/families.ts)
      if (P.dies[id] <= s.day) {
        expect(P.died[id]).toBe(P.dies[id]);
        dead++;
      } else expect(P.died[id]).toBe(ALIVE);
    }
    expect(dead).toBeGreaterThan(20); // about 1 a day in the world of 1356 by the life table
    // the economy has the persons it had: every part is held, by the living where somebody was free
    expect(parts()).toEqual(before);
    expect(s.firm.size).toBe(firms);
    for (let id = 0; id < s.person.size; id++) {
      if (P.role[id] === ROLE.none) continue;
      if (!living(s, id)) continue; // an estate: nobody of the town was free
      expect(ageOn(P.born[id], s.day)).toBeGreaterThanOrEqual(WORKING_AGE - 40 / 365.25);
      if (P.role[id] === ROLE.owner) expect(s.firm.cols.owner[P.firm[id]]).toBe(id);
    }
    for (let f = 0; f < s.firm.size; f++) expect(P.role[s.firm.cols.owner[f]]).toBe(ROLE.owner);
  });

  it('a dead person heads no family and is no member of its purse', () => {
    const F = s.family.cols,
      members = new Int32Array(s.family.size);
    for (let id = 0; id < s.person.size; id++) if (living(s, id)) members[P.family[id]]++;
    for (let f = 0; f < s.family.size; f++) {
      if (F.man[f] >= 0) expect(living(s, F.man[f])).toBe(true);
      if (F.woman[f] >= 0) expect(living(s, F.woman[f])).toBe(true);
      expect(F.persons[f]).toBe(members[f]);
    }
  });

  it('a saved world goes on as the one that ran', () => {
    const copy = decodeState(encodeState(s));
    for (let d = 0; d < 5; d++) {
      advanceDay(s, w);
      advanceDay(copy, w);
    }
    expect(hashState(copy)).toBe(hashState(s));
  });

  it('the deaths alone: many days at once give what the days give one by one', () => {
    const a = newWorldState().s,
      b = decodeState(encodeState(a));
    deathsTo(a, 400);
    for (let d = 1; d <= 400; d++) deathsTo(b, d);
    expect(Array.from(b.person.cols.died)).toEqual(Array.from(a.person.cols.died));
  });
});

describe('the upgrade', () => {
  it('a world of state 20 on its first day becomes the new world: the persons are founded anew', () => {
    const { s, w } = newWorldState();
    const old = decodeState(encodeState(s));
    delete (old.person.cols as Record<string, unknown>).dies;
    delete (old.person.cols as Record<string, unknown>).bears;
    delete (old.family.cols as Record<string, unknown>).seat;
    old.v = 20;
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(s.startYear));
    expect(up.v).toBe(STATE_VERSION);
    expect(hashState(up)).toBe(hashState(s));
    // on a later day the persons draw for the age they have reached: nobody is dead on the day of the upgrade
    const later = decodeState(encodeState(s));
    later.day = 500;
    foundDeaths(later);
    for (let id = 0; id < later.person.size; id++)
      if (later.person.cols.dies[id] !== ALIVE) expect(later.person.cols.dies[id]).toBeGreaterThan(500);
  }, 150_000);
});
