// Before the tests run: builds the portrait builder from portrait/ (WebAssembly), so the tests never run against a
// stale build.
import { buildPortrait, cargo, PORTRAIT_TEST_WASM } from '../../tools/portrait/build_portrait';

export default function setup(): void {
  try {
    cargo(['--version'], true);
  } catch {
    throw new Error('the tests build the portrait builder and need the Rust toolchain (https://rustup.rs)');
  }
  buildPortrait(PORTRAIT_TEST_WASM, true);
}
