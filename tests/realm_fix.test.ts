// Fixes of the realm track: goals gated by a year never look done before it, the assembly's vote on taxes (class taxes
// weighted by what each class pays, the duties counted in the same level, bribes paid only for a yes), class taxes in
// the contentment of the Powers, the war vote put to the assembly, the own great-power rank, the diet lobbied member by
// member, situation actions that would do nothing refused, Bohemia's goals, and a human member asking the emperor for
// help.
import { describe, it, expect } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { advanceDay } from '../src/sim/engine';
import { DAY_EPOCH, mkCtx } from '../src/sim/ctx';
import { applyCommand } from '../src/sim/commands';
import { CL } from '../src/sim/defs';
import { DUTY_INDEX } from '../src/sim/systems/duties';
import { estate, politics } from '../src/sim/systems/politics';
import {
  taxWeights, taxLevel, taxLevelParts, classSums, assemblyVote, taxAsk, realmTaxLevel, classTaxDiscontent, contentParts, CUSTOM_RATE,
} from '../src/sim/systems/government';
import { dateToDay } from '../src/sim/calendar';
import { goalConditions, goalsFor } from '../src/sim/systems/goals';
import { answer } from '../src/game/view';
import type { GameState, Nation } from '../src/sim/types';

const w = loadWorld();
const s: GameState = createGame(w, loadSetup(1356), loadHubs(), 4243, { player: [] });
for (let i = 0; i < 40; i++) advanceDay(s, w);
const nat = (k: string) => s.nations.find((n) => n.key === k)!;
const fresh = () => { DAY_EPOCH.v++; };

describe('goals gated by a year', () => {
  it('a condition that counts only from a year on is never shown as done before it', () => {
    const b = nat('bohemia');
    const g = goalsFor(b).find((x) => x.id === 'bohemia.chalice')!;
    const keep = b.concord;
    try {
      b.concord = 40; // more than the 20 asked: the count is met, the year is not
      const [c] = goalConditions(s, w, b, g);
      expect(c.ok).toBe(false);
      expect(c.cur).toBe(40); expect(c.max).toBe(20);
      expect(c.from).toBe(1480);
      expect(c.yearsLeft).toBe(1480 - 1356);
      expect(c.frac).toBeLessThan(0.01);
      expect(c.frac).toBe(c.timeFrac);
      const v = (answer(s, w, b.id, { q: 'goals', nation: b.id } as any) as any[]).find((x) => x.id === g.id);
      expect(v.progress).toBeLessThan(0.01);
      expect(v.conds[0].frac).toBe(c.frac);
      // halfway to the year the progress is half, and from the year the count alone decides
      const day0 = s.day;
      try {
        s.day = dateToDay(1418, 1, 1, s.startYear);
        const half = goalConditions(s, w, b, g)[0];
        expect(half.frac).toBeCloseTo((1418 - 1356) / (1480 - 1356), 6);
        s.day = dateToDay(1480, 1, 2, s.startYear);
        const after = goalConditions(s, w, b, g)[0];
        expect(after.ok).toBe(true); expect(after.frac).toBe(1); expect(after.from).toBeUndefined();
      } finally { s.day = day0; }
    } finally { b.concord = keep; }
  });
});

describe('the assembly and the taxes', () => {
  const setContent = (n: Nation, v: number) => { for (const e of n.estates) e.contentment = v; };
  const human = (n: Nation, f: () => void) => { const keep = s.playerNations; s.playerNations = [n.id]; try { f(); } finally { s.playerNations = keep; } };
  it('weighs each class by its share of the means: half the peasants’ income counts for far more than the nobles’', () => {
    const b = nat('bohemia');
    const wts = taxWeights(b, classSums(s));
    expect(wts.reduce((p, x) => p + x, 0)).toBeCloseTo(1, 9);
    const base = b.taxRate.slice();
    const peas = base.slice(); peas[CL.peasants] = 0.5;
    const nob = base.slice(); nob[CL.nobles] = 0.5;
    const lvPeas = taxLevel(peas, wts), lvNob = taxLevel(nob, wts), lv0 = taxLevel(base, wts);
    // the old plain mean counted 50 % on the peasants as about 12 %
    expect(taxLevel(peas)).toBeLessThan(0.13);
    expect(lvPeas).toBeGreaterThan(0.3);
    expect(lvPeas - lv0).toBeCloseTo((0.5 - base[CL.peasants]) * wts[CL.peasants], 9);
    expect(lvNob - lv0).toBeLessThan((lvPeas - lv0) / 4);
    // the rows of the breakdown add up to the level, the duties included
    const du = { land: 0.05, hearth: 0.5, excise: 0.02 };
    const rows = taxLevelParts(peas, wts, du);
    expect(rows.reduce((p, r) => p + r[1], 0)).toBeCloseTo(taxLevel(peas, wts, du), 12);
  });
  it('bribes are paid only for a yes, and a failed vote leaves the rates and the treasury as they were', () => {
    const b = nat('bohemia');
    human(b, () => {
      b.laws.diet = 1; b.flags.tax_grant = 0.1; b.treasury = 100000; fresh();
      setContent(b, 0);
      const rates0 = b.taxRate.slice(), t0 = b.treasury, gifts0 = b.expenseAcc.gifts ?? 0;
      const r = applyCommand(s, w, { t: 'assembly', n: b.id, kind: 'tax', cls: CL.nobles, rate: 0.5, bribe: ['magnates'] } as any);
      expect(r.ok).toBe(false);
      expect(r.err).toBe('the assembly refused the new taxes');
      expect(b.treasury).toBe(t0);
      expect(b.expenseAcc.gifts ?? 0).toBe(gifts0);
      expect(b.taxRate).toEqual(rates0);
      // content Powers and bought votes: a yes, and only then the gold is paid
      setContent(b, 100);
      const all = b.estates.map((e) => e.id);
      const ask = taxAsk(s, b, CL.peasants, 0.2) as Exclude<ReturnType<typeof taxAsk>, string>;
      const v = assemblyVote(s, b, { kind: 'tax', level: ask.level, rates: ask.rates, duties: ask.duties }, all);
      expect(v.passes).toBe(true);
      const ok = applyCommand(s, w, { t: 'assembly', n: b.id, kind: 'tax', cls: CL.peasants, rate: 0.2, bribe: all } as any);
      expect(ok.ok).toBe(true);
      expect(b.treasury).toBeCloseTo(t0 - v.cost, 6);
      expect(b.taxRate[CL.peasants]).toBe(0.2);
      expect(b.flags.tax_grant).toBeCloseTo(ask.level + 0.02, 4);
      b.taxRate = rates0; b.flags.tax_grant = 0.1;
    });
  });
  it('the duties count in the level the assembly grants: a rise above it needs its vote', () => {
    const b = nat('bohemia');
    human(b, () => {
      b.laws.diet = 1; b.flags.tax_grant = 0.1; b.duties = { land: 0, hearth: 0, excise: 0 }; b.treasury = 100000; fresh();
      setContent(b, 0);
      const lv0 = realmTaxLevel(s, b);
      expect(lv0).toBeLessThan(0.1);
      // within the grant: no vote
      expect(applyCommand(s, w, { t: 'budget', n: b.id, key: 'land', value: 0.02 } as any).ok).toBe(true);
      expect(b.duties!.land).toBeCloseTo(0.02, 9);
      expect(realmTaxLevel(s, b)).toBeCloseTo(lv0 + 0.02 * DUTY_INDEX.land.level, 9);
      // all three at their highest pass the grant: the angry assembly refuses, and nothing changes
      expect(applyCommand(s, w, { t: 'budget', n: b.id, key: 'land', value: 0.1 } as any).ok).toBe(true); // 0.1 x 0.4 = 4 points: still within
      const r = applyCommand(s, w, { t: 'budget', n: b.id, key: 'hearth', value: 1 } as any);
      expect(r.ok).toBe(false); expect(r.err).toBe('the assembly refused the new taxes');
      expect(b.duties!.hearth).toBe(0);
      // the Powers that pay a duty name it among their reasons
      const ask = taxAsk(s, b, undefined, undefined, 'hearth', 1) as Exclude<ReturnType<typeof taxAsk>, string>;
      const v = assemblyVote(s, b, { kind: 'tax', level: ask.level, rates: ask.rates, duties: ask.duties });
      expect(v.estates.find((e) => e.id === 'commons')!.rows.some((x) => x[0] === 'x_asm_duties')).toBe(true);
      // content Powers grant it; the command tells the yes back
      setContent(b, 100);
      const ok = applyCommand(s, w, { t: 'budget', n: b.id, key: 'hearth', value: 1 } as any);
      expect(ok.ok).toBe(true);
      expect(ok.msg?.de).toMatch(/Steuerlast/);
      expect(b.duties!.hearth).toBe(1);
      expect(b.flags.tax_grant).toBeCloseTo(realmTaxLevel(s, b) + 0.02, 4);
      // lowering never needs a vote
      setContent(b, 0);
      expect(applyCommand(s, w, { t: 'budget', n: b.id, key: 'hearth', value: 0 } as any).ok).toBe(true);
      b.duties = { land: 0, hearth: 0, excise: 0 }; b.flags.tax_grant = 0.1;
    });
  });
  it('class taxes above the customary rates lower the contentment the Powers drift toward, and the rows add up', () => {
    const b = nat('bohemia');
    const cs = classSums(s);
    const keep = b.taxRate.slice();
    try {
      b.taxRate = CUSTOM_RATE.slice(); fresh();
      for (const e of b.estates) expect(classTaxDiscontent(b, e.id, cs)).toBeCloseTo(0, 9);
      b.taxRate[CL.peasants] = 0.5; fresh();
      const commons = classTaxDiscontent(b, 'commons', cs), magnates = classTaxDiscontent(b, 'magnates', cs), burghers = classTaxDiscontent(b, 'burghers', cs);
      expect(commons).toBeGreaterThan(30);           // the peasants are most of the commons' means
      expect(magnates).toBeCloseTo(0.44 * 0.15 * 100, 6); // the lords live from the peasants' dues
      expect(burghers).toBe(0);
      // the estates tooltip shows the same rows the drift uses
      const ex = (answer(s, w, b.id, { q: 'realm' } as any) as any).explain.estates.find((x: any) => x.id === 'commons');
      expect(ex.contentParts.some((r: any) => r[0] === 'x_class_taxes' && Math.abs(r[1] + commons) < 1e-9)).toBe(true);
      expect(ex.contentTarget).toBeCloseTo(ex.contentParts.reduce((p: number, r: any) => p + r[1], 0), 9);
      const e = estate(b, 'commons'); e.contentment = 50;
      const target = contentParts(b, 'commons', cs).reduce((p, r) => p + r[1], 0);
      politics.monthly!(mkCtx(s, w));
      expect(e.contentment).toBeLessThan(50);
      expect(target).toBeLessThan(50 - 30);
    } finally { b.taxRate = keep; fresh(); }
  });
});

describe('our own great-power standing', () => {
  it('the powers view names our rank, score and the points to the last great power, and the goal counts them', () => {
    // a realm well down the ranking: its row is shown below the fourteen
    const all = s.nations.filter((x) => x.alive && x.overlord < 0).sort((a, b) => b.score - a.score);
    const isGPCond = (c: { t: { en: string } }) => c.t.en === 'be counted among the great powers';
    const idx = all.findIndex((x, i) => i >= 15 && goalsFor(x).some((gl) => gl.conds.some(isGPCond)));
    const low = all[idx];
    const g = answer(s, w, low.id, { q: 'powers' } as any) as any;
    expect(g.mine.rank).toBe(idx + 1);
    expect(g.mine.score).toBe(low.score);
    expect(g.mine.isGP).toBe(false);
    const last = s.nations[s.ranking[s.ranking.length - 1]];
    expect(g.mine.lastGP.id).toBe(last.id);
    expect(g.mine.gap).toBeCloseTo(last.score - low.score, 9);
    expect(g.mine.parts.reduce((p: number, r: any) => p + r[1], 0)).toBeCloseTo(low.score, 6);
    expect(g.ranking.length).toBe(15);
    expect(g.ranking[14]).toMatchObject({ id: low.id, rank: idx + 1, mine: true });
    // the goal "be counted among the great powers" counts our score against the eighth
    const goal = goalsFor(low).find((x) => x.conds.some(isGPCond))!;
    const c = goalConditions(s, w, low, goal).find(isGPCond)!;
    expect(c.ok).toBe(false);
    expect(c.cur).toBe(Math.round(low.score)); expect(c.max).toBe(Math.round(last.score));
    expect(c.frac).toBeGreaterThan(0); expect(c.frac).toBeLessThan(1);
    // a great power sees the points to the realm above
    const gp = s.nations[s.ranking[3]];
    const g2 = answer(s, w, gp.id, { q: 'powers' } as any) as any;
    expect(g2.mine.isGP).toBe(true); expect(g2.mine.rank).toBe(4);
    expect(g2.mine.next.id).toBe(s.ranking[2]);
  });
});

describe('the diet lobbied member by member', () => {
  it('the emperor can sway any voting member while the diet sits, at a cost scaled by its size', async () => {
    const { dietVoters, dietStance, campaignCost, lobbyCost, nextReform } = await import('../src/sim/systems/empire');
    const { nationDev } = await import('../src/sim/systems/war');
    const E = s.empire; const em = s.nations[E.emperor];
    const r = nextReform(s)!;
    const voters = dietVoters(s).filter((id) => id !== em.id && !E.electors.includes(id));
    const small = s.nations[voters.reduce((a, b) => (nationDev(s, a) <= nationDev(s, b) ? a : b))];
    const big = s.nations[voters.reduce((a, b) => (nationDev(s, a) >= nationDev(s, b) ? a : b))];
    const keepDiet = E.diet, keepFav = { ...(E.favour ?? {}) }, keepT = em.treasury, keepP = s.playerNations;
    try {
      s.playerNations = [em.id]; em.treasury = 1e6;
      // without a sitting diet only electors can be given gifts
      E.diet = null;
      expect(applyCommand(s, w, { t: 'empire', n: em.id, action: 'campaign', target: small.id } as any).err).toBe('not an elector');
      E.diet = { proposal: r.id, votesFor: [], votesAgainst: [], ends: s.day + 60, by: em.id } as any;
      // a small member costs a fraction of the campaign cost, the greatest prince more; an elector at least the full cost
      expect(lobbyCost(s, em, small)).toBeLessThan(campaignCost(s, em) * 0.25);
      expect(lobbyCost(s, em, big)).toBeGreaterThan(lobbyCost(s, em, small) * 3);
      const el = s.nations[E.electors.find((x) => x !== em.id && dietVoters(s).includes(x))!];
      expect(lobbyCost(s, em, el)).toBeGreaterThanOrEqual(Math.round(campaignCost(s, em)));
      const t0 = em.treasury, cost = lobbyCost(s, em, small);
      const before = dietStance(s, small, r).find((x) => x[0] === 'x_el_gifts')?.[1] ?? 0;
      expect(applyCommand(s, w, { t: 'empire', n: em.id, action: 'campaign', target: small.id } as any).ok).toBe(true);
      expect(em.treasury).toBeCloseTo(t0 - cost, 6);
      expect(dietStance(s, small, r).find((x) => x[0] === 'x_el_gifts')![1]).toBe(before + 15);
      // the empire view lists every voter with its reasons, and the lobbying cost for the emperor
      const v = answer(s, w, em.id, { q: 'empire' } as any) as any;
      expect(v.dietMembers.length).toBe(dietVoters(s).length);
      const row = v.dietMembers.find((x: any) => x.id === small.id);
      expect(row.cost).toBe(lobbyCost(s, em, small));
      expect(row.favour).toBe(before + 15);
      expect(row.sum).toBeCloseTo(dietStance(s, small, r).reduce((p, x) => p + x[1], 0), 9);
      // another member sees the votes and reasons, but no lobbying
      const other = answer(s, w, small.id, { q: 'empire' } as any) as any;
      expect(other.dietMembers.every((x: any) => x.cost === null)).toBe(true);
    } finally { E.diet = keepDiet; E.favour = keepFav; em.treasury = keepT; s.playerNations = keepP; }
  });
});

describe('a member asks the emperor for help', () => {
  it('a human member attacked from outside asks once per war, under the rule of the call at a declaration; AI members ask too', async () => {
    const { helpRefusal, empire, isHuman } = await import('../src/sim/systems/empire');
    const { newId } = await import('../src/sim/ctx');
    const E = s.empire; const em = s.nations[E.emperor];
    const outsider = s.nations.find((x) => x.alive && !x.isHRE && x.overlord < 0 && x.key === 'hungary')!;
    const members = s.nations.filter((x) => x.alive && x.isHRE && x.overlord < 0 && x.id !== em.id && !s.wars.some((q) => q.att.includes(x.id) || q.def.includes(x.id)));
    const [m, m2] = members;
    // a war from before the game (no call was made when it was declared)
    const mk = (att: number, def: number) => ({ id: newId(s), name: { en: 'Test war', de: 'Testkrieg' }, att: [att], def: [def], attLead: att, defLead: def, goal: { type: 'conquest', target: def, locs: [] }, start: s.day, score: 0, battleScore: 0, tickScore: 0, battles: 0, lossesA: 0, lossesD: 0, offers: [] } as any);
    const war = mk(outsider.id, m.id), war2 = mk(outsider.id, m2.id), inner = mk(m2.id, m.id);
    const keep = { wars: s.wars.slice(), calls: (E.calls ?? []).slice(), players: s.playerNations, auth: E.authority, prestige: em.prestige };
    try {
      s.wars.push(war, war2, inner); s.playerNations = [m.id];
      expect(isHuman(s, m.id)).toBe(true);
      // the view offers the request, with what the emperor weighs
      const v = answer(s, w, m.id, { q: 'empire' } as any) as any;
      const hw = v.helpWars.find((x: any) => x.war === war.id);
      expect(hw.refusal).toBeNull(); expect(hw.answer).toBeNull(); expect(hw.rows.length).toBeGreaterThan(2);
      expect(v.helpWars.find((x: any) => x.war === inner.id).refusal).toBe('the attacker is a member of the Empire');
      // the AI emperor answers at once by the same score as for a declared war, and says so
      const yes = hw.rows.reduce((p: number, r: any) => p + r[1], 0) > 0;
      const r = applyCommand(s, w, { t: 'empire', n: m.id, action: 'ask_help', war: war.id } as any);
      expect(r.ok).toBe(true);
      expect(r.msg?.de).toMatch(yes ? /greift für uns/ : /lehnt es ab/);
      const call = E.calls!.find((c) => c.war === war.id && c.member === m.id)!;
      expect(call.answer).toBe(yes ? 1 : -1);
      expect(war.def.includes(em.id)).toBe(yes);
      // once per war
      expect(applyCommand(s, w, { t: 'empire', n: m.id, action: 'ask_help', war: war.id } as any).err).toBe('the emperor was already called to this war');
      expect(helpRefusal(s, m, inner)).toBe('the attacker is a member of the Empire');
      // the emperor's own war: no one to ask
      expect(helpRefusal(s, em, mk(outsider.id, em.id))).toBe('there is no emperor to ask');
      // an AI member in the same place asks at the monthly reckoning
      expect(helpRefusal(s, m2, war2)).toBeNull();
      empire.monthly!(mkCtx(s, w));
      expect(E.calls!.some((c) => c.war === war2.id && c.member === m2.id)).toBe(true);
    } finally {
      s.wars = keep.wars; E.calls = keep.calls; s.playerNations = keep.players; E.authority = keep.auth; em.prestige = keep.prestige;
    }
  });
});

describe('situation actions that would do nothing are refused; the code of the Bohemian crown', () => {
  it('closing the gates or holding processions needs a wave of plague near us; protecting preachers needs places of the old faith', async () => {
    const { SIT_EXTRA } = await import('../src/sim/content/situation_actions');
    const { sitActionRefusal } = await import('../src/sim/systems/situations');
    const sit = s.situations.find((x) => x.id === 'great_pestilence')!;
    const b = nat('bohemia');
    const q = SIT_EXTRA.great_pestilence.actions.find((a) => a.id === 'quarantine')!;
    const pr = SIT_EXTRA.great_pestilence.actions.find((a) => a.id === 'processions')!;
    const stage0 = sit.stage, P = s.loc.plague.slice();
    try {
      b.treasury = 1e6; b.authority = 500;
      sit.stage = 0; s.loc.plague.fill(0);
      expect(sitActionRefusal(s, w, b, sit, q)).toBe('no wave of plague is under way');
      expect(sitActionRefusal(s, w, b, sit, pr)).toBe('no wave of plague is under way');
      // a wave far away (in a place over 800 km from Prague, not ours)
      sit.stage = 1;
      const far = [...Array(w.L).keys()].find((l) => s.loc.owner[l] >= 0 && s.loc.owner[l] !== b.id && w.distKm(b.capital, l) > 1500)!;
      s.loc.plague[far] = 0.5;
      expect(sitActionRefusal(s, w, b, sit, q)).toBe('the plague is far from our realm');
      // the plague in our own land
      s.loc.plague[b.capital] = 0.5;
      expect(sitActionRefusal(s, w, b, sit, q)).toBeNull();
      expect(sitActionRefusal(s, w, b, sit, pr)).toBeNull();
    } finally { sit.stage = stage0; s.loc.plague.set(P); }
    // the reformation's preachers: only a realm with places of the old faith gains or loses anything
    const ref = { id: 'reformation', active: true, progress: 0, stage: 0, started: 0, data: {} } as any;
    const pp = SIT_EXTRA.reformation.actions.find((a) => a.id === 'protect_preachers')!;
    const orth = s.nations.find((x) => x.alive && x.key === 'muscovy') ?? s.nations.find((x) => x.alive && x.faith !== b.faith)!;
    orth.authority = 500;
    expect(sitActionRefusal(s, w, orth, ref, pp)).toBe('none of our places hold the old faith');
    expect(sitActionRefusal(s, w, b, ref, pp)).toBeNull();
  });
  it('the code starts with the game; its rows are its bar; judges carry it, foreign gold buries it, and it can be proclaimed from 30', async () => {
    const { SIT_EXTRA } = await import('../src/sim/content/situation_actions');
    const { situationAction } = await import('../src/sim/systems/situations');
    const { kingsCodeRows, kingsCodeLevel } = await import('../src/sim/content/situations');
    const b = nat('bohemia');
    const sit = s.situations.find((x) => x.id === 'kings_code')!;
    expect(sit).toBeTruthy(); expect(sit.active).toBe(true); expect(sit.data.b).toBe(b.id);
    const keep = JSON.parse(JSON.stringify(sit)); const keepB = { auth: b.authority, tr: b.treasury, mods: b.modifiers.slice(), prestige: b.prestige, mag: estate(b, 'magnates').contentment };
    try {
      b.treasury = 1e6; b.authority = 200;
      sit.progress = kingsCodeLevel(s, sit);
      const rows = kingsCodeRows(s, sit);
      expect(Math.round(rows.reduce((p, r) => p + r[1], 0))).toBe(sit.progress);
      const v = answer(s, w, b.id, { q: 'situation', id: 'kings_code' } as any) as any;
      expect(v.drivers.rows.length).toBe(rows.length);
      expect(v.actions.find((a: any) => a.id === 'back_lords').refusal).toBe('we cannot back the lords against ourselves');
      // judges: +20 (the magnates' displeasure costs back 2.5)
      const p0 = sit.progress;
      expect(situationAction(s, w, b, 'kings_code', 'royal_judges')).toBeNull();
      expect(sit.progress).toBeGreaterThanOrEqual(p0 + 17);
      // a rival's gold for the lords pulls it down
      const rival = s.nations.find((x) => x.alive && x.key === 'hungary')!; rival.treasury = 1e6;
      const p1 = sit.progress;
      expect(situationAction(s, w, rival, 'kings_code', 'back_lords')).toBeNull();
      expect(sit.progress).toBe(p1 - 20);
      expect(sit.data.backers).toContain(rival.id);
      expect(SIT_EXTRA.kings_code.sides(s, w, sit)[1].members).toContain(rival.id);
      // below 30 the code cannot be proclaimed; with the judges everywhere and the lords left alone it can
      sit.data.league = 0; sit.data.judges = 40; sit.progress = kingsCodeLevel(s, sit);
      if (sit.progress < 30) { estate(b, 'magnates').contentment = 100; sit.progress = kingsCodeLevel(s, sit); }
      expect(sit.progress).toBeGreaterThanOrEqual(30);
      sit.data.judges = 0; const low = kingsCodeLevel(s, sit); sit.progress = low;
      if (low < 30) expect(situationAction(s, w, b, 'kings_code', 'proclaim')).toBe('the code is not yet strong enough to proclaim');
      sit.data.judges = 40; sit.progress = kingsCodeLevel(s, sit);
      expect(situationAction(s, w, b, 'kings_code', 'proclaim')).toBeNull();
      expect(sit.active).toBe(false); expect(sit.outcome).toBe('proclaimed');
      expect(b.modifiers.some((m) => m.id === 'kings_code' && m.effects.authority_gain === 0.1)).toBe(true);
    } finally {
      for (const k of Object.keys(sit)) delete (sit as any)[k]; Object.assign(sit, keep); b.authority = keepB.auth; b.treasury = keepB.tr; b.modifiers = keepB.mods; b.prestige = keepB.prestige; estate(b, 'magnates').contentment = keepB.mag; delete s.flags.kings_code_done;
    }
  });
  it('two years with the lords below -40 force the code to be withdrawn', async () => {
    const { SITUATIONS } = await import('../src/sim/content/situations');
    const b = nat('bohemia');
    const sit = s.situations.find((x) => x.id === 'kings_code')!;
    const d = SITUATIONS.find((x) => x.id === 'kings_code')!;
    const keep = JSON.parse(JSON.stringify(sit)); const keepB = { mods: b.modifiers.slice(), prestige: b.prestige, mag: estate(b, 'magnates').contentment };
    try {
      sit.data.league = 40; estate(b, 'magnates').contentment = 0;
      for (let i = 0; i < 30 && sit.active; i++) { sit.data.league = 40; estate(b, 'magnates').contentment = 0; d.monthly(s, w, sit, 1360, 1); }
      expect(sit.active).toBe(false); expect(sit.outcome).toBe('withdrawn');
      expect(b.modifiers.some((m) => m.id === 'lords_liberties')).toBe(true);
    } finally { for (const k of Object.keys(sit)) delete (sit as any)[k]; Object.assign(sit, keep); b.modifiers = keepB.mods; b.prestige = keepB.prestige; estate(b, 'magnates').contentment = keepB.mag; delete s.flags.kings_code_done; }
  });
});

describe('the select screen and the administration', () => {
  it('the realm lites mark the emperor and the electors (the select screen lists them)', async () => {
    const { nationLites } = await import('../src/game/view');
    const lites = nationLites(s, w);
    expect(lites.filter((x) => x.emperor).map((x) => x.id)).toEqual([s.empire.emperor]);
    expect(lites.find((x) => x.key === 'bohemia')!.emperor).toBe(true);
    expect(lites.filter((x) => x.elector).length).toBe(s.empire.electors.length);
  });
  it('the administration tells the integrated land beside the load of land still being integrated', async () => {
    const { adminInfo } = await import('../src/sim/systems/administration');
    const { ownedLocs } = await import('../src/sim/systems/war');
    const b = nat('bohemia');
    const a = adminInfo(s, w, b);
    let core = 0, load = 0; for (const l of ownedLocs(s, b.id)) { if (s.loc.integ[l] >= 1) core += s.loc.dev[l]; else load += Math.max(1, s.loc.dev[l]) * (1 - s.loc.integ[l]); }
    expect(a.core).toBeCloseTo(core, 6); expect(a.load).toBeCloseTo(load, 6);
    expect(a.core).toBeGreaterThan(0);
  });
});
