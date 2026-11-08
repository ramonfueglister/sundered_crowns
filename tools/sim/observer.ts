// Observer test (spec point 99): the AI plays alone from the start date to a target year.
// Prints a plausibility report every N years and writes owner snapshots for map previews.
// usage: npx tsx tools/sim/observer.ts [toYear=1600] [seed=1356] [startYear=1356] [every=25]
import { writeFileSync, mkdirSync } from 'node:fs';
import { newGame } from './load';
import { step, hashState } from '../../src/sim/engine';
import { dayToDate } from '../../src/sim/calendar';
import { C } from '../../src/sim/defs';

const toYear = +(process.argv[2] ?? 1600), seed = +(process.argv[3] ?? 1356), start = +(process.argv[4] ?? 1356), every = +(process.argv[5] ?? 25);
const out = process.env.OBSERVER_OUT ?? 'build/observer';
mkdirSync(out, { recursive: true });
const { s, w } = newGame(seed, start, []);
const t0 = Date.now();
const report: any[] = [];

function snapshot(year: number) {
  const locs = new Map<number, number>();
  for (let i = 0; i < w.L; i++) { const o = s.loc.owner[i]; if (o >= 0) locs.set(o, (locs.get(o) ?? 0) + 1); }
  const alive = s.nations.filter((n) => n.alive);
  const top = [...locs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id, k]) => `${s.nations[id].short.en} ${k}`);
  let pop = 0, popEu = 0;
  for (let i = 0; i < w.L; i++) { let p = 0; for (let c = 0; c < C; c++) p += s.loc.pop[i * C + c]; pop += p; if (w.lon[i] > -12 && w.lon[i] < 40 && w.lat[i] > 35) popEu += p; }
  const subjects = alive.filter((n) => n.overlord >= 0).length;
  const colonial = alive.filter((n) => n.subjectType === 'colonial').map((n) => n.short.en);
  const faiths: Record<string, number> = {};
  for (let i = 0; i < w.L; i++) if (s.loc.owner[i] >= 0) faiths[s.loc.faith[i]] = (faiths[s.loc.faith[i]] ?? 0) + 1;
  const ruler = (key: string) => { const n = s.nations.find((x) => x.key === key); return n ? `${n.short.en}:${n.alive ? locs.get(n.id) ?? 0 : 'gone'}` : `${key}:?`; };
  const row = {
    year, msPerDay: +((Date.now() - t0) / Math.max(1, s.day)).toFixed(1), alive: alive.length, subjects, wars: s.wars.length,
    popM: +(pop / 1e6).toFixed(1), europeM: +(popEu / 1e6).toFixed(1), priceLevel: +s.priceLevel.toFixed(2),
    top, colonial, companies: (s.companies ?? []).map((c) => c.name.en),
    watch: ['france', 'england', 'castile', 'aragon', 'portugal', 'ottoman', 'byzantium', 'hungary', 'poland', 'lithuania', 'moscow', 'golden_horde', 'venice', 'milan', 'bohemia', 'austria', 'burgundy'].map(ruler),
    situations: (s.situations ?? []).filter((x: any) => x.active || x.ended).map((x: any) => `${x.id}${x.active ? '*' : ''}${x.outcome ? '=' + x.outcome : ''}`),
    faiths,
    hash: hashState(s),
  };
  report.push(row);
  console.log(JSON.stringify(row));
  writeFileSync(`${out}/owner_${year}.json`, JSON.stringify({ year, owner: Array.from(s.loc.owner.slice(0, w.L)), colors: s.nations.map((n) => n.color), names: s.nations.map((n) => n.short.en) }));
}

snapshot(start);
let nextYear = start + every;
for (;;) {
  step(s, w, []);
  const d = dayToDate(s.day, s.startYear);
  if (d.y >= nextYear && d.m === 0 && d.d === 1) { snapshot(d.y); nextYear += every; }
  if (d.y >= toYear || (s as any).ended) break;
}
snapshot(dayToDate(s.day, s.startYear).y);
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
console.log('chronicle entries', s.chronicle?.length ?? 0, 'total minutes', ((Date.now() - t0) / 60000).toFixed(1));
