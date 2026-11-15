// "Model against history" for England's economy (docs/ECONOMY_DESIGN.md, features 3 and 4). Runs worlds of the game
// from their start in 1356, day by day (advanceDay), and prints Markdown tables: real GDP and the price level of the
// model against those of Broadberry et al., year for year, and what the days show (prices of the day, people without
// work).
// A year of the model is a row of `years` in the state of the world: the sums of the 365 days up to 31 December. The
// starting position stands for 1356 (the year of the calibration), so the model after t years is set against the
// history of 1356 + t.
// Nothing here feeds back into the model: the tables are the check, deviations stay as they are.
//   npm run economy:check [years] [worlds]        (default: 64 years, 20 worlds with the seeds 1356, 1357, …)
// The worlds run in parallel, one process each on every core; a world of 64 years takes about four minutes of one
// core.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadWorld, loadSetup } from './load';
import { createWorldState } from '../../src/sim/setup';
import { advanceDay } from '../../src/sim/engine';
import { FIGURE } from '../../src/sim/economy/engine';
import { YEAR_ROW } from '../../src/sim/systems/economy';

interface History { first_year: number; real_gdp_gbp_mn_2013: number[]; gdp_deflator_2013_100: number[] }
const HISTORY: History = JSON.parse(readFileSync(fileURLToPath(new URL('../../data/economy/england_after_1356.json', import.meta.url)), 'utf8'));
const START = 1356;

/** What one world shows: per year (the starting position first) and over all its days. */
interface Run {
  seed: number; gdp: number[]; prices: number[]; uses: number[][]; halted: string;
  days: number; moved: number; unemployed: number; unemployedMax: number; priceToday: number;
}

/** Runs one world for `years` years, day by day. */
function runWorld(seed: number, years: number): Run {
  const w = loadWorld(), s = createWorldState(w, loadSetup(START), seed), F = FIGURE;
  const e = s.economy.england!;
  const r: Run = { seed, gdp: [], prices: [], uses: [], halted: '', days: 0, moved: 0, unemployed: 0, unemployedMax: 0, priceToday: 1 };
  const note = (f: ArrayLike<number>) => {
    r.gdp.push(f[F.realGdp]); r.prices.push(f[F.nominalGdp] / f[F.realGdp]);
    r.uses.push([f[F.consumption], f[F.government], f[F.investment], f[F.exports], f[F.imports]].map((x) => x / f[F.realGdp]));
  };
  note(e.figures);
  while (e.years.length < years * YEAR_ROW && !e.halted) {
    const before = e.figures[F.priceLevel];
    advanceDay(s, w);
    if (e.halted) break;
    if (e.day !== s.day) throw new Error('the economy is not on the day of the world');
    const f = e.figures, without = f[F.unemployed] / (f[F.employees] + f[F.owners] + f[F.unemployed]);
    r.days++; r.unemployed += without; r.unemployedMax = Math.max(r.unemployedMax, without);
    if (f[F.priceLevel] !== before) r.moved++;
    r.priceToday = f[F.priceLevel];
  }
  for (let y = 0; y * YEAR_ROW < e.years.length; y++) {
    if (e.years[y * YEAR_ROW] !== START + y) throw new Error(`the row ${y} of the years is the year ${e.years[y * YEAR_ROW]}`);
    note(e.years.subarray(y * YEAR_ROW + 1, (y + 1) * YEAR_ROW));
  }
  r.halted = e.halted;
  return r;
}

// one world, for the process that runs all of them: prints the run as one line of JSON
if (process.argv[2] === '--world') {
  console.log(JSON.stringify(runWorld(Number(process.argv[3]), Number(process.argv[4]))));
  process.exit(0);
}

const years = Number(process.argv[2] ?? 64), worlds = Number(process.argv[3] ?? 20);
if (HISTORY.first_year !== START || years + 1 > HISTORY.real_gdp_gbp_mn_2013.length) throw new Error(`the history covers ${HISTORY.real_gdp_gbp_mn_2013.length - 1} years from ${HISTORY.first_year}`);

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v: number[]) => { const m = mean(v); return Math.sqrt(mean(v.map((x) => (x - m) ** 2))); };
const growth = (v: number[]) => v.slice(1).map((x, i) => Math.log(x / v[i]));
const index = (v: number[]) => v.map((x) => 100 * x / v[0]);

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
const hGdp = HISTORY.real_gdp_gbp_mn_2013.slice(0, years + 1), hPrices = HISTORY.gdp_deflator_2013_100.slice(0, years + 1);
const pc = (x: number, d = 2) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(d)} %`;
const span = (v: number[], f: (x: number) => string) => `${f(Math.min(...v))} to ${f(Math.max(...v))}`;
const n0 = (x: number) => x.toFixed(0), n1 = (x: number) => x.toFixed(1);

console.log(`England, ${years} years from ${START}: ${worlds} worlds of the game (seeds ${START} to ${START + worlds - 1}), ${whole.length} computed every day, ${seconds.toFixed(0)} s`);
for (const r of runs) if (r.halted) console.log(`world ${r.seed} stood still: ${r.halted}`);
console.log(`starting position: real GDP £${n0(runs[0].gdp[0])} a year at the scale 1:100\n`);

console.log('| Real GDP | Model (mean of the worlds) | Range of the worlds | History |');
console.log('|---|---|---|---|');
const mg = whole.map((r) => mean(growth(r.gdp))), sg = whole.map((r) => sd(growth(r.gdp)));
const lo = whole.map((r) => Math.min(...index(r.gdp))), hi = whole.map((r) => Math.max(...index(r.gdp)));
const lvl = whole.map((r) => mean(index(r.gdp).slice(1))), end = whole.map((r) => index(r.gdp)[years]);
const hi_ = index(hGdp);
console.log(`| Mean growth a year | ${pc(mean(mg))} | ${span(mg, pc)} | ${pc(mean(growth(hGdp)))} |`);
console.log(`| Standard deviation of annual growth | ${(100 * mean(sg)).toFixed(1)} % | ${span(sg, (x) => (100 * x).toFixed(1) + ' %')} | ${(100 * sd(growth(hGdp))).toFixed(1)} % |`);
console.log(`| Lowest year (start = 100) | ${n0(mean(lo))} | ${span(lo, n0)} | ${n0(Math.min(...hi_))} |`);
console.log(`| Highest year | ${n0(mean(hi))} | ${span(hi, n0)} | ${n0(Math.max(...hi_))} |`);
console.log(`| Mean level of all years | ${n1(mean(lvl))} | ${span(lvl, n1)} | ${n1(mean(hi_.slice(1)))} |`);
console.log(`| Level after ${years} years | ${n0(mean(end))} | ${span(end, n0)} | ${n0(hi_[years])} |`);

console.log('\n| Price level of GDP | Model (mean of the worlds) | Range of the worlds | History |');
console.log('|---|---|---|---|');
const pe = whole.map((r) => index(r.prices)[years]), ps = whole.map((r) => sd(growth(r.prices)));
const median = (v: number[]) => { const a = [...v].sort((x, y) => x - y); return (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) / 2; };
console.log(`| Level after ${years} years (start = 100) | ${n0(mean(pe))} (median ${n0(median(pe))}) | ${span(pe, n0)} | ${n0(index(hPrices)[years])} |`);
console.log(`| Standard deviation of annual inflation | ${(100 * mean(ps)).toFixed(1)} % | ${span(ps, (x) => (100 * x).toFixed(1) + ' %')} | ${(100 * sd(growth(hPrices))).toFixed(1)} % |`);

console.log('\n| Share of real GDP | At the start | Mean of all years and worlds |');
console.log('|---|---|---|');
['Household consumption', 'Crown', 'Investment', 'Exports (with duty)', 'Imports'].forEach((name, k) => {
  console.log(`| ${name} | ${(100 * runs[0].uses[0][k]).toFixed(1)} % | ${(100 * mean(whole.flatMap((r) => r.uses.slice(1).map((u) => u[k])))).toFixed(1)} % |`);
});
console.log('\n| The days | Mean of the worlds | Range of the worlds |');
console.log('|---|---|---|');
const moved = whole.map((r) => r.moved / r.days), un = whole.map((r) => r.unemployed / r.days), unMax = whole.map((r) => r.unemployedMax);
const today = whole.map((r) => 100 * r.priceToday);
const p1 = (x: number) => (100 * x).toFixed(1) + ' %', p2 = (x: number) => (100 * x).toFixed(2) + ' %';
console.log(`| Days on which the price level of the day moves | ${p1(mean(moved))} | ${span(moved, p1)} |`);
console.log(`| Price level of the last day (start = 100) | ${n0(mean(today))} (median ${n0(median(today))}) | ${span(today, n0)} |`);
console.log(`| Without work, mean of all days (share of the labour force) | ${p2(mean(un))} | ${span(un, p2)} |`);
console.log(`| Without work, the worst day | ${p1(mean(unMax))} | ${span(unMax, p1)} |`);

console.log(`\n| Years after the start | History (${START} = 100) | Model, mean | Model, world ${runs[0].seed} |`);
console.log('|---|---|---|---|');
for (let t = 0; t <= years; t += 8) console.log(`| ${t} (${START + t}) | ${n0(hi_[t])} | ${n0(mean(whole.map((r) => index(r.gdp)[t])))} | ${n0(index(runs[0].gdp)[t])} |`);
