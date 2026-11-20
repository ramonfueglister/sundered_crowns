// Node helpers: load the baked map and the start setup (tests, tools, the world server).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { World, type LandJson, type CultivationJson } from '../../src/sim/world';
import type { CalibrationTable } from '../../src/sim/economy/calibration';
import {
  wasmEconomyEngine,
  type EconomyClock,
  type EconomyEngine,
  type EconomyPrices,
  type EconomyWage,
} from '../../src/sim/economy/engine';
import { createWorldState, type SetupState } from '../../src/sim/setup';
import type { WorldState } from '../../src/sim/state';
import { compileChronicle, type Chronicle } from '../../src/sim/content/chronicle';
import { compileBorders, type Borders } from '../../src/sim/content/borders';
import { compileGround, type Ground } from '../../src/sim/content/ground';
import { compileTilth, type Tilth } from '../../src/sim/content/tilth';
import { compileItineraries, type ItineraryFile, type Itineraries } from '../../src/sim/content/itineraries';
import { cityPeopleByPlace } from '../../src/sim/systems/people';
import { toHeads } from '../../src/sim/scale';
import { WayNet, waysOf, type RoadsFile } from '../../src/sim/roads';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
export const dataPath = (name: string): string => resolve(ROOT, 'public/data', name);
const read = (name: string) => JSON.parse(readFileSync(dataPath(name), 'utf8'));
let world: World | null = null;
export function loadWorld(): World {
  return (world ??= buildWorld(loadCultivation()));
}
/** A world with the given calibration of cultivated land (the calibration itself starts from one without). */
export function buildWorld(cultivation: CultivationJson): World {
  return new World(read('geo.json'), read('world.json'), loadLand(), cultivation, {
    engine: loadEconomyEngine(),
    table: loadEconomyTable(),
  });
}
export function loadLand(): LandJson {
  return read('land.json');
}
export function loadCultivation(): CultivationJson {
  return read('cultivation.json');
}
/** The calibration table of the cities' economies (data/economy/england_1356.json; server/Dockerfile copies it into
 *  the image). The world calibrates every city from it when it founds the economies. */
export const ECONOMY_TABLE = resolve(ROOT, 'data/economy/england_1356.json');
export function loadEconomyTable(): CalibrationTable {
  return JSON.parse(readFileSync(ECONOMY_TABLE, 'utf8'));
}
/** public/data/economy_cities.json: the cities of a reference world with what the port is given for each, as the
 *  game computes it when it founds the economies (written by tools/sim/calibrate_economy.ts). The tests of the engine
 *  compute its cities; the game does not read it. */
export interface EconomyJson {
  case: string;
  table: string;
  /** the year the starting position stands for, and the world the cities were calibrated in */
  year: number;
  world: { year: number; seed: number };
  /** the model computes every city at this scale (1:100) */
  scale: number;
  /** periods of the model in a year (365: one period is one day), and the lengths of the daily clock in periods */
  periods_per_year: number;
  clock: EconomyClock;
  wage: EconomyWage;
  prices: EconomyPrices;
  /** the share of what a household holds above its target that it spends in a year (economy feature 15) */
  savings_spent_per_year: number;
  /** what the crown of a city buys with (economy feature 16) */
  crown: 'series' | 'revenue';
  /** who gets what a firm earns (economy feature 18) */
  owner: 'paper' | 'household';
  /** the cities: the place, its name, its real people and its persons who work, and what the port is given */
  cities: {
    place: number;
    name: string;
    people: number;
    working: number;
    parameters: Record<string, unknown>;
    initial_conditions: Record<string, unknown>;
  }[];
}
export function loadEconomy(): EconomyJson {
  return read('economy_cities.json');
}
/** The economy engine: the WebAssembly file built from economy/ (npm run economy:build; server/Dockerfile builds it
 *  into the image). */
export const ECONOMY_WASM = resolve(ROOT, 'build/economy/sc_economy.wasm');
let engine: EconomyEngine | null = null;
export function loadEconomyEngine(): EconomyEngine {
  if (engine) return engine;
  if (!existsSync(ECONOMY_WASM))
    throw new Error(
      `${ECONOMY_WASM} is missing: build the economy engine with "npm run economy:build" (needs the Rust toolchain, https://rustup.rs)`,
    );
  return (engine = wasmEconomyEngine(readFileSync(ECONOMY_WASM)));
}
export function loadSetup(year = 1356): SetupState {
  return read(`setup_${year}.json`);
}
/** The chronicle of rulers of a start year (public/data/rulers_<year>.json), compiled; null when there is none. */
export function loadChronicle(year: number): Chronicle | null {
  const f = dataPath(`rulers_${year}.json`);
  return existsSync(f) ? compileChronicle(JSON.parse(readFileSync(f, 'utf8'))) : null;
}
/** The journeys of the persons of history that the sources tell day by day (data/history/itineraries/*.json, one
 *  file per source), as days of a world of `year` on the places of the map of `w`; null when there are none. */
export function loadItineraries(year: number, w: World): Itineraries | null {
  const dir = resolve(ROOT, 'data/history/itineraries');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort();
  // a file read from disk has the shape the tool writes (tools/history/itineraries/regesta.py)
  const all = new Map(
    files.flatMap((f) => [
      ...compileItineraries(JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as ItineraryFile, w.lat, w.lon, year),
    ]),
  );
  return all.size ? all : null;
}
/** The chronicle of borders of a start year (public/data/borders_<year>.json), compiled; null when there is none. */
export function loadBorders(year: number): Borders | null {
  const f = dataPath(`borders_${year}.json`);
  return existsSync(f) ? compileBorders(JSON.parse(readFileSync(f, 'utf8'))) : null;
}
/** The building ground of the towns of a start year (public/data/ground_<year>.json), compiled; null when there is none. */
export function loadGround(year: number): Ground | null {
  const f = dataPath(`ground_${year}.json`);
  return existsSync(f) ? compileGround(JSON.parse(readFileSync(f, 'utf8'))) : null;
}
/** The dry ground round the towns of a start year (public/data/dry_<year>.json), compiled; null when there is none. */
export function loadDry(year: number): Ground | null {
  const f = dataPath(`dry_${year}.json`);
  return existsSync(f) ? compileGround(JSON.parse(readFileSync(f, 'utf8'))) : null;
}
/** The ground the fields can lie on round the towns of a start year (public/data/tilth_<year>.json), compiled; null when there is none. */
export function loadTilth(year: number): Tilth | null {
  const f = dataPath(`tilth_${year}.json`);
  return existsSync(f) ? compileTilth(JSON.parse(readFileSync(f, 'utf8'))) : null;
}
/** The ways between the places of the map in a start year: those of the latest public/data/roads_<year>.json at or
 *  before it (a way stays until it is let go); null when there is none. */
export function loadWays(year: number, places: number): WayNet | null {
  const laid = readdirSync(resolve(ROOT, 'public/data'))
    .map((f) => /^roads_(\d+)\.json$/.exec(f))
    .filter((m) => m !== null)
    .map((m) => Number(m![1]))
    .filter((y) => y <= year)
    .sort((a, b) => b - a)[0];
  if (laid === undefined) return null;
  const f = read(`roads_${laid}.json`) as RoadsFile;
  return new WayNet(waysOf(f.between), places, year, laid);
}
/** The world with the chronicles of rulers and of borders, the building ground of the towns of `year`, the dry
 *  ground round them and the ways of the year. */
export function loadWorldFor(year: number): World {
  const w = loadWorld();
  if (w.chronicle?.year !== year) w.chronicle = loadChronicle(year);
  if (w.borders?.year !== year) w.borders = loadBorders(year);
  if (w.ground?.year !== year) w.ground = loadGround(year);
  if (w.dry?.year !== year) w.dry = loadDry(year);
  if (w.tilth?.year !== year) w.tilth = loadTilth(year);
  if (w.ways?.year !== year) w.ways = loadWays(year, w.N);
  return w;
}
/** The people of every place of the map in heads (1:100), as the setup of `year` spreads them, no place smaller than
 *  its cities: the numbers of the sources, which the calibrations spread the people of their cases by. The world has
 *  only its persons (src/sim/systems/hamlets.ts). */
export function peopleOfMap(year = 1356): Float32Array {
  const setup = loadSetup(year),
    pop = new Float32Array(loadWorld().L);
  for (let i = 0; i < pop.length; i++) pop[i] = toHeads(Math.max(0, setup.pop[i] ?? 0));
  for (const [p, n] of cityPeopleByPlace(year)) if (pop[p] < toHeads(n)) pop[p] = toHeads(n);
  return pop;
}
export function newWorldState(seed = 1356, year = 1356): { s: WorldState; w: World } {
  const w = loadWorldFor(year);
  return { s: createWorldState(w, loadSetup(year), seed), w };
}
