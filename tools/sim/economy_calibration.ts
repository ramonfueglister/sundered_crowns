// The calibration of a national economy for the port of BeforeIT.jl (economy feature 3, docs/ECONOMY_DESIGN.md).
//
// The port computes its parameters from a set of national accounts (src/calibration.rs of the port, BeforeIT.jl
// src/utils/calibration.jl): output, inputs and wages of each sector, consumption, government, trade, money and
// capital, and the series of the years before the start. For Austria in 2010 Eurostat has all of that. For England
// in 1356 the calibration table (data/economy/england_1356.json) holds what the sources give and marks what they do
// not. This file turns the table into the port's two inputs, parameters and initial conditions, by the port's own
// formulas. It adds no number of its own: every value is in the table.
//
// One period is one year (the port's `timescale` is 1: the amounts of a year are the amounts of a period).

export type Kind = 'source' | 'derived' | 'assumption';
export interface Entry<T> { value: T; kind: Kind; source: string }
type V3 = [number, number, number];

export interface CalibrationTable {
  case: string;
  year: number;
  scale: Entry<number>;
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

/** What the world server gives the engine (public/data/economy_england.json). */
export interface EconomyCalibration {
  case: string;
  /** the year the starting position stands for */
  year: number;
  scale: number;
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
  const disposable = sum(wages) + mixed - directTax;

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
    tau_INC: directTax / (sum(wages) + mixed), tau_FIRM: 0, tau_VAT: 0, tau_SIF: 0, tau_SIW: 0, tau_EXPORT: duty / X, tau_CF: 0, tau_G: 0,
    theta_UB: NO_BENEFIT, psi: sum(households) / disposable, psi_H: building / disposable, mu: r,
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
    D_I, L_I: 0, omega: b.omega, w_UB: 0, sb_inact: 0, sb_other: 0, D_H, K_H: dwellings, L_G: 0, E_k, E_CB: -D_I - D_H - E_k, D_RoW: 0, N_s: employees,
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
  return { case: t.case, year: t.year, scale: S, parameters, initial_conditions, accounts };
}
