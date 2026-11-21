// Where the persons of a town go by their plan of the day (people feature 12): the ground of the town's market and the
// middles of its houses of worship, from the land register, in world blocks (src/worldprobe/town_spots.ts).
import { describe, expect, it } from 'vitest';
import { m } from '../../src/buildings';
import type { Model } from '../../src/buildings/model';
import type { Parcels } from '../../src/worldprobe/lots';
import type { Mark } from '../../src/worldprobe/settle';
import { marketOf, worshipOf } from '../../src/worldprobe/town_spots';

const lots: Parcels = {
  w: 8,
  d: 20,
  x: [],
  z: [],
  front: [],
  street: 6,
  streets: [
    [0, 0, 60, 0, 1],
    [40, 30, 10, 10, 4],
  ],
};
const model = {} as Model; // (never built here: the spots read only a landmark's middle)
const mark = (x: number, z: number, worship: boolean): Mark => ({ x, z, model, kind: 'church', worship });

describe('the spots of a town', () => {
  it('have the market as the corners the register gives it, from the middle of the town', () => {
    expect(marketOf(lots, 100, 200)).toEqual([
      100 + Math.round(m(10)),
      200 + Math.round(m(10)),
      100 + Math.round(m(40)),
      200 + Math.round(m(30)),
    ]);
    expect(marketOf({ ...lots, streets: [[0, 0, 60, 0, 1]] }, 100, 200)).toBeUndefined();
  });
  it('have the houses of worship among the landmarks, at their middles', () => {
    expect(worshipOf([mark(30, -15, true), mark(5, 5, false), mark(-60, 0, true)], 100, 200)).toEqual([
      [100 + Math.round(m(30)), 200 + Math.round(m(-15))],
      [100 + Math.round(m(-60)), 200],
    ]);
    expect(worshipOf(undefined, 100, 200)).toEqual([]);
  });
});
