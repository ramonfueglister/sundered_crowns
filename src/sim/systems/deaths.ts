// The persons of the towns die (people feature 2, first part; docs/PEOPLE_DESIGN.md).
//
// A person is computed only when something is due (Ramon, 17 November 2026: all persons, event-driven). The day of
// death is drawn once, when the person comes into the world, from the life table the people were founded with
// (La Poutré & Janssen 2021, src/sim/people/lifetable.ts), given the age the person has reached:
//
//   P(T > t | T > a) = l(t) / l(a),   so   l(t*) = (1 − u) · l(a)
//
// with l the survivorship (one table for both sexes) and u a draw of the person's own stream. Within a year of age the
// force of mortality is constant, as the life table itself takes it. This is the next-event method of demographic
// microsimulation (Modgen: https://dynamis.ihsn.org/guide/Report/10_Methods.html; MicSim, Zinn 2014): the waiting
// time is drawn, and the earliest event of all persons is the next one. Death depends on age and sex only: IQ and
// the Big Five do not move it yet.
//
// The days of death are a column of the persons (`person.dies`), so the list of events is no state of its own: it
// is a heap over that column, built when a state is first seen and kept beside it.
//
// When a person dies: the day is written (`person.died`; the row stays until the archive of the dead takes it on a
// first of January, src/sim/people/archive.ts), and the family loses
// its head if the person was one; the others stay in the family. A person who had a part in the economy of the town
// (src/sim/systems/work.ts) leaves it to a successor, because the engine computes a fixed list of persons for every
// town (it has no way to add or remove one): the successor takes the place in the engine's list with the employer,
// the firm and the money that the engine holds for it. The successor is a living person of the town of 15 or older
// who wants a part and has none (people feature 6: who wants work is drawn as at the
// founding, so the shares of the men and of the women who work stay those of the table): first of the dead person's own family, then a child of the dead person, then anybody of the
// town, each in the order of src/sim/systems/work.ts. Where nobody is free the place stays with the dead person
// until somebody is (an estate; looked at again on the first day of every month, and then offered to the towns
// within reach, `offersOn` of src/sim/systems/moves.ts). These rules of succession are an assumption, no source.
//
// A ruler dies on the day of the chronicle (src/sim/systems/rulers.ts), not here.
//
// A person who moves to another place (people feature 4, src/sim/systems/moves.ts) leaves the part to a successor
// in the same way, and the list of the persons of a place kept here follows the move (`changeFamily`).
//
// Weddings and births are src/sim/systems/families.ts: a housewife who dies leaves her household vacant.
import type { WorldState } from '../state';
import { ALIVE } from '../state';
import type { System } from '../schedule';
import { MinHeap } from '../minheap';
import { hash01 } from '../rng';
import { lifeTable } from '../people/lifetable';
import { ageOn } from './people';
import { namedPersons } from './rulers';
import { TRAITS_FROM_AGE, deathFactor } from '../people/traits';
import { ROLE, WORKING_AGE, K as WORK_K, participation, rateOfOtherWomen, wantsWork } from './work';

/** Draws of a person's own stream (src/sim/systems/people.ts uses 0 to 21 and 100 on, work.ts 30 and 31). */
const K = { death: 40 } as const;
const DAYS_PER_YEAR = 365.25;
/** The key of an event on the list: the day, and the person behind the point, so the events of a day come in the
 *  order of the persons however the list was built (a loaded state builds it anew). */
export const eventKey = (day: number, id: number): number => day + id * 2 ** -26;
const L = lifeTable();

/** The age at death of a person who has reached the age `age` (years), for the draw `u` in [0, 1): the age
 *  at which the survivorship has fallen to (1 − u) of what it is at `age`. Nobody lives past 120. */
export function ageAtDeath(age: number, u: number): number {
  const l = L,
    a = Math.max(0, age),
    y0 = Math.min(119, Math.floor(a));
  if (a >= 120 || l[y0] <= 0) return a;
  // survivorship at the age reached, with the constant force of the year
  const within = (y: number, x: number) =>
    l[y + 1] > 0 ? l[y] * Math.pow(l[y + 1] / l[y], x - y) : l[y] * (1 - (x - y));
  const target = (1 - u) * within(y0, a);
  let y = y0;
  while (y < 119 && l[y + 1] > target) y++;
  if (l[y + 1] > target) return 120;
  const top = y === y0 ? within(y0, a) : l[y],
    x0 = y === y0 ? a : y;
  // top · (l[y+1]/l[y])^(x − x0) = target
  const ratio = l[y + 1] > 0 ? Math.log(target / top) / Math.log(l[y + 1] / l[y]) : 1 - target / top;
  return Math.min(120, x0 + Math.max(0, ratio));
}

/** The share of those of the age `a` who reach the whole age `b`, by the life table. */
const survives = (a: number, b: number): number => {
  const y = Math.floor(a),
    within = L[y + 1] > 0 ? L[y] * Math.pow(L[y + 1] / L[y], a - y) : L[y];
  return within > 0 ? L[b] / within : 0;
};
/** The day of death of the person `id` who lives on `day`: at least the next day. */
export function drawDeath(s: WorldState, id: number, day: number): number {
  const P = s.person.cols;
  const age = ageOn(P.born[id], day),
    u = hash01(s.seed >>> 0, P.uid[id], K.death);
  // the force of death from TRAITS_FROM_AGE on times the factor of the person's traits (people feature 5): the
  // survivorship from there on is that of the life table to the power of the factor
  const k = deathFactor(P, id),
    left = 1 - u;
  let at: number;
  if (age >= TRAITS_FROM_AGE) at = ageAtDeath(age, 1 - Math.pow(left, 1 / k));
  else {
    const grown = survives(age, TRAITS_FROM_AGE);
    at = left > grown ? ageAtDeath(age, u) : ageAtDeath(TRAITS_FROM_AGE, 1 - Math.pow(left / grown, 1 / k));
  }
  return Math.max(day + 1, P.born[id] + Math.ceil(at * DAYS_PER_YEAR));
}

/** Gives every living person the day of death, on the day the world has reached; a ruler has none here. */
export function foundDeaths(s: WorldState): void {
  const P = s.person.cols,
    named = namedPersons(s);
  P.dies.fill(ALIVE);
  for (let id = 0; id < s.person.size; id++) {
    if (!s.person.alive[id] || P.died[id] !== ALIVE || named.has(id)) continue;
    P.dies[id] = drawDeath(s, id, s.day);
  }
  queues.delete(s.person);
}

/** The list of events of a state: the days of death of its living persons, the earliest first; and the dead whose
 *  place in the economy is still theirs. Derived from the columns, so a loaded state builds it anew; kept by the
 *  table of the persons, so it is built anew when the rows close up (src/sim/people/archive.ts). */
interface Queue {
  heap: MinHeap;
  estates: number[];
  /** the persons of each place who are no rulers; the dead leave it when it is next read */
  byPlace: Map<number, number[]>;
}
const queues = new WeakMap<object, Queue>();
function queueOf(s: WorldState): Queue {
  let q = queues.get(s.person);
  if (!q) {
    q = { heap: new MinHeap(), estates: [], byPlace: new Map() };
    const P = s.person.cols,
      F = s.family.cols,
      named = namedPersons(s);
    for (let id = 0; id < s.person.size; id++) {
      if (!s.person.alive[id] || named.has(id)) continue;
      const place = F.place[P.family[id]],
        list = q.byPlace.get(place);
      if (list) list.push(id);
      else q.byPlace.set(place, [id]);
      if (P.died[id] === ALIVE) {
        if (P.dies[id] !== ALIVE) q.heap.push(eventKey(P.dies[id], id), id);
      } else if (P.role[id] !== ROLE.none) q.estates.push(id);
    }
    queues.set(s.person, q);
  }
  return q;
}
/** Puts a person who has come into the world after the list was built on it: the day of death, and the place. */
export function scheduleDeath(s: WorldState, id: number): void {
  const had = queues.has(s.person),
    q = queueOf(s);
  if (!had) return; // the list was built just now, with the person
  const P = s.person.cols,
    d = P.dies[id],
    place = s.family.cols.place[P.family[id]],
    list = q.byPlace.get(place);
  if (d !== ALIVE) q.heap.push(eventKey(d, id), id);
  if (list) list.push(id);
  else q.byPlace.set(place, [id]);
}

/** The living persons of a place who are no rulers (the list is the state's own: do not change it). */
export function livingIn(s: WorldState, place: number): number[] {
  const q = queueOf(s),
    list = q.byPlace.get(place);
  if (!list) return [];
  const P = s.person.cols;
  // the dead leave the list (the estates are kept by person, not by place)
  let k = 0;
  for (const id of list) if (P.died[id] === ALIVE) list[k++] = id;
  list.length = k;
  return list;
}

/** The living persons of `place` of 15 or older who want a part in the economy and have none (people feature 6):
 *  who wants work is drawn as at the founding (src/sim/systems/work.ts), with the rate of the other women that the
 *  town's women give on this day. No rulers. */
export function seekersIn(s: WorldState, place: number, day: number): number[] {
  const P = s.person.cols,
    F = s.family.cols,
    seed = s.seed >>> 0,
    list = livingIn(s, place);
  const members = new Map<number, number>(),
    adults: number[] = [];
  let women = 0,
    alone = 0;
  const withoutHusband = (id: number) => {
    const f = P.family[id];
    return F.man[f] < 0 && (F.woman[f] === id || members.get(f) === 1);
  };
  for (const id of list) members.set(P.family[id], (members.get(P.family[id]) ?? 0) + 1);
  for (const id of list) {
    if (ageOn(P.born[id], day) < WORKING_AGE) continue;
    adults.push(id);
    if (P.sex[id] !== 1) {
      women++;
      if (withoutHusband(id)) alone++;
    }
  }
  const others = rateOfOtherWomen(participation.women, women, alone);
  return adults.filter(
    (id) =>
      P.role[id] === ROLE.none &&
      wantsWork(seed, P.uid[id], P.sex[id] === 1, P.sex[id] !== 1 && withoutHusband(id), others),
  );
}

/** Who takes the part of `dead` in the economy of the town: a person of the same place who wants a part and has
 *  none (`seekersIn`); −1 where there is none. */
function successor(s: WorldState, dead: number, day: number): number {
  const P = s.person.cols,
    F = s.family.cols,
    seed = s.seed >>> 0;
  const family = P.family[dead],
    place = F.place[family],
    uid = P.uid[dead];
  let best = -1,
    bestRank = 3,
    bestOrder = Infinity;
  for (const id of seekersIn(s, place, day)) {
    const rank = P.family[id] === family ? 0 : P.mother[id] === uid || P.father[id] === uid ? 1 : 2,
      order = hash01(seed, P.uid[id], WORK_K.order);
    if (rank < bestRank || (rank === bestRank && order < bestOrder)) {
      best = id;
      bestRank = rank;
      bestOrder = order;
    }
  }
  return best;
}

/** The part of `dead` in the economy, with the employer, the firm and the money the engine holds for it, goes to `heir`. */
function give(s: WorldState, dead: number, heir: number): void {
  const P = s.person.cols;
  P.role[heir] = P.role[dead];
  P.agent[heir] = P.agent[dead];
  P.firm[heir] = P.firm[dead];
  P.wage[heir] = P.wage[dead];
  P.income[heir] = P.income[dead];
  P.spent[heir] = P.spent[dead];
  P.savings[heir] = P.savings[dead];
  if (P.role[dead] === ROLE.owner && P.firm[dead] >= 0) s.firm.cols.owner[P.firm[dead]] = heir;
  P.role[dead] = ROLE.none;
  P.agent[dead] = 0;
  P.firm[dead] = -1;
  P.wage[dead] = 0;
  P.income[dead] = 0;
  P.spent[dead] = 0;
  P.savings[dead] = 0;
}

/** Hands the part of `dead` in the economy to a successor. False where nobody is free. */
function succeed(s: WorldState, _q: Queue, dead: number, day: number): boolean {
  const heir = successor(s, dead, day);
  if (heir < 0) return false;
  give(s, dead, heir);
  return true;
}

/** The dead whose part in the economy waits for a successor, in the order of the persons, and the town of each
 *  (people feature 6: such a part is offered to the towns around, src/sim/systems/moves.ts). */
export function estatesOf(s: WorldState): { dead: number; place: number }[] {
  const P = s.person.cols,
    F = s.family.cols;
  return queueOf(s)
    .estates.filter((id) => P.role[id] !== ROLE.none)
    .sort((a, b) => a - b)
    .map((dead) => ({ dead, place: F.place[P.family[dead]] }));
}
/** The waiting part of `dead` goes to `heir`, a person without a part who lives in its town. */
export function takeEstate(s: WorldState, dead: number, heir: number): void {
  const q = queueOf(s);
  give(s, dead, heir);
  q.estates = q.estates.filter((id) => id !== dead);
}

/** A living person goes to live in `family` (people feature 4, src/sim/systems/moves.ts). Where that family is of
 *  another place, the person's part in the economy of the old place goes to a successor there, as on a death: the
 *  engine's list of the town stays whole. False, and nothing changes, where the person has a part that nobody of
 *  the old place is free to take. */
export function changeFamily(s: WorldState, id: number, family: number, day: number): boolean {
  const q = queueOf(s),
    P = s.person.cols,
    F = s.family.cols,
    old = P.family[id],
    from = F.place[old],
    to = F.place[family];
  if (from !== to && P.role[id] !== ROLE.none && !succeed(s, q, id, day)) return false;
  if (F.man[old] === id) F.man[old] = -1;
  P.family[id] = family;
  if (from === to) return true;
  const l = q.byPlace.get(from);
  if (l) {
    const k = l.indexOf(id);
    if (k >= 0) {
      l[k] = l[l.length - 1];
      l.pop();
    }
  }
  const t = q.byPlace.get(to);
  if (t) t.push(id);
  else q.byPlace.set(to, [id]);
  return true;
}

/** The person `id` dies on `day`. */
function die(s: WorldState, q: Queue, id: number, day: number): void {
  const P = s.person.cols,
    F = s.family.cols,
    f = P.family[id];
  P.died[id] = day;
  P.bears[id] = ALIVE;
  if (F.man[f] === id) F.man[f] = -1;
  if (F.woman[f] === id) F.woman[f] = -1;
  if (P.role[id] !== ROLE.none && !succeed(s, q, id, day)) q.estates.push(id);
}

/** Everybody whose day has come dies. Returns the number of persons who died. */
export function deathsTo(s: WorldState, day: number): number {
  const q = queueOf(s),
    P = s.person.cols;
  let n = 0;
  while (q.heap.size && Math.floor(q.heap.peekKey()) <= day) {
    const [key, id] = q.heap.pop(),
      due = Math.floor(key);
    if (!s.person.alive[id] || P.died[id] !== ALIVE || P.dies[id] !== due) continue; // an entry that no longer holds
    die(s, q, id, due);
    n++;
  }
  return n;
}

/** The estates find their successors where somebody of the town has become free (has turned 15). */
export function settleEstates(s: WorldState, day: number): void {
  const q = queueOf(s),
    P = s.person.cols;
  if (!q.estates.length) return;
  q.estates.sort((a, b) => a - b); // in the order of the persons, as a loaded state lists them
  q.estates = q.estates.filter((id) => P.role[id] !== ROLE.none && !succeed(s, q, id, day));
}

/** Every day: the deaths that are due; on the first day of a month the estates look for their successors. Before
 *  the economy, which then computes the day with the successors. */
export const deaths: System = {
  id: 'deaths',
  run(s, _w, t) {
    deathsTo(s, t.day);
    if (t.newMonth) settleEstates(s, t.day);
  },
};
