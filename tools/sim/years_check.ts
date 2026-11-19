// Prints what a day of the world costs as the years pass (docs/PEOPLE_DESIGN.md, the archive of the dead): a world of
// 1291 with all its systems (the economies of the cities among them), year by year, and the hash of the state at the
// end, so two versions of the code can be compared on the same world.
// npm run years:check [-- years]
import { loadSetup, loadWorld } from './load';
import { createWorldState } from '../../src/sim/setup';
import { advanceDay } from '../../src/sim/engine';
import { hashState } from '../../src/sim/snapshot';
import { ALIVE } from '../../src/sim/state';

const YEARS = Number(process.argv[2] ?? 10);
const w = loadWorld(), s = createWorldState(w, loadSetup(1291), 1291), P = s.person.cols;
const living = () => { let n = 0; for (let i = 0; i < s.person.size; i++) if (s.person.alive[i] && P.died[i] === ALIVE) n++; return n; };
console.log(`year   0: ${living()} living, ${s.person.size} person rows, ${s.family.size} family rows`);
const start = Date.now();
for (let y = 1; y <= YEARS; y++) {
  const t0 = Date.now(), days = 365;
  for (let d = 0; d < days; d++) advanceDay(s, w);
  const ms = (Date.now() - t0) / days;
  console.log(`year ${String(y).padStart(3)}: ${ms.toFixed(1)} ms a day, ${living()} living, ${s.person.size} person rows, ${s.family.size} family rows${s.economy.cities?.halted ? `, economies halted: ${s.economy.cities.halted}` : ''}`);
}
console.log(`${YEARS} years in ${((Date.now() - start) / 1000).toFixed(0)} s; hash of the state ${hashState(s)}`);
