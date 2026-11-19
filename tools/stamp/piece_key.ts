// The name under which a build of the game keeps the world's pieces on disk (src/worldprobe/store.ts): a stamp of
// everything a piece is made of, not of the commit. A piece is the same as long as the code that builds and packs
// it and the map's data it is built from are the same; most commits change neither (the economy, the portraits, the
// game's pages), and with the commit as the name every one of them threw away all the pieces a player had on disk.
//
// The code is the closure of the workers' imports (relative imports, followed file by file); the data are the files
// of public/map and public/data they fetch, and the lock file for the libraries they take in.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

/** the modules whose code makes and reads the kept pieces: from these on, every module they import counts */
export const PIECE_ROOTS = ['src/worldprobe/piece.worker.ts', 'src/worldprobe/store.worker.ts', 'src/worldprobe/pack.ts', 'src/worldprobe/small.ts'];
/** the data the pieces are built from (folders are taken whole) */
export const PIECE_DATA = ['public/map', 'public/data', 'package-lock.json'];

const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)|new URL\(\s*['"](\.[^'"]+)['"]/g;

/** a relative import as the file it names */
function fileOf(from: string, spec: string): string | null {
  const at = resolve(dirname(from), spec.replace(/\?.*$/, ''));
  for (const f of [at, `${at}.ts`, `${at}.tsx`, `${at}.js`, resolve(at, 'index.ts')]) if (existsSync(f) && statSync(f).isFile()) return f;
  return null;
}

/** every file under a folder (or the file itself), in a fixed order */
function filesUnder(at: string): string[] {
  if (!existsSync(at)) return [];
  if (statSync(at).isFile()) return [at];
  return readdirSync(at, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1)).flatMap((e) => filesUnder(resolve(at, e.name)));
}

/** The stamp of the pieces of the tree at `root`: 16 hex digits. */
export function pieceKey(root: string): string {
  const code = new Set<string>(), open = PIECE_ROOTS.map((f) => resolve(root, f));
  while (open.length) {
    const f = open.pop()!;
    if (code.has(f)) continue;
    code.add(f);
    if (!/\.(ts|tsx|js)$/.test(f)) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(IMPORT)) { const g = fileOf(f, m[1] ?? m[2] ?? m[3]); if (g) open.push(g); }
  }
  const hash = createHash('sha1');
  for (const f of [...[...code].sort(), ...PIECE_DATA.flatMap((d) => filesUnder(resolve(root, d)))]) {
    hash.update(relative(root, f)); hash.update('\0'); hash.update(readFileSync(f)); hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}
