// War and combat (audit gaps 1, 3, 11; spec points 17, 57, 58, 61, 65, 66, 67, 69, 70, 90): earned justifications and the
// price of a war without one, one declaration path for the player and the AI, peace terms per war goal, morale that
// breaks, a river crossing, the assault, blockades, scorched earth, the refill of regiments and duplicate alliances.
// Run: npx vitest run tests/war_pass.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { serialize, deserialize, dedupeTreaties } from '../src/sim/engine';
import { applyCommand, sanitizeTerms } from '../src/sim/commands';
import { mkCtx, hasTreaty, atWar, topOverlord, allies, rel } from '../src/sim/ctx';
import { EDGE_RIVER } from '../src/sim/world';
import { B, BI, UNITS, TERRAINS } from '../src/sim/defs';
import {
  casusBelliAll, hasCasusBelli, declarationCost, declareWar, warGoalLocs, allowedTerms, applyPeace, peaceObligations, scoreParts, TARIFF_CAP, DECLARE_GOALS,
} from '../src/sim/systems/war';
import {
  military, newArmy, armyMen, assaultOdds, besiegersOf, blockadedPorts, blockadeMonth, refillPlan, reinforceMonth, scorchEarth, supplyParts, MORALE_BREAK, RIVER_PENALTY, availableUnits, sideStats,
} from '../src/sim/systems/military';
import { aiWarGoal, aiDemands } from '../src/sim/systems/ai';
import { answer, mapModeColors } from '../src/game/view';
import type { Army, GameState } from '../src/sim/types';

vi.setConfig({ testTimeout: 120_000 });
const w = loadWorld();
let BASE = '';
beforeAll(() => { BASE = serialize(createGame(w, loadSetup(1356), loadHubs(), 1356, { player: [] })); });
const fresh = () => { const s = deserialize(BASE) as GameState; delete s.flags.peaceful_start; return s; };
const copy = (s: GameState) => deserialize(serialize(s)) as GameState;
const nat = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!;
const unit = (id: string) => UNITS.findIndex((u) => u.id === id);
const owned = (s: GameState, n: number) => { const out: number[] = []; for (let i = 0; i < w.L; i++) if (s.loc.owner[i] === n) out.push(i); return out; };
/** A realm a has no justification against (same faith family, no treaty, sovereign, not at war with a). */
function plainTarget(s: GameState, a: number): number {
  const na = s.nations[a];
  for (const b of s.nations) {
    if (!b.alive || b.id === a || b.overlord >= 0 || b.capital < 0 || b.faith !== na.faith || atWar(s, a, b.id)) continue;
    if (hasTreaty(s, a, b.id, 'truce') || hasTreaty(s, a, b.id, 'alliance') || topOverlord(s, b.id) === a || na.rivals.includes(b.id)) continue;
    if (casusBelliAll(s, a, b.id, w).length === 0 && owned(s, b.id).length >= 3) return b.id;
  }
  throw new Error('no target');
}
/** Clear the field: no wars, no armies (battles and sieges are set up by hand below). */
function clearField(s: GameState) { s.wars = []; s.armies = []; s.battles = []; s.sieges = []; }
function war2(s: GameState, a: number, b: number, goal: Parameters<typeof declareWar>[4] = 'conquest') {
  expect(declareWar(s, w, a, b, goal)).toBeNull();
  return s.wars[s.wars.length - 1];
}

describe('casus belli and the price of a war without one (gap 1, point 57)', () => {
  it('a rivalry alone justifies only a war to humble the rival, never a conquest', () => {
    const s = fresh();
    const a = nat(s, 'portugal').id, b = plainTarget(s, a);
    s.nations[a].rivals.push(b);
    expect(casusBelliAll(s, a, b, w)).toEqual(['rivalry']);
    expect(hasCasusBelli(s, a, b, 'conquest', w)).toBeNull();
    expect(hasCasusBelli(s, a, b, 'humiliate', w)).toBe('rivalry');
    const cq = declarationCost(s, w, a, b, 'conquest');
    expect(cq.unjust).toBe(true);
    expect(cq.rows.map((r) => r[0])).toEqual(expect.arrayContaining(['x_dc_unjust_concord', 'x_dc_unjust_mandate', 'x_dc_unjust_prestige', 'x_dc_unjust_opinion']));
    const hu = declarationCost(s, w, a, b, 'humiliate');
    expect(hu.unjust).toBe(false); expect(hu.rows).toEqual([]);
    // a war to humble them wins no land
    const s2 = copy(s);
    const war = war2(s2, a, b, 'humiliate');
    expect(war.goal.cb).toBe('rivalry');
    expect(allowedTerms(war, true).has('cede')).toBe(false);
    const st = sanitizeTerms(s2, w, war, a, b, [{ type: 'cede', locs: [s2.nations[b].capital], to: a }], false);
    expect(st.refused).toBe('that term does not fit the war goal');
    expect(st.terms).toEqual([]);
    expect(applyCommand(s2, w, { t: 'peace', n: a, war: war.id, to: b, terms: [{ type: 'cede', locs: [s2.nations[b].capital], to: a }] }).ok).toBe(false);
  });

  it('declaring a conquest without a justification costs Concord, Mandate, prestige, Dread and every realm’s opinion', () => {
    const s = fresh();
    const a = nat(s, 'portugal').id, b = plainTarget(s, a);
    const n = s.nations[a]; n.concord = 50; n.mandate = 60; n.prestige = 20; const dread0 = n.dread;
    const third = s.nations.find((x) => x.alive && x.id !== a && x.id !== b)!.id;
    war2(s, a, b, 'conquest');
    expect(n.concord).toBe(15); expect(n.mandate).toBe(45); expect(n.prestige).toBe(5);
    expect(n.dread).toBeGreaterThan(dread0);
    expect(rel(s, third, a).mods.find((m) => m.id === 'unjust_war')?.v).toBe(-25);
  });

  it('breaking a truce costs more than it used to, twice that without a justification', () => {
    const s = fresh();
    const a = nat(s, 'portugal').id, b = plainTarget(s, a);
    s.treaties.push({ a: Math.min(a, b), b: Math.max(a, b), type: 'truce', since: s.day, until: s.day + 3650 });
    const just = declarationCost(s, w, a, b, 'conquest', true), unjust = declarationCost(s, w, a, b, 'conquest');
    expect(just.rows.find((r) => r[0] === 'x_dc_truce_concord')![1]).toBe(-30);
    expect(unjust.rows.find((r) => r[0] === 'x_dc_truce_concord')![1]).toBe(-60);
  });

  it('a heirless ruler bound to our house by marriage gives a cause of succession; a trade embargo a trade conflict', () => {
    const s = fresh();
    const a = nat(s, 'portugal').id, b = plainTarget(s, a);
    const nb = s.nations[b];
    if (!nb.gov.includes('republic') && nb.gov !== 'theocracy' && nb.gov !== 'military_order') {
      nb.heir = 0;
      s.treaties.push({ a: Math.min(a, b), b: Math.max(a, b), type: 'marriage', since: s.day, until: s.day + 3650 });
      expect(casusBelliAll(s, a, b, w)).toContain('succession');
      expect(hasCasusBelli(s, a, b, 'throne', w)).toBe('succession');
      expect(hasCasusBelli(s, a, b, 'conquest', w)).toBeNull();
    }
    s.flags[`embargo_${b}_${a}`] = s.day + 3650;
    expect(casusBelliAll(s, a, b, w)).toContain('trade');
    expect(hasCasusBelli(s, a, b, 'trade', w)).toBe('trade');
  });
});

describe('one declaration for the player and the AI (gap 1, point 58)', () => {
  it('the player’s command and the AI’s declaration make the same war goal with the same towns', () => {
    const s = fresh();
    const a = nat(s, 'castile').id, b = nat(s, 'granada').id;
    const s1 = copy(s), s2 = copy(s);
    s1.playerNations = [a];
    // the player's dialog sends the towns the declare query shows
    const dv = answer(s1, w, a, { q: 'declare', target: b });
    const g = dv.goals.find((x: any) => x.goal === 'faith');
    expect(g.refusal).toBeNull();
    expect(g.locs).toEqual(warGoalLocs(s1, w, a, b, 'faith'));
    expect(applyCommand(s1, w, { t: 'declare', n: a, target: b, goal: 'faith', locs: g.locs }).ok).toBe(true);
    // the AI declares through declareWar without towns: the goal's own towns
    expect(declareWar(s2, w, a, b, 'faith')).toBeNull();
    const w1 = s1.wars[s1.wars.length - 1], w2 = s2.wars[s2.wars.length - 1];
    expect(w1.goal).toEqual(w2.goal);
    expect(w1.goal.cb).toBe(hasCasusBelli(s, a, b, 'faith', w));
    expect(w1.goal.locs.length).toBeGreaterThan(0);
  });

  it('the AI picks a goal its justification covers, and a mere rival only for a war to humble', () => {
    const s = fresh();
    const a = nat(s, 'portugal'), b = plainTarget(s, a.id);
    a.rivals.push(b);
    const g = aiWarGoal(s, w, a, b);
    expect(g === null || DECLARE_GOALS.includes(g)).toBe(true);
    if (g) expect(g).toBe('humiliate');
  });
});

describe('peace terms per war goal (gap 1, points 58, 61)', () => {
  it('a holy war converts the realm or chosen towns', () => {
    const s = fresh();
    const a = nat(s, 'castile'), b = nat(s, 'granada');
    const war = war2(s, a.id, b.id, 'faith');
    expect(allowedTerms(war, true).has('faith')).toBe(true);
    const s2 = copy(s);
    applyPeace(s, w, war, a.id, b.id, [{ type: 'faith' }]);
    expect(b.faith).toBe(a.faith);
    const B2 = nat(s2, 'granada'), A2 = nat(s2, 'castile');
    const towns = owned(s2, B2.id).slice(0, 2);
    applyPeace(s2, w, s2.wars[s2.wars.length - 1], A2.id, B2.id, [{ type: 'convert', locs: towns }]);
    for (const l of towns) { expect(s2.loc.faith[l]).toBe(A2.faith); expect(s2.loc.minShare[l]).toBeGreaterThanOrEqual(0.3); }
    expect(B2.faith).not.toBe(A2.faith);
  });

  it('a war for the throne ends in a personal union or a prince of our house', () => {
    const s = fresh();
    const a = nat(s, 'portugal'), b = nat(s, 'castile');
    const war = war2(s, a.id, b.id, 'throne');
    const s2 = copy(s);
    applyPeace(s, w, war, a.id, b.id, [{ type: 'throne', mode: 'union' }]);
    expect(b.overlord).toBe(a.id); expect(b.subjectType).toBe('personal_union'); expect(b.ruler).toBe(a.ruler);
    const A2 = nat(s2, 'portugal'), B2 = nat(s2, 'castile');
    applyPeace(s2, w, s2.wars[s2.wars.length - 1], A2.id, B2.id, [{ type: 'throne', mode: 'claimant' }]);
    expect(B2.overlord).toBe(-1); expect(B2.dynasty).toBe(A2.dynasty);
    expect(hasTreaty(s2, A2.id, B2.id, 'alliance')).toBe(true);
  });

  it('a trade war wins privileges, lower tolls and reparations that are paid month by month', () => {
    const s = fresh();
    const a = nat(s, 'portugal'), b = plainTarget(s, a.id), B2 = s.nations[b];
    const war = war2(s, a.id, b, 'trade');
    const allowed = allowedTerms(war, true);
    for (const k of ['trade_rights', 'end_embargo', 'tariff_cut', 'expel_merchants'] as const) expect(allowed.has(k)).toBe(true);
    expect(allowed.has('cede')).toBe(false);
    B2.tariff = 0.2; B2.income.trade = 40; B2.income.tax = 100;
    applyPeace(s, w, war, a.id, b, [{ type: 'trade_rights' }, { type: 'tariff_cut' }, { type: 'reparations' }]);
    expect(B2.tariff).toBe(TARIFF_CAP);
    const ta = a.treasury, tb = B2.treasury;
    peaceObligations(s);
    expect(a.incomeAcc.trade_privileges).toBeCloseTo(10, 5);
    expect(a.incomeAcc.reparations).toBeGreaterThan(0);
    expect(a.treasury - ta).toBeCloseTo(tb - B2.treasury, 5);
    // the capped tolls hold against the budget command too
    expect(applyCommand(s, w, { t: 'budget', n: b, key: 'tariff', value: 0.3 }).ok).toBe(true);
    expect(B2.tariff).toBeLessThanOrEqual(TARIFF_CAP);
  });

  it('a war to humble a rival ends the rivalry; the AI demands only terms its goal allows', () => {
    const s = fresh();
    const a = nat(s, 'portugal'), b = plainTarget(s, a.id), B2 = s.nations[b];
    a.rivals.push(b); B2.rivals.push(a.id);
    const war = war2(s, a.id, b, 'humiliate');
    const d = aiDemands(s, w, war, a, b, war.def, 60);
    const allowed = allowedTerms(war, true);
    expect(d.terms.length).toBeGreaterThan(0);
    for (const t of d.terms) expect(allowed.has(t.type)).toBe(true);
    expect(d.terms.map((t) => t.type)).toContain('humiliate');
    applyPeace(s, w, war, a.id, b, [{ type: 'end_rivalry' }]);
    expect(B2.rivals).not.toContain(a.id);
  });
});

describe('battles: morale, unit mix, rivers, reports (gap 3, points 65, 66, 67)', () => {
  /** A plains place owned by b with a river edge to a neighbour of b's land, if one exists. */
  function field(s: GameState, b: number, river: boolean): { loc: number; from: number } {
    for (let l = 0; l < w.L; l++) {
      if (s.loc.owner[l] !== b || s.loc.buildings[l * B + BI.fort] > 0) continue;
      if (!['plains', 'farmland'].includes(TERRAINS[w.terrain[l]])) continue;
      for (let e = w.adjStart[l]; e < w.adjStart[l + 1]; e++) {
        const v = w.adj[e]; if (v >= w.L) continue;
        if (((w.adjFlag[e] & EDGE_RIVER) !== 0) === river) return { loc: l, from: v };
      }
    }
    throw new Error('no field');
  }
  function setup(moraleD: number) {
    const s = fresh(); clearField(s);
    const a = nat(s, 'portugal').id, b = plainTarget(s, a);
    war2(s, a, b, 'humiliate');
    s.playerNations = [a];
    const f = field(s, b, false);
    const A = newArmy(s, a, f.loc, [{ type: unit('men_at_arms'), men: 6000 }, { type: unit('crossbowmen'), men: 2000 }]);
    const D = newArmy(s, b, f.loc, [{ type: unit('men_at_arms'), men: 6000 }, { type: unit('crossbowmen'), men: 2000 }]);
    A.lastMoveDay = s.day; D.lastMoveDay = s.day - 30; D.morale = moraleD;
    return { s, a, b, A, D };
  }
  const runBattle = (s: GameState) => { for (let i = 0; i < 20 && (i === 0 || s.battles.length); i++) military.daily!(mkCtx(s, w)); };

  it('a side whose morale breaks leaves the field and is routed; the report tells it with the losses of the pursuit', () => {
    const { s, a } = setup(0.3);
    runBattle(s);
    const rep = s.battleReports!.at(-1)!;
    expect(rep.winner).toBe('att');
    expect(rep.def.broke).toBe(true);
    expect(rep.def.routed).toBe(true);
    expect(rep.def.morale).toBeLessThanOrEqual(MORALE_BREAK + 1e-9);
    expect(rep.pursuit).toBeGreaterThan(0);
    expect(rep.lossD).toBeGreaterThan(rep.days.reduce((p, d) => p + d.lossD, 0));
    expect(rep.reasons).toContain('rout');
    expect(rep.att.troops.map((t) => t.type).sort()).toEqual([unit('men_at_arms'), unit('crossbowmen')].sort());
    expect(rep.att.parts.map((p) => p[0])).toEqual(expect.arrayContaining(['x_bp_men', 'x_bp_morale', 'x_bp_general']));
    // the player's notice opens the report, and the view answers it
    const nt = s.notices.find((n) => n.nation === a && n.kind === 'battle_won');
    expect(nt?.report).toBe(rep.id);
    expect(answer(s, w, a, { q: 'battle', id: rep.id }).att.start).toBeGreaterThan(0);
  });

  it('a beaten host does not fall back into an enemy army, not even into its besieged capital', () => {
    const { s, a, b, D } = setup(0.3);
    // our hosts stand in every place next to the field the loser holds, and before its capital
    const blocked = [s.nations[b].capital];
    for (let e = w.adjStart[D.loc]; e < w.adjStart[D.loc + 1]; e++) { const v = w.adj[e]; if (v < w.L && s.loc.ctrl[v] === b) blocked.push(v); }
    for (const l of blocked) newArmy(s, a, l, [{ type: unit('levy'), men: 1000 }]).lastMoveDay = s.day - 60;
    military.daily!(mkCtx(s, w));
    for (let i = 0; i < 20 && s.battles.some((x) => x.loc === D.loc); i++) military.daily!(mkCtx(s, w));
    expect(s.battleReports!.at(-1)!.def.routed).toBe(true);
    const dest = D.path.at(-1);
    expect(dest).toBeDefined();
    expect(blocked).not.toContain(dest);
    expect(s.loc.ctrl[dest!]).toBe(b);
  });

  it('shaken troops strike weaker blows', () => {
    const fresh1 = setup(1), shaken = setup(0.5);
    military.daily!(mkCtx(fresh1.s, w)); military.daily!(mkCtx(shaken.s, w));
    const d1 = fresh1.s.battles[0].rep!.days[0], d2 = shaken.s.battles[0].rep!.days[0];
    expect(d2.lossA).toBeLessThan(d1.lossA);
  });

  it('horse in the open rides down foot without pikes; pikes blunt it', () => {
    const s = fresh(); clearField(s);
    const a = nat(s, 'portugal').id, b = plainTarget(s, a);
    war2(s, a, b, 'humiliate');
    const f = field(s, b, false);
    const knights = unit('knights');
    const pikeU = UNITS.findIndex((u) => u.kind === 'inf' && u.def >= 1.4);
    const A = newArmy(s, a, f.loc, [{ type: knights, men: 3000 }]);
    const foot = newArmy(s, b, f.loc, [{ type: unit('levy'), men: 3000 }]);
    const mods1 = sideStats(s, w, [A], f.loc, false, [foot]).mods;
    expect(mods1.map((m) => m[0])).toContain('x_bm_cav_open');
    if (pikeU >= 0) {
      const pikes = newArmy(s, b, f.loc, [{ type: pikeU, men: 3000 }]);
      const st = sideStats(s, w, [pikes], f.loc, true, [A]);
      expect(st.mods.map((m) => m[0])).toContain('x_bm_pikes');
    }
  });

  it('attackers crossing a river strike a fifth weaker', () => {
    const mk = (cross: boolean) => {
      const s = fresh(); clearField(s);
      const a = nat(s, 'portugal').id, b = plainTarget(s, a);
      war2(s, a, b, 'humiliate');
      const f = field(s, b, true);
      const A = newArmy(s, a, f.loc, [{ type: unit('men_at_arms'), men: 6000 }, { type: unit('crossbowmen'), men: 3000 }]);
      newArmy(s, b, f.loc, [{ type: unit('men_at_arms'), men: 6000 }, { type: unit('crossbowmen'), men: 3000 }]).lastMoveDay = s.day - 30;
      A.lastMoveDay = s.day; if (cross) A.prevLoc = f.from;
      military.daily!(mkCtx(s, w));
      return s.battles[0];
    };
    const r = mk(true), p = mk(false);
    expect(r.river).toBe(true); expect(p.river).toBe(false);
    expect(r.rep!.att.parts.find((x) => x[0] === 'x_bp_river')?.[1]).toBe(RIVER_PENALTY);
    expect(r.rep!.days[0].lossD / p.rep!.days[0].lossD).toBeCloseTo(RIVER_PENALTY, 3);
  });
});

describe('sieges: the assault (gap 3, point 67)', () => {
  function siege(days: number) {
    const s = fresh(); clearField(s);
    const a = nat(s, 'portugal').id, b = plainTarget(s, a);
    war2(s, a, b, 'humiliate');
    let l = -1; for (let i = 0; i < w.L; i++) if (s.loc.owner[i] === b && s.loc.buildings[i * B + BI.fort] > 0) { l = i; break; }
    if (l < 0) { l = s.nations[b].capital; s.loc.buildings[l * B + BI.fort] = 1; }
    const A = newArmy(s, a, l, [{ type: unit('men_at_arms'), men: 15000 }]);
    A.siege = l;
    s.sieges.push({ loc: l, nation: a, progress: 1, days, garrison: 1000, garrison0: 1000, breach: 2, blockade: false, log: [] });
    return { s, a, b, A, l };
  }
  it('cannot storm before the works are ready', () => {
    const { s, a, A } = siege(5);
    const r = applyCommand(s, w, { t: 'assault', n: a, army: A.id });
    expect(r.ok).toBe(false); expect(r.err).toBe('the siege works are not ready');
  });
  it('an assault costs the expected men and either carries the town or is repulsed', () => {
    const { s, a, A, l } = siege(40);
    const sg = s.sieges[0];
    const o = assaultOdds(s, w, sg, besiegersOf(s, sg));
    expect(o.p).toBeGreaterThan(0.03); expect(o.loss).toBeGreaterThan(0);
    const men0 = armyMen(A);
    expect(applyCommand(s, w, { t: 'assault', n: a, army: A.id }).ok).toBe(true);
    expect(men0 - armyMen(A)).toBeCloseTo(o.loss, 3);
    if (s.loc.ctrl[l] === a) expect(s.sieges.length).toBe(0);
    else {
      expect(sg.garrison).toBeCloseTo(800, 5); expect(sg.lastAssault).toBe(s.day);
      expect(applyCommand(s, w, { t: 'assault', n: a, army: A.id }).err).toBe('the troops need time before another assault');
    }
  });
});

describe('supply, blockades, scorched earth, refill (gap 11, points 69, 70, 90, 17)', () => {
  it('a fleet off an enemy market hub shuts the market and wins war score', () => {
    const s = fresh(); clearField(s);
    const a = nat(s, 'portugal').id;
    // a target with a coastal market hub and a sea zone beside it
    let b = -1, hub = -1, sea = -1;
    for (const m of s.markets) {
      const o = s.loc.owner[m.hub]; if (o < 0 || o === a || !w.coastal[m.hub] || s.nations[o].overlord >= 0 || atWar(s, a, o) || hasTreaty(s, a, o, 'alliance') || topOverlord(s, o) === a) continue;
      for (let e = w.adjStart[m.hub]; e < w.adjStart[m.hub + 1]; e++) if (w.adj[e] >= w.L) { sea = w.adj[e]; break; }
      if (sea >= 0) { b = o; hub = m.hub; break; }
    }
    expect(b).toBeGreaterThanOrEqual(0);
    const war = war2(s, a, b, 'humiliate');
    const ship = availableUnits(s, s.nations[a], true)[0];
    newArmy(s, a, sea, [{ type: ship, men: 10 }], true);
    expect(blockadedPorts(s, w).get(hub)).toBe(a);
    blockadeMonth(s, w);
    const m = s.loc.market[hub];
    expect(s.flags[`blockade_${s.markets.find((x) => x.hub === hub)!.id}`]).toBeGreaterThan(s.day);
    expect(m).toBeGreaterThanOrEqual(0);
    expect(war.blockScore).toBeGreaterThan(0);
    expect(scoreParts(s, war).blockade).toBe(war.blockScore);
  });

  it('scorched earth needs an invader near, devastates the place and cuts its supply to a fifth', () => {
    const s = fresh(); clearField(s);
    const a = nat(s, 'portugal'), b = plainTarget(s, a.id);
    const l = a.capital;
    expect(scorchEarth(s, w, a, l)).toBe('no enemy army near');
    war2(s, b, a.id, 'humiliate');
    newArmy(s, b, l, [{ type: unit('men_at_arms'), men: 5000 }]);
    const sup0 = supplyParts(s, w, l, b).total, dev0 = s.loc.devast[l];
    expect(applyCommand(s, w, { t: 'scorch', n: a.id, loc: l }).ok).toBe(true);
    expect(s.loc.devast[l]).toBeGreaterThan(dev0);
    const p = supplyParts(s, w, l, b);
    expect(p.rows.map((r) => r[0])).toContain('x_sp_scorched');
    expect(p.total).toBeLessThan(sup0 * 0.2 + 1);
    expect(scorchEarth(s, w, a, l)).toBe('already scorched');
    // the place shows it, and the supply map mode paints it
    expect(answer(s, w, a.id, { q: 'loc', loc: l }).war.scorchedUntil).toBeGreaterThan(s.day);
    const mm = mapModeColors(s, w, 'army_supply', a.id);
    expect(Array.from(mm.rgba.slice(l * 4, l * 4 + 4))).toEqual([60, 40, 35, 255]);
    expect(mm.legend.items.length).toBeGreaterThan(3);
  });

  it('regiments refill slowly from manpower and gold while they rest in our land', () => {
    const s = fresh(); clearField(s);
    const n = nat(s, 'portugal'); n.treasury = 1000; n.manpower = 5000;
    const A = newArmy(s, n.id, n.capital, [{ type: unit('men_at_arms'), men: 4000 }]);
    A.regs[0].men = 2000;
    const plan = refillPlan(s, w, A);
    expect(plan.block).toBeNull(); expect(plan.men).toBeGreaterThan(0);
    const mp0 = n.manpower, g0 = n.treasury;
    reinforceMonth(s, w);
    const gained = A.regs[0].men - 2000;
    expect(gained).toBeCloseTo(plan.men, 5);
    expect(gained).toBeLessThanOrEqual(4000 * 0.06 + 1e-9);
    expect(mp0 - n.manpower).toBeCloseTo(gained, 5);
    expect(g0 - n.treasury).toBeCloseTo(plan.gold, 5);
    expect(n.expenseAcc.reinforcements).toBeCloseTo(plan.gold, 5);
    // without manpower nothing comes; in foreign land nothing either
    const s2 = fresh(); clearField(s2);
    const n2 = nat(s2, 'portugal'); n2.manpower = 0; n2.treasury = 1000;
    const A2 = newArmy(s2, n2.id, n2.capital, [{ type: unit('men_at_arms'), men: 4000 }]); A2.regs[0].men = 2000;
    reinforceMonth(s2, w);
    expect(A2.regs[0].men).toBe(2000);
    const far = owned(s2, plainTarget(s2, n2.id))[0];
    A2.loc = far; n2.manpower = 5000;
    expect(refillPlan(s2, w, A2).block).toBe('x_rf_foreign');
  });

  it('the army panel shows supply, attrition and refill by cause', () => {
    const s = fresh();
    const n = nat(s, 'portugal');
    const A = s.armies.find((x: Army) => x.owner === n.id && !x.fleet)!;
    const d = answer(s, w, n.id, { q: 'army', army: A.id });
    expect(d.supply.total).toBeGreaterThan(0);
    expect(d.supply.rows[0][0]).toBe('x_sp_people');
    expect(d.attrition.rows.reduce((p: number, r: [string, number]) => p + r[1], 0)).toBeCloseTo(d.attrition.total, 9);
    expect(d.regs.length).toBe(A.regs.length);
  });

  it('two realms never hold the same alliance twice', () => {
    const s = fresh();
    const al = s.treaties.find((t) => t.type === 'alliance')!;
    const dup = { ...al };
    const list = dedupeTreaties([...s.treaties, dup]);
    expect(list.filter((t) => t.type === 'alliance' && t.a === al.a && t.b === al.b).length).toBe(1);
    for (const n of s.nations) if (n.alive) { const x = allies(s, n.id); expect(new Set(x).size).toBe(x.length); }
  });
});

