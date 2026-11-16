// What the high lands of the world must keep: rock is what rises over its valleys, not what lies high, and the summits
// are pale by the snow line of the place's climate, which the shipped layer knows for the whole earth.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type Climate, loadClimate, snowLineAt, treeLineAt } from '../../src/worldprobe/climate';
import { SNOW_LINE, TREE_LINE, lineShift, paleFrom, rockAt, woodsUntil } from '../../src/worldprobe/land';
import { projectionOf } from '../../src/worldprobe/region';

describe('rock', () => {
  it('is a range that rises from a high plateau, not the plateau', () => {
    const tibet = lineShift(32);
    expect(rockAt(4800, 4700, tibet)).toBe(false);
    expect(rockAt(5600, 4700, tibet)).toBe(true);
  });

  it('is in the Alps what it was', () => {
    // over a valley floor far below, only the height counts
    for (const massif of [1400, 1600, 2500, 4000]) expect(rockAt(massif, 600, 0)).toBe(massif > 1500);
  });

  it('is no hill of the lowlands, however far north', () => {
    expect(rockAt(250, 0, lineShift(70))).toBe(false);
  });
});

describe('the height from which the summits are pale', () => {
  it('is that of the look in the Alps', () => {
    expect(paleFrom(3090)).toBe(SNOW_LINE);
  });

  it('follows the snow line upwards, and downwards by no more than a fifth of it', () => {
    expect(paleFrom(6100) - paleFrom(3090)).toBe(6100 - 3090);
    expect(paleFrom(1000)).toBe(800);
    for (let line = 200; line < 7000; line += 100) expect(paleFrom(line + 100)).toBeGreaterThan(paleFrom(line));
  });
});

describe('the height up to which the woods grow', () => {
  it('is that of the look in the Alps', () => {
    expect(woodsUntil(2220)).toBe(TREE_LINE);
  });

  it('follows the tree line upwards, and downwards by no more than a fifth of it', () => {
    expect(woodsUntil(4700) - woodsUntil(2220)).toBe(4700 - 2220);
    expect(woodsUntil(500)).toBe(400);
    for (let line = 0; line < 5000; line += 100) expect(woodsUntil(line + 100)).toBeGreaterThan(woodsUntil(line));
  });
});

describe('the snow line of a place', () => {
  // a layer of 4 by 2 points, 64 by 32 map pixels: the points lie in the middle of their 16 pixels
  const climate: Climate = { w: 32, h: 16, cells: new Uint8Array(32 * 16), snow: Uint8Array.from([10, 20, 30, 40, 50, 60, 70, 80]), trees: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]) };

  it('is that of the layer at its points and lies between them elsewhere', () => {
    expect(snowLineAt(climate, 8, 8)).toBe(320);
    expect(snowLineAt(climate, 24, 24)).toBe(60 * 32);
    expect(snowLineAt(climate, 16, 8)).toBe(15 * 32);
    expect(snowLineAt(climate, 16, 16)).toBe(35 * 32);
  });

  it('comes with the tree line of the place, read the same way', () => {
    expect(treeLineAt(climate, 8, 8)).toBe(32);
    expect(treeLineAt(climate, 16, 16)).toBe(3.5 * 32);
    expect(treeLineAt(climate, 64 + 24, 8)).toBe(treeLineAt(climate, 24, 8));
  });

  it('goes round the globe and on beyond the north and the south edge', () => {
    expect(snowLineAt(climate, 0, 8)).toBe(25 * 32);
    expect(snowLineAt(climate, 64 + 24, 8)).toBe(snowLineAt(climate, 24, 8));
    expect(snowLineAt(climate, -40, 8)).toBe(snowLineAt(climate, 24, 8));
    expect(snowLineAt(climate, 8, -100)).toBe(320);
    expect(snowLineAt(climate, 8, 500)).toBe(50 * 32);
  });
});

describe('the lines of the world', () => {
  let line: (lon: number, lat: number) => number, trees: (lon: number, lat: number) => number;
  beforeAll(async () => {
    vi.stubGlobal('fetch', async (url: string) => new Response(readFileSync(join(__dirname, '../../public', url))));
    const p = await projectionOf('world'), climate = await loadClimate('/', p.round / p.cells, p.rows / p.cells);
    line = (lon, lat) => { const [u, v] = p.cellOf(lon, lat); return snowLineAt(climate, u / p.cells, v / p.cells); };
    trees = (lon, lat) => { const [u, v] = p.cellOf(lon, lat); return treeLineAt(climate, u / p.cells, v / p.cells); };
  });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('has the snow in the Alps where their glaciers begin', () => {
    for (const [lon, lat] of [[6.9, 45.8], [8, 46.5], [9.5, 46.5], [10.9, 46.8], [12.7, 47.1]]) {
      expect(line(lon, lat)).toBeGreaterThan(2800);
      expect(line(lon, lat)).toBeLessThan(3350);
    }
  });

  it('has the snow far higher over the dry plateau of Tibet than on the wet side of the Himalaya before it', () => {
    expect(line(86, 33)).toBeGreaterThan(5800);
    expect(line(87, 28)).toBeLessThan(line(86, 33) - 800);
  });

  it('has the snow low where much falls in a cool summer, and out of reach in the desert', () => {
    expect(line(5.6, 61.75)).toBeLessThan(1600);
    expect(line(-73.5, -49)).toBeLessThan(1500);
    expect(line(-7.9, 31.06)).toBeGreaterThan(4500);
  });

  it('has the last trees of the Alps and the Pyrenees where they stand', () => {
    for (const [lon, lat] of [[8, 46.5], [9.5, 46.5], [10.9, 46.8], [0.5, 42.6]]) {
      expect(trees(lon, lat)).toBeGreaterThan(2000);
      expect(trees(lon, lat)).toBeLessThan(2600);
    }
  });

  it('has the trees end far lower on the ocean\'s edge than the latitude says', () => {
    // Scotland and Iceland: by the latitude alone the woods would climb to 1240 m and to 800 m
    expect(woodsUntil(trees(-4, 57.1))).toBeLessThan(700);
    expect(woodsUntil(trees(-19, 64.2))).toBeLessThan(450);
    expect(woodsUntil(trees(-19, 64.2))).toBeGreaterThan(150);
  });

  it('has the trees end below the snow everywhere', () => {
    // both lie at the sea's level in the far south, where the bytes hold nothing lower
    for (let lat = -55; lat <= 71; lat += 3) for (let lon = -180; lon < 180; lon += 3) if (line(lon, lat) > 0) expect(trees(lon, lat), `${lon} ${lat}`).toBeLessThan(line(lon, lat));
  });
});
