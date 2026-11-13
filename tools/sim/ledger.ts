import { newGame } from './load';
import { advanceDay } from '../../src/sim/engine';
const days = Number(process.argv[2] || 400);
const { s, w } = newGame(1356);
for (let k = 0; k < days; k++) advanceDay(s, w);
for (const key of ['france', 'england', 'venice', 'bohemia', 'mali', 'mayapan', 'ottoman', 'muscovy']) {
  const n = s.nations.find((x) => x.key === key); if (!n) continue;
  const r = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k}:${v.toFixed(0)}`).join(' ');
  const men = s.armies.filter((a) => a.owner === n.id && !a.fleet).reduce((p, a) => p + a.regs.reduce((q, x) => q + x.men, 0), 0);
  console.log(key, 'treas', n.treasury.toFixed(0), 'men', men.toFixed(0), 'mp', n.manpower.toFixed(0), '/', n.maxManpower.toFixed(0), 'tax', n.taxRate.map((x) => x.toFixed(2)).join(','), 'pers', n.personality, 'auth', n.authority.toFixed(0), 'concord', n.concord.toFixed(0));
  console.log('   IN ', r(n.income)); console.log('   OUT', r(n.expense));
}
console.log('wars', s.wars.map((x) => `${s.nations[x.attLead].key}>${s.nations[x.defLead].key}(${x.score.toFixed(0)})`).join(' '));
console.log('constructions', s.constructions.length, 'recruits', s.recruits.length);
