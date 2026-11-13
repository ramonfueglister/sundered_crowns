// Diagnostic run for the history and budget of key realms: the AI plays alone and every N years the script prints
// land, treasury against yearly revenue, army size and wars of a watch list, plus chronicle lines about them.
// usage: npx tsx tools/sim/history_diag.ts [toYear=1500] [seed=1356] [every=10] [keys=comma list]
// env: DIAG_SAVE=<file> writes the final state.
import { writeFileSync } from 'node:fs';
import { newGame } from './load';
import { step, serialize } from '../../src/sim/engine';
import { dayToDate } from '../../src/sim/calendar';
import { armyMen } from '../../src/sim/systems/military';

const toYear = +(process.argv[2] ?? 1500), seed = +(process.argv[3] ?? 1356), every = +(process.argv[4] ?? 10);
const keys = (process.argv[5] ?? 'portugal,castile,aragon,granada,france,england,ottoman,byzantium,moscow,tver,novgorod,lithuania,golden_horde,hungary').split(',');
const { s, w } = newGame(seed, 1356, []);
const ids = new Set(keys.map((k) => s.nations.find((n) => n.key === k)?.id ?? -1).filter((x) => x >= 0));
let lastChron = 0;
const sum = (o: Record<string, number>) => Object.values(o).reduce((p, v) => p + v, 0);
function report(y: number) {
  const locs = new Map<number, number>();
  for (let i = 0; i < w.L; i++) { const o = s.loc.owner[i]; if (o >= 0) locs.set(o, (locs.get(o) ?? 0) + 1); }
  const men = new Map<number, number>(), ships = new Map<number, number>();
  for (const a of s.armies) if (!a.rebels) (a.fleet ? ships : men).set(a.owner, ((a.fleet ? ships : men).get(a.owner) ?? 0) + armyMen(a));
  console.log(`== ${y} alive ${s.nations.filter((n) => n.alive).length} wars ${s.wars.length} bankrupt ${s.nations.filter((n) => n.alive && (n.flags.bankrupt_until ?? 0) > s.day).length} price ${s.priceLevel.toFixed(2)}`);
  for (const id of ids) {
    const n = s.nations[id];
    if (!n.alive) { console.log(`  ${n.key}: gone`); continue; }
    const inc = sum(n.income), exp = sum(n.expense);
    const wars = s.wars.filter((x) => x.att.includes(id) || x.def.includes(id)).map((x) => `${x.goal.type}:${s.nations[x.attLead].key}>${s.nations[x.defLead].key}(${((s.day - x.start) / 365).toFixed(1)}y,${Math.round(x.score)})`);
    console.log(`  ${n.key}${n.overlord >= 0 ? `[${n.subjectType} of ${s.nations[n.overlord].key}]` : ''}: locs ${locs.get(id) ?? 0} gold ${Math.round(n.treasury)} inc/m ${inc.toFixed(0)} exp/m ${exp.toFixed(0)} chest/yr ${(n.treasury / Math.max(1, inc * 12)).toFixed(1)} loans ${n.loans.length} men ${men.get(id) ?? 0}/${Math.round(n.maxManpower)} ships ${ships.get(id) ?? 0} tax ${n.taxRate.map((t) => t.toFixed(2)).join('/')} allies ${s.treaties.filter((t) => t.type === 'alliance' && t.until > s.day && (t.a === id || t.b === id)).map((t) => s.nations[t.a === id ? t.b : t.a].key).join(',')} ${wars.join(' ')}`);
  }
  // richest realms against their revenue
  const rich = s.nations.filter((n) => n.alive).map((n) => [n, n.treasury / Math.max(1, sum(n.income) * 12)] as const).sort((a, b) => b[0].treasury - a[0].treasury).slice(0, 8);
  console.log('  richest: ' + rich.map(([n, r]) => `${n.key} ${Math.round(n.treasury / 1000)}k (${r.toFixed(1)}y)`).join(', '));
  for (const c of s.chronicle.slice(lastChron)) if (ids.has(c.nation) || keys.some((k) => c.text.en.toLowerCase().includes(k.replace('_', ' ')))) console.log(`    ${dayToDate(c.day, s.startYear).y}: [${c.kind}] ${c.text.en}`);
  lastChron = s.chronicle.length;
}
report(1356);
let next = 1356 + every;
for (;;) {
  step(s, w, []);
  const d = dayToDate(s.day, s.startYear);
  if (d.y >= next && d.m === 0 && d.d === 1) { report(d.y); next += every; }
  if (d.y >= toYear || s.ended) break;
}
if (process.env.DIAG_SAVE) writeFileSync(process.env.DIAG_SAVE, serialize(s));
