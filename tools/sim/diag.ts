import { newGame } from './load';
import { advanceDay } from '../../src/sim/engine';
import { C, CL, GOODS, GI } from '../../src/sim/defs';
const days = Number(process.argv[2] || 180);
const { s, w } = newGame(1356);
const stat = (label: string) => {
  const sol: number[] = []; let pl = 0, pop = 0;
  for (let i = 0; i < w.L; i++) { if (s.loc.owner[i] < 0) continue; sol.push(s.loc.sol[i * C + CL.peasants]); if (s.loc.plague[i] > 0.05) pl++; for (let c = 0; c < C; c++) pop += s.loc.pop[i * C + c]; }
  sol.sort((a, b) => a - b);
  const q = (f: number) => sol[Math.floor(sol.length * f)].toFixed(2);
  const m = s.markets[0];
  console.log(label, 'pop', (pop / 1e6).toFixed(1), 'peasant sol q10/50/90', q(0.1), q(0.5), q(0.9), 'plague locs', pl, 'mkt0', m.name, 'grain p', m.price[GI.grain].toFixed(2), 's/d', m.supply[GI.grain].toFixed(0), m.demand[GI.grain].toFixed(0));
};
stat('start');
for (let k = 0; k < days; k++) { advanceDay(s, w); if (k % 30 === 29) stat('d' + (k + 1)); }
for (const mk of [s.markets[0], s.markets[10], s.markets[30]]) {
  console.log(mk.name, ['grain', 'bread', 'clothing', 'timber', 'salt', 'livestock', 'beer', 'cloth'].map((g) => `${g} p${mk.price[GI[g]].toFixed(2)}/b${GOODS[GI[g]].base} fill${(mk.supply[GI[g]] / Math.max(1, mk.demand[GI[g]])).toFixed(2)}`).join(' | '));
}
// peasant budget in a sample location
let i0 = s.nations.find((n) => n.key === 'france')!.capital;
for (const i of [i0, i0 + 50, i0 + 400]) console.log(w.names[i], 'pop', Array.from(s.loc.pop.slice(i * C, i * C + C)).map((x) => x.toFixed(0)).join(','), 'sol', Array.from(s.loc.sol.slice(i * C, i * C + C)).map((x) => x.toFixed(2)).join(','), 'wealth', Array.from(s.loc.wealth.slice(i * C, i * C + C)).map((x) => x.toFixed(2)).join(','), 'harvest', s.loc.harvest[i].toFixed(2));
