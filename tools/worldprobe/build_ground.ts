// Writes public/data/ground_<year>.json: the building ground of every town of the world graphic, for the
// simulation's land register (src/sim/systems/lots.ts lays its parcels where a house can stand).
//
// For every town with people in public/data/towns_<year>.json the ground is built as the world graphic builds it
// at its finest step (src/worldprobe/world.ts: heights, water, rock, the town's great buildings and the monuments),
// and every block round the town's middle is asked whether it can carry a house (settle.ts `Survey`). A block is
// 2 m at the scale of the houses.
//
// Output per town: `site` (index of the gazetteer), `w` and `d` (blocks, odd; the middle block is the town's
// centre), `cells`: base64 of a bit field, rows from north to south, in a row from west to east, the lowest bit of a
// byte first, 1 = a house can stand.
//
//   npx tsx tools/worldprobe/build_ground.ts 1291
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import gazetteer from '../../data/content/gazetteer.json';
import landmarks from '../../data/content/landmarks.json';
import { N } from '../../src/lookprobe/layout';
import { loadClimate } from '../../src/worldprobe/climate';
import { loadForest } from '../../src/worldprobe/forest';
import { FINER, blockOfCell } from '../../src/worldprobe/land';
import { loadModels } from '../../src/worldprobe/models';
import { loadWindow, projectionOf } from '../../src/worldprobe/region';
import { inhabitantsOf, type TownsJson } from '../../src/worldprobe/towns';
import { buildWorld, windowOf } from '../../src/worldprobe/world';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const year = Number(process.argv[2] ?? 1291), base = '/';
// the loaders of the world graphic fetch the map's data from the page's base: here they read the files of public/
globalThis.fetch = (async (url: string | URL | Request) => {
  const file = resolve(ROOT, 'public', String(url).replace(/^\//, ''));
  if (!existsSync(file)) return new Response(null, { status: 404 });
  return new Response(readFileSync(file), { headers: { 'content-type': file.endsWith('.json') ? 'application/json' : 'application/octet-stream' } });
}) as typeof fetch;
/** the pieces of the world graphic: 200 blocks a side with 100 round them (src/worldprobe/pieces.ts) */
const PIECE = 200, MARGIN = (N - PIECE) / 2;
/** how far from its middle a town is surveyed, in blocks: wider the more people it has, never beyond its piece's margin */
const reachOf = (people: number) => Math.min(MARGIN - 4, Math.round(24 + 0.9 * Math.sqrt(people / 100)) * 2);

const towns = JSON.parse(readFileSync(resolve(ROOT, `public/data/towns_${year}.json`), 'utf8')) as TownsJson;
const inhabitants = inhabitantsOf(towns), proj = await projectionOf('world', base, FINER);
const pieces = new Map<string, { px: number; pz: number; sites: number[] }>();
for (const site of inhabitants.keys()) {
  const p = gazetteer.places[site], [wx, wz] = blockOfCell(...proj.cellOf(p.lon, p.lat)), px = Math.floor(wx / PIECE), pz = Math.floor(wz / PIECE), key = `${px},${pz}`;
  pieces.set(key, { px, pz, sites: [...(pieces.get(key)?.sites ?? []), site] });
}
const out: { site: number; w: number; d: number; cells: string }[] = [];
let done = 0;
for (const { px, pz, sites } of pieces.values()) {
  const piece = { ox: px * PIECE - MARGIN, oz: pz * PIECE - MARGIN, part: { x0: MARGIN, z0: MARGIN, x1: MARGIN + PIECE, z1: MARGIN + PIECE } }, w = windowOf(piece.ox, piece.oz);
  const region = await loadWindow('world', w.gx0, w.gy0, w.w, w.h, base, FINER), mapW = region.worldW ?? region.mapW, mapH = region.worldH ?? region.mapH;
  buildWorld(region, piece, gazetteer.places, landmarks.landmarks, true, 0, await loadClimate(base, mapW, mapH), inhabitants, await loadModels(base), await loadForest(base, year, mapW, mapH), null, null, null, null, (s, free) => {
    if (!sites.includes(s.id)) return;
    const reach = reachOf(inhabitants.get(s.id)!), side = 2 * reach + 1, bits = new Uint8Array(Math.ceil((side * side) / 8));
    for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) if (free(dx, dz)) { const k = (dz + reach) * side + dx + reach; bits[k >> 3] |= 1 << (k & 7); }
    out.push({ site: s.id, w: side, d: side, cells: Buffer.from(bits).toString('base64') });
  });
  if (++done % 20 === 0) console.log(`${done} of ${pieces.size} pieces`);
}
out.sort((a, b) => a.site - b.site);
const path = resolve(ROOT, `public/data/ground_${year}.json`);
writeFileSync(path, JSON.stringify({ year, about: 'Building ground of the towns of the world graphic, per site of the gazetteer: w x d blocks of 2 m round the centre, rows north to south, bit 1 = a house can stand. Written by tools/worldprobe/build_ground.ts.', metresPerBlock: 2, sites: out }) + '\n');
console.log(`ground_${year}.json: ${out.length} of ${inhabitants.size} towns`);
