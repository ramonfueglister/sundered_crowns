// Content check: AI-only game that reports what the systems content does over time.
// npx tsx tools/sim/check_content.ts [years=40] [seed=1356] [startYear=1356]
// startYear other than 1356 re-dates the 1356 setup (for testing later situations; the map is still that of 1356).
// The goals system is run here by hand until it is registered in src/sim/systems/index.ts.
import { loadWorld, loadSetup, loadHubs } from './load';
import { advanceDay } from '../../src/sim/engine';
import { createGame } from '../../src/sim/setup';
import { dayToDate } from '../../src/sim/calendar';
import { mkCtx } from '../../src/sim/ctx';
import { SYSTEMS } from '../../src/sim/systems';
import { goals as goalsSystem } from '../../src/sim/systems/goals';
import { SITUATIONS } from '../../src/sim/content/situations';
import { DOCTRINES } from '../../src/sim/content/doctrines';
import { INNOVATIONS } from '../../src/sim/content/innovations';
import { DECISIONS } from '../../src/sim/content/decisions';
import { GOALS, GOAL_PLACES, GOAL_NATIONS } from '../../src/sim/content/goals';
import { FAITHS } from '../../src/sim/content/peoples';

const years = Number(process.argv[2] || 40), seed = Number(process.argv[3] || 1356), startYear = Number(process.argv[4] || 1356);
const w = loadWorld();
const setup = loadSetup(1356); setup.year = startYear;
const t0 = Date.now();
const s = createGame(w, setup, loadHubs(), seed);
const registered = SYSTEMS.some((x) => x.id === 'goals');
if (startYear > 1356) { // test scaffolding for re-dated starts: the Curia has aged as it would have
  s.papacy.corruption = Math.min(100, 30 + (startYear - 1356) * 0.3); s.papacy.reformPressure = 30;
}
console.log(`start ${startYear}, seed ${seed}, ${years} years; goals system ${registered ? 'registered' : 'run by this script'}; setup ${Date.now() - t0} ms`);

// static checks
const missing = [...GOAL_PLACES].filter((nm) => !w.names.slice(0, w.L).includes(nm));
console.log(`goal places: ${GOAL_PLACES.size}, missing on map: ${missing.length ? missing.join(', ') : 'none'}`);
for (const inv of INNOVATIONS) if (!w.names.slice(0, w.L).includes(inv.origin)) console.log(`innovation ${inv.id}: origin ${inv.origin} not on map (lat/lon fallback)`);
const keys = new Set(s.nations.map((n) => n.key));
for (const k of GOAL_NATIONS) if (!keys.has(k)) console.log(`goal tree for unknown nation key ${k}`);
console.log(`content: ${DOCTRINES.length} doctrine groups × ${DOCTRINES.map((d) => d.picks.length).join('/')}, ${INNOVATIONS.length} innovations, ${SITUATIONS.length} situations, ${DECISIONS.length} decisions, ${GOALS.length} goals (${GOAL_NATIONS.size} national trees)`);

const stageName = (id: string, st: number) => SITUATIONS.find((d) => d.id === id)?.stages?.[st]?.en ?? String(st);
const last: Record<string, string> = {};
const logSituations = (y: number) => {
  for (const sit of s.situations) {
    const k = sit.active ? `${sit.stage}` : `end:${sit.outcome}`;
    if (last[sit.id] === k) continue;
    last[sit.id] = k;
    const extra = Object.entries(sit.data).filter(([kk, v]) => typeof v === 'number' || typeof v === 'string').slice(0, 8).map(([kk, v]) => `${kk}=${typeof v === 'number' ? Math.round(v * 100) / 100 : v}`).join(' ');
    console.log(`  [${y}] ${sit.id}: ${sit.active ? `stage ${sit.stage} “${stageName(sit.id, sit.stage)}” progress ${sit.progress}` : `ENDED (${sit.outcome})`} ${extra}`);
  }
};
const days = Math.round(years * 365.25);
let lastY = startYear;
const t1 = Date.now();
logSituations(startYear);
for (let k = 0; k < days; k++) {
  advanceDay(s, w);
  const c = mkCtx(s, w);
  if (!registered && c.date.d === 1) goalsSystem.monthly!(c);
  const y = c.date.y;
  if (y !== lastY) {
    lastY = y; logSituations(y);
    if (y % 10 === 0) {
      const P = s.papacy;
      const reform = s.nations.filter((n) => n.alive && ['hussite', 'evangelical', 'reformed', 'anglican_type'].includes(FAITHS[n.faith].id)).map((n) => `${n.key}:${FAITHS[n.faith].id}`);
      console.log(`  -- ${y}: alive ${s.nations.filter((n) => n.alive).length}, wars ${s.wars.length}, papacy corruption ${P.corruption.toFixed(1)} reformPressure ${P.reformPressure.toFixed(1)} schism ${P.schism}, reform realms [${reform.join(' ')}], top ${s.ranking.slice(0, 5).map((i) => s.nations[i].key).join(' ')}`);
    }
  }
}
const ms = Date.now() - t1;
console.log(`ran ${days} days in ${(ms / 1000).toFixed(0)} s = ${(ms / days).toFixed(2)} ms/day`);

const alive = s.nations.filter((n) => n.alive);
console.log('\n== situations');
for (const sit of s.situations) console.log(`  ${sit.id}: ${sit.active ? `active stage ${sit.stage} progress ${sit.progress}` : `ended ${dayToDate(sit.ended ?? 0, s.startYear).y} (${sit.outcome})`} started ${dayToDate(sit.started, s.startYear).y}${sit.data.err ? ` ERROR x${sit.data.errs}: ${sit.data.err}` : ''}`);
for (const d of SITUATIONS) if (!s.situations.some((x) => x.id === d.id)) console.log(`  ${d.id}: never started`);
const rev = s.situations.find((x) => x.id === 'age_of_revolution');
if (rev) console.log(`  revolutions: ${(rev.data.revs || []).map((id: number) => `${s.nations[id].key}(${dayToDate(s.nations[id].flags.revolution ?? 0, s.startYear).y})`).join(' ')}; top pressure: ${Object.entries(rev.data.p || {}).sort((a: any, b: any) => b[1] - a[1]).slice(0, 6).map(([k, v]: any) => `${s.nations[+k].key}:${v.toFixed(1)}`).join(' ')}`);
const unr = alive.map((n) => { let u = 0; const ls: number[] = []; for (let i = 0; i < w.L; i++) if (s.loc.owner[i] === n.id) ls.push(i); for (const l of ls) u += s.loc.unrest[l]; return ls.length ? u / ls.length : 0; }).sort((a, b) => a - b);
console.log(`  realm avg unrest: median ${unr[unr.length >> 1].toFixed(1)}, p90 ${unr[Math.floor(unr.length * 0.9)].toFixed(1)}; realms in debt: ${alive.filter((n) => n.debt > 0).length}/${alive.length}`);
console.log('  situation chronicle:');
for (const c of s.chronicle) if (c.kind === 'situation') console.log(`    ${dayToDate(c.day, s.startYear).y} ${c.text.en}`);

console.log('\n== doctrines');
let total = 0;
for (const d of DOCTRINES) {
  const ns = alive.filter((n) => (n.doctrines[d.id] || 0) > 0);
  const picks = ns.reduce((p, n) => p + n.doctrines[d.id], 0); total += picks;
  console.log(`  ${d.id.padEnd(12)} era ${d.era}: ${String(ns.length).padStart(3)} realms, ${String(picks).padStart(4)} picks, complete ${ns.filter((n) => n.doctrines[d.id] >= d.picks.length).length}`);
}
const majors = ['england', 'france', 'castile', 'aragon', 'portugal', 'venice', 'ottoman', 'moscow', 'poland', 'hungary', 'bohemia', 'austria', 'papal_states', 'mamluk', 'lithuania'];
console.log(`  total picks ${total}; majors: ${majors.map((k) => { const n = s.nations.find((x) => x.key === k); return n ? `${k}{${Object.entries(n.doctrines).map(([g, v]) => `${g}:${v}`).join(',')}} era${n.era}` : ''; }).join(' ')}`);

console.log('\n== innovations');
for (const st of s.innovations) {
  const inv = INNOVATIONS[st.id];
  let reached = 0; for (let i = 0; i < st.reached.length; i++) reached += st.reached[i];
  const adopted = alive.filter((n) => n.innovations.includes(st.id));
  console.log(`  ${inv.id.padEnd(22)} appeared ${dayToDate(st.day, s.startYear).y} at ${w.names[st.origin]}: reached ${reached} locations, adopted by ${adopted.length} realms ${adopted.slice(0, 8).map((n) => n.key).join(' ')}`);
}
for (const inv of INNOVATIONS) if (!s.innovations.some((x) => x.key === inv.id) && inv.year <= startYear + years) console.log(`  ${inv.id}: NOT appeared though year ${inv.year}`);

console.log('\n== decisions');
for (const d of DECISIONS) {
  const takers = s.nations.filter((n) => n.flags[`dec_${d.id}`] !== undefined);
  const times = s.chronicle.filter((c) => c.kind === 'decision' && c.text.en.endsWith(`: ${d.name.en}.`)).length;
  console.log(`  ${d.id.padEnd(26)} taken ${String(times).padStart(3)}× by ${takers.length} realms ${takers.slice(0, 10).map((n) => `${n.key}(${dayToDate(n.flags[`dec_${d.id}`], s.startYear).y})`).join(' ')}`);
}
const renamed = s.nations.filter((n) => n.alive && ['Spain', 'Great Britain', 'Italy', 'Germany', 'Russia'].includes(n.short.en));
if (renamed.length) console.log(`  formed realms: ${renamed.map((n) => `${n.key}→${n.name.en}`).join(', ')}`);
const govs: Record<string, number> = {}; for (const n of alive) govs[n.gov] = (govs[n.gov] || 0) + 1;
console.log(`  governments: ${JSON.stringify(govs)}`);

console.log('\n== goals');
const byGoal: Record<string, number> = {};
for (const n of s.nations) for (const g of n.goalsDone || []) byGoal[g] = (byGoal[g] || 0) + 1;
console.log(`  completed in all: ${Object.values(byGoal).reduce((p, x) => p + x, 0)}, of which inherited at start (no reward): ${s.nations.reduce((p, n) => p + (n.flags.goals_inherited || 0), 0)}`);
for (const k of GOAL_NATIONS) {
  const n = s.nations.find((x) => x.key === k);
  const tree = GOALS.filter((g) => g.nation === k);
  const inh = n?.flags.goals_inherited || 0; const gd = n?.goalsDone || [];
  console.log(`  ${k.padEnd(13)} ${n?.alive ? '' : '(dead) '}${gd.length}/${tree.length}: inherited [${gd.slice(0, inh).map((g) => g.split('.')[1]).join(' ')}] achieved [${gd.slice(inh).map((g) => g.split('.')[1]).join(' ')}]`);
}
console.log(`  generic: ${GOALS.filter((g) => !g.nation).map((g) => `${g.id.split('.')[1]}:${byGoal[g.id] || 0}`).join(' ')}`);
const kinds: Record<string, number> = {}; for (const c of s.chronicle) kinds[c.kind] = (kinds[c.kind] || 0) + 1;
console.log(`\n== chronicle by kind: ${Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')}`);
for (const sit of s.situations) console.log(`  data ${sit.id}: ${Object.entries(sit.data).filter(([, v]) => typeof v !== 'object').map(([k, v]) => `${k}=${typeof v === 'number' ? Math.round(v * 100) / 100 : v}`).join(' ')}`);
console.log(`\n== modifiers per realm (avg) ${(alive.reduce((p, n) => p + n.modifiers.length, 0) / alive.length).toFixed(1)}, chronicle ${s.chronicle.length}, notices ${s.notices.length}`);
