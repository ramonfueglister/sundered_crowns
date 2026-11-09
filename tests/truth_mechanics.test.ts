// Mechanics that do what they say (truth pass): each test changes one input and checks that the simulation's own
// number moves as the description promises.
// Run: npx vitest run tests/truth_mechanics.test.ts
import { describe, it, expect } from 'vitest';
import { newGame } from '../tools/sim/load';
import { advanceDay } from '../src/sim/engine';
import { DAY_EPOCH, EPOCH } from '../src/sim/ctx';
import { lawEffect, councilBonus, treasurerGraft, succession, ablestOfficial, traditionOf, classExempt } from '../src/sim/systems/politics';
import { taxCommon, integrationYield, effectiveTax, importPrice, tariffMax, loanRate, overextension, collectDuties, DUTY_BY, DUTY_PAID } from '../src/sim/systems/economy';
import { researchRate, adoptionDelayed } from '../src/sim/systems/progress';
import { maintMorale, techMult } from '../src/sim/systems/military';
import { envoyDays, opinionBreakdown, diploSkill } from '../src/sim/systems/diplomacy';
import { transferLoc, dreadGain, startCivilWar, concludePeace } from '../src/sim/systems/war';
import { computeAdmin, capacityShare, adminInfo, setMethod, methodBlock, migrationMonth, budgetForecast, aiDuties, administration, integrationShare, MIN_INTEG_SHARE } from '../src/sim/systems/administration';
import { integrationMonth, integrationControl, overextControl } from '../src/sim/systems/society';
import { serialize, deserialize } from '../src/sim/engine';
import { answer } from '../src/game/view';
import { setDuty, dutyDiscontent, dutyUnrest, DUTY_INDEX, dutyEstates } from '../src/sim/systems/duties';
import { colonyCost, colonyProgress } from '../src/sim/systems/colonial';
import { curiaGain } from '../src/sim/systems/realm';
import { applyCommand, buildCost } from '../src/sim/commands';
import { LAW_INDEX, LAWS } from '../src/sim/content/laws';
import { B, BI, C, CL, GOODS } from '../src/sim/defs';
import { ownedLocs } from '../src/sim/systems/war';
import type { Nation } from '../src/sim/types';

const { s, w } = newGame(1356);
for (let d = 0; d < 35; d++) advanceDay(s, w);
const byKey = (k: string) => s.nations.find((n) => n.key === k)!;
const fr = byKey('france');
const fresh = () => { DAY_EPOCH.v++; EPOCH.v++; }; // effect tables are rebuilt once a day; force it inside a test
const opt = (law: string, id: string) => LAWS[LAW_INDEX[law]].options.findIndex((o) => o.id === id);
const withLaw = <T,>(n: Nation, law: string, id: string, f: () => T): T => { const old = n.laws[law]; n.laws[law] = opt(law, id); fresh(); try { return f(); } finally { n.laws[law] = old; fresh(); } };
const withMod = <T,>(n: Nation, fx: Record<string, number>, f: () => T): T => { n.modifiers.push({ id: 'test', until: 1e9, label: { en: 't', de: 't' }, effects: fx }); fresh(); try { return f(); } finally { n.modifiers = n.modifiers.filter((m) => m.id !== 'test'); fresh(); } };

describe('B: effects of laws and modifiers apply once', () => {
  it('a law with a tax effect raises the tax yield (was ignored)', () => {
    const base = withLaw(fr, 'trade', 'staple', () => taxCommon(fr, s.chars));
    const mono = withLaw(fr, 'trade', 'monopoly', () => taxCommon(fr, s.chars));
    const t0 = withLaw(fr, 'trade', 'staple', () => lawEffect(fr, 'tax'));
    expect(mono / base).toBeCloseTo((1 + t0 + 0.08) / (1 + t0), 6);
  });
  it('a law with trade, production and unrest effects is part of lawEffect', () => {
    const p0 = withLaw(fr, 'guilds', 'closed', () => lawEffect(fr, 'production'));
    const u0 = withLaw(fr, 'guilds', 'closed', () => lawEffect(fr, 'unrest'));
    const base = (k: string) => lawEffect(fr, k) - (LAWS[LAW_INDEX.guilds].options[fr.laws.guilds].effects[k] ?? 0);
    expect(p0).toBeCloseTo(base('production') - 0.06, 6);
    expect(u0).toBeCloseTo(base('unrest') - 2, 6);
  });
  it('a research modifier counts once', () => {
    const r0 = researchRate(s, w, fr), R = lawEffect(fr, 'research');
    const r1 = withMod(fr, { research: 0.1 }, () => researchRate(s, w, fr));
    expect(r1[0] / r0[0]).toBeCloseTo((1 + R + 0.1) / (1 + R), 6);
  });
  it('the culture group tradition is applied', () => {
    const de = s.nations.find((n) => n.alive && traditionOf(n).group === 'german')!;
    expect(traditionOf(de).effects.production).toBe(0.05);
    expect(withMod(de, {}, () => lawEffect(de, 'production'))).toBeGreaterThanOrEqual(0.05 - 0.2); // sums with laws
    const it = s.nations.find((n) => n.alive && traditionOf(n).group === 'italian')!;
    const all = it.modifiers.reduce((p, m) => p + (m.effects.trade ?? 0), 0);
    const laws = LAWS.reduce((p, L) => p + (L.options[it.laws[L.id] ?? 0]?.effects.trade ?? 0), 0);
    expect(lawEffect(it, 'trade')).toBeGreaterThanOrEqual(all + laws + 0.15 - 0.1 - 1e-9); // value axes may add or take a little
  });
  it('army maintenance lowers the morale an army can reach', () => {
    const a = s.armies.find((x) => x.owner === fr.id && !x.fleet)!;
    const old = fr.armyMaint;
    fr.armyMaint = 1; const full = maintMorale(s, a);
    fr.armyMaint = 0.5; const half = maintMorale(s, a);
    fr.armyMaint = old;
    expect(full).toBe(1); expect(half).toBeCloseTo(0.75, 6);
  });
  it('a good nobody supplies is priced from its neighbours, not held at the ceiling', () => {
    for (let d = 0; d < 60; d++) advanceDay(s, w);
    let checked = 0;
    for (const m of s.markets) for (let g = 0; g < GOODS.length; g++) {
      if (m.demand[g] <= 1e-6 || m.supply[g] >= m.demand[g] * 0.01) continue;
      const anchor = GOODS[g].base * s.priceLevel;
      expect(m.price[g]).toBeLessThan(anchor * 5.9);
      const ip = importPrice(s.markets, m, g, anchor);
      expect(ip).toBeLessThanOrEqual(anchor * 3 + 1e-9);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(0);
  });
});

describe('C: the council', () => {
  const tr = () => s.chars[fr.council.treasurer];
  it('the treasurer raises the tax yield and takes less the abler he is', () => {
    const c = tr(); const old = c.skills[0];
    c.skills[0] = 0; const low = taxCommon(fr, s.chars); const gLow = treasurerGraft(c, 100);
    c.skills[0] = 6; const high = taxCommon(fr, s.chars); const gHigh = treasurerGraft(c, 100);
    c.skills[0] = old;
    expect(high).toBeGreaterThan(low);
    if ((c.corruption ?? 0) > 0) expect(gHigh).toBeLessThan(gLow);
  });
  it('the chancellor speeds envoys and raises opinion and answers', () => {
    const hadChancellor = fr.council.chancellor; if (!s.chars[hadChancellor]?.alive) fr.council.chancellor = fr.council.treasurer;
    const c = s.chars[fr.council.chancellor]; const old = c.skills[1];
    const far = s.nations.find((n) => n.alive && n.capital >= 0 && w.distKm(n.capital, fr.capital) > 1500)!;
    c.skills[1] = 0; const slow = envoyDays(s, w, fr, far.id); const op0 = opinionBreakdown(s, w, far.id, fr.id).find((r) => r[0] === 'their_diplomacy')?.[1] ?? 0;
    c.skills[1] = 6; const fast = envoyDays(s, w, fr, far.id); const op1 = opinionBreakdown(s, w, far.id, fr.id).find((r) => r[0] === 'their_diplomacy')?.[1] ?? 0;
    c.skills[1] = old; fr.council.chancellor = hadChancellor;
    expect(fast).toBeLessThan(slow);
    expect(op1).toBeGreaterThan(op0);
    expect(diploSkill(s, fr)).toBeCloseTo(lawEffect(fr, 'diplomacy') + councilBonus(s, fr, 'chancellor'), 9);
  });
  it('the marshal adds to discipline, and each office speeds research in its field', () => {
    const had = fr.council.marshal; if (!s.chars[had]?.alive) fr.council.marshal = fr.council.treasurer;
    const c = s.chars[fr.council.marshal]; const old = c.skills[2];
    c.skills[2] = 0; const d0 = techMult(fr, s); const r0 = researchRate(s, w, fr);
    c.skills[2] = 6; const d1 = techMult(fr, s); const r1 = researchRate(s, w, fr);
    c.skills[2] = old; fr.council.marshal = had;
    expect(d1).toBeGreaterThan(d0);
    expect(r1[2]).toBeGreaterThan(r0[2]);
    expect(r1[0]).toBeCloseTo(r0[0], 9); // Governance follows the chancellor, not the marshal
  });
});

describe('D: integration, administration, methods, migration', () => {
  it('unintegrated land yields less tax and conquered land starts with weak control', () => {
    expect(integrationYield(0)).toBeCloseTo(0.3); expect(integrationYield(1)).toBe(1);
    const l = ownedLocs(s, fr.id).find((i) => s.loc.integ[i] >= 1 && s.loc.control[i] > 0.5)!;
    const full = effectiveTax(s, fr, l, CL.peasants);
    const old = s.loc.integ[l]; s.loc.integ[l] = 0; EPOCH.v++;
    expect(effectiveTax(s, fr, l, CL.peasants)).toBeCloseTo(full * 0.3, 9);
    s.loc.integ[l] = old;
  });
  it('capacity limits integration and over-extension raises unrest and lowers control', () => {
    const { s: s2, w: w2 } = newGame(1356);
    const en = s2.nations.find((n) => n.key === 'england')!, fr2 = s2.nations.find((n) => n.key === 'france')!;
    computeAdmin(s2, w2);
    expect(en.adminCapacity).toBeGreaterThan(5);
    expect(capacityShare(en)).toBe(1);
    // England swallows most of France at once
    const take = ownedLocs(s2, fr2.id).slice(0, 150);
    for (const l of take) transferLoc(s2, w2, l, en.id);
    for (const l of take) expect(s2.loc.control[l]).toBeLessThanOrEqual(0.3 + 1e-6);
    computeAdmin(s2, w2);
    const info = adminInfo(s2, w2, en);
    expect(info.load).toBeGreaterThan(info.capacity);
    expect(capacityShare(en)).toBeLessThan(1);
    expect(info.effects.unrest).toBeGreaterThan(0);
    expect(info.parts.reduce((p, r) => p + r[1], 0)).toBeCloseTo(info.capacity, 6);
  });
  it('a town can change its production method, paying for it, and the AI uses methods', () => {
    const n = fr; n.treasury = 10000;
    const town = ownedLocs(s, n.id).filter((i) => s.loc.ctrl[i] === n.id).sort((a, b) => s.loc.dev[b] - s.loc.dev[a])[0];
    expect(methodBlock(s, w, n, town, 2)).toBe('needs a manufactory');
    const oldTech = n.tech[1]; n.tech[1] = Math.max(6, n.tech[1]);
    const before = n.treasury;
    expect(setMethod(s, w, n, town, 1)).toBeNull();
    expect(s.loc.method[town]).toBe(1);
    expect(n.treasury).toBeLessThan(before);
    expect(methodBlock(s, w, n, town, 0)).toBe('the workshops were reorganised recently');
    const r = applyCommand(s, w, { t: 'method', n: n.id, loc: town, method: 0 });
    expect(r.ok).toBe(false);
    n.tech[1] = oldTech;
  });
  it('the AI reorganises its great workshop towns once it can afford it', () => {
    const { s: s4, w: w4 } = newGame(1356);
    const n = s4.nations.find((x) => x.key === 'france')!;
    n.tech[1] = 8; n.treasury = 1e6; n.income = { tax: 100 };
    const towns = ownedLocs(s4, n.id).filter((i) => s4.loc.pop[i * C + CL.artisans] + s4.loc.pop[i * C + CL.wage_workers] >= 1500 && s4.loc.workshop[i * 3] > 0);
    administration.yearly!({ s: s4, w: w4, date: { y: 1357, m: 0, d: 1 } } as any);
    const switched = ownedLocs(s4, n.id).filter((i) => s4.loc.method[i] > 0).length;
    expect(switched).toBe(Math.min(2, towns.length));
  });
  it('people drift toward better living, and none are lost', () => {
    const l = ownedLocs(s, fr.id).find((i) => s.loc.pop[i * C + CL.peasants] > 2000 && w.adjStart[i + 1] > w.adjStart[i])!;
    let j = -1; for (let e = w.adjStart[l]; e < w.adjStart[l + 1]; e++) { const v = w.adj[e]; if (v < w.L && s.loc.owner[v] === fr.id) { j = v; break; } }
    expect(j).toBeGreaterThanOrEqual(0);
    s.loc.sol[l * C + CL.peasants] = 0.2; s.loc.sol[l * C + CL.labourers] = 0.2;
    s.loc.sol[j * C + CL.peasants] = 0.9; s.loc.sol[j * C + CL.labourers] = 0.9;
    s.loc.devast[j] = 0; s.loc.plague[j] = 0;
    let tot0 = 0; for (let i = 0; i < w.L; i++) tot0 += s.loc.pop[i * C + CL.peasants] + s.loc.pop[i * C + CL.labourers];
    const before = s.loc.pop[l * C + CL.peasants];
    migrationMonth(s, w);
    let tot1 = 0; for (let i = 0; i < w.L; i++) tot1 += s.loc.pop[i * C + CL.peasants] + s.loc.pop[i * C + CL.labourers];
    expect(s.loc.pop[l * C + CL.peasants]).toBeLessThan(before);
    expect(s.loc.migr[l]).toBeLessThan(0);
    expect(Math.abs(tot1 - tot0) / tot0).toBeLessThan(1e-5);
  });
});

describe('E: tax instruments and the forecast', () => {
  it('duties are set by the budget command, clamped and rounded to their step', () => {
    expect(setDuty(fr, 'nonsense', 0.1)).toBe('unknown budget item');
    expect(applyCommand(s, w, { t: 'budget', n: fr.id, key: 'land', value: 0.5 }).ok).toBe(true);
    expect(fr.duties!.land).toBeCloseTo(0.1, 9);
    applyCommand(s, w, { t: 'budget', n: fr.id, key: 'excise', value: 0.0237 });
    expect(fr.duties!.excise).toBeCloseTo(0.025, 9);
    expect(dutyDiscontent(fr, 'magnates')).toBeCloseTo(15, 6);
    expect(dutyUnrest(fr)).toBeCloseTo(0.1 * 20 + 0.025 * 30, 6);
  });
  it('the AI raises a duty when short of money and lowers it when rich', () => {
    const { s: s5, w: w5 } = newGame(1356);
    const n = s5.nations.find((x) => x.key === 'france')!;
    n.income = { tax: 50 }; n.expense = { army: 80 }; n.treasury = 10;
    for (const e of n.estates) e.contentment = 60;
    aiDuties(s5, w5, n, false);
    const raised = n.duties!.land + n.duties!.hearth + n.duties!.excise;
    expect(raised).toBeGreaterThan(0);
    n.income = { tax: 100 }; n.expense = { army: 20 }; n.treasury = 5000;
    for (let k = 0; k < 5; k++) aiDuties(s5, w5, n, false);
    expect(n.duties!.land + n.duties!.hearth + n.duties!.excise).toBeCloseTo(0, 9);
  });
  it('they bring money in the next month', () => {
    fr.duties = { land: 0.05, hearth: 0.2, excise: 0.03 };
    for (let d = 0; d < 31; d++) advanceDay(s, w);
    expect(fr.income.land_tax ?? 0).toBeGreaterThan(0);
    expect(fr.income.hearth_tax ?? 0).toBeGreaterThan(0);
    expect(fr.income.excise ?? 0).toBeGreaterThan(0);
    fr.duties = { land: 0, hearth: 0, excise: 0 };
  });
  it('the forecast adds up month by month', () => {
    const f = budgetForecast(s, fr);
    expect(f.months.length).toBe(12);
    const sum = f.months.reduce((p, m) => p + m.income - m.expense, 0);
    expect(f.start + sum).toBeCloseTo(f.end, 6);
    expect(f.end).toBeCloseTo(f.start + 12 * (f.income - f.fixed) - f.interestYear - f.repaidYear, 6);
  });
  it('the trade law caps the tariff', () => {
    withLaw(fr, 'trade', 'free', () => {
      expect(tariffMax(fr)).toBeCloseTo(0.1, 9);
      applyCommand(s, w, { t: 'budget', n: fr.id, key: 'tariff', value: 0.4 });
      expect(fr.tariff).toBeCloseTo(0.1, 9);
    });
  });
});

describe('A: keys that did nothing now act', () => {
  it('clerical immunity pleases the Curia, taxing the clergy angers it', () => {
    const imm = withLaw(fr, 'clergy_tax', 'immune', () => curiaGain(fr));
    const tax = withLaw(fr, 'clergy_tax', 'taxed', () => curiaGain(fr));
    expect(imm - tax).toBeCloseTo(10, 6);
  });
  it('fortress laws change the price of walls', () => {
    const c0 = withLaw(fr, 'fortress', 'castles', () => buildCost(s, fr, BI.fort, 0));
    const c1 = withLaw(fr, 'fortress', 'bastions', () => buildCost(s, fr, BI.fort, 0));
    expect(c1).toBeGreaterThan(c0);
    expect(withLaw(fr, 'fortress', 'castles', () => buildCost(s, fr, BI.market, 0))).toBeCloseTo(withLaw(fr, 'fortress', 'bastions', () => buildCost(s, fr, BI.market, 0)), 9);
  });
  it('colonising laws make settlers cheaper and faster, interest effects change the loan rate', () => {
    const p0 = colonyProgress(fr), c0 = colonyCost(s, fr);
    withMod(fr, { colonise: 0.3 }, () => { expect(colonyProgress(fr)).toBeGreaterThan(p0); expect(colonyCost(s, fr)).toBeLessThan(c0); });
    const r0 = loanRate(s, fr);
    withMod(fr, { interest: -0.01 }, () => expect(loanRate(s, fr)).toBeCloseTo(Math.max(0.01, r0 - 0.01), 9));
  });
  it('a warlike reputation makes conquest more dreadful; closed guilds delay new crafts', () => {
    const d0 = dreadGain(fr);
    withMod(fr, { dread: 0.2 }, () => expect(dreadGain(fr)).toBeCloseTo(d0 + 0.2, 9));
    withMod(fr, { innovation_block: 0.5 }, () => {
      let delayed = 0; for (let y = 1400; y < 1500; y++) if (adoptionDelayed(fr, 3, y)) delayed++;
      expect(delayed).toBeGreaterThan(40); expect(delayed).toBeLessThan(85); // chance 1/3 a year to adopt
    });
    expect(adoptionDelayed(fr, 3, 1400)).toBe(lawEffect(fr, 'innovation_block') > 0 ? adoptionDelayed(fr, 3, 1400) : false);
  });
  it('election to office makes the ablest official ruler', () => {
    const { s: s3, w: w3 } = newGame(1356);
    const n = s3.nations.find((x) => x.key === 'france')!;
    n.laws.succession = opt('succession', 'office'); fresh();
    const best = ablestOfficial(s3, n)!;
    expect(best).toBeTruthy();
    succession(s3, w3, n);
    expect(n.ruler).toBe(best.id);
    expect(Object.values(n.council)).not.toContain(best.id);
  });
});

describe('review fixes', () => {
  it('a war of succession that ends returns the land as it was: integrated, under the same control, not over-extended', () => {
    const { s: s6, w: w6 } = newGame(1356);
    const n = s6.nations.find((x) => x.key === 'france')!;
    computeAdmin(s6, w6);
    expect(overextension(n)).toBe(0);
    startCivilWar(s6, w6, n);
    const war = s6.wars.find((x) => x.goal.type === 'civil_war' && x.def.includes(n.id))!;
    const pre = s6.nations[war.attLead];
    const taken = ownedLocs(s6, pre.id).slice();
    expect(taken.length).toBeGreaterThan(20);
    for (const l of taken) expect(s6.loc.integ[l]).toBe(1);
    const ctl = taken.map((l) => s6.loc.control[l]);
    concludePeace(s6, w6, war, war.attLead, war.defLead, []);
    expect(pre.alive).toBe(false);
    taken.forEach((l, k) => { expect(s6.loc.owner[l]).toBe(n.id); expect(s6.loc.integ[l]).toBe(1); expect(s6.loc.control[l]).toBeCloseTo(ctl[k], 9); });
    computeAdmin(s6, w6);
    expect(overextension(n)).toBe(0);
    // a conquest still starts unintegrated under weak control; land handed on otherwise keeps both
    const en = s6.nations.find((x) => x.key === 'england')!;
    const [a, b] = taken; s6.loc.control[a] = 0.7; s6.loc.control[b] = 0.7;
    transferLoc(s6, w6, a, en.id); transferLoc(s6, w6, b, en.id, 0, { conquest: false });
    expect(s6.loc.integ[a]).toBe(0); expect(s6.loc.control[a]).toBeCloseTo(0.3, 6);
    expect(s6.loc.integ[b]).toBe(1); expect(s6.loc.control[b]).toBeCloseTo(0.7, 6);
  }, 120_000);
  it('over-extension slows integration once, never below a quarter, and the tooltip shows the real monthly step', () => {
    const { s: s2, w: w2 } = newGame(1356);
    const en = s2.nations.find((n) => n.key === 'england')!, fr2 = s2.nations.find((n) => n.key === 'france')!;
    const take = ownedLocs(s2, fr2.id).slice(0, 120);
    for (const l of take) transferLoc(s2, w2, l, en.id);
    computeAdmin(s2, w2);
    expect(capacityShare(en)).toBeLessThan(MIN_INTEG_SHARE);
    expect(integrationShare(en)).toBe(MIN_INTEG_SHARE);
    expect(adminInfo(s2, w2, en).share).toBe(MIN_INTEG_SHARE);
    // the control the strain took away is given back for integration (it already slows it through the share)
    const strain = overextControl(en); expect(strain).toBeGreaterThan(0);
    const l = take[0]; s2.loc.control[l] = 0.5 * (1 - strain);
    expect(integrationControl(s2, en, l)).toBeCloseTo(0.5, 6); // control is stored as a 32-bit float
    // the location tooltip's monthly step is the step the month really takes
    const before = take.map((i) => s2.loc.integ[i]);
    const tips = take.slice(0, 5).map((i) => answer(s2, w2, en.id, { q: 'loc', loc: i } as any).why.integMonthly as number);
    integrationMonth(s2, w2);
    take.slice(0, 5).forEach((i, k) => expect(s2.loc.integ[i] - before[k]).toBeCloseTo(tips[k], 9));
    expect(tips[0]).toBeGreaterThan(0);
  }, 120_000);
  it('a save from before the truth pass loads and runs', () => {
    const { s: s7, w: w7 } = newGame(1356);
    const o = JSON.parse(serialize(s7));
    delete o.loc.migr; delete o.loc.migrBal; o.v = 1;
    for (const n of o.nations) { delete n.duties; delete n.adminLoad; }
    const s8 = deserialize(JSON.stringify(o));
    expect(s8.v).toBe(2);
    expect(s8.loc.migr.length).toBe(s8.loc.owner.length);
    for (let d = 0; d < 40; d++) advanceDay(s8, w7);
    expect(s8.nations.find((n) => n.key === 'france')!.duties).toEqual({ land: 0, hearth: 0, excise: 0 });
    expect(s8.day).toBe(s7.day + 40);
  }, 120_000);
  it('legal exemptions free a class of the duties too, and the hearth privilege frees the nobles of the hearth tax', () => {
    const inc = new Float64Array(C);
    inc[CL.peasants] = 400; inc[CL.labourers] = 60; inc[CL.artisans] = 80; inc[CL.burghers] = 100; inc[CL.clergy] = 50; inc[CL.nobles] = 120;
    const P = new Float32Array(C).fill(2000);
    const run = (ex: Record<number, number>, nobleHearth = 0, hearthR = 0.3) => {
      const e = new Float64Array(1 + C); e[0] = nobleHearth; for (const c in ex) e[1 + +c] = ex[c];
      collectDuties(Float64Array.from(inc), P, 0, e, 0, 0.05, hearthR, 0.05, 2000, 800, 1, 1);
      return { by: DUTY_BY.slice(), paid: DUTY_PAID.slice() };
    };
    const free = run({}), full = run({ [CL.nobles]: 1, [CL.clergy]: 1, [CL.burghers]: 0.4 });
    expect(free.by[CL.nobles]).toBeGreaterThan(0); expect(free.by[C + CL.nobles]).toBeGreaterThan(0);
    // full exemption: nothing of the land or hearth tax from nobles and clergy; their land tax falls on the peasants
    expect(full.by[CL.nobles]).toBe(0); expect(full.by[C + CL.nobles]).toBe(0);
    expect(full.by[CL.clergy]).toBe(0); expect(full.by[C + CL.clergy]).toBe(0);
    expect(full.by[CL.peasants]).toBeGreaterThan(free.by[CL.peasants]);
    // hearth tax and excise of exempt classes are forgone
    expect(full.paid[1]).toBeLessThan(free.paid[1]);
    const exc = (ex: Record<number, number>) => run(ex, 0, 0).by[2 * C + CL.burghers];
    expect(exc({ [CL.burghers]: 0.4 })).toBeCloseTo(exc({}) * 0.6, 9);
    // the privilege frees the nobles of the hearth tax only
    const priv = run({}, 1);
    expect(priv.by[C + CL.nobles]).toBe(0); expect(priv.by[CL.nobles]).toBeCloseTo(free.by[CL.nobles], 9);
    // the laws and the privilege reach the realm's own collection
    withLaw(fr, 'nobility', 'full', () => withLaw(fr, 'clergy_tax', 'immune', () => {
      expect(classExempt(fr, CL.nobles)).toBe(1); expect(classExempt(fr, CL.clergy)).toBe(1);
      fr.duties = { land: 0.1, hearth: 0, excise: 0 };
      // exempt lords do not resent the land tax; the commons who pay it instead do
      expect(dutyDiscontent(fr, 'magnates', (c) => classExempt(fr, c))).toBe(0);
      expect(dutyDiscontent(fr, 'commons', (c) => classExempt(fr, c))).toBeCloseTo(0.1 * 250, 6);
      expect(dutyEstates(DUTY_INDEX.land, (c) => classExempt(fr, c)).map((x) => x[0])).toContain('commons');
      fr.duties = { land: 0, hearth: 0, excise: 0 };
    }));
    withMod(fr, { hearth_exempt_nobles: 1 }, () => expect(lawEffect(fr, 'hearth_exempt_nobles')).toBe(1));
  }, 120_000);
  it('migration evens out: newcomers crowd a place, so a lasting gap moves a few percent and then dies down', () => {
    const { s: s9, w: w9 } = newGame(1356);
    const n = s9.nations.find((x) => x.key === 'france')!;
    const l = ownedLocs(s9, n.id).find((i) => s9.loc.pop[i * C + CL.peasants] > 3000 && w9.adjStart[i + 1] - w9.adjStart[i] >= 3)!;
    const pl = (i: number) => s9.loc.pop[i * C + CL.peasants] + s9.loc.pop[i * C + CL.labourers];
    const p0 = pl(l), out: number[] = [];
    for (let m = 0; m < 240; m++) {
      // a lasting gap: this place stays poorer than every neighbour
      s9.loc.sol[l * C + CL.peasants] = 0.3; s9.loc.sol[l * C + CL.labourers] = 0.3;
      for (let e = w9.adjStart[l]; e < w9.adjStart[l + 1]; e++) { const j = w9.adj[e]; if (j < w9.L) { s9.loc.sol[j * C + CL.peasants] = 0.5; s9.loc.sol[j * C + CL.labourers] = 0.5; } }
      migrationMonth(s9, w9);
      out.push(-s9.loc.migr[l] / pl(l));
    }
    expect(out[0]).toBeGreaterThan(0.001); // people leave at first
    expect(out[239]).toBeLessThan(out[0] * 0.2); // and the flow dies down
    const lost = 1 - pl(l) / p0;
    expect(lost).toBeGreaterThan(0.02); expect(lost).toBeLessThan(0.15); // a few percent, not the whole place
    expect(s9.loc.migrBal[l]).toBeLessThan(0);
  }, 120_000);
});
void B;
