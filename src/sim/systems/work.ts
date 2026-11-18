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
//
// A woman without a husband works (economy feature 11): the woman at the head of a family that has no man at its
// head, and a woman who lives on her own, always works. Horrell, Humphries and Weisdorf (2022, Economic History
// Review 75(2), p. 535) assume for English working families from 1260 on that a wife worked little "except when the
// family lacked an income-generating husband when we assume that the wife worked full-time". The other women of the
// city are drawn at a lower rate, so that of all its women of working age the table's share is expected to work:
// that lower rate is our arithmetic, not a source.
import type { WorldState } from '../state';
import { ALIVE } from '../state';
import { namedPersons } from './rulers';
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
export const K = { works: 30, order: 31 } as const;

/** The persons of a place for its economy. */
export interface Workforce {
  /** the persons who work, in the order in which the parts are given out: first the owners of the firms, then the
   *  owner of the bank, then the workers */
  working: number[];
  /** the adult who does not work whom the model keeps as its person who is not active; −1 where every adult works */
  idle: number;
}

/** The share of the women of a city who are drawn that works, so that of all `women` of working age the share
 *  `rate` is expected to work when `alone` of them work in any case: (rate · women − alone) / (women − alone), not
 *  below 0. */
export const rateOfOtherWomen = (rate: number, women: number, alone: number): number =>
  women > alone ? Math.max(0, (rate * women - alone) / (women - alone)) : 0;

/** Who of the persons of each of `places` works on the day the world has reached. `participation`: the share of men
 *  and of women of working age who work. A woman without a husband works in any case: the woman at the head of a
 *  family without a man at its head, and a woman who lives on her own; the other women of the city are drawn at
 *  `rateOfOtherWomen`. */
export function workforce(s: WorldState, places: readonly number[], participation: { men: number; women: number }): Workforce[] {
  const P = s.person.cols, F = s.family.cols, seed = s.seed >>> 0;
  const at = new Map<number, number>(places.map((p, k) => [p, k]));
  const out: Workforce[] = places.map(() => ({ working: [], idle: -1 }));
  const order = (id: number) => hash01(seed, id, K.order);
  // the persons of working age of each city, and the women among them who have no husband
  const members = new Int32Array(s.family.size);
  for (let id = 0; id < s.person.size; id++) if (s.person.alive[id]) members[P.family[id]]++;
  const adults: number[][] = places.map(() => []), women = new Int32Array(places.length), alone = new Int32Array(places.length);
  const withoutHusband = (id: number) => { const f = P.family[id]; return F.man[f] < 0 && (F.woman[f] === id || members[f] === 1); };
  const named = namedPersons(s); // the rulers have no part in the economy (src/sim/systems/rulers.ts)
  for (let id = 0; id < s.person.size; id++) {
    if (!s.person.alive[id] || named.has(id) || P.died[id] !== ALIVE) continue;
    const k = at.get(F.place[P.family[id]]);
    if (k === undefined || ageOn(P.born[id], s.day) < WORKING_AGE) continue;
    adults[k].push(id);
    if (P.sex[id] !== 1) { women[k]++; if (withoutHusband(id)) alone[k]++; }
  }
  adults.forEach((ids, k) => {
    const others = rateOfOtherWomen(participation.women, women[k], alone[k]);
    for (const id of ids) {
      const works = P.sex[id] === 1 ? hash01(seed, id, K.works) < participation.men : withoutHusband(id) || hash01(seed, id, K.works) < others;
      if (works) out[k].working.push(id);
      else if (out[k].idle < 0 || order(id) < order(out[k].idle)) out[k].idle = id;
    }
  });
  for (const f of out) f.working.sort((a, b) => order(a) - order(b) || a - b);
  return out;
}
