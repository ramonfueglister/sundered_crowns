// Council appointments (validation, Authority cost, candidates at court), bilingual army names (old saves with plain strings
// still load), the extra view fields the panels use, and determinism of all of it across save/load.
import { describe, it, expect } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { advanceDay, serialize, deserialize, hashState } from '../src/sim/engine';
import { applyCommand } from '../src/sim/commands';
import { officeCandidates, OFFICES, OFFICE_COST } from '../src/sim/systems/politics';
import { armyName, armyNameText, mercenaryCost } from '../src/sim/systems/military';
import { computeScore, scoreParts } from '../src/sim/systems/war';
import { answer, armyLites, playerView, warsView } from '../src/game/view';
import type { GameState } from '../src/sim/types';

const w = loadWorld();
const setup = loadSetup(1356), hubs = loadHubs();
const newGame = (player: number[]) => createGame(w, setup, hubs, 777, { player });
const days = (s: GameState, n: number) => { for (let i = 0; i < n; i++) advanceDay(s, w); };

describe('council appointments', () => {
  const s = newGame([]);
  const pid = s.nations.find((n) => n.key === 'portugal')!.id;
  s.playerNations = [pid];
  const n = s.nations[pid];

  it('has candidates at court from the start', () => {
    expect(officeCandidates(s, n).length).toBeGreaterThanOrEqual(3);
  });

  it('validates and appoints', () => {
    const cand = officeCandidates(s, n)[0];
    expect(applyCommand(s, w, { t: 'office', n: pid, office: 'nonsense', char: cand.id })).toEqual({ ok: false, err: 'unknown office' });
    expect(applyCommand(s, w, { t: 'office', n: pid, office: 'treasurer', char: n.ruler })).toEqual({ ok: false, err: 'the ruler cannot hold an office' });
    expect(applyCommand(s, w, { t: 'office', n: pid, office: 'treasurer', char: 999999 })).toEqual({ ok: false, err: 'no such person' });
    n.authority = OFFICE_COST - 1;
    expect(applyCommand(s, w, { t: 'office', n: pid, office: 'treasurer', char: cand.id })).toEqual({ ok: false, err: 'not enough Authority' });
    n.authority = 100;
    const prev = n.council.treasurer;
    expect(applyCommand(s, w, { t: 'office', n: pid, office: 'treasurer', char: cand.id }).ok).toBe(true);
    expect(n.council.treasurer).toBe(cand.id);
    expect(n.authority).toBe(100 - OFFICE_COST);
    expect(applyCommand(s, w, { t: 'office', n: pid, office: 'treasurer', char: cand.id })).toEqual({ ok: false, err: 'already holds this office' });
    // the dismissed treasurer waits at court; the appointed one is no longer a candidate
    const ids = officeCandidates(s, n).map((c) => c.id);
    expect(ids).not.toContain(cand.id);
    if (prev && s.chars[prev]?.alive) expect(ids).toContain(prev);
    // moving an official to another office vacates the first one
    expect(applyCommand(s, w, { t: 'office', n: pid, office: 'chancellor', char: cand.id }).ok).toBe(true);
    expect(n.council.chancellor).toBe(cand.id);
    expect(n.council.treasurer).toBeUndefined();
  });

  it('shows council, candidates and bonuses in the realm view', () => {
    const r = answer(s, w, pid, { q: 'realm' });
    expect(r.council.length).toBe(OFFICES.length);
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(typeof r.candidates[0].bonus.treasurer).toBe('number');
    expect(r.officeCost).toBe(OFFICE_COST);
  });
});

describe('army names', () => {
  it('are bilingual and German is inflected', () => {
    const s = newGame([]);
    const por = s.nations.find((n) => n.key === 'portugal')!;
    expect(armyName(por, false)).toEqual({ en: `${por.adj.en} host`, de: 'Portugiesisches Heer' });
    expect(armyName(por, true).de).toBe('Portugiesische Flotte');
    const a = s.armies.find((x) => x.owner === por.id && !x.fleet)!;
    expect(armyNameText(a, 'de')).toBe('Portugiesisches Heer');
  });

  it('accept plain strings from older saves', () => {
    const s = newGame([]);
    s.armies[0].name = 'Old host';
    const s2 = deserialize(serialize(s));
    expect(armyNameText(s2.armies[0], 'de')).toBe('Old host');
    expect(armyLites(s2, w)[0].name).toBe('Old host');
    days(s2, 3);
  });
});

describe('view fields for the panels', () => {
  it('has home market, merchants, mercenary prices, army names, war score parts, justifications and liberty desire', () => {
    const s = newGame([]);
    const pid = s.nations.find((n) => n.key === 'castile')?.id ?? s.nations.find((n) => n.alive && n.capital >= 0)!.id;
    s.playerNations = [pid];
    const n = s.nations[pid];
    const pv = playerView(s, n);
    expect(pv.homeMarket).toBe(s.loc.market[n.capital]);
    expect(pv.merchants.cap).toBeGreaterThanOrEqual(2);
    const loc = answer(s, w, pid, { q: 'loc', loc: n.capital });
    expect(loc.mercenaries.length).toBeGreaterThan(0);
    expect(loc.mercenaries[0].total).toBeCloseTo(mercenaryCost(s, n, loc.mercenaries[0].men), 9);
    expect(loc.mercenaries[0].total).toBeCloseTo(loc.mercenaries[0].base * loc.mercenaries[0].priceLevel * (1 + loc.mercenaries[0].modifier), 9);
    if (loc.armies.length) expect(loc.armies[0].name).toBeTruthy();
    // a rival gives a justification
    const other = s.nations.find((x) => x.alive && x.id !== pid && x.capital >= 0 && !n.rivals.includes(x.id))!;
    n.rivals.push(other.id);
    const nd = answer(s, w, pid, { q: 'nation', nation: other.id });
    expect(nd.rel.cb).toContain('rivalry');
    // war score parts add up to the score
    for (const war of s.wars) { const p = scoreParts(s, war); expect(Math.max(-100, Math.min(100, p.battles + p.occupation + p.capital + p.ticking))).toBe(computeScore(s, war)); }
    for (const wv of warsView(s)) expect(wv.parts).toBeTruthy();
    // subjects report their liberty desire
    const sub = s.nations.find((x) => x.alive && x.overlord >= 0);
    if (sub) { const sd = answer(s, w, sub.overlord, { q: 'nation', nation: sub.id }); expect(sd.subject.libertyDesire).toBe(sub.libertyDesire); expect(sd.subject.parts.length).toBeGreaterThan(0); }
  });
});

describe('determinism', () => {
  it('same seed and commands give the same hash, also after save/load', () => {
    const run = (reload: boolean) => {
      let s = newGame([]);
      const pid = s.nations.find((n) => n.key === 'portugal')!.id;
      s.playerNations = [pid];
      days(s, 40);
      if (reload) s = deserialize(serialize(s));
      const c = officeCandidates(s, s.nations[pid])[0];
      s.nations[pid].authority = 100;
      expect(applyCommand(s, w, { t: 'office', n: pid, office: 'marshal', char: c.id }).ok).toBe(true);
      days(s, 40);
      return hashState(s);
    };
    const a = run(false), b = run(false), c = run(true);
    expect(a).toBe(b);
    expect(c).toBe(a);
  }, 180_000);
});
