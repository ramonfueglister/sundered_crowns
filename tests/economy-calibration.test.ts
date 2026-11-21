// The calibration of the economy (features 3 to 9, docs/ECONOMY_DESIGN.md): England's accounts of the year of the
// sources, their turn into days, and the economies of the cities of the game. The engine has tests/economy.test.ts,
// the economies in the world tests/economy-world.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { newWorldState, loadWorld, loadEconomy, dataPath } from '../tools/sim/load';
import { REFERENCE, calibrationJson, cityCalibrations, readTable } from '../tools/sim/calibrate_economy';
import { calibrateEconomy, cityTable, ar1, type Entry } from '../src/sim/economy/calibration';
import { roundHalfEven, unemploymentBenefit } from '../src/sim/economy/accounts';
import { dailyCalibration, dailyEconomy } from '../src/sim/economy/daily';
import { cityAt, cityPlaces } from '../src/sim/systems/economy';
import { cityPeopleByPlace } from '../src/sim/systems/people';
import { sum, type PortJson } from './setup/economy_values';

describe("the calibration of England's economy (the year of the sources)", () => {
  const table = readTable(),
    c = calibrateEconomy(table);
  const a = c.accounts as PortJson,
    p = c.parameters as PortJson,
    ic = c.initial_conditions as PortJson;

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
    expect(a.exports).toBeCloseTo(0.01 * (32666.4 * 4.05 + 9061 * 1.751), 6);
    expect(a.duty).toBeCloseTo(0.01 * 32666.4 * 2, 6); // 40 shillings a sack
  });
  it('balances: GDP is what households, crown, investment and trade use, and what the sectors add plus the duty', () => {
    expect(Math.abs(a.gdpCheck)).toBeLessThan(1e-6);
    expect(sum(a.valueAdded) + a.duty).toBeCloseTo(a.gdp, 6);
    expect(sum(a.households)).toBeGreaterThan(0.8 * a.gdp);
  });
  it('gives every person of the labour force a place: employee, owner of a firm or of the bank, or without work', () => {
    expect(a.labourForce).toBe(roundHalfEven((25831.8 * 0.62 * (0.971 + 0.43)) / 2));
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
    expect(p.tau_INC).toBeCloseTo(
      a.directTax / (sum(a.wages) + sum(a.valueAdded) - sum(a.wages) - 0.025 * sum(a.capital)),
      12,
    );
    expect(sum(p.b_HH_g)).toBeCloseTo(1, 12);
    expect(sum(p.c_E_g)).toBeCloseTo(1, 12);
    expect(ic.E_CB).toBeCloseTo(-(ic.D_I + ic.D_H + ic.E_k), 9); // the port's rule with no government debt and no loans
    for (const k of ['tau_VAT', 'tau_SIF', 'tau_SIW', 'tau_FIRM', 'tau_CF', 'tau_G', 'r_G', 'xi_pi', 'xi_gamma'])
      expect(p[k]).toBe(0);
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
  it("hands a world that starts before the table's year the history up to its start, as the port ends it at the date of the calibration (feature 21)", () => {
    const u = calibrateEconomy(table, 1291),
      q = u.parameters as PortJson,
      h = u.initial_conditions as PortJson;
    expect(q.T_prime).toBe(11);
    for (const k of ['Y', 'pi', 'C_G', 'C_E', 'Y_I']) expect(h[k].length).toBe(11);
    expect(h.Y[10]).toBeCloseTo(sum(a.output), 6); // every series is scaled to its value in the start year
    expect(h.C_G[10]).toBeCloseTo(a.crown, 9);
    expect(h.C_E[10]).toBeCloseTo(a.exports, 9);
    expect(h.Y[0] / h.Y[10]).toBeCloseTo(3389.51 / 3231.35, 9); // real GDP of 1281 against 1291
    expect(h.pi).toEqual(ic.pi.slice(0, 11));
    const e = ar1(h.C_E.map(Math.log)); // the exports' rule from 1281 to 1291
    expect([q.alpha_E, q.beta_E, q.sigma_E]).toEqual([e.alpha, e.beta, e.sigma]);
    // the crown's rule from the whole history: from 1281 to 1291 it has no long-run mean
    expect(ar1(h.C_G.map(Math.log)).alpha).toBeGreaterThan(1);
    expect(q.alpha_G).toBeCloseTo(p.alpha_G, 12);
    expect(q.sigma_G).toBeCloseTo(p.sigma_G, 12);
    expect(u.accounts).toEqual(c.accounts); // the accounts are the table's
    expect(dailyCalibration(table, 1291).parameters).toMatchObject({ T_prime: 11 });
    expect(calibrateEconomy(table, 1356)).toEqual(c);
    for (const y of [1282, 1357, 1291.5])
      expect(() => calibrateEconomy(table, y)).toThrow(/the history runs from 1281 to 1356/);
  });
  it('estimates an AR(1) by least squares', () => {
    const y = [1, 1.5, 1.75, 1.875, 1.9375]; // y_t = 0.5 · y_(t−1) + 1 exactly
    const e = ar1(y);
    expect(e.alpha).toBeCloseTo(0.5, 12);
    expect(e.beta).toBeCloseTo(1, 12);
    expect(e.sigma).toBeCloseTo(0, 12);
    expect(roundHalfEven(2.5)).toBe(2);
    expect(roundHalfEven(3.5)).toBe(4);
    expect(roundHalfEven(2.4)).toBe(2);
    expect(roundHalfEven(2.6)).toBe(3);
  });
});

describe('the calibration turned into days', () => {
  const table = readTable(),
    y = calibrateEconomy(table),
    d = dailyCalibration(table);
  const py = y.parameters as PortJson,
    pd = d.parameters as PortJson;
  const iy = y.initial_conditions as PortJson,
    id = d.initial_conditions as PortJson;
  const FLOWS = ['alpha_s', 'kappa_s', 'delta_s', 'w_s'],
    RULES = ['mu', 'theta', 'alpha_G', 'beta_G', 'sigma_G', 'alpha_E', 'beta_E', 'sigma_E', 'C'];
  const HISTORY = ['Y', 'pi', 'C_G', 'C_E', 'Y_I'];

  it('has a year of 365 days, a plan every 30 days and expectations on the last 365 days', () => {
    expect(y.periods_per_year).toBe(1);
    expect(y.clock).toEqual({ plan: 1, window: 1 });
    expect(d.periods_per_year).toBe(365);
    expect(d.clock).toEqual({ plan: 30, window: 365 });
    expect(d.accounts).toEqual(y.accounts); // the accounts of the year stay as the sources give them
  });
  it('spreads what flows in a year evenly over its days', () => {
    for (const k of FLOWS) for (let g = 0; g < 3; g++) expect(pd[k][g]).toBe(py[k][g] / 365);
    for (const k of HISTORY) {
      expect(id[k].length).toBe(76);
      for (let t = 0; t < 76; t++) expect(id[k][t]).toBe(iy[k][t] / 365);
    }
    expect(pd.T_prime).toBe(76);
    expect(365 * sum(pd.alpha_s.map((x: number, g: number) => x * (y.accounts.employees as number[])[g]))).toBeCloseTo(
      sum(y.accounts.output as number[]),
      6,
    );
  });
  it('leaves every share and every stock as it is', () => {
    for (const k of Object.keys(py)) if (!FLOWS.includes(k) && !RULES.includes(k)) expect(pd[k], k).toEqual(py[k]);
    for (const k of Object.keys(iy)) if (!HISTORY.includes(k)) expect(id[k], k).toEqual(iy[k]);
    expect(Object.keys(pd)).toEqual(Object.keys(py));
    expect(Object.keys(id)).toEqual(Object.keys(iy));
  });
  it('compounds the interest of a day to the interest of the year', () => {
    expect((1 + pd.mu) ** 365).toBeCloseTo(1.075, 12);
    expect(pd.theta).toBe(py.theta / 365);
  });
  it('keeps the memory of a year, the long-run mean and the spread of the crown and of the exports', () => {
    for (const s of ['G', 'E']) {
      const a = py[`alpha_${s}`],
        ad = pd[`alpha_${s}`];
      expect(ad ** 365).toBeCloseTo(a, 12);
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
  const table = readTable(),
    cities = cityCalibrations(table),
    england = calibrateEconomy(table);
  const pe = england.parameters as PortJson,
    ae = england.accounts as PortJson;

  it('is the file of the reference world, as the game founds the economies of its cities', () => {
    expect(readFileSync(dataPath('economy_cities.json'), 'utf8')).toBe(calibrationJson(table)); // else: npm run economy:calibrate
    const w = loadWorld();
    expect(w.cityEconomies).toMatchObject({
      year: 1356,
      scale: 0.01,
      clock: { plan: 30, window: 365 },
      rules: { wage: 'money', prices: 'demand' },
    });
    expect(w.cityEconomies.table).toEqual(table); // the game calibrates from the table itself
    const file = loadEconomy(),
      e = newWorldState(REFERENCE.seed, REFERENCE.year).s.economy.cities!;
    expect(file.world).toEqual(REFERENCE);
    expect(Array.from(e.places)).toEqual(cities.map((c) => c.place));
    cities.forEach((c, k) => {
      expect(file.cities[k]).toMatchObject({ place: c.place, people: c.people, working: c.working.length });
      expect(file.cities[k].parameters).toEqual(JSON.parse(JSON.stringify(c.calibration.parameters)));
      expect(cityAt(e, c.place)).toBe(k);
    });
    expect(cityAt(e, w.names.indexOf('York'))).toBe(-1);
  });
  it('has one economy for every place with one of the 30 largest cities, with the people of its cities', () => {
    const byPlace = cityPeopleByPlace();
    expect(cities.length).toBe(byPlace.size);
    expect(cities.length).toBe(29); // two cities of the list lie in one place
    for (const c of cities) expect(c.people).toBe(byPlace.get(c.place));
    expect(cityPlaces(1356).map((c) => c.place)).toEqual([...byPlace.keys()]);
    expect(cities.find((c) => c.name === 'Texcoco')!.people).toBe(68800 + 54000);
    expect(cities[0]).toMatchObject({ name: 'Cairo', people: 351200 });
  });
  it('says that the structure of a city, the duty between cities and the benefit of a person without work are assumptions', () => {
    for (const e of [
      table.cities.structure,
      table.cities.duty_shillings_per_sack,
      table.cities.unemployment_benefit,
    ] as Entry<unknown>[]) {
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
    for (const rate of [-0.1, 1, NaN])
      expect(() => unemploymentBenefit(rate, 0.2, 0.1, 10)).toThrow(/unemployment benefit/);
  });
  it('pays a person without work nothing in any city, and still computes the benefit of the original code when the table asks for it', () => {
    const withBenefit = structuredClone(table);
    withBenefit.cities.unemployment_benefit.value = 0.55;
    for (const c of cities) {
      // the game (feature 9): the rate is switched off and nobody starts with a benefit
      const po = c.calibration.parameters as PortJson,
        io = c.calibration.initial_conditions as PortJson;
      const a = c.calibration.accounts as PortJson;
      expect(po.theta_UB).toBe(1e-9); // not 0: the port divides the starting wage by this rate
      expect(io.w_UB).toBe(0);
      expect(io.sb_other).toBe(0);
      expect(io.sb_inact).toBe(0);
      // the same city with the rate of feature 6: 55 % of the last wage after tax, from the first day
      const on = dailyEconomy(calibrateEconomy(cityTable(withBenefit, c.people, c.working.length)), 365, 30);
      const p = on.parameters as PortJson,
        ic = on.initial_conditions as PortJson;
      expect(p.theta_UB).toBeCloseTo(0.55 * (1 - p.tau_INC) * (1 - p.tau_SIW), 15);
      expect(p.theta_UB).toBeGreaterThan(0.5);
      expect(p.theta_UB).toBeLessThan(0.55);
      // the benefit of a day at the start: on the mean wage of an employee of the city on a day
      const meanWage = sum(p.w_s.map((w: number, g: number) => w * ic.N_s[g])) / sum(ic.N_s);
      expect(ic.w_UB).toBeCloseTo(p.theta_UB * meanWage, 15);
      expect(ic.w_UB * 365).toBeCloseTo((p.theta_UB * sum(a.wages)) / sum(a.employees), 12);
      // the same city as a year: the benefit of a day is a 365th of the benefit of the year
      const year = calibrateEconomy(cityTable(withBenefit, c.people, c.working.length));
      expect(ic.w_UB).toBe((year.initial_conditions as PortJson).w_UB / 365);
      expect(p.theta_UB).toBe((year.parameters as PortJson).theta_UB);
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
      const p = c.calibration.parameters as PortJson,
        a = c.calibration.accounts as PortJson;
      expect(c.calibration.scale).toBeCloseTo(0.01 * share, 15);
      expect(a.people).toBeCloseTo(c.people / 100, 6); // the model computes the city at 1:100
      expect(a.gdp / ae.gdp).toBeCloseTo(share, 12);
      expect(a.coin / ae.coin).toBeCloseTo(share, 12);
      expect(a.duty).toBe(0);
      expect(p.tau_EXPORT).toBe(0);
      expect(a.directTax).toBeCloseTo(a.revenue, 9); // the crown of a city takes all its revenue as a direct tax
      expect(a.imports).toBeCloseTo(a.exports, 9); // what a city sells to the others it buys from them
      expect(Math.abs(a.gdpCheck)).toBeLessThan(1e-6);
      for (let g = 0; g < 3; g++) {
        expect(p.I_s[g]).toBeGreaterThanOrEqual(1);
        expect(a.employees[g]).toBeGreaterThanOrEqual(p.I_s[g]);
      }
      // what does not depend on the size is England's
      for (const k of [
        'G',
        'T_prime',
        'beta_s',
        'theta',
        'zeta',
        'zeta_LTV',
        'zeta_b',
        'mu',
        'c_E_g',
        'c_I_g',
        'c_G_g',
        'b_CF_g',
        'b_CFH_g',
        'a_sg',
        'alpha_G',
        'alpha_E',
      ]) {
        if (k === 'mu') expect((1 + p.mu) ** 365).toBeCloseTo(1 + pe.mu, 12);
        else if (k === 'theta') expect(p.theta * 365).toBeCloseTo(pe.theta, 12);
        else if (k === 'alpha_G' || k === 'alpha_E') expect(p[k] ** 365).toBeCloseTo(pe[k], 12);
        else if (k === 'c_E_g')
          for (let g = 0; g < 3; g++) expect(p.c_E_g[g]).toBeCloseTo(pe.c_E_g[g], 12); // a quotient of scaled amounts
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
    const other = structuredClone(table);
    other.cities.wage.value = 'prices';
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
    const other = structuredClone(table);
    other.cities.prices.value = 'costs';
    expect(calibrationJson(other).replace('"prices": "costs"', '"prices": "demand"')).toBe(calibrationJson(table));
  });
});
