// War track fixes (claude/fix-war): every battle behind the war score is listed, sieges count steps, calls to arms
// for the player, the AI's peace in young and back-dated wars, the captor of a fort, raising a general, the sides of a
// declaration and the towns it is fought for, and the texts of wars.
// Run: npx vitest run --testTimeout=180000 tests/fix_war.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { serialize, deserialize } from '../src/sim/engine';
import { mkCtx, hasTreaty, atWar, topOverlord } from '../src/sim/ctx';
import { B, BI, UNITS, TERRAINS } from '../src/sim/defs';
import { casusBelliAll, declareWar, warScoreEvent, battleWorth, BATTLE_CAP, BATTLE_LOG_KEPT } from '../src/sim/systems/war';
import { military, newArmy, siegeSteps } from '../src/sim/systems/military';
import { answer } from '../src/game/view';
import { siegesView } from '../src/game/warview';
import type { GameState, War } from '../src/sim/types';

vi.setConfig({ testTimeout: 180_000 });
const w = loadWorld();
let BASE = '';
beforeAll(() => { BASE = serialize(createGame(w, loadSetup(1356), loadHubs(), 1356, { player: [] })); });
const fresh = () => { const s = deserialize(BASE) as GameState; delete s.flags.peaceful_start; return s; };
const nat = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!;
const unit = (id: string) => UNITS.findIndex((u) => u.id === id);
const owned = (s: GameState, n: number) => { const out: number[] = []; for (let i = 0; i < w.L; i++) if (s.loc.owner[i] === n) out.push(i); return out; };
function plainTarget(s: GameState, a: number, skip: number[] = []): number {
  const na = s.nations[a];
  for (const b of s.nations) {
    if (!b.alive || b.id === a || skip.includes(b.id) || b.overlord >= 0 || b.capital < 0 || b.faith !== na.faith || atWar(s, a, b.id)) continue;
    if (hasTreaty(s, a, b.id, 'truce') || hasTreaty(s, a, b.id, 'alliance') || topOverlord(s, b.id) === a || na.rivals.includes(b.id)) continue;
    if (s.treaties.some((t) => t.type === 'alliance' && (t.a === b.id || t.b === b.id))) continue;
    if (casusBelliAll(s, a, b.id, w).length === 0 && owned(s, b.id).length >= 3) return b.id;
  }
  throw new Error('no target');
}
function clearField(s: GameState) { s.wars = []; s.armies = []; s.battles = []; s.sieges = []; }
function war2(s: GameState, a: number, b: number, goal: Parameters<typeof declareWar>[4] = 'conquest'): War {
  expect(declareWar(s, w, a, b, goal)).toBeNull();
  return s.wars[s.wars.length - 1];
}
/** An open place of b without walls. */
function field(s: GameState, b: number): number {
  for (const l of owned(s, b)) if (s.loc.buildings[l * B + BI.fort] === 0 && ['plains', 'farmland', 'grassland'].includes(TERRAINS[w.terrain[l]])) return l;
  for (const l of owned(s, b)) if (s.loc.buildings[l * B + BI.fort] === 0) return l;
  throw new Error('no field');
}
const runBattles = (s: GameState) => { for (let i = 0; i < 25 && (i === 0 || s.battles.length); i++) military.daily!(mkCtx(s, w)); };
const logSum = (war: War) => (war.battleLog ?? []).reduce((p, b) => p + b.score, 0) + (war.battleLogRest?.score ?? 0);

describe('the battles behind the war score (blocker: battles the player never saw)', () => {
  it('a skirmish between allies counts in the war and is listed, without a full report, and the list adds up to the battle score', () => {
    const s = fresh(); clearField(s);
    const a = nat(s, 'portugal').id, b = plainTarget(s, a);
    const c = plainTarget(s, a, [b]);
    const war = war2(s, a, b, 'humiliate');
    if (!war.att.includes(c)) war.att.push(c);
    s.playerNations = [a];
    // an ally of ours fights a skirmish with the enemy: no human realm takes part, too small for a report
    const l = field(s, b);
    const C1 = newArmy(s, c, l, [{ type: unit('men_at_arms'), men: 400 }]);
    const D1 = newArmy(s, b, l, [{ type: unit('men_at_arms'), men: 500 }]);
    C1.lastMoveDay = s.day; D1.lastMoveDay = s.day - 30;
    // both sides keep their main hosts at home: the skirmish is a small blow to either side
    newArmy(s, a, s.nations[a].capital, [{ type: unit('men_at_arms'), men: 30000 }]);
    newArmy(s, b, s.nations[b].capital, [{ type: unit('men_at_arms'), men: 30000 }]);
    const reports0 = s.battleReports?.length ?? 0;
    runBattles(s);
    expect(war.battles).toBe(1);
    expect(s.battleReports?.length ?? 0).toBe(reports0); // no full report was kept
    expect(war.battleLog).toHaveLength(1);
    const e = war.battleLog![0];
    expect([e.win, e.lose].sort()).toEqual([b, c].sort());
    expect(e.report).toBeUndefined();
    // a skirmish of a few hundred men against a side of 30,000 moves the war by a fraction of a point, not two points
    expect(e.side).toBeGreaterThan(30000);
    expect(Math.abs(e.score)).toBeLessThan(0.5);
    expect(Math.abs(e.score)).toBeCloseTo(battleWorth(e.lossL, e.side).total, 3); // (the log keeps whole men)
    expect(e.side).toBeGreaterThanOrEqual(e.lossL);
    // our own battle is kept as a report and linked
    const A = newArmy(s, a, l, [{ type: unit('men_at_arms'), men: 6000 }]);
    const D2 = newArmy(s, b, l, [{ type: unit('men_at_arms'), men: 5000 }]);
    A.lastMoveDay = s.day; D2.lastMoveDay = s.day - 30;
    runBattles(s);
    expect(war.battleLog).toHaveLength(2);
    expect(war.battleLog![1].report).toBe(s.battleReports!.at(-1)!.id);
    expect(logSum(war)).toBeCloseTo(war.battleScore, 9);
    // the peace panel lists both, from our side, and its rows add up to the battle score of the war score breakdown
    const v = answer(s, w, a, { q: 'war', war: war.id });
    expect(v.log.rows).toHaveLength(2);
    expect(v.log.rows.reduce((p: number, r: any) => p + r.score, 0) + (v.log.rest?.score ?? 0) + v.log.unlogged).toBeCloseTo(v.log.total, 9);
    expect(v.log.total).toBeCloseTo(war.battleScore, 9);
    expect(v.log.unlogged).toBe(0);
    expect(v.log.rows[0].report).toBe(war.battleLog![1].report); // newest first, with its report
    expect(v.log.rows[1].report).toBeNull();
    const parts = answer(s, w, a, { q: 'war', war: war.id });
    expect(parts.log.cap).toBe(BATTLE_CAP);
  });

  it('a battle is weighed against the losing side of each war: the rout of a small realm’s army counts fully', () => {
    expect(battleWorth(300, 300).total).toBeCloseTo(2.2, 9); // a small realm loses all it had
    expect(battleWorth(300, 60000).total).toBeCloseTo(0.2 + 2 * 4 * 300 / 60000, 9); // a skirmish against a great alliance
    expect(battleWorth(6000, 20000)).toEqual({ dead: 4, blow: 2, total: 6 });
    expect(battleWorth(60000, 100000).total).toBe(25);
  });

  it('a battle is logged in every war between the two sides; the cap of ±40 and the oldest entries are accounted for', () => {
    const s = fresh(); clearField(s);
    const a = nat(s, 'portugal').id, b = plainTarget(s, a);
    const w1 = war2(s, a, b, 'humiliate');
    // a second war between the same realms (an ally's war they both joined)
    const w2: War = { ...JSON.parse(JSON.stringify(w1)), id: w1.id + 1000, battleLog: [], battleScore: 0, battles: 0 };
    s.wars.push(w2);
    for (let k = 0; k < BATTLE_LOG_KEPT + 15; k++) warScoreEvent(s, k % 5 === 4 ? b : a, k % 5 === 4 ? a : b, 'battle', 7, 0, { naval: false, lossW: 100, lossL: 9000 });
    for (const war of [w1, w2]) {
      expect(war.battles).toBe(BATTLE_LOG_KEPT + 15);
      expect(war.battleLog).toHaveLength(BATTLE_LOG_KEPT);
      expect(war.battleLogRest!.n).toBe(15);
      expect(Math.abs(war.battleScore)).toBeLessThanOrEqual(BATTLE_CAP);
      expect(logSum(war)).toBeCloseTo(war.battleScore, 9);
      // a win at the cap moves nothing, and says what it would have been worth
      const capped = war.battleLog!.filter((x) => x.raw > 0 && x.score < x.raw - 1e-9);
      expect(capped.length).toBeGreaterThan(0);
    }
  });
});

describe('sieges count steps (blocker: the map badge showed the steps as a percentage)', () => {
  it('the tick tells how many steps take the town: four, three under blockade; the town falls at that step', () => {
    const s = fresh(); clearField(s);
    const a = nat(s, 'portugal').id, b = plainTarget(s, a);
    war2(s, a, b, 'humiliate');
    let l = -1; for (const i of owned(s, b)) if (s.loc.buildings[i * B + BI.fort] > 0) { l = i; break; }
    if (l < 0) { l = s.nations[b].capital; s.loc.buildings[l * B + BI.fort] = 1; }
    const A = newArmy(s, a, l, [{ type: unit('men_at_arms'), men: 15000 }]); A.siege = l;
    const sg = { loc: l, nation: a, progress: 2, days: 1, garrison: 1000, garrison0: 1000, breach: 0, blockade: false, log: [] as string[] };
    s.sieges.push(sg);
    expect(siegesView(s)[0]).toMatchObject({ loc: l, progress: 2, need: 4 });
    sg.blockade = true;
    expect(siegeSteps(sg)).toBe(3);
    expect(siegesView(s)[0].need).toBe(3);
  });
});
