// Prints the deaths of the persons (people feature 2, docs/PEOPLE_DESIGN.md) against the life table: a world of
// 1291 in which only the deaths run, year by year. Nobody is born yet, so the world shrinks.
// npm run deaths:check [-- years]
import { loadSetup, loadWorld } from './load';
import { createWorldState } from '../../src/sim/setup';
import { ageOn, LIFE_TABLE_LEVEL } from '../../src/sim/systems/people';
import { deathsTo, settleEstates } from '../../src/sim/systems/deaths';
import { survivorship, lifeExpectancy } from '../../src/sim/people/lifetable';
import { ROLE } from '../../src/sim/systems/work';
import { ALIVE } from '../../src/sim/state';

const YEARS = Number(process.argv[2] ?? 30);
const w = loadWorld(), s = createWorldState(w, loadSetup(1291), 1291), P = s.person.cols;
const l = { f: survivorship('f', LIFE_TABLE_LEVEL), m: survivorship('m', LIFE_TABLE_LEVEL) };
const living = () => { let n = 0; for (let i = 0; i < s.person.size; i++) if (s.person.alive[i] && P.died[i] === ALIVE) n++; return n; };
// expected deaths of the first year: the force of mortality of every person's year of age
let expected = 0;
for (let i = 0; i < s.person.size; i++) { if (P.dies[i] === ALIVE) continue; const t = l[P.sex[i] ? 'm' : 'f'], y = Math.min(119, Math.floor(ageOn(P.born[i], 0))); expected += 1 - t[y + 1] / t[y]; }
console.log(`world of 1291, ${living()} persons, West level ${LIFE_TABLE_LEVEL} (e0 women ${lifeExpectancy('f', LIFE_TABLE_LEVEL).toFixed(1)}, men ${lifeExpectancy('m', LIFE_TABLE_LEVEL).toFixed(1)})`);
console.log(`deaths expected in the first year by the life table: ${expected.toFixed(0)}`);
const t0 = Date.now();
for (let y = 1; y <= YEARS; y++) {
  const before = living(); let d = 0;
  for (let m = 1; m <= 12; m++) { const day = Math.round((y - 1 + m / 12) * 365.25); d += deathsTo(s, day); settleEstates(s, day); }
  let estates = 0, parts = 0; for (let i = 0; i < s.person.size; i++) { if (P.role[i] !== ROLE.none) { parts++; if (P.died[i] !== ALIVE) estates++; } }
  if (y <= 5 || y % 5 === 0) console.log(`year ${String(y).padStart(2)}: ${d} deaths (${(1000 * d / before).toFixed(1)} per 1000), ${living()} living, ${parts} parts in the economy, ${estates} of them with the dead`);
}
console.log(`${YEARS} years of deaths in ${Date.now() - t0} ms`);
// the persons of the founding: the age at death drawn against the life table (those alive at the founding, by age then)
const band = (lo: number, hi: number) => { let n = 0, dead = 0; for (let i = 0; i < s.person.size; i++) { if (P.dies[i] === ALIVE) continue; const a = ageOn(P.born[i], 0); if (a < lo || a >= hi) continue; n++; if (P.dies[i] <= Math.round(10 * 365.25)) dead++; } return { n, share: dead / n }; };
for (const [lo, hi] of [[0, 1], [1, 5], [20, 30], [40, 50], [60, 70]]) {
  const b = band(lo, hi); let exp = 0, m = 0;
  for (let i = 0; i < s.person.size; i++) { if (P.dies[i] === ALIVE) continue; const a = ageOn(P.born[i], 0); if (a < lo || a >= hi) continue; const t = l[P.sex[i] ? 'm' : 'f'], y = Math.min(110, Math.floor(a)), f = a - y; const la = t[y] * Math.pow(t[y + 1] / t[y], f), lb = t[y + 10] * Math.pow(t[y + 11] / t[y + 10], f); exp += 1 - lb / la; m++; }
  console.log(`aged ${lo} to ${hi} at the founding (${b.n}): dead within 10 years ${(100 * b.share).toFixed(1)} %, life table ${(100 * exp / m).toFixed(1)} %`);
}
