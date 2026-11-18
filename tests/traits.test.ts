// People feature 5 (docs/PEOPLE_DESIGN.md): IQ and the Big Five shift the rates of death, of a far move and of who is
// taken at a wedding (Jokela et al. 2013, Calvin et al. 2011, Jokela 2009, Jokela et al. 2011).
import { describe, it, expect } from 'vitest';
import { loadSetup, newWorldState } from '../tools/sim/load';
import { DEATH, MARRIES, MOVE, MOVE_FACTOR_TOP, TRAITS_FROM_AGE, WEIGHT, deathFactor, moveFactor, weddingWeight, zIq, zOf, type TraitColumns } from '../src/sim/people/traits';
import { TOP_RATE, movesAYear } from '../src/sim/people/moving';
import { ageOn } from '../src/sim/systems/people';
import { ageAtDeath, deathsTo, drawDeath, settleEstates } from '../src/sim/systems/deaths';
import { birthsTo, weddingsOn } from '../src/sim/systems/families';
import { movesTo, rateOf } from '../src/sim/systems/moves';
import { namedPersons } from '../src/sim/systems/rulers';
import { hash01 } from '../src/sim/rng';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { ALIVE, STATE_VERSION } from '../src/sim/state';

/** Six persons: 0 at the mean, then one a standard deviation up in IQ, openness, conscientiousness, extraversion, agreeableness. */
const six = (): TraitColumns => {
  const col = (v: number, at: number, up: number) => { const c = new Uint8Array(6).fill(v); c[at] = up; return c; };
  return { iq: col(100, 1, 115), o: col(50, 2, 60), c: col(50, 3, 60), e: col(50, 4, 60), a: col(50, 5, 60), n: new Uint8Array(6).fill(50) };
};

describe('the factors of the traits', () => {
  const P = six();
  it('a trait is counted in standard deviations from the mean', () => {
    expect(zIq(P, 0)).toBe(0); expect(zIq(P, 1)).toBe(1); expect(zOf(P.c, 3)).toBe(1); expect(zOf(P.c, 0)).toBe(0);
  });
  it('death: a standard deviation of conscientiousness is 0.88 of the force, of IQ 0.89, the other traits nothing', () => {
    expect([DEATH.conscientiousness, DEATH.iq]).toEqual([0.88, 0.89]); expect(TRAITS_FROM_AGE).toBe(15);
    expect(1 - 0.24 * (1 - 0.54)).toBeCloseTo(DEATH.iq, 2); // Calvin et al. 2011 less the part through education
    const base = deathFactor(P, 0);
    expect(deathFactor(P, 3) / base).toBeCloseTo(0.88, 12); expect(deathFactor(P, 1) / base).toBeCloseTo(0.89, 12);
    for (const other of [2, 4, 5]) expect(deathFactor(P, other)).toBe(base);
  });
  it('a far move: openness 1.29, agreeableness 0.88, and no factor above the top', () => {
    const base = moveFactor(P, 0);
    expect(moveFactor(P, 2) / base).toBeCloseTo(MOVE.openness, 12); expect(moveFactor(P, 5) / base).toBeCloseTo(MOVE.agreeableness, 12);
    for (const other of [1, 3, 4]) expect(moveFactor(P, other)).toBe(base);
    const far: TraitColumns = { ...six(), o: new Uint8Array(6).fill(255), a: new Uint8Array(6).fill(0) };
    expect(moveFactor(far, 0)).toBe(MOVE_FACTOR_TOP);
    let top = 0; for (let age = 10; age < 60; age++) for (const man of [true, false]) for (const home of [true, false]) for (const landed of [true, false])
      top = Math.max(top, movesAYear({ age, man, home, landed, fatherDead: true, motherDead: true }));
    expect(top * MOVE_FACTOR_TOP).toBeLessThanOrEqual(TOP_RATE);
  });
  it('a wedding: the weight of extraversion and openness, by sex, times the calibrated weight', () => {
    expect(weddingWeight(P, 0, true)).toBe(0); expect(weddingWeight(P, 3, true)).toBe(0); expect(weddingWeight(P, 1, false)).toBe(0);
    expect(weddingWeight(P, 4, true)).toBeCloseTo(WEIGHT.men * Math.log(MARRIES.men.extraversion), 12);
    expect(weddingWeight(P, 4, false)).toBeCloseTo(WEIGHT.women * Math.log(MARRIES.women.extraversion), 12);
    expect(weddingWeight(P, 2, true)).toBeCloseTo(WEIGHT.men * Math.log(MARRIES.men.openness), 12);
    expect(weddingWeight(P, 2, false)).toBeCloseTo(WEIGHT.women * Math.log(MARRIES.women.openness), 12);
  });
});

describe('the traits in a world of 1291', () => {
  const { s, w } = newWorldState(1291, 1291), P = s.person.cols, F = s.family.cols, named = namedPersons(s);
  const people: number[] = []; for (let id = 0; id < s.person.size; id++) if (s.person.alive[id] && !named.has(id)) people.push(id);
  it('the mean factor of death and of a far move over the people is 1', () => {
    let d = 0, m = 0; for (const id of people) { d += deathFactor(P, id); m += moveFactor(P, id); }
    expect(d / people.length).toBeCloseTo(1, 1); expect(Math.abs(d / people.length - 1)).toBeLessThan(0.02);
    expect(Math.abs(m / people.length - 1)).toBeLessThan(0.02);
  });
  it('a child who dies before 15 dies on the day of the life table, whatever the traits', () => {
    let n = 0;
    for (const id of people) {
      const age = ageOn(P.born[id], 0); if (age >= TRAITS_FROM_AGE) continue;
      const plain = ageAtDeath(age, hash01(s.seed >>> 0, id, 40));
      if (plain < TRAITS_FROM_AGE) { n++; expect(P.dies[id]).toBe(Math.max(1, P.born[id] + Math.ceil(plain * 365.25))); }
      else expect(ageOn(P.born[id], P.dies[id])).toBeGreaterThanOrEqual(TRAITS_FROM_AGE - 1 / 365);
    }
    expect(n).toBeGreaterThan(1000);
  });
  it('the conscientious and the clever of 20 to 40 die later, the extraverted no later', () => {
    const left = (pick: (id: number) => boolean) => { let sum = 0, n = 0; for (const id of people) { const a = ageOn(P.born[id], 0); if (a >= 20 && a < 40 && pick(id)) { sum += ageOn(P.born[id], P.dies[id]) - a; n++; } } expect(n).toBeGreaterThan(1500); return sum / n; };
    expect(left((id) => P.c[id] >= 60) - left((id) => P.c[id] <= 40)).toBeGreaterThan(1.5);
    expect(left((id) => P.iq[id] >= 115) - left((id) => P.iq[id] <= 85)).toBeGreaterThan(1.2);
    expect(Math.abs(left((id) => P.e[id] >= 60) - left((id) => P.e[id] <= 40))).toBeLessThan(1.2);
  });
  it('the day of death is the same however often it is drawn', () => {
    for (const id of people.slice(0, 2000)) expect(drawDeath(s, id, 0)).toBe(P.dies[id]);
  });
  it('the rate of a far move of the unmarried carries the factor of the person, and stays under the top rate', () => {
    let n = 0;
    for (const id of people) {
      const r = rateOf(s, id, 0); expect(r).toBeLessThanOrEqual(TOP_RATE);
      const f = P.family[id]; if (F.man[f] === id || F.woman[f] === id) { expect(r).toBe(0); continue; }
      const age = ageOn(P.born[id], 0); if (age < 17 || age >= 29) continue;
      const dead = (x: number) => x >= 0 && P.died[x] !== ALIVE;
      const base = (landed: boolean) => movesAYear({ age, man: P.sex[id] === 1, home: true, landed, fatherDead: dead(P.father[id]), motherDead: dead(P.mother[id]) });
      const plain = r / moveFactor(P, id); // the rate of the rule, of a family with a firm or of one without
      expect(Math.min(Math.abs(plain - base(true)), Math.abs(plain - base(false)))).toBeLessThan(1e-12); n++;
    }
    expect(n).toBeGreaterThan(3000);
  });
  it('over 60 years the extraverted marry more often and the open less often, and a saved world goes on the same', () => {
    const ever = new Uint8Array(4 * s.person.size); let copy = s;
    for (let y = 1; y <= 60; y++) {
      if (y === 31) copy = decodeState(encodeState(s));
      for (let mo = 1; mo <= 12; mo++) {
        const d = Math.round((y - 1 + mo / 12) * 365.25);
        for (const x of copy === s ? [s] : [s, copy]) { deathsTo(x, d); movesTo(x, w, d); birthsTo(x, d); weddingsOn(x, d); settleEstates(x, d); }
        for (let f = 0; f < s.family.size; f++) if (F.seat[f] && F.woman[f] >= 0) { ever[F.woman[f]] = 1; if (F.man[f] >= 0) ever[F.man[f]] = 1; }
      }
      if (y === 40) expect(hashState(copy)).toBe(hashState(s));
    }
    expect(hashState(copy)).toBe(hashState(s));
    const end = Math.round(60 * 365.25), Q = s.person.cols;
    const share = (pick: (id: number) => boolean) => { let m = 0, n = 0; for (let id = 0; id < s.person.size; id++) { if (Q.born[id] <= 0 || Q.died[id] !== ALIVE || Q.dies[id] === ALIVE) continue; const a = ageOn(Q.born[id], end); if (a < 35 || !pick(id)) continue; n++; m += ever[id]; } expect(n).toBeGreaterThan(300); return m / n; };
    const odds = (p: number) => p / (1 - p);
    for (const sex of [0, 1]) {
      expect(odds(share((id) => Q.sex[id] === sex && Q.e[id] >= 58)) / odds(share((id) => Q.sex[id] === sex && Q.e[id] <= 42))).toBeGreaterThan(1.25);
      expect(odds(share((id) => Q.sex[id] === sex && Q.o[id] >= 58)) / odds(share((id) => Q.sex[id] === sex && Q.o[id] <= 42))).toBeLessThan(0.85);
    }
  }, 240_000);
});

describe('the state of the traits', () => {
  it('a world from before the traits draws deaths and moves anew by the upgrade and keeps where its persons come from', () => {
    const { s, w } = newWorldState(1291, 1291);
    const old = decodeState(encodeState(s)) as any; old.v = 26;
    const P = old.person.cols; let moved = -1;
    for (let id = 0; id < old.person.size && moved < 0; id++) if (P.home[id] >= 0 && P.dies[id] !== ALIVE) moved = id;
    const home = P.home[moved]; P.home[moved] = home + 1; // a person who has moved
    P.dies.fill(12345, 0, 1000); P.moves.fill(7, 0, 1000); // days of the old rates
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(1291));
    expect(up.v).toBe(STATE_VERSION);
    expect(up.person.cols.home[moved]).toBe(home + 1); up.person.cols.home[moved] = home;
    expect(hashState(up)).toBe(hashState(s));
  }, 60_000);
});
