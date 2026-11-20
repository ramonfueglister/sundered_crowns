// Writes public/map/tables/world_<year>/: the tables of the world's pieces of the coarse steps, from which the world
// graphic draws those pieces without building them (src/worldprobe/table.ts; the worker reads them,
// src/worldprobe/piece.worker.ts).
//
// Every piece of the steps 1 to 7 that reaches into the world's frame is built once as the worker builds it
// (src/worldprobe/build.ts), and the table of its columns is kept: <step>/<px>_<pz>.tab, zipped with Brotli (step 1: in packs, see TablesIndex.packs). index.json lists the
// pieces that have a table and those that are open sea, and holds a stamp of every file the tables were built from.
//
// The tables must be built again when the land's shape or what covers it changes: the map's data, the plan of the
// places, world.ts, far.ts. They hold nothing of the look (the colours of grass, rock and shore, the light), which is
// worked out when a table is drawn.
//
//   npx tsx tools/worldprobe/build_tables.ts 1291              (all of it, on as many processes as the machine has cores)
//   npx tsx tools/worldprobe/build_tables.ts 1291 6,7          (only these steps; the index lists what lies in the folder)
//   npx tsx tools/worldprobe/build_tables.ts 1291 4 2.35,48.86 (a trial: the pieces of the step round a place)
//   npx tsx tools/worldprobe/build_tables.ts 1291 check        (builds one piece in fifty again and tells which tables differ)
//   TABLES_RESUME=1 npx tsx tools/worldprobe/build_tables.ts 1291 1  (goes on with a build of the same steps that was cut
//                                                                     off: keeps the tables it wrote, builds the rest)
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, brotliDecompressSync, constants, gunzipSync } from 'node:zlib';
import { buildPiece } from '../../src/worldprobe/build';
import { extentOf } from '../../src/worldprobe/extent';
import { FINER, blockOfCell, cellOfBlock } from '../../src/worldprobe/land';
import { projectionOf } from '../../src/worldprobe/region';
import { type TablesIndex, keepTables, packTable, tabled, whereTable, withThings } from '../../src/worldprobe/table';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const year = Number(process.argv[2] ?? 1291),
  base = '/',
  name = 'world';
/** the pieces of the world graphic and the ground a far piece is built on: 200 blocks a side with 32 round them (src/worldprobe/piece_sight.ts PIECE, pieces.ts NARROW) */
const PIECE = 200,
  MARGIN = 32,
  SIDE = PIECE + 2 * MARGIN,
  STEPS = [1, 2, 3, 4, 5, 6, 7];
/** the steps whose tables are put into packs of so many pieces each way (TablesIndex.packs): step 1 has some 16 000, too many files for a deployment */
const PACKED: Record<number, number> = { 1: 4 };
const checking = process.argv[3] === 'check',
  steps = !checking && process.argv[3] ? process.argv[3].split(',').map(Number) : STEPS;
const dir = resolve(ROOT, `public/map/tables/${name}_${year}`);
/** the files of public/ the tables were built from, each with a stamp of its content */
const inputs: Record<string, string> = {};
// the loaders of the world graphic fetch the map's data from the page's base: here they read the files of public/
globalThis.fetch = (async (url: string | URL | Request) => {
  const file = resolve(ROOT, 'public', String(url).replace(/^\//, '')),
    at = String(url).replace(/^\//, '');
  if (!existsSync(file)) return new Response(null, { status: 404 });
  const bytes = readFileSync(file);
  if (/^(data|map\/[^/]+$)/.test(at)) inputs[at] = createHash('sha1').update(bytes).digest('hex').slice(0, 12);
  return new Response(bytes, {
    headers: { 'content-type': file.endsWith('.json') ? 'application/json' : 'application/octet-stream' },
  });
}) as typeof fetch;
for (const file of ['gazetteer.json', 'landmarks.json'])
  inputs[`content/${file}`] = createHash('sha1')
    .update(readFileSync(resolve(ROOT, 'data/content', file)))
    .digest('hex')
    .slice(0, 12);

// the pieces of a step that reach into the world's frame: those whose square, seen in the frame's cells, touches it
const projection = await projectionOf(name, base, FINER),
  frame = extentOf(projection);
const wanted: { step: number; px: number; pz: number }[] = [];
for (const step of steps) {
  const side = PIECE * 2 ** step,
    corners = [
      [frame.west, frame.north],
      [frame.east, frame.north],
      [frame.west, frame.south],
      [frame.east, frame.south],
    ];
  // (cells and blocks are turned against each other: the frame's corners in blocks give the pieces to look at)
  const xs = corners.map(([u, v]) => blockOfCell(u, v)[0]),
    zs = corners.map(([u, v]) => blockOfCell(u, v)[1]);
  for (let pz = Math.floor(Math.min(...zs) / side); pz <= Math.floor(Math.max(...zs) / side); pz++)
    for (let px = Math.floor(Math.min(...xs) / side); px <= Math.floor(Math.max(...xs) / side); px++) {
      const us: number[] = [],
        vs: number[] = [];
      for (const [x, z] of [
        [px, pz],
        [px + 1, pz],
        [px, pz + 1],
        [px + 1, pz + 1],
      ]) {
        const [u, v] = cellOfBlock(x * side, z * side);
        us.push(u);
        vs.push(v);
      }
      if (
        Math.max(...us) >= frame.west &&
        Math.min(...us) <= frame.east &&
        Math.max(...vs) >= frame.north &&
        Math.min(...vs) <= frame.south
      )
        wanted.push({ step, px, pz });
    }
}
if (!checking && process.argv[4]) {
  const [lon, lat] = process.argv[4].split(',').map(Number),
    [u, v] = projection.cellOf(lon, lat);
  const near = wanted.filter((w) => {
    const side = PIECE * 2 ** w.step,
      us: number[] = [],
      vs: number[] = [];
    for (const [x, z] of [
      [w.px, w.pz],
      [w.px + 1, w.pz],
      [w.px, w.pz + 1],
      [w.px + 1, w.pz + 1],
    ]) {
      const c = cellOfBlock(x * side, z * side);
      us.push(c[0]);
      vs.push(c[1]);
    }
    return (
      u >= Math.min(...us) - side &&
      u <= Math.max(...us) + side &&
      v >= Math.min(...vs) - side &&
      v <= Math.max(...vs) + side
    );
  });
  wanted.length = 0;
  wanted.push(...near);
}

/** The table of a piece, zipped; 'sea' where the piece is open sea, and why not where the piece is not drawn from its columns alone. */
async function tableOf(w: { step: number; px: number; pz: number }): Promise<Buffer | 'sea' | string> {
  const piece = {
    ox: w.px * PIECE - MARGIN,
    oz: w.pz * PIECE - MARGIN,
    part: { x0: MARGIN, z0: MARGIN, x1: MARGIN + PIECE, z1: MARGIN + PIECE },
  };
  keepTables(true);
  const built = await buildPiece({ region: name, base, bakedSky: true, year, grid: SIDE }, w.step, piece),
    table = tabled();
  keepTables(false);
  if (!built) return 'sea';
  if (!table) return 'no table';
  // (what stands on a piece is kept with its table where it is one mesh: the landmarks, bridges and ribbons of step 2; houses of a cell and people are not)
  if (built.cells.length || built.figures) return `houses or people on it (${built.cells.length} cells)`;
  return zipTable(new Uint8Array(packTable(withThings(table, built.things))));
}
const fileOf = (w: { step: number; px: number; pz: number }) => resolve(dir, `${w.step}`, `${w.px}_${w.pz}.tab`);
/** A packed table zipped as the tables are (TablesIndex.coding 'br'): Brotli at quality 10, a fifth smaller than gzip (11 saves another 5 % at four times the time). */
function zipTable(run: Uint8Array): Buffer {
  return brotliCompressSync(run, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 10,
      [constants.BROTLI_PARAM_LGWIN]: 22,
      [constants.BROTLI_PARAM_SIZE_HINT]: run.length,
    },
  });
}
/** A kept table's bytes unzipped, as the index says they are zipped. */
const unzipTable = (index: TablesIndex, bytes: Buffer) =>
  index.coding === 'br' ? brotliDecompressSync(bytes) : gunzipSync(bytes);

/** The kept table of a piece, unzipped, from its own file or its pack; null where there is none. */
function keptTable(w: { step: number; px: number; pz: number }): Buffer | null {
  const index: TablesIndex = JSON.parse(readFileSync(resolve(dir, 'index.json'), 'utf8')),
    at = index.land[w.step] ?? [];
  let k = -1;
  for (let i = 0; i < at.length; i += 2)
    if (at[i] === w.px && at[i + 1] === w.pz) {
      k = i / 2;
      break;
    }
  if (k < 0) return null;
  const { file, range } = whereTable(index, w.step, w.px, w.pz, k),
    bytes = readFileSync(resolve(dir, file));
  return unzipTable(index, range ? bytes.subarray(range[0], range[0] + range[1]) : bytes);
}

if (checking) {
  // one table in fifty is built again and held against the file
  let differ = 0,
    held = 0;
  for (const w of wanted.filter((_, k) => k % 50 === 0)) {
    const now = await tableOf(w),
      was = keptTable(w);
    held++;
    if (typeof now === 'string' ? was !== null : !was || !brotliDecompressSync(now).equals(was)) {
      differ++;
      console.log(
        `step ${w.step} piece ${w.px},${w.pz}: ${typeof now === 'string' ? now : was ? 'differs' : 'has no table'}`,
      );
    }
  }
  console.log(
    `${held} pieces held against their tables: ${differ} differ${differ ? ' (build the tables again: npx tsx tools/worldprobe/build_tables.ts ' + year + ')' : ''}`,
  );
  process.exit(differ ? 1 : 0);
}

const share = process.env.TABLES_SHARE?.split('/').map(Number),
  resume = process.env.TABLES_RESUME === '1';
if (!share) {
  // the pieces are shared out among as many processes as the machine has cores; each writes its tables and what it found
  const n = Math.max(1, Math.min(cpus().length, Math.ceil(wanted.length / 4)));
  console.log(`${wanted.length} pieces of steps ${steps.join(', ')} on ${n} processes`);
  // (going on with a build that was cut off: its tables stay, but not one it was writing as it stopped)
  for (const step of steps) {
    if (!resume) rmSync(resolve(dir, `${step}`), { recursive: true, force: true });
    mkdirSync(resolve(dir, `${step}`), { recursive: true });
    for (const f of readdirSync(resolve(dir, `${step}`))) if (f.endsWith('.part')) rmSync(resolve(dir, `${step}`, f));
  }
  const codes = await Promise.all(
    Array.from(
      { length: n },
      (_, k) =>
        new Promise<number>((done) =>
          spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
            stdio: 'inherit',
            env: { ...process.env, TABLES_SHARE: `${k}/${n}` },
          }).on('exit', (code) => done(code ?? 1)),
        ),
    ),
  );
  if (codes.some((c) => c)) {
    console.error('a process failed: no index written');
    process.exit(1);
  }
  // the index lists what lies in the folder, of all steps
  const found: {
    land: Record<string, number[]>;
    sea: Record<string, number[]>;
    odd: string[];
    inputs: Record<string, string>;
  } = { land: {}, sea: {}, odd: [], inputs: {} };
  for (let k = 0; k < n; k++) {
    const part = JSON.parse(readFileSync(resolve(dir, `found.${k}.json`), 'utf8')) as typeof found;
    for (const [step, at] of Object.entries(part.sea)) {
      found.sea[step] ??= [];
      found.sea[step].push(...at);
    }
    found.odd.push(...part.odd);
    Object.assign(found.inputs, part.inputs);
    rmSync(resolve(dir, `found.${k}.json`));
  }
  const before: TablesIndex | null = existsSync(resolve(dir, 'index.json'))
    ? JSON.parse(readFileSync(resolve(dir, 'index.json'), 'utf8'))
    : null;
  let files = 0,
    bytes = 0;
  const packs: Record<string, { by: number; at: number[] }> = {};
  for (const step of STEPS) {
    const here = resolve(dir, `${step}`);
    if (!existsSync(here)) continue;
    // (a packed step that was not built now is what the index held before)
    if (PACKED[step] && !steps.includes(step)) {
      if (before?.packs?.[step]) {
        found.land[step] = before.land[step];
        packs[step] = before.packs[step];
        files += before.land[step].length / 2;
        for (const f of readdirSync(here)) bytes += readFileSync(resolve(here, f)).length;
      }
      if (before?.sea[step]) found.sea[step] = before.sea[step];
      continue;
    }
    const at: number[] = [];
    for (const file of readdirSync(here).sort()) {
      const m = /^(-?\d+)_(-?\d+)\.tab$/.exec(file);
      if (m) {
        at.push(+m[1], +m[2]);
        files++;
        bytes += readFileSync(resolve(here, file)).length;
      }
    }
    found.land[step] = at;
    if (PACKED[step]) {
      // the tables of by × by pieces one after the other in a pack, and where each lies in it
      const by = PACKED[step],
        groups = new Map<string, number[]>(),
        where: number[] = [];
      for (let k = 0; k < at.length; k += 2) {
        const g = `${Math.floor(at[k] / by)}_${Math.floor(at[k + 1] / by)}`;
        groups.set(g, [...(groups.get(g) ?? []), k / 2]);
      }
      for (const [g, members] of groups) {
        const parts = members.map((k) => readFileSync(resolve(here, `${at[k * 2]}_${at[k * 2 + 1]}.tab`)));
        let offset = 0;
        members.forEach((k, j) => {
          where[k * 2] = offset;
          where[k * 2 + 1] = parts[j].length;
          offset += parts[j].length;
        });
        writeFileSync(resolve(here, `${g}.bin`), Buffer.concat(parts));
      }
      for (let k = 0; k < at.length; k += 2) rmSync(resolve(here, `${at[k]}_${at[k + 1]}.tab`));
      packs[step] = { by, at: where };
    }
    // (the open sea of a step that was not built now is what the index held before)
    if (!found.sea[step] && before?.sea[step]) found.sea[step] = before.sea[step];
  }
  const index: TablesIndex = {
    about:
      "The tables of the world graphic's pieces of the coarse steps (src/worldprobe/table.ts): land lists the pieces that have one (<step>/<px>_<pz>.tab, or in packs where packs says so; zipped with Brotli), sea those that are open sea, each step as pairs px, pz. Written by tools/worldprobe/build_tables.ts; to be built again when the land's shape or cover changes.",
    region: name,
    year,
    piece: PIECE,
    side: SIDE,
    steps: Object.keys(found.land).map(Number),
    land: found.land,
    sea: found.sea,
    inputs: { ...before?.inputs, ...found.inputs },
    ...(Object.keys(packs).length ? { packs } : {}),
    coding: 'br',
  };
  writeFileSync(resolve(dir, 'index.json'), JSON.stringify(index));
  for (const odd of found.odd) console.log(`not drawn from a table: ${odd}`);
  console.log(
    `tables/${name}_${year}: ${files} tables, ${(bytes / 1e6).toFixed(1)} MB; open sea: ${Object.values(found.sea).reduce((s, at) => s + at.length / 2, 0)} pieces`,
  );
} else {
  const [k, n] = share,
    sea: Record<string, number[]> = {},
    odd: string[] = [];
  let done = 0;
  const mine = wanted.filter((_, i) => i % n === k);
  for (const w of mine) {
    if (resume && existsSync(fileOf(w))) {
      if (++done % 25 === 0 && k === 0) console.log(`${done * n} of ${wanted.length} pieces`);
      continue;
    }
    const table = await tableOf(w);
    if (table === 'sea') {
      sea[w.step] ??= [];
      sea[w.step].push(w.px, w.pz);
    } else if (typeof table === 'string') odd.push(`step ${w.step} piece ${w.px},${w.pz}: ${table}`);
    // (written whole or not at all, for a build that goes on after it was cut off)
    else {
      writeFileSync(`${fileOf(w)}.part`, table);
      renameSync(`${fileOf(w)}.part`, fileOf(w));
    }
    if (++done % 25 === 0 && k === 0) console.log(`${done * n} of ${wanted.length} pieces`);
  }
  writeFileSync(resolve(dir, `found.${k}.json`), JSON.stringify({ land: {}, sea, odd, inputs }));
}
