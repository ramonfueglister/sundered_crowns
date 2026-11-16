// No house of the world graphic stands alone: the people the simulation counts on the land of a place, outside its
// towns, live in the villages and small towns of the gazetteer, each piece of land's in the nearest one.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Batch } from '../../src/lookprobe/batch';
import { type Ground, LAND_Y, Mat, N, SEA_Y } from '../../src/lookprobe/layout';
import { styleOf } from '../../src/buildings';
import { CHURCH_FROM, FIELD_GROUND, PEOPLE_PER_PERSON, type Site, VILLAGE_MOST, VILLAGE_REACH, WALLED_FROM, settle } from '../../src/worldprobe/settle';
import { type TownsJson, type VillagesJson, inhabitantsOf } from '../../src/worldprobe/towns';
import gazetteer from '../../data/content/gazetteer.json';

const towns = JSON.parse(readFileSync('public/data/towns_1291.json', 'utf8')) as TownsJson, villages = JSON.parse(readFileSync('public/data/villages_1291.json', 'utf8')) as VillagesJson;
const meadow = (): Ground => ({ h: new Int16Array(N * N).fill(LAND_Y), mat: new Uint8Array(N * N).fill(Mat.Grass), wet: new Uint8Array(N * N), shore: new Uint8Array(N * N), occ: new Float32Array(N * N).fill(LAND_Y), surf: new Float32Array(N * N).fill(SEA_Y), ox: 0, oz: 0 });
const MID = N / 2;
/** a place of `people` built on a ground, with fields wherever they find room */
const built = (people: number, size = 1, g = meadow(), ploughed = 0, id = 7) => {
  const site: Site = { id, at: [MID + 0.5, MID + 0.5], size, pop: people, region: 'france', style: styleOf('france') }, counts: Record<string, number> = {};
  const laid = settle(g, new Batch(), [site], [], () => ploughed, () => 0, counts);
  let ground = 0, far = 0;
  for (let i = 0; i < N * N; i++) if (laid.used[i] && !laid.field[i]) { ground++; far = Math.max(far, Math.hypot((i % N) - MID, Math.floor(i / N) - MID)); }
  return { counts, laid, g, ground, far };
};

describe('the shipped villages of 1291', () => {
  const setup = JSON.parse(readFileSync('public/data/setup_1291.json', 'utf8')) as { pop: (number | null)[] };
  const geo = JSON.parse(readFileSync('public/data/geo.json', 'utf8')) as { beyond: { L0: number } };

  it('hold the people of the land of the game map: what the simulation counts in its places, less their towns', () => {
    expect(villages.people.length).toBe(gazetteer.places.length);
    const inTowns = new Float64Array(geo.beyond.L0);
    towns.people.forEach((n, k) => { if (n && towns.place[k] < inTowns.length) inTowns[towns.place[k]] += n; });
    let onLand = 0;
    for (let p = 0; p < inTowns.length; p++) onLand += Math.max(0, (setup.pop[p] ?? 0) - inTowns[p]);
    const housed = villages.people.reduce((a, b) => a + b, 0);
    expect(onLand).toBeGreaterThan(100_000_000);
    expect(Math.abs(housed / onLand - 1)).toBeLessThan(0.001);
  });

  it('live in the villages and small towns only', () => {
    let none = 0;
    gazetteer.places.forEach((p, k) => { if (p.size >= WALLED_FROM) expect(villages.people[k]).toBe(0); else if (!villages.people[k]) none++; });
    // nearly every village has land that is nearest to it
    expect(none).toBeLessThan(10);
  });

  it('are added to what the towns file knows of a place', () => {
    const both = inhabitantsOf(towns, villages), alone = inhabitantsOf(towns);
    const village = gazetteer.places.findIndex((p, k) => p.size === 1 && towns.people[k] === null && villages.people[k] > 0);
    expect(alone.has(village)).toBe(false);
    expect(both.get(village)).toBe(villages.people[village]);
    const town = gazetteer.places.findIndex((p) => p.name === 'Paris');
    expect(both.get(town)).toBe(towns.people[town]);
  });
});

describe('a village on the ground', () => {
  it('houses the people of the land round it', () => {
    for (const people of [3000, 25000, 100000]) {
      const { counts } = built(people);
      expect(counts.asked).toBeCloseTo(people / PEOPLE_PER_PERSON);
      expect(counts.housed).toBeGreaterThanOrEqual(people / PEOPLE_PER_PERSON);
      // no more than a house too many
      expect(counts.housed).toBeLessThan(people / PEOPLE_PER_PERSON + 20);
    }
  });

  it('stands close about its church: no house lies off alone', () => {
    const { counts, far, laid } = built(25000);
    expect(counts.church).toBe(1);
    expect(counts.house).toBeGreaterThan(25);
    // within twice the reach of a round village (it reaches farther one way than the other)
    expect(far).toBeLessThan(2 * (2 + VILLAGE_REACH * Math.sqrt(250)) + 3);
    // every house has another within four columns of it
    const houses: [number, number][] = [];
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (laid.used[z * N + x] === 1) houses.push([x, z]);
    const at = new Set(houses.map(([x, z]) => z * N + x));
    // (a house is at least two by two columns: one that stood alone would have no built column beyond its own)
    for (const [x, z] of houses) {
      let near = 0;
      for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++) if (at.has((z + dz) * N + x + dx)) near++;
      expect(near, `house at ${x}, ${z}`).toBeGreaterThan(20);
    }
  });

  it('has a church from forty persons on, and always as a small town', () => {
    expect(built((CHURCH_FROM - 10) * PEOPLE_PER_PERSON).counts.church ?? 0).toBe(0);
    expect(built(CHURCH_FROM * PEOPLE_PER_PERSON).counts.church).toBe(1);
    expect(built((CHURCH_FROM - 10) * PEOPLE_PER_PERSON, 2).counts.church).toBe(1);
  });

  it('keeps its ground to itself: no field lies between its houses', () => {
    const { laid, counts } = built(25000, 1, meadow(), FIELD_GROUND);
    expect(counts.field).toBeGreaterThan(1000);
    let open = 0;
    for (let i = 0; i < N * N; i++) if (laid.used[i] === 3) { open++; expect(laid.field[i]).toBe(0); }
    expect(open).toBeGreaterThan(200);
    // the fields begin where the village ends
    expect(laid.field[MID * N + MID]).toBe(0);
  });

  it('is built for no more persons than its ground can hold, and says how many were asked for', () => {
    const { counts, far } = built(1_000_000);
    expect(counts.asked).toBe(10_000);
    expect(counts.housed).toBeGreaterThanOrEqual(VILLAGE_MOST);
    expect(counts.housed).toBeLessThan(VILLAGE_MOST + 20);
    // inside the margin of a piece (pieces.ts: a ground reaches 100 columns beyond its piece)
    expect(far).toBeLessThan(90);
  }, 30000);

  it('stands on ground levelled to that of its middle', () => {
    const g = meadow();
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { g.h[z * N + x] = LAND_Y + ((x * 5 + z * 3) % 7 < 2 ? 1 : 0) + (x > MID + 40 ? 6 : 0); g.occ[z * N + x] = g.h[z * N + x]; }
    const y = g.h[MID * N + MID], { counts } = built(25000, 1, g);
    for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) expect(g.h[(MID + dz) * N + MID + dx]).toBe(y);
    expect(counts.housed).toBeGreaterThanOrEqual(250);
    // the scarp beyond it stands as it was
    expect(g.h[MID * N + MID + 60]).toBeGreaterThanOrEqual(LAND_Y + 6);
  });
});

describe('the ground the tool of the field land counts for a town or village', () => {
  const tool = readFileSync('tools/worldprobe/build_fieldland.py', 'utf8');
  const [village, town] = /VILLAGE_GROUND, TOWN_GROUND = \(([^)]+)\), \(([^)]+)\)/.exec(tool)!.slice(1).map((t) => t.split(',').map(Number));
  const blocks = ([a, b, c]: number[], persons: number) => a * persons + b * Math.sqrt(persons) + c;

  it('is what settle builds a village on, to a fifth', () => {
    for (const persons of [30, 120, 500, 2000]) {
      const mean = [1, 2, 3].reduce((sum, id) => sum + built(persons * PEOPLE_PER_PERSON, 1, meadow(), 0, id).ground, 0) / 3;
      expect(blocks(village, persons) / mean, `${persons} persons`).toBeGreaterThan(0.8);
      expect(blocks(village, persons) / mean, `${persons} persons`).toBeLessThan(1.2);
    }
  }, 30000);

  it('is what settle builds a walled town on, to a quarter', () => {
    for (const persons of [60, 250, 1000]) {
      const mean = [1, 2].reduce((sum, id) => sum + built(persons * PEOPLE_PER_PERSON, 3, meadow(), 0, id).ground, 0) / 2;
      expect(blocks(town, persons) / mean, `${persons} persons`).toBeGreaterThan(0.75);
      expect(blocks(town, persons) / mean, `${persons} persons`).toBeLessThan(1.25);
    }
  }, 30000);
});
