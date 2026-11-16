// Feature 1 of the settlement (docs/SETTLEMENT_DESIGN.md): the ground of a town, the parcels of its families, the
// land register in the state, the snapshot, the upgrade of an older world and what the world server tells of it.
import { describe, it, expect } from 'vitest';
import { AREA_LAW, PARCEL_SHARE, DEPTH_PER_WIDTH, PARCELS_PER_ROW, NARROWEST_FRONT, FRONT, settledHectares, townGround, parcelSize, layParcels, measuredTown } from '../src/sim/settlement/rule';
import { foundLots, townFamilies } from '../src/sim/systems/lots';
import { townLots, manyTownsLots } from '../src/net/lots';
import { citiesOf } from '../src/sim/content/cities';
import { STATE_VERSION, LOT_KIND, NO_LOT, type WorldState } from '../src/sim/state';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { namedPersons } from '../src/sim/systems/rulers';
import { newWorldState, loadSetup } from '../tools/sim/load';

const { s, w } = newWorldState(1291, 1291);
const cities = citiesOf(1291), site = (name: string) => cities.find((c) => c.name === name)!.site;
/** Whether two parcels (middle, size) share ground: more than a millimetre (the register stores 32-bit floats). */
const overlap = (a: { x: number; z: number }, b: { x: number; z: number }, p: { w: number; d: number }) =>
  Math.abs(a.x - b.x) < p.w - 1e-3 && Math.abs(a.z - b.z) < p.d - 1e-3;

describe('the settled area of a town', () => {
  it('follows the line through the 173 towns of Cesaretti et al. (2016)', () => {
    expect(AREA_LAW.beta).toBeCloseTo(0.714, 3); // the pooled exponent of the paper's Table 1
    expect(AREA_LAW.a).toBeCloseTo(0.1194, 4);
    expect(settledHectares(11000)).toBeCloseTo(91.8, 0);
    expect(settledHectares(0)).toBe(0);
    // a town of ten times the people takes about five times the ground: larger towns are denser
    expect(settledHectares(100000) / settledHectares(10000)).toBeCloseTo(10 ** 0.7141, 6);
  });
  it('is the measured area for a town of the data, carried along the law to the people the world gives it', () => {
    const paris = measuredTown(site('Paris'))!;
    expect(paris).toEqual({ people: 200000, hectares: 800 });
    expect(settledHectares(200000, site('Paris'))).toBeCloseTo(800, 9);
    expect(settledHectares(214667, site('Paris'))).toBeCloseTo(800 * (214667 / 200000) ** AREA_LAW.beta, 9);
    expect(measuredTown(site('Cairo'))).toBeUndefined(); // outside the data: the law
    expect(cities.filter((c) => measuredTown(c.site)).length).toBe(156); // 17 of the 173 are no town of the world
  });
  it('is a hundredth of the real town at the scale of the houses, so a family has the ground of a real one', () => {
    expect(townGround(110)).toBeCloseTo(settledHectares(11000) * 100, 9); // 1 ha = 10,000 m², a hundredth of it
    // Grenade-sur-Garonne (1290) was planned with about 100 ha for 3,000 house lots: 333 m² of town a lot. A town of
    // 11,000 with families of 3.9 persons has 325 m² of town a family by the law
    const perFamily = townGround(110) / (110 / 3.9);
    expect(perFamily).toBeGreaterThan(300); expect(perFamily).toBeLessThan(350);
  });
});

describe('the parcels of a town', () => {
  it('share 76 % of the ground equally and are three times as deep as wide', () => {
    const p = parcelSize(9183, 28);
    expect(p.d).toBeCloseTo(DEPTH_PER_WIDTH * p.w, 9);
    expect(28 * p.w * p.d).toBeCloseTo(PARCEL_SHARE * 9183, 6);
  });
  it('lie on a grid of blocks around the centre without sharing ground, the innermost first', () => {
    const p = parcelSize(84156, 570), lots = layParcels(570, p);
    expect(lots.length).toBe(570);
    for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) expect(overlap(lots[i], lots[j], p)).toBe(false);
    const far = lots.map((l) => Math.max(Math.abs(l.x), Math.abs(l.z)));
    for (let i = 1; i < far.length; i++) expect(far[i]).toBeGreaterThanOrEqual(far[i - 1] - 1e-9);
    for (const l of lots) expect([FRONT.north, FRONT.south]).toContain(l.front);
  });
  it('take 76 % of a town of whole blocks, the streets the rest', () => {
    const n = 25 * 2 * PARCELS_PER_ROW, p = { w: 9, d: 27 }, lots = layParcels(n, p); // five by five blocks
    const pitch = (PARCELS_PER_ROW * p.w) / Math.sqrt(PARCEL_SHARE);
    const xs = lots.map((l) => l.x), width = Math.max(...xs) - Math.min(...xs) + p.w;
    expect(width).toBeCloseTo(4 * pitch + PARCELS_PER_ROW * p.w, 6);
    expect((n * p.w * p.d) / (5 * pitch) ** 2).toBeCloseTo(PARCEL_SHARE, 9); // with half a street around
  });
  it('leave out ground a town cannot build on', () => {
    const p = { w: 9, d: 27 }, lots = layParcels(40, p, (x) => x <= 0); // nothing east of the centre
    expect(lots.length).toBe(40);
    for (const l of lots) expect(l.x).toBeLessThanOrEqual(0);
  });
});

describe('the land register of a world of 1291', () => {
  const L = s.lot.cols, F = s.family.cols, P = s.person.cols, towns = townFamilies(s);
  it('gives every family of a town a parcel of its own in that town', () => {
    const rulers = namedPersons(s), held = new Set<number>();
    let inTowns = 0;
    cities.forEach((c, k) => {
      for (const f of towns[k].families) {
        const l = F.lot[f];
        expect(l).toBeGreaterThanOrEqual(0); expect(held.has(l)).toBe(false); held.add(l);
        expect(L.site[l]).toBe(c.site); expect(L.place[l]).toBe(c.place); expect(L.kind[l]).toBe(LOT_KIND.parcel);
      }
      inTowns += towns[k].families.length;
    });
    expect(s.lot.size).toBe(inTowns);
    expect(towns.reduce((n, t) => n + t.persons, 0)).toBe(s.person.size - rulers.size);
    // everybody else is a ruler, and a ruler has no parcel
    for (const id of rulers) expect(F.lot[P.family[id]]).toBe(NO_LOT);
    expect(s.family.size - inTowns).toBe(rulers.size);
  });
  it('gives the parcels of each town 76 % of the ground the law gives its persons', () => {
    const sum = new Map<number, number>();
    for (let i = 0; i < s.lot.size; i++) sum.set(L.site[i], (sum.get(L.site[i]) ?? 0) + L.w[i] * L.d[i]);
    cities.forEach((c, k) => expect(sum.get(c.site)! / (PARCEL_SHARE * townGround(towns[k].persons, c.site))).toBeCloseTo(1, 4));
  });
  it('has no parcel narrower than the narrowest the sources know, and none of a town on another', () => {
    for (let i = 0; i < s.lot.size; i++) expect(L.w[i]).toBeGreaterThan(NARROWEST_FRONT);
    for (const name of ['Paris', 'Zürich', 'Limoges']) {
      const ids = towns[cities.findIndex((c) => c.name === name)].families.map((f) => F.lot[f]);
      for (const a of ids) for (const b of ids) if (a < b) expect(overlap({ x: L.x[a], z: L.z[a] }, { x: L.x[b], z: L.z[b] }, { w: L.w[a], d: L.d[a] })).toBe(false);
    }
  });
  it('is the same from the same seed, survives a snapshot, and founding it again changes nothing', () => {
    const t = decodeState(encodeState(s));
    expect(hashState(t)).toBe(hashState(s));
    expect(Array.from(t.lot.cols.x.subarray(0, t.lot.size))).toEqual(Array.from(L.x.subarray(0, s.lot.size)));
    foundLots(t);
    expect(hashState(t)).toBe(hashState(s));
  });
});

describe('a world of 1291 saved before the land register', () => {
  it('gets the parcels a new world has, and encodes as one', () => {
    const old = decodeState(encodeState(s)) as WorldState;
    old.v = 16;
    delete (old.family.cols as Record<string, unknown>).lot; delete (old as Partial<WorldState>).lot;
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(1291));
    expect(up.v).toBe(STATE_VERSION);
    expect(hashState(up)).toBe(hashState(s));
  });
});

describe('what the world server tells of the ground of a town', () => {
  it('are its parcels in columns of equal length, each with its family and its persons', () => {
    const k = cities.findIndex((c) => c.name === 'Zürich'), v = townLots(s, cities[k].site), t = townFamilies(s)[k];
    expect(v.id.length).toBe(t.families.length);
    for (const key of ['kind', 'x', 'z', 'w', 'd', 'front', 'family', 'persons'] as const) expect(v[key].length).toBe(v.id.length);
    expect([...v.family].sort((a, b) => a - b)).toEqual(t.families);
    v.id.forEach((id, i) => expect(s.family.cols.lot[v.family[i]]).toBe(id));
    expect(v.persons.reduce((a, b) => a + b, 0)).toBe(t.persons);
  });
  it('of several towns come in one pass, each as the one of its town alone, a site without ground empty', () => {
    const none = [...Array(100).keys()].find((x) => !cities.some((c) => c.site === x))!; // a site that is no town of 1291
    const sites = [site('Paris'), none, site('Zürich')], many = manyTownsLots(s, sites);
    expect(many.map((m) => m.site)).toEqual(sites);
    sites.forEach((x, i) => expect(many[i]).toEqual(townLots(s, x)));
    expect(many[1].id.length).toBe(0);
  });
});
