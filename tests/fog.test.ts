// Fog of war (spec point 104, src/game/fog.ts): a realm sees armies only on and next to its own and its friends' land,
// around its own hosts and where its spies are; unknown land carries no owners; queries reveal nothing more.
import { describe, it, expect, vi } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { advanceDay } from '../src/sim/engine';
import { armyLites, answer } from '../src/game/view';
import { sightOf, fogArmies, fogBattles, fogSieges, fogOwners, fogAnswer, fogActive, armyVisible, friendsOf, ARMY_SIGHT } from '../src/game/fog';
import { newArmy } from '../src/sim/systems/military';
import type { GameState } from '../src/sim/types';

vi.setConfig({ testTimeout: 120_000 });
const w = loadWorld();
const nid = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!.id;

describe('fog of war', () => {
  const s = createGame(w, loadSetup(1356), loadHubs(), 777, { player: [] });
  const P = nid(s, 'portugal');
  s.playerNations = [P];
  for (let i = 0; i < 20; i++) advanceDay(s, w);

  it('never shows a foreign army out of sight, and shows those in sight', () => {
    const sight = sightOf(s, w, P);
    const all = armyLites(s, w); const seen = fogArmies(all, sight);
    const friends = friendsOf(s, P);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.length).toBeLessThan(all.length);
    for (const a of seen) expect(friends.has(a.owner) || sight.see[a.loc] === 1).toBe(true);
    for (const a of all) if (!friends.has(a.owner) && sight.see[a.loc] !== 1) expect(seen.some((x) => x.id === a.id)).toBe(false);
    // far away hosts (Muscovy's) are hidden from Portugal
    const far = all.filter((a) => s.nations[a.owner]?.key === 'moscow');
    expect(far.length).toBeGreaterThan(0);
    for (const a of far) expect(seen.some((x) => x.id === a.id)).toBe(false);
  });

  it('shows a foreign host next to our land but not where it marches', () => {
    const cap = s.nations[P].capital;
    const friends = friendsOf(s, P);
    const cas = s.nations.find((n) => n.alive && !friends.has(n.id))!.id;
    const next = [...w.neighbours(cap)].find((j) => j < w.L && s.loc.owner[j] === P) ?? cap;
    const a = newArmy(s, cas, next, [{ type: 0, men: 1000 }]);
    a.path = [cap, next, cap];
    const sight = sightOf(s, w, P);
    const lite = fogArmies(armyLites(s, w), sight).find((x) => x.id === a.id)!;
    expect(lite).toBeTruthy();
    expect(lite.path.length).toBeLessThanOrEqual(1);
    s.armies = s.armies.filter((x) => x !== a);
  });

  it('our hosts see two steps around them, also abroad', () => {
    const far = s.nations[nid(s, 'hungary')].capital;
    const a = newArmy(s, P, far, [{ type: 0, men: 1000 }]);
    const sight = sightOf(s, w, P);
    expect(sight.see[far]).toBe(1);
    for (const j of w.neighbours(far)) expect(sight.see[j]).toBe(1);
    expect(ARMY_SIGHT).toBe(2);
    // a Hungarian host standing there is seen now
    const h = newArmy(s, nid(s, 'hungary'), far, [{ type: 0, men: 500 }]);
    expect(armyVisible(sightOf(s, w, P), { owner: h.owner, loc: h.loc })).toBe(true);
    s.armies = s.armies.filter((x) => x !== a && x !== h);
    expect(armyVisible(sightOf(s, w, P), { owner: h.owner, loc: h.loc })).toBe(false);
  });

  it('battles and sieges out of sight are hidden', () => {
    const sight = sightOf(s, w, P);
    const farLoc = s.nations[nid(s, 'moscow')].capital;
    expect(fogBattles([{ id: 1, loc: farLoc, att: nid(s, 'moscow'), def: nid(s, 'lithuania'), lossA: 0, lossD: 0, startA: 1, startD: 1, phase: 0 }], sight)).toHaveLength(0);
    expect(fogSieges(s, [{ loc: farLoc, nation: nid(s, 'lithuania'), progress: 0, garrison: 1 }], sight)).toHaveLength(0);
    const cap = s.nations[P].capital;
    expect(fogSieges(s, [{ loc: cap, nation: nid(s, 'granada'), progress: 0, garrison: 1 }], sight)).toHaveLength(1);
  });

  it('unknown land has no owner, and queries tell nothing about it', () => {
    const sight = sightOf(s, w, P);
    expect(sight.known).not.toBeNull();
    const unknown = Array.from({ length: w.L }, (_, i) => i).find((i) => !sight.known![i] && s.loc.owner[i] >= 0)!;
    expect(unknown).toBeGreaterThanOrEqual(0);
    const f = fogOwners(s.loc.owner, s.loc.ctrl, sight.known);
    expect(f.owner[unknown]).toBe(-1);
    expect(f.owner[s.nations[P].capital]).toBe(P);
    const q = { q: 'loc' as const, loc: unknown };
    expect(fogAnswer(s, w, P, q, answer(s, w, P, q)).unknown).toBe(true);
    // the path of another realm's host is not answered
    const other = s.armies.find((a) => a.owner !== P)!;
    const pq = { q: 'path' as const, army: other.id, to: s.nations[P].capital };
    expect(fogAnswer(s, w, P, pq, { path: [1], days: 1 })).toBeNull();
    // the observer and "reveal all" see everything
    expect(fogActive(s, null)).toBe(false);
    s.flags.revealAll = 1; expect(fogActive(s, P)).toBe(false); delete s.flags.revealAll;
  });
});
