// End of the game (spec points 84, 85): each kind of victory detects its condition, a condition held for the full term
// ends the game, the history the end screen draws is sampled the same way in two runs of the same seed, and the
// chronicle export holds the entries.
import { describe, it, expect, vi } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { advanceDay } from '../src/sim/engine';
import { victoryCheck, victoryStatus, victory, hegemonyMeasure, europeMask, faithLeader, VICTORY_YEARS, VICTORY_RULES } from '../src/sim/systems/victory';
import { LANDMARKS } from '../src/sim/content/landmarks';
import { historyView } from '../src/game/endview';
import { chronicleMarkdown, chronicleJson, exportName } from '../src/ui/chronexport';
import type { GameState } from '../src/sim/types';

vi.setConfig({ testTimeout: 300_000 });
const w = loadWorld();
const fresh = (seed = 5) => createGame(w, loadSetup(1356), loadHubs(), seed, { player: [] });
const nid = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!.id;
const yearly = (s: GameState) => victory.yearly!({ s, w } as any);

/** Hands Europe's land to `to` until it holds `share` of Europe's development. */
function grow(s: GameState, to: number, share: number) {
  const eu = europeMask(w);
  for (let i = 0; i < w.L; i++) {
    const m = hegemonyMeasure(s, w); if ((m.values.get(to) ?? 0) / m.total >= share) return;
    if (eu[i] && s.loc.owner[i] >= 0 && s.loc.owner[i] !== to) s.loc.owner[i] = to;
  }
}

describe('victory conditions', () => {
  it('score: the realm with the highest score meets it, another does not', () => {
    const s = fresh(); const top = [...s.nations].filter((n) => n.alive).sort((a, b) => b.score - a.score);
    expect(victoryCheck(s, w, 'score', top[0].id).meets).toBe(true);
    expect(victoryCheck(s, w, 'score', top[1].id).meets).toBe(false);
  });

  it('hegemony: a quarter of Europe\'s development, subjects counted', () => {
    const s = fresh(); const F = nid(s, 'france');
    const before = victoryCheck(s, w, 'hegemony', F);
    expect(before.meets).toBe(false); expect(before.missing).toContain('share');
    expect(before.value).toBeGreaterThan(0.05); expect(before.value).toBeLessThan(VICTORY_RULES.hegemony.share);
    grow(s, F, VICTORY_RULES.hegemony.share + 0.01);
    const after = victoryCheck(s, w, 'hegemony', F);
    expect(after.value).toBeGreaterThanOrEqual(VICTORY_RULES.hegemony.share); expect(after.meets).toBe(true);
    // a subject that holds it does not win itself; its overlord counts the land
    const sub = s.nations.find((n) => n.alive && n.overlord < 0 && n.id !== F && n.subjectType !== 'tributary')!;
    sub.overlord = F; sub.subjectType = 'vassal' as any;
    expect(victoryCheck(s, w, 'hegemony', sub.id).missing).toContain('independent');
  });

  it('learning: a clear lead in learning points, landmark stages raised since the start, the era', () => {
    const s = fresh(); const V = nid(s, 'venice'); const n = s.nations[V];
    const c0 = victoryCheck(s, w, 'learning', V);
    expect(c0.meets).toBe(false); expect(c0.missing).toEqual(expect.arrayContaining(['stages', 'era']));
    // landmarks standing in 1356 do not count: raise three of them two stages each, in Venice's hands
    let raised = 0;
    for (const x of s.landmarks ?? []) {
      const d = LANDMARKS.find((l) => l.id === x.id)!; if (d.max - d.built < 2 || raised >= 3) continue;
      s.loc.owner[x.loc] = V; x.tier = d.built + 2; raised++;
    }
    expect(raised).toBe(3);
    n.era = VICTORY_RULES.learning.era; n.tech = n.tech.map((v) => v + 20) as typeof n.tech;
    const c1 = victoryCheck(s, w, 'learning', V);
    expect(c1.detail!.stages).toBe(6);
    expect(c1.value).toBeGreaterThanOrEqual(VICTORY_RULES.learning.lead);
    expect(c1.meets).toBe(true);
  });

  it('commerce: a fifth of the world\'s trade profits, only as a great power', () => {
    const s = fresh();
    const gp = s.ranking[0]; const small = s.nations.find((n) => n.alive && n.overlord < 0 && !s.ranking.includes(n.id))!;
    expect(victoryCheck(s, w, 'commerce', gp).meets).toBe(false);
    const world = s.nations.filter((n) => n.alive).reduce((p, n) => p + Math.max(0, (n.income.trade ?? 0) + (n.income.tariffs ?? 0) + (n.income.company ?? 0)), 0);
    s.nations[gp].income.trade = (s.nations[gp].income.trade ?? 0) + world + 10;
    const c = victoryCheck(s, w, 'commerce', gp);
    expect(c.value).toBeGreaterThanOrEqual(VICTORY_RULES.commerce.share); expect(c.meets).toBe(true);
    small.income.trade = (small.income.trade ?? 0) + world * 3;
    const cs = victoryCheck(s, w, 'commerce', small.id);
    expect(cs.value).toBeGreaterThanOrEqual(VICTORY_RULES.commerce.share);
    expect(cs.meets).toBe(false); expect(cs.missing).toContain('great_power');
  });

  it('faith: four fifths of Europe follow the faith, and only its leading realm wins', () => {
    const s = fresh(); const F = nid(s, 'france'); const faith = s.nations[F].faith;
    expect(victoryCheck(s, w, 'faith', F).meets).toBe(false);
    const eu = europeMask(w); for (let i = 0; i < w.L; i++) if (eu[i]) s.loc.faith[i] = faith;
    const lead = faithLeader(s, faith);
    expect(victoryCheck(s, w, 'faith', lead).meets).toBe(true);
    const other = s.nations.find((n) => n.alive && n.overlord < 0 && n.faith === faith && n.id !== lead)!;
    const co = victoryCheck(s, w, 'faith', other.id);
    expect(co.value).toBeGreaterThanOrEqual(VICTORY_RULES.faith.share); expect(co.missing).toEqual(['leader']);
  });

  it('a condition held for the full term ends the game; losing it resets the count', () => {
    const s = fresh(); s.victoryKinds = ['score', 'hegemony']; const F = nid(s, 'france');
    s.playerNations = [F];
    grow(s, F, VICTORY_RULES.hegemony.share + 0.01);
    yearly(s);
    expect(s.victoryHold!.hegemony).toEqual({ nation: F, since: s.day });
    expect(s.notices.some((x) => x.kind === 'victory_watch' && x.nation === F)).toBe(true);
    for (let y = 1; y < VICTORY_YEARS; y++) { s.day += 365; yearly(s); expect(s.ended).toBe(false); }
    const status = victoryStatus(s, w, F).rows.find((r) => r.kind === 'hegemony')!;
    expect(status.holder).toBe(F); expect(status.years).toBeGreaterThan(VICTORY_YEARS - 1.1);
    s.day += 366; yearly(s);
    expect(s.ended).toBe(true);
    expect(s.victory).toMatchObject({ nation: F, kind: 'hegemony' });
    expect(s.chronicle.some((e) => e.kind === 'victory' && e.nation === F)).toBe(true);

    // a second game: the hold is lost after a few years and has to start again
    const t = fresh(); t.victoryKinds = ['score', 'hegemony']; const owners = t.loc.owner.slice(); grow(t, F, VICTORY_RULES.hegemony.share + 0.01);
    yearly(t); t.day += 365; yearly(t);
    expect(t.victoryHold!.hegemony?.nation).toBe(F);
    t.loc.owner.set(owners); // the land goes back to its old lords
    t.day += 365; yearly(t);
    expect(t.victoryHold!.hegemony).toBeUndefined(); expect(t.ended).toBe(false);
  });

  it('the score alone never ends the game early', () => {
    const s = fresh(); expect(s.victoryKinds).toEqual(['score']);
    for (let y = 0; y < 12; y++) { s.day += 365; yearly(s); }
    expect(s.ended).toBe(false); expect(s.victoryHold).toEqual({});
  });
});

describe('history of the game', () => {
  it('is sampled the same way in two runs of the same seed, one point a year', () => {
    const run = () => { const s = fresh(42); for (let d = 0; d < 430; d++) advanceDay(s, w); return s; };
    const a = run(), b = run();
    const F = nid(a, 'france');
    expect(JSON.stringify(a.nations.map((n) => n.history))).toBe(JSON.stringify(b.nations.map((n) => n.history)));
    const h = a.nations[F].history;
    expect(h.length).toBeGreaterThanOrEqual(4);
    expect(h.every((x) => typeof x.army === 'number' && typeof x.score === 'number')).toBe(true);
    expect(h.some((x) => (x.army ?? 0) > 0)).toBe(true);
    const v = historyView(a, F);
    expect(v).toEqual(historyView(b, F));
    expect(v.series[0].id).toBe(F); expect(v.series[0].player).toBe(true);
    const years = v.series[0].points.map((p) => p.y);
    expect(years).toEqual([1356, 1357]); // one sample per calendar year
    expect(new Set(v.series.map((x) => x.id)).size).toBe(v.series.length);
  });
});

describe('chronicle export', () => {
  const s = fresh(); const P = nid(s, 'portugal'), C = nid(s, 'castile');
  s.chronicle.push(
    { day: 10, nation: P, kind: 'war', text: { en: 'Portugal took up arms against *Castile*.', de: 'Portugal griff gegen *Kastilien* zu den Waffen.' }, loc: 5 },
    { day: 400, nation: C, kind: 'peace', text: { en: 'Castile made peace.', de: 'Kastilien schloss Frieden.' } },
  );
  const base = { entries: s.chronicle, startYear: 1356, endDay: 420, player: P, nations: s.nations.map((n) => ({ id: n.id, name: n.name, short: n.short })) };

  it('Markdown in the chosen language, a section per year, every entry', () => {
    const de = chronicleMarkdown({ ...base, lang: 'de' });
    expect(de).toContain('# Chronik: ');
    expect(de).toContain('## 1356'); expect(de).toContain('## 1357');
    expect(de).toContain('Portugal griff gegen \\*Kastilien\\* zu den Waffen.');
    expect(de).toContain('Kastilien schloss Frieden.');
    expect(de).toContain('11. Januar 1356, Krieg: ');
    expect(de).not.toContain('Castile made peace');
    const en = chronicleMarkdown({ ...base, lang: 'en', own: true, ending: 'The age has run its course.' });
    expect(en).toContain('# Chronicle of '); expect(en).toContain('took up arms'); expect(en).not.toContain('Castile made peace');
    expect(en).toContain('**The age has run its course.**');
    expect(exportName({ ...base, lang: 'de' }, 'md')).toMatch(/^chronik-portugal-1356-1357\.md$/);
  });

  it('JSON with both languages, the day and the realm', () => {
    const j = JSON.parse(chronicleJson({ ...base, lang: 'en' }));
    expect(j.entries).toHaveLength(s.chronicle.length);
    const war = j.entries.find((e: any) => e.kind === 'war' && e.nation === P);
    expect(war.text.de).toContain('Kastilien'); expect(war.date.de).toBe('11. Januar 1356'); expect(war.loc).toBe(5);
    expect(j.nations[P].short.en).toBe('Portugal');
  });
});
