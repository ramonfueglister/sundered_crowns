// The world of 1291: its realms and borders (public/data/setup_1291.json), the people before the Black Death, and the
// tables of 1356 as placeholders (src/sim/tables.ts); a world of 1291 founded with the people of 1356 gets those of 1291
// by the upgrade 7 → 8.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { newWorldState, loadSetup, dataPath } from '../tools/sim/load';
import { upgradeState } from '../src/sim/upgrade';
import { STATE_VERSION } from '../src/sim/state';
import { SCALE } from '../src/sim/scale';

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
  it('takes the people of 1291 by the upgrade from 7', () => {
    const old = structuredClone(s);
    old.v = 7;
    for (let i = 0; i < old.place.pop.length; i++) old.place.pop[i] = Math.max(0, s1356.pop[i] ?? 0);
    for (let i = 0; i < old.place.harvest.length; i++) old.place.harvest[i] *= SCALE; // a world of 7 counted people of the time
    const up = upgradeState(old, w, () => s1291);
    expect(up.v).toBe(STATE_VERSION);
    for (let i = 0; i < w.L; i++) expect(up.place.pop[i]).toBeCloseTo(s.place.pop[i], 3);
    for (let i = 0; i < w.L; i++) expect(up.place.harvest[i] / Math.max(1, s.place.harvest[i])).toBeCloseTo(s.place.harvest[i] > 0 ? 1 : 0, 4);
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
});
