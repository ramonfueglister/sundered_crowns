// Prints the demography of the persons (people feature 2, docs/PEOPLE_DESIGN.md) against La Poutré & Paping 2025: a
// world of 1291 in which only deaths, moves, weddings and births run, year by year (the moves are people feature 4).
// npm run families:check [-- years [stay]]   (stay: nobody moves, for the comparison)
import { loadSetup, loadWorld } from './load';
import { createWorldState } from '../../src/sim/setup';
import { ageOn } from '../../src/sim/systems/people';
import { deathsTo, settleEstates } from '../../src/sim/systems/deaths';
import { birthsTo, weddingsOn, type Passed } from '../../src/sim/systems/families';
import { movesTo, noMoves, rateOf } from '../../src/sim/systems/moves';
import { yearsLeft, survival } from '../../src/sim/people/lifetable';
import { ROLE } from '../../src/sim/systems/work';
import { ALIVE } from '../../src/sim/state';

const YEARS = Number(process.argv[2] ?? 100), STAY = process.argv[3] === 'stay';
const w = loadWorld(), s = createWorldState(w, loadSetup(1291), 1291), P = s.person.cols, F = s.family.cols;
console.log(`life table: ${(100 * survival(15)).toFixed(0)} % reach 15, years left at birth ${yearsLeft(0).toFixed(1)}, at 27 ${yearsLeft(27).toFixed(1)}`);
const size0 = new Map<number, number>();
function census(day: number) {
  let n = 0, u15 = 0, seats = 0, vacant = 0, widows = 0, w40 = 0, never40 = 0, estates = 0, parts = 0;
  const wife = new Uint8Array(s.person.size), byPlace = new Map<number, number>();
  for (let f = 0; f < s.family.size; f++) if (F.seat[f]) { seats++; if (F.woman[f] < 0) vacant++; else { wife[F.woman[f]] = 1; if (F.man[f] < 0) widows++; } }
  for (let i = 0; i < s.person.size; i++) {
    if (P.role[i] !== ROLE.none) { parts++; if (P.died[i] !== ALIVE) estates++; }
    if (!s.person.alive[i] || P.died[i] !== ALIVE || P.dies[i] === ALIVE) continue;
    n++; const a = ageOn(P.born[i], day); if (a < 15) u15++;
    if (P.sex[i] === 0 && a >= 40 && a < 45) { w40++; if (!wife[i]) never40++; }
    const p = F.place[P.family[i]]; byPlace.set(p, (byPlace.get(p) ?? 0) + 1);
  }
  return { n, u15: u15 / n, seats, vacant, widows: widows / (seats - vacant), never40: never40 / w40, size: n / seats, estates, parts, byPlace };
}
const line = (y: number, c: ReturnType<typeof census>, d: number, b: number, m: number) =>
  console.log(`year ${String(y).padStart(3)}: ${c.n} living, ${d} deaths, ${b} births, ${m} weddings, ${c.seats} households (${c.vacant} vacant), ${c.size.toFixed(2)} persons each, ` +
    `under 15 ${(100 * c.u15).toFixed(0)} %, widows ${(100 * c.widows).toFixed(0)} %, women 40-44 no housewife ${(100 * c.never40).toFixed(0)} %, estates ${c.estates} of ${c.parts}`);
const c0 = census(0); for (const [p, n] of c0.byPlace) size0.set(p, n);
line(0, c0, 0, 0, 0);
const t0 = Date.now(); let brideSum = 0, brides = 0;
const passed: Passed = { passed: 0, sons: 0, daughters: 0, home: 0 }, moved = noMoves();
let due = 0, personYears = 0;
for (let y = 1; y <= YEARS; y++) {
  let d = 0, b = 0, m = 0;
  for (let mo = 1; mo <= 12; mo++) {
    const day = Math.round((y - 1 + mo / 12) * 365.25);
    d += deathsTo(s, day); if (!STAY) due += movesTo(s, w, day, moved); b += birthsTo(s, day);
    const wives = new Set<number>(); for (let f = 0; f < s.family.size; f++) if (F.seat[f] && F.woman[f] >= 0) wives.add(F.woman[f]);
    m += weddingsOn(s, day, y > 40 ? passed : undefined); settleEstates(s, day);
    for (let f = 0; f < s.family.size; f++) if (F.seat[f] && F.woman[f] >= 0 && !wives.has(F.woman[f])) { brideSum += ageOn(P.born[F.woman[f]], day); brides++; }
  }
  const c = census(Math.round(y * 365.25)); personYears += c.n;
  if (y <= 3 || y % 10 === 0) line(y, c, d, b, m);
}
if (passed.passed) console.log(`years 41 to ${YEARS}: ${passed.passed} households passed to a new couple, ${(100 * (passed.sons + passed.daughters) / passed.passed).toFixed(0)} % to an heir of the house (${passed.sons} sons, ${passed.daughters} daughters)`);
console.log(`${YEARS} years in ${Date.now() - t0} ms; mean age of the brides ${(brideSum / brides).toFixed(1)}; ${s.person.size} person rows, ${s.family.size} family rows`);
if (!STAY) {
  const far = moved.home + moved.service, drawn = far + moved.near + moved.held;
  console.log(`moves: ${(far / YEARS).toFixed(0)} persons a year to another place (${(moved.home / YEARS).toFixed(0)} from home, ${(moved.service / YEARS).toFixed(0)} from a place they had moved to), ` +
    `${(100 * far / personYears).toFixed(2)} % of the persons a year; women ${(100 * moved.women / far).toFixed(0)} %, of 15 to 29 ${(100 * moved.prime / far).toFixed(0)} %, to kin ${(100 * moved.kin / far).toFixed(0)} %, mean age ${(moved.ages / far).toFixed(1)}`);
  console.log(`far moves drawn: ${drawn} (${due} days had come), ${(100 * far / drawn).toFixed(0)} % reached another place, ${(100 * moved.near / drawn).toFixed(0)} % stayed inside the place, ${moved.held} held`);
  // the changes of place of all kinds, near and far, that the rates of the living stand for at the end
  let adults = 0, awayAdults = 0, living = 0, atHome = 0, rateHome = 0, inService = 0, rateService = 0;
  const day = Math.round(YEARS * 365.25);
  for (let i = 0; i < s.person.size; i++) {
    if (!s.person.alive[i] || P.died[i] !== ALIVE || P.dies[i] === ALIVE) continue;
    living++;
    const a = ageOn(P.born[i], day), r = rateOf(s, i, day), away = P.home[i] !== F.place[P.family[i]];
    if (r > 0) { if (away) { inService++; rateService += r; } else { atHome++; rateHome += r; } }
    if (a < 20 || a >= 60) continue;
    adults++; if (away) awayAdults++;
  }
  console.log(`who can move at the end: ${atHome} at home (${(100 * rateHome / atHome).toFixed(1)} % a year leave it) and ${inService} who live elsewhere (${(rateService / inService).toFixed(2)} changes a year); ` +
    `all changes of place, near and far: ${(100 * (rateHome + rateService) / living).toFixed(1)} % of the persons a year, of them over the border of a parish (57 %): ${(100 * 0.57 * (rateHome + rateService) / living).toFixed(1)} %`);
  console.log(`of the persons of 20 to 59, ${(100 * awayAdults / adults).toFixed(1)} % live in another place than they come from; heirs who came home in the years 41 to ${YEARS}: ${passed.home}`);
}
// the towns by their size at the founding: how they have changed
const end = census(Math.round(YEARS * 365.25));
for (const [lo, hi] of [[0, 60], [60, 100], [100, 200], [200, 500], [500, 1e9]]) {
  let a = 0, b = 0, k = 0, gone = 0, min = Infinity, max = 0;
  for (const [p, n] of size0) { if (n < lo || n >= hi) continue; const e = end.byPlace.get(p) ?? 0; a += n; b += e; k++; if (e < n / 2) gone++; min = Math.min(min, e / n); max = Math.max(max, e / n); }
  console.log(`places founded with ${lo} to ${hi === 1e9 ? '…' : hi} persons: ${k}, ${a} persons then, ${b} now (${(100 * b / a - 100).toFixed(1)} %), smallest ratio ${min.toFixed(2)}, largest ${max.toFixed(2)}, ${gone} below half`);
}
