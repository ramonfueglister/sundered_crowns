// Computes the port's parameters for England from the calibration table and writes public/data/economy_england.json
// (economy features 3 and 4, docs/ECONOMY_DESIGN.md): the yearly calibration turned into days. Run after the table
// has changed:
//   npm run economy:calibrate
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calibrateEconomy, dailyEconomy, type CalibrationTable, type EconomyCalibration } from './economy_calibration';
import { dataPath } from './load';

export const TABLE = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../data/economy/england_1356.json');
export const readTable = (): CalibrationTable => JSON.parse(readFileSync(TABLE, 'utf8'));
/** The calibration the world server reads: the yearly one of the table, turned into days (economy feature 4). */
export function worldCalibration(t: CalibrationTable): EconomyCalibration {
  return dailyEconomy(calibrateEconomy(t), t.clock.days_per_year.value, t.clock.plan_days.value);
}
/** The file as it is written: one key per line at the top, the long lists on one line each. */
export function calibrationJson(t: CalibrationTable): string {
  const c = worldCalibration(t);
  const part = (o: Record<string, unknown>) => '{\n' + Object.entries(o).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n }';
  return `{\n "case": ${JSON.stringify(c.case)},\n "table": "data/economy/england_1356.json",\n "year": ${c.year},\n "scale": ${c.scale},\n "periods_per_year": ${c.periods_per_year},\n "clock": ${JSON.stringify(c.clock)},\n`
    + ` "parameters": ${part(c.parameters)},\n "initial_conditions": ${part(c.initial_conditions)},\n "accounts": ${part(c.accounts)}\n}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t = readTable();
  writeFileSync(dataPath('economy_england.json'), calibrationJson(t));
  const a = calibrateEconomy(t).accounts as Record<string, any>;
  const f = (v: number) => Math.round(v).toLocaleString('en-GB');
  console.log(`${t.case} at 1:${1 / t.scale.value}: GDP £${f(a.gdp)}, ${f(a.people)} people, labour force ${f(a.labourForce)}`);
  console.log(`firms ${a.firms.join(' / ')}, employees ${a.employees.join(' / ')}`);
  console.log(`households £${f(a.households.reduce((x: number, y: number) => x + y, 0))}, crown £${f(a.crown)}, investment £${f(a.investment)}, building £${f(a.building)}, exports £${f(a.exports)}, imports £${f(a.imports)} (check ${a.gdpCheck.toExponential(2)})`);
  console.log(`crown revenue £${f(a.revenue)}, of it wool duty £${f(a.duty)}; coin £${f(a.coin)}`);
  const c = worldCalibration(t);
  console.log(`${c.periods_per_year} periods a year; a firm plans every ${c.clock.plan} days, expectations on windows of ${c.clock.window} days`);
}
