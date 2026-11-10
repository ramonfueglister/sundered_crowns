// Wars: justifications, declarations, war score, war exhaustion, peace treaties with costed terms,
// AI acceptance with reasons, truces, Dread (expansion backlash) and the Common Front (coalitions).
import { deName } from '../content/names_de';
import type { GameState, War, PeaceTerm, Nation, WarGoal, PendingEvent } from '../types';
import type { World } from '../world';
import { type System, clamp, chronicle, notice, newId, addOpinion, allies, atWar, hasTreaty, opinion, rel, subjectsOf, topOverlord, treatiesOf } from '../ctx';
import { EPOCH } from '../ctx';
import { landmarkValue } from './landmarks';
import { C, B, BI } from '../defs';
import { chance, rand } from '../rng';
import { lawEffect, estate, newChar, pickNewHeir } from './politics';
import { GROUP_OF, ALL_CULTURES, FAITHS } from '../content/peoples';

// Per-nation location lists (OC) and development sums (DC), both refreshed lazily after an EPOCH bump.
// Owner and dev are written in many places, so instead of rebuilding on every bump each cache compares
// itself with a snapshot of the array it depends on and rebuilds only when that changed.
// The dev sums are taken when nationDev/nationLocs is first called after a bump (dev also drifts daily without
// a bump); ownedLocs() reads only the owner lists and leaves that moment alone.
/** Bitwise equality of two typed arrays of the same type (compared four bytes at a time where aligned). */
function sameBits(a: Int16Array | Float32Array, b: Int16Array | Float32Array): boolean {
  if (a.length !== b.length) return false;
  let i = 0;
  if ((a.byteOffset & 3) === 0 && (b.byteOffset & 3) === 0) {
    const n4 = a.byteLength >> 2;
    const x = new Int32Array(a.buffer, a.byteOffset, n4), y = new Int32Array(b.buffer, b.byteOffset, n4);
    for (let k = 0; k < n4; k++) if (x[k] !== y[k]) return false;
    i = (n4 * 4) / a.BYTES_PER_ELEMENT;
  }
  for (; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
let OC: { e: number; s: GameState | null; locs: number[][]; own: Int16Array } = { e: -1, s: null, locs: [], own: new Int16Array(0) };
let DC: { e: number; s: GameState | null; dev: Float64Array; devs: Float32Array; oc: number[][] | null } = { e: -1, s: null, dev: new Float64Array(0), devs: new Float32Array(0), oc: null };
function ownerCache(s: GameState) {
  if (OC.e === EPOCH.v && OC.s === s) return OC;
  const N = s.nations.length; const o = s.loc.owner, len = o.length;
  if (OC.s === s && OC.locs.length === N && OC.own.length === len) {
    if (sameBits(OC.own, o)) { OC.e = EPOCH.v; return OC; }
  }
  const locs: number[][] = Array.from({ length: N }, () => []);
  for (let i = 0; i < len; i++) { const k = o[i]; if (k >= 0 && k < N) locs[k].push(i); }
  OC = { e: EPOCH.v, s, locs, own: Int16Array.from(o) }; return OC;
}
function devCache(s: GameState) {
  if (DC.e === EPOCH.v && DC.s === s) return DC;
  const oc = ownerCache(s); const dv = s.loc.dev, len = dv.length;
  if (DC.s === s && DC.oc === oc.locs && DC.devs.length === len) {
    if (sameBits(DC.devs, dv)) { DC.e = EPOCH.v; return DC; }
  }
  const N = s.nations.length, o = s.loc.owner; const dev = new Float64Array(N);
  for (let i = 0; i < o.length; i++) { const k = o[i]; if (k >= 0 && k < N) dev[k] += dv[i]; }
  DC = { e: EPOCH.v, s, dev, devs: Float32Array.from(dv), oc: oc.locs }; return DC;
}
/** Locations owned by n (cached per step; do not mutate the returned array). */
export function nationLocs(s: GameState, n: number): number[] { devCache(s); return ownerCache(s).locs[n]?.slice() ?? []; }
export function nationLocsRO(s: GameState, n: number): readonly number[] { devCache(s); return ownerCache(s).locs[n] ?? []; }
/** Same as nationLocsRO, in ascending order, without touching the development sums. */
export function ownedLocs(s: GameState, n: number): readonly number[] { return ownerCache(s).locs[n] ?? []; }
/** All owner lists of s at once. The table stays the same object exactly while s.loc.owner is unchanged, so its
 *  identity can key caches derived from ownership. Do not mutate. */
export function ownerTable(s: GameState): readonly (readonly number[])[] { return ownerCache(s).locs; }
// Locations by controller (index ctrl + 2, so rebels -2 and nobody -1 have lists too). Control changes without
// an EPOCH bump during the military step, so every call compares the snapshot.
let CC: { s: GameState | null; locs: number[][]; snap: Int16Array } = { s: null, locs: [], snap: new Int16Array(0) };
function ctrlCache(s: GameState) {
  const c = s.loc.ctrl;
  if (CC.s === s && CC.locs.length === s.nations.length + 2 && sameBits(CC.snap, c)) return CC;
  const locs: number[][] = Array.from({ length: s.nations.length + 2 }, () => []);
  for (let i = 0; i < c.length; i++) { const k = c[i] + 2; if (k >= 0 && k < locs.length) locs[k].push(i); }
  CC = { s, locs, snap: Int16Array.from(c) }; return CC;
}
/** Locations controlled by c (ascending; -2 = rebels). Do not mutate. */
export function ctrlLocs(s: GameState, c: number): readonly number[] { return ctrlCache(s).locs[c + 2] ?? []; }
/** All of ctrlLocs at once, indexed by controller + 2 (one check of the cache for several lookups). Do not mutate. */
export function ctrlTable(s: GameState): readonly (readonly number[])[] { return ctrlCache(s).locs; }
export function locValue(s: GameState, l: number) { return Math.max(1, s.loc.dev[l]) + landmarkValue(s, l); }
export function nationDev(s: GameState, n: number) { return devCache(s).dev[n] ?? 0; }

/** An overlord keeps the peace among those who pay him tribute (the khan among the Rus princes): his tributaries do
 *  not war on each other, except the leading crown of a people gathering its kin (see gatheringYear). */
export function tributaryPeace(s: GameState, a: number, b: number): boolean {
  const na = s.nations[a], nb = s.nations[b];
  return na.subjectType === 'tributary' && nb.subjectType === 'tributary' && na.overlord >= 0 && na.overlord === nb.overlord && !gatherClaim(s, a, b);
}
/** A gathering claim of a on b (see gatheringYear): unlike a claim treaty it runs one way only. */
export const gatherClaim = (s: GameState, a: number, b: number) => (s.flags[`gather_${a}_${b}`] ?? 0) > s.day;
// ---------------- justifications (casus belli) ----------------
/** The justifications a realm can hold against another. Each allows certain war goals (CB_GOALS); a goal no
 *  justification covers can still be declared, at the price of an unjust war (declarationCost). */
export type CbKind = 'claim' | 'gathering' | 'fabricated' | 'reconquest' | 'holy_war' | 'succession' | 'trade' | 'excommunicated' | 'independence' | 'rivalry';
export const CB_KINDS: CbKind[] = ['claim', 'gathering', 'fabricated', 'reconquest', 'holy_war', 'succession', 'trade', 'excommunicated', 'independence', 'rivalry'];
/** The war goals each justification allows. A rivalry is a weak cause: it allows a limited war to humble the rival
 *  (prestige, reparations, broken alliances, an end to the rivalry), never conquest. */
export const CB_GOALS: Record<CbKind, WarGoal['type'][]> = {
  claim: ['conquest', 'subjugate', 'throne'], gathering: ['conquest', 'subjugate'], fabricated: ['conquest'],
  reconquest: ['reconquest'], holy_war: ['faith'], succession: ['throne'], trade: ['trade'],
  excommunicated: ['conquest', 'humiliate'], independence: ['independence'], rivalry: ['humiliate'],
};
/** Goals that need no justification of their own (they come from a Common Front, a disputed crown or rebels). */
const SELF_JUSTIFIED = new Set<WarGoal['type']>(['coalition', 'civil_war', 'rebels']);
/** Goals a player or the AI may choose when declaring (the others arise from situations, fronts and successions). */
export const DECLARE_GOALS: WarGoal['type'][] = ['conquest', 'reconquest', 'faith', 'throne', 'trade', 'subjugate', 'humiliate', 'independence'];

/** The locations of a faith's holy sites (named in content/peoples.ts), cached per world. */
const HOLY = new WeakMap<World, Map<number, number[]>>();
export function holySites(w: World, faith: number): number[] {
  let m = HOLY.get(w); if (!m) HOLY.set(w, (m = new Map()));
  let r = m.get(faith);
  if (!r) {
    const names = new Set(FAITHS[faith]?.holySites ?? []); r = [];
    if (names.size) for (let i = 0; i < w.L; i++) if (names.has(w.names[i])) { r.push(i); names.delete(w.names[i]); }
    m.set(faith, r);
  }
  return r;
}
/** b's land that a holy war of a would win back: towns of a's faith under b's rule and holy sites of a's faith (richest first). */
export function holyLand(s: GameState, w: World, a: number, b: number, max = 12): number[] {
  const f = s.nations[a].faith, sites = holySites(w, f), out: number[] = [];
  for (const l of ownedLocs(s, b)) if (s.loc.faith[l] === f || sites.includes(l)) out.push(l);
  return out.sort((x, y) => (sites.includes(y) ? 1 : 0) - (sites.includes(x) ? 1 : 0) || s.loc.dev[y] - s.loc.dev[x] || x - y).slice(0, max);
}
/** Whether a and b share a border (land or a strait). */
export function bordering(s: GameState, w: World, a: number, b: number): boolean {
  const o = s.loc.owner;
  const small = ownedLocs(s, a).length <= ownedLocs(s, b).length ? a : b, other = small === a ? b : a;
  for (const i of ownedLocs(s, small)) for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) { const v = w.adj[e]; if (v < w.L && o[v] === other) return true; }
  return false;
}
/** A holy war: b belongs to another family of faiths, and either rules brethren of a's faith or one of its holy sites,
 *  or borders a realm whose ruler or temper is zealous (a pious ruler, a zealot realm, a call to holy war). */
function holyWarCause(s: GameState, w: World | null, a: number, b: number): boolean {
  const na = s.nations[a], nb = s.nations[b];
  const fa = FAITHS[na.faith]?.family, fb = FAITHS[nb.faith]?.family;
  if (!fa || !fb || fa === fb) return false;
  if (w ? holyLand(s, w, a, b, 1).length > 0 : ownedLocs(s, b).some((l) => s.loc.faith[l] === na.faith)) return true;
  const zeal = na.personality === 'zealot' || (na.flags.holy_war || 0) > 0 || !!s.chars[na.ruler]?.traits.includes('pious');
  return zeal && !!w && bordering(s, w, a, b);
}
/** A claim to b's throne by blood: b's ruler has no living heir, and a is bound to b's house by a royal marriage or
 *  rules through the same dynasty. Republics and church realms have no throne to inherit. */
export function successionCause(s: GameState, a: number, b: number): boolean {
  const na = s.nations[a], nb = s.nations[b];
  if (nb.gov.includes('republic') || nb.gov === 'theocracy' || nb.gov === 'military_order') return false;
  const heir = s.chars[nb.heir];
  if (heir && heir.alive) return false;
  return hasTreaty(s, a, b, 'marriage') || (!!na.dynasty && na.dynasty === nb.dynasty && na.ruler !== nb.ruler);
}
/** A trade conflict: b embargoes a, or levies heavy tolls in a market of b where a's merchants trade, or b's merchants
 *  outweigh a's own in a market a holds. Returns what the conflict is about, or null. */
export function tradeConflict(s: GameState, a: number, b: number): 'embargo' | 'tolls' | 'merchants' | null {
  if (s.flags[`embargo_${b}_${a}`]) return 'embargo';
  const nb = s.nations[b];
  for (const m of s.markets) {
    if (m.owner === b && (m.merchants[a] || 0) > 0 && nb.tariff >= 0.1) return 'tolls';
    if (m.owner === a && (m.merchants[b] || 0) >= 2 && (m.merchants[b] || 0) > (m.merchants[a] || 0)) return 'merchants';
  }
  return null;
}
/** Every justification a has against b, in the order of CB_KINDS. Without a world the holy-war border test is skipped. */
export function casusBelliAll(s: GameState, a: number, b: number, w: World | null = null): CbKind[] {
  const out: CbKind[] = [];
  const na = s.nations[a], nb = s.nations[b]; if (!na || !nb || a === b) return out;
  if (hasTreaty(s, a, b, 'claim')) out.push('claim');
  if (gatherClaim(s, a, b)) out.push('gathering');
  if (s.flags[`cb_${a}_${b}`] && s.flags[`cb_${a}_${b}`] > s.day) out.push('fabricated');
  // land lost within living memory: our own land (still our core, not yet made theirs) in their hands
  const core = s.loc.core;
  for (const i of ownedLocs(s, b)) if (core[i] === a) { out.push('reconquest'); break; }
  if (holyWarCause(s, w, a, b)) out.push('holy_war');
  if (successionCause(s, a, b)) out.push('succession');
  if (tradeConflict(s, a, b)) out.push('trade');
  if (nb.excommunicated && na.faith === nb.faith) out.push('excommunicated');
  if (na.overlord === b) out.push('independence');
  if (na.rivals.includes(b)) out.push('rivalry');
  return out;
}
/** The justification a holds against b for this war goal (any goal when none is named), or null. Without the world
 *  the holy-war test for a zealous neighbour is skipped (callers in the simulation always pass it). */
export function hasCasusBelli(s: GameState, a: number, b: number, goal?: WarGoal['type'], w: World | null = null): CbKind | null {
  for (const c of casusBelliAll(s, a, b, w)) if (!goal || CB_GOALS[c].includes(goal)) return c;
  return null;
}
/** The goals a's justifications against b allow. */
export function justifiedGoals(s: GameState, w: World, a: number, b: number): WarGoal['type'][] {
  const out = new Set<WarGoal['type']>(); for (const c of casusBelliAll(s, a, b, w)) for (const g of CB_GOALS[c]) out.add(g);
  return DECLARE_GOALS.filter((g) => out.has(g));
}

/** What declaring war on b for this goal costs a: nothing beyond the war itself when a justification covers the goal;
 *  otherwise Concord, Mandate, prestige, Dread and the opinion of every realm. Breaking a truce costs on top, more so
 *  without a justification, and an ally attacked loses its trust in us. Rows are [key, value] for the breakdown. */
export function declarationCost(s: GameState, w: World, a: number, b: number, goal: WarGoal['type'], justified = false) {
  const na = s.nations[a];
  const cb = goal === 'independence' && na.overlord === b ? 'independence' as CbKind : hasCasusBelli(s, a, b, goal, w);
  const unjust = !cb && !SELF_JUSTIFIED.has(goal) && !justified;
  const truce = hasTreaty(s, a, b, 'truce'), ally = hasTreaty(s, a, b, 'alliance');
  let concord = 0, mandate = 0, prestige = 0, dread = 0, opinionAll = 0, opinionYears = 0;
  const rows: [string, number][] = [];
  if (unjust) {
    concord -= 35; mandate -= 15; prestige -= 15; dread += 15 * dreadGain(na); opinionAll -= 25; opinionYears = 5;
    rows.push(['x_dc_unjust_concord', -35], ['x_dc_unjust_mandate', -15], ['x_dc_unjust_prestige', -15], ['x_dc_unjust_dread', 15 * dreadGain(na)], ['x_dc_unjust_opinion', -25]);
  }
  if (truce) {
    // breaking our word costs more than it used to, and twice that without any justification
    const k = unjust ? 2 : 1;
    concord -= 30 * k; prestige -= 20 * k; mandate -= 10 * k; opinionAll -= 15; opinionYears = Math.max(opinionYears, 10);
    rows.push(['x_dc_truce_concord', -30 * k], ['x_dc_truce_prestige', -20 * k], ['x_dc_truce_mandate', -10 * k], ['x_dc_truce_opinion', -15]);
  }
  if (ally) { prestige -= 10; rows.push(['x_dc_ally_prestige', -10]); }
  return { cb, unjust, truce, ally, concord, mandate, prestige, dread, opinionAll, opinionYears, rows };
}

/** The towns a war for this goal is fought over (its war score ticks while the attackers hold most of them). The
 *  player's declaration and the AI's go through this one function, so both wars run on the same rules. */
export function warGoalLocs(s: GameState, w: World, a: number, b: number, goal: WarGoal['type']): number[] {
  const nb = s.nations[b]; const cap = nb.capital >= 0 && s.loc.owner[nb.capital] === b ? [nb.capital] : [];
  switch (goal) {
    case 'conquest': {
      // border towns, more for a greater realm, and first the places the realm's own goals name (systems/goals.ts)
      const k = clamp(Math.round(ownedLocs(s, a).length / 40), 6, 15);
      const want = (GOAL_PLACES.f?.(s, w, s.nations[a]) ?? []).filter((l) => s.loc.owner[l] === b);
      return [...new Set([...want, ...targetLocs(s, w, a, b, k)])].slice(0, k + 2);
    }
    case 'reconquest': return reconquestLocs(s, a, b);
    case 'faith': { const h = holyLand(s, w, a, b); return h.length ? h : cap; }
    case 'throne': case 'subjugate': return cap;
    case 'trade': {
      const hubs = s.markets.filter((m) => m.owner === b && s.loc.owner[m.hub] === b).map((m) => m.hub).sort((x, y) => s.loc.dev[y] - s.loc.dev[x] || x - y).slice(0, 3);
      return hubs.length ? hubs : cap;
    }
  }
  return [];
}
/** The places named by a realm's open goals (systems/goals.ts sets this; the war module does not import the goals). */
export const GOAL_PLACES: { f: ((s: GameState, w: World, n: Nation) => number[]) | null } = { f: null };
/** Border locations of b next to a (the best first, grown along their provinces): the towns a war of conquest is fought for. */
export function targetLocs(s: GameState, w: World, a: number, b: number, k: number): number[] {
  const out: [number, number][] = [];
  for (const i of ownedLocs(s, b)) {
    let border = 0;
    for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) { const v = w.adj[e]; if (v < w.L && s.loc.owner[v] === a) border++; }
    if (border) out.push([i, s.loc.dev[i] + border * 3]);
  }
  out.sort((p, q) => q[1] - p[1] || p[0] - q[0]);
  // grow along the province of the best border location
  const res = new Set<number>();
  for (const [l] of out.slice(0, 3)) { const p = w.provOf[l]; for (const x of w.provinces[p]?.locs ?? [l]) if (s.loc.owner[x] === b && res.size < k * 2) res.add(x); }
  return [...res].slice(0, Math.max(k, 3));
}

/** Why a cannot declare this war on b now (null = it can). The declaration dialog shows it per goal; declareWar
 *  refuses with exactly this. */
/** The bodies of the realm that weigh in on a war: the Empire's peace and the assemblies before it is declared, the
 *  emperor's defence and the league after. Set by systems/empire.ts, so that this module does not import it (the
 *  Empire reaches the setup through diplomacy and the military, and war.ts must load before them). */
export const warHooks: {
  veto?: (s: GameState, w: World, a: number, b: number, goal: WarGoal['type']) => string | null;
  /** The same refusal without side effects (no assembly is held): the AI drops the targets it would be refused. */
  check?: (s: GameState, w: World, a: number, b: number, goal: WarGoal['type']) => string | null;
  declared?: (s: GameState, w: World, war: War) => void;
  /** A realm joined the attackers of a war (an ally's call): the emperor attacking a member pays in authority. */
  joined?: (s: GameState, w: World, war: War, n: number) => void;
} = {};

export function declareRefusal(s: GameState, w: World, a: number, b: number, goalType: WarGoal['type'], locs: number[] = []): string | null {
  const na = s.nations[a], nb = s.nations[b];
  if (!na?.alive || !nb?.alive || a === b) return 'invalid';
  if (atWar(s, a, b)) return 'already at war';
  if (na.overlord >= 0 && na.subjectType !== 'tributary' && goalType !== 'independence') return 'subjects cannot declare wars';
  if (goalType !== 'independence' && tributaryPeace(s, a, b)) return 'the overlord forbids war among his tributaries';
  if (na.overlord === b && goalType !== 'independence') return 'we pay tribute to them';
  if (goalType === 'independence' && na.overlord !== b) return 'they are not our overlord';
  // the war goal must fit the cause: a war of reconquest is fought for our own land that they hold, a holy war against
  // another faith (both change who comes to the defence and how long the truce runs, see below and concludePeace)
  locs = [...new Set((locs ?? []).filter((l) => Number.isInteger(l) && l >= 0 && l < w.L))];
  if (goalType === 'reconquest') {
    if (!casusBelliAll(s, a, b, w).includes('reconquest') || locs.some((l) => s.loc.core[l] !== a)) return 'no land of ours to win back';
  }
  if (goalType === 'faith' && na.faith === nb.faith) return 'they share our faith';
  if (goalType === 'trade' && !s.markets.some((m) => m.owner === b) && !tradeConflict(s, a, b)) return 'they hold no market';
  // the Perpetual Peace of the Empire, and assemblies that must approve wars where the law requires it (player and AI);
  // here without side effects (no assembly is held): declareWar then asks warHooks.veto
  if (warHooks.check) {
    const chk = warHooks.check(s, w, a, b, goalType); if (chk) return chk;
  }
  const target = topOverlord(s, b);
  // never a war inside one's own realm of subjects (independence and civil wars are fought from within on purpose)
  if (goalType !== 'independence' && goalType !== 'civil_war' && (target === a || target === topOverlord(s, a))) return 'invalid';
  return null;
}
export function declareWar(s: GameState, w: World, a: number, b: number, goalType: WarGoal['type'] = 'conquest', locs: number[] = [], opts?: { situation?: boolean }): string | null {
  locs = [...new Set((locs ?? []).filter((l) => Number.isInteger(l) && l >= 0 && l < w.L))];
  const why = declareRefusal(s, w, a, b, goalType, locs); if (why) return why;
  // the assembly votes now (the AI may buy the missing votes), the Empire's peace is enforced (systems/empire.ts warVeto)
  const veto = warHooks.veto?.(s, w, a, b, goalType); if (veto) return veto;
  const na = s.nations[a], nb = s.nations[b];
  const target = topOverlord(s, b);
  // the towns the war is fought for are the goal's own (warGoalLocs, the same for the player and the AI). Only a war of
  // reconquest may name some of our own land they hold, and a situation's war (the war for a great city, a crusade for
  // a holy site) the towns the situation is about: a declaration naming the enemy's richest towns, or towns far from the
  // land a holy war is about, would otherwise make them goals (and cessions) the justification never covered.
  const theirs = new Set([b, target, ...subjectsOf(s, target)]);
  if (goalType === 'reconquest' || (opts?.situation && (goalType === 'conquest' || goalType === 'faith'))) locs = locs.filter((l) => theirs.has(s.loc.owner[l]));
  else locs = [];
  if (!locs.length) locs = warGoalLocs(s, w, a, b, goalType);
  // the price of the declaration (an unjust war, a broken truce, a betrayed ally), paid once it stands; a situation's
  // war (a crusade, the war for a great city) is justified by the situation itself
  const cost = declarationCost(s, w, a, b, goalType, opts?.situation);
  const cb = cost.cb ?? (opts?.situation ? 'situation' : null), unjust = cost.unjust;
  if (cost.ally) { s.treaties = s.treaties.filter((t) => !(t.type === 'alliance' && ((t.a === a && t.b === b) || (t.a === b && t.b === a)))); addOpinion(s, b, a, 'broke_alliance', -40, 365 * 5); }
  if (cost.truce) s.treaties = s.treaties.filter((t) => !(t.type === 'truce' && ((t.a === a && t.b === b) || (t.a === b && t.b === a))));
  na.concord = clamp(na.concord + cost.concord, -100, 100); na.mandate = clamp(na.mandate + cost.mandate, 0, 100);
  na.prestige = clamp(na.prestige + cost.prestige, -100, 100); na.dread += cost.dread;
  if (cost.opinionAll) for (const o of s.nations) if (o.alive && o.id !== a) addOpinion(s, o.id, a, unjust ? 'unjust_war' : 'truce_breaker', cost.opinionAll, 365 * cost.opinionYears);
  // subjects already at war with their own overlord (fighting for independence) are not called to its side
  const def = [target, ...subjectsOf(s, target).filter((x) => s.nations[x].subjectType !== 'tributary' && x !== a && !atWar(s, x, target))];
  if (!def.includes(b)) def.push(b);
  const att = [a, ...subjectsOf(s, a).filter((x) => s.nations[x].subjectType !== 'tributary' && !atWar(s, x, a))];
  const war: War = {
    id: newId(s), name: warName(s, w, a, b, goalType), att, def, attLead: a, defLead: target,
    goal: { type: goalType, target: b, locs, ...(cb ? { cb } : {}) }, start: s.day, score: 0, battleScore: 0, tickScore: 0, battles: 0, lossesA: 0, lossesD: 0, offers: [],
  };
  s.wars.push(war);
  // call allies: the AI answers at once (willJoin), a player is asked (callToArms)
  // in a war of reconquest or of faith the attacker's brethren in faith do not defend the other faith
  const holy = goalType === 'reconquest' || goalType === 'faith';
  for (const al of allies(s, target)) if (!war.att.includes(al) && !war.def.includes(al) && !(holy && FAITHS[s.nations[al].faith]?.family === FAITHS[na.faith]?.family && FAITHS[nb.faith]?.family !== FAITHS[na.faith]?.family) && mayJoin(s, al, target, a)) {
    if (s.playerNations.includes(al)) callToArms(s, war, al, target, true); else if (willJoin(s, al, target, a, true)) war.def.push(al);
  }
  for (const al of allies(s, a)) if (!war.att.includes(al) && !war.def.includes(al) && mayJoin(s, al, a, target)) {
    if (s.playerNations.includes(al)) callToArms(s, war, al, a, false); else if (willJoin(s, al, a, target, false)) { war.att.push(al); warHooks.joined?.(s, w, war, al); }
  }
  // guarantees (a player guarantor is asked like an ally)
  for (const t of s.treaties) if (t.type === 'guarantee' && t.b === b && t.until > s.day && !war.att.includes(t.a) && !war.def.includes(t.a) && s.nations[t.a].alive) {
    if (s.playerNations.includes(t.a)) callToArms(s, war, t.a, b, true); else war.def.push(t.a);
  }
  addOpinion(s, b, a, 'war_declared', -60, 365 * 10);
  chronicle(s, a, 'war', { en: `${na.short.en} declared war on ${nb.short.en}${unjust ? ' without just cause' : ''}.`, de: `${na.short.de} erklärte ${nb.short.de} den Krieg${unjust ? ' ohne gerechten Grund' : ''}.` });
  for (const p of s.playerNations) if (war.def.includes(p) || war.att.includes(p)) notice(s, p, 'war', { en: `${na.short.en} declared war on ${nb.short.en}!`, de: `${na.short.de} erklärte ${nb.short.de} den Krieg!` }, { war: war.id, loc: nb.capital });
  // the Empire's members expect the emperor to defend them; the league defends its towns
  warHooks.declared?.(s, w, war);
  return null;
}
/** Whether an ally can be called at all: alive, nobody else's subject, not allied to the enemy too. */
function mayJoin(s: GameState, ally: number, friend: number, enemy: number): boolean {
  const n = s.nations[ally];
  if (!n.alive || n.overlord >= 0 && n.overlord !== friend) return false;
  return !hasTreaty(s, ally, enemy, 'alliance');
}
/** Whether an AI ally answers a call to arms (players are asked instead, see callToArms). */
function willJoin(s: GameState, ally: number, friend: number, enemy: number, defensive: boolean): boolean {
  const n = s.nations[ally];
  if (!mayJoin(s, ally, friend, enemy)) return false;
  // a realm worn out by war stays home from an ally's campaign, and once spent even from its defence
  if (n.warExhaustion > (defensive ? 75 : 40)) return false;
  const op = opinion(s, ally, friend) - opinion(s, ally, enemy) * 0.5 + (defensive ? 30 : 0) + (n.rivals.includes(enemy) ? 40 : 0);
  return op > 0 || chance(s.rng, 0.5);
}
// ---------------- calls to arms ----------------
/** Days a player has to answer a call to arms; then the court decides (it honours a call to defend, declines one to attack). */
export const CALL_DAYS = 30;
/** What refusing a call costs with the ally that called: opinion for five years and trust; a second refusal within ten
 *  years ends the alliance. */
export const CALL_REFUSED = { defend: { opinion: -25, trust: -20 }, attack: { opinion: -15, trust: -10 }, years: 10 };
/** What answering a call brings: their opinion of us for five years and their trust. */
export const CALL_ANSWERED = { opinion: 15, trust: 5 };
/** Imperial authority the emperor loses when he joins an attack on a member of the Empire (systems/empire.ts). */
export const EMPEROR_JOIN_ATTACK = 3;
/** Whether n, joining the attackers of this war, is the emperor attacking a member of the Empire. */
export function emperorAttacksMember(s: GameState, war: War, n: number): boolean {
  const t = s.nations[war.goal.target];
  return s.empire.emperor === n && !!t?.isHRE && t.id !== n && !['independence', 'civil_war', 'rebels'].includes(war.goal.type);
}
/** A player's ally (or the realm it guarantees) went to war, or was attacked: the player is asked whether to join, on
 *  the side of friend (a pending event 'call_to_arms', answered through answerCallToArms). */
export function callToArms(s: GameState, war: War, ally: number, friend: number, defensive: boolean) {
  if (s.pending.some((p) => p.event === 'call_to_arms' && p.nation === ally && p.ctx.war === war.id)) return;
  s.pending.push({ id: s.nextId++, event: 'call_to_arms', nation: ally, day: s.day, expires: s.day + CALL_DAYS, ctx: { war: war.id, from: friend, def: defensive ? 1 : 0 } });
  const F = s.nations[friend], E = s.nations[defensive ? war.attLead : war.defLead];
  notice(s, ally, 'call_to_arms', defensive
    ? { en: `${E.short.en} has attacked ${F.short.en}: our ally calls us to its defence.`, de: `${E.short.de} hat ${F.short.de} angegriffen: Unser Verbündeter ruft uns zu seiner Verteidigung.` }
    : { en: `${F.short.en} has gone to war against ${E.short.en} and calls us to arms.`, de: `${F.short.de} zieht gegen ${E.short.de} in den Krieg und ruft uns zu den Waffen.` }, { war: war.id });
}
/** Why a call to arms has lapsed (null = it still stands): the war ended, or the ally that called left it. */
export function callLapsed(s: GameState, p: PendingEvent): string | null {
  const war = s.wars.find((x) => x.id === p.ctx.war); if (!war) return 'the war is over';
  if (!war.att.includes(p.ctx.from) && !war.def.includes(p.ctx.from)) return 'the war is over';
  if (war.att.includes(p.nation) || war.def.includes(p.nation)) return 'already in this war';
  return null;
}
/** Whether refusing this call would end the alliance (the ally was refused once already within ten years). */
export function callRefusalBreaks(s: GameState, ally: number, friend: number): boolean {
  const last = s.nations[ally]?.flags[`refused_call_${friend}`];
  return last !== undefined && s.day - last < 365 * CALL_REFUSED.years;
}
/** The answer to a call to arms (choice 0 joins, 1 stays out; -1 or auto: the court decides). */
export function answerCallToArms(s: GameState, w: World, p: PendingEvent, choice: number): string | null {
  const why = callLapsed(s, p); if (why) return why; // the call lapsed: nothing to answer
  const war = s.wars.find((x) => x.id === p.ctx.war)!;
  const n = s.nations[p.nation], F = s.nations[p.ctx.from], defensive = !!p.ctx.def;
  const join = choice === 0 || (choice < 0 && defensive);
  const side = war.att.includes(F.id) ? war.att : war.def;
  if (join) {
    side.push(n.id);
    addOpinion(s, F.id, n.id, 'answered_call', CALL_ANSWERED.opinion, 365 * 5);
    rel(s, F.id, n.id).trust = clamp(rel(s, F.id, n.id).trust + CALL_ANSWERED.trust, 0, 100);
    if (side === war.att) warHooks.joined?.(s, w, war, n.id);
    chronicle(s, n.id, 'war', { en: `${n.short.en} answered the call of ${F.short.en} and joined the ${war.name.en}.`, de: `${n.short.de} folgte dem Ruf von ${F.short.de} und trat in den Krieg ein (${war.name.de}).` });
    return null;
  }
  const k = defensive ? CALL_REFUSED.defend : CALL_REFUSED.attack;
  const breaks = callRefusalBreaks(s, n.id, F.id);
  addOpinion(s, F.id, n.id, 'refused_call', k.opinion, 365 * 5);
  rel(s, F.id, n.id).trust = clamp(rel(s, F.id, n.id).trust + k.trust, 0, 100);
  n.flags[`refused_call_${F.id}`] = s.day;
  if (breaks) {
    s.treaties = s.treaties.filter((t) => !(t.type === 'alliance' && ((t.a === n.id && t.b === F.id) || (t.a === F.id && t.b === n.id))));
    notice(s, n.id, 'call_to_arms', { en: `${F.short.en} has ended our alliance: we refused its call to arms a second time.`, de: `${F.short.de} hat unser Bündnis aufgelöst: Wir sind seinem Ruf zu den Waffen zum zweiten Mal nicht gefolgt.` });
  }
  return null;
}

function warName(s: GameState, w: World, a: number, b: number, goal: string) {
  const A = s.nations[a], Bn = s.nations[b];
  if (goal === 'independence') return { en: `${A.adj.en} War of Independence`, de: `${A.adj.de}er Unabhängigkeitskrieg` };
  if (goal === 'coalition') return { en: `War of the Common Front against ${Bn.short.en}`, de: `Krieg der Gemeinsamen Front gegen ${Bn.short.de}` };
  if (goal === 'civil_war') return { en: `${A.adj.en} War of Succession`, de: `${A.adj.de}er Erbfolgekrieg` };
  if (goal === 'faith') return { en: `${A.adj.en} Holy War against ${Bn.short.en}`, de: `Heiliger Krieg von ${A.short.de} gegen ${Bn.short.de}` };
  return { en: `${A.adj.en}–${Bn.adj.en} War`, de: `${A.short.de}isch-${Bn.short.de}ischer Krieg`.replace('isch-', '–').replace('ischer Krieg', ' Krieg') };
}

/** The most war score battles can bring a war, either way. */
export const BATTLE_CAP = 40;
/** Battles kept one by one in a war's log; older ones are summed (War.battleLogRest). */
export const BATTLE_LOG_KEPT = 60;
/** What a battle is worth in war score for one war: a point for every 1,500 of the loser's dead, and up to 2 more by
 *  how hard it hit the losing side of that war (2 when the dead were a quarter or more of all the men that side had in
 *  the field before the battle), at most 25. A skirmish of a few hundred men against a great alliance moves the war by a
 *  fraction of a point; the rout of a small realm's whole army counts fully. side: the losing side's men before the
 *  battle (hulls in a sea battle). */
export function battleWorth(lossL: number, side: number): { dead: number; blow: number; total: number } {
  const dead = lossL / 1500, blow = 2 * Math.min(1, 4 * lossL / Math.max(1, side));
  return { dead, blow, total: Math.min(25, dead + blow) };
}
/** The men (hulls at sea) the realms of one side of a war have under arms now. */
function sideMen(s: GameState, side: number[], naval: boolean): number {
  let m = 0;
  for (const a of s.armies) if (!a.rebels && a.fleet === naval && side.includes(a.owner)) for (const r of a.regs) m += r.men;
  return m;
}
/** Battles, occupations: adjust war score of every war between the two sides. A battle is written into the log of
 *  every war it counts for (info: the battle's place, losses and report), so the war's battle score can be traced. */
export function warScoreEvent(s: GameState, winner: number, loser: number, kind: 'battle' | 'occupy' | 'blockade', amount: number, loc?: number,
  info?: { naval: boolean; lossW: number; lossL: number; report?: number }) {
  for (const war of s.wars) {
    const wa = war.att.includes(winner) && war.def.includes(loser);
    const wd = war.def.includes(winner) && war.att.includes(loser);
    if (!wa && !wd) continue;
    if (kind === 'battle') {
      // a battle is weighed against the losing side of each war it counts for (amount: used only without info)
      const lossL = info?.lossL ?? 0, side = info ? sideMen(s, wa ? war.def : war.att, info.naval) + lossL : 0;
      const worth = info ? battleWorth(lossL, side).total : amount;
      const raw = wa ? worth : -worth, before = war.battleScore;
      war.battleScore = clamp(before + raw, -BATTLE_CAP, BATTLE_CAP); war.battles++;
      const log = (war.battleLog ??= []);
      log.push({ day: s.day, loc: loc ?? -1, naval: !!info?.naval, win: winner, lose: loser, lossW: Math.round(info?.lossW ?? 0), lossL: Math.round(lossL), side: Math.round(side),
        score: war.battleScore - before, raw, ...(info?.report !== undefined ? { report: info.report } : {}) });
      if (log.length > BATTLE_LOG_KEPT) {
        const old = log.shift()!; const rest = (war.battleLogRest ??= { n: 0, score: 0 });
        rest.n++; rest.score += old.score;
      }
    }
    // ports shut by enemy fleets (blockadeMonth): the score builds up month by month to at most 15
    if (kind === 'blockade') war.blockScore = clamp((war.blockScore ?? 0) + (wa ? amount : -amount), -15, 15);
  }
}

/** a's own land (cores) that b holds, the richest first: the goal of a war of reconquest (at most 12 towns). */
export function reconquestLocs(s: GameState, a: number, b: number): number[] {
  const out: number[] = [];
  for (const l of nationLocsRO(s, b)) if (s.loc.core[l] === a) out.push(l);
  return out.sort((x, y) => s.loc.dev[y] - s.loc.dev[x] || x - y).slice(0, 12);
}
/** War score: battles + share of enemy value occupied + ticking score from the war goal. */
/** Ascending list of the locations owned by the participants of a war (only these count for the score). */
const WL = new WeakMap<War, { locs: number[][]; key: string; idx: Int32Array }>();
function warLocs(s: GameState, war: War): Int32Array {
  const locs = ownerCache(s).locs; const key = war.att.join(',') + '|' + war.def.join(',');
  const c = WL.get(war);
  if (c && c.locs === locs && c.key === key) return c.idx;
  let n = 0; const seen = new Set<number>();
  for (const p of [...war.att, ...war.def]) if (!seen.has(p)) { seen.add(p); n += locs[p]?.length ?? 0; }
  const idx = new Int32Array(n); let k = 0;
  for (const p of seen) for (const i of locs[p] ?? []) idx[k++] = i;
  idx.sort();
  WL.set(war, { locs, key, idx }); return idx;
}
export function computeScore(s: GameState, war: War): number {
  const p = scoreParts(s, war);
  return clamp(p.battles + p.occupation + p.capital + p.ticking + p.blockade, -100, 100);
}
/** The parts of the war score from the attackers' side (before the ±100 cap). */
export function scoreParts(s: GameState, war: War): { battles: number; occupation: number; capital: number; ticking: number; blockade: number } {
  const att = new Set(war.att), def = new Set(war.def);
  let defTotal = 0, defOcc = 0, attTotal = 0, attOcc = 0;
  const o = s.loc.owner, c = s.loc.ctrl;
  for (const i of warLocs(s, war)) {
    const ow = o[i]; if (ow < 0) continue;
    const v = s.loc.dev[i];
    if (def.has(ow)) { defTotal += v; if (att.has(c[i])) defOcc += v; }
    else if (att.has(ow)) { attTotal += v; if (def.has(c[i])) attOcc += v; }
  }
  const occ = (defTotal > 0 ? defOcc / defTotal : 0) * 100 - (attTotal > 0 ? attOcc / attTotal : 0) * 100;
  // capital capture
  const capD = s.nations[war.defLead]?.capital, capA = s.nations[war.attLead]?.capital;
  const cap = (capD >= 0 && att.has(c[capD]) ? 15 : 0) - (capA >= 0 && def.has(c[capA]) ? 15 : 0);
  return { battles: war.battleScore, occupation: occ * 0.75, capital: cap, ticking: war.tickScore, blockade: war.blockScore ?? 0 };
}

// ---------------- peace ----------------
/** The peace terms the winner of a war may impose: the attackers win what they declared the war for (each goal has its
 *  own terms), the defenders may take what an ordinary war allows. Gold and a white peace always fit. */
export const GOAL_TERMS: Record<string, PeaceTerm['type'][]> = {
  conquest: ['cede', 'release', 'humiliate', 'break_alliance', 'reparations'],
  reconquest: ['cede', 'humiliate', 'reparations'],
  subjugate: ['vassal', 'cede', 'humiliate', 'break_alliance'],
  faith: ['faith', 'convert', 'cede', 'humiliate', 'break_alliance', 'reparations'],
  throne: ['throne', 'humiliate', 'break_alliance'],
  trade: ['trade_rights', 'end_embargo', 'tariff_cut', 'expel_merchants', 'humiliate', 'reparations'],
  humiliate: ['humiliate', 'reparations', 'break_alliance', 'end_rivalry'],
  independence: ['independence', 'humiliate'],
  coalition: ['cede', 'release', 'humiliate', 'break_alliance', 'reparations', 'end_rivalry'],
  civil_war: ['cede', 'release', 'humiliate', 'break_alliance'],
  rebels: ['cede'],
};
const DEFENDER_TERMS: PeaceTerm['type'][] = ['cede', 'release', 'humiliate', 'break_alliance', 'reparations', 'end_rivalry', 'trade_rights', 'end_embargo'];
const ALWAYS: PeaceTerm['type'][] = ['gold', 'white_peace', 'concession'];
/** Terms the side that imposes them (the winner, attWins = the attackers) may ask for in this war. */
export function allowedTerms(war: War, attWins: boolean): Set<PeaceTerm['type']> {
  return new Set<PeaceTerm['type']>([...ALWAYS, ...(attWins ? GOAL_TERMS[war.goal.type] ?? GOAL_TERMS.conquest : DEFENDER_TERMS)]);
}
/** Whether a town may be ceded to the winning attackers: in a war of reconquest only our own land and the towns the war
 *  was declared for, in a holy war only land of our faith and its holy sites; elsewhere any town of the losing side. */
export function cedeFits(s: GameState, w: World, war: War, attWins: boolean, recv: number, l: number): boolean {
  if (!attWins) return true;
  if (war.goal.type === 'reconquest') return s.loc.core[l] === recv || war.goal.locs.includes(l);
  if (war.goal.type === 'faith') return s.loc.faith[l] === s.nations[recv].faith || holySites(w, s.nations[recv].faith).includes(l) || war.goal.locs.includes(l);
  return true;
}
/** Why a holy war may end with the loser's whole realm taking the winner's faith (null = it may not): the loser is a
 *  much smaller realm (a third of the winner's weight or less), holds one of the old faiths, or most of its people
 *  already hold the winner's faith. Otherwise a holy war wins its holy land (cede) and converts towns (convert). The
 *  peace panel, sanitizeTerms and the AI's demands all ask this. */
export type FaithFit = 'small' | 'old_faith' | 'majority';
export function faithTermFits(s: GameState, winner: number, loser: number): FaithFit | null {
  const W = s.nations[winner], Ln = s.nations[loser];
  if (!W || !Ln || W.faith === Ln.faith) return null;
  // the reasons the people would follow come first (the AI weighs them above mere size, see aiDemands)
  if (FAITHS[Ln.faith]?.family === 'traditional') return 'old_faith';
  if (faithShare(s, loser, W.faith) > 0.5) return 'majority';
  return nationDev(s, winner) >= 3 * Math.max(1, nationDev(s, loser)) ? 'small' : null;
}
/** The share of a realm's people who hold this faith. */
export function faithShare(s: GameState, n: number, faith: number): number {
  let all = 0, ours = 0;
  for (const l of ownedLocs(s, n)) {
    let p = 0; for (let c = 0; c < C; c++) p += s.loc.pop[l * C + c];
    all += p; if (s.loc.faith[l] === faith) ours += p;
  }
  return all > 0 ? ours / all : 0;
}
/** Price of a peace term in war score (what the side giving it weighs it at). */
export function termCost(s: GameState, war: War, t: PeaceTerm, from: number, to: number): number {
  const loserDev = Math.max(10, [...(war.att.includes(to) ? war.att : war.def)].reduce((p, n) => p + nationDev(s, n), 0));
  const share = clamp(nationDev(s, to) / loserDev, 0.2, 1); // the loser's own weight on its side
  switch (t.type) {
    case 'cede': return (t.locs || []).reduce((p, l) => p + locValue(s, l), 0) / loserDev * 100 * 1.6 + (t.locs?.length ? 3 : 0);
    case 'convert': return (t.locs || []).reduce((p, l) => p + locValue(s, l), 0) / loserDev * 100 * 0.6 + (t.locs?.length ? 2 : 0);
    case 'gold': return clamp((t.amount || 0) / Math.max(1, (s.nations[to].income.tax || 10) * 12) * 25, 1, 60);
    case 'release': return 25;
    case 'vassal': return 60 * share;
    case 'break_alliance': return 10;
    // a realm's whole faith: most of a won war against a peer, less against a much smaller realm
    case 'faith': return clamp(30 + 65 * clamp(nationDev(s, to) / Math.max(10, nationDev(s, from)) * 1.5, 0, 1), 30, 95);
    case 'throne': return (t.mode === 'claimant' ? 45 : 80) * share;
    case 'humiliate': return 15;
    case 'reparations': return 20;
    case 'end_rivalry': return 8;
    case 'trade_rights': return 20;
    case 'end_embargo': return 8;
    case 'tariff_cut': return 10;
    case 'expel_merchants': return 10;
    case 'independence': return 40;
    case 'concession': return 5;
    case 'white_peace': return 0;
  }
  return 10;
}

/** Years a war has run in this game: a war that began before the game (the historical wars of the setup are dated back
 *  up to 30 years) counts from the first day, so that it is not weary of a war it never fought. */
export function warYears(s: GameState, war: War): number { return (s.day - Math.max(war.start, 0)) / 365; }
/** Men under arms on land: a realm with its subjects, or a whole side of a war. */
function landMen(s: GameState, realms: Set<number>): number {
  let m = 0;
  for (const a of s.armies) if (!a.fleet && !a.rebels && realms.has(a.owner)) for (const r of a.regs) m += r.men;
  return m;
}
/** The balance in the field as the receiver of an offer sees it: its own host (with its subjects in the war) against the
 *  offerer's, and the allies on each side against each other. A side much stronger in the field gives in less readily,
 *  a weaker one more readily (each at most ±12). Also returns the receiver's side's share of all men in the war. */
export function fieldBalance(s: GameState, war: War, from: number, to: number): { own: number; allies: number; share: number } {
  const toSide = war.att.includes(to) ? war.att : war.def, fromSide = toSide === war.att ? war.def : war.att;
  const core = (lead: number, side: number[]) => new Set([lead, ...side.filter((x) => s.nations[x]?.overlord === lead)]);
  const ownT = core(to, toSide), ownF = core(from, fromSide);
  const mT = landMen(s, ownT), mF = landMen(s, ownF);
  const aT = landMen(s, new Set(toSide.filter((x) => !ownT.has(x)))), aF = landMen(s, new Set(fromSide.filter((x) => !ownF.has(x))));
  // a tenth of all the men in the war as a cushion, so that a few hundred men more or less do not swing the answer
  const k = Math.max(500, (mT + mF + aT + aF) * 0.1);
  const lg = (x: number, y: number) => Math.log2((x + k) / (y + k));
  return { own: clamp(Math.round(-10 * lg(mT, mF)), -12, 12), allies: clamp(Math.round(-10 * lg(aT, aF)), -12, 12), share: (mT + aT) / Math.max(1, mT + aT + mF + aF) };
}
/** AI willingness: positive = accepts. Returns reasons for the UI; the rows (but 'not_enough_war_score', a condition) add
 *  up to the score, and a white peace adds its +5 unlisted (the peace panel lists it, see game/view.ts peaceAnswer). */
export function evaluatePeace(s: GameState, war: War, from: number, to: number, terms: PeaceTerm[]): { accept: boolean; score: number; reasons: [string, number][] } {
  const reasons: [string, number][] = [];
  const fromAtt = war.att.includes(from);
  const score = computeScore(s, war) * (fromAtt ? 1 : -1); // war score from the offerer's perspective
  const cost = terms.reduce((p, t) => p + termCost(s, war, t, from, to), 0);
  const white = terms.length === 0 || terms.every((t) => t.type === 'white_peace');
  const add = (k: string, v: number) => { if (v) reasons.push([k, v]); return v; };
  let sum = 0;
  reasons.push(['war_score', Math.round(score)]); sum += Math.round(score);
  reasons.push(['demands', -Math.round(cost)]); sum -= Math.round(cost);
  const nTo = s.nations[to];
  sum += add('war_exhaustion', Math.round(nTo.warExhaustion * 0.4));
  const years = warYears(s, war);
  sum += add('war_length', Math.round(Math.min(20, years * 2)));
  if (nTo.treasury < 0) sum += add('empty_treasury', 10);
  const capLost = nTo.capital >= 0 && s.loc.ctrl[nTo.capital] !== to; if (capLost) sum += add('capital_occupied', 10);
  // the balance of the armies in the field and of the allies
  const bal = fieldBalance(s, war, from, to);
  sum += add('field_armies', bal.own); sum += add('allies_in_field', bal.allies);
  if (white) sum += 5;
  const ai = !s.playerNations.includes(to);
  // a subject fighting for its freedom does not give up for nothing while the war still goes its way
  const holdOut = white && war.goal.type === 'independence' && from === war.defLead && to === war.attLead && -score > -15 && nTo.warExhaustion < 50 && ai;
  if (holdOut) sum += add('fighting_for_freedom', -30);
  // an attacker whose host lies before the walls of a town it went to war for does not give it up for nothing, nor
  // does one with armies in the field whose war is young (counted from the first day of the game) and its aims unmet;
  // one pressing a claim to the throne does not settle for the old order while its armies hold the field
  const goal = war.goal.locs.length ? war.goal.locs : (['throne', 'subjugate', 'conquest'].includes(war.goal.type) && s.nations[war.goal.target]?.capital >= 0 ? [s.nations[war.goal.target].capital] : []);
  const keen = white && !holdOut && to === war.attLead && nTo.warExhaustion < 60 && ai;
  const inField = bal.share >= 0.2; // its side still has armies in the field: one man for every four of the enemy's or more
  const sieging = keen && goal.length > 0 && s.sieges.some((x) => war.att.includes(x.nation) && goal.includes(x.loc));
  const unmet = keen && !sieging && inField && score <= 5 && years < 1.5 && (!goal.length || goal.some((l) => war.def.includes(s.loc.owner[l])));
  const claim = keen && !sieging && !unmet && war.goal.type === 'throne' && inField && score < 10 && nTo.warExhaustion < 40;
  if (sieging) sum += add('siege_under_way', -30);
  if (unmet) sum += add('war_aims_unmet', -30);
  if (claim) sum += add('pressing_claim', -20);
  if (!white && score < cost * 0.8) reasons.push(['not_enough_war_score', -20]);
  return { accept: !holdOut && !sieging && !unmet && !claim && sum >= 0 && (white || score >= cost * 0.8), score: sum, reasons };
}

export function applyPeace(s: GameState, w: World, war: War, winner: number, loser: number, terms: PeaceTerm[]) {
  const W = s.nations[winner], Ln = s.nations[loser];
  const parts: string[] = []; const partsDe: string[] = [];
  let waveOrigin = W.capital;
  for (const t of terms) {
    if (t.type === 'cede' && t.locs) {
      const recv = t.to ?? winner;
      let k = 0;
      for (const l of t.locs) {
        const prev = s.loc.owner[l];
        if (prev < 0) continue;
        transferLoc(s, w, l, recv, k++);
      }
      s.nations[recv].stats.locsGained += t.locs.length; Ln.stats.locsLost += t.locs.length;
      // Dread grows with the value taken
      const val = t.locs.reduce((p, l) => p + locValue(s, l), 0);
      s.nations[recv].dread += val * 0.35 * dreadGain(s.nations[recv]);
      parts.push(`${t.locs.length} locations (${[...new Set(t.locs.map((l) => w.provinces[w.provOf[l]]?.name))].slice(0, 3).join(', ')})`);
      partsDe.push(`${t.locs.length} Orte (${[...new Set(t.locs.map((l) => deName(w.provinces[w.provOf[l]]?.name)))].slice(0, 3).join(', ')})`);
    }
    if (t.type === 'gold') { const amt = Math.min(t.amount || 0, Math.max(0, Ln.treasury) + (Ln.income.tax || 0) * 6); Ln.treasury -= amt; W.treasury += amt; parts.push(`${Math.round(amt)} marks`); partsDe.push(`${Math.round(amt)} Mark`); }
    if (t.type === 'vassal') { Ln.overlord = winner; Ln.subjectType = 'vassal'; Ln.subjectSince = s.day; Ln.libertyDesire = 30; parts.push('vassalage'); partsDe.push('Vasallität'); }
    if (t.type === 'break_alliance') { s.treaties = s.treaties.filter((x) => !(x.type === 'alliance' && (x.a === loser || x.b === loser) && (t.nation === undefined || x.a === t.nation || x.b === t.nation))); parts.push('alliances broken'); partsDe.push('Bündnisse gelöst'); }
    if (t.type === 'faith') { Ln.faith = W.faith; Ln.concord = clamp(Ln.concord - 30, -100, 100); parts.push('change of faith'); partsDe.push('Glaubenswechsel'); }
    if (t.type === 'humiliate') { Ln.prestige -= 30; W.prestige += 20; Ln.mandate = clamp(Ln.mandate - 10, 0, 100); parts.push('humiliation'); partsDe.push('Demütigung'); }
    if (t.type === 'independence') {
      // only the subject that fought for its freedom (the war's leader) leaves its overlord, and only when that overlord
      // lost (the defeated leader, or the overlord the war was declared on); a nation the term names is not trusted
      const sub = s.nations[war.attLead];
      if (sub && sub.overlord >= 0 && (sub.overlord === loser || sub.overlord === war.goal.target)) { sub.overlord = -1; sub.subjectType = null; parts.push('independence'); partsDe.push('Unabhängigkeit'); }
    }
    if (t.type === 'convert' && t.locs?.length) {
      // the towns are made to take our faith: the old faith lives on as a minority, and the people resent it
      let k = 0;
      for (const l of t.locs) {
        if (s.loc.faith[l] === W.faith) continue;
        s.loc.minFaith[l] = s.loc.faith[l]; s.loc.minShare[l] = Math.max(s.loc.minShare[l], 0.3); s.loc.faith[l] = W.faith;
        s.loc.unrest[l] = Math.min(100, s.loc.unrest[l] + 15); k++;
      }
      parts.push(`${k} towns converted`); partsDe.push(`${k} Orte bekehrt`);
    }
    if (t.type === 'throne') {
      if (t.mode === 'claimant' || W.overlord >= 0) {
        // a prince of our house takes their throne; the realm stays its own but becomes our junior partner (alliance, marriage)
        const old = s.chars[Ln.ruler];
        if (old) old.role = 'courtier';
        const c = newChar(s, Ln, { born: s.day - Math.floor(28 * 365), role: 'ruler', female: false, dynasty: W.dynasty, skills: [2, 2, 2] });
        Ln.ruler = c.id; Ln.heir = 0; Ln.consort = 0; Ln.regent = 0; Ln.dynasty = W.dynasty; Ln.mandate = clamp(Ln.mandate - 20, 0, 100);
        pickNewHeir(s, Ln);
        const lo = Math.min(winner, loser), hi = Math.max(winner, loser);
        s.treaties = s.treaties.filter((x) => !((x.type === 'alliance' || x.type === 'marriage') && x.a === lo && x.b === hi));
        s.treaties.push({ a: lo, b: hi, type: 'alliance', since: s.day, until: 1e9 }, { a: lo, b: hi, type: 'marriage', since: s.day, until: s.day + 365 * 40 });
        Ln.rivals = Ln.rivals.filter((x) => x !== winner);
        addOpinion(s, loser, winner, 'kin_on_the_throne', 40, 365 * 30);
        Ln.flags[`junior_of_${winner}`] = s.day + 365 * 30;
        parts.push(`a prince of ${W.dynasty || W.short.en} on the throne`); partsDe.push(`ein Prinz des Hauses ${W.dynasty || W.short.de} auf dem Thron`);
      } else {
        // personal union: our ruler wears their crown too, and they become the junior partner
        const old = s.chars[Ln.ruler];
        if (old && old.id !== W.ruler) old.role = 'courtier';
        Ln.overlord = winner; Ln.subjectType = 'personal_union'; Ln.subjectSince = s.day; Ln.libertyDesire = 25;
        Ln.ruler = W.ruler; Ln.heir = W.heir; Ln.consort = W.consort; Ln.regent = 0; Ln.dynasty = W.dynasty;
        s.treaties = s.treaties.filter((x) => !(x.type === 'alliance' && (x.a === loser || x.b === loser)));
        parts.push('personal union'); partsDe.push('Personalunion');
      }
    }
    if (t.type === 'trade_rights') { s.flags[`tradepriv_${winner}_${loser}`] = s.day + 365 * 20; parts.push('trade privileges'); partsDe.push('Handelsprivilegien'); }
    if (t.type === 'end_embargo') { delete s.flags[`embargo_${loser}_${winner}`]; s.flags[`noembargo_${loser}_${winner}`] = s.day + 365 * 10; parts.push('end of the embargo'); partsDe.push('Ende des Embargos'); }
    if (t.type === 'tariff_cut') { s.flags[`tariffcap_${loser}`] = s.day + 365 * 10; Ln.tariff = Math.min(Ln.tariff, TARIFF_CAP); parts.push('lower tolls'); partsDe.push('niedrigere Zölle'); }
    if (t.type === 'expel_merchants') {
      for (const m of s.markets) if (m.owner === winner || (W.capital >= 0 && m.hub === W.capital)) delete m.merchants[loser];
      s.flags[`nomerch_${loser}_${winner}`] = s.day + 365 * 10;
      parts.push('their merchants expelled'); partsDe.push('ihre Kaufleute ausgewiesen');
    }
    if (t.type === 'reparations') { s.flags[`repar_${loser}_${winner}`] = s.day + 365 * 5; parts.push('reparations for five years'); partsDe.push('Reparationen für fünf Jahre'); }
    if (t.type === 'end_rivalry') { Ln.rivals = Ln.rivals.filter((x) => x !== winner); Ln.prestige = clamp(Ln.prestige - 10, -100, 100); W.prestige = clamp(W.prestige + 5, -100, 100); parts.push('rivalry renounced'); partsDe.push('Rivalität aufgegeben'); }
    if (t.type === 'release' && t.locs?.length) {
      // release a nation from the loser's land
      const { releaseNation, landFaith } = require_military();
      const nn = releaseNation(s, w, Ln, t.locs, s.loc.culture[t.locs[0]], landFaith(s, t.locs)); // a people set free keeps its own faith (and arms to match)
      parts.push(`release of ${nn.short.en}`); partsDe.push(`Freilassung von ${nn.short.de}`);
    }
  }
  // restore control of everything else
  const sides = new Set([...war.att, ...war.def]);
  for (let i = 0; i < s.loc.owner.length; i++) {
    const o = s.loc.owner[i];
    if (sides.has(o) && s.loc.ctrl[i] !== o && s.loc.ctrl[i] !== -2) s.loc.ctrl[i] = o;
  }
  // winner prestige
  W.prestige = clamp(W.prestige + 10, -100, 100); W.stats.warsWon++;
  const text = terms.length && !terms.every((t) => t.type === 'white_peace')
    ? { en: `Peace between ${W.short.en} and ${Ln.short.en}: ${parts.join(', ')}.`, de: `Frieden zwischen ${W.short.de} und ${Ln.short.de}: ${partsDe.join(', ')}.` }
    : { en: `White peace between ${W.short.en} and ${Ln.short.en}.`, de: `Frieden ohne Gebietsänderung zwischen ${W.short.de} und ${Ln.short.de}.` };
  chronicle(s, winner, 'peace', text);
  for (const p of s.playerNations) if (sides.has(p)) notice(s, p, 'peace', text, { loc: Ln.capital });
  s.flags.lastPeaceDay = s.day; (s as any).lastPeace = { day: s.day, winner, loser, origin: waveOrigin };
}
/** Highest toll a realm forced to cut its tolls may levy while the treaty lasts. */
export const TARIFF_CAP = 0.05;
/** Treaty obligations after a peace, monthly: reparations (a tenth of the payer's revenue for five years), trade
 *  privileges (a quarter of the loser's trade profits for twenty years) and capped tolls. */
export function peaceObligations(s: GameState) {
  for (const k of Object.keys(s.flags)) {
    const until = s.flags[k];
    const m = /^(repar|tradepriv|tariffcap|nomerch|noembargo)_(\d+)(?:_(\d+))?$/.exec(k); if (!m) continue;
    if (until <= s.day) { delete s.flags[k]; continue; }
    const x = s.nations[+m[2]], y = m[3] !== undefined ? s.nations[+m[3]] : undefined;
    if (!x?.alive || (m[3] !== undefined && !y?.alive)) { delete s.flags[k]; continue; }
    if (m[1] === 'repar' && y) {
      // the payer x pays the winner y
      const gross = Object.values(x.income).reduce((p, v) => p + Math.max(0, v), 0);
      const amt = Math.max(0, gross * 0.1);
      if (amt > 0) { x.treasury -= amt; x.expenseAcc.reparations = (x.expenseAcc.reparations || 0) + amt; y.treasury += amt; y.incomeAcc.reparations = (y.incomeAcc.reparations || 0) + amt; }
    } else if (m[1] === 'tradepriv' && y) {
      // the holder x takes a quarter of y's trade profits
      const amt = Math.max(0, (y.income.trade || 0) * 0.25);
      if (amt > 0) { y.treasury -= amt; y.expenseAcc.trade_privileges = (y.expenseAcc.trade_privileges || 0) + amt; x.treasury += amt; x.incomeAcc.trade_privileges = (x.incomeAcc.trade_privileges || 0) + amt; }
    } else if (m[1] === 'tariffcap') x.tariff = Math.min(x.tariff, TARIFF_CAP);
  }
}
let _mil: any = null;
export function require_military() { return _mil; }
export function _setMilitary(m: any) { _mil = m; }

/** How strongly conquest and unjust wars frighten others: 1 plus the dread effects (a warlike reputation). */
export function dreadGain(n: Nation): number { return Math.max(0.2, 1 + lawEffect(n, 'dread')); }
/** Hand a location to another realm. A conquest (the default) starts unintegrated under weak control; land that
 *  returns to its own crown (the end of a war of succession, crown land passed to the crown's colonial realm) or that
 *  callers integrate themselves (annexation, union) passes with conquest: false and keeps its integration and control. */
export function transferLoc(s: GameState, w: World, l: number, to: number, order = 0, opts?: { conquest?: boolean }) {
  const from = s.loc.owner[l];
  s.loc.owner[l] = to; s.loc.ctrl[l] = to; EPOCH.v++;
  if (opts?.conquest !== false) {
    s.loc.integ[l] = 0; // conquered land starts unintegrated
    s.loc.control[l] = Math.min(s.loc.control[l], 0.3); // and the new lord's officials have yet to take hold
  }
  s.loc.unrest[l] = Math.max(s.loc.unrest[l], 20);
  s.flags.ownershipDirty = s.day;
  (s as any).ownerChanges = (s as any).ownerChanges || [];
  (s as any).ownerChanges.push({ loc: l, day: s.day, from, to, order });
  if ((s as any).ownerChanges.length > 2000) (s as any).ownerChanges.splice(0, 1000);
  // capital lost → the court moves to a great town near the old seat (not to a distant colony)
  const fn = s.nations[from];
  if (fn && fn.capital === l) {
    let best = -1, bd = -1;
    for (let i = 0; i < w.L; i++) if (s.loc.owner[i] === from) { const v = (s.loc.dev[i] + 1) / (1 + w.distKm(l, i) / 250); if (v > bd) { bd = v; best = i; } }
    fn.capital = best;
  }
}

/** End a war between two blocs (removes participants on the losing side from this war). */
export function concludePeace(s: GameState, w: World, war: War, from: number, to: number, terms: PeaceTerm[]) {
  const fromAtt = war.att.includes(from);
  const score = computeScore(s, war) * (fromAtt ? 1 : -1);
  const winner = score >= 0 || terms.length ? from : to;
  const loser = winner === from ? to : from;
  const pre = s.nations[war.attLead], legit = s.nations[war.goal.target];
  const leadersPeace = (from === war.attLead || from === war.defLead) && (to === war.attLead || to === war.defLead);
  const civil = war.goal.type === 'civil_war' && leadersPeace && pre?.flags.pretender_of === legit?.id && legit.alive;
  // a war of succession reunites the realm, unless a vast steppe realm ends it undecided: then the khanate splits for good
  const attScore = computeScore(s, war);
  const splits = civil && Math.abs(attScore) < 20 && (legit.gov === 'nomadic_horde' || legit.gov === 'tribal_federation') && nationLocs(s, legit.id).length + nationLocs(s, pre.id).length >= 120;
  if (civil && !splits) endCivilWar(s, w, war, pre, legit, attScore > 10);
  else {
    applyPeace(s, w, war, winner, loser, terms.length ? terms : [{ type: 'white_peace' }]);
    if (splits) {
      const city = w.names[pre.capital] ?? pre.short.en, cityDe = w.namesDe[pre.capital] ?? city;
      pre.name = { en: `Khanate of ${city}`, de: `Khanat ${cityDe}` }; pre.short = { en: city, de: cityDe }; pre.adj = { en: city, de: cityDe };
      delete pre.flags.pretender_of;
      chronicle(s, pre.id, 'independence', { en: `The war of succession in ${legit.short.en} ended undecided: the ${pre.name.en} goes its own way.`, de: `Der Erbfolgekrieg in ${legit.short.de} endete unentschieden: das ${pre.name.de} geht seinen eigenen Weg.` });
    }
  }
  // if the offer was between the war leaders, the whole war ends; otherwise only the separate peace
  const leaders = (from === war.attLead || from === war.defLead) && (to === war.attLead || to === war.defLead);
  const ending = leaders ? [...war.att, ...war.def] : [from === war.attLead || from === war.defLead ? to : from];
  // a war fought for one's own land resumes sooner: the truce runs two years when every town the war was declared for
  // is a core of the attacker (whatever the war was called), otherwise five
  const ownLand = war.goal.locs.length > 0 && war.goal.locs.every((l) => s.loc.core[l] === war.attLead);
  const truceYears = ownLand ? 2 : 5;
  // the truce binds the war leaders to every enemy, not the allies to each other: otherwise every alliance war renewed
  // truces between bystanders for good (the City and Granada were kept safe that way for a century)
  const lead = (x: number) => x === war.attLead || x === war.defLead;
  for (const n of ending) {
    for (const other of (war.att.includes(n) ? war.def : war.att)) {
      if (!lead(n) && !lead(other)) continue;
      s.treaties.push({ a: Math.min(n, other), b: Math.max(n, other), type: 'truce', since: s.day, until: s.day + 365 * truceYears });
    }
  }
  if (leaders) s.wars.splice(s.wars.indexOf(war), 1);
  else {
    war.att = war.att.filter((x) => !ending.includes(x)); war.def = war.def.filter((x) => !ending.includes(x));
    if (!war.att.length || !war.def.length) s.wars.splice(s.wars.indexOf(war), 1);
  }
  // armies in now-foreign territory are sent home
  for (const a of s.armies) {
    if (a.fleet || a.rebels) continue;
    const o = s.loc.owner[a.loc];
    if (o >= 0 && o !== a.owner && !atWar(s, a.owner, o) && !hasTreaty(s, a.owner, o, 'access') && !hasTreaty(s, a.owner, o, 'alliance')) {
      const cap = s.nations[a.owner].capital; if (cap >= 0) { a.loc = cap; a.path = []; a.siege = -1; }
    }
  }
  for (const sg of s.sieges.slice()) if (!s.armies.some((a) => a.siege === sg.loc)) s.sieges.splice(s.sieges.indexOf(sg), 1);
}

// ---------------- Dread & Common Front ----------------
function dreadMonth(s: GameState, w: World) {
  for (const n of s.nations) {
    if (!n.alive) continue;
    n.dread = Math.max(0, n.dread * 0.992 - 0.05 - lawEffect(n, 'dread_decay') * 0.1);
  }
  // nations fearing a strong, dreadful neighbour join a Common Front
  for (const agg of s.nations) {
    if (!agg.alive || agg.dread < 25) { if (agg.flags.front) delete agg.flags.front; if (agg.flags.front_months) delete agg.flags.front_months; continue; }
    const members: number[] = [];
    const capA = agg.capital; if (capA < 0) continue;
    for (const o of s.nations) {
      if (!o.alive || o.id === agg.id || o.overlord >= 0 || o.capital < 0) continue;
      if (hasTreaty(s, o.id, agg.id, 'alliance') || o.overlord === agg.id) continue;
      const d = w.distKm(o.capital, capA);
      if (d > 1400) continue;
      const fear = agg.dread * (1 - d / 1600) - opinion(s, o.id, agg.id) * 0.3 - (o.faith === agg.faith ? 5 : -10);
      if (fear > 20) members.push(o.id);
    }
    agg.flags.front = members.length;
    (s as any).fronts = (s as any).fronts || {};
    (s as any).fronts[agg.id] = members;
    // declare if strong enough. The pressure builds while a front stands without a war against the aggressor: 8 % in
    // its first month, a point more each further month, at most 20 %; it starts anew once the front has acted.
    const fighting = s.wars.some((x) => x.goal.type === 'coalition' && x.goal.target === agg.id);
    const standing = members.length >= 3 && !fighting ? (agg.flags.front_months = (agg.flags.front_months ?? 0) + 1) : 0;
    if (!standing && agg.flags.front_months) delete agg.flags.front_months;
    if (standing && chance(s.rng, Math.min(0.2, 0.07 + 0.01 * standing))) {
      const strengthF = members.reduce((p, m) => p + nationDev(s, m), 0);
      const strengthA = nationDev(s, agg.id) + allies(s, agg.id).reduce((p, m) => p + nationDev(s, m) * 0.5, 0);
      if (strengthF > strengthA * 0.9) {
        // the strongest member leads; if it cannot (a truce, a family tie), the next one does. A player's realm is never
        // made to declare: it is called to arms like the other members once the front has risen
        const order = members.sort((a, b) => nationDev(s, b) - nationDev(s, a) || a - b).filter((m) => !s.playerNations.includes(m));
        let lead = -1, err: string | null = 'none';
        for (const m of order.slice(0, 6)) { err = declareWar(s, w, m, agg.id, 'coalition'); if (!err) { lead = m; break; } }
        if (!err && lead >= 0) {
          delete agg.flags.front_months;
          const war = s.wars[s.wars.length - 1];
          for (const m of members) if (!war.att.includes(m) && !war.def.includes(m)) { if (s.playerNations.includes(m)) callToArms(s, war, m, lead, false); else war.att.push(m); }
          chronicle(s, lead, 'coalition', { en: `A Common Front of ${members.length} realms rose against ${agg.short.en}.`, de: `Eine Gemeinsame Front von ${members.length} Reichen erhob sich gegen ${agg.short.de}.` });
          notice(s, agg.id, 'coalition', { en: `A Common Front of ${members.length} realms has declared war on us!`, de: `Eine Gemeinsame Front von ${members.length} Reichen hat uns den Krieg erklärt!` }, { war: war.id });
        }
      }
    }
  }
}

function warsMonth(s: GameState, w: World) {
  // weariness of the war months: the leaders of a war tire of it fastest, an ally called in less, and several wars at
  // once tire a realm no more than half again as fast as one (summing every war ground a realm that its allies kept
  // calling in, such as the early Ottomans, to permanent exhaustion)
  const tire = new Map<number, number>();
  for (const war of s.wars.slice()) {
    if (!s.nations[war.attLead]?.alive || !s.nations[war.defLead]?.alive || war.attLead === war.defLead) { s.wars.splice(s.wars.indexOf(war), 1); continue; }
    // nobody fights on both sides (a realm that changed overlord mid-war leaves the side it no longer belongs to)
    const both = war.att.filter((x) => war.def.includes(x));
    if (both.length) { war.att = war.att.filter((x) => !both.includes(x) || x === war.attLead); war.def = war.def.filter((x) => !both.includes(x) || x === war.defLead); }
    // ticking score: attacker holds the war-goal target or the defender's capital
    const goalLocs = war.goal.locs.length ? war.goal.locs : [];
    let held = 0; for (const l of goalLocs) if (war.att.includes(s.loc.ctrl[l])) held++;
    // the attackers' hold on the goal ticks up; it only ebbs while they are not even besieging it
    const besieging = goalLocs.length > 0 && s.sieges.some((sg) => goalLocs.includes(sg.loc) && war.att.includes(sg.nation));
    if (goalLocs.length) war.tickScore = clamp(war.tickScore + (held / goalLocs.length > 0.5 ? 1 : besieging ? 0 : -0.5), -25, 25);
    else war.tickScore = clamp(war.tickScore + (war.battleScore > 5 ? 0.3 : war.battleScore < -5 ? -0.3 : 0), -15, 15);
    war.score = computeScore(s, war);
    for (const n of [...war.att, ...war.def]) tire.set(n, (tire.get(n) ?? 0) + (n === war.attLead || n === war.defLead ? 0.35 : 0.15));
    // offers expire
    war.offers = war.offers.filter((o) => o.expires > s.day);
  }
  for (const [n, v] of tire) { const nn = s.nations[n]; if (nn) nn.warExhaustion = clamp(nn.warExhaustion + Math.min(0.5, v), 0, 100); }
  // civil wars pending from disputed successions
  for (const n of s.nations) {
    const t = s.flags[`civil_war_pending_${n.id}`];
    if (t && t <= s.day && n.alive) { delete s.flags[`civil_war_pending_${n.id}`]; startCivilWar(s, w, n); }
  }
}

/** A war of succession ends with one realm again: the pretender's lands return, and if the pretender prevailed,
 *  the pretender wears the crown. */
function endCivilWar(s: GameState, w: World, war: War, pre: Nation, legit: Nation, pretenderWon: boolean) {
  for (const l of nationLocs(s, pre.id)) { transferLoc(s, w, l, legit.id, 0, { conquest: false }); s.loc.ctrl[l] = legit.id; s.loc.core[l] = legit.id; }
  for (const a of s.armies) if (a.owner === pre.id) { a.owner = legit.id; a.path = []; a.siege = -1; }
  const sides = new Set([...war.att, ...war.def]);
  for (let i = 0; i < w.L; i++) { const o = s.loc.owner[i]; if (sides.has(o) && s.loc.ctrl[i] !== o && s.loc.ctrl[i] !== -2) s.loc.ctrl[i] = o; }
  if (pretenderWon && s.chars[pre.ruler]?.alive) {
    legit.ruler = pre.ruler; legit.heir = pre.heir; legit.consort = pre.consort; legit.regent = 0;
    if (s.chars[pre.ruler]) s.chars[pre.ruler].role = 'ruler';
    // the pretender's court (consort, children, kin) moves to the reunited realm
    for (const k in s.chars) { const c = s.chars[k]; if (c.alive && c.nation === pre.id) c.nation = legit.id; }
    legit.dynasty = pre.dynasty || legit.dynasty; legit.mandate = 40;
  } else legit.mandate = clamp(legit.mandate + 15, 0, 100);
  pre.alive = false; pre.overlord = -1;
  s.treaties = s.treaties.filter((x) => x.a !== pre.id && x.b !== pre.id);
  const r = s.chars[legit.ruler]?.name ?? '';
  const text = pretenderWon
    ? { en: `The pretender prevailed in ${legit.short.en}: ${r} now wears the crown of a reunited realm.`, de: `Der Prätendent setzte sich in ${legit.short.de} durch: ${r} trägt nun die Krone des wiedervereinten Reiches.` }
    : { en: `The pretender in ${legit.short.en} submitted; the realm is whole again under ${r}.`, de: `Der Prätendent in ${legit.short.de} unterwarf sich; das Reich ist unter ${r} wieder vereint.` };
  chronicle(s, legit.id, 'peace', text);
  for (const p of s.playerNations) if (sides.has(p)) notice(s, p, 'peace', text, { loc: legit.capital });
  s.flags.lastPeaceDay = s.day;
}

export function startCivilWar(s: GameState, w: World, n: Nation) {
  const locs = nationLocs(s, n.id);
  if (locs.length < 6) return;
  // the pretender takes the lands furthest from the capital
  const cap = n.capital;
  locs.sort((a, b) => w.distKm(b, cap) - w.distKm(a, cap));
  const take = locs.slice(0, Math.floor(locs.length * 0.4));
  const { releaseNation, newArmy, availableUnits } = require_military();
  const pre = releaseNation(s, w, n, take, n.culture) as Nation;
  const bare = (x: string) => x.replace(/\s*\((pretender|Prätendent)\)$/, '');
  pre.name = { en: `${bare(n.short.en)} (pretender)`, de: `${bare(n.short.de)} (Prätendent)` }; pre.short = pre.name; pre.adj = n.adj; pre.faith = n.faith; pre.gov = n.gov;
  pre.color = n.color.map((v) => Math.min(255, v + 45)) as any;
  pre.flags.pretender_of = n.id;
  for (const l of take) s.loc.core[l] = n.id;
  const units = availableUnits(s, pre, false);
  newArmy(s, pre.id, take[0], [{ type: units[0], men: Math.max(3000, n.maxManpower * 0.15) }]);
  const err = declareWar(s, w, pre.id, n.id, 'civil_war');
  chronicle(s, n.id, 'civil_war', { en: `Civil war broke out in ${n.short.en} over the disputed succession.`, de: `In ${n.short.de} brach über die umstrittene Thronfolge ein Bürgerkrieg aus.` });
  notice(s, n.id, 'civil_war', { en: `Civil war! A pretender has seized part of the realm.`, de: `Bürgerkrieg! Ein Prätendent hat einen Teil des Reiches an sich gerissen.` }, { loc: take[0] });
  void err;
}

/** Gathering the lands: the leading crown of a people lays claim to small neighbours of the same people, that is of
 *  the same culture (Moscow and the Rus principalities, the Ottomans and the Turkish beyliks, and so on; Castile does
 *  not gather Portugal, nor Mali the Yoruba). Only a crown gathers: a city republic, an order or a horde does not,
 *  and of several crowns of one people the greatest in the neighbourhood leads. The claim runs one way: the small
 *  neighbour gains no cause against the gatherer from it. */
const isCrown = (n: Nation) => !n.gov.includes('republic') && n.gov !== 'theocracy' && n.gov !== 'military_order' && n.gov !== 'nomadic_horde' && n.gov !== 'tribal_federation';
function gatheringYear(s: GameState, w: World) {
  const neigh = new Map<number, Set<number>>();
  const o = s.loc.owner;
  for (let i = 0; i < w.L; i++) {
    const a = o[i]; if (a < 0) continue;
    for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) { const v = w.adj[e]; if (v >= w.L) continue; const b = o[v]; if (b >= 0 && b !== a) { let st = neigh.get(a); if (!st) neigh.set(a, (st = new Set())); st.add(b); } }
  }
  for (const k of Object.keys(s.flags)) if (k.startsWith('gather_') && s.flags[k] <= s.day) delete s.flags[k];
  for (const n of s.nations) {
    if (!n.alive || (n.overlord >= 0 && n.subjectType !== 'tributary') || !isCrown(n) || !chance(s.rng, 0.2)) continue;
    const grp = GROUP_OF[ALL_CULTURES[n.culture]]; if (!grp || grp === 'other') continue;
    const dev = nationDev(s, n.id); if (dev < 80) continue;
    const kin = [...(neigh.get(n.id) ?? [])].filter((b) => s.nations[b].alive && s.nations[b].culture === n.culture).sort((x, y) => x - y);
    if (kin.some((b) => isCrown(s.nations[b]) && s.nations[b].overlord < 0 && nationDev(s, b) > dev)) continue;
    for (const b of kin) {
      const bn = s.nations[b];
      if (bn.overlord === n.id || nationDev(s, b) > dev * 0.5) continue;
      // (an ally is claimed too: it is not attacked, but it may be asked to submit, see the AI's diplomacy)
      if (gatherClaim(s, n.id, b) || hasTreaty(s, n.id, b, 'claim')) continue;
      s.flags[`gather_${n.id}_${b}`] = s.day + 365 * 25;
      break;
    }
  }
}

export const war: System = {
  id: 'war',
  monthly({ s, w }) { warsMonth(s, w); peaceObligations(s); dreadMonth(s, w); },
  yearly({ s, w }) { gatheringYear(s, w); },
};
