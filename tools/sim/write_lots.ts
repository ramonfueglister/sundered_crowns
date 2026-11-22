// Writes public/data/lots_<year>.json: the parcels of every town and the farmsteads of its hamlets in a new world of
// `year` (src/net/lots.ts), for the world graphic, whose probe page has no world server (src/worldprobe/lots.ts
// reads it; in the game the server's GET /lots can take its place). The file is the land register on the first day
// of a world with the seed of the running one (server/fly.toml: the seed is the year). It stays true while the
// register does not change: nobody is born, dies or moves yet. tests/settlement.test.ts fails when the file is not
// what a new world has.
//   npx tsx tools/sim/write_lots.ts 1291
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { newWorldState, dataPath, loadTilth } from './load';
import { aloneLandmarks, manyTownsLots, type TownLots } from '../../src/net/lots';
import { LOT_KIND, type WorldState } from '../../src/sim/state';
import { namedBridges } from '../../src/sim/content/bridges';

const r1 = (v: number) => Math.round(v * 10) / 10;
/** the landmarks of a town, each [kind, x, z, w, d, named, order, start, end, ruined] (src/net/lots.ts) */
const landmarksOf = (q: TownLots['landmarks']) => q.kind.map((k, i) => [k, r1(q.x[i]), r1(q.z[i]), r1(q.w[i]), r1(q.d[i]), q.named[i], q.order[i], q.start[i], q.end[i], q.ruined[i]]);

/** The file's content for a world: per town its site, the size of its parcels (all of a town are alike), and per
 *  parcel the middle, the street side and the persons living on it; its streets (`street` metres wide), each
 *  [x0, z0, x1, z1, kind] (STREET_KIND: the market is the square from corner to corner); then its hamlets: the middle of each (`east`,
 *  `south` of the town's centre), the size of its farmsteads and per farmstead the middle (east and south of the
 *  hamlet's middle), the side of the lane and the persons, and the order of the farmsteads' strips from the west;
 *  then the furlongs of the hamlets' fields (`fieldW` metres wide, tilled in `courses` courses), laid from `at`, the
 *  world block of the town's centre in the world graphic (src/sim/content/tilth.ts); for a town on a real plan that draws its ground, `ground`
 *  (src/net/lots.ts, unrounded: the graphic draws that ground by it); then its landmarks, the pieces of its wall (each [x0, z0, x1, z1, kind], kind a WALL_PIECE of src/sim/settlement/walls.ts), its bridges (each [x0, z0, x1, z1, kind, houses], kind a BRIDGE_KIND of src/sim/settlement/bridges.ts, houses 1 where houses stood on it), and at the end those that stand alone (`alone`, at their real place). All in metres at the scale of the houses (a block of the
 *  world graphic is 2 m), to a decimetre. */
export function lotsFile(s: WorldState, tilth = loadTilth(s.startYear)) {
  const sites = [...new Set(Array.from({ length: s.lot.size }, (_, i) => s.lot.cols.site[i]))].sort((a, b) => a - b);
  const named = namedBridges(s.startYear);
  const towns = manyTownsLots(s, sites).map((t) => {
    const of = (keep: (i: number) => boolean, x0 = 0, z0 = 0) => {
      const rows = t.id.map((_, i) => i).filter(keep);
      return { w: rows.length ? r1(t.w[rows[0]]) : 0, d: rows.length ? r1(t.d[rows[0]]) : 0, x: rows.map((i) => r1(t.x[i] - x0)), z: rows.map((i) => r1(t.z[i] - z0)), front: rows.map((i) => t.front[i]), persons: rows.map((i) => t.persons[i]) };
    };
    const st = t.streets, streets = st.kind.map((k, i) => [r1(st.x0[i]), r1(st.z0[i]), r1(st.x1[i]), r1(st.z1[i]), k]);
    // the furlongs of the hamlets' fields: the hamlet (its index in `hamlets`), the middle, the depth, the course and
    // the farmstead that holds it whole (its index among its hamlet's farmsteads, −1 in the open field)
    const q = t.fields, hk = new Map(t.hamlets.id.map((h, k) => [h, k])), within = new Map<number, number>();
    for (const h of t.hamlets.id) t.id.filter((_, i) => t.hamlet[i] === h).forEach((id, k) => { within.set(id, k); });
    const fields = { hamlet: q.hamlet.map((h) => hk.get(h)!), x: q.x.map(r1), z: q.z.map(r1), d: q.d.map(r1), zelge: q.zelge, farm: q.farm.map((f) => (f < 0 ? -1 : within.get(f)!)) };
    return { site: t.site, ...of((i) => t.kind[i] === LOT_KIND.parcel), street: st.width.find((v) => v > 0) ? r1(st.width.find((v) => v > 0)!) : 0, streets, hamlets: t.hamlets.id.map((h, k) => ({ east: r1(t.hamlets.x[k]), south: r1(t.hamlets.z[k]), ...of((i) => t.hamlet[i] === h, t.hamlets.x[k], t.hamlets.z[k]), strips: t.hamlets.strips[k].map((id) => within.get(id)!) })), courses: q.courses[0] ?? 0, fieldW: q.w.length ? r1(q.w[0]) : 0, ...(q.x.length && tilth?.centre(t.site) ? { at: tilth.centre(t.site)! } : {}), fields, landmarks: landmarksOf(t.landmarks), walls: t.walls.kind.map((k, i) => [r1(t.walls.x0[i]), r1(t.walls.z0[i]), r1(t.walls.x1[i]), r1(t.walls.z1[i]), k]), bridges: t.bridges.kind.map((k, i) => [r1(t.bridges.x0[i]), r1(t.bridges.z0[i]), r1(t.bridges.x1[i]), r1(t.bridges.z1[i]), k, t.bridges.named[i] >= 0 && named[t.bridges.named[i]]?.houses ? 1 : 0]), ...(t.ground ? { ground: t.ground } : {}) };
  });
  const a = aloneLandmarks(s), alone = a.kind.map((k, i) => [k, Math.round(a.lat[i] * 1e5) / 1e5, Math.round(a.lon[i] * 1e5) / 1e5, r1(a.w[i]), r1(a.d[i]), a.named[i], a.start[i], a.end[i], a.ruined[i]]);
  return { year: s.startYear, source: 'a new world of the year: src/sim/systems/lots.ts (tools/sim/write_lots.ts)', towns, alone };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const year = Number(process.argv[2] ?? 1291);
  const file = lotsFile(newWorldState(year, year).s);
  writeFileSync(dataPath(`lots_${year}.json`), `${JSON.stringify(file)}\n`);
  console.log(`lots_${year}.json: ${file.towns.length} towns, ${file.towns.reduce((n, t) => n + t.x.length, 0)} parcels, ${file.towns.reduce((n, t) => n + t.hamlets.length, 0)} hamlets, ${file.towns.reduce((n, t) => n + t.hamlets.reduce((m, h) => m + h.x.length, 0), 0)} farmsteads, ${file.towns.reduce((n, t) => n + t.fields.x.length, 0)} furlongs, ${file.towns.reduce((n, t) => n + t.landmarks.length, 0) + file.alone.length} landmarks, ${file.towns.reduce((n, t) => n + t.walls.length, 0)} wall pieces, ${file.towns.reduce((n, t) => n + t.bridges.length, 0)} bridges`);
}
