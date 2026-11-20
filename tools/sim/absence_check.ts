// Checks sickness and childbed (people feature 9, economy feature 22, src/sim/people/absence.ts): one world of 1291
// run twice, with the workers who are away and with everybody there, compared year by year.
//   npm run absence:check [-- years]
// Per year: the days away per worker by group of age and sex against the sick time of Morcott (Riley & Alter 1996,
// table 2), the days of childbed per woman who works, the new sicknesses of the persons of 20 or more per death of
// one of them (Morcott 12.6, Ramsey 17.5), and GDP, prices and employment of the cities against the run in which
// everybody is there.
import { loadSetup, loadWorld } from './load';
import { createWorldState } from '../../src/sim/setup';
import { tick } from '../../src/sim/schedule';
import { SYSTEMS } from '../../src/sim/systems';
import { encodeState, decodeState } from '../../src/sim/snapshot';
import { FIGURE, FIGURES, type EconomyState } from '../../src/sim/economy/engine';
import { MORCOTT, ageGroup, sickness } from '../../src/sim/people/absence';
import { presentPersons } from '../../src/sim/people/living';
import { ROLE } from '../../src/sim/systems/work';
import { ALIVE } from '../../src/sim/state';
import type { World } from '../../src/sim/world';

const YEARS = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 3), YEAR = 365.25;
const w = loadWorld(), a = createWorldState(w, loadSetup(1291), 1291), b = decodeState(encodeState(a));
const engine = w.economyEngine;
const wa = w;
// b: everybody is there
const wb: World = Object.assign(Object.create(Object.getPrototypeOf(w)), w, {
  economyEngine: { ...engine, absences: (st: EconomyState) => (st instanceof Uint8Array ? st : st.bytes()) },
});
const G = MORCOTT.events.length, groups = ['15–19', ...MORCOTT.events.map((_, g) => (g === G - 1 ? '75+' : `${20 + 5 * g}–${24 + 5 * g}`))];
const group = (age: number) => (age < 20 ? 0 : 1 + ageGroup(age));
const sum = (fig: Float64Array, k: number) => { let n = 0; for (let c = 0; c < fig.length; c += FIGURES) n += fig[c + k]; return n; };

for (let y = 1; y <= YEARS; y++) {
  const first = a.day + 1, last = first + 364;
  // the new sicknesses and the deaths of the year of the persons of 20 or more, from the persons at its start (the
  // day of death is drawn in advance: src/sim/systems/deaths.ts)
  let onsets = 0, deaths = 0;
  {
    const P = a.person.cols;
    for (let id = 0; id < a.person.size; id++) {
      if (!a.person.alive[id] || P.died[id] !== ALIVE || (first - P.born[id]) / YEAR < 15) continue;
      const end = Math.min(P.dies[id], last + 1), e = sickness(a.seed >>> 0, P.uid[id], P.born[id], end);
      for (let k = 0; k < e.length; k += 2) if (e[k] >= first && (e[k] - P.born[id]) / YEAR >= 20) onsets++;
      if (P.dies[id] <= last && (P.dies[id] - P.born[id]) / YEAR >= 20) deaths++;
    }
  }
  // per sex and group: the days of the workers and the days they are sick; the days of childbed of the women
  const days = [0, 1].map(() => new Float64Array(groups.length)), sick = [0, 1].map(() => new Float64Array(groups.length));
  let childbed = 0, womenDays = 0, away = 0, seen = a.person.size;
  const lastBirth = new Map<number, number>(); // uid of a mother → the day of her last child
  {
    const P = a.person.cols;
    for (let id = 0; id < a.person.size; id++) if (a.person.alive[id] && P.mother[id] >= 0 && P.born[id] > first - 31) lastBirth.set(P.mother[id], Math.max(P.born[id], lastBirth.get(P.mother[id]) ?? -Infinity));
  }
  for (let d = 0; d < 365; d++) {
    const s = a, P = s.person.cols, day = s.day + 1;
    for (const id of presentPersons(s)) {
      if (P.role[id] !== ROLE.worker || P.died[id] !== ALIVE) continue;
      const age = (day - P.born[id]) / YEAR, sex = P.sex[id], g = group(age);
      days[sex][g]++;
      const e = sickness(s.seed >>> 0, P.uid[id], P.born[id], day + 1), ill = e.length > 0 && e[e.length - 1] >= day;
      if (ill) sick[sex][g]++;
      const b = lastBirth.get(P.uid[id]), lying = sex === 0 && b !== undefined && day - b < 30 && day >= b;
      if (sex === 0) { womenDays++; if (lying) childbed++; }
      if (ill || lying) away++;
    }
    tick(a, wa, SYSTEMS);
    tick(b, wb, SYSTEMS);
    // the children born on the day (new rows; on the first of January the rows close up)
    if (a.person.size < seen) seen = 0;
    for (let id = seen; id < a.person.size; id++) if (a.person.alive[id] && a.person.cols.mother[id] >= 0 && a.person.cols.born[id] >= a.day - 1) lastBirth.set(a.person.cols.mother[id], a.person.cols.born[id]);
    seen = a.person.size;
  }
  const ea = a.economy.cities!, eb = b.economy.cities!;
  console.log(`year ${y} (day ${a.day}): halted '${ea.halted}' / '${eb.halted}'`);
  console.log('  days sick per worker and year (women | men | Morcott men, table 2), worker-years (women | men):');
  for (let g = 0; g < groups.length; g++) {
    const f = days[0][g] ? (sick[0][g] / days[0][g]) * 365 : NaN, m = days[1][g] ? (sick[1][g] / days[1][g]) * 365 : NaN;
    const table = g === 0 ? NaN : MORCOTT.sick[g - 1] * 365;
    console.log(`    ${groups[g].padEnd(6)} ${f.toFixed(1).padStart(6)} | ${m.toFixed(1).padStart(6)} | ${table.toFixed(1).padStart(6)}   ${(days[0][g] / 365).toFixed(0).padStart(6)} | ${(days[1][g] / 365).toFixed(0).padStart(6)}`);
  }
  const workerDays = days[0].reduce((n, x) => n + x, 0) + days[1].reduce((n, x) => n + x, 0);
  const sickAll = sick[0].reduce((n, x) => n + x, 0) + sick[1].reduce((n, x) => n + x, 0);
  console.log(`  all workers: sick ${((sickAll / workerDays) * 100).toFixed(2)} % of their days (${((sickAll / workerDays) * 365).toFixed(1)} a year); away, sick or in childbed, ${((away / workerDays) * 100).toFixed(2)} %`);
  console.log(`  childbed: ${((childbed / womenDays) * 365).toFixed(1)} days a year per woman who works (${((childbed / womenDays) * 100).toFixed(2)} % of her days)`);
  console.log(`  new sicknesses of the persons of 20 or more per death of one of them: ${onsets} / ${deaths} = ${(onsets / deaths).toFixed(1)} (Morcott 12.6, Ramsey 17.5)`);
  for (const [k, name] of [[FIGURE.realGdp, 'real GDP'], [FIGURE.nominalGdp, 'nominal GDP'], [FIGURE.consumption, 'consumption'], [FIGURE.investment, 'investment'], [FIGURE.employees, 'employees'], [FIGURE.unemployed, 'unemployed'], [FIGURE.depositsHouseholds, 'deposits of the households'], [FIGURE.depositsFirms, 'deposits of the firms']] as const) {
    const x = sum(ea.figures, k), z = sum(eb.figures, k);
    console.log(`  ${name}: ${x.toPrecision(6)} / ${z.toPrecision(6)} (${(((x / z) - 1) * 100).toFixed(2)} %)`);
  }
  const pl = (fig: Float64Array) => { let n = 0, c = 0; for (let i = 0; i < fig.length; i += FIGURES) { n += fig[i + FIGURE.priceLevel]; c++; } return n / c; };
  console.log(`  mean price level: ${pl(ea.figures).toFixed(4)} / ${pl(eb.figures).toFixed(4)}`);
}
