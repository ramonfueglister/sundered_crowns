// Checks the archive of the dead (docs/PEOPLE_DESIGN.md, feature 7, step 2): one world of 1291 run twice, with the
// archive and without it, compared year by year. With the archive the dead whom nothing needs leave the table on the
// first of January and the rows close up; the world must go on the same: the same living persons with the same
// columns, the same families, firms, crowns and economies. Compared over a hash in which every person is named by the
// uid, not by the row. Also prints the rows of the table and the size of the snapshot.
//   npm run archive:check [-- years] [-- --bare]
// --bare: only the people (the deaths, the moves, the weddings and births), for many years.
import { gzipSync } from 'node:zlib';
import { loadSetup, loadWorld } from './load';
import { createWorldState } from '../../src/sim/setup';
import { tick } from '../../src/sim/schedule';
import { SYSTEMS } from '../../src/sim/systems';
import { encodeState, decodeState } from '../../src/sim/snapshot';
import { ALIVE, type WorldState } from '../../src/sim/state';
import { livingHash } from './living_hash';

const args = process.argv.slice(2),
  bare = args.includes('--bare');
const YEARS = Number(args.find((a) => /^\d+$/.test(a)) ?? 3);
const PEOPLE = new Set(['archive', 'deaths', 'moves', 'families']);
const withArchive = SYSTEMS.filter((x) => !bare || PEOPLE.has(x.id));
const without = withArchive.filter((x) => x.id !== 'archive');

const w = loadWorld(),
  a = createWorldState(w, loadSetup(1291), 1291),
  b = decodeState(encodeState(a));
const snapMB = (s: WorldState) => (gzipSync(encodeState(s)).length / 1e6).toFixed(1);
const living = (s: WorldState) => {
  let n = 0;
  for (let i = 0; i < s.person.size; i++) if (s.person.alive[i] && s.person.cols.died[i] === ALIVE) n++;
  return n;
};
console.log(`${bare ? 'people only' : 'all systems'}, ${YEARS} years`);
console.log(
  `year   0: ${living(a)} living, rows ${a.person.size} / ${b.person.size}, snapshot ${snapMB(a)} / ${snapMB(b)} MB (with / without the archive)`,
);
let same = true;
for (let y = 1; y <= YEARS; y++) {
  const t0 = Date.now();
  for (let d = 0; d < 365; d++) tick(a, w, withArchive);
  const ta = (Date.now() - t0) / 365,
    t1 = Date.now();
  for (let d = 0; d < 365; d++) tick(b, w, without);
  const tb = (Date.now() - t1) / 365,
    ha = livingHash(a),
    hb = livingHash(b);
  if (ha !== hb) same = false;
  const archived = a.archive.reduce((n, x) => n + x.persons, 0);
  let estates = 0,
    dead = 0;
  for (let i = 0; i < a.person.size; i++)
    if (a.person.cols.died[i] !== ALIVE) {
      dead++;
      if (a.person.cols.role[i] !== 0) estates++;
    }
  const sizes = y % 10 === 0 || y === YEARS || y <= 3 ? `, snapshot ${snapMB(a)} / ${snapMB(b)} MB` : '';
  console.log(
    `year ${String(y).padStart(3)}: ${living(a)} living, rows ${a.person.size} / ${b.person.size} (dead in the table ${dead}, of them estates ${estates}), archived ${archived}, ${ta.toFixed(1)} / ${tb.toFixed(1)} ms a day${sizes}, hash ${ha} / ${hb}${ha === hb ? '' : '  DIFFERENT'}`,
  );
}
console.log(same ? 'the same world with and without the archive' : 'the worlds differ');
process.exit(same ? 0 : 1);
