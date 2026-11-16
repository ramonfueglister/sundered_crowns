// Features 3 to 5 of the economy, the cities as economies of their own that trade with each other, computed every
// day by the port of BeforeIT.jl (docs/ECONOMY_DESIGN.md): the calibration of England, its turn into days and into
// cities, the engine against its native build, the system in the world, the snapshot, the upgrade of an older world
// and the view of a place. The shell around the port, the daily clock and the merchants have their own tests in
// economy/tests and economy/src (cargo test).
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newWorldState, loadWorld, loadSetup, loadEconomy, loadEconomyEngine, dataPath, countedInPeopleOfTheTime } from '../tools/sim/load';
import { ECONOMY_DIR } from '../tools/sim/build_economy';
import { calibrationJson, cityCalibrations, cityPlaces, dailyCalibration, readTable } from '../tools/sim/calibrate_economy';
import { calibrateEconomy, cityTable, dailyEconomy, unemploymentBenefit, ar1, roundHalfEven, type Entry } from '../tools/sim/economy_calibration';
import { FIGURE, FIGURES, type CitySetup, type EconomyEngine, type EconomyRules } from '../src/sim/economy/engine';
import { citySeed, computeTo, foundEconomy, yearRow } from '../src/sim/systems/economy';
import { cityPeopleByPlace } from '../src/sim/systems/people';
import { advanceDay } from '../src/sim/engine';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { STATE_VERSION, type WorldState } from '../src/sim/state';
import { placeDetail } from '../src/net/views';
import { World } from '../src/sim/world';
import { WorldCore, configFromEnv } from '../server/world';

const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
const days = (s: WorldState, w: World, n: number) => { for (let i = 0; i < n; i++) advanceDay(s, w); };
const bits = (v: Float64Array) => Array.from(new BigUint64Array(v.buffer, v.byteOffset, v.length), (x) => x.toString(16).padStart(16, '0')).join(' ');

describe("the calibration of England's economy (the year of the sources)", () => {
  const table = readTable(), c = calibrateEconomy(table);
  const a = c.accounts as Record<string, any>, p = c.parameters as Record<string, any>, ic = c.initial_conditions as Record<string, any>;

  it('names a source or says "assumption" for every input', () => {
    const entries = [table.scale, ...Object.values(table.inputs)] as Entry<unknown>[];
    for (const e of entries) {
      expect(['source', 'assumption']).toContain(e.kind);
      expect(e.source.length).toBeGreaterThan(10);
    }
    // the twelve gaps of the proposal (inputs and investment are two entries each) and the value of a cloth
    expect(entries.filter((e) => e.kind === 'assumption').length).toBe(15);
    // the daily clock: the length of the year is an assumption, the plan of a firm has a source
    expect(table.clock.days_per_year).toMatchObject({ value: 365, kind: 'assumption' });
    expect(table.clock.plan_days).toMatchObject({ value: 30, kind: 'source' });
    expect(table.clock.plan_days.source).toMatch(/Eurace@Unibi/);
  });
  it('starts from the GDP, the people and the coin of the sources at the scale 1:100', () => {
    expect(a.gdp).toBeCloseTo(45247.8, 6);
    expect(a.people).toBeCloseTo(25831.8, 6);
    expect(a.coin).toBeCloseTo(11066.5, 6);
    expect(a.revenue).toBeCloseTo(1055.44, 6);
    expect(a.exports).toBeCloseTo(0.01 * (32666.40 * 4.050 + 9061 * 1.751), 6);
    expect(a.duty).toBeCloseTo(0.01 * 32666.40 * 2, 6); // 40 shillings a sack
  });
  it('balances: GDP is what households, crown, investment and trade use, and what the sectors add plus the duty', () => {
    expect(Math.abs(a.gdpCheck)).toBeLessThan(1e-6);
    expect(sum(a.valueAdded) + a.duty).toBeCloseTo(a.gdp, 6);
    expect(sum(a.households)).toBeGreaterThan(0.8 * a.gdp);
  });
  it('gives every person of the labour force a place: employee, owner of a firm or of the bank, or without work', () => {
    expect(a.labourForce).toBe(roundHalfEven(25831.8 * 0.62 * (0.971 + 0.430) / 2));
    expect(p.H_act).toBe(sum(a.employees) + sum(p.I_s) + 1 + 1);
    expect(sum(a.employees) + sum(p.I_s)).toBeGreaterThanOrEqual(a.labourForce - 1); // rounding by sector
    expect(sum(a.employees) + sum(p.I_s)).toBeLessThanOrEqual(a.labourForce + 1);
    for (let g = 0; g < 3; g++) expect(a.employees[g]).toBeGreaterThanOrEqual(p.I_s[g]); // every firm has an employee
  });
  it("follows the port's formulas", () => {
    for (let g = 0; g < 3; g++) {
      expect(p.alpha_s[g]).toBeCloseTo(a.output[g] / a.employees[g], 9); // output per employee
      expect(p.w_s[g]).toBeCloseTo(a.wages[g] / a.employees[g], 9);
      expect(p.kappa_s[g]).toBeCloseTo(a.output[g] / a.capital[g] / 0.85, 9);
      expect(a.output[g] / (a.output[g] - a.valueAdded[g])).toBeCloseTo(p.beta_s[g], 9); // output per input
    }
    expect(p.tau_EXPORT).toBeCloseTo(a.duty / a.exports, 12);
    expect(p.tau_INC).toBeCloseTo(a.directTax / (sum(a.wages) + sum(a.valueAdded) - sum(a.wages) - 0.025 * sum(a.capital)), 12);
    expect(sum(p.b_HH_g)).toBeCloseTo(1, 12);
    expect(sum(p.c_E_g)).toBeCloseTo(1, 12);
    expect(ic.E_CB).toBeCloseTo(-(ic.D_I + ic.D_H + ic.E_k), 9); // the port's rule with no government debt and no loans
    for (const k of ['tau_VAT', 'tau_SIF', 'tau_SIW', 'tau_FIRM', 'tau_CF', 'tau_G', 'r_G', 'xi_pi', 'xi_gamma']) expect(p[k]).toBe(0);
    expect(p.rho).toBe(1); // no Taylor rule
    expect(ic.r_bar).toBe(0);
    expect(p.mu).toBe(0.075); // the loan rate
  });
  it('pays a person without work nothing: England had no such benefit', () => {
    expect(table.inputs.unemployment_benefit.value).toBe(0);
    expect(p.theta_UB).toBe(1e-9); // not 0: the port divides the starting wage by this rate
    expect(ic.w_UB).toBe(0);
  });
  it('hands over the history of 1281 to 1356 and nothing after it', () => {
    expect(p.T_prime).toBe(76);
    for (const k of ['Y', 'pi', 'C_G', 'C_E', 'Y_I']) expect(ic[k].length).toBe(76);
    expect(ic.Y[75]).toBeCloseTo(sum(a.output), 6); // the last year of the history is the start year
    expect(ic.C_G[75]).toBeCloseTo(a.crown, 9);
    expect(ic.C_E[75]).toBeCloseTo(a.exports, 9);
    expect(ic.Y[0] / ic.Y[75]).toBeCloseTo(3389.51 / 2686.02, 9); // real GDP of 1281 against 1356
    expect(ic.pi[0]).toBeCloseTo(Math.log(0.1249 / 0.132607), 9); // the deflator of 1281 against 1280
  });
  it('estimates an AR(1) by least squares', () => {
    const y = [1, 1.5, 1.75, 1.875, 1.9375]; // y_t = 0.5 · y_(t−1) + 1 exactly
    const e = ar1(y);
    expect(e.alpha).toBeCloseTo(0.5, 12); expect(e.beta).toBeCloseTo(1, 12); expect(e.sigma).toBeCloseTo(0, 12);
    expect(roundHalfEven(2.5)).toBe(2); expect(roundHalfEven(3.5)).toBe(4); expect(roundHalfEven(2.4)).toBe(2); expect(roundHalfEven(2.6)).toBe(3);
  });
});

describe('the calibration turned into days', () => {
  const table = readTable(), y = calibrateEconomy(table), d = dailyCalibration(table);
  const py = y.parameters as Record<string, any>, pd = d.parameters as Record<string, any>;
  const iy = y.initial_conditions as Record<string, any>, id = d.initial_conditions as Record<string, any>;
  const FLOWS = ['alpha_s', 'kappa_s', 'delta_s', 'w_s'], RULES = ['mu', 'theta', 'alpha_G', 'beta_G', 'sigma_G', 'alpha_E', 'beta_E', 'sigma_E', 'C'];
  const HISTORY = ['Y', 'pi', 'C_G', 'C_E', 'Y_I'];

  it('has a year of 365 days, a plan every 30 days and expectations on the last 365 days', () => {
    expect(y.periods_per_year).toBe(1); expect(y.clock).toEqual({ plan: 1, window: 1 });
    expect(d.periods_per_year).toBe(365); expect(d.clock).toEqual({ plan: 30, window: 365 });
    expect(d.accounts).toEqual(y.accounts); // the accounts of the year stay as the sources give them
  });
  it('spreads what flows in a year evenly over its days', () => {
    for (const k of FLOWS) for (let g = 0; g < 3; g++) expect(pd[k][g]).toBe(py[k][g] / 365);
    for (const k of HISTORY) {
      expect(id[k].length).toBe(76);
      for (let t = 0; t < 76; t++) expect(id[k][t]).toBe(iy[k][t] / 365);
    }
    expect(pd.T_prime).toBe(76);
    expect(365 * sum(pd.alpha_s.map((x: number, g: number) => x * (y.accounts as any).employees[g]))).toBeCloseTo(sum((y.accounts as any).output), 6);
  });
  it('leaves every share and every stock as it is', () => {
    for (const k of Object.keys(py)) if (!FLOWS.includes(k) && !RULES.includes(k)) expect(pd[k], k).toEqual(py[k]);
    for (const k of Object.keys(iy)) if (!HISTORY.includes(k)) expect(id[k], k).toEqual(iy[k]);
    expect(Object.keys(pd)).toEqual(Object.keys(py)); expect(Object.keys(id)).toEqual(Object.keys(iy));
  });
  it('compounds the interest of a day to the interest of the year', () => {
    expect(Math.pow(1 + pd.mu, 365)).toBeCloseTo(1.075, 12);
    expect(pd.theta).toBe(py.theta / 365);
  });
  it('keeps the memory of a year, the long-run mean and the spread of the crown and of the exports', () => {
    for (const s of ['G', 'E']) {
      const a = py[`alpha_${s}`], ad = pd[`alpha_${s}`];
      expect(Math.pow(ad, 365)).toBeCloseTo(a, 12);
      expect(pd[`beta_${s}`] / (1 - ad)).toBeCloseTo(py[`beta_${s}`] / (1 - a) - Math.log(365), 9); // the mean of the logarithm, a day is 1/365 of a year
      expect(pd[`sigma_${s}`] ** 2 / (1 - ad * ad)).toBeCloseTo(py[`sigma_${s}`] ** 2 / (1 - a * a), 12); // the variance in the long run
    }
    expect(pd.C[1][1]).toBe(pd.sigma_E ** 2);
  });
  it('refuses a calibration that is daily already, a rule without a long-run mean and a year of one day', () => {
    expect(() => dailyEconomy(d, 365, 30)).toThrow(/yearly/);
    expect(() => dailyEconomy({ ...y, parameters: { ...py, alpha_G: 1 } }, 365, 30)).toThrow(/long-run mean/);
    expect(() => dailyEconomy(y, 1, 30)).toThrow();
    expect(() => dailyEconomy(y, 365, 0)).toThrow();
  });
});

describe('the calibration of the cities', () => {
  const table = readTable(), cities = cityCalibrations(table), england = calibrateEconomy(table);
  const pe = england.parameters as Record<string, any>, ae = england.accounts as Record<string, any>;

  it('is the file the world server reads', () => {
    expect(readFileSync(dataPath('economy_cities.json'), 'utf8')).toBe(calibrationJson(table)); // else: npm run economy:calibrate
    const w = loadWorld();
    expect(w.cityEconomies.cities.length).toBe(cities.length);
    expect(w.cityEconomies).toMatchObject({ year: 1356, scale: 0.01, clock: { plan: 30, window: 365 }, rules: { wage: 'money', prices: 'demand' } });
    cities.forEach((c, k) => {
      expect(w.cityEconomies.cities[k]).toMatchObject({ place: c.place, people: c.people });
      expect(w.cityOf[c.place]).toBe(k);
      expect(JSON.parse(w.cityEconomies.cities[k].parameters)).toEqual(c.calibration.parameters);
    });
    expect(Array.from(w.cityOf).filter((k) => k >= 0).length).toBe(cities.length);
  });
  it('has one economy for every place with one of the 30 largest cities, with the people of its cities', () => {
    const byPlace = cityPeopleByPlace();
    expect(cities.length).toBe(byPlace.size);
    expect(cities.length).toBe(29); // two cities of the list lie in one place
    for (const c of cities) expect(c.people).toBe(byPlace.get(c.place));
    expect(cityPlaces().map((c) => c.place)).toEqual([...byPlace.keys()]);
    expect(cities.find((c) => c.name === 'Texcoco')!.people).toBe(68800 + 54000);
    expect(cities[0]).toMatchObject({ name: 'Cairo', people: 351200 });
  });
  it('says that the structure of a city, the duty between cities and the benefit of a person without work are assumptions', () => {
    for (const e of [table.cities.structure, table.cities.duty_shillings_per_sack, table.cities.unemployment_benefit] as Entry<unknown>[]) {
      expect(e.kind).toBe('assumption');
      expect(e.source.length).toBeGreaterThan(10);
    }
    expect(table.cities.duty_shillings_per_sack.value).toBe(0);
    // no benefit since feature 9; the entry still names the rate the cities had from feature 6 to feature 8
    expect(table.cities.unemployment_benefit.value).toBe(0);
    expect(table.cities.unemployment_benefit.source).toMatch(/0\.55 \* \(1 - tau_INC\) \* \(1 - tau_SIW\)/);
    expect(table.cities.unemployment_benefit.source).toMatch(/economy feature 9/);
    expect(table.cities.unemployment_benefit.source).toMatch(/general knowledge, not a table/);
  });
  it("computes the benefit of a person without work by the original code's rule, and none for a rate of 0", () => {
    const b = unemploymentBenefit(0.55, 0.2, 0.1, 10);
    expect(b.theta_UB).toBeCloseTo(0.55 * 0.8 * 0.9, 15); // the part of the wage after tax
    expect(b.w_UB).toBeCloseTo(0.55 * 0.8 * 0.9 * 10, 12); // the benefit on the mean wage
    expect(b.w_UB / b.theta_UB).toBeCloseTo(10, 12); // the port starts every person with this last wage
    expect(unemploymentBenefit(0, 0.2, 0.1, 10)).toEqual({ theta_UB: 1e-9, w_UB: 0 });
    for (const rate of [-0.1, 1, NaN]) expect(() => unemploymentBenefit(rate, 0.2, 0.1, 10)).toThrow(/unemployment benefit/);
  });
  it('pays a person without work nothing in any city, and still computes the benefit of the original code when the table asks for it', () => {
    const withBenefit = structuredClone(table);
    withBenefit.cities.unemployment_benefit.value = 0.55;
    for (const c of cities) {
      // the game (feature 9): the rate is switched off and nobody starts with a benefit
      const po = c.calibration.parameters as Record<string, any>, io = c.calibration.initial_conditions as Record<string, any>;
      const a = c.calibration.accounts as Record<string, any>;
      expect(po.theta_UB).toBe(1e-9); // not 0: the port divides the starting wage by this rate
      expect(io.w_UB).toBe(0); expect(io.sb_other).toBe(0); expect(io.sb_inact).toBe(0);
      // the same city with the rate of feature 6: 55 % of the last wage after tax, from the first day
      const on = dailyEconomy(calibrateEconomy(cityTable(withBenefit, c.people)), 365, 30);
      const p = on.parameters as Record<string, any>, ic = on.initial_conditions as Record<string, any>;
      expect(p.theta_UB).toBeCloseTo(0.55 * (1 - p.tau_INC) * (1 - p.tau_SIW), 15);
      expect(p.theta_UB).toBeGreaterThan(0.5); expect(p.theta_UB).toBeLessThan(0.55);
      // the benefit of a day at the start: on the mean wage of an employee of the city on a day
      const meanWage = sum(p.w_s.map((w: number, g: number) => w * ic.N_s[g])) / sum(ic.N_s);
      expect(ic.w_UB).toBeCloseTo(p.theta_UB * meanWage, 15);
      expect(ic.w_UB * 365).toBeCloseTo(p.theta_UB * sum(a.wages) / sum(a.employees), 12);
      // the same city as a year: the benefit of a day is a 365th of the benefit of the year
      const year = calibrateEconomy(cityTable(withBenefit, c.people));
      expect(ic.w_UB).toBe((year.initial_conditions as any).w_UB / 365);
      expect(p.theta_UB).toBe((year.parameters as any).theta_UB);
      // Between the two: with the benefit households spend from an income that includes the benefit of the one
      // person without work at the start (the original's calibration), so they buy at the start what the accounts
      // say. Nothing else differs.
      expect(on.accounts).toEqual(c.calibration.accounts);
      expect(sum(a.households) / p.psi).toBeCloseTo(sum(a.households) / po.psi + ic.w_UB * 365, 9);
      expect(a.building / p.psi_H).toBeCloseTo(sum(a.households) / p.psi, 9);
      expect(a.building / po.psi_H).toBeCloseTo(sum(a.households) / po.psi, 9);
      expect(p.psi / po.psi).toBeGreaterThan(0.995); // the benefit of one person is a small part of the city's income
      expect(p.psi).toBeLessThan(po.psi);
      for (const k of Object.keys(p)) if (!['theta_UB', 'psi', 'psi_H'].includes(k)) expect(p[k], k).toEqual(po[k]);
      for (const k of Object.keys(ic)) if (k !== 'w_UB') expect(ic[k], k).toEqual(io[k]);
    }
  });
  it('gives a city the economy of England at its share of the people, without a duty', () => {
    const englandPeople = table.inputs.population_thousand.value * 1e3;
    for (const c of cities) {
      const share = c.people / englandPeople;
      const p = c.calibration.parameters as Record<string, any>, a = c.calibration.accounts as Record<string, any>;
      expect(c.calibration.scale).toBeCloseTo(0.01 * share, 15);
      expect(a.people).toBeCloseTo(c.people / 100, 6); // the model computes the city at 1:100
      expect(a.gdp / ae.gdp).toBeCloseTo(share, 12);
      expect(a.coin / ae.coin).toBeCloseTo(share, 12);
      expect(a.duty).toBe(0); expect(p.tau_EXPORT).toBe(0);
      expect(a.directTax).toBeCloseTo(a.revenue, 9); // the crown of a city takes all its revenue as a direct tax
      expect(a.imports).toBeCloseTo(a.exports, 9); // what a city sells to the others it buys from them
      expect(Math.abs(a.gdpCheck)).toBeLessThan(1e-6);
      for (let g = 0; g < 3; g++) { expect(p.I_s[g]).toBeGreaterThanOrEqual(1); expect(a.employees[g]).toBeGreaterThanOrEqual(p.I_s[g]); }
      // what does not depend on the size is England's
      for (const k of ['G', 'T_prime', 'beta_s', 'theta', 'zeta', 'zeta_LTV', 'zeta_b', 'mu', 'c_E_g', 'c_I_g', 'c_G_g', 'b_CF_g', 'b_CFH_g', 'a_sg', 'alpha_G', 'alpha_E']) {
        if (k === 'mu') expect(Math.pow(1 + p.mu, 365)).toBeCloseTo(1 + pe.mu, 12); else if (k === 'theta') expect(p.theta * 365).toBeCloseTo(pe.theta, 12);
        else if (k === 'alpha_G' || k === 'alpha_E') expect(Math.pow(p[k], 365)).toBeCloseTo(pe[k], 12);
        else if (k === 'c_E_g') for (let g = 0; g < 3; g++) expect(p.c_E_g[g]).toBeCloseTo(pe.c_E_g[g], 12); // a quotient of scaled amounts
        else expect(p[k], k).toEqual(pe[k]);
      }
      expect(c.calibration.clock).toEqual({ plan: 30, window: 365 });
    }
    // the largest city is a seventh of England, the smallest a fiftieth
    expect(cities[0].people / englandPeople).toBeCloseTo(0.136, 3);
    expect(Math.min(...cities.map((c) => c.people))).toBe(50000);
  });
  it('leaves the table of England as it is, and refuses a city without people', () => {
    const before = JSON.stringify(table);
    const t = cityTable(table, 60862);
    expect(JSON.stringify(table)).toBe(before);
    expect(t.inputs.wool_export.value.duty_shillings_per_sack).toBe(0);
    expect(t.inputs.wool_export.value.sacks).toBe(table.inputs.wool_export.value.sacks);
    expect(t.inputs.unemployment_benefit).toEqual(table.cities.unemployment_benefit);
    expect(table.inputs.unemployment_benefit.value).toBe(0);
    expect(() => cityTable(table, 0)).toThrow(/city of 0 people/);
  });
  it('says that the wage in money is an assumption, with the paper it is taken from and what is ours', () => {
    const e = table.cities.wage;
    expect(e).toMatchObject({ value: 'money', kind: 'assumption' });
    expect(e.source).toMatch(/Assenza, Delli Gatti, Grazzini \(2015\).+CESifo Working Paper 4765, table 2/);
    expect(e.source).toMatch(/firms\.jl, lines 120 to 127 and 221/); // the rule of the original it replaces
    expect(e.source).toMatch(/is ours, not the papers'/);
    expect(JSON.parse(calibrationJson(table)).wage).toBe('money');
    // the wage is no number of a city's calibration: the parameters of the port are what they were
    const other = structuredClone(table); other.cities.wage.value = 'prices';
    expect(JSON.parse(calibrationJson(other)).wage).toBe('prices');
    expect(calibrationJson(other).replace('"wage": "prices"', '"wage": "money"')).toBe(calibrationJson(table));
  });
  it('says that the demand pull is an assumption, with the paper and the code it is taken from and what is ours', () => {
    const e = table.cities.prices;
    expect(e).toMatchObject({ value: 'demand', kind: 'assumption' });
    expect(e.source).toMatch(/Bank of Canada Staff Working Paper 2022-51, section 3\.2\.4, equations 34 to 37/);
    expect(e.source).toMatch(/init_CANVAS\.jl, lines 45 to 75/);
    expect(e.source).toMatch(/What is ours: a firm applies it on its plan day/);
    expect(JSON.parse(calibrationJson(table)).prices).toBe('demand');
    const other = structuredClone(table); other.cities.prices.value = 'costs';
    expect(calibrationJson(other).replace('"prices": "costs"', '"prices": "demand"')).toBe(calibrationJson(table));
  });
});

describe('the economy engine (WebAssembly)', () => {
  const engine = loadEconomyEngine(), c = loadEconomy();
  // three cities, so that the tests of the engine are quick: London, Ghent and Cologne
  const THREE = ['London', 'Ghent', 'Cologne'].map((name) => c.cities.find((x) => x.name === name)!);
  const setups = (seed: number, cities = THREE): CitySetup[] =>
    cities.map((x, k) => ({ parameters: JSON.stringify(x.parameters), initialConditions: JSON.stringify(x.initial_conditions), seed: seed + k }));
  const CLOCK = c.clock, RULES: EconomyRules = { wage: c.wage, prices: c.prices }, PORT: EconomyRules = { wage: 'prices', prices: 'costs' };
  const create = (seed: number) => engine.create(setups(seed), CLOCK, RULES);
  const city = (f: Float64Array, k: number) => f.subarray(k * FIGURES, (k + 1) * FIGURES);

  it('computes bit for bit what the native build computes, day by day, with the clock of the port and with every rule', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sce-'));
    try {
      const files = THREE.flatMap((x, k) => {
        writeFileSync(join(dir, `p${k}.json`), JSON.stringify(x.parameters)); writeFileSync(join(dir, `ic${k}.json`), JSON.stringify(x.initial_conditions));
        return [join(dir, `p${k}.json`), join(dir, `ic${k}.json`)];
      });
      // 65 days: every firm has planned three times. With a plan and a window of one period the clock is the port's.
      const ONE = { plan: 1, window: 1 };
      for (const [seed, clock, periods, rules] of [
        [1356, CLOCK, 65, RULES], [7, CLOCK, 65, RULES], [1356, CLOCK, 65, PORT], [1356, CLOCK, 65, { wage: 'money', prices: 'costs' }], [1356, CLOCK, 65, { wage: 'prices', prices: 'demand' }],
        [1356, ONE, 10, PORT], [1356, ONE, 10, RULES],
      ] as const) {
        const args = [String(periods), String(clock.plan), String(clock.window), rules.wage, rules.prices, ...THREE.flatMap((_, k) => [String(seed + k), files[2 * k], files[2 * k + 1]])];
        const native = execFileSync(join(ECONOMY_DIR, 'target/release/examples/reference'), args, { encoding: 'utf8' }).trim().split('\n');
        expect(native.length).toBe(periods + 1);
        let state = engine.create(setups(seed), clock, rules);
        expect(bits(engine.figures(state))).toBe(native[0]);
        for (let t = 1; t <= periods; t++) { state = engine.step(state, 1); expect(bits(engine.figures(state))).toBe(native[t]); }
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);
  it('gives the same state for the same seeds and another for another seed, another clock or another rule', () => {
    const a = create(1356), b = create(1356), other = create(1357);
    expect(Buffer.compare(a, b)).toBe(0);
    expect(Buffer.compare(engine.step(a, 3), engine.step(b, 3))).toBe(0);
    expect(Buffer.compare(a, other)).not.toBe(0);
    expect(Buffer.compare(a, engine.create(setups(1356), { plan: 31, window: 365 }, RULES))).not.toBe(0);
    expect(RULES).toEqual({ wage: 'money', prices: 'demand' });
    expect(Buffer.compare(a, engine.create(setups(1356), CLOCK, { ...RULES, wage: 'prices' }))).not.toBe(0);
    expect(Buffer.compare(a, engine.create(setups(1356), CLOCK, { ...RULES, prices: 'costs' }))).not.toBe(0);
    // the seed of one city changes the others too, through the merchants
    const one = setups(1356); one[2] = { ...one[2], seed: 99 };
    const f = engine.figures(engine.step(engine.create(one, CLOCK, RULES), 5)), g = engine.figures(engine.step(a, 5));
    expect(bits(city(f, 0))).not.toBe(bits(city(g, 0)));
  });
  it('still computes cities that pay the benefit of the original code, as the game did from feature 6 to feature 8', () => {
    const table = readTable();
    table.cities.unemployment_benefit.value = 0.55;
    const paid = THREE.map((x, k): CitySetup => {
      const d = dailyEconomy(calibrateEconomy(cityTable(table, x.people)), 365, CLOCK.plan);
      expect((d.parameters as any).theta_UB).toBeGreaterThan(0.5);
      return { parameters: JSON.stringify(d.parameters), initialConditions: JSON.stringify(d.initial_conditions), seed: 1356 + k };
    });
    let state = engine.create(paid, CLOCK, RULES);
    expect(Buffer.compare(state, create(1356))).not.toBe(0); // another economy than the game's
    for (let t = 0; t < 40; t++) {
      state = engine.step(state, 1);
      const k = engine.checks(state);
      for (const x of k.cities) for (const v of [x.income, x.nominal, x.real, x.centralBank, x.banks]) expect(Math.abs(v) / x.gdpSum).toBeLessThan(1e-9);
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
      const k = engine.checks(state), f = engine.figures(state);
      expect(k.cities.length).toBe(3);
      k.cities.forEach((x, n) => {
        for (const v of [x.income, x.nominal, x.real, x.centralBank, x.banks]) expect(Math.abs(v) / x.gdpSum).toBeLessThan(1e-9);
        const y = city(f, n);
        expect(y[FIGURE.employees] + y[FIGURE.owners] + y[FIGURE.unemployed]).toBe((THREE[n].parameters as any).H_act);
      });
      // the worth of the merchants, then the goods of each of the three products
      expect(k.merchants.length).toBe(4);
      for (const m of k.merchants) expect(Math.abs(m.off)).toBeLessThanOrEqual(1e-9 * m.scale);
    }
  }, 30_000);
  it('trades: what the merchants buy in the cities they sell in the cities, at cost', () => {
    const f = engine.figures(engine.step(create(1356), 60));
    let sold = 0, bought = 0;
    for (let k = 0; k < 3; k++) {
      const y = city(f, k);
      expect(y[FIGURE.exports]).toBeGreaterThan(0); expect(y[FIGURE.imports]).toBeGreaterThan(0);
      // the starting position stands for the days before the start: 305 days of it are still in the sums
      bought += y[FIGURE.exports] - 305 / 365 * (THREE[k].initial_conditions as any).C_E[75] * 365;
      sold += y[FIGURE.imports] - 305 / 365 * (THREE[k].initial_conditions as any).Y_I[75] * 365;
    }
    expect(bought).toBeGreaterThan(0); expect(sold).toBeGreaterThan(0);
    expect(sold).toBeLessThanOrEqual(bought * 1.5); // they cannot sell much more than they bought and had at the start
  }, 30_000);
  it('starts every city at the GDP of its calibration, as the sum of 365 days', () => {
    const f = engine.figures(create(1356)), accounts = cityCalibrations(readTable());
    THREE.forEach((x, k) => {
      const y = city(f, k), a = accounts.find((q) => q.place === x.place)!.calibration.accounts as Record<string, any>;
      expect(y[FIGURE.periods]).toBe(0);
      expect(y[FIGURE.realGdp]).toBeCloseTo(a.gdp, 3);
      expect(y[FIGURE.nominalGdp]).toBeCloseTo(a.gdp, 3);
      expect(y[FIGURE.realGdpStart]).toBe(y[FIGURE.realGdp]); expect(y[FIGURE.nominalGdpStart]).toBe(y[FIGURE.nominalGdp]);
      expect(y[FIGURE.priceLevel]).toBe(1);
      expect(y[FIGURE.depositsHouseholds] + y[FIGURE.depositsFirms]).toBeCloseTo(a.coin, 3);
    });
    expect(city(f, 0)[FIGURE.realGdp]).toBeCloseTo(45247.8 * 60862 / 2583180, 3); // London: its share of England's GDP at 1:100
  });
  it('moves a little every day: the sums of the last 365 days and the price level of today', () => {
    let state = create(1356);
    const start = engine.figures(state);
    const prices = new Set<number>(), gdp = new Set<number>();
    for (let t = 0; t < 40; t++) {
      state = engine.step(state, 1);
      const f = engine.figures(state);
      prices.add(f[FIGURE.priceLevel]); gdp.add(f[FIGURE.realGdp]);
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
    expect(() => engine.create([a, b], CLOCK, { ...RULES, wage: 'gold' as any })).toThrow(/not a way to pay wages/);
    expect(() => engine.create([a, b], CLOCK, { ...RULES, prices: 'stars' as any })).toThrow(/not a way to set prices/);
    // parameters of the port that let only a part of the firms adjust do not go with the demand pull of the clock
    const calvo = { ...b, parameters: JSON.stringify({ ...JSON.parse(b.parameters), theta_calvo: 0.5 }) };
    expect(() => engine.create([a, calvo], CLOCK, RULES)).toThrow(/economy engine: city 1: theta_calvo = 0\.5/);
    expect(engine.figures(engine.create([a, calvo], CLOCK, { ...RULES, prices: 'costs' }))[FIGURE.periods]).toBe(0);
    expect(engine.figures(create(1))[FIGURE.periods]).toBe(0);
  });
  it('reports a rule of the port that fails, and starts afresh', () => {
    // a state in which a worker of the first city has an employer that does not exist: its labour market stops
    const p = THREE[0].parameters as any, workers = p.H_act - sum(p.I_s) - 1;
    const state = engine.step(create(1356), 1);
    // economy/src/state.rs: the header of the cities and the length of the first, then that city: its header, the
    // IDs and four amounts of every worker
    const employers = 16 + 69 + 36 * workers;
    const dv = new DataView(state.buffer, state.byteOffset, state.byteLength);
    expect(dv.getUint32(employers, true)).toBe(workers);
    dv.setUint32(employers + 4, 0x00ffffff, true);
    expect(() => engine.step(state, 1)).toThrow(/^the economy engine stopped: index out of bounds: .+ \(src\/markets\.rs:\d+\)$/);
    expect(engine.figures(create(1356))[FIGURE.periods]).toBe(0); // a fresh instance answers
  });
});

describe('the economies of the cities in the world', () => {
  // one world that runs 400 days, day by day (1356 is a leap year: day 365 is 31 December, day 366 is 1 January 1357)
  const run = newWorldState();
  const N = run.w.cityEconomies.cities.length;
  const at: Record<number, { hash: string; state: Uint8Array; figures: Float64Array; model: number }> = {};
  beforeAll(() => {
    for (let d = 1; d <= 400; d++) {
      advanceDay(run.s, run.w);
      if ([45, 75, 365, 366, 367].includes(d)) at[d] = { hash: hashState(run.s), state: encodeState(run.s), figures: run.s.economy.cities!.figures.slice(), model: run.s.economy.cities!.model.length };
    }
  }, 180_000);

  it('are founded with the world: the starting position of every city, from the seed of the world', () => {
    const { s, w } = newWorldState();
    const e = s.economy.cities!, c = w.cityEconomies;
    expect(s.v).toBe(STATE_VERSION);
    expect(e.day).toBe(0); expect(e.halted).toBe(''); expect(e.years.length).toBe(0);
    expect(e.figures.length).toBe(N * FIGURES);
    for (let k = 0; k < N; k++) expect(e.figures[k * FIGURES + FIGURE.periods]).toBe(0);
    const setups = c.cities.map((x) => ({ parameters: x.parameters, initialConditions: x.initialConditions, seed: citySeed(s.seed, x.place) }));
    expect(Buffer.compare(e.model, w.economyEngine.create(setups, c.clock, c.rules))).toBe(0);
    expect(hashState(newWorldState(1357).s)).not.toBe(hashState(s));
  });
  it('give every city random numbers of its own, from the seed of the world and its place', () => {
    const seeds = run.w.cityEconomies.cities.map((x) => citySeed(1356, x.place));
    expect(new Set(seeds).size).toBe(N);
    for (const x of seeds) expect(Number.isSafeInteger(x) && x >= 0).toBe(true);
    expect(citySeed(1356, 4)).toBe(citySeed(1356, 4));
    expect(citySeed(1357, 4)).not.toBe(citySeed(1356, 4));
    expect(citySeed(1357, 4)).not.toBe(citySeed(1356, 5)); // the next world is not this world moved by a place
  });
  it('compute one period every day', () => {
    const { s, w } = newWorldState();
    const start = s.economy.cities!.model;
    advanceDay(s, w);
    const e = s.economy.cities!, first = e.figures;
    expect(e.day).toBe(1); expect(first[FIGURE.periods]).toBe(1);
    expect(Buffer.compare(e.model, w.economyEngine.step(start, 1))).toBe(0);
    days(s, w, 2);
    expect(e.day).toBe(3);
    for (let k = 0; k < N; k++) {
      expect(e.figures[k * FIGURES + FIGURE.periods]).toBe(3);
      expect(e.figures[k * FIGURES + FIGURE.realGdp]).not.toBe(first[k * FIGURES + FIGURE.realGdp]);
    }
    expect(Buffer.compare(e.model, w.economyEngine.step(start, 3))).toBe(0);
    expect(e.years.length).toBe(0);
  });
  it('keep the figures of a year that has ended, and the days of the last 365 days only', () => {
    const e = run.s.economy.cities!;
    expect(e.day).toBe(400); expect(e.halted).toBe('');
    expect(e.figures[FIGURE.periods]).toBe(400);
    // the row of 1356 was written before 1 January 1357 was computed: the figures of all cities on 31 December
    expect(e.years.length).toBe(yearRow(N));
    expect(yearRow(N)).toBe(1 + N * FIGURES);
    expect(e.years[0]).toBe(1356);
    expect(bits(e.years.slice(1))).toBe(bits(at[365].figures));
    // from the 366th day on the accounts hold 365 days: a day adds only its GDP and its inflation to the history
    // of every city
    expect(at[367].model - at[366].model).toBe(N * 16);
    expect(e.model.length - at[367].model).toBe(33 * N * 16);
  });
  it('keep the books of every city and of the merchants after a year of the world', () => {
    const k = run.w.economyEngine.checks(run.s.economy.cities!.model);
    expect(k.cities.length).toBe(N);
    for (const x of k.cities) for (const v of [x.income, x.nominal, x.real, x.centralBank, x.banks]) expect(Math.abs(v) / x.gdpSum).toBeLessThan(1e-9);
    for (const m of k.merchants) expect(Math.abs(m.off)).toBeLessThanOrEqual(1e-9 * m.scale);
    // every city has sold to the merchants and bought from them
    const f = run.s.economy.cities!.figures;
    for (let c = 0; c < N; c++) { expect(f[c * FIGURES + FIGURE.exports]).toBeGreaterThan(0); expect(f[c * FIGURES + FIGURE.imports]).toBeGreaterThan(0); }
  });
  it('sell to the merchants about the same share of their output, the largest city as the smallest', () => {
    // the merchants pick among the firms of the other cities, so a city counts by its firms; were every city one
    // seller among 29, Cairo would export less than half of what the smallest cities do, measured by output
    const f = at[365].figures, share = Array.from({ length: N }, (_, c) => f[c * FIGURES + FIGURE.exports] / f[c * FIGURES + FIGURE.realGdp]);
    const people = run.w.cityEconomies.cities.map((c) => c.people), largest = people.indexOf(Math.max(...people));
    expect(run.w.names[run.w.cityEconomies.cities[largest].place]).toBe('Cairo');
    expect(Math.max(...share) / Math.min(...share)).toBeLessThan(1.4);
    expect(share[largest]).toBeGreaterThan(0.75 * Math.max(...share));
  });
  it('give for many days at once what the same days give one by one', () => {
    const { s, w } = newWorldState();
    computeTo(s, w, 400); s.day = 400;
    expect(s.economy.cities!.years.length).toBe(yearRow(N));
    expect(Buffer.compare(s.economy.cities!.model, run.s.economy.cities!.model)).toBe(0);
    expect(bits(s.economy.cities!.years)).toBe(bits(run.s.economy.cities!.years));
    expect(bits(s.economy.cities!.figures)).toBe(bits(run.s.economy.cities!.figures));
  }, 120_000);
  it('are in the snapshot and in its hash: save in the middle of a month, load and go on equals going straight on', () => {
    const loaded = decodeState(at[45].state);
    expect(loaded.economy.cities!.model).toBeInstanceOf(Uint8Array);
    expect(loaded.economy.cities!.day).toBe(45);
    expect(hashState(loaded)).toBe(at[45].hash);
    days(loaded, run.w, 30);
    expect(hashState(loaded)).toBe(at[75].hash);
    // a year later: the rows of the years come back as they were
    const later = decodeState(encodeState(run.s));
    expect(later.economy.cities!.years).toBeInstanceOf(Float64Array);
    expect(hashState(later)).toBe(hashState(run.s));
    // the hash sees the economies
    const before = hashState(loaded);
    loaded.economy.cities!.model[loaded.economy.cities!.model.length - 1] ^= 1;
    expect(hashState(loaded)).not.toBe(before);
  }, 30_000);
  it('do not exist in a world that starts in another year', () => {
    const { s, w } = newWorldState(1492, 1492);
    expect(s.economy.cities).toBeNull();
    days(s, w, 400);
    expect(s.economy.cities).toBeNull();
    expect(placeDetail(s, w, w.cityEconomies.cities[0].place)!.cityEconomy).toBeUndefined();
  });
  it('are founded in a world that starts in 1291 too, which takes the tables of 1356 as placeholders', () => {
    const { s, w } = newWorldState(1291, 1291);
    const e = s.economy.cities!;
    expect(s.startYear).toBe(1291);
    expect(e.day).toBe(0); expect(e.halted).toBe('');
    expect(e.figures.length).toBe(N * FIGURES);
    days(s, w, 35); // past the first plan of every firm
    expect(e.day).toBe(35); expect(e.halted).toBe('');
    for (let k = 0; k < N; k++) expect(e.figures[k * FIGURES + FIGURE.periods]).toBe(35);
    const c = w.economyEngine.checks(e.model);
    for (const x of c.cities) for (const v of [x.income, x.nominal, x.real, x.centralBank, x.banks]) expect(Math.abs(v) / x.gdpSum).toBeLessThan(1e-9);
    expect(placeDetail(s, w, w.cityEconomies.cities[0].place)!.cityEconomy).toBeDefined();
  }, 30_000);
  it('stand still when the engine cannot compute a day, and the world goes on', () => {
    const real = loadWorld();
    let calls = 0;
    const broken: EconomyEngine = { ...real.economyEngine, step: () => { calls++; throw new Error('the economy engine stopped: a rule failed'); } };
    const w: World = Object.assign(Object.create(World.prototype), real, { economyEngine: broken });
    const { s } = newWorldState();
    const before = s.economy.cities!.model;
    advanceDay(s, w);
    const e = s.economy.cities!;
    expect(e.halted).toBe('2 January 1356: the economy engine stopped: a rule failed');
    expect(e.day).toBe(0); expect(e.model).toBe(before);
    days(s, w, 400); // the next days do not try again
    expect(calls).toBe(1);
    expect(s.day).toBe(401);
    expect(e.years.length).toBe(0); // a year that was not computed has no row
    expect(placeDetail(s, real, real.cityEconomies.cities[0].place)!.cityEconomy!.halted).toBe(e.halted);
    computeTo(s, real, 401); // not even with a working engine: halted economies stay as they were
    expect(s.economy.cities!.day).toBe(0);
  });
  it('stop on the day that fails when many days are computed at once', () => {
    const real = loadWorld();
    let single = 0;
    const broken: EconomyEngine = {
      ...real.economyEngine,
      step: (m, n) => { if (n > 1 || ++single > 3) throw new Error('the economy engine stopped: a rule failed'); return real.economyEngine.step(m, n); },
    };
    const w: World = Object.assign(Object.create(World.prototype), real, { economyEngine: broken });
    const { s } = newWorldState();
    computeTo(s, w, 10);
    const e = s.economy.cities!;
    expect(e.day).toBe(3); expect(e.figures[FIGURE.periods]).toBe(3);
    expect(e.halted).toBe('5 January 1356: the economy engine stopped: a rule failed');
    expect(Buffer.compare(e.model, real.economyEngine.step(newWorldState().s.economy.cities!.model, 3))).toBe(0);
  });
  it('stand still when a day ends without a GDP in one city', () => {
    const real = loadWorld();
    const last = (N - 1) * FIGURES + FIGURE.realGdp;
    const broken: EconomyEngine = { ...real.economyEngine, figures: (m) => real.economyEngine.figures(m).fill(NaN, last, last + 1) };
    const w: World = Object.assign(Object.create(World.prototype), real, { economyEngine: broken });
    const { s } = newWorldState();
    const before = s.economy.cities!.model;
    days(s, w, 2);
    expect(s.economy.cities!.halted).toBe('2 January 1356: the day ended without a GDP (not a number)');
    expect(s.economy.cities!.model).toBe(before);
  });

  describe('in a world saved by an older build', () => {
    it('are founded when a world from before the economy is loaded', () => {
      const { s, w } = newWorldState();
      const old = countedInPeopleOfTheTime(decodeState(encodeState(s)) as any); delete old.economy; old.v = 3;
      const loaded = decodeState(encodeState(old));
      expect(loaded.v).toBe(3); expect((loaded as any).economy).toBeUndefined();
      expect(hashState(upgradeState(loaded, w))).toBe(hashState(s));
    });
    it("replace England's economy on the day the world has reached, each from its starting position", () => {
      // the state of the yearly economy of England: a year, a model, 15 figures. Version 9 is the running world (the
      // places of the whole globe, heads at 1:100, England's economy); versions 7 and 6 counted people of the time
      // and take the steps to 9 first
      const england = (v: number) => {
        let old = decodeState(encodeState(run.s)) as any;
        if (v < 9) old = countedInPeopleOfTheTime(old);
        old.economy = { england: { year: 1357, model: new Uint8Array(64), figures: new Float64Array(15), halted: '' } }; old.v = v;
        return upgradeState(decodeState(encodeState(old)), run.w, () => loadSetup(1356));
      };
      const loaded = england(9);
      expect(STATE_VERSION).toBeGreaterThanOrEqual(10);
      expect(loaded.v).toBe(STATE_VERSION);
      expect(hashState(england(7))).toBe(hashState(loaded));
      expect(hashState(england(6))).toBe(hashState(loaded));
      expect((loaded.economy as any).england).toBeUndefined();
      const e = loaded.economy.cities!;
      expect(e.day).toBe(400); expect(e.years.length).toBe(0); expect(e.halted).toBe('');
      for (let k = 0; k < N; k++) expect(e.figures[k * FIGURES + FIGURE.periods]).toBe(0); // the days before are not computed
      expect(Buffer.compare(e.model, newWorldState().s.economy.cities!.model)).toBe(0); // the cities of a new world
      // it is the state of this world with the economies founded today
      const founded = decodeState(encodeState(run.s)); foundEconomy(founded, run.w);
      expect(hashState(loaded)).toBe(hashState(founded));
      // from the next day on they compute: one period a day, and the upgraded world encodes as it runs
      days(loaded, run.w, 5);
      expect(loaded.economy.cities!.day).toBe(405);
      expect(loaded.economy.cities!.figures[FIGURE.periods]).toBe(5);
      const again = decodeState(encodeState(loaded));
      days(again, run.w, 3); days(loaded, run.w, 3);
      expect(hashState(again)).toBe(hashState(loaded));
    }, 60_000);
  });
});

describe('what a player sees of the economy', () => {
  it('is a section in every place with a city, and in no other place', () => {
    const { s, w } = newWorldState();
    const places = w.cityEconomies.cities.map((c) => c.place);
    let shown = 0;
    for (let i = 0; i < w.L; i++) {
      const d = placeDetail(s, w, i)!;
      expect((d as any).economy).toBeUndefined(); // the section of England's economy is gone
      if (d.cityEconomy) { shown++; expect(places).toContain(i); }
    }
    expect(shown).toBe(29);
    for (const name of ['London', 'Paris', 'Cairo', 'Venice']) expect(placeDetail(s, w, w.names.indexOf(name))!.cityEconomy).toBeDefined();
    // a place of England that is not one of the cities has no economy any more
    const york = w.names.indexOf('York');
    expect(york).toBeGreaterThanOrEqual(0);
    expect(placeDetail(s, w, york)!.cityEconomy).toBeUndefined();
  });
  it('shows the last 365 days of the city and its price level of today, new every day', () => {
    const { s, w } = newWorldState();
    const london = w.names.indexOf('London'), k = w.cityOf[london];
    const p = JSON.parse(w.cityEconomies.cities[k].parameters);
    const d0 = placeDetail(s, w, london)!.cityEconomy!;
    expect(d0).toMatchObject({ day: 0, baseYear: 1356, scale: 0.01 });
    expect(d0.realGdp).toBeCloseTo(45247.8 * 60862 / 2583180, 3); // London's share of England's GDP at 1:100
    expect(d0.realGdpIndex).toBeCloseTo(100, 9); expect(d0.priceToday).toBe(100);
    expect(d0.employed + d0.unemployed).toBe(p.H_act);
    expect(d0.halted).toBeUndefined();
    let last = d0;
    for (let day = 1; day <= 3; day++) {
      advanceDay(s, w);
      const f = s.economy.cities!.figures.subarray(k * FIGURES, (k + 1) * FIGURES), d = placeDetail(s, w, london)!.cityEconomy!;
      expect(d.day).toBe(day);
      expect(d.realGdp).toBe(f[FIGURE.realGdp]);
      expect(d.realGdp).not.toBe(last.realGdp);
      expect(d.realGdpIndex).toBeCloseTo(100 * f[FIGURE.realGdp] / d0.realGdp, 6);
      expect(d.priceToday).toBe(100 * f[FIGURE.priceLevel]);
      expect(d.consumption).toBe(f[FIGURE.consumption]); expect(d.crown).toBe(f[FIGURE.government]);
      expect(d.investment).toBe(f[FIGURE.investment]); expect(d.exports).toBe(f[FIGURE.exports]); expect(d.imports).toBe(f[FIGURE.imports]);
      // GDP is the sum of its uses
      expect(d.consumption + d.crown + f[FIGURE.investment] + d.exports - d.imports).toBeGreaterThan(0.9 * d.realGdp);
      // another city shows another economy
      expect(placeDetail(s, w, w.names.indexOf('Paris'))!.cityEconomy!.realGdp).not.toBe(d.realGdp);
      last = d;
    }
  });
});

describe('the world server with the economy', () => {
  it('replays the days of the economies from its command log and resumes from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scw-eco-'));
    try {
      const cfg = { ...configFromEnv({}), dataDir: dir, id: 'eco', snapshotEveryDays: 30, log: () => {} };
      const core = new WorldCore(cfg).init();
      for (let i = 0; i < 70; i++) core.step(); // snapshots at day 30 and 60
      expect(core.s.economy.cities!.day).toBe(70);
      const fromStart = core.verifyReplay(0), fromLast = core.verifyReplay(60);
      expect(fromStart.hash).toBe(fromStart.live);
      expect(fromLast.hash).toBe(fromLast.live);
      const live = hashState(core.s);
      core.shutdown();
      const again = new WorldCore(cfg).init();
      expect(again.s.day).toBe(70);
      expect(hashState(again.s)).toBe(live);
      again.shutdown();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 120_000);
});
