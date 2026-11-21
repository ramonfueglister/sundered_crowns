// Which of a person's figures is on the stage at an hour of the world: the plan of the day (people feature 12,
// src/sim/people/day_plan.ts) says what the person does, and this says where in the town that is seen (crowd.ts
// FIGURE_AT): in the street, at the market, at a house of worship, at a furlong of the town, or nowhere (indoors, in
// the barn, asleep). Main thread only: a person's plan is worked out once a day from what the figures carry
// (`Figures.plan`) or the newer lists of the persons (people.ts), as the world server works it out for the card of
// the person (src/net/plan.ts).
import { CHILDBED_DAYS, sickness } from '../sim/people/absence';
import { AWAY, DOING, type DayPlan, WHO, dayPlan, doingAt } from '../sim/people/day_plan';
import { inBarn } from '../sim/people/farm_year';
import { BORN_UNKNOWN } from '../sim/state';
import { FIGURE_AT, PLAN } from './aims';
import type { Figures } from './crowd';
import { listedPerson, listsVersion } from './people';

/** What the figures follow: the world's day, the hour of it (0 to 24; null where the hours pass too fast to be seen,
 *  `TERCE`), its start year, and the latitude and the farming year (FARM_YEAR, src/sim/people/farm_year.ts) of a
 *  place. */
export interface FigureClock {
  day: number;
  hour: number | null;
  startYear: number;
  lat: (place: number) => number;
  farm: (place: number) => number;
}

/** No figure of the person is on the stage. */
export const NOWHERE = -1;
/** OWN RULE, a drawing rule: where the world's hours pass faster than the figures are put, each day is shown in the
 *  middle of the hour of the mass (terce, the fourth of the twelve unequal hours of daylight, day_plan.ts), when the
 *  plan has the persons at the house of worship on a day of rest, at the market on the market day and at work on the
 *  others: so many unequal hours after sunrise. */
const TERCE = 3.5;

/**
 * Where the person is seen at the hour by what the plan has the person do: the market and the hiring place at the
 * market's figure, the mass at the house of worship's, the work of the farming year at the furlong's, court in the
 * street, everything else in the street or nowhere.
 */
export function figureAtHour(plan: DayPlan, who: number, hour: number): number {
  switch (doingAt(plan, hour)) {
    case DOING.market:
    case DOING.hiring:
      return FIGURE_AT.market;
    case DOING.church:
      return FIGURE_AT.worship;
    case DOING.court:
      return FIGURE_AT.street;
    case DOING.work:
      // OWN RULE, a drawing rule: the services work in the town (they sell, carry and serve), so they are seen in its
      // streets; the farmers on a furlong of the town, also at the threshing floor, the vines and the gardens, which
      // the town has no place of their own for, but in the barn while they thresh there (farm_year.ts); the crafts
      // in the workshop and the banker in the bank, not seen
      if (who === WHO.farm) return inBarn(plan.task) ? NOWHERE : FIGURE_AT.field;
      return who === WHO.trade ? FIGURE_AT.street : NOWHERE;
    case DOING.home:
    case DOING.meal:
      // OWN RULE, a drawing rule: the houses have no inside to show, so a person at home in daylight is seen in the
      // street before it, and indoors after sunset
      return hour >= plan.sunrise && hour < plan.sunset ? FIGURE_AT.street : NOWHERE;
    default:
      return NOWHERE;
  }
}

/** the plans of the day of the persons whose figures are on the stage, by uid, for the day `planned` and the lists of
 *  the persons as they were at `listed` (people.ts listsVersion) */
const plans = new Map<number, DayPlan>();
let planned = Number.NaN,
  listed = -1;

/** Why the person `uid` is away on the day (AWAY): sick on the days of sickness the economy has (absence.ts), as
 *  awayOn in src/sim/people/plan_person.ts; in childbed for the days after the birth the list of the persons told. */
function awayOf(seed: number, uid: number, born: number, child: number, day: number): number {
  if (born !== BORN_UNKNOWN) {
    const sick = sickness(seed, uid, born, day + 1),
      n = sick.length;
    if (n && sick[n - 2] <= day && day <= sick[n - 1]) return AWAY.sick;
  }
  return child <= day && child > day - CHILDBED_DAYS ? AWAY.childbed : AWAY.none;
}

/**
 * Which of the figure's kinds (FIGURE_AT) the person of figure `i` is seen at by the clock, or NOWHERE; a person
 * without a part (a ruler, or of a server older than the client) is seen in the street at every hour. Where the lists
 * of the persons are newer than the figures (src/people/town_rolls.ts), they count: a person they no longer hold at
 * the place (dead, or moved away) is nowhere, and the part, the calendar and a birth are theirs.
 */
export function figureShown(f: Pick<Figures, 'e' | 'plan' | 'seed'>, i: number, clock: FigureClock): number {
  const [built, builtCalendar, place, born, builtChild] = f.plan?.subarray(i * PLAN, i * PLAN + PLAN) ?? [];
  if (built === undefined) return FIGURE_AT.street;
  const uid = f.e[i * 4 + 3] - 1,
    now = listedPerson(uid, place);
  if (now === null) return NOWHERE;
  if (built < 0) return FIGURE_AT.street;
  const who = now?.who ?? built;
  if (planned !== clock.day || listed !== listsVersion()) {
    plans.clear();
    planned = clock.day;
    listed = listsVersion();
  }
  let plan = plans.get(uid);
  if (!plan) {
    const child = now ? (now.child ?? Number.NEGATIVE_INFINITY) : builtChild,
      away = awayOf(f.seed ?? 0, uid, born, child, clock.day);
    plan = dayPlan(
      { who, calendar: now?.calendar ?? builtCalendar, away, heading: -1 },
      place,
      clock.lat(place),
      clock.day,
      clock.startYear,
      clock.farm(place),
    );
    plans.set(uid, plan);
  }
  return figureAtHour(plan, who, clock.hour ?? plan.sunrise + (TERCE * (plan.sunset - plan.sunrise)) / 12);
}
