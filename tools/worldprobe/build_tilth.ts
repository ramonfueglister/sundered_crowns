// Writes public/data/tilth_<year>.json for the simulation's land register: the ground round every town with hamlets
// that a furlong of its fields can lie on (src/sim/content/tilth.ts, settlement feature 4).
//
// Every piece of the world round the towns is built once as the world graphic builds it at its finest step
// (src/worldprobe/world.ts with the same inputs as the worker), and settle tells, once the towns and hamlets stand and
// before the fields, which field lots of the grid have room for a furlong: dry ground without rock, nothing built,
// level to within two blocks with a balk round it, and no woods (settle.ts and world.ts `room`). The lots are surveyed
// as far round each town as its hamlets lie and their fields reach: the farthest hamlet of the town in the register
// (public/data/lots_<year>.json) and REACH times the radius of the disc that holds one hamlet's arable beyond it.
//
// Output: per town its site, the world block of its centre (`wx`, `wz`, as world.ts lays the register's furlongs
// from it), `dry` (1: the Mediterranean kind of land at the town, two courses) and a bit field of the lots round it
// from (`lx0`, `lz0`), `cols` by `rows`: row by row from north to south, west to east, the lowest bit first, 1 = a
// furlong can lie there.
//
//   npx tsx tools/worldprobe/build_tilth.ts 1291
//   for k in 0 1 2 3; do PART=$k/4 PARTS=/tmp/tilth npx tsx tools/worldprobe/build_tilth.ts 1291 & done; wait
//   PARTS=/tmp/tilth npx tsx tools/worldprobe/build_tilth.ts 1291      (four processes, then the file from their parts)
//
// Run it again when the towns, the hamlets, the forest or the ground change, then the land register's file
// (tools/sim/write_lots.ts) and the far view's tables (tools/worldprobe/build_tables.ts).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import gazetteer from '../../data/content/gazetteer.json';
import landmarks from '../../data/content/landmarks.json';
import { N } from '../../src/lookprobe/layout';
import { loadArable } from '../../src/worldprobe/arable';
import { loadClimate } from '../../src/worldprobe/climate';
import { loadForest } from '../../src/worldprobe/forest';
import { loadHamletLands } from '../../src/worldprobe/hamlets';
import { FINER, blockOfCell } from '../../src/worldprobe/land';
import { loadParcels } from '../../src/worldprobe/lots';
import { loadModels } from '../../src/worldprobe/models';
import { Water, loadWindow, projectionOf } from '../../src/worldprobe/region';
import { loadRural } from '../../src/worldprobe/rural';
import { loadInhabitants } from '../../src/worldprobe/towns';
import { buildWorld, windowOf } from '../../src/worldprobe/world';
import { FIELD_LOT, GEWANN_HA, COURSES_DRY, lotCorner } from '../../src/sim/settlement/fields';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const year = Number(process.argv[2] ?? 1291),
  base = '/';
globalThis.fetch = (async (url: string | URL | Request) => {
  const file = resolve(ROOT, 'public', String(url).replace(/^\//, ''));
  if (!existsSync(file)) return new Response(null, { status: 404 });
  return new Response(readFileSync(file), {
    headers: { 'content-type': file.endsWith('.json') ? 'application/json' : 'application/octet-stream' },
  });
}) as typeof fetch;

/** the pieces of the world graphic: 200 blocks a side with 100 round them (src/worldprobe/pieces.ts) */
const PIECE = 200,
  MARGIN = (N - PIECE) / 2;
/** how far beyond the farthest hamlet of a town the lots are surveyed, in radii of the disc that holds one hamlet's
 *  arable: the woods, the water and the other hamlets take some of the ground near it */
const REACH = 2.5;
/** no town's lots are surveyed farther than this from its centre, in blocks */
const MOST = 700;
const proj = await projectionOf('world', base, FINER),
  lands = await loadHamletLands(base, year),
  parcels = await loadParcels(base, year),
  inhabitants = await loadInhabitants(base, year);
if (!lands || !parcels) throw new Error(`hamletland_${year}.json and lots_${year}.json are needed`);

// the towns with hamlets and how far round each the lots are surveyed
const wanted = new Set<string>(),
  round: { site: number; wx: number; wz: number; r: number }[] = [];
const only = process.env.SITES ? new Set(process.env.SITES.split(',').map(Number)) : null;
for (const [site, t] of parcels) {
  if (only && !only.has(site)) continue;
  const h = lands.get(site),
    hs = t.hamlets ?? [];
  if (!h || !hs.length || !(h.km2 > 0)) continue;
  const p = gazetteer.places[site],
    [wx, wz] = blockOfCell(...proj.cellOf(p.lon, p.lat));
  const flur = Math.sqrt((((h.km2 * 100) / hs.length / GEWANN_HA) * FIELD_LOT.w * FIELD_LOT.d) / Math.PI);
  const r = Math.min(
    MOST,
    Math.ceil(Math.max(...hs.map((q) => Math.hypot(q.east, q.south) / 2)) + REACH * flur + FIELD_LOT.w),
  );
  round.push({ site, wx, wz, r });
  for (let pz = Math.floor((wz - r) / PIECE); pz <= Math.floor((wz + r) / PIECE); pz++)
    for (let px = Math.floor((wx - r) / PIECE); px <= Math.floor((wx + r) / PIECE); px++) wanted.add(`${px},${pz}`);
}
console.log(`${round.length} towns, ${wanted.size} pieces round them`);

/** the lots with room for a furlong (by their key), the world block of each town's centre and its courses */
const open = new Set<number>(),
  centres = new Map<number, [number, number]>(),
  dry = new Map<number, number>();
const key = (lx: number, lz: number) => (lx + 32768) * 65536 + lz + 32768;
const forest = (w: number, h: number) => loadForest(base, year, w, h);
let done = 0;
// PART=k/n builds only every n-th piece from the k-th and writes what it found to PARTS/<k>.json; with PARTS and no
// PART the parts are read and the file is written (the pieces are many: four processes build them four times as fast)
const [part, parts] = (process.env.PART ?? '').split('/').map(Number),
  dir = process.env.PARTS;
const pieces = [...wanted].sort().filter((_, i) => !(parts > 0) || i % parts === part);
if (dir && !(parts > 0))
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as {
      open: number[];
      centres: [number, number, number][];
      dry: [number, number][];
    };
    for (const k of j.open) open.add(k);
    for (const [site, x, z] of j.centres) centres.set(site, [x, z]);
    for (const [site, d] of j.dry) dry.set(site, d);
  }
for (const k of dir && !(parts > 0) ? [] : pieces) {
  const [px, pz] = k.split(',').map(Number);
  const piece = {
      ox: px * PIECE - MARGIN,
      oz: pz * PIECE - MARGIN,
      part: { x0: MARGIN, z0: MARGIN, x1: MARGIN + PIECE, z1: MARGIN + PIECE },
    },
    w = windowOf(piece.ox, piece.oz);
  const region = await loadWindow('world', w.gx0, w.gy0, w.w, w.h, base, FINER),
    mapW = region.worldW ?? region.mapW,
    mapH = region.worldH ?? region.mapH;
  if (!region.water.every((q) => q === Water.Sea))
    buildWorld(
      region,
      piece,
      gazetteer.places,
      landmarks.landmarks,
      true,
      0,
      await loadClimate(base, mapW, mapH),
      inhabitants,
      await loadModels(base),
      await forest(mapW, mapH),
      await loadRural(base, year, region.mapW, region.mapH),
      await loadArable(base, year, region.mapW, region.mapH),
      lands,
      parcels,
      undefined,
      null,
      {
        house() {},
        great() {},
        town() {},
        room: (fits, towns) => {
          // the lots whose furlong's north-west corner lies in this piece's own square
          const x0 = px * PIECE,
            z0 = pz * PIECE;
          for (let lz = Math.floor((z0 - 1) / FIELD_LOT.d); lz * FIELD_LOT.d + 1 < z0 + PIECE; lz++)
            for (let lx = Math.floor((x0 - 1) / FIELD_LOT.w) - 1; lx * FIELD_LOT.w < x0 + PIECE; lx++) {
              const [cx, cz] = lotCorner(lx, lz);
              if (cx < x0 || cx >= x0 + PIECE || cz < z0 || cz >= z0 + PIECE) continue;
              if (fits(lx, lz)) open.add(key(lx, lz));
            }
          for (const t of round) {
            if (Math.floor(t.wx / PIECE) !== px || Math.floor(t.wz / PIECE) !== pz) continue;
            const c = towns?.centre(t.site),
              q = towns?.courses(t.site);
            if (c) centres.set(t.site, c);
            if (q != null) dry.set(t.site, q === COURSES_DRY ? 1 : 0);
          }
        },
      },
    );
  if (++done % 50 === 0) console.log(`${done} of ${pieces.length} pieces: ${open.size} lots with room`);
}

if (parts > 0) {
  writeFileSync(
    resolve(dir!, `${part}.json`),
    JSON.stringify({ open: [...open], centres: [...centres].map(([site, [x, z]]) => [site, x, z]), dry: [...dry] }),
  );
  console.log(`part ${part} of ${parts}: ${open.size} lots with room`);
  process.exit(0);
}
const sites = round
  .sort((a, b) => a.site - b.site)
  .map(({ site, r }) => {
    const [wx, wz] = centres.get(site) ?? [0, 0];
    const lz0 = Math.floor((wz - r - 1) / FIELD_LOT.d),
      lz1 = Math.floor((wz + r - 1) / FIELD_LOT.d),
      lx0 = Math.floor((wx - r - 1) / FIELD_LOT.w) - 1,
      lx1 = Math.floor((wx + r - 1) / FIELD_LOT.w);
    const rows = lz1 - lz0 + 1,
      cols = lx1 - lx0 + 1,
      bits = new Uint8Array(Math.ceil((rows * cols) / 8));
    for (let rz = 0; rz < rows; rz++)
      for (let cx = 0; cx < cols; cx++) {
        const lx = lx0 + cx,
          lz = lz0 + rz,
          [x, z] = lotCorner(lx, lz);
        if (Math.hypot(x + 5 - wx, z + 3.5 - wz) > r || !open.has(key(lx, lz))) continue;
        const k = rz * cols + cx;
        bits[k >> 3] |= 1 << (k & 7);
      }
    return { site, wx, wz, dry: dry.get(site) ?? 0, lx0, lz0, cols, rows, cells: Buffer.from(bits).toString('base64') };
  })
  .filter((t) => centres.has(t.site));
writeFileSync(
  process.env.OUT ?? resolve(ROOT, `public/data/tilth_${year}.json`),
  `${JSON.stringify({ year, about: 'The field lots of the world graphic round every town with hamlets on which a furlong can lie (dry, no rock, nothing built, level, no woods), per site of the gazetteer: the world block of its centre, dry = 1 for the Mediterranean kind of land (two courses), and a bit field of the lots from (lx0, lz0), cols by rows. Written by tools/worldprobe/build_tilth.ts.', sites })}\n`,
);
console.log(`tilth_${year}.json: ${sites.length} towns, ${open.size} lots with room`);
