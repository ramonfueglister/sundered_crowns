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
