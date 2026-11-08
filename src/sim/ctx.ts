// Shared helpers for systems: context, notices, chronicle, ledger, modifiers, relations.
import type { GameState, I18n, Nation, Relation, Treaty, Notice } from './types';
import type { World } from './world';
import { dayToDate, DateParts } from './calendar';

export interface Ctx { s: GameState; w: World; date: DateParts }
export function mkCtx(s: GameState, w: World): Ctx { return { s, w, date: dayToDate(s.day, s.startYear) }; }

export interface System {
  id: string;
  init?(s: GameState, w: World): void;
  daily?(c: Ctx): void;
  monthly?(c: Ctx): void;
  yearly?(c: Ctx): void;
}

/** Bumped every simulated day and every applied command; caches keyed on it stay valid within a step. */
export const EPOCH = { v: 0 };
export function bump() { EPOCH.v++; }
/** Bumped once per simulated day (and on load); law/modifier caches use it. */
export const DAY_EPOCH = { v: 0 };

export function newId(s: GameState) { return s.nextId++; }

export function notice(s: GameState, nation: number, kind: string, text: I18n, extra: Partial<Notice> = {}) {
  s.notices.push({ id: s.nextId++, day: s.day, nation, kind, text, ...extra });
  if (s.notices.length > 400) s.notices.splice(0, s.notices.length - 400);
}
export function chronicle(s: GameState, nation: number, kind: string, text: I18n, loc?: number) {
  s.chronicle.push({ day: s.day, nation, kind, text, loc });
}
export function addIncome(n: Nation, key: string, v: number) { n.incomeAcc[key] = (n.incomeAcc[key] || 0) + v; n.treasury += v; }
export function addExpense(n: Nation, key: string, v: number) { n.expenseAcc[key] = (n.expenseAcc[key] || 0) + v; n.treasury -= v; }

/** Sum of a named effect over a nation's timed modifiers (e.g. 'tax', 'unrest', 'shock'). */
export function mod(n: Nation, key: string): number {
  let v = 0;
  for (const m of n.modifiers) { const e = m.effects[key]; if (e) v += e; }
  return v;
}

export function relKey(a: number, b: number) { return `${a}>${b}`; }
export function rel(s: GameState, a: number, b: number): Relation {
  const k = relKey(a, b);
  let r = s.rel[k];
  if (!r) { r = { op: 0, trust: 50, mods: [] }; s.rel[k] = r; }
  return r;
}
export function opinion(s: GameState, a: number, b: number): number {
  const r = s.rel[relKey(a, b)];
  if (!r) return 0;
  let v = 0; for (const m of r.mods) v += m.v; return v;
}
export function addOpinion(s: GameState, a: number, b: number, id: string, v: number, days: number, stack = false) {
  const r = rel(s, a, b);
  const ex = r.mods.find((m) => m.id === id);
  if (ex && !stack) { ex.v = v; ex.until = s.day + days; } else if (ex && stack) { ex.v = Math.max(-200, Math.min(200, ex.v + v)); ex.until = s.day + days; }
  else r.mods.push({ id, v, until: s.day + days });
}
export function hasTreaty(s: GameState, a: number, b: number, type: Treaty['type']): boolean {
  for (const t of s.treaties) if (t.type === type && ((t.a === a && t.b === b) || (t.a === b && t.b === a)) && t.until > s.day) return true;
  return false;
}
export function treatiesOf(s: GameState, a: number, type: Treaty['type']): number[] {
  const out: number[] = [];
  for (const t of s.treaties) if (t.type === type && t.until > s.day) { if (t.a === a) out.push(t.b); else if (t.b === a) out.push(t.a); }
  return out;
}
export function allies(s: GameState, a: number) { return treatiesOf(s, a, 'alliance').filter((x) => s.nations[x].alive); }
export function atWar(s: GameState, a: number, b: number): boolean {
  for (const w of s.wars) {
    if ((w.att.includes(a) && w.def.includes(b)) || (w.att.includes(b) && w.def.includes(a))) return true;
  }
  return false;
}
export function warsOf(s: GameState, a: number) { return s.wars.filter((w) => w.att.includes(a) || w.def.includes(a)); }
export function enemiesOf(s: GameState, a: number): Set<number> {
  const out = new Set<number>();
  for (const w of s.wars) {
    if (w.att.includes(a)) w.def.forEach((x) => out.add(x));
    else if (w.def.includes(a)) w.att.forEach((x) => out.add(x));
  }
  return out;
}
export function topOverlord(s: GameState, n: number): number { let k = n, g = 0; while (s.nations[k].overlord >= 0 && g++ < 10) k = s.nations[k].overlord; return k; }
export function subjectsOf(s: GameState, n: number) { return s.nations.filter((x) => x.alive && x.overlord === n).map((x) => x.id); }

export function L(s: GameState, lang: 'en' | 'de', t: I18n) { return t[lang] ?? t.en; }
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
