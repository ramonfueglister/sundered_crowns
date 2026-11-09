// Observer test (spec point 99): the AI plays alone from the start date to a target year.
// Prints a plausibility report every N years and writes owner snapshots for map previews.
// usage: npx tsx tools/sim/observer.ts [toYear=1600] [seed=1356] [startYear=1356] [every=25]
// env: OBSERVER_OUT (report dir), OBSERVER_SAVES (dir for full save states at each report year),
//      OBSERVER_NO_MIGRATION=1 (A/B check: every month's migration is undone, nothing else changes)
import { writeFileSync, mkdirSync } from 'node:fs';
import { newGame } from './load';
import { step, hashState, serialize } from '../../src/sim/engine';
import { dayToDate } from '../../src/sim/calendar';
import { C } from '../../src/sim/defs';
import { administration } from '../../src/sim/systems/administration';

const toYear = +(process.argv[2] ?? 1600), seed = +(process.argv[3] ?? 1356), start = +(process.argv[4] ?? 1356), every = +(process.argv[5] ?? 25);
const out = process.env.OBSERVER_OUT ?? 'build/observer';
mkdirSync(out, { recursive: true });
const { s, w } = newGame(seed, start, []);
if (process.env.OBSERVER_NO_MIGRATION) {
  const monthly = administration.monthly!;
  administration.monthly = (c) => { const pop = c.s.loc.pop.slice(); monthly(c); c.s.loc.pop.set(pop); c.s.loc.migr.fill(0); c.s.loc.migrBal.fill(0); };
}
const t0 = Date.now();
const report: any[] = [];
let lastChron = 0;

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
  const ruler = (key: string) => { const n = s.nations.find((x) => x.key === key); return n ? `${n.short.en}:${n.alive ? `${locs.get(n.id) ?? 0}/t${n.tech[1]}/g${Math.round(n.treasury / 1000)}k` : 'gone'}` : `${key}:?`; };
  const techs = alive.map((n) => n.tech[1]).sort((a, b) => a - b);
  // point 99 measures: largest share of European land, longest running war, realms in bankruptcy, use of the systems
  let euro = 0; const euroBy = new Map<number, number>();
  for (let i = 0; i < w.L; i++) if (w.lon[i] > -12 && w.lon[i] < 45 && w.lat[i] > 35 && w.lat[i] < 72) { euro++; const o = s.loc.owner[i]; if (o >= 0) { const top = s.nations[o].overlord >= 0 && s.nations[o].subjectType !== 'tributary' ? s.nations[o].overlord : o; euroBy.set(top, (euroBy.get(top) ?? 0) + 1); } }
  const [bigId, bigN] = [...euroBy.entries()].sort((a, b) => b[1] - a[1])[0] ?? [-1, 0];
  const longestWar = s.wars.reduce((m, x) => Math.max(m, (s.day - x.start) / 365), 0);
  const bankrupt = alive.filter((n) => (n.flags.bankrupt_until ?? 0) > s.day).length;
  const kinds: Record<string, number> = {}; for (const c of (s.chronicle ?? []).slice(lastChron)) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1; lastChron = s.chronicle?.length ?? 0;
  const row = {
    largestEuropeShare: `${s.nations[bigId]?.short.en ?? '-'} ${(bigN / Math.max(1, euro) * 100).toFixed(1)}%`, longestWarYears: +longestWar.toFixed(1), bankrupt,
    chronicleKinds: kinds,
    year, msPerDay: +((Date.now() - t0) / Math.max(1, s.day)).toFixed(1), alive: alive.length, subjects, wars: s.wars.length,
    popM: +(pop / 1e6).toFixed(1), europeM: +(popEu / 1e6).toFixed(1), priceLevel: +s.priceLevel.toFixed(2),
    top, colonial, companies: (s.companies ?? []).map((c) => c.name.en),
    watch: ['france', 'england', 'castile', 'aragon', 'portugal', 'ottoman', 'byzantium', 'hungary', 'poland', 'lithuania', 'moscow', 'golden_horde', 'venice', 'milan', 'bohemia', 'austria', 'burgundy'].map(ruler),
    situations: (s.situations ?? []).filter((x: any) => x.active || x.ended).map((x: any) => `${x.id}${x.active ? '*' : ''}${x.outcome ? '=' + x.outcome : ''}`),
    faiths, tech: { median: techs[techs.length >> 1], max: techs[techs.length - 1] }, colonies: s.colonies.length, explorers: s.explorers.length, ocean: s.flags.ocean_open ? dayToDate(s.flags.ocean_open, s.startYear).y : null,
    hash: hashState(s),
  };
  report.push(row);
  console.log(JSON.stringify(row));
  if (process.env.OBSERVER_SAVES) writeFileSync(`${process.env.OBSERVER_SAVES}/state_${year}.json`, serialize(s));
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
