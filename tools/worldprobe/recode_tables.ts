// Zips the kept tables of the world graphic (public/map/tables/world_<year>/) anew with Brotli where they were
// zipped with gzip, without building them again: each table is unzipped, zipped as build_tables.ts zips it now and
// written back in its place (its own file <step>/<px>_<pz>.tab, or its pack, whose ranges in the index follow).
// Every table is checked to unzip to the very bytes it held before.
//
//   npx tsx tools/worldprobe/recode_tables.ts 1291
import { spawn } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, brotliDecompressSync, constants, gunzipSync } from 'node:zlib';
import { type TablesIndex, whereTable } from '../../src/worldprobe/table';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const year = Number(process.argv[2] ?? 1291), dir = resolve(ROOT, `public/map/tables/world_${year}`);
const index: TablesIndex = JSON.parse(readFileSync(resolve(dir, 'index.json'), 'utf8'));
if (index.coding === 'br') { console.log('the tables are zipped with Brotli already'); process.exit(0); }
const zip = (run: Uint8Array) => brotliCompressSync(run, { params: { [constants.BROTLI_PARAM_QUALITY]: 10, [constants.BROTLI_PARAM_LGWIN]: 22, [constants.BROTLI_PARAM_SIZE_HINT]: run.length } });

/** every table, as the step, the piece and its place in its step's list */
const all: { step: number; px: number; pz: number; k: number }[] = [];
for (const step of index.steps) { const at = index.land[step]; for (let k = 0; k < at.length / 2; k++) all.push({ step, px: at[k * 2], pz: at[k * 2 + 1], k }); }
const share = process.env.RECODE_SHARE?.split('/').map(Number);
if (share) {
  // a share of the tables: each written zipped anew beside the old files, as <step>/<px>_<pz>.new
  const [me, n] = share;
  let done = 0;
  for (const t of all.filter((_, i) => i % n === me)) {
    const { file, range } = whereTable(index, t.step, t.px, t.pz, t.k), bytes = readFileSync(resolve(dir, file));
    const run = gunzipSync(range ? bytes.subarray(range[0], range[0] + range[1]) : bytes), zipped = zip(run);
    if (!brotliDecompressSync(zipped).equals(run)) throw new Error(`step ${t.step} piece ${t.px},${t.pz}: not the same after zipping`);
    writeFileSync(resolve(dir, `${t.step}`, `${t.px}_${t.pz}.new`), zipped);
    if (++done % 500 === 0 && me === 0) console.log(`${done * n} of ${all.length}`);
  }
  process.exit(0);
}
const n = cpus().length;
console.log(`${all.length} tables on ${n} processes`);
const codes = await Promise.all(Array.from({ length: n }, (_, k) => new Promise<number>((done) => spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, RECODE_SHARE: `${k}/${n}` } }).on('exit', (code) => done(code ?? 1)))));
if (codes.some((c) => c)) { console.error('a process failed: nothing changed'); process.exit(1); }
// the old files go, the new ones take their place: packs are made again in the order of the index
let before = 0, after = 0;
for (const step of index.steps) {
  const at = index.land[step], packed = index.packs?.[step], groups = new Map<string, number[]>();
  for (let k = 0; k < at.length / 2; k++) {
    const { file } = whereTable(index, step, at[k * 2], at[k * 2 + 1], k);
    groups.set(file, [...(groups.get(file) ?? []), k]);
  }
  for (const [file, members] of groups) {
    before += readFileSync(resolve(dir, file)).length;
    const parts = members.map((k) => readFileSync(resolve(dir, `${step}`, `${at[k * 2]}_${at[k * 2 + 1]}.new`)));
    rmSync(resolve(dir, file));
    if (packed) {
      let offset = 0;
      members.forEach((k, j) => { packed.at[k * 2] = offset; packed.at[k * 2 + 1] = parts[j].length; offset += parts[j].length; });
      writeFileSync(resolve(dir, file), Buffer.concat(parts));
    } else writeFileSync(resolve(dir, `${step}`, `${at[members[0] * 2]}_${at[members[0] * 2 + 1]}.tab`), parts[0]);
    after += parts.reduce((s, p) => s + p.length, 0);
    for (const k of members) rmSync(resolve(dir, `${step}`, `${at[k * 2]}_${at[k * 2 + 1]}.new`));
  }
}
index.coding = 'br';
index.about = index.about.replace('(<step>/<px>_<pz>.bin.gz)', '(<step>/<px>_<pz>.tab, or in packs where packs says so; zipped with Brotli)');
writeFileSync(resolve(dir, 'index.json'), JSON.stringify(index));
console.log(`tables/world_${year}: ${(before / 1e6).toFixed(1)} MB with gzip, ${(after / 1e6).toFixed(1)} MB with Brotli`);
