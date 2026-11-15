// Computes the port's parameters for every city from the calibration table and writes public/data/economy_cities.json
// (economy features 3 to 6, docs/ECONOMY_DESIGN.md): for each of the places with one of the 30 largest cities, the
// yearly calibration of England at the city's size, turned into days. Run after the table or the cities have changed:
//   npm run economy:calibrate
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calibrateEconomy, cityTable, dailyEconomy, type CalibrationTable, type EconomyCalibration } from './economy_calibration';
import { CITIES } from '../../src/sim/systems/people';
import { dataPath } from './load';

export const TABLE = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../data/economy/england_1356.json');
export const readTable = (): CalibrationTable => JSON.parse(readFileSync(TABLE, 'utf8'));
/** The yearly calibration turned into days (economy feature 4). */
export function dailyCalibration(t: CalibrationTable): EconomyCalibration {
  return dailyEconomy(calibrateEconomy(t), t.clock.days_per_year.value, t.clock.plan_days.value);
}
/** The places that have a city, in the order of the list of cities, each with its name and the people of its cities
 *  (two cities of the list lie in one place: they are one economy). */
export function cityPlaces(): { place: number; name: string; people: number }[] {
  const out: { place: number; name: string; people: number }[] = [];
  for (const c of CITIES) {
    const at = out.find((x) => x.place === c.place);
    if (at) at.people += c.people; else out.push({ place: c.place, name: c.placeName, people: c.people });
  }
  return out;
}
/** The calibration of every city: England's table at the city's size, in days. */
export function cityCalibrations(t: CalibrationTable): { place: number; name: string; people: number; calibration: EconomyCalibration }[] {
  return cityPlaces().map((c) => ({ ...c, calibration: dailyCalibration(cityTable(t, c.people)) }));
}
/** The file as it is written: one key per line at the top, one city per line. */
export function calibrationJson(t: CalibrationTable): string {
  const cities = cityCalibrations(t), c = cities[0].calibration;
  return `{\n "case": ${JSON.stringify(`${t.case} at the size of each city`)},\n "table": "data/economy/england_1356.json",\n "year": ${c.year},\n "scale": ${t.scale.value},\n "periods_per_year": ${c.periods_per_year},\n "clock": ${JSON.stringify(c.clock)},\n "cities": [\n`
    + cities.map((x) => `  ${JSON.stringify({ place: x.place, name: x.name, people: x.people, parameters: x.calibration.parameters, initial_conditions: x.calibration.initial_conditions })}`).join(',\n')
    + '\n ]\n}\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t = readTable();
  writeFileSync(dataPath('economy_cities.json'), calibrationJson(t));
  const f = (v: number) => Math.round(v).toLocaleString('en-GB');
  for (const x of cityCalibrations(t)) {
    const a = x.calibration.accounts as Record<string, any>;
    console.log(`${x.name} (place ${x.place}): ${f(x.people)} people, at 1:${1 / t.scale.value} GDP £${f(a.gdp)}, labour force ${f(a.labourForce)}, firms ${a.firms.join(' / ')}, exports £${f(a.exports)}, imports £${f(a.imports)}`);
  }
  const c = cityCalibrations(t)[0].calibration;
  console.log(`${c.periods_per_year} periods a year; a firm plans every ${c.clock.plan} days, expectations on windows of ${c.clock.window} days`);
}
