// The days of rest of the faiths (docs/PEOPLE_DESIGN.md, feature 8: the calendar of the town): for every faith and
// every day of a year whether it is a working day, a half day or a day of rest. A pure function of the faith and the
// date: nothing of it is saved, the same year always gives the same days. The economy reads it for the firms of the
// cities (economy feature 19, src/sim/systems/economy.ts): a firm works on the working days of its owner's faith.
//
// What each calendar holds, and from where:
// - The Latin Church: the Sundays and the feasts of the canon law in force in 1291, Gratian's Decretum, De
//   consecratione D.3 c.1 ("Pronunciandum est, ut sciant tempora feriandi per annum"): Christmas, St Stephen, St John
//   the Evangelist, the Innocents, St Silvester, the octave of the Lord (1 January), the Epiphany, the Purification,
//   Easter with its whole week, the three Rogation days, the Ascension, Pentecost, the Nativity of St John the
//   Baptist, the twelve apostles, St Lawrence, the Assumption, the Nativity of Mary, St Michael, All Saints and St
//   Martin, on the days of the Roman calendar. The dedication of the church and the patron of the diocese, which the
//   canon leaves to the bishop, have no day here. The Sunday is kept "a uespera usque ad uesperam", and in the
//   cloth towns of Flanders and Artois work stopped at noon on Saturdays and on the eves of feasts (Stabel 2014,
//   TSEG 11(4), pp. 36–38: Douai weavers c. 1250, Arras shearers before 1236): Saturdays and eves are half days.
// - The Orthodox Church: the Sundays and the holy days of the Greek church as the Catholic Encyclopedia lists them
//   (Holweck, "Ecclesiastical Feasts", 1909), on the days of the Julian calendar; the Book of the Eparch (ch. XIII
//   §3) forbids selling on Sundays and feast days. A list of 1909: the constitution of Manuel Komnenos of 1166 had 66
//   whole and 27 half holy days besides the Sundays (same article), whose names were not found.
// - Islam: no weekly day of rest. Friday "is not at all a day of rest, but one of obligatory public worship, held at
//   noon" (Goitein 1959, The Muslim World 49, 183–195), trade stops for the prayer only. The day of each of the two
//   festivals, 1 Shawwāl and 10 Dhū l-Ḥijja, is a day of rest; how many days the festivals lasted was not found, nor
//   how much less was worked by day in Ramaḍān. Dates by the tabular calendar (civil epoch, 16 July 622), which may
//   differ by a day or two from the sighting of the moon.
// - Judaism: the Sabbath and the seven days of Leviticus 23 on which "ye shall do no manner of servile work"
//   (15 and 21 Nisan, the feast of weeks, 1, 10, 15 and 22 Tishri), by the fixed Hebrew calendar
//   (Dershowitz & Reingold, Calendrical Calculations). The second days of the diaspora are not counted.
// - The other churches (Coptic, Armenian, Syriac, of the East, Ethiopian, Bosnian, and the churches of the
//   Reformation): the Sundays only; their feasts were not read.
// - The other faiths: no day of rest is known here; every day is a working day.
//
// The world's calendar (src/sim/calendar.ts) is Julian before 1583 and has the Gregorian leap years after, without
// dropping ten days. The Latin feasts lie on the world's dates (Easter by the Gregorian computus from 1583); the
// Orthodox, Muslim and Jewish days on the day the sun and the moon give, through the Julian day number.
import { dateToDay, isLeap, yearDays } from './calendar';
import { FAITHS } from './content/peoples';

/** The kind of a day: work, half a day of work, rest. */
export const DAY = { work: 0, half: 1, rest: 2 } as const;
/** The share of a full day that is worked on a day of each kind. */
export const WORKED: readonly number[] = [1, 0.5, 0];
/** The calendars. */
export const CALENDAR = { latin: 0, orthodox: 1, sunday: 2, muslim: 3, jewish: 4, none: 5 } as const;
const CALENDARS = 6;

/** The calendar of a faith (an index of FAITHS). */
export function calendarOf(faith: number): number {
  return BY_FAITH[faith] ?? CALENDAR.none;
}
const BY_FAITH: number[] = FAITHS.map((f) =>
  f.id === 'latin'
    ? CALENDAR.latin
    : f.id === 'orthodox'
      ? CALENDAR.orthodox
      : f.family === 'christian'
        ? CALENDAR.sunday
        : f.family === 'muslim'
          ? CALENDAR.muslim
          : f.family === 'jewish'
            ? CALENDAR.jewish
            : CALENDAR.none,
);

// ---- day numbers

/** The Julian day number of a date of the Julian calendar (m 1..12). */
export function julianJdn(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12),
    yy = y + 4800 - a,
    mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - 32083;
}
const JDN_1300 = julianJdn(1300, 1, 1);
/** The Julian day number of the first of January of the world's year `y`. */
export const jdnOfYear = (y: number): number => JDN_1300 + dateToDay(y, 0, 1, 1300);
/** The day of the week of a Julian day number, 0 Sunday to 6 Saturday. */
export const weekday = (jdn: number): number => (((jdn + 1) % 7) + 7) % 7;

/** Easter Sunday of year `y` by the Julian computus, as month (1..12) and day of the Julian calendar (Meeus). */
export function easterJulian(y: number): [number, number] {
  const d = (19 * (y % 19) + 15) % 30,
    e = (2 * (y % 4) + 4 * (y % 7) - d + 34) % 7,
    n = d + e + 114;
  return [Math.floor(n / 31), (n % 31) + 1];
}
/** Easter Sunday of year `y` by the Gregorian computus, as month (1..12) and day (the anonymous algorithm, Meeus). */
export function easterGregorian(y: number): [number, number] {
  const a = y % 19,
    b = Math.floor(y / 100),
    c = y % 100,
    d = Math.floor(b / 4),
    e = b % 4;
  const f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return [Math.floor(n / 31), (n % 31) + 1];
}

/** The Julian day number of a date of the tabular Islamic calendar (m 1..12), civil epoch. */
export function islamicJdn(y: number, m: number, d: number): number {
  return d + Math.ceil(29.5 * (m - 1)) + (y - 1) * 354 + Math.floor((3 + 11 * y) / 30) + 1948440 - 1;
}

/** Days from the epoch of the Hebrew calendar to 1 Tishri of year `y`, before the two delays of the year length. */
function hebrewElapsed(y: number): number {
  const months = Math.floor((235 * y - 234) / 19),
    parts = 12084 + 13753 * months;
  const day = 29 * months + Math.floor(parts / 25920);
  return (3 * (day + 1)) % 7 < 3 ? day + 1 : day;
}
/** The Julian day number of 1 Tishri (Rosh Hashanah) of the Hebrew year `y`. */
export function roshHashanahJdn(y: number): number {
  const a = hebrewElapsed(y - 1),
    b = hebrewElapsed(y),
    c = hebrewElapsed(y + 1);
  const delay = c - b === 356 ? 2 : b - a === 382 ? 1 : 0;
  return 347998 + b + delay; // 347998: the Julian day number of 1 Tishri AM 1 (Dershowitz & Reingold: R.D. −1373427)
}

// ---- the days of a year

const FIXED_LATIN: readonly [number, number][] = [
  [12, 25],
  [12, 26],
  [12, 27],
  [12, 28],
  [12, 31],
  [1, 1],
  [1, 6],
  [2, 2],
  [6, 24],
  // the twelve apostles: Peter and Paul, Andrew, James, John (27 December, above), Philip and James, Bartholomew,
  // Thomas, Matthew, Simon and Jude, Matthias
  [6, 29],
  [11, 30],
  [7, 25],
  [5, 1],
  [8, 24],
  [12, 21],
  [9, 21],
  [10, 28],
  [2, 24],
  [8, 10],
  [8, 15],
  [9, 8],
  [9, 29],
  [11, 1],
  [11, 11],
];
/** Days after Easter Sunday: the week of Easter, the Rogation days, the Ascension, Pentecost. */
const MOVABLE_LATIN = [1, 2, 3, 4, 5, 6, 36, 37, 38, 39, 49];
const FIXED_ORTHODOX: readonly [number, number][] = [
  [9, 8],
  [9, 14],
  [10, 26],
  [11, 8],
  [11, 21],
  [12, 6],
  [12, 9],
  [12, 25],
  [12, 26],
  [12, 27],
  [1, 1],
  [1, 6],
  [1, 30],
  [2, 2],
  [3, 25],
  [4, 23],
  [6, 24],
  [6, 29],
  [7, 20],
  [8, 6],
  [8, 15],
  [8, 29],
];
/** The Monday after Easter, the Ascension, the Monday after Pentecost. */
const MOVABLE_ORTHODOX = [1, 39, 50];

const cache = new Map<number, Uint8Array>();

/** The kind of every day of the world's year `y` (index 0: 1 January) in a calendar. */
export function yearKinds(calendar: number, y: number): Uint8Array {
  const key = y * CALENDARS + calendar;
  let out = cache.get(key);
  if (out) return out;
  const n = yearDays(y),
    j0 = jdnOfYear(y);
  out = new Uint8Array(n);
  const rest = (doy: number) => {
    if (doy >= 0 && doy < n) out![doy] = DAY.rest;
  };
  const week = (wd: number, kind: number) => {
    for (let k = 0; k < n; k++) if (weekday(j0 + k) === wd) out![k] = kind;
  };
  if (calendar === CALENDAR.latin) {
    const feasts: number[] = [];
    for (const [m, d] of FIXED_LATIN) feasts.push(dateToDay(y, m - 1, m === 2 && d === 24 && isLeap(y) ? 25 : d, y));
    const [em, ed] = y < 1583 ? easterJulian(y) : easterGregorian(y),
      easter = dateToDay(y, em - 1, ed, y);
    for (const k of MOVABLE_LATIN) feasts.push(easter + k);
    week(6, DAY.half);
    for (const f of feasts) if (f - 1 >= 0 && f - 1 < n) out[f - 1] = DAY.half;
    week(0, DAY.rest);
    for (const f of feasts) rest(f);
  } else if (calendar === CALENDAR.orthodox) {
    week(0, DAY.rest);
    for (const jy of [y - 1, y, y + 1]) {
      for (const [m, d] of FIXED_ORTHODOX) rest(julianJdn(jy, m, d) - j0);
      const [em, ed] = easterJulian(jy),
        easter = julianJdn(jy, em, ed) - j0;
      for (const k of MOVABLE_ORTHODOX) rest(easter + k);
    }
  } else if (calendar === CALENDAR.sunday) {
    week(0, DAY.rest);
  } else if (calendar === CALENDAR.muslim) {
    const h = Math.floor(((y - 622) * 33) / 32);
    for (let hy = h - 1; hy <= h + 2; hy++) {
      rest(islamicJdn(hy, 10, 1) - j0);
      rest(islamicJdn(hy, 12, 10) - j0);
    }
  } else if (calendar === CALENDAR.jewish) {
    week(6, DAY.rest);
    for (const hy of [y + 3760, y + 3761]) {
      const tishri = roshHashanahJdn(hy) - j0,
        nisan15 = roshHashanahJdn(hy) - 163 - j0;
      for (const k of [0, 9, 14, 21]) rest(tishri + k);
      for (const k of [0, 6, 50]) rest(nisan15 + k);
    }
  }
  cache.set(key, out);
  return out;
}

const worked = new Map<number, number>();
/** The working days of a year in a calendar, a half day counting as half. */
export function workedDays(calendar: number, y: number): number {
  const key = y * CALENDARS + calendar;
  let n = worked.get(key);
  if (n === undefined) {
    n = 0;
    for (const k of yearKinds(calendar, y)) n += WORKED[k];
    worked.set(key, n);
  }
  return n;
}

/** The factor of the flows of a firm or household of a calendar on day `doy` (0: 1 January) of the world's year `y`
 *  (economy feature 19): the share of the day that is worked times the days of the year over its working days, so
 *  that the factors of a year sum to its days. */
export function dayFactor(calendar: number, y: number, doy: number): number {
  return (WORKED[yearKinds(calendar, y)[doy]] * yearDays(y)) / workedDays(calendar, y);
}
