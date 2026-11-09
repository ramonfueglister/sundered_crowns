// Calibration of the victory conditions (src/sim/systems/victory.ts): the AI plays alone with every kind chosen;
// every N years the realm closest to each condition is printed.
// usage: npx tsx tools/sim/victory_probe.ts [toYear=1600] [seed=1356] [every=10]
import { newGame } from './load';
import { advanceDay } from '../../src/sim/engine';
import { dayToDate } from '../../src/sim/calendar';
import { victoryCheck, hegemonyMeasure, learningMeasure, commerceMeasure, faithDev, faithLeader, VICTORY_KINDS } from '../../src/sim/systems/victory';
import { FAITHS } from '../../src/sim/content/peoples';

const toYear = +(process.argv[2] ?? 1600), seed = +(process.argv[3] ?? 1356), every = +(process.argv[4] ?? 10);
const { s, w } = newGame(seed, 1356, []);
s.victoryKinds = [...VICTORY_KINDS];
const name = (id: number) => s.nations[id]?.short.en ?? '-';
const top = (m: { values: Map<number, number>; total: number }, k = 3, norm = true) => [...m.values.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([id, v]) => `${name(id)} ${norm ? (v / Math.max(1e-9, m.total) * 100).toFixed(1) + '%' : v.toFixed(0)}`).join(', ');
function report(y: number) {
  const fd = faithDev(s, w);
  const faiths = [...fd.byFaith.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f, v]) => `${FAITHS[f]?.id} ${(v / fd.total * 100).toFixed(1)}% lead ${name(faithLeader(s, f))}`).join(', ');
  const lm = learningMeasure(s); const lt = [...lm.values.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  const lc = lt[0] ? victoryCheck(s, w, 'learning', lt[0][0]) : null;
  console.log(JSON.stringify({ y, heg: top(hegemonyMeasure(s, w)), com: top(commerceMeasure(s)), learn: lt.map(([id, v]) => `${name(id)} ${v}`).join(', '), learnTop: lc && { ratio: +lc.value.toFixed(2), ...lc.detail, missing: lc.missing }, faiths, hold: s.victoryHold, victory: s.victory }));
}
let next = 1356;
for (;;) {
  const y = dayToDate(s.day, s.startYear).y;
  if (y >= next) { report(y); next += every; }
  if (y >= toYear || s.ended) { report(y); break; }
  advanceDay(s, w);
}
