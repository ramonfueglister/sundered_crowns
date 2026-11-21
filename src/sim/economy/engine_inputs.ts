// The inputs of the economy engine's calls (src/sim/economy/engine.ts) as the bytes the engine reads, little endian:
// the cities and their working days as economy/src/abi/inputs.rs reads them, the routes as `sce_routes`
// (economy/src/abi.rs), the absences and the contracts as economy/src/workers.rs.
import type { CityAbsences, CitySetup, CityWorkingDays, EconomyRoutes } from './engine';

const utf8 = new TextEncoder();

/** The list of cities as `sce_create` reads it: for every city the seed in 64 bits, then the two texts, each with
 *  its length in 32 bits before it; little endian. */
export function citiesInput(cities: readonly CitySetup[]): Uint8Array {
  const texts = cities.map((c) => [utf8.encode(c.parameters), utf8.encode(c.initialConditions)]);
  const out = new Uint8Array(texts.reduce((n, [p, ic]) => n + 16 + p.length + ic.length, 0)),
    dv = new DataView(out.buffer);
  let at = 0;
  cities.forEach((c, k) => {
    if (!Number.isSafeInteger(c.seed) || c.seed < 0)
      throw new Error(`economy seed ${c.seed} is not a whole number from 0`);
    const lo = c.seed % 0x100000000;
    dv.setUint32(at, lo, true);
    dv.setUint32(at + 4, (c.seed - lo) / 0x100000000, true);
    at += 8;
    for (const t of texts[k]) {
      dv.setUint32(at, t.length, true);
      out.set(t, at + 4);
      at += 4 + t.length;
    }
  });
  return out;
}

/** The distance between the cities (economy feature 17) as `sce_routes` reads it: the elasticity, the weight per
 *  product, then per pair of cities the days and the labour. */
export function routesInput({ cities: n, days, labour, weight, elasticity }: EconomyRoutes): Uint8Array {
  if (days.length !== n * n || labour.length !== n * n)
    throw new Error(`routes of ${days.length} ways and ${labour.length} labours do not fit ${n} cities`);
  const G = weight.length,
    out = new Uint8Array(8 + 8 * G + 12 * n * n),
    dv = new DataView(out.buffer);
  dv.setFloat64(0, elasticity, true);
  for (let g = 0; g < G; g++) dv.setFloat64(8 + 8 * g, weight[g], true);
  let at = 8 + 8 * G;
  for (let k = 0; k < n * n; k++) {
    dv.setUint32(at, days[k], true);
    dv.setFloat64(at + 4, labour[k], true);
    at += 12;
  }
  return out;
}

/** The working days of the cities (economy feature 19) as `sce_working_days` reads them: per city its calendars,
 *  kinds and days, the factors, the kinds of the days, its firms and their calendars, its other households and
 *  theirs. */
export function workingDaysInput(cities: readonly CityWorkingDays[]): Uint8Array {
  let size = 0;
  for (const c of cities) {
    const calendars = c.factor.length / c.kinds;
    if (!Number.isInteger(calendars) || c.day.length !== calendars * c.days)
      throw new Error(
        `working days of ${c.factor.length} factors and ${c.day.length} days do not fit ${c.kinds} kinds and ${c.days} days`,
      );
    size += 20 + 8 * c.factor.length + c.day.length + c.calendar.length + c.household.length;
  }
  const out = new Uint8Array(size),
    dv = new DataView(out.buffer);
  let at = 0;
  for (const c of cities) {
    dv.setUint32(at, c.factor.length / c.kinds, true);
    dv.setUint32(at + 4, c.kinds, true);
    dv.setUint32(at + 8, c.days, true);
    at += 12;
    for (const f of c.factor) {
      dv.setFloat64(at, f, true);
      at += 8;
    }
    out.set(c.day, at);
    at += c.day.length;
    dv.setUint32(at, c.calendar.length, true);
    at += 4;
    out.set(c.calendar, at);
    at += c.calendar.length;
    dv.setUint32(at, c.household.length, true);
    at += 4;
    out.set(c.household, at);
    at += c.household.length;
  }
  return out;
}

/** The workers who are away (economy feature 22) as `sce_absences` reads them: per city the number of its absences,
 *  then per absence the worker, the first and the last day and whether the family stands in. */
export function absencesInput(cities: readonly CityAbsences[]): Uint8Array {
  const out = new Uint8Array(cities.reduce((n, c) => n + 4 + 16 * c.worker.length, 0)),
    dv = new DataView(out.buffer);
  let at = 0;
  for (const c of cities) {
    const n = c.worker.length;
    if (c.first.length !== n || c.last.length !== n || c.family.length !== n)
      throw new Error(
        `absences of ${n} workers with ${c.first.length} first and ${c.last.length} last days and ${c.family.length} words on the family`,
      );
    dv.setUint32(at, n, true);
    at += 4;
    for (let k = 0; k < n; k++) {
      dv.setUint32(at, c.worker[k], true);
      dv.setUint32(at + 4, c.first[k], true);
      dv.setUint32(at + 8, c.last[k], true);
      dv.setUint32(at + 12, c.family[k], true);
      at += 16;
    }
  }
  return out;
}

/** The contracts of the cities (economy feature 23) as `sce_contracts` reads them: per city the number of its workers
 *  who work by the day, then each of them. */
export function contractsInput(byTheDay: readonly Uint32Array[]): Uint8Array {
  const out = new Uint8Array(byTheDay.reduce((n, c) => n + 4 + 4 * c.length, 0)),
    dv = new DataView(out.buffer);
  let at = 0;
  for (const c of byTheDay) {
    dv.setUint32(at, c.length, true);
    at += 4;
    for (const h of c) {
      dv.setUint32(at, h, true);
      at += 4;
    }
  }
  return out;
}
