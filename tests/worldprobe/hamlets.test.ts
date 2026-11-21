// The hamlets of the towns' farming families and the fields round the towns (src/worldprobe/hamlets.ts, settle.ts):
// a hamlet houses its persons in houses that stand close together, and the hamlets of a town are spread over the
// ground between its walls and the edge of its fields.
import { describe, expect, it } from 'vitest';
import { Batch } from '../../src/lookprobe/batch';
import { LAND_Y, Mat, N, SEA_Y, type Ground } from '../../src/lookprobe/layout';
import { styleOf, townWall } from '../../src/buildings';
import { PEOPLE_PER_PERSON, SPRING, type Site, blockOf, settle } from '../../src/worldprobe/settle';
import { fieldsByLot, lotKey, type TownParcels } from '../../src/worldprobe/lots';
import { CROP, GEWANN, cropOf, lotCorner } from '../../src/sim/settlement/fields';
import { HAMLET_FAMILIES, hamletAt, hamletLandsOf, hamletsOf } from '../../src/worldprobe/hamlets';

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

describe('the hamlets of a town', () => {
  it('are as many as hold its farming families, none where it has none', () => {
    expect(hamletsOf(0)).toBe(0);
    expect(hamletsOf(3)).toBe(1);
    expect(hamletsOf(388)).toBe(Math.round(388 / HAMLET_FAMILIES));
  });
  it('lie between the walls and the edge of the fields, as many in every ring as it has ground', () => {
    const n = 40,
      inner = 20,
      outer = 100,
      at = Array.from({ length: n }, (_, k) => hamletAt(k, n, inner, outer));
    expect(Math.min(...at)).toBeGreaterThan(inner);
    expect(Math.max(...at)).toBeLessThan(outer);
    // the inner half of the ground holds half the hamlets
    const half = Math.sqrt((inner * inner + outer * outer) / 2);
    expect(at.filter((q) => q < half).length).toBe(n / 2);
  });
  it('are read from the file by the town', () => {
    const m = hamletLandsOf({
      year: 1291,
      town: [7, 9],
      inside: [583, 27],
      hamlet: [1564, 89],
      families: [388, 18],
      km2: [446.2, 204],
      reach_km: [16.58, 12.36],
    });
    expect(m.get(7)).toEqual({ inside: 583, hamlet: 1564, families: 388, km2: 446.2, reachKm: 16.58 });
    expect(m.has(8)).toBe(false);
  });
  it('house their persons in houses close together', () => {
    const persons = 40,
      counts: Record<string, number> = {};
    const site: Site = {
      id: 1 << 20,
      at: [N / 2 + 0.5, N / 2 + 0.5],
      size: 1,
      pop: persons * PEOPLE_PER_PERSON,
      region: '',
      style: styleOf(''),
      hamlet: true,
    };
    const { used } = settle(
      meadow(),
      new Batch(),
      [site],
      [],
      () => ({ region: '', style: styleOf('') }),
      () => 0,
      () => 0,
      counts,
    );
    expect(counts.hamlet).toBe(1);
    expect(counts.housed).toBeGreaterThanOrEqual(persons);
    expect(counts.housed).toBeLessThan(1.5 * persons);
    expect(counts.farm).toBeGreaterThanOrEqual(3);
    // no house stands apart: all that is built lies within a dozen blocks of the middle
    let far = 0;
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) if (used[z * N + x] === 1) far = Math.max(far, Math.hypot(x - N / 2, z - N / 2));
    expect(far).toBeLessThan(12);
  });
});

describe('the houses of a town with a land register', () => {
  it('stand one to a parcel, at its street, wall to wall with the neighbours', () => {
    // two rows of six parcels back to back, 6 m at the street and 18 m deep: the north row fronts north, the south row south
    const x = [...Array(6).keys(), ...Array(6).keys()].map((k) => (k - 2.5) * 6),
      z = [...Array(6).fill(-9), ...Array(6).fill(9)],
      front = [...Array(6).fill(0), ...Array(6).fill(2)];
    const counts: Record<string, number> = {};
    const site: Site = {
      id: 5,
      at: [N / 2 + 0.5, N / 2 + 0.5],
      size: 1,
      pop: 4800,
      region: '',
      style: styleOf(''),
      lots: { w: 6, d: 18, x, z, front },
    };
    const { used } = settle(
      meadow(),
      new Batch(),
      [site],
      [],
      () => ({ region: '', style: styleOf('') }),
      () => 0,
      () => 0,
      counts,
    );
    expect(counts.parcel).toBe(12);
    expect(counts.house).toBe(12);
    expect(counts['parcel without house']).toBeUndefined();
    // the yards between the two rows stay open
    const c = N / 2;
    for (let dx = -8; dx < 8; dx++) expect(used[c * N + c + dx]).not.toBe(1);
  });
  it('has its building ground surveyed before anything is built: no house on water or on a step', () => {
    const g = meadow(),
      c = N / 2;
    // a river three blocks wide east of the middle, a ledge three blocks high west of it
    for (let z = 0; z < N; z++) {
      for (let x = c + 10; x < c + 13; x++) g.wet[z * N + x] = 1;
      for (let x = 0; x < c - 10; x++) g.h[z * N + x] = LAND_Y + 3;
    }
    const site: Site = { id: 5, at: [c + 0.5, c + 0.5], size: 2, pop: 4800, region: '', style: styleOf('') };
    let asked = 0,
      open = 0,
      church = 0;
    const { used } = settle(
      g,
      new Batch(),
      [site],
      [],
      () => ({ region: '', style: styleOf('') }),
      () => 0,
      () => 0,
      {},
      undefined,
      undefined,
      undefined,
      (s, free) => {
        asked++;
        expect(s.id).toBe(5);
        for (let dz = -20; dz <= 20; dz++) {
          for (let dx = 10; dx < 13; dx++) expect(free(dx, dz)).toBe(false);
          expect(free(-10, dz)).toBe(false);
          expect(free(-11, dz)).toBe(false);
          expect(free(-14, dz)).toBe(true);
          expect(free(15, dz)).toBe(true);
        }
        // neither the church the graphic builds of its own nor the houses stand when the ground is asked
        for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) free(dx, dz) ? open++ : church++;
      },
    );
    expect(asked).toBe(1);
    expect(church).toBe(0);
    expect(open).toBe(17 * 17);
    expect(used.some((u) => u === 1)).toBe(true);
  });
  it('keeps its wall where a river crosses it, open at the water; a town in the sea has none', () => {
    const walls = (wet: (x: number, z: number) => boolean) => {
      const g = meadow(),
        c = N / 2,
        counts: Record<string, number> = {};
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (wet(x - c, z - c)) g.wet[z * N + x] = 1;
      const site: Site = { id: 5, at: [c + 0.5, c + 0.5], size: 4, pop: 60000, region: '', style: styleOf('') };
      settle(
        g,
        new Batch(),
        [site],
        [],
        () => ({ region: '', style: styleOf('') }),
        () => 0,
        () => 0,
        counts,
      );
      return counts.wall ?? 0;
    };
    expect(walls(() => false)).toBe(1);
    // a river three blocks wide from north to south beside the middle
    expect(walls((x) => x >= 6 && x < 9)).toBe(1);
    // the sea from just west of the middle on
    expect(walls((x) => x < -3)).toBe(0);
  });
  it('has no turret on a corner of its wall that stands in the water, and piers at an opening', () => {
    const whole = townWall(40, 40).triangles;
    expect(townWall(40, 40, [{ side: 'nz', from: -20, to: -12 }]).triangles).toBeLessThan(whole);
    expect(townWall(40, 40, [{ side: 'nz', from: -3, to: 3 }]).triangles).toBeGreaterThan(whole);
  });
  it('crosses a river with a water gate, and leaves a harbour open', () => {
    const top = (gaps: Parameters<typeof townWall>[2]) => {
      const b = townWall(60, 60, gaps);
      let n = 0;
      for (let t = 0; t < b.pos.length; t += 9)
        if (b.pos[t + 2] < -29 && Math.abs(b.pos[t]) < 1 && b.pos[t + 1] > 1.5) n++;
      return n;
    };
    // over the middle of a river six wide the wall goes on, on two arches with a post between them
    expect(top([{ side: 'nz', from: -3, to: 3 }])).toBeGreaterThan(0);
    expect(townWall(60, 60, [{ side: 'nz', from: -3, to: 3 }]).triangles).toBeGreaterThan(
      townWall(60, 60, [{ side: 'nz', from: -1, to: 1 }]).triangles,
    );
    // water twenty wide is no river: the wall stays open
    expect(top([{ side: 'nz', from: -10, to: 10 }])).toBe(0);
  });
  it('tells what it builds: every house, its great buildings, its wall', () => {
    const c = N / 2,
      counts: Record<string, number> = {},
      houses: string[] = [],
      greats: string[] = [],
      walled: (readonly unknown[] | null)[] = [];
    const town: Site = { id: 5, at: [c + 0.5, c + 0.5], size: 4, pop: 60000, region: '', style: styleOf('') };
    const hamlet: Site = {
      id: 1 << 20,
      at: [c + 80.5, c + 0.5],
      size: 1,
      pop: 40 * PEOPLE_PER_PERSON,
      region: '',
      style: styleOf(''),
      hamlet: true,
    };
    settle(
      meadow(),
      new Batch(),
      [town, hamlet],
      [],
      () => ({ region: '', style: styleOf('') }),
      () => 0,
      () => 0,
      counts,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        house: (l, kind, height) => {
          expect(height).toBeGreaterThan(1);
          expect(l.w * l.d).toBeGreaterThan(0);
          houses.push(kind);
        },
        great: (kind, _x, _z, w, d, _y, height, site) => {
          expect(site).toBe(5);
          expect(w * d * height).toBeGreaterThan(0);
          greats.push(kind);
        },
        town: (site, cx, cz, half, _y, wall) => {
          expect([site, cx, cz]).toEqual([5, c, c]);
          expect(half).toBeGreaterThan(5);
          walled.push(wall);
        },
      },
    );
    expect(houses.length).toBe(counts.house);
    expect(houses.filter((k) => k === 'hamlet').length).toBeGreaterThanOrEqual(3);
    expect(houses.filter((k) => k === 'town').length).toBeGreaterThan(10);
    expect(greats).toContain('landmark');
    expect(walled).toEqual([[]]);
  });
  it('builds a hamlet of the land register as farmsteads at a lane, a small house on each', () => {
    // two rows of five farmsteads of 10 m by 17.5 m at a lane running east and west
    const x = [...Array(5).keys(), ...Array(5).keys()].map((k) => (k - 2) * 10),
      z = [...Array(5).fill(-11.3), ...Array(5).fill(11.3)],
      front = [...Array(5).fill(2), ...Array(5).fill(0)];
    const counts: Record<string, number> = {},
      c = N / 2,
      widths: number[] = [];
    const site: Site = {
      id: 1 << 20,
      at: [c + 0.5, c + 0.5],
      size: 1,
      pop: 20 * PEOPLE_PER_PERSON,
      region: '',
      style: styleOf(''),
      hamlet: true,
      lots: { w: 10, d: 17.5, x, z, front },
    };
    const { used } = settle(
      meadow(),
      new Batch(),
      [site],
      [],
      () => ({ region: '', style: styleOf('') }),
      () => 0,
      () => 0,
      counts,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        house: (l, kind) => {
          expect(kind).toBe('hamlet');
          widths.push(l.w);
        },
        great: () => {},
        town: () => {},
      },
    );
    expect(counts.farmstead).toBe(10);
    expect(counts.house).toBe(10);
    expect(counts['farmstead without house']).toBeUndefined();
    expect(counts.housed).toBeGreaterThanOrEqual(20);
    expect(Math.max(...widths)).toBeLessThanOrEqual(4);
    // the lane between the rows stays open
    for (let dx = -10; dx < 10; dx++) expect(used[c * N + c + dx]).not.toBe(1);
  });
});

describe('the fields', () => {
  it('lie in blocks of one course, three lots by two', () => {
    expect(blockOf(0, 0)).toEqual([0, 0]);
    expect(blockOf(32, 15)).toEqual([0, 0]);
    expect(blockOf(33, 16)).toEqual([1, 1]);
    expect(blockOf(-1, -1)).toEqual([-1, -1]);
  });
});

describe('the fields of the land register (settlement feature 4)', () => {
  it('are found by the field lot each furlong lies on, with the crop of its course this year, its depth and its strips', () => {
    // a town whose centre is the world block (0, 0), one hamlet of four farmsteads, two furlongs: one of the open field, one shortened and held whole
    const [x0, z0] = lotCorner(3, 2),
      [x1, z1] = lotCorner(-4, 5);
    const parcels: TownParcels = Object.assign(
      new Map([
        [
          7,
          {
            w: 0,
            d: 0,
            x: [],
            z: [],
            front: [],
            hamlets: [
              { east: 0, south: 0, w: 10, d: 17.5, x: [0, 10, 0, 10], z: [-11, -11, 11, 11], front: [2, 2, 0, 0] },
            ],
            courses: 3,
            fieldW: 20,
            fields: {
              hamlet: [0, 0],
              x: [x0 * 2 + 10, x1 * 2 + 10],
              z: [z0 * 2 + 7, z1 * 2 + 3],
              d: [14, 6],
              zelge: [0, 2],
              farm: [-1, 1],
            },
          },
        ],
      ]),
      { year: 1291 },
    );
    const by = fieldsByLot(parcels, 1291, () => [0, 0]);
    expect(by.size).toBe(2);
    expect(by.get(lotKey(3, 2))).toEqual({ crop: cropOf(0, 3, 1291), rows: 7, strips: 4 });
    expect(by.get(lotKey(-4, 5))).toEqual({ crop: cropOf(2, 3, 1291), rows: 3, strips: 1 });
    expect(fieldsByLot(parcels, 1291, () => null).size).toBe(0);
  });
  it('are the only fields round the towns: a furlong in strips, its crop, as deep as the register has it, nothing else ploughed', () => {
    const counts: Record<string, number> = {},
      [cx, cz] = lotCorner(10, 10);
    const furlong = { crop: CROP.spring, rows: 4, strips: 5 } as const;
    const { field } = settle(
      meadow(),
      new Batch(),
      [],
      [],
      () => ({ region: '', style: styleOf('') }),
      () => 1,
      () => 0,
      counts,
      undefined,
      undefined,
      () => 3,
      undefined,
      undefined,
      (lx, lz) => (lx === 10 && lz === 10 ? furlong : undefined),
    );
    let tilled = 0;
    for (let i = 0; i < N * N; i++)
      if (field[i]) {
        tilled++;
        expect(field[i]).toBe(SPRING);
      }
    expect(tilled).toBe(GEWANN.w * furlong.rows);
    for (let z = cz; z < cz + furlong.rows; z++)
      for (let x = cx; x < cx + GEWANN.w; x++) expect(field[z * N + x]).toBe(SPRING);
    expect(field[(cz + furlong.rows) * N + cx]).toBe(0);
    expect(counts.field).toBe(1);
    expect(counts.spring).toBe(1);
  });
  it('are surveyed for room before they are laid: dry, free and level lots', () => {
    const g = meadow(),
      [cx, cz] = lotCorner(10, 10);
    for (let x = cx; x < cx + 3; x++) g.wet[(cz + 2) * N + x] = 1;
    const asked: boolean[] = [];
    settle(
      g,
      new Batch(),
      [],
      [],
      () => ({ region: '', style: styleOf('') }),
      () => 0,
      () => 0,
      {},
      undefined,
      undefined,
      undefined,
      undefined,
      {
        house: () => {},
        great: () => {},
        town: () => {},
        room: (fits) => {
          asked.push(fits(10, 10), fits(12, 10));
        },
      },
    );
    expect(asked).toEqual([false, true]);
  });
});
