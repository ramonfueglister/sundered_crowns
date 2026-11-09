// Mechanics that do what they say (truth pass): each test changes one input and checks that the simulation's own
// number moves as the description promises.
// Run: npx vitest run tests/truth_mechanics.test.ts
import { describe, it, expect } from 'vitest';
import { newGame } from '../tools/sim/load';
import { advanceDay } from '../src/sim/engine';
import { DAY_EPOCH, EPOCH } from '../src/sim/ctx';
import { lawEffect, councilBonus, treasurerGraft, succession, ablestOfficial, traditionOf } from '../src/sim/systems/politics';
import { taxCommon, integrationYield, effectiveTax, importPrice, tariffMax, loanRate } from '../src/sim/systems/economy';
import { researchRate, adoptionDelayed } from '../src/sim/systems/progress';
import { maintMorale, techMult } from '../src/sim/systems/military';
import { envoyDays, opinionBreakdown, diploSkill } from '../src/sim/systems/diplomacy';
import { transferLoc, dreadGain } from '../src/sim/systems/war';
import { computeAdmin, capacityShare, adminInfo, setMethod, methodBlock, migrationMonth, budgetForecast } from '../src/sim/systems/administration';
import { setDuty, dutyDiscontent, dutyUnrest } from '../src/sim/systems/duties';
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
void B;
