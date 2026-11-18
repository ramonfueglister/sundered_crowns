import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
export default defineConfig({
  plugins: [preact()],
  // the name of this build: the pieces of the world that a browser keeps on disk are those of one build (src/worldprobe/store.ts)
  define: { __BUILD__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? Date.now().toString(36)) },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, rollupOptions: { input: ['index.html', 'look-probe.html', 'world-probe.html', 'near-probe.html'] } },
  server: { port: 5173, host: true },
  test: { globalSetup: ['tests/setup/economy.ts', 'tests/setup/portrait.ts'] },
});
