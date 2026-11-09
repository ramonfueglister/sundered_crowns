// Catch-up for players of the persistent world (spec point 106): when a ruler leaves, the server notes where the realm
// stood (AwayMark); when they come back after a while, it sums up what happened in between (CatchUp): the days gone,
// the treasury, land won and lost, wars begun and ended, battles, the events the court decided for them and the
// notable news of the world, each with the place it happened so the window can show it on the map.
import type { GameState, I18n, ChronEntry } from '../sim/types';
import type { World } from '../sim/world';

export interface AwayMark {
  day: number; at: number; treasury: number; income: number; locs: number[];
  wars: { id: number; name: I18n }[]; battlesWon: number; battlesLost: number; chron: number;
}
export interface CatchUpWar { id: number; name: I18n; enemies: number[]; attacker: boolean }
export interface CatchUp {
  nation: number; fromDay: number; toDay: number; daysAway: number; msAway: number;
  treasury: { from: number; to: number }; income: { from: number; to: number };
  gained: number[]; lost: number[]; gainedCount: number; lostCount: number;
  warsStarted: CatchUpWar[]; warsEnded: { id: number; name: I18n }[]; atWar: CatchUpWar[];
  battles: { won: number; lost: number; entries: ChronEntry[] };
  events: { day: number; title: I18n; option: I18n; loc?: number }[];
  pending: number;
  ours: ChronEntry[]; news: ChronEntry[];
}

const sum = (o: Record<string, number>) => Object.values(o).reduce((p, v) => p + v, 0);
function ownedBy(s: GameState, w: World, nation: number): number[] {
  const out: number[] = []; for (let i = 0; i < w.L; i++) if (s.loc.owner[i] === nation) out.push(i); return out;
}

/** Where the realm stands as its ruler leaves. */
export function awayMark(s: GameState, w: World, nation: number, at = Date.now()): AwayMark {
  const n = s.nations[nation];
  return {
    day: s.day, at, treasury: n?.treasury ?? 0, income: n ? sum(n.income) : 0, locs: n ? ownedBy(s, w, nation) : [],
    wars: s.wars.filter((x) => x.att.includes(nation) || x.def.includes(nation)).map((x) => ({ id: x.id, name: x.name })),
    battlesWon: n?.stats.battlesWon ?? 0, battlesLost: n?.stats.battlesLost ?? 0, chron: s.chronicle.length,
  };
}

/** Kinds of world news worth telling a returning ruler, most important first. */
const NEWS_RANK: Record<string, number> = { victory: 0, fall: 1, great_power: 2, emperor: 2, war: 3, peace: 3, independence: 4, union: 4, revolt: 5, civil_war: 5, discovery: 6, era: 6, colony: 7, battle: 7, situation: 6 };
const LIST_MAX = 40;

/** What happened while the ruler was away (from the mark to now). */
export function catchUpSummary(s: GameState, w: World, nation: number, mark: AwayMark, now = Date.now()): CatchUp {
  const n = s.nations[nation];
  const before = new Set(mark.locs); const nowLocs = ownedBy(s, w, nation); const nowSet = new Set(nowLocs);
  const gained = nowLocs.filter((l) => !before.has(l)); const lost = mark.locs.filter((l) => !nowSet.has(l));
  const mine = s.wars.filter((x) => x.att.includes(nation) || x.def.includes(nation));
  const view = (x: (typeof s.wars)[number]): CatchUpWar => { const att = x.att.includes(nation); return { id: x.id, name: x.name, enemies: (att ? x.def : x.att).slice(), attacker: att }; };
  const had = new Set(mark.wars.map((x) => x.id)); const has = new Set(mine.map((x) => x.id));
  const fresh = s.chronicle.slice(mark.chron);
  const names = n ? [n.short.en, n.short.de] : [];
  const ownLoc = (l?: number) => l !== undefined && (before.has(l) || nowSet.has(l));
  const aboutUs = (e: ChronEntry) => e.nation === nation || ownLoc(e.loc) || names.some((x) => x && (e.text.en.includes(x) || e.text.de.includes(x)));
  const ours = fresh.filter(aboutUs);
  const news = fresh.filter((e) => !aboutUs(e) && NEWS_RANK[e.kind] !== undefined)
    .map((e, i) => ({ e, i })).sort((a, b) => NEWS_RANK[a.e.kind] - NEWS_RANK[b.e.kind] || b.i - a.i).slice(0, 12).map((x) => x.e)
    .sort((a, b) => a.day - b.day);
  return {
    nation, fromDay: mark.day, toDay: s.day, daysAway: s.day - mark.day, msAway: Math.max(0, now - mark.at),
    treasury: { from: mark.treasury, to: n?.treasury ?? 0 }, income: { from: mark.income, to: n ? sum(n.income) : 0 },
    gained: gained.slice(0, LIST_MAX), lost: lost.slice(0, LIST_MAX), gainedCount: gained.length, lostCount: lost.length,
    warsStarted: mine.filter((x) => !had.has(x.id)).map(view), warsEnded: mark.wars.filter((x) => !has.has(x.id)), atWar: mine.map(view),
    battles: { won: (n?.stats.battlesWon ?? 0) - mark.battlesWon, lost: (n?.stats.battlesLost ?? 0) - mark.battlesLost, entries: ours.filter((e) => e.kind === 'battle').slice(-LIST_MAX) },
    events: (s.autoEvents ?? []).filter((x) => x.nation === nation && x.day >= mark.day).map((x) => ({ day: x.day, title: x.title, option: x.option, loc: x.loc })),
    pending: s.pending.filter((p) => p.nation === nation).length,
    ours: ours.filter((e) => e.kind !== 'battle').slice(-LIST_MAX), news,
  };
}

/** Whether an absence is long enough to deserve a summary (in-game days). */
export const CATCHUP_MIN_DAYS = 7;
