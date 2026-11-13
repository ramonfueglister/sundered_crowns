import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';
// The simulation tests load the whole 1356 world and play months or years of it; they need far more than vitest's
// default 5 s per test on a slow machine.
export default mergeConfig(viteConfig, defineConfig({
  test: { testTimeout: 180_000, hookTimeout: 180_000 },
}));
