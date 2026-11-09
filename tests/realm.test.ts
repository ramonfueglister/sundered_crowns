// The realm pass (spec points 60, 83, 36, 39, 95, 81): the Empire (authority, election, diet, league), the great
// powers, the forms of government with their elections, the influence of the Powers, the assembly's votes on taxes
// and wars, and the actions open in a situation.
import { describe, it, expect } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { advanceDay } from '../src/sim/engine';
import { mkCtx, DAY_EPOCH } from '../src/sim/ctx';
import { applyCommand } from '../src/sim/commands';
import { declareWar, nationDev, hasCasusBelli } from '../src/sim/systems/war';
import { lawEffect, estate, PRIVILEGES, grantPrivilege } from '../src/sim/systems/politics';
import {
  empire, crownEffects, authorityDrift, internalWars, tally, electorChoice, dietVoters, dietTally, dietPasses, dietWeight,
  nextReform, league, leagueEffects, LEAGUE, leaveLeague, joinLeague, answerCall,
} from '../src/sim/systems/empire';
import { powers, intervene, balanceThreat, greatPowers } from '../src/sim/systems/powers';
import {
  government, govProcess, termYears, TERM_LIMIT, ensureCandidates, electionTally, classSums, influenceTargets, setTaxRate,
  taxLevel, assemblyVote, resentment, askRates,
} from '../src/sim/systems/government';
import { situationAction } from '../src/sim/systems/situations';
import { SITUATIONS } from '../src/sim/content/situations';
import type { GameState, Nation } from '../src/sim/types';

const w = loadWorld();
const s: GameState = createGame(w, loadSetup(1356), loadHubs(), 4242, { player: [] });
for (let i = 0; i < 40; i++) advanceDay(s, w);
const nat = (k: string) => s.nations.find((n) => n.key === k)!;
const month = (sys: { monthly?: (c: any) => void }) => sys.monthly!(mkCtx(s, w));
const sumRows = (r: [unknown, number][]) => r.reduce((p, x) => p + x[1], 0);
const free = (n: Nation) => n.alive && n.overlord < 0;
// law and modifier effects are cached for the day: a new day after changing them by hand
const fresh = () => { DAY_EPOCH.v++; };

describe('imperial authority', () => {
  it('the crown gives more the higher the authority, and the emperor wears it', () => {
    const E = s.empire; const keep = E.authority;
    E.authority = 20; const low = crownEffects(s);
    E.authority = 80; const high = crownEffects(s);
    expect(high.prestige).toBeGreaterThan(low.prestige);
    expect(high.authority).toBeGreaterThan(low.authority);
    expect(high.manpower).toBeGreaterThan(low.manpower);
    month(empire);
    const em = s.nations[E.emperor];
    const mod = em.modifiers.find((m) => m.id === 'imperial_crown');
    expect(mod).toBeTruthy();
    expect(mod!.effects).toEqual(crownEffects(s));
    E.authority = keep;
  });
  it('a war between members and an ignored call to defend one cost authority', () => {
    const E = s.empire;
    const before = E.authority;
    const att = s.nations.find((n) => free(n) && n.isHRE && n.id !== E.emperor && !n.elector)!;
    att.laws.diet = 0;
    const victim = s.nations.find((n) => free(n) && n.isHRE && n.id !== att.id && n.id !== E.emperor && declareWar(s, w, att.id, n.id) === null)!;
    expect(victim).toBeTruthy();
    expect(internalWars(s).some((x) => x.attLead === att.id)).toBe(true);
    const drift = authorityDrift(s);
    expect(drift.find((r) => r[0] === 'x_emp_internal_wars')![1]).toBeLessThan(0);
    expect(drift.find((r) => r[0] === 'x_emp_peace')).toBeUndefined();
    // a call the emperor leaves unanswered
    const war = s.wars.find((x) => x.attLead === att.id)!;
    E.authority = 50;
    answerCall(s, w, { war: war.id, member: victim.id, attacker: att.id, answer: 0 }, false);
    expect([47, 48.5]).toContain(+E.authority.toFixed(2));
    expect(E.authLog?.x_emp_ignored).toBeLessThan(0);
    // a fallen authority recovers through the old dignity of the crown
    E.authority = 5;
    expect(authorityDrift(s).find((r) => r[0] === 'x_emp_dignity')![1]).toBeCloseTo(0.5, 3);
    E.authority = before;
  });
});

describe('the imperial election', () => {
  it('electors vote, a human elector casts its own vote, and the most votes win', () => {
    const E = s.empire;
    const em = s.nations[E.emperor];
    const elector = E.electors.find((id) => id !== E.emperor)!;
    s.playerNations = [elector];
    em.flags.ruler_changed = s.day; E.lastElection = s.day - 1;
    month(empire);
    expect(E.election).toBeTruthy();
    expect(E.election!.candidates.length).toBeGreaterThan(1);
    // the human elector has no vote until it casts one
    expect(electorChoice(s, w, elector)).toBe(-1);
    const before = tally(s, w);
    const total = (t: Record<number, number>) => Object.values(t).reduce((p, x) => p + x, 0);
    expect(total(before)).toBe(E.electors.length - 1);
    const cand = E.election!.candidates.find((c) => c !== elector)!;
    expect(applyCommand(s, w, { t: 'empire', n: elector, action: 'vote', target: cand } as any).ok).toBe(true);
    const after = tally(s, w);
    expect(after[cand]).toBe((before[cand] ?? 0) + 1);
    expect(applyCommand(s, w, { t: 'empire', n: elector, action: 'vote', target: 99999 } as any).ok).toBe(false);
    // close it: no AI campaigning in between (poor candidates)
    for (const c of E.election!.candidates) s.nations[c].treasury = 0;
    E.election!.closes = s.day;
    const t = tally(s, w);
    const best = Math.max(...Object.values(t));
    month(empire);
    expect(E.election).toBeNull();
    expect(t[E.emperor]).toBe(best);
    s.playerNations = [];
  });
});

describe('the diet of the Empire', () => {
  it('a reform passes with a majority of the weighted votes, and fails without', () => {
    const E = s.empire;
    const em = s.nations[E.emperor];
    E.authority = 90; E.lastDiet = -1e9; E.diet = null;
    s.playerNations = [em.id];
    const r = nextReform(s)!;
    expect(applyCommand(s, w, { t: 'empire', n: em.id, action: 'summon_diet' } as any).ok).toBe(true);
    expect(E.diet!.proposal).toBe(r.id);
    // every voter is a player: two thirds of the weight vote for it
    const voters = dietVoters(s);
    s.playerNations = voters.slice();
    const total = voters.reduce((p, id) => p + dietWeight(s.nations[id]), 0);
    let yes = 0;
    for (const id of voters) { const y = yes < total * 0.66; if (y) yes += dietWeight(s.nations[id]); expect(applyCommand(s, w, { t: 'empire', n: id, action: 'diet_vote', yes: y } as any).ok).toBe(true); }
    const t = dietTally(s);
    expect(t.yes).toBeGreaterThan(t.no);
    expect(dietPasses(t)).toBe(true);
    E.diet!.ends = s.day;
    month(empire);
    expect(E.diet).toBeNull();
    expect(E.reforms).toContain(r.id);
    // the next one: most vote against
    const r2 = nextReform(s)!;
    E.lastDiet = -1e9; E.authority = 90;
    expect(applyCommand(s, w, { t: 'empire', n: em.id, action: 'summon_diet' } as any).ok).toBe(true);
    for (const id of voters) applyCommand(s, w, { t: 'empire', n: id, action: 'diet_vote', yes: id === em.id } as any);
    expect(dietPasses(dietTally(s))).toBe(false);
    E.diet!.ends = s.day;
    const a = E.authority;
    month(empire);
    expect(E.reforms).not.toContain(r2.id);
    expect(E.authority).toBeLessThan(a + 0.5);
    s.playerNations = [];
  });
});

describe('the League of the Northern Towns', () => {
  it('members gain trade from membership, which grows with the league', () => {
    month(empire);
    const lg = league(s)!;
    expect(lg).toBeTruthy();
    expect(lg.members.length).toBeGreaterThan(1);
    const m = s.nations[lg.members.find((id) => id !== lg.leader)!];
    const fx = leagueEffects(s, m);
    expect(fx.trade).toBeGreaterThanOrEqual(0.05);
    fresh(); const withLeague = lawEffect(m, 'trade');
    expect(leaveLeague(s, m)).toBeNull();
    fresh(); const without = lawEffect(m, 'trade');
    expect(withLeague - without).toBeCloseTo(fx.trade, 3);
    // fewer towns, a smaller bonus
    expect(leagueEffects(s, s.nations[lg.members[0]]).trade).toBeLessThanOrEqual(fx.trade);
    expect(joinLeague(s, w, m)).toBeNull();
    month(empire); fresh();
    expect(lawEffect(m, 'trade')).toBeCloseTo(withLeague, 3);
    expect(m.leagueMember).toContain(LEAGUE);
    // a crown far from the northern coasts may not join
    expect(joinLeague(s, w, nat('castile'))).toBe('only free towns of the northern coasts may join');
  });
});

describe('the great powers', () => {
  it('a great power intervenes for the weaker side of a war; others cannot', () => {
    month(powers);
    const gps = greatPowers(s);
    expect(gps.length).toBe(8);
    const busy = (id: number) => s.wars.some((x) => x.att.includes(id) || x.def.includes(id));
    // a great power falls on a small realm
    const att = s.nations[gps.find((id) => !busy(id))!];
    att.laws.diet = 0;
    const victim = s.nations.filter((n) => free(n) && !busy(n.id) && n.id !== att.id && !gps.includes(n.id) && n.capital >= 0 && att.capital >= 0 && w.distKm(att.capital, n.capital) < 1500)
      .sort((a, b) => nationDev(s, a.id) - nationDev(s, b.id)).find((n) => declareWar(s, w, att.id, n.id) === null)!;
    expect(victim).toBeTruthy();
    const war = s.wars.find((x) => x.attLead === att.id && x.goal.target === victim.id)!;
    expect(sumRows(balanceThreat(s, war))).toBeGreaterThan(-40);
    const small = s.nations.find((n) => free(n) && !gps.includes(n.id) && !war.att.includes(n.id) && !war.def.includes(n.id))!;
    expect(intervene(s, small, war)).toBe('only a great power can do this');
    const gp = s.nations[gps.find((id) => id !== att.id && intervene(s, s.nations[id], war) === null)!];
    expect(gp).toBeTruthy();
    expect(war.def).toContain(gp.id);
    expect(s.powers!.log.some((l) => l.gp === gp.id && l.kind === 'intervene')).toBe(true);
    expect(intervene(s, gp, war)).toBe('already in this war');
    // the great power status itself: a modifier
    expect(gp.modifiers.some((m) => m.id === 'great_power')).toBe(true);
  });
});

describe('forms of government', () => {
  it('a republic elects its head every few years and the term limit applies', () => {
    const v = nat('venice');
    expect(govProcess(v)).toBe('republic');
    ensureCandidates(s, w, v);
    const expected = electionTally(s, v).winner;
    const old = v.ruler; const term = v.flags.term ?? 1;
    v.flags.next_election = s.day;
    month(government);
    expect(v.flags.next_election).toBe(s.day + termYears(v) * 365);
    expect(v.flags.elect_margin).toBeGreaterThan(0);
    if (expected === old) expect(v.flags.term).toBe(term + 1);
    else { expect(v.ruler).toBe(expected); expect(v.flags.term).toBe(1); }
    // a head at the term limit may not stand again
    v.flags.term = TERM_LIMIT;
    const head = v.ruler;
    expect(ensureCandidates(s, w, v)).not.toContain(head);
    v.flags.next_election = s.day;
    month(government);
    expect(v.ruler).not.toBe(head);
    expect(v.flags.term).toBe(1);
  });
  it('an elective monarchy, a theocracy and a horde choose differently from a hereditary crown', () => {
    expect(govProcess(nat('france'))).toBe('heredity');
    expect(govProcess(nat('papal_states'))).toBe('clergy');
    expect(govProcess(nat('golden_horde'))).toBe('acclaim');
    const p = nat('france'); const keep = p.laws.succession;
    p.laws.succession = 2; expect(govProcess(p)).toBe('elective'); p.laws.succession = keep;
  });
});

describe('the Powers of the Realm', () => {
  it('influence follows the people and their means', () => {
    const f = nat('france');
    const cs = classSums(s);
    const base = influenceTargets(s, f, cs);
    expect(Object.values(base).reduce((p, x) => p + x, 0)).toBeCloseTo(100, 5);
    // three times as many artisans and burghers, with their savings
    const pop = cs.pop.slice(), wealth = cs.wealth.slice();
    for (const c of [2, 3]) { pop[f.id * cs.C + c] *= 3; wealth[f.id * cs.C + c] *= 3; }
    const more = influenceTargets(s, f, { pop, wealth, C: cs.C });
    expect(more.burghers).toBeGreaterThan(base.burghers + 3);
    expect(more.commons).toBeLessThan(base.commons);
    expect(more.magnates).toBeLessThan(base.magnates);
  });
});

describe('the assembly', () => {
  const setContent = (n: Nation, v: number) => { for (const e of n.estates) e.contentment = v; };
  it('binds the player: a war it refuses cannot be declared until it approves it', () => {
    const f = nat('england');
    s.playerNations = [f.id];
    f.laws.diet = 2; f.treasury = 100000; fresh();
    expect(lawEffect(f, 'war_vote')).toBeGreaterThan(0);
    setContent(f, 0);
    const target = s.nations.filter((n) => free(n) && n.id !== f.id && !n.isHRE && !hasCasusBelli(s, f.id, n.id) && !f.rivals.includes(n.id) && !s.wars.some((x) => (x.att.includes(n.id) || x.def.includes(n.id))))
      .sort((a, b) => nationDev(s, a.id) - nationDev(s, b.id))[0];
    expect(declareWar(s, w, f.id, target.id)).toBe('the assembly refused to fund the war');
    expect(s.wars.some((x) => x.attLead === f.id && x.goal.target === target.id)).toBe(false);
    // content Powers, bought votes: approved, and the war may be declared
    setContent(f, 50);
    const r = applyCommand(s, w, { t: 'assembly', n: f.id, kind: 'war', target: target.id, goal: 'conquest', bribe: f.estates.map((e) => e.id) } as any);
    expect(r.ok).toBe(true);
    expect(f.flags[`war_ok_${target.id}`]).toBeGreaterThan(s.day);
    expect(declareWar(s, w, f.id, target.id)).toBeNull();
    s.playerNations = [];
  });
  it('approves taxes above the granted level, for the player and the AI', () => {
    const f = nat('france');
    s.playerNations = [f.id];
    f.laws.diet = 1; f.flags.tax_grant = 0.1; f.treasury = 100000; fresh();
    f.taxRate = f.taxRate.map(() => 0.08);
    expect(lawEffect(f, 'tax_vote')).toBeGreaterThan(0);
    // below the granted level: no vote
    expect(setTaxRate(s, f, 0, 0.1)).toBeNull();
    expect(f.taxRate[0]).toBe(0.1);
    // already high taxes, and a heavy one on the nobles on top, with angry Powers: refused, the rates stay
    f.taxRate = f.taxRate.map(() => 0.2); f.flags.tax_grant = 0.2;
    setContent(f, 0);
    expect(setTaxRate(s, f, 5, 0.5)).toBe('the assembly refused the new taxes');
    expect(f.taxRate[5]).toBe(0.2);
    expect(f.flags.tax_grant).toBe(0.2);
    // a moderate rise with content Powers: granted, and the new level (with a little room) is the ceiling
    setContent(f, 100);
    const rates = f.taxRate.slice(); rates[0] = 0.25;
    expect(assemblyVote(s, f, { kind: 'tax', level: taxLevel(rates), rates }).passes).toBe(true);
    expect(setTaxRate(s, f, 0, 0.25)).toBeNull();
    expect(f.taxRate[0]).toBe(0.25);
    expect(f.flags.tax_grant).toBeCloseTo(taxLevel(rates) + 0.02, 4);
    // a request for every class moves all rates alike to the mean asked
    const all = askRates([0.05, 0.1, 0.15], -1, 0.2);
    expect(taxLevel(all)).toBeCloseTo(0.2, 4);
    expect(all[2] - all[0]).toBeCloseTo(0.1, 4);
    s.playerNations = [];
    // the AI: refused, it lowers its rates to what was granted
    const ai = nat('aragon');
    ai.laws.diet = 1; ai.flags.tax_grant = 0.1; ai.treasury = 0; delete ai.flags.tax_refused; fresh();
    ai.taxRate = ai.taxRate.map(() => 0.25);
    setContent(ai, 0);
    month(government);
    expect(taxLevel(ai.taxRate)).toBeCloseTo(0.1, 3);
    expect(ai.flags.tax_refused).toBeGreaterThan(s.day);
  });
});

describe('situations', () => {
  it('an action changes the progress of a situation, now and in its drivers', () => {
    const sit = s.situations.find((x) => x.id === 'horde_breaking' && x.active)!;
    expect(sit).toBeTruthy();
    const def = SITUATIONS.find((d) => d.id === 'horde_breaking')!;
    const horde = s.nations[sit.data.h];
    const lit = nat('lithuania'); lit.treasury = 100000;
    const recompute = () => { def.monthly!(s, w, sit, 1366, 3); return sit.progress; };
    const base = recompute();
    expect(situationAction(s, w, lit, 'horde_breaking', 'back_rival_khan')).toBeNull();
    expect(recompute()).toBe(Math.min(100, base + 10));
    expect(situationAction(s, w, lit, 'horde_breaking', 'back_rival_khan')).toBe('too soon');
    horde.authority = 100;
    expect(situationAction(s, w, horde, 'horde_breaking', 'purge_emirs')).toBeNull();
    expect(horde.authority).toBe(50);
    expect(recompute()).toBe(Math.max(0, base + 10 - 15));
    expect(situationAction(s, w, lit, 'horde_breaking', 'purge_emirs')).toBe('only the Horde can do this');
    // and by command, with the refusal returned to the player
    expect(applyCommand(s, w, { t: 'situation', n: lit.id, id: 'horde_breaking', action: 'nonsense' } as any).ok).toBe(false);
  });
});

describe('estate privileges and demands', () => {
  it('sixteen privileges, each resented by other Powers when granted', () => {
    expect(PRIVILEGES.length).toBeGreaterThanOrEqual(16);
    for (const p of PRIVILEGES) expect(Object.keys(p.resent ?? {}).length).toBeGreaterThan(0);
    const f = nat('portugal');
    const p = PRIVILEGES.find((x) => x.id === 'magnate_serfs')!;
    for (const e of f.estates) { e.contentment = 50; e.privileges = e.privileges.filter((x) => x !== p.id); }
    expect(grantPrivilege(s, f, p.id)).toBeNull();
    for (const [eid, dv] of Object.entries(p.resent!)) expect(estate(f, eid).contentment).toBe(50 + dv);
    // and the resentment lasts: it lowers where their contentment is heading
    for (const eid of Object.keys(p.resent!)) expect(resentment(f, eid)).toBeLessThan(0);
  });
  it('a refused demand angers the Power, and an influential one obstructs the crown', () => {
    const f = nat('portugal');
    const e = estate(f, 'magnates'); e.influence = 60; e.contentment = 50;
    const priv = PRIVILEGES.find((p) => p.estate === 'magnates' && !e.privileges.includes(p.id))!;
    f.demand = { estate: 'magnates', privilege: priv.id, until: s.day + 180 } as any;
    expect(applyCommand(s, w, { t: 'govern', n: f.id, action: 'refuse_demand' } as any).ok).toBe(true);
    expect(e.contentment).toBe(35);
    expect(f.modifiers.some((m) => m.id === 'obstruct_magnates')).toBe(true);
    expect(f.flags.snub_magnates).toBeGreaterThan(s.day);
    // the snubbed Power votes against the crown in the assembly
    expect(assemblyVote(s, f, { kind: 'tax', level: 0.2 }).estates.find((x) => x.id === 'magnates')!.rows.some((r) => r[0] === 'x_asm_snubbed')).toBe(true);
    expect(applyCommand(s, w, { t: 'govern', n: f.id, action: 'grant_demand' } as any).ok).toBe(false);
  });
});
