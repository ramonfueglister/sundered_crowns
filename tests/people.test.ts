// Feature 1 of the people (docs/PEOPLE_DESIGN.md): the life table, the persons and families of the 30 cities, their
// inheritance, the state, the snapshot and the upgrade of an older world.
import { describe, it, expect } from 'vitest';
import { lifeExpectancy, survivorship } from '../src/sim/people/lifetable';
import { CITIES, SCALE, ageOn, cityPeopleByPlace, personsIn, MOTHER_AGE } from '../src/sim/systems/people';
import { newWorldState } from '../tools/sim/load';
import { toHeads } from '../src/sim/scale';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { residents } from '../src/sim/systems/hamlets';
import { ALIVE } from '../src/sim/state';

describe('the Coale-Demeny West life tables', () => {
  it('give the published life expectancy at birth of women, 20 + 2.5 years per level', () => {
    for (const level of [1, 3, 5, 10, 21])
      expect(Math.abs(lifeExpectancy('f', level) - (20 + 2.5 * (level - 1)))).toBeLessThan(0.1);
    expect(lifeExpectancy('f', 3)).toBeCloseTo(25, 2);
  });
  it('give men a shorter life than women at level 3', () => {
    expect(lifeExpectancy('m', 3)).toBeLessThan(lifeExpectancy('f', 3));
    expect(lifeExpectancy('m', 3)).toBeGreaterThan(20);
  });
  it('fall from 1 and end near 105', () => {
    const l = survivorship('f', 3);
    expect(l[0]).toBe(1);
    for (let a = 1; a < l.length; a++) expect(l[a]).toBeLessThanOrEqual(l[a - 1]);
    expect(l[105]).toBeLessThan(1e-4);
  });
});

describe('the cities', () => {
  it('are the 30 largest after Chandler, largest first, each in a land place', () => {
    const { w } = newWorldState();
    expect(CITIES.length).toBe(30);
    expect(CITIES[0].name).toBe('Cairo');
    for (let i = 1; i < CITIES.length; i++) expect(CITIES[i].people).toBeLessThanOrEqual(CITIES[i - 1].people);
    for (const c of CITIES) {
      expect(c.place).toBeGreaterThanOrEqual(0);
      expect(c.place).toBeLessThan(w.L);
    }
  });
  it('are the people of their place: a place has its persons and nobody else', () => {
    const { s } = newWorldState(),
      counted = residents(s).people;
    let all = 0;
    for (let i = 0; i < s.place.pop.length; i++) {
      expect(s.place.pop[i]).toBe(counted[i]);
      all += counted[i];
    }
    for (const [p, n] of cityPeopleByPlace()) expect(s.place.pop[p]).toBeGreaterThanOrEqual(Math.round(toHeads(n)));
    let alive = 0;
    for (let i = 0; i < s.person.size; i++) if (s.person.alive[i] && s.person.cols.died[i] === ALIVE) alive++;
    expect(all).toBe(alive);
  });
});

describe('the persons of a world founded in 1356', () => {
  const { s } = newWorldState();
  const P = s.person.cols,
    F = s.family.cols,
    N = s.person.size;

  it('are one per hundred people of each city', () => {
    expect(N).toBe(CITIES.reduce((t, c) => t + Math.round(c.people / SCALE), 0));
    const london = CITIES.find((c) => c.name === 'London')!;
    expect(personsIn(s, london.place).length).toBe(Math.round(london.people / SCALE));
  });
  it('are all alive, with no freed rows: ids are never reused', () => {
    expect(s.person.free.length).toBe(0);
    expect(s.family.free.length).toBe(0);
    for (let i = 0; i < N; i++) expect(s.person.alive[i]).toBe(1);
  });
  it('were born before the first day and are at most 120', () => {
    for (let i = 0; i < N; i++) {
      expect(P.born[i]).toBeLessThanOrEqual(0);
      expect(ageOn(P.born[i], 0)).toBeLessThan(121);
    }
  });
  it('live in families of their own city, and the head of a family belongs to it', () => {
    for (let i = 0; i < N; i++) expect(P.family[i]).toBeLessThan(s.family.size);
    for (let f = 0; f < s.family.size; f++) {
      if (F.man[f] >= 0) {
        expect(P.family[F.man[f]]).toBe(f);
        expect(P.sex[F.man[f]]).toBe(1);
      }
      if (F.woman[f] >= 0) {
        expect(P.family[F.woman[f]]).toBe(f);
        expect(P.sex[F.woman[f]]).toBe(0);
      }
    }
  });
  it('have as parents the couple of their family, the mother 15 to 45 at their birth', () => {
    let children = 0;
    for (let i = 0; i < N; i++) {
      const m = P.mother[i];
      if (m < 0) {
        expect(P.father[i]).toBe(-1);
        continue;
      }
      children++;
      const f = P.family[i];
      expect(F.woman[f]).toBe(m);
      expect(F.man[f]).toBe(P.father[i]);
      const d = ageOn(P.born[m], 0) - ageOn(P.born[i], 0);
      expect(d).toBeGreaterThanOrEqual(MOTHER_AGE[0]);
      expect(d).toBeLessThanOrEqual(MOTHER_AGE[1]);
    }
    expect(children / N).toBeGreaterThan(0.3);
  });
  it('have IQ and Big Five normally distributed on their scales', () => {
    const stat = (v: ArrayLike<number>) => {
      let m = 0;
      for (let i = 0; i < N; i++) m += v[i];
      m /= N;
      let q = 0;
      for (let i = 0; i < N; i++) q += (v[i] - m) ** 2;
      return [m, Math.sqrt(q / N)];
    };
    const [mi, si] = stat(P.iq);
    expect(mi).toBeCloseTo(100, 0);
    expect(Math.abs(si - 15)).toBeLessThan(0.5);
    for (const t of [P.o, P.c, P.e, P.a, P.n]) {
      const [m, sd] = stat(t);
      expect(Math.abs(m - 50)).toBeLessThan(0.5);
      expect(Math.abs(sd - 10)).toBeLessThan(0.5);
    }
  });
  it('inherit: children resemble the mean of their parents with the slope h²', () => {
    const slope = (v: ArrayLike<number>) => {
      const x: number[] = [],
        y: number[] = [];
      for (let i = 0; i < N; i++)
        if (P.mother[i] >= 0) {
          x.push((v[P.mother[i]] + v[P.father[i]]) / 2);
          y.push(v[i]);
        }
      const mx = x.reduce((a, b) => a + b, 0) / x.length,
        my = y.reduce((a, b) => a + b, 0) / y.length;
      let n = 0,
        d = 0;
      for (let i = 0; i < x.length; i++) {
        n += (x[i] - mx) * (y[i] - my);
        d += (x[i] - mx) ** 2;
      }
      return n / d;
    };
    expect(Math.abs(slope(P.iq) - 0.66)).toBeLessThan(0.06);
    expect(Math.abs(slope(P.o) - 0.4)).toBeLessThan(0.06);
  });
  it('are the same for the same seed and differ for another', () => {
    expect(hashState(newWorldState(1356).s)).toBe(hashState(s));
    expect(Array.from(newWorldState(1357).s.person.cols.born.slice(0, 50))).not.toEqual(
      Array.from(P.born.slice(0, 50)),
    );
  });
  it('are founded as a population that does not grow: a household for every 5.8 persons, three women in ten of 40 without one', () => {
    let seats = 0,
      w40 = 0,
      single = 0,
      under15 = 0;
    for (let f = 0; f < s.family.size; f++)
      if (F.seat[f]) {
        seats++;
        expect(F.woman[f]).toBeGreaterThanOrEqual(0);
      } else {
        expect(F.man[f]).toBe(-1);
        expect(F.woman[f]).toBe(-1);
      }
    expect(N / seats).toBeGreaterThan(5.6);
    expect(N / seats).toBeLessThan(6.0);
    for (let i = 0; i < N; i++) {
      const a = ageOn(P.born[i], 0);
      if (a < 15) under15++;
      if (P.sex[i] === 0 && a >= 40 && a < 45) {
        w40++;
        if (F.woman[P.family[i]] !== i) single++;
      }
    }
    expect(single / w40).toBeGreaterThan(0.25);
    expect(single / w40).toBeLessThan(0.37);
    expect(under15 / N).toBeGreaterThan(0.29);
    expect(under15 / N).toBeLessThan(0.35);
  });
});

describe('the people in the state', () => {
  it('survive the snapshot', () => {
    const { s } = newWorldState();
    expect(hashState(decodeState(encodeState(s)))).toBe(hashState(s));
  });
});
