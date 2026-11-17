// Writes public/data/plan_<year>.json: what the finest step of the world graphic builds in its places, for the far
// steps to draw the same places from (src/worldprobe/far.ts).
//
// Every piece of the world that holds a town, one of its hamlets or a monument is built once as the world graphic
// builds it at its finest step (src/worldprobe/world.ts with the same inputs as the worker), and settle tells its
// houses, great buildings and walled towns as it builds them (settle.ts `Told`). All in blocks of the finest step in
// the world (the `wx`, `wz` of land.ts), which are 1 / `finer` of a cell of the world map.
//
// The file must be built again when the persons, the hamlets, the parcels, the forest or the ground change: `inputs`
// holds a stamp of each file it was built from, so that a stale plan can be told.
//
// Output: `pieces` maps "px,pz" to what stands in the square of `pieceBlocks` blocks from (px, pz) * pieceBlocks:
//   houses: flat, 9 numbers a house: x, z, w, d, floors, height (tenths of a block), wall, roof (0xRRGGBB), kind
//           (index of `houseKinds`)
//   greats: flat, 7 numbers a building: kind (index of `greatKinds`), x, z, w, d, height (tenths), site (-1 a monument)
//   towns:  the walled towns: site, cx, cz, half (the paved square is 2 * half wide), wall: null or its openings
//           (side nz | px | pz | nx, from and to along the side from its middle; buildings/fortified/town-wall.ts)
//
// It also writes public/data/dry_<year>.json for the simulation's land register: round every town with hamlets, as
// far as its hamlets may lie or the register asks (DRY_REACH=<file>, at most 260 blocks), whether a block is dry ground without rock. Same shape as
// ground_<year>.json (build_ground.ts): per site `w`, `d` (odd, the middle block is the town's centre) and `cells`,
// base64 of a bit field, rows north to south, west to east, lowest bit first, 1 = dry and no rock. It says nothing
// of slopes and buildings: the ground of a hamlet is levelled when it is built.
//
//   npx tsx tools/worldprobe/build_plan.ts 1291
//   DRY_REACH=dry_reach_1291.json npx tsx tools/worldprobe/build_plan.ts 1291
//   npx tsx tools/worldprobe/build_plan.ts 1291 2.35,48.86 /tmp/paris.json   (a trial: only the nine pieces round a place)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import gazetteer from '../../data/content/gazetteer.json';
import landmarks from '../../data/content/landmarks.json';
import { N } from '../../src/lookprobe/layout';
import { loadArable } from '../../src/worldprobe/arable';
import { loadClimate } from '../../src/worldprobe/climate';
import { loadForest } from '../../src/worldprobe/forest';
import { hamletsOf, loadHamletLands } from '../../src/worldprobe/hamlets';
import { FINER, blockOfCell } from '../../src/worldprobe/land';
import { loadParcels } from '../../src/worldprobe/lots';
import { loadModels } from '../../src/worldprobe/models';
import { Water, loadWindow, projectionOf } from '../../src/worldprobe/region';
import { loadRural } from '../../src/worldprobe/rural';
import { PEOPLE_PER_PERSON, firstHalf } from '../../src/worldprobe/settle';
import { loadInhabitants } from '../../src/worldprobe/towns';
import { buildWorld, windowOf } from '../../src/worldprobe/world';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const year = Number(process.argv[2] ?? 1291), base = '/';
/** the files of public/ the world was built from, each with a stamp of its content */
const inputs: Record<string, string> = {};
// the loaders of the world graphic fetch the map's data from the page's base: here they read the files of public/
globalThis.fetch = (async (url: string | URL | Request) => {
  const name = String(url).replace(/^\//, ''), file = resolve(ROOT, 'public', name);
  if (!existsSync(file)) return new Response(null, { status: 404 });
  const bytes = readFileSync(file);
  if (/^(data|map\/[^/]+$)/.test(name)) inputs[name] = createHash('sha1').update(bytes).digest('hex').slice(0, 12);
  return new Response(bytes, { headers: { 'content-type': file.endsWith('.json') ? 'application/json' : 'application/octet-stream' } });
}) as typeof fetch;
for (const name of ['gazetteer.json', 'landmarks.json']) inputs[`content/${name}`] = createHash('sha1').update(readFileSync(resolve(ROOT, 'data/content', name))).digest('hex').slice(0, 12);

/** the pieces of the world graphic: 200 blocks a side with 100 round them (src/worldprobe/pieces.ts) */
const PIECE = 200, MARGIN = (N - PIECE) / 2, KM_PER_DEGREE = 111.32;
const HOUSE_KINDS = ['town', 'village', 'hamlet', 'farm'] as const, greatKinds: string[] = [];
const proj = await projectionOf('world', base, FINER), lands = await loadHamletLands(base, year), inhabitants = await loadInhabitants(base, year);

/** the dry ground is written at most this far from a town's middle, in blocks */
const DRY_MOST = 260;
/** how far the land register needs the dry ground round each town: `{reach: {site: blocks}}`, the file named by DRY_REACH (tools/sim of the land register writes it) */
const asked: Record<string, number> = process.env.DRY_REACH ? (JSON.parse(readFileSync(process.env.DRY_REACH, 'utf8')) as { reach: Record<string, number> }).reach : {};
// the pieces that hold a town, one of its hamlets (they lie within the town's reach, world.ts) or a monument
const wanted = new Set<string>(), round: { site: number; wx: number; wz: number; r: number }[] = [];
const want = (wx: number, wz: number, r: number) => { for (let pz = Math.floor((wz - r) / PIECE); pz <= Math.floor((wz + r) / PIECE); pz++) for (let px = Math.floor((wx - r) / PIECE); px <= Math.floor((wx + r) / PIECE); px++) wanted.add(`${px},${pz}`); };
gazetteer.places.forEach((p, id) => {
  const h = lands?.get(id), [wx, wz] = blockOfCell(...proj.cellOf(p.lon, p.lat));
  if (lands ? !h : !inhabitants.has(id)) return;
  if (!h) return want(wx, wz, 90);
  const east = blockOfCell(...proj.cellOf(p.lon + 0.1, p.lat)), perKm = Math.hypot(east[0] - wx, east[1] - wz) / (0.1 * KM_PER_DEGREE * Math.cos((p.lat * Math.PI) / 180));
  const n = hamletsOf(h.families), inner = firstHalf(h.inside * PEOPLE_PER_PERSON) + 10;
  // as far as the hamlets lie in the world graphic, and as far as the land register asks for (DRY_REACH)
  const far = Math.min(DRY_MOST, Math.max(90, 0.8 * h.reachKm * perKm, inner + 5 * Math.sqrt(n), asked[id] ?? 0) + 20);
  want(wx, wz, far);
  round.push({ site: id, wx: Math.floor(wx), wz: Math.floor(wz), r: Math.ceil(far) });
});
for (const l of landmarks.landmarks) want(...blockOfCell(...proj.cellOf(l.lon, l.lat)), 30);
if (process.argv[3]) {
  const [lon, lat] = process.argv[3].split(',').map(Number), [wx, wz] = blockOfCell(...proj.cellOf(lon, lat)), px = Math.floor(wx / PIECE), pz = Math.floor(wz / PIECE);
  for (const key of [...wanted]) { const [x, z] = key.split(',').map(Number); if (Math.abs(x - px) > 1 || Math.abs(z - pz) > 1) wanted.delete(key); }
}

console.log(`${wanted.size} pieces to build`);
interface Walled { site: number; cx: number; cz: number; half: number; wall: { side: string; from: number; to: number }[] | null }
const pieces: Record<string, { houses: number[]; greats: number[]; towns: Walled[] }> = {};
/** per piece that was built, its own square: 1 where the ground is dry and no rock */
const dry = new Map<string, Uint8Array>();
const hex = (c: readonly [number, number, number]) => (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255);
const tenths = (v: number) => Math.round(v * 10);
let done = 0, houses = 0, greats = 0, towns = 0;
for (const key of [...wanted].sort()) {
  const [px, pz] = key.split(',').map(Number);
  const piece = { ox: px * PIECE - MARGIN, oz: pz * PIECE - MARGIN, part: { x0: MARGIN, z0: MARGIN, x1: MARGIN + PIECE, z1: MARGIN + PIECE } }, w = windowOf(piece.ox, piece.oz);
  const region = await loadWindow('world', w.gx0, w.gy0, w.w, w.h, base, FINER), mapW = region.worldW ?? region.mapW, mapH = region.worldH ?? region.mapH;
  const here = { houses: [] as number[], greats: [] as number[], towns: [] as Walled[] };
  if (!region.water.every((k) => k === Water.Sea)) buildWorld(region, piece, gazetteer.places, landmarks.landmarks, true, 0, await loadClimate(base, mapW, mapH), inhabitants, await loadModels(base), await loadForest(base, year, mapW, mapH), await loadRural(base, year, region.mapW, region.mapH), await loadArable(base, year, region.mapW, region.mapH), lands, await loadParcels(base, year), undefined, {
    house: (l, kind, height) => { here.houses.push(l.x + piece.ox, l.z + piece.oz, l.w, l.d, l.floors, tenths(height), hex(l.wall), hex(l.roof), HOUSE_KINDS.indexOf(kind)); },
    great: (kind, x, z, gw, gd, _y, height, site) => { if (!greatKinds.includes(kind)) greatKinds.push(kind); here.greats.push(greatKinds.indexOf(kind), x + piece.ox, z + piece.oz, gw, gd, tenths(height), site); },
    town: (site, cx, cz, half, _y, wall) => { here.towns.push({ site, cx: cx + piece.ox, cz: cz + piece.oz, half, wall: wall && wall.map((g) => ({ ...g })) }); },
    dry: (at) => { const bits = new Uint8Array(PIECE * PIECE); for (let z = 0; z < PIECE; z++) for (let x = 0; x < PIECE; x++) bits[z * PIECE + x] = at(x + MARGIN, z + MARGIN) ? 1 : 0; dry.set(key, bits); },
  });
  if (here.houses.length + here.greats.length + here.towns.length) { pieces[key] = here; houses += here.houses.length / 9; greats += here.greats.length / 7; towns += here.towns.length; }
  if (++done % 50 === 0) console.log(`${done} of ${wanted.size} pieces: ${houses} houses, ${greats} great buildings, ${towns} walled towns`);
}
const path = process.argv[4] ?? resolve(ROOT, `public/data/plan_${year}.json`);
writeFileSync(path, JSON.stringify({ year, about: 'What the finest step of the world graphic builds in its places, per piece of pieceBlocks finest blocks: houses (9 numbers each: x, z, w, d, floors, height in tenths, wall, roof, kind), greats (7 each: kind, x, z, w, d, height in tenths, site), walled towns. Written by tools/worldprobe/build_plan.ts.', finer: FINER, pieceBlocks: PIECE, houseKinds: HOUSE_KINDS, greatKinds, inputs, pieces }) + '\n');
const sites = round.sort((a, b) => a.site - b.site).map(({ site, wx, wz, r }) => {
  const side = 2 * r + 1, bits = new Uint8Array(Math.ceil((side * side) / 8));
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const x = wx + dx, z = wz + dz, px = Math.floor(x / PIECE), pz = Math.floor(z / PIECE);
    if (dry.get(`${px},${pz}`)?.[(z - pz * PIECE) * PIECE + x - px * PIECE]) { const k = (dz + r) * side + dx + r; bits[k >> 3] |= 1 << (k & 7); }
  }
  return { site, w: side, d: side, cells: Buffer.from(bits).toString('base64') };
});
if (!process.argv[3]) writeFileSync(resolve(ROOT, `public/data/dry_${year}.json`), JSON.stringify({ year, about: 'Dry ground without rock round the towns of the world graphic, per site of the gazetteer: w x d blocks of 2 m at the scale of the houses round the centre, rows north to south, bit 1 = dry and no rock; nothing is said of slopes and buildings. Written by tools/worldprobe/build_plan.ts.', metresPerBlock: 2, sites }) + '\n');
console.log(`dry_${year}.json: ${sites.length} towns`);
console.log(`plan_${year}.json: ${Object.keys(pieces).length} pieces, ${houses} houses, ${greats} great buildings, ${towns} walled towns`);
