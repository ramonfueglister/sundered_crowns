// Feature 1 of the economy, the grain harvest per place (docs/ECONOMY_DESIGN.md): the model, its calibration on
// England 1300–09, and its place in the state, the snapshot and the view of a place.
import { describe, it, expect } from 'vitest';
import { harvestKcal, kcalPerHeadDay, farmers, hectares, LAND_SHARE, ENGLAND_1300 } from '../src/sim/systems/harvest';
import { newWorldState, loadLand } from '../tools/sim/load';
import { advanceDay } from '../src/sim/engine';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { STATE_VERSION } from '../src/sim/state';
import { placeDetail } from '../src/net/views';

describe('the harvest model', () => {
  const T = 5e11; // England's land in the model's unit; any value serves here
  it("returns England's harvest of 1300–09 for England's land and people", () => {
    const y = harvestKcal(1, T, farmers(ENGLAND_1300.people), T);
    expect(kcalPerHeadDay(y, ENGLAND_1300.people)).toBeCloseTo(1242, 6);
  });
  it('has constant returns to scale: a hundredth of the land and the people brings a hundredth of the harvest', () => {
    expect(harvestKcal(8000, 1200, 300, T) / harvestKcal(8000, 120000, 30000, T)).toBeCloseTo(0.01, 12);
  });
  it('gives land the share α and labour the share 1 − α', () => {
    const y = harvestKcal(8000, 120000, 30000, T);
    expect(harvestKcal(8000, 120000, 60000, T) / y).toBeCloseTo(Math.pow(2, 1 - LAND_SHARE), 12);
    expect(harvestKcal(8000, 240000, 30000, T) / y).toBeCloseTo(Math.pow(2, LAND_SHARE), 12);
    expect(harvestKcal(16000, 120000, 30000, T) / y).toBeCloseTo(Math.pow(2, LAND_SHARE), 12);
  });
  it('is zero without yield, land, people or data', () => {
    expect(harvestKcal(0, 1000, 100, T)).toBe(0);
    expect(harvestKcal(8000, 0, 100, T)).toBe(0);
    expect(harvestKcal(8000, 1000, 0, T)).toBe(0);
    expect(harvestKcal(NaN, 1000, 100, T)).toBe(0);
  });
});

describe('the harvest on the map', () => {
  const land = loadLand();
  it('reproduces England 1300–09 when the people of that time are spread over its places by their land', () => {
    // labour in proportion to A·X feeds every place equally well: the allocation behind "England as one piece of land"
    const { w } = newWorldState();
    const ax = land.england.places.map((i) => (w.landYield[i] || 0) * hectares(w, i));
    const total = ax.reduce((a, b) => a + b, 0);
    let y = 0;
    land.england.places.forEach((i, k) => { y += harvestKcal(w.landYield[i], hectares(w, i), farmers(ENGLAND_1300.people * ax[k] / total), w.landEngland); });
    // the places follow England's outline only as closely as their borders allow
    expect(Math.abs(kcalPerHeadDay(y, ENGLAND_1300.people) / ENGLAND_1300.kcalPerHeadDay - 1)).toBeLessThan(0.02);
  });
  it('gives every place with people and fertile land a harvest from the first day', () => {
    const { s, w } = newWorldState();
    expect(s.v).toBe(STATE_VERSION);
    expect(s.place.harvest.length).toBe(w.L);
    for (let i = 0; i < w.L; i++) expect(s.place.harvest[i] > 0).toBe(s.place.pop[i] > 0 && w.landYield[i] > 0);
  });
  it('brings in a new harvest on the first day of a year and not before', () => {
    const { s, w } = newWorldState();
    const i = s.realm.cols.capital[s.realmText.findIndex((r) => r.key === 'france')], before = s.place.harvest[i];
    s.place.pop[i] *= 2;
    advanceDay(s, w);
    expect(s.place.harvest[i]).toBe(before);
    s.day = 366 - 1; // 31 December 1356, a leap year
    advanceDay(s, w);
    expect(s.place.harvest[i] / before).toBeCloseTo(Math.pow(2, 1 - LAND_SHARE), 6);
  });
  it('tells a client the harvest of a place and what it was computed from', () => {
    const { s, w } = newWorldState();
    const i = s.realm.cols.capital[s.realmText.findIndex((r) => r.key === 'england')];
    const h = placeDetail(s, w, i)!.harvest!;
    expect(h.kcal).toBe(s.place.harvest[i]);
    expect(h.perHeadDay).toBeCloseTo(h.kcal / s.place.pop[i] / 365, 6);
    expect(h.hectares).toBeCloseTo(w.area[i] * 100, 6);
    expect(h.farmers).toBeCloseTo(0.74 * s.place.pop[i], 3);
    expect(h.landYield).toBeGreaterThan(0);
  });
});

describe('a world saved before the harvest existed', () => {
  it('is brought up to date when it is loaded', () => {
    const { s, w } = newWorldState();
    const fresh = hashState(s);
    const old = decodeState(encodeState(s)) as any;
    delete old.place.harvest; old.v = 1;
    const loaded = decodeState(encodeState(old));
    expect(loaded.v).toBe(1);
    expect(hashState(upgradeState(loaded, w))).toBe(fresh);
  });
  it('refuses a state from a newer build', () => {
    const { s } = newWorldState();
    (s as any).v = STATE_VERSION + 1;
    expect(() => decodeState(encodeState(s))).toThrow();
  });
});
