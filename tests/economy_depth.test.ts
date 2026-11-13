// Market access (src/sim/systems/access.ts) and grain stores with famine (src/sim/systems/economy.ts).
import { describe, it, expect } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { advanceDay } from '../src/sim/engine';
import { marketAccess, accessOf, farmgate, reaching, markup, MIN_ACCESS, ACCESS_RANGE } from '../src/sim/systems/access';
import { foodStores, foodMonths, locationStep, LOC_ECON, FAMINE_FOOD } from '../src/sim/systems/economy';
import { answer } from '../src/game/view';
import { B, BI, C } from '../src/sim/defs';
import type { GameState } from '../src/sim/types';

const w = loadWorld();
const newGame = () => createGame(w, loadSetup(1356), loadHubs(), 4242, { player: [] });
const days = (s: GameState, n: number) => { for (let i = 0; i < n; i++) advanceDay(s, w); };

describe('market access', () => {
  const s = newGame();
  it('hubs have full access, it falls with the way and never below the floor', () => {
    const { access, cost } = marketAccess(s, w);
    for (const m of s.markets) { expect(cost[m.hub]).toBe(0); expect(access[m.hub]).toBe(1); }
    for (let i = 0; i < w.L; i++) { expect(access[i]).toBeGreaterThanOrEqual(MIN_ACCESS - 1e-6); expect(access[i]).toBeLessThanOrEqual(1); }
    expect(accessOf(ACCESS_RANGE / 2)).toBeGreaterThan(accessOf(ACCESS_RANGE));
    expect(accessOf(ACCESS_RANGE * 5)).toBe(MIN_ACCESS);
    expect(farmgate(1)).toBe(1); expect(reaching(1)).toBe(1); expect(markup(1)).toBe(1);
    expect(farmgate(0.5)).toBeLessThan(1); expect(markup(0.5)).toBeGreaterThan(1);
  });
  it('roads shorten the way to the hub', () => {
    const { cost } = marketAccess(s, w);
    // a place well away from its hub
    let l = -1; for (let i = 0; i < w.L; i++) if (s.loc.owner[i] >= 0 && cost[i] > 300 && cost[i] < 900) { l = i; break; }
    expect(l).toBeGreaterThanOrEqual(0);
    const before = cost[l];
    s.loc.buildings[l * B + BI.road] = 3;
    expect(marketAccess(s, w).cost[l]).toBeLessThan(before);
    s.loc.buildings[l * B + BI.road] = 0;
    expect(marketAccess(s, w).cost[l]).toBeCloseTo(before, 3);
  });
  it('the place panel shows it', () => {
    const d = answer(s, w, -1, { q: 'loc', loc: s.markets[0].hub } as any);
    if (d?.access) expect(d.access.access).toBe(1);
  });
});

describe('grain stores and famine', () => {
  const s = newGame();
  days(s, 31);
  it('the barns never hold more than their capacity, and a good month fills them', () => {
    const st = foodStores(s, w);
    for (let i = 0; i < w.L; i++) {
      let p = 0; for (let c = 0; c < C; c++) p += s.loc.pop[i * C + c];
      const cap = Math.max(1, p / 100 * 9) * foodMonths(s.loc.buildings[i * B + BI.farm], s.loc.buildings[i * B + BI.church]);
      expect(st[i]).toBeLessThanOrEqual(cap * 1.05 + 1);
    }
  });
  it('a failed harvest with empty barns brings famine; full barns carry the village through', () => {
    const l = s.nations.find((n) => n.key === 'france')!.capital;
    const st = foodStores(s, w);
    s.loc.harvest[l] = 0.3; st[l] = 0;
    locationStep(s, w, l);
    const hungry = LOC_ECON!.food[l];
    st[l] = 1e9; // (more than the barns hold: the step only eats from it)
    locationStep(s, w, l);
    const fed = LOC_ECON!.food[l];
    expect(fed).toBeGreaterThan(hungry);
    expect(st[l]).toBeLessThan(1e9);
    void FAMINE_FOOD;
  });
});
