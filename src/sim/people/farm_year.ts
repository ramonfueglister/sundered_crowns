// The work of the farming year by the date (people feature 12, the day plan): what a person who works in agriculture
// does on a working day. The dates are days of the Julian calendar, which the world keeps (src/sim/calendar.ts). Which
// year a place follows goes by its land, not by the faith of its people (farmYears): the Muslim almanacs, too, set the
// field work by the months of the sun, as the calendar of Córdoba and Ibn Mammātī's Coptic months do (filaha.org,
// introduction), and the lunar year of the hijra goes round all seasons in some 33 years.
//
// The north, England's open fields, after the husbandry treatises of the 13th century and the manor accounts:
// - Walter of Henley, Husbandry (1270s; tr. Lamond 1890): "April is a good time for fallowing", the second fallowing
//   "after St John's Day" (24 June), weeding after St John's Day, the seed changed at Michaelmas (29 September).
// - Robert Grosseteste, Rules (c. 1240–1242): oats are not threshed before Christmas; the corn was threshed through
//   the winter.
// - Ramsey: the harvest took "five weeks in August and early September" (Owen, Brown & Skinner 2025, Journal of
//   British Studies 64, e92); the Statute of Labourers of 1351 pays reaping from the first week of August.
// - Hay in June, the spring corn and the dung in February and March, the winter corn in the autumn: the reading of
//   the treatises and of the labours of the months in the research of feature 7 (recherche/tagesplaner/ in the
//   project files, chapter 5, «Das Bauernjahr»).
//
// The Mediterranean, after the calendar of Córdoba of 961 (ʿArīb ibn Saʿd; English extracts by John Brogden after
// Dozy's edition of 1873, filaha.org, "Calendar of Córdoba"), which names months only:
// - January "the vines for grapes not meant for the table are pruned", February "the vine shoots transplanted";
// - March "Sugar cane is planted", April "henna, basil, cauliflower, rice and beans are sown";
// - May "farīk is gathered" (the green early wheat), June "the grain on the threshing floor is weighed";
// - July "grain is harvested and barley is threshed";
// - August "The gardens are planted with autumn beans, sky-blue stock, turnips, carrots, chards";
// - September "The fields are ploughed and sown in the mountains", November "sowing activities reach their peak";
// - December "White poppy is sown, and also garlic".
// The Italian cycles of the months set the field work "a month earlier" than England (the labours of the months, read
// only through a reference work, research of feature 7): reaping in July, a month after Córdoba.
//
// Mesopotamia, after the Handbook of Mesopotamia, vol. I (Naval Staff Intelligence Department, 1918, pp. 176–177;
// India Office Records IOR/L/MIL/17/15/41/2, Qatar Digital Library): the field work before the machines, not of the
// Middle Ages (no medieval calendar of Iraq could be read: Ibn Waḥshiyya's, ed. Fahd 1993–98, is not online). Wheat
// and barley are sown "Sep–Oct or Nov–end Jan", the spring crops October to March; "The harvest begins in April",
// mostly April and May; the corn is trodden out by buffaloes or cows after drying in the sun; the summer crops (rice,
// millet, sesame, cotton) are harvested August to October. Borsch (Mamluk Studies Review 4, 2000) takes the Nile
// basins of 15th-century Egypt from a 19th-century observer (Willcocks) the same way.
import { dayToDate } from '../calendar';
import { CLIMATE } from '../content/place_climate';

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
  /** pruning and setting the vines */
  prune: 7,
  /** planting and sowing in the gardens and the watered fields: sugar cane, cotton, rice, beans, turnips, garlic */
  garden: 8,
  /** threshing out of doors, on the threshing floor */
  floor: 9,
  /** harvesting the summer crops: rice, millet, sesame, cotton */
  summer: 10,
} as const;

/** The farming years a place can follow (farmYears). */
export const FARM_YEAR = { north: 0, mediterranean: 1, mesopotamia: 2 } as const;

/** From which date (month 1..12, day) each work is done, to the next; per farming year (FARM_YEAR). */
const YEARS: readonly (readonly [number, number, number][])[] = [
  [
    [1, 1, TASK.thresh],
    [2, 1, TASK.spring],
    [4, 1, TASK.fallow],
    [6, 1, TASK.hay],
    [6, 24, TASK.weed],
    [8, 1, TASK.harvest],
    [9, 5, TASK.winter],
    [12, 1, TASK.thresh],
  ],
  // OWN RULE: the calendar of Córdoba names months only, so each work begins on the first of its month; where a month
  // names the corn and other work, the corn's goes first (the farmers of the world are the workers of its agriculture,
  // whose harvest it reckons as corn), so the olive picking that "commences" in October gives way to the sowing
  [
    [1, 1, TASK.prune],
    [3, 1, TASK.garden],
    [5, 1, TASK.harvest],
    [7, 1, TASK.floor],
    [8, 1, TASK.garden],
    [9, 1, TASK.winter],
    [12, 1, TASK.garden],
  ],
  // OWN RULE: the handbook names no month for the threshing, only "after drying": the two months after the harvest;
  // the corn's sowing from September goes before the summer crops' harvest, as above
  [
    [1, 1, TASK.winter],
    [4, 1, TASK.harvest],
    [6, 1, TASK.floor],
    [8, 1, TASK.summer],
    [9, 1, TASK.winter],
  ],
];

/** The work of the farming year `year` (FARM_YEAR) on the world's day `day`. */
export function farmTask(day: number, startYear: number, year: number = FARM_YEAR.north): number {
  const { m, d } = dayToDate(day, startYear),
    at = (m + 1) * 100 + d,
    table = YEARS[year] ?? YEARS[FARM_YEAR.north];
  let task = table[table.length - 1][2];
  for (const [mm, dd, t] of table) if (mm * 100 + dd <= at) task = t;
  return task;
}

/** Whether the work is done at home, in the barn of the farmstead, rather than in the field. */
export const inBarn = (task: number): boolean => task === TASK.thresh;

/** The regions of the map round the Mediterranean (data/geo.json, the provinces' `region`): there a place of the
 *  Mediterranean climate (Köppen-Geiger Cs) follows the year of Córdoba. */
const AROUND = new Set(['iberia', 'france', 'italy', 'greece', 'balkans', 'anatolia', 'levant', 'maghreb']);
/** OWN RULE: in these regions the dry places (steppe, desert) follow it too: the Meseta and the Maghreb have the same
 *  winter rains and dry summers, and Toledo and Zaragoza lay in al-Andalus, whose calendar it is. */
const DRY_TOO = new Set(['iberia', 'maghreb', 'levant']);

/**
 * The farming year of every land place (FARM_YEAR): the year of Córdoba round the Mediterranean (above), the
 * handbook's in Mesopotamia, the north's everywhere else, also where no source with months could be read yet (Egypt,
 * Persia, the steppe, Arabia, the Sahel). `provinces`: the map's provinces with their places (counted from 0) and
 * region; `climate`: the climate of each land place (CLIMATE, src/sim/content/place_climate.ts).
 */
export function farmYears(
  provinces: readonly { locs: readonly number[]; region: string }[],
  climate: ArrayLike<number>,
): Uint8Array {
  const out = new Uint8Array(climate.length).fill(FARM_YEAR.north);
  for (const { locs, region } of provinces)
    for (const l of locs) if (l >= 0 && l < out.length) out[l] = farmYearOf(region, climate[l]);
  return out;
}

/** The farming year (FARM_YEAR) of land of the climate `climate` (CLIMATE) in the region `region` of the map (see
 *  `farmYears`); the fields of the world graphic follow it too (src/worldprobe/season_codes.ts). */
export function farmYearOf(region: string, climate: number): number {
  if (region === 'mesopotamia') return FARM_YEAR.mesopotamia;
  return AROUND.has(region) && (climate === CLIMATE.mediterranean || (climate === CLIMATE.dry && DRY_TOO.has(region)))
    ? FARM_YEAR.mediterranean
    : FARM_YEAR.north;
}
