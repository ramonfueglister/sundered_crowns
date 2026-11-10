// Knowledge: three branches (Governance, Commerce, Warfare), four eras, doctrines and spreading innovations.
import type { GameState, Nation } from '../types';
import type { World } from '../world';
import { type System, clamp, chronicle, notice, DAY_EPOCH } from '../ctx';
import { B, BI, C, CL } from '../defs';
import { DOCTRINES, DOCTRINE_INDEX } from '../content/doctrines';
import { INNOVATIONS } from '../content/innovations';
import { lawEffect, councilBonus } from './politics';
import { dateToDay } from '../calendar';

export const BRANCHES = [
  { id: 'governance', name: { en: 'Governance', de: 'Verwaltung' } },
  { id: 'commerce', name: { en: 'Commerce & Learning', de: 'Handel & Gelehrsamkeit' } },
  { id: 'warfare', name: { en: 'Warfare', de: 'Kriegswesen' } },
];
export const MAX_TECH = 32;
export const ERAS = [
  { id: 'crowns', name: { en: 'Age of Plague and Crowns', de: 'Zeitalter von Pest und Kronen' }, start: 1356, tech: 0 },
  { id: 'horizons', name: { en: 'Age of Print and Horizons', de: 'Zeitalter von Druck und Horizonten' }, start: 1450, tech: 7 },
  { id: 'confessions', name: { en: 'Age of Confessions and Absolutism', de: 'Zeitalter der Konfessionen und des Absolutismus' }, start: 1550, tech: 14 },
  { id: 'reason', name: { en: 'Age of Reason and Revolution', de: 'Zeitalter der Vernunft und Revolution' }, start: 1680, tech: 22 },
];

/** Progress points of one level at the pace of the age (events and envoys grant fractions of it). */
export function techBase(n: Nation, branch: number): number { return 450 * (1 + n.tech[branch] * 0.08); }
/** Progress points needed to reach the next level of a branch. Ahead-of-time research is expensive. */
export function techCost(s: GameState, n: Nation, branch: number): number {
  const lvl = n.tech[branch];
  const year = s.startYear + s.day / 365.25;
  // the pace of the age: level 1 in 1356, level 32 around 1806; each level beyond it costs much more
  const expected = (year - 1342) / 14.5;
  const ahead = lvl - expected;
  const pace = ahead > 0 ? Math.pow(3, ahead) : Math.max(0.5, 1 + ahead * 0.15);
  const neighbours = (s as any)._techSpread?.[n.id]?.[branch] ?? 0; // knowledge of neighbours lowers cost
  return techBase(n, branch) * pace * (1 - Math.min(0.3, neighbours));
}

/** Monthly research points per branch. */
let AG: { e: number; s: GameState | null; a: Float64Array } = { e: -1, s: null, a: new Float64Array(0) };
const AGK = 7; // pop, lit, dev, uni, burghers, nobles, clergy
function aggregates(s: GameState, w: World) {
  if (AG.e === DAY_EPOCH.v && AG.s === s) return AG.a;
  const a = new Float64Array(s.nations.length * AGK); const o = s.loc.owner;
  for (let i = 0; i < w.L; i++) {
    const k = o[i]; if (k < 0) continue;
    const base = i * C, q = k * AGK;
    let p = 0; for (let c = 0; c < C; c++) p += s.loc.pop[base + c];
    a[q] += p; a[q + 1] += s.loc.literacy[i] * p; a[q + 2] += s.loc.dev[i]; a[q + 3] += s.loc.buildings[i * B + BI.university];
    a[q + 4] += s.loc.pop[base + CL.burghers]; a[q + 5] += s.loc.pop[base + CL.nobles]; a[q + 6] += s.loc.pop[base + CL.clergy];
  }
  AG = { e: DAY_EPOCH.v, s, a }; return a;
}
/** The council office that furthers each branch of knowledge. */
export const RESEARCH_OFFICE = ['chancellor', 'treasurer', 'marshal'] as const;
export function researchRate(s: GameState, w: World, n: Nation): [number, number, number] {
  const A = aggregates(s, w), q = n.id * AGK;
  const pop = A[q], lit = A[q + 1], dev = A[q + 2], uni = A[q + 3], burghers = A[q + 4], nobles = A[q + 5], clergy = A[q + 6];
  const litAvg = pop > 0 ? lit / pop : 0;
  const r = s.chars[n.ruler];
  const scale = Math.pow(Math.max(1, dev), 0.3) * 0.9; // large realms learn more, but not in proportion to their size
  const base = (1.2 + scale) * (0.5 + litAvg * 3) * (1 + uni * 0.12) * Math.max(0.1, 1 + lawEffect(n, 'research'));
  const burgherShare = pop > 0 ? burghers / pop : 0;
  // each branch has its office on the council: the chancellor's chancery for Governance, the treasurer's counting
  // house for Commerce & Learning, the marshal for Warfare (twice the office bonus, so up to +20 %)
  const g = base * (1 + (r ? r.skills[0] * 0.04 : 0)) * (1 + 2 * councilBonus(s, n, RESEARCH_OFFICE[0]));
  const c = base * (1 + burgherShare * 6 + (n.gov === 'merchant_republic' ? 0.2 : 0)) * (1 + (clergy / Math.max(1, pop)) * 3) * (1 + 2 * councilBonus(s, n, RESEARCH_OFFICE[1]));
  const m = base * (1 + (r ? r.skills[2] * 0.04 : 0) + (nobles / Math.max(1, pop)) * 10) * (1 + 2 * councilBonus(s, n, RESEARCH_OFFICE[2]));
  const pr = n.flags.research_focus ?? -1;
  const out: [number, number, number] = [g, c, m];
  if (pr >= 0 && pr < 3) { out[pr] *= 1.35; for (let k = 0; k < 3; k++) if (k !== pr) out[k] *= 0.85; }
  return out;
}

/** Spend gold on scholars for a branch (also sets research focus). */
export function investTech(s: GameState, w: World, n: Nation, branch: number): string | null {
  if (branch < 0 || branch > 2) return 'unknown branch';
  if (n.tech[branch] >= MAX_TECH) return 'nothing left to learn';
  n.flags.research_focus = branch;
  const cost = Math.max(25, (n.income.tax || 10) * 2) ;
  if (n.treasury < cost) return null; // only focus change
  if ((n.flags[`invest_${branch}`] || 0) > s.day) return null;
  n.treasury -= cost; n.expenseAcc.scholars = (n.expenseAcc.scholars || 0) + cost;
  n.techProgress[branch] += techCost(s, n, branch) * 0.25;
  n.flags[`invest_${branch}`] = s.day + 180;
  return null;
}

export function eraOf(s: GameState, n: Nation): number {
  const year = s.startYear + Math.floor(s.day / 365.25);
  const avg = (n.tech[0] + n.tech[1] + n.tech[2]) / 3;
  let e = 0;
  for (let k = 1; k < ERAS.length; k++) if (year >= ERAS[k].start - 25 && avg >= ERAS[k].tech) e = k;
  // the era of the world moves on; laggards are pulled along slowly
  for (let k = 1; k < ERAS.length; k++) if (year >= ERAS[k].start + 60) e = Math.max(e, k);
  return e;
}

// ---------------- doctrines ----------------
export function doctrinePoints(n: Nation) { return n.flags.doctrine_pts || 0; }
export function takeDoctrine(s: GameState, w: World, n: Nation, group: string): string | null {
  const g = DOCTRINES[DOCTRINE_INDEX[group]]; if (!g) return 'unknown doctrine';
  const taken = n.doctrines[group] || 0;
  if (taken >= g.picks.length) return 'doctrine complete';
  if (g.era > n.era) return 'not yet in this era';
  const groupsStarted = Object.keys(n.doctrines).filter((k) => (n.doctrines[k] || 0) > 0);
  if (!taken && groupsStarted.length >= doctrineSlots(n)) return 'no free doctrine slot';
  const cost = doctrineCost(n);
  if (doctrinePoints(n) < cost) return 'not enough insight';
  n.flags.doctrine_pts -= cost;
  n.doctrines[group] = taken + 1;
  const p = g.picks[taken];
  n.modifiers.push({ id: `doc_${group}_${taken}`, until: 1e9, label: p.name, effects: { ...p.effects } });
  if (taken + 1 === g.picks.length && g.complete) n.modifiers.push({ id: `doc_${group}_done`, until: 1e9, label: g.name, effects: { ...g.complete } });
  chronicle(s, n.id, 'doctrine', { en: `${n.short.en} embraced “${p.name.en}”.`, de: `${n.short.de} nahm „${p.name.de}“ an.` });
  return null;
}
export function doctrineSlots(n: Nation) { return 1 + n.era + (n.tech[0] >= 12 ? 1 : 0) + (n.tech[0] >= 24 ? 1 : 0); }
export function doctrineCost(n: Nation) {
  const total = Object.values(n.doctrines).reduce((p, x) => p + x, 0);
  return 100 + total * 15;
}

// ---------------- innovations ----------------
function innovationsYear(s: GameState, w: World, year: number) {
  for (let k = 0; k < INNOVATIONS.length; k++) {
    const inv = INNOVATIONS[k];
    let st = s.innovations.find((x) => x.key === inv.id);
    if (!st) {
      if (year < inv.year) continue;
      const origin = w.names.findIndex((nm, i) => i < w.L && nm === inv.origin);
      let o = origin >= 0 ? origin : -1;
      if (o < 0) { // fall back to the nearest location to the given coordinates
        let bd = Infinity; for (let i = 0; i < w.L; i++) { const dx = w.lon[i] - inv.lon, dy = w.lat[i] - inv.lat; const d = dx * dx + dy * dy; if (d < bd) { bd = d; o = i; } }
      }
      st = { id: k, key: inv.id, origin: o, day: s.day, reached: new Uint8Array(w.L) };
      st.reached[o] = 1;
      s.innovations.push(st);
      const on = s.loc.owner[o];
      chronicle(s, on, 'innovation', { en: `${inv.name.en} appeared in ${w.names[o]}.`, de: `${inv.name.de} tauchte in ${w.namesDe[o]} auf.` }, o);
      for (const p of s.playerNations) notice(s, p, 'innovation', { en: `New knowledge: ${inv.name.en} (${w.names[o]}).`, de: `Neues Wissen: ${inv.name.de} (${w.namesDe[o]}).` }, { loc: o });
    }
    // spread along the location graph: speed by literacy, markets, universities, trade
    const r = st.reached; const add: number[] = [];
    for (let i = 0; i < w.L; i++) {
      if (r[i]) continue;
      let near = 0;
      for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) { const v = w.adj[e]; if (v < w.L && r[v]) near++; }
      if (!near) continue;
      const lit = s.loc.literacy[i], uni = s.loc.buildings[i * B + BI.university], mk = s.loc.buildings[i * B + BI.market];
      const p = clamp(inv.spread * (0.15 + lit * 1.5 + uni * 0.5 + mk * 0.08 + s.loc.dev[i] * 0.004) * near, 0, 0.95);
      if (((i * 2654435761 + year * 97 + k * 13) >>> 0) % 1000 < p * 1000) add.push(i);
    }
    for (const i of add) r[i] = 1;
    // long-distance: university towns and great markets learn quickly
    if (year - Math.floor(st.day / 365) > 5) for (let i = 0; i < w.L; i++) if (!r[i] && (s.loc.buildings[i * B + BI.university] > 0 || s.loc.dev[i] > 40) && ((i + year) % 7 === 0)) r[i] = 1;
  }
  // adoption: a nation adopts an innovation once it has reached its capital and its tech is high enough
  for (const n of s.nations) {
    if (!n.alive || n.capital < 0) continue;
    for (const st of s.innovations) {
      if (n.innovations.includes(st.id)) continue;
      const inv = INNOVATIONS[st.id];
      if (!st.reached[n.capital] || n.tech[inv.branch] < inv.tech) continue;
      if (inv.faith && inv.faith.length && !inv.faith.includes(n.faith)) continue;
      if (inv.branch === 1 && adoptionDelayed(n, st.id, year)) continue;
      n.innovations.push(st.id);
      n.modifiers.push({ id: `inv_${inv.id}`, until: 1e9, label: inv.name, effects: { ...inv.effects } });
      if (s.playerNations.includes(n.id)) notice(s, n.id, 'innovation', { en: `We adopted ${inv.name.en}.`, de: `Wir haben ${inv.name.de} übernommen.` });
    }
  }
}

/** Closed guilds (innovation_block) keep new crafts out of the workshops: each year a Commerce innovation that has
 *  reached the capital is taken up only with the chance 1 / (1 + 4 block), on average a delay of 4 × block years. Decided
 *  by a hash of realm, innovation and year so it costs no random draws. */
export function adoptionDelayed(n: Nation, inv: number, year: number): boolean {
  const block = lawEffect(n, 'innovation_block'); if (block <= 0) return false;
  const h = ((n.id * 2654435761 + inv * 40503 + year * 9973) >>> 0) % 1000;
  return h >= 1000 / (1 + 4 * block);
}

function techSpreadCache(s: GameState, w: World) {
  // share of known neighbour levels above ours → cheaper catch-up
  const out: Record<number, number[]> = {};
  const neigh: Record<number, Set<number>> = {};
  const o = s.loc.owner;
  for (let i = 0; i < w.L; i++) {
    const a = o[i]; if (a < 0) continue;
    for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) { const v = w.adj[e]; if (v >= w.L) continue; const b = o[v]; if (b >= 0 && b !== a) (neigh[a] ||= new Set()).add(b); }
  }
  for (const n of s.nations) {
    if (!n.alive) continue;
    const r = [0, 0, 0];
    const ns = neigh[n.id]; if (ns) for (const b of ns) for (let k = 0; k < 3; k++) if (s.nations[b].tech[k] > n.tech[k]) r[k] += 0.06;
    out[n.id] = r;
  }
  (s as any)._techSpread = out;
}

export const progress: System = {
  id: 'progress',
  init(s, w) {
    // starting tech by region & development, later starts are further ahead
    const yearBonus = Math.floor((s.startYear - 1356) / 14.5);
    for (const n of s.nations) {
      const base = 1 + yearBonus;
      const lat = n.capital >= 0 ? w.lat[n.capital] : 45, lon = n.capital >= 0 ? w.lon[n.capital] : 10;
      let adj = 0;
      if (lon > -12 && lon < 30 && lat > 36 && lat < 60) adj = 1;             // Latin Christendom core
      if (lon > 8 && lon < 20 && lat > 37 && lat < 47) adj = 2;               // Italy
      if (lon > 25 && lon < 60 && lat > 25 && lat < 42) adj = 1;              // Levant, Anatolia, Persia
      if (n.gov === 'nomadic_horde' || n.gov === 'tribal_federation') adj = -1;
      if (lat < 20 || lon < -30) adj = -2;
      n.tech = [Math.max(0, base + adj), Math.max(0, base + adj + (n.gov === 'merchant_republic' ? 1 : 0)), Math.max(0, base + adj)];
      n.era = eraOf(s, n);
      n.flags.doctrine_pts = 50 + yearBonus * 40;
    }
    techSpreadCache(s, w);
    if (s.startYear > 1356) innovationsYear(s, w, s.startYear);
  },
  monthly({ s, w, date }) {
    if (date.m % 3 === 0) techSpreadCache(s, w);
    for (const n of s.nations) {
      if (!n.alive) continue;
      const r = researchRate(s, w, n);
      for (let k = 0; k < 3; k++) {
        n.techProgress[k] += r[k];
        const cost = techCost(s, n, k);
        if (n.techProgress[k] >= cost && n.tech[k] < MAX_TECH) {
          n.techProgress[k] -= cost; n.tech[k]++;
          if (s.playerNations.includes(n.id)) notice(s, n.id, 'tech', { en: `${BRANCHES[k].name.en} advanced to level ${n.tech[k]}.`, de: `${BRANCHES[k].name.de} erreicht Stufe ${n.tech[k]}.` });
        }
      }
      // insight for doctrines: from learning, prestige and a capable ruler
      const ru = s.chars[n.ruler];
      n.flags.doctrine_pts = (n.flags.doctrine_pts || 0) + 1.5 + (r[0] + r[1] + r[2]) * 0.13 + (ru ? (ru.skills[0] + ru.skills[1]) * 0.15 : 0) + Math.max(0, n.prestige) * 0.01;
      const e = eraOf(s, n);
      if (e > n.era) {
        n.era = e;
        chronicle(s, n.id, 'era', { en: `${n.short.en} entered the ${ERAS[e].name.en}.`, de: `${n.short.de} trat in das ${ERAS[e].name.de} ein.` });
        if (s.playerNations.includes(n.id)) notice(s, n.id, 'era', { en: `A new age dawns: ${ERAS[e].name.en}. New laws, units and doctrines are available.`, de: `Ein neues Zeitalter beginnt: ${ERAS[e].name.de}. Neue Gesetze, Truppen und Doktrinen sind verfügbar.` });
      }
    }
  },
  yearly({ s, w, date }) { innovationsYear(s, w, date.y); },
};
void dateToDay;
