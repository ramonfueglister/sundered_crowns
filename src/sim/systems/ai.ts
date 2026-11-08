// AI nations: same rules and commands as players. Strategic decisions monthly (staggered), military moves every few days.
// Personalities: conqueror, trader, isolationist, zealot, opportunist, diplomat, builder.
import type { GameState, Nation, Army, PeaceTerm, War } from '../types';
import type { World } from '../world';
import { type System, clamp, allies, atWar, hasTreaty, enemiesOf, opinion, warsOf, subjectsOf } from '../ctx';
import { UNITS, B, BI, BUILDINGS, C, CL } from '../defs';
import { rand, chance, hash01 } from '../rng';
import { applyCommand } from '../commands';
import { armyMen, armyStrength, findPath, availableUnits, unitCost, supplyLimit, hostile, seaNear, newArmy } from './military';
import { nationDev, nationLocs, computeScore, evaluatePeace, termCost, hasCasusBelli, locValue } from './war';
import { totalOpinion, evaluateProposal } from './diplomacy';
import { LAWS, LAW_INDEX } from '../content/laws';
import { reformCost } from './politics';

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
  for (let i = 0; i < w.L; i++) {
    if (o[i] !== n) continue;
    for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) {
      const v = w.adj[e]; if (v >= w.L) continue;
      const ov = o[v]; if (ov >= 0 && ov !== n) out.add(ov);
    }
  }
  return out;
}
const neighCache = new Map<number, { day: number; set: Set<number> }>();
export function neighboursCached(s: GameState, w: World, n: number) {
  const c = neighCache.get(n);
  if (c && s.day >= c.day && s.day - c.day < 90 && !(s.flags.ownershipDirty > c.day)) return c.set;
  const set = neighbours(s, w, n); neighCache.set(n, { day: s.day, set }); return set;
}

// ---------------- strategic monthly ----------------
function strategic(s: GameState, w: World, n: Nation) {
  const wars = warsOf(s, n.id);
  budget(s, w, n, wars.length > 0);
  recruitment(s, w, n, wars.length > 0);
  if (n.treasury > 0) { const inc = Object.values(n.income).reduce((p, v) => p + v, 0); const k = n.treasury > inc * 12 ? 3 : 1; for (let j = 0; j < k; j++) construction(s, w, n); }
  reforms(s, w, n);
  diplomacy(s, w, n);
  if (!wars.length) considerWar(s, w, n);
  for (const war of wars) considerPeace(s, w, n, war);
  // tech: spend on the branch matching personality (handled in tech system automatically for AI)
}

function budget(s: GameState, w: World, n: Nation, atWarNow: boolean) {
  const inc = Object.values(n.income).reduce((p, v) => p + v, 0);
  const exp = Object.values(n.expense).reduce((p, v) => p + v, 0);
  const so = n.standingOrders;
  // taxes: raise when in deficit, lower when unrest is high
  let avgUnrest = 0, cnt = 0;
  for (let i = 0; i < w.L; i += 7) if (s.loc.owner[i] === n.id) { avgUnrest += s.loc.unrest[i]; cnt++; }
  avgUnrest = cnt ? avgUnrest / cnt : 0;
  const rich = !atWarNow && n.treasury > inc * 18;
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
  const affordable = inc * 0.45 / Math.max(0.1, 1.0 * 600 * 0.1 * s.priceLevel / 1000); // men affordable at ~1 upkeep/1000
  const persMult = P(n, 'conqueror') ? 1.3 : P(n, 'trader') || P(n, 'builder') ? 0.8 : P(n, 'isolationist') ? 0.9 : 1;
  const target = Math.min(n.maxManpower * 0.8 + men * 0.2, affordable * persMult) * (atWarNow ? 1.25 : 1);
  if (men >= target || n.manpower < 1000) return;
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
  if (art.length && n.treasury > inc * 4 && atWarNow) plan.push([art[0], 300]);
  for (const [u, m] of plan) {
    if (m < 200) continue;
    if (n.treasury < unitCost(s, n, u, m) * 1.2) continue;
    applyCommand(s, w, { t: 'recruit', n: n.id, loc: n.capital, unit: u, men: Math.round(m) });
  }
  // emergency mercenaries
  if (atWarNow && n.treasury > inc * 6 && men < target * 0.5) applyCommand(s, w, { t: 'mercs', n: n.id, loc: n.capital, company: 3000 });
  // fleets for coastal trade powers
  if ((P(n, 'trader') || n.gov === 'merchant_republic') && w.coastal[n.capital] && n.treasury > inc * 5) {
    const ships = availableUnits(s, n, true);
    let fleet = 0; for (const a of armiesOf(s, n.id)) if (a.fleet) fleet += armyMen(a);
    if (ships.length && fleet < 25 && s.loc.buildings[n.capital * B + BI.port] > 0) applyCommand(s, w, { t: 'recruit', n: n.id, loc: n.capital, unit: ships[ships.length - 1], men: 4 });
  }
}

function construction(s: GameState, w: World, n: Nation) {
  if (s.constructions.filter((c) => c.nation === n.id).length >= 2 + Math.floor(nationDev(s, n.id) / 150)) return;
  const inc = Object.values(n.income).reduce((p, v) => p + v, 0);
  if (n.treasury < inc * 2) return;
  const locs = nationLocs(s, n.id);
  if (!locs.length) return;
  // pick the richest location lacking a useful building
  let best = -1, bb = -1, bv = 0;
  const order = P(n, 'trader') ? ['market', 'port', 'workshop', 'road', 'farm'] : P(n, 'conqueror') ? ['fort', 'farm', 'workshop', 'market', 'road'] : ['farm', 'workshop', 'market', 'road', 'church', 'fort'];
  for (let k = 0; k < Math.min(locs.length, 60); k++) {
    const l = locs[Math.floor(hash01(s.day, n.id, k) * locs.length)];
    if (s.loc.ctrl[l] !== n.id) continue;
    for (const bid of order) {
      const b = BI[bid]; const lv = s.loc.buildings[l * B + b];
      if (lv >= BUILDINGS[b].max || (BUILDINGS[b].needsCoast && !w.coastal[l])) continue;
      if (bid === 'fort' && !borderLoc(s, w, l, n.id)) continue;
      const v = s.loc.dev[l] * (1 + order.length - order.indexOf(bid)) / (1 + lv);
      if (v > bv) { bv = v; best = l; bb = b; }
    }
  }
  if (best >= 0) applyCommand(s, w, { t: 'build', n: n.id, loc: best, building: bb });
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
  for (const sub of subjectsOf(s, n.id)) { const sn = s.nations[sub]; if (!sn.flags.integrating && sn.subjectType === 'vassal' && s.day - sn.subjectSince > 365 * 10 && sn.libertyDesire < 30 && chance(s.rng, 0.05)) applyCommand(s, w, { t: 'integrate', n: n.id, subject: sub }); }
}

function considerWar(s: GameState, w: World, n: Nation) {
  if (n.overlord >= 0 || n.capital < 0) return;
  if (n.standingOrders?.defendOnly) return;
  const aggr = P(n, 'conqueror') ? 0.18 : P(n, 'zealot') ? 0.12 : P(n, 'opportunist') ? 0.1 : P(n, 'isolationist') ? 0.02 : 0.06;
  if (!chance(s.rng, aggr)) return;
  if (n.warExhaustion > 20 || n.concord < -30 || n.treasury < 0 || n.dread > 60) return;
  const myBloc = [n.id, ...allies(s, n.id), ...subjectsOf(s, n.id)];
  const myPower = blocPower(s, myBloc);
  if (myPower <= 0) return;
  let best = -1, bestScore = 0;
  for (const t of neighboursCached(s, w, n.id)) {
    const tn = s.nations[t];
    if (!tn.alive || hasTreaty(s, n.id, t, 'truce') || hasTreaty(s, n.id, t, 'alliance') || tn.overlord === n.id) continue;
    if (s.playerNations.includes(t) && s.day < 180) continue; // grace period for the player at start
    if (tn.flags.protected_until && tn.flags.protected_until > s.day) continue;
    const top = tn.overlord >= 0 ? tn.overlord : t;
    const theirBloc = [top, ...allies(s, top).filter((a) => !hasTreaty(s, n.id, a, 'alliance')), ...subjectsOf(s, top)];
    const theirPower = blocPower(s, theirBloc);
    const ratio = myPower / Math.max(1, theirPower);
    if (ratio < 1.25) continue;
    const cb = hasCasusBelli(s, n.id, t);
    let score = ratio * 10 + (cb ? 25 : -40) + (n.rivals.includes(t) ? 20 : 0) - totalOpinion(s, w, n.id, t) * 0.2 + (tn.faith !== n.faith && P(n, 'zealot') ? 25 : 0);
    if (s.playerNations.includes(t)) score -= 10 + (s.difficulty < 2 ? 20 : 0);
    if (score > bestScore) { bestScore = score; best = t; }
  }
  if (best < 0 || bestScore < 30) {
    // prepare a justification against the most tempting target
    if (best >= 0 && !hasCasusBelli(s, n.id, best) && !s.spies.some((x) => x.nation === n.id && x.action === 'fabricate')) applyCommand(s, w, { t: 'diplo', n: n.id, action: 'fabricate', target: best });
    return;
  }
  const cb = hasCasusBelli(s, n.id, best);
  if (!cb) { if (!s.spies.some((x) => x.nation === n.id && x.action === 'fabricate')) applyCommand(s, w, { t: 'diplo', n: n.id, action: 'fabricate', target: best }); return; }
  // war goal: border locations of the target
  const goal = targetLocs(s, w, n.id, best, 6);
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
    // demand occupied locations (prefer war goal), up to what the score allows
    const terms: PeaceTerm[] = [];
    const occ: number[] = [];
    const enemyLeader = other;
    for (let i = 0; i < w.L; i++) if (s.loc.owner[i] === enemyLeader && s.loc.ctrl[i] === n.id) occ.push(i);
    const goal = new Set(war.goal.locs);
    occ.sort((a, b) => (goal.has(b) ? 1 : 0) - (goal.has(a) ? 1 : 0) || locValue(s, b) - locValue(s, a));
    const pick: number[] = [];
    for (const l of occ) {
      const t = { type: 'cede', locs: [...pick, l], to: n.id } as PeaceTerm;
      if (termCost(s, war, t, n.id, enemyLeader) > score * 0.95) break;
      pick.push(l);
    }
    if (pick.length) terms.push({ type: 'cede', locs: pick, to: n.id });
    else if (score > 30) terms.push({ type: 'gold', amount: Math.max(50, (s.nations[enemyLeader].income.tax || 10) * 8) });
    if (terms.length || dur > 4) {
      applyCommand(s, w, { t: 'peace', n: n.id, war: war.id, to: enemyLeader, terms });
    }
  } else if (score < -25 || (dur > 5 && Math.abs(score) < 10) || n.warExhaustion > 60) {
    // losing: offer concessions the enemy would accept, or white peace
    const terms: PeaceTerm[] = [];
    if (score < -25) {
      const mine = nationLocs(s, n.id).filter((l) => war.att.concat(war.def).includes(s.loc.ctrl[l]) && s.loc.ctrl[l] !== n.id && l !== n.capital);
      if (mine.length) terms.push({ type: 'cede', locs: mine.slice(0, 4), to: other });
    }
    applyCommand(s, w, { t: 'peace', n: n.id, war: war.id, to: other, terms: terms.length ? terms.map((t) => ({ ...t })) : [], ...(terms.length ? { concede: true } : {}) } as any);
  }
}

// ---------------- military AI ----------------
function militaryAI(s: GameState, w: World, n: Nation) {
  const enemies = enemiesOf(s, n.id);
  const own = armiesOf(s, n.id);
  const myArmies = own.filter((a) => !a.fleet && !a.rebels && !a.battle && !a.embarkedOn && !a.retreating);
  if (!myArmies.length) return;
  // rebels in our land count as enemies to fight
  const rebels = s.armies.filter((a) => a.rebels && a.rebels.target === n.id);
  if (!enemies.size && !rebels.length) {
    // peacetime: gather at capital, merge
    for (const a of myArmies) if (a.loc !== n.capital && !a.path.length && n.capital >= 0 && s.loc.owner[a.loc] !== n.id) applyCommand(s, w, { t: 'move', n: n.id, army: a.id, to: n.capital });
    const atCap = myArmies.filter((a) => a.loc === n.capital && !a.path.length);
    if (atCap.length > 1) applyCommand(s, w, { t: 'merge', n: n.id, armies: atCap.map((a) => a.id) });
    return;
  }
  const enemyArmies = s.armies.filter((a) => !a.fleet && (enemies.has(a.owner) && !a.rebels || (a.rebels && a.rebels.target === n.id)) && !a.embarkedOn);
  // defend: enemy army in our land or near capital
  let targets: number[] | null = null;
  const claimed = new Set<number>();
  for (const x of own) { if (x.siege >= 0) claimed.add(x.siege); if (x.path.length) claimed.add(x.path[x.path.length - 1]); }
  const goal = new Set(s.wars.filter((x) => x.att.includes(n.id) || x.def.includes(n.id)).flatMap((x) => x.goal.locs));
  for (const a of myArmies) {
    if (a.path.length && s.day - a.lastMoveDay < 40) continue; // keep marching
    const myStr = armyStrength(s, a);
    // merge small armies at the same place
    const same = myArmies.filter((x) => x !== a && x.loc === a.loc && !x.path.length);
    if (same.length) { applyCommand(s, w, { t: 'merge', n: n.id, armies: [a.id, ...same.map((x) => x.id)] }); return; }
    // nearest beatable enemy army within reach
    let tgt = -1, td = Infinity;
    for (const e of enemyArmies) {
      const d = w.distKm(a.loc, e.loc);
      if (d > 600) continue;
      const near = enemyArmies.filter((x) => w.distKm(x.loc, e.loc) < 60).reduce((p, x) => p + armyStrength(s, x), 0);
      if (myStr > near * 1.15 && d < td) { td = d; tgt = e.loc; }
    }
    // threatened by a much stronger enemy: fall back toward capital / friendly fort
    const threat = enemyArmies.filter((x) => w.distKm(x.loc, a.loc) < 150).reduce((p, x) => p + armyStrength(s, x), 0);
    if (threat > myStr * 1.6 && n.capital >= 0 && a.loc !== n.capital) { applyCommand(s, w, { t: 'move', n: n.id, army: a.id, to: n.capital }); continue; }
    if (tgt >= 0) { applyCommand(s, w, { t: 'move', n: n.id, army: a.id, to: tgt }); continue; }
    if (a.siege >= 0) continue; // keep sieging
    // siege: nearest enemy-controlled location of the war target (forts first), within supply
    let best = -1, bd = Infinity;
    if (!targets) {
      targets = [];
      for (let i = 0; i < w.L; i++) {
        const c = s.loc.ctrl[i];
        if (enemies.has(c) || (c === -2 && s.loc.owner[i] === n.id)) targets.push(i);
      }
    }
    for (const i of targets) {
      if (w.distKm(a.loc, i) > 1500) continue;
      if (claimed.has(i)) continue;
      const fort = s.loc.buildings[i * B + BI.fort];
      let d = w.distKm(a.loc, i) * (fort ? 0.8 : 1) * (goal.has(i) ? 0.6 : 1) * (s.loc.owner[i] === n.id ? 0.5 : 1);
      if (fort && armyMen(a) < (s.loc.garrison[i] || 1000) * 2) d *= 3;
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) claimed.add(best);
    if (best >= 0 && best !== a.loc) {
      const r = applyCommand(s, w, { t: 'move', n: n.id, army: a.id, to: best });
      if (!r.ok) a.mission = 'blocked';
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
