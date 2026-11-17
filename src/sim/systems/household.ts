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
// is the family's spending times the person's baskets over the baskets of the family. Nobody goes hungry yet in a
// family that spends nothing.
import type { WorldState } from '../state';
import { ALIVE } from '../state';
import { ROLE } from './work';
import { ageOn } from './people';

/** From this age a person consumes a whole basket (Horrell, Humphries and Weisdorf 2022, pp. 538 and 540). */
export const BASKET_AGE = 15;
/** The baskets a person consumes: a whole one, a child half of one. */
export const basketsOf = (age: number): number => (age >= BASKET_AGE ? 1 : 0.5);

/** Writes the purse of every family and the consumption of every person from what the economy has computed for the
 *  persons (`writeAgents`, src/sim/systems/economy.ts), on the day up to which the economies are computed. A world
 *  without economies has no purses: everything is 0. */
export function writeHouseholds(s: WorldState): void {
  const P = s.person.cols, F = s.family.cols, e = s.economy.cities;
  F.persons.fill(0); F.working.fill(0); F.baskets.fill(0); F.income.fill(0); F.spent.fill(0); F.savings.fill(0); P.consumed.fill(0);
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
  for (let f = 0; f < n; f++) { F.baskets[f] = baskets[f]; F.income[f] = income[f]; F.spent[f] = spent[f]; F.savings[f] = savings[f]; }
  for (let id = 0; id < s.person.size; id++) {
    if (!s.person.alive[id] || P.died[id] !== ALIVE) continue;
    const f = P.family[id];
    P.consumed[id] = (spent[f] * own[id]) / baskets[f];
  }
}
