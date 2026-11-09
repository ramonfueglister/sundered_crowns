// Historical situations: long-running, world-level processes with stages and outcomes that depend on what realms do.
// Content: src/sim/content/situations.ts
import type { GameState, Situation, I18n, Nation } from '../types';
import type { World } from '../world';
import { type System, chronicle, notice, addExpense } from '../ctx';
import { SITUATIONS } from '../content/situations';
import { SIT_EXTRA, type SitAction, type SitCost } from '../content/situation_actions';
import { chance } from '../rng';

export interface SituationDef {
  id: string; name: I18n; desc: I18n;
  stages?: I18n[];                                        // names of stages for the UI
  canStart: (s: GameState, w: World, year: number) => boolean;
  start: (s: GameState, w: World, sit: Situation) => void;
  monthly: (s: GameState, w: World, sit: Situation, year: number, month: number) => void; // may set sit.active=false + outcome
  outcomeText?: (s: GameState, sit: Situation) => I18n;
  involved?: (s: GameState, sit: Situation) => number[]; // realms affected (for the UI)
}
export const SIT_INDEX: Record<string, number> = Object.fromEntries(SITUATIONS.map((x, i) => [x.id, i]));

export function endSituation(s: GameState, sit: Situation, outcome: string) {
  sit.active = false; sit.ended = s.day; sit.outcome = outcome;
  const d = SITUATIONS[SIT_INDEX[sit.id]];
  const t = d?.outcomeText ? d.outcomeText(s, sit) : { en: `${d?.name.en} has ended (${outcome}).`, de: `${d?.name.de} ist beendet (${outcome}).` };
  chronicle(s, -1, 'situation', t);
  for (const p of s.playerNations) notice(s, p, 'situation', t);
}

export const situations: System = {
  id: 'situations',
  init(s, w) {
    for (const d of SITUATIONS) if (d.canStart(s, w, s.startYear) && !s.situations.some((x) => x.id === d.id)) startSit(s, w, d);
  },
  monthly({ s, w, date }) {
    for (const d of SITUATIONS) {
      let sit = s.situations.find((x) => x.id === d.id);
      if (!sit) { if (d.canStart(s, w, date.y)) sit = startSit(s, w, d); else continue; }
      if (sit.active) d.monthly(s, w, sit, date.y, date.m);
      if (sit.active && date.m === 2) aiSituationActions(s, w, sit);
    }
  },
};

// ---------------- actions in a situation (window: src/game/realmview.ts, content: content/situation_actions.ts) ----------------
const actFlag = (id: string, a: string) => `sit_${id}_${a}`;
/** What an action costs a realm, and whether it can pay. */
export function sitCostRefusal(n: Nation, c: SitCost): string | null {
  if (c.gold && n.treasury < c.gold) return 'not enough gold';
  if (c.authority && n.authority < c.authority) return 'not enough Authority';
  if (c.prestige && n.prestige < c.prestige - 50) return 'not enough prestige';
  return null;
}
/** Why a realm cannot take an action now (or null). */
export function sitActionRefusal(s: GameState, w: World, n: Nation, sit: Situation, a: SitAction, target?: number): string | null {
  if (!sit.active) return 'the situation has ended';
  if ((n.flags[actFlag(sit.id, a.id)] ?? 0) > s.day) return 'too soon';
  return a.check(s, w, n, sit, target) ?? sitCostRefusal(n, a.cost(s, n));
}
function takeAction(s: GameState, w: World, n: Nation, sit: Situation, a: SitAction, target?: number) {
  const c = a.cost(s, n);
  if (c.gold) addExpense(n, 'situations', c.gold);
  if (c.authority) n.authority -= c.authority;
  if (c.prestige) n.prestige -= c.prestige;
  n.flags[actFlag(sit.id, a.id)] = s.day + a.cooldown;
  a.apply(s, w, n, sit, target);
  const d = SITUATIONS[SIT_INDEX[sit.id]];
  if (d) chronicle(s, n.id, 'situation', { en: `${n.short.en}: ${a.name.en} (${d.name.en}).`, de: `${n.short.de}: ${a.name.de} (${d.name.de}).` });
}
/** The 'situation' command: a realm takes one of the actions open in a situation. */
export function situationAction(s: GameState, w: World, n: Nation, id: string, action: string, target?: number): string | null {
  const sit = s.situations.find((x) => x.id === id); if (!sit) return 'no such situation';
  const a = SIT_EXTRA[id]?.actions.find((x) => x.id === action); if (!a) return 'unknown action';
  if (a.targets && (target === undefined || !a.targets(s, w, n, sit).includes(target))) return 'invalid target';
  const e = sitActionRefusal(s, w, n, sit, a, target); if (e) return e;
  takeAction(s, w, n, sit, a, target);
  return null;
}
/** AI realms take the actions of a situation once a year: those on its sides, its neighbours in the matter, and the
 *  great powers (each at most one action a year, and only with a fair chance). */
function aiSituationActions(s: GameState, w: World, sit: Situation) {
  const ex = SIT_EXTRA[sit.id]; if (!ex) return;
  const who = new Set<number>();
  for (const side of ex.sides(s, w, sit)) for (const id of side.members.slice(0, 8)) who.add(id);
  for (const id of s.ranking.slice(0, 8)) who.add(id);
  for (const id of [...who].sort((a, b) => a - b)) {
    const n = s.nations[id]; if (!n?.alive || s.playerNations.includes(id) || n.playerId) continue;
    for (const a of ex.actions) {
      const t = a.ai(s, w, n, sit); if (t === null) continue;
      const target = t >= 0 ? t : undefined;
      if (a.targets && (target === undefined || !a.targets(s, w, n, sit).includes(target))) continue;
      if (sitActionRefusal(s, w, n, sit, a, target) || !chance(s.rng, 0.35)) continue;
      takeAction(s, w, n, sit, a, target);
      break;
    }
  }
}
function startSit(s: GameState, w: World, d: SituationDef): Situation {
  const sit: Situation = { id: d.id, active: true, progress: 0, stage: 0, started: s.day, data: {} };
  s.situations.push(sit);
  d.start(s, w, sit);
  const t = { en: `${d.name.en} begins.`, de: `${d.name.de} beginnt.` };
  if (s.day > 0) { chronicle(s, -1, 'situation', t); for (const p of s.playerNations) notice(s, p, 'situation', t); }
  return sit;
}
