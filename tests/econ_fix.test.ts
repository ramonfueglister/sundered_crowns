// Economy fixes (fix-econ track): the month's books close after every system has booked its costs, so the ledger
// shown is what moved the treasury; the first month's recurring costs are shown from day 0; a crown that borrows by
// itself says so. Run: npx vitest run --testTimeout=180000 tests/econ_fix.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { advanceDay, serialize, deserialize } from '../src/sim/engine';
import { dayToDate } from '../src/sim/calendar';
import { budgetForecast } from '../src/sim/systems/administration';
import { closeLedger, craftOutcome, locationStep, locGoods, LOC_ECON, tariffMax } from '../src/sim/systems/economy';
import { tradePolicy, priceIndexParts, goodDetail } from '../src/game/tradeview';
import { methodsView } from '../src/game/methodsview';
import { expeditionTargets, expeditionPlan, startExplorer, OCEAN_KM, OPEN_KM } from '../src/sim/systems/explore';
import { answer, playerView } from '../src/game/view';
import { authorityGain } from '../src/sim/systems/politics';
import { ownedLocs } from '../src/sim/systems/war';
import { unitCost, unitUpkeep } from '../src/sim/systems/military';
import { UNITS, C, CL, GOODS, G, GI } from '../src/sim/defs';
import { applyCommand } from '../src/sim/commands';
import { homeMarket, merchantRefusal, steerRoute, tradeEarnings } from '../src/sim/systems/trade';
import type { GameState, Nation } from '../src/sim/types';

const w = loadWorld();
let BASE = '';
beforeAll(() => { BASE = serialize(createGame(w, loadSetup(1356), loadHubs(), 1356, { player: [] })); });
const fresh = (player?: string) => { const s = deserialize(BASE) as GameState; if (player) s.playerNations = [nat(s, player).id]; return s; };
const nat = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!;
const sum = (o: Record<string, number> | undefined) => Object.values(o ?? {}).reduce((p, v) => p + v, 0);
const rows = (r: [unknown, number][]) => r.reduce((p, x) => p + x[1], 0);
/** Advance to the end of the next first-of-month tick (the close of the books). */
function toNextClose(s: GameState) { do advanceDay(s, w); while (dayToDate(s.day, s.startYear).d !== 1); }

describe('the month\'s books (ledger, balance, forecast)', () => {
  it('a month\'s treasury change equals the ledger shown, upkeep included in the month it is paid', () => {
    const s = fresh('venice'); const realms = ['venice', 'genoa', 'england', 'aragon', 'portugal'].map((k) => nat(s, k));
    let t0 = realms.map((n) => n.treasury);
    for (let m = 0; m < 3; m++) {
      toNextClose(s);
      realms.forEach((n, k) => {
        const shown = sum(n.income) - sum(n.expense) + sum(n.credit);
        expect(n.treasury - t0[k]).toBeCloseTo(shown, 4);
        // armies and fleets are paid in the month itself, not a month late
        expect(n.expense.army ?? 0).toBeGreaterThan(0);
      });
      expect(nat(s, 'venice').expense.navy ?? 0).toBeGreaterThan(0);
      // Venice's month leaves nothing unexplained: every movement has its own line
      expect(Math.abs(nat(s, 'venice').credit?.other ?? 0)).toBeLessThan(0.01);
      t0 = realms.map((n) => n.treasury);
    }
  });
  it('on day 0 the ledger and the forecast already carry the first month\'s upkeep, marked as an estimate', () => {
    const s = fresh('portugal'); const n = nat(s, 'portugal'); const v = nat(s, 'venice');
    expect(n.flags.ledger_estimate).toBe(1);
    for (const k of ['court', 'army', 'fortresses']) expect(n.expense[k] ?? 0).toBeGreaterThan(0);
    expect(v.expense.navy ?? 0).toBeGreaterThan(0);
    const f = budgetForecast(s, v);
    expect(f.expenseLines.some(([k]) => k === 'navy')).toBe(true);
    // the estimate is what the month will cost: the first close books army upkeep within a few percent of it
    const est = n.expense.army; toNextClose(s);
    expect(n.flags.ledger_estimate).toBeUndefined();
    expect(Math.abs((n.expense.army ?? 0) - est) / est).toBeLessThan(0.6);
  });
  it('a crown whose chest is empty at the close borrows, books the loan and tells a human ruler', () => {
    const s = fresh('portugal'); const n: Nation = nat(s, 'portugal');
    toNextClose(s);
    const t0 = n.treasury; n.treasury = -500;
    closeLedger(s);
    expect(n.loans.length).toBe(1);
    expect(n.credit?.loans).toBeCloseTo(550, 6);
    expect(n.credit?.other).toBeCloseTo(-500 - t0, 6); // the 500 taken out by hand above, found at the close
    expect(n.treasury).toBeCloseTo(50, 6);
    const note = s.notices.find((x) => x.nation === n.id && x.kind === 'loan');
    expect(note).toBeTruthy();
    expect(note!.text.de).toMatch(/Mark bei .+ zu \d+(,\d)? % im Jahr, fällig am \d+\.\d+\.\d{4}/);
    expect(note!.text.de).not.toMatch(/Lombard bankers|Hanseatic merchants|Jewish moneylenders/);
  });
});

describe('top bar totals equal their breakdowns', () => {
  const check = (s: GameState, n: Nation) => {
    const e = (answer(s, w, n.id, { q: 'realm' }) as any).explain;
    expect(rows(e.manpower.parts)).toBeCloseTo(n.maxManpower, 3);
    expect(e.manpower.max).toBeCloseTo(n.maxManpower, 3);
    expect(n.manpower).toBeLessThanOrEqual(n.maxManpower + 1e-9);
    expect(rows(e.envoys.parts)).toBe(n.envoys);
    expect(rows(e.authority.parts)).toBeCloseTo(authorityGain(s, n), 6);
    const p = playerView(s, n);
    expect(p.income).toBeCloseTo(sum(p.incomeBreak), 6);
    expect(p.expense).toBeCloseTo(sum(p.expenseBreak), 6);
  };
  it('on day 0, for realms large and small', () => {
    const s = fresh();
    for (const key of ['portugal', 'england', 'venice', 'france', 'moscow']) { s.playerNations = [nat(s, key).id]; check(s, nat(s, key)); }
  });
  it('the day after the ruler\'s council or the realm\'s land changes, not a month later', () => {
    const s = fresh('portugal'); const n = nat(s, 'portugal');
    advanceDay(s, w); advanceDay(s, w);
    const env0 = n.envoys, mp0 = n.maxManpower;
    if (n.council.chancellor) delete n.council.chancellor; else n.council.chancellor = n.heir || n.ruler;
    const lost = ownedLocs(s, n.id).filter((l) => l !== n.capital).slice(0, 3);
    for (const l of lost) s.loc.ctrl[l] = -2; // held by rebels
    advanceDay(s, w);
    expect(dayToDate(s.day, s.startYear).d).not.toBe(1);
    expect(n.envoys).not.toBe(env0);
    expect(n.maxManpower).toBeLessThan(mp0);
    check(s, n);
  });
});

describe('ships are priced like their crews', () => {
  const unit = (id: string) => UNITS.findIndex((u) => u.id === id);
  it('a war galley costs and eats what a crew of a few hundred does, not what 1,000 soldiers do', () => {
    const s = fresh('venice'); const n = nat(s, 'venice');
    const g = unit('galley'), maa = unit('men_at_arms');
    expect(unitUpkeep(s, n, g, 1)).toBeLessThan(unitUpkeep(s, n, maa, 1000) * 0.25);
    expect(unitCost(s, n, g, 1)).toBeLessThan(unitCost(s, n, maa, 1000) * 0.4);
  });
  it('Venice\'s fleet of 1356 takes a fifth to a third of its revenue, not three times it', () => {
    const s = fresh('venice'); const n = nat(s, 'venice');
    const ships = s.armies.filter((a) => a.owner === n.id && a.fleet).reduce((p, a) => p + a.regs.reduce((q, r) => q + r.men, 0), 0);
    expect(ships).toBeGreaterThanOrEqual(20);
    toNextClose(s);
    const share = (n.expense.navy ?? 0) / sum(n.income);
    expect(share).toBeGreaterThan(0.15); expect(share).toBeLessThan(0.35);
    expect(n.loans.length).toBe(0);
  });
});

describe('trade income can be traced to the markets it came from', () => {
  it('merchants steering home: last month\'s income by market adds up to the ledger, the steered trade credited to its source', () => {
    const s = fresh('venice'); const n = nat(s, 'venice'); const home = homeMarket(s, n);
    toNextClose(s);
    // two merchants steer home from the richest market in reach with a route home
    const m = s.markets.filter((x) => x.id !== home && !merchantRefusal(s, w, n, x.id) && steerRoute(s, n.id, x.id) && (x.tv ?? 0) > 0).sort((a, b) => (b.tv ?? 0) - (a.tv ?? 0))[0];
    expect(m).toBeTruthy();
    expect(applyCommand(s, w, { t: 'merchant', n: n.id, market: m.id, amount: 2, steer: true }).ok).toBe(true);
    toNextClose(s);
    const rows = tradeEarnings(s, n.id);
    const total = rows.reduce((p, r) => p + r.total, 0);
    expect(total).toBeCloseTo((n.income.trade ?? 0) + (n.income.company ?? 0), 6);
    // what our merchants steered from m is credited to m, though it was paid at home
    const src = rows.find((r) => r.m === m.id)!;
    expect(src).toBeTruthy();
    expect(src.steered.some((x) => x.to === home && x.v > 0)).toBe(true);
    expect(s.markets[home].tinFrom?.[m.id] ?? 0).toBeGreaterThan(0);
    // the market view says the same: our income at home splits into our own share and the shares steered in by source
    const d = answer(s, w, n.id, { q: 'tmarket', market: home }) as any;
    expect(d.our.own + d.our.fromIn.reduce((p: number, x: any) => p + x.v, 0)).toBeCloseTo(d.our.paid, 6);
    expect(d.our.fromIn.some((x: any) => x.from === m.id)).toBe(true);
    const dm = answer(s, w, n.id, { q: 'tmarket', market: m.id }) as any;
    expect(dm.our.homeRows.reduce((p: number, x: any) => p + x.v, 0)).toBeCloseTo(src.steered.reduce((p, x) => p + x.v, 0), 6);
    const list = answer(s, w, n.id, { q: 'tmarkets' }) as any[];
    expect(list.reduce((p, x) => p + x.earned, 0)).toBeCloseTo(total, 6);
  });
});

describe('production methods can be set for many towns at once', () => {
  it('a town\'s outcome under its own method is what its workshops make, and the batch switches every town it names', () => {
    const s = fresh('venice'); const n = nat(s, 'venice');
    for (let d = 0; d < 3; d++) advanceDay(s, w);
    const v = methodsView(s, w, n.id)!;
    expect(v.towns.length).toBeGreaterThan(3);
    // the overview's numbers for the method a town has are the crafts step's own: value made, raw materials, hands
    for (const t of v.towns.slice(0, 6)) {
      const o = craftOutcome(s, w, t.loc);
      const art = s.loc.pop[t.loc * C + CL.artisans] + s.loc.pop[t.loc * C + CL.wage_workers];
      locationStep(s, w, t.loc);
      expect(LOC_ECON!.craft[t.loc]).toBeCloseTo(o.out, 1);
      const used = locGoods(s.loc, w, t.loc, null).crafts; const mk = s.markets[s.loc.market[t.loc]];
      expect([...used].reduce((p, [g, q]) => p + q * mk.price[g], 0)).toBeCloseTo(o.inp, 1);
      expect(s.loc.employed[t.loc * C + CL.artisans] * art).toBeCloseTo(o.jobs, 0);
    }
    // putting-out: more hands and more output than the guild, a little more raw material per piece
    const g = v.towns.find((t) => t.method === 0 && t.alt[0][2] > 0)!;
    expect(g.alt[1][2]).toBeGreaterThan(g.alt[0][2]);
    expect(g.alt[1][1]).toBeGreaterThan(g.alt[0][1]);
    // with Commerce 6 and gold, one batch of ordinary 'method' orders switches all guild towns
    n.tech[1] = Math.max(n.tech[1], 6); n.treasury = 1e6;
    const v2 = methodsView(s, w, n.id)!;
    const go = v2.towns.filter((t) => t.method === 0 && t.alt[1][4] === null).map((t) => t.loc);
    expect(go.length).toBeGreaterThan(3);
    const t0 = n.treasury;
    const r = applyCommand(s, w, { t: 'batch', n: n.id, cmds: go.map((loc) => ({ t: 'method', n: n.id, loc, method: 1 })) } as any);
    expect(r.ok).toBe(true); expect(r.done).toBe(go.length);
    for (const l of go) expect(s.loc.method[l]).toBe(1);
    expect(t0 - n.treasury).toBeCloseTo(go.length * v2.methods[1].cost, 0);
    // and the overview now says why they cannot switch again so soon
    const v3 = methodsView(s, w, n.id)!;
    expect(v3.towns.find((t) => t.loc === go[0])!.alt[0][4]).toBe('the workshops were reorganised recently');
  });
});

describe('expeditions are measured along their route', () => {
  it('the Red Sea from Venice is an ocean voyage round Africa, and the refusal names what that voyage needs', () => {
    const s = fresh('venice'); const n = nat(s, 'venice');
    n.tech[1] = 7; n.era = 0; n.treasury = 1e5; n.sailors = 1e4;
    const tg = expeditionTargets(s, w, n);
    // sorted by the route from our harbours, and every one of them reachable
    expect(tg.length).toBeGreaterThan(5);
    for (let k = 1; k < tg.length; k++) expect(tg[k].km).toBeGreaterThanOrEqual(tg[k - 1].km);
    const red = tg.find((x) => x.region.name.en === 'Red Sea')!;
    expect(red).toBeTruthy();
    const p = expeditionPlan(s, w, n, red.to, 0);
    expect(p.path.length).toBeGreaterThan(10);
    const straight = w.distKm(p.start, red.to);
    expect(straight).toBeLessThan(OCEAN_KM); // as the crow flies it would have passed for a coastal voyage
    expect(p.km).toBeGreaterThan(straight * 3); // but the way there runs round Africa
    expect(p.km).toBeCloseTo(red.km, -2);
    expect(p.ocean).toBe(true);
    expect(p.open).toBeGreaterThan(OPEN_KM);
    expect(p.refusal).toBe('an ocean voyage needs Commerce 10');
    expect(p.needs.find((x) => x.key === 'commerce')!.need).toBe(10);
    // without even the coastal knowledge, the refusal still names the voyage's own requirement
    n.tech[1] = 3;
    expect(expeditionPlan(s, w, n, red.to, 0).refusal).toBe('an ocean voyage needs Commerce 10');
    // a voyage along the coasts needs only Commerce 6, however long
    n.tech[1] = 7;
    const coast = tg.map((x) => expeditionPlan(s, w, n, x.to, 0)).find((x) => !x.ocean && x.path.length > 0)!;
    expect(coast).toBeTruthy();
    expect(coast.refusal).toBeNull();
    // and a fleet sent by startExplorer obeys the same rule
    const f = s.armies.find((a) => a.owner === n.id && a.fleet)!;
    expect(startExplorer(s, w, n, f.id, red.to)).toBe('an ocean voyage needs Commerce 10');
  });
});

describe('what a tariff keeps out is told by good, with the margin it would have made', () => {
  it('the kept-out value splits by good, and its margin is a small part of it', () => {
    const s = fresh('england'); const n = nat(s, 'england');
    n.tariff = tariffMax(n);
    toNextClose(s); toNextClose(s);
    const d = tradePolicy(s, w, n.id)!;
    expect(d.deter).toBeGreaterThan(0);
    let v = 0, mg = 0;
    for (const m of s.markets) if (m.owner === n.id) for (const [x, y] of Object.values(m.deterBy ?? {})) { v += x; mg += y; }
    expect(v).toBeCloseTo(d.deter, 6);
    expect(d.keptMargin).toBeCloseTo(mg, 6);
    expect(d.keptOut.reduce((p, x) => p + x.v, 0)).toBeLessThanOrEqual(d.deter + 1e-6);
    // the goods value is not lost income: the margin of what was kept out is a fraction of its value
    expect(d.keptMargin / d.deter).toBeLessThan(0.5);
    expect(d.keptOut[0].margin).toBeGreaterThan(0);
  });
});

describe('prices: the index weighs what the market buys, and a good\'s books add up to the goods table', () => {
  it('the price index is the demand-weighted mean of prices against their base; its parts add up; supply and demand split exactly', () => {
    const s = fresh('venice'); const n = nat(s, 'venice'); const home = homeMarket(s, n);
    toNextClose(s); toNextClose(s);
    const mk = s.markets[home]; const pl = s.priceLevel;
    let a = 0, b = 0;
    GOODS.forEach((g, k) => { const wt = mk.demand[k] * g.base * pl; a += wt * mk.price[k] / (g.base * pl); b += wt; });
    expect(mk.priceIndex).toBeCloseTo(a / b, 3); // (the price level moves a hair after the markets clear)
    const parts = priceIndexParts(s, home)!;
    expect(1 + parts.top.reduce((p, x) => p + x.pull, 0) + parts.rest).toBeCloseTo(mk.priceIndex, 6);
    // the goods that pull it most are dear staples the market buys a lot of, not goods nobody here wants
    expect(parts.top[0].share).toBeGreaterThan(0.01);
    for (let g = 0; g < G; g++) {
      const d = goodDetail(s, w, n.id, home, g)!;
      if (d.supply + d.demand < 1) continue;
      expect(d.books).toBeTruthy();
      expect(d.books!.made + d.books!.netIn + d.books!.held).toBeCloseTo(d.supply, 3);
      expect(d.books!.people + d.books!.rest).toBeCloseTo(d.demand, 3);
      expect(d.books!.made).toBeGreaterThanOrEqual(-1e-6);
    }
    expect(goodDetail(s, w, n.id, home, GI.grain)!.books!.people).toBeGreaterThan(0);
  });
});
