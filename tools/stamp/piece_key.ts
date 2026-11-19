// The name under which a build of the game keeps the world's pieces on disk (src/worldprobe/store.ts): a stamp of
// everything a piece is made of, not of the commit. A piece is the same as long as the code that builds and packs
// it and the map's data it is built from are the same; most commits change neither (the economy, the portraits, the
// game's pages), and with the commit as the name every one of them threw away all the pieces a player had on disk.
//
// The code is the closure of the workers' imports (relative imports, followed file by file); the data are the files
// of public/map and public/data they fetch; the libraries are the versions, in the lock file, of the packages that
// closure imports (and of what those depend on). A new test runner or type checker leaves the pieces as they are.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

/** the modules whose code makes and reads the kept pieces: from these on, every module they import counts */
export const PIECE_ROOTS = [
  'src/worldprobe/piece.worker.ts',
  'src/worldprobe/store.worker.ts',
  'src/worldprobe/pack.ts',
  'src/worldprobe/small.ts',
];
/** the data the pieces are built from (folders are taken whole) */
export const PIECE_DATA = ['public/map', 'public/data'];
/** where the versions of the libraries are read */
const LOCK = 'package-lock.json';

/** a relative import, re-export, dynamic import, side-effect import or worker URL */
const IMPORT =
  /(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)|new URL\(\s*['"](\.[^'"]+)['"]|import\s+['"](\.[^'"]+)['"]/g;
/** the same for a package (not relative, not `node:` or another scheme) */
const LIBRARY =
  /(?:import|export)\s[^'"]*?from\s*['"]([^.'"][^'":]*)['"]|import\(\s*['"]([^.'"][^'":]*)['"]\s*\)|import\s+['"]([^.'"][^'":]*)['"]/g;

/** the package a bare import names: `three/webgpu` → `three`, `@scope/pkg/x` → `@scope/pkg` */
export function packageOf(spec: string): string {
  return spec
    .split('/')
    .slice(0, spec.startsWith('@') ? 2 : 1)
    .join('/');
}

interface LockEntry {
  version?: string;
  integrity?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}
type Lock = { packages: Record<string, LockEntry> };

/** where the lock file keeps package `name` as needed by the package at `from` ('' for the project itself): Node's
 *  lookup, the node_modules folder next to `from` first, then each one further up */
function lockKeyOf(lock: Lock, name: string, from: string): string | undefined {
  for (let base = from; ; ) {
    const key = `${base && `${base}/`}node_modules/${name}`;
    if (lock.packages[key]) return key;
    if (!base) return undefined;
    const up = base.lastIndexOf('/node_modules/');
    base = up < 0 ? '' : base.slice(0, up);
  }
}

/** `path@version integrity` of every package in `names` and of everything they depend on, as the lock file
 *  resolves them, sorted. Throws for a package the lock file does not hold (an optional dependency may be missing). */
export function libraryVersions(lock: Lock, names: Iterable<string>): string[] {
  const seen = new Map<string, string>(),
    open = [...names].map((name) => ({ name, from: '', optional: false }));
  while (open.length) {
    const { name, from, optional } = open.pop()!;
    const key = lockKeyOf(lock, name, from);
    if (!key) {
      if (optional) continue;
      throw new Error(`piece key: ${name} is imported but not in ${LOCK}`);
    }
    if (seen.has(key)) continue;
    const e = lock.packages[key];
    seen.set(key, `${key}@${e.version ?? ''} ${e.integrity ?? ''}`);
    for (const d of Object.keys(e.dependencies ?? {})) open.push({ name: d, from: key, optional: false });
    for (const d of Object.keys(e.optionalDependencies ?? {})) open.push({ name: d, from: key, optional: true });
  }
  return [...seen.values()].sort();
}

/** a relative import as the file it names */
function fileOf(from: string, spec: string): string | null {
  const at = resolve(dirname(from), spec.replace(/\?.*$/, ''));
  for (const f of [at, `${at}.ts`, `${at}.tsx`, `${at}.js`, resolve(at, 'index.ts')])
    if (existsSync(f) && statSync(f).isFile()) return f;
  return null;
}

/** every file under a folder (or the file itself), in a fixed order */
function filesUnder(at: string): string[] {
  if (!existsSync(at)) return [];
  if (statSync(at).isFile()) return [at];
  return readdirSync(at, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((e) => filesUnder(resolve(at, e.name)));
}

/** The stamp of the pieces of the tree at `root`: 16 hex digits. */
export function pieceKey(root: string): string {
  const code = new Set<string>(),
    packages = new Set<string>(),
    open = PIECE_ROOTS.map((f) => resolve(root, f));
  while (open.length) {
    const f = open.pop()!;
    if (code.has(f)) continue;
    code.add(f);
    if (!/\.(ts|tsx|js)$/.test(f)) continue;
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(IMPORT)) {
      const g = fileOf(f, m[1] ?? m[2] ?? m[3] ?? m[4]);
      if (g) open.push(g);
    }
    for (const m of text.matchAll(LIBRARY)) packages.add(packageOf(m[1] ?? m[2] ?? m[3]));
  }
  const hash = createHash('sha1');
  for (const f of [...[...code].sort(), ...PIECE_DATA.flatMap((d) => filesUnder(resolve(root, d)))]) {
    hash.update(relative(root, f));
    hash.update('\0');
    hash.update(readFileSync(f));
    hash.update('\0');
  }
  for (const v of libraryVersions(JSON.parse(readFileSync(resolve(root, LOCK), 'utf8')), packages)) {
    hash.update(v);
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}
