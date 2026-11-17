// Writes public/data/lots_<year>.json: the parcels of every town and the farmsteads of its hamlets in a new world of
// `year` (src/net/lots.ts), for the world graphic, whose probe page has no world server (src/worldprobe/lots.ts
// reads it; in the game the server's GET /lots can take its place). The file is the land register on the first day
// of a world with the seed of the running one (server/fly.toml: the seed is the year). It stays true while the
// register does not change: nobody is born, dies or moves yet. tests/settlement.test.ts fails when the file is not
// what a new world has.
//   npx tsx tools/sim/write_lots.ts 1291
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { newWorldState, dataPath } from './load';
import { manyTownsLots } from '../../src/net/lots';
import { LOT_KIND, type WorldState } from '../../src/sim/state';

const r1 = (v: number) => Math.round(v * 10) / 10;

/** The file's content for a world: per town its site, the size of its parcels (all of a town are alike), and per
 *  parcel the middle, the street side and the persons living on it; then its hamlets: the middle of each (`east`,
 *  `south` of the town's centre), the size of its farmsteads and per farmstead the middle (east and south of the
 *  hamlet's middle), the side of the lane and the persons. All in metres at the scale of the houses (a block of the
 *  world graphic is 2 m), to a decimetre. */
export function lotsFile(s: WorldState) {
  const sites = [...new Set(Array.from({ length: s.lot.size }, (_, i) => s.lot.cols.site[i]))].sort((a, b) => a - b);
  const towns = manyTownsLots(s, sites).map((t) => {
    const of = (keep: (i: number) => boolean, x0 = 0, z0 = 0) => {
      const rows = t.id.map((_, i) => i).filter(keep);
      return { w: rows.length ? r1(t.w[rows[0]]) : 0, d: rows.length ? r1(t.d[rows[0]]) : 0, x: rows.map((i) => r1(t.x[i] - x0)), z: rows.map((i) => r1(t.z[i] - z0)), front: rows.map((i) => t.front[i]), persons: rows.map((i) => t.persons[i]) };
    };
    return { site: t.site, ...of((i) => t.kind[i] === LOT_KIND.parcel), hamlets: t.hamlets.id.map((h, k) => ({ east: r1(t.hamlets.x[k]), south: r1(t.hamlets.z[k]), ...of((i) => t.hamlet[i] === h, t.hamlets.x[k], t.hamlets.z[k]) })) };
  });
  return { year: s.startYear, source: 'a new world of the year: src/sim/systems/lots.ts (tools/sim/write_lots.ts)', towns };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const year = Number(process.argv[2] ?? 1291);
  const file = lotsFile(newWorldState(year, year).s);
  writeFileSync(dataPath(`lots_${year}.json`), JSON.stringify(file) + '\n');
  console.log(`lots_${year}.json: ${file.towns.length} towns, ${file.towns.reduce((n, t) => n + t.x.length, 0)} parcels, ${file.towns.reduce((n, t) => n + t.hamlets.length, 0)} hamlets, ${file.towns.reduce((n, t) => n + t.hamlets.reduce((m, h) => m + h.x.length, 0), 0)} farmsteads`);
}
