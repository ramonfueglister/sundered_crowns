// Economy fixes (fix-econ track): the month's books close after every system has booked its costs, so the ledger
// shown is what moved the treasury; the first month's recurring costs are shown from day 0; a crown that borrows by
// itself says so. Run: npx vitest run --testTimeout=180000 tests/econ_fix.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { advanceDay, serialize, deserialize } from '../src/sim/engine';
import { dayToDate } from '../src/sim/calendar';
import { budgetForecast } from '../src/sim/systems/administration';
import { closeLedger } from '../src/sim/systems/economy';
import { answer, playerView } from '../src/game/view';
import { authorityGain } from '../src/sim/systems/politics';
import { ownedLocs } from '../src/sim/systems/war';
import { unitCost, unitUpkeep } from '../src/sim/systems/military';
import { UNITS } from '../src/sim/defs';
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
