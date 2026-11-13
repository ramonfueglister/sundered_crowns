// Node helpers: load the generated data and create a game (tests, AI runs, world server).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { World } from '../../src/sim/world';
import { createGame } from '../../src/sim/setup';
import type { GameState } from '../../src/sim/types';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
let _w: World | null = null;
export function loadWorld(): World {
  if (_w) return _w;
  const geo = JSON.parse(readFileSync(resolve(ROOT, 'public/data/geo.json'), 'utf8'));
  const wj = JSON.parse(readFileSync(resolve(ROOT, 'public/data/world.json'), 'utf8'));
  _w = new World(geo, wj);
  return _w;
}
export function loadSetup(year = 1356) { return JSON.parse(readFileSync(resolve(ROOT, `public/data/setup_${year}.json`), 'utf8')); }
export function loadHubs() { return JSON.parse(readFileSync(resolve(ROOT, 'data/content/trade_hubs.json'), 'utf8')).trade_hubs; }
export function newGame(seed = 1356, year = 1356, player: number[] = []): { s: GameState; w: World } {
  const w = loadWorld();
  const s = createGame(w, loadSetup(year), loadHubs(), seed, { player });
  return { s, w };
}
