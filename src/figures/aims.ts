// Where the persons of a town stand and go: the column of the town's square each walks from, and the columns of the
// market and of a house of worship where the plan of the day takes them (people feature 12, src/sim/people/
// day_plan.ts), and the figures of a person there. Each column is drawn from a hash of the person's id, in world
// blocks, so that every piece of the world agrees without seeing the others: a person shows where that column is
// street, and of two persons aiming at one column the first. Which of a person's figures is on the stage at an hour
// is set on the main thread (schedule.ts).
import { hash2 } from '../lookprobe/batch';
import { WHO } from '../sim/people/day_plan';
import type { Gathered, Town, Where } from './crowd';
import { Mode, dress, townEstate } from './estates';
import { type TownPerson, townPeople } from './people';

/** The columns persons of a town aim at, by world block (`key`). */
export interface TownAims {
  street: Map<number, TownPerson>;
  market: Map<number, TownPerson>;
  worship: Map<number, TownPerson>;
}

/** A world block as one number. */
export const key = (wx: number, wz: number) => wx * 1048576 + wz;

/** OWN RULE, a drawing value: a person at a house of worship stands within this many blocks of its middle (the great
 *  churches of the register are some 50 to 100 m long, 35 to 70 blocks at the world's scale, and are mostly not street
 *  inside: those who find no street there are inside). */
const AT_WORSHIP = 12;

const made = new Map<string, TownAims>();

/** The columns of the persons of a town, or none for a town without persons. The rulers are not among them: the
 *  piece that holds the middle of the town stands them in a street (crowd.ts). Only the persons the plan takes to the
 *  market (who work in the services, or look for work) aim at a column of it; a person whose part an older server
 *  does not tell keeps to the street. */
export function aimsOf(t: Town): TownAims | undefined {
  const people = townPeople(t.site);
  if (!people?.length) return undefined;
  const k = `${t.site}:${t.cx}:${t.cz}:${t.half}:${people.length}`;
  let aims = made.get(k);
  if (aims) return aims;
  aims = { street: new Map(), market: new Map(), worship: new Map() };
  const put = (m: Map<number, TownPerson>, at: number, p: TownPerson) => {
    if (!m.has(at)) m.set(at, p);
  };
  for (const p of people) {
    if (p.ruler !== undefined) continue;
    const h = (n: number) => hash2(p.id, n, 920);
    put(
      aims.street,
      key(t.cx - t.half + Math.floor(h(1) * 2 * t.half), t.cz - t.half + Math.floor(h(2) * 2 * t.half)),
      p,
    );
    if (p.who === undefined) continue;
    if (t.market && (p.who === WHO.trade || p.who === WHO.seeking)) {
      const [x0, z0, x1, z1] = t.market;
      put(aims.market, key(x0 + Math.floor(h(3) * (x1 - x0)), z0 + Math.floor(h(4) * (z1 - z0))), p);
    }
    if (t.worship?.length) {
      const [cx, cz] = t.worship[Math.floor(h(5) * t.worship.length)],
        a = h(6) * 2 * Math.PI,
        r = Math.sqrt(h(7)) * AT_WORSHIP;
      put(aims.worship, key(Math.round(cx + Math.cos(a) * r), Math.round(cz + Math.sin(a) * r)), p);
    }
  }
  made.set(k, aims);
  return aims;
}

/** Which of a person's figures a figure is (crowd.ts `Figures.at`). */
export const FIGURE_AT = { anonymous: 0, street: 1, market: 2, worship: 3 } as const;
/** numbers per figure in crowd.ts `Figures.plan`: part, calendar, place, day of birth, day of birth of the child of a
 *  mother in childbed (−Infinity for none) */
export const PLAN = 5;
/** the draw of what a person wears, from the person's id: the same in each of the person's figures */
export const LOOK = 950;

/** The plan of the day of a person's figure (`Figures.at`, `Figures.plan`), nothing for an anonymous one; a ruler has
 *  no part (−1): the ruler stands in the street at every hour, where the map mode of the rulers finds them. */
export function personOf(out: Gathered, p: TownPerson | undefined, at: number) {
  out[5].push(p ? at : FIGURE_AT.anonymous);
  out[6].push(
    p?.ruler === undefined ? (p?.who ?? -1) : -1,
    p?.calendar ?? -1,
    p?.place ?? -1,
    p?.born ?? 0,
    p?.child ?? Number.NEGATIVE_INFINITY,
  );
}

/**
 * A person's figure at the market or at a house of worship, at a block of the finest step (x, z in the piece, wx, wz
 * in the world): on the spot, dressed as the person's figure in the street, and not on the stage until the plan of
 * the day takes the person there (a negative phase, material.ts).
 */
export function spot(out: Gathered, w: Where, x: number, z: number, wx: number, wz: number, p: TownPerson, at: number) {
  const h = (k: number) => hash2(wx, wz, 430 + k),
    look = (k: number) => hash2(p.id, k, LOOK),
    y = w.h(x, z);
  out[0].push(x + 0.5, y, z + 0.5, -1 - h(4) * 100);
  out[1].push(x + 0.5, y, z + 0.5, 0);
  dress(out, Mode.Stand, townEstate(look(0), p.female), look);
  out[4].push(h(12) * Math.PI * 2, p.id + 1);
  personOf(out, p, at);
}
