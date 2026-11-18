// What the world server tells a browser about the persons (src/net/people.ts).
import { describe, it, expect } from 'vitest';
import { placePeople, manyPlacesPeople, personDetail, MAX_PLACES_PER_REQUEST } from '../src/net/people';
import { PLACES_PER_REQUEST } from '../src/figures/people';
import { CITIES, personsIn, genesOf } from '../src/sim/systems/people';
import { newWorldState } from '../tools/sim/load';

const { s } = newWorldState();
describe('the persons of a place', () => {
  it('are the living persons of its cities, in columns of equal length', () => {
    const london = CITIES.find((c) => c.name === 'London')!.place, v = placePeople(s, london);
    expect(v.id).toEqual(personsIn(s, london));
    for (const k of ['born', 'sex', 'family'] as const) expect(v[k].length).toBe(v.id.length);
    expect(placePeople(s, 2000).id.length).toBe(0);
  });
  it('of several places come in one pass, each list as the one of its place alone, in the order asked', () => {
    const places = [...new Set(CITIES.map((c) => c.place))].slice(0, 5).reverse().concat([2000]);
    const many = manyPlacesPeople(s, places);
    expect(many.map((m) => m.place)).toEqual(places);
    places.forEach((p, k) => expect(many[k]).toEqual(placePeople(s, p)));
    expect(PLACES_PER_REQUEST).toBe(MAX_PLACES_PER_REQUEST); // the figures ask for no more than the server gives
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
