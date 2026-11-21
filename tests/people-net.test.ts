// What the world server tells a browser about the persons (src/net/people.ts).
import { describe, it, expect } from 'vitest';
import { placePeople, manyPlacesPeople, personDetail, MAX_PLACES_PER_REQUEST } from '../src/net/people';
import { PLACES_PER_REQUEST } from '../src/figures/people';
import { CITIES, personsIn, genesOf } from '../src/sim/systems/people';
import { newWorldState } from '../tools/sim/load';
import { rowOf } from '../src/sim/people/archive';
import { awayOn, partOf } from '../src/sim/people/plan_person';
import { AWAY } from '../src/sim/people/day_plan';

const { s } = newWorldState();
describe('the persons of a place', () => {
  it('are the living persons of its cities, in columns of equal length', () => {
    const london = CITIES.find((c) => c.name === 'London')!.place,
      v = placePeople(s, london);
    expect(v.id).toEqual(personsIn(s, london));
    for (const k of ['born', 'sex', 'family'] as const) expect(v[k].length).toBe(v.id.length);
    expect(placePeople(s, 2000).id.length).toBe(0);
  });
  it('of several places come in one pass, each list as the one of its place alone, in the order asked', () => {
    const places = [...new Set(CITIES.map((c) => c.place))].slice(0, 5).reverse().concat([2000]);
    const many = manyPlacesPeople(s, places);
    expect(many.map((m) => m.place)).toEqual(places);
    places.forEach((p, k) => {
      expect(many[k]).toEqual(placePeople(s, p));
    });
    expect(PLACES_PER_REQUEST).toBe(MAX_PLACES_PER_REQUEST); // the figures ask for no more than the server gives
  });
  it('carry what the figures need for the plan of the day: part, calendar, the seed, the mothers in childbed', () => {
    const london = CITIES.find((c) => c.name === 'London')!.place,
      v = placePeople(s, london),
      childbed = new Map((v.childbed ?? []).map((c) => [c.uid, c.born]));
    expect(v.seed).toBe(s.seed >>> 0);
    v.id.forEach((uid, k) => {
      const row = rowOf(s, uid);
      expect({ who: v.who![k], calendar: v.calendar![k] }).toEqual(partOf(s, row));
      // (sickness comes first in awayOn: a mother in childbed may be sick too)
      if (v.sex[k] === 0 && awayOn(s, row, s.day) === AWAY.childbed) expect(childbed.has(uid)).toBe(true);
      if (childbed.has(uid)) expect(awayOn(s, row, s.day)).not.toBe(AWAY.none);
    });
    expect(childbed.size).toBeGreaterThan(0);
  });
});
describe('one person in full', () => {
  it('carries age, parents, traits and the 100 gene bytes', () => {
    const d = personDetail(s, 100, () => 'x')!;
    expect(d.genes).toEqual(Array.from(genesOf(s, 100)));
    expect(d.age).toBeCloseTo(-s.person.cols.born[100] / 365.25, 1);
    expect(personDetail(s, s.person.size, () => 'x')).toBeNull();
    expect(personDetail(s, -1, () => 'x')).toBeNull();
  });
});
describe('the kin and the home of a person', () => {
  const F = s.family.cols,
    P = s.person.cols,
    U = P.uid;
  it('has the other one of the couple as spouse, and the spouse has the person (uids)', () => {
    let f = 0;
    while (f < s.family.size && !(F.man[f] >= 0 && F.woman[f] >= 0)) f++;
    const d = personDetail(s, U[F.man[f]], () => 'x')!;
    expect(d.spouse).toBe(U[F.woman[f]]);
    expect(personDetail(s, U[F.woman[f]], () => 'x')!.spouse).toBe(U[F.man[f]]);
  });
  it('has as children every person whose mother or father it is (uids)', () => {
    let c = 0;
    while (c < s.person.size && P.mother[c] < 0) c++;
    const mother = P.mother[c],
      d = personDetail(s, mother, () => 'x')!;
    expect(d.children).toContain(U[c]);
    for (const k of d.children) expect(P.mother[rowOf(s, k)]).toBe(mother);
  });
  it('lives in the town of its place', () => {
    const london = CITIES.find((c) => c.name === 'London')!,
      uid = placePeople(s, london.place).id[0];
    expect(personDetail(s, uid, () => 'x')!.town).toBe('London');
  });
});
