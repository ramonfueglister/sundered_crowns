// Feature 1 of the economy, the grain harvest per place (docs/ECONOMY_DESIGN.md): the model and its place in the
// state, the snapshot and the view of a place. Its calibration on England is tested with the cultivated land
// (tests/cultivation.test.ts).
import { describe, it, expect } from 'vitest';
import { harvestKcal, kcalPerHeadDay, farmers, LAND_SHARE, ENGLAND_1300 } from '../src/sim/systems/harvest';
import { hectares, soilOf } from '../src/sim/systems/cultivation';
import { newWorldState } from '../tools/sim/load';
import { advanceDay } from '../src/sim/engine';
import { encodeState, decodeState } from '../src/sim/snapshot';
import { upgradeState, OLDEST_STATE_VERSION } from '../src/sim/upgrade';
import { STATE_VERSION } from '../src/sim/state';
import { placeDetail } from '../src/net/views';
import { residents } from '../src/sim/systems/hamlets';
import { ALIVE } from '../src/sim/state';

describe('the harvest model', () => {
  const T = 5e11; // England's land in the model's unit; any value serves here
  it("returns England's harvest of 1300–09 for England's land and people", () => {
    const y = harvestKcal(T, farmers(ENGLAND_1300.people), T);
    expect(kcalPerHeadDay(y, ENGLAND_1300.people)).toBeCloseTo(1242, 6);
  });
  it('has constant returns to scale: a hundredth of the land and the people brings a hundredth of the harvest', () => {
    expect(harvestKcal(8000 * 1200, 300, T) / harvestKcal(8000 * 120000, 30000, T)).toBeCloseTo(0.01, 12);
  });
  it('gives land the share α and labour the share 1 − α', () => {
    const y = harvestKcal(8000 * 120000, 30000, T);
    expect(harvestKcal(8000 * 120000, 60000, T) / y).toBeCloseTo(Math.pow(2, 1 - LAND_SHARE), 12);
    expect(harvestKcal(8000 * 240000, 30000, T) / y).toBeCloseTo(Math.pow(2, LAND_SHARE), 12);
  });
  it('is zero without soil, people or data', () => {
    expect(harvestKcal(0, 100, T)).toBe(0);
    expect(harvestKcal(8e6, 0, T)).toBe(0);
    expect(harvestKcal(NaN, 100, T)).toBe(0);
  });
});

describe('the harvest on the map', () => {
  it('gives every place with people and cultivated soil a harvest from the first day', { timeout: 60_000 }, () => {
    const { s, w } = newWorldState();
    expect(s.v).toBe(STATE_VERSION);
    expect(s.place.harvest.length).toBe(w.L);
    const { farmers } = residents(s);
    for (let i = 0; i < w.L; i++) expect(s.place.harvest[i] > 0).toBe(farmers[i] > 0 && soilOf(w, i, s.place.arable[i]) > 0);
    // the capital of France has people and good soil
    const paris = s.realm.cols.capital[s.realmText.findIndex((r) => r.key === 'france')];
    expect(s.place.harvest[paris]).toBeGreaterThan(0);
  });
  it('brings in a new harvest on the first day of a year and not before', () => {
    const { s, w } = newWorldState();
    // the capital of France is at its land limit: half the families of its hamlets leave, the others work the same arable
    const i = s.realm.cols.capital[s.realmText.findIndex((r) => r.key === 'france')], before = s.place.harvest[i], arable = s.place.arable[i];
    const F = s.family.cols, L = residents(s).farmers[i];
    for (let f = 0; f < s.family.size; f++) if (F.place[f] === i && F.hamlet[f] && f % 2 === 0) F.hamlet[f] = 0;
    advanceDay(s, w);
    expect(s.place.harvest[i]).toBe(before);
    s.day = 366 - 1; // 31 December 1356, a leap year
    advanceDay(s, w);
    expect(s.place.arable[i]).toBe(arable);
    const Q = s.person.cols; // on the first of January the dead go to the archive and the rows close up (a new table)
    let left = 0; for (let id = 0; id < s.person.size; id++) if (F.place[Q.family[id]] === i && F.hamlet[Q.family[id]] && Q.died[id] === ALIVE) left++;
    expect(left).toBeLessThan(L);
    expect(s.place.harvest[i] / before).toBeCloseTo(Math.pow(left / L, 1 - LAND_SHARE), 6);
  }, 30_000); // the economies of the cities compute the 364 days the test jumps over
  it('tells a client the harvest of a place and what it was computed from', () => {
    const { s, w } = newWorldState();
    const i = s.realm.cols.capital[s.realmText.findIndex((r) => r.key === 'england')];
    const h = placeDetail(s, w, i)!.harvest!;
    expect(h.kcal).toBe(s.place.harvest[i]);
    expect(h.perHeadDay).toBeCloseTo(h.kcal / s.place.pop[i] / 365, 6);
    expect(h.hectares).toBeCloseTo(w.area[i] * 100, 6);
    expect(h.farmers).toBe(residents(s).farmers[i]); // the persons of its hamlets
    expect(h.farmers).toBeGreaterThan(0); expect(h.farmers).toBeLessThan(s.place.pop[i]);
    expect(h.landYield).toBeGreaterThan(0);
    const a = h.arable!;
    expect(a.hectares).toBe(s.place.arable[i]);
    expect(a.share).toBeCloseTo(a.hectares / h.hectares, 12);
    expect(a.landYield!).toBeGreaterThan(h.landYield!); // the best soil is cultivated first
    expect(a.atLimit).toBe(true); // London
  });
});

describe('a world saved by an older build', () => {
  it('older than the oldest step this build has is refused', () => {
    const { s, w } = newWorldState();
    const old = decodeState(encodeState(s)) as any; old.v = OLDEST_STATE_VERSION - 1;
    expect(() => upgradeState(decodeState(encodeState(old)), w)).toThrow(/older/);
  });
  it('refuses a state from a newer build', () => {
    const { s } = newWorldState();
    (s as any).v = STATE_VERSION + 1;
    expect(() => decodeState(encodeState(s))).toThrow();
  });
});
