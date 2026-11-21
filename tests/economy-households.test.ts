// Economy feature 11 (docs/ECONOMY_DESIGN.md): the family is the purse. The purse of a family and the consumption of
// a person (src/sim/systems/household.ts), the need of food (economy feature 15), and what the server and the panel
// say of a household.
import { describe, it, expect } from 'vitest';
import { ALIVE } from '../src/sim/state';
import { newWorldState } from '../tools/sim/load';
import { advanceDay } from '../src/sim/engine';
import { FIGURE, FIGURES } from '../src/sim/economy/engine';
import { ROLE } from '../src/sim/systems/work';
import { BASKET_AGE, FOOD_SECTOR, basketsOf, foodPrices, writeHouseholds } from '../src/sim/systems/household';
import { calibrateEconomy, foodNeedCost } from '../src/sim/economy/calibration';
import { workingDays } from '../src/sim/systems/economy';
import { absences, contracts } from '../src/sim/systems/workers';
import { calendarOf, dayFactor } from '../src/sim/holy_days';
import { dateToDay, dayToDate } from '../src/sim/calendar';
import { ageOn } from '../src/sim/systems/people';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { personDetail, personHousehold } from '../src/net/people';
import { householdRows, lsd, pence } from '../src/people/economy_rows';
import { members, near, works } from './setup/households';

const { s, w } = newWorldState();
const start = decodeState(encodeState(s)); // the world on the day it is founded

describe('the purse of a family', () => {
  for (let d = 0; d < 20; d++) advanceDay(s, w);
  const P = s.person.cols,
    F = s.family.cols,
    m = members(s);
  it('holds its persons, those who work and their baskets: an adult one, a child under 15 half', () => {
    expect(BASKET_AGE).toBe(15);
    expect(basketsOf(14.99)).toBe(0.5);
    expect(basketsOf(15)).toBe(1);
    expect(basketsOf(0)).toBe(0.5);
    expect(basketsOf(70)).toBe(1);
    let persons = 0,
      baskets = 0;
    m.forEach((ids, f) => {
      expect(F.persons[f]).toBe(ids.length);
      expect(F.working[f]).toBe(ids.filter((id) => works(s, id)).length);
      const adults = ids.filter((id) => ageOn(P.born[id], s.day) >= 15).length;
      expect(F.baskets[f]).toBe(adults + 0.5 * (ids.length - adults));
      persons += ids.length;
      baskets += F.baskets[f];
    });
    let alive = 0;
    for (let id = 0; id < s.person.size; id++) if (P.died[id] === ALIVE) alive++;
    expect(persons).toBe(alive);
    expect(baskets).toBeGreaterThan(0.8 * persons);
    expect(baskets).toBeLessThan(0.9 * persons); // a third are children
  });
  it('has the income, the spending and the savings of all its members', () => {
    let withIncome = 0;
    // the money of a dead person whose part nobody has taken yet stays with the family (src/sim/systems/household.ts);
    // such parts are common in the first weeks, when nobody who wants a part is without one (people feature 6)
    const all: number[][] = Array.from({ length: s.family.size }, () => []);
    for (let id = 0; id < s.person.size; id++) if (s.person.alive[id]) all[P.family[id]].push(id);
    m.forEach((_, f) => {
      const ids = all[f];
      const sum = (v: ArrayLike<number>) => Math.fround(ids.reduce((a, id) => a + v[id], 0));
      expect(F.income[f]).toBe(sum(P.income));
      expect(F.spent[f]).toBe(sum(P.spent));
      expect(F.savings[f]).toBe(sum(P.savings));
      if (m[f].some((id) => P.income[id] > 0)) {
        withIncome++;
        expect(F.working[f]).toBeGreaterThan(0);
      }
    });
    expect(withIncome).toBeGreaterThan(0.95 * m.filter((ids) => ids.length).length);
  });
  it('adds up, over the families of a city, to what the persons of the city earn, spend and have saved', () => {
    const e = s.economy.cities!;
    e.places.forEach((place, k) => {
      const sums = [0, 0, 0, 0, 0, 0];
      for (let id = 0; id < s.person.size; id++)
        if (F.place[P.family[id]] === place) {
          sums[0] += P.income[id];
          sums[1] += P.spent[id];
          sums[2] += P.savings[id];
        }
      for (let f = 0; f < s.family.size; f++)
        if (F.place[f] === place) {
          sums[3] += F.income[f];
          sums[4] += F.spent[f];
          sums[5] += F.savings[f];
        }
      for (let i = 0; i < 3; i++) {
        expect(sums[i]).toBeGreaterThan(0);
        expect(Math.abs(sums[i + 3] - sums[i])).toBeLessThan(1e-6 * sums[i]);
      }
      // the savings of the families are the deposits of the households of the city's books
      expect(Math.abs(sums[5] - e.figures[k * FIGURES + FIGURE.depositsHouseholds])).toBeLessThan(1e-5 * sums[5]);
    });
  });
  it("is shared out by baskets: a person consumes the share of the family's spending that the person's baskets are", () => {
    let children = 0,
      fed = 0;
    m.forEach((ids, f) => {
      if (!ids.length) return;
      let sum = 0;
      for (const id of ids) {
        const own = basketsOf(ageOn(P.born[id], s.day));
        near(P.consumed[id], (F.spent[f] * own) / F.baskets[f]);
        sum += P.consumed[id];
        if (own === 0.5) {
          children++;
          if (P.consumed[id] > 0) fed++;
        }
      }
      expect(Math.abs(sum - F.spent[f])).toBeLessThanOrEqual(1e-6 * F.spent[f]);
      // two adults of one family consume the same, a child half of it
      const grown = ids.filter((id) => ageOn(P.born[id], s.day) >= 15),
        small = ids.filter((id) => ageOn(P.born[id], s.day) < 15);
      if (grown.length && small.length) near(P.consumed[small[0]], P.consumed[grown[0]] / 2);
    });
    expect(children).toBeGreaterThan(8000);
    expect(fed / children).toBeGreaterThan(0.97); // a child consumes though it earns nothing
  });
  it('counts a child as a whole basket from the day it turns 15', () => {
    const x = decodeState(encodeState(s)),
      X = x.person.cols;
    // the child whose 15th birthday is the next
    let next = -1,
      days = Infinity;
    for (let id = 0; id < x.person.size; id++) {
      const left = Math.ceil(15 * 365.25 + X.born[id] - x.day);
      if (left > 0 && left < days && ageOn(X.born[id], x.day) < 15) {
        next = id;
        days = left;
      }
    }
    expect(days).toBeLessThan(10);
    const f = X.family[next],
      before = x.family.cols.baskets[f];
    for (let d = 0; d < days - 1; d++) advanceDay(x, w);
    expect(ageOn(X.born[next], x.day)).toBeLessThan(15);
    const others = members(x)[f].filter(
      (id) => id !== next && ageOn(X.born[id], x.day + 1) >= 15 && ageOn(X.born[id], s.day) < 15,
    ).length;
    advanceDay(x, w);
    expect(ageOn(X.born[next], x.day)).toBeGreaterThanOrEqual(15);
    expect(x.family.cols.baskets[f]).toBe(before + 0.5 * (1 + others));
    expect(X.role[next]).toBe(ROLE.none); // who turns 15 works only when the economies are founded again
  });
  it('is a booking of the world: the engine computes the same days without it', () => {
    // with the working days of the firms (economy feature 19), the workers who are away in the rest of January
    // (economy feature 22) and the contracts (economy feature 23), which the economies are given before their first day
    const e = start.economy.cities!,
      days = w.economyEngine.workingDays(e.model, workingDays(start, e));
    const away = w.economyEngine.absences(
      days,
      absences(start, e, dateToDay(start.startYear, 1, 1, start.startYear) - 1),
    );
    const model = w.economyEngine.step(w.economyEngine.contracts(away, contracts(start, e)), 20);
    expect(Buffer.from(model).equals(Buffer.from(s.economy.cities!.model))).toBe(true);
    // and writing it again changes nothing
    const hash = hashState(s);
    writeHouseholds(s, w);
    expect(hashState(s)).toBe(hash);
  });
  it('is 0 in a world without economies', () => {
    const none = decodeState(encodeState(s));
    none.economy = { cities: null };
    writeHouseholds(none, w);
    for (const k of ['persons', 'working', 'baskets', 'income', 'spent', 'savings', 'need', 'fed'] as const)
      expect(none.family.cols[k].every((v) => v === 0)).toBe(true);
    expect(none.person.cols.consumed.every((v) => v === 0)).toBe(true);
    expect(personDetail(none, 0, () => 'x')!.household).toBeNull();
    expect(householdRows(personDetail(none, 0, () => 'x')!)).toEqual([]);
  });
});

describe('the need of food (economy feature 15)', () => {
  const F = s.family.cols,
    e = s.economy.cities!,
    t = w.cityEconomies.table;
  const city = new Map<number, number>(Array.from(e.places, (p, k) => [p, k]));
  it('costs what the table says: the food England buys per head, at 2,100 of its 2,042 kilocalories', () => {
    const a = calibrateEconomy(t).accounts as { households: number[]; people: number };
    expect(t.cities.food_need_kcal.value).toBe(2100);
    expect(t.inputs.food_kcal_per_head.value).toBe(2042);
    near(w.cityEconomies.foodNeed, foodNeedCost(t));
    near(foodNeedCost(t), ((a.households[0] / a.people / 365) * 2100) / 2042);
    // about a third of a penny a day for a basket
    expect(foodNeedCost(t) * 240).toBeGreaterThan(0.34);
    expect(foodNeedCost(t) * 240).toBeLessThan(0.42);
    expect(pence(foodNeedCost(t))).toBe('0,4 d');
  });
  it('follows the price of the agriculture of the city: the mean price of its farms by what they made', () => {
    const price = foodPrices(s),
      X = s.firm.cols;
    expect(price.length).toBe(e.places.length);
    for (let k = 0; k < price.length; k++) {
      let made = 0,
        value = 0;
      for (let f = e.firm0[k]; f < e.firm0[k + 1]; f++)
        if (X.sector[f] === FOOD_SECTOR) {
          made += X.output[f];
          value += X.output[f] * X.price[f];
        }
      expect(made).toBeGreaterThan(0);
      near(price[k], value / made);
      expect(price[k]).toBeGreaterThan(0.8);
      expect(price[k]).toBeLessThan(1.25); // 20 days after a start at 1
    }
    expect(Array.from(foodPrices(start)).every((v) => Math.abs(v - 1) < 1e-6)).toBe(true);
  });
  it('is the baskets of the family at that cost, and the family is fed by the part of it that it spent', () => {
    const price = foodPrices(s);
    // what a family has to buy on the day: each member's baskets times the factor of the calendar of its faith
    // (economy feature 19), in the family of an owner of a firm too (economy feature 20)
    const { y, m, d } = dayToDate(e.day, s.startYear),
      doy = dateToDay(y, m, d, y),
      toBuy = new Float64Array(s.family.size);
    const P = s.person.cols;
    for (let id = 0; id < s.person.size; id++) {
      if (s.person.alive[id] && P.died[id] === ALIVE)
        toBuy[P.family[id]] += basketsOf(ageOn(P.born[id], e.day)) * dayFactor(calendarOf(P.faith[id]), y, doy);
    }
    let families = 0,
      short = 0,
      full = 0;
    for (let f = 0; f < s.family.size; f++) {
      const k = city.get(F.place[f]);
      if (k === undefined || F.baskets[f] === 0) {
        expect(F.need[f]).toBe(0);
        expect(F.fed[f]).toBe(0);
        continue;
      }
      families++;
      near(F.need[f], F.baskets[f] * w.cityEconomies.foodNeed * price[k]);
      near(F.fed[f] + 1, Math.min(1, F.spent[f] / ((F.need[f] * toBuy[f]) / F.baskets[f])) + 1);
      if (F.fed[f] < 1) short++;
      else full++;
    }
    expect(families).toBeGreaterThan(4500);
    // most families cover their need; some do not: those nobody of whom works, and the poorest
    expect(full / families).toBeGreaterThan(0.75);
    expect(short).toBeGreaterThan(0);
    const nobody = Array.from({ length: s.family.size }, (_, f) => f).filter(
      (f) => city.has(F.place[f]) && F.baskets[f] > 0 && F.spent[f] === 0,
    );
    expect(nobody.length).toBeGreaterThan(0);
    for (const f of nobody) expect(F.fed[f]).toBe(0);
  });
});

describe('a household', () => {
  const P = s.person.cols,
    F = s.family.cols;
  const child = Array.from({ length: s.person.size }, (_, id) => id).find(
    (id) => ageOn(P.born[id], s.day) < 15 && F.working[P.family[id]] > 0,
  )!;
  it('is given by the server with every person of the family', () => {
    const f = P.family[child],
      h = personHousehold(s, child)!;
    expect(h).toEqual({
      persons: F.persons[f],
      working: F.working[f],
      baskets: F.baskets[f],
      income: F.income[f],
      spent: F.spent[f],
      savings: F.savings[f],
      consumed: P.consumed[child],
      need: F.need[f],
      fed: F.fed[f],
    });
    expect(h.persons).toBeGreaterThan(1);
    expect(h.income).toBeGreaterThan(0);
    expect(h.consumed).toBeGreaterThan(0);
    expect(personDetail(s, child, () => 'x')!.household).toEqual(h);
    expect(personDetail(s, child, () => 'x')!.economy).toMatchObject({ role: 'none', income: 0, spent: 0 });
    // father and child are of one household
    expect(personHousehold(s, F.man[f])).toMatchObject({
      persons: h.persons,
      income: h.income,
      spent: h.spent,
      savings: h.savings,
    });
    near(personHousehold(s, F.man[f])!.consumed, 2 * h.consumed);
  });
  it("is shown in the panel: persons, those who work, income, spending, the person's own consumption, the savings, and the need of food with the part covered", () => {
    const d = personDetail(s, child, () => 'x')!,
      h = d.household!;
    expect(householdRows(d)).toEqual([
      ['Personen', String(h.persons)],
      ['davon erwerbstätig', String(h.working)],
      ['Einkommen am Tag', pence(h.income)],
      ['Ausgaben am Tag', pence(h.spent)],
      ['Eigener Verbrauch am Tag', pence(h.consumed)],
      ['Erspartes', lsd(h.savings)],
      ['Nahrungsbedarf am Tag', pence(h.need)],
      ['davon gedeckt', `${Math.round(100 * h.fed)} %`],
    ]);
  });
});
