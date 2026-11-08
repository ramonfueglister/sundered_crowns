// AI-only run: npx tsx tools/sim/run.ts [years] [seed]
import { newGame } from './load';
import { advanceDay, setProfiling, PROFILE, hashState } from '../../src/sim/engine';
import { dayToDate } from '../../src/sim/calendar';
import { C } from '../../src/sim/defs';

const years = Number(process.argv[2] || 5), seed = Number(process.argv[3] || 1356);
const t0 = Date.now();
const { s, w } = newGame(seed);
console.log(`setup ${Date.now() - t0} ms, nations ${s.nations.length}, armies ${s.armies.length}, wars ${s.wars.length}, markets ${s.markets.length}`);
setProfiling(true);
const t1 = Date.now();
const days = Math.round(years * 365.25);
let lastY = s.startYear;
const report = () => {
  const d = dayToDate(s.day, s.startYear);
  const alive = s.nations.filter((n) => n.alive);
  let pop = 0; for (let i = 0; i < w.L * C; i++) pop += s.loc.pop[i];
  const top = s.ranking.slice(0, 6).map((id) => `${s.nations[id].key}(${Math.round(s.nations[id].score)})`).join(' ');
  const tr = alive.map((n) => n.treasury); tr.sort((a, b) => a - b);
  console.log(`${d.y}-${d.m + 1}: alive ${alive.length} wars ${s.wars.length} armies ${s.armies.length} battles ${s.battles.length} sieges ${s.sieges.length} pop ${(pop / 1e6).toFixed(1)}M price ${s.priceLevel.toFixed(2)} treas med ${tr[tr.length >> 1].toFixed(0)} | ${top}`);
};
report();
for (let k = 0; k < days; k++) {
  advanceDay(s, w);
  const y = dayToDate(s.day, s.startYear).y;
  if (y !== lastY) { lastY = y; report(); }
}
const ms = Date.now() - t1;
console.log(`ran ${days} days in ${ms} ms = ${(ms / days).toFixed(2)} ms/day`);
console.log('per system ms/day:', Object.fromEntries(Object.entries(PROFILE).map(([k, v]) => [k, +(v / days).toFixed(2)])));
console.log('chronicle sample:'); for (const c of s.chronicle.slice(-25)) console.log('  ', dayToDate(c.day, s.startYear).y, c.text.en);
console.log('hash', hashState(s));
