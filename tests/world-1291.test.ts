// The world of 1291: its realms and borders (public/data/setup_1291.json), the people before the Black Death, the
// persons of its own 30 cities, and the economy of 1356 as a placeholder (src/sim/tables.ts); a world of 1291 founded
// with the people and persons of 1356 got those of 1291 by upgrades this build no longer has (state versions 8 and 11).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { newWorldState, loadSetup, dataPath } from '../tools/sim/load';
import { SCALE } from '../src/sim/scale';
import { citiesOf } from '../src/sim/content/cities';

const { s, w } = newWorldState(1291, 1291);
const s1291 = loadSetup(1291), s1356 = loadSetup(1356);
const sum = (a: ArrayLike<number | null>) => { let t = 0; for (let i = 0; i < a.length; i++) t += a[i] ?? 0; return t; };

describe('a world of 1291', () => {
  it('starts in 1291 with the realms of 1291', () => {
    expect(s.startYear).toBe(1291);
    expect(s.realmText.some((t) => t.key === 'greater_poland')).toBe(true);
    expect(s.realmText.some((t) => t.key === 'jerusalem')).toBe(true);
  });
  it('has more people than 1356 (before the plague) and keeps the placeholder tables', () => {
    expect(sum(s1291.pop)).toBeGreaterThan(sum(s1356.pop) * 1.05);
    expect(s.person.size).toBeGreaterThan(0);
    expect(s.economy.cities?.day).toBe(0); // the economies of the cities of 1356, founded on the first day
    expect(s.economy.cities!.halted).toBe('');
  });
  it('holds in every place at least the people of the towns the world graphic builds there', () => {
    const towns = JSON.parse(readFileSync(dataPath('towns_1291.json'), 'utf8')) as { people: (number | null)[]; place: number[] };
    const inTowns = new Map<number, number>();
    towns.people.forEach((n, k) => { if (n) inTowns.set(towns.place[k], (inTowns.get(towns.place[k]) ?? 0) + n); });
    expect(inTowns.size).toBeGreaterThan(400);
    for (const [p, n] of inTowns) expect(s.place.pop[p]).toBeGreaterThanOrEqual(n / SCALE - 0.01);
    expect(inTowns.get(w.names.indexOf('Paris'))).toBeGreaterThan(200_000); // Chandler 1291
  });
  it('counts heads at 1:100 and feeds a head as a person of the time', () => {
    expect(sum(s.place.pop)).toBeGreaterThan(sum(s1291.pop) / SCALE * 0.999);
    expect(sum(s.place.pop)).toBeLessThan(sum(s1291.pop) / SCALE * 1.01); // the 30 cities may lift a few places
    let kcal = 0, heads = 0;
    for (let i = 0; i < w.L; i++) if (s.place.harvest[i] > 0) { kcal += s.place.harvest[i]; heads += s.place.pop[i]; }
    expect(kcal / heads / 365).toBeGreaterThan(800); expect(kcal / heads / 365).toBeLessThan(3000);
  });
  it('has the persons of its own 30 cities of 1291, as many as the towns of the world graphic house', () => {
    const cities = citiesOf(1291);
    expect(cities.length).toBe(30);
    expect(cities[0].name).toBe('Cairo');
    for (const out of ['Texcoco', 'Tenayuca', 'Mali']) expect(cities.some((c) => c.name === out)).toBe(false); // outside the world
    expect(s.person.size).toBe(cities.reduce((t, c) => t + Math.round(c.people / SCALE), 0));
    const towns = JSON.parse(readFileSync(dataPath('towns_1291.json'), 'utf8')) as { people: (number | null)[]; place: number[] };
    for (const c of cities) {
      expect(towns.people[c.site]).toBe(c.people); // the town of the picture holds the city's people
      expect(towns.place[c.site]).toBe(c.place);
      expect(s.place.pop[c.place]).toBeGreaterThanOrEqual(c.people / SCALE - 0.01);
    }
  });
});
