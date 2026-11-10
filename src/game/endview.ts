// Views for the end of the game (polish pass): victory conditions with progress, history graphs, chronicle export.
import type { GameState, I18n } from '../sim/types';
import type { World } from '../sim/world';
import { victoryStatus, victoryCheck } from '../sim/systems/victory';
import { VICTORY_KINDS } from '../sim/victoryRules';
import { nationStats } from '../sim/systems/realm';
import { dayToDate } from '../sim/calendar';

/** The victory panel: the chosen conditions (systems/victory.ts), the others as information only, and from the first day
 *  our place by score and how the score has moved (against the earliest sample of the last year, from the start on). */
export function victoryView(s: GameState, w: World, player: number) {
  const st = victoryStatus(s, w, player);
  const n = s.nations[player];
  const cache: Record<string, any> = {};
  const others = n ? VICTORY_KINDS.filter((k) => !st.kinds.includes(k)).map((kind) => ({ kind, ...victoryCheck(s, w, kind, player, cache) })) : [];
  const alive = s.nations.filter((x) => x.alive);
  const rank = n?.alive ? 1 + alive.filter((x) => x.score > n.score).length : 0;
  const past = n ? n.history.find((h) => h.day >= s.day - 365 && h.score !== undefined) : undefined;
  const trend = n && past ? { since: past.day, from: past.score, to: Math.round(n.score * 10) / 10 } : null;
  return { ...st, others, rank, ranked: alive.length, trend };
}

export interface HistoryPoint { y: number; dev: number; locs: number; treasury: number; income: number; army: number | null; score: number | null }
export interface HistorySeries { id: number; name: I18n; color: [number, number, number]; player: boolean; points: HistoryPoint[] }

/** The realms the end screen draws: the player's and the five highest scores, plus any asked for. */
export function historyNations(s: GameState, player: number, extra: number[] = []): number[] {
  const top = s.nations.filter((n) => n.alive).sort((a, b) => b.score - a.score || a.id - b.id).slice(0, 5).map((n) => n.id);
  const ids = [...(player >= 0 ? [player] : []), ...top, ...extra.filter((x) => Number.isInteger(x) && s.nations[x])];
  return [...new Set(ids)].slice(0, 12);
}

/** The realms' history (systems/realm.ts samples it every three months): one point per year in a long game; in the first
 *  five years every sample, at its date (y is then a fraction of a year), and today's figures as the last point, so the
 *  lines start with the game. */
export function historyView(s: GameState, w: World, player: number, extra: number[] = []): { startYear: number; endYear: number; series: HistorySeries[] } {
  const series: HistorySeries[] = [];
  // a date as a year with its fraction (1 April 1356 → 1356.25)
  const yearOf = (day: number) => { const d = dayToDate(day, s.startYear); return d.y + (d.m + (d.d - 1) / 31) / 12; };
  const short = s.day < 5 * 365.25;
  const stats = short ? nationStats(s, w) : null;
  for (const id of historyNations(s, player, extra)) {
    const n = s.nations[id]; const pts: HistoryPoint[] = []; let lastY = -1;
    for (const h of n.history) {
      const y = short ? yearOf(h.day) : dayToDate(h.day, s.startYear).y; if (y === lastY) continue; lastY = y;
      pts.push({ y, dev: Math.round(h.dev), locs: h.locs, treasury: Math.round(h.treasury), income: Math.round(h.income * 10) / 10, army: h.army ?? null, score: h.score ?? null });
    }
    const last = n.history[n.history.length - 1];
    if (stats && n.alive && (!last || s.day - last.day >= 7)) {
      const x = stats[id]; let men = 0;
      for (const a of s.armies) if (!a.rebels && !a.fleet && a.owner === id) for (const r of a.regs) men += r.men;
      pts.push({ y: yearOf(s.day), dev: Math.round(x.dev), locs: x.locs, treasury: Math.round(n.treasury), income: Math.round(Object.values(n.income).reduce((p, v) => p + v, 0) * 10) / 10, army: Math.round(men), score: Math.round(n.score * 10) / 10 });
    }
    series.push({ id, name: n.short, color: n.color, player: id === player, points: pts });
  }
  return { startYear: s.startYear, endYear: short ? yearOf(s.day) : dayToDate(s.day, s.startYear).y, series };
}
