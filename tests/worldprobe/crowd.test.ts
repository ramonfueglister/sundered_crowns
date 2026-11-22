// The people of the first far step: the finest step's figures where the far ground holds what the finest step's does,
// the persons of the towns and their rulers too, farmers on the balks of the fields laid down, the farmers among the
// persons on their town's furlongs where the finest step puts them, none in a house, and from a piece's table the
// figures of the piece built.
import { afterAll, describe, expect, it } from 'vitest';
import { styleOf } from '../../src/buildings';
import { type Figures, type SettledGround, type Town, crowd, lotOf, setPlacePeople } from '../../src/figures';
import { FIGURE_AT } from '../../src/figures/aims';
import { Mode } from '../../src/figures/estates';
import { Batch } from '../../src/lookprobe/batch';
import { type Ground, type GroundTraits, LAND_Y, Mat, N, SEA_Y, idx } from '../../src/lookprobe/layout';
import CITIES_JSON from '../../src/sim/content/cities_1356.json';
import { CALENDAR } from '../../src/sim/holy_days';
import { WHO } from '../../src/sim/people/day_plan';
import { lotCorner } from '../../src/sim/settlement/fields';
import { WHEAT_FIELD, cropAt } from '../../src/worldprobe/crops';
import { CROWD_AT, type CrowdGround, farCrowd } from '../../src/worldprobe/crowd';
import { coverLand, usePlan } from '../../src/worldprobe/far';
import type { Site } from '../../src/worldprobe/settle';
import { tableOf } from '../../src/worldprobe/table';
import { packTable, unpackTable } from '../../src/worldprobe/table_pack';
import { uprightOf } from '../../src/worldprobe/zoom';
import { land } from './land';

const up = uprightOf(CROWD_AT);
const CITIES = CITIES_JSON.cities;
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
/** the far ground of a cover as the build hands it to the figures (world.ts) */
const farGround = (g: Ground, c: ReturnType<typeof coverLand>): CrowdGround => ({
  ...g,
  town: c.town,
  has: c.has,
  quarters: c.quarters,
  crops: c.crops,
  towns: c.towns,
});
const lists = (f: Figures | undefined) => (f ? [f.a, f.b, f.c, f.d, f.e].map((l) => [...l]) : []);

/**
 * What the finest step has on the quarters of each far column, as far.ts lays it down (crowd.ts): street where nothing
 * stands on the paving of a town, a house's where a building stands off it or a wall runs, ground of its own where a
 * building stands on the paving or round the houses of a hamlet (settle.ts `used` 3). The crop of a field is its lot's.
 */
function quartersOf(s: SettledGround): Uint8Array {
  const quarters = new Uint8Array(N * N);
  for (let z = 0; z < N / 2; z++)
    for (let x = 0; x < N / 2; x++)
      for (let q = 0; q < 4; q++) {
        const j = idx(2 * x + (q & 1), 2 * z + (q >> 1)),
          street = s.town[j] === 1 && s.used[j] === 2,
          house = s.used[j] === 1 && !s.town[j] && !s.field[j],
          own = (s.used[j] === 1 && s.town[j] === 1) || s.used[j] === 3;
        quarters[idx(x, z)] |= (street ? 1 : house ? 16 : own ? 17 : 0) << q;
      }
  return quarters;
}
/** the far ground over a finest one, a column to two blocks each way, and what the finest step has on its quarters */
function farOf(g: Ground, s: SettledGround): CrowdGround {
  const h = new Float64Array(N * N),
    mat = new Uint8Array(N * N),
    wet = new Uint8Array(N * N),
    town = new Uint8Array(N * N);
  for (let z = 0; z < N / 2; z++)
    for (let x = 0; x < N / 2; x++) {
      const i = idx(x, z),
        f = idx(2 * x, 2 * z);
      h[i] = g.h[f] * up;
      mat[i] = g.mat[f];
      wet[i] = g.wet[f];
      town[i] = s.town[f];
    }
  return { h, mat, wet, town, has: new Uint8Array(N * N), quarters: quartersOf(s) };
}
/** an empty finest ground of what settle() leaves on it */
const unsettled = (): SettledGround => ({
  used: new Uint8Array(N * N),
  town: new Uint8Array(N * N),
  field: new Uint8Array(N * N),
});

/**
 * The finest ground of a town of streets between buildings from block 40 to 100 each way, houses beyond it, a river
 * two blocks wide and the land a step higher every sixteen blocks, all of it on whole columns of the far step; and the
 * far ground over it.
 */
function streetsAndHouses(): { g: Ground; s: SettledGround; far: CrowdGround } {
  const g = meadow(),
    s = unsettled();
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      const i = idx(x, z);
      g.h[i] = LAND_Y + 2 * (Math.floor(x / 16) % 2);
      if (x === 104 || x === 105) {
        g.wet[i] = 1;
        g.mat[i] = Mat.Bed;
      } else if (x >= 40 && x < 100 && z >= 40 && z < 100) {
        s.town[i] = 1;
        s.used[i] = x % 10 < 2 || z % 8 < 2 ? 2 : 1;
        g.mat[i] = Mat.Paved;
      } else if (x % 30 < 4 && z % 26 < 4) s.used[i] = 1;
    }
  return { g, s, far: farOf(g, s) };
}
/** the far piece's columns 20 … 50 each way are the finest blocks 40 … 100 */
const PART = { x0: 20, z0: 20, x1: 50, z1: 50 };
const ownFine = (x: number, z: number) => x >= 40 && x < 100 && z >= 40 && z < 100;
/** the far step's figures are the finest step's: at the same places, going the same ways, the same persons */
function expectSame(got: Figures | undefined, fine: Figures) {
  expect(got?.count).toBe(fine.count);
  const [a, b, c, d, e] = lists(got),
    [fa, fb, fc, fd, fe] = lists(fine);
  for (let k = 0; k < a.length; k++) {
    expect(a[k]).toBeCloseTo(fa[k], 4);
    expect(b[k]).toBeCloseTo(fb[k], 4);
  }
  expect([c, d, e]).toEqual([fc, fd, fe]);
  expect([got?.at, got?.plan, got?.seed]).toEqual([fine.at, fine.plan, fine.seed]);
}

// 300 persons of London, two of them rulers, in each part of work by turns; 400 of Cologne, three in four of them
// farmers
const london = CITIES.find((c) => c.name === 'London')!,
  cologne = CITIES.find((c) => c.name === 'Cologne')!,
  PARTS = [WHO.trade, WHO.seeking, WHO.craft, WHO.home];
setPlacePeople({
  place: london.place,
  day: 0,
  id: Array.from({ length: 300 }, (_, k) => 90000 + k),
  born: Array.from({ length: 300 }, () => -365 * 30),
  sex: Array.from({ length: 300 }, (_, k) => k % 2),
  who: Array.from({ length: 300 }, (_, k) => PARTS[k % PARTS.length]),
  calendar: Array.from({ length: 300 }, () => CALENDAR.latin),
  rulers: [
    { uid: 90000, color: 0xaa2222 },
    { uid: 90001, color: 0x2222aa },
  ],
});

setPlacePeople({
  place: cologne.place,
  day: 0,
  id: Array.from({ length: 400 }, (_, k) => 95000 + k),
  born: Array.from({ length: 400 }, () => -365 * 30),
  sex: Array.from({ length: 400 }, (_, k) => k % 2),
  who: Array.from({ length: 400 }, (_, k) => (k % 4 === 0 ? WHO.craft : WHO.farm)),
  calendar: Array.from({ length: 400 }, () => CALENDAR.latin),
});

describe('the people of the first far step', () => {
  afterAll(() => usePlan(null));

  it("are the finest step's, where the far ground holds what the finest step's does", () => {
    const { g, s, far } = streetsAndHouses(),
      fine = crowd(g, s, ownFine),
      got = farCrowd(far, 0, 0, PART);
    expect(fine.count).toBeGreaterThan(100);
    expect(got?.scale).toEqual([1 / 2, up]);
    expectSame(got, fine);
  });

  it('and the persons of a town and its rulers where the finest step stands them, at the market and church too', () => {
    const { g, s, far } = streetsAndHouses(),
      towns: Town[] = [{ site: london.site, cx: 70, cz: 70, half: 30, market: [60, 60, 72, 70], worship: [[84, 54]] }];
    s.towns = towns;
    const fine = crowd(g, s, ownFine),
      ids = Array.from({ length: fine.count }, (_, k) => fine.e[k * 4 + 3] - 1),
      shown = (at: number) => ids.filter((_, k) => fine.at?.[k] === at);
    expect(shown(FIGURE_AT.street).length).toBeGreaterThan(20);
    expect(shown(FIGURE_AT.street)).toEqual(expect.arrayContaining([90000, 90001]));
    expect(shown(FIGURE_AT.market).length).toBeGreaterThan(5);
    expect(shown(FIGURE_AT.worship).length).toBeGreaterThan(5);
    expectSame(farCrowd({ ...far, towns }, 0, 0, PART), fine);
  });

  it('stand about the houses where the finest step does, not on the ground of a hamlet nor about a town building', () => {
    // houses four blocks a side every twenty blocks, those west of block 68 a hamlet's with its ground one block round
    // them, the paving of a town with its buildings north-east of block 80, 60, and a wall north to south at block 70
    const g = meadow(),
      s = unsettled();
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        const i = idx(x, z),
          house = x % 20 < 4 && z % 20 < 4;
        if (x >= 80 && z < 60) {
          s.town[i] = 1;
          s.used[i] = house ? 1 : 2;
          g.mat[i] = Mat.Paved;
        } else if (house || x === 70) s.used[i] = 1;
      }
    const round = (x: number, z: number) =>
      [-1, 0, 1].some((dz) => [-1, 0, 1].some((dx) => s.used[idx(x + dx, z + dz)] === 1));
    for (let z = 1; z < N - 1; z++)
      for (let x = 1; x < 68; x++) if (!s.used[idx(x, z)] && round(x, z)) s.used[idx(x, z)] = 3;
    const fine = crowd(g, s, ownFine),
      at = (k: number) => idx(Math.floor(fine.a[k * 4]), Math.floor(fine.a[k * 4 + 2])),
      about = Array.from({ length: fine.count }, (_, k) => at(k)).filter((i) => !s.town[i]);
    expect(about.length).toBeGreaterThan(20);
    expect(about.every((i) => s.used[i] === 0)).toBe(true);
    expectSame(farCrowd(farOf(g, s), 0, 0, PART), fine);
  });

  it('know from the plan where the finest step has a house and where ground of its own', () => {
    // a farmhouse at 140, 120 of the finest step and a hamlet's house at 180, 120; a walled town at 300, 200 with a
    // house in its square and the wall of its land register 100 m (50 blocks) round its middle
    const R = 100;
    usePlan({
      pieceBlocks: 200,
      houseKinds: ['town', 'village', 'hamlet', 'farm'],
      greatKinds: [],
      pieces: {
        '0,0': { houses: [140, 120, 6, 4, 1, 40, 0xc8b496, 0xa0522d, 3, 180, 120, 6, 4, 1, 40, 0xc8b496, 0xa0522d, 2] },
        '1,1': {
          houses: [296, 196, 6, 8, 2, 60, 0xc8b496, 0xa0522d, 0],
          towns: [{ site: london.site, cx: 300, cz: 200, half: 40, wall: [] }],
        },
      },
    });
    const walls = [
      [-R, -R, R, -R, 0],
      [R, -R, R, R, 0],
      [R, R, -R, R, 0],
      [-R, R, -R, -R, 0],
    ];
    const site: Site = {
      id: london.site,
      at: [150.5, 100.5],
      size: 3,
      pop: 2000,
      region: 'italy',
      style: styleOf('italy'),
      lots: { w: 6, d: 10, x: [], z: [], front: [], walls },
    };
    const c = coverLand(meadow(), CROWD_AT, new Batch(), [site], {
        ploughed: () => 0,
        vines: () => 0,
        farm: () => styleOf('').house,
        own: () => true,
        woods: () => null,
      }),
      on = (fx: number, fz: number) => (c.quarters![idx(fx >> 1, fz >> 1)] >> ((fx & 1) + 2 * (fz & 1))) & 17;
    // the farmhouse is a house, the town's house on its paving is not; the ground round the hamlet's house is its own
    expect([on(140, 120), on(145, 123), on(296, 196), on(301, 203)]).toEqual([16, 16, 17, 17]);
    expect([on(179, 119), on(186, 124), on(183, 119), on(179, 122)]).toEqual([17, 17, 17, 17]);
    expect([on(178, 118), on(139, 119), on(146, 124), on(187, 121)]).toEqual([0, 0, 0, 0]);
    // the wall a house's where it runs over open ground, as the finest step has it
    expect([on(300, 250), on(250, 200), on(350, 170), on(320, 150)]).toEqual([16, 16, 16, 16]);
    expect([on(300, 248), on(252, 200)]).toEqual([0, 0]);
  });

  it('stand farmers on the balks of the fields laid down, facing their crop', () => {
    // wheat laid on every column of 40 × 40: each block of them is field or balk as its lot makes it (crops.ts)
    const crops = new Uint8Array(N * N);
    for (let z = 10; z < 50; z++) for (let x = 10; x < 50; x++) crops[idx(x, z)] = WHEAT_FIELD;
    const far: CrowdGround = {
      h: new Int16Array(N * N).fill(LAND_Y),
      mat: new Uint8Array(N * N).fill(Mat.Soil),
      wet: new Uint8Array(N * N),
      town: new Uint8Array(N * N),
      has: new Uint8Array(N * N),
      crops,
    };
    const f = farCrowd(far, 0, 0, { x0: 10, z0: 10, x1: 50, z1: 50 }),
      sown = (fx: number, fz: number) => cropAt(crops, fx >> 1, fz >> 1, fx & 1, fx, fz);
    let farmers = 0;
    for (let k = 0; f && k < f.count; k++) {
      if (f.c[k * 4] !== Mode.Work) continue;
      farmers++;
      const fx = Math.floor(f.a[k * 4]),
        fz = Math.floor(f.a[k * 4 + 2]),
        facing = f.e[k * 4 + 2];
      expect(sown(fx, fz)).toBe(0);
      expect(sown(fx + Math.round(Math.sin(facing)), fz + Math.round(Math.cos(facing)))).toBe(WHEAT_FIELD);
    }
    expect(farmers).toBeGreaterThan(20);
  });

  it('and the farmers of a town on its furlongs where the finest step puts them, and no anonymous one there', () => {
    // wheat laid on the far columns 10 … 50 each way, and the finest ground of the same fields; the furlongs of the
    // lots lx 3 … 7, lz 3 … 10 are Cologne's
    const crops = new Uint8Array(N * N);
    for (let z = 10; z < 50; z++) for (let x = 10; x < 50; x++) crops[idx(x, z)] = WHEAT_FIELD;
    const lots: number[] = [];
    for (let lz = 3; lz <= 10; lz++) for (let lx = 3; lx <= 7; lx++) lots.push(lx, lz);
    const furlongs = new Map([[cologne.site, lots]]),
      g = meadow(),
      s = unsettled();
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        const crop = cropAt(crops, x >> 1, z >> 1, x & 1, x, z);
        s.field[idx(x, z)] = crop;
        s.used[idx(x, z)] = crop ? 1 : 0;
      }
    const far: CrowdGround = {
      h: new Float64Array(N * N).fill(LAND_Y * up),
      mat: new Uint8Array(N * N).fill(Mat.Grass),
      wet: new Uint8Array(N * N),
      town: new Uint8Array(N * N),
      has: new Uint8Array(N * N),
      crops,
    };
    const fine = crowd(g, { ...s, furlongs }, (x, z) => x >= 20 && x < 100 && z >= 20 && z < 100),
      got = farCrowd(far, 0, 0, { x0: 10, z0: 10, x1: 50, z1: 50 }, furlongs),
      theirs = new Set(
        Array.from({ length: lots.length / 2 }, (_, j) => lotOf(...lotCorner(lots[2 * j], lots[2 * j + 1]))),
      );
    const hands = Array.from({ length: fine.count }, (_, k) => k).filter((k) => fine.at?.[k] === FIGURE_AT.field);
    expect(hands.length).toBeGreaterThan(30);
    for (let k = 0; got && k < got.count; k++) {
      if (got.c[k * 4] !== Mode.Work) continue;
      const facing = got.e[k * 4 + 2],
        lot = lotOf(
          Math.floor(got.a[k * 4]) + Math.round(Math.sin(facing)),
          Math.floor(got.a[k * 4 + 2]) + Math.round(Math.cos(facing)),
        );
      expect(theirs.has(lot)).toBe(got.at?.[k] === FIGURE_AT.field);
    }
    expectSame(got, fine);
  });

  it('stand in the streets of a town and in no house, and come from its table as from the piece built', () => {
    // a town of London's persons at 300, 200 of the finest step with a row of houses across its middle, at the far
    // step's columns 150, 100
    const houses: number[] = [];
    for (let x = 270; x < 330; x += 8) houses.push(x, 196, 6, 8, 2, 60, 0xc8b496, 0xa0522d, 0);
    usePlan({
      pieceBlocks: 200,
      greatKinds: [],
      pieces: { '1,1': { houses, towns: [{ site: london.site, cx: 300, cz: 200, half: 40, wall: [] }] } },
    });
    const site: Site = {
      id: london.site,
      at: [150.5, 100.5],
      size: 3,
      pop: 2000,
      region: 'italy',
      style: styleOf('italy'),
    };
    const g = meadow(),
      c = coverLand(g, CROWD_AT, new Batch(), [site], {
        ploughed: () => 0,
        vines: () => 0,
        farm: () => styleOf('').house,
        own: () => true,
        woods: () => null,
      });
    const part = { x0: 120, z0: 70, x1: 180, z1: 130 },
      built = farCrowd(farGround(g, c), 0, 0, part);
    // the street within the square is paved round the houses, the houses' own ground is built on
    const housed = (fx: number, fz: number) => {
      for (let k = 0; k < houses.length; k += 9) {
        const [hx, hz, w, d] = houses.slice(k, k + 4);
        if (fx >= hx && fx < hx + w && fz >= hz && fz < hz + d) return true;
      }
      return false;
    };
    expect(c.towns).toEqual([{ site: london.site, cx: 300, cz: 200, half: 40 }]);
    expect(built?.count).toBeGreaterThan(10);
    expect(built?.at?.includes(FIGURE_AT.street)).toBe(true);
    for (let k = 0; built && k < built.count; k++) {
      expect(housed(Math.floor(built.a[k * 4]), Math.floor(built.a[k * 4 + 2]))).toBe(false);
      expect(built.c[k * 4] === Mode.Work).toBe(false);
    }
    // and drawn from the piece's table, packed and unpacked, the same
    const t: GroundTraits = {
      ...land().t,
      city: (x, z) => c.town[idx(Math.floor(x), Math.floor(z))] === 1,
      cover: (x, z) => (c.has[idx(x, z)] ? { top: [0, 0, 0], side: [0, 0, 0], rise: 0 } : null),
      quarters: c.quarters,
      crops: c.crops,
      towns: c.towns,
    };
    const table = unpackTable(packTable(tableOf(g, t, part)));
    expectSame(farCrowd(table, table.ox, table.oz, table.part), built!);
  });
});
