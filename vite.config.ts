import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
export default defineConfig({
  plugins: [preact()],
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, rollupOptions: { input: ['index.html', 'look-probe.html', 'world-probe.html'] } },
  server: { port: 5173, host: true },
});
