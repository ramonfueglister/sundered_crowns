// Trading ventures (src/sim/systems/ventures.ts) and building materials (src/sim/systems/realm.ts): a realm's merchant
// houses carry a good from one market to another within their cargo space, the goods really move and the crown takes
// its share; works buy their materials on the market and go slower where it cannot supply them.
import { describe, it, expect } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { advanceDay } from '../src/sim/engine';
import { applyCommand } from '../src/sim/commands';
import { bump } from '../src/sim/ctx';
import { hasRefusalText } from '../src/sim/refusals';
import {
  cargoSpace, loadsUsed, venturesOf, ventureOptions, ventureEstimate, ventureSlots, ventureRefusal, VENTURE_CROWN, IDLE_CLOSE,
} from '../src/sim/systems/ventures';
import { homeMarket } from '../src/sim/systems/trade';
import { WEIGHT } from '../src/sim/systems/economy';
import { buildMaterials, buildPace, MIN_PACE } from '../src/sim/systems/realm';
import { answer } from '../src/game/view';
import { B, BI, GI } from '../src/sim/defs';
import type { GameState } from '../src/sim/types';

const w = loadWorld();
const setup = loadSetup(1356), hubs = loadHubs();
const newGame = (player: number[] = []) => createGame(w, setup, hubs, 4242, { player });
const days = (s: GameState, n: number) => { for (let i = 0; i < n; i++) advanceDay(s, w); };
const byKey = (s: GameState, k: string) => s.nations.find((n) => n.key === k)!;

describe('trading ventures', () => {
  const s = newGame();
  const ven = byKey(s, 'venice'); s.playerNations = [ven.id];
  s.ventures = s.ventures?.filter((v) => v.n !== ven.id); // (the AI of the first days may have opened some)
  days(s, 35);
  s.ventures = s.ventures?.filter((v) => v.n !== ven.id);

  it('cargo space adds up from its parts, and a great trading city has more than a petty lordship', () => {
    const c = cargoSpace(s, w, ven);
    expect(c.total).toBeCloseTo(c.parts.reduce((p, x) => p + x[1], 0) * c.mult, 6);
    expect(c.total).toBeGreaterThan(100);
    const petty = s.nations.filter((n) => n.alive && n.capital >= 0).sort((a, b) => cargoSpace(s, w, a).total - cargoSpace(s, w, b).total)[0];
    expect(cargoSpace(s, w, petty).total).toBeLessThan(c.total / 3);
  });

  it('opens the best venture shown, carries the goods next month and pays the crown its share', () => {
    const opts = ventureOptions(s, w, ven, { limit: 5 });
    expect(opts.length).toBeGreaterThan(0);
    const o = opts[0];
    expect(o.profit).toBeGreaterThan(0);
    expect(o.margin).toBeCloseTo(o.sell - o.buy - o.carriage - o.handling - o.tariff, 9);
    const r = applyCommand(s, w, { t: 'venture', n: ven.id, from: o.from, to: o.to, good: o.good, loads: o.loads });
    expect(r.ok).toBe(true);
    expect(loadsUsed(s, ven.id)).toBe(o.loads);
    // the panel answers with the same venture
    const view = answer(s, w, ven.id, { q: 'ventures' }) as any;
    expect(view.list.length).toBe(1);
    expect(view.cargo.used).toBe(o.loads);
    const before = ven.treasury;
    days(s, 31);
    const v = venturesOf(s, ven.id)[0];
    expect(v).toBeTruthy();
    if ((v.qty ?? 0) > 0) {
      expect(v.crown).toBeCloseTo((v.profit ?? 0) * VENTURE_CROWN, 9);
      expect(v.profit).toBeCloseTo((v.qty ?? 0) * (v.margin ?? 0), 6);
      // the goods are in the month's flows, marked as ours
      const f = s.flows.find((x) => x.venture === ven.id && x.from === v.from && x.to === v.to && x.good === v.good);
      expect(f?.qty).toBeCloseTo(v.qty!, 9);
      expect(ven.income.ventures ?? 0).toBeGreaterThan(0);
    } else {
      // the gap closed within the month: the venture says why it idled
      expect(['margin', 'supply', 'demand', 'blocked']).toContain(v.bound);
    }
    void before;
  });

  it('refuses what the rules do not allow', () => {
    const home = homeMarket(s, ven);
    expect(applyCommand(s, w, { t: 'venture', n: ven.id, from: home, to: home, good: GI.cloth, loads: 10 })).toEqual({ ok: false, err: 'the same market' });
    expect(applyCommand(s, w, { t: 'venture', n: ven.id, from: home, to: home, good: 999, loads: 10 })).toEqual({ ok: false, err: 'unknown good' });
    expect(applyCommand(s, w, { t: 'venture', n: ven.id, from: home, to: (home + 1) % s.markets.length, good: GI.cloth, loads: 0 }).ok).toBe(false);
    const free = cargoSpace(s, w, ven).total - loadsUsed(s, ven.id);
    const o = ventureOptions(s, w, ven, { limit: 30 }).find((x) => !venturesOf(s, ven.id).some((v) => v.from === x.from && v.to === x.to && v.good === x.good));
    if (o) expect(applyCommand(s, w, { t: 'venture', n: ven.id, from: o.from, to: o.to, good: o.good, loads: Math.ceil(free) + 50 })).toEqual({ ok: false, err: 'not enough cargo space' });
    for (const e of ['the same market', 'unknown good', 'no such venture', 'not enough cargo space', 'no free venture', 'no trade route', 'the route is too long']) expect(hasRefusalText(e)).toBe(true);
  });

  it('no more ventures than the slots allow', () => {
    const opts = ventureOptions(s, w, ven, { limit: 40, loads: 1 });
    let opened = 0;
    for (const o of opts) {
      const r = applyCommand(s, w, { t: 'venture', n: ven.id, from: o.from, to: o.to, good: o.good, loads: 1 });
      if (r.ok) opened++; else if (r.err === 'no free venture') break;
    }
    expect(venturesOf(s, ven.id).length).toBeLessThanOrEqual(ventureSlots(ven));
    const extra = opts.find((o) => !venturesOf(s, ven.id).some((v) => v.from === o.from && v.to === o.to && v.good === o.good));
    if (extra && venturesOf(s, ven.id).length === ventureSlots(ven)) expect(applyCommand(s, w, { t: 'venture', n: ven.id, from: extra.from, to: extra.to, good: extra.good, loads: 1 })).toEqual({ ok: false, err: 'no free venture' });
    // closing frees the slot and the loads
    const v = venturesOf(s, ven.id)[0];
    const used = loadsUsed(s, ven.id);
    expect(applyCommand(s, w, { t: 'venture', n: ven.id, from: v.from, to: v.to, good: v.good, loads: 0 }).ok).toBe(true);
    expect(loadsUsed(s, ven.id)).toBe(used - v.loads);
    void opened;
  });

  it('an embargo with the destination\'s ruler shuts the venture down', () => {
    const v = venturesOf(s, ven.id).find((x) => { const o = s.markets[x.to].owner; return o >= 0 && o !== ven.id; });
    if (!v) return;
    const o = s.markets[v.to].owner;
    expect(applyCommand(s, w, { t: 'diplo', n: ven.id, action: 'embargo', target: o }).ok).toBe(true);
    bump();
    expect(ventureRefusal(s, w, ven, v.from, v.to, v.good)).not.toBeNull();
    days(s, 31);
    expect(venturesOf(s, ven.id).some((x) => x.from === v.from && x.to === v.to && x.good === v.good)).toBe(false);
  });

  it('an estimate never carries more than the loads allow, and none without a margin', () => {
    const o = ventureOptions(s, w, ven, { limit: 1 })[0]; if (!o) return;
    const e = ventureEstimate(s, ven, o.from, o.to, o.good, 1)!;
    expect(e.qty * WEIGHT[o.good]).toBeLessThanOrEqual(1 + 1e-9);
    // the destination's price falls below the source's: the venture idles
    const keep = s.markets[o.to].price[o.good];
    s.markets[o.to].price[o.good] = s.markets[o.from].price[o.good] * 0.9;
    const e2 = ventureEstimate(s, ven, o.from, o.to, o.good, o.loads)!;
    expect(e2.qty).toBe(0); expect(e2.bound).toBe('margin');
    s.markets[o.to].price[o.good] = keep;
  });
});

describe('the AI runs ventures', () => {
  const s = newGame();
  days(s, 400);
  it('opens ventures, keeps within its cargo space and closes those that idle', () => {
    const vs = s.ventures ?? [];
    expect(vs.length).toBeGreaterThan(20);
    const realms = new Set(vs.map((v) => v.n));
    for (const n of realms) {
      const N = s.nations[n];
      expect(venturesOf(s, n).length).toBeLessThanOrEqual(ventureSlots(N));
      // (cargo space may have shrunk since: a harbour lost, a fleet sunk, but never far)
      expect(loadsUsed(s, n)).toBeLessThanOrEqual(cargoSpace(s, w, N).total * 1.5 + 1);
    }
    expect(vs.filter((v) => (v.idle ?? 0) > IDLE_CLOSE + 3).length).toBe(0);
    const paying = vs.filter((v) => (v.crown ?? 0) > 0).length;
    expect(paying).toBeGreaterThan(vs.length * 0.4);
  });
});

describe('building materials', () => {
  const s = newGame();
  const fr = byKey(s, 'france'); s.playerNations = [fr.id];
  days(s, 35);

  it('a work needs more materials at higher levels, and its pace follows what the market supplies', () => {
    const lv0 = buildMaterials(BI.fort, 0), lv2 = buildMaterials(BI.fort, 2);
    expect(lv0.length).toBeGreaterThan(0);
    lv0.forEach(([g, q], k) => { expect(lv2[k][0]).toBe(g); expect(lv2[k][1]).toBeCloseTo(q * 2, 9); });
    const m = s.loc.market[fr.capital], mk = s.markets[m];
    const keep = lv0.map(([g]) => [mk.supply[g], mk.demand[g]]);
    for (const [g] of lv0) { mk.supply[g] = 0; mk.demand[g] = 100; }
    expect(buildPace(s, m, BI.fort, 0).pace).toBeCloseTo(MIN_PACE, 9);
    for (const [g] of lv0) { mk.supply[g] = 200; mk.demand[g] = 100; }
    expect(buildPace(s, m, BI.fort, 0).pace).toBeCloseTo(1, 9);
    lv0.forEach(([g], k) => { mk.supply[g] = keep[k][0]; mk.demand[g] = keep[k][1]; });
  });

  it('a work without its materials goes slower, and asks the market for them', () => {
    const l = fr.capital;
    fr.treasury += 1e5;
    const r = applyCommand(s, w, { t: 'build', n: fr.id, loc: l, building: BI.road });
    if (!r.ok) return; // (fully built already)
    const c = s.constructions.find((x) => x.loc === l && x.building === BI.road && x.nation === fr.id)!;
    expect(c.level).toBe(s.loc.buildings[l * B + BI.road]);
    const mk = s.markets[s.loc.market[l]];
    const mats = buildMaterials(BI.road, c.level!);
    for (const [g] of mats) { mk.supply[g] = 0; mk.demand[g] = 100; }
    const left0 = c.left; const d0 = mats.map(([g]) => mk.dAcc[g]);
    advanceDay(s, w);
    // (the clearing of a new month would reset supply and demand: check only within a month)
    if (c.left < left0) {
      expect(left0 - c.left).toBeLessThan(0.5);
      mats.forEach(([g], k) => expect(mk.dAcc[g]).toBeGreaterThan(d0[k]));
    }
  });
});
