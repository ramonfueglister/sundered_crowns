// Who works: the persons of a city who are the persons of its economy (economy feature 10, docs/ECONOMY_DESIGN.md).
//
// The model of the cities' economies (Poledna et al. 2023, computed by the port of BeforeIT.jl) has active persons:
// workers, the owner of every firm and the owner of the bank (BeforeIT.jl src/model_init/init_workers.jl, lines 30
// to 31; src/agents.rs of the port, lines 207 to 213), and persons who are not active. Until feature 10 these were
// persons of the engine alone, as many as a share of the city's people. Now they are persons of the city: who works
// follows from the person, and the economy of a city has as many active persons as the city has persons who work.
//
// The rule takes what the calibration table has always said about England (data/economy/england_1356.json) and
// applies it to the single person: a person works from the age of 15 (the table's "aged 15 and over"), a man with
// the participation rate of men and a woman with that of women (Broadberry, Campbell and van Leeuwen 2013, pp. 13 to
// 14), drawn once from the person's own stream of random numbers. Who of them owns a firm or the bank is drawn too:
// an assumption, no source. Nobody is born, dies or changes yet, so the draw stands.
import type { WorldState } from '../state';
import { hash01 } from '../rng';
import { ageOn } from './people';

/** The part of a person in the economy of the city (`person.role`). */
export const ROLE = {
  /** not a person of the model: children, and adults who do not work */
  none: 0,
  /** works for a firm, or is without work */
  worker: 1,
  /** owns a firm */
  owner: 2,
  /** owns the bank of the city */
  banker: 3,
  /** the person who does not work that the model keeps (the port needs at least one in every economy) */
  idle: 4,
} as const;

/** A person works from this age (the calibration table: "aged 15 and over"). */
export const WORKING_AGE = 15;

/** Draws of a person's own stream (src/sim/systems/people.ts uses 0 to 21 and 100 on): whether the person works,
 *  and the person's place in the order in which the parts are given out. */
const K = { works: 30, order: 31 } as const;

/** The persons of a place for its economy. */
export interface Workforce {
  /** the persons who work, in the order in which the parts are given out: first the owners of the firms, then the
   *  owner of the bank, then the workers */
  working: number[];
  /** the adult who does not work whom the model keeps as its person who is not active; −1 where every adult works */
  idle: number;
}

/** Who of the persons of each of `places` works on the day the world has reached. `participation`: the share of men
 *  and of women of working age who work. */
export function workforce(s: WorldState, places: readonly number[], participation: { men: number; women: number }): Workforce[] {
  const P = s.person.cols, F = s.family.cols, seed = s.seed >>> 0;
  const at = new Map<number, number>(places.map((p, k) => [p, k]));
  const out: Workforce[] = places.map(() => ({ working: [], idle: -1 }));
  const order = (id: number) => hash01(seed, id, K.order);
  for (let id = 0; id < s.person.size; id++) {
    if (!s.person.alive[id]) continue;
    const k = at.get(F.place[P.family[id]]);
    if (k === undefined || ageOn(P.born[id], s.day) < WORKING_AGE) continue;
    if (hash01(seed, id, K.works) < (P.sex[id] === 1 ? participation.men : participation.women)) out[k].working.push(id);
    else if (out[k].idle < 0 || order(id) < order(out[k].idle)) out[k].idle = id;
  }
  for (const f of out) f.working.sort((a, b) => order(a) - order(b) || a - b);
  return out;
}
