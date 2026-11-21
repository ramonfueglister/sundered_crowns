// The economy engine (features 3 to 9, docs/ECONOMY_DESIGN.md): the port of BeforeIT.jl built to WebAssembly, against
// its native build (economy/examples/reference.rs). The calibration has tests/economy-calibration.test.ts, the
// economies in the world tests/economy-world.test.ts, the persons of the cities (feature 10)
// tests/economy-persons.test.ts. The shell around the port, the daily clock and the merchants have their own tests
// in economy/tests and economy/src (cargo test).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEconomy, loadEconomyEngine } from '../tools/sim/load';
import { ECONOMY_DIR } from '../tools/sim/build_economy';
import { cityCalibrations, readTable } from '../tools/sim/calibrate_economy';
import { calibrateEconomy, cityTable } from '../src/sim/economy/calibration';
import { dailyEconomy } from '../src/sim/economy/daily';
import { FIGURE, FIGURES, type CitySetup, type EconomyRules } from '../src/sim/economy/engine';
import { sum, bits, type PortJson } from './setup/economy_values';

describe('the economy engine (WebAssembly)', () => {
  const engine = loadEconomyEngine(),
    c = loadEconomy();
  // three cities, so that the tests of the engine are quick: London, Ghent and Cologne
  const THREE = ['London', 'Ghent', 'Cologne'].map((name) => c.cities.find((x) => x.name === name)!);
  const setups = (seed: number, cities = THREE): CitySetup[] =>
    cities.map((x, k) => ({
      parameters: JSON.stringify(x.parameters),
      initialConditions: JSON.stringify(x.initial_conditions),
      seed: seed + k,
    }));
  const CLOCK = c.clock,
    SAVINGS = c.savings_spent_per_year / c.periods_per_year,
    RULES: EconomyRules = { wage: c.wage, prices: c.prices, savings: SAVINGS, crown: c.crown, owner: c.owner },
    PORT: EconomyRules = { wage: 'prices', prices: 'costs', savings: 0, crown: 'series', owner: 'paper' };
  const create = (seed: number) => engine.create(setups(seed), CLOCK, RULES);
  const city = (f: Float64Array, k: number) => f.subarray(k * FIGURES, (k + 1) * FIGURES);

  it('computes bit for bit what the native build computes, day by day, with the clock of the port and with every rule', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sce-'));
    try {
      const files = THREE.flatMap((x, k) => {
        writeFileSync(join(dir, `p${k}.json`), JSON.stringify(x.parameters));
        writeFileSync(join(dir, `ic${k}.json`), JSON.stringify(x.initial_conditions));
        return [join(dir, `p${k}.json`), join(dir, `ic${k}.json`)];
      });
      // 65 days: every firm has planned three times. With a plan and a window of one period the clock is the port's.
      const ONE = { plan: 1, window: 1 };
      for (const [seed, clock, periods, rules] of [
        [1356, CLOCK, 65, RULES],
        [7, CLOCK, 65, RULES],
        [1356, CLOCK, 65, PORT],
        [1356, CLOCK, 65, { wage: 'money', prices: 'costs', savings: 0, crown: 'series', owner: 'paper' }],
        [1356, CLOCK, 65, { wage: 'prices', prices: 'demand', savings: 0, crown: 'series', owner: 'paper' }],
        [1356, CLOCK, 65, { ...RULES, savings: 0 }],
        [1356, CLOCK, 65, { ...RULES, crown: 'series' }],
        [1356, CLOCK, 65, { ...RULES, owner: 'paper' }],
        [1356, CLOCK, 65, { ...PORT, owner: 'household' }],
        [1356, ONE, 10, PORT],
        [1356, ONE, 10, RULES],
      ] as const) {
        const args = [
          String(periods),
          String(clock.plan),
          String(clock.window),
          rules.wage,
          rules.prices,
          String(rules.savings),
          rules.crown,
          rules.owner,
          ...THREE.flatMap((_, k) => [String(seed + k), files[2 * k], files[2 * k + 1]]),
        ];
        const native = execFileSync(join(ECONOMY_DIR, 'target/release/examples/reference'), args, { encoding: 'utf8' })
          .trim()
          .split('\n');
        expect(native.length).toBe(periods + 1);
        let state = engine.create(setups(seed), clock, rules);
        expect(bits(engine.figures(state))).toBe(native[0]);
        for (let t = 1; t <= periods; t++) {
          state = engine.step(state, 1);
          expect(bits(engine.figures(state))).toBe(native[t]);
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
  it('gives the same state for the same seeds and another for another seed, another clock or another rule', () => {
    const a = create(1356),
      b = create(1356),
      other = create(1357);
    expect(Buffer.compare(a, b)).toBe(0);
    expect(Buffer.compare(engine.step(a, 3), engine.step(b, 3))).toBe(0);
    expect(Buffer.compare(a, other)).not.toBe(0);
    expect(Buffer.compare(a, engine.create(setups(1356), { plan: 31, window: 365 }, RULES))).not.toBe(0);
    expect(RULES).toEqual({
      wage: 'money',
      prices: 'demand',
      savings: 0.4 / 365,
      crown: 'revenue',
      owner: 'household',
    });
    expect(Buffer.compare(a, engine.create(setups(1356), CLOCK, { ...RULES, wage: 'prices' }))).not.toBe(0);
    expect(Buffer.compare(a, engine.create(setups(1356), CLOCK, { ...RULES, prices: 'costs' }))).not.toBe(0);
    // households that spend out of their income only start from the same position and compute other days
    const port = engine.create(setups(1356), CLOCK, { ...RULES, savings: 0 });
    expect(Buffer.compare(a, port)).not.toBe(0);
    expect(bits(engine.figures(port))).toBe(bits(engine.figures(a)));
    expect(bits(engine.figures(engine.step(port, 40)))).not.toBe(bits(engine.figures(engine.step(a, 40))));
    expect(() => engine.create(setups(1356), CLOCK, { ...RULES, savings: 2 })).toThrow('share of the savings');
    // a crown that buys by the series of the paper computes the same first day (nothing was taken in before it) and
    // other days after it
    const series = engine.create(setups(1356), CLOCK, { ...RULES, crown: 'series' });
    expect(Buffer.compare(a, series)).not.toBe(0);
    expect(bits(engine.figures(engine.step(series, 1)))).toBe(bits(engine.figures(engine.step(a, 1))));
    expect(bits(engine.figures(engine.step(series, 40)))).not.toBe(bits(engine.figures(engine.step(a, 40))));
    expect(() => engine.create(setups(1356), CLOCK, { ...RULES, crown: 'war' as never })).toThrow(
      'way for the crown to buy',
    );
    // owners who are paid the paper's profit start from the same position and compute other days
    const paper = engine.create(setups(1356), CLOCK, { ...RULES, owner: 'paper' });
    expect(Buffer.compare(a, paper)).not.toBe(0);
    expect(bits(engine.figures(paper))).toBe(bits(engine.figures(a)));
    expect(bits(engine.figures(engine.step(paper, 40)))).not.toBe(bits(engine.figures(engine.step(a, 40))));
    expect(() => engine.create(setups(1356), CLOCK, { ...RULES, owner: 'guild' as never })).toThrow(
      'way for an owner to hold a firm',
    );
    // the seed of one city changes the others too, through the merchants
    const one = setups(1356);
    one[2] = { ...one[2], seed: 99 };
    const f = engine.figures(engine.step(engine.create(one, CLOCK, RULES), 5)),
      g = engine.figures(engine.step(a, 5));
    expect(bits(city(f, 0))).not.toBe(bits(city(g, 0)));
  });
  it('still computes cities that pay the benefit of the original code, as the game did from feature 6 to feature 8', () => {
    const table = readTable();
    table.cities.unemployment_benefit.value = 0.55;
    const paid = THREE.map((x, k): CitySetup => {
      const d = dailyEconomy(calibrateEconomy(cityTable(table, x.people, x.working)), 365, CLOCK.plan);
      expect((d.parameters as PortJson).theta_UB).toBeGreaterThan(0.5);
      return {
        parameters: JSON.stringify(d.parameters),
        initialConditions: JSON.stringify(d.initial_conditions),
        seed: 1356 + k,
      };
    });
    let state = engine.create(paid, CLOCK, RULES);
    expect(Buffer.compare(state, create(1356))).not.toBe(0); // another economy than the game's
    for (let t = 0; t < 40; t++) {
      state = engine.step(state, 1);
      const k = engine.checks(state);
      for (const x of k.cities)
        for (const v of [x.income, x.nominal, x.real, x.centralBank, x.banks])
          expect(Math.abs(v) / x.gdpSum).toBeLessThan(1e-9);
      for (const m of k.merchants) expect(Math.abs(m.off)).toBeLessThanOrEqual(1e-9 * m.scale);
    }
  }, 30_000);
  it('continues from a saved state as if it had never stopped, in the middle of a month', () => {
    const start = create(1356);
    let state = start;
    for (let t = 0; t < 45; t++) state = engine.step(Uint8Array.from(state), 1); // a copy each time: only the bytes carry over
    expect(Buffer.compare(state, engine.step(start, 45))).toBe(0);
    const f = engine.figures(state);
    expect(f.length).toBe(3 * FIGURES);
    for (let k = 0; k < 3; k++) expect(city(f, k)[FIGURE.periods]).toBe(45);
  }, 30_000);
  it('keeps the books: the identities of every city and the books of the merchants hold after every day', () => {
    let state = create(1356);
    for (let t = 0; t < 40; t++) {
      state = engine.step(state, 1);
      const k = engine.checks(state),
        f = engine.figures(state);
      expect(k.cities.length).toBe(3);
      k.cities.forEach((x, n) => {
        for (const v of [x.income, x.nominal, x.real, x.centralBank, x.banks])
          expect(Math.abs(v) / x.gdpSum).toBeLessThan(1e-9);
        const y = city(f, n);
        expect(y[FIGURE.employees] + y[FIGURE.owners] + y[FIGURE.unemployed]).toBe(
          (THREE[n].parameters as PortJson).H_act,
        );
      });
      // the worth of the merchants, then the goods of each of the three products
      expect(k.merchants.length).toBe(4);
      for (const m of k.merchants) expect(Math.abs(m.off)).toBeLessThanOrEqual(1e-9 * m.scale);
    }
  }, 30_000);
  it('trades: what the merchants buy in the cities they sell in the cities, at cost', () => {
    const f = engine.figures(engine.step(create(1356), 60));
    let sold = 0,
      bought = 0;
    for (let k = 0; k < 3; k++) {
      const y = city(f, k);
      expect(y[FIGURE.exports]).toBeGreaterThan(0);
      expect(y[FIGURE.imports]).toBeGreaterThan(0);
      // the starting position stands for the days before the start: 305 days of it are still in the sums
      bought += y[FIGURE.exports] - (305 / 365) * (THREE[k].initial_conditions as PortJson).C_E[75] * 365;
      sold += y[FIGURE.imports] - (305 / 365) * (THREE[k].initial_conditions as PortJson).Y_I[75] * 365;
    }
    expect(bought).toBeGreaterThan(0);
    expect(sold).toBeGreaterThan(0);
    expect(sold).toBeLessThanOrEqual(bought * 1.5); // they cannot sell much more than they bought and had at the start
  }, 30_000);
  it('starts every city at the GDP of its calibration, as the sum of 365 days', () => {
    const f = engine.figures(create(1356)),
      accounts = cityCalibrations(readTable());
    THREE.forEach((x, k) => {
      const y = city(f, k),
        a = accounts.find((q) => q.place === x.place)!.calibration.accounts as PortJson;
      expect(y[FIGURE.periods]).toBe(0);
      expect(y[FIGURE.realGdp]).toBeCloseTo(a.gdp, 3);
      expect(y[FIGURE.nominalGdp]).toBeCloseTo(a.gdp, 3);
      expect(y[FIGURE.realGdpStart]).toBe(y[FIGURE.realGdp]);
      expect(y[FIGURE.nominalGdpStart]).toBe(y[FIGURE.nominalGdp]);
      expect(y[FIGURE.priceLevel]).toBe(1);
      expect(y[FIGURE.depositsHouseholds] + y[FIGURE.depositsFirms]).toBeCloseTo(a.coin, 3);
    });
    expect(city(f, 0)[FIGURE.realGdp]).toBeCloseTo((45247.8 * 60862) / 2583180, 3); // London: its share of England's GDP at 1:100
  });
  it('moves a little every day: the sums of the last 365 days and the price level of today', () => {
    let state = create(1356);
    const start = engine.figures(state);
    const prices = new Set<number>(),
      gdp = new Set<number>();
    for (let t = 0; t < 40; t++) {
      state = engine.step(state, 1);
      const f = engine.figures(state);
      prices.add(f[FIGURE.priceLevel]);
      gdp.add(f[FIGURE.realGdp]);
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(city(f, k)[FIGURE.realGdp] / city(start, k)[FIGURE.realGdp] - 1)).toBeLessThan(0.03); // a day is 1/365 of the sum
        expect(Math.abs(city(f, k)[FIGURE.priceLevel] - 1)).toBeLessThan(0.05);
      }
    }
    expect(gdp.size).toBe(40);
    expect(prices.size).toBeGreaterThan(30);
  }, 30_000);
  it('refuses what is not a state, not a calibration, not a clock, not a rule or not cities, and keeps working', () => {
    expect(() => engine.step(new Uint8Array(10), 1)).toThrow(/economy engine/);
    expect(() => engine.figures(new Uint8Array(0))).toThrow(/economy engine/);
    const [a, b] = setups(1);
    expect(() => engine.create([a, { ...b, parameters: '{}' }], CLOCK, RULES)).toThrow(/economy engine: city 1: /);
    expect(() => engine.create([a], CLOCK, RULES)).toThrow(/economy engine: 1 city: trade needs two/);
    expect(() => engine.create([], CLOCK, RULES)).toThrow(/trade needs two/);
    expect(() => engine.create([a, { ...b, seed: -1 }], CLOCK, RULES)).toThrow();
    expect(() => engine.create([a, b], { plan: 0, window: 365 }, RULES)).toThrow();
    expect(() => engine.create([a, b], { plan: 30, window: 1.5 }, RULES)).toThrow();
    expect(() => engine.create([a, b], CLOCK, { ...RULES, wage: 'gold' as never })).toThrow(/not a way to pay wages/);
    expect(() => engine.create([a, b], CLOCK, { ...RULES, prices: 'stars' as never })).toThrow(
      /not a way to set prices/,
    );
    // parameters of the port that let only a part of the firms adjust do not go with the demand pull of the clock
    const calvo = { ...b, parameters: JSON.stringify({ ...JSON.parse(b.parameters), theta_calvo: 0.5 }) };
    expect(() => engine.create([a, calvo], CLOCK, RULES)).toThrow(/economy engine: city 1: theta_calvo = 0\.5/);
    expect(engine.figures(engine.create([a, calvo], CLOCK, { ...RULES, prices: 'costs' }))[FIGURE.periods]).toBe(0);
    expect(engine.figures(create(1))[FIGURE.periods]).toBe(0);
  });
  it('keeps a state it advanced without writing it, and gives the bytes step gives', () => {
    const start = create(1356),
      want = engine.step(start, 3);
    const k1 = engine.advance(start, 2),
      k2 = engine.advance(k1, 1);
    expect(engine.figures(k2)).toEqual(engine.figures(want));
    expect(engine.agents(k2)).toEqual(engine.agents(want));
    expect(Buffer.compare(k2.bytes(), want)).toBe(0);
    // another state computed in between: the bytes of one kept before are computed again from where it began
    const k3 = engine.advance(start, 3);
    engine.step(create(1), 1);
    expect(Buffer.compare(k3.bytes(), want)).toBe(0);
    expect(Buffer.compare(k1.bytes(), engine.step(start, 2))).toBe(0);
  });
  it('reports a rule of the port that fails, and starts afresh', () => {
    // a state in which a worker of the first city has an employer that does not exist: its labour market stops
    const p = THREE[0].parameters as PortJson,
      workers = p.H_act - sum(p.I_s) - 1;
    // (a copy: the engine takes an array it handed out itself as the state it keeps, which nobody changes)
    const state = engine.step(create(1356), 1).slice();
    // economy/src/state.rs: the header of the cities and the length of the first, then that city: its header, the
    // IDs and four amounts of every worker
    const employers = 16 + 69 + 36 * workers;
    const dv = new DataView(state.buffer, state.byteOffset, state.byteLength);
    expect(dv.getUint32(employers, true)).toBe(workers);
    dv.setUint32(employers + 4, 0x00ffffff, true);
    expect(() => engine.step(state, 1)).toThrow(
      /^the economy engine stopped: index out of bounds: .+ \(src\/markets\.rs:\d+\)$/,
    );
    expect(engine.figures(create(1356))[FIGURE.periods]).toBe(0); // a fresh instance answers
  });
});
