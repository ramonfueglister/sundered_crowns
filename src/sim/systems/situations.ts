// Historical situations: long-running, world-level processes with stages and outcomes that depend on what realms do.
// Content: src/sim/content/situations.ts
import type { GameState, Situation, I18n } from '../types';
import type { World } from '../world';
import { type System, chronicle, notice } from '../ctx';
import { SITUATIONS } from '../content/situations';

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
    }
  },
};
function startSit(s: GameState, w: World, d: SituationDef): Situation {
  const sit: Situation = { id: d.id, active: true, progress: 0, stage: 0, started: s.day, data: {} };
  s.situations.push(sit);
  d.start(s, w, sit);
  const t = { en: `${d.name.en} begins.`, de: `${d.name.de} beginnt.` };
  if (s.day > 0) { chronicle(s, -1, 'situation', t); for (const p of s.playerNations) notice(s, p, 'situation', t); }
  return sit;
}
