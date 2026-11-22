// What a field shows on a day of the year (people feature 12, the fields by the season): ploughed earth, the young
// corn, the corn grown tall, turning from green to gold, ripe, then stubble; the vines bare, in leaf, with grapes.
// The pieces of the world carry each field's place in the rotation and its own number (settle.ts, crops.ts); the
// stage reads the world's day and takes from here what each field shows.
//
// Each field is ploughed and sown on a day of the sowing weeks of its farming year, and reaped on a day of the harvest
// weeks: the weeks of src/sim/people/farm_year.ts, which cites them (tests/field_season.test.ts holds the two to each
// other). Between sowing and reaping the corn goes by the phases of wheat in the benchmark season of the AHDB Wheat
// growth guide, counted back from the day the crop was harvest ripe (9 August): first node 120 days before ("Two months
// – from first node to flowering"), the ear out 64 days before (6 June), flowering 59 (11 June), the canopy
// senescing "rapidly from GS71, about nine days after flowering" 50 days before (20 June), all green lost at hard dough
// 11 days before (29 July). (AHDB, "Key development phases and growth stages in wheat" and "Ear formation, grain
// development and crop ripening in wheat", ahdb.org.uk knowledge library.) The harvest begins as the manor accounts of
// Norfolk have it: on 15 August of the Gregorian calendar in the mean of 1256–1431, about the 7th of the Julian, wheat
// first, "Later in the harvest season ... barley ... as well as oats" (Pribyl, Cornes & Pfister 2012, Climatic Change
// 113, Table 2 p. 402, p. 396).
//
// The fields go round their rotation year by year: of three courses the winter corn comes on last year's fallow, the
// spring corn on last year's winter corn, the fallow follows the spring corn; of two, corn and fallow take turns
// (Slicher van Bath 1963, as src/worldprobe/world.ts cites for the courses). The fields of the year the pieces are built
// for carry what they carry there (settle.ts `courseOf`).
import { dateToDay, dayToDate } from '../sim/calendar';
import { FARM_YEAR } from '../sim/people/farm_year';

/** What a lot carries in the year the pieces are built for (settle.ts: the winter corn, the vines, the fallow, the spring corn). */
export const CROP = { winter: 1, vine: 2, fallow: 3, spring: 4 } as const;

/** What the ground of a field shows. */
export const GROUND = {
  /** ploughed and harrowed earth */
  earth: 0,
  /** the soil under the standing corn */
  sown: 1,
  /** stubble and weeds, grazed: the fallow, and a field after its harvest */
  stubble: 2,
} as const;

/** A field of corn on a day. */
export interface FieldLook {
  /** the corn's height as a share of its full height; 0 where nothing stands */
  height: number;
  /** 0 green, 1 gold */
  ripe: number;
  /** what the ground shows (GROUND) */
  ground: number;
  /** the corn that stands or stood last (CROP.winter or CROP.spring): their full heights differ */
  crop: number;
}

/** A vineyard on a day. */
export interface VineLook {
  /** 0 bare stocks, 1 in full leaf */
  leaf: number;
  /** 1 while the grapes hang */
  grapes: number;
  /** how far the leaves have turned after the vintage, 0 … 1 */
  turned: number;
}

/** OWN RULE: the corn comes up two weeks after it is sown; the AHDB pages give no date for emergence. */
const EMERGES = 14;
/** OWN RULE: the young corn stands at a sixth of its full height until it shoots; no height for it was found. */
export const YOUNG = 1 / 6;
/** the phases of wheat, days before the harvest (AHDB benchmark season, above) */
const SHOOTS = 120,
  FLOWERS = 59,
  TURNS = 50,
  GOLD = 11;
/** OWN RULE: a ploughed fallow shows its earth for four weeks before the weeds come up again; the treatises plough the
 *  fallow to kill the weeds that grew between the ploughings (Walter of Henley), and say no more. */
const EARTH_SHOWS = 28;

/** Weeks of the year: from month (1 … 12) and day, so many days. */
type Weeks = readonly [number, number, number];
/** The corn of a farming year: when it is sown (in the year before the harvest when `before`) and reaped. */
interface Corn {
  before: boolean;
  sow: Weeks;
  reap: Weeks;
}
interface Year {
  winter: Corn;
  spring: Corn;
  /** the weeks in which the fallow is ploughed, besides the sowing */
  fallow: readonly Weeks[];
  /** the vines: in leaf from, the grapes hang from, the vintage */
  leaf: readonly [number, number];
  grapes: readonly [number, number];
  vintage: readonly [number, number];
}

// The north, farm_year.ts: the winter corn sown from 5 September to the end of November, the spring corn in February
// and March, the fallow ploughed in April and May and again from St John's Day (24 June) through July; the harvest five
// weeks from 1 August.
// OWN RULE: Pribyl et al. give the order of the crops, not their days: the winter corn is reaped in the first 17 days of
// the harvest weeks, the spring corn in the last 18.
// The vines: the vintage of Burgundy fell 21.8 days after 1 September in the mean of 1370–1420, between 31 August and
// 10 October (Chuine et al. 2004, Nature 432, the series at NOAA, paleo/historical/france/burgundy2004.txt).
// OWN RULE: no date of the budburst could be read (Cuccia et al. 2014, OENO One 48, observed only the véraison): the
// vines leaf from 1 April; the grapes show from 1 August.
const VINES_NORTH = { leaf: [4, 1], grapes: [8, 1], vintage: [9, 22] } as const;
// The Mediterranean, the calendar of Córdoba: "sowing activities reach their peak" in November, the grain reaped in May
// and June; the vines pruned in January, "first grapes" in June, "grapes ripen" in July.
// OWN RULE: the calendar names no month of the vintage: mid August, after the grapes "ripen" in July; and no spring corn:
// the fields of a third course where the Mediterranean year is kept on dry land are sown in the later half of the
// sowing weeks and reaped in the later half of the harvest.
const VINES_SOUTH = { leaf: [4, 1], grapes: [6, 1], vintage: [8, 15] } as const;
const NORTH: Year = {
  winter: { before: true, sow: [9, 5, 87], reap: [8, 1, 17] },
  spring: { before: false, sow: [2, 1, 59], reap: [8, 18, 18] },
  fallow: [
    [4, 1, 61],
    [6, 24, 38],
  ],
  ...VINES_NORTH,
};
const MEDITERRANEAN: Year = {
  winter: { before: true, sow: [9, 1, 91], reap: [5, 1, 61] },
  spring: { before: true, sow: [10, 16, 46], reap: [6, 1, 30] },
  // OWN RULE: the calendar of Córdoba names the ploughing only with the sowing in September: the fallow is grazed until then
  fallow: [],
  ...VINES_SOUTH,
};
// Mesopotamia, the Handbook of Mesopotamia (1918, pp. 176–177): wheat and barley sown "Sep–Oct or Nov–end Jan", "The
// harvest begins in April", mostly April and May. The spring corn and the vines as round the Mediterranean (OWN RULE).
const MESOPOTAMIA: Year = {
  winter: { before: true, sow: [9, 1, 153], reap: [4, 1, 61] },
  spring: { before: true, sow: [11, 16, 77], reap: [5, 1, 31] },
  fallow: [],
  ...VINES_SOUTH,
};

/** The farming years by their numbers (FARM_YEAR). */
const YEARS: readonly Year[] = [NORTH, MEDITERRANEAN, MESOPOTAMIA];
/** The farming year `year` (FARM_YEAR), the north's for an unknown one. */
const yearOf = (year: number): Year => YEARS[year] ?? YEARS[FARM_YEAR.north];

/** The course a field carries in `year`, whose course in the year `base` the pieces are built for was `first` (CROP),
 *  of `courses` (settle.ts `courseOf`). */
export function courseIn(first: number, courses: number, year: number, base: number): number {
  if (first === CROP.vine || courses < 2) return first;
  // the courses in the order a field goes through them, from the fallow (settle.ts: the lots with the lowest numbers)
  const order = courses >= 3 ? [CROP.fallow, CROP.spring, CROP.winter] : [CROP.fallow, CROP.winter],
    at = order.indexOf(first as 1 | 3 | 4);
  if (at < 0) return first;
  const n = order.length;
  return order[(((at - (year - base)) % n) + n) % n];
}

/** The day of the world a field's work falls on in the weeks `w` of `year`, by the field's own number `u` (0 … 1).
 *  OWN RULE: the fields of a place are spread evenly over the weeks; the sources give weeks, and no village reaped all
 *  its fields on one day (Ramsey: "five weeks in August and early September", farm_year.ts). */
const dayIn = (w: Weeks, year: number, u: number, startYear: number) =>
  dateToDay(year, w[0] - 1, w[1], startYear) + Math.floor(u * w[2]);

/** The day the corn of the harvest of `year` is sown and the day it is reaped. */
function cycle(corn: Corn, year: number, u: number, startYear: number): [number, number] {
  return [dayIn(corn.sow, corn.before ? year - 1 : year, u, startYear), dayIn(corn.reap, year, u, startYear)];
}

/** The corn sown on `sown` and reaped on `reaped`, on the day `day` between them. */
function growing(day: number, sown: number, reaped: number, crop: number): FieldLook {
  const up = sown + EMERGES;
  if (day < up) return { height: 0, ripe: 0, ground: GROUND.earth, crop };
  // OWN RULE: where the corn is sown less than SHOOTS days before the harvest (late sowing, Mesopotamia), its phases
  // are pressed into the time it has, in the same proportions
  const k = Math.min(1, (reaped - up) / SHOOTS),
    shoots = reaped - SHOOTS * k,
    flowers = reaped - FLOWERS * k,
    turns = reaped - TURNS * k,
    gold = reaped - GOLD * k;
  const height =
    day < shoots ? YOUNG : day >= flowers ? 1 : YOUNG + ((1 - YOUNG) * (day - shoots)) / (flowers - shoots);
  const ripe = day < turns ? 0 : day >= gold ? 1 : (day - turns) / (gold - turns);
  return { height, ripe, ground: GROUND.sown, crop };
}

const stubble = (crop: number): FieldLook => ({ height: 0, ripe: 1, ground: GROUND.stubble, crop });

/**
 * What a field of corn or fallow shows on the world's day `day` (the world begun on 1 January `startYear`): its
 * farming year `farmYear` (FARM_YEAR), its course `first` (CROP) in the year `base` the pieces are built for, of
 * `courses`, and its own number `u` (0 … 1) that spreads the fields over the weeks of their work.
 */
export function fieldLook(
  day: number,
  startYear: number,
  farmYear: number,
  first: number,
  courses: number,
  base: number,
  u: number,
): FieldLook {
  const y = yearOf(farmYear),
    year = dayToDate(day, startYear).y,
    cornOf = (c: number) => (c === CROP.winter ? y.winter : c === CROP.spring ? y.spring : null),
    /** the corn that stood last before `yr`: what the stubble is of */
    lastCorn = (yr: number) => {
      const c = courseIn(first, courses, yr - 1, base);
      return cornOf(c) ? c : CROP.winter;
    };
  // the corn of next year's harvest, sown in the autumn of this year
  const next = courseIn(first, courses, year + 1, base),
    nextCorn = cornOf(next);
  if (nextCorn?.before) {
    const [sown, reaped] = cycle(nextCorn, year + 1, u, startYear);
    if (day >= sown) return growing(day, sown, reaped, next);
  }
  const now = courseIn(first, courses, year, base),
    corn = cornOf(now);
  if (corn) {
    const [sown, reaped] = cycle(corn, year, u, startYear);
    if (day >= sown && day < reaped) return growing(day, sown, reaped, now);
    if (day >= reaped) return stubble(now);
  } else
    for (const w of y.fallow) {
      const ploughed = dayIn(w, year, u, startYear);
      if (day >= ploughed && day < ploughed + EARTH_SHOWS)
        return { height: 0, ripe: 1, ground: GROUND.earth, crop: lastCorn(year) };
    }
  // before this year's sowing, or the fallow: the stubble of the last harvest, grazed
  return stubble(lastCorn(year));
}

/** What a vineyard of the farming year `farmYear` shows on the world's day `day`. */
export function vineLook(day: number, startYear: number, farmYear: number): VineLook {
  const y = yearOf(farmYear),
    year = dayToDate(day, startYear).y,
    at = (md: readonly [number, number]) => dateToDay(year, md[0] - 1, md[1], startYear),
    leafs = at(y.leaf),
    vintage = at(y.vintage);
  // OWN RULE: the leaves come out over a month, and turn and fall over the month after the vintage
  const month = 30;
  if (day < leafs || day >= vintage + month) return { leaf: 0, grapes: 0, turned: 0 };
  if (day >= vintage) return { leaf: 1 - (day - vintage) / month, grapes: 0, turned: (day - vintage) / month };
  return { leaf: Math.min(1, (day - leafs) / month), grapes: day >= at(y.grapes) ? 1 : 0, turned: 0 };
}
