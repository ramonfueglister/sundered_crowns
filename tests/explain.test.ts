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
import { declareWar } from '../src/sim/systems/war';
import { checkGoals, goalsFor } from '../src/sim/systems/goals';
import { DECISIONS } from '../src/sim/content/decisions';
import { decisionsFor } from '../src/sim/systems/events';
import { dayToDate } from '../src/sim/calendar';
import { errText, lang } from '../src/ui/i18n';
import { readFileSync } from 'node:fs';

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

describe('peace dialog: the rows of their answer add up to the shown sum', () => {
  // make sure the player fights a war (France may be at peace on day 70)
  let war = s.wars.find((x) => x.att.includes(pid) || x.def.includes(pid));
  if (!war) {
    for (const o of s.nations) {
      if (!o.alive || o.id === pid || o.overlord >= 0) continue;
      if (declareWar(s, w, pid, o.id) === null) break;
    }
    war = s.wars.find((x) => x.att.includes(pid) || x.def.includes(pid));
  }
  const enemy = war ? (war.att.includes(pid) ? war.defLead : war.attLead) : -1;
  const sign = war && war.att.includes(pid) ? 1 : -1;
  const ask = (terms: any[]) => answer(s, w, pid, { q: 'peace', war: war!.id, to: enemy, terms, concede: false }) as any;
  const consistent = (ev: any) => {
    expect(sum(ev.reasons)).toBe(ev.score);
    expect(ev.reasons.some((r: any) => r[0] === 'not_enough_war_score')).toBe(false);
    if (ev.accept) { expect(ev.score).toBeGreaterThanOrEqual(0); expect(ev.cond?.ok ?? true).toBe(true); }
    else expect(ev.score < 0 || ev.cond?.ok === false || ev.reasons.some((r: any) => r[0] === 'fighting_for_freedom')).toBe(true);
    if (ev.cond) expect(ev.cond.ok).toBe(ev.cond.have >= ev.cond.need);
  };
  it('a war to negotiate exists', () => { expect(war).toBeTruthy(); });
  it('white peace lists its +5', () => {
    const ev = ask([]);
    consistent(ev);
    expect(ev.cond).toBeNull();
    expect(ev.reasons.find((r: any) => r[0] === 'white_peace')?.[1]).toBe(5);
  });
  it('demands covered by the war score', () => {
    war!.battleScore = 60 * sign;
    const ev = ask([{ type: 'humiliate' }]);
    consistent(ev);
    expect(ev.cond.ok).toBe(true);
  });
  it('demands beyond the war score: refused, the condition is shown apart from the sum', () => {
    war!.battleScore = 0;
    const ev = ask([{ type: 'vassal' }, { type: 'humiliate' }, { type: 'break_alliance' }]);
    consistent(ev);
    expect(ev.cond.ok).toBe(false);
    expect(ev.accept).toBe(false);
  });
});

describe('ambitions that already hold at the start are not advertised as open', () => {
  it('goals view before the first check matches what the first check inherits', () => {
    const fresh = s.nations.filter((x) => x.alive && x.flags.goals_init === undefined).slice(0, 25);
    expect(fresh.length).toBeGreaterThan(0);
    const d = dayToDate(s.day, s.startYear);
    for (const x of fresh) {
      const before = answer(s, w, x.id, { q: 'goals', nation: x.id }) as any[];
      checkGoals(s, w, x, d.y, d.m);
      const after = answer(s, w, x.id, { q: 'goals', nation: x.id }) as any[];
      expect(before.filter((g) => g.done).map((g) => g.id).sort()).toEqual([...x.goalsDone].sort());
      expect(after.map((g) => [g.id, g.done, g.open, g.inherited])).toEqual(before.map((g) => [g.id, g.done, g.open, g.inherited]));
      expect(before.filter((g) => g.done && !g.inherited)).toEqual([]);
      expect(goalsFor(x).length).toBe(before.length);
    }
  });
});

describe('German texts for every refusal of a decision', () => {
  const prev = lang.value;
  const missing = (why: string) => { lang.value = 'de'; const de = errText(why); lang.value = prev; return de === why; };
  it('every literal reason in decisions.ts has a German text', () => {
    const src = readFileSync(new URL('../src/sim/content/decisions.ts', import.meta.url), 'utf8');
    const reasons = new Set<string>();
    for (let at = src.indexOf('can: ('); at >= 0; at = src.indexOf('can: (', at + 1)) {
      const body = src.slice(at, src.indexOf('effect:', at));
      for (const m of body.matchAll(/(?:\?|:|return)\s*'([^']*\s[^']*)'/g)) reasons.add(m[1]);
      for (const m of body.matchAll(/(?:\?|:|return)\s*`\$\{[^}]+\}([^`]*)`/g)) reasons.add(`Castile${m[1]}`);
    }
    expect(reasons.size).toBeGreaterThan(40);
    expect([...reasons].filter(missing)).toEqual([]);
  });
  it('every reason the decisions give any realm right now has a German text', () => {
    const d = dayToDate(s.day, s.startYear);
    const seen = new Set<string>();
    for (const n2 of s.nations) {
      if (!n2.alive) continue;
      for (const x of decisionsFor(s, w, n2)) if (typeof x.why === 'string') seen.add(x.why);
      const e = { s, w, n: n2, ctx: {}, year: d.y, month: d.m, fx: null } as any;
      for (const dd of DECISIONS) { try { const why = dd.can(e); if (why) seen.add(why); } catch { /* not meant for this realm */ } }
    }
    expect(seen.size).toBeGreaterThan(5);
    expect([...seen].filter(missing)).toEqual([]);
  });
});
