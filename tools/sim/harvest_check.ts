// "Model against history" for the grain harvest (docs/ECONOMY_DESIGN.md, feature 1). Prints three Markdown tables:
// England through time, England on the map at the start, and the regions of the map at the start.
// Nothing here feeds back into the model: the tables are the check, deviations stay as they are.
//   npx tsx tools/sim/harvest_check.ts [startYear]
import { harvestKcal, kcalPerHeadDay, farmers, hectares, LAND_SHARE, ENGLAND_1300 } from '../../src/sim/systems/harvest';
import { newWorldState, loadLand } from './load';

/** Broadberry et al. (2010), table 19: decade, people (millions), kcal per head and day from arable farming (net). */
const ENGLAND: [string, number, number][] = [
  ['1270/79', 4.40, 1415], ['1300/09', 4.72, 1242], ['1310/19', 4.63, 1199], ['1380/89', 2.36, 1801],
  ['1420/29', 2.03, 1468], ['1450/59', 1.93, 1512], ['1600/09', 4.27, 1664], ['1691/1700', 5.14, 1678],
];
/** The older calibration of α, shown beside the estimate in use: Voigtländer and Voth (2013), table 1. */
const LAND_SHARE_VV = 0.4;

const year = Number(process.argv[2] ?? 1356);
const { s, w } = newWorldState(year, year);
const land = loadLand();
const pct = (model: number, history: number) => `${model >= history ? '+' : ''}${(100 * (model / history - 1)).toFixed(0)} %`;
const int = (v: number) => Math.round(v).toLocaleString('en-GB');

console.log(`\n### England through time (the model with England as one piece of land)\n`);
console.log(`| Decade | People (m) | History, kcal per head and day | Model α = ${LAND_SHARE} | Deviation | Model α = ${LAND_SHARE_VV} | Deviation |`);
console.log('|---|---|---|---|---|---|---|');
for (const [decade, people, history] of ENGLAND) {
  const m = (a: number) => kcalPerHeadDay(harvestKcal(1, w.landEngland, farmers(people * 1e6), w.landEngland, a), people * 1e6);
  const calibrated = people * 1e6 === ENGLAND_1300.people ? ' (calibrated)' : '';
  console.log(`| ${decade}${calibrated} | ${people.toFixed(2)} | ${int(history)} | ${int(m(LAND_SHARE))} | ${pct(m(LAND_SHARE), history)} | ${int(m(LAND_SHARE_VV))} | ${pct(m(LAND_SHARE_VV), history)} |`);
}

/** People, land and harvest of a set of places with the people of the start. */
function sum(places: Iterable<number>, a: number) {
  let people = 0, km2 = 0, ax = 0, kcal = 0;
  for (const i of places) {
    people += s.place.pop[i]; km2 += w.area[i]; ax += (w.landYield[i] || 0) * hectares(w, i);
    kcal += harvestKcal(w.landYield[i], hectares(w, i), farmers(s.place.pop[i]), w.landEngland, a);
  }
  return { people, km2, yield: ax / (km2 * 100), perHead: kcalPerHeadDay(kcal, people) };
}

const e = sum(land.england.places, LAND_SHARE), eVV = sum(land.england.places, LAND_SHARE_VV);
console.log(`\n### England on the map at the start of ${year}\n`);
console.log(`- places inside the outline: ${land.england.places.length}, ${int(e.km2)} km²`);
console.log(`- people at the start: ${(e.people / 1e6).toFixed(2)} m (Broadberry et al. 2010, table 16: 2.60 m in 1351, 2.50 m in 1377)`);
console.log(`- harvest per head and day: ${int(e.perHead)} kcal with α = ${LAND_SHARE}, ${int(eVV.perHead)} kcal with α = ${LAND_SHARE_VV} (table 19: 1,801 kcal in 1380/89)`);

const byRegion = new Map<string, number[]>();
for (const p of w.provinces) byRegion.set(p.region, [...(byRegion.get(p.region) ?? []), ...p.locs]);
console.log(`\n### Regions of the map at the start of ${year}\n`);
console.log(`| Region | People (m) | Land (1000 km²) | People per km² | Mean yield of the soil | kcal per head and day, α = ${LAND_SHARE} | α = ${LAND_SHARE_VV} |`);
console.log('|---|---|---|---|---|---|---|');
const rows = [...byRegion].map(([region, places]) => ({ region, a: sum(places, LAND_SHARE), b: sum(places, LAND_SHARE_VV) })).sort((x, y) => y.a.people - x.a.people);
for (const { region, a, b } of rows) {
  console.log(`| ${region} | ${(a.people / 1e6).toFixed(2)} | ${int(a.km2 / 1000)} | ${(a.people / a.km2).toFixed(1)} | ${int(a.yield)} | ${int(a.perHead)} | ${int(b.perHead)} |`);
}
const all = sum(Array.from({ length: w.L }, (_, i) => i), LAND_SHARE);
console.log(`| **whole map** | ${(all.people / 1e6).toFixed(2)} | ${int(all.km2 / 1000)} | ${(all.people / all.km2).toFixed(1)} | ${int(all.yield)} | ${int(all.perHead)} | ${int(sum(Array.from({ length: w.L }, (_, i) => i), LAND_SHARE_VV).perHead)} |`);
