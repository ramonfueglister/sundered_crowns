// Economy feature 11 (docs/ECONOMY_DESIGN.md): the family is the purse, and a woman without a husband works. Who
// works (src/sim/systems/work.ts), the purse of a family and the consumption of a person
// (src/sim/systems/household.ts), the state, the upgrade, and what the server and the panel say of a household.
import { namedPersons } from '../src/sim/systems/rulers';
import { describe, it, expect } from 'vitest';
import { ALIVE } from '../src/sim/state';
import { foundDeaths } from '../src/sim/systems/deaths';
import { newWorldState, loadSetup } from '../tools/sim/load';
import { advanceDay } from '../src/sim/engine';
import { FIGURE, FIGURES } from '../src/sim/economy/engine';
import { ROLE, WORKING_AGE, rateOfOtherWomen, workforce } from '../src/sim/systems/work';
import { BASKET_AGE, FOOD_SECTOR, basketsOf, foodPrices, writeHouseholds } from '../src/sim/systems/household';
import { calibrateEconomy, foodNeedCost } from '../src/sim/economy/calibration';
import { absences, foundEconomy, workingDays } from '../src/sim/systems/economy';
import { calendarOf, dayFactor } from '../src/sim/holy_days';
import { dateToDay, dayToDate } from '../src/sim/calendar';
import { ageOn } from '../src/sim/systems/people';
import { hash01 } from '../src/sim/rng';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { STATE_VERSION, FAMILY_SCHEMA, PERSON_SCHEMA, type WorldState } from '../src/sim/state';
import { personDetail, personHousehold } from '../src/net/people';
import { householdRows, lsd, pence } from '../src/people/economy_rows';
import { foundMoves } from '../src/sim/systems/moves';

const { s, w } = newWorldState();
const start = decodeState(encodeState(s)); // the world on the day it is founded
const rate = w.cityEconomies.table.inputs.participation.value;
const works = (x: WorldState, id: number) => {
  const r = x.person.cols.role[id];
  return r === ROLE.worker || r === ROLE.owner || r === ROLE.banker;
};
const adult = (x: WorldState, id: number) => ageOn(x.person.cols.born[id], x.day) >= WORKING_AGE;
/** Equal to the six digits a stored amount has (the components are 32-bit numbers). */
const near = (a: number, b: number) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-6 * Math.max(Math.abs(a), Math.abs(b)));
/** The persons of every family. */
/** The persons of each family of the cities (the rulers, src/sim/systems/rulers.ts, have no part in the economy). */
function members(x: WorldState): number[][] {
  const out: number[][] = Array.from({ length: x.family.size }, () => []),
    named = namedPersons(x);
  for (let id = 0; id < x.person.size; id++)
    if (x.person.alive[id] && x.person.cols.died[id] === ALIVE && !named.has(id))
      out[x.person.cols.family[id]].push(id); // the living: the dead are no members (src/sim/systems/deaths.ts)
  return out;
}
/** A woman without a husband: at the head of a family without a man at its head, or on her own. */
function withoutHusband(x: WorldState, m: number[][], id: number): boolean {
  const f = x.person.cols.family[id];
  return (
    x.person.cols.sex[id] === 0 && x.family.cols.man[f] < 0 && (x.family.cols.woman[f] === id || m[f].length === 1)
  );
}
/** Per city the women of working age, those of them without a husband, and those who work. */
function women(x: WorldState): { all: number; alone: number; working: number }[] {
  const c = x.economy.cities!,
    at = new Map<number, number>(Array.from(c.places, (p, k) => [p, k])),
    m = members(x);
  const out = Array.from(c.places, () => ({ all: 0, alone: 0, working: 0 })),
    named = namedPersons(x);
  for (let id = 0; id < x.person.size; id++) {
    if (x.person.cols.sex[id] !== 0 || !adult(x, id) || named.has(id)) continue;
    const o = out[at.get(x.family.cols.place[x.person.cols.family[id]])!];
    o.all++;
    if (withoutHusband(x, m, id)) o.alone++;
    if (works(x, id)) o.working++;
  }
  return out;
}

describe('a woman without a husband', () => {
  for (const [name, x] of [
    ['1356', start],
    ['1291', newWorldState(1291, 1291).s],
  ] as const) {
    it(`works, in every city of the world of ${name}`, () => {
      const m = members(x),
        named = namedPersons(x);
      let alone = 0;
      for (let id = 0; id < x.person.size; id++) {
        if (named.has(id) || !adult(x, id) || !withoutHusband(x, m, id)) continue;
        alone++;
        expect(works(x, id)).toBe(true);
      }
      expect(alone).toBeGreaterThan(700); // the widows who keep a household and the women who live on their own
    });
    it(`leaves the share of the women who work at the table's 43 %, in every city of the world of ${name}`, () => {
      const by = women(x);
      let all = 0,
        working = 0;
      for (const c of by) {
        all += c.all;
        working += c.working;
        const p = rateOfOtherWomen(rate.women, c.all, c.alone);
        expect(p).toBeLessThanOrEqual(rate.women + 1e-12); // a town without such a woman: 0.43 up to rounding
        if (p === 0) {
          // more than 43 % of the women of the town have no husband (15 small towns of 1291, 17 to 67 women): they all
          // work, nobody else, and the town is above the table's share
          expect(c.alone).toBeGreaterThanOrEqual(rate.women * c.all);
          expect(c.working).toBe(c.alone);
          continue;
        }
        // the women without a husband, and of the others as many as are expected, within four standard deviations
        // (550 towns in 1291: at three, one or two would be outside by chance)
        expect(Math.abs(c.working - rate.women * c.all)).toBeLessThan(
          4 * Math.sqrt((c.all - c.alone) * p * (1 - p)) + 0.5,
        );
      }
      expect(Math.abs(working / all - rate.women)).toBeLessThan(0.01);
    });
    it(`leaves few families without a person who works in the world of ${name}`, () => {
      const m = members(x);
      let none = 0,
        families = 0,
        lone = 0;
      for (const ids of m) {
        if (!ids.length) continue;
        families++;
        if (ids.some((id) => works(x, id))) continue;
        none++;
        if (ids.length === 1 && x.person.cols.sex[ids[0]] === 0 && adult(x, ids[0])) lone++;
      }
      expect(families).toBeGreaterThan(4500);
      expect(none / families).toBeLessThan(0.015); // it was every ninth family; 1.06 % in the 558 towns of 1291
      expect(lone).toBe(0); // no woman on her own is among them
    });
  }
  it('leaves the men as they were drawn: 97.1 % of them, each by his own draw', () => {
    const at = new Set(start.economy.cities!.places);
    let men = 0;
    for (let id = 0; id < start.person.size; id++) {
      if (
        start.person.cols.sex[id] !== 1 ||
        !adult(start, id) ||
        !at.has(start.family.cols.place[start.person.cols.family[id]])
      )
        continue;
      men++;
      expect(works(start, id)).toBe(hash01(start.seed >>> 0, id, 30) < rate.men);
    }
    expect(men).toBeGreaterThan(7000);
  });
  it("sets the rate of the other women so that the table's share of all is expected to work", () => {
    expect(rateOfOtherWomen(0.43, 100, 10)).toBeCloseTo(33 / 90, 12);
    expect(10 + rateOfOtherWomen(0.43, 100, 10) * 90).toBeCloseTo(43, 12);
    expect(rateOfOtherWomen(0.43, 100, 0)).toBe(0.43);
    expect(rateOfOtherWomen(0.43, 100, 43)).toBe(0); // the women without a husband are the share already
    expect(rateOfOtherWomen(0.43, 100, 60)).toBe(0); // more of them than the share: nobody else is drawn
    expect(rateOfOtherWomen(0.43, 5, 5)).toBe(0);
  });
  it('is the same draw for the same seed', () => {
    const cities = Array.from(start.economy.cities!.places);
    expect(workforce(start, cities, rate)).toEqual(workforce(decodeState(encodeState(start)), cities, rate));
    expect(Array.from(newWorldState().s.person.cols.role)).toEqual(Array.from(start.person.cols.role));
  });
});

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
    // with the working days of the firms (economy feature 19) and the workers who are away in the rest of January
    // (economy feature 22), which the economies are given before their first day
    const e = start.economy.cities!,
      days = w.economyEngine.workingDays(e.model, workingDays(start, e));
    const model = w.economyEngine.step(
      w.economyEngine.absences(days, absences(start, e, dateToDay(start.startYear, 1, 1, start.startYear) - 1)),
      20,
    );
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

describe('the state', () => {
  it('holds the purses: a saved world goes on as the running one', () => {
    const a = decodeState(encodeState(s)),
      b = decodeState(encodeState(s));
    expect(a.v).toBe(STATE_VERSION);
    expect(hashState(a)).toBe(hashState(s));
    expect(Object.keys(a.family.cols)).toEqual(Object.keys(FAMILY_SCHEMA));
    for (let d = 0; d < 3; d++) {
      advanceDay(a, w);
      advanceDay(b, w);
    }
    expect(hashState(decodeState(encodeState(a)))).toBe(hashState(b));
  });
  it('of a world that starts in the year of its table goes on where it is through the steps to 34 and 35 (economy features 21 and 22)', () => {
    // biome-ignore lint/suspicious/noExplicitAny: a state of an older version, which no type of today describes
    const old = decodeState(encodeState(s)) as any;
    old.v = 33;
    const up = upgradeState(old, w);
    expect(up.v).toBe(STATE_VERSION);
    // the step to 35 only has the engine given the working days and the absences again before the next day
    const same = decodeState(encodeState(s));
    same.economy.cities!.workingTo = -1;
    expect(up.economy.cities!.workingTo).toBe(-1);
    expect(hashState(up)).toBe(hashState(same));
  });
  it('of a world from before feature 11 gets them by the upgrade: the economies are founded anew with the women without a husband at work', () => {
    // version 13: no purse, no consumption (who works there was drawn by the rule before; the upgrade draws again)
    // biome-ignore lint/suspicious/noExplicitAny: a state of an older version, which no type of today describes
    const old = decodeState(encodeState(s)) as any;
    for (const k of ['persons', 'working', 'baskets', 'income', 'spent', 'savings']) delete old.family.cols[k];
    delete old.person.cols.consumed;
    old.v = 13;
    old.person.cols.role.fill(0); // whatever the parts were: they are given out again
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(1356));
    expect(up.v).toBe(STATE_VERSION);
    expect(Object.keys(up.person.cols)).toEqual(Object.keys(PERSON_SCHEMA));
    expect(Object.keys(up.family.cols)).toEqual(Object.keys(FAMILY_SCHEMA));
    // step 23 founds the persons anew on the day reached, and everything that hangs on them: as it does for the world that ran
    const founded = decodeState(encodeState(s));
    founded.v = 22;
    upgradeState(founded, w, () => loadSetup(1356));
    expect(hashState(up)).toBe(hashState(founded));
    const c = up.economy.cities!;
    expect(c.day).toBe(s.day);
    expect(c.years.length).toBe(0);
    expect(c.halted).toBe('');
    for (let k = 0; k < c.places.length; k++) expect(c.figures[k * FIGURES + FIGURE.periods]).toBe(0);
    const m = members(up);
    for (let id = 0; id < up.person.size; id++)
      if (adult(up, id) && withoutHusband(up, m, id)) expect(works(up, id)).toBe(true);
    m.forEach((ids, f) => {
      expect(up.family.cols.persons[f]).toBe(ids.length);
      expect(up.family.cols.working[f]).toBe(ids.filter((id) => works(up, id)).length);
    });
    advanceDay(up, w);
    advanceDay(up, w);
    expect(up.economy.cities!.figures[FIGURE.periods]).toBe(2);
    expect(up.economy.cities!.halted).toBe('');
    expect(up.family.cols.income.some((v) => v > 0)).toBe(true);
  }, 60_000);
  it('of a world from before feature 15 gets the need by the upgrade: the economies are founded anew with households that spend out of savings', () => {
    // biome-ignore lint/suspicious/noExplicitAny: a state of an older version, which no type of today describes
    const old = decodeState(encodeState(s)) as any;
    delete old.family.cols.need;
    delete old.family.cols.fed;
    old.v = 20;
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(1356));
    expect(up.v).toBe(STATE_VERSION);
    expect(Object.keys(up.family.cols)).toEqual(Object.keys(FAMILY_SCHEMA));
    // step 23 then founds the persons anew, and the economies with them: as it does for the world that ran
    const founded = decodeState(encodeState(s));
    founded.v = 22;
    upgradeState(founded, w, () => loadSetup(1356));
    expect(hashState(up)).toBe(hashState(founded));
    const c = up.economy.cities!;
    expect(c.day).toBe(s.day);
    expect(c.years.length).toBe(0);
    for (let k = 0; k < c.places.length; k++) expect(c.figures[k * FIGURES + FIGURE.periods]).toBe(0);
    advanceDay(up, w);
    advanceDay(up, w);
    expect(up.economy.cities!.halted).toBe('');
    expect(up.family.cols.fed.some((v) => v === 1)).toBe(true);
  }, 60_000);
  it('of a world from before features 16 and 17 is founded anew by the upgrade, with a crown that buys with what it took in and with distance between the cities', () => {
    // biome-ignore lint/suspicious/noExplicitAny: a state of an older version, which no type of today describes
    const old = decodeState(encodeState(s)) as any;
    old.v = 23;
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(1356));
    expect(up.v).toBe(STATE_VERSION);
    const founded = decodeState(encodeState(s));
    foundEconomy(founded, w);
    foundDeaths(founded);
    foundMoves(founded); // (the steps to 25 and 27 draw the days of the moves and of death on the day reached)
    expect(hashState(up)).toBe(hashState(founded));
    const c = up.economy.cities!;
    expect(c.day).toBe(s.day);
    expect(c.years.length).toBe(0);
    advanceDay(up, w);
    advanceDay(up, w);
    expect(up.economy.cities!.halted).toBe('');
  }, 60_000);
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
