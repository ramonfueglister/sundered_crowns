// AI nations: same rules and commands as players. Strategic decisions monthly (staggered), military moves every few days.
// Personalities: conqueror, trader, isolationist, zealot, opportunist, diplomat, builder.
import type { GameState, Nation, Army, PeaceTerm, War } from '../types';
import type { World } from '../world';
import { type System, clamp, allies, atWar, hasTreaty, enemiesOf, opinion, warsOf, subjectsOf, topOverlord } from '../ctx';
import { UNITS, B, BI, BUILDINGS, C, CL } from '../defs';
import { rand, chance, hash01 } from '../rng';
import { applyCommand } from '../commands';
import { armyMen, armyStrength, canEnter, findPath, availableUnits, unitCost, supplyLimit, hostile, seaNear, newArmy, UPKEEP_SCALE } from './military';
import { nationDev, nationLocs, nationLocsRO, ownedLocs, ownerTable, ctrlTable, computeScore, evaluatePeace, termCost, hasCasusBelli, locValue } from './war';
import { totalOpinion, evaluateProposal } from './diplomacy';
import { LAWS, LAW_INDEX } from '../content/laws';
import { reformCost, lawEffect } from './politics';

const P = (n: Nation, k: string) => n.personality === k;
function isAI(s: GameState, n: Nation) { return n.alive && !s.playerNations.includes(n.id) && !s.aiDisabled.includes(n.id) && !n.playerId; }

let AO: { day: number; len: number; s: GameState | null; by: Map<number, Army[]> } = { day: -1, len: -1, s: null, by: new Map() };
/** Armies grouped by owner (cached per day). */
export function armiesOf(s: GameState, n: number): Army[] {
  if (AO.day !== s.day || AO.len !== s.armies.length || AO.s !== s) {
    const by = new Map<number, Army[]>();
    for (const a of s.armies) { let l = by.get(a.owner); if (!l) by.set(a.owner, (l = [])); l.push(a); }
    AO = { day: s.day, len: s.armies.length, s, by };
  }
  return AO.by.get(n) ?? [];
}
export function nationPower(s: GameState, n: number) {
  let p = 0; for (const a of armiesOf(s, n)) if (!a.fleet && !a.rebels) p += armyStrength(s, a);
  return p + s.nations[n].manpower * 0.4;
}
function blocPower(s: GameState, ns: number[]) { return ns.reduce((p, n) => p + nationPower(s, n), 0); }

function neighbours(s: GameState, w: World, n: number): Set<number> {
  const out = new Set<number>();
  const o = s.loc.owner;
  for (const i of ownedLocs(s, n)) {
    if (i >= w.L) continue;
    for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) {
      const v = w.adj[e]; if (v >= w.L) continue;
      const ov = o[v]; if (ov >= 0 && ov !== n) out.add(ov);
    }
  }
  return out;
}
// Per state, and kept exactly while the ownership map is unchanged (ownerTable gives a new object whenever
// s.loc.owner differs), so a cached set always equals a fresh one: the same in a warm process, after loading a save
// and with several games in one process. (A cache keyed only by nation id and day leaked sets between games and kept
// sets made before a same-day change of borders.)
const neighCache = new WeakMap<GameState, Map<number, { tab: readonly (readonly number[])[]; set: Set<number> }>>();
export function neighboursCached(s: GameState, w: World, n: number) {
  const tab = ownerTable(s);
  let m = neighCache.get(s); if (!m) neighCache.set(s, (m = new Map()));
  const c = m.get(n);
  if (c && c.tab === tab) return c.set;
  const set = neighbours(s, w, n); m.set(n, { tab, set }); return set;
}

// ---------------- strategic monthly ----------------
function strategic(s: GameState, w: World, n: Nation) {
  const wars = warsOf(s, n.id);
  budget(s, w, n, wars.length > 0);
  recruitment(s, w, n, wars.length > 0);
  transports(s, w, n);
  seekAccess(s, w, n);
  if (n.treasury > 0) { const inc = Object.values(n.income).reduce((p, v) => p + v, 0); const k = n.treasury > inc * 12 ? 3 : 1; for (let j = 0; j < k; j++) construction(s, w, n); }
  reforms(s, w, n);
  diplomacy(s, w, n);
  // a realm only called into an ally's war (or answering a subject's revolt) may still start its own, if fresh
  if (!wars.length || (!wars.some((x) => x.attLead === n.id || (x.defLead === n.id && x.goal.type !== 'independence')) && n.warExhaustion < 20)) considerWar(s, w, n);
  for (const war of wars) considerPeace(s, w, n, war);
  // tech: spend on the branch matching personality (handled in tech system automatically for AI)
}

function budget(s: GameState, w: World, n: Nation, atWarNow: boolean) {
  const inc = Object.values(n.income).reduce((p, v) => p + v, 0);
  const exp = Object.values(n.expense).reduce((p, v) => p + v, 0);
  const so = n.standingOrders;
  // taxes: raise when in deficit, lower when unrest is high
  let avgUnrest = 0, cnt = 0;
  for (const i of ownedLocs(s, n.id)) if (i % 7 === 0 && i < w.L) { avgUnrest += s.loc.unrest[i]; cnt++; }
  avgUnrest = cnt ? avgUnrest / cnt : 0;
  // only cut taxes for a chest that the army and the building sites cannot use up
  const rich = !atWarNow && n.treasury > inc * 12;
  const delta = exp > inc * 1.05 && avgUnrest < 40 && !rich ? 0.005 : avgUnrest > 45 || rich ? -0.006 : 0;
  if (delta) n.taxRate = n.taxRate.map((t, c) => clamp(t + delta * (c === CL.clergy || c === CL.nobles ? 0.3 : 1), 0.02, 0.25));
  if (!atWarNow && exp > inc && n.treasury < inc * 2) n.armyMaint = clamp(n.armyMaint - 0.1, 0.5, 1);
  else n.armyMaint = clamp(n.armyMaint + 0.1, 0.5, 1);
  // debt: repay loans when rich
  if (n.loans.length && n.treasury > n.loans[0].amount * 1.5) applyCommand(s, w, { t: 'loan', n: n.id, take: false, amount: n.loans[0].amount });
  if (so?.balanceBudget && exp > inc) n.armyMaint = 0.5;
}

function recruitment(s: GameState, w: World, n: Nation, atWarNow: boolean) {
  if (n.capital < 0 || s.loc.ctrl[n.capital] !== n.id) return;
  let men = 0; for (const a of armiesOf(s, n.id)) if (!a.fleet && !a.rebels) men += armyMen(a);
  for (const r of s.recruits) if (r.nation === n.id) men += r.men;
  const inc = (n.income.tax || 0) + (n.income.trade || 0) + (n.income.tariffs || 0);
  // men affordable at ~1 upkeep/1000: 45% of income plus the war chest spread over five years
  const affordable = (inc * 0.45 + Math.max(0, n.treasury) / 60) / Math.max(0.1, 1.0 * UPKEEP_SCALE * 0.1 * s.priceLevel / 1000 * clamp(1 + lawEffect(n, 'army_cost'), 0.3, 2));
  const persMult = P(n, 'conqueror') ? 1.3 : P(n, 'trader') || P(n, 'builder') ? 0.8 : P(n, 'isolationist') ? 0.9 : 1;
  const target = Math.min(n.maxManpower * 0.8 + men * 0.2, affordable * persMult) * (atWarNow ? 1.25 : 1);
  if (men >= target) return;
  // short of levies but rich: hire a company (at war readily, in peace only from a large chest)
  if (n.manpower < 1000 || target - men > n.manpower) {
    const chestOk = atWarNow ? n.treasury > inc * 4 : n.treasury > inc * 24;
    if (chestOk && men < target * (atWarNow ? 0.8 : 0.6) && (s.day + n.id) % 90 < 30) applyCommand(s, w, { t: 'mercs', n: n.id, loc: n.capital, company: atWarNow ? 3000 : 2000 });
    if (n.manpower < 1000) return;
  }
  const units = availableUnits(s, n, false);
  if (!units.length) return;
  const want = Math.min(target - men, n.manpower * 0.6, 8000);
  if (want < 800) return;
  // composition: infantry core, ranged, cavalry, artillery later
  const inf = units.filter((u) => UNITS[u].kind === 'inf').sort((a, b) => UNITS[b].era - UNITS[a].era || UNITS[b].shock - UNITS[a].shock);
  const rng = units.filter((u) => UNITS[u].kind === 'ranged').sort((a, b) => UNITS[b].fire - UNITS[a].fire);
  const cav = units.filter((u) => UNITS[u].kind === 'cav').sort((a, b) => UNITS[b].era - UNITS[a].era);
  const art = units.filter((u) => UNITS[u].kind === 'art');
  const plan: [number, number][] = [];
  const richish = n.treasury > inc * 3;
  if (inf.length) plan.push([richish ? inf[0] : inf[inf.length - 1], want * 0.55]);
  if (rng.length) plan.push([rng[0], want * 0.2]);
  if (cav.length) plan.push([cav[0], want * (n.gov === 'nomadic_horde' ? 0.6 : 0.2)]);
  if (art.length && n.treasury > inc * 4 && atWarNow) plan.push([art[0], Math.max(300, want * 0.15)]); // guns for the forts ahead
  for (const [u, m] of plan) {
    if (m < 200) continue;
    if (n.treasury < unitCost(s, n, u, m) * 1.2) continue;
    applyCommand(s, w, { t: 'recruit', n: n.id, loc: n.capital, unit: u, men: Math.round(m) });
  }
  // fleets for coastal trade powers
  if ((P(n, 'trader') || n.gov === 'merchant_republic') && w.coastal[n.capital] && n.treasury > inc * 5) {
    const ships = availableUnits(s, n, true);
    let fleet = 0; for (const a of armiesOf(s, n.id)) if (a.fleet) fleet += armyMen(a);
    if (ships.length && fleet < 25 && s.loc.buildings[n.capital * B + BI.port] > 0) applyCommand(s, w, { t: 'recruit', n: n.id, loc: n.capital, unit: ships[ships.length - 1], men: 4 });
  }
}

/** The realm's best harbour: the capital if it has one, else the largest port, nearest to the capital. */
function homePort(s: GameState, w: World, n: Nation): number {
  if (n.capital >= 0 && w.coastal[n.capital] && s.loc.buildings[n.capital * B + BI.port] > 0 && s.loc.ctrl[n.capital] === n.id) return n.capital;
  let best = -1, bv = -Infinity;
  for (const l of nationLocsRO(s, n.id)) {
    if (!w.coastal[l] || s.loc.ctrl[l] !== n.id) continue;
    const lv = s.loc.buildings[l * B + BI.port]; if (!lv) continue;
    const v = lv * 10000 - (n.capital >= 0 ? w.distKm(l, n.capital) : 0);
    if (v > bv) { bv = v; best = l; }
  }
  return best;
}
/** A couple of transport hulls for every coastal realm of size, so its armies can be ferried across straits and seas. */
function transports(s: GameState, w: World, n: Nation) {
  if (nationLocsRO(s, n.id).length < 12) return;
  let hulls = 0;
  for (const a of armiesOf(s, n.id)) if (a.fleet) hulls += armyMen(a);
  for (const r of s.recruits) if (r.nation === n.id && UNITS[r.type].kind === 'ship') hulls += r.men;
  if (hulls >= 1) return;
  const port = homePort(s, w, n); if (port < 0) return;
  const ships = availableUnits(s, n, true); if (!ships.length) return;
  const T = UNITS.findIndex((u) => u.id === 'transport');
  const unit = ships.includes(T) ? T : ships[0];
  if (n.treasury < unitCost(s, n, unit, 2) * 1.5) return;
  applyCommand(s, w, { t: 'recruit', n: n.id, loc: port, unit, men: 2 });
}
/** A realm at war whose armies can reach no enemy-held place asks the neighbours in between for passage. */
function seekAccess(s: GameState, w: World, n: Nation) {
  if (n.capital < 0 || (s.day + n.id) % 90 >= 30) return;
  const enemies = enemiesOf(s, n.id); if (!enemies.size) return;
  const a = armiesOf(s, n.id).find((x) => !x.fleet && !x.rebels); if (!a) return;
  // what our armies can reach now
  const seen = new Uint8Array(w.N); const q = [a.loc]; seen[a.loc] = 1;
  for (let h = 0; h < q.length; h++) { const u = q[h]; for (let e = w.adjStart[u]; e < w.adjStart[u + 1]; e++) { const v = w.adj[e]; if (!seen[v] && canEnter(s, w, a, v)) { seen[v] = 1; q.push(v); } } }
  const byCtrl = ctrlTable(s);
  let nearest = -1, nd = Infinity;
  for (const e of enemies) for (const i of byCtrl[e + 2] ?? []) {
    if (i >= w.L) continue;
    if (seen[i]) return; // something is within reach already
    const d = w.distKm(a.loc, i); if (d < nd) { nd = d; nearest = i; }
  }
  if (nearest < 0 || nd > 2500) return;
  // the foreign realm whose land touches our reach and lies closest to the enemy
  let ask = -1, ad = Infinity;
  for (const u of q) {
    if (u >= w.L) continue;
    for (let e = w.adjStart[u]; e < w.adjStart[u + 1]; e++) {
      const v = w.adj[e]; if (v >= w.L || seen[v]) continue;
      const o = s.loc.owner[v]; if (o < 0 || o === n.id || enemies.has(o) || hasTreaty(s, n.id, o, 'access')) continue;
      const d = w.distKm(v, nearest); if (d < ad || (d === ad && o < ask)) { ad = d; ask = o; }
    }
  }
  if (ask >= 0) applyCommand(s, w, { t: 'diplo', n: n.id, action: 'access', target: ask });
}

function provinceFort(s: GameState, w: World, l: number) {
  for (const x of w.provinces[w.provOf[l]]?.locs ?? []) if (x !== l && s.loc.buildings[x * B + BI.fort] > 0) return true;
  return false;
}
function construction(s: GameState, w: World, n: Nation, depth = 0) {
  const inc = Object.values(n.income).reduce((p, v) => p + v, 0);
  // a full war chest pays for more building sites at once
  const chest = inc > 0 ? Math.floor(clamp(n.treasury / (inc * 12), 0, 6)) : 0;
  if (s.constructions.filter((c) => c.nation === n.id).length >= 2 + Math.floor(nationDev(s, n.id) / 150) + chest) return;
  if (n.treasury < inc * 2) return;
  const locs = nationLocsRO(s, n.id);
  if (!locs.length) return;
  // pick the richest location lacking a useful building
  let best = -1, bb = -1, bv = 0;
  // a realm of size with a coast but no harbour builds one first, at its greatest coastal town
  if (depth === 0 && locs.length >= 12 && homePort(s, w, n) < 0 && !s.constructions.some((c) => c.nation === n.id && c.building === BI.port)) {
    let c = -1, cv = -1;
    for (const l of locs) if (w.coastal[l] && s.loc.ctrl[l] === n.id && s.loc.dev[l] > cv) { cv = s.loc.dev[l]; c = l; }
    if (c >= 0 && applyCommand(s, w, { t: 'build', n: n.id, loc: c, building: BI.port }).ok) return;
  }
  const order = P(n, 'trader') ? ['market', 'port', 'workshop', 'road', 'farm'] : P(n, 'conqueror') ? ['fort', 'farm', 'workshop', 'market', 'road'] : ['farm', 'workshop', 'market', 'road', 'church', 'fort'];
  for (let k = 0; k < Math.min(locs.length, 60); k++) {
    const l = locs[Math.floor(hash01(s.day, n.id, k) * locs.length)];
    if (s.loc.ctrl[l] !== n.id) continue;
    for (const bid of order) {
      const b = BI[bid]; const lv = s.loc.buildings[l * B + b];
      if (lv >= BUILDINGS[b].max || (BUILDINGS[b].needsCoast && !w.coastal[l])) continue;
      if (bid === 'fort' && (!borderLoc(s, w, l, n.id) || (lv === 0 && provinceFort(s, w, l)))) continue; // one fortress per province
      const v = s.loc.dev[l] * (1 + order.length - order.indexOf(bid)) / (1 + lv);
      if (v > bv) { bv = v; best = l; bb = b; }
    }
  }
  if (best >= 0) applyCommand(s, w, { t: 'build', n: n.id, loc: best, building: bb });
  // a large chest starts several sites a month
  if (best >= 0 && chest > 1 && depth < chest) construction(s, w, n, depth + 1);
}
function borderLoc(s: GameState, w: World, l: number, n: number) {
  for (let e = w.adjStart[l]; e < w.adjStart[l + 1]; e++) { const v = w.adj[e]; if (v < w.L && s.loc.owner[v] !== n && s.loc.owner[v] >= 0) return true; }
  return false;
}

function reforms(s: GameState, w: World, n: Nation) {
  if (n.reform || n.authority < 90) return;
  // choose a law change that fits the personality and keeps powers content
  const prefs: [string, number][] = P(n, 'conqueror') ? [['army', 3], ['administration', 2], ['taxation', 2]] : P(n, 'trader') ? [['trade', 1], ['towns', 2], ['mint', 2]] : P(n, 'zealot') ? [['tolerance', 0], ['inquisition', 2]] : P(n, 'builder') ? [['administration', 2], ['education', 2], ['roads', 2]] : [['justice', 1], ['administration', 1], ['taxation', 2]];
  for (const [law, opt] of prefs) {
    const L = LAWS[LAW_INDEX[law]]; if (!L) continue;
    const o = Math.min(opt, L.options.length - 1);
    if ((n.laws[law] ?? 0) === o) continue;
    if ((L.options[o].minEra ?? 0) > n.era) continue;
    if (n.authority < reformCost(n, law, o) + 20) continue;
    const r = applyCommand(s, w, { t: 'law', n: n.id, law, option: o });
    if (r.ok) return;
  }
}

function diplomacy(s: GameState, w: World, n: Nation) {
  if (n.envoysBusy >= n.envoys || n.capital < 0) return;
  const neigh = neighboursCached(s, w, n.id);
  // rivals: the strongest neighbour that threatens us
  if (n.rivals.length < 2 && chance(s.rng, 0.1)) {
    const cands = [...neigh].filter((x) => !n.rivals.includes(x) && !hasTreaty(s, n.id, x, 'alliance') && s.nations[x].overlord < 0).sort((a, b) => nationDev(s, b) - nationDev(s, a));
    if (cands.length && nationDev(s, cands[0]) > nationDev(s, n.id) * 0.5) applyCommand(s, w, { t: 'diplo', n: n.id, action: 'rival', target: cands[0] });
  }
  // alliances against threats / rivals
  if (allies(s, n.id).length < (P(n, 'diplomat') ? 4 : P(n, 'isolationist') ? 1 : 3) && chance(s.rng, 0.35)) {
    const cands: [number, number][] = [];
    const near: [number, number][] = [];
    for (const o of s.nations) {
      if (!o.alive || o.id === n.id || o.overlord >= 0 || o.capital < 0) continue;
      const d = w.distKm(n.capital, o.capital); if (d > 1800) continue;
      near.push([o.id, d - (n.rivals.some((r) => o.rivals.includes(r)) ? 800 : 0)]);
    }
    near.sort((a, b) => a[1] - b[1]);
    for (const [oid] of near.slice(0, 12)) {
      const o = s.nations[oid];
      if (hasTreaty(s, n.id, o.id, 'alliance') || atWar(s, n.id, o.id)) continue;
      const ev = evaluateProposal(s, w, n.id, o.id, 'alliance');
      const val = ev.reasons.reduce((p, x) => p + x[1], 0) + (n.rivals.some((r) => o.rivals.includes(r)) ? 30 : 0);
      if (val > 0) cands.push([o.id, val + nationDev(s, o.id) * 0.02]);
    }
    cands.sort((a, b) => b[1] - a[1]);
    if (cands.length) applyCommand(s, w, { t: 'diplo', n: n.id, action: 'alliance', target: cands[0][0] });
  }
  // royal marriages with same-faith neighbours (monarchies)
  if (!n.gov.includes('republic') && n.gov !== 'theocracy' && chance(s.rng, 0.08)) {
    const c = [...neigh].find((x) => s.nations[x].faith === n.faith && !hasTreaty(s, n.id, x, 'marriage') && !s.nations[x].gov.includes('republic'));
    if (c !== undefined) applyCommand(s, w, { t: 'diplo', n: n.id, action: 'marriage', target: c });
  }
  // improve relations with a feared neighbour
  if (chance(s.rng, 0.1)) { const t = [...neigh].sort((a, b) => nationDev(s, b) - nationDev(s, a))[0]; if (t !== undefined && totalOpinion(s, w, t, n.id) < 0) applyCommand(s, w, { t: 'diplo', n: n.id, action: 'improve', target: t }); }
  // vassalise small same-faith neighbours (diplomatically)
  if ((P(n, 'diplomat') || P(n, 'opportunist')) && chance(s.rng, 0.05)) {
    const t = [...neigh].find((x) => nationDev(s, x) * 8 < nationDev(s, n.id) && s.nations[x].overlord < 0 && s.nations[x].faith === n.faith);
    if (t !== undefined) applyCommand(s, w, { t: 'diplo', n: n.id, action: 'vassalize', target: t });
  }
  // integrate long-standing vassals
  for (const sub of subjectsOf(s, n.id)) { const sn = s.nations[sub]; if (!sn.flags.integrating && (sn.subjectType === 'vassal' && s.day - sn.subjectSince > 365 * 10 || sn.subjectType === 'personal_union' && s.day - sn.subjectSince > 365 * 50) && sn.libertyDesire < 30 && chance(s.rng, 0.05)) applyCommand(s, w, { t: 'integrate', n: n.id, subject: sub }); }
}

function considerWar(s: GameState, w: World, n: Nation) {
  if ((n.overlord >= 0 && n.subjectType !== 'tributary') || n.capital < 0) return;
  if (n.standingOrders?.defendOnly) return;
  const aggr = P(n, 'conqueror') ? 0.18 : P(n, 'zealot') ? 0.12 : P(n, 'opportunist') ? 0.1 : P(n, 'isolationist') ? 0.02 : 0.06;
  if (n.warExhaustion > 30 || n.concord < -30 || n.treasury < 0 || n.dread > 60) return;
  const myBloc = [n.id, ...allies(s, n.id), ...subjectsOf(s, n.id).filter((x) => !atWar(s, x, n.id))];
  const myPower = blocPower(s, myBloc);
  if (myPower <= 0) return;
  const myDev = Math.max(1, nationDev(s, n.id));
  // an ally counts by how likely it is to come: near and idle allies fully, distant or busy ones in part
  const allyWeight = (al: number, of: number) => {
    const A = s.nations[al], O = s.nations[of];
    const d = A.capital >= 0 && O.capital >= 0 ? w.distKm(A.capital, O.capital) : 2000;
    const busy = s.wars.some((x) => x.att.includes(al) || x.def.includes(al));
    return (d < 600 ? 0.8 : d < 1200 ? 0.5 : 0.25) * (busy ? 0.5 : 1);
  };
  let best = -1, bestScore = -Infinity;
  for (const t of neighboursCached(s, w, n.id)) {
    const tn = s.nations[t];
    if (!tn.alive || hasTreaty(s, n.id, t, 'truce') || hasTreaty(s, n.id, t, 'alliance') || tn.overlord === n.id || t === n.overlord) continue;
    const top = topOverlord(s, t);
    if (top === n.id || top === topOverlord(s, n.id)) continue; // our own realm of subjects
    if (s.playerNations.includes(t) && s.day < 180) continue; // grace period for the player at start
    if (tn.flags.protected_until && tn.flags.protected_until > s.day) continue;
    // no pile-ons: a realm already defending gets fewer separate attackers; a human player faces one war at a time (on hard: one aggressor at a time)
    const defending = s.wars.filter((x) => x.def.includes(t) && !x.att.includes(n.id)).length;
    if (s.playerNations.includes(t) && (defending || (s.difficulty <= 2 && s.wars.some((x) => x.att.includes(t) || x.def.includes(t))))) continue;
    let theirPower = nationPower(s, top);
    for (const x of subjectsOf(s, top)) if (s.nations[x].subjectType !== 'tributary' && x !== n.id) theirPower += nationPower(s, x);
    for (const al of allies(s, top)) if (!hasTreaty(s, n.id, al, 'alliance') && !myBloc.includes(al)) theirPower += nationPower(s, al) * allyWeight(al, top);
    const ratio = myPower / Math.max(1, theirPower);
    if (ratio < 1.25) continue;
    const cb = hasCasusBelli(s, n.id, t);
    // the size of the prize counts, not only how easy the fight is
    let score = Math.min(ratio, 3) * 10 + Math.min(30, 120 * nationDev(s, t) / myDev) + (cb ? 25 : -40) + (n.rivals.includes(t) ? 20 : 0) - totalOpinion(s, w, n.id, t) * 0.2 + (tn.faith !== n.faith && P(n, 'zealot') ? 25 : 0);
    if (s.playerNations.includes(t)) score -= 10 + (s.difficulty < 2 ? 20 : 0);
    score -= defending * 15;
    if (score > bestScore || (score === bestScore && t < best)) { bestScore = score; best = t; }
  }
  if (best < 0) return;
  const cb = hasCasusBelli(s, n.id, best);
  if (!cb) {
    // prepare a justification against the most tempting target (an envoy's errand, more often than a declaration)
    if (bestScore + 65 >= 30 && chance(s.rng, Math.min(1, aggr * 3)) && !s.spies.some((x) => x.nation === n.id && x.action === 'fabricate')) applyCommand(s, w, { t: 'diplo', n: n.id, action: 'fabricate', target: best });
    return;
  }
  if (bestScore < 30 || !chance(s.rng, aggr)) return;
  // war goal: border locations of the target, more for a greater realm
  const goal = targetLocs(s, w, n.id, best, clamp(Math.round(nationLocsRO(s, n.id).length / 40), 6, 15));
  applyCommand(s, w, { t: 'declare', n: n.id, target: best, goal: s.nations[best].faith !== n.faith && P(n, 'zealot') ? 'faith' : 'conquest', locs: goal });
}

export function targetLocs(s: GameState, w: World, a: number, b: number, k: number): number[] {
  const out: [number, number][] = [];
  for (let i = 0; i < w.L; i++) {
    if (s.loc.owner[i] !== b) continue;
    let border = 0;
    for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) { const v = w.adj[e]; if (v < w.L && s.loc.owner[v] === a) border++; }
    if (border) out.push([i, s.loc.dev[i] + border * 3]);
  }
  out.sort((p, q) => q[1] - p[1]);
  // grow along the province of the best border location
  const res = new Set<number>();
  for (const [l] of out.slice(0, 3)) { const p = w.provOf[l]; for (const x of w.provinces[p]?.locs ?? [l]) if (s.loc.owner[x] === b && res.size < k * 2) res.add(x); }
  return [...res].slice(0, Math.max(k, 3));
}

function considerPeace(s: GameState, w: World, n: Nation, war: War) {
  const lead = war.attLead === n.id || war.defLead === n.id;
  const other = war.att.includes(n.id) ? war.defLead : war.attLead;
  const score = computeScore(s, war) * (war.att.includes(n.id) ? 1 : -1);
  const dur = (s.day - war.start) / 365;
  if (!lead) {
    // junior participant: separate peace if exhausted
    if (n.warExhaustion > 50 && score < 0 && chance(s.rng, 0.2)) applyCommand(s, w, { t: 'peace', n: n.id, war: war.id, to: other, terms: [] });
    return;
  }
  if (s.playerNations.includes(other) && war.offers.some((o) => o.from === n.id)) return;
  if (score > 15) {
    // demand what we occupy of the whole enemy side (prefer the war goal), up to what the score allows;
    // capitals go in terms of their own (a capital is never ceded as part of a bundle)
    const terms: PeaceTerm[] = [];
    const enemyLeader = other;
    const enemySide = war.att.includes(n.id) ? war.def : war.att;
    const occ: number[] = [];
    for (const e of enemySide) for (const i of ownedLocs(s, e)) if (i < w.L && s.loc.ctrl[i] === n.id) occ.push(i);
    const goal = new Set(war.goal.locs);
    occ.sort((a, b) => (goal.has(b) ? 1 : 0) - (goal.has(a) ? 1 : 0) || locValue(s, b) - locValue(s, a) || a - b);
    const isCap = (l: number) => s.nations[s.loc.owner[l]]?.capital === l;
    const pick: number[] = [], caps: number[] = [];
    let spent = 0;
    for (const l of occ) {
      const c = termCost(s, war, { type: 'cede', locs: [l], to: n.id }, n.id, enemyLeader);
      if (spent + c > score * 0.95) continue;
      spent += c; (isCap(l) ? caps : pick).push(l);
    }
    // the bundle first, then at most six capitals (a peace holds at most eight terms)
    if (pick.length) terms.push({ type: 'cede', locs: pick, to: n.id });
    for (const c of caps.slice(0, 6)) terms.push({ type: 'cede', locs: [c], to: n.id });
    // early in a war a win on the field is no reason to settle for gold: take the forts first
    const besiegingGoal = s.armies.some((a) => a.owner === n.id && a.siege >= 0 && goal.has(a.siege));
    if (!terms.length && score > 30 && (dur > 1.5 || n.warExhaustion > 40) && !(besiegingGoal && dur < 6 && n.warExhaustion < 50))
      terms.push({ type: 'gold', amount: Math.max(50, (s.nations[enemyLeader].income.tax || 10) * 8) });
    if (terms.length || dur > 4) {
      applyCommand(s, w, { t: 'peace', n: n.id, war: war.id, to: enemyLeader, terms });
    }
  } else if (score < -25 || (dur > 5 && Math.abs(score) < 10) || n.warExhaustion > 60) {
    // losing: offer concessions the enemy would accept, or white peace
    const terms: PeaceTerm[] = [];
    if (war.goal.type === 'independence' && war.defLead === n.id && (score < -25 || n.warExhaustion > 60)) {
      // the subject has won its freedom
      applyCommand(s, w, { t: 'peace', n: n.id, war: war.id, to: other, terms: [{ type: 'independence', nation: war.attLead }], concede: true } as any);
      return;
    }
    if (score < -25) {
      const sides = war.att.concat(war.def);
      const mine = nationLocs(s, n.id).filter((l) => sides.includes(s.loc.ctrl[l]) && s.loc.ctrl[l] !== n.id && l !== n.capital);
      if (mine.length) terms.push({ type: 'cede', locs: mine.slice(0, 4), to: other });
    }
    applyCommand(s, w, { t: 'peace', n: n.id, war: war.id, to: other, terms: terms.length ? terms.map((t) => ({ ...t })) : [], ...(terms.length ? { concede: true } : {}) } as any);
  }
}

// ---------------- military AI ----------------
// Rebel armies in s.armies order. A rebel army is pushed as a new army and stays one (its target never changes), and
// armies are only pushed, spliced or filtered, so the list follows the array's identity, length and last element.
let RB: { arr: Army[] | null; len: number; last: Army | undefined; list: Army[] } = { arr: null, len: -1, last: undefined, list: [] };
function rebelArmies(s: GameState): Army[] {
  const arr = s.armies;
  if (RB.arr !== arr || RB.len !== arr.length || RB.last !== arr[arr.length - 1]) {
    const list: Army[] = []; for (const a of arr) if (a.rebels) list.push(a);
    RB = { arr, len: arr.length, last: arr[arr.length - 1], list };
  }
  return RB.list;
}
function militaryAI(s: GameState, w: World, n: Nation) {
  const enemies = enemiesOf(s, n.id);
  const own = armiesOf(s, n.id);
  const myArmies = own.filter((a) => !a.fleet && !a.rebels && !a.battle && !a.embarkedOn && !a.retreating);
  if (!myArmies.length) return;
  // rebels in our land count as enemies to fight
  const rebels: Army[] = [];
  for (const a of rebelArmies(s)) if (a.rebels!.target === n.id) rebels.push(a);
  if (!enemies.size && !rebels.length) {
    // peacetime: gather at capital, merge; the memory of unreachable places belongs to the war that is over
    for (const a of myArmies) if (a.mission?.startsWith('blk:')) a.mission = undefined;
    for (const a of myArmies) if (a.loc !== n.capital && !a.path.length && n.capital >= 0 && s.loc.owner[a.loc] !== n.id) applyCommand(s, w, { t: 'move', n: n.id, army: a.id, to: n.capital });
    const atCap = myArmies.filter((a) => a.loc === n.capital && !a.path.length);
    if (atCap.length > 1) applyCommand(s, w, { t: 'merge', n: n.id, armies: atCap.map((a) => a.id) });
    return;
  }
  // (without a war only rebels can be enemies, and they are already listed in s.armies order)
  const enemyArmies: Army[] = [];
  for (const a of enemies.size ? s.armies : rebels) if (!a.fleet && (a.rebels ? a.rebels.target === n.id : enemies.has(a.owner)) && !a.embarkedOn) enemyArmies.push(a);
  // strengths of the enemy armies and of the enemy concentration around each (our moves and merges do not change them)
  const E = enemyArmies.length;
  const eStr = new Float64Array(E); for (let j = 0; j < E; j++) eStr[j] = armyStrength(s, enemyArmies[j]);
  const eNear = new Float64Array(E).fill(-1);
  const nearOf = (j: number) => {
    if (eNear[j] < 0) { const l = enemyArmies[j].loc; let p = 0; for (let q = 0; q < E; q++) if (w.distKm(enemyArmies[q].loc, l) < 60) p += eStr[q]; eNear[j] = p; }
    return eNear[j];
  };
  // defend: enemy army in our land or near capital
  let targets: number[] | null = null;
  const claimed = new Set<number>();
  for (const x of own) { if (x.siege >= 0) claimed.add(x.siege); if (x.path.length) claimed.add(x.path[x.path.length - 1]); }
  const goal = new Set(s.wars.filter((x) => x.att.includes(n.id) || x.def.includes(n.id)).flatMap((x) => x.goal.locs));
  const gone = new Set<number>(); // armies merged into another this turn
  // AI marches keep the army's memory of unreachable places (a player's order clears it)
  const aiMove = (a: Army, to: number) => {
    // already on the way there: re-ordering would only reset the progress on the current road
    if (a.path.length && a.path[a.path.length - 1] === to) { a.orderDay = s.day; return { ok: true } as ReturnType<typeof applyCommand>; }
    const keep = a.mission?.startsWith('blk:') ? a.mission : undefined;
    const r = applyCommand(s, w, { t: 'move', n: n.id, army: a.id, to });
    if (r.ok) a.orderDay = s.day;
    if (r.ok && keep) a.mission = keep;
    return r;
  };
  // which places an army can walk to (own land, enemies, allies, access, ferries): one search per region per turn,
  // so unreachable targets are skipped instead of being tried and failed one by one
  const comp = new Int32Array(w.N); let comps = 0;
  const reachOf = (a: Army): number => {
    if (comp[a.loc]) return comp[a.loc];
    const k = ++comps; comp[a.loc] = k;
    const q = [a.loc];
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      for (let e = w.adjStart[u]; e < w.adjStart[u + 1]; e++) { const v = w.adj[e]; if (!comp[v] && canEnter(s, w, a, v)) { comp[v] = k; q.push(v); } }
    }
    return k;
  };
  for (const a of myArmies) {
    if (gone.has(a.id)) continue;
    if (a.path.length && s.day - Math.max(a.lastMoveDay, a.orderDay ?? -1e9) < 40) continue; // keep marching
    const myStr = armyStrength(s, a);
    // merge small armies at the same place (an army on the march never takes back the half it left behind)
    const same = a.path.length ? [] : myArmies.filter((x) => x !== a && !gone.has(x.id) && x.loc === a.loc && !x.path.length);
    if (same.length) { applyCommand(s, w, { t: 'merge', n: n.id, armies: [a.id, ...same.map((x) => x.id)] }); for (const x of same) gone.add(x.id); continue; }
    // nearest beatable enemy army within reach
    let tgt = -1, td = Infinity;
    for (let j = 0; j < E; j++) {
      const e = enemyArmies[j];
      const d = w.distKm(a.loc, e.loc);
      if (d > 600) continue;
      const near = nearOf(j);
      if (myStr > near * 1.15 && d < td) { td = d; tgt = e.loc; }
    }
    // threatened by a much stronger enemy: fall back toward capital / friendly fort
    let threat = 0; for (let j = 0; j < E; j++) if (w.distKm(enemyArmies[j].loc, a.loc) < 150) threat += eStr[j];
    if (threat > myStr * 1.6 && n.capital >= 0 && a.loc !== n.capital) { aiMove(a, n.capital); continue; }
    if (tgt >= 0) { aiMove(a, tgt); continue; }
    if (a.siege >= 0) continue; // keep sieging
    // places this army found no road to (kept on the army for 90 days, so saves and replays agree)
    let blocked: Set<number> | null = null;
    if (a.mission?.startsWith('blk:')) {
      const [d, list] = a.mission.slice(4).split(':');
      if (s.day - +d < 90) blocked = new Set(list ? list.split(',').map(Number) : []); else a.mission = undefined;
    }
    // siege: nearest enemy-controlled location of the war target (forts first), within supply
    let best = -1, bd = Infinity;
    if (!targets) {
      // land held by the enemy or by rebels in our realm, in ascending order (each location has one controller)
      targets = [];
      const byCtrl = ctrlTable(s);
      for (const e of enemies) for (const i of byCtrl[e + 2] ?? []) if (i < w.L) targets.push(i);
      for (const i of byCtrl[0] ?? []) if (i < w.L && s.loc.owner[i] === n.id) targets.push(i);
      targets.sort((p, q) => p - q);
    }
    const k = reachOf(a);
    const open = (i: number) => w.distKm(a.loc, i) <= 1500 && !claimed.has(i) && !blocked?.has(i) && comp[i] === k;
    for (const i of targets) {
      if (!open(i)) continue;
      const dk = w.distKm(a.loc, i);
      const fort = s.loc.buildings[i * B + BI.fort];
      let d = dk * (fort ? 0.8 : 1) * (goal.has(i) ? 0.6 : 1) * (s.loc.owner[i] === n.id ? 0.5 : 1);
      if (fort && armyMen(a) < (s.loc.garrison[i] || 1000) * 2) d *= 3;
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) claimed.add(best);
    if (best >= 0 && best !== a.loc) {
      const r = aiMove(a, best);
      // a great host splits once it is on the march and there is a second place to besiege: the half left behind picks it next turn
      if (r.ok && armyMen(a) > 24000 && targets.some((i) => i !== best && open(i))) applyCommand(s, w, { t: 'split', n: n.id, army: a.id });
      if (!r.ok) {
        // remember the unreachable place and try another one on the next turn
        const list = blocked ? [...blocked].slice(-11) : [];
        a.mission = `blk:${blocked && a.mission?.startsWith('blk:') ? a.mission.slice(4).split(':')[0] : s.day}:${[...list, best].join(',')}`;
      }
    }
  }
  // fleets: blockade enemy coastal forts under siege, else hunt weaker enemy fleets near home
  for (const f of own.filter((a) => a.fleet && !a.battle && !a.path.length)) {
    const sg = s.sieges.find((x) => x.nation === n.id && w.coastal[x.loc]);
    if (sg) { const sea = seaNear(w, sg.loc); if (sea >= 0 && sea !== f.loc) applyCommand(s, w, { t: 'move', n: n.id, army: f.id, to: sea }); }
  }
}

export const ai: System = {
  id: 'ai',
  daily({ s, w }) {
    const N = s.nations.length;
    for (let k = 0; k < N; k++) {
      const n = s.nations[k];
      if (!isAI(s, n)) continue;
      if ((s.day + k) % 30 === 0) strategic(s, w, n);
      if ((s.day + k) % 4 === 0) militaryAI(s, w, n);
    }
    // standing orders for offline players (online world): their nations use the AI with restrictions
    for (const n of s.nations) if (n.alive && n.playerId && n.standingOrders && (s.flags[`offline_${n.id}`] || 0) > 0) {
      if ((s.day + n.id) % 30 === 0) { budget(s, w, n, warsOf(s, n.id).length > 0); if (n.standingOrders.autoRecruit) recruitment(s, w, n, warsOf(s, n.id).length > 0); if (n.standingOrders.autoBuild) construction(s, w, n); for (const war of warsOf(s, n.id)) offlinePeace(s, w, n, war); }
      if ((s.day + n.id) % 4 === 0) militaryAI(s, w, n);
    }
  },
};
function offlinePeace(s: GameState, w: World, n: Nation, war: War) {
  const so = n.standingOrders!; const score = computeScore(s, war) * (war.att.includes(n.id) ? 1 : -1);
  for (const o of war.offers) if (o.to === n.id) {
    const ev = evaluatePeace(s, war, o.from, o.to, o.terms);
    if (-score >= so.acceptPeaceBelow || ev.accept) applyCommand(s, w, { t: 'peace_answer', n: n.id, war: war.id, offer: war.offers.indexOf(o), accept: true });
  }
}
