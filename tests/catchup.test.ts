// Catch-up for returning online players (spec point 106): events of an absent ruler wait a short deadline and are then
// decided by the court and listed; the summary on return holds the days away, treasury, land won and lost, wars,
// battles, decided events and world news.
import { describe, it, expect, vi } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { advanceDay } from '../src/sim/engine';
import { declareWar } from '../src/sim/systems/war';
import { fireEvent, AWAY_EVENT_DAYS } from '../src/sim/systems/events';
import { EVENTS } from '../src/sim/content/events';
import { chronicle } from '../src/sim/ctx';
import { awayMark, catchUpSummary } from '../src/online/catchup';
import type { GameState } from '../src/sim/types';

vi.setConfig({ testTimeout: 120_000 });
const w = loadWorld();
const nid = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!.id;

describe('catch-up summary', () => {
  const s = createGame(w, loadSetup(1356), loadHubs(), 99, { player: [] });
  const P = nid(s, 'portugal'), C = nid(s, 'granada');
  // an online player who has left: the realm has a ruler (playerId) but is not among the playing realms
  s.nations[P].playerId = 'dev-tester'; s.flags[`offline_${P}`] = 1;
  for (let i = 0; i < 3; i++) advanceDay(s, w);
  const mark = awayMark(s, w, P, 1_000);

  it('decides an absent ruler\'s event after the deadline and lists it', () => {
    const ev = EVENTS.find((d) => d.options.length >= 2 && !d.setup)!;
    expect(fireEvent(s, w, s.nations[P], ev, {})).toBe(true);
    const p = s.pending.find((x) => x.nation === P && x.event === ev.id)!;
    expect(p).toBeTruthy();
    expect(p.expires - s.day).toBe(AWAY_EVENT_DAYS);
    for (let i = 0; i < AWAY_EVENT_DAYS + 35 && s.pending.some((x) => x.id === p.id); i++) advanceDay(s, w);
    expect(s.pending.some((x) => x.id === p.id)).toBe(false);
    const rec = (s.autoEvents ?? []).find((x) => x.nation === P && x.event === ev.id)!;
    expect(rec).toBeTruthy();
    expect(rec.option.en.length).toBeGreaterThan(0);
    expect(rec.option.de.length).toBeGreaterThan(0);
  });

  it('sums up land, treasury, wars, events and news', () => {
    // land won and lost
    const won = Array.from({ length: w.L }, (_, i) => i).find((i) => s.loc.owner[i] === C)!;
    const lostLoc = mark.locs.find((l) => l !== s.nations[P].capital)!;
    s.loc.owner[won] = P; s.loc.ctrl[won] = P; s.loc.owner[lostLoc] = C; s.loc.ctrl[lostLoc] = C;
    s.nations[P].treasury = mark.treasury + 250;
    s.nations[P].stats.battlesWon = mark.battlesWon + 2;
    expect(declareWar(s, w, C, P, 'conquest')).toBeNull();
    chronicle(s, nid(s, 'hungary'), 'great_power', { en: 'Hungary rose among the great powers.', de: 'Ungarn stieg zur Großmacht auf.' });
    const c = catchUpSummary(s, w, P, mark, 1_000 + 3_600_000);
    expect(c.daysAway).toBe(s.day - mark.day);
    expect(c.daysAway).toBeGreaterThan(AWAY_EVENT_DAYS);
    expect(c.msAway).toBe(3_600_000);
    expect(c.gained).toContain(won);
    expect(c.lost).toContain(lostLoc);
    expect(c.treasury.to - c.treasury.from).toBeCloseTo(250, 5);
    expect(c.battles.won).toBe(2);
    expect(c.warsStarted.some((x) => x.enemies.includes(C) && !x.attacker)).toBe(true);
    expect(c.events.length).toBeGreaterThan(0);
    expect(c.news.some((e) => e.kind === 'great_power')).toBe(true);
    // the war declared on us is about us, not world news
    expect(c.ours.some((e) => e.kind === 'war')).toBe(true);
    expect(c.news.some((e) => e.kind === 'war' && e.nation === C)).toBe(false);
  });
});
