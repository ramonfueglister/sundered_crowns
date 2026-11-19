// Checks the working days of the firms (economy feature 19, src/sim/holy_days.ts): one world of 1291 run twice, with
// the working days and with every day a working day, compared year by year: the output, GDP, prices and employment of
// the cities, and the output of the firms of each calendar on the days of each kind.
//   npm run workdays:check [-- years]
import { loadSetup, loadWorld } from './load';
import { createWorldState } from '../../src/sim/setup';
import { tick } from '../../src/sim/schedule';
import { SYSTEMS } from '../../src/sim/systems';
import { encodeState, decodeState } from '../../src/sim/snapshot';
import { FIGURE, FIGURES } from '../../src/sim/economy/engine';
import { calendarOf, yearKinds, CALENDAR } from '../../src/sim/holy_days';
import { dayToDate, dateToDay } from '../../src/sim/calendar';
import type { WorldState } from '../../src/sim/state';

const YEARS = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 2);
const w = loadWorld(), a = createWorldState(w, loadSetup(1291), 1291), b = decodeState(encodeState(a));
// b: every day a working day: the engine is never given working days
b.economy.cities!.workingTo = Number.MAX_SAFE_INTEGER;
const names = Object.keys(CALENDAR);
/** output summed per calendar of the firm and kind of the day */
const out = (s: WorldState, acc: Float64Array) => {
  const e = s.economy.cities!, F = s.firm.cols, P = s.person.cols, { y, m, d } = dayToDate(s.day, s.startYear), doy = dateToDay(y, m, d, y);
  for (let f = 0; f < s.firm.size; f++) {
    const c = calendarOf(P.faith[F.owner[f]]), kind = yearKinds(c, y)[doy];
    acc[c * 3 + kind] += F.output[f];
  }
  return e;
};
const sum = (fig: Float64Array, k: number) => { let n = 0; for (let c = 0; c < fig.length; c += FIGURES) n += fig[c + k]; return n; };
for (let y = 1; y <= YEARS; y++) {
  const accA = new Float64Array(names.length * 3), accB = new Float64Array(names.length * 3);
  let ta = 0, tb = 0;
  for (let d = 0; d < 365; d++) {
    let t = Date.now(); tick(a, w, SYSTEMS); ta += Date.now() - t; out(a, accA);
    t = Date.now(); tick(b, w, SYSTEMS); tb += Date.now() - t; out(b, accB);
  }
  const ea = a.economy.cities!, eb = b.economy.cities!;
  console.log(`year ${y} (day ${a.day}): halted '${ea.halted}' / '${eb.halted}', ${(ta / 365).toFixed(0)} / ${(tb / 365).toFixed(0)} ms a day`);
  for (const [k, name] of [[FIGURE.realGdp, 'real GDP'], [FIGURE.nominalGdp, 'nominal GDP'], [FIGURE.consumption, 'consumption'], [FIGURE.investment, 'investment'], [FIGURE.employees, 'employees'], [FIGURE.unemployed, 'unemployed'], [FIGURE.depositsHouseholds, 'deposits of the households'], [FIGURE.depositsFirms, 'deposits of the firms']] as const) {
    const x = sum(ea.figures, k), z = sum(eb.figures, k);
    console.log(`  ${name}: ${x.toPrecision(6)} / ${z.toPrecision(6)} (${(((x / z) - 1) * 100).toFixed(2)} %)`);
  }
  // price level: mean over the cities
  const pl = (fig: Float64Array) => { let n = 0, c = 0; for (let i = 0; i < fig.length; i += FIGURES) { n += fig[i + FIGURE.priceLevel]; c++; } return n / c; };
  console.log(`  mean price level: ${pl(ea.figures).toFixed(4)} / ${pl(eb.figures).toFixed(4)}`);
  for (let c = 0; c < names.length; c++) {
    const ra = accA.subarray(c * 3, c * 3 + 3), rb = accB.subarray(c * 3, c * 3 + 3), ta2 = ra[0] + ra[1] + ra[2], tb2 = rb[0] + rb[1] + rb[2];
    if (tb2 === 0) continue;
    console.log(`  ${names[c]}: output of the year ${ta2.toPrecision(6)} / ${tb2.toPrecision(6)} (${(((ta2 / tb2) - 1) * 100).toFixed(2)} %), on working / half / rest days ${Array.from(ra, (v) => v.toPrecision(4)).join(' / ')} vs ${Array.from(rb, (v) => v.toPrecision(4)).join(' / ')}`);
  }
}
