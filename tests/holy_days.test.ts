// The days of rest of the faiths (src/sim/holy_days.ts; docs/PEOPLE_DESIGN.md, feature 8): the computations of the
// calendars against dates known from elsewhere, and the year 1291 of every calendar.
import { describe, it, expect } from 'vitest';
import {
  CALENDAR,
  DAY,
  WORKED,
  calendarOf,
  easterGregorian,
  easterJulian,
  islamicJdn,
  jdnOfYear,
  julianJdn,
  roshHashanahJdn,
  weekday,
  workedDays,
  yearKinds,
} from '../src/sim/holy_days';
import { dateToDay, yearDays } from '../src/sim/calendar';
import { FAITH_INDEX } from '../src/sim/content/peoples';

/** The kind of a day of 1291 in a calendar, by month (1..12) and day. */
const kind = (calendar: number, m: number, d: number, y = 1291) => yearKinds(calendar, y)[dateToDay(y, m - 1, d, y)];
/** The days of each kind of a year in a calendar. */
const counts = (calendar: number, y: number) => {
  const n = [0, 0, 0];
  for (const k of yearKinds(calendar, y)) n[k]++;
  return n;
};

describe('the day numbers', () => {
  it('give the Julian day numbers of dates of the Julian, the Islamic and the Hebrew calendars', () => {
    // 1 January 2000 (Gregorian) is the day 2451545, a Saturday; 1 January 2000 of the Julian calendar is 13 days later
    expect(weekday(2451545)).toBe(6);
    expect(julianJdn(2000, 1, 1)).toBe(2451558);
    // the civil epoch of the Islamic calendar, 16 July 622 (Julian), and 1 Ramadan 1445 = 11 March 2024
    expect(islamicJdn(1, 1, 1)).toBe(julianJdn(622, 7, 16));
    expect(islamicJdn(1445, 9, 1)).toBe(2460381);
    // Rosh Hashanah 5784 = 16 September 2023 and 5785 = 3 October 2024 (Gregorian)
    expect(roshHashanahJdn(5784)).toBe(2460204);
    expect(roshHashanahJdn(5785)).toBe(2460587);
  });
  it('give Easter by both computi', () => {
    expect(easterJulian(1291)).toEqual([4, 22]);
    expect(easterJulian(2024)).toEqual([4, 22]); // 5 May 2024 of the Gregorian calendar
    expect(easterGregorian(2024)).toEqual([3, 31]);
    expect(easterGregorian(2025)).toEqual([4, 20]);
  });
  it("follow the world's calendar: 1 January 1291 is a Monday, and every year starts where the last one ended", () => {
    expect(jdnOfYear(1291)).toBe(julianJdn(1291, 1, 1));
    expect(weekday(jdnOfYear(1291))).toBe(1);
    for (const y of [1291, 1582, 1583, 1700, 1899]) expect(jdnOfYear(y + 1) - jdnOfYear(y)).toBe(yearDays(y));
  });
});

describe('the calendars of the faiths', () => {
  it('give every faith its calendar', () => {
    expect(calendarOf(FAITH_INDEX.latin)).toBe(CALENDAR.latin);
    expect(calendarOf(FAITH_INDEX.orthodox)).toBe(CALENDAR.orthodox);
    expect(calendarOf(FAITH_INDEX.coptic)).toBe(CALENDAR.sunday);
    expect(calendarOf(FAITH_INDEX.evangelical)).toBe(CALENDAR.sunday);
    expect(calendarOf(FAITH_INDEX.sunni)).toBe(CALENDAR.muslim);
    expect(calendarOf(FAITH_INDEX.ibadi)).toBe(CALENDAR.muslim);
    expect(calendarOf(FAITH_INDEX.jewish)).toBe(CALENDAR.jewish);
    expect(calendarOf(FAITH_INDEX.hindu)).toBe(CALENDAR.none);
    expect(calendarOf(-1)).toBe(CALENDAR.none);
  });
  it('keep the Sundays and the feasts of the Decretum, with Saturdays and eves as half days', () => {
    expect(kind(CALENDAR.latin, 1, 1)).toBe(DAY.rest); // the octave of the Lord
    expect(kind(CALENDAR.latin, 1, 5)).toBe(DAY.half); // the eve of the Epiphany, a Friday
    expect(kind(CALENDAR.latin, 1, 6)).toBe(DAY.rest); // the Epiphany, a Saturday
    expect(kind(CALENDAR.latin, 1, 7)).toBe(DAY.rest); // a Sunday
    expect(kind(CALENDAR.latin, 1, 8)).toBe(DAY.work);
    expect(kind(CALENDAR.latin, 1, 13)).toBe(DAY.half); // a Saturday
    // Easter 22 April: the week of Easter, the Ascension (31 May) and Pentecost (10 June, a Sunday)
    for (let d = 22; d <= 28; d++) expect(kind(CALENDAR.latin, 4, d)).toBe(DAY.rest);
    expect(kind(CALENDAR.latin, 4, 21)).toBe(DAY.half);
    expect(kind(CALENDAR.latin, 5, 31)).toBe(DAY.rest);
    expect(kind(CALENDAR.latin, 8, 15)).toBe(DAY.rest); // the Assumption
    expect(kind(CALENDAR.latin, 11, 11)).toBe(DAY.rest); // St Martin
    // St Matthias is on 24 February, in a leap year on 25 February
    expect(kind(CALENDAR.latin, 2, 24)).toBe(DAY.rest);
    expect(kind(CALENDAR.latin, 2, 25, 1292)).toBe(DAY.rest);
    // 52 Sundays and 31 feasts on other days; 250.5 days of work
    expect(counts(CALENDAR.latin, 1291)).toEqual([219, 63, 83]);
    expect(workedDays(CALENDAR.latin, 1291)).toBe(250.5);
  });
  it('keep the Sundays and the feasts of the Greek church on the days of the Julian calendar', () => {
    expect(kind(CALENDAR.orthodox, 4, 23)).toBe(DAY.rest); // the Monday after Easter, and St George
    expect(kind(CALENDAR.orthodox, 6, 11)).toBe(DAY.rest); // the Monday after Pentecost
    expect(kind(CALENDAR.orthodox, 8, 6)).toBe(DAY.rest); // the Transfiguration
    expect(kind(CALENDAR.orthodox, 1, 13)).toBe(DAY.work); // no half days
    expect(counts(CALENDAR.orthodox, 1291)).toEqual([292, 0, 73]);
  });
  it('keep the day of each of the two festivals of Islam, and Fridays as working days', () => {
    // 1291: Ramadan 690 ended on 26 September; 1 Shawwāl was 27 September, 10 Dhū l-Ḥijja 4 December
    expect(kind(CALENDAR.muslim, 9, 27)).toBe(DAY.rest);
    expect(kind(CALENDAR.muslim, 12, 4)).toBe(DAY.rest);
    expect(kind(CALENDAR.muslim, 1, 5)).toBe(DAY.work); // a Friday
    expect(counts(CALENDAR.muslim, 1291)).toEqual([363, 0, 2]);
  });
  it('keep the Sabbath and the seven days of Leviticus 23 by the fixed Hebrew calendar', () => {
    // AM 5051–5052: 15 Nisan 17 March (a Sabbath), 21 Nisan 23 March, Shavuot 6 May, Rosh Hashanah 27 August, Yom
    // Kippur 5 September, Sukkot 10 September, Shemini Atzeret 17 September
    for (const [m, d] of [
      [3, 17],
      [3, 23],
      [5, 6],
      [8, 27],
      [9, 5],
      [9, 10],
      [9, 17],
    ])
      expect(kind(CALENDAR.jewish, m, d)).toBe(DAY.rest);
    expect(kind(CALENDAR.jewish, 1, 6)).toBe(DAY.rest); // a Saturday
    expect(kind(CALENDAR.jewish, 1, 7)).toBe(DAY.work); // a Sunday
    expect(counts(CALENDAR.jewish, 1291)).toEqual([307, 0, 58]);
  });
  it('rest on Sundays only in the other churches, and never in the other faiths', () => {
    expect(counts(CALENDAR.sunday, 1291)).toEqual([313, 0, 52]);
    expect(counts(CALENDAR.none, 1291)).toEqual([365, 0, 0]);
  });
  it('give every year a few days of work and as many kinds as days, the same every time', () => {
    for (let c = 0; c < 6; c++) {
      for (const y of [1291, 1292, 1583, 1700, 1800]) {
        const k = yearKinds(c, y),
          worked = workedDays(c, y);
        expect(k.length).toBe(yearDays(y));
        expect(worked).toBeGreaterThan(0.6 * k.length);
        expect(worked).toBe(Array.from(k, (x) => WORKED[x]).reduce((a, b) => a + b, 0));
        expect(yearKinds(c, y)).toBe(k);
      }
    }
  });
});
