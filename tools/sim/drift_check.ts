// How far a free world of 1291 goes from history (docs/PEOPLE_DESIGN.md, feature 11): the persons of history die on
// days of their own (`World.rulerDeaths` 'drawn': the life table, and the murder of rulers after Eisner 2011), the
// borders follow history, and the crowns go by src/sim/systems/succession.ts. Prints, every few years and as the
// mean over the seeds, the crowns history has with somebody that the world gives to somebody else or to nobody, the
// persons of history alive in one and dead in the other, and those history has born whom the world could not bear.
// npm run drift:check [-- seeds step-years]
import { loadSetup, loadWorldFor } from './load';
import { createWorldState } from '../../src/sim/setup';
import { dayOf } from '../../src/sim/content/chronicle';
import { playBorders } from '../../src/sim/systems/borders';
import { playChronicle } from '../../src/sim/systems/rulers';
import { divergence } from '../../src/sim/divergence';

const SEEDS = Number(process.argv[2] ?? 5),
  STEP = Number(process.argv[3] ?? 25);
const setup = loadSetup(1291),
  w = loadWorldFor(1291),
  c = w.chronicle;
if (!c) throw new Error('no chronicle of rulers for 1291');
const number = new Map(c.persons.map((p, k) => [p.key, k]));
const years: number[] = [];
for (let y = 1291 + STEP; y <= 1848; y += STEP) years.push(y);
if (years.at(-1) !== 1848) years.push(1848);

/** per year: the sums over the seeds; seed 0 is the world that dies on the days of the sources, for the crowns held in
 *  history */
const sum = years.map(() => ({ crowns: 0, held: 0, persons: 0, unborn: 0, kin: 0, history: 0 }));
for (let seed = 0; seed <= SEEDS; seed++) {
  w.rulerDeaths = seed === 0 ? 'chronicle' : 'drawn';
  const t0 = Date.now(),
    s = createWorldState(w, setup, 1291 + seed);
  years.forEach((y, k) => {
    const end = dayOf(`${y}-12-31`, 1291)!;
    for (let d = s.day + 1; d <= end; d++) {
      playBorders(s, w, d, d);
      playChronicle(s, w, d, d);
      s.day = d;
    }
    const x = divergence(s, w, setup),
      held = s.realm.cols.holder.filter((h, r) => h >= 0 && s.realm.alive[r]).length;
    // crowns held by kin of the rulers, who never reigned in history
    const kin = s.named.filter((n) => s.realm.cols.holder.includes(n.person) && c.home[number.get(n.key) ?? 0] === '');
    const z = sum[k];
    if (seed === 0) {
      z.history = held;
      return;
    }
    z.crowns += x.realms;
    z.held += held;
    z.persons += x.persons;
    z.unborn += x.unborn;
    z.kin += kin.length;
  });
  console.error(`seed ${seed}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
console.log(`free world of 1291, ${SEEDS} seeds, mean per seed`);
console.log('year   crowns off / held (history)   by kin   persons off   unborn');
years.forEach((y, k) => {
  const z = sum[k],
    m = (v: number) => (v / SEEDS).toFixed(1);
  console.log(
    `${y}   ${m(z.crowns).padStart(6)} / ${m(z.held).padStart(6)} (${String(z.history).padStart(3)})   ${m(z.kin).padStart(6)}   ${m(z.persons).padStart(8)}   ${m(z.unborn).padStart(6)}`,
  );
});
