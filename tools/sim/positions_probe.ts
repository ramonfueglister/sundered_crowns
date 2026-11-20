// Probe for part 2 of people feature 2 (docs/PEOPLE_DESIGN.md), not part of the game: the marriage rule of
// La Poutré & Paping 2025 (a wedding only fills a vacant position, the number of positions is fixed) in a closed
// population of single persons. A position is held by a housewife and falls vacant at her death; the year's
// vacancies are spread over the ages of the brides by the Coale-McNeil curve (mean 24, minimum 15.5) and capped by
// the unmarried women of that age; the groom is the free man nearest to her age plus three. A wife with a living
// husband bears 1/2.75 children a year times the age factor of the source's program (zero at 45).
// npx tsx tools/sim/positions_probe.ts
import { survivorship } from '../../src/sim/people/lifetable';
let seed = 12345;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return (seed + 0.5) / 4294967296;
};
// La Poutré & Janssen 2021 (Genus 77:12), eq. 3 and 11, beta 0.064, theta -6.3, omega 2.7, one table for both sexes
function lpj(beta = 0.064, theta = -6.3): Float64Array {
  const om = Math.max(2.7, 119.3 * beta - 1.01 * theta - 14.5);
  const L = (x: number) =>
    Math.pow(x + 1.5, 1 - om) / (1 - om) +
    Math.exp(theta) * (x + Math.log(1 + Math.exp(x - 16))) +
    Math.log(1 + Math.exp(beta * (x - 100))) / beta;
  const l = new Float64Array(122);
  for (let a = 0; a <= 120; a++) l[a] = Math.exp(-(L(a) - L(0)));
  l[121] = 0;
  return l;
}
const fert = (a: number) => (a < 15 || a >= 45 ? 0 : 1 - Math.exp(4.6 * ((a - 15) / 30 - 1)));
const K = (24 - 15.5) / 11.36;
const cm = (x: number) =>
  Math.exp((-0.174 / K) * (x - 15.5 - 6.06 * K) - Math.exp((-0.288 / K) * (x - 15.5 - 6.06 * K)));
const CM: number[] = [];
{
  let c = 0;
  for (let a = 16; a <= 60; a++) c += cm(a);
  for (let a = 0; a <= 60; a++) CM.push(a < 16 ? 0 : cm(a) / c);
}
type Opt = { table: 'lpj' | number; widowsRemarry: boolean; bpy: number; years?: number; N0?: number; hh0?: number };
function run(o: Opt) {
  const years = o.years ?? 500,
    N0 = o.N0 ?? 20000;
  const l: Record<number, Float64Array> =
    o.table === 'lpj' ? { 0: lpj(), 1: lpj() } : { 0: survivorship('f', o.table), 1: survivorship('m', o.table) };
  const deathAge = (s: number, from: number) => {
    const u = rnd() * l[s][Math.floor(from)];
    let a = Math.floor(from);
    while (a < 119 && l[s][a + 1] > u) a++;
    return Math.max(from, a + rnd());
  };
  const sex: number[] = [],
    born: number[] = [],
    dies: number[] = [],
    spouse: number[] = [],
    alive: number[] = [],
    holds: number[] = [],
    ever: number[] = [];
  const add = (t: number, age: number) => {
    const s = rnd() < 105 / 205 ? 1 : 0;
    sex.push(s);
    born.push(t - age);
    dies.push(t - age + deathAge(s, age));
    spouse.push(-1);
    alive.push(1);
    holds.push(0);
    ever.push(0);
  };
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
  const positions = Math.round(N0 / (o.hh0 ?? 5.8));
  let held = 0;
  let live = [...sex.keys()];
  const acc = {
    n: 0,
    pop: 0,
    held: 0,
    u15: 0,
    w4044: 0,
    never4044: 0,
    widows: 0,
    firstAge: 0,
    firsts: 0,
    births: 0,
    deaths: 0,
    noGroom: 0,
    u15d: 0,
    b0: 0,
  };
  const hist: number[] = [];
  for (let t = 0; t < years; t++) {
    const meas = t >= years - 200;
    for (const i of live)
      if (dies[i] < t + 1) {
        alive[i] = 0;
        if (meas) acc.deaths++;
        if (holds[i]) {
          holds[i] = 0;
          held--;
        }
        const sp = spouse[i];
        if (sp >= 0) {
          spouse[sp] = -1;
          spouse[i] = -3;
        }
      }
    live = live.filter((i) => alive[i]);
    const age = (i: number) => t + 1 - born[i];
    // weddings: vacancies spread over the ages of the brides, capped by the unmarried women of that age
    const vac = positions - held;
    if (vac > 0) {
      const byAge: number[][] = [];
      for (let a = 0; a <= 60; a++) byAge.push([]);
      for (const i of live)
        if (sex[i] === 0 && spouse[i] === -1 && !holds[i]) {
          const a = Math.floor(age(i));
          if (a >= 16 && a <= 60 && (o.widowsRemarry || !ever[i])) byAge[a].push(i);
        }
      const men = live.filter((i) => sex[i] === 1 && spouse[i] === -1 && age(i) >= 18).sort((a, b) => age(a) - age(b));
      for (let a = 16; a <= 60; a++) {
        const x = CM[a] * vac;
        let n = Math.floor(x) + (rnd() < x - Math.floor(x) ? 1 : 0);
        const pool = byAge[a];
        while (n-- > 0 && pool.length) {
          if (!men.length) {
            if (meas) acc.noGroom++;
            break;
          }
          const w = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
          const target = age(w) + 3;
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
          holds[w] = 1;
          held++;
          if (meas && !ever[w]) {
            acc.firstAge += age(w);
            acc.firsts++;
          }
          ever[w] = 1;
          ever[m] = 1;
        }
      }
    }
    // a widow who holds a position may take a new husband
    if (o.widowsRemarry) {
      const men = live.filter((i) => sex[i] === 1 && spouse[i] === -1 && age(i) >= 18).sort((a, b) => age(a) - age(b));
      for (const w of live)
        if (sex[w] === 0 && holds[w] && spouse[w] < 0 && age(w) < 45 && men.length) {
          const target = age(w) + 3;
          let lo = 0,
            hi = men.length - 1;
          while (lo < hi) {
            const m = (lo + hi) >> 1;
            if (age(men[m]) < target) lo = m + 1;
            else hi = m;
          }
          const m = men[lo];
          men.splice(lo, 1);
          spouse[w] = m;
          spouse[m] = w;
          ever[m] = 1;
        }
    }
    const nb: number[] = [];
    for (const i of live)
      if (sex[i] === 0 && holds[i] && spouse[i] >= 0 && rnd() < o.bpy * fert(age(i) - 0.5)) nb.push(i);
    for (const _ of nb) {
      add(t + rnd(), 0);
      live.push(sex.length - 1);
      if (meas) acc.births++;
    }
    hist.push(live.length);
    if (meas) {
      acc.n++;
      acc.pop += live.length;
      acc.held += held;
      for (const i of live) {
        const a = age(i);
        if (a < 15) acc.u15++;
        if (sex[i] === 0 && a >= 40 && a < 45) {
          acc.w4044++;
          if (!ever[i]) acc.never4044++;
        }
        if (holds[i] && spouse[i] < 0) acc.widows++;
      }
    }
    if (live.length < 300) break;
  }
  const n = acc.n || 1,
    h = hist.length;
  return {
    r: h > 200 ? Math.log(hist[h - 1] / hist[h - 201]) / 200 : NaN,
    pop: acc.pop / n,
    filled: acc.held / n / positions,
    size: acc.pop / Math.max(1, acc.held),
    u15: acc.u15 / acc.pop,
    never40: acc.never4044 / Math.max(1, acc.w4044),
    widows: acc.widows / Math.max(1, acc.held),
    firstAge: acc.firstAge / Math.max(1, acc.firsts),
    cbr: (1000 * acc.births) / acc.pop,
    positions,
    end: hist[h - 1],
  };
}
const e = (l: Float64Array, a: number) => {
  let s = 0;
  for (let x = a; x < 120; x++) s += (l[x] + l[x + 1]) / 2;
  return s / l[a];
};
const t = lpj();
console.log(
  'LPJ  l1',
  t[1].toFixed(3),
  'l15',
  t[15].toFixed(3),
  'l27',
  t[27].toFixed(3),
  'e0',
  e(t, 0).toFixed(1),
  'e15',
  e(t, 15).toFixed(1),
  'e27',
  e(t, 27).toFixed(1),
);
for (const lv of [3, 5, 7, 9]) {
  const f = survivorship('f', lv),
    m = survivorship('m', lv);
  console.log(
    'West',
    lv,
    'l15 f/m',
    (f[15] / f[0]).toFixed(3),
    (m[15] / m[0]).toFixed(3),
    'e0 f/m',
    e(f, 0).toFixed(1),
    e(m, 0).toFixed(1),
    'e27 m',
    e(m, 27).toFixed(1),
  );
}
const rows: [string, Opt][] = [
  ['source: LPJ mortality, widows stay single', { table: 'lpj', widowsRemarry: false, bpy: 1 / 2.75 }],
  ['source: LPJ mortality, widows remarry', { table: 'lpj', widowsRemarry: true, bpy: 1 / 2.75 }],
  ['West 3 (today), widows stay single', { table: 3, widowsRemarry: false, bpy: 1 / 2.75 }],
  ['West 3 (today), widows remarry', { table: 3, widowsRemarry: true, bpy: 1 / 2.75 }],
  ['West 3, widows remarry, start 4.86/couple', { table: 3, widowsRemarry: true, bpy: 1 / 2.75, hh0: 4.86 }],
  ['West 5, widows remarry', { table: 5, widowsRemarry: true, bpy: 1 / 2.75 }],
  ['West 7, widows remarry', { table: 7, widowsRemarry: true, bpy: 1 / 2.75 }],
  ['West 9, widows remarry', { table: 9, widowsRemarry: true, bpy: 1 / 2.75 }],
];
for (const [name, o] of rows) {
  const x = run(o);
  console.log(
    name.padEnd(44),
    'growth',
    (100 * x.r).toFixed(2) + '%',
    'pop',
    x.pop.toFixed(0),
    'filled',
    (100 * x.filled).toFixed(0) + '%',
    'size',
    x.size.toFixed(2),
    'u15',
    (100 * x.u15).toFixed(0) + '%',
    'never@40',
    (100 * x.never40).toFixed(0) + '%',
    'widows',
    (100 * x.widows).toFixed(0) + '%',
    'bride',
    x.firstAge.toFixed(1),
    'cbr',
    x.cbr.toFixed(1),
  );
}
