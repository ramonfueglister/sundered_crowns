// Before the tests run: builds the economy engine from economy/ (WebAssembly, and the native reference the tests
// compare it with), so the tests never run against a stale build.
import { buildEconomy, cargo } from '../../tools/sim/build_economy';

export default function setup(): void {
  try {
    cargo(['--version'], true);
  } catch {
    throw new Error('the tests build the economy engine and need the Rust toolchain (https://rustup.rs)');
  }
  buildEconomy(true);
  cargo(['build', '--release', '--locked', '--example', 'reference'], true);
}
