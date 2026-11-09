// Exploration (shared knowledge per cultural sphere) and colonisation of unclaimed land.
import type { GameState, Nation } from '../types';
import type { World } from '../world';
import { type System, clamp, chronicle, notice, bump } from '../ctx';
import { B, BI, C, CL } from '../defs';
import { armyMen, newArmy, availableUnits, releaseNation } from './military';
import * as warmod from './war';
const require_war = () => warmod;
import { lawEffect } from './politics';
import { chance, rand } from '../rng';
import { expeditionSaw, expeditionArrived, expeditionLost, CHART_KM } from './explore';
export { startExplorer } from './explore';

export function knows(s: GameState, n: Nation, l: number): boolean {
  if (s.flags.revealAll) return true;
  const e = s.explored[n.knows]; return !e || e[l] === 1;
}
function reveal(s: GameState, w: World, n: Nation, center: number, km: number, onNew?: (l: number) => void) {
  const e = s.explored[n.knows]; if (!e) return 0;
  let k = 0;
  // cheap radius reveal: BFS limited by distance
  const seen = new Set<number>([center]); const q = [center];
  while (q.length) {
    const u = q.pop()!;
    if (!e[u]) { e[u] = 1; k++; onNew?.(u); }
    for (let j = w.adjStart[u]; j < w.adjStart[u + 1]; j++) { const v = w.adj[j]; if (!seen.has(v) && w.distKm(center, v) < km) { seen.add(v); q.push(v); } }
  }
  return k;
}

/** How far from our coasts settlers can be sent. Once our own sailors have crossed the Ocean Sea (or the route is
 *  common knowledge and our navigators are able), the far shore is in reach. */
export function colonialRange(n: Nation, s?: GameState, w?: World) {
  const crossed = s && (s.flags[`newworld_${n.id}`] || (s.flags.ocean_open && n.tech[1] >= 12 && n.flags.atlantic && w && europeanCrown(w, n)));
  return 300 + n.tech[1] * 70 + lawEffect(n, 'colonial_range') * 1000 + (crossed ? 4000 : 0);
}
export function colonySlots(n: Nation) { return n.tech[1] >= 9 ? 1 + Math.floor((n.tech[1] - 9) / 5) + (lawEffect(n, 'colonists') | 0) : 0; }


export function canColonize(s: GameState, w: World, n: Nation, loc: number): string | null {
  if (loc < 0 || loc >= w.L) return 'not land';
  if (s.loc.owner[loc] >= 0) return 'already claimed';
  if (!knows(s, n, loc)) return 'unknown land';
  if (s.loc.colonist[loc] >= 0) return 'someone is already settling here';
  if (s.colonies.filter((c) => c.nation === n.id).length >= colonySlots(n)) return 'no colonists available';
  // within range of own land (any coastal location or neighbour)
  let near = false;
  for (let e = w.adjStart[loc]; e < w.adjStart[loc + 1] && !near; e++) { const v = w.adj[e]; if (v < w.L && s.loc.owner[v] === n.id) near = true; }
  if (!near) {
    let bd = Infinity;
    for (let i = 0; i < w.L; i++) if (s.loc.owner[i] === n.id && w.coastal[i]) { const d = w.distKm(i, loc); if (d < bd) bd = d; }
    // empty land within the old world is settled from next door, not from across the continent
    const oldWorld = EUROPE.has(w.provinces[w.provOf[loc]]?.region ?? '');
    if (bd > (oldWorld ? 400 : colonialRange(n, s, w)) || !w.coastal[loc]) return 'out of colonial range';
  }
  return null;
}
/** Price of sending out settlers: 40 marks (times the price level), less with colonising effects (crown
 *  expeditions, chartered companies, frontier societies). */
export function colonyCost(s: GameState, n: Nation): number { return 40 * s.priceLevel / Math.max(0.5, 1 + lawEffect(n, 'colonise')); }
/** Progress of a settlement a month in percent: 100/36 (three years), faster with colonising effects. */
export function colonyProgress(n: Nation): number { return 100 / 36 * Math.max(0.3, 1 + lawEffect(n, 'colonise')); }
export function startColony(s: GameState, w: World, n: Nation, loc: number): string | null {
  const e = canColonize(s, w, n, loc); if (e) return e;
  const cost = colonyCost(s, n);
  if (n.treasury < cost) return 'not enough gold';
  n.treasury -= cost; n.expenseAcc.colonists = (n.expenseAcc.colonists || 0) + cost;
  s.colonies.push({ loc, nation: n.id, settlers: 200, progress: 0, started: s.day });
  s.loc.colonist[loc] = n.id;
  return null;
}

function coloniesMonth(s: GameState, w: World) {
  for (const c of s.colonies.slice()) {
    const n = s.nations[c.nation];
    if (!n?.alive || s.loc.owner[c.loc] >= 0) { s.colonies.splice(s.colonies.indexOf(c), 1); s.loc.colonist[c.loc] = -1; continue; }
    const upkeep = 3 * s.priceLevel;
    n.treasury -= upkeep; n.expenseAcc.colonists = (n.expenseAcc.colonists || 0) + upkeep;
    let native = 0; for (let k = 0; k < C; k++) native += s.loc.pop[c.loc * C + k];
    c.settlers += 25 * Math.max(0.2, 1 + lawEffect(n, 'colonial_growth'));
    c.progress += colonyProgress(n);
    // natives may resist
    if (native > 2000 && chance(s.rng, Math.min(0.12, native / 200000))) {
      c.settlers *= 0.7; c.progress = Math.max(0, c.progress - 10);
      if (s.playerNations.includes(n.id)) notice(s, n.id, 'natives', { en: `Natives attacked our settlers at ${w.names[c.loc]}.`, de: `Einheimische haben unsere Siedler bei ${w.namesDe[c.loc]} angegriffen.` }, { loc: c.loc });
    }
    if (c.progress >= 100) {
      s.colonies.splice(s.colonies.indexOf(c), 1);
      s.loc.colonist[c.loc] = -1;
      s.loc.owner[c.loc] = n.id; s.loc.ctrl[c.loc] = n.id; s.loc.core[c.loc] = n.id; s.loc.integ[c.loc] = 0.6;
      s.loc.control[c.loc] = 0.3;
      // settlers become the new majority unless natives are many
      const base = c.loc * C;
      s.loc.pop[base + CL.peasants] += c.settlers * 0.7; s.loc.pop[base + CL.artisans] += c.settlers * 0.15; s.loc.pop[base + CL.burghers] += c.settlers * 0.1; s.loc.pop[base + CL.clergy] += c.settlers * 0.05;
      if (c.settlers * 1.5 > native) { s.loc.minCulture[c.loc] = s.loc.culture[c.loc]; s.loc.minFaith[c.loc] = s.loc.faith[c.loc]; s.loc.minShare[c.loc] = clamp(native / (native + c.settlers), 0, 0.9); s.loc.culture[c.loc] = n.culture; s.loc.faith[c.loc] = n.faith; }
      s.flags.ownershipDirty = s.day; bump();
      n.stats.locsGained++;
      chronicle(s, n.id, 'colony', { en: `${n.short.en} founded a settlement at ${w.names[c.loc]}.`, de: `${n.short.de} gründete eine Siedlung bei ${w.namesDe[c.loc]}.` }, c.loc);
      if (s.playerNations.includes(n.id)) notice(s, n.id, 'colony', { en: `Our colony at ${w.names[c.loc]} is established.`, de: `Unsere Kolonie bei ${w.namesDe[c.loc]} ist gegründet.` }, { loc: c.loc });
    }
  }
}

function explorersDay(s: GameState, w: World) {
  for (const ex of s.explorers.slice()) {
    const f = s.armies.find((a) => a.id === ex.id);
    const n = s.nations[ex.nation];
    if (!f || !n?.alive) { s.explorers.splice(s.explorers.indexOf(ex), 1); if (n?.alive && ex.since !== undefined) expeditionLost(s, w, n, ex); continue; }
    if (f.loc !== ex.loc) {
      ex.loc = f.loc;
      const k = reveal(s, w, n, f.loc, ex.since !== undefined ? CHART_KM : 260, ex.since !== undefined ? (l) => expeditionSaw(s, w, ex, l) : undefined);
      if (k > 0 && s.playerNations.includes(n.id) && chance(s.rng, 0.1)) notice(s, n.id, 'discovery', { en: `Our navigators charted new waters near ${w.names[f.loc]}.`, de: `Unsere Seefahrer kartierten neue Gewässer bei ${w.namesDe[f.loc]}.` }, { loc: f.loc });
      // first sighting of a new continent
      if (w.lon[f.loc] < -40 && !s.flags[`newworld_${n.id}`]) {
        s.flags[`newworld_${n.id}`] = s.day;
        s.flags.ocean_open = s.flags.ocean_open || s.day;
        chronicle(s, n.id, 'discovery', { en: `Sailors of ${n.short.en} sighted unknown lands across the Ocean Sea.`, de: `Seeleute aus ${n.short.de} sichteten unbekannte Länder jenseits des Ozeans.` }, f.loc);
      }
      // long voyages cost ships
      if (w.distKm(f.loc, n.capital) > 3000 && chance(s.rng, 0.01)) for (const r of f.regs) r.men = Math.max(0, r.men - 1);
    }
    if (!f.path.length) { s.explorers.splice(s.explorers.indexOf(ex), 1); if (ex.since !== undefined) expeditionArrived(s, w, n, ex, f); }
  }
}

/** AI colonial ambition: nations with colonists pick the best reachable unclaimed land. */
function aiColonize(s: GameState, w: World) {
  for (const n of s.nations) {
    if (!n.alive || s.playerNations.includes(n.id) || n.playerId) continue;
    if (colonySlots(n) <= s.colonies.filter((c) => c.nation === n.id).length) continue;
    if (n.treasury < 80 * s.priceLevel) continue;
    let best = -1, bv = -Infinity;
    const off = Math.floor(rand(s.rng) * 37);
    for (let i = off; i < w.L; i += 37) {
      if (s.loc.owner[i] >= 0 || s.loc.colonist[i] >= 0 || !knows(s, n, i)) continue;
      let native = 0; for (let k = 0; k < C; k++) native += s.loc.pop[i * C + k];
      const v = s.loc.dev[i] * 0.5 + (w.coastal[i] ? 10 : 0) - native / 5000 + rand(s.rng) * 5;
      if (v > bv && !canColonize(s, w, n, i)) { bv = v; best = i; }
    }
    if (best >= 0) startColony(s, w, n, best);
  }
}

// ---------------- colonial subjects and chartered companies ----------------
/** Regions whose crowns build overseas empires: colonial realms and chartered companies are theirs. */
const EUROPE = new Set(['france', 'low_countries', 'italy', 'iberia', 'bohemia', 'greece', 'british_isles', 'germany', 'baltic', 'poland', 'hungary', 'balkans', 'scandinavia', 'rus']);
export function europeanCrown(w: World, n: Nation): boolean { return n.capital >= 0 && EUROPE.has(w.provinces[w.provOf[n.capital]]?.region ?? ''); }
/** Realms on the Atlantic and the North Sea: a coastal holding west of 6°E, between Gibraltar and Norway. */
function atlantic(s: GameState, w: World, n: Nation): boolean {
  let k = 0;
  for (let i = 0; i < w.L; i++) if (s.loc.owner[i] === n.id && w.coastal[i] && w.lon[i] < 6 && w.lon[i] > -12 && w.lat[i] > 35 && w.lat[i] < 62 && ++k >= 3) return true;
  return false;
}
/** Lands far from the mother country: regions that count as overseas when the capital lies elsewhere. */
const OVERSEAS = new Set(['americas', 'west_africa', 'east_africa', 'sahel']);
const REGION_NAME: Record<string, { en: string; de: string }> = {
  americas_n: { en: 'North America', de: 'Nordamerika' }, americas_c: { en: 'New Spain', de: 'Neuspanien' }, americas_s: { en: 'South America', de: 'Südamerika' },
  west_africa: { en: 'Guinea', de: 'Guinea' }, east_africa: { en: 'Swahili Coast', de: 'Suaheliküste' }, sahel: { en: 'Sahel', de: 'Sahel' },
};
function colonialRegion(w: World, i: number): string | null {
  const r = w.provinces[w.provOf[i]]?.region; if (!r || !OVERSEAS.has(r)) return null;
  if (r !== 'americas') return r;
  return w.lat[i] >= 28 ? 'americas_n' : w.lat[i] >= 8 ? 'americas_c' : 'americas_s';
}
const FORM_AT = 10; // owned overseas locations in one region before they become a colonial realm

/** Large overseas holdings become a colonial realm under the crown: it pays a share of its revenue, grows its own
 *  interests over the decades and may one day fight for independence. */
function colonialSubjectsYear(s: GameState, w: World) {
  const groups = new Map<string, number[]>();
  for (let i = 0; i < w.L; i++) {
    const o = s.loc.owner[i]; if (o < 0) continue;
    const n = s.nations[o]; if (!n?.alive || n.capital < 0 || n.subjectType === 'colonial' || !europeanCrown(w, n)) continue;
    const reg = colonialRegion(w, i); if (!reg) continue;
    if (colonialRegion(w, n.capital) === reg || w.distKm(i, n.capital) < 2500) continue;
    const k = o + ':' + reg; let g = groups.get(k); if (!g) groups.set(k, (g = [])); g.push(i);
  }
  for (const [k, locs] of [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (locs.length < FORM_AT) continue;
    const [os, reg] = k.split(':'); const ov = s.nations[+os];
    // an existing colonial realm of this crown in the region takes the new land instead
    const existing = s.nations.find((x) => x.alive && x.overlord === ov.id && x.subjectType === 'colonial' && x.flags.colonial_region === regionCode(reg));
    if (existing) { const { transferLoc } = require_war(); for (const l of locs) transferLoc(s, w, l, existing.id, 0, { conquest: false }); continue; }
    // the most populous settlement becomes the seat
    let seat = locs[0], best = -1;
    for (const l of locs) { let p = 0; for (let c = 0; c < C; c++) p += s.loc.pop[l * C + c]; if (p > best) { best = p; seat = l; } }
    const ordered = [seat, ...locs.filter((l) => l !== seat)];
    const sub = releaseNation(s, w, ov, ordered, ov.culture);
    const rn = REGION_NAME[reg] ?? { en: reg, de: reg };
    sub.name = { en: `${ov.adj.en} ${rn.en}`, de: `${rn.de} (${ov.short.de})` }; sub.short = { en: `${ov.adj.en} ${rn.en}`, de: `${rn.de} (${ov.short.de})` }; sub.adj = { ...ov.adj };
    sub.faith = ov.faith; sub.gov = ov.gov; sub.rank = 'duchy'; sub.rivals = [];
    sub.color = ov.color.map((v, j) => clamp(v + (j === 1 ? 30 : -20), 0, 255)) as any;
    sub.overlord = ov.id; sub.subjectType = 'colonial'; sub.subjectSince = s.day; sub.libertyDesire = 5;
    sub.flags.colonial_region = regionCode(reg);
    for (const l of locs) s.loc.core[l] = sub.id;
    chronicle(s, ov.id, 'colony', { en: `The overseas holdings of ${ov.short.en} were organised as ${sub.short.en}.`, de: `Die überseeischen Besitzungen von ${ov.short.de} wurden als ${sub.short.de} eingerichtet.` }, seat);
    if (s.playerNations.includes(ov.id)) notice(s, ov.id, 'colonial_realm', { en: `Our lands overseas now form ${sub.short.en}, a colonial realm under our crown.`, de: `Unsere Länder in Übersee bilden nun ${sub.short.de}, ein Kolonialreich unter unserer Krone.` }, { loc: seat });
  }
}
function regionCode(reg: string) { return ['americas_n', 'americas_c', 'americas_s', 'west_africa', 'east_africa', 'sahel'].indexOf(reg) + 1; }

export function companySlots(n: Nation) { return n.tech[1] >= 12 ? 1 + Math.floor((n.tech[1] - 12) / 6) : 0; }
/** Overseas markets a realm may charter a company for: it must hold a coastal place in that market's area, far from home. */
export function charterOptions(s: GameState, w: World, n: Nation): number[] {
  if (n.capital < 0) return [];
  const home = s.loc.market[n.capital];
  const out = new Set<number>();
  for (let i = 0; i < w.L; i++) {
    if (!w.coastal[i]) continue;
    const o = s.loc.owner[i];
    if (o !== n.id && !(o >= 0 && s.nations[o]?.overlord === n.id && s.nations[o]?.subjectType === 'colonial')) continue;
    if (!colonialRegion(w, i) || w.distKm(i, n.capital) < 2500) continue;
    const m = s.loc.market[i]; const hub = s.markets[m]?.hub ?? -1;
    if (m !== home && hub >= 0 && colonialRegion(w, hub) && w.distKm(hub, n.capital) >= 2500) out.add(m);
  }
  return [...out].sort((a, b) => a - b);
}
export function charterCompany(s: GameState, w: World, n: Nation, market: number): string | null {
  if (n.tech[1] < 12) return 'our merchants are not ready (Commerce 12)';
  const mine = (s.companies ?? []).filter((c) => c.nation === n.id);
  if (mine.length >= companySlots(n)) return 'no charter available';
  if (mine.some((c) => c.market === market)) return 'already chartered';
  if (!charterOptions(s, w, n).includes(market)) return 'we hold no harbour there';
  const cost = 600 * s.priceLevel;
  if (n.treasury < cost) return 'not enough gold';
  n.treasury -= cost; n.expenseAcc.charter = (n.expenseAcc.charter || 0) + cost;
  const hub = w.names[s.markets[market].hub];
  const name = { en: `${n.adj.en} ${hub} Company`, de: `${hub}-Kompanie (${n.short.de})` };
  (s.companies ??= []).push({ nation: n.id, market, home: s.loc.market[n.capital], since: s.day, name });
  chronicle(s, n.id, 'company', { en: `${n.short.en} chartered the ${name.en}.`, de: `${n.short.de} gründete die ${name.de}.` }, s.markets[market].hub);
  return null;
}
function companiesYear(s: GameState, w: World) {
  // companies lapse when their realm falls or no longer holds a harbour in the market
  if (s.companies?.length) s.companies = s.companies.filter((c) => { const n = s.nations[c.nation]; return n?.alive && charterOptions(s, w, n).includes(c.market); });
  // (the AI charters through the same command as the player: systems/tradeai.ts)
}

export const colonial: System = {
  id: 'colonial',
  init(s, w) { s.loc.colonist.fill(-1); for (const n of s.nations) n.flags.atlantic = atlantic(s, w, n) ? 1 : 0; },
  daily({ s, w }) { explorersDay(s, w); },
  monthly({ s, w, date }) {
    coloniesMonth(s, w);
    if (date.m % 3 === 1) aiColonize(s, w);
  },
  yearly({ s, w }) {
    for (const n of s.nations) if (n.alive) n.flags.atlantic = atlantic(s, w, n) ? 1 : 0;
    colonialSubjectsYear(s, w); companiesYear(s, w);
  },
};
void armyMen; void newArmy; void availableUnits;
