// The national accounts of a calibration table at the scale of the model, and the persons, firms and taxes they give:
// the first half of the calibration of a city's economy (src/sim/economy/calibration.ts), by the formulas of the port
// of BeforeIT.jl (src/calibration.rs of the port, BeforeIT.jl src/utils/calibration.jl).
import type { CalibrationTable } from './calibration';

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
export function unemploymentBenefit(
  rate: number,
  taxOnIncome: number,
  taxOnWages: number,
  meanWage: number,
): { theta_UB: number; w_UB: number } {
  if (!(rate >= 0 && rate < 1)) throw new Error(`an unemployment benefit of ${rate} of the wage`);
  if (rate === 0) return { theta_UB: NO_BENEFIT, w_UB: 0 };
  const theta_UB = rate * (1 - taxOnIncome) * (1 - taxOnWages);
  return { theta_UB, w_UB: theta_UB * meanWage };
}

export const sum = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0);

/** Rounds to the nearest whole number, a half to the even one (Julia's `round`, which the port's calibration uses). */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x),
    d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** `total` whole units split by `shares` (which sum to 1) so that the parts sum to `total`: every part gets the whole
 *  number below its share, and the units left over go to the parts with the largest remainders, the first of equal
 *  ones first (the method of the largest remainder). */
function apportion(total: number, shares: readonly number[]): number[] {
  if (!(Number.isInteger(total) && total >= 0)) throw new Error(`${total} is not a number of units to split`);
  const exact = shares.map((s) => total * s),
    parts = exact.map(Math.floor);
  const order = shares.map((_, k) => k).sort((a, b) => exact[b] - parts[b] - (exact[a] - parts[a]) || a - b);
  for (let k = 0, left = total - sum(parts); k < left; k++) parts[order[k % order.length]]++;
  return parts;
}

/** the sectors of the model: the port's `G`, and their indices */
export const G = 3;
export const sectors = [0, 1, 2];

/** The accounts of a table's year at the scale of the model (£ of the year); a list holds a value per sector. */
export interface Accounts {
  gdp: number;
  people: number;
  revenue: number;
  coin: number;
  /** the wool duty, the one tax on products of the model */
  duty: number;
  /** value added and output of each sector */
  va: number[];
  output: number[];
  /** the fixed capital of each sector, and what of it is used up in a year */
  capital: number[];
  used: number[];
  wages: number[];
  /** what is left of value added to the owners */
  surplus: number[];
  exports: number[];
  /** all exports */
  X: number;
  imports: number[];
  crown: number[];
  investment: number[];
  /** the houses, what is built on them in a year, and how the sectors share that */
  dwellings: number;
  building: number;
  built: number[];
  households: number[];
}

/** The persons of the model: the labour force, and the firms and employees of each sector. */
export interface Labour {
  labourForce: number;
  firms: number[];
  employees: number[];
  /** all firms, and all employees */
  I: number;
  N: number;
}

/** The taxes of the model, the benefit of a person without work, and what the households spend from. */
export interface Taxes {
  directTax: number;
  /** the owners' income: the surplus of all sectors */
  mixed: number;
  tau_INC: number;
  tau_SIW: number;
  benefit: { theta_UB: number; w_UB: number };
  disposable: number;
}

/** The accounts of the start year at the scale of the model. */
export function startAccounts(t: CalibrationTable): Accounts {
  const i = t.inputs,
    S = t.scale.value;
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
  const duty = ((i.wool_export.value.sacks * i.wool_export.value.duty_shillings_per_sack) / SHILLINGS_PER_POUND) * S;
  const beta = i.output_per_intermediate_input.value,
    A = i.input_matrix.value,
    dep = i.depreciation.value;

  // GDP at market prices is value added plus the taxes on products; the wool duty is the one such tax of the model
  const va = i.value_added_share.value.map((s) => s * (gdp - duty));
  const inputs = sectors.map((g) => va[g] / (beta[g] - 1)); // inputs bought by each sector
  const output = sectors.map((g) => va[g] + inputs[g]);
  const supplied = sectors.map((row) => sum(sectors.map((c) => A[row][c] * inputs[c]))); // inputs sold by each sector
  const capital = va.map((v) => (capitalShare / r) * v);
  const used = capital.map((k) => dep * k); // consumption of fixed capital
  const exports = [wool, cloth, 0],
    X = sum(exports);
  const imports = i.import_share.value.map((c) => c * X);
  const crown = i.crown_purchase_share.value.map((c) => c * revenue);
  const investment = i.investment_share.value.map((s) => s * sum(used));
  const dwellings = (houseShare / r) * gdp,
    building = dep * dwellings;
  const built = i.dwelling_share.value.map((s) => s * building);
  const households = sectors.map(
    (g) => output[g] + imports[g] - supplied[g] - crown[g] - investment[g] - built[g] - exports[g],
  );
  if (!(Math.min(...households) > 0)) throw new Error(`a sector has nothing left for the households: ${households}`);
  const wages = va.map((v) => wageShare * v);
  const surplus = sectors.map((g) => va[g] - wages[g] - used[g]);
  return {
    gdp,
    people,
    revenue,
    coin,
    duty,
    va,
    output,
    capital,
    used,
    wages,
    surplus,
    exports,
    X,
    imports,
    crown,
    investment,
    dwellings,
    building,
    built,
    households,
  };
}

/** The labour force: counted where the table gives it (the persons of a city who work, economy feature 10: the
 *  sectors then share exactly those persons), else from the people, the share of adults and their participation. */
export function labourOf(t: CalibrationTable, a: Accounts): Labour {
  const i = t.inputs;
  const counted = i.labour_force?.value;
  if (counted !== undefined && !(Number.isInteger(counted) && counted >= 2 * G))
    throw new Error(`a labour force of ${counted} persons: every sector needs a firm and a person it employs`);
  const labourForce =
    counted ??
    roundHalfEven((a.people * i.adult_share.value * (i.participation.value.men + i.participation.value.women)) / 2);
  const persons =
    counted !== undefined
      ? apportion(counted, i.labour_share.value)
      : i.labour_share.value.map((s) => roundHalfEven(labourForce * s));
  const firms = persons.map((p) => Math.max(1, roundHalfEven(p / i.persons_per_firm.value)));
  const employees = sectors.map((g) => persons[g] - firms[g]);
  if (!(Math.min(...employees) > 0))
    throw new Error(`a sector has nobody to employ: ${persons} persons in ${firms} firms`);
  return { labourForce, firms, employees, I: sum(firms), N: sum(employees) };
}

/** The direct tax is what the crown takes in besides the duty, on wages and the owners' income alike. */
export function taxesOf(t: CalibrationTable, a: Accounts, l: Labour): Taxes {
  const i = t.inputs;
  const directTax = a.revenue - a.duty;
  const mixed = sum(a.surplus);
  const tau_INC = directTax / (sum(a.wages) + mixed),
    tau_SIW = 0;
  const benefit = unemploymentBenefit(i.unemployment_benefit.value, tau_INC, tau_SIW, sum(a.wages) / l.N);
  // The income households spend from includes the benefits paid at the start, as in the original's calibration
  // (disposable income with social benefits; src/calibration.rs, lines 1150 and 1282 of the port). Households
  // then buy at the start what the accounts say, and the accounts of the first day add up.
  const disposable = sum(a.wages) + mixed - directTax + i.unemployed.value * benefit.w_UB;
  return { directTax, mixed, tau_INC, tau_SIW, benefit, disposable };
}

/** The national accounts the parameters were computed from, with the check that they add up. */
export function accountsOf(a: Accounts, l: Labour, x: Taxes): Record<string, number | number[]> {
  const { households, crown, investment, building, X, duty, imports, gdp } = a;
  return {
    gdp,
    people: a.people,
    labourForce: l.labourForce,
    firms: l.firms,
    employees: l.employees,
    output: a.output,
    valueAdded: a.va,
    wages: a.wages,
    capital: a.capital,
    dwellings: a.dwellings,
    households,
    crown: sum(crown),
    investment: sum(investment),
    building,
    exports: X,
    imports: sum(imports),
    revenue: a.revenue,
    duty,
    directTax: x.directTax,
    coin: a.coin,
    // GDP by its uses (exports with their duty) minus GDP: 0 up to rounding
    gdpCheck: sum(households) + sum(crown) + sum(investment) + building + X + duty - sum(imports) - gdp,
  };
}
