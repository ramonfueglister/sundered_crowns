// Ways to win (spec point 84). The score at the end date always counts; the other kinds are chosen at the start of a
// single-player game (s.victoryKinds). Each of them is a condition a realm must hold for VICTORY_YEARS years in a row,
// checked on the first of January. The realm that first completes its years wins, and the game ends.
import type { GameState, Nation } from '../types';
import type { World } from '../world';
import { type System, chronicle, notice } from '../ctx';
import { nationDev } from './war';
import { dayToDate } from '../calendar';
import { LANDMARKS } from '../content/landmarks';
import { VICTORY_KINDS, VICTORY_YEARS, VICTORY_RULES, type VictoryKind } from '../victoryRules';
export { VICTORY_KINDS, VICTORY_YEARS, VICTORY_RULES, type VictoryKind };

const LANDMARK_BUILT = new Map(LANDMARKS.map((d) => [d.id, d.built]));

export function victoryKinds(s: GameState): VictoryKind[] { return (s.victoryKinds ?? ['score']) as VictoryKind[]; }

// ---------------- the measures ----------------
const EURO = new WeakMap<World, Uint8Array>();
/** Europe as the balance checks measure it (tools/sim/observer.ts): 12°W to 45°E, 35°N to 72°N. */
export function europeMask(w: World): Uint8Array {
  let m = EURO.get(w);
  if (!m) { m = new Uint8Array(w.L); for (let i = 0; i < w.L; i++) if (w.lon[i] > -12 && w.lon[i] < 45 && w.lat[i] > 35 && w.lat[i] < 72) m[i] = 1; EURO.set(w, m); }
  return m;
}
/** The realm a location counts for: its owner, or the owner's overlord unless it only pays tribute. */
function topOf(s: GameState, o: number): number {
  const n = s.nations[o]; return n && n.overlord >= 0 && n.subjectType !== 'tributary' ? n.overlord : o;
}
const independent = (n: Nation | undefined) => !!n && n.alive && n.overlord < 0;

export interface Measure { values: Map<number, number>; total: number }
/** Development of Europe held by each realm with its subjects. */
export function hegemonyMeasure(s: GameState, w: World): Measure {
  const eu = europeMask(w), dev = s.loc.dev, own = s.loc.owner; const values = new Map<number, number>(); let total = 0;
  for (let i = 0; i < w.L; i++) {
    if (!eu[i]) continue; total += dev[i];
    const o = own[i]; if (o < 0) continue; const t = topOf(s, o);
    values.set(t, (values.get(t) ?? 0) + dev[i]);
  }
  return { values, total };
}
/** Learning points: technology levels, adopted innovations (2 each), and landmark stages raised since the start in
 *  the realm's land (3 each; what stood in 1356 does not count, so old wonders alone win nothing). */
export function learningParts(s: GameState, n: Nation): { tech: number; innovations: number; stages: number; total: number } {
  const tech = n.tech.reduce((p, v) => p + v, 0);
  const innovations = n.innovations.length;
  let stages = 0; for (const x of s.landmarks ?? []) if (s.loc.owner[x.loc] === n.id) stages += Math.max(0, x.tier - (LANDMARK_BUILT.get(x.id) ?? 0));
  return { tech, innovations, stages, total: tech + innovations * 2 + stages * 3 };
}
export function learningMeasure(s: GameState): Measure {
  const values = new Map<number, number>(); let total = 0;
  for (const n of s.nations) if (independent(n)) { const v = learningParts(s, n).total; values.set(n.id, v); total += v; }
  return { values, total };
}
/** Monthly trade profits, tariffs and company profits. */
export function tradeIncome(n: Nation): number { return Math.max(0, (n.income.trade ?? 0) + (n.income.tariffs ?? 0) + (n.income.company ?? 0) + (n.income.ventures ?? 0)); }
export function commerceMeasure(s: GameState): Measure {
  const values = new Map<number, number>(); let total = 0;
  for (const n of s.nations) if (n.alive) { const v = tradeIncome(n); total += v; if (n.overlord < 0) values.set(n.id, v); }
  return { values, total };
}
/** Development of Europe by faith. */
export function faithDev(s: GameState, w: World): { byFaith: Map<number, number>; total: number } {
  const eu = europeMask(w), dev = s.loc.dev, f = s.loc.faith; const byFaith = new Map<number, number>(); let total = 0;
  for (let i = 0; i < w.L; i++) { if (!eu[i]) continue; total += dev[i]; byFaith.set(f[i], (byFaith.get(f[i]) ?? 0) + dev[i]); }
  return { byFaith, total };
}
/** The independent realm with the most development among those of a faith. */
export function faithLeader(s: GameState, faith: number): number {
  let best = -1, bv = -1;
  for (const n of s.nations) if (independent(n) && n.faith === faith) { const d = nationDev(s, n.id); if (d > bv) { bv = d; best = n.id; } }
  return best;
}

export interface VictoryRow {
  kind: VictoryKind;
  /** our value and the target, as shares (0..1) or points */
  value: number; target: number; unit: 'share' | 'points' | 'ratio';
  /** whether we meet the condition now, and the parts of it that are not met */
  meets: boolean; missing: string[];
  /** the realm closest to the condition and its value */
  leader: number; leaderValue: number;
  /** the realm that holds the condition now, since when (day) and how many years it has held it */
  holder: number; years: number;
  detail?: Record<string, number>;
}

/** Whether `nation` meets the condition of `kind` now, with the value shown in the victory panel. */
export function victoryCheck(s: GameState, w: World, kind: VictoryKind, nation: number, cache: Record<string, any> = {}): { value: number; target: number; unit: VictoryRow['unit']; meets: boolean; missing: string[]; detail?: Record<string, number> } {
  const n = s.nations[nation];
  switch (kind) {
    case 'score': {
      const best = s.nations.filter((x) => x.alive).reduce((p, x) => Math.max(p, x.score), 0);
      return { value: n?.score ?? 0, target: best, unit: 'points', meets: !!n?.alive && n.score >= best, missing: [] };
    }
    case 'hegemony': {
      const m: Measure = cache.heg ??= hegemonyMeasure(s, w);
      const v = (m.values.get(nation) ?? 0) / Math.max(1, m.total);
      const missing = []; if (v < VICTORY_RULES.hegemony.share) missing.push('share'); if (!independent(n)) missing.push('independent');
      return { value: v, target: VICTORY_RULES.hegemony.share, unit: 'share', meets: !missing.length, missing };
    }
    case 'learning': {
      const m: Measure = cache.learn ??= learningMeasure(s);
      const p = n ? learningParts(s, n) : { tech: 0, innovations: 0, stages: 0, total: 0 };
      let second = 0; for (const [id, v] of m.values) if (id !== nation && v > second) second = v;
      const ratio = p.total / Math.max(1, second);
      const R = VICTORY_RULES.learning; const missing: string[] = [];
      if (ratio < R.lead) missing.push('lead'); if (p.stages < R.stages) missing.push('stages'); if ((n?.era ?? 0) < R.era) missing.push('era'); if (!independent(n)) missing.push('independent');
      return { value: ratio, target: R.lead, unit: 'ratio', meets: !missing.length, missing, detail: { tech: p.tech, innovations: p.innovations, stages: p.stages, points: p.total, second, era: n?.era ?? 0 } };
    }
    case 'commerce': {
      const m: Measure = cache.com ??= commerceMeasure(s);
      const v = (m.values.get(nation) ?? 0) / Math.max(1e-9, m.total);
      const missing = []; if (v < VICTORY_RULES.commerce.share) missing.push('share'); if (!s.ranking.includes(nation)) missing.push('great_power'); if (!independent(n)) missing.push('independent');
      return { value: m.total > 0 ? v : 0, target: VICTORY_RULES.commerce.share, unit: 'share', meets: m.total > 0 && !missing.length, missing, detail: { income: n ? tradeIncome(n) : 0, world: m.total } };
    }
    case 'faith': {
      const fd: { byFaith: Map<number, number>; total: number } = cache.faith ??= faithDev(s, w);
      const f = n?.faith ?? -1; const v = (fd.byFaith.get(f) ?? 0) / Math.max(1, fd.total);
      const lead = (cache[`fl${f}`] ??= faithLeader(s, f)) as number;
      const missing = []; if (v < VICTORY_RULES.faith.share) missing.push('share'); if (lead !== nation) missing.push('leader'); if (!independent(n)) missing.push('independent');
      return { value: v, target: VICTORY_RULES.faith.share, unit: 'share', meets: !missing.length, missing, detail: { leader: lead } };
    }
  }
}

/** The realm closest to each condition (by its measured value). */
function bestFor(s: GameState, w: World, kind: VictoryKind, cache: Record<string, any>): { nation: number; value: number; meets: boolean } {
  let best = -1, bk = -Infinity, bv = 0, meets = false;
  const consider = (id: number) => {
    const c = victoryCheck(s, w, kind, id, cache);
    // a realm that meets the condition always comes before one that does not, and one that can meet it (a great
    // power, for commerce) before one that cannot
    const k = c.value + (c.meets ? 1e6 : 0) - (c.missing.includes('great_power') ? 1e3 : 0);
    if (k > bk) { bk = k; bv = c.value; best = id; meets = c.meets; }
  };
  if (kind === 'faith') {
    // only the leading realm of each faith can meet it
    const fd: { byFaith: Map<number, number> } = cache.faith ??= faithDev(s, w);
    for (const f of fd.byFaith.keys()) { const l = (cache[`fl${f}`] ??= faithLeader(s, f)) as number; if (l >= 0) consider(l); }
  } else if (kind === 'learning') {
    const m: Measure = cache.learn ??= learningMeasure(s);
    const top = [...m.values.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3);
    for (const [id] of top) consider(id);
  } else {
    const m: Measure = kind === 'hegemony' ? (cache.heg ??= hegemonyMeasure(s, w)) : kind === 'commerce' ? (cache.com ??= commerceMeasure(s)) : { values: new Map(s.nations.filter((n) => n.alive).map((n) => [n.id, n.score])), total: 0 };
    const top = [...m.values.entries()].filter(([id]) => independent(s.nations[id])).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3);
    for (const [id] of top) consider(id);
    // commerce is won only by a great power: a small trading realm with a large share is shown, but cannot hold it
    if (kind === 'commerce') for (const id of s.ranking) if (!top.some(([x]) => x === id) && independent(s.nations[id])) consider(id);
  }
  return { nation: best, value: bv, meets };
}

/** Rows for the victory panel: every chosen kind with our value, the leader and who holds it for how long. */
export function victoryStatus(s: GameState, w: World, nation: number): { kinds: VictoryKind[]; years: number; rows: VictoryRow[]; endYear: number; ended: boolean; victory?: GameState['victory'] } {
  const cache: Record<string, any> = {};
  const rows: VictoryRow[] = [];
  for (const kind of victoryKinds(s)) {
    const me = victoryCheck(s, w, kind, nation, cache);
    const best = bestFor(s, w, kind, cache);
    const hold = s.victoryHold?.[kind];
    rows.push({ kind, ...me, leader: best.nation, leaderValue: best.value, holder: hold ? hold.nation : -1, years: hold ? (s.day - hold.since) / 365.25 : 0 });
  }
  return { kinds: victoryKinds(s), years: VICTORY_YEARS, rows, endYear: 1815, ended: s.ended, victory: s.victory };
}

/** Names of the kinds of victory (the UI has its own copies in src/ui/i18n.ts). */
export const VICTORY_NAME: Record<VictoryKind, { en: string; de: string }> = {
  score: { en: 'Score', de: 'Wertung' },
  hegemony: { en: 'Hegemony', de: 'Vorherrschaft' },
  learning: { en: 'Learning', de: 'Gelehrsamkeit' },
  commerce: { en: 'Commerce', de: 'Handelsmacht' },
  faith: { en: 'Triumph of faith', de: 'Glaubenssieg' },
};

/** Yearly: who holds each chosen condition; a realm that has held one long enough wins. */
function victoryYear(s: GameState, w: World) {
  const kinds = victoryKinds(s).filter((k) => k !== 'score');
  if (!kinds.length || s.ended) return;
  const hold = (s.victoryHold ??= {});
  const cache: Record<string, any> = {};
  const year = dayToDate(s.day, s.startYear).y;
  for (const kind of kinds) {
    const cur = hold[kind];
    // the holder keeps its count for as long as it meets the condition, even when another realm that meets it too pulls ahead
    if (cur && s.nations[cur.nation]?.alive && victoryCheck(s, w, kind, cur.nation, cache).meets) {
      if ((s.day - cur.since) / 365.25 >= VICTORY_YEARS - 0.01) {
        const N = s.nations[cur.nation];
        s.ended = true; s.victory = { nation: cur.nation, kind, day: s.day };
        chronicle(s, cur.nation, 'victory', { en: `${N.short.en} won the game in ${year} (${VICTORY_NAME[kind].en}), after holding the condition for ${VICTORY_YEARS} years.`, de: `${N.short.de} gewann das Spiel im Jahr ${year} (${VICTORY_NAME[kind].de}), nachdem es die Bedingung ${VICTORY_YEARS} Jahre gehalten hatte.` }, N.capital >= 0 ? N.capital : undefined);
        return;
      }
      continue;
    }
    // the holder lost it (or nobody held it): the realm that meets it best starts a count of its own
    const best = bestFor(s, w, kind, cache);
    if (!best.meets) {
      if (cur) { delete hold[kind]; const N = s.nations[cur.nation]; for (const p of s.playerNations) notice(s, p, 'victory_lost', { en: `${N?.short.en} no longer meets the victory condition "${VICTORY_NAME[kind].en}".`, de: `${N?.short.de} erfüllt die Siegbedingung „${VICTORY_NAME[kind].de}“ nicht mehr.` }); }
      continue;
    }
    hold[kind] = { nation: best.nation, since: s.day };
    const N = s.nations[best.nation];
    for (const p of s.playerNations) notice(s, p, 'victory_watch', p === best.nation
      ? { en: `We meet the victory condition "${VICTORY_NAME[kind].en}". If we hold it for ${VICTORY_YEARS} years, we win.`, de: `Wir erfüllen die Siegbedingung „${VICTORY_NAME[kind].de}“. Halten wir sie ${VICTORY_YEARS} Jahre, gewinnen wir.` }
      : { en: `${N.short.en} meets the victory condition "${VICTORY_NAME[kind].en}". If it holds it for ${VICTORY_YEARS} years, it wins the game.`, de: `${N.short.de} erfüllt die Siegbedingung „${VICTORY_NAME[kind].de}“. Hält es sie ${VICTORY_YEARS} Jahre, gewinnt es das Spiel.` }, N.capital >= 0 ? { loc: N.capital } : {});
  }
}

export const victory: System = {
  id: 'victory',
  yearly({ s, w }) { victoryYear(s, w); },
};
