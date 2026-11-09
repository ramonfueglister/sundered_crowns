// Goals of the realm: goal trees (content/goals.ts) checked monthly, staggered by nation id (every realm every 3 months).
// Completed goals go to n.goalsDone, the reward is applied once, players get a notice, great realms a chronicle entry.
// Also: AI realms spend their Insight on doctrines (players do so through the 'doctrine' command).
import type { GameState, Nation } from '../types';
import type { World } from '../world';
import { type System, chronicle, notice } from '../ctx';
import { Effects, type EvApi } from './events';
import { GOALS, GOAL_NATIONS, type GoalDef, goalPlace } from '../content/goals';
import { dayToDate } from '../calendar';
import { DOCTRINES } from '../content/doctrines';
import { takeDoctrine, doctrineCost, doctrinePoints, doctrineSlots } from './progress';

const TREE_CACHE = new Map<string, GoalDef[]>();
export function goalsFor(n: Nation): GoalDef[] {
  const key = GOAL_NATIONS.has(n.key) ? n.key : '';
  let t = TREE_CACHE.get(key);
  if (!t) { t = GOALS.filter((g) => (key ? g.nation === key : !g.nation)); TREE_CACHE.set(key, t); }
  return t;
}
function mkApi(s: GameState, w: World, n: Nation, y: number, m: number): EvApi {
  const e: EvApi = { s, w, n, ctx: {}, year: y, month: m, fx: null as unknown as Effects };
  e.fx = new Effects(() => e);
  return e;
}
const isHuman = (s: GameState, n: Nation) => s.playerNations.includes(n.id) || !!n.playerId;

/**
 * The first look at a realm's tree: what is already true is inherited, without reward, and goals_init is set, so that
 * anything achieved later is rewarded. Done for every realm at game start (the system's init); a realm that appears
 * later gets its look at its first review, or when its player claims a goal before that.
 */
function firstLook(s: GameState, w: World, n: Nation, e: EvApi) {
  if (!n.goalsDone) n.goalsDone = [];
  const done = new Set(n.goalsDone);
  n.flags.goals_init = s.day;
  for (let changed = true; changed;) {
    changed = false;
    for (const g of goalsFor(n)) {
      if (done.has(g.id) || (g.req && g.req.some((r) => !done.has(r)))) continue;
      let ok = false; try { ok = g.check(e); } catch { ok = false; }
      if (ok) { n.goalsDone.push(g.id); done.add(g.id); changed = true; }
    }
  }
  n.flags.goals_inherited = n.goalsDone.length;
}

export function checkGoals(s: GameState, w: World, n: Nation, y: number, m: number): number {
  if (!n.goalsDone) n.goalsDone = [];
  const e = mkApi(s, w, n, y, m);
  if (n.flags.goals_init === undefined) { firstLook(s, w, n, e); return 0; }
  const done = new Set(n.goalsDone);
  let k = 0;
  for (const g of goalsFor(n)) {
    if (done.has(g.id)) continue;
    if (g.req && g.req.some((r) => !done.has(r))) continue;
    let ok = false; try { ok = g.check(e); } catch { ok = false; }
    if (!ok) continue;
    done.add(g.id); k++;
    grantGoal(s, n, g, e);
  }
  return k;
}
/** Mark a goal achieved and apply its reward once (monthly check or a player's claim). */
function grantGoal(s: GameState, n: Nation, g: GoalDef, e: EvApi) {
  n.goalsDone.push(g.id);
  try { g.reward(e); } catch { /* content error: the goal still counts */ }
  if (isHuman(s, n)) notice(s, n.id, 'goal', { en: `Goal achieved: ${g.name.en}.`, de: `Ziel erreicht: ${g.name.de}.` });
  if (g.nation || s.ranking.includes(n.id)) chronicle(s, n.id, 'goal', { en: `${n.short.en} achieved “${g.name.en}”.`, de: `${n.short.de} erreichte „${g.name.de}“.` }, n.capital >= 0 ? n.capital : undefined);
}
/**
 * A player claims a goal whose conditions hold now, instead of waiting for the next review (every three months).
 * Validated like the review: the goal belongs to the realm's tree, is not done, its earlier goals are done and all
 * conditions hold.
 */
export function claimGoal(s: GameState, w: World, n: Nation, id: string): string | null {
  const g = goalsFor(n).find((x) => x.id === id); if (!g) return 'no such goal';
  if (!n.goalsDone) n.goalsDone = [];
  const d = dayToDate(s.day, s.startYear);
  const e = mkApi(s, w, n, d.y, d.m);
  // a realm that has not had its first look yet (one that appeared during the game) gets it now: what it already had
  // is inherited without reward, as at its first review (the goal view offers no claim before the look)
  if (n.flags.goals_init === undefined) firstLook(s, w, n, e);
  if (n.goalsDone.includes(id)) return 'already achieved';
  if (g.req && g.req.some((r) => !n.goalsDone.includes(r))) return 'earlier goals come first';
  let ok = false; try { ok = g.check(e); } catch { ok = false; }
  if (!ok) return 'the conditions are not met';
  grantGoal(s, n, g, e);
  return null;
}

/** Each condition of a goal as it stands now: met or not, progress [current, required] where it counts. */
export interface CondState { t: GoalDef['conds'][number]['t']; ok: boolean; cur?: number; max?: number; places?: string[] }
export function goalConditions(s: GameState, w: World, n: Nation, g: GoalDef): CondState[] {
  const d = dayToDate(s.day, s.startYear);
  const e = mkApi(s, w, n, d.y, d.m);
  return g.conds.map((c) => {
    let ok = false; try { ok = c.f(e); } catch { ok = false; }
    let p: [number, number] | undefined; try { p = c.p?.(e); } catch { p = undefined; }
    return { t: c.t, ok, cur: p?.[0], max: p?.[1], places: c.places };
  });
}

/**
 * What the realm's open goals ask for, for the AI: goal places it does not hold yet (by location) and buildings it
 * lacks (by building index). Only goals whose earlier goals are done count, so a realm works on its next steps.
 */
export function goalWants(s: GameState, w: World, n: Nation): { places: number[]; buildings: number[] } {
  const done = new Set(n.goalsDone ?? []);
  const places: number[] = [], blds: number[] = [];
  const d = dayToDate(s.day, s.startYear); const e = mkApi(s, w, n, d.y, d.m);
  for (const g of goalsFor(n)) {
    if (done.has(g.id) || (g.req && g.req.some((r) => !done.has(r)))) continue;
    for (const c of g.conds) {
      for (const nm of c.places ?? []) { const l = goalPlace(w, nm); if (l >= 0 && s.loc.owner[l] !== n.id && !places.includes(l)) places.push(l); }
      if (c.building !== undefined && !blds.includes(c.building)) { let ok = false; try { ok = c.f(e); } catch { ok = false; } if (!ok) blds.push(c.building); }
    }
  }
  return { places, buildings: blds };
}


// ---------------- AI doctrines ----------------
const TASTE: Record<string, Record<string, number>> = {
  conqueror: { chivalry: 3, infantry: 3, siegecraft: 2, statecraft: 2 },
  trader: { commerce: 3, seafaring: 3, stewardship: 2 },
  isolationist: { stewardship: 3, statecraft: 2, piety: 2, siegecraft: 2 },
  zealot: { piety: 3, chivalry: 2, infantry: 2 },
  opportunist: { diplomacy: 3, statecraft: 2, commerce: 2 },
  diplomat: { diplomacy: 3, humanism: 2, stewardship: 2 },
  builder: { stewardship: 3, humanism: 3, commerce: 2, statecraft: 2 },
};
function doctrineWeight(s: GameState, w: World, n: Nation, g: string): number {
  let v = TASTE[n.personality]?.[g] ?? 1;
  const coastal = n.capital >= 0 && w.coastal[n.capital] === 1;
  if (g === 'seafaring' && coastal && w.lon[n.capital] < 10) v += 2;
  if (g === 'seafaring' && !coastal) v -= 3;
  if (g === 'chivalry' && (n.gov === 'nomadic_horde' || n.gov === 'tribal_federation')) v += 2;
  if (g === 'commerce' && n.gov.includes('republic')) v += 2;
  if (g === 'piety' && n.gov === 'theocracy') v += 3;
  if (g === 'stewardship' && n.debt > 0) v += 1;
  return v + (((n.id * 2654435761) >>> 0) % 97 + g.length * 13) % 10 / 10;
}
export function aiDoctrines(s: GameState, w: World, n: Nation) {
  for (let guard = 0; guard < 3; guard++) {
    if (doctrinePoints(n) < doctrineCost(n)) return;
    const avail = DOCTRINES.filter((d) => d.era <= n.era && (n.doctrines[d.id] || 0) < d.picks.length);
    const started = avail.filter((d) => (n.doctrines[d.id] || 0) > 0);
    const startedCount = Object.keys(n.doctrines).filter((k) => (n.doctrines[k] || 0) > 0).length;
    let pool = started;
    if (startedCount < doctrineSlots(n)) pool = avail; // free slot: anything new or started
    if (!pool.length) return;
    pool = pool.slice().sort((a, b) => (doctrineWeight(s, w, n, b.id) + ((n.doctrines[b.id] || 0) > 0 ? 0.5 : 0)) - (doctrineWeight(s, w, n, a.id) + ((n.doctrines[a.id] || 0) > 0 ? 0.5 : 0)));
    const before = s.chronicle.length;
    const err = takeDoctrine(s, w, n, pool[0].id);
    if (err) return;
    // keep the chronicle readable: only great realms' doctrines are recorded
    if (!s.ranking.includes(n.id) && !GOAL_NATIONS.has(n.key) && s.chronicle.length === before + 1 && s.chronicle[before].kind === 'doctrine') s.chronicle.pop();
  }
}

export const goals: System = {
  id: 'goals',
  // the first look at game start, so a goal reached in the first months is rewarded like any later one
  init(s, w) {
    const d = dayToDate(s.day, s.startYear);
    for (const n of s.nations) if (n.alive) firstLook(s, w, n, mkApi(s, w, n, d.y, d.m));
  },
  monthly({ s, w, date }) {
    for (const n of s.nations) {
      if (!n.alive) continue;
      if ((n.id + date.m) % 3 !== 0) continue;
      checkGoals(s, w, n, date.y, date.m);
      if (!isHuman(s, n) && !s.aiDisabled.includes(n.id)) aiDoctrines(s, w, n);
    }
  },
};
