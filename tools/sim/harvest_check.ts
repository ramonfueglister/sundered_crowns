// "Model against history" for the grain harvest and the cultivated land (docs/ECONOMY_DESIGN.md, features 1 and 2).
// Prints Markdown tables: England through time, England on the map at the start, the regions of the map at the
// start, the arable of groups of regions against HYDE 3.2, of every region against the HYDE 3.2.1 grid, and some
// places.
// Nothing here feeds back into the model: the tables are the check, deviations stay as they are.
//   npx tsx tools/sim/harvest_check.ts [startYear]
import { harvestKcal, kcalPerHeadDay, farmers, ENGLAND_1300 } from '../../src/sim/systems/harvest';
import { hectares, landLimitHa, HECTARES_PER_ACRE } from '../../src/sim/systems/cultivation';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { newWorldState, loadLand } from './load';
import { englandAt } from './calibration';

/** Broadberry et al. (2010): decade and people in millions (table 19), total arable in million acres (table 1; the
 *  years 1270, 1300, 1380, 1420, 1450, 1600, 1700), kcal per head and day from arable farming, net (table 19). */
const ENGLAND: [string, number, number | null, number][] = [
  ['1270/79', 4.4, 11.52, 1415],
  ['1300/09', 4.72, 11.52, 1242],
  ['1310/19', 4.63, null, 1199],
  ['1380/89', 2.36, 8.73, 1801],
  ['1420/29', 2.03, 7.76, 1468],
  ['1450/59', 1.93, 7.64, 1512],
  ['1600/09', 4.27, 8.87, 1664],
  ['1691/1700', 5.14, 9.7, 1678],
];
/** Klein Goldewijk et al. (2017), HYDE 3.2, table 2: cropland in 1400 CE, million hectares. The paper does not say
 *  which countries belong to which region; the regions of the map are assigned here. */
const HYDE: [string, number | null, string[]][] = [
  [
    'Europe (without the former Soviet Union)',
    50.2,
    [
      'france',
      'germany',
      'italy',
      'iberia',
      'british_isles',
      'low_countries',
      'scandinavia',
      'balkans',
      'hungary',
      'greece',
      'bohemia',
      'poland',
      'atlantic_islands',
    ],
  ],
  ['North Africa and Middle East', 18.0, ['maghreb', 'egypt', 'levant', 'mesopotamia', 'arabia', 'persia', 'anatolia']],
  ['Tropical Africa', 27.1, ['west_africa', 'east_africa', 'sahel']],
  ['Americas (North 1.1 + Latin 19.5)', 20.6, ['americas']],
  [
    'Former Soviet Union (the map covers its west only; HYDE: 12.0 for all of it)',
    null,
    ['rus', 'baltic', 'steppe', 'caucasus'],
  ],
];
/** Cropland (km²) and people of the HYDE 3.2.1 grid summed over the regions of the map, written by
 *  tools/geo/check_hyde.py where the grids could be downloaded (file names, sizes and checksums are in the file). */
interface HydeGrid {
  dataset: string;
  cropland_km2: Record<string, Record<string, number>>;
  people: Record<string, Record<string, number>>;
}
const GRID: HydeGrid = JSON.parse(
  readFileSync(fileURLToPath(new URL('../geo/data/hyde/hyde_regions.json', import.meta.url)), 'utf8'),
);
const GRID_YEARS = ['1300', '1400'];
const PLACES = ['Kraków', 'Moscow', 'Norwich', 'Novgorod', 'London', 'Ghent', 'Florence', 'Paris', 'Cairo'];

const year = Number(process.argv[2] ?? 1356);
const { s, w } = newWorldState(year, year);
const land = loadLand();
const pop = s.place.pop;
const dev = (model: number, history: number) =>
  `${model >= history ? '+' : ''}${(100 * (model / history - 1)).toFixed(0)} %`;
const int = (v: number) => Math.round(v).toLocaleString('en-GB');
const m2 = (v: number) => (v / 1e6).toFixed(2);

console.log(`\n### England through time (the people of every English place of ${year} scaled alike)\n`);
console.log(
  '| Decade | People (m) | Arable, history (m acres) | Arable, model | Deviation | Places at the land limit | Harvest, history (kcal per head and day) | All land (feature 1) | Deviation | Model | Deviation |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const [decade, people, acres, history] of ENGLAND) {
  const e = englandAt(w, land.england.places, pop, people * 1e6);
  const before = kcalPerHeadDay(harvestKcal(1, farmers(people * 1e6), 1), people * 1e6); // England as one piece, all of its land
  const cal = (calibrated: boolean, text: string) => (calibrated ? 'calibrated' : text);
  const is1300 = people * 1e6 === ENGLAND_1300.people,
    is1380 = decade === '1380/89';
  console.log(
    `| ${decade} | ${people.toFixed(2)} | ${acres === null ? '' : acres.toFixed(2)} | ${m2(e.arableAcres)} | ${acres === null ? '' : cal(is1300 || is1380, dev(e.arableAcres / 1e6, acres))} | ${e.atLimit} | ${int(history)} | ${int(before)} | ${cal(is1300, dev(before, history))} | ${int(e.perHeadDay)} | ${cal(is1300, dev(e.perHeadDay, history))} |`,
  );
}

/** People, land, arable and harvest of a set of places with the people of the start. */
function sum(places: Iterable<number>) {
  let people = 0,
    km2 = 0,
    arable = 0,
    kcal = 0,
    before = 0,
    atLimit = 0,
    peopleAtLimit = 0,
    n = 0;
  for (const i of places) {
    n++;
    people += pop[i];
    km2 += w.area[i];
    arable += s.place.arable[i];
    kcal += s.place.harvest[i];
    before += harvestKcal((w.landYield[i] || 0) * hectares(w, i), farmers(pop[i]), land.england.land); // feature 1: all land, England as one piece
    if (pop[i] > 0 && w.arablePerHead * pop[i] > landLimitHa(w, i)) {
      atLimit++;
      peopleAtLimit += pop[i];
    }
  }
  return {
    n,
    people,
    km2,
    arable,
    atLimit,
    peopleAtLimit,
    perHead: kcalPerHeadDay(kcal, people),
    before: kcalPerHeadDay(before, people),
  };
}

const e = sum(land.england.places);
console.log(`\n### England on the map at the start of ${year}\n`);
console.log(
  `- places inside the outline: ${e.n}, ${int(e.km2)} km²; people at the start: ${m2(e.people)} m (Broadberry et al. 2010, table 16: 2.60 m in 1351, 2.50 m in 1377)`,
);
console.log(
  `- arable: ${m2(e.arable / HECTARES_PER_ACRE)} m acres, ${(e.arable / e.km2).toFixed(1)} % of the land; ${e.atLimit} of ${e.n} places at the land limit (table 1: 8.73 m acres in 1380)`,
);
console.log(
  `- harvest per head and day: ${int(e.perHead)} kcal; with all land (feature 1) ${int(e.before)} kcal (table 19: 1,801 kcal in 1380/89)`,
);

const byRegion = new Map<string, number[]>();
for (const p of w.provinces) byRegion.set(p.region, [...(byRegion.get(p.region) ?? []), ...p.locs]);
console.log(`\n### Regions of the map at the start of ${year}\n`);
console.log(
  '| Region | People (m) | Arable (m ha) | Share of the land | ha per head | People at the land limit | kcal per head and day: all land (feature 1) | Model |',
);
console.log('|---|---|---|---|---|---|---|---|');
const row = (name: string, r: ReturnType<typeof sum>) =>
  `| ${name} | ${m2(r.people)} | ${m2(r.arable)} | ${(r.arable / r.km2).toFixed(1)} % | ${(r.arable / r.people).toFixed(2)} | ${((100 * r.peopleAtLimit) / r.people).toFixed(0)} % | ${int(r.before)} | ${int(r.perHead)} |`;
const rows = [...byRegion]
  .map(([region, places]) => ({ region, r: sum(places) }))
  .sort((x, y) => y.r.people - x.r.people);
for (const { region, r } of rows) console.log(row(region, r));
const everywhere = Array.from({ length: w.L }, (_, i) => i);
const all = sum(everywhere);
console.log(row('**whole map**', all));
let noHarvest = 0,
  peopled = 0;
for (const i of everywhere)
  if (pop[i] > 0) {
    peopled++;
    if (!(s.place.harvest[i] > 0)) noHarvest++;
  }
console.log(
  `\nplaces at the land limit: ${all.atLimit} of ${w.L}; places with people: ${peopled}, of which without a harvest: ${noHarvest}`,
);

console.log(
  '\n### Arable against HYDE 3.2 (Klein Goldewijk et al. 2017, table 2, cropland in 1400 CE, million hectares)\n',
);
console.log(
  `| Group of regions | People ${year} (m) | Model ${year} | HYDE 3.2, 1400 | Model / HYDE | HYDE 3.2.1 grid on the map, 1400 |`,
);
console.log('|---|---|---|---|---|---|');
for (const [name, hyde, regions] of HYDE) {
  const r = sum(regions.flatMap((g) => byRegion.get(g) ?? []));
  const grid = regions.reduce((a, g) => a + GRID.cropland_km2['1400'][g], 0) / 1e4;
  console.log(
    `| ${name} | ${m2(r.people)} | ${(r.arable / 1e6).toFixed(1)} | ${hyde === null ? '' : hyde.toFixed(1)} | ${hyde === null ? 'not comparable' : (r.arable / 1e6 / hyde).toFixed(2)} | ${grid.toFixed(1)} |`,
  );
}

console.log(`\n### Arable of every region against the grid of ${GRID.dataset}\n`);
console.log(
  'Cropland and people of the grid summed over the land of each region of the map (tools/geo/check_hyde.py). Arable in million hectares, people in millions.\n',
);
console.log(
  `| Region | People, map ${year} | People, HYDE 1300 | HYDE 1400 | Arable, model ${year} | HYDE 1300 | HYDE 1400 | Model / HYDE 1300 | Model / HYDE 1400 | ha per head, model | HYDE 1300 | HYDE 1400 |`,
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
const gridRow = (name: string, key: string, r: ReturnType<typeof sum>) => {
  const ha = GRID_YEARS.map((y) => GRID.cropland_km2[y][key] * 100),
    people = GRID_YEARS.map((y) => GRID.people[y][key]);
  return `| ${name} | ${m2(r.people)} | ${m2(people[0])} | ${m2(people[1])} | ${m2(r.arable)} | ${m2(ha[0])} | ${m2(ha[1])} | ${(r.arable / ha[0]).toFixed(2)} | ${(r.arable / ha[1]).toFixed(2)} | ${(r.arable / r.people).toFixed(2)} | ${(ha[0] / people[0]).toFixed(2)} | ${(ha[1] / people[1]).toFixed(2)} |`;
};
for (const { region, r } of rows) console.log(gridRow(region, region, r));
console.log(gridRow('**whole map**', 'whole_map', all));
console.log(gridRow('England (162 places)', 'england_places', e));
const acres = (y: string) => m2((GRID.cropland_km2[y].england_places * 100) / HECTARES_PER_ACRE);
console.log(
  `\nEngland in the grid: ${acres('1300')} m acres in 1300 and ${acres('1400')} m acres in 1400; Broadberry et al. 2010, table 1: 11.52 m acres in 1300, 8.73 m in 1380, 7.76 m in 1420.`,
);

console.log(`\n### Places at the start of ${year}\n`);
console.log('| Place | People | Arable (ha) | Share of the land | ha per head | kcal per head and day | |');
console.log('|---|---|---|---|---|---|---|');
for (const name of PLACES) {
  const i = w.names.indexOf(name);
  if (i < 0 || i >= w.L) continue;
  const x = s.place.arable[i],
    limit = w.arablePerHead * pop[i] > landLimitHa(w, i);
  console.log(
    `| ${name} | ${int(pop[i])} | ${int(x)} | ${((100 * x) / hectares(w, i)).toFixed(1)} % | ${(x / pop[i]).toFixed(2)} | ${int(kcalPerHeadDay(s.place.harvest[i], pop[i]))} | ${x > 0 ? (limit ? 'land limit' : 'land to spare') : 'no land with a yield'} |`,
  );
}
