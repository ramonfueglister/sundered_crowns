// The farmhouses of the world graphic stand for the people the simulation counts on the land of a place, outside its
// towns: as many as hold them, beside the fields the land has.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { Batch } from '../../src/lookprobe/batch';
import { type Ground, LAND_Y, Mat, N, SEA_Y } from '../../src/lookprobe/layout';
import { styleOf } from '../../src/buildings';
import { type Rural, ruralAt } from '../../src/worldprobe/rural';
import { FARMS, FIELDS_FOUND, LOTS_FOUND, PEOPLE_PER_FARM, farmsFor, settle } from '../../src/worldprobe/settle';

describe('the people on the land of a place', () => {
  // 3 by 2 cells, 6 by 4 pixels of the game map: no place, 0, 1, 3, 1023 and 187 people per km²
  const rural: Rural = { w: 3, h: 2, cells: Uint8Array.from([255, 0, 25, 50, 250, Math.round(25 * Math.log2(188))]) };

  it('are read from the byte of the place: 25 steps to a doubling of one more than them', () => {
    expect(ruralAt(rural, 2.5, 0.5)).toBe(0);
    expect(ruralAt(rural, 4, 1)).toBeCloseTo(1);
    expect(ruralAt(rural, 1, 3)).toBeCloseTo(3);
    expect(ruralAt(rural, 3, 2)).toBeCloseTo(1023);
    expect(ruralAt(rural, 5.9, 3.9)!).toBeGreaterThan(180);
    expect(ruralAt(rural, 5.9, 3.9)!).toBeLessThan(195);
  });

  it('are those of the place itself: nothing is blended over a border', () => {
    expect(ruralAt(rural, 3.99, 0)).toBe(0);
    expect(ruralAt(rural, 4.01, 0)).toBeCloseTo(1);
  });

  it('are unknown on the water and beyond the game map', () => {
    expect(ruralAt(rural, 0.5, 0.5)).toBeNull();
    expect(ruralAt(rural, -1, 1)).toBeNull();
    expect(ruralAt(rural, 6, 1)).toBeNull();
    expect(ruralAt(rural, 1, 4)).toBeNull();
  });
});

describe('the share of the fields with a farmhouse', () => {
  const lot = 5.7; // km² of a lot in the north of France

  it('houses the people of the land: farmhouses by the fields found hold them', () => {
    for (const [people, cultivated] of [[6, 0.5], [20, 0.3], [30, 0.6], [2, 0.05]]) for (const found of [FIELDS_FOUND, LOTS_FOUND]) {
      const farms = farmsFor(people, lot, cultivated, found);
      expect(farms).toBeLessThan(1);
      // of the lots of a km², `cultivated * found` are fields, and `farms` of those have a farmhouse
      expect((farms * cultivated * found * PEOPLE_PER_FARM) / lot).toBeCloseTo(people);
    }
  });

  it('grows with the people and is no more than one farmhouse to a field', () => {
    expect(farmsFor(12, lot, 0.5, FIELDS_FOUND)).toBeCloseTo(2 * farmsFor(6, lot, 0.5, FIELDS_FOUND));
    expect(farmsFor(187, lot, 0.5, FIELDS_FOUND)).toBe(1);
    expect(farmsFor(0, lot, 0.5, FIELDS_FOUND)).toBe(0);
  });

  it('is none where nothing is ploughed', () => {
    expect(farmsFor(30, lot, 0, FIELDS_FOUND)).toBe(0);
  });
});

describe('the farmhouses on the ground', () => {
  const meadow = (): Ground => ({ h: new Int16Array(N * N).fill(LAND_Y), mat: new Uint8Array(N * N).fill(Mat.Grass), wet: new Uint8Array(N * N), shore: new Uint8Array(N * N), occ: new Float32Array(N * N).fill(LAND_Y), surf: new Float32Array(N * N).fill(SEA_Y), ox: 0, oz: 0 });
  const farm = () => ({ region: '', style: styleOf('') });
  const settled = (farms?: (x: number, z: number) => number) => { const counts: Record<string, number> = {}; settle(meadow(), new Batch(), [], [], farm, () => 0.5, () => 0, counts, () => true, farms); return counts; };

  it('stand by as many of the fields as the land has people for', () => {
    const none = settled(() => 0), all = settled(() => 1), some = settled(() => 0.25);
    expect(none.field).toBeGreaterThan(200);
    expect(none.farm ?? 0).toBe(0);
    // by nearly every field, where its neighbours leave room
    expect(all.farm).toBeGreaterThan(0.9 * all.field);
    expect(some.farm / some.field).toBeGreaterThan(0.18);
    expect(some.farm / some.field).toBeLessThan(0.32);
    // a farmhouse takes its ground from the lot beside it: the more of them, the fewer fields find room
    expect(some.field).toBeLessThanOrEqual(none.field);
    expect(all.field).toBeLessThan(some.field);
    expect(all.field).toBeGreaterThan(0.6 * none.field);
  });

  it('follow the land from place to place', () => {
    // people in the west half only
    const counts = settled((x) => (x < N / 2 ? 1 : 0)), west: Record<string, number> = {};
    settle(meadow(), new Batch(), [], [], farm, () => 0.5, () => 0, west, (x) => x < N / 2, (x) => (x < N / 2 ? 1 : 0));
    expect(counts.farm).toBeGreaterThan(50);
    expect(west.farm).toBe(counts.farm);
  });

  it('stand as everywhere alike where the people on the land are not known', () => {
    const counts = settled();
    expect(counts.farm / counts.field).toBeGreaterThan(FARMS - 0.08);
    expect(counts.farm / counts.field).toBeLessThan(FARMS + 0.08);
  });
});

describe('the shipped people on the land of 1291', () => {
  const index = JSON.parse(readFileSync('public/map/regions/world/index.json', 'utf8')) as { mapW: number; mapH: number; lon0: number; lon1: number; latN: number; latS: number };
  const rural: Rural = { w: index.mapW >> 1, h: index.mapH >> 1, cells: new Uint8Array(gunzipSync(readFileSync('public/map/rural_1291.bin.gz'))) };
  const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const at = (lon: number, lat: number) => ruralAt(rural, ((lon - index.lon0) / (index.lon1 - index.lon0)) * index.mapW, ((merc(index.latN) - merc(lat)) / (merc(index.latN) - merc(index.latS))) * index.mapH);

  it('lie on half the grid of the game map', () => {
    expect(rural.cells.length).toBe(rural.w * rural.h);
  });

  it('are many round Paris and in Flanders, few round Kraków, none at sea', () => {
    expect(at(2.35, 48.85)!).toBeGreaterThan(100);
    expect(at(3.2, 51.0)!).toBeGreaterThan(50);
    expect(at(19.94, 50.06)!).toBeLessThan(15);
    expect(at(19.94, 50.06)!).toBeGreaterThan(1);
    expect(at(-15, 45)).toBeNull();
  });
});
