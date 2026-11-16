// The calibration of a national economy for the port of BeforeIT.jl (economy feature 3, docs/ECONOMY_DESIGN.md).
//
// The port computes its parameters from a set of national accounts (src/calibration.rs of the port, BeforeIT.jl
// src/utils/calibration.jl): output, inputs and wages of each sector, consumption, government, trade, money and
// capital, and the series of the years before the start. For Austria in 2010 Eurostat has all of that. For England
// in 1356 the calibration table (data/economy/england_1356.json) holds what the sources give and marks what they do
// not. This file turns the table into the port's two inputs, parameters and initial conditions, by the port's own
// formulas. It adds no number of its own: every value is in the table.
//
// The table and `calibrateEconomy` are yearly (the port's `timescale` is 1: the amounts of a year are the amounts of a
// period). Since economy feature 4 the model computes one day per period: `dailyEconomy` turns the yearly calibration
// into the daily one, by the rules listed there. Since feature 5 the world has no economy of England as a whole:
// every city is an economy of its own, calibrated from the table of England at the city's size (`cityTable`).

export type Kind = 'source' | 'derived' | 'assumption';
export interface Entry<T> { value: T; kind: Kind; source: string }
type V3 = [number, number, number];

export interface CalibrationTable {
  case: string;
  year: number;
  scale: Entry<number>;
  /** the daily clock of economy feature 4 */
  clock: { days_per_year: Entry<number>; plan_days: Entry<number> };
  /** what a city's table takes in place of England's (economy feature 5) */
  cities: {
    structure: Entry<string>; duty_shillings_per_sack: Entry<number>; unemployment_benefit: Entry<number>;
    /** how the firms of a city pay wages (economy feature 7): 'money' is a wage in money that never changes,
     *  'prices' the port's real wage that follows the consumer prices */
    wage: Entry<'money' | 'prices'>;
    /** how the firms of a city plan supply and price (economy feature 8): 'demand' is the demand pull of CANVAS,
     *  'costs' the rule of the paper */
    prices: Entry<'demand' | 'costs'>;
  };
  sectors: string[];
  inputs: {
    gdp_nominal_gbp_mn: Entry<number>;
    population_thousand: Entry<number>;
    value_added_share: Entry<V3>;
    labour_share: Entry<V3>;
    participation: Entry<{ men: number; women: number }>;
    income_gbp_mn: Entry<{ wages: number; land_rents: number; house_rents: number; other_capital: number; net_national_income: number }>;
    interest: Entry<number>;
    crown_revenue_gbp_thousand: Entry<number>;
    coin_gbp_mn: Entry<number>;
    wool_export: Entry<{ sacks: number; gbp_per_sack: number; duty_shillings_per_sack: number }>;
    cloth_export: Entry<{ cloths: number }>;
    cloth_value_gbp: Entry<number>;
    output_per_intermediate_input: Entry<V3>;
    input_matrix: Entry<[V3, V3, V3]>;
    persons_per_firm: Entry<number>;
    adult_share: Entry<number>;
    unemployed: Entry<number>;
    /** the part of the last wage after tax that a person without work is paid (economy feature 6); 0 = none */
    unemployment_benefit: Entry<number>;
    depreciation: Entry<number>;
    import_share: Entry<V3>;
    crown_purchase_share: Entry<V3>;
    investment_share: Entry<V3>;
    dwelling_share: Entry<V3>;
    coin_split: Entry<{ households: number; firms: number }>;
    bank_equity_of_coin: Entry<number>;
    rest_of_the_world: Entry<{ output: number; inflation: number }>;
    behaviour: Entry<{ theta: number; zeta: number; zeta_LTV: number; zeta_b: number; omega: number }>;
  };
  history: {
    first_year: number;
    real_gdp_gbp_mn_2013: number[];
    gdp_deflator_2013_100: number[];
    crown_revenue_gbp_thousand: number[];
    export_volume_gbp_mn_2013: number[];
  };
}

/** What the engine is given for one economy, with the accounts it was computed from. */
export interface EconomyCalibration {
  case: string;
  /** the year the starting position stands for */
  year: number;
  scale: number;
  /** periods of the model in a year, and the two lengths of the daily clock in periods (economy/src/clock.rs): a
   *  firm plans every `plan` periods, expectations are formed on windows of `window` periods */
  periods_per_year: number;
  clock: { plan: number; window: number };
  /** the port's `Parameters` and `InitialConditions` (its JSON keys) */
  parameters: Record<string, unknown>;
  initial_conditions: Record<string, unknown>;
  /** the national accounts the parameters were computed from, at the scale of the model (£ of the start year) */
  accounts: Record<string, number | number[]>;
}

const SHILLINGS_PER_POUND = 20;
/** The unemployment benefit cannot be switched off with 0: the port divides the starting wage by this rate
 *  (src/agents.rs, line 222 of the port). */
const NO_BENEFIT = 1e-9;
/** The model's unemployment benefit (economy feature 6): a person without work is paid `theta_UB` times the last
 *  wage by the government (Poledna et al. 2023, appendix A.44, A.53), which adds what it lacks to its debt
 *  (A.60, A.61). `rate` is the part of the wage after tax, as the original code calibrates it:
 *  theta_UB = 0.55 · (1 − tau_INC) · (1 − tau_SIW) (BeforeIT.jl; src/calibration.rs, line 1287 of the port).
 *  `w_UB` is the benefit of a person at the start. The original takes it from the data (benefits paid per person
 *  without work); no such data exist here, so it is the benefit on the mean wage of an employee. The port starts
 *  every person with the last wage `w_UB / theta_UB` (src/agents.rs, line 222), which is then that mean wage.
 *  A rate of 0 switches the benefit off. The cities of the game have had the rate 0 since economy feature 9
 *  (0.55 from feature 6 to feature 8). */
export function unemploymentBenefit(rate: number, taxOnIncome: number, taxOnWages: number, meanWage: number): { theta_UB: number; w_UB: number } {
  if (!(rate >= 0 && rate < 1)) throw new Error(`an unemployment benefit of ${rate} of the wage`);
  if (rate === 0) return { theta_UB: NO_BENEFIT, w_UB: 0 };
  const theta_UB = rate * (1 - taxOnIncome) * (1 - taxOnWages);
  return { theta_UB, w_UB: theta_UB * meanWage };
}
/** The port needs a positive definite covariance of its three shocks; output abroad and imports do not move. */
const NO_SHOCK = 1e-12;

const sum = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0);
/** Rounds to the nearest whole number, a half to the even one (Julia's `round`, which the port's calibration uses). */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x), d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** y_t = α · y_(t−1) + β + ε by least squares, σ the standard deviation of the residuals: the port's
 *  `estimate_for_calibration_script`. */
export function ar1(y: readonly number[]): { alpha: number; beta: number; sigma: number } {
  const x = y.slice(0, -1), z = y.slice(1), n = z.length;
  const mx = sum(x) / n, mz = sum(z) / n;
  let sxz = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxz += (x[i] - mx) * (z[i] - mz); sxx += (x[i] - mx) ** 2; }
  const alpha = sxz / sxx, beta = mz - alpha * mx;
  const res = z.map((q, i) => q - alpha * x[i] - beta), mr = sum(res) / n;
  return { alpha, beta, sigma: Math.sqrt(sum(res.map((e) => (e - mr) ** 2)) / (n - 1)) };
}

export function calibrateEconomy(t: CalibrationTable): EconomyCalibration {
  const i = t.inputs, S = t.scale.value, G = 3, sectors = [0, 1, 2];
  const h = t.history, first = h.first_year, years = t.year - first; // the history covers first + 1 … year
  for (const k of ['real_gdp_gbp_mn_2013', 'gdp_deflator_2013_100', 'crown_revenue_gbp_thousand', 'export_volume_gbp_mn_2013'] as const) {
    if (h[k].length !== years + 1) throw new Error(`history.${k} has ${h[k].length} years, ${first} to ${t.year} are ${years + 1}`);
  }

  // ---- the accounts of the start year at the scale of the model
  const gdp = i.gdp_nominal_gbp_mn.value * 1e6 * S;
  const people = i.population_thousand.value * 1e3 * S;
  const inc = i.income_gbp_mn.value;
  const wageShare = inc.wages / inc.net_national_income;
  const capitalShare = inc.other_capital / inc.net_national_income;
  const houseShare = inc.house_rents / inc.net_national_income;
  const r = i.interest.value;
  const revenue = i.crown_revenue_gbp_thousand.value * 1e3 * S;
  const coin = i.coin_gbp_mn.value * 1e6 * S;
  const wool = i.wool_export.value.sacks * i.wool_export.value.gbp_per_sack * S;
  const cloth = i.cloth_export.value.cloths * i.cloth_value_gbp.value * S;
  const duty = i.wool_export.value.sacks * i.wool_export.value.duty_shillings_per_sack / SHILLINGS_PER_POUND * S;
  const beta = i.output_per_intermediate_input.value, A = i.input_matrix.value, dep = i.depreciation.value;
  const b = i.behaviour.value;

  // GDP at market prices is value added plus the taxes on products; the wool duty is the one such tax of the model
  const va = i.value_added_share.value.map((s) => s * (gdp - duty));
  const inputs = sectors.map((g) => va[g] / (beta[g] - 1)); // inputs bought by each sector
  const output = sectors.map((g) => va[g] + inputs[g]);
  const supplied = sectors.map((row) => sum(sectors.map((c) => A[row][c] * inputs[c]))); // inputs sold by each sector
  const capital = va.map((v) => (capitalShare / r) * v);
  const used = capital.map((k) => dep * k); // consumption of fixed capital
  const exports = [wool, cloth, 0], X = sum(exports);
  const imports = i.import_share.value.map((c) => c * X);
  const crown = i.crown_purchase_share.value.map((c) => c * revenue);
  const investment = i.investment_share.value.map((s) => s * sum(used));
  const dwellings = houseShare / r * gdp, building = dep * dwellings;
  const built = i.dwelling_share.value.map((s) => s * building);
  const households = sectors.map((g) => output[g] + imports[g] - supplied[g] - crown[g] - investment[g] - built[g] - exports[g]);
  if (!(Math.min(...households) > 0)) throw new Error(`a sector has nothing left for the households: ${households}`);
  const wages = va.map((v) => wageShare * v);
  const surplus = sectors.map((g) => va[g] - wages[g] - used[g]);

  const labourForce = roundHalfEven(people * i.adult_share.value * (i.participation.value.men + i.participation.value.women) / 2);
  const persons = i.labour_share.value.map((s) => roundHalfEven(labourForce * s));
  const firms = persons.map((p) => Math.max(1, roundHalfEven(p / i.persons_per_firm.value)));
  const employees = sectors.map((g) => persons[g] - firms[g]);
  const I = sum(firms), N = sum(employees);
  const directTax = revenue - duty;
  const mixed = sum(surplus);
  const tau_INC = directTax / (sum(wages) + mixed), tau_SIW = 0;
  const benefit = unemploymentBenefit(i.unemployment_benefit.value, tau_INC, tau_SIW, sum(wages) / N);
  // The income households spend from includes the benefits paid at the start, as in the original's calibration
  // (disposable income with social benefits; src/calibration.rs, lines 1150 and 1282 of the port). Households
  // then buy at the start what the accounts say, and the accounts of the first day add up.
  const disposable = sum(wages) + mixed - directTax + i.unemployed.value * benefit.w_UB;

  // ---- the years before the start
  const at = (series: readonly number[], year: number) => series[year - first];
  const history = Array.from({ length: years }, (_, k) => first + 1 + k);
  const realRevenue = (y: number) => at(h.crown_revenue_gbp_thousand, y) / at(h.gdp_deflator_2013_100, y);
  const level = (total: number, f: (y: number) => number) => history.map((y) => total * f(y) / f(t.year));
  const crownSeries = level(sum(crown), realRevenue);
  const exportSeries = level(X, (y) => at(h.export_volume_gbp_mn_2013, y));
  const arG = ar1(crownSeries.map(Math.log)), arE = ar1(exportSeries.map(Math.log));

  const parameters = {
    G, T_prime: history.length, H_act: N + i.unemployed.value + I + 1, H_inact: 1, J: roundHalfEven(I / 4), L: roundHalfEven(I / 2), I_s: firms,
    alpha_s: sectors.map((g) => output[g] / employees[g]), beta_s: beta,
    kappa_s: sectors.map((g) => output[g] / capital[g] / b.omega), delta_s: sectors.map((g) => used[g] / capital[g] / b.omega),
    w_s: sectors.map((g) => wages[g] / employees[g]), tau_Y_s: [0, 0, 0], tau_K_s: [0, 0, 0],
    tau_INC, tau_FIRM: 0, tau_VAT: 0, tau_SIF: 0, tau_SIW, tau_EXPORT: duty / X, tau_CF: 0, tau_G: 0,
    theta_UB: benefit.theta_UB, psi: sum(households) / disposable, psi_H: building / disposable, mu: r,
    theta_DIV: mixed / sum(surplus.map((s) => Math.max(0, s))),
    theta: b.theta, zeta: b.zeta, zeta_LTV: b.zeta_LTV, zeta_b: b.zeta_b,
    b_CF_g: i.investment_share.value, b_CFH_g: i.dwelling_share.value, b_HH_g: households.map((v) => v / sum(households)),
    c_G_g: i.crown_purchase_share.value, c_E_g: exports.map((e) => e / X), c_I_g: i.import_share.value, a_sg: A,
    C: [[NO_SHOCK, 0, 0], [0, arE.sigma * arE.sigma, 0], [0, 0, NO_SHOCK]],
    alpha_G: arG.alpha, beta_G: arG.beta, sigma_G: arG.sigma, alpha_E: arE.alpha, beta_E: arE.beta, sigma_E: arE.sigma,
    alpha_I: 1, beta_I: 0, sigma_I: 0, alpha_pi_EA: 1, beta_pi_EA: 0, sigma_pi_EA: 0, alpha_Y_EA: 1, beta_Y_EA: 0, sigma_Y_EA: 0,
    r_G: 0, rho: 1, r_star: 0, pi_star: 0, xi_pi: 0, xi_gamma: 0, S: G, T: 12, T_max: 12,
  };
  const D_H = i.coin_split.value.households * coin, D_I = i.coin_split.value.firms * coin, E_k = i.bank_equity_of_coin.value * coin;
  const initial_conditions = {
    D_I, L_I: 0, omega: b.omega, w_UB: benefit.w_UB, sb_inact: 0, sb_other: 0, D_H, K_H: dwellings, L_G: 0, E_k, E_CB: -D_I - D_H - E_k, D_RoW: 0, N_s: employees,
    Y: history.map((y) => sum(output) * at(h.real_gdp_gbp_mn_2013, y) / at(h.real_gdp_gbp_mn_2013, t.year)),
    pi: history.map((y) => Math.log(at(h.gdp_deflator_2013_100, y) / at(h.gdp_deflator_2013_100, y - 1))),
    Y_EA: i.rest_of_the_world.value.output, pi_EA: i.rest_of_the_world.value.inflation, r_bar: 0,
    C_G: crownSeries, C_E: exportSeries, Y_I: history.map(() => sum(imports)),
  };
  const accounts = {
    gdp, people, labourForce, firms, employees, output, valueAdded: va, wages, capital, dwellings,
    households, crown: sum(crown), investment: sum(investment), building, exports: X, imports: sum(imports),
    revenue, duty, directTax, coin,
    // GDP by its uses (exports with their duty) minus GDP: 0 up to rounding
    gdpCheck: sum(households) + sum(crown) + sum(investment) + building + X + duty - sum(imports) - gdp,
  };
  return { case: t.case, year: t.year, scale: S, periods_per_year: 1, clock: { plan: 1, window: 1 }, parameters, initial_conditions, accounts };
}

/** The table of a city with `people` inhabitants (economy feature 5): England's table at the city's share of
 *  England's people, so that the model computes the city at the scale of the table (1:100), with the duty
 *  between cities in place of England's wool duty, and with the cities' rate of the model's unemployment benefit
 *  (economy feature 6; 0 since feature 9). All three are assumptions of the table (`cities`). */
export function cityTable(t: CalibrationTable, people: number): CalibrationTable {
  if (!(people > 0)) throw new Error(`a city of ${people} people`);
  const c = structuredClone(t);
  c.scale.value = t.scale.value * people / (t.inputs.population_thousand.value * 1e3);
  c.inputs.wool_export.value.duty_shillings_per_sack = t.cities.duty_shillings_per_sack.value;
  c.inputs.unemployment_benefit = structuredClone(t.cities.unemployment_benefit);
  return c;
}

/** The calibration with one day as the period (economy feature 4), from the yearly one. `days` is the number of
 *  days of a year, `plan` the days between two plans of a firm. The accounts stay those of the year.
 *
 *  - Flows per period (output per employee and per unit of capital, depreciation, wages, the benefit of a person
 *    without work, and the series of the years before the start) are divided by `days`: the port's own rule for a shorter period (`timescale` in
 *    src/calibration.rs of the port, which turns yearly amounts into quarterly ones).
 *  - The loan rate is compounded: (1 + r)^(1/days) − 1 (the port's rule for yearly rates, same file).
 *  - The share of a loan repaid per period is divided by `days` (the linear form of Pichler et al. 2021, footnote
 *    15, for a share per quarter as a share per day).
 *  - The AR(1) rules of the crown's purchases and of exports (on logarithms) keep their long-run mean and
 *    variance: α^(1/days), and β and σ to match. This conversion has no source; it is exact for the level on a
 *    day, and sums over a year vary a little less than in the yearly rule.
 *  - Shares stay as they are (propensity to consume, tax rates, dividends, capital requirements), and so do stocks.
 *  - The history keeps one entry per year: an entry stands for the `days` days of its year (the window of the
 *    clock), with the flow of one day and the inflation of one day. */
export function dailyEconomy(c: EconomyCalibration, days: number, plan: number): EconomyCalibration {
  if (!(Number.isInteger(days) && days > 1 && Number.isInteger(plan) && plan >= 1)) throw new Error(`a year of ${days} days and a plan every ${plan} days`);
  if (c.periods_per_year !== 1) throw new Error('the daily calibration starts from the yearly one');
  const p = structuredClone(c.parameters) as Record<string, any>, ic = structuredClone(c.initial_conditions) as Record<string, any>;
  const perDay = (v: number[]) => v.map((x) => x / days);
  for (const k of ['alpha_s', 'kappa_s', 'delta_s', 'w_s']) p[k] = perDay(p[k]);
  p.mu = Math.pow(1 + p.mu, 1 / days) - 1;
  p.theta = p.theta / days;
  for (const s of ['G', 'E']) {
    const a: number = p[`alpha_${s}`], b: number = p[`beta_${s}`], sigma: number = p[`sigma_${s}`];
    if (!(a > 0 && a < 1)) throw new Error(`the AR(1) rule of ${s} has α = ${a}: only a rule with a long-run mean can be turned into a daily one`);
    const ad = Math.pow(a, 1 / days), mean = b / (1 - a) - Math.log(days);
    p[`alpha_${s}`] = ad; p[`beta_${s}`] = mean * (1 - ad); p[`sigma_${s}`] = sigma * Math.sqrt((1 - ad * ad) / (1 - a * a));
  }
  p.C[1][1] = p.sigma_E * p.sigma_E;
  for (const k of ['Y', 'pi', 'C_G', 'C_E', 'Y_I']) ic[k] = perDay(ic[k]);
  ic.w_UB = ic.w_UB / days;
  return { ...c, periods_per_year: days, clock: { plan, window: days }, parameters: p, initial_conditions: ic };
}
