// Node helpers: load the baked map and the start setup (tests, tools, the world server).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { World, type LandJson, type CultivationJson } from '../../src/sim/world';
import type { CalibrationTable } from '../../src/sim/economy/calibration';
import { wasmEconomyEngine, type EconomyClock, type EconomyEngine, type EconomyPrices, type EconomyWage } from '../../src/sim/economy/engine';
import { createWorldState, type SetupState } from '../../src/sim/setup';
import type { WorldState } from '../../src/sim/state';
import { SCALE } from '../../src/sim/scale';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
export const dataPath = (name: string): string => resolve(ROOT, 'public/data', name);
const read = (name: string) => JSON.parse(readFileSync(dataPath(name), 'utf8'));
let world: World | null = null;
export function loadWorld(): World {
  return (world ??= buildWorld(loadCultivation()));
}
/** A world with the given calibration of cultivated land (the calibration itself starts from one without). */
export function buildWorld(cultivation: CultivationJson): World {
  return new World(read('geo.json'), read('world.json'), loadLand(), cultivation, { engine: loadEconomyEngine(), table: loadEconomyTable() });
}
export function loadLand(): LandJson { return read('land.json'); }
export function loadCultivation(): CultivationJson { return read('cultivation.json'); }
/** The calibration table of the cities' economies (data/economy/england_1356.json; server/Dockerfile copies it into
 *  the image). The world calibrates every city from it when it founds the economies. */
export const ECONOMY_TABLE = resolve(ROOT, 'data/economy/england_1356.json');
export function loadEconomyTable(): CalibrationTable { return JSON.parse(readFileSync(ECONOMY_TABLE, 'utf8')); }
/** public/data/economy_cities.json: the cities of a reference world with what the port is given for each, as the
 *  game computes it when it founds the economies (written by tools/sim/calibrate_economy.ts). The tests of the engine
 *  compute its cities; the game does not read it. */
export interface EconomyJson {
  case: string; table: string;
  /** the year the starting position stands for, and the world the cities were calibrated in */
  year: number; world: { year: number; seed: number };
  /** the model computes every city at this scale (1:100) */
  scale: number;
  /** periods of the model in a year (365: one period is one day), and the lengths of the daily clock in periods */
  periods_per_year: number; clock: EconomyClock;
  wage: EconomyWage; prices: EconomyPrices;
  /** the cities: the place, its name, its real people and its persons who work, and what the port is given */
  cities: { place: number; name: string; people: number; working: number; parameters: Record<string, unknown>; initial_conditions: Record<string, unknown> }[];
}
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

/** A world as a build before state version 9 saved it: people and harvest in people of the time, not heads at 1:100
 *  (src/sim/scale.ts). For tests of the upgrade; changes `s` and returns it. */
export function countedInPeopleOfTheTime<T extends { place: { pop: ArrayLike<number> & { [i: number]: number }; harvest?: ArrayLike<number> & { [i: number]: number } } }>(s: T): T {
  const { pop, harvest } = s.place;
  for (let i = 0; i < pop.length; i++) pop[i] = Math.round(pop[i] * SCALE);
  if (harvest) for (let i = 0; i < harvest.length; i++) harvest[i] *= SCALE;
  return s;
}
