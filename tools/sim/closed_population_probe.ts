// Probe for part 2 of people feature 2 (docs/PEOPLE_DESIGN.md), not part of the game: which combinations of
// mortality, age at marriage, level of natural fertility and remarriage keep a closed population stable. A
// population of 20,000 persons runs for 300 years in steps of a year with the marriage rule of the founding (a woman
// who has reached her age of marriage takes the free man nearest to her age plus the difference of the mean ages);
// the growth is that of the last 200 years. npx tsx tools/sim/closed_population_probe.ts
import { survivorship } from '../../src/sim/people/lifetable';
let seed = 12345;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return (seed + 0.5) / 4294967296;
};
const norm = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const nA = (a: number) =>
  a < 15
    ? 0
    : a < 16
      ? 0.325
      : a < 17
        ? 0.375
        : a < 18
          ? 0.421
          : a < 19
            ? 0.46
            : a < 20
              ? 0.475
              : a < 25
                ? 0.46
                : a < 30
                  ? 0.431
                  : a < 35
                    ? 0.395
                    : a < 40
                      ? 0.322
                      : a < 45
                        ? 0.167
                        : a < 50
                          ? 0.024
                          : 0;
function run(
  level: number,
  mf: number,
  mm: number,
  M: number,
  remarry: boolean,
  celib: number,
  years = 300,
  N0 = 20000,
) {
  const l = { 0: survivorship('f', level), 1: survivorship('m', level) } as Record<number, Float64Array>;
  const deathAge = (sex: number, from: number) => {
    const u = rnd() * l[sex][Math.floor(from)];
    let a = Math.floor(from);
    while (a < 120 && l[sex][a + 1] > u) a++;
    return Math.max(from, a + rnd());
  };
  const sex: number[] = [],
    born: number[] = [],
    dies: number[] = [],
    mAge: number[] = [],
    spouse: number[] = [],
    alive: number[] = [];
  const add = (t: number, age: number) => {
    const s = rnd() < 105 / 205 ? 1 : 0;
    sex.push(s);
    born.push(t - age);
    dies.push(t - age + deathAge(s, age));
    mAge.push(rnd() < celib ? 999 : Math.max(15, (s ? mm : mf) + 4 * norm()));
    spouse.push(-1);
    alive.push(1);
  };
  // initial ages from the stationary population
  const cum: number[] = [];
  let tot = 0;
  for (let a = 0; a < 110; a++) {
    tot += (l[0][a] + l[1][a]) / 2;
    cum.push(tot);
  }
  for (let i = 0; i < N0; i++) {
    const u = rnd() * tot;
    let a = 0;
    while (cum[a] < u) a++;
    add(0, a + rnd());
  }
  let live = [...sex.keys()];
  const hist: number[] = [];
  let marriedShare = 0,
    w1549 = 0,
    mar = 0,
    births = 0,
    deaths = 0;
  for (let t = 0; t < years; t++) {
    // deaths
    for (const i of live)
      if (dies[i] < t + 1) {
        alive[i] = 0;
        deaths++;
        const sp = spouse[i];
        if (sp >= 0) {
          spouse[sp] = remarry ? -1 : -2;
          spouse[i] = -3;
        }
      }
    live = live.filter((i) => alive[i]);
    // marriages: women oldest first take the nearest free man (her age + gap)
    const age = (i: number) => t + 1 - born[i];
    const men = live
      .filter((i) => sex[i] === 1 && spouse[i] === -1 && age(i) >= mAge[i])
      .sort((a, b) => age(a) - age(b));
    const women = live
      .filter((i) => sex[i] === 0 && spouse[i] === -1 && age(i) >= mAge[i] && age(i) < 50)
      .sort((a, b) => age(b) - age(a));
    const gap = mm - mf;
    for (const w of women) {
      if (!men.length) break;
      const target = age(w) + gap;
      let lo = 0,
        hi = men.length - 1;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (age(men[m]) < target) lo = m + 1;
        else hi = m;
      }
      let k = lo;
      if (lo > 0 && Math.abs(age(men[lo - 1]) - target) < Math.abs(age(men[lo]) - target)) k = lo - 1;
      const m = men[k];
      men.splice(k, 1);
      spouse[w] = m;
      spouse[m] = w;
    }
    // births
    const nb: number[] = [];
    w1549 = 0;
    mar = 0;
    for (const i of live)
      if (sex[i] === 0) {
        const a = age(i) - 0.5;
        if (a >= 15 && a < 50) {
          w1549++;
          if (spouse[i] >= 0) {
            mar++;
            if (rnd() < 1 - Math.exp(-M * nA(a))) nb.push(i);
          }
        }
      }
    for (const _ of nb) {
      add(t + rnd(), 0);
      live.push(sex.length - 1);
      births++;
    }
    hist.push(live.length);
    marriedShare = mar / w1549;
    if (live.length > 400000 || live.length < 500) break;
  }
  const a = hist[Math.min(hist.length - 1, 99)],
    b = hist[hist.length - 1],
    yrs = hist.length - 1 - Math.min(hist.length - 1, 99);
  return { r: yrs > 0 ? Math.log(b / a) / yrs : NaN, married: marriedShare, N: b };
}
const rows: [string, number, number, number, number, boolean, number][] = [
  ['today: level 3, 24/27, M 1, no remarriage', 3, 24, 27, 1, false, 0],
  ['+ remarriage', 3, 24, 27, 1, true, 0],
  ['+ remarriage, M 0.9', 3, 24, 27, 0.9, true, 0],
  ['+ remarriage, M 0.75', 3, 24, 27, 0.75, true, 0],
  ['+ remarriage, M 1, 10% celibate', 3, 24, 27, 1, true, 0.1],
  ['level 3, 20/23, M 0.75, remarriage', 3, 20, 23, 0.75, true, 0],
  ['level 3, 18/21, M 0.75, remarriage', 3, 18, 21, 0.75, true, 0],
  ['level 5, 24/27, M 0.75, remarriage', 5, 24, 27, 0.75, true, 0],
  ['level 7, 24/27, M 0.75, remarriage', 7, 24, 27, 0.75, true, 0],
  ['level 7, 24/27, M 0.75, no remarriage', 7, 24, 27, 0.75, false, 0],
];
for (const [name, lv, mf, mm, M, rem, cel] of rows) {
  const x = run(lv, mf, mm, M, rem, cel);
  console.log(
    name.padEnd(46),
    'growth/yr',
    (100 * x.r).toFixed(2) + ' %',
    'married of women 15-49',
    (100 * x.married).toFixed(0) + ' %',
  );
}
