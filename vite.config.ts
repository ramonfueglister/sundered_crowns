import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
export default defineConfig({
  plugins: [preact()],
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  server: { port: 5173, host: true },
  test: { globalSetup: ['tests/setup/economy.ts'] },
});
