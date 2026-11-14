// Node helpers: load the baked map and the start setup (tests, tools, the world server).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { World, type LandJson, type CultivationJson } from '../../src/sim/world';
import { createWorldState, type SetupState } from '../../src/sim/setup';
import type { WorldState } from '../../src/sim/state';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
export const dataPath = (name: string): string => resolve(ROOT, 'public/data', name);
const read = (name: string) => JSON.parse(readFileSync(dataPath(name), 'utf8'));
let world: World | null = null;
export function loadWorld(): World {
  return (world ??= buildWorld(loadCultivation()));
}
/** A world with the given calibration of cultivated land (the calibration itself starts from one without). */
export function buildWorld(cultivation: CultivationJson): World { return new World(read('geo.json'), read('world.json'), loadLand(), cultivation); }
export function loadLand(): LandJson { return read('land.json'); }
export function loadCultivation(): CultivationJson { return read('cultivation.json'); }
export function loadSetup(year = 1356): SetupState { return read(`setup_${year}.json`); }
export function newWorldState(seed = 1356, year = 1356): { s: WorldState; w: World } {
  const w = loadWorld();
  return { s: createWorldState(w, loadSetup(year), seed), w };
}
