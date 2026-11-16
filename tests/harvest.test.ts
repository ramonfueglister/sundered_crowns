// Feature 1 of the economy, the grain harvest per place (docs/ECONOMY_DESIGN.md): the model and its place in the
// state, the snapshot and the view of a place. Its calibration on England is tested with the cultivated land
// (tests/cultivation.test.ts).
import { describe, it, expect } from 'vitest';
import { harvestKcal, kcalPerHeadDay, farmers, LAND_SHARE, ENGLAND_1300 } from '../src/sim/systems/harvest';
import { hectares, soilOf } from '../src/sim/systems/cultivation';
import { newWorldState, countedInPeopleOfTheTime } from '../tools/sim/load';
import { advanceDay } from '../src/sim/engine';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { STATE_VERSION } from '../src/sim/state';
import { placeDetail } from '../src/net/views';

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
  it('gives every place with people and cultivated soil a harvest from the first day', () => {
    const { s, w } = newWorldState();
    expect(s.v).toBe(STATE_VERSION);
    expect(s.place.harvest.length).toBe(w.L);
    for (let i = 0; i < w.L; i++) expect(s.place.harvest[i] > 0).toBe(s.place.pop[i] > 0 && soilOf(w, i, s.place.arable[i]) > 0);
    // the capital of France has people and good soil
    const paris = s.realm.cols.capital[s.realmText.findIndex((r) => r.key === 'france')];
    expect(s.place.harvest[paris]).toBeGreaterThan(0);
  });
  it('brings in a new harvest on the first day of a year and not before', () => {
    const { s, w } = newWorldState();
    // the capital of France is at its land limit: twice the people work the same arable
    const i = s.realm.cols.capital[s.realmText.findIndex((r) => r.key === 'france')], before = s.place.harvest[i];
    s.place.pop[i] *= 2;
    advanceDay(s, w);
    expect(s.place.harvest[i]).toBe(before);
    s.day = 366 - 1; // 31 December 1356, a leap year
    advanceDay(s, w);
    expect(s.place.harvest[i] / before).toBeCloseTo(Math.pow(2, 1 - LAND_SHARE), 6);
  }, 30_000); // the economies of the cities compute the 364 days the test jumps over
  it('tells a client the harvest of a place and what it was computed from', () => {
    const { s, w } = newWorldState();
    const i = s.realm.cols.capital[s.realmText.findIndex((r) => r.key === 'england')];
    const h = placeDetail(s, w, i)!.harvest!;
    expect(h.kcal).toBe(s.place.harvest[i]);
    expect(h.perHeadDay).toBeCloseTo(h.kcal / s.place.pop[i] / 365, 6);
    expect(h.hectares).toBeCloseTo(w.area[i] * 100, 6);
    expect(h.farmers).toBeCloseTo(0.74 * s.place.pop[i], 3);
    expect(h.landYield).toBeGreaterThan(0);
    const a = h.arable!;
    expect(a.hectares).toBe(s.place.arable[i]);
    expect(a.share).toBeCloseTo(a.hectares / h.hectares, 12);
    expect(a.landYield!).toBeGreaterThan(h.landYield!); // the best soil is cultivated first
    expect(a.atLimit).toBe(true); // London
  });
});

describe('a world saved by an older build', () => {
  it('from before the harvest existed is brought up to date when it is loaded', () => {
    const { s, w } = newWorldState();
    const fresh = hashState(s);
    const old = decodeState(encodeState(s)) as any;
    countedInPeopleOfTheTime(old); delete old.place.harvest; delete old.place.arable; old.v = 1;
    const loaded = decodeState(encodeState(old));
    expect(loaded.v).toBe(1);
    expect(hashState(upgradeState(loaded, w))).toBe(fresh);
  });
  it('from before cultivated land existed gets its arable, and its harvest counts with it', () => {
    const { s, w } = newWorldState();
    const fresh = hashState(s);
    const old = decodeState(encodeState(s)) as any;
    countedInPeopleOfTheTime(old); delete old.place.arable; old.place.harvest = old.place.harvest.map((v: number) => v * 3); old.v = 2; // a harvest from all land
    const loaded = decodeState(encodeState(old));
    expect(loaded.v).toBe(2);
    expect(hashState(upgradeState(loaded, w))).toBe(fresh);
  });
  it('refuses a state from a newer build', () => {
    const { s } = newWorldState();
    (s as any).v = STATE_VERSION + 1;
    expect(() => decodeState(encodeState(s))).toThrow();
  });
});
