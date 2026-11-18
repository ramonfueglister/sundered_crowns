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
// Nobody marries a brother, a sister, a parent or a child.
//
// Before step 1 a vacant household goes to its heir (people feature 3, src/sim/people/inheritance.ts): the living
// children of the house are those whose mother or father was of the family, and the custom of their father's
// culture (of his faith, for a Muslim) names one of them who is grown and has no household: a son of 18 or older,
// a daughter of 16 to 44. An heir who is a son takes a bride of the town by the curve of step 1, an heiress takes a
// groom of the town; the couple is a new family with the seat and the house, and the widower and the other children
// stay in the house. Where the custom names nobody, or the heir finds no spouse that month, step 1 follows as it is.
//
// A child of the house who lives in another place (people feature 4, src/sim/systems/moves.ts) and has not married
// there stands in the line with the others. Where the custom names him or her and a spouse is found in the town of
// the house, the heir comes home on that day and takes the house; a part in the economy of the other place goes to
// a successor there, and where nobody can take it the heir stays away and step 1 follows.
//
// A wife with a living husband bears a child every 33 months, less often as she nears 45. The day of her next birth
// is drawn when she marries and after every birth (`person.bears`; the next-event method, as the deaths), and it is
// void when her husband dies. A child gets its day of death at once.
//
// Assumptions without a source: the search windows, the youngest groom, that a widow under 45 marries again (the
// program has neither men nor widows), nine months between births at the least, that brides and grooms are of
// the town of the house, the ages from which an heir is grown, that the next child
// stands in for one who is not free, and that nothing waits for an heir under age (a guardian is not built: in a
// probe the waiting left 1,200 to 1,700 households vacant and the world 5 to 9 % smaller after 100 years).
import type { WorldState } from '../state';
import { ALIVE } from '../state';
import type { System } from '../schedule';
import { MinHeap } from '../minheap';
import { hash01 } from '../rng';
import { spawn } from '../ecs';
import { ageOn, bearChild } from './people';
import { changeFamily, drawDeath, eventKey, livingIn, scheduleDeath } from './deaths';
import { scheduleMove } from './moves';
import { brideAge, yearsToBirth, AGE_WINDOW, BRIDE_YEARS, FERTILE_TO, GROOM_AGE_MIN, GROOM_OLDER, WIDOW_REMARRIES_BELOW } from '../people/marriage';
import { customOf, heirOf, CUSTOM, type Child } from '../people/inheritance';

/** Draws of a person's own stream (people.ts 0 to 21 and 100 on, work.ts 30 and 31, deaths.ts 40): the birth after
 *  the n-th child takes the draw 50 + n. Draws of a family's stream: the age of the bride on a day, and on the
 *  negative of the day the lot among the heirs. */
const K = { birth: 50 } as const;
/** What the weddings of a month did with the vacant households, for the checks. */
export interface Passed { /** households that went to a new couple */ passed: number; /** of them to an heir who is a son */ sons: number; /** to an heiress */ daughters: number; /** heirs who came home from another place for it */ home?: number }
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
    P.dies[id] = drawDeath(s, id, due); scheduleDeath(s, id); scheduleMove(s, id, due);
    q.borne.set(mother, (q.borne.get(mother) ?? 0) + 1);
    expect(s, q, mother, due);
    n++;
  }
  return n;
}

/** The weddings of a month. Returns the number of weddings; `tally` counts the households that passed on. */
export function weddingsOn(s: WorldState, day: number, tally?: Passed): number {
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
  // the children of the vacant houses who live in another place and are neither man nor woman of a family there
  const awayKids = new Map<number, number[]>(), away = new Set<number>();
  if (vacant.size) {
    const vac = new Set<number>(); for (const l of vacant.values()) for (const f of l) vac.add(f);
    for (let id = 0; id < s.person.size; id++) {
      if (!s.person.alive[id] || P.died[id] !== ALIVE) continue;
      const m = P.mother[id], fa = P.father[id], own = P.family[id];
      const hf = m >= 0 && vac.has(P.family[m]) ? P.family[m] : fa >= 0 && vac.has(P.family[fa]) ? P.family[fa] : -1;
      if (hf < 0 || F.place[own] === F.place[hf] || F.man[own] === id || F.woman[own] === id) continue;
      const l = awayKids.get(hf); if (l) l.push(id); else awayKids.set(hf, [id]);
      away.add(id);
    }
  }
  /** The heir `h` who lives away comes home into the house `f`. False where the part in the economy holds the heir. */
  const comeHome = (h: number, f: number): boolean => {
    if (!changeFamily(s, h, f, day)) return false;
    away.delete(h); if (tally) tally.home = (tally.home ?? 0) + 1;
    return true;
  };
  /** Brother and sister (one parent in common is enough), or parent and child. */
  const kin = (a: number, b: number) => (P.mother[a] >= 0 && P.mother[a] === P.mother[b]) || (P.father[a] >= 0 && P.father[a] === P.father[b]) ||
    P.mother[a] === b || P.father[a] === b || P.mother[b] === a || P.father[b] === a;
  /** At the head of a household: its housewife, or its man (a widower of a vacant one too). */
  const settled = (id: number) => { const f = P.family[id]; return !!F.seat[f] && (F.man[f] === id || F.woman[f] === id); };
  for (const place of new Set([...vacant.keys(), ...widows.keys()])) {
    const people = livingIn(s, place);
    const men = people.filter((id) => P.sex[id] === 1 && age(id) >= GROOM_AGE_MIN && !(F.man[P.family[id]] === id && F.woman[P.family[id]] >= 0));
    const women = people.filter((id) => P.sex[id] === 0 && F.woman[P.family[id]] !== id && age(id) >= BRIDE_YEARS[0] && age(id) < BRIDE_YEARS[1] + 1);
    /** The nearest in age to `target` within `window` who is not kin of `spouse`, taken off the list; −1 where there is none. */
    const take = (list: number[], target: number, window: number, spouse = -1): number => {
      let best = -1, bestD = window;
      for (let k = 0; k < list.length; k++) {
        if (spouse >= 0 && kin(list[k], spouse)) continue;
        const d = Math.abs(age(list[k]) - target);
        if (d < bestD || (d === bestD && best >= 0 && list[k] < list[best])) { best = k; bestD = d; }
      }
      if (best < 0) return -1;
      const id = list[best]; list[best] = list[list.length - 1]; list.pop(); return id;
    };
    const drop = (list: number[], id: number): boolean => { const k = list.indexOf(id); if (k < 0) return false; list[k] = list[list.length - 1]; list.pop(); return true; };
    /** The man leaves the head of the family he was the widower of. */
    const leave = (man: number) => { const f = P.family[man]; if (F.man[f] === man) F.man[f] = -1; };
    /** A new family takes the seat and the house of the vacant household `f`. */
    const found = (f: number, groom: number, bride: number) => {
      leave(groom);
      const nf = spawn(s.family);
      F.place[nf] = place; F.man[nf] = groom; F.woman[nf] = bride; F.seat[nf] = 1; F.hamlet[nf] = F.hamlet[f]; F.lot[nf] = F.lot[f];
      F.seat[f] = 0; P.family[groom] = nf; P.family[bride] = nf;
      if (tally) tally.passed++;
    };
    // the living children of the vacant houses of the town, the eldest first
    const houses = new Map<number, number[]>();
    for (const f of vacant.get(place) ?? []) houses.set(f, []);
    if (houses.size) {
      for (const id of people) {
        const m = P.mother[id], fa = P.father[id];
        const l = (m >= 0 ? houses.get(P.family[m]) : undefined) ?? (fa >= 0 ? houses.get(P.family[fa]) : undefined);
        if (l) l.push(id);
      }
      for (const [f, l] of houses) { const a = awayKids.get(f); if (a) l.push(...a); }
      for (const l of houses.values()) l.sort((a, b) => P.born[a] - P.born[b] || a - b);
    }
    /** The heir of the vacant household `f` by the custom of the children's father (their mother, where he is not known). */
    const heir = (f: number): number => {
      const kids = houses.get(f)!;
      if (!kids.length) return -1;
      const of = P.father[kids[0]] >= 0 ? P.father[kids[0]] : P.mother[kids[0]];
      const custom = customOf(P.culture[of], P.faith[of]);
      if (custom === CUSTOM.none) return -1;
      const children: Child[] = kids.map((id) => ({ id, son: P.sex[id] === 1,
        free: !settled(id) && (P.sex[id] === 1 ? age(id) >= GROOM_AGE_MIN : age(id) >= BRIDE_YEARS[0] && age(id) < FERTILE_TO) }));
      return heirOf(custom, children, hash01(seed, f, -day));
    };
    for (const f of vacant.get(place) ?? []) {
      if (F.woman[f] >= 0) continue; // filled this month by the widower's wedding
      const h = heir(f);
      const gone = h >= 0 && away.has(h); // the heir lives in another place
      if (h >= 0 && P.sex[h] === 1 && (gone || drop(men, h))) { // the heir takes a bride
        const bride = take(women, brideAge(hash01(seed, f, day)), AGE_WINDOW.bride, h);
        if (bride >= 0 && (!gone || comeHome(h, f))) { found(f, h, bride); if (tally) tally.sons++; expect(s, q, bride, day); n++; continue; }
        if (bride >= 0) women.push(bride);
        if (!gone) men.push(h);
      } else if (h >= 0 && P.sex[h] === 0 && (gone || drop(women, h))) { // the heiress takes a groom
        const groom = take(men, age(h) + GROOM_OLDER, AGE_WINDOW.groom, h);
        if (groom >= 0 && (!gone || comeHome(h, f))) { found(f, groom, h); if (tally) tally.daughters++; expect(s, q, h, day); n++; continue; }
        if (groom >= 0) men.push(groom);
        if (!gone) women.push(h);
      }
      const bride = take(women, brideAge(hash01(seed, f, day)), AGE_WINDOW.bride);
      if (bride < 0) continue;
      const groom = take(men, age(bride) + GROOM_OLDER, AGE_WINDOW.groom, bride);
      if (groom < 0) { women.push(bride); continue; }
      const gf = P.family[groom];
      if (F.man[gf] === groom && F.seat[gf] && F.woman[gf] < 0) { F.woman[gf] = bride; P.family[bride] = gf; } // the widower of a vacant household
      else found(f, groom, bride); // a new family takes the seat and the house
      expect(s, q, bride, day); n++;
    }
    for (const f of widows.get(place) ?? []) {
      const widow = F.woman[f];
      if (F.man[f] >= 0) continue;
      const groom = take(men, age(widow) + GROOM_OLDER, AGE_WINDOW.groom, widow);
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
