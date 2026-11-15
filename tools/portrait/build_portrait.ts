// Builds the portrait builder: Apoleia's generator in portrait/, as one WebAssembly file, and the list of the files
// of the real look that the game loads with it.
//   npm run portrait:build
// Writes public/portrait/sc_portrait.wasm and public/portrait/manifest.json (both are in the repository, because
// the site is built where there is no Rust). Needs the Rust toolchain (https://rustup.rs); the compiler version is
// fixed by portrait/rust-toolchain.toml.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
export const PORTRAIT_DIR = resolve(ROOT, 'portrait');
export const PORTRAIT_PUBLIC = resolve(ROOT, 'public/portrait');
/** Where the tests build to, so that they never run against a stale file and never touch the one in the repository. */
export const PORTRAIT_TEST_WASM = resolve(ROOT, 'build/portrait/sc_portrait.wasm');

/** Runs cargo inside portrait/, so that its rust-toolchain.toml picks the compiler. Quiet: only a failure is shown. */
export function cargo(args: string[], quiet = false): void {
  try { execFileSync('cargo', args, { cwd: PORTRAIT_DIR, stdio: quiet ? 'pipe' : 'inherit' }); }
  catch (e: any) { throw new Error(`cargo ${args.join(' ')} failed${e?.stderr ? `:\n${e.stderr}` : ''}`); }
}

export function buildPortrait(out: string, quiet = false): string {
  cargo(['build', '--release', '--locked', '--lib', '--target', 'wasm32-unknown-unknown'], quiet);
  mkdirSync(dirname(out), { recursive: true });
  copyFileSync(resolve(PORTRAIT_DIR, 'target/wasm32-unknown-unknown/release/sc_portrait.wasm'), out);
  return out;
}

/** The files of the real look: the data files the builder reads (with their sizes) and the images the renderer loads. */
export interface PortraitManifest { folder: string; data: { name: string; bytes: number }[]; images: string[] }

export function portraitManifest(): PortraitManifest {
  const folder = 'real', dir = resolve(PORTRAIT_PUBLIC, folder);
  const names = readdirSync(dir).filter(n => !n.endsWith('.md')).sort();
  const image = (n: string) => n.endsWith('.webp') || n.endsWith('.png');
  return {
    folder,
    data: names.filter(n => !image(n)).map(name => ({ name, bytes: statSync(resolve(dir, name)).size })),
    images: names.filter(image),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(buildPortrait(resolve(PORTRAIT_PUBLIC, 'sc_portrait.wasm')));
  const manifest = resolve(PORTRAIT_PUBLIC, 'manifest.json');
  writeFileSync(manifest, JSON.stringify(portraitManifest(), null, 1) + '\n');
  console.log(manifest);
}
