// Writes public/data/place_climate.json for the simulation: the climate of every land place of the map
// (src/sim/content/place_climate.ts), by which the farming year of the place goes (src/sim/people/farm_year.ts).
//
// The climate is the kind of land of the world graphic's climate layer (public/map/climate.bin.gz, from the
// Köppen-Geiger zones: tools/worldprobe/build_climate.py) at the map pixel of the place (data/geo.json `loc.x`,
// `loc.y`: the game map is the first lap of the world's map, src/worldprobe/region.ts).
//
//   npx tsx tools/worldprobe/build_place_climate.ts
//
// Run it again when the climate layer or the places of the map change.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { CLIMATE_LETTERS, type PlaceClimateJson } from '../../src/sim/content/place_climate';
import { KIND, climateAt, climateOfLand } from '../../src/worldprobe/climate';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..'),
  json = <T>(path: string): T => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as T;

const geo = json<{ L: number; loc: { x: number[]; y: number[] } }>('public/data/geo.json'),
  world = json<{ worldW: number; worldH: number }>('public/map/regions/world/index.json'),
  climate = {
    w: world.worldW >> 1,
    h: world.worldH >> 1,
    cells: gunzipSync(readFileSync(resolve(ROOT, 'public/map/climate.bin.gz'))),
    snow: new Uint8Array(0),
    trees: new Uint8Array(0),
  };
if (climate.cells.length !== climate.w * climate.h) throw new Error('climate.bin: not of the size of the world map');

const counts = [0, 0, 0];
let places = '';
for (let l = 0; l < geo.L; l++) {
  const c = climateOfLand(climateAt(climate, geo.loc.x[l], geo.loc.y[l]) & KIND);
  counts[c]++;
  places += CLIMATE_LETTERS[c];
}

const out: PlaceClimateJson = {
  about:
    'The climate of every land place of the map, one letter each in the order of data/geo.json: m the Mediterranean kind of land (Köppen-Geiger Cs), d steppe or desert (B), - any other; the kind of the climate layer of the world graphic (public/map/climate.bin.gz) at the place. Written by tools/worldprobe/build_place_climate.ts.',
  places,
};
writeFileSync(resolve(ROOT, 'public/data/place_climate.json'), `${JSON.stringify(out)}\n`);
console.log(`place_climate.json: ${geo.L} places, ${counts[1]} Mediterranean, ${counts[2]} dry, ${counts[0]} other`);
