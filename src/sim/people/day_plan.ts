// The day plan of a person (people feature 12, step 5 of way A of feature 7): what a person does at which hour of a
// day, and where. A pure function of the person's part in the world, the calendar of the person's days of work, the
// place and the day, as the calendars (src/sim/holy_days.ts) and the days away (src/sim/people/absence.ts) are:
// nothing of it is saved, it draws nothing, and the economy does not read it.
//
// Large simulations give every person the typical day of the person's role rather than planning each day afresh:
// FRED gives each profile a list of places for the day by weekday (Grefenstette et al. 2013, BMC Public Health 13,
// 940), JUNE does the same for the 53 million persons of England (Aylett-Bullock et al. 2021), and in Belgian time
// use seven patterns cover 81.4 % of the working days (Aerts et al.). Here the template is chosen by the person's
// part, the kind of the day and the season. No source gives the shares of several templates within one part, so
// there is one template a part and no draw.
//
// - The kind of the day is the calendar's (people feature 8): a working day, a half day (Saturdays and the eves of the
//   feasts of the Latin Church: work stopped at noon, Stabel 2014, TSEG 11(4), pp. 36–38) or a day of rest. A worker
//   keeps the days of the firm's owner's faith, as in the economy; everybody else those of the own faith.
// - Work runs from sunrise to sunset (src/sim/people/sun.ts), with the midday meal: weaving stopped at noon, "entre
//   deux cloques du mengier" (Douai 1287, Stabel 2014, p. 38), for a length no source of the time gives. An hour and a
//   half is the dinner of the Artificers and Labourers Act of 1514 as Wikipedia gives it ("UK labour law history",
//   without a source there): out of period, and the only length read.
// - Who works in agriculture does the work of the farming year (src/sim/people/farm_year.ts).
// - A day of rest: the parish church (the decretals of Gregory IX, X 3.29.2, after Kirkland 2021). OWN RULE: the mass
//   at the third of the twelve unequal hours of the day (terce), for one of them. The day had twelve hours of unequal
//   length (Riis), but the hour of the parish mass is not in a source read.
// - The market: once a week, on a set day (Letters, Gazetteer of Markets and Fairs in England and Wales to 1516).
//   OWN RULE: the day of each place is drawn from Monday to Saturday (Sunday markets were displaced in the early 13th
//   century, same source); which day each town had is not read. OWN RULE: on the market day the persons who work in
//   the services, the sector of the calibration that holds trade, stand at the market from sunrise to noon; who stood
//   there, and how long, no source read gives.
// - A worker without work goes to the hiring place, the market, for the hour after the work bell: day labourers were
//   hired at the corn market of Douai within the hour after the bell (1403, Stabel 2014, pp. 47–48), and the Statute
//   of Labourers of 1351 has them hired "in a common place" of the market towns.
// - Sick or in childbed (people feature 9): at home all day.
// - A ruler holds court where staying (src/sim/content/itineraries.ts) and rides by day when on the way.
// - Sleep: OWN RULE: from 21 o'clock, or from sunset where the sun sets later, to sunrise. To bed between 21 and 22 is
//   Ekirch's reading (2024, Medical History 68) of early modern sources, and disputed; the day began at daybreak.
import { dateToDay, dayToDate } from '../calendar';
import { CALENDAR, DAY, jdnOfYear, weekday, yearKinds } from '../holy_days';
import { hash01 } from '../rng';
import { farmTask } from './farm_year';
import { sunHours } from './sun';

/** What a person does in a part of the day. */
export const DOING = {
  sleep: 0,
  /** at home: the household, the meals, the evening */
  home: 1,
  /** at the place of work: the workshop, the shop, the bank, or the field or barn of the farming year's work */
  work: 2,
  /** the midday meal */
  meal: 3,
  /** at the market of the place */
  market: 4,
  /** at the parish church */
  church: 5,
  /** at the hiring place of the market, looking for work */
  hiring: 6,
  /** at home, sick */
  sick: 7,
  /** at home, lying-in */
  childbed: 8,
  /** a ruler holding court */
  court: 9,
  /** a ruler on the way to the next place */
  travel: 10,
} as const;

/** The part of a person the template is chosen by. */
export const WHO = {
  /** under the working age (src/sim/systems/work.ts) */
  child: 0,
  /** an adult who does not work */
  home: 1,
  /** works in agriculture: a worker of a firm of agriculture or its owner */
  farm: 2,
  /** works in industry */
  craft: 3,
  /** works in the services */
  trade: 4,
  /** owns the bank of the city */
  bank: 5,
  /** a worker without work */
  seeking: 6,
  /** holds a crown */
  ruler: 7,
} as const;

/** Why a person is away from work (people feature 9). */
export const AWAY = { none: 0, sick: 1, childbed: 2 } as const;

/** What the plan needs of a person (src/sim/people/plan_person.ts reads it from the world). */
export interface PlanPerson {
  who: number;
  /** the calendar of the person's days of work (src/sim/holy_days.ts) */
  calendar: number;
  away: number;
  /** a ruler on the way: the place of the next stop; −1 while staying */
  heading: number;
}

/** A person's day. */
export interface DayPlan {
  /** the kind of the day for the person: DAY.work, DAY.half or DAY.rest (src/sim/holy_days.ts) */
  kind: number;
  /** a day of rest that is not the calendar's day of rest of the week (a feast) */
  feast: boolean;
  /** the day of the week, 0 Sunday to 6 Saturday, and whether it is the market day of the person's place */
  weekday: number;
  market: boolean;
  /** the work of the farming year for a person who works in agriculture (TASK, src/sim/people/farm_year.ts), else −1 */
  task: number;
  /** sunrise and sunset, hours of local solar time */
  sunrise: number;
  sunset: number;
  /** the parts of the day in their order: the hour each begins (local solar time; the first at 0) and what the person
   *  does (DOING) until the next */
  slots: [number, number][];
}

/** The midday meal: noon (Stabel 2014, p. 38), for an hour and a half (the Act of 1514, out of period; above). */
const NOON = 12,
  MEAL = 1.5;
/** OWN RULE: to bed at 21 o'clock, or at sunset where it is later (Ekirch 2024; above). */
const BED = 21;
/** OWN RULE: a worker without work stays at the hiring place for the hour after the work bell (Douai 1403, above). */
const HIRING = 1;
/** The draw of a place's market day ("mark"). */
const MARKET = 0x6d61726b;

/** The market day of a place, 1 Monday to 6 Saturday (OWN RULE, above). */
export const marketDay = (place: number): number => 1 + Math.floor(hash01(MARKET, place) * 6);

/** The plan of a person living in `place`, at latitude `lat`, on the world's day `day`. */
export function dayPlan(p: PlanPerson, place: number, lat: number, day: number, startYear: number): DayPlan {
  const { y, m, d } = dayToDate(day, startYear),
    doy = dateToDay(y, m, d, y),
    jdn = jdnOfYear(y) + doy,
    wd = weekday(jdn),
    kind = yearKinds(p.calendar, y)[doy],
    market = wd === marketDay(place),
    [rise, set] = sunHours(jdn, lat),
    task = p.who === WHO.farm ? farmTask(day, startYear) : -1;
  return {
    kind,
    feast: kind === DAY.rest && wd !== weeklyRest(p.calendar),
    weekday: wd,
    market,
    task,
    sunrise: round(rise),
    sunset: round(set),
    slots: slotsOf(p, kind, market, rise, set),
  };
}

/** What the person does at the hour `hour` (0 to 24) of the plan's day. */
export function doingAt(plan: DayPlan, hour: number): number {
  let doing = plan.slots[0][1];
  for (const [h, what] of plan.slots) if (h <= hour) doing = what;
  return doing;
}

const round = (h: number) => Math.round(h * 100) / 100;

/** The day of rest of the week of a calendar (src/sim/holy_days.ts): the Sunday of the churches, the Sabbath; −1 for
 *  the calendars without one. */
const weeklyRest = (calendar: number): number =>
  calendar === CALENDAR.jewish ? 6 : calendar === CALENDAR.muslim || calendar === CALENDAR.none ? -1 : 0;

/** The parts of the day by the templates (above). */
function slotsOf(p: PlanPerson, kind: number, market: boolean, rise: number, set: number): [number, number][] {
  const out: [number, number][] = [];
  // a part begins at hour h; one that begins where the last began takes its place, one before it or past the day is
  // left out (the polar night, the midnight sun)
  const at = (h: number, doing: number) => {
    if (h >= 24 || (out.length && h < out[out.length - 1][0])) return;
    if (out.length && h === out[out.length - 1][0]) out.pop();
    if (!out.length || out[out.length - 1][1] !== doing) out.push([round(h), doing]);
  };
  if (p.away !== AWAY.none) {
    at(0, p.away === AWAY.sick ? DOING.sick : DOING.childbed);
    return out;
  }
  at(0, DOING.sleep);
  const bed = Math.max(BED, set),
    awake = p.who === WHO.ruler ? DOING.court : DOING.home;
  if (p.who === WHO.ruler && p.heading >= 0) {
    at(rise, DOING.travel);
    at(set, DOING.sleep);
    return out;
  }
  if (kind === DAY.rest) {
    const hour = (set - rise) / 12,
      terce = rise + 3 * hour;
    at(rise, awake);
    at(terce, DOING.church);
    at(terce + hour, awake);
  } else if (p.who === WHO.seeking) {
    at(rise, DOING.hiring);
    at(rise + HIRING, DOING.home);
  } else if (p.who === WHO.farm || p.who === WHO.craft || p.who === WHO.trade || p.who === WHO.bank) {
    const atMarket = market && p.who === WHO.trade;
    at(rise, atMarket ? DOING.market : DOING.work);
    if (kind === DAY.half || set <= NOON + MEAL) at(Math.min(NOON, set), DOING.home);
    else {
      at(NOON, DOING.meal);
      at(NOON + MEAL, DOING.work);
      at(set, DOING.home);
    }
  } else at(rise, awake);
  at(bed, DOING.sleep);
  return out;
}
