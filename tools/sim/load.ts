// Node helpers: load the baked map and the start setup (tests, tools, the world server).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { World, type LandJson } from '../../src/sim/world';
import { createWorldState, type SetupState } from '../../src/sim/setup';
import type { WorldState } from '../../src/sim/state';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
let world: World | null = null;
export function loadWorld(): World {
  if (world) return world;
  const geo = JSON.parse(readFileSync(resolve(ROOT, 'public/data/geo.json'), 'utf8'));
  const wj = JSON.parse(readFileSync(resolve(ROOT, 'public/data/world.json'), 'utf8'));
  return (world = new World(geo, wj, loadLand()));
}
export function loadLand(): LandJson { return JSON.parse(readFileSync(resolve(ROOT, 'public/data/land.json'), 'utf8')); }
export function loadSetup(year = 1356): SetupState { return JSON.parse(readFileSync(resolve(ROOT, `public/data/setup_${year}.json`), 'utf8')); }
export function newWorldState(seed = 1356, year = 1356): { s: WorldState; w: World } {
  const w = loadWorld();
  return { s: createWorldState(w, loadSetup(year), seed), w };
}
