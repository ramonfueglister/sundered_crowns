// The household of a family: the family is the purse (economy feature 11, docs/ECONOMY_DESIGN.md).
//
// The model of the cities' economies (Poledna et al. 2023, computed by the port of BeforeIT.jl) knows single persons:
// who works has an income, spends a share of it and saves the rest (src/households.rs of the port, line 83;
// BeforeIT.jl src/agent_actions/households.jl, lines 96 to 150). Its persons who do not work live on benefits of the
// state (households.jl, line 45), and the cities pay none. So the children and the adults who do not work, more
// than half of the persons of a city, had neither an income nor a consumption.
//
// Here they live on their family, as the history of English working families counts it: Horrell, Humphries and
// Weisdorf (2022, Economic History Review 75(2), 530 to 560) add up "family incomes from the contributions of all
// family members" (p. 531) and set against them what the family needs: "Adults are each assumed to consume a whole
// consumption basket, children just one-half" (p. 540), a child being a person who has not reached 15, the age at
// which children "became independent" (p. 538).
//
// The purse is a booking of the world and no rule of the model: the engine computes as before, and nothing reads
// the purse yet. The income, the spending and the savings of a family are the sums over its members of what the
// economy computed for them on the last day. What the family spent is shared out by baskets: a person's consumption
// is the family's spending times the person's baskets over the baskets of the family.
//
// Since economy feature 15 the purse is held against what the family needs to eat. A basket needs 2,100 kilocalories
// a day (Allen 2013, The High Wage Economy and the Industrial Revolution: A Restatement, Oxford Discussion Papers in
// Economic and Social History 115, table 2). What they cost follows from the model: the calibration says what the
// households of England buy from agriculture and how many kilocalories per head that is (Broadberry et al. 2010,
// table 19), which gives the cost of the need at the prices of the start (`foodNeedCost`,
// src/sim/economy/calibration.ts); on a later day it is that cost times the price of the city's agriculture, the mean
// price of its firms of that sector weighted by their output. A family covers its need first and spends on other
// things what is left, the linear expenditure system of Stone (1954) and Geary (1950) as Blanz (2023, Climate-related
// Agricultural Productivity Losses through a Poverty Lens, arXiv 2310.16490, equations 5 and 6) writes it. So the
// part of its need a family covered on the last day is fed = min(1, spent / need). None of the papers read says
// what a household does below its need; that it spends everything on food is our reading of the equation.
//
// This too is a booking of the world: the engine's market goes on splitting every purchase by the fixed shares of
// the port (b_HH_g, src/markets.rs), so the food the families are booked with here and the goods the engine sold
// from agriculture are not the same number. Nothing reads `fed` yet; what hunger does to a person belongs to the
// persons of the world (docs/PEOPLE_DESIGN.md).
import type { WorldState } from '../state';
import { ALIVE } from '../state';
import type { World } from '../world';
import { ROLE } from './work';
import { ageOn } from './people';

/** From this age a person consumes a whole basket (Horrell, Humphries and Weisdorf 2022, pp. 538 and 540). */
export const BASKET_AGE = 15;
/** The baskets a person consumes: a whole one, a child half of one. */
export const basketsOf = (age: number): number => (age >= BASKET_AGE ? 1 : 0.5);

/** The price of agriculture in every city of the economies, 1 at the start: the mean price of the city's firms of
 *  that sector, weighted by what they made on the last day (by their number on a day on which none made anything). */
export function foodPrices(s: WorldState): Float64Array {
  const e = s.economy.cities!, F = s.firm.cols, out = new Float64Array(e.places.length);
  for (let k = 0; k < out.length; k++) {
    let made = 0, value = 0, n = 0, prices = 0;
    for (let f = e.firm0[k]; f < e.firm0[k + 1]; f++) {
      if (F.sector[f] !== FOOD_SECTOR) continue;
      made += F.output[f]; value += F.output[f] * F.price[f]; n++; prices += F.price[f];
    }
    out[k] = made > 0 ? value / made : n > 0 ? prices / n : 1;
  }
  return out;
}

/** The sector the food comes from: agriculture, the first of the calibration table. */
export const FOOD_SECTOR = 0;

/** Writes the purse of every family and the consumption of every person from what the economy has computed for the
 *  persons (`writeAgents`, src/sim/systems/economy.ts), on the day up to which the economies are computed; and what
 *  the family needs to eat that day and the part of it that it covered. A world without economies has no purses:
 *  everything is 0, and so it is for a family of a place without an economy (`need` 0 says that `fed` says nothing). */
export function writeHouseholds(s: WorldState, w: World): void {
  const P = s.person.cols, F = s.family.cols, e = s.economy.cities;
  F.persons.fill(0); F.working.fill(0); F.baskets.fill(0); F.income.fill(0); F.spent.fill(0); F.savings.fill(0); F.need.fill(0); F.fed.fill(0); P.consumed.fill(0);
  if (!e) return;
  const n = s.family.size, income = new Float64Array(n), spent = new Float64Array(n), savings = new Float64Array(n), baskets = new Float64Array(n);
  const own = new Float32Array(s.person.size);
  for (let id = 0; id < s.person.size; id++) {
    if (!s.person.alive[id]) continue;
    const f = P.family[id], role = P.role[id];
    // the dead are no members; the money of a dead person whose part nobody has taken yet (src/sim/systems/deaths.ts)
    // stays with the family
    if (P.died[id] === ALIVE) {
      own[id] = basketsOf(ageOn(P.born[id], e.day));
      F.persons[f]++; baskets[f] += own[id];
      if (role === ROLE.worker || role === ROLE.owner || role === ROLE.banker) F.working[f]++;
    }
    income[f] += P.income[id]; spent[f] += P.spent[id]; savings[f] += P.savings[id];
  }
  const price = foodPrices(s), city = new Map<number, number>(Array.from(e.places, (p, k) => [p, k])), cost = w.cityEconomies.foodNeed;
  for (let f = 0; f < n; f++) {
    F.baskets[f] = baskets[f]; F.income[f] = income[f]; F.spent[f] = spent[f]; F.savings[f] = savings[f];
    const k = city.get(F.place[f]);
    if (k === undefined || !(baskets[f] > 0)) continue;
    const need = baskets[f] * cost * price[k];
    F.need[f] = need; F.fed[f] = Math.min(1, Math.max(0, spent[f]) / need);
  }
  for (let id = 0; id < s.person.size; id++) {
    if (!s.person.alive[id] || P.died[id] !== ALIVE) continue;
    const f = P.family[id];
    P.consumed[id] = (spent[f] * own[id]) / baskets[f];
  }
}
