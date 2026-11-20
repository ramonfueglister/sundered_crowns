// The rules of marriage and birth of England around 1300 (people feature 2, part 2; docs/PEOPLE_DESIGN.md), after
// La Poutré & Paping 2025 ("English familial demography c. 1300: a reconstruction", Social Science History 49(2)) and
// the program of the simulation behind it (La Poutré 2023, English population 1086–1377, thesis Groningen, program
// code): a wedding only fills a household that has fallen vacant, the brides have the ages of the curve of Coale and
// McNeil, and a wife bears a child every 33 months, less often as she nears 45.
import { lifeTable, yearsLived } from './lifetable';

/** Mean age of the brides, and the age before which nobody marries (La Poutré & Paping 2025; program: 24 and 15.5). */
export const BRIDE_AGE = { mean: 24, min: 15.5 } as const;
/** The curve gives brides from 16 on; past 60 its weight is nothing (assumption: the program runs it to 100). */
export const BRIDE_YEARS: readonly [number, number] = [16, 60];
/** Years a husband is older than his wife: men marry at about 27, women at 24 (La Poutré & Paping 2025). */
export const GROOM_OLDER = 3;
/** Nobody takes a husband younger than this (assumption, no source: the program has no men). */
export const GROOM_AGE_MIN = 18;
/** A bride or a groom is looked for this many years around the age wanted (assumption: a town is small, so the
 *  person of exactly the age may not be there). */
export const AGE_WINDOW = { bride: 2.5, groom: 10 } as const;
/** The age at which a wife bears no more (program: FertilityThreshold = 45). */
export const FERTILE_TO = 45;
/** Years between two births of a wife at her most fertile: 33 months (La Poutré & Paping 2025: 0.33 births a year
 *  = (1 − 10 % widows) / 2.75 years). */
export const BIRTH_INTERVAL = 2.75;
/** No two births of a woman lie closer than a pregnancy (assumption, no source: nine months). */
export const PREGNANCY = 0.75;
/** A widow younger than this marries again (assumption, no source for 1300: the program has no widows, the paper
 *  counts 10 % of the housewives as widows; with this rule the world has about 15 %, without it 32 %). */
export const WIDOW_REMARRIES_BELOW = 45;
/** Persons per household (La Poutré & Paping 2025: 5.8): a town is founded with this many persons per household. */
const HOUSEHOLD = 5.8;
/** Boys per girl at birth (assumption: the usual biological value; no source opened). */
export const SEX_RATIO_AT_BIRTH = 1.05;

/** The curve of Coale and McNeil as the program has it: the weight of the age x among the brides. */
function coaleMcNeil(x: number): number {
  const k = (BRIDE_AGE.mean - BRIDE_AGE.min) / 11.36,
    z = x - BRIDE_AGE.min - 6.06 * k;
  return Math.exp((-0.174 / k) * z - Math.exp((-0.288 / k) * z));
}
/** The share of the brides at each whole year of age (0 outside BRIDE_YEARS), and its running sum. */
export const BRIDES: { share: Float64Array; cdf: Float64Array } = (() => {
  const share = new Float64Array(BRIDE_YEARS[1] + 1),
    cdf = new Float64Array(BRIDE_YEARS[1] + 1);
  let sum = 0;
  for (let a = BRIDE_YEARS[0]; a <= BRIDE_YEARS[1]; a++) sum += share[a] = coaleMcNeil(a);
  let run = 0;
  for (let a = 0; a <= BRIDE_YEARS[1]; a++) {
    share[a] /= sum;
    cdf[a] = run += share[a];
  }
  return { share, cdf };
})();
/** The age of a bride for the draw u in [0, 1): a year of the curve and a place within the year. */
export function brideAge(u: number): number {
  let a = BRIDE_YEARS[0];
  while (a < BRIDE_YEARS[1] && BRIDES.cdf[a] <= u) a++;
  const lo = a > 0 ? BRIDES.cdf[a - 1] : 0;
  return a + Math.min(0.999, (u - lo) / Math.max(1e-12, BRIDES.share[a]));
}

/** How fertile a wife of the age a is against her most fertile (the program: 1 − e^(4.6·((a − 15)/30 − 1)), nothing
 *  from 45 on). */
export const fertility = (a: number): number =>
  a < 15 || a >= FERTILE_TO ? 0 : 1 - Math.exp(4.6 * ((a - 15) / (FERTILE_TO - 15) - 1));

/** Years until the next birth of a wife of the age `age`, for the draw u in [0, 1); Infinity when she bears no more.
 *  The births of a wife come at the rate fertility(a) / BIRTH_INTERVAL a year. `pregnancy`: the first nine months
 *  are free of births and the rate after them is as much higher (after a birth or a wedding); without it the plain
 *  rate from today (a wife of the founding, who is somewhere between two births). */
export function yearsToBirth(age: number, u: number, pregnancy = true): number {
  let need = -Math.log(1 - u),
    t = pregnancy ? PREGNANCY : 0;
  for (;;) {
    const a = age + t;
    if (a >= FERTILE_TO) return Infinity;
    const f = fertility(a),
      mean = BIRTH_INTERVAL / f - (pregnancy ? PREGNANCY : 0),
      rate = 1 / mean;
    const step = Math.min(1 / 12, FERTILE_TO - a); // the rate is taken as constant over a month
    if (rate * step >= need) return t + need / rate;
    need -= rate * step;
    t += step;
  }
}

/** The share of the women of each whole year of age who are housewives in a population that does not grow: the
 *  households by the age of the wife as the program builds them at its start (RR[a] = (1 − q[a])·RR[a − 1] + the
 *  curve of the brides), over the women of that age of the stationary population, with HOUSEHOLD persons a
 *  household. */
export function housewives(): Float64Array {
  const l = lifeTable(),
    L = yearsLived(),
    out = new Float64Array(120),
    rr = new Float64Array(120);
  let sumRR = 0,
    sumL = 0;
  for (let a = BRIDE_YEARS[0]; a < 120; a++) {
    rr[a] = (l[a + 1] / l[a] || 0) * rr[a - 1] + (a <= BRIDE_YEARS[1] ? coaleMcNeil(a) : 0);
    sumRR += rr[a];
  }
  for (let a = 0; a < 120; a++) sumL += L[a];
  const women = 1 / (1 + SEX_RATIO_AT_BIRTH);
  for (let a = BRIDE_YEARS[0]; a < 120; a++) out[a] = Math.min(1, rr[a] / sumRR / HOUSEHOLD / ((women * L[a]) / sumL));
  return out;
}
