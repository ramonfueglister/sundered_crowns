// Writes public/data/lots_<year>.json: the parcels of every town in a new world of `year` (src/net/lots.ts), for
// the world graphic, whose probe page has no world server (src/worldprobe/lots.ts reads it; in the game the server's
// GET /lots can take its place). The file is the land register on the first day of a world with the seed of the
// running one (server/fly.toml: the seed is the year). It stays true while the register does not change: nobody is
// born, dies or moves yet. tests/settlement.test.ts fails when the file is not what a new world has.
//   npx tsx tools/sim/write_lots.ts 1291
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { newWorldState, dataPath } from './load';
import { manyTownsLots } from '../../src/net/lots';
import type { WorldState } from '../../src/sim/state';

const r1 = (v: number) => Math.round(v * 10) / 10;

/** The file's content for a world: per town its site, the size of its parcels (all of a town are alike), and per
 *  parcel the middle, the street side and the persons living on it. Metres, to a decimetre. */
export function lotsFile(s: WorldState) {
  const sites = [...new Set(Array.from({ length: s.lot.size }, (_, i) => s.lot.cols.site[i]))].sort((a, b) => a - b);
  const towns = manyTownsLots(s, sites).map((t) => ({ site: t.site, w: r1(t.w[0]), d: r1(t.d[0]), x: t.x.map(r1), z: t.z.map(r1), front: t.front, persons: t.persons }));
  return { year: s.startYear, source: 'a new world of the year: src/sim/systems/lots.ts (tools/sim/write_lots.ts)', towns };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const year = Number(process.argv[2] ?? 1291);
  const file = lotsFile(newWorldState(year, year).s);
  writeFileSync(dataPath(`lots_${year}.json`), JSON.stringify(file) + '\n');
  console.log(`lots_${year}.json: ${file.towns.length} towns, ${file.towns.reduce((n, t) => n + t.x.length, 0)} parcels`);
}
