// Which frontier realms of the Latin Church could ask for a crusade: npx tsx tools/sim/curia_frontier.ts [years]
import { newGame } from './load';
import { advanceDay } from '../../src/sim/engine';
import { dayToDate } from '../../src/sim/calendar';
import { crusadeTargets, crusadeFavour, favourOf, isLatin } from '../../src/sim/systems/curia';
import { bordering, nationDev } from '../../src/sim/systems/war';

const years = Number(process.argv[2] || 20);
const { s, w } = newGame(1356);
for (let k = 0; k < Math.round(years * 365.25); k++) {
  advanceDay(s, w);
  if (s.day % (365 * 5) === 0) {
    const t = crusadeTargets(s, w);
    const rows = s.nations.filter((n) => isLatin(n) && n.overlord < 0 && t.some((x) => bordering(s, w, n.id, x) && nationDev(s, x) < nationDev(s, n.id) * 2))
      .map((n) => `${n.key}:${Math.round(favourOf(s, n.id))}/${crusadeFavour(s, n)}`);
    console.log(dayToDate(s.day, s.startYear).y, rows.join(' '), '| crusade', s.papacy.crusade ? s.nations[s.papacy.crusade.target].key : '-');
  }
}
for (const c of s.chronicle) if (c.kind === 'crusade') console.log('  ', dayToDate(c.day, s.startYear).y, c.text.en);
