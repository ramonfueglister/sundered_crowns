// Who leaves for another place, how often and how far: the rules and their numbers (people feature 4,
// docs/PEOPLE_DESIGN.md). Ramon, 18 November 2026: the unmarried move by the rates of the sources and an heir comes
// home; work as a motive, whole families and the flight from a famine wait (each needs something that is not built).
//
// How often: the parish registers of four parishes of Scania, 1829 to 1867, the only source read that measures
// leaving by age, sex and the standing of the family.
//   Dribe 2002, Dealing with Economic Stress Through Migration, Lund Papers in Economic History 79 (printed in the
//   European Review of Economic History 7, 2003), tables 3 and 4: the children who leave the home of their parents,
//   as events over person-years, and the relative risks of the landless, of a dead father and of a dead mother.
//   Dribe & Lundh 2002, People on the Move, Lund Papers in Economic History 80, table 1: a servant changes the
//   master 7.8 times (men) and 8.0 times (women) between 15 and 30, and 20.0 and 16.0 times between 10 and 60;
//   table 3: of these changes 43 % stay in the parish, 44 % go to another parish within 15 km, and the rest further.
// How far: the court rolls of Great Waltham and High Easter, Essex, 1289 to 1361 (Raven 2024, Continuity and Change
// 39, table 2): of 21 serfs who had left for a known place, 10 were within 10 miles, 5 at 10 to 19, 4 at 20 to 39 and
// 2 beyond (the furthest about 70 miles).
//
// A place of the world is a town with its land, and no two towns lie nearer than 16 km. So the many short moves of
// the sources happen inside a place and are not computed; only the far part is: `FAR_SHARE` of the changes.
//
// Ours, not a source: the rates of Sweden in the 19th century stand for every time and place (checked only in the
// sum: the moves of the unmarried over the border of a parish come to 2.2 % of the persons a year; Clayworth 1676–88
// and Cogenhoe 1618–28 lost 3.9 to 4.7 %, families and the married among them, after Laslett & Harrison 1963 in
// Schürer 2024); "landless" is a family in which nobody owns a firm; the share of far moves is Sweden's and their
// distances are England's; the years after 30 of a servant take the whole difference of the two counts of table 1.
import { MOVE_FACTOR_TOP } from './traits';

/** A person can leave from this age, and no longer from that one (the tables of the sources: 10 to 60). */
export const MOVING_AGE: readonly [number, number] = [10, 60];
/** From this age a child at home counts as grown (Dribe's two tables: 10 to 17, 17 to 30); at `HOME_UNTIL` the
 *  tables of those who live with their parents end. */
export const GROWN = 17,
  HOME_UNTIL = 30;
/** From this age a person who lives away from home changes places as a servant (Dribe & Lundh: servants of 15 on). */
const SERVICE_FROM = 15;

/** The children who left home, as events over person-years (Dribe 2002, tables 3 and 4), and the shares and the
 *  relative risks of the standings of their families against freeholders and tenants of the crown. */
const LEFT = {
  young: { men: 407 / 6190, women: 382 / 6348 },
  grown: { men: 327 / 2874, women: 505 / 3313 },
} as const;
const STANDING = {
  // [share, relative risk]: semi-landless, landless, tenants of nobles; the rest is the reference
  young: {
    men: [
      [0.18, 4.64],
      [0.44, 3.43],
      [0.17, 1.07],
    ],
    women: [
      [0.17, 9.17],
      [0.48, 8.46],
      [0.17, 1.81],
    ],
  },
  grown: {
    men: [
      [0.15, 1.45],
      [0.35, 1.43],
      [0.19, 1.15],
    ],
    women: [
      [0.18, 2.49],
      [0.42, 2.06],
      [0.16, 1.11],
    ],
  },
} as const;
/** The rate a year of the reference group and of the landless: the rate of all, divided by the mean relative risk. */
function split(rate: number, groups: readonly (readonly [number, number])[]): { landed: number; landless: number } {
  let share = 0,
    mean = 0;
  for (const [s, r] of groups) {
    share += s;
    mean += s * r;
  }
  const landed = rate / (mean + (1 - share));
  return { landed, landless: landed * groups[1][1] };
}
/** The share of the children at home who leave it in a year, by age, sex and whether the family owns a firm:
 *  sons of 10 to 16: 2.4 % and 8.2 %, daughters 1.0 % and 8.3 %; sons of 17 to 29: 9.1 % and 13.1 %, daughters
 *  8.8 % and 18.1 %. `all`: where no place has an economy, nobody owns a firm and the rate of all families holds. */
export const LEAVES_HOME = {
  young: {
    men: { ...split(LEFT.young.men, STANDING.young.men), all: LEFT.young.men },
    women: { ...split(LEFT.young.women, STANDING.young.women), all: LEFT.young.women },
  },
  grown: {
    men: { ...split(LEFT.grown.men, STANDING.grown.men), all: LEFT.grown.men },
    women: { ...split(LEFT.grown.women, STANDING.grown.women), all: LEFT.grown.women },
  },
} as const;
/** A dead parent, against both alive (Dribe 2002, tables 3 and 4, model I; 1 where the table has no clear effect). */
export const ORPHAN = {
  father: { young: { men: 1, women: 1.55 }, grown: { men: 1.28, women: 1.32 } },
  mother: { young: { men: 1, women: 1.47 }, grown: { men: 1, women: 1 } },
} as const;
/** Changes of place a year of a person who lives away from home (Dribe & Lundh 2002, table 1): to 30, and after. */
export const SERVICE = {
  men: { young: 7.8 / 15, later: (20.0 - 7.8) / 30 },
  women: { young: 8.0 / 15, later: (16.0 - 8.0) / 30 },
} as const;

/** What the rate of a person hangs on. */
export interface Mover {
  age: number;
  man: boolean;
  /** lives in the place the person comes from */
  home: boolean;
  /** somebody of the family owns a firm; undefined where the world has no economies */
  landed: boolean | undefined;
  fatherDead: boolean;
  motherDead: boolean;
}
/** Changes of place a year of an unmarried person without a household, near and far: leaving home by Dribe, and
 *  from one place of service to the next by Dribe & Lundh. 0 outside the ages of the tables. */
export function movesAYear(m: Mover): number {
  const sex = m.man ? 'men' : 'women';
  if (m.age < MOVING_AGE[0] || m.age >= MOVING_AGE[1]) return 0;
  if (!m.home) return m.age < SERVICE_FROM ? 0 : m.age < HOME_UNTIL ? SERVICE[sex].young : SERVICE[sex].later;
  if (m.age >= HOME_UNTIL) return 0;
  const stage = m.age < GROWN ? 'young' : 'grown',
    r = LEAVES_HOME[stage][sex];
  return (
    (m.landed === undefined ? r.all : m.landed ? r.landed : r.landless) *
    (m.fatherDead ? ORPHAN.father[stage][sex] : 1) *
    (m.motherDead ? ORPHAN.mother[stage][sex] : 1)
  );
}

/** The share of the changes of place that go further than 16 km (Dribe & Lundh 2002, table 3: towns of the region,
 *  the rest of Sweden and abroad are 8.7 % of the men's and 7.7 % of the women's, 9.1 % and 8.1 % of those whose
 *  destination is known). */
export const FAR_SHARE = 0.09;
/** How far a far move goes, in km, each band with its share (Raven 2024, table 2: 5, 4 and 2 of the 11 who went
 *  further than ten miles). */
export const BANDS: readonly (readonly [from: number, to: number, share: number])[] = [
  [16, 32, 5 / 11],
  [32, 64, 4 / 11],
  [64, 115, 2 / 11],
];
/** The band of the draw `u` in [0, 1). */
export function bandOf(u: number): number {
  let b = 0,
    x = u;
  while (b < BANDS.length - 1 && x >= BANDS[b][2]) {
    x -= BANDS[b][2];
    b++;
  }
  return b;
}

/** No rate of a person is above this: `movesAYear` stays under 0.55, and the factor of the person's traits under
 *  MOVE_FACTOR_TOP (src/sim/people/traits.ts). The events of every person are drawn at this rate, and one of them is
 *  a move with the share the person's rate has of it (thinning, Lewis & Shedler 1979), so a rate that changes with
 *  the family needs no new draw. */
export const TOP_RATE = 0.55 * MOVE_FACTOR_TOP;
/** Years from now to the next far move a person may make, for the draw `u` in [0, 1). */
export const yearsToNext = (u: number): number => -Math.log(1 - u) / (TOP_RATE * FAR_SHARE);
