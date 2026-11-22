// Writes public/data/economy_cities.json: the calibration of every city of a reference world, as the game computes
// it when it founds the economies (economy features 3 to 10, docs/ECONOMY_DESIGN.md).
//
// Since feature 10 the game calibrates a city itself, from the calibration table and the persons of the city who
// work (src/sim/systems/economy.ts), so the numbers of a city belong to a world: its start year and its seed. This
// file holds them for the world of 1356 with the seed 1356. The tests of the engine compute its cities
// (economy/tests), and it shows what the port is given. The game does not read it. Run after the table, the cities
// or the persons have changed:
//   npm run economy:calibrate
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CalibrationTable, EconomyCalibration } from '../../src/sim/economy/calibration';
import type { WorldState } from '../../src/sim/state';
import { World } from '../../src/sim/world';
import { cityCalibrations as calibrationsOf } from '../../src/sim/systems/economy';
import { dataPath, loadEconomyTable, newWorldState } from './load';

export const readTable = (): CalibrationTable => loadEconomyTable();
/** The world whose cities the file holds. */
export const REFERENCE = { year: 1356, seed: 1356 } as const;

let reference: { s: WorldState; w: World } | null = null;
/** The cities of the reference world as the game founds them, each with its persons who work and its calibration;
 *  with `t`, as the game would found them from that table. */
export function cityCalibrations(t?: CalibrationTable): {
  place: number;
  name: string;
  people: number;
  country: number;
  working: number[];
  idle: number;
  calibration: EconomyCalibration;
}[] {
  reference ??= newWorldState(REFERENCE.seed, REFERENCE.year);
  const { s, w } = reference;
  return calibrationsOf(
    s,
    t
      ? (Object.assign(Object.create(World.prototype), w, { cityEconomies: { ...w.cityEconomies, table: t } }) as World)
      : w,
  );
}

/** The file as it is written: one key per line at the top, one city per line. */
export function calibrationJson(t: CalibrationTable = readTable()): string {
  const cities = cityCalibrations(t),
    c = cities[0].calibration;
  return (
    `{\n "case": ${JSON.stringify(`${t.case} at the size of each city`)},\n "table": "data/economy/england_1356.json",\n "year": ${c.year},\n "world": ${JSON.stringify(REFERENCE)},\n "scale": ${t.scale.value},\n "periods_per_year": ${c.periods_per_year},\n "clock": ${JSON.stringify(c.clock)},\n "wage": ${JSON.stringify(t.cities.wage.value)},\n "prices": ${JSON.stringify(t.cities.prices.value)},\n "savings_spent_per_year": ${t.cities.savings_spent_per_year.value},\n "crown": ${JSON.stringify(t.cities.crown.value)},\n "owner": ${JSON.stringify(t.cities.owner.value)},\n "cities": [\n` +
    cities
      .map(
        (x) =>
          `  ${JSON.stringify({ place: x.place, name: x.name, people: x.people, working: x.working.length, parameters: x.calibration.parameters, initial_conditions: x.calibration.initial_conditions })}`,
      )
      .join(',\n') +
    '\n ]\n}\n'
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t = readTable();
  writeFileSync(dataPath('economy_cities.json'), calibrationJson(t));
  const f = (v: number) => Math.round(v).toLocaleString('en-GB');
  const cities = cityCalibrations(t);
  for (const x of cities) {
    // (cast: the keys that `accountsOf` writes, src/sim/economy/accounts.ts)
    const a = x.calibration.accounts as { gdp: number; firms: number[]; exports: number; imports: number };
    console.log(
      `${x.name} (place ${x.place}): ${f(x.people)} people, at 1:${1 / t.scale.value} GDP £${f(a.gdp)}, ${f(x.working.length)} persons who work, firms ${a.firms.join(' / ')}, exports £${f(a.exports)}, imports £${f(a.imports)}`,
    );
  }
  const c = cities[0].calibration;
  console.log(
    `${cities.length} cities of the world of ${REFERENCE.year} with the seed ${REFERENCE.seed}: ${f(cities.reduce((n, x) => n + x.working.length, 0))} persons who work`,
  );
  console.log(
    `${c.periods_per_year} periods a year; a firm plans every ${c.clock.plan} days, expectations on windows of ${c.clock.window} days`,
  );
  console.log(
    t.cities.wage.value === 'money'
      ? 'the firms pay a wage in money that never changes'
      : 'the firms pay a real wage that follows the consumer prices, as in the port',
  );
  console.log(
    t.cities.prices.value === 'demand'
      ? 'a planning firm changes its supply or its price by the gap between demand and supply (CANVAS)'
      : 'a planning firm sets supply and price by the rule of the paper',
  );
  console.log(
    t.cities.savings_spent_per_year.value === 0
      ? 'a household spends out of its income only, as in the port'
      : `a household spends ${t.cities.savings_spent_per_year.value} of what it holds above its target in a year`,
  );
  console.log(
    t.cities.crown.value === 'revenue'
      ? 'the crown of a city buys with what it took in the day before'
      : 'the purchases of the crown follow their own series, as in the paper',
  );
  console.log(
    `goods travel ${t.routes.km_per_day.value.land} km a day by land and ${t.routes.km_per_day.value.sea} by sea; ${t.routes.apart.value.join(', ') || 'no region'} apart from the others`,
  );
  console.log(
    t.cities.unemployment_benefit.value === 0
      ? 'a person without work is paid nothing'
      : `a person without work is paid ${t.cities.unemployment_benefit.value} of the last wage after tax`,
  );
}
