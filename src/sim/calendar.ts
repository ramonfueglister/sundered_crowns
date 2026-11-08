// Calendar: day 0 = 1 January of the start year. Julian leap years before 1583, Gregorian after.
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export function isLeap(y: number) { return y < 1583 ? y % 4 === 0 : (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
export function yearDays(y: number) { return isLeap(y) ? 366 : 365; }
export interface DateParts { y: number; m: number; d: number } // m 0..11, d 1..31
const cache = new Map<number, number>(); // year -> first day index relative to 1300
function yearStart(y: number): number {
  let v = cache.get(y);
  if (v !== undefined) return v;
  let s = 0;
  for (let k = 1300; k < y; k++) s += yearDays(k);
  cache.set(y, s); return s;
}
export function dayToDate(day: number, startYear: number): DateParts {
  let abs = day + yearStart(startYear);
  let y = 1300 + Math.floor(abs / 365.25) - 1;
  while (yearStart(y + 1) <= abs) y++;
  while (yearStart(y) > abs) y--;
  let r = abs - yearStart(y);
  let m = 0;
  while (true) { const md = MDAYS[m] + (m === 1 && isLeap(y) ? 1 : 0); if (r < md) break; r -= md; m++; }
  return { y, m, d: r + 1 };
}
export function dateToDay(y: number, m: number, d: number, startYear: number): number {
  let abs = yearStart(y);
  for (let k = 0; k < m; k++) abs += MDAYS[k] + (k === 1 && isLeap(y) ? 1 : 0);
  return abs + d - 1 - yearStart(startYear);
}
export const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export function fmtDate(day: number, startYear: number, lang: 'en' | 'de' = 'en'): string {
  const p = dayToDate(day, startYear);
  return lang === 'de' ? `${p.d}. ${MONTHS_DE[p.m]} ${p.y}` : `${p.d} ${MONTHS_EN[p.m]} ${p.y}`;
}
/** season 0 winter,1 spring,2 summer,3 autumn by month (northern hemisphere) */
export function season(m: number) { return m === 11 || m <= 1 ? 0 : m <= 4 ? 1 : m <= 7 ? 2 : 3; }
