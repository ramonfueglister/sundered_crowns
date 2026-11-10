// Administration of the realm: how much newly won land it can integrate at once (capacity) and what happens when it
// takes on more (over-extension); production methods of the towns; migration of the common people; privateering;
// marriage claims; the AI's use of tax instruments and production methods; the twelve-month budget forecast.
import type { GameState, Nation } from '../types';
import type { World } from '../world';
import { type System, addIncome, addExpense, atWar, hasTreaty } from '../ctx';
import { B, BI, C, CL, METHODS } from '../defs';
import { lawEffect, OFFICES, classExempt } from './politics';
import { overextension } from './economy';
import { ownedLocs } from './war';
import { chance } from '../rng';
import { DUTIES, dutyRate, setDuty, dutyWeight } from './duties';

type Row = [string, number];

// ---------------- capacity and over-extension ----------------
/** Where a realm's administrative capacity comes from: rows that add up to it (the last row is the share added by
 *  administration effects of laws, doctrines and innovations). coreDev: development of integrated land; seats: seats
 *  of administration (the capital's included). */
export function capacityParts(s: GameState, n: Nation, coreDev: number, seats: number): Row[] {
  let council = 0;
  for (const o of OFFICES) { const c = s.chars[n.council[o.id]]; if (c && c.alive) council += c.skills[0] * 2 * (1 - (c.corruption ?? 0)); }
  const rows: Row[] = [['x_base', 15], ['x_core_dev', coreDev * 0.03], ['x_admin_seats', seats * 25], ['x_governance', Math.max(0, n.tech[0]) * 3], ['x_council_gov', council]];
  const sub = rows.reduce((p, r) => p + r[1], 0);
  rows.push(['x_admin_mods', sub * Math.max(-0.5, lawEffect(n, 'admin'))]);
  return rows;
}
/** Load of one location on the administration: its development (at least 1) times the share still to integrate. */
export function locLoad(s: GameState, i: number) { return s.loc.integ[i] >= 1 ? 0 : Math.max(1, s.loc.dev[i]) * (1 - s.loc.integ[i]); }
/** Monthly: load and capacity of every realm (one pass over the map). */
export function computeAdmin(s: GameState, w: World) {
  const N = s.nations.length, lc = s.loc;
  const load = new Float64Array(N), core = new Float64Array(N), seats = new Int32Array(N);
  for (let i = 0; i < w.L; i++) {
    const o = lc.owner[i]; if (o < 0) continue;
    if (lc.integ[i] < 1) load[o] += Math.max(1, lc.dev[i]) * (1 - lc.integ[i]); else core[o] += lc.dev[i];
    if (lc.buildings[i * B + BI.admin] > 0) seats[o]++;
  }
  for (const n of s.nations) {
    if (!n.alive) continue;
    n.adminLoad = load[n.id];
    n.adminCapacity = Math.max(5, capacityParts(s, n, core[n.id], seats[n.id]).reduce((p, r) => p + r[1], 0));
  }
}
/** Share of the normal integration speed each location gets: 1 while the load fits the capacity. */
export function capacityShare(n: Nation) { const l = n.adminLoad ?? 0; return l <= n.adminCapacity ? 1 : n.adminCapacity / l; }
/** Lowest share of the normal integration speed an over-extended realm keeps, so that any conquest is integrated
 *  in bounded time (at most four times as slowly as within capacity). */
export const MIN_INTEG_SHARE = 0.25;
/** The share of the capacity that integration really runs at (systems/society.ts integrationMonth). */
export function integrationShare(n: Nation) { return Math.max(MIN_INTEG_SHARE, capacityShare(n)); }
/** Everything the realm panel shows about the administration (recomputed for one realm). */
export function adminInfo(s: GameState, w: World, n: Nation) {
  let core = 0, seats = 0, load = 0, pending = 0;
  const top: [number, number][] = [];
  for (const i of ownedLocs(s, n.id)) {
    if (s.loc.integ[i] < 1) { const l = locLoad(s, i); load += l; pending++; top.push([i, l]); } else core += s.loc.dev[i];
    if (s.loc.buildings[i * B + BI.admin] > 0) seats++;
  }
  const parts = capacityParts(s, n, core, seats);
  const capacity = Math.max(5, parts.reduce((p, r) => p + r[1], 0));
  const ox = Math.max(0, load / capacity - 1);
  const share = load <= capacity ? 1 : Math.max(MIN_INTEG_SHARE, capacity / load);
  top.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return {
    capacity, parts, load, pending, share, overext: ox, core, seats, // core: development of the integrated land
    effects: { unrest: Math.min(15, ox * 10), control: -Math.min(0.3, ox * 0.15), integration: share - 1 },
    loadTop: top.slice(0, 8).map(([i, l]) => ({ loc: i, name: { en: w.names[i], de: w.namesDe[i] }, load: l, integ: s.loc.integ[i] })),
  };
}

// ---------------- production methods ----------------
/** Price of switching a town's workshops to a method (closed guilds resist and make it dearer). */
export function methodCost(s: GameState, n: Nation, m: number): number {
  const d = METHODS[m]; if (!d) return 0;
  return d.cost * s.priceLevel * (1 + n.inflation) * (1 + Math.max(0, lawEffect(n, 'innovation_block')));
}
/** Why a location cannot switch to a method now, or null. */
export function methodBlock(s: GameState, w: World, n: Nation, loc: number, m: number): string | null {
  const d = METHODS[m]; if (!d) return 'unknown method';
  if (loc < 0 || loc >= w.L || s.loc.owner[loc] !== n.id) return 'not your location';
  if (s.loc.ctrl[loc] !== n.id) return 'occupied';
  if (s.loc.method[loc] === m) return 'already in use';
  if (d.commerce && n.tech[1] < d.commerce) return `needs Commerce & Learning ${d.commerce}`;
  if (d.building && s.loc.buildings[loc * B + BI[d.building]] <= 0) return 'needs a manufactory';
  if ((s.flags[`meth_${loc}`] ?? 0) > s.day) return 'the workshops were reorganised recently';
  if (n.treasury < methodCost(s, n, m)) return 'not enough gold';
  return null;
}
export function setMethod(s: GameState, w: World, n: Nation, loc: number, m: number): string | null {
  const e = methodBlock(s, w, n, loc, m); if (e) return e;
  const cost = methodCost(s, n, m);
  if (cost > 0) addExpense(n, 'methods', cost);
  s.loc.method[loc] = m;
  s.flags[`meth_${loc}`] = s.day + 365;
  return null;
}
/** The AI reorganises its largest workshop towns once it can: a manufactory where one stands, otherwise putting-out. */
function aiMethodsYear(s: GameState, w: World) {
  for (const n of s.nations) {
    if (!n.alive || s.playerNations.includes(n.id) || n.playerId || s.aiDisabled.includes(n.id)) continue;
    const inc = Object.values(n.income).reduce((p, v) => p + Math.max(0, v), 0);
    if (n.treasury < inc * 4) continue;
    const towns: [number, number][] = [];
    for (const i of ownedLocs(s, n.id)) {
      const art = s.loc.pop[i * C + CL.artisans] + s.loc.pop[i * C + CL.wage_workers];
      if (art >= 1500 && s.loc.workshop[i * 3] > 0) towns.push([i, art]);
    }
    towns.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    let done = 0;
    for (const [i] of towns) {
      if (done >= 2) break;
      const cur = s.loc.method[i];
      const want = s.loc.buildings[i * B + BI.manufactory] > 0 ? 2 : cur === 0 ? 1 : -1;
      if (want <= cur) continue;
      if (n.treasury < methodCost(s, n, want) * 3) break;
      if (!setMethod(s, w, n, i, want)) done++;
    }
  }
}

// ---------------- migration ----------------
/** Pull a place loses for each unit of its peasants and labourers that came as newcomers (and gains for each that
 *  left): the newcomers take up the free farms and work, the leavers leave theirs empty. */
export const MIGR_CROWD = 2.5;
/** Monthly fading of that memory (about half of it is gone after a century: the land the newcomers took stays taken). */
export const MIGR_FADE = 0.9995;
/** Monthly: peasants and labourers drift toward neighbouring land where the common people live better, within the
 *  realm readily, across borders less and never across a front. Slow (at most 0.4 % of them a month) and cheap: one
 *  pass over the map comparing each place with its best neighbour. Arrivals crowd a place: its pull falls with the
 *  share of newcomers it took in lately (lc.migrBal), so a lasting gap in living standards moves a few percent of the
 *  people and then the flow dies down instead of draining the poorer land. */
export function migrationMonth(s: GameState, w: World) {
  const L = w.L, lc = s.loc, P = lc.pop, sol = lc.sol, bal = lc.migrBal;
  const pull = new Float32Array(L), dp = new Float32Array(L), dl = new Float32Array(L);
  for (let i = 0; i < L; i++) {
    const a = P[i * C + CL.peasants], b = P[i * C + CL.labourers], p = a + b;
    pull[i] = (p > 0 ? (sol[i * C + CL.peasants] * a + sol[i * C + CL.labourers] * b) / p : 0) - MIGR_CROWD * bal[i];
  }
  for (let i = 0; i < L; i++) {
    const o = lc.owner[i]; if (o < 0) continue;
    const a = P[i * C + CL.peasants], b = P[i * C + CL.labourers];
    if (a + b < 200) continue;
    let best = -1, bv = 0.04;
    for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) {
      const j = w.adj[e]; if (j >= L) continue;
      const oj = lc.owner[j]; if (oj < 0 || P[j * C + CL.peasants] + P[j * C + CL.labourers] < 50) continue;
      let gain = pull[j] - pull[i] - lc.devast[j] * 0.5 - lc.plague[j] * (lc.plague[j] > 0 ? 1 : 0);
      if (oj !== o) { if (atWar(s, o, oj)) continue; gain *= 0.35; }
      if (gain > bv) { bv = gain; best = j; }
    }
    if (best < 0) continue;
    const f = Math.min(0.004, (bv - 0.04) * 0.02);
    const ma = a * f, mb = b * f;
    dp[i] -= ma; dl[i] -= mb; dp[best] += ma; dl[best] += mb;
  }
  for (let i = 0; i < L; i++) {
    const v = dp[i] + dl[i];
    lc.migr[i] = v;
    const p0 = P[i * C + CL.peasants] + P[i * C + CL.labourers];
    bal[i] = Math.max(-1, Math.min(1, bal[i] * MIGR_FADE + (p0 > 0 ? v / p0 : 0)));
    if (v === 0) continue;
    P[i * C + CL.peasants] = Math.max(0, P[i * C + CL.peasants] + dp[i]);
    P[i * C + CL.labourers] = Math.max(0, P[i * C + CL.labourers] + dl[i]);
  }
}

// ---------------- privateers ----------------
/** Monthly: a realm with letters of marque (trade_raid) and a fleet takes a share of each enemy's trade income. */
function privateersMonth(s: GameState) {
  if (!s.wars.length) return;
  const ships = new Float64Array(s.nations.length);
  for (const a of s.armies) if (a.fleet && !a.rebels && ships.length > a.owner) for (const r of a.regs) ships[a.owner] += r.men;
  for (const n of s.nations) {
    if (!n.alive || !ships[n.id]) continue;
    const raid = lawEffect(n, 'trade_raid'); if (raid <= 0) continue;
    const reach = Math.min(1, ships[n.id] / 20);
    const foes = new Set<number>();
    for (const war of s.wars) { if (war.att.includes(n.id)) war.def.forEach((x) => foes.add(x)); else if (war.def.includes(n.id)) war.att.forEach((x) => foes.add(x)); }
    for (const f of [...foes].sort((a, b) => a - b)) {
      const e = s.nations[f]; if (!e?.alive) continue;
      const loot = raid * 0.15 * reach * Math.max(0, (e.income.trade || 0) + (e.income.tariffs || 0));
      if (loot <= 0.01) continue;
      addIncome(n, 'privateers', loot); addExpense(e, 'privateers', loot);
    }
  }
}

// ---------------- marriage claims ----------------
/** Yearly: a royal marriage may give a house with foreign_claims a claim on the partner's throne (25 years). */
function marriageClaimsYear(s: GameState) {
  for (const t of s.treaties) {
    if (t.type !== 'marriage' || t.until <= s.day) continue;
    for (const [a, b] of [[t.a, t.b], [t.b, t.a]]) {
      const A = s.nations[a], Bn = s.nations[b]; if (!A?.alive || !Bn?.alive) continue;
      const fc = lawEffect(A, 'foreign_claims'); if (fc <= 0 || hasTreaty(s, a, b, 'claim')) continue;
      if (chance(s.rng, Math.min(0.2, fc * 0.1))) s.treaties.push({ a, b, type: 'claim', since: s.day, until: s.day + 365 * 25 });
    }
  }
}

// ---------------- the AI and the tax instruments ----------------
/** Monthly with the AI's budget: raise the instruments that hurt least when in deficit, lower them when rich or restless. */
export function aiDuties(s: GameState, w: World, n: Nation, atWarNow: boolean) {
  const inc = Object.values(n.income).reduce((p, v) => p + v, 0);
  const exp = Object.values(n.expense).reduce((p, v) => p + v, 0);
  let un = 0, k = 0; for (const i of ownedLocs(s, n.id)) if (i % 7 === 0) { un += s.loc.unrest[i]; k++; }
  un = k ? un / k : 0;
  const est = (id: string) => n.estates.find((e) => e.id === id)?.contentment ?? 50;
  const short = exp > inc * 1.02 && n.treasury < inc * (atWarNow ? 8 : 4);
  const rich = n.treasury > inc * 10 && exp < inc;
  for (const d of DUTIES) {
    const r = dutyRate(n, d.id);
    // the estates that would pay and resent it must be content enough (exempt lords' land tax falls on the commons)
    const commonsPay = d.id === 'hearth' || dutyWeight(d, 'commons', (c) => classExempt(n, c)) > 0;
    const willing = d.id === 'excise' ? est('burghers') > 40 : d.id === 'land' ? est('magnates') > 45 && est('prelates') > 40 && (!commonsPay || (est('commons') > 45 && un < 15)) : est('commons') > 45 && un < 15;
    const cap = d.max * (d.id === 'hearth' ? 0.3 : 0.4);
    if (short && willing && un < 30 && r < cap) { setDuty(n, d.id, r + d.step); return; }
    if ((rich || un > 35 || !willing) && r > 0) setDuty(n, d.id, r - d.step);
  }
}

// ---------------- budget forecast ----------------
const ONE_OFF = new Set(['construction', 'recruitment', 'scholars', 'gifts', 'charter', 'loan_repay', 'agents', 'mercenaries', 'landmark', 'methods', 'loans', 'colonists_start', 'splendour']);
/** The next twelve months projected from the current state: last month's recurring income and expenses (one-off
 *  spending left out), interest on the loans now owed, and loans falling due (repaid if the chest allows, otherwise
 *  rolled over at two points more). Upkeep and taxes are held at last month's level. */
export function budgetForecast(s: GameState, n: Nation) {
  const inc: Row[] = Object.entries(n.income).filter(([k, v]) => !ONE_OFF.has(k) && Math.abs(v) > 0.005).sort((a, b) => b[1] - a[1]) as Row[];
  const exp: Row[] = Object.entries(n.expense).filter(([k, v]) => !ONE_OFF.has(k) && k !== 'interest' && Math.abs(v) > 0.005).sort((a, b) => b[1] - a[1]) as Row[];
  const income = inc.reduce((p, r) => p + r[1], 0), fixed = exp.reduce((p, r) => p + r[1], 0);
  const loans = n.loans.map((l) => ({ ...l }));
  let t = n.treasury, interestY = 0, repaidY = 0;
  const months: { treasury: number; income: number; expense: number; interest: number; repaid: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const day = s.day + m * 30;
    let interest = 0; for (const l of loans) interest += l.amount * l.rate / 12;
    let repaid = 0;
    for (const l of loans.slice()) if (l.due <= day && l.due > day - 30) {
      if (t + income - fixed - interest >= l.amount) { repaid += l.amount; loans.splice(loans.indexOf(l), 1); } else { l.due += 365; l.rate += 0.02; }
    }
    t += income - fixed - interest - repaid;
    interestY += interest; repaidY += repaid;
    months.push({ treasury: t, income, expense: fixed + interest + repaid, interest, repaid });
  }
  return { start: n.treasury, end: t, income, fixed, interestYear: interestY, repaidYear: repaidY, incomeLines: inc, expenseLines: exp, months };
}

export const administration: System = {
  id: 'administration',
  monthly({ s, w }) {
    migrationMonth(s, w);
    privateersMonth(s);
  },
  yearly({ s, w }) {
    aiMethodsYear(s, w);
    marriageClaimsYear(s);
  },
};
