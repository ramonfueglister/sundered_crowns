// Event content check: static validation, direct trigger/setup/effect tests, and an AI run counting how often each event fires.
// npx tsx tools/sim/check_events.ts [years=30] [seed=1356]     (years=0 skips the run)
import { newGame } from './load';
import { advanceDay } from '../../src/sim/engine';
import { dayToDate } from '../../src/sim/calendar';
import { EVENTS } from '../../src/sim/content/events';
import { Effects, interpolate, type EvApi, type EventDef } from '../../src/sim/systems/events';
import type { GameState, Nation } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import { B, C } from '../../src/sim/defs';

const years = Number(process.argv[2] ?? 30), seed = Number(process.argv[3] || 1356);
const problems: string[] = [];
const warn = (m: string) => problems.push(m);

// ---------------- static checks ----------------
const FORBIDDEN = /\b(stability|legitimacy|aggressive expansion|monarch points?|admin points?|diplo points?|mil points?|casus belli|badboy|prestige points)\b/i;
const PLACE = /\{(nation|ruler|loc|other|year|adj|amount)\}/g;
const ids = new Set<string>();
const byFile: Record<string, number> = {};
for (const d of EVENTS) {
  if (ids.has(d.id)) warn(`duplicate id ${d.id}`); ids.add(d.id);
  const strs: [string, { en: string; de: string }][] = [['title', d.title], ['text', d.text], ...d.options.map((o, k) => [`option ${k}`, o.label] as [string, { en: string; de: string }]), ...d.options.filter((o) => o.hint).map((o, k) => [`hint ${k}`, o.hint!] as [string, { en: string; de: string }])];
  for (const [what, t] of strs) {
    if (!t || !t.en?.trim() || !t.de?.trim()) { warn(`${d.id}: ${what} missing a language`); continue; }
    if (t.en === t.de && t.en.length > 12) warn(`${d.id}: ${what} German identical to English`);
    if (FORBIDDEN.test(t.en) || FORBIDDEN.test(t.de)) warn(`${d.id}: ${what} uses a forbidden term`);
    const pe = (t.en.match(PLACE) || []).sort().join(), pd = (t.de.match(PLACE) || []).sort().join();
    if (pe !== pd) warn(`${d.id}: ${what} placeholders differ en=[${pe}] de=[${pd}]`);
  }
  if (d.options.length < 2) warn(`${d.id}: fewer than 2 options`);
  for (const [k, o] of d.options.entries()) {
    if (!/fx\./.test(o.effect.toString())) warn(`${d.id}: option ${k} has no fx effect`);
    if (o.ai === undefined) warn(`${d.id}: option ${k} has no ai weight`);
  }
  if (d.mtth < 1 || d.mtth > 600) warn(`${d.id}: mtth ${d.mtth} out of range`);
  if (!d.art) warn(`${d.id}: no art key`);
  const txt = d.text.en + d.title.en + d.options.map((o) => o.label.en).join(' ');
  if (/\{loc\}/.test(txt) && !(d.setup && /ctx\.loc\s*=/.test(d.setup.toString()))) warn(`${d.id}: uses {loc} but setup does not set ctx.loc`);
  if (/\{other\}/.test(txt) && !(d.setup && /ctx\.other\s*=/.test(d.setup.toString()))) warn(`${d.id}: uses {other} but setup does not set ctx.other`);
}

// ---------------- direct tests of triggers, setups and effects ----------------
function mkApi(s: GameState, w: World, n: Nation, year: number, ctx: Record<string, number> = {}): EvApi {
  const d = dayToDate(s.day, s.startYear);
  const e: EvApi = { s, w, n, ctx, year, month: d.m, fx: null as any };
  e.fx = new Effects(() => e);
  return e;
}
function snapshot(s: GameState, n: Nation, ctx: Record<string, number>): string {
  const l = ctx.loc ?? -1;
  let locPart = '';
  if (l >= 0) { let p = 0; for (let c = 0; c < C; c++) p += s.loc.pop[l * C + c]; locPart = [s.loc.unrest[l], s.loc.dev[l], s.loc.devast[l], p, s.loc.faith[l], s.loc.plague[l], Array.from(s.loc.buildings.slice(l * B, l * B + B)).join('.')].join('|'); }
  const ch = n.ruler ? s.chars[n.ruler] : undefined; const he = n.heir ? s.chars[n.heir] : undefined;
  return JSON.stringify([n.treasury, n.concord, n.mandate, n.authority, n.prestige, n.manpower, n.warExhaustion, n.inflation, n.corruption, n.faith, n.estates, n.values, n.modifiers.map((m) => m.id + JSON.stringify(m.effects)), Object.keys(n.flags).length, n.flags.doctrine_pts, n.techProgress, ch?.skills, ch?.traits, ch?.health, he?.skills, he?.traits, Object.keys(s.flags).length, s.papacy.schism, s.papacy.seat, JSON.stringify(s.rel), locPart]);
}
const TEST_YEARS = [1356, 1362, 1378, 1385, 1400, 1415, 1421, 1440, 1453, 1470, 1490, 1500, 1520, 1550, 1580, 1600, 1645, 1690, 1730, 1760, 1790, 1805];
const triggerHits: Record<string, number> = {};
{
  const { s, w } = newGame(seed);
  const t0 = Date.now();
  for (const d of EVENTS) {
    let hits = 0, errs = 0, firstErr = '';
    const ys = [...new Set([...TEST_YEARS, ...(d.minYear ? [d.minYear, d.minYear + 1] : []), ...(d.minYear && d.maxYear ? [Math.round((d.minYear + d.maxYear) / 2)] : [])])];
    for (const y of ys) {
      if (d.minYear && y < d.minYear) continue; if (d.maxYear && y > d.maxYear) continue;
      // make the 1356 map look a little like the year being probed: eras and the ocean route
      const era = y >= 1700 ? 3 : y >= 1560 ? 2 : y >= 1450 ? 1 : 0;
      for (const n of s.nations) n.era = era;
      if (y > 1495) s.flags.west_route_found = 1; else delete s.flags.west_route_found;
      for (const n of s.nations) {
        if (!n.alive || n.capital < 0) continue;
        // months matter for seasonal events: try three seasons
        for (const m of [0, 4, 9]) {
          const e = mkApi(s, w, n, y); e.month = m;
          try { if (d.trigger(e)) hits++; } catch (x) { errs++; if (!firstErr) firstErr = String((x as Error)?.stack || x).split('\n').slice(0, 3).join(' / '); }
        }
      }
    }
    triggerHits[d.id] = hits;
    if (errs) warn(`${d.id}: trigger threw ${errs}x: ${firstErr}`);
  }
  for (const n of s.nations) n.era = 0; delete s.flags.west_route_found;
  console.log(`trigger scan: ${EVENTS.length} events in ${Date.now() - t0} ms`);
  // effects: on a separate game so the scan state stays clean
  const g = newGame(seed); const S = g.s, W = g.w;
  const alive = S.nations.filter((n) => n.alive && n.capital >= 0);
  const sample = [...['england', 'france', 'castile', 'ottoman', 'moscow', 'venice', 'lithuania', 'golden_horde', 'bohemia', 'papal_states', 'florence', 'denmark', 'mamluk', 'hamburg'].map((k) => S.nations.find((n) => n.key === k)!).filter(Boolean), ...alive.filter((_, i) => i % 37 === 0)];
  for (const d of EVENTS) {
    for (const n of sample) {
      if (!n.alive) continue;
      const y = Math.max(d.minYear ?? 1356, 1356);
      const ctx: Record<string, number> = {};
      const e = mkApi(S, W, n, y, ctx);
      let ok = true;
      try { if (d.setup) ok = d.setup(e); } catch (x) { warn(`${d.id}: setup threw for ${n.key}: ${(x as Error).message}`); continue; }
      if (!ok) { ctx.loc = n.capital; ctx.other = S.nations.find((o) => o.alive && o.id !== n.id)!.id; }
      const txt = interpolate(S, W, n, ctx, d.text);
      if ((/\{loc\}|\{other\}/.test(d.text.en)) && (/—/.test(txt.en) || /—/.test(txt.de))) warn(`${d.id}: unresolved placeholder for ${n.key}`);
      for (const [k, o] of d.options.entries()) {
        const before = snapshot(S, n, ctx);
        try { o.effect(e); } catch (x) { warn(`${d.id}: option ${k} threw for ${n.key}: ${(x as Error).message}`); continue; }
        if (snapshot(S, n, ctx) === before) warn(`${d.id}: option ${k} changed nothing for ${n.key}`);
        try { if (typeof o.ai === 'function') o.ai(e); } catch (x) { warn(`${d.id}: ai weight ${k} threw: ${(x as Error).message}`); }
      }
    }
  }
}
// collapse repeated "changed nothing" lines per event/option
{
  const seen = new Map<string, number>(); const out: string[] = [];
  for (const p of problems) { const key = p.replace(/ for [a-z_]+(:.*)?$/, ''); if (seen.has(key)) { seen.set(key, seen.get(key)! + 1); continue; } seen.set(key, 1); out.push(key); }
  problems.length = 0; for (const k of out) problems.push(seen.get(k)! > 1 ? `${k} (x${seen.get(k)})` : k);
}
const never = EVENTS.filter((d) => !triggerHits[d.id]).map((d) => d.id);
console.log(`events: ${EVENTS.length}`);
console.log(`static/direct problems: ${problems.length}`); for (const p of problems) console.log('  - ' + p);
console.log(`never true in the 1356-map scan with eras set per probe year (expected for situational ones): ${never.join(', ') || 'none'}`);

// ---------------- AI run ----------------
if (years > 0) {
  const { s, w } = newGame(seed);
  const fired: Record<string, number> = {}; const realms: Record<string, Set<number>> = {};
  const last: Record<string, number> = {};
  for (const d of EVENTS) { fired[d.id] = 0; realms[d.id] = new Set(); }
  const t0 = Date.now(); const days = Math.round(years * 365.25);
  let lastM = -1, nationYears = 0, chronStart = s.chronicle.length;
  const scan = () => {
    for (const n of s.nations) {
      for (const d of EVENTS) {
        const v = n.flags[`ev_${d.id}`]; if (v === undefined) continue;
        const k = `${n.id}:${d.id}`;
        if (last[k] !== v) { last[k] = v; fired[d.id]++; realms[d.id].add(n.id); }
      }
    }
  };
  let yearsDone = 0;
  for (let k = 0; k < days; k++) {
    advanceDay(s, w);
    const dt = dayToDate(s.day, s.startYear);
    if (dt.m !== lastM) { lastM = dt.m; scan(); if (dt.m === 0) { nationYears += s.nations.filter((n) => n.alive).length; yearsDone++; if (yearsDone % 5 === 0) console.log(`  ${dt.y}: ${Object.values(fired).reduce((a, b) => a + b, 0)} events so far (${((Date.now() - t0) / 1000).toFixed(0)} s)`); } }
  }
  scan();
  const total = Object.values(fired).reduce((a, b) => a + b, 0);
  const majors = s.chronicle.slice(chronStart).filter((c) => c.kind === 'event');
  console.log(`\nAI run ${years} years (seed ${seed}) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.log(`events fired: ${total}; per realm-year: ${(total / Math.max(1, nationYears)).toFixed(3)} (≈ one every ${(nationYears / Math.max(1, total)).toFixed(1)} years per realm)`);
  console.log(`major chronicle entries: ${majors.length}; pending player events left: ${s.pending.length}`);
  const rows = EVENTS.map((d) => ({ id: d.id, n: fired[d.id], r: realms[d.id].size, win: `${d.minYear ?? ''}-${d.maxYear ?? ''}` }));
  rows.sort((a, b) => b.n - a.n);
  console.log('\nfires  realms  window      id');
  for (const r of rows) console.log(`${String(r.n).padStart(5)}  ${String(r.r).padStart(6)}  ${r.win.padEnd(10)}  ${r.id}`);
  const inWindow = EVENTS.filter((d) => (d.minYear ?? 0) <= s.startYear + years && (d.maxYear ?? 9999) >= s.startYear);
  const silent = inWindow.filter((d) => !fired[d.id]).map((d) => d.id);
  console.log(`\nin-window events that never fired: ${silent.length}/${inWindow.length}: ${silent.join(', ')}`);
  const spam = rows.filter((r) => r.n > total * 0.04).map((r) => `${r.id} (${(100 * r.n / total).toFixed(1)}%)`);
  console.log(`possible spam (more than 4% of all fires): ${spam.join(', ') || 'none'}`);
  console.log('\nsample of major entries:'); for (const c of majors.slice(0, 40)) console.log('  ', dayToDate(c.day, s.startYear).y, s.nations[c.nation]?.key, '-', c.text.en);
}
