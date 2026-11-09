// Trade and exploration (spec points 27, 47, 48, 54, 91, 94): trade power and merchants, embargoes, trade agreements,
// expeditions, company charters and the trade map modes, all through the commands the player uses.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { advanceDay } from '../src/sim/engine';
import { applyCommand } from '../src/sim/commands';
import { bump } from '../src/sim/ctx';
import { hasRefusalText } from '../src/sim/refusals';
import {
  marketPowers, tradeIncomeWith, merchantGains, merchantRefusal, embargoedBy, tariffBetween, homeMarket, merchantsFree, routeCost, merchantReach,
} from '../src/sim/systems/trade';
import { acceptProposal } from '../src/sim/systems/diplomacy';
import { hasCasusBelli } from '../src/sim/systems/war';
import { expeditionTargets, expeditionPlan } from '../src/sim/systems/explore';
import { charterOptions } from '../src/sim/systems/colonial';
import { mapModeColors, answer } from '../src/game/view';
import { GI } from '../src/sim/defs';
import type { GameState } from '../src/sim/types';

const w = loadWorld();
const setup = loadSetup(1356), hubs = loadHubs();
const newGame = (player: number[] = []) => createGame(w, setup, hubs, 4242, { player });
const days = (s: GameState, n: number) => { for (let i = 0; i < n; i++) advanceDay(s, w); };
const byKey = (s: GameState, k: string) => s.nations.find((n) => n.key === k)!;
const shareIn = (s: GameState, m: number, n: number) => { const p = marketPowers(s, w)[m]; return p.total > 0 ? (p.rows.find((r) => r.n === n)?.total ?? 0) / p.total : 0; };
/** Value of last month's goods between markets whose hubs a and b hold. */
const goodsBetween = (s: GameState, a: number, b: number) => (s.flows ?? []).reduce((p, f) => {
  const oa = s.loc.owner[s.markets[f.from].hub], ob = s.loc.owner[s.markets[f.to].hub];
  return p + ((oa === a && ob === b) || (oa === b && ob === a) ? f.value : 0);
}, 0);

describe('trade power and merchants', () => {
  const s = newGame();
  const pt = byKey(s, 'portugal'); s.playerNations = [pt.id];
  days(s, 35); // a month of trade values

  it('a merchant raises our share where he goes, as much as the estimate shown', () => {
    const home = homeMarket(s, pt);
    // the richest market in reach where we hold no land: a foreign market for our merchant
    const m = s.markets.filter((x) => x.id !== home && !merchantRefusal(s, w, pt, x.id) && (x.tv ?? 0) > 0 && shareIn(s, x.id, pt.id) === 0)
      .sort((a, b) => (b.tv ?? 0) - (a.tv ?? 0))[0];
    expect(m).toBeTruthy();
    expect(merchantsFree(s, pt)).toBeGreaterThan(0);
    const before = shareIn(s, m.id, pt.id);
    const est = merchantGains(s, w, pt.id, m.id);
    expect(est.add).not.toBeNull();
    expect(est.add!).toBeGreaterThan(0);
    const r = applyCommand(s, w, { t: 'merchant', n: pt.id, market: m.id, amount: 1 });
    expect(r.ok).toBe(true);
    const after = shareIn(s, m.id, pt.id);
    expect(after).toBeGreaterThan(before + 0.01); // a real, sizeable share
    // the gain shown before sending is what the same trade values now give us
    expect(tradeIncomeWith(s, w, pt.id)).toBeCloseTo(est.now + est.add!, 6);
    // and next month it is paid
    s.markets[m.id].paid = {};
    days(s, 31);
    expect(s.markets[m.id].paid?.[pt.id] ?? 0).toBeGreaterThan(0);
  });

  it('refuses markets beyond reach and steering without a route home', () => {
    const home = homeMarket(s, pt);
    const far = s.markets.find((x) => merchantRefusal(s, w, pt, x.id) === 'too far from our home market')!;
    expect(routeCost(s, home, far.id)).toBeGreaterThan(merchantReach(pt));
    expect(applyCommand(s, w, { t: 'merchant', n: pt.id, market: far.id, amount: 1 })).toEqual({ ok: false, err: 'too far from our home market' });
    expect(applyCommand(s, w, { t: 'merchant', n: pt.id, market: home, amount: 1, steer: true })).toEqual({ ok: false, err: 'our merchants collect at home' });
  });

  it('steering sends our share home along the routes', () => {
    const home = homeMarket(s, pt);
    const m = s.markets.find((x) => (x.merchants[pt.id] || 0) > 0 && x.id !== home)!;
    const r = applyCommand(s, w, { t: 'merchant', n: pt.id, market: m.id, amount: m.merchants[pt.id], steer: true });
    expect(r.ok).toBe(true);
    expect(s.markets[m.id].steer?.[pt.id]).toBe(1);
    days(s, 31);
    expect(s.markets[m.id].steered?.[pt.id] ?? 0).toBeGreaterThan(0);
    expect(s.markets[home].tin ?? 0).toBeGreaterThan(0);
  });

  it('the market view shows every realm\'s power with its breakdown and our gains', () => {
    const home = homeMarket(s, pt);
    const d = answer(s, w, pt.id, { q: 'tmarket', market: home });
    expect(d.rows.length).toBeGreaterThan(0);
    const total = d.rows.reduce((p: number, r: any) => p + r.share, 0);
    expect(total).toBeCloseTo(1, 6);
    for (const r of d.rows) expect(r.parts.reduce((p: number, x: [string, number]) => p + x[1], 0) * r.mult * (r.blocked ? 0 : 1)).toBeCloseTo(r.total, 6);
    expect(d.our.gains).toBeTruthy();
    const g = answer(s, w, pt.id, { q: 'tgood', market: home, good: GI.grain });
    expect(g.made).toBeGreaterThan(0);
    expect(g.producers.length).toBeGreaterThan(0);
    expect(g.consumers.length).toBeGreaterThan(0);
    expect(g.hist.length).toBeGreaterThan(0);
  });
});

describe('embargo and trade agreements', () => {
  const s = newGame();
  days(s, 35);
  // the two realms whose markets exchanged the most goods last month
  const pairs = new Map<string, number>();
  for (const f of s.flows) {
    const a = s.loc.owner[s.markets[f.from].hub], b = s.loc.owner[s.markets[f.to].hub];
    if (a < 0 || b < 0 || a === b) continue;
    const k = `${Math.min(a, b)}_${Math.max(a, b)}`; pairs.set(k, (pairs.get(k) ?? 0) + f.value);
  }
  const best = [...pairs.entries()].filter(([k]) => { const [a, b] = k.split('_').map(Number); return !s.treaties.some((t) => t.type === 'alliance' && ((t.a === a && t.b === b) || (t.a === b && t.b === a))) && s.nations[a].overlord !== b && s.nations[b].overlord !== a; })
    .sort((x, y) => y[1] - x[1])[0];
  const [a, b] = best[0].split('_').map(Number);

  it('an embargo blocks trade both ways, gives a cause for a trade war and can be lifted', () => {
    const before = goodsBetween(s, a, b);
    expect(before).toBeGreaterThan(0);
    const r = applyCommand(s, w, { t: 'diplo', n: a, target: b, action: 'embargo' });
    expect(r.ok).toBe(true);
    expect(embargoedBy(s, a, b)).toBe(true);
    expect(embargoedBy(s, b, a)).toBe(false);
    // merchants are shut out both ways
    const ma = s.markets.find((m) => m.owner === a)!, mb = s.markets.find((m) => m.owner === b)!;
    expect(merchantRefusal(s, w, s.nations[b], ma.id)).toBe('an embargo shuts our merchants out');
    expect(merchantRefusal(s, w, s.nations[a], mb.id)).toBe('an embargo shuts our merchants out');
    expect(hasCasusBelli(s, b, a)).toBe('embargo');
    s.flows = [];
    days(s, 31);
    const during = goodsBetween(s, a, b);
    expect(during).toBeLessThan(before * 0.1 + 1);
    expect(applyCommand(s, w, { t: 'diplo', n: a, target: b, action: 'embargo' })).toEqual({ ok: false, err: 'already under embargo' });
    expect(applyCommand(s, w, { t: 'diplo', n: a, target: b, action: 'lift_embargo' }).ok).toBe(true);
    expect(embargoedBy(s, a, b)).toBe(false);
    expect(merchantRefusal(s, w, s.nations[b], ma.id)).not.toBe('an embargo shuts our merchants out');
    days(s, 31);
    expect(goodsBetween(s, a, b)).toBeGreaterThan(during);
  });

  it('a trade agreement halves the tariffs between the partners', () => {
    s.nations[a].tariff = 0.06; s.nations[b].tariff = 0.04;
    expect(tariffBetween(s, a, b)).toBeCloseTo(0.06, 9);
    expect(tariffBetween(s, b, a)).toBeCloseTo(0.04, 9);
    acceptProposal(s, w, a, b, 'trade');
    bump();
    expect(tariffBetween(s, a, b)).toBeCloseTo(0.03, 9);
    expect(tariffBetween(s, b, a)).toBeCloseTo(0.02, 9);
    // and their merchants weigh more in each other's markets
    const d = answer(s, w, a, { q: 'trel', target: b });
    expect(d.agreement).toBe(true);
    expect(d.ourTariff).toBeCloseTo(0.03, 9);
  });
});

describe('expeditions and companies', () => {
  const s = newGame();
  const pt = byKey(s, 'portugal'); s.playerNations = [pt.id];
  pt.tech[1] = 12; pt.era = 1; pt.treasury = 20000;

  it('an expedition reveals land and costs what it shows', () => {
    const targets = expeditionTargets(s, w, pt);
    expect(targets.length).toBeGreaterThan(0);
    const tg = targets.find((x) => x.region.key.startsWith('Atlantic Ocean (West)')) ?? targets[targets.length - 1];
    const plan = expeditionPlan(s, w, pt, tg.to, 0);
    expect(plan.refusal).toBeNull();
    expect(plan.days).toBeGreaterThan(0);
    expect(plan.cost.total).toBeGreaterThan(0);
    const t0 = pt.treasury, known0 = s.explored[pt.knows].reduce((p, x) => p + x, 0);
    const r = applyCommand(s, w, { t: 'explore', n: pt.id, fleet: 0, to: tg.to });
    expect(r.ok).toBe(true);
    expect(t0 - pt.treasury).toBeCloseTo(plan.cost.total, 6);
    days(s, plan.days + 30);
    const known1 = s.explored[pt.knows].reduce((p, x) => p + x, 0);
    expect(known1).toBeGreaterThan(known0);
    const note = s.notices.find((x) => x.nation === pt.id && x.kind === 'expedition');
    expect(note).toBeTruthy();
    expect(note!.text.de).toMatch(/Orte kartiert/);
  });

  it('refuses an ocean voyage without the knowledge for it', () => {
    const s2 = newGame(); const p2 = byKey(s2, 'portugal'); p2.treasury = 20000; p2.tech[1] = 7; p2.era = 0;
    const far = expeditionTargets(s2, w, p2).find((x) => x.km > 3000)!;
    const plan = expeditionPlan(s2, w, p2, far.to, 0);
    expect(plan.ocean).toBe(true);
    expect(plan.refusal).toBe('an ocean voyage needs Commerce 10');
    expect(applyCommand(s2, w, { t: 'explore', n: p2.id, fleet: 0, to: far.to })).toEqual({ ok: false, err: 'an ocean voyage needs Commerce 10' });
  });

  it('the player can charter a company and it adds trade power', () => {
    // a harbour of ours on the Guinea coast, far from home
    let spot = -1;
    for (let i = 0; i < w.L && spot < 0; i++) {
      if (!w.coastal[i] || s.loc.owner[i] >= 0 || w.provinces[w.provOf[i]]?.region !== 'west_africa' || w.distKm(i, pt.capital) < 2600) continue;
      const hub = s.markets[s.loc.market[i]].hub; if (w.provinces[w.provOf[hub]]?.region === 'west_africa' && w.distKm(hub, pt.capital) >= 2600) spot = i;
    }
    expect(spot).toBeGreaterThanOrEqual(0);
    s.loc.owner[spot] = pt.id; s.loc.ctrl[spot] = pt.id; bump();
    const m = s.loc.market[spot];
    expect(charterOptions(s, w, pt)).toContain(m);
    const t0 = pt.treasury;
    const r = applyCommand(s, w, { t: 'charter', n: pt.id, market: m });
    expect(r.ok).toBe(true);
    expect(t0 - pt.treasury).toBeCloseTo(600 * s.priceLevel, 6);
    expect(s.companies?.some((c) => c.nation === pt.id && c.market === m)).toBe(true);
    const row = marketPowers(s, w)[m].rows.find((x) => x.n === pt.id)!;
    expect(row.company).toBeGreaterThan(0);
    const v = answer(s, w, pt.id, { q: 'companies' });
    expect(v.mine.length).toBe(1);
    expect(v.mine[0].holdings).toBeGreaterThanOrEqual(1);
    expect(applyCommand(s, w, { t: 'charter', n: pt.id, market: m })).toMatchObject({ ok: false });
  });
});

describe('trade map modes', () => {
  const s = newGame();
  days(s, 35);
  for (const mode of ['prices', 'production', 'markets'] as const) {
    it(`${mode} colours the map and has a legend with a good`, () => {
      const { rgba, legend } = mapModeColors(s, w, mode, -1, GI.grain);
      let coloured = 0; for (let i = 0; i < w.L; i++) if (rgba[i * 4 + 3] > 0) coloured++;
      expect(coloured).toBeGreaterThan(w.L * 0.3);
      expect(legend.items.length).toBeGreaterThanOrEqual(3);
      expect(legend.good).toBe(GI.grain);
      expect(legend.title.de).toBeTruthy();
      // another good gives other colours
      const other = mapModeColors(s, w, mode, -1, GI.wine ?? 1);
      expect(Buffer.from(other.rgba).equals(Buffer.from(rgba))).toBe(false);
    });
  }
  it('markets without a good shows the leading trade power', () => {
    const { legend } = mapModeColors(s, w, 'markets', -1, -1);
    expect(legend.good).toBe(-1);
    expect(legend.items.length).toBeGreaterThan(2);
  });
});

describe('refusal texts', () => {
  it('every refusal of the trade and exploration rules has German text', () => {
    const found = new Set<string>();
    for (const f of ['src/sim/systems/trade.ts', 'src/sim/systems/explore.ts', 'src/sim/systems/diplomacy.ts']) {
      const t = readFileSync(f, 'utf8');
      for (const m of t.matchAll(/return '([^']+ [^']+)'/g)) found.add(m[1]);
      for (const m of t.matchAll(/fail\('([^']+)'\)/g)) found.add(m[1]);
    }
    expect([...found].filter((k) => !hasRefusalText(k))).toEqual([]);
  });
});
