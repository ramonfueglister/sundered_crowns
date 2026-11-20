// How far a world has gone from history: the world beside its shadow, which is what the chronicles of borders and of
// rulers have on the world's day. Where the two agree the world is still history; what history does where they do
// not is src/sim/systems/rulers.ts. Ramon, 20 November 2026: historical events should happen where the ruler still
// exists, and not where the simulation has discarded them.
//
// The shadow is computed from the setup and the chronicles alone, so it is no part of the state: it is the same for
// every world of a start year on a given day. A difference counts only where history knows the answer: a person whose
// death no source gives is no difference whenever the world lets them die, and a realm or a person the world never had
// a seat for is a gap of the data, not a way the world went.
import type { WorldState } from './state';
import { ALIVE } from './state';
import type { World } from './world';
import type { SetupState } from './setup';
import { unborn } from './systems/rulers';

/** At most this many of each kind of difference are named, to look at. */
const EXAMPLES = 10;

export interface Divergence {
  day: number;
  /** places whose holder is not the realm the chronicle of borders has on that day */
  places: number;
  /** realms whose crown is not with a person the chronicle of rulers has reigning on that day */
  realms: number;
  /** persons of history alive in the world and dead in history, or the other way round */
  persons: number;
  /** persons of history born by that day in history who are not born in the world, because a parent died earlier */
  unborn: number;
  /** some of each: place ids, realm keys, person keys */
  examples: { places: number[]; realms: string[]; persons: string[]; unborn: string[] };
}

/** The holder of every one of the world's `L` places on `day` as the setup and the chronicle of borders have it: the
 *  key of a realm, or null. */
function shadowOwners(w: World, setup: SetupState, day: number): (string | null)[] {
  const owner = Array.from({ length: w.L }, (_, p) => {
    const o = setup.owner[p];
    return Number.isInteger(o) && o >= 0 && o < setup.states.length ? setup.states[o].id : null;
  });
  const b = w.borders;
  if (!b || b.year !== setup.year) return owner;
  for (const e of b.events) {
    if (e.day > day) break;
    if (e.name) continue;
    for (const p of e.places) if (p < owner.length) owner[p] = e.to;
  }
  return owner;
}

/** How the world `s` differs from history on its day. */
export function divergence(s: WorldState, w: World, setup: SetupState): Divergence {
  const d = s.day,
    out: Divergence = {
      day: d,
      places: 0,
      realms: 0,
      persons: 0,
      unborn: 0,
      examples: { places: [], realms: [], persons: [], unborn: [] },
    };
  const shadow = shadowOwners(w, setup, d),
    o = s.place.owner;
  for (let p = 0; p < o.length; p++)
    if ((o[p] >= 0 ? s.realmText[o[p]].key : null) !== shadow[p] && out.places++ < EXAMPLES)
      out.examples.places.push(p);
  const c = w.chronicle;
  if (!c || c.year !== s.startYear) return out;
  const P = s.person.cols,
    row = new Map(s.named.map((n) => [n.key, n.person])),
    key = new Map(s.named.map((n) => [n.person, n.key])),
    number = new Map(c.persons.map((q, k) => [q.key, k]));
  const unbornNow = new Set<string>();
  for (let p = 0; p < c.persons.length; p++) {
    const born = c.bornDay[p],
      k = c.persons[p].key;
    if (born === null || born > d || row.has(k) || !unborn(s, c, p)) continue;
    unbornNow.add(k);
    if (out.unborn++ < EXAMPLES) out.examples.unborn.push(k);
  }
  /** alive on the day in history: a death no source gives is none */
  const living = (p: number) => {
    const died = c.diedDay[p];
    return died === null || died > d;
  };
  for (let r = 0; r < s.realm.size; r++) {
    const reigns = s.realm.alive[r] ? c.reignsOf.get(s.realmText[r].key) : undefined;
    if (!reigns) continue;
    const reigning = reigns
      .filter((g) => g.start <= d && (g.end === null || g.end > d) && living(g.person))
      .map((g) => c.persons[g.person].key);
    const h = s.realm.cols.holder[r],
      held = h >= 0 ? (key.get(h) ?? null) : null;
    // nobody holds the crown, though history has it with a person the world had or has not let be born
    const off = held === null ? reigning.some((k) => row.has(k) || unbornNow.has(k)) : !reigning.includes(held);
    if (off && out.realms++ < EXAMPLES) out.examples.realms.push(s.realmText[r].key);
  }
  for (const n of s.named) {
    const p = number.get(n.key),
      died = p === undefined ? null : c.diedDay[p];
    if (died === null) continue;
    const inWorld = P.died[n.person] === ALIVE,
      inHistory = d < died;
    if (inWorld !== inHistory && out.persons++ < EXAMPLES) out.examples.persons.push(n.key);
  }
  return out;
}
