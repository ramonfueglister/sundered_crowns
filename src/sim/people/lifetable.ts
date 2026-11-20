// The Coale-Demeny "West" model life tables (Coale & Demeny 1966, second edition with Vaughan 1983): the probability
// of dying in each age group follows from one number, the life expectancy at age 10 of the level, by regression on
// the tables the model was fitted to. The coefficients and the extension past age 80 are the published ones, read in
// the R package demogR (cdmltw, J. H. Jones, with the corrections of J. Oeppen 2018:
// https://raw.githubusercontent.com/hanase/demogR/master/R/cdmltw.R). Feature 1 of the people uses level 3
// (docs/PEOPLE_DESIGN.md).

export type Sex = 'f' | 'm';

/** Life expectancy at age 10 of the levels 1 … 25 (Oeppen's optimisation, demogR). */
const E10: Record<Sex, number[]> = {
  f: [
    21.40549, 25.32904, 28.86351, 32.07396, 35.01032, 37.71173, 40.20992, 42.53003, 44.69388, 46.7183, 48.61905,
    50.40814, 52.08187, 53.35198, 54.56192, 55.83317, 57.16274, 58.54485, 59.97243, 61.43625, 62.99381, 65.498,
    68.71056, 72.92253, 78.62273,
  ],
  m: [
    21.86761, 25.4474, 28.67272, 31.60223, 34.28159, 36.74631, 39.02583, 41.14277, 43.11689, 44.96458, 46.69839,
    48.33115, 49.85796, 51.01729, 52.12115, 53.28135, 54.49441, 55.75599, 57.05851, 58.39447, 59.81638, 62.10227,
    65.03413, 68.87841, 74.0812,
  ],
};
/** Regression of nqx on e10, for the groups 0, 1–4, 5–9, …, 75–79: linear (a + b·e10) and log-linear (10^(a1 + b1·e10) / 10000). */
const COEF: Record<Sex, { a: number[]; b: number[]; a1: number[]; b1: number[] }> = {
  f: {
    a: [
      0.53774, 0.39368, 0.10927, 0.08548, 0.10979, 0.1358, 0.15134, 0.17032, 0.18464, 0.1939, 0.20138, 0.2535, 0.31002,
      0.43445, 0.53481, 0.69394, 0.84589,
    ],
    b: [
      -0.008044, -0.006162, -0.001686, -0.00132, -0.001672, -0.002051, -0.002276, -0.002556, -0.002745, -0.002828,
      -0.002831, -0.003487, -0.004118, -0.005646, -0.00646, -0.007713, -0.008239,
    ],
    a1: [
      5.8992, 7.4576, 6.2018, 5.9627, 5.9335, 5.9271, 5.8145, 5.6578, 5.3632, 4.96, 4.5275, 4.4244, 4.3131, 4.3439,
      4.2229, 4.1838, 4.1294,
    ],
    b1: [
      -0.05406, -0.08834, -0.0741, -0.07181, -0.06812, -0.06577, -0.06262, -0.05875, -0.05232, -0.0438, -0.03436,
      -0.03004, -0.02554, -0.02295, -0.01773, -0.01376, -0.00978,
    ],
  },
  m: {
    a: [
      0.63726, 0.40548, 0.10393, 0.07435, 0.0988, 0.14009, 0.15785, 0.1826, 0.21175, 0.25049, 0.27894, 0.33729, 0.38425,
      0.48968, 0.59565, 0.73085, 0.89876,
    ],
    b: [
      -0.009958, -0.006653, -0.001662, -0.001183, -0.001539, -0.002183, -0.002479, -0.002875, -0.003312, -0.003864,
      -0.004158, -0.004856, -0.00519, -0.0063, -0.007101, -0.007911, -0.008695,
    ],
    a1: [
      5.8061, 7.1062, 5.4472, 5.0654, 4.87, 5.0677, 5.266, 5.3438, 5.2792, 5.0415, 4.6666, 4.4506, 4.2202, 4.1851,
      4.1249, 4.1051, 4.1133,
    ],
    b1: [
      -0.05338, -0.08559, -0.06295, -0.05817, -0.0507, -0.05156, -0.05471, -0.05511, -0.05229, -0.04573, -0.03637,
      -0.02961, -0.02256, -0.01891, -0.01491, -0.01161, -0.00895,
    ],
  },
};
/** Hazard at age 105 = M105[sex] + 1.75 · 5q75 (Coale & Guo 1989, female constant; male constant corrected by Oeppen). */
const M105: Record<Sex, number> = { f: 0.613, m: 0.551 };
/** Start of the age groups 0, 1, 5, 10, …, 75. */
const X = [0, 1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75];

/** The probabilities of dying in the 17 groups 0, 1–4, …, 75–79 of a level: the linear model where it lies below the
 *  log-linear one and falls more steeply, else the log-linear one, and the mean of both where the linear one lies
 *  above (the published rule for the crossover). */
function nqx(sex: Sex, level: number): number[] {
  const e10 = E10[sex][level - 1],
    c = COEF[sex];
  return X.map((_, j) => {
    const lin = c.a[j] + c.b[j] * e10,
      log = Math.pow(10, c.a1[j] + c.b1[j] * e10) / 10000;
    const slope = c.b[j] / c.b1[j] / Math.LN10 / log;
    return lin <= log ? (slope < 1 ? lin : log) : (lin + log) / 2;
  });
}

/** Survivorship l(a) at whole years a = 0 … 120 for one sex and level (l(0) = 1). Within the groups up to 80 the force
 *  of mortality is taken as constant, which is how a group's q turns into survival year by year; past 80 the
 *  Gompertz extension of Coale and Guo, which ends near age 105. */
export function survivorship(sex: Sex, level: number): Float64Array {
  if (!Number.isInteger(level) || level < 1 || level > 25) throw new Error(`no West level ${level}`);
  const q = nqx(sex, level),
    l = new Float64Array(121);
  l[0] = 1;
  for (let j = 0; j < X.length; j++) {
    const x0 = X[j],
      n = j + 1 < X.length ? X[j + 1] - x0 : 5,
      mu = -Math.log(1 - q[j]) / n;
    for (let a = x0 + 1; a <= x0 + n; a++) l[a] = l[x0] * Math.exp(-mu * (a - x0));
  }
  // 80+: the hazard at 77.5 from the last group, then a Gompertz curve to the hazard at 105
  const q75 = q[16],
    l75 = l[75],
    nL75 = 5 * l75 * (1 - q75) + 2.5 * l75 * q75;
  const m77 = (l75 * q75) / nL75,
    m105 = M105[sex] + 1.75 * q75;
  const k = Math.log(m105 / m77) / 27.5,
    m80 = m77 * Math.exp(k * 2.5);
  for (let a = 81; a <= 120; a++) l[a] = l[80] * Math.exp((-m80 / k) * (Math.exp(k * (a - 80)) - 1));
  return l;
}

/** Person-years lived in each year of age, L(a) = ∫ l over [a, a+1) (trapezoid; in the first year the published
 *  a0 for infants who die, 0.05 + 3·q0 for women, 0.0425 + 2.875·q0 for men, below q0 = 0.1, else 0.35 and 0.33). */
export function personYears(sex: Sex, level: number): Float64Array {
  const l = survivorship(sex, level),
    L = new Float64Array(120);
  const q0 = 1 - l[1];
  const a0 = sex === 'f' ? (q0 < 0.1 ? 0.05 + 3 * q0 : 0.35) : q0 < 0.1 ? 0.0425 + 2.875 * q0 : 0.33;
  L[0] = l[1] + a0 * (l[0] - l[1]);
  for (let a = 1; a < 120; a++) L[a] = (l[a] + l[a + 1]) / 2;
  return L;
}

/** Life expectancy at birth: all person-years over the newborn. */
export function lifeExpectancy(sex: Sex, level: number): number {
  return personYears(sex, level).reduce((s, v) => s + v, 0);
}

// --- The life table of England around 1300 (people feature 2, part 2; docs/PEOPLE_DESIGN.md) ---
// La Poutré & Janssen 2021, "A two-parameter hazard function to describe age patterns of mortality in ancient
// Northwestern Europe", Genus 77(1):12, equations 3 and 11, with the two values fitted to the English tenants-in-chief
// born before 1276 (their table 2), which are also the defaults of the simulation of La Poutré 2023 (English
// population 1086–1377, thesis Groningen; program code, Unit2) and of La Poutré & Paping 2025:
//
//   μ(x) = (x + 1.5)^(−ω) + e^θ · [1 + e^(x−16) / (1 + e^(x−16))] + e^(β(x−100)) / (1 + e^(β(x−100)))
//   ω = 119.3·β − 1.01·θ − 14.5, at least 2.7
//
// One table for both sexes. The data have no deaths below 15: the mortality of children is what the formula gives.
export const LPJ = { beta: 0.064, theta: -6.3 } as const;
const OMEGA = Math.max(2.7, 119.3 * LPJ.beta - 1.01 * LPJ.theta - 14.5);
/** The cumulative hazard up to the age x (years), the integral of μ. */
function cumulativeHazard(x: number): number {
  const L = (a: number) =>
    Math.pow(a + 1.5, 1 - OMEGA) / (1 - OMEGA) +
    Math.exp(LPJ.theta) * (a + Math.log(1 + Math.exp(a - 16))) +
    Math.log(1 + Math.exp(LPJ.beta * (a - 100))) / LPJ.beta;
  return L(x) - L(0);
}
/** The share of the newborn who reach the age x (years, not only whole ones). */
export const survival = (x: number): number => (x >= 120 ? 0 : Math.exp(-cumulativeHazard(Math.max(0, x))));
/** Survivorship l(a) at whole years a = 0 … 120 (l(0) = 1, nobody lives past 120). */
export function lifeTable(): Float64Array {
  const l = new Float64Array(121);
  for (let a = 0; a < 120; a++) l[a] = survival(a);
  return l;
}
/** Person-years lived in each year of age, the integral of the survival over [a, a + 1) (Simpson, 20 steps). */
export function yearsLived(): Float64Array {
  const L = new Float64Array(120),
    n = 20;
  for (let a = 0; a < 120; a++) {
    let sum = survival(a) + survival(a + 1 - 1e-12);
    for (let k = 1; k < n; k++) sum += (k % 2 ? 4 : 2) * survival(a + k / n);
    L[a] = sum / (3 * n);
  }
  return L;
}
/** Years of life left at the age a. */
export function yearsLeft(a: number): number {
  const L = yearsLived();
  let sum = 0;
  for (let x = a; x < 120; x++) sum += L[x];
  return sum / survival(a);
}
