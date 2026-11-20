// The days a person is away from work (people feature 9, step 4 of the day plan): sickness and childbed. Both are a
// pure function of the person and the date, as the calendars of the faiths are (src/sim/holy_days.ts): nothing of
// them is saved, the same person always has the same days.
//
// Sickness follows the sick club of Morcott, Rutland, 1725 to 1799 (men; Riley & Alter 1996, "The sick and the well:
// adult health in Britain during the health transition", Health Transition Review, supplement 6, 19–44, tables 2 and
// 3), the oldest source read that counts the sicknesses of a person in a year. The manor accounts of Ramsey in the
// 14th century give lengths of the same size ("three or four weeks" most often, Owen, Brown & Skinner 2025, Journal of
// British Studies 64) but no frequency. A person of 15 or more falls sick at the club's rate of new episodes for the
// age, while well; the episode lasts the club's mean length for the age at its onset, drawn from an exponential above
// the three days from which the club paid (p. 20). The exponential is an assumption: the source gives only the mean.
// The same table holds for women (the women's club of Ashborne, in the same paper, had three to four times the sick
// time, and whether its sickness holds lying-in is not said).
//
// Childbed is the month of lying-in (Astbury 2017, "Being Well, Looking Ill: Childbirth and the Return to Health in
// Seventeenth-Century England", Social History of Medicine 30(3), 500–519): a mother is away for 30 days from the day
// of the birth, whatever her faith. The periods of the faiths (Leviticus 12, the nifās of Islam) rule purity, prayer
// and fasting, and no source read says they kept a woman from work.
import { hash01 } from '../rng';

const DAYS_PER_YEAR = 365.25;

/** Riley & Alter 1996, Morcott 1725–1799, by five-year group of age from 20–24 to 75+: the new sickness events in
 *  five years of survival (table 2, "net incidence"), the sick time as a fraction of the five years (table 2), and the
 *  mean length in days of an episode by the age at its onset (table 3). */
export const MORCOTT = {
  events: [0.77, 1.33, 0.96, 1.31, 0.97, 1.16, 1.5, 1.43, 1.9, 2.22, 2.77, 3.74],
  sick: [0.0025, 0.0172, 0.0146, 0.0201, 0.0176, 0.0158, 0.0312, 0.0357, 0.0745, 0.1514, 0.2459, 0.5391],
  length: [6.0, 23.36, 27.56, 33.71, 27.32, 24.81, 44.82, 71.36, 134.2, 148.58, 140.96, 508.77],
} as const;
/** The age the table starts at; the persons of 15 to 19 fall sick as those of 20 to 24 (the table has no younger). */
const TABLE_FROM = 20;
/** From this age a person falls sick (and may hold a part in the economy, src/sim/systems/work.ts). */
export const SICK_FROM = 15;
/** The shortest episode: the club paid for bouts of at least three days (Riley & Alter 1996, p. 20). */
export const SHORTEST = 3;
/** Days of childbed from the day of the birth: the month of lying-in (Astbury 2017). */
export const CHILDBED_DAYS = 30;

/** The group of the table for an age in years. */
export function ageGroup(age: number): number {
  return Math.min(MORCOTT.events.length - 1, Math.max(0, Math.floor((age - TABLE_FROM) / 5)));
}
/** The rate of new episodes a day of a person who is well, in group `g`: the club's events per year of survival over
 *  the share of the year the members were well, since a member who is sick cannot fall sick anew. */
const RATE = MORCOTT.events.map((e, g) => e / 5 / (1 - MORCOTT.sick[g]) / DAYS_PER_YEAR);

/** The person's own draws of sickness (a stream of its own, by the uid: people feature 7). */
const stream = (seed: number) => (seed ^ 0x7369636b) >>> 0; // "sick"

/** The episodes of sickness of the person with `uid`, born on the day `born`, that begin before the day `until`:
 *  pairs of the first and the last day, oldest first. Each begins after the one before has ended. */
export function sickness(seed: number, uid: number, born: number, until: number): number[] {
  const out: number[] = [], s = stream(seed);
  // the end of the group of the age at day t (the last group has none)
  const edge = (t: number) => {
    const g = ageGroup((t - born) / DAYS_PER_YEAR);
    return g === MORCOTT.events.length - 1 ? Infinity : born + (TABLE_FROM + 5 * (g + 1)) * DAYS_PER_YEAR;
  };
  let t = born + SICK_FROM * DAYS_PER_YEAR, k = 0;
  while (t < until) {
    // the onset: an exponential waiting time at the rate of the age, which changes at the edges of the groups
    let need = -Math.log(1 - hash01(s, uid, k++));
    for (;;) {
      const rate = RATE[ageGroup((t - born) / DAYS_PER_YEAR)], end = edge(t);
      if (t + need / rate <= end) { t += need / rate; break; }
      need -= (end - t) * rate; t = end;
    }
    if (t >= until) break;
    const first = Math.floor(t), mean = MORCOTT.length[ageGroup((first - born) / DAYS_PER_YEAR)];
    const days = SHORTEST + Math.round(-(mean - SHORTEST) * Math.log(1 - hash01(s, uid, k++)));
    out.push(first, first + days - 1);
    t = first + days;
  }
  return out;
}

/** The runs of days from `from` to `to` on which a person is away: the episodes of sickness and the childbeds that
 *  begin on the days in `births`, joined where they meet and cut to the days; pairs of the first and the last day. */
export function awayDays(sick: readonly number[], births: readonly number[], from: number, to: number): number[] {
  const runs: [number, number][] = [];
  for (let k = 0; k < sick.length; k += 2) if (sick[k + 1] >= from && sick[k] <= to) runs.push([sick[k], sick[k + 1]]);
  for (const b of births) if (b + CHILDBED_DAYS - 1 >= from && b <= to) runs.push([b, b + CHILDBED_DAYS - 1]);
  runs.sort((a, b) => a[0] - b[0]);
  const out: number[] = [];
  for (const [a, b] of runs) {
    const first = Math.max(a, from), last = Math.min(b, to);
    if (out.length && first <= out[out.length - 1] + 1) out[out.length - 1] = Math.max(out[out.length - 1], last);
    else out.push(first, last);
  }
  return out;
}
