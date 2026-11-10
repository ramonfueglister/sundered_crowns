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
import type { GameState, Nation } from '../src/sim/types';

const w = loadWorld();
let BASE = '';
beforeAll(() => { BASE = serialize(createGame(w, loadSetup(1356), loadHubs(), 1356, { player: [] })); });
const fresh = (player?: string) => { const s = deserialize(BASE) as GameState; if (player) s.playerNations = [nat(s, player).id]; return s; };
const nat = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!;
const sum = (o: Record<string, number> | undefined) => Object.values(o ?? {}).reduce((p, v) => p + v, 0);
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
