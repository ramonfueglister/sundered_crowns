// The towns the world graphic builds follow the start year: a place with people in towns_<year>.json builds a town that
// houses those people at 1:100, the same numbers the simulation's places hold.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Batch } from '../../src/lookprobe/batch';
import { LAND_Y, Mat, N, SEA_Y, type Ground } from '../../src/lookprobe/layout';
import { styleOf } from '../../src/buildings';
import { PEOPLE_PER_PERSON, PERSONS_PER_FLOOR_BLOCK, type Site, settle } from '../../src/worldprobe/settle';
import { inhabitants1356, inhabitantsOf, type TownsJson } from '../../src/worldprobe/towns';
import gazetteer from '../../data/content/gazetteer.json';

const towns = JSON.parse(readFileSync(resolve(__dirname, '../../public/data/towns_1291.json'), 'utf8')) as TownsJson;
const venice = gazetteer.places.findIndex((p) => p.name === 'Venice');
const meadow = (): Ground => ({ h: new Int16Array(N * N).fill(LAND_Y), mat: new Uint8Array(N * N).fill(Mat.Grass), wet: new Uint8Array(N * N), shore: new Uint8Array(N * N), occ: new Float32Array(N * N).fill(LAND_Y), surf: new Float32Array(N * N).fill(SEA_Y), ox: 0, oz: 0 });
/** the persons the houses of a town of `pop` people hold, laid out on a level meadow as Venice builds */
const housed = (pop: number) => {
  const site: Site = { id: venice, at: [N / 2 + 0.5, N / 2 + 0.5], size: 5, pop, region: 'italy', style: styleOf('italy') };
  const { lots } = settle(meadow(), new Batch(), [site], [], () => ({ region: '', style: styleOf('') }), () => 0, () => 0, {});
  return lots.reduce((s, l) => s + l.w * l.d * l.floors * PERSONS_PER_FLOOR_BLOCK, 0);
};

describe('the towns of a start year', () => {
  it('take the people of the towns file by the place of the gazetteer, and leave the unknown ones to their size', () => {
    const m = inhabitantsOf(towns);
    expect(towns.people.length).toBe(gazetteer.places.length);
    expect(m.get(venice)).toBe(towns.people[venice]);
    expect(m.get(venice)).toBeGreaterThan(100_000); // Chandler, 1291
    const unknown = towns.people.findIndex((n) => n === null);
    expect(m.has(unknown)).toBe(false);
    // 1356 keeps the cities of 1356
    expect(inhabitants1356().get(venice)).not.toBe(m.get(venice));
  });
  it('build a town that houses the people of the year at 1:100', () => {
    const pop = inhabitantsOf(towns).get(venice)!;
    const persons = housed(pop);
    expect(persons).toBeGreaterThanOrEqual(pop / PEOPLE_PER_PERSON);
    expect(persons).toBeLessThan(1.5 * pop / PEOPLE_PER_PERSON);
    expect(housed(pop / 2)).toBeLessThan(persons);
  }, 60000);
});

describe('a walled town', () => {
  it('keeps the ground within its wall from fields on every ground it falls on, also where its wall lies beyond that ground', () => {
    // parcels of 8 by 16 metres on a lattice within 120 metres of the middle, their fronts turning round
    const x: number[] = [], z: number[] = [], front: number[] = [];
    for (let a = -120; a <= 120; a += 24) for (let b = -120; b <= 120; b += 24) { x.push(a); z.push(b); front.push(((a + b) / 24) & 3); }
    const lots = { w: 8, d: 16, x, z, front };
    /** the town with its middle at (cx, N / 2) of a meadow wholly under the plough: its square, and the fields in it */
    const fieldsIn = (cx: number, half?: number) => {
      const site: Site = { id: venice, at: [cx + 0.5, N / 2 + 0.5], size: 4, pop: 8_000, region: 'italy', style: styleOf('italy'), lots };
      const { towns, field } = settle(meadow(), new Batch(), [site], [], () => ({ region: '', style: styleOf('') }), () => 1, () => 0, {});
      const h = half ?? towns[0].half;
      let n = 0;
      for (let zz = N / 2 - h - 1; zz < N / 2 + h + 1; zz++) for (let xx = Math.max(0, cx - h - 1); xx < Math.min(N, cx + h + 1); xx++) if (field[zz * N + xx]) n++;
      return { half: h, n };
    };
    // on the ground that holds it whole, and on one whose west edge runs 30 blocks west of its middle
    const whole = fieldsIn(N / 2);
    expect(whole.half).toBeGreaterThan(60);
    expect(whole.n).toBe(0);
    expect(fieldsIn(30, whole.half).n).toBe(0);
  }, 60000);

  it('keeps its paving as street inside the wall, where the persons of the town walk (src/figures/crowd.ts)', () => {
    const site: Site = { id: venice, at: [N / 2 + 0.5, N / 2 + 0.5], size: 5, pop: 40_000, region: 'italy', style: styleOf('italy') };
    const counts: Record<string, number> = {};
    const { used, town } = settle(meadow(), new Batch(), [site], [], () => ({ region: '', style: styleOf('') }), () => 0, () => 0, counts);
    expect(counts.wall).toBe(1);
    let paved = 0, street = 0;
    for (let i = 0; i < N * N; i++) if (town[i]) { paved++; if (used[i] === 2) street++; }
    expect(paved).toBeGreaterThan(0);
    expect(street).toBe(paved);
  }, 60000);
});
