// War track fixes (claude/fix-war): every battle behind the war score is listed, sieges count steps, calls to arms
// for the player, the AI's peace in young and back-dated wars, the captor of a fort, raising a general, the sides of a
// declaration and the towns it is fought for, and the texts of wars.
// Run: npx vitest run --testTimeout=180000 tests/fix_war.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { serialize, deserialize } from '../src/sim/engine';
import { mkCtx, hasTreaty, atWar, topOverlord, rel } from '../src/sim/ctx';
import { B, BI, UNITS, TERRAINS } from '../src/sim/defs';
import { casusBelliAll, declareWar, warScoreEvent, battleWorth, BATTLE_CAP, BATTLE_LOG_KEPT, evaluatePeace, warYears, computeScore,
  CALL_ANSWERED, CALL_REFUSED, EMPEROR_JOIN_ATTACK, TIE_BROKEN, callLapsed, predictSides, goalTowns, cedeWorth, CEDE_FIXED, nationDev, termCost, declareRefusal, scoreCaps, applyPeace, war as warSystem } from '../src/sim/systems/war';
import { answerEvent } from '../src/sim/systems/events';
import { considerPeace } from '../src/sim/systems/ai';
import { step } from '../src/sim/engine';
import { military, newArmy, siegeSteps, siegeCaptor, besiegersOf } from '../src/sim/systems/military';
import { answer, pendingView } from '../src/game/view';
import { siegesView } from '../src/game/warview';
import { applyCommand } from '../src/sim/commands';
import { commanderSkill, generalCost } from '../src/sim/systems/commanders';
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

describe('the captor of a fort (major: the town fell to the first army in the list)', () => {
  function siegeOf(s: GameState) {
    const a = nat(s, 'portugal').id, b = plainTarget(s, a), c = plainTarget(s, a, [b]);
    const war = war2(s, a, b, 'humiliate'); if (!war.att.includes(c)) war.att.push(c);
    let l = -1; for (const i of owned(s, b)) if (s.loc.buildings[i * B + BI.fort] > 0 && !w.coastal[i]) { l = i; break; }
    if (l < 0) { l = owned(s, b).find((i) => !w.coastal[i])!; s.loc.buildings[l * B + BI.fort] = 1; }
    return { a, b, c, l };
  }
  it('the realm leading the siege takes the town, though an ally’s army comes first in the list', () => {
    const s = fresh(); clearField(s);
    const { a, c, l } = siegeOf(s);
    const ally = newArmy(s, c, l, [{ type: unit('men_at_arms'), men: 800 }]); ally.siege = l; // first in s.armies
    const lead = newArmy(s, a, l, [{ type: unit('men_at_arms'), men: 12000 }]); lead.siege = l;
    // five steps made (a resupply from the sea could take one back), the monthly roll is due tomorrow
    s.sieges.push({ loc: l, nation: a, progress: 5, days: 29, garrison: 300, garrison0: 1000, breach: 0, blockade: false, log: [] });
    expect(s.armies.indexOf(ally)).toBeLessThan(s.armies.indexOf(lead));
    military.daily!(mkCtx(s, w));
    expect(s.loc.ctrl[l]).toBe(a);
  });
  it('without the leader before the walls, the realm with the most men there takes it', () => {
    const s = fresh(); clearField(s);
    const { a, c, l } = siegeOf(s);
    const small = newArmy(s, a, l, [{ type: unit('men_at_arms'), men: 500 }]); small.siege = l;
    const big = newArmy(s, c, l, [{ type: unit('men_at_arms'), men: 3000 }]); big.siege = l;
    const sg = { loc: l, nation: -5, progress: 0, days: 1, garrison: 300, garrison0: 1000, breach: 0, blockade: false, log: [] as string[] };
    s.sieges.push(sg);
    expect(siegeCaptor(sg, besiegersOf(s, sg)).owner).toBe(c);
    sg.nation = a;
    expect(siegeCaptor(sg, besiegersOf(s, sg)).owner).toBe(a);
  });
});

describe('raising a general (major: it put a worse general in command)', () => {
  it('the new captain joins the generals and takes command only when he is abler than the commander', () => {
    const s = fresh(); clearField(s);
    const n = nat(s, 'france'); s.playerNations = [n.id];
    const A = newArmy(s, n.id, n.capital, [{ type: unit('men_at_arms'), men: 5000 }]);
    expect(applyCommand(s, w, { t: 'general', n: n.id, army: A.id, char: 0 }).ok).toBe(true);
    const cur = s.chars[A.general]; cur.skills[2] = 6; cur.traits = [];
    n.treasury = 1e6;
    const t0 = n.treasury, cost = generalCost(s, n);
    const r = applyCommand(s, w, { t: 'general', n: n.id, army: A.id, char: -1 });
    expect(r.ok).toBe(true);
    expect(n.treasury).toBeCloseTo(t0 - cost, 6);
    expect(A.general).toBe(cur.id); // the abler commander keeps command
    const g = s.chars[r.done!];
    expect(n.generals).toContain(g.id);
    expect(commanderSkill(g)).toBeLessThanOrEqual(6);
    expect(r.msg!.de).toContain('behält den Befehl');
    // a weak commander gives way to the new captain
    cur.skills[2] = 0;
    const r2 = applyCommand(s, w, { t: 'general', n: n.id, army: A.id, char: -1 });
    expect(A.general).toBe(r2.done);
    expect(r2.msg!.de).toContain('übernimmt den Befehl');
  });
});

describe('the AI’s peace in young and back-dated wars (major: a white peace in the Hundred Years’ War on day 1)', () => {
  const sumRows = (ev: { reasons: [string, number][] }, white: boolean) => ev.reasons.filter(([k]) => k !== 'not_enough_war_score').reduce((p, r) => p + r[1], 0) + (white ? 5 : 0);
  it('a war begun before the game counts from its first day; England, pressing its claim with armies in the field, refuses a white peace', () => {
    const s = fresh();
    const E = nat(s, 'england'), F = nat(s, 'france');
    const hyw = s.wars.find((x) => x.attLead === E.id && x.def.includes(F.id))!;
    expect(hyw.goal.type).toBe('throne');
    expect(hyw.start).toBeLessThan(-365 * 15); // dated back in the setup
    expect(warYears(s, hyw)).toBe(0);
    const ev = evaluatePeace(s, hyw, F.id, E.id, []);
    expect(ev.reasons.some(([k]) => k === 'war_length')).toBe(false);
    expect(ev.veto).toBe('war_aims_unmet'); // a condition, not a row of the sum
    expect(ev.reasons.some(([k]) => k === 'war_aims_unmet')).toBe(false);
    expect(ev.reasons.some(([k]) => k === 'field_armies')).toBe(true);
    expect(ev.accept).toBe(false);
    expect(sumRows(ev, true)).toBe(ev.score); // the rows add up to their answer
    // a month of play: neither crown has made a white peace, and England has offered none
    for (let d = 0; d < 30; d++) step(s, w, []);
    expect(s.wars.includes(hyw)).toBe(true);
    expect(hyw.offers.filter((o) => o.from === E.id && !o.terms.length)).toEqual([]);
  });
  it('a loser between −10 and −25 buys peace with gold after two years; a winner above 10 makes peace after four', () => {
    const setup = (score: number, years: number) => {
      const s = fresh(); clearField(s);
      const a = nat(s, 'portugal').id, b = plainTarget(s, a);
      const war = war2(s, a, b, 'humiliate');
      // (a war dated before the game counts from its first day: the clock runs on instead)
      war.start = s.day; s.day += Math.round(365 * years); war.battleScore = score; war.tickScore = 0;
      expect(computeScore(s, war)).toBeCloseTo(score, 6);
      return { s, a, b, war };
    };
    // −12 for the defender after 2.5 years: it offers gold worth six tenths of the enemy's score, which is taken
    const L = setup(12, 2.5);
    const nb = L.s.nations[L.b]; nb.treasury = 1e5; const t0 = nb.treasury, ta = L.s.nations[L.a].treasury;
    considerPeace(L.s, w, nb, L.war);
    expect(L.s.wars.includes(L.war)).toBe(false);
    expect(nb.treasury).toBeLessThan(t0);
    expect(L.s.nations[L.a].treasury - ta).toBeCloseTo(t0 - nb.treasury, 6);
    // in the first two years it fights on
    const Y = setup(12, 1.5); considerPeace(Y.s, w, Y.s.nations[Y.b], Y.war);
    expect(Y.s.wars.includes(Y.war)).toBe(true);
    // +12 for the attacker after 4.5 years: it makes peace (the band from 10 to 15 had no rule and dragged on)
    const W = setup(12, 4.5);
    W.s.nations[W.a].warExhaustion = 30;
    considerPeace(W.s, w, W.s.nations[W.a], W.war);
    expect(W.s.wars.includes(W.war)).toBe(false);
  });
});

describe('the peace verdict follows its breakdown (review: “würde ablehnen” under a sum of 0 or more)', () => {
  const VETOES = ['fighting_for_freedom', 'siege_under_way', 'war_aims_unmet', 'pressing_claim'];
  const total = (rows: [string, number][]) => rows.reduce((p, r) => p + r[1], 0);
  it('England pressing its claim refuses a white peace by a condition of its own, outside the sum, and lets it rest at 40 war exhaustion', () => {
    const s = fresh();
    const E = nat(s, 'england'), F = nat(s, 'france');
    const hyw = s.wars.find((x) => x.attLead === E.id && x.def.includes(F.id))!;
    // France +7: past the young war's unmet aims (+5 at most), short of the +10 that ends the claim
    hyw.battleScore = 0; hyw.tickScore = 0; hyw.battleScore = -7 - computeScore(s, hyw);
    expect(computeScore(s, hyw)).toBeCloseTo(-7, 6);
    E.warExhaustion = 39;
    const ev = evaluatePeace(s, hyw, F.id, E.id, []);
    expect(ev.veto).toBe('pressing_claim');
    expect(ev.accept).toBe(false);
    expect(ev.score).toBeGreaterThanOrEqual(0); // the sum alone would accept: the claim refuses
    expect(ev.reasons.some(([k]) => VETOES.includes(k))).toBe(false);
    // the dialog: the rows add up to Σ ≥ 0, the verdict is “would refuse”, and the condition says why
    const r = answer(s, w, F.id, { q: 'peace', war: hyw.id, to: E.id, terms: [] } as any) as any;
    expect(r.accept).toBe(false);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(total(r.reasons)).toBe(r.score);
    expect(r.veto).toBe('pressing_claim');
    expect(r.vetoNow.exhaustion).toBe(39);
    // worn out at 40, England lets the claim rest and takes the white peace the sum already favoured
    E.warExhaustion = 40;
    const ev2 = evaluatePeace(s, hyw, F.id, E.id, []);
    expect(ev2.veto).toBeNull();
    expect(ev2.accept).toBe(true);
  });
  it('over a year of play, every answer the dialog gives refuses only by a sum below 0 or a condition it names', () => {
    const s = createGame(w, loadSetup(1356), loadHubs(), 1356, { player: [] });
    let vetoed = 0, checks = 0;
    for (let d = 0; d <= 360; d++) {
      if (d % 30 === 0) for (const war of s.wars) for (const [from, to] of [[war.defLead, war.attLead], [war.attLead, war.defLead]]) {
        for (const terms of [[], [{ type: 'humiliate' }]]) {
          const r = answer(s, w, from, { q: 'peace', war: war.id, to, terms } as any) as any; checks++;
          expect(total(r.reasons)).toBe(r.score);
          expect(r.reasons.some(([k]: [string, number]) => VETOES.includes(k))).toBe(false);
          if (r.accept) { expect(r.score).toBeGreaterThanOrEqual(0); expect(r.veto).toBeNull(); expect(r.cond?.ok ?? true).toBe(true); }
          else expect(r.score < 0 || r.cond?.ok === false || !!r.veto, `${war.name.en} ${s.nations[from].key}→${s.nations[to].key} day ${s.day}`).toBe(true);
          if (r.veto && r.score >= 0) vetoed++;
        }
      }
      step(s, w, []);
    }
    expect(checks).toBeGreaterThan(300);
    expect(vetoed).toBeGreaterThan(0); // the case the review found: a refusal with Σ ≥ 0, now explained by its condition
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

describe('calls to arms (major: the player was pulled into allies’ wars without being asked)', () => {
  const ally = (s: GameState, a: number, b: number) => s.treaties.push({ type: 'alliance', a, b, since: s.day, until: s.day + 365 * 50 });
  const calls = (s: GameState, n: number) => s.pending.filter((p) => p.event === 'call_to_arms' && p.nation === n);
  const reply = (s: GameState, n: number, id: number, choice: number) => applyCommand(s, w, { t: 'event', n, pending: id, choice } as any);
  const mod = (s: GameState, a: number, b: number, id: string) => rel(s, a, b).mods.find((m) => m.id === id)?.v;
  /** An AI realm a, its fresh ally p (the player's realm) and a target b. */
  function setup(p0?: number) {
    const s = fresh(); clearField(s);
    const a = nat(s, 'portugal').id;
    const p = p0 ?? plainTarget(s, a);
    const b = plainTarget(s, a, [p]);
    ally(s, a, p);
    s.playerNations = [p];
    return { s, a, p, b };
  }
  it('an ally’s attack asks the player; joining puts the player on its side and raises the ally’s opinion and trust', () => {
    const { s, a, p, b } = setup();
    const war = war2(s, a, b, 'humiliate');
    expect(war.att).not.toContain(p); expect(war.def).not.toContain(p);
    const c = calls(s, p);
    expect(c).toHaveLength(1);
    expect(c[0].ctx).toMatchObject({ war: war.id, from: a, def: 0 });
    expect(s.notices.some((x) => x.nation === p && x.kind === 'call_to_arms')).toBe(true);
    // the card names both answers with what they bring
    const card = pendingView(s, w, p).find((x) => x.id === c[0].id)!;
    expect(card.options).toHaveLength(2);
    expect(card.options[0].hint!.en).toContain(`+${CALL_ANSWERED.opinion}`);
    expect(card.options[1].hint!.de).toContain(`−${-CALL_REFUSED.attack.opinion}`);
    const trust0 = rel(s, a, p).trust;
    expect(reply(s, p, c[0].id, 0).ok).toBe(true);
    expect(war.att).toContain(p);
    expect(calls(s, p)).toHaveLength(0);
    expect(mod(s, a, p, 'answered_call')).toBe(CALL_ANSWERED.opinion);
    expect(rel(s, a, p).trust).toBe(Math.min(100, trust0 + CALL_ANSWERED.trust));
  });
  it('staying out costs opinion and trust; a second refusal within ten years ends the alliance', () => {
    const { s, a, p, b } = setup();
    const war = war2(s, a, b, 'humiliate');
    const trust0 = rel(s, a, p).trust;
    expect(reply(s, p, calls(s, p)[0].id, 1).ok).toBe(true);
    expect(war.att).not.toContain(p);
    expect(mod(s, a, p, 'refused_call')).toBe(CALL_REFUSED.attack.opinion);
    expect(rel(s, a, p).trust).toBe(Math.max(0, trust0 + CALL_REFUSED.attack.trust));
    expect(hasTreaty(s, a, p, 'alliance')).toBe(true);
    // a year later a second call, refused again: the alliance ends
    s.day += 365;
    const c = plainTarget(s, a, [p, b]);
    war2(s, a, c, 'humiliate');
    expect(calls(s, p)).toHaveLength(1);
    expect(reply(s, p, calls(s, p)[0].id, 1).ok).toBe(true);
    expect(hasTreaty(s, a, p, 'alliance')).toBe(false);
  });
  it('unanswered, the court honours a call to defend and stays out of an attack', () => {
    const { s, a, p, b } = setup();
    const war = war2(s, b, a, 'humiliate'); // b attacks our ally
    expect(war.def).not.toContain(p);
    const c = calls(s, p)[0]; expect(c.ctx.def).toBe(1);
    expect(answerEvent(s, w, p, c.id, -1, true)).toBeNull();
    expect(war.def).toContain(p);
    const d = plainTarget(s, a, [p, b]);
    const war3 = war2(s, a, d, 'humiliate'); // our ally attacks
    const c2 = calls(s, p).find((x) => x.ctx.war === war3.id)!;
    expect(answerEvent(s, w, p, c2.id, -1, true)).toBeNull();
    expect(war3.att).not.toContain(p);
  });
  it('a lapsed call is not shown and cannot be answered', () => {
    const { s, a, p, b } = setup();
    const war = war2(s, a, b, 'humiliate');
    const c = calls(s, p)[0];
    s.wars.splice(s.wars.indexOf(war), 1);
    expect(pendingView(s, w, p).some((x) => x.id === c.id)).toBe(false);
    const r = reply(s, p, c.id, 0);
    expect(r.ok).toBe(false);
  });
  it('an AI ally still answers at once, as before', () => {
    const { s, a, p, b } = setup();
    const q = plainTarget(s, a, [b, p]);
    ally(s, a, q);
    war2(s, a, b, 'humiliate');
    expect(s.pending.some((x) => x.event === 'call_to_arms' && x.nation === q)).toBe(false);
  });
  it('the emperor who joins an ally’s attack on a member of the Empire loses imperial authority', () => {
    const s0 = fresh();
    const { s, a, p } = setup(s0.empire.emperor);
    const hre = s.nations.find((n) => n.alive && n.isHRE && n.id !== p && n.id !== a && n.overlord < 0 && n.capital >= 0
      && !s.treaties.some((t) => (t.type === 'alliance' || t.type === 'guarantee') && (t.a === n.id || t.b === n.id)) && !hasTreaty(s, a, n.id, 'truce'))!;
    s.empire.authority = 50;
    const war = war2(s, a, hre.id, 'humiliate');
    const c = calls(s, p).find((x) => x.ctx.war === war.id)!;
    expect(c).toBeTruthy();
    expect(pendingView(s, w, p).find((x) => x.id === c.id)!.options[0].hint!.en).toContain(`imperial authority −${EMPEROR_JOIN_ATTACK}`);
    const auth0 = s.empire.authority;
    expect(reply(s, p, c.id, 0).ok).toBe(true);
    expect(war.att).toContain(p);
    expect(s.empire.authority).toBe(auth0 - EMPEROR_JOIN_ATTACK);
  });
});

describe('calls to arms by a realm we guarantee and by a Common Front (review: they spoke of an alliance that did not exist)', () => {
  const calls = (s: GameState, n: number) => s.pending.filter((p) => p.event === 'call_to_arms' && p.nation === n);
  const reply = (s: GameState, n: number, id: number, choice: number) => applyCommand(s, w, { t: 'event', n, pending: id, choice } as any);
  const mod = (s: GameState, a: number, b: number, id: string) => rel(s, a, b).mods.find((m) => m.id === id)?.v;
  const guarantee = (s: GameState, a: number, b: number) => s.treaties.push({ type: 'guarantee', a, b, since: s.day, until: s.day + 365 * 50 });
  it('a guarantor is called as one: refusing lets the guarantee lapse at once and speaks of no alliance', () => {
    const s = fresh(); clearField(s);
    const g = nat(s, 'poland').id, b = nat(s, 'navarre').id, a = nat(s, 'aragon').id;
    expect(hasTreaty(s, g, b, 'alliance')).toBe(false);
    guarantee(s, g, b); s.playerNations = [g];
    const war = war2(s, a, b, 'humiliate');
    const c = calls(s, g); expect(c).toHaveLength(1);
    expect(c[0].ctx).toMatchObject({ war: war.id, from: b, def: 1, kind: 1 });
    const card = pendingView(s, w, g).find((x) => x.id === c[0].id)! as any;
    expect(card.title.de).toBe('Ein Schützling ruft um Hilfe');
    expect(card.text.de).toContain('für dessen Unabhängigkeit wir bürgen');
    for (const o of card.options) { expect(o.hint.de).not.toContain('Bündnis'); expect(o.hint.en).not.toContain('alliance'); }
    expect(card.text.de).not.toContain('Verbündete');
    expect(card.options[1].hint.de).toContain('Unsere Garantie für Navarra erlischt');
    const n0 = s.notices.length;
    expect(reply(s, g, c[0].id, 1).ok).toBe(true);
    expect(war.def).not.toContain(g);
    expect(hasTreaty(s, g, b, 'guarantee')).toBe(false); // the guarantee lapsed
    expect(mod(s, b, g, 'refused_call')).toBe(CALL_REFUSED.defend.opinion);
    const told = s.notices.slice(n0).filter((x) => x.nation === g).map((x) => x.text.de);
    expect(told.some((x) => x.includes('Garantie für Navarra ist erloschen'))).toBe(true);
    expect(told.some((x) => x.includes('Bündnis'))).toBe(false);
    // no guarantee, no second call
    s.wars = []; s.treaties = s.treaties.filter((t) => t.type !== 'truce'); s.day += 200;
    war2(s, a, b, 'humiliate');
    expect(calls(s, g).filter((x) => callLapsed(s, x) === null)).toHaveLength(0);
  });
  it('a guarantor allied with the attacker is asked by both sides; standing by its word ends the alliance', () => {
    const s = fresh(); clearField(s);
    const g = nat(s, 'portugal').id, b = nat(s, 'navarre').id, a = nat(s, 'castile').id;
    expect(hasTreaty(s, g, a, 'alliance')).toBe(true);
    guarantee(s, g, b); s.playerNations = [g];
    // the dialog lists it on both sides as asked
    const ps = predictSides(s, w, a, b, 'humiliate');
    expect(ps.att.find((x) => x.id === g)).toMatchObject({ role: 'ally', odds: null });
    expect(ps.def.find((x) => x.id === g)).toMatchObject({ role: 'guarantor', odds: null });
    const war = war2(s, a, b, 'humiliate');
    const cs = calls(s, g);
    expect(cs.map((x) => [x.ctx.from, x.ctx.def, x.ctx.kind]).sort()).toEqual([[a, 0, 0], [b, 1, 1]].sort());
    const cards = pendingView(s, w, g).filter((x) => x.event === 'call_to_arms') as any[];
    const defend = cards.find((x) => x.ctx.def === 1)!;
    expect(defend.options[0].hint.de).toContain('Wir ziehen gegen Kastilien ins Feld: Unser Bündnis endet');
    expect(reply(s, g, defend.id, 0).ok).toBe(true);
    expect(war.def).toContain(g); expect(war.att).not.toContain(g);
    expect(hasTreaty(s, g, a, 'alliance')).toBe(false);
    expect(mod(s, a, g, 'broke_alliance')).toBe(TIE_BROKEN.opinion);
    expect(hasTreaty(s, g, b, 'guarantee')).toBe(true);
    // the attacker's call has lapsed: it is no longer shown
    expect(pendingView(s, w, g).some((x) => x.event === 'call_to_arms')).toBe(false);
  });
  /** A Common Front of members of the Empire against Milan: every realm outside the Empire keeps a truce with it. */
  function front(s: GameState, setup: (members: number[]) => void): War {
    const agg = nat(s, 'milan');
    for (const o of s.nations) if (o.alive && o.id !== agg.id && !o.isHRE) s.treaties.push({ type: 'truce', a: Math.min(o.id, agg.id), b: Math.max(o.id, agg.id), since: s.day, until: s.day + 3650 });
    agg.dread = 95;
    warSystem.monthly!(mkCtx(s, w));
    let war = s.wars.find((x) => x.goal.type === 'coalition' && x.goal.target === agg.id);
    expect(war).toBeUndefined(); // (the first month only gathers the front)
    setup((s as any).fronts[agg.id]);
    for (let k = 0; k < 24 && !war; k++) { s.day += 30; agg.dread = 95; warSystem.monthly!(mkCtx(s, w)); war = s.wars.find((x) => x.goal.type === 'coalition' && x.goal.target === agg.id); }
    expect(war).toBeTruthy();
    return war!;
  }
  /** A small member of the front without allies (so that only the front calls it). */
  const loner = (s: GameState, members: number[]) => members.find((m) => s.nations[m].isHRE && !s.treaties.some((t) => t.type === 'alliance' && (t.a === m || t.b === m)) && nationDev(s, m) < 15)!;
  it('a player in a Common Front is called by the front, not as an ally, and refusing ends no alliance', () => {
    const s = fresh(); clearField(s);
    let p = -1;
    const war = front(s, (members) => { p = loner(s, members); s.playerNations = [p]; });
    expect(war.att).not.toContain(p);
    const c = calls(s, p); expect(c).toHaveLength(1);
    expect(c[0].ctx).toMatchObject({ war: war.id, from: war.attLead, def: 0, kind: 2 });
    expect(hasTreaty(s, p, war.attLead, 'alliance')).toBe(false);
    const card = pendingView(s, w, p).find((x) => x.id === c[0].id)! as any;
    expect(card.title.de).toBe('Die Gemeinsame Front ruft uns');
    expect(card.text.de).toContain('Gemeinsamen Front');
    for (const o of card.options) expect(o.hint.de).not.toContain('Bündnis');
    const n0 = s.notices.length;
    expect(reply(s, p, c[0].id, 1).ok).toBe(true);
    expect(mod(s, war.attLead, p, 'refused_call')).toBe(CALL_REFUSED.attack.opinion);
    expect(s.notices.slice(n0).some((x) => x.nation === p && x.text.de.includes('Bündnis'))).toBe(false);
    expect(s.nations[p].flags[`refused_call_${war.attLead}`]).toBeUndefined(); // no alliance to count a refusal against
  });
});

describe('the sides of a declaration (major: the dialog did not say who joins; a subject allied with the target fought it)', () => {
  it('France on Navarre: Foix-Béarn follows France and leaves its alliance with Navarre; the dialog said so beforehand', () => {
    const s = fresh(); clearField(s);
    const fr = nat(s, 'france').id, nv = nat(s, 'navarre').id, fb = nat(s, 'foix_bearn').id;
    expect(s.nations[fb].overlord).toBe(fr);
    expect(hasTreaty(s, fb, nv, 'alliance')).toBe(true);
    s.playerNations = [nv];
    const dv = answer(s, w, fr, { q: 'declare', target: nv } as any) as any;
    const sides = dv.goals.find((g: any) => g.goal === 'conquest').sides;
    expect(sides.att.find((x: any) => x.id === fb)).toMatchObject({ role: 'subject', odds: 1, breaks: nv });
    expect(sides.def.find((x: any) => x.id === nv)).toMatchObject({ role: 'target', odds: 1 });
    expect(sides.def.some((x: any) => x.id === fb)).toBe(false);
    const war = war2(s, fr, nv, 'conquest');
    expect(war.att).toContain(fb); expect(war.def).not.toContain(fb);
    expect(hasTreaty(s, fb, nv, 'alliance')).toBe(false);
    expect(s.notices.some((n) => n.nation === nv && n.text.en.includes('our alliance has ended'))).toBe(true);
  });
  it('what the dialog calls certain joins, what it calls out stays out, and a player ally it calls asked gets a call to arms', () => {
    for (const [ak, seedOff] of [['france', 0], ['castile', 1], ['england', 2], ['poland', 3]] as const) {
      const s = fresh(); clearField(s);
      const a = nat(s, ak).id;
      const b = plainTarget(s, a);
      // one of a's allies is a player
      const al = s.treaties.find((t) => t.type === 'alliance' && (t.a === a || t.b === a));
      const pl = al ? (al.a === a ? al.b : al.a) : -1;
      if (pl >= 0 && s.nations[pl].overlord < 0) s.playerNations = [pl];
      const p = predictSides(s, w, a, b, 'humiliate');
      const war = war2(s, a, b, 'humiliate');
      void seedOff;
      for (const x of p.att) {
        if (x.odds === 1) expect(war.att, `${ak}: ${s.nations[x.id].key}`).toContain(x.id);
        if (x.odds === 0) expect(war.att.includes(x.id) || war.def.includes(x.id)).toBe(false);
        if (x.odds === null) expect(s.pending.some((q) => q.event === 'call_to_arms' && q.nation === x.id && q.ctx.war === war.id)).toBe(true);
      }
      for (const x of p.def) {
        if (x.odds === 1) expect(war.def, `${ak}: ${s.nations[x.id].key}`).toContain(x.id);
        if (x.odds === 0) expect(war.att.includes(x.id) || war.def.includes(x.id)).toBe(false);
      }
      // nobody is in the war whom the dialog did not list
      for (const id of [...war.att, ...war.def]) expect([...p.att, ...p.def].some((x) => x.id === id), `${ak}: ${s.nations[id].key}`).toBe(true);
    }
  });
});

describe('the towns of a conquest (major: the player could not choose them)', () => {
  it('the dialog offers the land the goal covers, priced per town; the towns we name are the war’s goal; others are refused', () => {
    const s = fresh(); clearField(s);
    const a = nat(s, 'portugal').id, b = plainTarget(s, a);
    s.playerNations = [a];
    const dv = answer(s, w, a, { q: 'declare', target: b } as any) as any;
    const g = dv.goals.find((x: any) => x.goal === 'conquest');
    const towns = goalTowns(s, w, a, b, 'conquest');
    expect(g.towns.map((x: any) => x.loc)).toEqual(towns);
    expect(towns.length).toBeGreaterThan(g.locs.length - 1);
    for (const l of g.locs) expect(towns).toContain(l); // the default choice is among them
    expect(g.pickable).toBe(true);
    // the price of a town is the war score of its cession against the defenders certain to fight
    const dev = Math.max(10, g.sides.def.filter((x: any) => x.odds === 1).reduce((p: number, x: any) => p + nationDev(s, x.id), 0));
    expect(g.towns[0].price).toBeCloseTo(cedeWorth(s, [towns[0]], dev), 9);
    // a town deep in their land (not covered by the goal) is refused
    const deep = owned(s, b).find((l) => !towns.includes(l));
    if (deep !== undefined) expect(applyCommand(s, w, { t: 'declare', n: a, target: b, goal: 'conquest', locs: [deep] } as any).err).toBe('a town beyond what this war is fought for');
    // a single town of the set, not the default list, becomes the war goal
    const one = towns[towns.length - 1];
    expect(applyCommand(s, w, { t: 'declare', n: a, target: b, goal: 'conquest', locs: [one] } as any).ok).toBe(true);
    const war = s.wars.at(-1)!;
    expect(war.goal.locs).toEqual([one]);
    // and the war's cession of exactly that town costs what the dialog said (no allies joined b)
    if (war.def.length === 1) expect(termCost(s, war, { type: 'cede', locs: [one], to: a } as any, a, b)).toBeCloseTo(g.towns[g.towns.length - 1].price + CEDE_FIXED, 6);
  });
  it('a goal without towns refuses named towns; a situation’s war still names the towns it is about', () => {
    const s = fresh(); clearField(s);
    const a = nat(s, 'portugal').id, b = plainTarget(s, a);
    expect(declareRefusal(s, w, a, b, 'humiliate', [s.nations[b].capital])).toBe('a town beyond what this war is fought for');
    const deep = owned(s, b).find((l) => !goalTowns(s, w, a, b, 'conquest').includes(l));
    if (deep !== undefined) {
      expect(declareWar(s, w, a, b, 'conquest', [deep], { situation: true })).toBeNull();
      expect(s.wars.at(-1)!.goal.locs).toEqual([deep]);
    }
  });
});

describe('war texts and the war score hint (minors)', () => {
  it('German war names join two adjectives; a town’s adjective or a stem names the realms instead', () => {
    const s = fresh(); clearField(s);
    const fr = nat(s, 'france').id, nv = nat(s, 'navarre').id;
    const war = war2(s, fr, nv, 'conquest');
    expect(war.name.de).toBe('Französisch-navarresischer Krieg');
    expect(war.name.en).toBe('French–Navarrese War');
    const cologne = s.nations.find((n) => n.alive && n.adj.de === 'Kölner');
    expect(cologne).toBeTruthy();
    const pt = nat(s, 'portugal');
    const w2 = war2(s, pt.id, cologne!.id, 'humiliate');
    expect(w2.name.de).toBe(`Krieg zwischen ${pt.short.de} und ${cologne!.short.de}`);
  });
  it('a peace that cedes one town says “1 Ort”, and the war score parts carry their caps', () => {
    const s = fresh(); clearField(s);
    const a = nat(s, 'portugal').id, b = plainTarget(s, a);
    const war = war2(s, a, b, 'conquest');
    expect(scoreCaps(war)).toEqual({ battles: BATTLE_CAP, occupation: 75, capital: 15, ticking: war.goal.locs.length ? 25 : 15, blockade: 15 });
    const l = war.goal.locs[0] ?? owned(s, b).find((x) => x !== s.nations[b].capital)!;
    applyPeace(s, w, war, a, b, [{ type: 'cede', locs: [l], to: a } as any]);
    const c = s.chronicle[s.chronicle.length - 1];
    expect(c.text.de).toMatch(/: 1 Ort \(/);
    expect(c.text.en).toMatch(/: 1 location \(/);
  });
});

describe('Common Fronts keep truces (extra: coalition wars rose again within months of every peace)', () => {
  it('a realm bound by a truce with the aggressor joins no front against it, and no coalition breaks that truce', () => {
    const s = fresh(); clearField(s);
    const agg = nat(s, 'france');
    agg.dread = 90;
    warSystem.monthly!(mkCtx(s, w));
    const members: number[] = (s as any).fronts[agg.id] ?? [];
    expect(members.length).toBeGreaterThanOrEqual(3); // the fear is real
    // a peace with all of them: truces for five years
    for (const m of members) s.treaties.push({ type: 'truce', a: Math.min(m, agg.id), b: Math.max(m, agg.id), since: s.day, until: s.day + 365 * 5 });
    s.wars = [];
    for (let k = 0; k < 24; k++) { warSystem.monthly!(mkCtx(s, w)); s.day += 30; agg.dread = 90; }
    for (const m of (s as any).fronts[agg.id] ?? []) expect(members).not.toContain(m);
    for (const x of s.wars.filter((x) => x.goal.type === 'coalition' && x.goal.target === agg.id)) expect(hasTreaty(s, x.attLead, agg.id, 'truce')).toBe(false);
    expect(s.wars.filter((x) => x.goal.type === 'coalition' && x.goal.target === agg.id).every((x) => x.att.every((m) => !members.includes(m) || !hasTreaty(s, m, agg.id, 'truce')))).toBe(true);
  });
});
