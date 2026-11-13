// Market access (src/sim/systems/access.ts), grain stores with famine and workshops owned by the estates or the crown
// (src/sim/systems/economy.ts).
import { describe, it, expect } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { advanceDay } from '../src/sim/engine';
import { marketAccess, accessOf, farmgate, reaching, markup, MIN_ACCESS, ACCESS_RANGE } from '../src/sim/systems/access';
import { foodStores, foodMonths, locationStep, LOC_ECON, FAMINE_FOOD, worksOwners, worksProfit, worksPrice, firstOwner } from '../src/sim/systems/economy';
import { applyCommand } from '../src/sim/commands';
import { hasRefusalText } from '../src/sim/refusals';
import { RECIPES } from '../src/sim/defs';
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

describe('workshops owned by the estates and the crown', () => {
  const s = newGame();
  days(s, 40);
  const fr = s.nations.find((n) => n.key === 'france')!;
  it('every working slot has an owner, lords their mills and presses, the burghers most of the rest', () => {
    const own = worksOwners(s, w);
    const cnt = [0, 0, 0, 0];
    for (let k = 0; k < w.L * 3; k++) if (s.loc.workshop[k]) { expect(own[k]).toBeLessThan(4); cnt[own[k]]++; }
    expect(cnt[0]).toBeGreaterThan(cnt[2]); expect(cnt[1]).toBeGreaterThan(0);
    const mill = RECIPES.findIndex((r) => r.id === 'mill'), powder = RECIPES.findIndex((r) => r.id === 'powder_mill');
    expect(firstOwner(s, fr.capital, mill)).toBe(1);
    expect(firstOwner(s, fr.capital, powder)).toBe(3);
  });
  it('the crown buys a workshop from its estate at the price shown and can sell it again', () => {
    const own = worksOwners(s, w), pf = worksProfit(s, w);
    let x = -1;
    for (let l = 0; l < w.L && x < 0; l++) if (s.loc.owner[l] === fr.id) for (let k = 0; k < 3; k++) if (s.loc.workshop[l * 3 + k] && own[l * 3 + k] !== 3) { x = l * 3 + k; break; }
    expect(x).toBeGreaterThanOrEqual(0);
    const l = Math.floor(x / 3), k = x % 3;
    const price = worksPrice(s, w, l, k);
    expect(price).toBeGreaterThan(0);
    void pf;
    fr.treasury = price - 1;
    expect(applyCommand(s, w, { t: 'works', n: fr.id, loc: l, slot: k, buy: true })).toEqual({ ok: false, err: 'not enough gold' });
    fr.treasury = price + 100;
    expect(applyCommand(s, w, { t: 'works', n: fr.id, loc: l, slot: k, buy: true }).ok).toBe(true);
    expect(own[x]).toBe(3);
    expect(fr.treasury).toBeCloseTo(100, 6);
    expect(applyCommand(s, w, { t: 'works', n: fr.id, loc: l, slot: k, buy: true })).toEqual({ ok: false, err: 'the crown owns it already' });
    expect(applyCommand(s, w, { t: 'works', n: fr.id, loc: l, slot: k, buy: false }).ok).toBe(true);
    expect(own[x]).toBe(0);
    expect(applyCommand(s, w, { t: 'works', n: fr.id, loc: l, slot: k, buy: false })).toEqual({ ok: false, err: 'the crown does not own it' });
    const foreign = s.loc.owner.findIndex((o, i) => i < w.L && o >= 0 && o !== fr.id && s.loc.workshop[i * 3] > 0);
    expect(applyCommand(s, w, { t: 'works', n: fr.id, loc: foreign, slot: 0, buy: true })).toEqual({ ok: false, err: 'not your location' });
    for (const e of ['no workshop there', 'the crown owns it already', 'the crown does not own it']) expect(hasRefusalText(e)).toBe(true);
  });
  it('the crown\'s works pay into the treasury, and the AI buys some of its own over time', () => {
    const s2 = newGame(); days(s2, 400);
    const own = worksOwners(s2, w);
    let crown = 0; for (let k = 0; k < w.L * 3; k++) if (s2.loc.workshop[k] && own[k] === 3) crown++;
    expect(crown).toBeGreaterThan(20);
    let rw = 0, tax = 0; for (const n of s2.nations) if (n.alive) { rw += n.income.royal_works ?? 0; tax += n.income.tax ?? 0; }
    expect(rw).toBeGreaterThan(0);
    expect(rw).toBeLessThan(tax * 0.15);
  });
});
