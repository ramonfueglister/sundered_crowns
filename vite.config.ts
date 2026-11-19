import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { pieceKey } from './tools/stamp/piece_key.ts';
export default defineConfig({
  plugins: [preact()],
  // the name under which the pieces of the world are kept on disk (src/worldprobe/store.ts): a stamp of their code and
  // data (tools/stamp/piece_key.ts), so that a build which changes neither keeps the pieces a player has (the dev server needs none)
  define: { __BUILD__: JSON.stringify(process.argv.includes('build') ? pieceKey(import.meta.dirname) : Date.now().toString(36)) },
  worker: { format: 'es' },
  // the Brotli decoder fetches its WebAssembly beside its own module (src/worldprobe/brotli.ts): not prebundled, so that it finds it
  optimizeDeps: { exclude: ['brotli-dec-wasm'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, rollupOptions: { input: ['index.html', 'look-probe.html', 'world-probe.html', 'near-probe.html'] } },
  server: { port: 5173, host: true },
  test: { globalSetup: ['tests/setup/economy.ts', 'tests/setup/portrait.ts'] },
});
