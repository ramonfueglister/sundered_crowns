// The economies of the cities in worlds of the game (docs/ECONOMY_DESIGN.md, features 3 to 6). Runs worlds from
// their start in 1356, day by day (advanceDay), and prints Markdown tables: what all cities together and the single
// cities show after the years, what the days show (people without work), and whether the books of the merchants
// and of every city balance.
// A year of the model is a row of `years` in the state of the world: the sums of the 365 days up to 31 December.
// Nothing here feeds back into the model: the tables are the check.
//   npm run economy:check [years] [worlds]        (default: 5 years, 4 worlds with the seeds 1356, 1357, …)
// The worlds run in parallel, one process each on every core; a year of a world takes about six seconds of one core.
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { loadWorld, loadSetup, loadEconomy } from './load';
import { createWorldState } from '../../src/sim/setup';
import { advanceDay } from '../../src/sim/engine';
import { FIGURE, FIGURES } from '../../src/sim/economy/engine';
import { yearRow } from '../../src/sim/systems/economy';

const START = 1356;

/** What one world shows: per city and year (the starting position first) the key figures, and over all its days. */
interface Run {
  seed: number; halted: string; days: number;
  /** per year, per city: real GDP, price level of GDP, exports, imports (sums of the year) */
  gdp: number[][]; prices: number[][]; exports: number[][]; imports: number[][];
  /** per city: share without work, mean of all days and the worst day; the price level of the last day */
  unemployed: number[]; unemployedMax: number[]; priceToday: number[];
  /** the worst of the identities of the cities and of the merchants' books over all days checked, as a share of the
   *  amount it is judged by */
  books: number;
}

/** Runs one world for `years` years, day by day. */
function runWorld(seed: number, years: number): Run {
  const w = loadWorld(), s = createWorldState(w, loadSetup(START), seed), F = FIGURE;
  const e = s.economy.cities!, N = w.cityEconomies.cities.length;
  const r: Run = {
    seed, halted: '', days: 0, gdp: [], prices: [], exports: [], imports: [],
    unemployed: new Array(N).fill(0), unemployedMax: new Array(N).fill(0), priceToday: new Array(N).fill(1), books: 0,
  };
  const note = (f: ArrayLike<number>) => {
    const of = (g: (k: number) => number) => Array.from({ length: N }, (_, c) => g(c * FIGURES));
    r.gdp.push(of((k) => f[k + F.realGdp])); r.prices.push(of((k) => f[k + F.nominalGdp] / f[k + F.realGdp]));
    r.exports.push(of((k) => f[k + F.exports])); r.imports.push(of((k) => f[k + F.imports]));
  };
  note(e.figures);
  while (e.years.length < years * yearRow(N) && !e.halted) {
    advanceDay(s, w);
    if (e.halted) break;
    if (e.day !== s.day) throw new Error('the economies are not on the day of the world');
    r.days++;
    for (let c = 0; c < N; c++) {
      const f = e.figures.subarray(c * FIGURES, (c + 1) * FIGURES), without = f[F.unemployed] / (f[F.employees] + f[F.owners] + f[F.unemployed]);
      r.unemployed[c] += without / 1; r.unemployedMax[c] = Math.max(r.unemployedMax[c], without); r.priceToday[c] = f[F.priceLevel];
    }
    if (r.days % 30 === 0) { // the books, once a month
      const k = w.economyEngine.checks(e.model);
      for (const x of k.cities) for (const v of [x.income, x.nominal, x.real, x.centralBank, x.banks]) r.books = Math.max(r.books, Math.abs(v) / x.gdpSum);
      for (const m of k.merchants) if (m.scale > 0) r.books = Math.max(r.books, Math.abs(m.off) / m.scale);
    }
  }
  for (let y = 0; y * yearRow(N) < e.years.length; y++) {
    if (e.years[y * yearRow(N)] !== START + y) throw new Error(`the row ${y} of the years is the year ${e.years[y * yearRow(N)]}`);
    note(e.years.subarray(y * yearRow(N) + 1, (y + 1) * yearRow(N)));
  }
  r.unemployed = r.unemployed.map((x) => x / r.days);
  r.halted = e.halted;
  return r;
}

// one world, for the process that runs all of them: prints the run as one line of JSON
if (process.argv[2] === '--world') {
  console.log(JSON.stringify(runWorld(Number(process.argv[3]), Number(process.argv[4]))));
  process.exit(0);
}

const years = Number(process.argv[2] ?? 5), worlds = Number(process.argv[3] ?? 4);
if (!(Number.isInteger(years) && years >= 1 && Number.isInteger(worlds) && worlds >= 1)) throw new Error('usage: economy:check [years] [worlds]');
const CITIES = loadEconomy().cities, N = CITIES.length;

const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
const mean = (v: number[]) => sum(v) / v.length;

// ---- the worlds
const t0 = performance.now();
const world = (seed: number) => new Promise<Run>((done, fail) => {
  const child = spawn(process.execPath, [...process.execArgv, process.argv[1], '--world', String(seed), String(years)], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.on('error', fail);
  child.on('close', (code) => { if (code === 0) done(JSON.parse(out)); else fail(new Error(`world ${seed} ended with code ${code}`)); });
});
const runs: Run[] = new Array(worlds);
let next = 0;
await Promise.all(Array.from({ length: Math.min(worlds, availableParallelism()) }, async () => {
  while (next < worlds) { const k = next++; runs[k] = await world(START + k); }
}));
const seconds = (performance.now() - t0) / 1000;
const whole = runs.filter((r) => !r.halted);

// ---- the tables
const n0 = (x: number) => x.toFixed(0), n1 = (x: number) => x.toFixed(1), pc = (x: number, d = 1) => `${(100 * x).toFixed(d)} %`;
const span = (v: number[], f: (x: number) => string) => `${f(Math.min(...v))} to ${f(Math.max(...v))}`;

console.log(`${N} cities, ${years} years from ${START}: ${worlds} worlds of the game (seeds ${START} to ${START + worlds - 1}), ${whole.length} computed every day, ${seconds.toFixed(0)} s`);
for (const r of runs) if (r.halted) console.log(`world ${r.seed} stood still: ${r.halted}`);
console.log(`starting position: real GDP of all cities £${n0(sum(runs[0].gdp[0]))} a year at the scale 1:100; a year of the starting position has exports of ${pc(sum(runs[0].exports[0]) / sum(runs[0].gdp[0]))} and imports of ${pc(sum(runs[0].imports[0]) / sum(runs[0].gdp[0]))} of it\n`);
if (whole.length === 0) process.exit(1);

// all cities together: output is the sum, the price level is weighted with output
const total = (r: Run, y: number) => sum(r.gdp[y]);
const level = (r: Run, y: number) => 100 * total(r, y) / total(r, 0);
const price = (r: Run, y: number) => 100 * sum(r.prices[y].map((p, c) => p * r.gdp[y][c])) / total(r, y) / (sum(r.prices[0].map((p, c) => p * r.gdp[0][c])) / total(r, 0));
console.log(`| All cities together, year ${years} | Mean of the worlds | Range of the worlds |`);
console.log('|---|---|---|');
const row = (name: string, v: number[], f: (x: number) => string) => console.log(`| ${name} | ${f(mean(v))} | ${span(v, f)} |`);
row('Real output (start = 100)', whole.map((r) => level(r, years)), n1);
row('Price level of output (start = 100)', whole.map((r) => price(r, years)), n1);
row('Exports, share of output', whole.map((r) => sum(r.exports[years]) / total(r, years)), (x) => pc(x, 2));
row('Imports, share of output', whole.map((r) => sum(r.imports[years]) / total(r, years)), (x) => pc(x, 2));
row('Without work, mean of all cities and days', whole.map((r) => mean(r.unemployed)), (x) => pc(x, 2));
row('Without work, the worst city on its worst day', whole.map((r) => Math.max(...r.unemployedMax)), pc);
row('City with the lowest output (its start = 100)', whole.map((r) => Math.min(...r.gdp[years].map((g, c) => 100 * g / r.gdp[0][c]))), n1);
row('City with the highest output', whole.map((r) => Math.max(...r.gdp[years].map((g, c) => 100 * g / r.gdp[0][c]))), n1);
row('Lowest price level of a city on the last day (start = 100)', whole.map((r) => 100 * Math.min(...r.priceToday)), n1);
row('Highest price level of a city on the last day', whole.map((r) => 100 * Math.max(...r.priceToday)), n1);
console.log(`\nThe books (the identities of every city and the books of the merchants, once a month): off by at most ${Math.max(...whole.map((r) => r.books)).toExponential(1)} of the amount they are judged by.`);

console.log(`\n| Year | Real output of all cities (start = 100), mean of the worlds | World ${runs[0].seed} | Exports, share of output | Imports |`);
console.log('|---|---|---|---|---|');
for (let y = 0; y <= years; y++) {
  console.log(`| ${y === 0 ? 'start' : START + y - 1} | ${n1(mean(whole.map((r) => level(r, y))))} | ${n1(level(runs[0], y))} | ${pc(mean(whole.map((r) => sum(r.exports[y]) / total(r, y))), 2)} | ${pc(mean(whole.map((r) => sum(r.imports[y]) / total(r, y))), 2)} |`);
}

const first = whole[0];
console.log(`\n| City (world ${first.seed}) | People | Real output in year ${years} (start = 100) | Price level on the last day | Without work, mean of the days | Exports, share of output | Imports |`);
console.log('|---|---|---|---|---|---|---|');
CITIES.forEach((c, k) => {
  console.log(`| ${c.name} | ${c.people.toLocaleString('en-GB')} | ${n1(100 * first.gdp[years][k] / first.gdp[0][k])} | ${n1(100 * first.priceToday[k])} | ${pc(first.unemployed[k], 2)} | ${pc(first.exports[years][k] / first.gdp[years][k], 2)} | ${pc(first.imports[years][k] / first.gdp[years][k], 2)} |`);
});
