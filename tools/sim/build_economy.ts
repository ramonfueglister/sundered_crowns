// Builds the economy engine: the shell in economy/ around the port of BeforeIT.jl, as one WebAssembly file at
// build/economy/sc_economy.wasm (where tools/sim/load.ts looks for it).
//   npm run economy:build
// Needs the Rust toolchain (https://rustup.rs); the compiler version is fixed by economy/rust-toolchain.toml.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
export const ECONOMY_DIR = resolve(ROOT, 'economy');
const OUT = resolve(ROOT, 'build/economy/sc_economy.wasm');

/** Runs cargo inside economy/, so that its rust-toolchain.toml picks the compiler. Quiet: only a failure is shown. */
export function cargo(args: string[], quiet = false): void {
  try {
    execFileSync('cargo', args, { cwd: ECONOMY_DIR, stdio: quiet ? 'pipe' : 'inherit' });
  } catch (e: any) {
    throw new Error(`cargo ${args.join(' ')} failed${e?.stderr ? `:\n${e.stderr}` : ''}`);
  }
}

export function buildEconomy(quiet = false): string {
  cargo(['build', '--release', '--locked', '--lib', '--target', 'wasm32-unknown-unknown'], quiet);
  mkdirSync(dirname(OUT), { recursive: true });
  copyFileSync(resolve(ECONOMY_DIR, 'target/wasm32-unknown-unknown/release/sc_economy.wasm'), OUT);
  return OUT;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(buildEconomy());
