// The work of the farming year by the date (people feature 12, the day plan): what a person who works in agriculture
// does on a working day, after the husbandry treatises of the 13th century and the manor accounts. The dates are those
// of the sources, days of the Julian calendar, which the world keeps (src/sim/calendar.ts). England's open fields;
// the Italian cycles of the months set the field work "a month earlier" (the labours of the months, read only through
// a reference work, research of feature 7), which is not in the table.
//
// - Walter of Henley, Husbandry (1270s; tr. Lamond 1890): "April is a good time for fallowing", the second fallowing
//   "after St John's Day" (24 June), weeding after St John's Day, the seed changed at Michaelmas (29 September).
// - Robert Grosseteste, Rules (c. 1240–1242): oats are not threshed before Christmas; the corn was threshed through
//   the winter.
// - Ramsey: the harvest took "five weeks in August and early September" (Owen, Brown & Skinner 2025, Journal of
//   British Studies 64, e92); the Statute of Labourers of 1351 pays reaping from the first week of August.
// - Hay in June, the spring corn and the dung in February and March, the winter corn in the autumn: the reading of
//   the treatises and of the labours of the months in the research of feature 7 (recherche/tagesplaner/ in the
//   project files, chapter 5, «Das Bauernjahr»).
import { dayToDate } from '../calendar';

/** The works of the farming year. */
export const TASK = {
  /** threshing in the barn, through the winter */
  thresh: 0,
  /** the spring corn and carting the dung */
  spring: 1,
  /** ploughing the fallow */
  fallow: 2,
  /** making hay */
  hay: 3,
  /** weeding and the second ploughing of the fallow */
  weed: 4,
  /** reaping and carting the harvest */
  harvest: 5,
  /** ploughing and sowing the winter corn */
  winter: 6,
} as const;

/** From which date (month 1..12, day) each work is done, to the next. */
const YEAR: readonly [number, number, number][] = [
  [1, 1, TASK.thresh],
  [2, 1, TASK.spring],
  [4, 1, TASK.fallow],
  [6, 1, TASK.hay],
  [6, 24, TASK.weed],
  [8, 1, TASK.harvest],
  [9, 5, TASK.winter],
  [12, 1, TASK.thresh],
];

/** The work of the farming year on the world's day `day`. */
export function farmTask(day: number, startYear: number): number {
  const { m, d } = dayToDate(day, startYear),
    at = (m + 1) * 100 + d;
  let task: number = TASK.thresh;
  for (const [mm, dd, t] of YEAR) if (mm * 100 + dd <= at) task = t;
  return task;
}

/** Whether the work is done at home, in the barn of the farmstead, rather than in the field. */
export const inBarn = (task: number): boolean => task === TASK.thresh;
