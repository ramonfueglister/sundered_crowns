// The calibration of a national economy for the port of BeforeIT.jl (economy feature 3, docs/ECONOMY_DESIGN.md).
//
// The port computes its parameters from a set of national accounts (src/calibration.rs of the port, BeforeIT.jl
// src/utils/calibration.jl): output, inputs and wages of each sector, consumption, government, trade, money and
// capital, and the series of the years before the start. For Austria in 2010 Eurostat has all of that. For England
// in 1356 the calibration table (data/economy/england_1356.json) holds what the sources give and marks what they do
// not. This file turns the table into the port's two inputs, parameters and initial conditions, by the port's own
// formulas; the accounts of the start year come from src/sim/economy/accounts.ts. It adds no number of its own: every
// value is in the table.
//
// The table and `calibrateEconomy` are yearly (the port's `timescale` is 1: the amounts of a year are the amounts of a
// period). Since economy feature 4 the model computes one day per period: `dailyEconomy` (src/sim/economy/daily.ts)
// turns the yearly calibration into the daily one, by the rules listed there. Since feature 5 the world has no economy of England as a whole:
// every city is an economy of its own, calibrated from the table of England at the city's size (`cityTable`).
// Since feature 10 the world does that itself when it founds the economies (src/sim/systems/economy.ts): the persons
// of a city's economy are the persons of the city, so a city has as many of them as it has persons who work.

import {
  accountsOf,
  G,
  labourOf,
  roundHalfEven,
  sectors,
  startAccounts,
  sum,
  taxesOf,
  type Accounts,
  type Labour,
  type Taxes,
} from './accounts';

export type Kind = 'source' | 'derived' | 'assumption';
export interface Entry<T> {
  value: T;
  kind: Kind;
  source: string;
}
type V3 = [number, number, number];

export interface CalibrationTable {
  case: string;
  year: number;
  scale: Entry<number>;
  /** the daily clock of economy feature 4 */
  clock: { days_per_year: Entry<number>; plan_days: Entry<number> };
  /** what a city's table takes in place of England's (economy feature 5) */
  cities: {
    structure: Entry<string>;
    duty_shillings_per_sack: Entry<number>;
    unemployment_benefit: Entry<number>;
    /** how the firms of a city pay wages (economy feature 7): 'money' is a wage in money that never changes,
     *  'prices' the port's real wage that follows the consumer prices */
    wage: Entry<'money' | 'prices'>;
    /** how the firms of a city plan supply and price (economy feature 8): 'demand' is the demand pull of CANVAS,
     *  'costs' the rule of the paper */
    prices: Entry<'demand' | 'costs'>;
    /** the share of what a household holds above its target that it spends in a year (economy feature 15);
     *  0: a household spends out of its income only, as in the port */
    savings_spent_per_year: Entry<number>;
    /** what the crown of a city buys with (economy feature 16): 'series' by the random series of the paper,
     *  'revenue' with what it took in the period before */
    crown: Entry<'series' | 'revenue'>;
    /** who gets what a firm earns (economy feature 18): 'paper' the owner is paid the paper's profit and bears no
     *  loss, 'household' firm and owner are one household */
    owner: Entry<'paper' | 'household'>;
    /** the kilocalories a basket needs per day (economy feature 15): an adult is one basket, a child half of one */
    food_need_kcal: Entry<number>;
  };
  /** the routes between the cities (economy feature 17, src/sim/economy/routes.ts) */
  routes: {
    /** how far goods travel in a day by land, down and up a river, and by sea */
    km_per_day: Entry<{ land: number; river_down: number; river_up: number; sea: number }>;
    /** the days of labour that carry a tonne one kilometre */
    day_wages_per_tonne_km: Entry<{ land: number; river_down: number; river_up: number; sea: number }>;
    /** the tonnes of a real unit (a pound of the start year) of each sector's product */
    tonnes_per_pound: Entry<number[]>;
    /** by how much the stock the merchants keep falls with the price at the stall against the city's own price */
    stock_elasticity: Entry<number>;
    /** the regions of the world (geo.json) that have no way to the regions outside them in this year */
    apart: Entry<string[]>;
  };
  sectors: string[];
  inputs: {
    gdp_nominal_gbp_mn: Entry<number>;
    population_thousand: Entry<number>;
    value_added_share: Entry<V3>;
    labour_share: Entry<V3>;
    participation: Entry<{ men: number; women: number }>;
    income_gbp_mn: Entry<{
      wages: number;
      land_rents: number;
      house_rents: number;
      other_capital: number;
      net_national_income: number;
    }>;
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
    /** the persons of the labour force, counted (economy feature 10: the persons of a city who work, without the
     *  one without work at the start and the owner of the bank). Where it is given, it takes the place of the labour
     *  force computed from the people, `adult_share` and `participation`. England's table has none. */
    labour_force?: Entry<number>;
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
    /** the kilocalories per head and day behind what the households buy from agriculture (economy feature 15) */
    food_kcal_per_head: Entry<number>;
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

/** The port needs a positive definite covariance of its three shocks; output abroad and imports do not move. */
const NO_SHOCK = 1e-12;

/** y_t = α · y_(t−1) + β + ε by least squares, σ the standard deviation of the residuals: the port's
 *  `estimate_for_calibration_script`. */
export function ar1(y: readonly number[]): { alpha: number; beta: number; sigma: number } {
  const x = y.slice(0, -1),
    z = y.slice(1),
    n = z.length;
  const mx = sum(x) / n,
    mz = sum(z) / n;
  let sxz = 0,
    sxx = 0;
  for (let i = 0; i < n; i++) {
    sxz += (x[i] - mx) * (z[i] - mz);
    sxx += (x[i] - mx) ** 2;
  }
  const alpha = sxz / sxx,
    beta = mz - alpha * mx;
  const res = z.map((q, i) => q - alpha * x[i] - beta),
    mr = sum(res) / n;
  return { alpha, beta, sigma: Math.sqrt(sum(res.map((e) => (e - mr) ** 2)) / (n - 1)) };
}

/** The yearly calibration of a table: the accounts of its year, and the years before the start from its history.
 *
 *  `until` is the year the world starts in (economy feature 21): the series of the years before the start (output,
 *  inflation, the crown's purchases, exports) run from the first year of the history to `until`, each scaled to its
 *  value in `until`, and the rule of exports is estimated on them. That is the port's window: every series and every
 *  estimate runs from `estimation_date` to `calibration_date` and is scaled to the last (`get_params_and_initial_
 *  conditions`, src/calibration.rs of the port). A world of 1291 on the table of 1356 (src/sim/tables.ts) therefore
 *  knows the years 1281 to 1291 and not the plague after them. The one exception is the crown's rule: on 1281 to
 *  1291 its estimate has α = 1.126, no long-run mean, which the daily rule needs (`dailyEconomy`); it keeps the
 *  estimate of the table's whole history. Since feature 16 that rule sets only the crown's first day. */
export function calibrateEconomy(t: CalibrationTable, until: number = t.year): EconomyCalibration {
  checkHistory(t, until);
  const a = startAccounts(t),
    l = labourOf(t, a),
    x = taxesOf(t, a, l),
    p = pastOf(t, until, a);
  return {
    case: t.case,
    year: t.year,
    scale: t.scale.value,
    periods_per_year: 1,
    clock: { plan: 1, window: 1 },
    parameters: parametersOf(t, a, l, x, p),
    initial_conditions: initialConditionsOf(t, a, l, x, p),
    accounts: accountsOf(a, l, x),
  };
}

/** The years before the start, as the series of the port's window (see `calibrateEconomy`). */
interface Past {
  /** the years from the first of the history to the start */
  history: number[];
  /** output, inflation, the crown's purchases, exports and imports in those years, each at its level at the start */
  Y: number[];
  pi: number[];
  crownSeries: number[];
  exportSeries: number[];
  Y_I: number[];
  /** the AR(1) rules of the crown's purchases and of exports, on logarithms */
  arG: { alpha: number; beta: number; sigma: number };
  arE: { alpha: number; beta: number; sigma: number };
}

/** Throws unless the history has an entry for each of its years and three of them before a start in `until`. */
function checkHistory(t: CalibrationTable, until: number): void {
  const h = t.history,
    first = h.first_year,
    years = t.year - first; // the history covers first + 1 … year
  if (!(Number.isInteger(until) && until >= first + 3 && until <= t.year))
    throw new Error(
      `a start in ${until}: the history runs from ${first + 1} to ${t.year}, and an estimate needs three of its years`,
    );
  for (const k of [
    'real_gdp_gbp_mn_2013',
    'gdp_deflator_2013_100',
    'crown_revenue_gbp_thousand',
    'export_volume_gbp_mn_2013',
  ] as const) {
    if (h[k].length !== years + 1)
      throw new Error(`history.${k} has ${h[k].length} years, ${first} to ${t.year} are ${years + 1}`);
  }
}

/** The years before a start in `until`, each series scaled to its value in `until`. */
function pastOf(t: CalibrationTable, until: number, a: Accounts): Past {
  const h = t.history,
    first = h.first_year;
  const at = (series: readonly number[], year: number) => series[year - first];
  const upTo = (last: number) => Array.from({ length: last - first }, (_, k) => first + 1 + k);
  const history = upTo(until);
  const realRevenue = (y: number) => at(h.crown_revenue_gbp_thousand, y) / at(h.gdp_deflator_2013_100, y);
  const level = (total: number, f: (y: number) => number, ys = history) => ys.map((y) => (total * f(y)) / f(until));
  const crownSeries = level(sum(a.crown), realRevenue);
  const exportSeries = level(a.X, (y) => at(h.export_volume_gbp_mn_2013, y));
  return {
    history,
    Y: history.map((y) => (sum(a.output) * at(h.real_gdp_gbp_mn_2013, y)) / at(h.real_gdp_gbp_mn_2013, until)),
    pi: history.map((y) => Math.log(at(h.gdp_deflator_2013_100, y) / at(h.gdp_deflator_2013_100, y - 1))),
    crownSeries,
    exportSeries,
    Y_I: history.map(() => sum(a.imports)),
    arG: ar1(level(sum(a.crown), realRevenue, upTo(t.year)).map(Math.log)),
    arE: ar1(exportSeries.map(Math.log)),
  };
}

/** The port's `Parameters` (its JSON keys). */
function parametersOf(t: CalibrationTable, a: Accounts, l: Labour, x: Taxes, p: Past): Record<string, unknown> {
  const i = t.inputs,
    beta = i.output_per_intermediate_input.value,
    A = i.input_matrix.value,
    b = i.behaviour.value;
  const { output, capital, used, wages, surplus, exports, X, households, duty, building } = a;
  const { firms, employees, I, N } = l;
  const { tau_INC, tau_SIW, benefit, mixed, disposable } = x;
  const { arG, arE } = p;
  return {
    G,
    T_prime: p.history.length,
    H_act: N + i.unemployed.value + I + BANK_OWNERS,
    H_inact: 1,
    J: roundHalfEven(I / 4),
    L: roundHalfEven(I / 2),
    I_s: firms,
    alpha_s: sectors.map((g) => output[g] / employees[g]),
    beta_s: beta,
    kappa_s: sectors.map((g) => output[g] / capital[g] / b.omega),
    delta_s: sectors.map((g) => used[g] / capital[g] / b.omega),
    w_s: sectors.map((g) => wages[g] / employees[g]),
    tau_Y_s: [0, 0, 0],
    tau_K_s: [0, 0, 0],
    tau_INC,
    tau_FIRM: 0,
    tau_VAT: 0,
    tau_SIF: 0,
    tau_SIW,
    tau_EXPORT: duty / X,
    tau_CF: 0,
    tau_G: 0,
    theta_UB: benefit.theta_UB,
    psi: sum(households) / disposable,
    psi_H: building / disposable,
    mu: i.interest.value,
    theta_DIV: mixed / sum(surplus.map((s) => Math.max(0, s))),
    theta: b.theta,
    zeta: b.zeta,
    zeta_LTV: b.zeta_LTV,
    zeta_b: b.zeta_b,
    b_CF_g: i.investment_share.value,
    b_CFH_g: i.dwelling_share.value,
    b_HH_g: households.map((v) => v / sum(households)),
    c_G_g: i.crown_purchase_share.value,
    c_E_g: exports.map((e) => e / X),
    c_I_g: i.import_share.value,
    a_sg: A,
    C: [
      [NO_SHOCK, 0, 0],
      [0, arE.sigma * arE.sigma, 0],
      [0, 0, NO_SHOCK],
    ],
    alpha_G: arG.alpha,
    beta_G: arG.beta,
    sigma_G: arG.sigma,
    alpha_E: arE.alpha,
    beta_E: arE.beta,
    sigma_E: arE.sigma,
    alpha_I: 1,
    beta_I: 0,
    sigma_I: 0,
    alpha_pi_EA: 1,
    beta_pi_EA: 0,
    sigma_pi_EA: 0,
    alpha_Y_EA: 1,
    beta_Y_EA: 0,
    sigma_Y_EA: 0,
    r_G: 0,
    rho: 1,
    r_star: 0,
    pi_star: 0,
    xi_pi: 0,
    xi_gamma: 0,
    S: G,
    T: 12,
    T_max: 12,
  };
}

/** The port's `InitialConditions` (its JSON keys). */
function initialConditionsOf(t: CalibrationTable, a: Accounts, l: Labour, x: Taxes, p: Past): Record<string, unknown> {
  const i = t.inputs,
    coin = a.coin;
  const D_H = i.coin_split.value.households * coin,
    D_I = i.coin_split.value.firms * coin,
    E_k = i.bank_equity_of_coin.value * coin;
  return {
    D_I,
    L_I: 0,
    omega: i.behaviour.value.omega,
    w_UB: x.benefit.w_UB,
    sb_inact: 0,
    sb_other: 0,
    D_H,
    K_H: a.dwellings,
    L_G: 0,
    E_k,
    E_CB: -D_I - D_H - E_k,
    D_RoW: 0,
    N_s: l.employees,
    Y: p.Y,
    pi: p.pi,
    Y_EA: i.rest_of_the_world.value.output,
    pi_EA: i.rest_of_the_world.value.inflation,
    r_bar: 0,
    C_G: p.crownSeries,
    C_E: p.exportSeries,
    Y_I: p.Y_I,
  };
}

/** What the food a basket needs costs per day at the prices of the start, in £ (economy feature 15,
 *  src/sim/systems/household.ts). The table says what its households buy from agriculture in a year and how many
 *  kilocalories per head and day that is (`food_kcal_per_head`); a basket needs `food_need_kcal` of them. The scale
 *  drops out: the amount is per person. */
export function foodNeedCost(t: CalibrationTable): number {
  const a = calibrateEconomy(t).accounts as { households: number[]; people: number };
  const perHeadAndDay = a.households[0] / a.people / t.clock.days_per_year.value;
  return (perHeadAndDay * t.cities.food_need_kcal.value) / t.inputs.food_kcal_per_head.value;
}

/** The owners of the bank among the active persons of the model: the port has one bank (`n_banks`), and the
 *  calibration counts its owner as the one active person who is neither in a firm nor without work. */
const BANK_OWNERS = 1;

/** The active persons of the model that a calibration asks for (`H_act`): the workers, the owner of every firm and
 *  the owner of the bank. */
export const activePersons = (c: EconomyCalibration): number => (c.parameters as { H_act: number }).H_act;

/** The table of a city with `people` inhabitants (economy feature 5): England's table at the city's share of
 *  England's people, so that the model computes the city at the scale of the table (1:100), with the duty
 *  between cities in place of England's wool duty, and with the cities' rate of the model's unemployment benefit
 *  (economy feature 6; 0 since feature 9). All three are assumptions of the table (`cities`).
 *
 *  `working` is the number of persons of the city who work (economy feature 10): the model then has exactly that
 *  many active persons (the labour force, the one person without work at the start and the owner of the bank).
 *  Without it the labour force is computed from the people as for England. */
export function cityTable(t: CalibrationTable, people: number, working?: number): CalibrationTable {
  if (!(people > 0)) throw new Error(`a city of ${people} people`);
  const c = structuredClone(t);
  if (working !== undefined)
    c.inputs.labour_force = {
      value: working - t.inputs.unemployed.value - BANK_OWNERS,
      kind: 'derived',
      source:
        'the persons of the city who work (src/sim/systems/work.ts), without the one without work at the start and the owner of the bank',
    };
  c.scale.value = (t.scale.value * people) / (t.inputs.population_thousand.value * 1e3);
  c.inputs.wool_export.value.duty_shillings_per_sack = t.cities.duty_shillings_per_sack.value;
  c.inputs.unemployment_benefit = structuredClone(t.cities.unemployment_benefit);
  return c;
}
