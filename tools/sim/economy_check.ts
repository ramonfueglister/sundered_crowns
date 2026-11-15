// "Model against history" for England's economy (docs/ECONOMY_DESIGN.md, feature 3). Runs worlds of the game from
// their start in 1356, day by day, and prints Markdown tables: real GDP and the price level of the model against
// those of Broadberry et al. for the same years.
// Nothing here feeds back into the model: the tables are the check, deviations stay as they are.
//   npm run economy:check [years] [worlds]        (default: 64 years, 20 worlds with the seeds 1356, 1357, …)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadWorld, loadSetup } from './load';
import { createWorldState } from '../../src/sim/setup';
import { advanceDay } from '../../src/sim/engine';
import { dayToDate } from '../../src/sim/calendar';
import { FIGURE } from '../../src/sim/economy/engine';

interface History { first_year: number; real_gdp_gbp_mn_2013: number[]; gdp_deflator_2013_100: number[] }
const HISTORY: History = JSON.parse(readFileSync(fileURLToPath(new URL('../../data/economy/england_after_1356.json', import.meta.url)), 'utf8'));

const years = Number(process.argv[2] ?? 64), worlds = Number(process.argv[3] ?? 20), START = 1356;
if (HISTORY.first_year !== START || years + 1 > HISTORY.real_gdp_gbp_mn_2013.length) throw new Error(`the history covers ${HISTORY.real_gdp_gbp_mn_2013.length - 1} years from ${HISTORY.first_year}`);

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v: number[]) => { const m = mean(v); return Math.sqrt(mean(v.map((x) => (x - m) ** 2))); };
const growth = (v: number[]) => v.slice(1).map((x, i) => Math.log(x / v[i]));
const index = (v: number[]) => v.map((x) => 100 * x / v[0]);

// ---- the worlds
const w = loadWorld(), setup = loadSetup(START);
interface Run { seed: number; gdp: number[]; prices: number[]; uses: number[][]; unemployed: number[]; halted: string }
const runs: Run[] = [];
const t0 = performance.now();
for (let k = 0; k < worlds; k++) {
  const seed = START + k, s = createWorldState(w, setup, seed);
  const r: Run = { seed, gdp: [], prices: [], uses: [], unemployed: [], halted: '' };
  const note = () => {
    const f = s.economy.england!.figures, F = FIGURE;
    r.gdp.push(f[F.realGdp]); r.prices.push(f[F.nominalGdp] / f[F.realGdp]);
    r.uses.push([f[F.consumption], f[F.government], f[F.investment], f[F.exports], f[F.imports]].map((x) => x / f[F.realGdp]));
    r.unemployed.push(f[F.unemployed] / (f[F.employees] + f[F.owners] + f[F.unemployed]));
  };
  note();
  while (r.gdp.length <= years && !s.economy.england!.halted) {
    advanceDay(s, w);
    if (s.economy.england!.year === START + r.gdp.length) {
      if (dayToDate(s.day, s.startYear).y !== s.economy.england!.year) throw new Error('the economy is not in the year of the world');
      note();
    }
  }
  r.halted = s.economy.england!.halted;
  runs.push(r);
}
const seconds = (performance.now() - t0) / 1000;
const whole = runs.filter((r) => !r.halted);

// ---- the tables
const hGdp = HISTORY.real_gdp_gbp_mn_2013.slice(0, years + 1), hPrices = HISTORY.gdp_deflator_2013_100.slice(0, years + 1);
const pc = (x: number, d = 2) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(d)} %`;
const span = (v: number[], f: (x: number) => string) => `${f(Math.min(...v))} to ${f(Math.max(...v))}`;
const n0 = (x: number) => x.toFixed(0), n1 = (x: number) => x.toFixed(1);

console.log(`England ${START} to ${START + years}: ${worlds} worlds of the game (seeds ${START} to ${START + worlds - 1}), ${whole.length} computed every year, ${seconds.toFixed(0)} s`);
for (const r of runs) if (r.halted) console.log(`world ${r.seed} stood still: ${r.halted}`);
console.log(`starting position: real GDP £${n0(runs[0].gdp[0])} at the scale 1:100\n`);

console.log('| Real GDP | Model (mean of the worlds) | Range of the worlds | History |');
console.log('|---|---|---|---|');
const mg = whole.map((r) => mean(growth(r.gdp))), sg = whole.map((r) => sd(growth(r.gdp)));
const lo = whole.map((r) => Math.min(...index(r.gdp))), hi = whole.map((r) => Math.max(...index(r.gdp)));
const lvl = whole.map((r) => mean(index(r.gdp).slice(1))), end = whole.map((r) => index(r.gdp)[years]);
const hi_ = index(hGdp);
console.log(`| Mean growth a year | ${pc(mean(mg))} | ${span(mg, pc)} | ${pc(mean(growth(hGdp)))} |`);
console.log(`| Standard deviation of annual growth | ${(100 * mean(sg)).toFixed(1)} % | ${span(sg, (x) => (100 * x).toFixed(1) + ' %')} | ${(100 * sd(growth(hGdp))).toFixed(1)} % |`);
console.log(`| Lowest year (${START} = 100) | ${n0(mean(lo))} | ${span(lo, n0)} | ${n0(Math.min(...hi_))} |`);
console.log(`| Highest year | ${n0(mean(hi))} | ${span(hi, n0)} | ${n0(Math.max(...hi_))} |`);
console.log(`| Mean level of all years | ${n1(mean(lvl))} | ${span(lvl, n1)} | ${n1(mean(hi_.slice(1)))} |`);
console.log(`| Level in ${START + years} | ${n0(mean(end))} | ${span(end, n0)} | ${n0(hi_[years])} |`);

console.log('\n| Price level of GDP | Model (mean of the worlds) | Range of the worlds | History |');
console.log('|---|---|---|---|');
const pe = whole.map((r) => index(r.prices)[years]), ps = whole.map((r) => sd(growth(r.prices)));
const median = (v: number[]) => { const a = [...v].sort((x, y) => x - y); return (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) / 2; };
console.log(`| Level in ${START + years} (${START} = 100) | ${n0(mean(pe))} (median ${n0(median(pe))}) | ${span(pe, n0)} | ${n0(index(hPrices)[years])} |`);
console.log(`| Standard deviation of annual inflation | ${(100 * mean(ps)).toFixed(1)} % | ${span(ps, (x) => (100 * x).toFixed(1) + ' %')} | ${(100 * sd(growth(hPrices))).toFixed(1)} % |`);

console.log('\n| Share of real GDP | At the start | Mean of all years and worlds |');
console.log('|---|---|---|');
['Household consumption', 'Crown', 'Investment', 'Exports (with duty)', 'Imports'].forEach((name, k) => {
  console.log(`| ${name} | ${(100 * runs[0].uses[0][k]).toFixed(1)} % | ${(100 * mean(whole.flatMap((r) => r.uses.slice(1).map((u) => u[k])))).toFixed(1)} % |`);
});
const un = whole.flatMap((r) => r.unemployed.slice(1));
console.log(`| Without work (share of the labour force) | ${(100 * runs[0].unemployed[0]).toFixed(2)} % | ${(100 * mean(un)).toFixed(2)} % (highest year ${(100 * Math.max(...un)).toFixed(1)} %) |`);

console.log(`\n| Year | History | Model, mean | Model, world ${runs[0].seed} |`);
console.log('|---|---|---|---|');
for (let t = 0; t <= years; t += 8) console.log(`| ${START + t} | ${n0(hi_[t])} | ${n0(mean(whole.map((r) => index(r.gdp)[t])))} | ${n0(index(runs[0].gdp)[t])} |`);
