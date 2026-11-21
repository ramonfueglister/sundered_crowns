// The day plan of a person (people feature 12): src/sim/people/sun.ts, farm_year.ts, day_plan.ts, plan_person.ts.
import { describe, expect, it } from 'vitest';
import { sunHours } from '../src/sim/people/sun';
import { TASK, farmTask } from '../src/sim/people/farm_year';
import { AWAY, DOING, type PlanPerson, WHO, dayPlan, doingAt, marketDay } from '../src/sim/people/day_plan';
import { planPerson } from '../src/sim/people/plan_person';
import { CALENDAR, DAY, julianJdn, weekday } from '../src/sim/holy_days';
import { dateToDay } from '../src/sim/calendar';
import { presentPersons } from '../src/sim/people/living';
import { decodeState, encodeState } from '../src/sim/snapshot';
import { ALIVE } from '../src/sim/state';
import { newWorldState } from '../tools/sim/load';

const LONDON = 51.5;
const day = (m: number, d: number) => dateToDay(1291, m - 1, d, 1291);
/** A place whose market day is not `wd` (0 Sunday … 6 Saturday), and one whose market day is. */
const placeWithout = (wd: number) => [...Array(100).keys()].find((p) => marketDay(p) !== wd)!;
const placeWith = (wd: number) => [...Array(100).keys()].find((p) => marketDay(p) === wd)!;
const person = (who: number, more: Partial<PlanPerson> = {}): PlanPerson => ({
  who,
  calendar: CALENDAR.latin,
  away: AWAY.none,
  heading: -1,
  ...more,
});

describe('the sun', () => {
  it('rises and sets as the almanacs give it (London, 2024)', () => {
    const [jr, js] = sunHours(julianJdn(2024, 6, 8), LONDON); // 21 June 2024 of the Gregorian calendar
    expect(js - jr).toBeCloseTo(16.6, 0);
    const [dr, ds] = sunHours(julianJdn(2024, 12, 8), LONDON); // 21 December 2024
    expect(ds - dr).toBeCloseTo(7.8, 0);
    expect(jr + js).toBeCloseTo(24, 5); // hours of solar time: noon in the middle
  });
  it('is up longest about 13 June of the Julian calendar of 1291', () => {
    const len = (m: number, d: number) => {
      const [r, s] = sunHours(julianJdn(1291, m, d), LONDON);
      return s - r;
    };
    expect(len(6, 13)).toBeGreaterThan(len(6, 1));
    expect(len(6, 13)).toBeGreaterThan(len(6, 25));
  });
  it('does not rise in the polar night and does not set in the midnight sun', () => {
    expect(sunHours(julianJdn(1291, 12, 12), 75)).toEqual([12, 12]);
    expect(sunHours(julianJdn(1291, 6, 12), 75)).toEqual([0, 24]);
  });
});

describe('the farming year', () => {
  it('follows the dates of the treatises', () => {
    expect(farmTask(day(1, 10), 1291)).toBe(TASK.thresh);
    expect(farmTask(day(3, 1), 1291)).toBe(TASK.spring);
    expect(farmTask(day(4, 15), 1291)).toBe(TASK.fallow); // "April is a good time for fallowing"
    expect(farmTask(day(6, 10), 1291)).toBe(TASK.hay);
    expect(farmTask(day(6, 24), 1291)).toBe(TASK.weed); // after St John's Day
    expect(farmTask(day(8, 1), 1291)).toBe(TASK.harvest);
    expect(farmTask(day(9, 4), 1291)).toBe(TASK.harvest); // five weeks in August and early September
    expect(farmTask(day(10, 1), 1291)).toBe(TASK.winter);
    expect(farmTask(day(12, 20), 1291)).toBe(TASK.thresh);
  });
});

describe('the market day', () => {
  it('is a day from Monday to Saturday, all six of them among the places', () => {
    const days = new Set([...Array(500).keys()].map(marketDay));
    expect([...days].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('the templates', () => {
  // 1291: 1 January a Monday; 9 January a Tuesday, 13 January a Saturday, 14 January a Sunday
  const tuesday = day(1, 9),
    saturday = day(1, 13),
    sunday = day(1, 14);
  it('a craftsman works from sunrise to sunset with the midday meal, and sleeps from nine', () => {
    const p = dayPlan(person(WHO.craft), placeWithout(2), LONDON, tuesday, 1291);
    expect(weekday(julianJdn(1291, 1, 9))).toBe(2);
    expect(p.kind).toBe(DAY.work);
    expect(p.slots).toEqual([
      [0, DOING.sleep],
      [p.sunrise, DOING.work],
      [12, DOING.meal],
      [13.5, DOING.work],
      [p.sunset, DOING.home],
      [21, DOING.sleep],
    ]);
    expect(doingAt(p, 10)).toBe(DOING.work);
    expect(doingAt(p, 23)).toBe(DOING.sleep);
  });
  it('stops at noon on a Saturday and goes to church at terce on a Sunday', () => {
    const half = dayPlan(person(WHO.craft), placeWithout(6), LONDON, saturday, 1291);
    expect(half.kind).toBe(DAY.half);
    expect(doingAt(half, 11.9)).toBe(DOING.work);
    expect(doingAt(half, 12.1)).toBe(DOING.home);
    const rest = dayPlan(person(WHO.craft), 0, LONDON, sunday, 1291),
      terce = rest.sunrise + (3 * (rest.sunset - rest.sunrise)) / 12;
    expect(rest.kind).toBe(DAY.rest);
    expect(rest.feast).toBe(false);
    expect(doingAt(rest, terce + 0.01)).toBe(DOING.church);
    expect(rest.slots.some(([, d]) => d === DOING.work)).toBe(false);
  });
  it('keeps the feasts of the calendar: the Assumption is a feast, not a Sunday', () => {
    const p = dayPlan(person(WHO.farm), 0, LONDON, day(8, 15), 1291);
    expect(p.kind).toBe(DAY.rest);
    expect(p.feast).toBe(true);
    // a Muslim worker works that day, in the harvest
    const m = dayPlan(person(WHO.farm, { calendar: CALENDAR.muslim }), placeWithout(3), 30, day(8, 15), 1291);
    expect(m.kind).toBe(DAY.work);
    expect(m.task).toBe(TASK.harvest);
  });
  it('puts the services at the market on its morning, and the worker without work at the hiring for an hour', () => {
    const place = placeWith(2),
      trade = dayPlan(person(WHO.trade), place, LONDON, tuesday, 1291);
    expect(trade.market).toBe(true);
    expect(doingAt(trade, 10)).toBe(DOING.market);
    expect(doingAt(trade, 14)).toBe(DOING.work);
    expect(doingAt(dayPlan(person(WHO.craft), place, LONDON, tuesday, 1291), 10)).toBe(DOING.work);
    const seeking = dayPlan(person(WHO.seeking), place, LONDON, tuesday, 1291);
    expect(doingAt(seeking, seeking.sunrise + 0.5)).toBe(DOING.hiring);
    expect(doingAt(seeking, seeking.sunrise + 1.5)).toBe(DOING.home);
  });
  it('keeps the sick and the mothers in childbed at home all day, and lets a ruler on the way ride by day', () => {
    expect(dayPlan(person(WHO.craft, { away: AWAY.sick }), 0, LONDON, tuesday, 1291).slots).toEqual([[0, DOING.sick]]);
    expect(dayPlan(person(WHO.home, { away: AWAY.childbed }), 0, LONDON, sunday, 1291).slots).toEqual([
      [0, DOING.childbed],
    ]);
    const ride = dayPlan(person(WHO.ruler, { heading: 5 }), 0, LONDON, tuesday, 1291);
    expect(doingAt(ride, 12)).toBe(DOING.travel);
    expect(doingAt(ride, 23)).toBe(DOING.sleep);
    expect(doingAt(dayPlan(person(WHO.ruler), 0, LONDON, tuesday, 1291), 12)).toBe(DOING.court);
  });
});

describe('the plan of the persons of a world', () => {
  const { s, w } = newWorldState();
  const ids = [...presentPersons(s)].filter((id) => s.person.cols.died[id] === ALIVE).slice(0, 400);
  it('gives every person a part, and the same plan after a restart from the snapshot', () => {
    const back = decodeState(encodeState(s));
    const parts = new Set<number>();
    for (const id of ids) {
      const place = s.family.cols.place[s.person.cols.family[id]],
        p = planPerson(s, id);
      parts.add(p.who);
      expect(dayPlan(planPerson(back, id), place, w.lat[place], back.day, back.startYear)).toEqual(
        dayPlan(p, place, w.lat[place], s.day, s.startYear),
      );
    }
    expect(parts.has(WHO.child)).toBe(true);
    expect(parts.has(WHO.farm)).toBe(true);
  });
});
