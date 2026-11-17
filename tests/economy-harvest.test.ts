// Economy feature 12 (docs/ECONOMY_DESIGN.md): the harvest feeds the cities. The factor of the harvest of a city's
// place (src/sim/systems/economy.ts), the calibration of a city with it and its trade in food
// (src/sim/economy/calibration.ts), the founding of a world, the state and the upgrade.
import { describe, it, expect } from 'vitest';
import { newWorldState, loadEconomyTable, loadSetup } from '../tools/sim/load';
import { advanceDay } from '../src/sim/engine';
import { FIGURE, FIGURES } from '../src/sim/economy/engine';
import { calibrateEconomy, cityTable, tradeFood } from '../src/sim/economy/calibration';
import { ENGLAND_HARVEST_PER_FARMER, IRRIGATED_REGION, cityPlaces, foundEconomy, foundWithHarvest, harvestFactors } from '../src/sim/systems/economy';
import { ENGLAND_1300, farmers } from '../src/sim/systems/harvest';
import { residents } from '../src/sim/systems/hamlets';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { STATE_VERSION } from '../src/sim/state';

const { s, w } = newWorldState();
const table = loadEconomyTable();
const AGRICULTURE = 0;
const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
const close = (a: number, b: number, rel = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(a), Math.abs(b)));
const regionOf = (p: number) => (w.provOf[p] >= 0 ? w.regions[w.regionOf[w.provOf[p]]] : '');
/** London's table: 60,862 people, 266 persons who work (economy feature 5). */
const city = (factor: number) => calibrateEconomy(cityTable(table, 60862, 266, factor));

describe('the factor of the harvest', () => {
  it('is the harvest per farmer of the place against England\'s of 1300–09', () => {
    expect(ENGLAND_HARVEST_PER_FARMER / 365).toBeCloseTo(ENGLAND_1300.kcalPerHeadDay / 0.74, 6);
    expect(ENGLAND_HARVEST_PER_FARMER).toBeCloseTo(ENGLAND_1300.kcalPerHeadDay * 365 * ENGLAND_1300.people / farmers(ENGLAND_1300.people), 6);
    const e = s.economy.cities!, f = harvestFactors(s, w), { farmers: L } = residents(s);
    expect(f.length).toBe(e.places.length);
    e.places.forEach((p, k) => {
      if (regionOf(p) === IRRIGATED_REGION || !(s.place.harvest[p] > 0)) expect(f[k]).toBe(1);
      else close(f[k], s.place.harvest[p] / L[p] / ENGLAND_HARVEST_PER_FARMER);
    });
  });
  it('is what the economies of a new world were founded with', () => {
    const e = s.economy.cities!;
    expect(Array.from(e.harvestFactor)).toEqual(Array.from(harvestFactors(s, w)));
  });
  it('lies near 1 in London and Ghent, and is 1 in the cities of Egypt', () => {
    const f = harvestFactors(s, w), by = (name: string) => f[cityPlaces(1356).findIndex((c) => c.name === name)];
    expect(by('London')).toBeGreaterThan(0.95); expect(by('London')).toBeLessThan(1.15);
    expect(by('Ghent')).toBeGreaterThan(0.95); expect(by('Ghent')).toBeLessThan(1.15);
    for (const n of ['Cairo', 'Damietta', 'Alexandria']) expect(by(n)).toBe(1);
    expect(by('Venice')).toBeLessThan(0.3);
  });
  it('keeps 1 for every city of Egypt in a world of 1291, also where its row names no country', () => {
    const x = newWorldState(1291, 1291), e = x.s.economy.cities!, f = harvestFactors(x.s, x.w);
    let egypt = 0;
    e.places.forEach((p, k) => { if ((x.w.provOf[p] >= 0 ? x.w.regions[x.w.regionOf[x.w.provOf[p]]] : '') === IRRIGATED_REGION) { egypt++; expect(f[k]).toBe(1); } });
    expect(egypt).toBeGreaterThanOrEqual(5);
    for (const v of f) expect(v).toBeGreaterThan(0);
    expect(Array.from(e.harvestFactor)).toEqual(Array.from(f));
  }, 120_000);
});

describe('a city founded with the factor', () => {
  const base = city(1);
  for (const f of [0.21, 0.5, 1.86]) {
    const c = city(f), a = c.accounts as Record<string, any>, b = base.accounts as Record<string, any>;
    const p = c.parameters as Record<string, any>, q = base.parameters as Record<string, any>;
    it(`has, at ${f}, the value added and the output per employee of agriculture times the factor, and the other sectors as England`, () => {
      close(a.valueAdded[AGRICULTURE], f * b.valueAdded[AGRICULTURE]);
      close(p.alpha_s[AGRICULTURE], f * q.alpha_s[AGRICULTURE]);
      close(p.w_s[AGRICULTURE], f * q.w_s[AGRICULTURE]);
      for (const g of [1, 2]) { close(a.valueAdded[g], b.valueAdded[g]); close(p.alpha_s[g], q.alpha_s[g]); close(p.w_s[g], q.w_s[g]); }
      expect(p.I_s).toEqual(q.I_s); expect(c.initial_conditions.N_s).toEqual(base.initial_conditions.N_s);
      close(a.gdp, sum(a.valueAdded) + a.duty);
    });
    it(`has, at ${f}, households that buy as much food as England's, and balanced trade`, () => {
      close(a.households[AGRICULTURE], b.households[AGRICULTURE]);
      close(a.exports, a.imports);
      expect(Math.abs(a.gdpCheck)).toBeLessThan(1e-9 * a.gdp);
      for (const h of a.households) expect(h).toBeGreaterThan(0);
      if (f < 1) expect(a.imports).toBeGreaterThan(b.imports); // what the harvest lacks comes from the merchants
    });
  }
  it('is England\'s city at 1, number for number', () => {
    expect(city(1)).toEqual(calibrateEconomy(cityTable(table, 60862, 266)));
  });
  it('can be founded down to a factor of 0.05', () => { expect(() => city(0.05)).not.toThrow(); });
  it('refuses a factor that is not a positive number', () => { for (const f of [0, -1, NaN, Infinity]) expect(() => city(f)).toThrow(); });
});

describe('the trade in food', () => {
  it('imports what agriculture lacks and pays with industry and services in proportion to what the households buy', () => {
    const h = [10, 30, 10], m = [1, 1, 1], x = [2, 2, 0];
    tradeFood(18, h, m, x);
    expect(h).toEqual([18, 24, 8]); expect(m).toEqual([9, 1, 1]); expect(x).toEqual([2, 8, 2]);
  });
  it('exports what agriculture has over and imports industry and services with it', () => {
    const h = [20, 30, 10], m = [1, 1, 1], x = [2, 2, 0];
    tradeFood(12, h, m, x);
    expect(h).toEqual([12, 36, 12]); expect(m).toEqual([1, 7, 3]); expect(x).toEqual([10, 2, 0]);
  });
});

describe('a world', () => {
  it('founded with the factor has the hamlets, the people and the harvest of its founding', () => {
    const x = decodeState(encodeState(s));
    const harvest = Float64Array.from(x.place.harvest), hamlet = Uint8Array.from(x.family.cols.hamlet);
    expect(Array.from(harvestFactors(x, w))).toEqual(Array.from(x.economy.cities!.harvestFactor)); // a fixed point
    foundWithHarvest(x, w); // nothing to do
    expect(hashState(x)).toBe(hashState(s));
    expect(Array.from(x.place.harvest)).toEqual(Array.from(harvest)); expect(Array.from(x.family.cols.hamlet)).toEqual(Array.from(hamlet));
  });
  it('computes its cities with the factor, and their books balance', () => {
    const x = decodeState(encodeState(s));
    for (let d = 0; d < 40; d++) advanceDay(x, w);
    const e = x.economy.cities!;
    expect(e.halted).toBe('');
    for (let k = 0; k < e.places.length; k++) expect(Number.isFinite(e.figures[k * FIGURES + FIGURE.realGdp])).toBe(true);
    const ch = w.economyEngine.checks(e.model);
    for (const c of ch.cities) for (const v of [c.income, c.nominal, c.real, c.centralBank, c.banks]) expect(Math.abs(v)).toBeLessThan(1e-9 * c.gdpSum);
    for (const m of ch.merchants) if (m.scale > 0) expect(Math.abs(m.off)).toBeLessThan(1e-9 * m.scale);
  }, 60_000);
  it('of version 20 gets the factor by the upgrade: its economies are founded anew with it on the day reached', () => {
    const x = decodeState(encodeState(s));
    for (let d = 0; d < 5; d++) advanceDay(x, w);
    // a world of version 20: its economies founded without the factor, and five days computed
    const old = decodeState(encodeState(x)) as any;
    foundEconomy(old, w);
    for (let d = 0; d < 3; d++) advanceDay(old, w);
    delete old.economy.cities.harvestFactor; old.v = 20;
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(1356));
    expect(up.v).toBe(STATE_VERSION);
    const e = up.economy.cities!;
    expect(Array.from(e.harvestFactor)).toEqual(Array.from(harvestFactors(up, w)));
    expect(e.day).toBe(up.day); expect(e.years.length).toBe(0);
    for (let k = 0; k < e.places.length; k++) expect(e.figures[k * FIGURES + FIGURE.periods]).toBe(0);
    expect(Array.from(up.family.cols.hamlet)).toEqual(Array.from(old.family.cols.hamlet));
    advanceDay(up, w);
    expect(up.economy.cities!.halted).toBe('');
    expect(up.economy.cities!.figures[FIGURE.periods]).toBe(1);
  }, 60_000);
});
