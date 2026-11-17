// The hamlets of the towns' farming families and the fields round the towns (src/worldprobe/hamlets.ts, settle.ts):
// a hamlet houses its persons in houses that stand close together, and the hamlets of a town are spread over the
// ground between its walls and the edge of its fields.
import { describe, expect, it } from 'vitest';
import { Batch } from '../../src/lookprobe/batch';
import { LAND_Y, Mat, N, SEA_Y, type Ground } from '../../src/lookprobe/layout';
import { styleOf } from '../../src/buildings';
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

describe('the fields', () => {
  it('lie in blocks of one course, three lots by two', () => {
    expect(blockOf(0, 0)).toEqual([0, 0]);
    expect(blockOf(32, 15)).toEqual([0, 0]);
    expect(blockOf(33, 16)).toEqual([1, 1]);
    expect(blockOf(-1, -1)).toEqual([-1, -1]);
  });
});
