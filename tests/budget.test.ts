// Spec point 96: AI realms use a full chest in peacetime instead of hoarding it. Above a reserve of a year's revenue
// they repay loans, content their estates, build on landmarks and in their land, keep a fleet if they have a coast,
// and Atlantic crowns can fund colonial ventures. Run: npx vitest run tests/budget.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { serialize, deserialize } from '../src/sim/engine';
import { bump, DAY_EPOCH } from '../src/sim/ctx';
import { UNITS } from '../src/sim/defs';
import { spendSurplus, construction } from '../src/sim/systems/ai';
import { takeDecision } from '../src/sim/systems/events';
import { colonySlots } from '../src/sim/systems/colonial';
import type { GameState, Nation } from '../src/sim/types';

const w = loadWorld();
let BASE = '';
beforeAll(() => { BASE = serialize(createGame(w, loadSetup(1356), loadHubs(), 1356, { player: [] })); });
const fresh = () => deserialize(BASE) as GameState;
const nat = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!;
const gross = (n: Nation) => Object.values(n.income).reduce((p, v) => p + Math.max(0, v), 0);
const touch = () => { DAY_EPOCH.v++; bump(); };
/** A realm at peace on a day when its fleet is reviewed (see spendSurplus). */
function atPeace(s: GameState, n: Nation) {
  s.wars = s.wars.filter((x) => !x.att.includes(n.id) && !x.def.includes(n.id));
  s.day += (90 - ((s.day + n.id) % 90)) % 90;
}

describe('AI budget (point 96)', () => {
  it('a rich realm at peace spends its surplus but keeps a year of revenue', () => {
    const s = fresh(); const n = nat(s, 'portugal'); atPeace(s, n);
    const g = gross(n); expect(g).toBeGreaterThan(0);
    n.treasury = g * 12 * 4;
    n.loans = [{ amount: g * 3, rate: 0.08, due: s.day + 365 * 5, lender: 'test' }];
    n.estates[0].contentment = 30;
    const sites0 = s.constructions.filter((c) => c.nation === n.id).length;
    const t0 = n.treasury;
    spendSurplus(s, w, n);
    for (let k = 0; k < 3; k++) construction(s, w, n);
    expect(n.loans.length).toBe(0);
    expect(n.estates[0].contentment).toBeGreaterThan(30);
    expect(s.recruits.some((r) => r.nation === n.id && UNITS[r.type].kind === 'ship' && UNITS[r.type].id !== 'transport')).toBe(true);
    expect(s.constructions.filter((c) => c.nation === n.id).length).toBeGreaterThanOrEqual(sites0 + 3);
    expect(n.treasury).toBeLessThan(t0 - g * 3);
    expect(n.treasury).toBeGreaterThan(g * 12 * 0.5);
  });

  it('a realm without a surplus keeps its gold', () => {
    const s = fresh(); const n = nat(s, 'portugal'); atPeace(s, n);
    n.treasury = gross(n) * 6; const t0 = n.treasury;
    spendSurplus(s, w, n);
    expect(n.treasury).toBe(t0);
  });

  it('an Atlantic crown can fund a colonial venture for one more group of settlers', () => {
    const s = fresh(); const n = nat(s, 'portugal');
    n.flags.atlantic = 1; n.tech[1] = 9; n.treasury = 1e6; touch();
    const slots = colonySlots(n);
    expect(takeDecision(s, w, n, 'colonial_venture')).toBe(null);
    touch();
    expect(colonySlots(n)).toBe(slots + 1);
    expect(takeDecision(s, w, n, 'colonial_venture')).not.toBe(null); // once in fifteen years
  });
});
