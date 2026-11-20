// The farmhouses of the world graphic stand for the people the simulation counts on the land of a place, outside its
// towns: as many as hold them, in hamlets on the fields the land has.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { Batch } from '../../src/lookprobe/batch';
import { type Ground, LAND_Y, Mat, N, SEA_Y } from '../../src/lookprobe/layout';
import { styleOf } from '../../src/buildings';
import { type Rural, ruralAt } from '../../src/worldprobe/rural';
import {
  FALLOW,
  FARMS,
  FIELDS_FOUND,
  FIELD_GROUND,
  HAMLET,
  LOT_FILL,
  PEOPLE_PER_FARM,
  SPRING,
  courseOf,
  farmsFor,
  settle,
} from '../../src/worldprobe/settle';

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

describe('the farmhouses to a field', () => {
  const lot = 5.7; // km² of a lot in the north of France

  it('house the people of the land: farmhouses on the fields it has hold them', () => {
    // `fields` of the lots of a km² are fields, and `farms` farmhouses stand to each
    for (const [people, fields] of [
      [6, 0.5],
      [20, 0.3],
      [61, 0.49],
      [2, 0.05],
    ]) {
      const farms = farmsFor(people, lot, fields);
      expect(farms).toBeLessThan(HAMLET);
      expect((farms * fields * PEOPLE_PER_FARM) / lot).toBeCloseTo(people);
    }
  });

  it('grow with the people and are no more than a hamlet to a field', () => {
    expect(farmsFor(12, lot, 0.5)).toBeCloseTo(2 * farmsFor(6, lot, 0.5));
    expect(farmsFor(400, lot, 0.5)).toBe(HAMLET);
    expect(farmsFor(0, lot, 0.5)).toBe(0);
  });

  it('are none where nothing is ploughed', () => {
    expect(farmsFor(30, lot, 0)).toBe(0);
  });
});

describe('the fields and farmhouses on the ground', () => {
  const meadow = (): Ground => ({
    h: new Int16Array(N * N).fill(LAND_Y),
    mat: new Uint8Array(N * N).fill(Mat.Grass),
    wet: new Uint8Array(N * N),
    shore: new Uint8Array(N * N),
    occ: new Float32Array(N * N).fill(LAND_Y),
    surf: new Float32Array(N * N).fill(SEA_Y),
    ox: 0,
    oz: 0,
  });
  const farm = () => ({ region: '', style: styleOf('') });
  const PLOUGHED = 0.3;
  const settled = (
    farms?: (x: number, z: number) => number,
    courses?: (x: number, z: number) => number,
    own: (x: number, z: number) => boolean = () => true,
  ) => {
    const counts: Record<string, number> = {},
      laid = settle(
        meadow(),
        new Batch(),
        [],
        [],
        farm,
        () => PLOUGHED,
        () => 0,
        counts,
        own,
        farms,
        courses,
      );
    return { ...counts, ground: laid.field.reduce((n, kind) => n + (kind ? 1 : 0), 0) / (N * N) } as Record<
      string,
      number
    >;
  };

  it('plough as much of the ground as the land has under the plough', () => {
    const none = settled(() => 0);
    expect(none.field).toBeGreaterThan(200);
    // on a meadow every lot tried finds its ground: on real land FIELDS_FOUND of them do
    expect(none.ground).toBeGreaterThan(PLOUGHED * 0.95);
    expect(none.ground).toBeLessThan((PLOUGHED / FIELDS_FOUND) * 1.05);
    expect(FIELD_GROUND).toBeCloseTo(LOT_FILL * FIELDS_FOUND);
  });

  it('are tilled in courses: of three one lies fallow and one is under spring corn, of two one lies fallow', () => {
    for (const u of [0, 0.2, 0.33]) expect(courseOf(3, u)).toBe(FALLOW);
    for (const u of [0.34, 0.5, 0.66]) expect(courseOf(3, u)).toBe(SPRING);
    for (const u of [0.67, 0.99]) expect(courseOf(3, u)).toBe(1);
    expect([courseOf(2, 0.49), courseOf(2, 0.51), courseOf(1, 0)]).toEqual([FALLOW, 1, 1]);
    const one = settled(() => 0),
      three = settled(
        () => 0,
        () => 3,
      ),
      two = settled(
        () => 0,
        () => 2,
      );
    expect([one.fallow ?? 0, one.spring ?? 0, two.spring ?? 0]).toEqual([0, 0, 0]);
    for (const share of [three.fallow / three.field, three.spring / three.field]) {
      expect(share).toBeGreaterThan(0.27);
      expect(share).toBeLessThan(0.4);
    }
    expect(two.fallow / two.field).toBeGreaterThan(0.43);
    expect(two.fallow / two.field).toBeLessThan(0.57);
    // a fallow field is a field: as many lie as without the courses
    expect(three.field).toBe(one.field);
  });

  it('stand as hamlets on as many of the fields as the land has people for', () => {
    const none = settled(() => 0),
      all = settled(() => HAMLET),
      some = settled(() => 0.5);
    expect(none.farm ?? 0).toBe(0);
    // a hamlet on every field
    expect(all.farm).toBeGreaterThan(0.95 * HAMLET * all.field);
    expect(some.farm / some.field).toBeGreaterThan(0.4);
    expect(some.farm / some.field).toBeLessThan(0.6);
    // a hamlet stands on the ground of its own field: the fields are as many, and a little smaller
    expect(all.field).toBe(none.field);
    expect(all.ground).toBeLessThan(none.ground);
    expect(all.ground).toBeGreaterThan(0.4 * none.ground);
  });

  it('follow the land from place to place', () => {
    // people in the west half only
    const counts = settled((x) => (x < N / 2 ? 1 : 0)),
      west = settled(
        (x) => (x < N / 2 ? 1 : 0),
        undefined,
        (x) => x < N / 2,
      );
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
  const index = JSON.parse(readFileSync('public/map/regions/world/index.json', 'utf8')) as {
    mapW: number;
    mapH: number;
    lon0: number;
    lon1: number;
    latN: number;
    latS: number;
  };
  const rural: Rural = {
    w: index.mapW >> 1,
    h: index.mapH >> 1,
    cells: new Uint8Array(gunzipSync(readFileSync('public/map/rural_1291.bin.gz'))),
  };
  const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const at = (lon: number, lat: number) =>
    ruralAt(
      rural,
      ((lon - index.lon0) / (index.lon1 - index.lon0)) * index.mapW,
      ((merc(index.latN) - merc(lat)) / (merc(index.latN) - merc(index.latS))) * index.mapH,
    );

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
