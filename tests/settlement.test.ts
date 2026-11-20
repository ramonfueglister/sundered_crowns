// Features 1 to 3 of the settlement (docs/SETTLEMENT_DESIGN.md): the ground of a town, the parcels of its families,
// the hamlets, the streets and the market, the land register in the state, the snapshot, the upgrade of an older
// world and what the world server tells of it.
import { describe, it, expect } from 'vitest';
import { AREA_LAW, PARCEL_SHARE, DEPTH_PER_WIDTH, NARROWEST_FRONT, FRONT, settledHectares, townGround, parcelSize, measuredTown, footprint, type Parcel } from '../src/sim/settlement/rule';
import { layTown, streetWidth, DEFAULT_TUNING, STREET, type Town } from '../src/sim/settlement/streets';
import { planOf } from '../src/sim/content/town_plans';
import { foundLots, houseGround, townFamilies } from '../src/sim/systems/lots';
import { compileGround, widened } from '../src/sim/content/ground';
import { townLots, manyTownsLots } from '../src/net/lots';
import { citiesOf } from '../src/sim/content/cities';
import { STATE_VERSION, LOT_KIND, NO_LOT, NO_HAMLET, STREET_KIND, type WorldState } from '../src/sim/state';
import { FARM, LANE, HAMLET_FARMS, HAMLET_GAP, HAMLET_OFF, LAND_PER_BLOCK, hamletsOf, hamletSizes, hamletBox, layFarms, hamletSpots, hamletRing, fieldReach } from '../src/sim/settlement/hamlets';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { namedPersons } from '../src/sim/systems/rulers';
import { readFileSync } from 'node:fs';
import { newWorldState, loadSetup, dataPath } from '../tools/sim/load';
import { lotsFile } from '../tools/sim/write_lots';

const { s, w } = newWorldState(1291, 1291);
const cities = citiesOf(1291), site = (name: string) => cities.find((c) => c.name === name)!.site;
/** Whether two parcels (middle, the side of their street, size) share ground: more than a millimetre (the register
 *  stores 32-bit floats). A parcel at a street to its east or west lies the other way round. */
const overlap = (a: Parcel, b: Parcel, p: { w: number; d: number }) => {
  const fa = footprint(a, p), fb = footprint(b, p);
  return Math.abs(a.x - b.x) < (fa.w + fb.w) / 2 - 1e-3 && Math.abs(a.z - b.z) < (fa.d + fb.d) / 2 - 1e-3;
};
/** Whether a parcel fronts a street of its town: the middle of its front edge lies at the edge of a street. */
const fronts = (t: Town, p: Parcel, size: { w: number; d: number }) => {
  const f = footprint(p, size), ex = p.x + (p.front === FRONT.east ? f.w / 2 : p.front === FRONT.west ? -f.w / 2 : 0), ez = p.z + (p.front === FRONT.south ? f.d / 2 : p.front === FRONT.north ? -f.d / 2 : 0);
  return t.streets.some((q) => {
    // across the street half its width; along it within its ends (a parcel's middle may lie half a step of the plan, about half a metre, off its cell)
    const across = q.z0 === q.z1 ? Math.abs(ez - q.z0) : Math.abs(ex - q.x0), along = q.z0 === q.z1 ? Math.max(q.x0 - ex, 0, ex - q.x1) : Math.max(q.z0 - ez, 0, ez - q.z1);
    return Math.abs(across - t.width / 2) < 1e-3 && along <= 0.6;
  });
};

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
});

describe('the streets of a town', () => {
  const size = { w: 9, d: 27 }, ways = [{ a: 0, k: 1 }, { a: Math.PI / 2, k: 0 }, { a: Math.PI, k: 2 }];
  it('are as wide as the streets of the grid of feature 1 were, and the market is a parcel deep', () => {
    expect(streetWidth(size)).toBeCloseTo(6 * 9 * (1 / Math.sqrt(PARCEL_SHARE) - 1), 9); // 7.9 m
    const t = layTown(10, size, ways, 1);
    expect(t.width).toBe(2 * Math.round(streetWidth(size) / 2) + 1);
    expect(t.market).toEqual({ x: 0, z: 0, half: Math.round(27 / 2) });
  });
  it('give every family a parcel of its own at a street, no two on the same ground, the street square to the parcel', () => {
    for (const n of [1, 12, 150]) {
      const t = layTown(n, size, ways, 7);
      expect(t.parcels.length).toBe(n);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(overlap(t.parcels[i], t.parcels[j], size)).toBe(false);
      for (const p of t.parcels) expect(fronts(t, p, size)).toBe(true);
      for (const q of t.streets) expect(q.x0 === q.x1 || q.z0 === q.z1).toBe(true); // east-west or north-south
    }
  });
  it('run out along the ways of the world: one street through a town that has one way or none', () => {
    const one = layTown(1, size, [], 3), out = (t: Town, x: number, z: number) => t.streets.some((q) => (x ? q.z0 === q.z1 && (x > 0 ? q.x1 : -q.x0) > 30 : q.x0 === q.x1 && (z > 0 ? q.z1 : -q.z0) > 30));
    expect(out(one, 1, 0) && out(one, -1, 0)).toBe(true);
    expect(out(one, 0, 1) || out(one, 0, -1)).toBe(false);
    const three = layTown(1, size, ways, 3);
    expect(out(three, 1, 0) && out(three, 0, 1) && out(three, -1, 0)).toBe(true);
  });
  it('are the same from the same seed, and another seed lays another town', () => {
    expect(layTown(60, size, ways, 11)).toEqual(layTown(60, size, ways, 11));
    expect(layTown(60, size, ways, 12).parcels).not.toEqual(layTown(60, size, ways, 11).parcels);
  });
  it('keep off ground a town cannot build on, and hold fewer families than asked where the ground within reach does not hold them', () => {
    const west = layTown(40, size, ways, 5, { free: (x) => x <= 0, reach: Infinity }); // nothing east of the centre
    expect(west.parcels.length).toBe(40);
    for (const p of west.parcels) expect(p.x + footprint(p, size).w / 2).toBeLessThanOrEqual(0.5); // (the metres are steps of 1 m round their middle)
    for (const q of west.streets) expect(Math.max(q.x0, q.x1) + west.width / 2).toBeLessThanOrEqual(0.5);
    expect(layTown(1000, size, ways, 5, { free: () => true, reach: 100 }).parcels.length).toBeLessThan(1000);
  });
  it('of a town with a real plan lay its market and its main streets where the plan has them, scaled to the town', () => {
    // one street north-south through the town and a market a radius north of the centre
    const plan = { market: [0, -1] as const, streets: [[0.5, -1, 0.5, 1]] };
    const t = layTown(40, size, ways, 5, undefined, DEFAULT_TUNING, plan), main = t.streets.filter((q) => q.kind === STREET.road);
    expect(t.market.x).toBe(0);
    expect(t.market.z).toBeLessThan(-2 * size.d); // twice the packed radius of the town: far beyond a parcel
    expect(main.length).toBeGreaterThan(0);
    for (const q of main) { expect(q.x0).toBe(q.x1); expect(q.x0).toBeGreaterThan(0); } // north-south, east of the centre
    expect(t.parcels.length).toBe(40);
    for (const p of t.parcels) expect(fronts(t, p, size)).toBe(true);
    // the arms along the ways are not laid: the plan's streets are the town's roads
    expect(t.streets.some((q) => q.kind === STREET.track || q.kind === STREET.highway)).toBe(false);
  });
  it('lay the market on open ground, beside the ground at the centre that is not', () => {
    const church = (x: number, z: number) => Math.abs(x) > 6 || Math.abs(z) > 6; // the centre is taken
    const t = layTown(20, size, ways, 5, { free: church, reach: Infinity });
    expect(Math.max(Math.abs(t.market.x), Math.abs(t.market.z))).toBeGreaterThan(6 + t.market.half);
    expect(t.parcels.length).toBe(20);
  });
});

describe('the building ground of a town', () => {
  it('is free only inside the survey and where its bit is set', () => {
    // 3 by 3 blocks, the middle row free: bits 3, 4, 5 of the field
    const g = compileGround({ year: 1291, metresPerBlock: 2, sites: [{ site: 7, w: 3, d: 3, cells: btoa(String.fromCharCode(0b00111000, 0)) }] });
    expect(g.has(7)).toBe(true); expect(g.has(8)).toBe(false); expect(g.reach(7)).toBe(1);
    for (const bx of [-1, 0, 1]) { expect(g.free(7, bx, 0)).toBe(true); expect(g.free(7, bx, -1)).toBe(false); expect(g.free(7, bx, 1)).toBe(false); }
    expect(g.free(7, 2, 0)).toBe(false); expect(g.free(7, -2, 0)).toBe(false); expect(g.free(8, 0, 0)).toBe(false);
  });
  it('holds the house of a parcel when the strip at its street is free', () => {
    const all = compileGround({ year: 1291, metresPerBlock: 2, sites: [{ site: 7, w: 41, d: 41, cells: btoa(String.fromCharCode(...new Array(Math.ceil((41 * 41) / 8)).fill(255))) }] });
    const size = { w: 8, d: 24 };
    expect(houseGround(all, 7, { x: 0, z: 0, front: FRONT.north }, size)).toBe(true);
    expect(houseGround(all, 7, { x: 40, z: 0, front: FRONT.north }, size)).toBe(false); // its east edge lies beyond the survey
    expect(houseGround(all, 7, { x: 0, z: -30, front: FRONT.south }, size)).toBe(true); // the back of the parcel may lie beyond it
    expect(houseGround(all, 7, { x: 0, z: -30, front: FRONT.north }, size)).toBe(false);
  });
});

describe('the hamlets of a town', () => {
  it('are as few as hold its farming families at ten farmsteads each, the families shared out evenly', () => {
    expect(HAMLET_FARMS).toBe(10);
    expect([0, 1, 10, 11, 20, 21, 388].map(hamletsOf)).toEqual([0, 1, 1, 2, 2, 3, 39]);
    expect(hamletSizes(0)).toEqual([]); expect(hamletSizes(7)).toEqual([7]); expect(hamletSizes(11)).toEqual([6, 5]); expect(hamletSizes(18)).toEqual([9, 9]);
    for (const f of [1, 9, 23, 388, 703]) { const z = hamletSizes(f); expect(z.reduce((a, b) => a + b, 0)).toBe(f); expect(Math.max(...z)).toBeLessThanOrEqual(HAMLET_FARMS); expect(Math.max(...z) - Math.min(...z)).toBeLessThanOrEqual(1); }
  });
  it('have farmsteads of 10 m by 17.5 m in two rows at a lane, fronting it', () => {
    expect(FARM).toEqual({ w: 10, d: 17.5 }); // half the sides of Cottam's 20 m by 35 m (Ramon, 17 November 2026)
    expect(LANE).toBeCloseTo(2 * 17.5 * (1 / Math.sqrt(PARCEL_SHARE) - 1), 9); // as the streets of a town of such parcels
    for (const n of [1, 2, 5, 9, 10]) {
      const farms = layFarms(n), box = hamletBox(n);
      expect(farms.length).toBe(n);
      for (const a of farms) {
        expect(a.front).toBe(a.z < 0 ? FRONT.south : FRONT.north); // the lane lies between the rows
        expect(Math.abs(a.z)).toBeCloseTo((LANE + FARM.d) / 2, 9);
        expect(Math.abs(a.x) + FARM.w / 2).toBeLessThanOrEqual(box.w / 2 + 1e-9); expect(Math.abs(a.z) + FARM.d / 2).toBeLessThanOrEqual(box.d / 2 + 1e-9);
        for (const b of farms) if (a !== b) expect(overlap(a, b, FARM)).toBe(false);
      }
      expect(farms.filter((f) => f.z < 0).length).toBe(Math.ceil(n / 2));
    }
    expect(hamletBox(10)).toEqual({ w: 50, d: 35 + LANE });
  });
  it('lie spread evenly over the ring between the town and the edge of its fields', () => {
    const spots = hamletSpots(40, 100, 300), r = spots.map((p) => Math.hypot(p.x, p.z));
    expect(spots.length).toBe(40);
    for (const p of spots) { expect(Math.abs(p.x % 2)).toBe(0); expect(Math.abs(p.z % 2)).toBe(0); } // on the middle of a block
    for (const v of r) { expect(v).toBeGreaterThan(98); expect(v).toBeLessThan(302); }
    // as many in the inner half of the ring's ground as in the outer
    const mid = Math.sqrt((100 * 100 + 300 * 300) / 2);
    expect(r.filter((v) => v < mid).length).toBe(20);
    // a quarter of the turn holds about a quarter of them
    expect(spots.filter((p) => p.x > 0 && p.z > 0).length).toBeGreaterThanOrEqual(8); expect(spots.filter((p) => p.x > 0 && p.z > 0).length).toBeLessThanOrEqual(12);
  });
  it('reach as far as the fields of the town, and farther where they would have no room', () => {
    expect(LAND_PER_BLOCK).toBe(125);
    expect(fieldReach(31416)).toBeCloseTo((10000 / 125) * 2, 0); // 314 km² are a disc of 10 km: 80 blocks of 2 m
    const wide = hamletRing(40, [10, 10], 20000), tight = hamletRing(40, new Array(39).fill(10), 100);
    expect(wide.inner).toBeCloseTo(40 + HAMLET_OFF + 25, 9); // half the width of a hamlet of ten farmsteads
    expect(wide.outer).toBeCloseTo(fieldReach(20000), 9);
    expect(Math.PI * (tight.outer ** 2 - tight.inner ** 2)).toBeCloseTo(39 * (50 * 50 + (35 + LANE) ** 2), 3);
  });
});

describe('the farmsteads of a world of 1291', () => {
  const L = s.lot.cols, F = s.family.cols, H = s.hamlets.cols, towns = townFamilies(s);
  const farms = Array.from({ length: s.lot.size }, (_, i) => i).filter((i) => L.kind[i] === LOT_KIND.farmstead);
  it('are one for every family of the hamlets, in a hamlet of its town', () => {
    const held = new Set<number>();
    let families = 0, hamlets = 0;
    cities.forEach((c, k) => {
      const mine = new Set<number>();
      for (const f of towns[k].farmers) {
        const l = F.lot[f], h = L.hamlet[l];
        expect(F.hamlet[f]).toBe(1);
        expect(L.kind[l]).toBe(LOT_KIND.farmstead); expect(held.has(l)).toBe(false); held.add(l);
        expect(L.site[l]).toBe(c.site); expect(L.place[l]).toBe(c.place); expect(L.w[l]).toBe(FARM.w); expect(L.d[l]).toBe(FARM.d);
        expect(H.site[h]).toBe(c.site); expect(H.place[h]).toBe(c.place); mine.add(h);
      }
      expect(mine.size).toBe(hamletsOf(towns[k].farmers.length));
      families += towns[k].farmers.length; hamlets += mine.size;
    });
    expect(farms.length).toBe(families);
    expect(s.hamlets.size).toBe(hamlets);
    const count = new Map<number, number>();
    for (const i of farms) count.set(L.hamlet[i], (count.get(L.hamlet[i]) ?? 0) + 1);
    for (let h = 0; h < s.hamlets.size; h++) { expect(count.get(h)).toBe(H.farms[h]); expect(H.farms[h]).toBeLessThanOrEqual(HAMLET_FARMS); expect(H.farms[h]).toBeGreaterThanOrEqual(1); }
    let all = 0; for (let f = 0; f < s.family.size; f++) all += F.hamlet[f];
    expect(families).toBe(all); // no family of a hamlet is without a farmstead
  });
  it('lie round the middle of their hamlet, clear of the town and of every other hamlet', () => {
    const boxes = Array.from({ length: s.hamlets.size }, (_, h) => ({ x: H.x[h], z: H.z[h], ...hamletBox(H.farms[h]) }));
    for (const i of farms) { const b = boxes[L.hamlet[i]]; expect(Math.abs(L.x[i] - b.x) + L.w[i] / 2).toBeLessThanOrEqual(b.w / 2 + 1e-3); expect(Math.abs(L.z[i] - b.z) + L.d[i] / 2).toBeLessThanOrEqual(b.d / 2 + 1e-3); } // (farmsteads front north or south)
    const near = (a: typeof boxes[number], b: typeof boxes[number], gap: number) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap - 1e-3 && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + gap - 1e-3;
    const of = new Map<number, number[]>();
    for (let h = 0; h < s.hamlets.size; h++) of.set(H.site[h], [...(of.get(H.site[h]) ?? []), h]);
    const built = new Map<number, typeof boxes>();
    for (let i = 0; i < s.lot.size; i++) if (L.kind[i] === LOT_KIND.parcel) built.set(L.site[i], [...(built.get(L.site[i]) ?? []), { x: L.x[i], z: L.z[i], ...footprint({ front: L.front[i] }, { w: L.w[i], d: L.d[i] }) }]);
    for (const [town, hs] of of) {
      hs.forEach((h, a) => { for (const g of hs.slice(0, a)) expect(near(boxes[h], boxes[g], HAMLET_GAP)).toBe(false); });
      for (const h of hs) for (const p of built.get(town) ?? []) expect(near(boxes[h], p, HAMLET_OFF)).toBe(false);
    }
    // and off the streets and the market of their town (beside them they may lie)
    const S = s.street.cols;
    for (let i = 0; i < s.street.size; i++) {
      const pad = S.kind[i] === STREET_KIND.market ? 0 : S.width[i] / 2;
      const q = { x: (S.x0[i] + S.x1[i]) / 2, z: (S.z0[i] + S.z1[i]) / 2, w: Math.abs(S.x1[i] - S.x0[i]) + 2 * pad, d: Math.abs(S.z1[i] - S.z0[i]) + 2 * pad };
      for (const h of of.get(S.site[i]) ?? []) expect(near(boxes[h], q, 0)).toBe(false);
    }
  });
  it('stand on dry ground in all but a few hamlets: a hamlet whose own spot is wet lies on the nearest ground that carries it', { timeout: 60_000 }, () => {
    const dry = w.dry!, C = s.lot.cols, wet = new Set<number>();
    for (let i = 0; i < s.lot.size; i++) {
      if (C.kind[i] !== LOT_KIND.farmstead) continue;
      expect(dry.has(C.site[i])).toBe(true);
      if (!houseGround(dry, C.site[i], { x: C.x[i], z: C.z[i], front: C.front[i] }, { w: C.w[i], d: C.d[i] })) wet.add(C.hamlet[i]);
    }
    const found = foundLots(decodeState(encodeState(s)), w.ground, w.dry);
    expect(found.rough).toBe(wet.size);
    expect(found.rough).toBeLessThan(s.hamlets.size / 30);
    expect(found.crowded).toBeLessThan(s.hamlets.size / 30); // 56 of 1857 in 1291: most whose own spot lies on a street out of the town (feature 3)
    // by the building ground alone, which ends 96 blocks from the centre and counts every step, more hamlets stay rough
    expect(foundLots(decodeState(encodeState(s)), w.ground, null).rough).toBeGreaterThan(found.rough);
  });
});

describe('the land register of a world of 1291', () => {
  const L = s.lot.cols, F = s.family.cols, P = s.person.cols, towns = townFamilies(s);
  const parcels = Array.from({ length: s.lot.size }, (_, i) => i).filter((i) => L.kind[i] === LOT_KIND.parcel);
  it('gives every family who lives in a town a parcel of its own in that town', () => {
    const rulers = namedPersons(s), held = new Set<number>();
    let inTowns = 0, farmers = 0;
    cities.forEach((c, k) => {
      for (const f of towns[k].families) {
        const l = F.lot[f];
        expect(F.hamlet[f]).toBe(0);
        expect(l).toBeGreaterThanOrEqual(0); expect(held.has(l)).toBe(false); held.add(l);
        expect(L.site[l]).toBe(c.site); expect(L.place[l]).toBe(c.place); expect(L.kind[l]).toBe(LOT_KIND.parcel); expect(L.hamlet[l]).toBe(NO_HAMLET);
      }
      inTowns += towns[k].families.length; farmers += towns[k].farmers.length;
    });
    expect(parcels.length).toBe(inTowns);
    expect(farmers).toBeGreaterThan(inTowns); // most families live from agriculture
    expect(towns.reduce((n, t) => n + t.persons + t.farmPersons, 0)).toBe(s.person.size - rulers.size);
    // everybody else is a ruler, and a ruler has no ground
    for (const id of rulers) expect(F.lot[P.family[id]]).toBe(NO_LOT);
    expect(s.family.size - inTowns - farmers).toBe(rulers.size);
  });
  it('gives the parcels of each town 76 % of the ground the law gives its persons', () => {
    const sum = new Map<number, number>();
    for (const i of parcels) sum.set(L.site[i], (sum.get(L.site[i]) ?? 0) + L.w[i] * L.d[i]);
    // (a small town whose households all live from agriculture has nobody inside the walls, and no parcels)
    cities.forEach((c, k) => { if (towns[k].persons) expect(sum.get(c.site)! / (PARCEL_SHARE * townGround(towns[k].persons, c.site))).toBeCloseTo(1, 4); else expect(sum.has(c.site)).toBe(false); });
  });
  it('has no parcel narrower than the narrowest the sources know, and none of a town on another', () => {
    for (const i of parcels) expect(L.w[i]).toBeGreaterThan(NARROWEST_FRONT);
    for (const name of ['Paris', 'Zürich', 'Limoges']) {
      const ids = towns[cities.findIndex((c) => c.name === name)].families.map((f) => F.lot[f]);
      for (const a of ids) for (const b of ids) if (a < b) expect(overlap({ x: L.x[a], z: L.z[a], front: L.front[a] }, { x: L.x[b], z: L.z[b], front: L.front[b] }, { w: L.w[a], d: L.d[a] })).toBe(false);
    }
  });
  it('lays every parcel where its house can stand, by the building ground of the towns, but in six towns cut by water', { timeout: 60_000 }, () => {
    const g = w.ground!, gw = widened(g, w.dry)!, house = (t: WorldState, i: number) => { const C = t.lot.cols; return houseGround(gw, C.site[i], { x: C.x[i], z: C.z[i], front: C.front[i] }, { w: C.w[i], d: C.d[i] }); };
    expect(g.year).toBe(1291);
    for (const c of cities) expect(g.has(c.site)).toBe(true);
    // Venice lies on islands too cut by water for its streets without bridges, and in Aberdeen, Baghdad, Dax, Seville
    // and Strasbourg the rivers leave too little ground on one bank once the landmarks stand at their real place: they
    // are laid out without regard to the ground (but clear of the landmarks)
    const bare = decodeState(encodeState(s)), tight = foundLots(bare, g, w.dry).tight;
    expect(tight.map((x) => cities.find((c) => c.site === x)!.name).sort()).toEqual(['Aberdeen', 'Baghdad', 'Dax', 'Seville', 'Strasbourg', 'Venice']);
    let off = 0;
    for (const i of parcels) if (!tight.includes(L.site[i]) && !house(s, i)) off++;
    expect(off).toBe(0);
    // laid out without the ground, the houses of many parcels stand in the water, on rock or on a step
    foundLots(bare, null);
    for (let i = 0; i < bare.lot.size; i++) if (bare.lot.cols.kind[i] === LOT_KIND.parcel && !house(bare, i)) off++;
    expect(off).toBeGreaterThan(500); // 926 (1,000 and more while the graphic's own church stood in the ground)
  });
  it('is the same from the same seed, survives a snapshot, and founding it again changes nothing', { timeout: 60_000 }, () => {
    const t = decodeState(encodeState(s));
    expect(hashState(t)).toBe(hashState(s));
    expect(Array.from(t.lot.cols.x.subarray(0, t.lot.size))).toEqual(Array.from(L.x.subarray(0, s.lot.size)));
    expect(Array.from(t.street.cols.x0.subarray(0, t.street.size))).toEqual(Array.from(s.street.cols.x0.subarray(0, s.street.size)));
    foundLots(t, w.ground, w.dry);
    expect(hashState(t)).toBe(hashState(s));
  });
});

describe('the streets of a world of 1291', () => {
  const t = decodeState(encodeState(s)), found = foundLots(t, w.ground, w.dry, { ...DEFAULT_TUNING, measure: true });
  const S = s.street.cols, L = s.lot.cols, rows = Array.from({ length: s.street.size }, (_, i) => i);
  it('are the streets of a new world, measured or not, and every town has one market', { timeout: 60_000 }, () => {
    expect(hashState(t)).toBe(hashState(s));
    const towns = cities.filter((c, k) => townFamilies(s)[k].families.length);
    expect(found.streets.size).toBe(towns.length);
    for (const c of towns) expect(rows.filter((i) => S.site[i] === c.site && S.kind[i] === STREET_KIND.market).length).toBe(1);
  });
  it('front every parcel of the register', () => {
    for (let i = 0; i < s.lot.size; i++) if (L.kind[i] === LOT_KIND.parcel) expect(fronts(found.streets.get(L.site[i])! as Town, { x: L.x[i], z: L.z[i], front: L.front[i] }, { w: L.w[i], d: L.d[i] })).toBe(true);
  });
  it('meet as the streets of medieval Paris: the shares of dead ends, T-junctions and crossings (the Vasserot cadastre inside the wall of Philippe Auguste: 0.10, 0.78, 0.12) and the areas of the blocks (Lämmer et al. 2006: P(A) ~ A^−1.9)', () => {
    let ends = 0, tees = 0, crosses = 0;
    const blocks: number[] = [], real = JSON.parse(readFileSync('data/cadastre/paris_1291.json', 'utf8'));
    for (const v of found.streets.values()) {
      if (v.streets.length >= 20) { ends += v.nodes.ends; tees += v.nodes.tees; crosses += v.nodes.crosses; }
      blocks.push(...v.blocks);
    }
    const n = ends + tees + crosses;
    expect(Math.abs(ends / n - real.dead)).toBeLessThan(0.05); // 0.13
    expect(Math.abs(tees / n - real.T)).toBeLessThan(0.05); // 0.77
    expect(Math.abs(crosses / n - real.X)).toBeLessThan(0.05); // 0.11
    // the exponent by maximum likelihood over the blocks of 200 m² and more (Clauset et al. 2009, Eq. 3.1)
    const big = blocks.filter((a) => a >= 200), tau = 1 + big.length / big.reduce((m, a) => m + Math.log(a / 200), 0);
    expect(big.length).toBeGreaterThan(500);
    expect(Math.abs(tau - 1.9)).toBeLessThan(0.15);
  });
  it('of Paris follow the Vasserot cadastre: the market at the Halles north of Notre-Dame, and the streets meet as Paris\'s did within 0.05 (data/cadastre/paris_1291.json)', () => {
    const paris = site('Paris'), v = found.streets.get(paris)!, real = JSON.parse(readFileSync('data/cadastre/paris_1291.json', 'utf8'));
    expect(planOf(1291, paris)).toBeDefined();
    const c = cities.find((x) => x.site === paris)!;
    expect(v.market.z).toBeLessThan(0); // north of the centre, where the world sets the church
    expect(Math.abs(v.market.x)).toBeLessThan(Math.abs(v.market.z) / 2);
    expect(c.name).toBe('Paris');
    const n = v.nodes.ends + v.nodes.tees + v.nodes.crosses;
    expect(Math.abs(v.nodes.ends / n - real.dead)).toBeLessThan(0.05);
    expect(Math.abs(v.nodes.tees / n - real.T)).toBeLessThan(0.05);
    expect(Math.abs(v.nodes.crosses / n - real.X)).toBeLessThan(0.05);
  });
});

describe('a world of 1291 saved before the streets', () => {
  it('lays its towns out along streets: every family keeps its parcel and its size, and the parcels front the streets', { timeout: 60_000 }, () => {
    const old = decodeState(encodeState(s)) as WorldState, L = old.lot.cols;
    old.v = 32;
    delete (old as Partial<WorldState>).street;
    for (let i = 0; i < old.lot.size; i++) if (L.kind[i] === LOT_KIND.parcel) { L.x[i] = 0; L.z[i] = 0; L.front[i] = FRONT.north; } // where they were does not count
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(1291)), U = up.lot.cols, F = s.family.cols;
    expect(up.v).toBe(STATE_VERSION);
    expect(up.street.size).toBe(s.street.size);
    for (let f = 0; f < s.family.size; f++) expect(up.family.cols.lot[f]).toBe(F.lot[f]);
    for (let i = 0; i < up.lot.size; i++) {
      expect(U.w[i]).toBe(s.lot.cols.w[i]); expect(U.d[i]).toBe(s.lot.cols.d[i]);
      if (U.kind[i] !== LOT_KIND.parcel) { expect(U.x[i]).toBe(s.lot.cols.x[i]); continue; } // the hamlets stay
      // as a new world lays it, but for the size read back from the register's 32-bit floats
      expect(Math.abs(U.x[i] - s.lot.cols.x[i]) + Math.abs(U.z[i] - s.lot.cols.z[i])).toBeLessThan(0.01);
    }
    expect(encodeState(decodeState(encodeState(up))).byteLength).toBe(encodeState(up).byteLength);
  });
});

describe('a world of 1291 saved before the land register', () => {
  it('gets the parcels a new world has, and encodes as one', { timeout: 60_000 }, () => {
    const old = decodeState(encodeState(s)) as WorldState;
    old.v = 19;
    delete (old.family.cols as Record<string, unknown>).lot; delete (old as Partial<WorldState>).lot; delete (old as Partial<WorldState>).hamlets;
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(1291));
    expect(up.v).toBe(STATE_VERSION);
    expect(hashState(up)).toBe(hashState(s));
  });
});

describe('what the world server tells of the ground of a town', () => {
  it('are its parcels and the farmsteads of its hamlets in columns of equal length, each with its family and its persons', () => {
    const k = cities.findIndex((c) => c.name === 'Zürich'), v = townLots(s, cities[k].site), t = townFamilies(s)[k];
    expect(v.id.length).toBe(t.families.length + t.farmers.length);
    for (const key of ['kind', 'hamlet', 'x', 'z', 'w', 'd', 'front', 'family', 'persons'] as const) expect(v[key].length).toBe(v.id.length);
    expect([...v.family].sort((a, b) => a - b)).toEqual([...t.families, ...t.farmers].sort((a, b) => a - b));
    v.id.forEach((id, i) => expect(s.family.cols.lot[v.family[i]]).toBe(id));
    expect(v.persons.reduce((a, b) => a + b, 0)).toBe(t.persons + t.farmPersons);
    expect(v.kind.filter((x) => x === LOT_KIND.parcel).length).toBe(t.families.length);
    // its hamlets: every farmstead lies in one of them, and each has as many as it says
    expect(v.hamlets.id.length).toBe(hamletsOf(t.farmers.length));
    expect(v.hamlets.farms.reduce((a, b) => a + b, 0)).toBe(t.farmers.length);
    v.hamlets.id.forEach((h, i) => expect(v.hamlet.filter((x) => x === h).length).toBe(v.hamlets.farms[i]));
    v.kind.forEach((kind, i) => expect(v.hamlet[i] === NO_HAMLET).toBe(kind === LOT_KIND.parcel));
  });
  it('of several towns come in one pass, each as the one of its town alone, a site without ground empty', () => {
    const none = [...Array(100).keys()].find((x) => !cities.some((c) => c.site === x))!; // a site that is no town of 1291
    const sites = [site('Paris'), none, site('Zürich')], many = manyTownsLots(s, sites);
    expect(many.map((m) => m.site)).toEqual(sites);
    sites.forEach((x, i) => expect(many[i]).toEqual(townLots(s, x)));
    expect(many[1].id.length).toBe(0);
  });
});

describe('the file of parcels the world graphic reads', () => {
  it('is the land register of a new world of 1291 (npx tsx tools/sim/write_lots.ts 1291)', () => {
    const file = JSON.parse(readFileSync(dataPath('lots_1291.json'), 'utf8'));
    expect(file).toEqual(JSON.parse(JSON.stringify(lotsFile(s))));
    expect(file.towns.length).toBe(cities.length);
    type Rows = { x: number[]; w: number; d: number };
    expect(file.towns.reduce((n: number, t: Rows & { hamlets: Rows[] }) => n + t.x.length + t.hamlets.reduce((m, h) => m + h.x.length, 0), 0)).toBe(s.lot.size);
    expect(file.towns.reduce((n: number, t: { hamlets: Rows[] }) => n + t.hamlets.length, 0)).toBe(s.hamlets.size);
    for (const t of file.towns) for (const h of t.hamlets) { expect(h.w).toBe(FARM.w); expect(h.d).toBe(FARM.d); }
  });
});
