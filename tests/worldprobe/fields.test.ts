// The fields of the world graphic are the land the simulation has cultivated, on the soil it takes first: the layer
// made for the graphic holds, for every piece of the map, the share of its land under field lots, and the lots of a
// place add up to the place's arable in the simulation's own state.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { Batch } from '../../src/lookprobe/batch';
import { type Ground, LAND_Y, Mat, N, SEA_Y } from '../../src/lookprobe/layout';
import { type FieldLand, fieldLandAt } from '../../src/worldprobe/fieldland';
import { lotFill } from '../../src/worldprobe/far';
import { styleOf } from '../../src/buildings';
import { FALLOW, FIELD_GROUND, LOT_BLOCKS, LOT_FILL, PEOPLE_PER_PERSON, POP_OF_SIZE, SPRING, type Site, VILLAGE_MOST, WALLED_FROM, courseOf, settle } from '../../src/worldprobe/settle';
import type { TownsJson, VillagesJson } from '../../src/worldprobe/towns';
import { newWorldState } from '../../tools/sim/load';
import gazetteer from '../../data/content/gazetteer.json';

const tool = readFileSync('tools/worldprobe/build_fieldland.py', 'utf8');
/** a constant of the tool that makes the layer: a number, or a tuple or list of numbers */
const constant = (name: string) => { const m = new RegExp(`\\b${name}\\b[^=\\n]*=\\s*([^#\\n]+)`).exec(tool); if (!m) throw new Error(`no ${name} in the tool`); return m[1].trim(); };
const numbers = (text: string) => text.replace(/[()[\]]/g, '').split(',').map((v) => Number(v));

describe('the field land about a point', () => {
  // 2 by 2 cells, 4 by 4 pixels of the game map: no land, no lots, 40 % and all of the land under lots
  const land: FieldLand = { w: 2, h: 2, cells: Uint8Array.from([255, 0, 100, 250]) };

  it('is read from the byte of its cell at the cell\'s middle: 250 for all of the land', () => {
    expect(fieldLandAt(land, 3, 1)).toBe(0);
    expect(fieldLandAt(land, 1, 3)).toBeCloseTo(0.4);
    expect(fieldLandAt(land, 3, 3)).toBe(1);
  });

  it('lies between the cells that hold land, and takes nothing from those that hold none', () => {
    expect(fieldLandAt(land, 2, 3)).toBeCloseTo(0.7);
    expect(fieldLandAt(land, 3, 2)).toBeCloseTo(0.5);
    // beside the water the land's own share holds
    expect(fieldLandAt(land, 1, 2.5)).toBeCloseTo(0.4);
    expect(fieldLandAt(land, 3.9, 3.9)).toBe(1);
  });

  it('is unknown on the water and beyond the game map', () => {
    expect(fieldLandAt(land, 0.5, 0.5)).toBeNull();
    expect(fieldLandAt(land, -3, 1)).toBeNull();
    expect(fieldLandAt(land, 1, 7)).toBeNull();
  });
});

describe('the shipped field land of 1291', () => {
  const index = JSON.parse(readFileSync('public/map/regions/world/index.json', 'utf8')) as { mapW: number; mapH: number; lon0: number; lon1: number; latN: number; latS: number };
  const land: FieldLand = { w: index.mapW >> 1, h: index.mapH >> 1, cells: new Uint8Array(gunzipSync(readFileSync('public/map/fieldland_1291.bin.gz'))) };
  const ids = new Uint16Array(new Uint8Array(gunzipSync(readFileSync('public/map/ids.bin.gz'))).buffer);
  const towns = JSON.parse(readFileSync('public/data/towns_1291.json', 'utf8')) as TownsJson, villages = JSON.parse(readFileSync('public/data/villages_1291.json', 'utf8')) as VillagesJson;
  const { s } = newWorldState(1291, 1291);
  const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  /** km² of ground of a pixel in row y of the game map, and the row of a latitude */
  const km2 = (y: number) => (((index.lon1 - index.lon0) / index.mapW) * 111.32 * Math.cos(Math.atan(Math.sinh(merc(index.latN) - ((y + 0.5) / index.mapH) * (merc(index.latN) - merc(index.latS)))))) ** 2;
  const rowOf = (lat: number) => Math.floor(((merc(index.latN) - merc(lat)) / (merc(index.latN) - merc(index.latS))) * index.mapH);

  // The ground the towns and villages of the graphic take, as the tool counts it: each a disc of its ground at its
  // place, as a share of every pixel (sixteen points to a pixel), and of every cell of the layer its four pixels' mean.
  const [village, town] = /VILLAGE_GROUND, TOWN_GROUND = \(([^)]+)\), \(([^)]+)\)/.exec(tool)!.slice(1).map(numbers);
  const builtPixel = new Map<number, number>();
  gazetteer.places.forEach((p, k) => {
    const walled = p.size >= WALLED_FROM, people = ((towns.people[k] ?? 0) + villages.people[k] || p.pop1356 || POP_OF_SIZE[Math.min(p.size, 2)]) / PEOPLE_PER_PERSON, persons = walled ? people : Math.min(VILLAGE_MOST, people);
    const [a, b, c] = walled ? town : village, r = Math.sqrt((a * persons + b * Math.sqrt(persons) + c) / Math.PI) / 8;
    const x = ((p.lon - index.lon0) / (index.lon1 - index.lon0)) * index.mapW, y = ((merc(index.latN) - merc(p.lat)) / (merc(index.latN) - merc(index.latS))) * index.mapH;
    if (x - r < 0 || y - r < 0 || Math.floor(x + r) + 1 > index.mapW || Math.floor(y + r) + 1 > index.mapH) return;
    for (let py = Math.floor(y - r); py <= Math.floor(y + r); py++) for (let px = Math.floor(x - r); px <= Math.floor(x + r); px++) {
      let inside = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (Math.hypot(px + (i + 0.5) / 4 - x, py + (j + 0.5) / 4 - y) <= r) inside++;
      if (inside) builtPixel.set(py * index.mapW + px, Math.min(1, (builtPixel.get(py * index.mapW + px) ?? 0) + inside / 16));
    }
  });
  const built = new Float32Array(land.w * land.h);
  for (const [pixel, share] of builtPixel) built[(Math.floor(pixel / index.mapW) >> 1) * land.w + ((pixel % index.mapW) >> 1)] += share / 4;

  // The ploughed ground the layer lays in every place: of its lots what no town or village is built on, FIELD_GROUND
  // of that ploughed. A cell of the layer counts with the place of the pixel in its middle and the ground of its
  // four pixels, as in the tool.
  const places = s.place.arable.length, laid = new Float64Array(places), area = new Float64Array(places);
  for (let cy = 0; cy < land.h; cy++) {
    const a = 4 * km2(2 * cy + 1);
    for (let cx = 0; cx < land.w; cx++) {
      const place = ids[(2 * cy + 1) * index.mapW + 2 * cx + 1] - 1, v = land.cells[cy * land.w + cx];
      if (place < 0 || place >= places) { if (v !== 255) throw new Error(`a share off the land at cell ${cx}, ${cy}`); continue; }
      area[place] += a;
      laid[place] += (v / 250) * (1 - built[cy * land.w + cx]) * a * FIELD_GROUND;
    }
  }
  const arable = (place: number) => s.place.arable[place] / 100; // km²

  it('lies on half the grid of the game map, and is made with the graphic\'s own constants', () => {
    expect(land.cells.length).toBe(land.w * land.h);
    expect(ids.length).toBe(index.mapW * index.mapH);
    expect(Function(`return ${constant('GROUND')}`)()).toBeCloseTo(FIELD_GROUND, 10);
    expect(FIELD_GROUND).toBe(LOT_FILL);
    expect([Number(constant('PEOPLE_PER_PERSON')), ...numbers(constant('WALLED_FROM, VILLAGE_MOST, POP_OF_SIZE'))]).toEqual([PEOPLE_PER_PERSON, WALLED_FROM, VILLAGE_MOST, ...POP_OF_SIZE]);
  });

  it('lays the arable of the simulation, all places together', () => {
    let all = 0, cultivated = 0;
    for (let p = 0; p < places; p++) if (area[p] > 0) { all += laid[p]; cultivated += arable(p); }
    expect(cultivated).toBeGreaterThan(2_000_000);
    // all but what the open, fertile land of some places does not hold (the tool's report: under a hundredth)
    expect(all).toBeGreaterThan(0.99 * cultivated);
    expect(all).toBeLessThan(1.001 * cultivated);
  });

  it('lays in no place more than its arable, and less in few', () => {
    let seen = 0, over = 0, short = 0;
    for (let p = 0; p < places; p++) {
      if (!area[p]) continue;
      seen++;
      // the bytes of the layer are whole: half a step of every cell at most
      const slack = (0.5 / 250) * area[p] * FIELD_GROUND + 0.01;
      over = Math.max(over, laid[p] - arable(p) - slack);
      // less only where the open, fertile land of the place does not hold its arable
      if (laid[p] < 0.99 * arable(p) - slack) short++;
    }
    expect(seen).toBeGreaterThan(15000);
    expect(over).toBeLessThanOrEqual(0);
    expect(short).toBeLessThan(seen * 0.04);
  });

  it('lays no field where the simulation has none', () => {
    let idle = 0, lots = 0;
    for (let p = 0; p < places; p++) if (arable(p) === 0 && area[p] > 0) { idle++; lots += laid[p]; }
    expect(idle).toBeGreaterThan(50);
    expect(lots).toBe(0);
  });
});

describe('the fields on the ground', () => {
  const meadow = (): Ground => ({ h: new Int16Array(N * N).fill(LAND_Y), mat: new Uint8Array(N * N).fill(Mat.Grass), wet: new Uint8Array(N * N), shore: new Uint8Array(N * N), occ: new Float32Array(N * N).fill(LAND_Y), surf: new Float32Array(N * N).fill(SEA_Y), ox: 0, oz: 0 });
  const PLOUGHED = 0.3;
  const settled = (g = meadow(), courses?: (x: number, z: number) => number, ploughed = PLOUGHED) => {
    const counts: Record<string, number> = {}, laid = settle(g, new Batch(), [], [], () => ploughed, () => 0, counts, () => true, courses);
    return { counts, laid, g, ground: laid.field.reduce((n, kind) => n + (kind ? 1 : 0), 0) / (N * N) };
  };

  it('plough as much of the ground as the land has under the plough, and say so', () => {
    const { counts, ground } = settled();
    expect(counts.field).toBeGreaterThan(200);
    // (the lots on the edge of the ground are left to the ground beside it)
    expect(ground).toBeGreaterThan(PLOUGHED * 0.88);
    expect(ground).toBeLessThan(PLOUGHED * 1.05);
    // the counts hold what the land asked for and what was laid, in blocks: on a meadow every lot finds its ground
    expect(counts.tilled / counts.ploughed).toBeGreaterThan(0.93);
    expect(counts.tilled / counts.ploughed).toBeLessThan(1.07);
    expect(counts.ploughed / LOT_BLOCKS / PLOUGHED).toBeCloseTo(Math.round(counts.ploughed / LOT_BLOCKS / PLOUGHED), 6);
  });

  it('never plough more than the land where field lies by field', () => {
    const { counts, ground } = settled(meadow(), undefined, FIELD_GROUND);
    expect(counts.tilled).toBeLessThanOrEqual(counts.ploughed);
    expect(ground).toBeLessThanOrEqual(FIELD_GROUND);
    expect(counts.tilled).toBe(counts.ploughed);
  });

  it('carry no house: the people of the land live in its villages', () => {
    const { counts } = settled(meadow(), undefined, FIELD_GROUND);
    expect(counts.house ?? 0).toBe(0);
  });

  it('are tilled in courses: of three one lies fallow and one is under spring corn, of two one lies fallow', () => {
    for (const u of [0, 0.2, 0.33]) expect(courseOf(3, u)).toBe(FALLOW);
    for (const u of [0.34, 0.5, 0.66]) expect(courseOf(3, u)).toBe(SPRING);
    for (const u of [0.67, 0.99]) expect(courseOf(3, u)).toBe(1);
    expect([courseOf(2, 0.49), courseOf(2, 0.51), courseOf(1, 0)]).toEqual([FALLOW, 1, 1]);
    const one = settled().counts, three = settled(meadow(), () => 3).counts, two = settled(meadow(), () => 2).counts;
    expect([one.fallow ?? 0, one.spring ?? 0, two.spring ?? 0]).toEqual([0, 0, 0]);
    for (const share of [three.fallow / three.field, three.spring / three.field]) { expect(share).toBeGreaterThan(0.27); expect(share).toBeLessThan(0.4); }
    expect(two.fallow / two.field).toBeGreaterThan(0.43);
    expect(two.fallow / two.field).toBeLessThan(0.57);
    // a fallow field is a field: as many lie as without the courses
    expect(three.field).toBe(one.field);
  });

  it('take the free ground of their lot, clear of the water and the rock', () => {
    const g = meadow();
    // a brook down the ground and a band of rock across it
    for (let z = 0; z < N; z++) { g.wet[z * N + 150] = 1; g.mat[z * N + 150] = Mat.Bed; }
    for (let x = 0; x < N; x++) if (x !== 150) g.mat[200 * N + x] = Mat.Rock;
    const { laid, counts } = settled(g, undefined, FIELD_GROUND);
    let beside = 0;
    for (let z = 2; z < N - 2; z++) {
      for (const x of [149, 150, 151]) expect(laid.field[z * N + x], `by the brook at ${x}, ${z}`).toBe(0);
      beside += laid.field[z * N + 148] ? 1 : 0;
    }
    for (let x = 2; x < N - 2; x++) expect(laid.field[200 * N + x]).toBe(0);
    // the fields beside the brook reach to its bank, and are the smaller for it
    expect(beside).toBeGreaterThan(N / 3);
    expect(counts.tilled).toBeLessThan(counts.ploughed);
    expect(counts.tilled).toBeGreaterThan(0.9 * counts.ploughed);
  });

  it('lie level: a field takes the ground within two steps of the height most of its lot has, and levels it', () => {
    const g = meadow();
    // a rolling ground: steps of one here and there, and a scarp of five across the middle
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { g.h[z * N + x] = LAND_Y + ((x * 7 + z * 13) % 11 < 3 ? 1 : 0) + (z >= 200 ? 5 : 0); g.occ[z * N + x] = g.h[z * N + x]; }
    const before = Int16Array.from(g.h), { laid } = settled(g, undefined, FIELD_GROUND);
    let fields = 0;
    for (let z = 2; z < N - 2; z++) for (let x = 2; x < N - 2; x++) {
      const i = z * N + x;
      if (!laid.field[i]) { expect(g.h[i]).toBe(before[i]); continue; }
      fields++;
      expect(Math.abs(g.h[i] - before[i])).toBeLessThanOrEqual(2);
      // level with the field's ground beside it
      if (laid.field[i + 1] && (x + 1) % 1 === 0 && Math.abs(before[i + 1] - before[i]) <= 1) expect(Math.abs(g.h[i + 1] - g.h[i]) === 0 || Math.abs(g.h[i + 1] - g.h[i]) >= 4).toBe(true);
    }
    expect(fields).toBeGreaterThan(0.7 * N * N * FIELD_GROUND);
  });

  it('are left out where less than a third of a lot is free and level', () => {
    const g = meadow();
    // a slope of three steps to the column: no two columns of a row within two steps
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { g.h[z * N + x] = LAND_Y + 3 * z; g.occ[z * N + x] = g.h[z * N + x]; }
    expect(settled(g, undefined, FIELD_GROUND).counts.field ?? 0).toBe(0);
  });
});

describe('the fields and villages of a piece of land', () => {
  /** rolling land with a brook, as the ground that starts at world column ox sees it, a village on it and fields wherever they find room */
  const laid = (ox: number) => {
    const g: Ground = { h: new Int16Array(N * N), mat: new Uint8Array(N * N).fill(Mat.Grass), wet: new Uint8Array(N * N), shore: new Uint8Array(N * N), occ: new Float32Array(N * N), surf: new Float32Array(N * N).fill(SEA_Y), ox, oz: 0 };
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const wx = x + ox, i = z * N + x;
      g.h[i] = LAND_Y + Math.round(2 + 2 * Math.sin(wx / 17) * Math.cos(z / 23)); g.occ[i] = g.h[i];
      if (Math.abs(wx - 330 - 10 * Math.sin(z / 30)) < 1) { g.wet[i] = 1; g.mat[i] = Mat.Bed; }
    }
    const site: Site = { id: 3, at: [300 - ox + 0.5, 200.5], size: 1, pop: 30000, region: 'france', style: styleOf('france') };
    const s = settle(g, new Batch(), [site], [], (x) => (Math.floor((x + ox) / 60) % 2 ? FIELD_GROUND : 0.3), () => 0, {});
    return { g, s };
  };

  it('are the same on every ground that covers it', () => {
    const a = laid(0), b = laid(200);
    let fields = 0, village = 0;
    // the middle of what the two grounds share
    for (let z = 60; z < 340; z++) for (let x = 60; x < 140; x++) {
      const i = z * N + x + 200, j = z * N + x;
      expect([a.s.field[i], a.s.used[i], a.g.h[i]], `at ${x + 200}, ${z}`).toEqual([b.s.field[j], b.s.used[j], b.g.h[j]]);
      fields += b.s.field[j] ? 1 : 0; village += b.s.used[j] === 3 ? 1 : 0;
    }
    expect(fields).toBeGreaterThan(5000);
    expect(village).toBeGreaterThan(100);
  });
});

describe('a field lot from farther away', () => {
  it('keeps a balk while it is wide enough, and is all field once it is not', () => {
    expect(lotFill(1)).toBeCloseTo((5 * 3) / (6 * 4));
    expect(lotFill(2)).toBe(1);
    expect(lotFill(5)).toBe(1);
  });
});
