// Views for the end of the game (polish pass): victory conditions with progress, history graphs, chronicle export.
import type { GameState, I18n } from '../sim/types';
import type { World } from '../sim/world';
import { victoryStatus } from '../sim/systems/victory';
import { dayToDate } from '../sim/calendar';

export function victoryView(s: GameState, w: World, player: number) { return victoryStatus(s, w, player); }

export interface HistoryPoint { y: number; dev: number; locs: number; treasury: number; income: number; army: number | null; score: number | null }
export interface HistorySeries { id: number; name: I18n; color: [number, number, number]; player: boolean; points: HistoryPoint[] }

/** The realms the end screen draws: the player's and the five highest scores, plus any asked for. */
export function historyNations(s: GameState, player: number, extra: number[] = []): number[] {
  const top = s.nations.filter((n) => n.alive).sort((a, b) => b.score - a.score || a.id - b.id).slice(0, 5).map((n) => n.id);
  const ids = [...(player >= 0 ? [player] : []), ...top, ...extra.filter((x) => Number.isInteger(x) && s.nations[x])];
  return [...new Set(ids)].slice(0, 12);
}

/** One sample per year (the first of each calendar year) from the realms' quarterly history (systems/realm.ts). */
export function historyView(s: GameState, player: number, extra: number[] = []): { startYear: number; endYear: number; series: HistorySeries[] } {
  const series: HistorySeries[] = [];
  for (const id of historyNations(s, player, extra)) {
    const n = s.nations[id]; const pts: HistoryPoint[] = []; let lastY = -1;
    for (const h of n.history) {
      const y = dayToDate(h.day, s.startYear).y; if (y === lastY) continue; lastY = y;
      pts.push({ y, dev: Math.round(h.dev), locs: h.locs, treasury: Math.round(h.treasury), income: Math.round(h.income * 10) / 10, army: h.army ?? null, score: h.score ?? null });
    }
    series.push({ id, name: n.short, color: n.color, player: id === player, points: pts });
  }
  return { startYear: s.startYear, endYear: dayToDate(s.day, s.startYear).y, series };
}
