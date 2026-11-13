// Observer of the Curia: npx tsx tools/sim/curia_probe.ts [years] [seed]
import { newGame } from './load';
import { advanceDay } from '../../src/sim/engine';
import { dayToDate } from '../../src/sim/calendar';
import { AI_USAGE } from '../../src/sim/systems/ai_log';

const years = Number(process.argv[2] || 30), seed = Number(process.argv[3] || 1356);
const { s, w } = newGame(seed);
const nm = (id: number) => s.nations[id]?.key ?? String(id);
const college = () => Object.entries(s.papacy.cardinals ?? {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${nm(+k)}:${v}`).join(' ');
console.log('start', 'patron', nm(s.papacy.patron ?? -1), 'holder', nm(s.papacy.holder), '|', college());
let lastY = s.startYear;
for (let k = 0; k < Math.round(years * 365.25); k++) {
  advanceDay(s, w);
  const y = dayToDate(s.day, s.startYear).y;
  if (y !== lastY && y % 10 === 0) console.log(y, 'patron', nm(s.papacy.patron ?? -1), 'corr', s.papacy.corruption.toFixed(0), '|', college());
  lastY = y;
}
for (const c of s.chronicle) if (['pope', 'crusade', 'curia'].includes(c.kind)) console.log('  ', dayToDate(c.day, s.startYear).y, c.text.en);
console.log(Object.fromEntries(Object.entries(AI_USAGE).filter(([k]) => k.startsWith('curia'))));
