// The calibration of a city's economy with one day as the period (economy feature 4), from the yearly one of
// src/sim/economy/calibration.ts.
import { calibrateEconomy, type CalibrationTable, type EconomyCalibration } from './calibration';

/** the entries of the port's parameters that a day changes, as `calibrateEconomy` writes them */
interface DailyParameters {
  alpha_s: number[];
  kappa_s: number[];
  delta_s: number[];
  w_s: number[];
  mu: number;
  theta: number;
  alpha_G: number;
  beta_G: number;
  sigma_G: number;
  alpha_E: number;
  beta_E: number;
  sigma_E: number;
  C: number[][];
}
/** the entries of the initial conditions that a day changes */
interface DailyConditions {
  Y: number[];
  pi: number[];
  C_G: number[];
  C_E: number[];
  Y_I: number[];
  w_UB: number;
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
  if (!(Number.isInteger(days) && days > 1 && Number.isInteger(plan) && plan >= 1))
    throw new Error(`a year of ${days} days and a plan every ${plan} days`);
  if (c.periods_per_year !== 1) throw new Error('the daily calibration starts from the yearly one');
  // (cast: the keys are those `calibrateEconomy` writes; the engine takes the rest as it is)
  const p = structuredClone(c.parameters) as Record<string, unknown> & DailyParameters,
    ic = structuredClone(c.initial_conditions) as Record<string, unknown> & DailyConditions;
  const perDay = (v: number[]) => v.map((x) => x / days);
  for (const k of ['alpha_s', 'kappa_s', 'delta_s', 'w_s'] as const) p[k] = perDay(p[k]);
  p.mu = (1 + p.mu) ** (1 / days) - 1;
  p.theta = p.theta / days;
  for (const s of ['G', 'E'] as const) {
    const a: number = p[`alpha_${s}`],
      b: number = p[`beta_${s}`],
      sigma: number = p[`sigma_${s}`];
    if (!(a > 0 && a < 1))
      throw new Error(
        `the AR(1) rule of ${s} has α = ${a}: only a rule with a long-run mean can be turned into a daily one`,
      );
    const ad = a ** (1 / days),
      mean = b / (1 - a) - Math.log(days);
    p[`alpha_${s}`] = ad;
    p[`beta_${s}`] = mean * (1 - ad);
    p[`sigma_${s}`] = sigma * Math.sqrt((1 - ad * ad) / (1 - a * a));
  }
  p.C[1][1] = p.sigma_E * p.sigma_E;
  for (const k of ['Y', 'pi', 'C_G', 'C_E', 'Y_I'] as const) ic[k] = perDay(ic[k]);
  ic.w_UB = ic.w_UB / days;
  return { ...c, periods_per_year: days, clock: { plan, window: days }, parameters: p, initial_conditions: ic };
}

/** The yearly calibration of a table turned into days, with the clock of the table (economy feature 4), for a world
 *  that starts in `until` (economy feature 21). */
export function dailyCalibration(t: CalibrationTable, until: number = t.year): EconomyCalibration {
  return dailyEconomy(calibrateEconomy(t, until), t.clock.days_per_year.value, t.clock.plan_days.value);
}
