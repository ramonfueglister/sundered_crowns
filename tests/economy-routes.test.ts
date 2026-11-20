// Economy feature 17 (docs/ECONOMY_DESIGN.md, section 17): the routes between the cities of the world, and the
// cities of the game with distance between them.
import { describe, it, expect } from 'vitest';
import { loadWorld, newWorldState } from '../tools/sim/load';
import { cityRoutes } from '../src/sim/economy/routes';
import { cityPlaces } from '../src/sim/systems/economy';
import { loadWays } from '../tools/sim/load';
import { advanceDay } from '../src/sim/engine';

const w = loadWorld(),
  t = w.cityEconomies.table;
const cities = cityPlaces(1356),
  n = cities.length,
  at = (name: string) => cities.findIndex((c) => c.name === name);
const r = cityRoutes(
  w,
  cities.map((c) => c.place),
  t,
);
const days = (a: string, b: string) => r.days[at(a) * n + at(b)];
const labour = (a: string, b: string) => r.labour[at(a) * n + at(b)];

describe('the routes between the cities', () => {
  it('are the same both ways, and a city has no way to itself', () => {
    expect(r.cities).toBe(n);
    expect(r.weight).toEqual(t.routes.tonnes_per_pound.value);
    expect(r.elasticity).toBe(t.routes.stock_elasticity.value);
    for (let c = 0; c < n; c++) {
      expect(r.days[c * n + c]).toBe(0);
      for (let d = 0; d < n; d++) {
        expect(r.days[c * n + d]).toBe(r.days[d * n + c]);
        expect(r.labour[c * n + d]).toBe(r.labour[d * n + c]);
      }
    }
  });
  it('take longer and more labour the farther two cities lie apart', () => {
    // Cairo's own harbours lie days away, the cities beyond the sea weeks, the far north months
    expect(days('Cairo', 'Damietta')).toBeLessThan(20);
    expect(days('Cairo', 'Alexandria')).toBeLessThan(days('Cairo', 'Venice'));
    expect(days('Cairo', 'Venice')).toBeLessThan(days('Cairo', 'London'));
    expect(days('Venice', 'Alexandria')).toBeGreaterThan(10);
    expect(days('Venice', 'Alexandria')).toBeLessThan(30);
    expect(labour('Cairo', 'Alexandria')).toBeLessThan(labour('Cairo', 'London'));
    // an inland way of the same length takes far more labour than one by sea: Baghdad to Tabriz against Venice to Alexandria
    expect(labour('Baghdad', 'Tabriz')).toBeGreaterThan(5 * labour('Venice', 'Alexandria'));
  });
  it('carry by weight: a pound of agricultural goods weighs more than a pound of industrial goods, services nothing', () => {
    const [a, i, sv] = r.weight;
    expect(a).toBeGreaterThan(i);
    expect(i).toBeGreaterThan(0);
    expect(sv).toBe(0);
    // Paris to Ghent: two weeks, and more than a hundred days of labour a tonne
    expect(days('Paris', 'Ghent')).toBeGreaterThan(7);
    expect(days('Paris', 'Ghent')).toBeLessThan(30);
    expect(labour('Paris', 'Ghent')).toBeGreaterThan(50);
    expect(labour('Paris', 'Ghent')).toBeLessThan(400);
  });
  it('do not link the regions the table names as apart with the others', () => {
    expect(t.routes.apart.value).toContain('americas');
    const tex = at('Texcoco');
    expect(w.provinces[w.provOf[cities[tex].place]].region).toBe('americas');
    for (let d = 0; d < n; d++) expect(r.days[tex * n + d]).toBe(0);
    let ways = 0;
    for (let c = 0; c < n; c++)
      for (let d = 0; d < n; d++)
        if (c !== d && c !== tex && d !== tex) {
          expect(r.days[c * n + d]).toBeGreaterThan(0);
          ways++;
        }
    expect(ways).toBe((n - 1) * (n - 2));
  });
  it('are kept: the same world, places and table give the same routes at once', () => {
    expect(
      cityRoutes(
        w,
        cities.map((c) => c.place),
        t,
      ),
    ).toBe(r);
    expect(
      cityRoutes(
        w,
        cities.slice(0, 5).map((c) => c.place),
        t,
      ).cities,
    ).toBe(5);
  });
  it('go over land on the ways of the year, longer than the straight line, and the same over the sea', () => {
    const net = loadWays(1356, w.N)!;
    expect(net.laid).toBe(1291);
    const v = cityRoutes(
        w,
        cities.map((c) => c.place),
        t,
        net,
      ),
      on = (a: string, b: string) => v.days[at(a) * n + at(b)];
    expect(
      cityRoutes(
        w,
        cities.map((c) => c.place),
        t,
        net,
      ),
    ).toBe(v);
    expect(v).not.toBe(r);
    // Paris to Cologne goes over land: longer on the ways than on the straight line, and more labour
    expect(on('Paris', 'Cologne')).toBeGreaterThan(days('Paris', 'Cologne'));
    expect(v.labour[at('Paris') * n + at('Cologne')]).toBeGreaterThan(labour('Paris', 'Cologne'));
    // Venice to Alexandria goes by sea
    expect(on('Venice', 'Alexandria')).toBe(days('Venice', 'Alexandria'));
    for (let c = 0; c < n; c++) for (let d = 0; d < n; d++) expect(v.days[c * n + d] >= r.days[c * n + d]).toBe(true);
  });
  it('refuse a table that does not fit', () => {
    const bad = { ...t, routes: { ...t.routes, tonnes_per_pound: { ...t.routes.tonnes_per_pound, value: [1, 1] } } };
    expect(() =>
      cityRoutes(
        w,
        cities.map((c) => c.place),
        bad,
      ),
    ).toThrow('weight of 2 products');
    const still = {
      ...t,
      routes: { ...t.routes, km_per_day: { ...t.routes.km_per_day, value: { ...t.routes.km_per_day.value, sea: 0 } } },
    };
    expect(() =>
      cityRoutes(
        w,
        cities.map((c) => c.place),
        still,
      ),
    ).toThrow('speed of 0');
  });
});

describe('the cities of the game with distance between them', () => {
  const { s, w } = newWorldState();
  it('compute their days, and the books of the merchants balance with goods on the way', () => {
    for (let d = 0; d < 40; d++) advanceDay(s, w);
    const e = s.economy.cities!;
    expect(e.halted).toBe('');
    const checks = w.economyEngine.checks(e.model);
    for (const m of checks.merchants) expect(Math.abs(m.off)).toBeLessThanOrEqual(1e-9 * m.scale);
    for (const c of checks.cities)
      for (const v of [c.income, c.nominal, c.real, c.centralBank, c.banks])
        expect(Math.abs(v / c.gdpSum)).toBeLessThan(1e-9);
  }, 120_000);
  it('refuse routes once a day is computed, or of another size', () => {
    const e = s.economy.cities!;
    expect(() => w.economyEngine.routes(e.model, r)).toThrow('have not computed');
    expect(() => w.economyEngine.routes(e.model, { ...r, cities: 3 })).toThrow('do not fit');
    expect(() => w.economyEngine.routes(e.model, { ...r, weight: [1] })).toThrow('do not fit');
  });
});
