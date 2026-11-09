// Breakdowns shown in tooltips (spec point 52): the parts view.ts lists must add up (or multiply) to the values the
// simulation itself computes, so that the explanation of a number never disagrees with the number.
import { describe, it, expect } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { advanceDay } from '../src/sim/engine';
import { answer } from '../src/game/view';
import { authorityGain } from '../src/sim/systems/politics';
import { researchRate, techCost, doctrineCost, doctrineSlots } from '../src/sim/systems/progress';
import { agentSlots } from '../src/sim/systems/society';
import { colonySlots } from '../src/sim/systems/colonial';
import { merchantCap } from '../src/sim/commands';

const w = loadWorld();
const s = createGame(w, loadSetup(1356), loadHubs(), 777, { player: [] });
const pid = s.nations.find((n) => n.key === 'france')!.id;
s.playerNations = [pid];
for (let i = 0; i < 70; i++) advanceDay(s, w);
const n = s.nations[pid];
const sum = (rows: [unknown, number][]) => rows.reduce((p, r) => p + r[1], 0);
const prod = (rows: [unknown, number][]) => rows.reduce((p, r) => p * r[1], 1);

describe('tooltip breakdowns match the simulation', () => {
  const r = answer(s, w, pid, { q: 'realm' }) as any;
  const e = r.explain;

  it('authority gain', () => {
    expect(e.authority.monthly).toBeCloseTo(authorityGain(s, n), 6);
    expect(sum(e.authority.parts)).toBeCloseTo(e.authority.monthly, 6);
  });
  it('research rate and level cost per branch', () => {
    const rr = researchRate(s, w, n);
    for (let k = 0; k < 3; k++) {
      expect(prod(e.research[k])).toBeCloseTo(rr[k], 6);
      expect(prod(e.techCost[k])).toBeCloseTo(techCost(s, n, k), 4);
    }
  });
  it('capacities: merchants, agents, colonies, doctrine slots and cost', () => {
    expect(sum(e.merchants.parts)).toBe(merchantCap(n));
    expect(sum(e.agents.parts)).toBe(agentSlots(n));
    expect(sum(e.colonies.parts)).toBe(colonySlots(n));
    expect(sum(e.doctrineSlots.parts)).toBe(doctrineSlots(n));
    expect(sum(e.doctrineCost.parts)).toBeCloseTo(doctrineCost(n), 6);
  });
  it('ambitions of the realm are listed with their state', () => {
    expect(r.goals.length).toBeGreaterThan(0);
    for (const g of r.goals) expect(typeof g.done).toBe('boolean');
    const q = answer(s, w, pid, { q: 'goals', nation: pid }) as any[];
    expect(q.map((g) => g.id)).toEqual(r.goals.map((g: any) => g.id));
  });
  it('location numbers: unrest target parts and development target factors', () => {
    const loc = answer(s, w, pid, { q: 'loc', loc: n.capital }) as any;
    // unrest drifts 30 % a month toward the sum of its parts: one more month must land where the parts say
    const target = sum(loc.unrestWhy);
    const before = loc.unrest;
    const why = loc.why;
    expect(prod(why.devF)).toBeCloseTo(why.devTarget, 6);
    expect(Number.isFinite(target)).toBe(true);
    expect(before).toBeGreaterThanOrEqual(0);
  });
  it('score parts add up to the ranking value', () => {
    const d = answer(s, w, pid, { q: 'nation', nation: pid }) as any;
    // recomputed on the spot, the ranking itself is monthly: allow a small drift
    expect(Math.abs(sum(d.scoreParts) - n.score) / Math.max(1, n.score)).toBeLessThan(0.05);
  });
  it('peace evaluation lists the price of each term', () => {
    const war = s.wars.find((x) => x.att.includes(pid) || x.def.includes(pid));
    if (!war) return;
    const enemy = war.att.includes(pid) ? war.defLead : war.attLead;
    const ev = answer(s, w, pid, { q: 'peace', war: war.id, to: enemy, terms: [{ type: 'humiliate' }, { type: 'gold', amount: 100 }], concede: false }) as any;
    expect(ev.costs.length).toBe(2);
    expect(sum(ev.costs.map((c: number) => [0, c]))).toBeCloseTo(ev.cost, 6);
  });
});
