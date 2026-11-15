// Node helpers: load the baked map and the start setup (tests, tools, the world server).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { World, type LandJson, type CultivationJson, type EconomyJson } from '../../src/sim/world';
import { wasmEconomyEngine, type EconomyEngine } from '../../src/sim/economy/engine';
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
export function buildWorld(cultivation: CultivationJson): World {
  return new World(read('geo.json'), read('world.json'), loadLand(), cultivation, { engine: loadEconomyEngine(), cities: loadEconomy() });
}
export function loadLand(): LandJson { return read('land.json'); }
export function loadCultivation(): CultivationJson { return read('cultivation.json'); }
export function loadEconomy(): EconomyJson { return read('economy_cities.json'); }
/** The economy engine: the WebAssembly file built from economy/ (npm run economy:build; server/Dockerfile builds it
 *  into the image). */
export const ECONOMY_WASM = resolve(ROOT, 'build/economy/sc_economy.wasm');
let engine: EconomyEngine | null = null;
export function loadEconomyEngine(): EconomyEngine {
  if (engine) return engine;
  if (!existsSync(ECONOMY_WASM)) throw new Error(`${ECONOMY_WASM} is missing: build the economy engine with "npm run economy:build" (needs the Rust toolchain, https://rustup.rs)`);
  return (engine = wasmEconomyEngine(readFileSync(ECONOMY_WASM)));
}
export function loadSetup(year = 1356): SetupState { return read(`setup_${year}.json`); }
export function newWorldState(seed = 1356, year = 1356): { s: WorldState; w: World } {
  const w = loadWorld();
  return { s: createWorldState(w, loadSetup(year), seed), w };
}
