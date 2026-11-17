// The persons of the towns marry and are born (people feature 2, second part; docs/PEOPLE_DESIGN.md), after England
// around 1300 (La Poutré & Paping 2025 and the program behind it; the rules and their numbers are
// src/sim/people/marriage.ts).
//
// A town has a fixed number of households: the families with a seat (`family.seat`), each with its housewife, the
// woman at its head. A household whose housewife has died is vacant, and only a vacant household brings a wedding.
// So a town that loses nobody marries nobody, the people of the world neither grow nor shrink, and a part of them
// never marries. This is the paper's reading of England before the Black Death; that the number of households grows
// with the land and the economy is not built yet.
//
// On the first day of every month, in every town:
//   1. Each vacant household looks for a bride: an age is drawn from the curve of Coale and McNeil, and the bride is
//      the woman of the town without a household whose age is nearest to it, within 2.5 years. Her groom is the man
//      of the town without a wife, 18 or older, whose age is nearest to hers plus three years, within ten. Where the
//      groom is the widower of a vacant household, she becomes its housewife; else the couple is a new family that
//      takes the seat of the vacant household, with its house (the parcel or the farmstead). Where no bride or no
//      groom is found the household stays vacant for the month.
//   2. A widow younger than 45 who keeps a household takes a husband in the same way.
// The rest of a family whose seat has gone (the widower, the children) stays a family and stays in the house.
//
// A wife with a living husband bears a child every 33 months, less often as she nears 45. The day of her next birth
// is drawn when she marries and after every birth (`person.bears`; the next-event method, as the deaths), and it is
// void when her husband dies. A child gets its day of death at once.
//
// Assumptions without a source: the search windows, the youngest groom, that a widow under 45 marries again (the
// program has neither men nor widows), nine months between births at the least, and that brides and grooms are of
// the town itself (nobody moves between towns yet).
import type { WorldState } from '../state';
import { ALIVE } from '../state';
import type { System } from '../schedule';
import { MinHeap } from '../minheap';
import { hash01 } from '../rng';
import { spawn } from '../ecs';
import { ageOn, bearChild } from './people';
import { drawDeath, eventKey, livingIn, scheduleDeath } from './deaths';
import { brideAge, yearsToBirth, AGE_WINDOW, BRIDE_YEARS, GROOM_AGE_MIN, GROOM_OLDER, WIDOW_REMARRIES_BELOW } from '../people/marriage';

/** Draws of a person's own stream (people.ts 0 to 21 and 100 on, work.ts 30 and 31, deaths.ts 40): the birth after
 *  the n-th child takes the draw 50 + n. Draws of a family's stream: the age of the bride on a day. */
const K = { birth: 50 } as const;
const DAYS_PER_YEAR = 365.25;

/** The births that are due, the earliest first: a heap over `person.bears`, built when a state is first seen. */
interface Births { heap: MinHeap; /** children a woman has borne since the heap was built or before (for her draws) */ borne: Map<number, number> }
const queues = new WeakMap<WorldState, Births>();
function queueOf(s: WorldState): Births {
  let q = queues.get(s);
  if (!q) {
    q = { heap: new MinHeap(), borne: new Map() };
    const P = s.person.cols;
    for (let id = 0; id < s.person.size; id++) {
      if (!s.person.alive[id]) continue;
      const m = P.mother[id]; if (m >= 0) q.borne.set(m, (q.borne.get(m) ?? 0) + 1);
      if (P.died[id] === ALIVE && P.bears[id] !== ALIVE) q.heap.push(eventKey(P.bears[id], id), id);
    }
    queues.set(s, q);
  }
  return q;
}

/** Draws the day of the next birth of the wife `id` on `day`. `pregnancy`: false for a wife of the founding. */
function expect(s: WorldState, q: Births, id: number, day: number, pregnancy = true): void {
  const P = s.person.cols;
  const years = yearsToBirth(ageOn(P.born[id], day), hash01(s.seed >>> 0, id, K.birth + (q.borne.get(id) ?? 0)), pregnancy);
  P.bears[id] = Number.isFinite(years) ? day + Math.max(1, Math.round(years * DAYS_PER_YEAR)) : ALIVE;
  if (P.bears[id] !== ALIVE) q.heap.push(eventKey(P.bears[id], id), id);
}

/** Gives every wife of a household the day of her next birth, on the day the world has reached. */
export function foundBirths(s: WorldState): void {
  const P = s.person.cols, F = s.family.cols;
  P.bears.fill(ALIVE);
  queues.delete(s);
  const q = queueOf(s);
  for (let f = 0; f < s.family.size; f++) {
    if (!s.family.alive[f] || !F.seat[f] || F.man[f] < 0 || F.woman[f] < 0) continue;
    expect(s, q, F.woman[f], s.day, false);
  }
}

/** The children whose day has come are born. Returns their number. */
export function birthsTo(s: WorldState, day: number): number {
  const q = queueOf(s), P = s.person.cols, F = s.family.cols;
  let n = 0;
  while (q.heap.size && Math.floor(q.heap.peekKey()) <= day) {
    const [key, mother] = q.heap.pop(), due = Math.floor(key);
    if (P.died[mother] !== ALIVE || P.bears[mother] !== due) continue; // an entry that no longer holds
    const f = P.family[mother], father = F.woman[f] === mother ? F.man[f] : -1;
    P.bears[mother] = ALIVE;
    if (father < 0) continue; // her husband has died
    const id = bearChild(s, mother, father, due);
    P.dies[id] = drawDeath(s, id, due); scheduleDeath(s, id);
    q.borne.set(mother, (q.borne.get(mother) ?? 0) + 1);
    expect(s, q, mother, due);
    n++;
  }
  return n;
}

/** The weddings of a month. Returns the number of weddings. */
export function weddingsOn(s: WorldState, day: number): number {
  const P = s.person.cols, F = s.family.cols, seed = s.seed >>> 0, q = queueOf(s);
  // the vacant households and the widows who may marry again, by place
  const vacant = new Map<number, number[]>(), widows = new Map<number, number[]>();
  const add = (m: Map<number, number[]>, place: number, f: number) => { const l = m.get(place); if (l) l.push(f); else m.set(place, [f]); };
  for (let f = 0; f < s.family.size; f++) {
    if (!s.family.alive[f] || !F.seat[f]) continue;
    if (F.woman[f] < 0) add(vacant, F.place[f], f);
    else if (F.man[f] < 0 && ageOn(P.born[F.woman[f]], day) < WIDOW_REMARRIES_BELOW) add(widows, F.place[f], f);
  }
  let n = 0;
  const age = (id: number) => ageOn(P.born[id], day);
  for (const place of new Set([...vacant.keys(), ...widows.keys()])) {
    const people = livingIn(s, place);
    const men = people.filter((id) => P.sex[id] === 1 && age(id) >= GROOM_AGE_MIN && !(F.man[P.family[id]] === id && F.woman[P.family[id]] >= 0));
    const women = people.filter((id) => P.sex[id] === 0 && F.woman[P.family[id]] !== id && age(id) >= BRIDE_YEARS[0] && age(id) < BRIDE_YEARS[1] + 1);
    /** The nearest in age to `target` within `window`, taken off the list; −1 where there is none. */
    const take = (list: number[], target: number, window: number): number => {
      let best = -1, bestD = window;
      for (let k = 0; k < list.length; k++) { const d = Math.abs(age(list[k]) - target); if (d < bestD || (d === bestD && best >= 0 && list[k] < list[best])) { best = k; bestD = d; } }
      if (best < 0) return -1;
      const id = list[best]; list[best] = list[list.length - 1]; list.pop(); return id;
    };
    /** The man leaves the head of the family he was the widower of. */
    const leave = (man: number) => { const f = P.family[man]; if (F.man[f] === man) F.man[f] = -1; };
    for (const f of vacant.get(place) ?? []) {
      if (F.woman[f] >= 0) continue; // filled this month by the widower's wedding
      const bride = take(women, brideAge(hash01(seed, f, day)), AGE_WINDOW.bride);
      if (bride < 0) continue;
      const groom = take(men, age(bride) + GROOM_OLDER, AGE_WINDOW.groom);
      if (groom < 0) { women.push(bride); continue; }
      const gf = P.family[groom];
      if (F.man[gf] === groom && F.seat[gf] && F.woman[gf] < 0) { F.woman[gf] = bride; P.family[bride] = gf; } // the widower of a vacant household
      else { // a new family takes the seat and the house
        leave(groom);
        const nf = spawn(s.family);
        F.place[nf] = place; F.man[nf] = groom; F.woman[nf] = bride; F.seat[nf] = 1; F.hamlet[nf] = F.hamlet[f]; F.lot[nf] = F.lot[f];
        F.seat[f] = 0; P.family[groom] = nf; P.family[bride] = nf;
      }
      expect(s, q, bride, day); n++;
    }
    for (const f of widows.get(place) ?? []) {
      const widow = F.woman[f];
      if (F.man[f] >= 0) continue;
      const groom = take(men, age(widow) + GROOM_OLDER, AGE_WINDOW.groom);
      if (groom < 0) continue;
      leave(groom); F.man[f] = groom; P.family[groom] = f;
      expect(s, q, widow, day); n++;
    }
  }
  return n;
}

/** Every day the births that are due; on the first day of a month the weddings. After the deaths of the day. */
export const families: System = {
  id: 'families',
  run(s, _w, t) { birthsTo(s, t.day); if (t.newMonth) weddingsOn(s, t.day); },
};
