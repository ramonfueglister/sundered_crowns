// The hamlets of the towns' farming families and the fields round the towns (src/worldprobe/hamlets.ts, settle.ts):
// a hamlet houses its persons in houses that stand close together, and the hamlets of a town are spread over the
// ground between its walls and the edge of its fields.
import { describe, expect, it } from 'vitest';
import { Batch } from '../../src/lookprobe/batch';
import { LAND_Y, Mat, N, SEA_Y, type Ground } from '../../src/lookprobe/layout';
import { styleOf, townWall } from '../../src/buildings';
import { PEOPLE_PER_PERSON, type Site, blockOf, settle } from '../../src/worldprobe/settle';
import { HAMLET_FAMILIES, hamletAt, hamletLandsOf, hamletsOf } from '../../src/worldprobe/hamlets';

const meadow = (): Ground => ({ h: new Int16Array(N * N).fill(LAND_Y), mat: new Uint8Array(N * N).fill(Mat.Grass), wet: new Uint8Array(N * N), shore: new Uint8Array(N * N), occ: new Float32Array(N * N).fill(LAND_Y), surf: new Float32Array(N * N).fill(SEA_Y), ox: 0, oz: 0 });

describe('the hamlets of a town', () => {
  it('are as many as hold its farming families, none where it has none', () => {
    expect(hamletsOf(0)).toBe(0);
    expect(hamletsOf(3)).toBe(1);
    expect(hamletsOf(388)).toBe(Math.round(388 / HAMLET_FAMILIES));
  });
  it('lie between the walls and the edge of the fields, as many in every ring as it has ground', () => {
    const n = 40, inner = 20, outer = 100, at = Array.from({ length: n }, (_, k) => hamletAt(k, n, inner, outer));
    expect(Math.min(...at)).toBeGreaterThan(inner);
    expect(Math.max(...at)).toBeLessThan(outer);
    // the inner half of the ground holds half the hamlets
    const half = Math.sqrt((inner * inner + outer * outer) / 2);
    expect(at.filter((q) => q < half).length).toBe(n / 2);
  });
  it('are read from the file by the town', () => {
    const m = hamletLandsOf({ year: 1291, town: [7, 9], inside: [583, 27], hamlet: [1564, 89], families: [388, 18], km2: [446.2, 204], reach_km: [16.58, 12.36] });
    expect(m.get(7)).toEqual({ inside: 583, hamlet: 1564, families: 388, km2: 446.2, reachKm: 16.58 });
    expect(m.has(8)).toBe(false);
  });
  it('house their persons in houses close together', () => {
    const persons = 40, counts: Record<string, number> = {};
    const site: Site = { id: 1 << 20, at: [N / 2 + 0.5, N / 2 + 0.5], size: 1, pop: persons * PEOPLE_PER_PERSON, region: '', style: styleOf(''), hamlet: true };
    const { used } = settle(meadow(), new Batch(), [site], [], () => ({ region: '', style: styleOf('') }), () => 0, () => 0, counts);
    expect(counts.hamlet).toBe(1);
    expect(counts.housed).toBeGreaterThanOrEqual(persons);
    expect(counts.housed).toBeLessThan(1.5 * persons);
    expect(counts.farm).toBeGreaterThanOrEqual(3);
    // no house stands apart: all that is built lies within a dozen blocks of the middle
    let far = 0;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (used[z * N + x] === 1) far = Math.max(far, Math.hypot(x - N / 2, z - N / 2));
    expect(far).toBeLessThan(12);
  });
});

describe('the houses of a town with a land register', () => {
  it('stand one to a parcel, at its street, wall to wall with the neighbours', () => {
    // two rows of six parcels back to back, 6 m at the street and 18 m deep: the north row fronts north, the south row south
    const x = [...Array(6).keys(), ...Array(6).keys()].map((k) => (k - 2.5) * 6), z = [...Array(6).fill(-9), ...Array(6).fill(9)], front = [...Array(6).fill(0), ...Array(6).fill(2)];
    const counts: Record<string, number> = {};
    const site: Site = { id: 5, at: [N / 2 + 0.5, N / 2 + 0.5], size: 1, pop: 4800, region: '', style: styleOf(''), lots: { w: 6, d: 18, x, z, front } };
    const { used } = settle(meadow(), new Batch(), [site], [], () => ({ region: '', style: styleOf('') }), () => 0, () => 0, counts);
    expect(counts.parcel).toBe(12);
    expect(counts.house).toBe(12);
    expect(counts['parcel without house']).toBeUndefined();
    // the yards between the two rows stay open
    const c = N / 2;
    for (let dx = -8; dx < 8; dx++) expect(used[c * N + c + dx]).not.toBe(1);
  });
  it('has its building ground surveyed: no house on water, on a step or where the church stands', () => {
    const g = meadow(), c = N / 2;
    // a river three blocks wide east of the middle, a ledge three blocks high west of it
    for (let z = 0; z < N; z++) { for (let x = c + 10; x < c + 13; x++) g.wet[z * N + x] = 1; for (let x = 0; x < c - 10; x++) g.h[z * N + x] = LAND_Y + 3; }
    const site: Site = { id: 5, at: [c + 0.5, c + 0.5], size: 2, pop: 4800, region: '', style: styleOf('') };
    let asked = 0, open = 0, church = 0;
    const { used } = settle(g, new Batch(), [site], [], () => ({ region: '', style: styleOf('') }), () => 0, () => 0, {}, undefined, undefined, undefined, (s, free) => {
      asked++;
      expect(s.id).toBe(5);
      for (let dz = -20; dz <= 20; dz++) {
        for (let dx = 10; dx < 13; dx++) expect(free(dx, dz)).toBe(false);
        expect(free(-10, dz)).toBe(false);
        expect(free(-11, dz)).toBe(false);
        expect(free(-14, dz)).toBe(true);
        expect(free(15, dz)).toBe(true);
      }
      // the church stands when the ground is asked, the houses do not yet
      for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) free(dx, dz) ? open++ : church++;
    });
    expect(asked).toBe(1);
    expect(church).toBeGreaterThan(8);
    expect(open).toBeGreaterThan(150);
    expect(used.some((u) => u === 1)).toBe(true);
  });
  it('keeps its wall where a river crosses it, open at the water; a town in the sea has none', () => {
    const walls = (wet: (x: number, z: number) => boolean) => {
      const g = meadow(), c = N / 2, counts: Record<string, number> = {};
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (wet(x - c, z - c)) g.wet[z * N + x] = 1;
      const site: Site = { id: 5, at: [c + 0.5, c + 0.5], size: 4, pop: 60000, region: '', style: styleOf('') };
      settle(g, new Batch(), [site], [], () => ({ region: '', style: styleOf('') }), () => 0, () => 0, counts);
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
});

describe('the fields', () => {
  it('lie in blocks of one course, three lots by two', () => {
    expect(blockOf(0, 0)).toEqual([0, 0]);
    expect(blockOf(32, 15)).toEqual([0, 0]);
    expect(blockOf(33, 16)).toEqual([1, 1]);
    expect(blockOf(-1, -1)).toEqual([-1, -1]);
  });
});
